// Backup matchmaking for online play.
//
// PeerJS normally finds the other player through its free public broker,
// 0.peerjs.com. That broker is a donation-run service with no uptime promise:
// at times it takes minutes to answer, refuses connections, or is blocked on a
// school or office network. When that happens nobody can join a room.
//
// This file gives PeerJS more than one way to pass its handshake messages
// (OFFER / ANSWER / CANDIDATE). Every message goes out through the PeerJS
// broker AND a few free public MQTT brokers at once; whichever copy arrives
// first is used and the rest are dropped. One working service is enough.
// After the handshake the two browsers talk directly, exactly as before; the
// brokers never see the game.
//
// The MQTT brokers are public, so anything sent there is end-to-end encrypted
// (AES-GCM, key derived from the receiver's peer id, which only the two
// players know) and published on a hashed topic.
(function () {
    'use strict';

    const TOPIC_ROOT = 'ppneon/s1/';
    const BROKER_GRACE_MS = 2500;     // wait this long for 0.peerjs.com before going on without it
    const START_TIMEOUT_MS = 20000;   // nothing reachable by then: report an error
    const ALL_DOWN_MS = 8000;         // after opening, every service gone this long: "disconnected"
    const EXPIRE_HOLD_MS = 6000;      // a "no such peer" from one broker waits for the others
    const NO_REPLY_EXPIRE_MS = 12000; // relays only: no answer to an offer by then means no such room
    const MQTT_KEEPALIVE_S = 30;
    const MQTT_CONNECT_TIMEOUT_MS = 8000;

    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const now = () => Date.now();
    const hasCrypto = !!(window.crypto && crypto.subtle && window.isSecureContext !== false);

    function randomId(n = 12) {
        const b = new Uint8Array(n);
        crypto.getRandomValues(b);
        return Array.from(b, (x) => (x % 36).toString(36)).join('');
    }

    // ── Keys and topics ───────────────────────────────────────────────
    const keyCache = new Map();
    const topicCache = new Map();
    async function topicFor(id) {
        if (topicCache.has(id)) return topicCache.get(id);
        const p = crypto.subtle.digest('SHA-256', enc.encode('pp-topic|' + id)).then((h) =>
            TOPIC_ROOT + Array.from(new Uint8Array(h).slice(0, 20), (x) => x.toString(16).padStart(2, '0')).join(''));
        topicCache.set(id, p);
        return p;
    }
    function keyFor(id) {
        if (keyCache.has(id)) return keyCache.get(id);
        const p = crypto.subtle.importKey('raw', enc.encode(id), 'PBKDF2', false, ['deriveKey'])
            .then((base) => crypto.subtle.deriveKey(
                { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('pp-neon-signal-v1'), iterations: 20000 },
                base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
        keyCache.set(id, p);
        if (keyCache.size > 32) keyCache.delete(keyCache.keys().next().value);
        return p;
    }
    async function seal(id, obj) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(id), enc.encode(JSON.stringify(obj)));
        const out = new Uint8Array(12 + ct.byteLength);
        out.set(iv, 0);
        out.set(new Uint8Array(ct), 12);
        return out;
    }
    async function open(id, bytes) {
        if (bytes.length < 29) return null;
        try {
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await keyFor(id), bytes.subarray(12));
            return JSON.parse(dec.decode(pt));
        } catch (_) { return null; }
    }

    // ── Minimal MQTT 3.1.1 client over WebSocket (QoS 0 only) ──────────
    function mqttString(s) {
        const b = enc.encode(s);
        return [b.length >> 8, b.length & 255, ...b];
    }
    function mqttPacket(type, body) {
        const len = [];
        let n = body.length;
        do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
        const out = new Uint8Array(1 + len.length + body.length);
        out[0] = type;
        out.set(len, 1);
        out.set(body, 1 + len.length);
        return out;
    }

    class MqttRelay {
        constructor(url) {
            this.url = url;
            this.ws = null;
            this.ready = false;
            this.failed = false;      // tried and could not get in (yet)
            this.tries = 0;
            this.topic = '';
            this.queue = [];
            this.buf = new Uint8Array(0);
            this.onMessage = null;
            this.onState = null;
        }

        start(topic, onMessage, onState) {
            this.stop();
            this.running = true;
            this.topic = topic;
            this.onMessage = onMessage;
            this.onState = onState;
            this.connect();
        }

        connect() {
            if (!this.running) return;
            let ws;
            try { ws = new WebSocket(this.url, ['mqtt']); } catch (_) { this.lost(); return; }
            this.ws = ws;
            this.buf = new Uint8Array(0);
            ws.binaryType = 'arraybuffer';
            this.connectTimer = setTimeout(() => { if (!this.ready) this.lost(); }, MQTT_CONNECT_TIMEOUT_MS);
            ws.onopen = () => {
                const flags = 0x02;   // clean session
                const body = [...mqttString('MQTT'), 4, flags, 0, MQTT_KEEPALIVE_S, ...mqttString('pp' + randomId(16))];
                this.raw(mqttPacket(0x10, body));
            };
            ws.onmessage = (e) => this.data(new Uint8Array(e.data));
            ws.onerror = () => this.lost();
            ws.onclose = () => this.lost();
        }

        raw(bytes) {
            try { if (this.ws && this.ws.readyState === 1) { this.ws.send(bytes); return true; } } catch (_) { /* closing */ }
            return false;
        }

        data(chunk) {
            const b = new Uint8Array(this.buf.length + chunk.length);
            b.set(this.buf, 0);
            b.set(chunk, this.buf.length);
            let i = 0;
            while (i < b.length) {
                let mul = 1, len = 0, j = i + 1, d;
                do {
                    if (j >= b.length) { this.buf = b.slice(i); return; }
                    d = b[j++];
                    len += (d & 127) * mul;
                    mul *= 128;
                } while (d & 128 && mul < 268435456);
                if (j + len > b.length) { this.buf = b.slice(i); return; }
                this.packet(b[i], b.subarray(j, j + len));
                i = j + len;
            }
            this.buf = new Uint8Array(0);
        }

        packet(head, body) {
            const type = head >> 4;
            if (type === 2) {           // CONNACK
                if (body[1] !== 0) { this.lost(); return; }
                this.raw(mqttPacket(0x82, [0, 1, ...mqttString(this.topic), 0]));
            } else if (type === 9) {    // SUBACK
                if (body[2] === 0x80) { this.lost(); return; }
                clearTimeout(this.connectTimer);
                this.ready = true;
                this.failed = false;
                this.tries = 0;
                clearInterval(this.pingTimer);
                this.pingTimer = setInterval(() => this.raw(new Uint8Array([0xc0, 0])), (MQTT_KEEPALIVE_S - 8) * 1000);
                const q = this.queue;
                this.queue = [];
                for (const [topic, payload] of q) this.publish(topic, payload);
                this.onState?.();
            } else if (type === 3) {    // PUBLISH
                const tlen = (body[0] << 8) | body[1];
                const qos = (head >> 1) & 3;
                const start = 2 + tlen + (qos ? 2 : 0);
                const topic = dec.decode(body.subarray(2, 2 + tlen));
                if (topic === this.topic) this.onMessage?.(body.slice(start));
            }
        }

        publish(topic, payload) {
            if (!this.ready) {
                if (this.running) {
                    this.queue.push([topic, payload]);
                    if (this.queue.length > 60) this.queue.shift();
                }
                return;
            }
            this.raw(mqttPacket(0x30, [...mqttString(topic), ...payload]));
        }

        lost() {
            clearTimeout(this.connectTimer);
            clearInterval(this.pingTimer);
            const ws = this.ws;
            this.ws = null;
            if (ws) {
                ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
                try { ws.close(); } catch (_) { /* ignore */ }
            }
            const was = this.ready;
            this.ready = false;
            if (!this.running) return;
            this.failed = true;
            this.tries++;
            clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => this.connect(), Math.min(30000, 1500 * 2 ** Math.min(this.tries - 1, 5)));
            if (was || this.tries === 1) this.onState?.();
        }

        stop() {
            this.running = false;
            clearTimeout(this.retryTimer);
            if (this.ws && this.ready) this.raw(new Uint8Array([0xe0, 0]));
            this.lost();
            this.failed = false;
            this.tries = 0;
            this.queue = [];
        }
    }

    // ── The socket PeerJS talks to ────────────────────────────────────
    // Looks like PeerJS's own server socket (start / send / close plus
    // message, error, disconnected events) but fans out to every service.
    class SignalHub {
        constructor(broker, relayUrls) {
            this.broker = broker;                     // PeerJS's own socket to 0.peerjs.com (or the configured PeerServer)
            this.relays = hasCrypto ? relayUrls.map((u) => new MqttRelay(u)) : [];
            this.listeners = {};
            this.running = false;
            this.seen = new Set();
            this.heard = new Map();                   // peer id -> last time a message came from it
            this.offered = new Map();                 // peer id -> when we first sent it an offer
            this.chain = Promise.resolve();
        }

        on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
        emit(ev, ...a) { for (const fn of (this.listeners[ev] || []).slice()) fn(...a); }
        removeAllListeners() { this.listeners = {}; return this; }

        // Which services are up, for the lobby and for tests.
        status() {
            return {
                broker: this.brokerUp,
                relays: this.relays.map((r) => ({ url: r.url, up: r.ready })),
            };
        }

        start(id, token) {
            this.close();
            this.running = true;
            this.id = id;
            this.opened = false;
            this.brokerUp = false;
            this.brokerFailed = false;
            this.startedAt = now();
            this.allDownSince = 0;
            const b = this.broker;
            b.removeAllListeners();
            b.on('message', (m) => this.fromBroker(m));
            b.on('disconnected', () => this.brokerLost());
            b.on('close', () => this.brokerLost());
            b.on('error', () => this.brokerLost());
            this.token = token;
            this.startBroker();
            if (this.relays.length) {
                topicFor(id).then((topic) => {
                    if (!this.running || this.id !== id) return;
                    this.topic = topic;
                    for (const r of this.relays) r.start(topic, (bytes) => this.fromRelay(bytes), () => this.relayState());
                });
            }
            this.timers = [
                setTimeout(() => this.maybeOpen(true), BROKER_GRACE_MS),
                setTimeout(() => {
                    if (this.running && !this.opened) this.emit('error', 'Could not reach any matchmaking service.');
                }, START_TIMEOUT_MS),
            ];
        }

        startBroker() {
            if (!this.running) return;
            try { this.broker.start(this.id, this.token); } catch (_) { this.brokerLost(); }
        }

        brokerLost() {
            if (!this.running) return;
            this.brokerUp = false;
            this.brokerFailed = true;
            this.brokerTries = (this.brokerTries || 0) + 1;
            clearTimeout(this.brokerTimer);
            this.brokerTimer = setTimeout(() => {
                try { this.broker.close(); } catch (_) { /* ignore */ }
                this.startBroker();
            }, Math.min(30000, 2000 * 2 ** Math.min(this.brokerTries - 1, 4)));
            this.maybeOpen(false);
            this.checkAllDown();
        }

        relayState() {
            this.maybeOpen(false);
            this.checkAllDown();
        }

        anyUp() { return this.brokerUp || this.relays.some((r) => r.ready); }

        maybeOpen(graceOver) {
            if (!this.running || this.opened) return;
            const relayUp = this.relays.some((r) => r.ready);
            if (this.brokerUp || (relayUp && (graceOver || this.brokerFailed || now() - this.startedAt >= BROKER_GRACE_MS))) {
                this.opened = true;
                this.emit('message', { type: 'OPEN' });
            }
        }

        checkAllDown() {
            if (!this.running || !this.opened) return;
            if (this.anyUp()) { this.allDownSince = 0; clearTimeout(this.downTimer); return; }
            if (this.allDownSince) return;
            this.allDownSince = now();
            clearTimeout(this.downTimer);
            this.downTimer = setTimeout(() => {
                if (this.running && this.opened && !this.anyUp()) this.emit('disconnected');
            }, ALL_DOWN_MS);
        }

        fromBroker(m) {
            if (!m || typeof m !== 'object') return;
            switch (m.type) {
                case 'OPEN':
                    this.brokerUp = true;
                    this.brokerFailed = false;
                    this.brokerTries = 0;
                    this.checkAllDown();
                    if (!this.opened) this.maybeOpen(false);
                    return;
                case 'HEARTBEAT':
                    return;
                case 'ID-TAKEN':
                case 'INVALID-KEY':
                    this.emit('message', m);
                    return;
                case 'ERROR':
                    // The broker refused us (overloaded, rate limited…). The
                    // relays may still work; only report it if there are none.
                    if (!this.relays.length) { this.emit('message', m); return; }
                    try { this.broker.close(); } catch (_) { /* ignore */ }
                    this.brokerLost();
                    return;
                case 'EXPIRE': {
                    // "That peer isn't on this broker." It may be on a relay.
                    const peer = m.src;
                    if (!this.relays.some((r) => r.ready)) { this.emit('message', m); return; }
                    const asked = now();
                    this.timers.push(setTimeout(() => {
                        if (this.running && (this.heard.get(peer) || 0) < asked - 10000) this.emit('message', m);
                    }, EXPIRE_HOLD_MS));
                    return;
                }
                default:
                    this.deliver(m);
            }
        }

        fromRelay(bytes) {
            const id = this.id;
            this.chain = this.chain.then(async () => {
                const m = await open(id, bytes);
                if (!m || !this.running || this.id !== id || m.dst !== id || typeof m.type !== 'string' || typeof m.src !== 'string') return;
                if (m.type === 'OPEN' || m.type === 'ID-TAKEN' || m.type === 'ERROR' || m.type === 'EXPIRE' || m.type === 'HEARTBEAT') return;
                this.deliver(m);
            }).catch(() => {});
        }

        deliver(m) {
            const key = m.payload && m.payload._pm;
            if (key) {
                if (this.seen.has(key)) return;
                this.seen.add(key);
                if (this.seen.size > 600) this.seen.delete(this.seen.values().next().value);
            }
            if (m.src) this.heard.set(m.src, now());
            this.emit('message', m);
        }

        send(m) {
            if (!this.running || !m || !m.type || m.type === 'HEARTBEAT') return;
            const msg = { ...m, payload: { ...(m.payload || {}), _pm: randomId(10) } };
            if (this.brokerUp) { try { this.broker.send(msg); } catch (_) { /* ignore */ } }
            const dst = msg.dst;
            if (!dst) return;
            if (msg.type === 'OFFER' && !this.offered.has(dst)) {
                const at = now();
                this.offered.set(dst, at);
                // Over relays alone nobody says "no such room"; silence does.
                this.timers.push(setTimeout(() => {
                    this.offered.delete(dst);
                    if (this.running && !this.brokerUp && (this.heard.get(dst) || 0) < at) this.emit('message', { type: 'EXPIRE', src: dst });
                }, NO_REPLY_EXPIRE_MS));
            }
            if (!this.relays.length) return;
            const src = this.id;
            this.chain = this.chain.then(async () => {
                const [topic, bytes] = await Promise.all([topicFor(dst), seal(dst, { ...msg, src })]);
                for (const r of this.relays) r.publish(topic, bytes);
            }).catch(() => {});
        }

        close() {
            this.running = false;
            this.opened = false;
            for (const t of this.timers || []) clearTimeout(t);
            this.timers = [];
            clearTimeout(this.brokerTimer);
            clearTimeout(this.downTimer);
            try { this.broker.close(); } catch (_) { /* ignore */ }
            for (const r of this.relays) r.stop();
            this.brokerUp = false;
        }
    }

    // A Peer class that signals through the hub. `relays` is a list of
    // wss:// MQTT-over-WebSocket broker URLs; [] means PeerJS broker only.
    function wrap(Peer, relays) {
        const list = (Array.isArray(relays) ? relays : []).filter((u) => typeof u === 'string' && /^wss?:\/\//.test(u));
        if (!list.length || !hasCrypto) return Peer;
        return class RelayPeer extends Peer {
            _createServerConnection() {
                const hub = new SignalHub(super._createServerConnection(), list);
                hub.on('message', (m) => this._handleMessage(m));
                hub.on('error', (e) => this._abort('socket-error', e));
                hub.on('disconnected', () => {
                    if (!this.disconnected) { this.emitError('network', 'Lost connection to server.'); this.disconnect(); }
                });
                return hub;
            }
        };
    }

    window.PPSignal = { wrap, SignalHub, MqttRelay };
})();
