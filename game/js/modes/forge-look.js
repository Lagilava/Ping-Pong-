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
        deflector: { body: ['#2a0c26', '#8a2a78', '#22081f'], rim: '#ff7ade', glow: '#ff3fc8', core: '#ffe6f8', dark: '#3d0636' },
    };
    // Portal pairs: each linked pair shares a colour so the court reads at a glance.
    const PORTAL_COLORS = [
        { rim: '#ff9a3c', glow: '#ff7a1a', core: '#ffe2c2', deep: '#3a1400' },
        { rim: '#4db2ff', glow: '#1e8cff', core: '#d6efff', deep: '#001a3a' },
    ];
    const PORTAL_IDLE = { rim: '#8a97a6', glow: '#5c6875', core: '#d8dee6', deep: '#10151b' };
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


    // ── gadgets: deflector, laser gate, crystal, portal ───────────────
    // Deflector: a short angled slab, baked flat and rotated when drawn.
    function deflectorSprite(len, th, hot) {
        const m = Math.ceil(th * 1.1);
        return make(`deflector:${Math.round(len)}x${Math.round(th)}:${hot ? 1 : 0}`, len + m * 2, th + m * 2, (ctx, W, H) => {
            drawSlab(ctx, m, m, len, th, false, PAL.deflector, hot, { seed: 61, bolts: false });
            // Chevrons along the core show which way it turns the ball.
            const pal = palOf(PAL.deflector, hot);
            ctx.strokeStyle = rgba(pal.dark, 0.75);
            ctx.lineWidth = Math.max(1, th * 0.1);
            ctx.lineCap = 'round';
            const n = Math.max(2, Math.floor(len / (th * 1.6)));
            for (let i = 0; i < n; i++) {
                const x = m + th * 0.9 + (len - th * 1.8) * (i + 0.5) / n;
                ctx.beginPath();
                ctx.moveTo(x - th * 0.16, H / 2 - th * 0.16);
                ctx.lineTo(x + th * 0.06, H / 2);
                ctx.lineTo(x - th * 0.16, H / 2 + th * 0.16);
                ctx.stroke();
            }
            for (const ex of [m + th * 0.45, m + len - th * 0.45]) bolt(ctx, ex, H / 2, Math.max(1.2, th * 0.16), hot);
        });
    }

    // Laser emitter: an armoured pod with a lens that faces along the beam
    // (the sprite's +x). `lit` is the bright version used while firing.
    function emitterSprite(r, lit) {
        const S = r * 3.4;
        return make(`emitter:${Math.round(r * 2)}:${lit ? 1 : 0}`, S, S, (ctx) => {
            const cx = S / 2, cy = S / 2;
            ctx.save();
            ctx.shadowColor = lit ? 'rgba(255,60,90,0.95)' : 'rgba(255,60,90,0.45)';
            ctx.shadowBlur = r * (lit ? 1.1 : 0.6);
            ctx.fillStyle = '#16070b';
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * TAU + Math.PI / 6;
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // Hex housing, brushed and bevelled.
            const body = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            body.addColorStop(0, '#6d6f78');
            body.addColorStop(0.45, '#2c2e35');
            body.addColorStop(1, '#0e0f13');
            ctx.fillStyle = body;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * TAU + Math.PI / 6;
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.save();
            ctx.clip();
            brush(ctx, cx - r, cy - r, r * 2, r * 2, false, 97, 0.9);
            ctx.restore();
            ctx.lineWidth = Math.max(1, r * 0.1);
            ctx.strokeStyle = '#ff5a78';
            ctx.stroke();
            // Lens, pushed toward the beam side.
            const lx = cx + r * 0.18, lr = r * 0.5;
            const lens = ctx.createRadialGradient(lx - lr * 0.3, cy - lr * 0.3, lr * 0.05, lx, cy, lr);
            lens.addColorStop(0, '#ffffff');
            lens.addColorStop(0.35, lit ? '#ffc2cf' : '#ff8aa0');
            lens.addColorStop(1, lit ? '#ff1f4b' : '#5a0a1c');
            ctx.save();
            ctx.shadowColor = 'rgba(255,40,80,0.9)';
            ctx.shadowBlur = lit ? lr * 1.2 : lr * 0.4;
            ctx.fillStyle = lens;
            ctx.beginPath();
            ctx.arc(lx, cy, lr, 0, TAU);
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = Math.max(1, r * 0.07);
            ctx.beginPath();
            ctx.arc(lx, cy, lr, 0, TAU);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.beginPath();
            ctx.ellipse(lx - lr * 0.32, cy - lr * 0.38, lr * 0.28, lr * 0.13, -0.6, 0, TAU);
            ctx.fill();
            for (const a of [-2.1, 2.1, Math.PI]) bolt(ctx, cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68, Math.max(1, r * 0.1), false);
        });
    }

    // Crystal block: a cut violet gem in a steel collar. Damage 0-2 adds
    // cracks; the hot version is the hit flash.
    function crystalSprite(S, damage, hot) {
        const W = S * 1.7;
        return make(`crystal:${Math.round(S)}:${damage}:${hot ? 1 : 0}`, W, W, (ctx) => {
            const c = W / 2, h = S / 2, bev = S * 0.2;
            const oct = (k) => {
                ctx.beginPath();
                ctx.moveTo(c - h + bev * k, c - h); ctx.lineTo(c + h - bev * k, c - h);
                ctx.lineTo(c + h, c - h + bev * k); ctx.lineTo(c + h, c + h - bev * k);
                ctx.lineTo(c + h - bev * k, c + h); ctx.lineTo(c - h + bev * k, c + h);
                ctx.lineTo(c - h, c + h - bev * k); ctx.lineTo(c - h, c - h + bev * k);
                ctx.closePath();
            };
            ctx.save();
            ctx.shadowColor = hot ? 'rgba(235,220,255,1)' : 'rgba(170,120,255,0.85)';
            ctx.shadowBlur = S * (hot ? 0.6 : 0.42);
            ctx.fillStyle = '#1a0b33';
            oct(1);
            ctx.fill();
            ctx.restore();
            // Steel collar.
            const collar = ctx.createLinearGradient(c - h, c - h, c + h, c + h);
            collar.addColorStop(0, hot ? '#ffffff' : '#d4d8e8');
            collar.addColorStop(0.5, hot ? '#d8ccff' : '#5b5f78');
            collar.addColorStop(1, hot ? '#a99bd6' : '#1b1c28');
            ctx.fillStyle = collar;
            oct(1);
            ctx.fill();
            // Gem facets: a table and four kites around it.
            const g = S * 0.36, t = S * 0.17;
            const facet = (pts, a, b) => {
                const grad = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
                grad.addColorStop(0, a); grad.addColorStop(1, b);
                ctx.fillStyle = grad;
                ctx.beginPath();
                pts.forEach(([x, y]) => ctx.lineTo(x, y));
                ctx.closePath();
                ctx.fill();
            };
            const lift = hot ? 0.5 : 0;
            const tone = (hex) => (lift ? mix(hex, lift) : hex);
            facet([[c - g, c - g], [c + g, c - g], [c + t, c - t], [c - t, c - t]], tone('#f1e6ff'), tone('#a77dff'));
            facet([[c + g, c - g], [c + g, c + g], [c + t, c + t], [c + t, c - t]], tone('#b48cff'), tone('#4b1fa8'));
            facet([[c + g, c + g], [c - g, c + g], [c - t, c + t], [c + t, c + t]], tone('#6a35d6'), tone('#24095e'));
            facet([[c - g, c + g], [c - g, c - g], [c - t, c - t], [c - t, c + t]], tone('#d9c4ff'), tone('#7444e0'));
            const table = ctx.createLinearGradient(c - t, c - t, c + t, c + t);
            table.addColorStop(0, tone('#ffffff'));
            table.addColorStop(1, tone('#b99bff'));
            ctx.fillStyle = table;
            ctx.fillRect(c - t, c - t, t * 2, t * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.max(0.6, S * 0.015);
            ctx.strokeRect(c - t, c - t, t * 2, t * 2);
            ctx.strokeStyle = 'rgba(20,6,50,0.7)';
            ctx.lineWidth = Math.max(1, S * 0.035);
            ctx.strokeRect(c - g, c - g, g * 2, g * 2);
            // Collar rivets and bevel.
            for (const [bx, by] of [[c - h + bev * 0.75, c], [c + h - bev * 0.75, c], [c, c - h + bev * 0.75], [c, c + h - bev * 0.75]]) bolt(ctx, bx, by, Math.max(1, S * 0.035), hot);
            ctx.lineWidth = Math.max(1, S * 0.04);
            ctx.strokeStyle = hot ? '#ffffff' : '#c7b2ff';
            oct(1);
            ctx.stroke();
            if (!damage) return;
            // Cracks spread from the impact side as the gem weakens.
            const rnd = seeded(131 + damage * 17);
            ctx.lineCap = 'round';
            const cracks = damage === 1 ? 3 : 7;
            for (let i = 0; i < cracks; i++) {
                let x = c + (rnd() - 0.5) * g * 0.6, y = c + (rnd() - 0.5) * g * 0.6;
                let a = rnd() * TAU;
                ctx.beginPath();
                ctx.moveTo(x, y);
                const segs = 3 + Math.floor(rnd() * 3);
                for (let k = 0; k < segs; k++) {
                    a += (rnd() - 0.5) * 1.3;
                    const len = g * (0.25 + rnd() * 0.3);
                    x = Math.max(c - h * 0.95, Math.min(c + h * 0.95, x + Math.cos(a) * len));
                    y = Math.max(c - h * 0.95, Math.min(c + h * 0.95, y + Math.sin(a) * len));
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = 'rgba(16,4,40,0.85)';
                ctx.lineWidth = Math.max(1, S * 0.035);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = Math.max(0.6, S * 0.012);
                ctx.stroke();
            }
        });
    }

    // Portal: a machined ring around a dark well. The swirl is a separate
    // sprite so it can turn without re-baking.
    function portalRingSprite(R, pair) {
        const pal = pair < 0 ? PORTAL_IDLE : PORTAL_COLORS[pair % PORTAL_COLORS.length];
        const S = R * 2.9;
        return make(`portal:${Math.round(R * 2)}:${pair}`, S, S, (ctx) => {
            const cx = S / 2, cy = S / 2;
            ctx.save();
            ctx.shadowColor = rgba(pal.glow, pair < 0 ? 0.35 : 0.95);
            ctx.shadowBlur = R * 0.7;
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = R * 0.2;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.9, 0, TAU);
            ctx.stroke();
            ctx.restore();
            // Well.
            const well = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.82);
            well.addColorStop(0, '#000000');
            well.addColorStop(0.55, pal.deep);
            well.addColorStop(1, rgba(pal.glow, 0.55));
            ctx.fillStyle = well;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.82, 0, TAU);
            ctx.fill();
            // Ring body.
            ctx.lineWidth = R * 0.2;
            const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
            ring.addColorStop(0, '#e8edf5');
            ring.addColorStop(0.45, '#4a505c');
            ring.addColorStop(1, '#101219');
            ctx.strokeStyle = ring;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.9, 0, TAU);
            ctx.stroke();
            // Emissive inlay and notches.
            ctx.lineWidth = Math.max(1.2, R * 0.06);
            ctx.strokeStyle = pal.rim;
            if (pair < 0) ctx.setLineDash([R * 0.18, R * 0.14]);
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.9, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * TAU;
                ctx.save();
                ctx.translate(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
                ctx.rotate(a);
                ctx.fillRect(-R * 0.1, -R * 0.03, R * 0.2, R * 0.06);
                ctx.restore();
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = Math.max(0.8, R * 0.03);
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.0, Math.PI * 1.05, Math.PI * 1.6);
            ctx.stroke();
        });
    }

    function portalSwirlSprite(R, pair) {
        const pal = pair < 0 ? PORTAL_IDLE : PORTAL_COLORS[pair % PORTAL_COLORS.length];
        const S = R * 1.8;
        return make(`swirl:${Math.round(R * 2)}:${pair}`, S, S, (ctx) => {
            const cx = S / 2, cy = S / 2;
            ctx.lineCap = 'round';
            for (let arm = 0; arm < 3; arm++) {
                const base = arm / 3 * TAU;
                for (let k = 0; k < 18; k++) {
                    const f = k / 18, f2 = (k + 1) / 18;
                    const a1 = base + f * 3.2, a2 = base + f2 * 3.2;
                    const r1 = R * 0.78 * (1 - f * 0.85), r2 = R * 0.78 * (1 - f2 * 0.85);
                    ctx.strokeStyle = rgba(k > 12 ? pal.core : pal.rim, 0.15 + f * 0.75);
                    ctx.lineWidth = Math.max(1, R * (0.12 - f * 0.08));
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
                    ctx.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2);
                    ctx.stroke();
                }
            }
            const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
            core.addColorStop(0, rgba(pal.core, 0.95));
            core.addColorStop(1, rgba(pal.rim, 0));
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.22, 0, TAU);
            ctx.fill();
        });
    }

    // Live laser beam between two points: a wide soft glow, a coloured body
    // and a white-hot core. Three strokes, no blur. `power` 0..1 fades it.
    function drawBeam(ctx, x1, y1, x2, y2, th, power, time) {
        if (power <= 0.01) return;
        const flicker = 0.88 + Math.sin(time * 61) * 0.06 + Math.sin(time * 23) * 0.06;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalAlpha *= power * flicker;
        ctx.strokeStyle = 'rgba(255,40,80,0.22)';
        ctx.lineWidth = th * 4.2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,58,92,0.85)';
        ctx.lineWidth = th * 1.6;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,236,242,0.95)';
        ctx.lineWidth = Math.max(1, th * 0.55);
        ctx.stroke();
        ctx.restore();
    }

    // Off-state hint: where the beam will be, so it never surprises anyone.
    function drawBeamGuide(ctx, x1, y1, x2, y2, th, charge) {
        ctx.save();
        ctx.setLineDash([th * 2, th * 2.6]);
        ctx.lineWidth = Math.max(1, th * 0.5);
        ctx.strokeStyle = `rgba(255,70,100,${0.18 + charge * 0.5})`;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
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
    function drawItem(ctx, it, H, time, opts = {}) {
        const t = time || 0;
        switch (it.t) {
            case 'deflector': {
                const len = it.s * H, th = Math.max(8, 0.026 * H);
                ctx.rotate(it.rot ? -Math.PI / 4 : Math.PI / 4);
                blit(ctx, deflectorSprite(len, th, false), 0, 0);
                return;
            }
            case 'laser': {
                // Posts at both ends; the editor shows the beam cycling.
                const len = it.s * H, pr = 0.022 * H, th = Math.max(2, 0.008 * H);
                if (!it.rot) ctx.rotate(Math.PI / 2);
                const phase = (t * 0.45 + (it.x + it.y) * 0.7) % 1;
                const power = phase < 0.62 ? 1 : 0;
                if (power) drawBeam(ctx, -len / 2, 0, len / 2, 0, th, 1, t);
                else drawBeamGuide(ctx, -len / 2, 0, len / 2, 0, th, phase > 0.85 ? 1 : 0);
                blit(ctx, emitterSprite(pr, !!power), -len / 2, 0);
                ctx.save();
                ctx.scale(-1, 1);
                blit(ctx, emitterSprite(pr, !!power), -len / 2, 0);
                ctx.restore();
                return;
            }
            case 'crystal':
                blit(ctx, crystalSprite(0.062 * H, 0, false), 0, 0);
                return;
            case 'portal': {
                const R = 0.05 * H, pair = opts.pair ?? 0;
                blit(ctx, portalRingSprite(R, pair), 0, 0);
                ctx.rotate(-t * 2.4);
                blit(ctx, portalSwirlSprite(R, pair), 0, 0);
                return;
            }

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
        deflector: deflectorSprite,
        emitter: emitterSprite,
        crystal: crystalSprite,
        portalRing: portalRingSprite,
        portalSwirl: portalSwirlSprite,
        drawBeam,
        drawBeamGuide,
        PORTAL_COLORS,
    };
})();
