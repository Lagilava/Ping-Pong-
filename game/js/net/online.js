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

    const PROTOCOL = 1;
    const ID_PREFIX = 'neon-pingpong-v1-';
    const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const CODE_LENGTH = 5;
    const ONLINE_MODES = [
        { id: 'classic', name: 'Classic' },
        { id: 'gravity', name: 'Gravity' },
        { id: 'obstacle', name: 'Obstacle' },
        { id: 'customise', name: 'Custom' },
    ];
    const SNAPSHOT_HZ = 40;
    const INPUT_HZ = 60;
    const LINK_TIMEOUT_MS = 7000;   // no message for this long: connection lost
    const CONNECT_TIMEOUT_MS = 15000;

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

    function cleanCode(text) {
        const up = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return up.replace(/O/g, '0').replace(/I|L/g, '1').split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);
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

    function peerOptions() {
        // Tests point this at a local PeerServer; players use the public one.
        const o = window.PP_PEER_OPTIONS;
        return o && typeof o === 'object' ? { ...o } : {};
    }

    // ── Session ────────────────────────────────────────────────────────
    let session = null;

    class Session {
        constructor(role, ui) {
            this.role = role;               // 'host' | 'guest'
            this.ui = ui;
            this.peer = null;
            this.conn = null;
            this.code = '';
            this.closed = false;
            this.connected = false;
            this.localName = cleanName(window.PPSettings?.get('playerName'), role === 'host' ? 'Host' : 'Guest');
            this.remoteName = role === 'host' ? 'Guest' : 'Host';
            this.mode = 'classic';
            this.rtt = 80;
            this.lastHeard = 0;
            this.timers = [];
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
        localSide() { return this.role === 'host' ? 'left' : 'right'; }

        // ── Connection ─────────────────────────────────────────────────
        async open(code) {
            const Peer = await loadPeerLib();
            if (this.closed) return;
            this.code = code;
            const id = this.role === 'host' ? ID_PREFIX + code : undefined;
            const peer = new Peer(id, { debug: 0, ...peerOptions() });
            this.peer = peer;
            peer.on('error', (err) => this.onPeerError(err));
            peer.on('disconnected', () => {
                // Lost the broker. A live match keeps going over the direct link.
                if (!this.closed && !this.connected) { try { peer.reconnect(); } catch (_) { /* ignore */ } }
            });
            if (this.role === 'host') {
                peer.on('open', () => this.ui.hostWaiting(code));
                peer.on('connection', (conn) => {
                    if (this.conn) { try { conn.close(); } catch (_) { /* ignore */ } return; }   // room full
                    this.attach(conn);
                });
            } else {
                peer.on('open', () => {
                    const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
                    this.attach(conn);
                    this.connectTimer = setTimeout(() => {
                        if (!this.connected && !this.closed) this.fail('Could not reach that room. Check the code, and that your friend still has the room open.');
                    }, CONNECT_TIMEOUT_MS);
                });
            }
        }

        onPeerError(err) {
            if (this.closed) return;
            const type = err?.type || '';
            if (type === 'unavailable-id') {
                // Code already taken (very unlikely): try another.
                try { this.peer.destroy(); } catch (_) { /* ignore */ }
                this.peer = null;
                this.open(randomCode()).catch((e) => this.fail(e.message));
                return;
            }
            if (type === 'peer-unavailable') return this.fail('No room with that code. Check the code with your friend.');
            if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                if (this.connected) return;   // the direct link may still be fine
                return this.fail('Could not reach the online service. Check your internet connection and try again.');
            }
            if (type === 'browser-incompatible') return this.fail('This browser does not support online play. Try an up-to-date Chrome, Edge, Firefox or Safari.');
            if (!this.connected) this.fail('Connection failed (' + (type || 'unknown') + '). Try again.');
        }

        attach(conn) {
            this.conn = conn;
            conn.on('open', () => {
                clearTimeout(this.connectTimer);
                this.connected = true;
                this.lastHeard = performance.now();
                this.send({ t: 'hello', v: PROTOCOL, name: this.localName, paddles: window.PPSettings?.get('paddles') || null });
                this.timers.push(setInterval(() => this.heartbeat(), 1000));
                // Keep the other side up to date if paddle designs change in the lobby.
                this.offPaddles = window.PPSettings?.on?.((key) => {
                    if ((key === 'paddles' || key === '*') && this.connected) this.send({ t: 'paddles', paddles: window.PPSettings.get('paddles') });
                });
            });
            conn.on('data', (msg) => {
                this.lastHeard = performance.now();
                try { this.onMessage(msg); } catch (e) { console.error('[Online]', e); }
            });
            conn.on('close', () => this.lost());
            conn.on('error', () => this.lost());
            const pc = conn.peerConnection;
            if (pc) {
                pc.addEventListener?.('iceconnectionstatechange', () => {
                    if (pc.iceConnectionState === 'failed') {
                        if (!this.connected) this.fail('Could not connect directly to your friend. One of your networks blocks peer-to-peer games; try another network (a phone hotspot often works).');
                        else this.lost();
                    }
                });
            }
        }

        send(msg) {
            if (!this.conn || !this.conn.open) return;
            try { this.conn.send(msg); } catch (_) { /* channel closing */ }
        }

        heartbeat() {
            if (this.closed) return;
            this.send({ t: 'ping', ts: performance.now() });
            if (this.connected && performance.now() - this.lastHeard > LINK_TIMEOUT_MS) this.lost();
            this.ui.updatePing(this.rtt);
        }

        fail(message) {
            if (this.closed) return;
            this.ui.showError(message);
            this.close(false);
        }

        lost() {
            if (this.closed) return;
            const wasInMatch = this.inMatch || this.game?.net === this;
            const name = this.remoteName;
            this.close(false);
            if (wasInMatch) this.ui.showGone(`${name} left or the connection dropped.`);
            else this.ui.showError(`${name} left the room.`);
        }

        leave() {
            if (this.closed) return;
            this.send({ t: 'bye' });
            this.close(true);
        }

        close(silent) {
            if (this.closed) return;
            this.closed = true;
            clearTimeout(this.connectTimer);
            this.timers.forEach((t) => clearInterval(t));
            this.timers = [];
            this.offPaddles?.();
            const g = this.game;
            if (g && g.net === this) this.detachFromGame(!silent);
            setTimeout(() => {
                try { this.conn?.close(); } catch (_) { /* ignore */ }
                try { this.peer?.destroy(); } catch (_) { /* ignore */ }
            }, 120);
            if (session === this) session = null;
            this.ui.onSessionClosed(this);
        }

        // ── Messages ───────────────────────────────────────────────────
        onMessage(msg) {
            if (!msg || typeof msg !== 'object') return;
            switch (msg.t) {
                case 'hello':
                    if (msg.v !== PROTOCOL) return this.fail('Your friend is on a different version of the game. Both of you reload the page and try again.');
                    this.remoteName = cleanName(msg.name, this.role === 'host' ? 'Guest' : 'Host');
                    this.remotePaddles = msg.paddles && typeof msg.paddles === 'object' ? msg.paddles : null;
                    this.ui.connected(this);
                    return;
                case 'paddles':
                    this.remotePaddles = msg.paddles && typeof msg.paddles === 'object' ? msg.paddles : null;
                    return;
                case 'ping': return this.send({ t: 'pong', ts: msg.ts });
                case 'pong': {
                    const sample = performance.now() - num(msg.ts, performance.now());
                    if (sample >= 0 && sample < 5000) this.rtt = this.rtt * 0.7 + sample * 0.3;
                    return;
                }
                case 'bye': {
                    const name = this.remoteName;
                    const inMatch = this.game?.net === this;
                    this.close(false);
                    if (inMatch) this.ui.showGone(`${name} left the match.`);
                    else this.ui.showError(`${name} left the room.`);
                    return;
                }
                case 'mode':
                    if (this.role === 'guest') { this.mode = msg.mode; this.ui.renderReady(this); }
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
                case 'world': return this.role === 'guest' && this.applyWorld(msg.w, msg.h);
            }
        }

        // ── Starting a match ───────────────────────────────────────────
        setMode(mode) {
            if (!ONLINE_MODES.some((m) => m.id === mode)) mode = 'classic';
            this.mode = mode;
            this.send({ t: 'mode', mode });
        }

        async hostStart() {
            const g = this.game;
            if (!g || this.role !== 'host' || !this.connected) return;
            this.resetMatchFlags();
            // Each side shows the design its own player picked for this mode.
            const mine = window.PPSettings?.getPaddle?.(this.mode, 'left') || 'classic';
            this.paddleDesigns = { left: mine, right: cleanDesign(this.remotePaddles?.[this.mode]?.left) };
            await launchMatch(this, this.mode);
            const msg = {
                t: 'start', mode: this.mode, maxScore: g.maxScore,
                world: { w: g.width, h: g.height },
                names: { left: this.localName, right: this.remoteName },
                paddles: this.paddleDesigns,
            };
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
            this.send(msg);
        }

        async guestStart(msg) {
            const g = this.game;
            if (!g) return;
            const mode = ONLINE_MODES.some((m) => m.id === msg.mode) ? msg.mode : 'classic';
            this.mode = mode;
            this.resetMatchFlags();
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
            g.maxScore = clamp(Math.round(num(msg.maxScore, 11)), 1, 99);
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
            const age = (performance.now() - r.at) / 1000;
            const lead = clamp(age + this.oneWay * 0.5, 0, 0.12);
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
            this.send({ t: 'in', y: round1(p.pos.y), vy: round1(p.vel.y) });
        }

        onRemoteInput(msg) {
            if (!Number.isFinite(msg.y)) return;
            this.remotePaddle = { y: msg.y, vy: num(msg.vy), at: performance.now() };
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
            this.send({ t: 'hit', b: [round1(ball.pos.x), round1(ball.pos.y), round1(ball.vel.x), round1(ball.vel.y), Math.round((ball.spin || 0) * 100) / 100] });
        }

        onRemoteHit(msg) {
            const g = this.game;
            if (!g || g.net !== this || !Array.isArray(msg.b) || g.matchEnding) return;
            const ball = g.ball;
            // Already coming back (the host saw the hit too) or already scored.
            if (ball.vel.x <= 0 || ball.pos.x > g.width + 40) return;
            const [x, y, vx, vy, spin] = msg.b.map((v) => num(v));
            const lat = this.oneWay;
            let ny = y + vy * lat, nvy = vy;
            if (ny < ball.r) { ny = ball.r + (ball.r - ny); nvy = Math.abs(nvy); }
            if (ny > g.height - ball.r) { ny = g.height - ball.r - (ny - (g.height - ball.r)); nvy = -Math.abs(nvy); }
            ball.pos.set(Math.min(x + vx * lat, g.aiPaddle.pos.x - ball.r - 1), clamp(ny, ball.r, g.height - ball.r));
            ball.prev?.set(ball.pos.x, ball.pos.y);
            ball.vel.set(vx, nvy);
            ball.spin = spin;
            ball.lastHit = 'ai';
            ball.lastImpact = clamp(Math.hypot(vx, vy) / 1400, 0, 1);
            g.gravitySlingshot?.onPaddleHit?.();
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
            return Math.min(600, Math.abs(ball.vel.x) * (this.oneWay * 2 + 0.03));
        }

        // ── Host → guest state ─────────────────────────────────────────
        sendSnapshot() {
            const g = this.game;
            if (!g || !g.ball) return;
            const b = g.ball;
            const ballArr = (x) => [round1(x.pos.x), round1(x.pos.y), round1(x.vel.x), round1(x.vel.y), round1(x.r), Math.round((x.spin || 0) * 100) / 100];
            const s = {
                t: 's',
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
            const ar = g.obstacleArcade;
            if (ar && (g.gameMode === 'obstacle' || ar.fixedLayout)) {
                s.ar = [ar.wallet.player, ar.wallet.ai, round1(ar.starTime), round1(ar.boostTime),
                    ar.coins.map((c) => (c.alive ? 1 : 0)).join(''), ar.blocks.map((k) => (k.used ? 1 : 0)).join('')];
            }
            this.send(s);
        }

        applySnapshot(s) {
            const g = this.game;
            if (!g || g.net !== this || !g.ball || !Array.isArray(s.b)) return;
            const first = !this.gotSnapshot;
            this.gotSnapshot = true;
            if (first) this.ui.hideBanner();
            const lat = this.oneWay;

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
                const trustLocal = sinceHit < Math.min(450, this.rtt + 150) && bvx > 0 && ball.vel.x < 0;
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
                this.remotePaddle = { y: num(s.L[0]), vy: num(s.L[1]), at: performance.now() };
                this.setPaddleHeight(g.player, num(s.L[2], g.player.h));
                if (s.L[3] && !g.player.laserStunned) { g.player.laserStunned = true; g.player.laserStunTime = Math.max(g.player.laserStunTime || 0, 0.3); }
                if (first) g.player.pos.y = num(s.L[0], g.player.pos.y);
            }
            if (Array.isArray(s.R)) this.setPaddleHeight(g.aiPaddle, num(s.R[0], g.aiPaddle.h));

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
            this.send({ t: 'pause', on: !!paused });
            this.ui.hideBanner();
        }

        onRemotePause(on) {
            const g = this.game;
            if (!g || g.net !== this) return;
            this.applyingRemote = true;
            try { g.setUserPaused(on); } finally { this.applyingRemote = false; }
            if (on) this.ui.banner(`${this.remoteName} paused the game`, 'info');
            else this.ui.hideBanner();
        }

        onMatchEnd(leftWon) {
            if (this.role !== 'host') return;
            const g = this.game;
            this.send({ t: 'end', leftWon: !!leftWon, sc: [g.scores.player, g.scores.ai] });
        }

        onEnd(msg) {
            const g = this.game;
            if (!g || g.net !== this) return;
            if (Array.isArray(msg.sc)) { g.scores.player = num(msg.sc[0]); g.scores.ai = num(msg.sc[1]); }
            g.finishMatch(!!msg.leftWon);
        }

        requestAgain() {
            this.againLocal = true;
            this.send({ t: 'again' });
            this.ui.renderResults(this);
            if (this.role === 'host' && this.againRemote) this.hostStart();
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
            return {
                kicker: `Online · ${modeName(this.mode)} · match over`,
                title: youWon ? 'You win!' : `${this.remoteName} wins`,
                tone: youWon ? 'win' : 'loss',
                left, right, lines,
                actions: [
                    { label: 'Play again', primary: true, data: 'again', onClick: () => { if (session === this) this.requestAgain(); } },
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
                            <div class="ppon-code" id="pponCode" aria-live="polite">· · · · ·</div>
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
                                <input id="pponJoinCode" class="ppon-code-input" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" inputmode="text">
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
                const c = cleanCode(codeInput.value);
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
            this.startMode = ONLINE_MODES.some((m) => m.id === opts.mode) ? opts.mode : 'classic';
            this.lastFocus = document.activeElement;
            this.root.querySelector('#pponName').value = window.PPSettings?.get('playerName') || '';
            this.root.classList.add('open');
            this.root.setAttribute('aria-hidden', 'false');
            document.body.classList.add('pp-online-open');
            if (session && !session.closed && session.connected) this.show('ready');
            else if (opts.joinCode) {
                this.show('join');
                this.root.querySelector('#pponJoinCode').value = cleanCode(opts.joinCode);
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

        async act(action, btn) {
            switch (action) {
                case 'close': return this.cancelAndClose();
                case 'cancel':
                    if (session) session.leave();
                    return this.show('choose');
                case 'create': {
                    this.saveName();
                    window.game?.audio?.enable?.().catch?.(() => {});
                    if (session) session.leave();
                    const s = new Session('host', this);
                    session = s;
                    s.mode = this.startMode;
                    this.root.querySelector('#pponCode').textContent = '· · · · ·';
                    this.setStatus('pponHostStatus', 'Opening a room…', 'busy');
                    this.show('host');
                    try { await s.open(randomCode()); } catch (e) { s.fail('Online play could not start: ' + e.message); }
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
                    window.game?.audio?.enable?.().catch?.(() => {});
                    if (session) session.leave();
                    const s = new Session('guest', this);
                    session = s;
                    this.setStatus('pponJoinStatus', 'Connecting…', 'busy');
                    try { await s.open(code); } catch (e) { s.fail('Online play could not start: ' + e.message); }
                    return;
                }
                case 'copy-code': return this.copy(session?.code || '', btn, 'Copied');
                case 'copy-link': {
                    const base = location.href.replace(/[?#].*$/, '');
                    return this.copy(`${base}?from_intro=1&join=${session?.code || ''}`, btn, 'Link copied');
                }
                case 'start': {
                    if (!session || session.role !== 'host' || !session.connected) return;
                    btn.disabled = true;
                    try { await session.hostStart(); } finally { btn.disabled = false; }
                    return;
                }
                case 'leave':
                    if (session) session.leave();
                    return this.show('choose');
                case 'retry': return this.show('choose');
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

        hostWaiting(code) {
            if (!this.root) return;
            const el = this.root.querySelector('#pponCode');
            el.textContent = code.split('').join(' ');
            el.setAttribute('aria-label', 'Room code ' + code.split('').join(' '));
            this.setStatus('pponHostStatus', 'Waiting for your friend to join…', 'busy');
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
            const pts = window.PPSettings?.get('pointsToWin') || 11;
            const notes = {
                classic: `First to ${pts} points. Power-ups follow the host's settings.`,
                gravity: `First to ${pts}. Black holes bend the ball; slingshots score extra.`,
                obstacle: `First to ${pts}. The course changes every 4 points.`,
                customise: `Uses the host's Custom setup and Forge arena.`,
            };
            let note = notes[s.mode] || '';
            if (isHost) note += ' Zombie and Speed are single-screen modes and stay offline.';
            else note = `${esc(s.remoteName)} picks the mode. ` + note;
            this.root.querySelector('#pponModeNote').innerHTML = note;
            const start = this.root.querySelector('#pponStart');
            start.hidden = !isHost;
            this.updatePing(s.rtt);
            if (!isHost) this.root.querySelector('#pponPing').textContent = `Connected · waiting for ${s.remoteName} to start`;
        },

        updatePing(rtt) {
            const el = this.root?.querySelector('#pponPing');
            if (!el || !session || this.view !== 'ready') return;
            const ms = Math.round(rtt);
            const q = ms < 70 ? 'great' : ms < 140 ? 'good' : 'laggy';
            const who = session.role === 'host' ? 'Connected' : `Connected · waiting for ${session.remoteName} to start`;
            el.innerHTML = `${esc(who)} · <span class="ppon-q ${q}">${ms} ms ${q}</span>`;
            const hud = document.getElementById('pponHudPing');
            if (hud) hud.textContent = `${ms} ms`;
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

        onSessionClosed() { /* views are switched by the caller */ },

        banner(text, kind = 'wait') {
            if (!this.bannerEl) {
                const el = document.createElement('div');
                el.className = 'ppon-banner';
                el.setAttribute('role', 'status');
                document.body.appendChild(el);
                this.bannerEl = el;
            }
            const html = kind === 'wait' ? `<span class="ppon-spin" aria-hidden="true"></span>${esc(text)}` : esc(text);
            if (this.bannerEl.__html !== html) { this.bannerEl.innerHTML = html; this.bannerEl.__html = html; }
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
            if (s.closed) { status.textContent = `${s.remoteName} left.`; again.disabled = true; return; }
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

        if (window.PP_JOIN_CODE) {
            const code = window.PP_JOIN_CODE;
            window.PP_JOIN_CODE = '';
            setTimeout(() => ui.open({ joinCode: code }), 600);
        }

        // Tab hidden mid-match: pause both sides (the browser stops our loop anyway).
        document.addEventListener('visibilitychange', () => {
            const g = window.game;
            if (document.hidden && g?.net && g.running && !g.userPaused && !g.introActive) g.setUserPaused(true);
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
