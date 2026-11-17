// Quick match: find a stranger to play without a server.
//
// Someone who wants a game opens a normal hosted room and advertises its code
// on a public MQTT topic (the same free brokers that carry the online
// handshake, see signal-relays.js). Everyone looking for the same mode listens
// on that topic. When two seekers see each other, the one with the larger
// random id joins the other's room, so there is never a tie, and the normal
// room code path (hello, "full", reconnect) does the rest. After the match
// starts nothing here is used any more.
//
// The topic is public and unauthenticated: anyone can publish adverts. So an
// advert is only ever a hint. It has to look right, it expires after
// ADVERT_TTL_MS, a room that turns out to be gone or full is skipped for a
// while, and a flood is capped. Nothing in an advert identifies the player
// beyond a random per-search id.
(function () {
    'use strict';

    const VERSION = 1;
    const TOPIC_ROOT = 'ppneon/q1/';
    const ADVERT_EVERY_MS = 2000;
    const ADVERT_TTL_MS = 8000;       // an advert not refreshed by then means that player is gone
    const BAD_ROOM_MS = 30000;        // a room we failed to join is skipped for this long
    const MAX_SEEN = 40;              // flood cap: only the freshest this many adverts are kept
    const MAX_PER_SECOND = 20;        // adverts accepted per second, in total
    const MODES = ['classic', 'gravity', 'speed'];
    const CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/;   // same alphabet as room codes
    const ID_RE = /^[a-z0-9]{10}$/;

    const dec = new TextDecoder();
    const enc = new TextEncoder();
    const now = () => Date.now();

    function randomId() {
        const b = new Uint8Array(10);
        crypto.getRandomValues(b);
        return Array.from(b, (x) => (x % 36).toString(36)).join('');
    }

    const ADJ = ['Neon', 'Turbo', 'Swift', 'Lucky', 'Cosmic', 'Quiet', 'Sneaky', 'Bold', 'Zippy', 'Chill', 'Atomic', 'Pixel'];
    const NOUN = ['Fox', 'Otter', 'Comet', 'Panda', 'Falcon', 'Ninja', 'Wizard', 'Robot', 'Tiger', 'Moth', 'Raven', 'Yeti'];
    function handle() {
        const b = new Uint8Array(3);
        crypto.getRandomValues(b);
        return `${ADJ[b[0] % ADJ.length]}${NOUN[b[1] % NOUN.length]}${10 + (b[2] % 90)}`;
    }

    // Pure decision logic, kept apart from the sockets so tests can drive it.
    // `seen` maps seeker id -> { code, at }.
    // `fit(rating)` (optional) says whether that rating is close enough to pair with.
    function pickRoom(seen, myId, bad, at, fit) {
        let best = null;
        for (const [id, a] of seen) {
            if (id >= myId || at - a.at > ADVERT_TTL_MS) continue;
            if ((bad.get(a.code) || 0) > at) continue;
            if (fit && !fit(a.r)) continue;
            if (!best || id < best.id) best = { id, code: a.code };
        }
        return best;
    }

    function parseAdvert(bytes, mode, protocol) {
        let m;
        try { m = JSON.parse(dec.decode(bytes)); } catch (_) { return null; }
        if (!m || typeof m !== 'object' || m.v !== VERSION || m.p !== protocol || m.mode !== mode) return null;
        if (typeof m.id !== 'string' || !ID_RE.test(m.id) || typeof m.code !== 'string' || !CODE_RE.test(m.code)) return null;
        // The rating is a hint for pairing similar players; untrusted, so clamped.
        const r = Number.isFinite(m.r) ? Math.min(3000, Math.max(100, Math.round(m.r))) : 1000;
        return { id: m.id, code: m.code, r };
    }

    class Seeker {
        // hooks: { relays: [wss urls], protocol, code(): string for our open room or '', join(code), status(info) }
        constructor(mode, hooks) {
            this.mode = MODES.includes(mode) ? mode : 'classic';
            this.hooks = hooks;
            this.id = randomId();
            this.seen = new Map();
            this.bad = new Map();
            this.joining = false;
            this.running = false;
            this.startedAt = 0;
            this.relays = [];
            this.window = { at: 0, n: 0 };
            this.timers = [];
        }

        start() {
            const Relay = window.PPSignal?.MqttRelay;
            if (!Relay) { this.hooks.status({ state: 'error', others: 0, relaysUp: 0 }); return false; }
            this.running = true;
            this.startedAt = now();
            const topic = TOPIC_ROOT + this.mode;
            this.topic = topic;
            this.relays = (this.hooks.relays || []).map((u) => new Relay(u));
            for (const r of this.relays) r.start(topic, (bytes) => this.onAdvert(bytes), () => this.report());
            this.timers.push(setInterval(() => this.tick(), ADVERT_EVERY_MS));
            this.tick();
            return true;
        }

        // Adverts that arrive twice (same id, several brokers) just refresh one entry.
        onAdvert(bytes) {
            if (!this.running) return;
            const t = now();
            if (t - this.window.at >= 1000) this.window = { at: t, n: 0 };
            if (++this.window.n > MAX_PER_SECOND) return;
            const a = parseAdvert(bytes, this.mode, this.hooks.protocol);
            if (!a || a.id === this.id) return;
            this.seen.set(a.id, { code: a.code, at: t, r: a.r });
            if (this.seen.size > MAX_SEEN) {
                let oldest = null;
                for (const [id, v] of this.seen) if (!oldest || v.at < oldest.at) oldest = { id, at: v.at };
                if (oldest) this.seen.delete(oldest.id);
            }
            this.evaluate();
        }

        tick() {
            if (!this.running) return;
            const code = this.hooks.code();
            if (code && !this.joining) {
                const bytes = enc.encode(JSON.stringify({ v: VERSION, p: this.hooks.protocol, mode: this.mode, id: this.id, code, r: this.hooks.rating ? this.hooks.rating() : 1000 }));
                for (const r of this.relays) if (r.ready) r.publish(this.topic, bytes);
            }
            this.evaluate();
        }

        others() {
            const t = now();
            let n = 0;
            for (const a of this.seen.values()) if (t - a.at <= ADVERT_TTL_MS) n++;
            return n;
        }

        report() {
            if (!this.running) return;
            this.hooks.status({
                state: this.joining ? 'joining' : 'searching',
                others: this.others(),
                relaysUp: this.relays.filter((r) => r.ready).length,
                waited: now() - this.startedAt,
            });
        }

        evaluate() {
            if (!this.running) return;
            if (!this.joining) {
                const mine = this.hooks.rating ? this.hooks.rating() : 1000;
                const width = this.hooks.band ? this.hooks.band(now() - this.startedAt) : Infinity;
                const pick = pickRoom(this.seen, this.id, this.bad, now(), (r) => Math.abs((r == null ? 1000 : r) - mine) <= width);
                if (pick) {
                    this.joining = true;
                    this.seen.delete(pick.id);
                    this.report();
                    Promise.resolve(this.hooks.join(pick.code)).catch(() => this.failed(pick.code));
                    return;
                }
            }
            this.report();
        }

        // The room we tried was gone or full: skip it for a while and look again.
        failed(code) {
            this.bad.set(code, now() + BAD_ROOM_MS);
            this.joining = false;
            this.evaluate();
        }

        stop() {
            this.running = false;
            for (const t of this.timers) clearInterval(t);
            this.timers = [];
            for (const r of this.relays) { try { r.stop(); } catch (_) { /* ignore */ } }
            this.relays = [];
        }
    }

    window.PPQuick = { MODES, VERSION, Seeker, pickRoom, parseAdvert, handle, ADVERT_TTL_MS, BAD_ROOM_MS };
})();
