// Forge object art: walls, gates, bumpers, spinner blades, boost pads,
// ? blocks and coins. Every object is baked once into a small sprite
// (glow, bevel, brushed metal and all), so a frame is only drawImage calls.
// The editor, the match renderer (Obstacle objects) and the arcade layer
// (pads, blocks, coins) all draw from here so a piece looks the same
// everywhere. Black holes are not part of this file.
(function () {
    'use strict';
    const TAU = Math.PI * 2;
    const cache = new Map();

    const bakeScale = () => 2 * (window.game?.getArenaScale?.() || 1);

    // ── helpers ────────────────────────────────────────────────────────
    function hexToRgb(hex) {
        const v = hex.replace('#', '');
        return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    // Lighten toward white; `hot` sprites are the hit-flash version.
    function mix(hex, t) {
        const [r, g, b] = hexToRgb(hex);
        const c = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
        return `#${c(r)}${c(g)}${c(b)}`;
    }
    function rgba(hex, a) {
        const [r, g, b] = hexToRgb(hex);
        return `rgba(${r},${g},${b},${a})`;
    }

    function make(key, w, h, draw) {
        const bake = bakeScale();
        const full = `${key}@${bake}`;
        const hit = cache.get(full);
        if (hit) return hit;
        if (cache.size > 120) cache.clear();
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * bake));
        c.height = Math.max(1, Math.ceil(h * bake));
        c.lw = c.width / bake;
        c.lh = c.height / bake;
        const ctx = c.getContext('2d');
        ctx.scale(bake, bake);
        draw(ctx, c.lw, c.lh);
        cache.set(full, c);
        return c;
    }

    function seeded(seed) {
        let s = seed >>> 0;
        return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    }

    // Fine brushed-metal streaks along the length of a body (clip first).
    function brush(ctx, x, y, w, h, vertical, seed, strength = 1) {
        const rnd = seeded(seed);
        const across = vertical ? w : h, along = vertical ? h : w;
        const n = Math.min(260, Math.round(across * along / 38));
        for (let i = 0; i < n; i++) {
            const a = rnd() * across, b = rnd() * along, len = 4 + rnd() * Math.min(46, along * 0.5);
            ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${(0.035 + rnd() * 0.07) * strength})` : `rgba(0,0,0,${(0.05 + rnd() * 0.1) * strength})`;
            if (vertical) ctx.fillRect(x + a, y + b, 0.8, len); else ctx.fillRect(x + b, y + a, len, 0.8);
        }
    }

    function across(ctx, x, y, w, h, vertical, stops) {
        const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
        stops.forEach(([o, c]) => g.addColorStop(o, c));
        return g;
    }

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    }

    function bolt(ctx, x, y, r, hot) {
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        g.addColorStop(0, hot ? '#ffffff' : '#d9dde2');
        g.addColorStop(1, hot ? '#e8e8e8' : '#3a3f47');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = Math.max(0.6, r * 0.22);
        ctx.stroke();
    }

    // ── palettes ───────────────────────────────────────────────────────
    const PAL = {
        wall: { body: ['#2a1c13', '#74503a', '#1f130c'], rim: '#ffb347', glow: '#ff9a2e', core: '#ffe9c4', dark: '#3b1d08' },
        gate: { body: ['#08262c', '#23808a', '#072a30'], rim: '#6af2ff', glow: '#00e5d0', core: '#e2fffc', dark: '#033a3f' },
        blade: { body: ['#2e2208', '#8a6516', '#33250a'], rim: '#ffd166', glow: '#ffc233', core: '#fff6cf', dark: '#4a3200' },
        ice: { glow: '#46e6ff', core: '#ffffff' },
    };
    const palOf = (p, hot) => (hot ? { ...p, body: p.body.map(c => mix(c, 0.62)), rim: mix(p.rim, 0.7), core: '#ffffff' } : p);

    // ── slab (wall / gate / blade body) ────────────────────────────────
    // Draws a lit capsule-ish bar into (x, y, w, h). `vertical` bars are
    // lit from the left, horizontal ones from the top.
    function drawSlab(ctx, x, y, w, h, vertical, basePal, hot, opts = {}) {
        const pal = palOf(basePal, hot);
        const T = Math.min(w, h), L = Math.max(w, h);
        const rad = opts.capsule ? T / 2 : T * 0.42;

        // Halo, baked here once so the frame never blurs.
        ctx.save();
        ctx.shadowColor = rgba(pal.glow, hot ? 0.95 : 0.7);
        ctx.shadowBlur = T * (hot ? 1.3 : 0.85);
        ctx.fillStyle = pal.body[2];
        rr(ctx, x, y, w, h, rad);
        ctx.fill();
        ctx.restore();

        // Body: tubular shading across the thickness.
        ctx.fillStyle = across(ctx, x, y, w, h, vertical, [[0, pal.body[0]], [0.42, pal.body[1]], [1, pal.body[2]]]);
        rr(ctx, x, y, w, h, rad);
        ctx.fill();
        ctx.save();
        ctx.clip();
        brush(ctx, x, y, w, h, vertical, opts.seed || 11, hot ? 0.5 : 1);
        if (opts.stripes) {
            // Hazard stripes down the flanks, kept clear of the glowing core.
            ctx.fillStyle = rgba(pal.rim, hot ? 0.16 : 0.2);
            const step = T * 1.5;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            for (let k = -T; k < L + T; k += step) {
                ctx.beginPath();
                if (vertical) {
                    ctx.moveTo(x, y + k); ctx.lineTo(x + w, y + k - T * 0.7); ctx.lineTo(x + w, y + k - T * 0.7 + step * 0.45); ctx.lineTo(x, y + k + step * 0.45);
                } else {
                    ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + T * 0.7, y); ctx.lineTo(x + k + T * 0.7 + step * 0.45, y); ctx.lineTo(x + k + step * 0.45, y + h);
                }
                ctx.fill();
            }
            ctx.restore();
        }
        // Soft top-left sheen.
        const sheen = vertical ? ctx.createLinearGradient(x, 0, x + w * 0.5, 0) : ctx.createLinearGradient(0, y, 0, y + h * 0.5);
        sheen.addColorStop(0, `rgba(255,255,255,${hot ? 0.4 : 0.22})`);
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x, y, w, h);
        ctx.restore();

        // Emissive channel down the middle.
        const inset = T * (opts.capsule ? 0.9 : 0.62);
        if (L > inset * 2.4) {
            const cT = Math.max(2, T * 0.26);
            const cx = vertical ? x + (w - cT) / 2 : x + inset, cy = vertical ? y + inset : y + (h - cT) / 2;
            const cw = vertical ? cT : L - inset * 2, ch = vertical ? L - inset * 2 : cT;
            ctx.save();
            ctx.shadowColor = rgba(pal.glow, 0.95);
            ctx.shadowBlur = T * 0.55;
            ctx.fillStyle = across(ctx, cx, cy, cw, ch, vertical, [[0, pal.rim], [0.5, pal.core], [1, pal.rim]]);
            rr(ctx, cx, cy, cw, ch, cT / 2);
            ctx.fill();
            ctx.restore();
            // Segment gaps (straight for walls, slanted for gates).
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = Math.max(1, T * 0.07);
            const seg = Math.max(T * 1.5, (vertical ? ch : cw) / 14);
            const slant = opts.slant ? cT * 0.5 : 0;
            ctx.save();
            rr(ctx, cx, cy, cw, ch, cT / 2);
            ctx.clip();
            for (let k = seg; k < (vertical ? ch : cw) - seg * 0.4; k += seg) {
                ctx.beginPath();
                if (vertical) { ctx.moveTo(cx, cy + k + slant); ctx.lineTo(cx + cw, cy + k - slant); } else { ctx.moveTo(cx + k + slant, cy); ctx.lineTo(cx + k - slant, cy + ch); }
                ctx.stroke();
            }
            ctx.restore();
        }

        // Bevel: bright on the lit edge, dark on the far one.
        ctx.lineWidth = Math.max(1.2, T * 0.07);
        ctx.strokeStyle = across(ctx, x, y, w, h, vertical, [[0, mix(pal.rim, 0.45)], [0.5, rgba(pal.rim, 0.55)], [1, rgba(pal.dark, 0.9)]]);
        rr(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, Math.max(0, rad - ctx.lineWidth / 2));
        ctx.stroke();

        if (opts.bolts !== false && L > T * 3.2 && !opts.capsule) {
            const r = Math.max(1.2, T * 0.12), e = T * 0.3;
            if (vertical) { bolt(ctx, x + w / 2, y + e, r, hot); bolt(ctx, x + w / 2, y + h - e, r, hot); } else { bolt(ctx, x + e, y + h / 2, r, hot); bolt(ctx, x + w - e, y + h / 2, r, hot); }
        }
    }

    function slabSprite(kind, w, h, hot) {
        const vertical = h >= w;
        const T = Math.min(w, h);
        const m = Math.ceil(T * 1.1);
        const key = `${kind}:${Math.round(w)}x${Math.round(h)}:${hot ? 1 : 0}`;
        return make(key, w + m * 2, h + m * 2, (ctx) => {
            drawSlab(ctx, m, m, w, h, vertical, PAL[kind], hot, { seed: kind === 'gate' ? 23 : 11, slant: kind === 'gate' });
        });
    }

    // Spinner blade: capsule with hazard stripes and a hub, drawn centred.
    function bladeSprite(len, th, hot) {
        const m = Math.ceil(th * 1.3);
        const key = `blade:${Math.round(len)}x${Math.round(th)}:${hot ? 1 : 0}`;
        return make(key, len + m * 2, th + m * 2, (ctx, W, H) => {
            drawSlab(ctx, m, m, len, th, false, PAL.blade, hot, { capsule: true, stripes: true, seed: 37, bolts: false });
            const pal = palOf(PAL.blade, hot);
            const cx = W / 2, cy = H / 2, hr = th * 0.95;
            ctx.save();
            ctx.shadowColor = rgba(pal.glow, 0.85);
            ctx.shadowBlur = th * 0.6;
            const g = ctx.createRadialGradient(cx - hr * 0.3, cy - hr * 0.35, hr * 0.1, cx, cy, hr);
            g.addColorStop(0, hot ? '#ffffff' : '#ffe9a6');
            g.addColorStop(0.5, hot ? '#ffe9a6' : '#8a6516');
            g.addColorStop(1, hot ? '#c9a24a' : '#24190a');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, hr, 0, TAU);
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = pal.rim;
            ctx.lineWidth = Math.max(1.2, th * 0.09);
            ctx.beginPath();
            ctx.arc(cx, cy, hr, 0, TAU);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = Math.max(1, th * 0.07);
            ctx.beginPath();
            ctx.arc(cx, cy, hr * 0.62, 0, TAU);
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = rgba(pal.glow, 0.95);
            ctx.shadowBlur = th * 0.4;
            ctx.fillStyle = pal.core;
            ctx.beginPath();
            ctx.arc(cx, cy, hr * 0.32, 0, TAU);
            ctx.fill();
            ctx.restore();
        });
    }

    function bumperSprite(r, hot) {
        const m = Math.ceil(r * 0.9);
        const S = r * 2 + m * 2;
        const key = `bumper:${Math.round(r * 2)}:${hot ? 1 : 0}`;
        return make(key, S, S, (ctx) => {
            const cx = S / 2, cy = S / 2;
            ctx.save();
            ctx.shadowColor = `rgba(70,230,255,${hot ? 1 : 0.75})`;
            ctx.shadowBlur = r * (hot ? 1.1 : 0.75);
            ctx.fillStyle = '#06222e';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.fill();
            ctx.restore();
            // Metal ring.
            const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            ring.addColorStop(0, hot ? '#ffffff' : '#c8f7ff');
            ring.addColorStop(0.45, hot ? '#bff4ff' : '#2d8fab');
            ring.addColorStop(1, hot ? '#6fd0ea' : '#06202b');
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            ctx.clip();
            brush(ctx, cx - r, cy - r, r * 2, r * 2, false, 51, 0.8);
            ctx.restore();
            // Studs around the ring.
            const studs = 10;
            for (let i = 0; i < studs; i++) {
                const a = i / studs * TAU - Math.PI / 2;
                ctx.save();
                ctx.shadowColor = 'rgba(120,245,255,0.9)';
                ctx.shadowBlur = r * 0.12;
                ctx.fillStyle = hot ? '#ffffff' : '#bff9ff';
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, Math.max(1, r * 0.045), 0, TAU);
                ctx.fill();
                ctx.restore();
            }
            // Dome.
            const dr = r * 0.72;
            const dome = ctx.createRadialGradient(cx - dr * 0.35, cy - dr * 0.42, dr * 0.08, cx, cy, dr);
            dome.addColorStop(0, '#ffffff');
            dome.addColorStop(0.32, hot ? '#e6fdff' : '#9bf3ff');
            dome.addColorStop(1, hot ? '#7fdcf2' : '#0c6a8a');
            ctx.fillStyle = dome;
            ctx.beginPath();
            ctx.arc(cx, cy, dr, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(2,28,40,0.7)';
            ctx.lineWidth = Math.max(1, r * 0.05);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = Math.max(1, r * 0.05);
            ctx.beginPath();
            ctx.arc(cx, cy, dr * 0.58, 0, TAU);
            ctx.stroke();
            // Core cap.
            const cap = ctx.createRadialGradient(cx - r * 0.05, cy - r * 0.07, 0, cx, cy, r * 0.22);
            cap.addColorStop(0, '#ffffff');
            cap.addColorStop(1, hot ? '#e6fdff' : '#7fe2f5');
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.22, 0, TAU);
            ctx.fill();
            // Specular crescent.
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.ellipse(cx - dr * 0.38, cy - dr * 0.5, dr * 0.3, dr * 0.14, -0.62, 0, TAU);
            ctx.fill();
        });
    }

    function padSprite(padW, padH) {
        const mx = Math.ceil(padH * 0.7), my = Math.ceil(padH * 0.7);
        return make(`pad:${Math.round(padW)}x${Math.round(padH)}`, padW + mx * 2, padH + my * 2, (ctx) => {
            const x = mx, y = my, w = padW, h = padH;
            ctx.save();
            ctx.shadowColor = 'rgba(255,140,30,0.85)';
            ctx.shadowBlur = h * 0.8;
            ctx.fillStyle = '#1c0b02';
            rr(ctx, x, y, w, h, h / 2);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = across(ctx, x, y, w, h, false, [[0, '#5a2d0c'], [0.5, '#2a1305'], [1, '#120801']]);
            rr(ctx, x, y, w, h, h / 2);
            ctx.fill();
            ctx.save();
            ctx.clip();
            brush(ctx, x, y, w, h, false, 71, 1);
            // Recessed lane with a perforated grip.
            const lane = h * 0.56, lx = x + h * 0.55, ly = y + (h - lane) / 2, lw = w - h * 1.1;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            rr(ctx, lx, ly, lw, lane, lane / 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,170,70,0.1)';
            const dot = Math.max(1, h * 0.04);
            for (let px = lx + lane * 0.5; px < lx + lw - lane * 0.4; px += h * 0.22) {
                for (let py = ly + lane * 0.28; py < ly + lane; py += h * 0.22) {
                    ctx.beginPath();
                    ctx.arc(px, py, dot, 0, TAU);
                    ctx.fill();
                }
            }
            ctx.restore();
            // End lights.
            for (const ex of [x + h * 0.32, x + w - h * 0.32]) {
                ctx.save();
                ctx.shadowColor = 'rgba(255,170,60,0.95)';
                ctx.shadowBlur = h * 0.4;
                ctx.fillStyle = '#ffd08a';
                ctx.beginPath();
                ctx.arc(ex, y + h / 2, h * 0.1, 0, TAU);
                ctx.fill();
                ctx.restore();
            }
            ctx.lineWidth = Math.max(1.6, h * 0.075);
            ctx.strokeStyle = across(ctx, x, y, w, h, false, [[0, '#ffc477'], [0.5, '#ff9a2e'], [1, '#8a4210']]);
            rr(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, h / 2);
            ctx.stroke();
        });
    }

    function blockSprite(S, used) {
        const W = S * 1.5;
        return make(`block:${Math.round(S)}:${used ? 1 : 0}`, W, W, (ctx) => {
            const x = (W - S) / 2, y = (W - S) / 2, r = S * 0.15;
            ctx.save();
            if (!used) { ctx.shadowColor = 'rgba(255,170,40,0.85)'; ctx.shadowBlur = S * 0.4; }
            ctx.fillStyle = used ? '#4e2f1c' : '#b8620a';
            rr(ctx, x, y, S, S, r);
            ctx.fill();
            ctx.restore();
            // Frame.
            ctx.fillStyle = across(ctx, x, y, S, S, false, used ? [[0, '#a07250'], [1, '#3e2414']] : [[0, '#ffe888'], [0.5, '#f2a11a'], [1, '#a85a08']]);
            rr(ctx, x, y, S, S, r);
            ctx.fill();
            ctx.lineWidth = Math.max(1.5, S * 0.05);
            ctx.strokeStyle = used ? '#2a170b' : '#6e3400';
            ctx.stroke();
            // Inset panel with an embossed edge.
            const p = S * 0.14, px = x + p, py = y + p, ps = S - p * 2, pr = r * 0.6;
            ctx.fillStyle = across(ctx, px, py, ps, ps, false, used ? [[0, '#7a4f31'], [1, '#4a2c19']] : [[0, '#ffd44f'], [1, '#ee920f']]);
            rr(ctx, px, py, ps, ps, pr);
            ctx.fill();
            ctx.save();
            rr(ctx, px, py, ps, ps, pr);
            ctx.clip();
            brush(ctx, px, py, ps, ps, false, used ? 91 : 83, 0.9);
            const gloss = ctx.createLinearGradient(0, py, 0, py + ps * 0.55);
            gloss.addColorStop(0, `rgba(255,255,255,${used ? 0.1 : 0.34})`);
            gloss.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(px, py, ps, ps * 0.55);
            ctx.restore();
            ctx.lineWidth = Math.max(1, S * 0.03);
            ctx.strokeStyle = used ? 'rgba(20,10,4,0.6)' : 'rgba(110,52,0,0.65)';
            rr(ctx, px, py, ps, ps, pr);
            ctx.stroke();
            // Corner rivets.
            const d = p * 0.5;
            for (const [bx, by] of [[x + d, y + d], [x + S - d, y + d], [x + d, y + S - d], [x + S - d, y + S - d]]) bolt(ctx, bx, by, Math.max(1.2, S * 0.04), false);
            if (used) {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(W / 2, W / 2, S * 0.1, 0, TAU);
                ctx.fill();
                return;
            }
            ctx.font = `900 ${Math.round(S * 0.6)}px Arial Black, Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#7a3a00';
            for (let i = 4; i >= 1; i--) ctx.fillText('?', W / 2 + S * 0.012 * i, W / 2 + S * 0.03 + S * 0.012 * i);
            const fg = ctx.createLinearGradient(0, W / 2 - S * 0.3, 0, W / 2 + S * 0.3);
            fg.addColorStop(0, '#ffffff');
            fg.addColorStop(1, '#ffe9a8');
            ctx.fillStyle = fg;
            ctx.fillText('?', W / 2, W / 2 + S * 0.03);
        });
    }

    function coinSprite(R) {
        const S = R * 4;
        return make(`coin:${Math.round(R * 2)}`, S, S, (ctx) => {
            const cx = S / 2, cy = S / 2;
            ctx.save();
            ctx.shadowColor = 'rgba(255,210,60,0.95)';
            ctx.shadowBlur = R * 0.95;
            ctx.fillStyle = '#c47a00';
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.fill();
            ctx.restore();
            const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
            rim.addColorStop(0, '#fff6c2');
            rim.addColorStop(0.5, '#e9a900');
            rim.addColorStop(1, '#8a5200');
            ctx.fillStyle = rim;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.fill();
            // Milled edge.
            ctx.strokeStyle = 'rgba(110,60,0,0.45)';
            ctx.lineWidth = Math.max(0.6, R * 0.04);
            for (let i = 0; i < 28; i++) {
                const a = i / 28 * TAU;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
                ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
                ctx.stroke();
            }
            // Face.
            const fr = R * 0.76;
            const face = ctx.createRadialGradient(cx - fr * 0.35, cy - fr * 0.4, fr * 0.1, cx, cy, fr);
            face.addColorStop(0, '#fff3a8');
            face.addColorStop(0.55, '#ffcc2e');
            face.addColorStop(1, '#d28c00');
            ctx.fillStyle = face;
            ctx.beginPath();
            ctx.arc(cx, cy, fr, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(122,70,0,0.8)';
            ctx.lineWidth = Math.max(1, R * 0.08);
            ctx.stroke();
            // Embossed star: light edge offset down-right, dark edge up-left.
            const star = (ox, oy, rad) => {
                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? rad * 0.42 : rad;
                    ctx.lineTo(cx + ox + Math.cos(a) * rr2, cy + oy + Math.sin(a) * rr2);
                }
                ctx.closePath();
            };
            const sr = R * 0.46, o = Math.max(0.6, R * 0.05);
            ctx.fillStyle = 'rgba(255,248,200,0.9)';
            star(o, o, sr); ctx.fill();
            ctx.fillStyle = '#b87300';
            star(-o * 0.5, -o * 0.5, sr); ctx.fill();
            const sg = ctx.createLinearGradient(0, cy - sr, 0, cy + sr);
            sg.addColorStop(0, '#e9a300');
            sg.addColorStop(1, '#c47a00');
            ctx.fillStyle = sg;
            star(0, 0, sr * 0.92); ctx.fill();
            // Highlight.
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.ellipse(cx - fr * 0.4, cy - fr * 0.5, fr * 0.3, fr * 0.12, -0.7, 0, TAU);
            ctx.fill();
        });
    }

    // ── drawing entry points ───────────────────────────────────────────
    const blit = (ctx, c, x, y, alpha) => {
        if (alpha !== undefined) ctx.globalAlpha *= alpha;
        ctx.drawImage(c, x - c.lw / 2, y - c.lh / 2, c.lw, c.lh);
    };

    // Draw a wall/gate/bumper/spinner Obstacle from its live state.
    function drawObstacle(ctx, o) {
        const flash = Math.max(o.hitFlash || 0, o.glowIntensity || 0 ? (o.glowIntensity || 0) * 0.6 : 0, (o.dangerLevel || 0) * 0.3);
        if (!o._lookWarm) {
            // Bake the hit-flash variant up front so the first hit never hitches.
            o._lookWarm = true;
            const k = o.obstacleType;
            if (k === 'wall' || k === 'gate') slabSprite(k, o.w, o.h, true);
            else if (k === 'bumper') bumperSprite(Math.min(o.w, o.h) / 2, true);
            else bladeSprite(o.w, o.h, true);
        }
        ctx.save();
        if (o.obstacleType === 'wall' || o.obstacleType === 'gate') {
            const kind = o.obstacleType;
            const cx = o.pos.x + o.w / 2, cy = o.pos.y + o.h / 2 + (o.floatOffset || 0);
            blit(ctx, slabSprite(kind, o.w, o.h, false), cx, cy);
            if (flash > 0.02) { ctx.globalAlpha = Math.min(1, flash); blit(ctx, slabSprite(kind, o.w, o.h, true), cx, cy); }
        } else if (o.obstacleType === 'bumper') {
            const r = Math.min(o.w, o.h) / 2;
            const pulse = 1 + Math.sin(o.pulsePhase * 1.8) * 0.04;
            ctx.translate(o.cx, o.cy);
            ctx.scale(pulse, pulse);
            // Soft ground ring.
            const glow = Math.max(o.glowIntensity || 0, o.hitFlash || 0);
            ctx.globalAlpha = 0.16 + glow * 0.3;
            ctx.strokeStyle = '#7df9ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, r * (1.7 + glow * 0.3), 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = 1;
            blit(ctx, bumperSprite(r, false), 0, 0);
            if (flash > 0.02) { ctx.globalAlpha = Math.min(1, flash); blit(ctx, bumperSprite(r, true), 0, 0); }
        } else {
            ctx.translate(o.cx, o.cy);
            ctx.rotate(o.rotation || 0);
            blit(ctx, bladeSprite(o.w, o.h, false), 0, 0);
            if (flash > 0.02) { ctx.globalAlpha = Math.min(1, flash); blit(ctx, bladeSprite(o.w, o.h, true), 0, 0); }
        }
        ctx.restore();
    }

    // Editor / preview: draw a Forge map item centred on (0, 0).
    function drawItem(ctx, it, H, time) {
        const t = time || 0;
        switch (it.t) {
            case 'wall':
            case 'gate': {
                const len = it.s * H, th = Math.max(8, 0.026 * H);
                const vertical = !it.rot;
                blit(ctx, slabSprite(it.t, vertical ? th : len, vertical ? len : th, false), 0, 0);
                return;
            }
            case 'bumper': blit(ctx, bumperSprite(it.s * H, false), 0, 0); return;
            case 'spinner': {
                ctx.rotate(t * 1.6);
                blit(ctx, bladeSprite(it.s * H, Math.max(8, 0.024 * H), false), 0, 0);
                return;
            }
            case 'pad': {
                const w = 0.1 * H, h = 0.042 * H, dir = it.rot ? -1 : 1;
                blit(ctx, padSprite(w, h), 0, 0);
                ctx.lineWidth = Math.max(2, h * 0.07);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const pulse = (t * 2) % 1;
                for (let i = -1; i <= 1; i++) {
                    const lit = Math.abs(((i + 1) / 3) - (dir > 0 ? pulse : 1 - pulse)) < 0.34;
                    ctx.strokeStyle = lit ? '#ffe2a8' : '#ff9a2e';
                    ctx.beginPath();
                    ctx.moveTo(i * w * 0.22 - h * 0.18 * dir, -h * 0.26);
                    ctx.lineTo(i * w * 0.22 + h * 0.14 * dir, 0);
                    ctx.lineTo(i * w * 0.22 - h * 0.18 * dir, h * 0.26);
                    ctx.stroke();
                }
                return;
            }
            case 'block': {
                const s = 0.06 * H;
                ctx.translate(0, Math.sin(t * 2.4) * s * 0.04);
                blit(ctx, blockSprite(s, false), 0, 0);
                return;
            }
            case 'coin': {
                const r = 0.018 * H;
                const spin = Math.max(0.2, Math.abs(Math.cos(t * 3 + it.x * 20)));
                ctx.scale(spin, 1);
                blit(ctx, coinSprite(r), 0, 0);
                return;
            }
        }
    }

    window.ForgeLook = {
        drawObstacle,
        drawItem,
        pad: padSprite,
        block: blockSprite,
        coin: coinSprite,
    };
})();
