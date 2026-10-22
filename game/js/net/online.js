// Online play: two browsers play one match peer-to-peer over WebRTC.
//
// PeerJS (js/vendor/peerjs.min.js, loaded on first use) finds the other
// player through its free public broker using a short room code; after that
// the browsers talk directly. Nothing runs on a server of ours.
//
// The host plays the left paddle and runs the real match. The guest plays
// the right paddle, simulates locally so the ball moves smoothly, and is
// corrected by the host's snapshots. The guest is trusted for hits on its
// own paddle (it sees its paddle with no delay), the host for everything
// else: scoring, power-ups, the arena and the end of the match.
(function () {
    'use strict';

    const PROTOCOL = 3;
    const ID_PREFIX = 'neon-pingpong-v2-';   // v2: 8-character codes (v1 rooms used 5 and could be guessed)
    const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const CODE_LENGTH = 8;       // 31^8 is about 8.5e11 codes; shown as ABCD-EFGH
    const ONLINE_MODES = [
        { id: 'classic', name: 'Classic' },
        { id: 'zombie', name: 'Zombie' },
        { id: 'gravity', name: 'Gravity' },
        { id: 'speed', name: 'Speed' },
        { id: 'obstacle', name: 'Obstacle' },
        { id: 'customise', name: 'Custom' },
    ];
    const SNAPSHOT_HZ = 40;
    const INPUT_HZ = 60;
    const PING_MS = 500;
    const LINK_TIMEOUT_MS = 7000;   // no message for this long: connection lost (plus a margin for slow links)
    const HIDDEN_LINK_TIMEOUT_MS = 90000;   // the other tab is in the background (its timers crawl)
    const ICE_DISCONNECTED_MS = 4000;   // the route stalled (often a phone switching networks): rebuild it
    // Far-apart players go through the broker, then STUN, and often a TURN
    // relay; that can take a while on mobile networks, so be patient.
    const CONNECT_TIMEOUT_MS = 30000;
    const RECONNECT_MS = 60000;     // how long a dropped link may take to come back (a reload included)
    const REDIAL_MS = 2500;
    const FAST_LABEL = 'pp-fast';   // the second, unreliable data channel
    const FAST_MAX_BYTES = 12000;   // bigger messages go on the reliable channel
    const DIAL_PATIENCE_MS = 12000; // let a slow attempt finish before starting another
    const MAX_CANDIDATES = 3;       // host: unvetted links at once (shared-link strangers beyond this are dropped)
    const CANDIDATE_MS = 30000;     // host: a link that has not been let in by then is closed
    const MAX_STRAY_DIALS = 8;      // host: links that never got in, per STRAY_WINDOW_MS, before new ones are refused for a while
    const STRAY_WINDOW_MS = 60000;
    const STRAY_PAUSE_MS = 30000;
    const JOIN_FAIL_KEY = 'pp-join-fails';   // localStorage: recent wrong-code attempts (guess limiter)
    const JOIN_FAIL_MAX = 5;        // wrong codes allowed per JOIN_FAIL_WINDOW_MS
    const JOIN_FAIL_WINDOW_MS = 60000;
    const REJOIN_KEY = 'pp-online-room';   // sessionStorage: get back into the room after a reload
    const REJOIN_MAX_AGE_MS = 5 * 60 * 1000;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const round1 = (v) => Math.round(v * 10) / 10;
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    const modeName = (id) => (ONLINE_MODES.find((m) => m.id === id) || {}).name || 'Classic';

    function randomCode() {
        const bytes = new Uint8Array(CODE_LENGTH);
        crypto.getRandomValues(bytes);
        let out = '';
        for (let i = 0; i < CODE_LENGTH; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
        return out;
    }

    const formatCode = (code) => String(code).replace(/(.{4})(?=.)/g, '$1-');

    function cleanCode(text) {
        const up = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return up.replace(/O/g, '0').replace(/I|L/g, '1').split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);
    }

    function randomToken() {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    function saveRejoin(data) {
        try { sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ ...data, at: Date.now() })); } catch (_) { /* ignore */ }
    }

    function readRejoin() {
        try {
            const d = JSON.parse(sessionStorage.getItem(REJOIN_KEY) || 'null');
            if (!d || Date.now() - num(d.at) > REJOIN_MAX_AGE_MS) return null;
            const code = cleanCode(d.code);
            if (code.length !== CODE_LENGTH || (d.role !== 'host' && d.role !== 'guest')) return null;
            return { role: d.role, code, token: String(d.token || '').slice(0, 32) };
        } catch (_) { return null; }
    }

    // Guessing a room means dialing codes one by one, so slow that down on the
    // guest side: after JOIN_FAIL_MAX misses in a minute, wait the rest of it out.
    function recentJoinFails() {
        try {
            const now = Date.now();
            const list = JSON.parse(localStorage.getItem(JOIN_FAIL_KEY) || '[]');
            return (Array.isArray(list) ? list : []).map(Number).filter((t) => now - t >= 0 && now - t < JOIN_FAIL_WINDOW_MS);
        } catch (_) { return []; }
    }
    function noteJoinFail() {
        try { localStorage.setItem(JOIN_FAIL_KEY, JSON.stringify([...recentJoinFails(), Date.now()])); } catch (_) { /* ignore */ }
    }
    function joinWaitMs() {
        const fails = recentJoinFails();
        return fails.length >= JOIN_FAIL_MAX ? Math.max(0, JOIN_FAIL_WINDOW_MS - (Date.now() - fails[0])) : 0;
    }

    function clearRejoin() {
        try { sessionStorage.removeItem(REJOIN_KEY); } catch (_) { /* ignore */ }
    }

    function cleanDesign(id) {
        const ids = window.PPSettings?.PADDLE_IDS || ['classic'];
        return ids.includes(id) ? id : 'classic';
    }

    function cleanName(text, fallback) {
        const t = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
        return t || fallback;
    }

    // ── PeerJS loader ──────────────────────────────────────────────────
    let peerLibPromise = null;
    function loadPeerLib() {
        if (window.Peer) return Promise.resolve(window.Peer);
        if (peerLibPromise) return peerLibPromise;
        peerLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'js/vendor/peerjs.min.js';
            s.async = true;
            s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS did not load')));
            s.onerror = () => { peerLibPromise = null; reject(new Error('PeerJS did not load')); };
            document.head.appendChild(s);
        });
        return peerLibPromise;
    }

    // ── Servers: broker and ICE (STUN/TURN) ────────────────────────────
    // Players in different countries are usually both behind home or mobile
    // NAT. STUN finds a direct route most of the time; when it can't (mobile
    // carriers, strict routers, UDP blocked) a TURN relay carries the game.
    // js/net/online-config.js lets the owner add their own TURN servers or
    // PeerServer without touching this file.
    const DEFAULT_ICE = [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
        // PeerJS's free relays, over UDP and, for networks that block UDP, TCP.
        { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
        { urls: ['turn:eu-0.turn.peerjs.com:3478?transport=tcp', 'turn:us-0.turn.peerjs.com:3478?transport=tcp'], username: 'peerjs', credential: 'peerjsp' },
    ];
    const ICE_CACHE_KEY = 'pp-ice-servers';
    const ICE_CACHE_MS = 30 * 60 * 1000;

    let configPromise = null;
    function loadOnlineConfig() {
        if (window.PP_ONLINE_CONFIG) return Promise.resolve(window.PP_ONLINE_CONFIG);
        if (configPromise) return configPromise;
        configPromise = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'js/net/online-config.js';
            s.async = true;
            s.onload = s.onerror = () => resolve(window.PP_ONLINE_CONFIG || {});
            document.head.appendChild(s);
        });
        return configPromise;
    }

    const validIce = (list) => (Array.isArray(list) ? list : []).filter((e) => e && (typeof e.urls === 'string' || Array.isArray(e.urls)));

    // A TURN provider's credentials endpoint (Metered, Xirsys, a small
    // function of your own…) hands out short-lived logins; ask it once a while.
    async function fetchIceServers(url) {
        try {
            const cached = JSON.parse(sessionStorage.getItem(ICE_CACHE_KEY) || 'null');
            if (cached && cached.url === url && Date.now() - cached.at < ICE_CACHE_MS) return validIce(cached.list);
        } catch (_) { /* ignore */ }
        try {
            const ctl = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = setTimeout(() => ctl?.abort(), 4000);
            const res = await fetch(url, { signal: ctl?.signal, credentials: 'omit' });
            clearTimeout(timer);
            if (!res.ok) return [];
            const body = await res.json();
            const list = validIce(Array.isArray(body) ? body : body?.iceServers);
            try { sessionStorage.setItem(ICE_CACHE_KEY, JSON.stringify({ url, at: Date.now(), list })); } catch (_) { /* ignore */ }
            return list;
        } catch (_) { return []; }
    }

    async function peerOptions() {
        const cfg = await loadOnlineConfig();
        // Tests point this at a local PeerServer; players use the public one
        // unless the config names another.
        const test = window.PP_PEER_OPTIONS;
        const opts = test && typeof test === 'object' ? { ...test } : {};
        const ps = cfg.peerServer;
        if (!test && ps && typeof ps === 'object' && ps.host) {
            for (const k of ['host', 'port', 'path', 'secure', 'key']) if (ps[k] !== undefined && ps[k] !== '') opts[k] = ps[k];
        }
        if (!opts.config) {
            const own = validIce(cfg.iceServers);
            const fetched = cfg.iceServersUrl ? await fetchIceServers(String(cfg.iceServersUrl)) : [];
            opts.config = {
                iceServers: [...fetched, ...own, ...DEFAULT_ICE],
                sdpSemantics: 'unified-plan',
            };
            if (cfg.relayOnly) opts.config.iceTransportPolicy = 'relay';
        }
        return opts;
    }

    // ── Session ────────────────────────────────────────────────────────
    let session = null;

    class Session {
        constructor(role, ui, opts = {}) {
            this.role = role;               // 'host' | 'guest'
            this.ui = ui;
            this.peer = null;
            this.conn = null;               // the link to the other player, once it said hello
            this.dialing = null;            // guest: the connection attempt in flight
            this.code = '';
            this.closed = false;
            this.connected = false;         // we have a partner (the link itself may be reconnecting)
            this.hadPartner = false;
            this.reconnecting = false;
            this.resumed = !!opts.token;
            this.token = role === 'guest' ? (opts.token || randomToken()) : '';
            this.partnerToken = '';         // host: the guest that may reconnect
            this.keepCode = !!opts.keepCode;    // host reopening its room after a reload
            this.codeTries = 0;
            this.localName = cleanName(window.PPSettings?.get('playerName'), role === 'host' ? 'Host' : 'Guest');
            this.remoteName = role === 'host' ? 'Guest' : 'Host';
            this.remoteHidden = false;
            this.mode = 'classic';
            this.rtt = 80;
            this.jitter = 0;                // how much the round trip wobbles, ms
            this.clockOffset = null;        // other side's performance.now() minus ours, ms
            this.clockSamples = [];
            this.route = '';
            this.routeChecks = 0;                // 'direct' | 'relay' once known
            this.fastSeq = 0;               // numbers outgoing snapshots/inputs
            this.fastIn = { last: 0, got: 0, lost: 0 };
            this.loss = 0;                  // share of fast messages lost lately, 0..1
            this.lastHeard = 0;
            this.timers = [];
            this.series = { left: 0, right: 0 };   // wins this session, by side
            this.matchNo = 0;
            // Match state
            this.inMatch = false;
            this.remoteReady = false;
            this.sentReady = false;
            this.gotSnapshot = false;
            this.servedAfterReady = false;
            this.stepCount = 0;
            this.remotePaddle = null;       // { y, vy, at }
            this.localHitAt = -1e9;
            this.applyingRemote = false;
            this.againLocal = false;
            this.againRemote = false;
            this.lastScores = '';
            this.backup = null;             // guest: own Custom settings while borrowing the host's
            this.puSeq = 0;
        }

        get game() { return window.game; }
        get oneWay() { return clamp(this.rtt / 2000, 0, 0.25); }   // seconds

        // How long a message stamped with the other side's clock took to get
        // here, in seconds. Measured per message (so a late one is projected
        // further), falling back to half the round trip before the clocks agree.
        transit(ts) {
            if (this.clockOffset == null || !Number.isFinite(ts)) return this.oneWay;
            return clamp((performance.now() - (ts - this.clockOffset)) / 1000, 0, 0.4);
        }
        localSide() { return this.role === 'host' ? 'left' : 'right'; }
        inGame() { const g = this.game; return !!g && g.net === this; }

        // ── Connection ─────────────────────────────────────────────────
        // Every link starts as a candidate and only becomes `this.conn` once
        // its hello checks out. A guest whose link drops redials the host for
        // RECONNECT_MS; the host keeps the room open and lets the same guest
        // (matched by token) back in, even after a page reload.
        async open(code) {
            const [Peer, opts] = await Promise.all([loadPeerLib(), peerOptions()]);
            if (this.closed) return;
            this.code = code;
            this.Peer = Peer;
            this.peerOpts = opts;
            this.openPeer();
        }

        openPeer() {
            if (this.closed) return;
            const id = this.role === 'host' ? ID_PREFIX + this.code : undefined;
            const peer = new this.Peer(id, { debug: 0, ...this.peerOpts });
            this.peer = peer;
            peer.on('error', (err) => { if (peer === this.peer) this.onPeerError(err); });
            peer.on('disconnected', () => {
                // Lost the broker. Live links carry on directly; stay findable
                // so a dropped or reloaded partner can get back in.
                if (this.closed || peer !== this.peer) return;
                this.brokerTries = (this.brokerTries || 0) + 1;
                clearTimeout(this.brokerTimer);
                this.brokerTimer = setTimeout(() => this.reconnectBroker(), Math.min(8000, 1000 * this.brokerTries));
            });
            if (this.role === 'host') {
                peer.on('open', () => {
                    this.codeTries = 0;
                    this.brokerTries = 0;
                    saveRejoin({ role: 'host', code: this.code });
                    if (!this.connected) this.ui.hostWaiting(this.code);
                });
                peer.on('connection', (conn) => {
                    // Everyone who opens the shared link dials the host, and every dial costs a
                    // full WebRTC link. Keep strangers cheap: a few at a time, and only briefly.
                    this.candidates = (this.candidates || new Set());
                    const now = performance.now();
                    if (now < (this.strayPausedUntil || 0)) { try { conn.close(); } catch (_) { /* ignore */ } return; }
                    if (this.candidates.size >= MAX_CANDIDATES) { try { conn.close(); } catch (_) { /* ignore */ } return; }
                    this.candidates.add(conn);
                    const drop = () => this.candidates.delete(conn);
                    conn.on('close', drop);
                    conn.on('error', drop);
                    const timer = setTimeout(() => {
                        drop();
                        if (conn !== this.conn) this.noteStray();
                        if (conn !== this.conn) { try { conn.close(); } catch (_) { /* ignore */ } }
                    }, CANDIDATE_MS);
                    this.timers.push(timer);
                    this.attach(conn);
                });
            } else {
                peer.on('open', () => { this.brokerTries = 0; this.dial(); });
            }
        }

        reconnectBroker() {
            const peer = this.peer;
            if (this.closed || !peer || peer.destroyed || !peer.disconnected) return;
            try { peer.reconnect(); } catch (_) { /* ignore */ }
        }

        // The device changed networks (Wi-Fi to mobile data, a new hotspot…).
        // Get back on the broker straight away, and if the other player has
        // gone quiet, rebuild the link now instead of waiting for it to time out.
        onNetworkChange() {
            if (this.closed) return;
            clearTimeout(this.brokerTimer);
            this.brokerTries = 0;
            this.reconnectBroker();
            if (this.conn && this.connected && !this.reconnecting && performance.now() - this.lastHeard > 1500) this.linkDown();
            else if (this.reconnecting && this.role === 'guest') this.dial();
        }

        // Host: a link that never got in. Too many in a minute looks like someone
        // trying codes or hammering a shared link, so refuse new ones for a bit.
        noteStray() {
            const now = performance.now();
            this.strays = (this.strays || []).filter((t) => now - t < STRAY_WINDOW_MS);
            this.strays.push(now);
            if (this.strays.length >= MAX_STRAY_DIALS) { this.strayPausedUntil = now + STRAY_PAUSE_MS; this.strays = []; }
        }

        // Guest: open a link to the host (first time, or again after a drop).
        dial() {
            if (this.closed || this.role !== 'guest') return;
            if (this.conn && this.conn.open && !this.reconnecting) return;
            const peer = this.peer;
            if (!peer || peer.destroyed) { this.openPeer(); return; }
            if (peer.disconnected || !peer.open) return;   // 'open' dials again
            if (this.dialing && performance.now() - this.dialedAt < DIAL_PATIENCE_MS) return;
            try { this.dialing?.close(); } catch (_) { /* ignore */ }
            const conn = peer.connect(ID_PREFIX + this.code, { reliable: true, serialization: 'json' });
            if (!conn) return;
            this.dialing = conn;
            this.dialedAt = performance.now();
            this.attach(conn);
            if (!this.hadPartner && !this.connectTimer) {
                this.connectTimer = setTimeout(() => {
                    if (!this.connected && !this.closed) this.fail('Could not reach that room. Check the code and that your friend still has the room open. If you are far apart, one of your networks may be blocking the connection: try again, or switch one of you to another network (a phone hotspot often works).');
                }, CONNECT_TIMEOUT_MS);
                const say = (ms, text) => this.timers.push(setTimeout(() => { if (!this.connected && !this.closed) this.ui.joinProgress(this, text); }, ms));
                say(7000, 'Still connecting… players far apart can take a few more seconds.');
                say(15000, 'Trying a relay route… this can take up to half a minute.');
            }
        }

        onPeerError(err) {
            if (this.closed) return;
            const type = err?.type || '';
            if (type === 'unavailable-id') {
                // Code taken. Reopening our own room after a reload: the broker
                // may not have let go of it yet, so try it a few more times.
                try { this.peer.destroy(); } catch (_) { /* ignore */ }
                this.peer = null;
                if (this.keepCode && ++this.codeTries < 5) {
                    this.timers.push(setTimeout(() => this.openPeer(), 1500));
                    return;
                }
                this.keepCode = false;
                this.code = randomCode();
                this.openPeer();
                return;
            }
            // Mid-session the link (or the redial loop) decides what happens.
            if (this.hadPartner) return;
            if (type === 'peer-unavailable') { if (!this.resumed) noteJoinFail(); return this.fail('No room with that code. Check the code with your friend.'); }
            if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                if (this.role === 'host' && this.peer?.open) return;
                return this.fail('Could not reach the online service. Check your internet connection and try again.');
            }
            if (type === 'browser-incompatible') return this.fail('This browser does not support online play. Try an up-to-date Chrome, Edge, Firefox or Safari.');
            this.fail('Connection failed (' + (type || 'unknown') + '). Try again.');
        }

        attach(conn) {
            conn.on('open', () => {
                if (this.closed) { try { conn.close(); } catch (_) { /* ignore */ } return; }
                // The guest says hello first; the host answers only once it lets them in.
                if (this.role === 'guest') { try { conn.send(this.helloMessage()); } catch (_) { /* closing */ } }
                if (this.role === 'guest') this.openFast(conn);
            });
            if (this.role === 'host') this.listenFast(conn);
            conn.on('data', (msg) => {
                if (this.closed || !msg || typeof msg !== 'object') return;
                if (conn !== this.conn) {
                    if (msg.t === 'hello') this.onHello(conn, msg);
                    else if (msg.t === 'full' && this.role === 'guest') this.fail(msg.why === 'version'
                        ? 'Your friend is on a different version of the game. Both of you reload the page and try again.'
                        : 'That room already has two players. Ask your friend for a new code.');
                    return;
                }
                this.lastHeard = performance.now();
                try { this.onMessage(msg); } catch (e) { console.error('[Online]', e); }
            });
            conn.on('close', () => this.onLinkClosed(conn));
            conn.on('error', () => this.onLinkClosed(conn));
            const pc = conn.peerConnection;
            if (pc) {
                let stalled = null;
                pc.addEventListener?.('iceconnectionstatechange', () => {
                    const st = pc.iceConnectionState;
                    if (st === 'disconnected') {
                        // Often recovers by itself in a second or two; if not,
                        // a fresh link is quicker than waiting for 'failed'.
                        clearTimeout(stalled);
                        stalled = setTimeout(() => {
                            if (conn === this.conn && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') this.linkDown();
                        }, ICE_DISCONNECTED_MS);
                        return;
                    }
                    clearTimeout(stalled);
                    if (st === 'connected' || st === 'completed') { if (conn === this.conn) this.checkRoute(); return; }
                    if (st !== 'failed') return;
                    if (conn === this.conn) this.linkDown();
                    else if (!this.hadPartner && this.role === 'guest') this.fail('Could not connect to your friend. One of your networks blocks peer-to-peer games and no relay could get through. Try again, or switch one of you to another network (a phone hotspot often works).');
                });
            }
        }

        // Is the link going straight between the two players or through a
        // TURN relay? Shown in the lobby; a relay adds a little delay.
        async checkRoute() {
            const pc = this.conn?.peerConnection;
            if (!pc?.getStats) return;
            try {
                const stats = await pc.getStats();
                let pair = null;
                stats.forEach((r) => {
                    if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId) || pair;
                });
                if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = pair || r; });
                if (!pair) return;
                const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
                const relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
                this.route = relayed ? 'relay' : 'direct';
                this.ui.updatePing(this);
            } catch (_) { /* ignore */ }
        }

        // Snapshots and inputs go on a second channel that may drop and reorder
        // packets, so one lost packet never stalls the ones behind it. Everything
        // that must arrive (hits, scores, events, control) stays on the reliable
        // channel, which is also the fallback when the fast one is not up.
        openFast(conn) {
            const pc = conn.peerConnection;
            if (!pc || conn._ppFast) return;
            try { this.setupFast(conn, pc.createDataChannel(FAST_LABEL, { ordered: false, maxRetransmits: 0 })); } catch (_) { /* reliable only */ }
        }

        listenFast(conn) {
            const pc = conn.peerConnection;
            if (!pc) return;
            const peerJsHandler = pc.ondatachannel;
            // PeerJS treats every incoming channel as the main one; keep ours away from it.
            pc.ondatachannel = (e) => {
                if (e.channel?.label === FAST_LABEL) this.setupFast(conn, e.channel);
                else if (peerJsHandler) peerJsHandler.call(pc, e);
            };
        }

        setupFast(conn, ch) {
            conn._ppFast = ch;
            ch.onmessage = (e) => {
                if (this.closed || conn !== this.conn || typeof e.data !== 'string') return;
                let msg;
                try { msg = JSON.parse(e.data); } catch (_) { return; }
                if (!msg || typeof msg !== 'object') return;
                if (msg.q) {
                    const f = this.fastIn;
                    if (msg.q <= f.last) {
                        // Overtaken on the way (jitter reorders packets): it was
                        // counted lost, but it arrived. Old state is dropped;
                        // pings and pongs are still good.
                        if (f.lost > 0) { f.lost--; f.got++; }
                        if (msg.t === 's' || msg.t === 'in') return;
                    } else {
                        if (f.last) f.lost += msg.q - f.last - 1;
                        f.got++;
                        f.last = msg.q;
                    }
                }
                this.lastHeard = performance.now();
                try { this.onMessage(msg); } catch (err) { console.error('[Online]', err); }
            };
            ch.onclose = ch.onerror = () => { if (conn._ppFast === ch) conn._ppFast = null; };
        }

        // Snapshots and inputs: newest wins, so losing one is fine.
        sendFast(msg) {
            const conn = this.conn;
            if (!conn || !conn.open) return;
            const ch = conn._ppFast;
            if (ch && ch.readyState === 'open') {
                msg.q = ++this.fastSeq;
                let text;
                try { text = JSON.stringify(msg); } catch (_) { return; }
                if (text.length <= FAST_MAX_BYTES && ch.bufferedAmount < 64000) {
                    try { ch.send(text); return; } catch (_) { /* fall through to reliable */ }
                }
                delete msg.q;
            }
            this.send(msg);
        }

        // Loss over the last few seconds, from gaps in the numbering.
        sampleLoss() {
            const f = this.fastIn;
            const total = f.got + f.lost;
            if (total >= 20) { this.loss = this.loss * 0.5 + (f.lost / total) * 0.5; f.got = f.lost = 0; }
            else if (this.fastIn.last === 0) this.loss = 0;
        }

        helloMessage() {
            const g = this.game;
            const live = this.inGame() && this.inMatch;
            return {
                t: 'hello', v: PROTOCOL, name: this.localName, token: this.token,
                paddles: window.PPSettings?.get('paddles') || null,
                mode: this.mode, series: this.series, pts: this.pointsToWin(),
                state: { inMatch: live, ending: live && !!g.matchEnding, n: this.matchNo },
            };
        }

        onHello(conn, msg) {
            const reject = (why) => {
                try { conn.send({ t: 'full', why }); } catch (_) { /* ignore */ }
                setTimeout(() => { try { conn.close(); } catch (_) { /* ignore */ } }, 400);
            };
            if (msg.v !== PROTOCOL) {
                if (this.role === 'guest') return this.fail('Your friend is on a different version of the game. Both of you reload the page and try again.');
                return reject('version');
            }
            // Host: once someone is in, only that same player may come back.
            if (this.role === 'host' && this.hadPartner && !(msg.token && msg.token === this.partnerToken)) { this.noteStray(); return reject('full'); }
            this.adopt(conn, msg);
        }

        adopt(conn, hello) {
            const rejoin = this.hadPartner;
            const old = this.conn;
            this.conn = conn;
            if (this.dialing === conn) this.dialing = null;
            if (old && old !== conn) setTimeout(() => { try { old.close(); } catch (_) { /* ignore */ } }, 50);
            clearTimeout(this.connectTimer);
            if (this.role === 'host') this.send(this.helloMessage());
            this.connected = true;
            this.lastHeard = performance.now();
            this.route = '';
            this.checkRoute();
            // The other side may be a fresh page with a new clock.
            this.clockOffset = null;
            this.clockSamples = [];
            this.fastIn = { last: 0, got: 0, lost: 0 };    // a new link numbers from 1 again
            this.loss = 0;
            this.remoteHidden = false;
            this.remoteName = cleanName(hello.name, this.role === 'host' ? 'Guest' : 'Host');
            this.remotePaddles = hello.paddles && typeof hello.paddles === 'object' ? hello.paddles : null;
            if (this.role === 'host') this.partnerToken = String(hello.token || '');
            else {
                saveRejoin({ role: 'guest', code: this.code, token: this.token });
                if (ONLINE_MODES.some((m) => m.id === hello.mode)) this.mode = hello.mode;
                this.remotePoints = clamp(Math.round(num(hello.pts)), 0, 99);
                this.takeSeries(hello.series);
            }
            if (!this.linkTimersOn) {
                this.linkTimersOn = true;
                this.timers.push(setInterval(() => this.heartbeat(), 1000));
                this.timers.push(setInterval(() => this.ping(), PING_MS));
                this.ping();
                // Keep the other side up to date if paddle designs change in the lobby.
                this.offPaddles = window.PPSettings?.on?.((key) => {
                    if ((key === 'paddles' || key === '*') && this.connected) this.send({ t: 'paddles', paddles: window.PPSettings.get('paddles') });
                });
            }
            const wasReconnecting = this.reconnecting;
            this.stopReconnect();
            if (!rejoin) {
                this.hadPartner = true;
                this.ui.connected(this);
                return;
            }
            this.resumeLink(hello.state || {}, wasReconnecting);
        }

        // Both sides are back on one link: pick up wherever the other one is.
        resumeLink(remote, wasReconnecting) {
            const g = this.game;
            const live = this.inGame() && this.inMatch;
            const ending = live && !!g.matchEnding;
            const sameMatch = !!remote.inMatch && num(remote.n) === this.matchNo;
            if (this.role === 'host') {
                if (live && !ending) {
                    if (sameMatch) this.resumeMatch();
                    else this.reseatGuest();          // the guest reloaded mid-match
                } else if (ending) {
                    if (sameMatch) this.resumeResults();
                    else this.toLobby();
                } else {
                    this.send({ t: 'mode', mode: this.mode, pts: this.pointsToWin() });
                    this.ui.linkState(this);
                }
            } else if (live) {
                if (!remote.inMatch || !sameMatch) {
                    this.toLobby(`${this.remoteName} reloaded the game, so you are back in the room.`);
                    return;
                }
                if (ending) this.resumeResults();
                else this.resumeMatch();
            } else {
                this.ui.connected(this);
            }
            if (wasReconnecting) this.ui.flash(`${this.remoteName} is back`);
        }

        resumeMatch() {
            const g = this.game;
            this.ui.linkState(this);
            if (g.userPaused) this.send({ t: 'pause', on: true });
            if (this.role === 'host') this.sendSnapshot();
            else this.sendInput();
        }

        resumeResults() {
            this.ui.linkState(this);
            if (this.againLocal) this.send({ t: 'again' });
            this.ui.renderResults(this);
        }

        // Host: the guest came back with a fresh page. Put them back into the
        // running match (same scores) and serve again once they are in.
        reseatGuest() {
            const g = this.game;
            // A pause the guest left behind goes with their old page.
            if (g.userPaused && this.pausedByRemote) this.onRemotePause(false);
            this.remoteReady = false;
            this.servedAfterReady = false;
            this.remotePaddle = null;
            g.additionalBalls.length = 0;
            g.serveHold = 0;
            g.pendingServe = null;
            g.ball.reset(g.center);
            this.ui.linkState(this);
            this.send(this.startMessage({ resume: true }));
        }

        onLinkClosed(conn) {
            if (this.closed) return;
            if (conn === this.conn) this.linkDown();
            else if (conn === this.dialing) this.dialing = null;
        }

        // The link to the other player died. Hold the game and try to get it back.
        linkDown() {
            if (this.closed || this.reconnecting) return;
            if (!this.hadPartner) return this.fail('The connection dropped. Try again.');
            this.reconnecting = true;
            this.reconnectSince = performance.now();
            const dead = this.conn;
            this.conn = null;
            setTimeout(() => { try { dead?.close(); } catch (_) { /* ignore */ } }, 50);
            if (this.role === 'guest') {
                this.redialTimer = setInterval(() => this.dial(), REDIAL_MS);
                this.dial();
            }
            this.giveUpTimer = setTimeout(() => this.giveUp(), RECONNECT_MS);
            this.ui.linkState(this);
        }

        stopReconnect() {
            this.reconnecting = false;
            clearInterval(this.redialTimer);
            clearTimeout(this.giveUpTimer);
            this.redialTimer = this.giveUpTimer = null;
        }

        giveUp() {
            if (this.closed || !this.reconnecting) return;
            this.stopReconnect();
            const name = this.remoteName;
            if (this.role === 'guest') {
                const inMatch = this.inGame();
                clearRejoin();
                this.close(false);
                if (inMatch) this.ui.showGone(`Lost the connection to ${name}.`);
                else this.ui.showError(`Lost the connection to ${name}.`);
            } else {
                this.dropPartner(`${name}'s connection dropped.`);
            }
        }

        // Host: the guest is gone for good. Keep the room (same code) open
        // so they, or someone else, can join again.
        dropPartner(message) {
            this.stopReconnect();
            if (this.inGame()) this.detachFromGame(true);
            window.PPResults?.hide();
            const conn = this.conn;
            this.conn = null;
            setTimeout(() => { try { conn?.close(); } catch (_) { /* ignore */ } }, 300);
            this.connected = false;
            this.hadPartner = false;
            this.partnerToken = '';
            this.remotePaddles = null;
            this.remoteName = 'Guest';
            this.remoteHidden = false;
            this.series = { left: 0, right: 0 };
            this.inMatch = false;
            this.againLocal = this.againRemote = false;
            this.ui.open({ view: 'host' });
            this.ui.hostWaiting(this.code, message);
        }

        send(msg) {
            if (!this.conn || !this.conn.open) return;
            try { this.conn.send(msg); } catch (_) { /* channel closing */ }
        }

        // Pings ride the unreliable channel: a lost packet on the reliable one
        // would hold the pong back and make the link look slower than it is.
        ping() {
            if (this.closed || this.reconnecting || !this.connected) return;
            this.sendFast({ t: 'ping', ts: Math.round(performance.now() * 10) / 10 });
        }

        onPong(msg) {
            const now = performance.now();
            const sample = now - num(msg.ts, now);
            if (!(sample >= 0 && sample < 5000)) return;
            this.jitter = this.jitter * 0.8 + Math.abs(sample - this.rtt) * 0.2;
            this.rtt = this.rtt * 0.75 + sample * 0.25;
            if (!Number.isFinite(msg.now)) return;   // older build: no clock sync
            // The other clock read msg.now about halfway through the round
            // trip. The fastest recent trips have the least queueing in them,
            // so they give the truest offset.
            const list = this.clockSamples;
            list.push({ rtt: sample, off: msg.now + sample / 2 - now, at: now });
            while (list.length > 16) list.shift();
            let best = list[0];
            for (const c of list) if (c.rtt < best.rtt) best = c;
            this.clockOffset = this.clockOffset == null ? best.off : this.clockOffset * 0.7 + best.off * 0.3;
        }

        heartbeat() {
            if (this.closed) return;
            if (this.reconnecting) { this.ui.linkState(this); return; }
            // Slow links get a little more slack before they count as dropped.
            const limit = this.remoteHidden ? HIDDEN_LINK_TIMEOUT_MS : LINK_TIMEOUT_MS + clamp(this.rtt * 6, 0, 5000);
            if (this.connected && this.conn && performance.now() - this.lastHeard > limit) { this.linkDown(); return; }
            if (this.connected) saveRejoin(this.role === 'host' ? { role: 'host', code: this.code } : { role: 'guest', code: this.code, token: this.token });
            this.sampleLoss();
            if (this.connected && !this.route && ++this.routeChecks % 3 === 0) this.checkRoute();
            this.ui.updatePing(this);
        }

        fail(message) {
            if (this.closed) return;
            clearRejoin();
            this.ui.showError(message);
            this.close(false);
        }

        leave() {
            if (this.closed) return;
            this.send({ t: 'bye' });
            clearRejoin();
            this.close(true);
        }

        close(silent) {
            if (this.closed) return;
            this.closed = true;
            this.stopReconnect();
            clearTimeout(this.connectTimer);
            clearTimeout(this.brokerTimer);
            this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
            this.timers = [];
            this.offPaddles?.();
            const g = this.game;
            if (g && g.net === this) this.detachFromGame(!silent);
            const conn = this.conn, dialing = this.dialing, peer = this.peer;
            setTimeout(() => {
                try { conn?.close(); } catch (_) { /* ignore */ }
                try { dialing?.close(); } catch (_) { /* ignore */ }
                try { peer?.destroy(); } catch (_) { /* ignore */ }
            }, 120);
            if (session === this) session = null;
            this.ui.onSessionClosed(this);
        }

        takeSeries(s) {
            if (!s || typeof s !== 'object') return;
            this.series = { left: clamp(Math.round(num(s.left)), 0, 999), right: clamp(Math.round(num(s.right)), 0, 999) };
        }

        // ── Messages ───────────────────────────────────────────────────
        onMessage(msg) {
            switch (msg.t) {
                case 'paddles':
                    this.remotePaddles = msg.paddles && typeof msg.paddles === 'object' ? msg.paddles : null;
                    return;
                case 'ping': return this.sendFast({ t: 'pong', ts: msg.ts, now: Math.round(performance.now() * 10) / 10 });
                case 'pong': return this.onPong(msg);
                case 'hidden': this.remoteHidden = !!msg.on; return;
                case 'bye': {
                    const name = this.remoteName;
                    if (this.role === 'host') return this.dropPartner(`${name} left the room.`);
                    const inMatch = this.inGame();
                    clearRejoin();
                    this.close(false);
                    if (inMatch) this.ui.showGone(`${name} left the match and closed the room.`);
                    else this.ui.showError(`${name} closed the room.`);
                    return;
                }
                case 'mode':
                    if (this.role === 'guest' && ONLINE_MODES.some((m) => m.id === msg.mode)) {
                        this.mode = msg.mode;
                        this.remotePoints = clamp(Math.round(num(msg.pts)), 0, 99);
                        this.ui.renderReady(this);
                    }
                    return;
                case 'start': return this.role === 'guest' && this.guestStart(msg);
                case 'ready': this.remoteReady = true; return;
                case 's': return this.role === 'guest' && this.applySnapshot(msg);
                case 'in': return this.role === 'host' && this.onRemoteInput(msg);
                case 'hit': return this.role === 'host' && this.onRemoteHit(msg);
                case 'fire': return this.onRemoteFire();
                case 'ev': return this.role === 'guest' && this.onEvent(msg);
                case 'pause': return this.onRemotePause(!!msg.on);
                case 'end': return this.role === 'guest' && this.onEnd(msg);
                case 'again':
                    this.againRemote = true;
                    this.ui.renderResults(this);
                    if (this.role === 'host' && this.againLocal) this.hostStart();
                    return;
                case 'lobby': return this.toLobby();
                case 'world': return this.role === 'guest' && this.applyWorld(msg.w, msg.h);
            }
        }

        // ── Starting a match ───────────────────────────────────────────
        setMode(mode) {
            if (!ONLINE_MODES.some((m) => m.id === mode)) mode = 'classic';
            this.mode = mode;
            this.send({ t: 'mode', mode, pts: this.pointsToWin() });
        }

        pointsToWin() { return clamp(Math.round(num(Number(window.PPSettings?.get('pointsToWin')), 11)), 1, 99); }

        async hostStart() {
            const g = this.game;
            if (!g || this.role !== 'host' || !this.connected || this.reconnecting) return;
            this.resetMatchFlags();
            this.matchNo++;
            // Each side shows the design its own player picked for this mode.
            const mine = window.PPSettings?.getPaddle?.(this.mode, 'left') || 'classic';
            this.paddleDesigns = { left: mine, right: cleanDesign(this.remotePaddles?.[this.mode]?.left) };
            await launchMatch(this, this.mode);
            if (g.net !== this) return;
            this.send(this.startMessage());
        }

        startMessage(opts = {}) {
            const g = this.game;
            const msg = {
                t: 'start', mode: this.mode, maxScore: g.maxScore, n: this.matchNo,
                world: { w: g.width, h: g.height },
                names: { left: this.localName, right: this.remoteName },
                paddles: this.paddleDesigns,
                series: this.series,
            };
            if (opts.resume) msg.sc = [g.scores.player, g.scores.ai];
            if (this.mode === 'customise') {
                msg.custom = { ...g.customSettings, audioSource: '', audioTrack: '', audioCustomPath: '', previewModeActive: false };
                const bg = g.customSettings.backgroundMode;
                if (typeof bg === 'string' && bg.startsWith('custom:')) {
                    const entry = window.CustomBackgrounds?.Library?.get(bg.slice(7));
                    // A data channel message tops out around 256 KB: bigger
                    // images travel as their thumbnail.
                    if (entry) msg.bg = entry.data.length < 200000 ? entry : { ...entry, kind: 'image', data: entry.thumb || '' };
                }
            }
            return msg;
        }

        async guestStart(msg) {
            const g = this.game;
            if (!g) return;
            const mode = ONLINE_MODES.some((m) => m.id === msg.mode) ? msg.mode : 'classic';
            this.mode = mode;
            this.resetMatchFlags();
            this.matchNo = Math.round(num(msg.n, this.matchNo + 1));
            this.takeSeries(msg.series);
            this.paddleDesigns = {
                left: cleanDesign(msg.paddles?.left),
                right: msg.paddles ? cleanDesign(msg.paddles.right) : (window.PPSettings?.getPaddle?.(mode, 'left') || 'classic'),
            };
            if (mode === 'customise' && msg.custom && typeof msg.custom === 'object') {
                if (!this.backup) {
                    let stored = null;
                    try { stored = localStorage.getItem('pp-customise-settings-v1'); } catch (_) { /* ignore */ }
                    this.backup = { settings: g.customSettings, stored };
                }
                if (msg.bg) window.CustomBackgrounds?.setSessionEntry(msg.bg);
                g.customSettings = { ...g.getDefaultCustomSettings(), ...msg.custom, audioSource: '', audioTrack: '', audioCustomPath: '', previewModeActive: false };
            }
            const w = clamp(Math.round(num(msg.world?.w, 1280)), 320, 7680);
            const h = clamp(Math.round(num(msg.world?.h, 720)), 240, 4320);
            g.netWorld = { w, h };
            await launchMatch(this, mode);
            if (g.net !== this) return;
            g.maxScore = clamp(Math.round(num(msg.maxScore, 11)), 1, 99);
            if (Array.isArray(msg.sc)) {
                // Rejoining a match already under way.
                g.scores.player = clamp(Math.round(num(msg.sc[0])), 0, 99);
                g.scores.ai = clamp(Math.round(num(msg.sc[1])), 0, 99);
                g.updateScoreUI();
            }
        }

        resetMatchFlags() {
            this.inMatch = true;
            this.remoteReady = false;
            this.sentReady = false;
            this.gotSnapshot = false;
            this.servedAfterReady = false;
            this.stepCount = 0;
            this.remotePaddle = null;
            this.localHitAt = -1e9;
            this.againLocal = false;
            this.againRemote = false;
            this.lastScores = '';
            this.ui.hideBanner();
        }

        applyWorld(w, h) {
            const g = this.game;
            if (!g || g.net !== this) return;
            w = clamp(Math.round(num(w, g.width)), 320, 7680);
            h = clamp(Math.round(num(h, g.height)), 240, 4320);
            if (g.netWorld && g.netWorld.w === w && g.netWorld.h === h) return;
            g.netWorld = { w, h };
            g.resizeNow?.();
        }

        // Called by the game when the match ends or the player leaves.
        detachFromGame(showMenu) {
            const g = this.game;
            if (!g) return;
            g.net = null;
            this.inMatch = false;
            this.ui.hideBanner();
            if (this.role === 'guest') {
                if (this.backup) {
                    g.customSettings = this.backup.settings;
                    try {
                        if (this.backup.stored == null) localStorage.removeItem('pp-customise-settings-v1');
                        else localStorage.setItem('pp-customise-settings-v1', this.backup.stored);
                    } catch (_) { /* ignore */ }
                    this.backup = null;
                }
                window.CustomBackgrounds?.clearSessionEntries?.();
                if (g.netWorld) { g.netWorld = null; g.resizeNow?.(); }
            }
            document.body.classList.remove('pp-online');
            if (showMenu && (g.running || g.introActive || g.paused || g.matchEnding)) g.returnToMenu();
        }

        // ── Per physics step (game.js calls these) ─────────────────────
        // Returns false while the match should hold still.
        preStep(dt) {
            const g = this.game;
            if (this.reconnecting) { this.ui.linkState(this); return false; }
            this.stepCount++;
            if (this.role === 'host') {
                const every = Math.max(1, Math.round(1 / (SNAPSHOT_HZ * dt)));
                if (this.stepCount % every === 0) this.sendSnapshot();
                if (!this.remoteReady) { this.ui.banner(`Waiting for ${this.remoteName}…`); return false; }
                if (!this.servedAfterReady) {
                    this.servedAfterReady = true;
                    this.ui.hideBanner();
                    // A beat before the first serve (or keep a hold already running,
                    // e.g. Obstacle's opening camera move).
                    if (g.serveHold > 0 && g.pendingServe) g.serveHold = Math.max(g.serveHold, 1.1);
                    else g.holdServe(1.1);
                }
                return true;
            }
            const every = Math.max(1, Math.round(1 / (INPUT_HZ * dt)));
            if (this.stepCount % every === 0) this.sendInput();
            if (!this.gotSnapshot) { this.ui.banner(`Waiting for ${this.remoteName}…`); return false; }
            return true;
        }

        onIntroDone() {
            if (this.role === 'guest' && !this.sentReady) {
                this.sentReady = true;
                this.send({ t: 'ready' });
            }
        }

        // Paddle that the other player drives: chase the last reported
        // position, projected forward by the link delay.
        driveRemotePaddle(paddle, dt) {
            const r = this.remotePaddle;
            if (!r) { paddle.vel.y *= paddle.friction || 0.85; paddle.pos.y += paddle.vel.y * dt; return; }
            // r.at is when it left the other side (on our clock), so the lead
            // grows with how late this report is.
            const now = performance.now();
            const lead = clamp((now - r.recv) / 1000 + (r.recv - r.at) / 2000, 0, 0.12);
            const target = r.y + r.vy * lead;
            const k = Math.min(1, dt * 32);
            const before = paddle.pos.y;
            paddle.pos.y += (target - paddle.pos.y) * k;
            paddle.vel.y = dt > 0 ? (paddle.pos.y - before) / dt * 0.5 + r.vy * 0.5 : r.vy;
            if (paddle.laserStunned) paddle.vel.y = 0;
        }

        localPaddle() { return this.role === 'host' ? this.game.player : this.game.aiPaddle; }

        sendInput() {
            const p = this.localPaddle();
            if (!p) return;
            this.sendFast({ t: 'in', y: round1(p.pos.y), vy: round1(p.vel.y), ts: Math.round(performance.now()) });
        }

        onRemoteInput(msg) {
            if (!Number.isFinite(msg.y)) return;
            const now = performance.now();
            this.remotePaddle = { y: msg.y, vy: num(msg.vy), recv: now, at: now - this.transit(msg.ts) * 1000 };
        }

        onLocalFire() { this.send({ t: 'fire' }); }

        onRemoteFire() {
            const g = this.game;
            if (!g || g.net !== this) return;
            const p = this.role === 'host' ? g.aiPaddle : g.player;
            if (p?.hasLaser && !p.laserStunned) p.fireLaser(g);
        }

        // The guest hit the main ball with its own paddle.
        onLocalHit(ball) {
            this.localHitAt = performance.now();
            this.send({ t: 'hit', b: [round1(ball.pos.x), round1(ball.pos.y), round1(ball.vel.x), round1(ball.vel.y), Math.round((ball.spin || 0) * 100) / 100], ts: Math.round(performance.now()) });
        }

        onRemoteHit(msg) {
            const g = this.game;
            if (!g || g.net !== this || !Array.isArray(msg.b) || g.matchEnding) return;
            const ball = g.ball;
            // Already coming back (the host saw the hit too) or already scored.
            // The ball may be well past the edge: goalGrace holds the goal back
            // just so a far-away guest's hit can still arrive.
            if (ball.vel.x <= 0 || ball.pos.x > g.width + 50 + this.goalGrace(ball)) return;
            let [x, y, vx, vy, spin] = msg.b.map((v) => num(v));
            // The guest owns hits on its own paddle, but not blindly: the hit
            // must be where the host sees that paddle (with room for lag),
            // head back at the host, and no faster than a hit can make it.
            const pad = g.aiPaddle;
            const slack = Math.max(60, Math.abs(num(this.remotePaddle?.vy)) * ((this.rtt + this.jitter * 2) / 1000 + 0.1));
            if (Math.abs(y - (pad.pos.y + pad.h / 2)) > pad.h / 2 + ball.r + slack) return;
            if (Math.abs(x - pad.pos.x) > pad.w + ball.r + 120 + Math.abs(ball.vel.x) * 0.25) return;
            if (vx >= 0) return;
            const cap = Math.max(900, Math.hypot(ball.vel.x, ball.vel.y) * 1.8 + 300);
            const sp = Math.hypot(vx, vy);
            if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
            spin = clamp(spin, -60, 60);
            const lat = this.transit(msg.ts);
            let ny = y + vy * lat, nvy = vy;
            if (ny < ball.r) { ny = ball.r + (ball.r - ny); nvy = Math.abs(nvy); }
            if (ny > g.height - ball.r) { ny = g.height - ball.r - (ny - (g.height - ball.r)); nvy = -Math.abs(nvy); }
            ball.pos.set(Math.min(x + vx * lat, g.aiPaddle.pos.x - ball.r - 1), clamp(ny, ball.r, g.height - ball.r));
            ball.prev?.set(ball.pos.x, ball.pos.y);
            ball.vel.set(vx, nvy);
            ball.spin = spin;
            ball.lastHit = 'ai';
            ball.lastImpact = clamp(Math.hypot(vx, vy) / 1400, 0, 1);
            g.particles?.spawnGodTierHit?.(g.aiPaddle.pos.x, ball.pos.y, g.aiPaddle.color, Math.hypot(vx, vy));
            g.audio?.hit?.(ball.lastImpact || 0.4, g.panFor(ball.pos.x), 'right');
            g.rallyCount++;
            g.maxRally = Math.max(g.maxRally || 0, g.rallyCount);
            g._setText?.(g.rallyDisplay, g.rallyCount);
            g.checkRallyMilestones?.();
            g.onPaddleImpact?.(ball, g.aiPaddle, false, false);
        }

        // How much further past the right edge the ball may go before the
        // host counts a goal: room for the guest's hit to arrive.
        goalGrace(ball) {
            if (this.role !== 'host') return 0;
            const wait = clamp((this.rtt + this.jitter * 2) / 1000, 0, 0.5) + 0.04;
            return Math.min(800, Math.abs(ball.vel.x) * wait);
        }

        // ── Host → guest state ─────────────────────────────────────────
        sendSnapshot() {
            const g = this.game;
            if (!g || !g.ball) return;
            const b = g.ball;
            const ballArr = (x) => [round1(x.pos.x), round1(x.pos.y), round1(x.vel.x), round1(x.vel.y), round1(x.r), Math.round((x.spin || 0) * 100) / 100];
            const s = {
                t: 's',
                ts: Math.round(performance.now()),
                b: ballArr(b),
                ab: g.additionalBalls.map((x) => [...ballArr(x), x.color || '', round1(num(x.life, 10))]),
                L: [round1(g.player.pos.y), round1(g.player.vel.y), round1(g.player.h), g.player.laserStunned ? 1 : 0],
                R: [round1(g.aiPaddle.h), g.aiPaddle.laserStunned ? 1 : 0],
                sc: [g.scores.player, g.scores.ai], ms: g.maxScore, rc: g.rallyCount,
                sh: g.serveHold > 0 && g.pendingServe ? [round1(g.serveHold), round1(g.serveHoldTotal || 1), round1(g.pendingServe.vx), round1(g.pendingServe.vy)] : 0,
                pu: g.powerUps.map((p) => {
                    if (!p._netId) p._netId = ++this.puSeq;
                    return [p._netId, p.type, round1(p.pos.x), round1(p.pos.y)];
                }),
                tw: round1(g.timeWarpFactor || 1),
                fx: (g.ghostBallActive ? 1 : 0) | (g.magnetPaddleActive ? 2 : 0) | (g.powerShotActive ? 4 : 0) |
                    (g.shieldActive?.player ? 8 : 0) | (g.shieldActive?.ai ? 16 : 0),
                inv: round1(Math.max(0, g.invincibleTime || 0)),
            };
            if (g.gravityWells?.length) s.w = g.gravityWells.map((w) => [round1(w.pos.x), round1(w.pos.y)]);
            if (g.obstacles?.length) s.o = g.obstacles.map((o) => [round1(o.pos.x), round1(o.pos.y), Math.round((o.rotation || 0) * 1000) / 1000]);
            if (g.forgeZombies?.zombies.length && g.isForgeArenaActive?.()) s.fz = g.forgeZombies.snapshot();
            if (g.forgeGadgets?.count && g.isForgeArenaActive?.()) s.fg = g.forgeGadgets.snapshot();
            const ar = g.obstacleArcade;
            if (ar && (g.gameMode === 'obstacle' || ar.fixedLayout)) {
                s.ar = [ar.wallet.player, ar.wallet.ai, round1(ar.starTime), round1(ar.boostTime),
                    ar.coins.map((c) => (c.alive ? 1 : 0)).join(''), ar.blocks.map((k) => (k.used ? 1 : 0)).join(''),
                    ar.shield.player, ar.shield.ai, ar.starOwner];
            }
            this.sendFast(s);
        }

        applySnapshot(s) {
            const g = this.game;
            if (!g || g.net !== this || !g.ball || !Array.isArray(s.b)) return;
            const first = !this.gotSnapshot;
            this.gotSnapshot = true;
            if (first) this.ui.hideBanner();
            const lat = this.transit(s.ts);

            // Scores and rally.
            if (Array.isArray(s.sc)) {
                const key = s.sc.join(':');
                if (key !== this.lastScores) {
                    this.lastScores = key;
                    g.scores.player = num(s.sc[0]);
                    g.scores.ai = num(s.sc[1]);
                    g.updateScoreUI();
                }
            }
            if (Number.isFinite(s.ms)) g.maxScore = s.ms;
            if (Number.isFinite(s.rc) && s.rc !== g.rallyCount) {
                g.rallyCount = s.rc;
                g.maxRally = Math.max(g.maxRally || 0, s.rc);
                g._setText?.(g.rallyDisplay, g.rallyCount);
            }

            // Main ball.
            const [bx, by, bvx, bvy, br, bspin] = s.b.map((v) => num(v));
            const ball = g.ball;
            ball.r = br || ball.r;
            if (Array.isArray(s.sh)) {
                const [left, total, pvx, pvy] = s.sh.map((v) => num(v));
                ball.pos.set(bx, by);
                ball.prev?.set(bx, by);
                ball.vel.set(0, 0);
                g.serveHold = Math.max(0.01, left - lat);
                g.serveHoldTotal = total || 1;
                g.pendingServe = { vx: pvx, vy: pvy };
                ball.trailCount = 0;
                this.localHitAt = -1e9;
            } else {
                if (g.serveHold > 0) { g.serveHold = 0; g.pendingServe = null; }
                const sinceHit = performance.now() - this.localHitAt;
                // Right after our own hit the host has not caught up yet: keep
                // our version until it reports the ball coming back.
                const trustLocal = sinceHit < Math.min(900, this.rtt * 1.3 + this.jitter * 2 + 150) && bvx > 0 && ball.vel.x < 0;
                if (!trustLocal) this.reconcileBall(ball, bx, by, bvx, bvy, bspin, lat);
            }

            // Extra balls (multi-ball).
            if (Array.isArray(s.ab)) {
                const list = g.additionalBalls;
                while (list.length > s.ab.length) list.pop();
                for (let i = 0; i < s.ab.length; i++) {
                    const a = s.ab[i];
                    let eb = list[i];
                    if (!eb) {
                        eb = new Ball(num(a[0]), num(a[1]), num(a[4], ball.r));
                        eb.color = a[6] || '#ffffff';
                        list.push(eb);
                    }
                    eb.life = num(a[7], 10);
                    eb.r = num(a[4], eb.r);
                    this.reconcileBall(eb, num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[5]), lat);
                }
            }

            // Paddles: the host's paddle follows the host; ours only takes its size.
            if (Array.isArray(s.L)) {
                const now = performance.now();
                this.remotePaddle = { y: num(s.L[0]), vy: num(s.L[1]), recv: now, at: now - lat * 1000 };
                this.setPaddleHeight(g.player, num(s.L[2], g.player.h));
                if (s.L[3] && !g.player.laserStunned) { g.player.laserStunned = true; g.player.laserStunTime = Math.max(g.player.laserStunTime || 0, 0.3); }
                if (first) g.player.pos.y = num(s.L[0], g.player.pos.y);
            }
            if (Array.isArray(s.R)) {
                this.setPaddleHeight(g.aiPaddle, num(s.R[0], g.aiPaddle.h));
                // Our own paddle frozen on the host (a Forge spitter's slime).
                if (s.R[1] && !g.aiPaddle.laserStunned) { g.aiPaddle.laserStunned = true; g.aiPaddle.laserStunTime = Math.max(g.aiPaddle.laserStunTime || 0, 0.3); }
            }

            // Power-ups on the court.
            if (Array.isArray(s.pu)) {
                const byId = new Map(g.powerUps.map((p) => [p._netId, p]));
                const next = [];
                for (const [id, type, x, y] of s.pu) {
                    let p = byId.get(id);
                    if (!p && typeof PowerUp === 'function') { p = new PowerUp(x, y, type); p._netId = id; }
                    if (!p) continue;
                    p.pos.x = x; p.pos.y = y;
                    next.push(p);
                }
                g.powerUps = next;
            }

            // Effects that change how the ball and paddles behave.
            if (Number.isFinite(s.tw) && Math.abs((g.timeWarpFactor || 1) - s.tw) > 0.01) g.setTimeWarpFactor(s.tw);
            const fx = num(s.fx);
            g.ghostBallActive = !!(fx & 1);
            g.magnetPaddleActive = !!(fx & 2);
            g.powerShotActive = !!(fx & 4);
            if (!g.shieldActive || typeof g.shieldActive !== 'object') g.shieldActive = { player: false, ai: false };
            g.shieldActive.player = !!(fx & 8);
            g.shieldActive.ai = !!(fx & 16);
            g.invincibleTime = num(s.inv);

            // Arena.
            if (Array.isArray(s.w) && g.gravityWells) {
                if (g.gravityWells.length !== s.w.length && typeof GravityWell === 'function' && g.gameMode === 'gravity') {
                    g.gravityWells = s.w.map(([x, y]) => new GravityWell(x, y, 4200));
                }
                for (let i = 0; i < Math.min(s.w.length, g.gravityWells.length); i++) {
                    const w = g.gravityWells[i];
                    w.pos.x = num(s.w[i][0], w.pos.x);
                    w.pos.y = num(s.w[i][1], w.pos.y);
                }
            }
            if (Array.isArray(s.o) && g.obstacles) {
                if (g.obstacles.length !== s.o.length && g.gameMode === 'obstacle' && g.obstacleCourse) {
                    g.obstacleCourse.rebuild(true);
                }
                const n = Math.min(s.o.length, g.obstacles.length);
                for (let i = 0; i < n; i++) {
                    const o = g.obstacles[i];
                    o.pos.x = num(s.o[i][0], o.pos.x);
                    o.pos.y = num(s.o[i][1], o.pos.y);
                    if (Number.isFinite(s.o[i][2])) o.rotation = s.o[i][2];
                }
            }
            if (s.fz && g.forgeZombies) g.forgeZombies.applySnapshot(s.fz);
            if (s.fg && g.forgeGadgets) g.forgeGadgets.applySnapshot(s.fg, lat);
            const ar = g.obstacleArcade;
            if (Array.isArray(s.ar) && ar) {
                ar.wallet.player = num(s.ar[0]);
                ar.wallet.ai = num(s.ar[1]);
                ar.starTime = num(s.ar[2]);
                ar.boostTime = num(s.ar[3]);
                const coins = String(s.ar[4] || '');
                if (coins.length === ar.coins.length) ar.coins.forEach((c, i) => { c.alive = coins[i] === '1'; });
                const blocks = String(s.ar[5] || '');
                if (blocks.length === ar.blocks.length) ar.blocks.forEach((k, i) => { k.used = blocks[i] === '1'; });
                ar.shield.player = num(s.ar[6]) > 0 ? 1 : 0;
                ar.shield.ai = num(s.ar[7]) > 0 ? 1 : 0;
                if (s.ar[8] === 'player' || s.ar[8] === 'ai') ar.starOwner = s.ar[8];
                ar.syncHud?.();
            }
        }

        setPaddleHeight(p, h) {
            if (!p || !(h > 0) || Math.abs(p.h - h) < 0.5) return;
            const centre = p.pos.y + p.h / 2;
            p.h = h;
            p.pos.y = centre - h / 2;
            p.clampTo(this.game.height);
            p._initCircuitNodes?.();
        }

        // Pull a locally simulated ball towards the host's, projected forward
        // by the link delay. Small errors blend away; big ones snap.
        reconcileBall(ball, x, y, vx, vy, spin, lat) {
            const g = this.game;
            let px = x + vx * lat, py = y + vy * lat;
            if (py < ball.r || py > g.height - ball.r) { px = x; py = y; }
            const dx = px - ball.pos.x, dy = py - ball.pos.y;
            const err = Math.hypot(dx, dy);
            const flipped = Math.sign(vx) !== Math.sign(ball.vel.x) && Math.abs(vx) > 1;
            if (err > Math.max(90, g.height * 0.12) || flipped) {
                ball.pos.set(px, py);
                ball.prev?.set(px, py);
                if (flipped || err > g.height * 0.3) ball.trailCount = 0;
            } else {
                ball.pos.x += dx * 0.35;
                ball.pos.y += dy * 0.35;
            }
            ball.vel.set(vx, vy);
            ball.spin = spin;
        }

        // Host-side game events the guest needs to see.
        hostEvent(ev) { if (this.role === 'host') this.send({ t: 'ev', ...ev }); }

        onEvent(msg) {
            const g = this.game;
            if (!g || g.net !== this) return;
            switch (msg.k) {
                case 'goal': {
                    const right = !!msg.right;
                    const y = num(msg.y, g.height / 2);
                    g.onGoalScored(right, y);
                    g.audio?.score?.();
                    g.resetRally?.();
                    if (g.gameMode === 'obstacle' || (g.isForgeArenaActive?.() && g.obstacleArcade?.fixedLayout)) {
                        g.obstacleArcade?.onGoal(right ? 'player' : 'ai', g.ball);
                    }
                    return;
                }
                case 'arcadeCoin':
                    g.obstacleArcade?.queueCoinFlights(msg.side, Math.max(1, Math.min(8, num(msg.count, 1))),
                        num(msg.x, g.width / 2), num(msg.y, g.height / 2), !!msg.spend, true);
                    return;
                case 'note':
                    this.applyingRemote = true;
                    try { g.showNotification(String(msg.title || '').slice(0, 40), String(msg.message || '').slice(0, 80), String(msg.color || '#ffffff').slice(0, 24)); } finally { this.applyingRemote = false; }
                    return;
                case 'pu':
                    if (typeof msg.type === 'string' && msg.type in g.powerUpTimers) {
                        g.powerUpTimers[msg.type] = 0;
                        g.activatePowerUp(msg.type);
                    }
                    return;
                case 'pop':
                    g.popText?.(String(msg.text || '').slice(0, 24), num(msg.x), num(msg.y), String(msg.color || '#ffffff').slice(0, 24), num(msg.size, 32));
                    return;
            }
        }

        // ── Pause and end ──────────────────────────────────────────────
        onLocalPause(paused) {
            if (this.applyingRemote) return;
            this.pausedByRemote = false;
            this.send({ t: 'pause', on: !!paused });
            this.ui.hideBanner();
        }

        onRemotePause(on) {
            const g = this.game;
            if (!g || g.net !== this) return;
            this.pausedByRemote = on;
            this.applyingRemote = true;
            try { g.setUserPaused(on); } finally { this.applyingRemote = false; }
            if (on) this.ui.banner(`${this.remoteName} paused the game`, 'info');
            else this.ui.hideBanner();
        }

        onMatchEnd(leftWon) {
            if (this.role !== 'host') return;
            const g = this.game;
            if (leftWon) this.series.left++; else this.series.right++;
            this.send({ t: 'end', leftWon: !!leftWon, sc: [g.scores.player, g.scores.ai], series: this.series });
        }

        onEnd(msg) {
            const g = this.game;
            if (!g || g.net !== this) return;
            if (Array.isArray(msg.sc)) { g.scores.player = num(msg.sc[0]); g.scores.ai = num(msg.sc[1]); }
            this.takeSeries(msg.series);
            g.finishMatch(!!msg.leftWon);
        }

        requestAgain() {
            if (this.reconnecting) return;
            this.againLocal = true;
            this.send({ t: 'again' });
            this.ui.renderResults(this);
            if (this.role === 'host' && this.againRemote) this.hostStart();
        }

        // Back to the room together, e.g. to pick another mode.
        requestLobby() {
            this.send({ t: 'lobby' });
            this.toLobby();
        }

        toLobby(note = '') {
            window.PPResults?.hide();
            if (this.inGame()) this.detachFromGame(true);
            this.inMatch = false;
            this.againLocal = this.againRemote = false;
            this.ui.open({ view: 'ready' });
            this.ui.renderReady(this);
            if (note) this.ui.flash(note);
        }

        seriesLine() {
            const { left, right } = this.series;
            if (left + right < 2) return '';
            const host = this.role === 'host' ? this.localName : this.remoteName;
            const guest = this.role === 'host' ? this.remoteName : this.localName;
            return `Series: ${host} ${left} – ${right} ${guest}`;
        }

        labelFor(side) {
            const mine = side === this.localSide();
            return (mine ? 'YOU' : this.remoteName).toUpperCase().slice(0, 12);
        }

        resultCard(leftWon) {
            const g = this.game;
            const youWon = (this.role === 'host') === !!leftWon;
            const left = { label: this.role === 'host' ? this.localName : this.remoteName, score: g.scores.player };
            const right = { label: this.role === 'host' ? this.remoteName : this.localName, score: g.scores.ai };
            const lines = [];
            if (g.maxRally > 0) lines.push(`Longest rally: ${g.maxRally}`);
            const series = this.seriesLine();
            if (series) lines.push(series);
            return {
                kicker: `Online · ${modeName(this.mode)} · match over`,
                title: youWon ? 'You win!' : `${this.remoteName} wins`,
                tone: youWon ? 'win' : 'loss',
                left, right, lines,
                actions: [
                    { label: 'Play again', primary: true, data: 'again', onClick: () => { if (session === this) this.requestAgain(); } },
                    { label: 'Change mode', data: 'lobby', onClick: () => { if (session === this && !this.reconnecting) this.requestLobby(); } },
                    {
                        label: 'Leave', data: 'leave', onClick: () => {
                            window.PPResults?.hide();
                            this.leave();
                            window.game?.returnToMenu?.();
                        }
                    },
                ],
            };
        }
    }

    // ── Launching a match on this browser ──────────────────────────────
    async function launchMatch(sess, mode) {
        const g = window.game;
        if (!g) return;
        ui.close();
        const modal = document.getElementById('modal');
        if (modal) { modal.classList.remove('on'); modal.style.display = 'none'; }
        const co = document.getElementById('customiseOverlay');
        co?.classList.remove('active');
        co?.setAttribute('aria-hidden', 'true');
        document.getElementById('customisePanel')?.classList.remove('active');
        const overlay = document.getElementById('overlay');
        if (overlay) { overlay.classList.remove('visible', 'post-match'); overlay.classList.add('hidden'); }
        document.body.classList.remove('has-overlay');
        window.__ppAllowOverlayHide = true;
        window.__ppStopOverlayGuard = true;
        window.__ppReleaseOverlayGuard?.();

        if (g.userPaused) { sess.applyingRemote = true; g.setUserPaused(false); sess.applyingRemote = false; }
        g.stop?.();
        g.net = sess;
        document.body.classList.add('pp-online');
        if (g.netWorld) g.resizeNow?.();
        if (mode === 'customise') {
            try { await g.prepareCustomMatchResources?.(); } catch (_) { /* ignore */ }
        } else {
            try { await window.ensureAudioEnhancementsLoaded?.(); } catch (_) { /* ignore */ }
        }
        try { await g.audio?.enable?.(); } catch (_) { /* ignore */ }
        if (g.net !== sess) return;   // left while loading

        g.isMultiplayer = true;
        if (mode === 'customise') g.customSettings.previewModeActive = false;
        sess.launching = true;
        try { g.setGameMode(mode); } finally { sess.launching = false; }
        if (mode === 'customise') {
            g.customSettings.previewModeActive = false;
            g.applyCustomiseSettings?.();
        }
        if (g.player) g.player.isAI = false;
        if (g.aiPaddle) g.aiPaddle.isAI = false;
        document.querySelectorAll('#hud .mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
        g.running = false;
        g.startIntro?.();
        try { await g.startMatchMusic?.(); } catch (_) { /* ignore */ }
        watchIntro(sess);
    }

    function watchIntro(sess) {
        const tick = () => {
            const g = window.game;
            if (!g || g.net !== sess || sess.closed) return;
            if (g.running && !g.introActive) { sess.onIntroDone(); return; }
            setTimeout(tick, 100);
        };
        tick();
    }

    // ── Lobby UI ───────────────────────────────────────────────────────
    const ui = {
        root: null,
        view: 'choose',
        startMode: 'classic',
        bannerEl: null,
        lastFocus: null,

        build() {
            if (this.root) return this.root;
            const root = document.createElement('div');
            root.id = 'pp-online';
            root.className = 'ppon';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-labelledby', 'pponTitle');
            root.setAttribute('aria-hidden', 'true');
            root.innerHTML = `
                <div class="ppon-box">
                    <header class="ppon-head">
                        <div>
                            <div class="ppon-kicker">Online · peer to peer</div>
                            <h2 id="pponTitle">Play online</h2>
                        </div>
                        <button type="button" class="ppon-close" data-ppon="close" aria-label="Close">&times;</button>
                    </header>
                    <div class="ppon-body">
                        <section class="ppon-view" data-view="choose">
                            <label class="ppon-field">
                                <span>Your name</span>
                                <input id="pponName" type="text" maxlength="16" autocomplete="nickname" placeholder="Player">
                            </label>
                            <div class="ppon-choices">
                                <button type="button" class="ppon-choice" data-ppon="create">
                                    <span class="ppon-choice-icon" aria-hidden="true">+</span>
                                    <strong>Create a room</strong>
                                    <span>Get a code to send to a friend. You play on the left and pick the mode.</span>
                                </button>
                                <button type="button" class="ppon-choice" data-ppon="join-view">
                                    <span class="ppon-choice-icon" aria-hidden="true">&#8594;</span>
                                    <strong>Join a room</strong>
                                    <span>Type the code your friend sent you. You play on the right.</span>
                                </button>
                            </div>
                            <p class="ppon-note">Your browsers connect straight to each other; the code only helps them find each other. Use the same version of the game on both sides.</p>
                        </section>

                        <section class="ppon-view" data-view="host" hidden>
                            <p class="ppon-lead">Send this code to your friend:</p>
                            <div class="ppon-code" id="pponCode" aria-live="polite">· · · ·  · · · ·</div>
                            <div class="ppon-row ppon-center">
                                <button type="button" class="ppon-btn" data-ppon="copy-code">Copy code</button>
                                <button type="button" class="ppon-btn" data-ppon="copy-link">Copy invite link</button>
                            </div>
                            <p class="ppon-status" id="pponHostStatus"><span class="ppon-spin" aria-hidden="true"></span>Opening a room…</p>
                            <div class="ppon-row"><button type="button" class="ppon-btn ghost" data-ppon="cancel">Cancel</button></div>
                        </section>

                        <section class="ppon-view" data-view="join" hidden>
                            <label class="ppon-field">
                                <span>Room code</span>
                                <input id="pponJoinCode" class="ppon-code-input" type="text" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" inputmode="text">
                            </label>
                            <p class="ppon-status" id="pponJoinStatus"></p>
                            <div class="ppon-row">
                                <button type="button" class="ppon-btn ghost" data-ppon="cancel">Back</button>
                                <span class="ppon-spacer"></span>
                                <button type="button" class="ppon-btn primary" data-ppon="join">Join room</button>
                            </div>
                        </section>

                        <section class="ppon-view" data-view="ready" hidden>
                            <div class="ppon-players">
                                <div class="ppon-player left"><span class="ppon-side">Left</span><strong id="pponLeftName">Host</strong></div>
                                <div class="ppon-vs">VS</div>
                                <div class="ppon-player right"><span class="ppon-side">Right</span><strong id="pponRightName">Guest</strong></div>
                            </div>
                            <p class="ppon-series" id="pponSeries" hidden></p>
                            <p class="ppon-ping" id="pponPing"></p>
                            <div class="ppon-modes" id="pponModes" role="radiogroup" aria-label="Mode"></div>
                            <p class="ppon-note" id="pponModeNote"></p>
                            <div class="ppon-row">
                                <button type="button" class="ppon-btn ghost" data-ppon="leave">Leave room</button>
                                <span class="ppon-spacer"></span>
                                <button type="button" class="ppon-btn primary" data-ppon="start" id="pponStart">Start match</button>
                            </div>
                        </section>

                        <section class="ppon-view" data-view="error" hidden>
                            <p class="ppon-error" id="pponError" role="alert"></p>
                            <div class="ppon-row">
                                <button type="button" class="ppon-btn ghost" data-ppon="close">Close</button>
                                <span class="ppon-spacer"></span>
                                <button type="button" class="ppon-btn primary" data-ppon="retry">Try again</button>
                            </div>
                        </section>
                    </div>
                </div>`;
            window.ModeArt?.decorate(root.querySelector('.ppon-head'), 'online');
            document.body.appendChild(root);
            this.root = root;

            root.addEventListener('click', (e) => {
                if (e.target === root) return this.cancelAndClose();
                const btn = e.target.closest('[data-ppon]');
                if (btn) this.act(btn.dataset.ppon, btn);
            });
            const nameInput = root.querySelector('#pponName');
            nameInput.addEventListener('change', () => window.PPSettings?.set('playerName', cleanName(nameInput.value, '')));
            const codeInput = root.querySelector('#pponJoinCode');
            codeInput.addEventListener('input', () => {
                const c = formatCode(cleanCode(codeInput.value));
                if (codeInput.value !== c) codeInput.value = c;
                this.setStatus('pponJoinStatus', '');
            });
            codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.act('join'); } });
            window.addEventListener('keydown', (e) => {
                if (!this.isOpen()) return;
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelAndClose(); return; }
                // Keep game shortcuts (P, F, arrows…) from firing behind the dialog.
                e.stopPropagation();
            }, true);
            return root;
        },

        isOpen() { return !!this.root?.classList.contains('open'); },

        open(opts = {}) {
            this.build();
            if (opts.mode) this.startMode = ONLINE_MODES.some((m) => m.id === opts.mode) ? opts.mode : 'classic';
            if (!this.isOpen()) this.lastFocus = document.activeElement;
            this.root.querySelector('#pponName').value = window.PPSettings?.get('playerName') || '';
            this.root.classList.add('open');
            this.root.setAttribute('aria-hidden', 'false');
            document.body.classList.add('pp-online-open');
            if (opts.view) this.show(opts.view);
            else if (session && !session.closed && session.connected) this.show('ready');
            else if (opts.joinCode) {
                this.show('join');
                this.root.querySelector('#pponJoinCode').value = formatCode(cleanCode(opts.joinCode));
            } else this.show('choose');
        },

        close() {
            if (!this.root) return;
            this.root.classList.remove('open');
            this.root.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('pp-online-open');
            if (this.lastFocus && document.contains(this.lastFocus)) { try { this.lastFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
        },

        cancelAndClose() {
            if (session && !session.inMatch) session.leave();
            this.close();
        },

        show(view) {
            this.view = view;
            this.root.querySelectorAll('.ppon-view').forEach((v) => { v.hidden = v.dataset.view !== view; });
            const title = { choose: 'Play online', host: 'Your room', join: 'Join a room', ready: 'Ready to play', error: 'Online play' }[view] || 'Play online';
            this.root.querySelector('#pponTitle').textContent = title;
            const focus = { choose: '[data-ppon="create"]', host: '[data-ppon="copy-code"]', join: '#pponJoinCode', ready: '#pponStart', error: '[data-ppon="retry"]' }[view];
            requestAnimationFrame(() => {
                const el = this.root.querySelector(focus);
                if (el && !el.disabled && el.offsetParent) el.focus({ preventScroll: true });
            });
        },

        setStatus(id, text, kind = '') {
            const el = this.root?.querySelector('#' + id);
            if (!el) return;
            el.className = 'ppon-status' + (kind ? ' ' + kind : '');
            el.innerHTML = kind === 'busy' ? `<span class="ppon-spin" aria-hidden="true"></span>${esc(text)}` : esc(text);
        },

        saveName() {
            const input = this.root?.querySelector('#pponName');
            if (input) window.PPSettings?.set('playerName', cleanName(input.value, ''));
        },

        async act(action, btn, opts = {}) {
            switch (action) {
                case 'close': return this.cancelAndClose();
                case 'cancel':
                    if (session) session.leave();
                    return this.show('choose');
                case 'create': {
                    this.saveName();
                    window.game?.audio?.enable?.().catch?.(() => {});
                    if (session) session.leave();
                    const code = opts.code || randomCode();
                    const s = new Session('host', this, { keepCode: !!opts.code });
                    session = s;
                    this.lastAttempt = { action: 'create' };
                    s.mode = this.startMode;
                    this.root.querySelector('#pponCode').textContent = '· · · ·  · · · ·';
                    this.setStatus('pponHostStatus', opts.code ? 'Reopening your room…' : 'Opening a room…', 'busy');
                    this.show('host');
                    try { await s.open(code); } catch (e) { s.fail('Online play could not start: ' + e.message); }
                    return;
                }
                case 'join-view':
                    this.saveName();
                    return this.show('join');
                case 'join': {
                    const input = this.root.querySelector('#pponJoinCode');
                    const code = cleanCode(input.value);
                    if (code.length !== CODE_LENGTH) {
                        this.setStatus('pponJoinStatus', `Room codes are ${CODE_LENGTH} letters and numbers.`, 'err');
                        input.focus();
                        return;
                    }
                    const wait = opts.token ? 0 : joinWaitMs();
                    if (wait) {
                        this.setStatus('pponJoinStatus', `Too many wrong codes. Try again in ${Math.ceil(wait / 1000)} seconds.`, 'err');
                        return;
                    }
                    window.game?.audio?.enable?.().catch?.(() => {});
                    if (session) session.leave();
                    const s = new Session('guest', this, { token: opts.token });
                    session = s;
                    this.lastAttempt = { action: 'join', code };
                    this.setStatus('pponJoinStatus', opts.token ? 'Rejoining your friend…' : 'Connecting…', 'busy');
                    try { await s.open(code); } catch (e) { s.fail('Online play could not start: ' + e.message); }
                    return;
                }
                case 'copy-code': return this.copy(session?.code ? formatCode(session.code) : '', btn, 'Copied');
                case 'copy-link': {
                    if (!session?.code) return;
                    const base = location.href.replace(/[?#].*$/, '');
                    const url = `${base}?from_intro=1&join=${session.code}`;
                    // Phones: hand the link to the share sheet (messages, chat apps).
                    if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
                        try { await navigator.share({ title: 'Neon Ping Pong', text: `Play me online! Room code ${session.code}`, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
                    }
                    return this.copy(url, btn, 'Link copied');
                }
                case 'start': {
                    if (!session || session.role !== 'host' || !session.connected || session.reconnecting) return;
                    btn.disabled = true;
                    try { await session.hostStart(); } finally { btn.disabled = false; }
                    return;
                }
                case 'leave':
                    if (session) session.leave();
                    return this.show('choose');
                case 'retry': {
                    // Try the same thing again: the same room code, or a new room.
                    const last = this.lastAttempt;
                    this.lastAttempt = null;
                    if (last?.action === 'join') {
                        this.show('join');
                        this.root.querySelector('#pponJoinCode').value = formatCode(last.code);
                        return this.act('join');
                    }
                    if (last?.action === 'create') return this.act('create');
                    return this.show('choose');
                }
                case 'again': return session?.requestAgain();
            }
        },

        async copy(text, btn, done) {
            if (!text) return;
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
                ta.remove();
            }
            if (!btn) return;
            const label = btn.dataset.label || btn.textContent;
            btn.dataset.label = label;
            btn.textContent = ok ? done : 'Copy failed';
            clearTimeout(btn._t);
            btn._t = setTimeout(() => { btn.textContent = label; }, 1600);
        },

        hostWaiting(code, note = '') {
            if (!this.root) return;
            const el = this.root.querySelector('#pponCode');
            el.textContent = formatCode(code);
            el.setAttribute('aria-label', 'Room code ' + code.split('').join(' '));
            this.setStatus('pponHostStatus', note ? `${note} Your room is still open: same code.` : 'Waiting for your friend to join…', 'busy');
        },

        // Rejoin after a page reload (sessionStorage remembers the room).
        resume(rj) {
            this.open({ view: rj.role === 'host' ? 'host' : 'join' });
            if (rj.role === 'host') return this.act('create', null, { code: rj.code });
            this.root.querySelector('#pponJoinCode').value = formatCode(rj.code);
            return this.act('join', null, { token: rj.token });
        },

        connected(s) {
            if (s !== session) return;
            if (!this.isOpen() && !s.inMatch) this.open({ mode: s.mode });
            this.show('ready');
            this.renderReady(s);
        },

        renderReady(s) {
            if (!this.root || s !== session) return;
            const hostName = s.role === 'host' ? s.localName : s.remoteName;
            const guestName = s.role === 'host' ? s.remoteName : s.localName;
            this.root.querySelector('#pponLeftName').textContent = hostName + (s.role === 'host' ? ' (you)' : '');
            this.root.querySelector('#pponRightName').textContent = guestName + (s.role === 'guest' ? ' (you)' : '');
            const modes = this.root.querySelector('#pponModes');
            const isHost = s.role === 'host';
            modes.innerHTML = ONLINE_MODES.map((m) => `<button type="button" role="radio" class="ppon-mode${m.id === s.mode ? ' sel' : ''}" data-mode="${m.id}" aria-checked="${m.id === s.mode}"${isHost ? '' : ' disabled'}>${m.name}</button>`).join('');
            modes.querySelectorAll('.ppon-mode').forEach((b) => b.addEventListener('click', () => {
                if (!isHost) return;
                s.setMode(b.dataset.mode);
                this.renderReady(s);
            }));
            const pts = isHost ? s.pointsToWin() : s.remotePoints;
            const first = pts ? `First to ${pts}.` : '';
            const notes = {
                classic: `${first} Power-ups follow the host's settings.`,
                zombie: `${first} A straight duel in the graveyard: no waves, no power-ups.`,
                gravity: `${first} Black holes bend the ball across the court.`,
                speed: `${first} The ball starts fast and speeds up with every hit.`,
                obstacle: `${first} The course changes every 4 points.`,
                customise: `Uses the host's Custom setup and Forge arena.`,
            };
            let note = (notes[s.mode] || '').trim();
            if (!isHost) note = `${s.remoteName} picks the mode. ` + note;
            this.root.querySelector('#pponModeNote').textContent = note;
            const series = this.root.querySelector('#pponSeries');
            const { left, right } = s.series;
            series.hidden = left + right === 0;
            series.textContent = `Series ${left} – ${right}`;
            const start = this.root.querySelector('#pponStart');
            start.hidden = !isHost;
            start.disabled = !!s.reconnecting;
            this.updatePing(s);
        },

        // The link dropped or came back.
        linkState(s) {
            if (!this.root || s !== session) return;
            if (s.reconnecting) {
                const left = Math.max(0, Math.ceil((RECONNECT_MS - (performance.now() - (s.reconnectSince || 0))) / 1000));
                const text = s.role === 'guest'
                    ? `Connection lost · reconnecting to ${s.remoteName}… ${left}s`
                    : `Connection lost · waiting for ${s.remoteName} to reconnect… ${left}s`;
                if (s.inGame()) this.banner(text, 'warn');
                if (this.view === 'ready') {
                    this.root.querySelector('#pponPing').innerHTML = `<span class="ppon-spin" aria-hidden="true"></span>${esc(text)}`;
                    this.root.querySelector('#pponStart').disabled = true;
                }
                this.renderResults(s);
                return;
            }
            this.hideBanner();   // preStep puts "Waiting for…" back if it still applies
            if (this.view === 'ready') this.renderReady(s);
            this.renderResults(s);
        },

        // A short notice that fades by itself.
        flash(text) {
            this.banner(text, 'info');
            clearTimeout(this.flashTimer);
            this.flashTimer = setTimeout(() => {
                if (!session?.reconnecting) this.hideBanner();
            }, 2600);
        },

        // Connection quality from the round trip, how much it wobbles and
        // how much is lost. "Playable" is the normal case between countries.
        quality(s) {
            const ms = Math.round(s.rtt), jit = Math.round(s.jitter || 0), lossPct = Math.round((s.loss || 0) * 100);
            let q = 'laggy';
            if (ms < 90 && jit < 15 && lossPct < 2) q = 'great';
            else if (ms < 170 && jit < 35 && lossPct < 5) q = 'good';
            else if (ms < 300 && jit < 70 && lossPct < 10) q = 'fair';
            const bars = { great: 4, good: 3, fair: 2, laggy: 1 }[q];
            const label = { great: 'Great', good: 'Good', fair: 'Playable', laggy: 'Laggy' }[q];
            return { ms, jit, lossPct, q, bars, label };
        },

        updatePing(s) {
            if (!session || s !== session) return;
            const info = this.quality(s);
            this.pingHud(s.inGame() && s.inMatch && !s.reconnecting ? info : null);
            const el = this.root?.querySelector('#pponPing');
            if (!el || this.view !== 'ready' || s.reconnecting) return;
            const who = s.role === 'host' ? 'Connected' : `Connected · waiting for ${s.remoteName} to start`;
            const bars = [1, 2, 3, 4].map((i) => `<i class="${i <= info.bars ? 'on' : ''}"></i>`).join('');
            const bits = [`${info.ms} ms`];
            if (info.jit >= 10) bits.push(`±${info.jit}`);
            if (info.lossPct >= 2) bits.push(`${info.lossPct}% loss`);
            if (s.route) bits.push(s.route === 'relay' ? 'via relay' : 'direct');
            const tip = info.q === 'laggy' ? ' Expect some lag: a wired or closer Wi-Fi connection helps.' : '';
            el.innerHTML = `${esc(who)}<span class="ppon-quality ${info.q}" title="Round trip ${info.ms} ms${tip}"><span class="ppon-bars" aria-hidden="true">${bars}</span><b>${info.label}</b> · ${esc(bits.join(' · '))}</span>`;
        },

        // Guest: how the first connection is going.
        joinProgress(s, text) {
            if (s !== session || this.view !== 'join') return;
            this.setStatus('pponJoinStatus', text, 'busy');
        },

        // A small readout in the corner while a match is running.
        pingHud(info) {
            let el = this.hudPing;
            if (!info) { if (el) el.hidden = true; return; }
            if (!el) {
                el = this.hudPing = document.createElement('div');
                el.className = 'ppon-hudping';
                el.setAttribute('aria-hidden', 'true');
                document.body.appendChild(el);
            }
            el.hidden = false;
            el.dataset.q = info.q;
            const html = `<i></i><b>${info.ms}</b> ms${info.lossPct >= 2 ? ` · <em>${info.lossPct}% loss</em>` : ''}`;
            if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
        },

        showError(message) {
            this.build();
            if (!this.isOpen()) this.open();
            this.root.querySelector('#pponError').textContent = message;
            this.show('error');
        },

        // The other player left mid-match: back to the menu with a notice.
        showGone(message) {
            this.hideBanner();
            this.showError(message);
        },

        onSessionClosed() { this.pingHud(null); },

        banner(text, kind = 'wait') {
            if (!this.bannerEl) {
                const el = document.createElement('div');
                el.className = 'ppon-banner';
                el.setAttribute('role', 'status');
                document.body.appendChild(el);
                this.bannerEl = el;
            }
            const html = kind === 'wait' || kind === 'warn' ? `<span class="ppon-spin" aria-hidden="true"></span>${esc(text)}` : esc(text);
            if (this.bannerEl.__html !== html) { this.bannerEl.innerHTML = html; this.bannerEl.__html = html; }
            this.bannerEl.classList.toggle('warn', kind === 'warn');
            this.bannerEl.classList.add('show');
        },

        hideBanner() { this.bannerEl?.classList.remove('show'); },

        // Results card (js/ui/results-card.js): keep its status line current.
        bindResults(container) {
            this.resultsEl = container || null;
            if (session && container) this.renderResults(session);
        },

        renderResults(s) {
            const c = this.resultsEl;
            if (!c || !document.contains(c)) return;
            const status = c.querySelector('.ppon-result-status');
            const again = c.querySelector('[data-ppon="again"]');
            if (!status || !again) return;
            const lobby = c.querySelector('[data-ppon="lobby"]');
            if (s.closed) { status.textContent = `${s.remoteName} left.`; again.disabled = true; if (lobby) lobby.disabled = true; return; }
            if (lobby) lobby.disabled = !!s.reconnecting;
            if (s.reconnecting) { status.textContent = `Connection lost · reconnecting…`; again.disabled = true; return; }
            again.disabled = s.againLocal;
            if (s.againLocal && !s.againRemote) status.textContent = `Waiting for ${s.remoteName}…`;
            else if (!s.againLocal && s.againRemote) { status.textContent = `${s.remoteName} wants a rematch!`; again.textContent = 'Accept rematch'; }
            else if (s.againLocal && s.againRemote) status.textContent = s.role === 'host' ? 'Starting…' : `Waiting for ${s.remoteName} to start…`;
            else status.textContent = '';
        },
    };

    // ── Entry points: match setup dialog, Custom screen, invite links ──
    const MODE_BY_TITLE = { CLASSIC: 'classic', ZOMBIE: 'zombie', GRAVITY: 'gravity', SPEED: 'speed', OBSTACLE: 'obstacle', CUSTOM: 'customise' };

    function modalMode() {
        const t = (document.getElementById('mTitle')?.textContent || '').replace(/^START\s+/i, '').trim().toUpperCase();
        return MODE_BY_TITLE[t] || 'classic';
    }

    function hookEntryPoints() {
        // "ONLINE" in the opponent dialog: PLAY opens the lobby instead of a local match.
        document.addEventListener('click', (e) => {
            const go = e.target.closest?.('#btnGo');
            if (!go) return;
            const sel = document.querySelector('#modal .opt.sel');
            if (!sel || sel.dataset.mp !== 'online') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const modal = document.getElementById('modal');
            if (modal) { modal.classList.remove('on'); setTimeout(() => { modal.style.display = 'none'; }, 320); }
            ui.open({ mode: modalMode() });
        }, true);

        // Custom screen: play this setup online.
        const actions = document.querySelector('#customiseOverlay .customise-actions');
        if (actions && !actions.querySelector('.customise-online-btn')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'customise-online-btn';
            b.innerHTML = '<svg class="btn-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c-5 5-7 11-7 17s2 12 7 17M24 7c5 5 7 11 7 17s-2 12-7 17"/></g></svg> Play online';
            b.addEventListener('click', () => {
                window.__ppSyncCustomSettingsFromControls?.();
                window.game?.saveCustomSettings?.();
                ui.open({ mode: 'customise' });
            });
            const start = actions.querySelector('#customStartMatchBtn');
            if (start) start.after(b); else actions.prepend(b);
        }

        // Back from a reload while in a room: get straight back in.
        const rj = readRejoin();
        if (window.PP_JOIN_CODE) {
            const code = cleanCode(window.PP_JOIN_CODE);
            window.PP_JOIN_CODE = '';
            if (rj && rj.role === 'guest' && rj.code === code) setTimeout(() => ui.resume(rj), 600);
            else setTimeout(() => ui.open({ joinCode: code }), 600);
        } else if (rj) {
            setTimeout(() => ui.resume(rj), 600);
        }

        // Tab hidden mid-match: pause both sides (the browser stops our loop
        // anyway) and tell the other side our timers will crawl.
        let unloading = false;
        window.addEventListener('pagehide', () => { unloading = true; });
        window.addEventListener('pageshow', () => { unloading = false; });
        // Phones hop between Wi-Fi and mobile data; pick the link back up fast.
        const netChanged = () => session?.onNetworkChange();
        window.addEventListener('online', netChanged);
        navigator.connection?.addEventListener?.('change', netChanged);

        document.addEventListener('visibilitychange', () => {
            if (unloading) return;   // reloading: the other side keeps the match for us
            const g = window.game;
            if (document.hidden && g?.net && g.running && !g.userPaused && !g.introActive) g.setUserPaused(true);
            session?.send({ t: 'hidden', on: document.hidden });
        });
    }

    window.PPOnline = {
        open: (opts) => ui.open(opts),
        get session() { return session; },
        modes: ONLINE_MODES.map((m) => m.id),
        bindResults: (el) => ui.bindResults(el),
        _ui: ui,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookEntryPoints);
    else hookEntryPoints();
})();
