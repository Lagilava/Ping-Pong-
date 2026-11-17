// Solo-progression cosmetics: six ball trails and ten profile titles, each earned
// by something the player does in the Tour, the Daily Match or the Gold rematches.
// Nothing that already existed is locked behind them. The choice is saved on its
// own (pp-cosmetics-v1) and only ever changes how the player's own ball looks.
//
// Per-frame cost: drawTrail is the one piece of new work in the render loop. It strokes one
// polyline three times from the ball's existing trail buffer (as many points as the ball already
// keeps), with pre-built colour strings, no shadows or blur, and one gradient per call, the same as the
// game's own trail. tests/cosmetics.browser.js measures it against a 0.3 ms budget.
(function () {
    'use strict';

    const KEY = 'pp-cosmetics-v1';
    const T = () => window.PPTour;
    const D = () => window.PPDaily;

    // ── What can be earned ───────────────────────────────────────────────
    // `test` reads the live save of the system that owns the achievement.
    const TRAILS = [
        { id: 'ember', name: 'Ember Tail', how: 'Clear both Club stages', test: () => !!T()?.tierCleared(0) },
        { id: 'comet', name: 'Comet Dust', how: 'Clear both Regional stages', test: () => !!T()?.tierCleared(1) },
        { id: 'prism', name: 'Prism Ribbon', how: 'Clear both National stages', test: () => !!T()?.tierCleared(2) },
        { id: 'goldleaf', name: 'Goldleaf', how: 'Earn 3 gold stars', test: () => (T()?.totalGold() || 0) >= 3 },
        { id: 'mist', name: 'Graveyard Mist', how: 'Survive Morrow’s siege (stage 9)', test: () => (T()?.starsOf(9) || 0) > 0 },
        { id: 'spark', name: 'Calendar Spark', how: 'Reach a 7 day Daily streak', test: () => (D()?.bestStreak() || 0) >= 7 },
    ];
    const TITLES = [
        { id: 'rookieSlayer', name: 'Rookie Slayer', how: 'Win stage 1', test: () => (T()?.starsOf(1) || 0) > 0 },
        { id: 'clubChampion', name: 'Club Champion', how: 'Clear both Club stages', test: () => !!T()?.tierCleared(0) },
        { id: 'regionalStar', name: 'Regional Star', how: 'Clear both Regional stages', test: () => !!T()?.tierCleared(1) },
        { id: 'nationalFinalist', name: 'National Finalist', how: 'Clear both National stages', test: () => !!T()?.tierCleared(2) },
        { id: 'worldBeater', name: 'World Beater', how: 'Beat Titan (stage 8)', test: () => (T()?.starsOf(8) || 0) > 0 },
        { id: 'graveBane', name: 'Gravekeeper’s Bane', how: 'Beat Morrow (stage 9)', test: () => (T()?.starsOf(9) || 0) > 0 },
        { id: 'perfectionist', name: 'Perfectionist', how: 'Earn all 27 Tour stars', test: () => !!T() && T().totalStars() >= T().MAX_STARS },
        { id: 'goldStandard', name: 'Gold Standard', how: 'Earn all 8 gold stars', test: () => !!T() && T().totalGold() >= T().GOLD_STAGES.length },
        { id: 'dailyRegular', name: 'Daily Regular', how: 'Reach a 3 day Daily streak', test: () => (D()?.bestStreak() || 0) >= 3 },
        { id: 'calendarKing', name: 'Calendar King', how: 'Reach a 14 day Daily streak', test: () => (D()?.bestStreak() || 0) >= 14 },
    ];
    const byKind = { trail: TRAILS, title: TITLES };
    const find = (kind, id) => (byKind[kind] || []).find((x) => x.id === id) || null;

    // ── Save ─────────────────────────────────────────────────────────────
    let data = null;
    function blank() { return { v: 1, trail: '', title: '', seen: null, chose: false }; }
    function load() {
        data = blank();
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* blocked or corrupt */ }
        if (!raw || typeof raw !== 'object') return data;
        if (find('trail', raw.trail)) data.trail = raw.trail;
        if (find('title', raw.title)) data.title = raw.title;
        data.chose = !!raw.chose;
        if (Array.isArray(raw.seen)) data.seen = raw.seen.filter((s) => typeof s === 'string').slice(0, 40);
        return data;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* blocked */ } }
    function ensure() { if (!data) load(); return data; }

    // ── Earning ──────────────────────────────────────────────────────────
    function earned(kind, id) {
        const item = find(kind, id);
        if (!item) return false;
        try { return !!item.test(); } catch (_) { return false; }
    }
    const tag = (kind, id) => `${kind}:${id}`;

    // The equipped choice, quietly falling back to nothing when it is not earned
    // (a reset Tour, or a hand-edited save).
    function equipped(kind) {
        const id = ensure()[kind];
        return id && earned(kind, id) ? id : '';
    }
    function equip(kind, id) {
        ensure();
        if (id && !earned(kind, id)) return false;
        data[kind] = id || '';
        data.chose = true; // the player has picked for themselves: never switch it for them again
        trailCache.at = -1e9;
        save();
        return true;
    }

    // Everything newly earned since the last check, as [{kind, id, name}]; the
    // first call after a fresh save reports what the player already has.
    function check() {
        ensure();
        const out = [];
        const nowEarned = [];
        const firstCheck = !data.seen;
        for (const kind of ['trail', 'title']) {
            for (const it of byKind[kind]) {
                if (!earned(kind, it.id)) continue;
                nowEarned.push(tag(kind, it.id));
                if (!(data.seen || []).includes(tag(kind, it.id))) out.push({ kind, id: it.id, name: it.name });
            }
        }
        // Never forget something already announced, even if its source is reset later.
        const merged = Array.from(new Set((data.seen || []).concat(nowEarned)));
        if (!data.seen || merged.length !== data.seen.length) { data.seen = merged; save(); }
        // Wear the first trail earned so the reward shows straight away, unless the player has ever chosen
        // for themselves (including turning it off) or this is a save that already had progress.
        if (!firstCheck && !data.chose && !data.trail && out.some((o) => o.kind === 'trail')) { data.trail = out.find((o) => o.kind === 'trail').id; trailCache.at = -1e9; save(); }
        return out;
    }
    const labelOf = (o) => `New ${o.kind === 'trail' ? 'ball trail' : 'title'}: ${o.name}`;

    function titleName() {
        const id = equipped('title');
        return id ? find('title', id).name : '';
    }

    // ── Trail drawing ────────────────────────────────────────────────────
    // Each trail is three strokes of one polyline (wide and soft, mid, thin and hot), each
    // shorter than the last, so it tapers without a stroke per segment, plus every accent
    // (embers, dust, sparkles) batched into a single fill. Colours are pre-built strings.
    const N = 10; // points at most
    const XY = new Float32Array(2 * (N + 1)); // reused every frame
    const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
    const hsl = (deg) => {
        const c = 0.85, x = c * (1 - Math.abs(((deg / 60) % 2) - 1)), m = 0.1;
        const [r, g, b] = deg < 60 ? [c, x, 0] : deg < 120 ? [x, c, 0] : deg < 180 ? [0, c, x] : deg < 240 ? [0, x, c] : deg < 300 ? [x, 0, c] : [c, 0, x];
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    };
    // stops: gradient from the ball to the tail. width: [outer, mid, core] in ball radii.
    const STYLE = {
        ember: { stops: [[0, rgba(255, 214, 140, 0.95)], [0.4, rgba(255, 110, 40, 0.6)], [1, rgba(255, 60, 20, 0)]], width: [1.7, 1.0, 0.4], core: rgba(255, 245, 210, 0.9), accent: rgba(255, 150, 60, 0.85) },
        comet: { stops: [[0, rgba(235, 250, 255, 0.95)], [0.4, rgba(94, 220, 255, 0.6)], [1, rgba(60, 140, 255, 0)]], width: [1.3, 0.8, 0.3], core: rgba(255, 255, 255, 0.95), accent: rgba(170, 235, 255, 0.8) },
        goldleaf: { stops: [[0, rgba(255, 240, 170, 0.95)], [0.45, rgba(255, 190, 40, 0.65)], [1, rgba(255, 150, 20, 0)]], width: [1.4, 0.85, 0.35], core: rgba(255, 252, 225, 0.95), accent: rgba(255, 245, 190, 0.95) },
        mist: { stops: [[0, rgba(190, 255, 170, 0.5)], [0.5, rgba(125, 255, 106, 0.3)], [1, rgba(80, 200, 90, 0)]], width: [2.8, 1.7, 0.7], core: rgba(215, 255, 205, 0.55), accent: rgba(170, 255, 150, 0.7) },
        spark: { stops: [[0, rgba(255, 255, 225, 0.95)], [0.4, rgba(255, 226, 90, 0.7)], [1, rgba(255, 170, 40, 0)]], width: [0.7, 0.45, 0.25], core: rgba(255, 255, 255, 0.95), accent: rgba(255, 240, 140, 0.9) },
        prism: { width: [1.7, 1.0, 0.4], core: rgba(255, 255, 255, 0.85) },
    };
    const PRISM = [];
    for (let h = 0; h < 24; h++) { const [r, g, b] = hsl(h * 15); PRISM.push([rgba(r, g, b, 0.95), rgba(r, g, b, 0.55), rgba(r, g, b, 0.15), rgba(r, g, b, 0)]); }
    const PASS_FRAC = [1, 0.62, 0.3];
    const PASS_ALPHA = [0.55, 0.85, 1];

    // The trail id for the render loop. Re-checked at most once a second, so a reset made anywhere
    // (Tour, Daily) is picked up without every frame re-reading progress.
    const trailCache = { value: '', at: -1e9 };
    function activeTrail(nowMs) {
        const now = nowMs === undefined ? Date.now() : nowMs;
        if (now - trailCache.at > 1000 || now < trailCache.at) { trailCache.value = equipped('trail'); trailCache.at = now; }
        return trailCache.value;
    }

    // Draws the equipped trail behind a ball. `b` is the Ball (trailPoints/trailCount/vel/r/_speed).
    function drawTrail(ctx, b, x, y, id, nowMs) {
        const st = STYLE[id];
        const count = b.trailCount | 0;
        if (!st || count < 3) return;
        const n = Math.min(N, count);
        const pts = b.trailPoints, r = b.r || 8;
        const sp = b._speed || Math.hypot(b.vel?.x || 0, b.vel?.y || 0) || 1;
        const nx = -(b.vel?.y || 0) / sp, ny = (b.vel?.x || 0) / sp;
        const t = (nowMs || 0) / 1000;
        // Points, newest first, with the style's own wobble: zigzag for sparks, drift for mist and embers.
        XY[0] = x; XY[1] = y;
        for (let i = 0; i < n; i++) {
            const idx = (count - 1 - i) * 2, fade = 1 - i / n;
            let ox = 0, oy = 0;
            if (id === 'spark') { const z = (i & 1 ? 1 : -1) * 4.5 * fade; ox = nx * z; oy = ny * z; }
            else if (id === 'mist') oy = -i * 0.6 + Math.sin(t * 2 + i) * 2;
            else if (id === 'ember') oy = -i * 0.8;
            XY[2 + i * 2] = pts[idx] + ox; XY[3 + i * 2] = pts[idx + 1] + oy;
        }
        const total = n + 1, last = total - 1;
        const g = ctx.createLinearGradient(x, y, XY[last * 2], XY[last * 2 + 1]);
        if (id === 'prism') {
            const base = ((t * 9) | 0) % 24;
            for (let k = 0; k < 4; k++) g.addColorStop(k / 3, PRISM[(base + k * 5) % 24][k]);
        } else {
            for (let k = 0; k < st.stops.length; k++) g.addColorStop(st.stops[k][0], st.stops[k][1]);
        }
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'lighter';
        for (let p = 0; p < 3; p++) {
            const upto = Math.max(2, Math.ceil(total * PASS_FRAC[p]));
            ctx.lineWidth = Math.max(0.8, r * st.width[p]);
            ctx.globalAlpha = PASS_ALPHA[p];
            ctx.strokeStyle = p === 2 ? st.core : g;
            ctx.beginPath(); ctx.moveTo(XY[0], XY[1]);
            for (let i = 1; i < upto; i++) ctx.lineTo(XY[i * 2], XY[i * 2 + 1]);
            ctx.stroke();
        }
        // Accents, all in one fill: embers rise, dust sits either side, sparkles twinkle, mist motes drift.
        if (id !== 'prism' && id !== 'spark') {
            ctx.globalAlpha = 1;
            ctx.fillStyle = st.accent;
            ctx.beginPath();
            for (let i = 2; i < total; i += 2) {
                const px = XY[i * 2], py = XY[i * 2 + 1], age = i / total;
                if (id === 'ember') ctx.rect(px + ny * 4, py - 5 * (1 - age), 2.2, 2.2);
                else if (id === 'comet') { const d = 3 + age * 9; ctx.rect(px + nx * d, py + ny * d, 1.8, 1.8); ctx.rect(px - nx * d, py - ny * d, 1.8, 1.8); }
                else if (id === 'mist') ctx.rect(px + nx * (4 + age * 8), py - 3 - age * 8, 2.4, 2.4);
                else if (id === 'goldleaf' && ((t * 6 + i) % 3) < 2) { ctx.rect(px - 3, py - 0.5, 6, 1); ctx.rect(px - 0.5, py - 3, 1, 6); }
            }
            ctx.fill();
        }
        ctx.restore();
    }

    // A fixed S-shaped path for the preview swatches in the Tour screen.
    function previewBall(w, h) {
        const pts = new Float32Array(2 * N);
        for (let i = 0; i < N; i++) {
            const u = i / (N - 1);
            pts[i * 2] = w * (0.12 + 0.62 * u);
            pts[i * 2 + 1] = h * (0.5 - Math.sin(u * Math.PI * 1.6) * 0.18);
        }
        return { trailPoints: pts, trailCount: N, r: h * 0.13, vel: { x: 1, y: 0.2 }, _speed: 900, x: pts[(N - 1) * 2], y: pts[(N - 1) * 2 + 1] };
    }

    window.PPCosmetics = {
        TRAILS, TITLES, earned, equipped, equip, check, labelOf, titleName, activeTrail, drawTrail, previewBall,
        lockText: (kind, id) => find(kind, id)?.how || '',
        reset() { data = blank(); save(); trailCache.at = -1e9; },
        reload() { data = null; trailCache.at = -1e9; load(); },
    };
})();
