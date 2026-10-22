// Paddle designs: Satelliten, World Shield, AI Rebel, Prizma, Riptide,
// Magma and Bassline.
//
// Classic keeps its own renderer in paddle.js. Each design here is split in
// two: a static body baked once into an offscreen sprite, glow included, and
// a few animated touches drawn live every frame with plain fills, slices of
// baked sprites and the 'lighter' blend. Nothing here runs shadowBlur per
// frame. Sprites are baked at the canvas's real pixel scale, so they stay
// sharp at any resolution, and are rebaked only when the paddle's size,
// colour or the screen scale changes.
//
// Each draw gets the paddle's motion state (paddle.motion, stepped in
// paddle.js): t is its animation clock, which runs faster while the paddle
// moves, as the ball comes in and just after a hit, and the designs read
// impactY, sinceHit and react ('win' / 'lose') for their own reactions.
(function () {
    'use strict';

    const LIST = [
        { id: 'classic', name: 'Classic', blurb: 'The original neon block' },
        { id: 'neonBlade', name: 'Satelliten', blurb: 'Solar-panel spine with satellites in orbit' },
        { id: 'shieldWall', name: 'World Shield', blurb: 'Honeycomb energy shield around a turning globe' },
        { id: 'arcadeBlock', name: 'AI Rebel', blurb: 'Armour plates and an eye that tracks the ball' },
        { id: 'prismGlass', name: 'Prizma', blurb: 'Faceted crystal with a sweeping spectrum' },
        { id: 'riptide', name: 'Riptide', blurb: 'A glass tube of liquid that sloshes as you move' },
        { id: 'magmaCore', name: 'Magma', blurb: 'Cracked basalt with lava veins that flare on every hit' },
        { id: 'bassline', name: 'Bassline', blurb: 'Speaker stack with level meters that dance to the music' },
    ];
    const IDS = LIST.map((d) => d.id);
    const PAD = 22;                 // logical px of room around the paddle for glow
    const WHITE = [255, 255, 255];
    const BLACK = [0, 0, 0];
    const TAU = Math.PI * 2;

    // ── Colour helpers ────────────────────────────────────────────────
    let probe = null;
    const parsed = new Map();
    function parse(color) {
        const key = String(color || '#00ffd6');
        let rgb = parsed.get(key);
        if (rgb) return rgb;
        if (!probe) probe = document.createElement('canvas').getContext('2d');
        probe.fillStyle = '#00ffd6';
        probe.fillStyle = key;
        const v = probe.fillStyle;
        if (v[0] === '#') {
            rgb = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
        } else {
            const m = v.match(/[\d.]+/g) || [0, 255, 214];
            rgb = [Number(m[0]), Number(m[1]), Number(m[2])];
        }
        parsed.set(key, rgb);
        return rgb;
    }
    const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    }

    // A sprite covers the paddle plus PAD on every side; its context is set
    // up so (0, 0) is the paddle's centre in logical px.
    function sprite(w, h, s) {
        const canvas = makeCanvas((w + PAD * 2) * s, (h + PAD * 2) * s);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(s, 0, 0, s, (w / 2 + PAD) * s, (h / 2 + PAD) * s);
        return { canvas, ctx };
    }

    function drawSprite(ctx, spr, w, h) {
        ctx.drawImage(spr, -w / 2 - PAD, -h / 2 - PAD, w + PAD * 2, h + PAD * 2);
    }

    // Draw a horizontal band (logical y0..y1) of a sprite.
    function drawSpriteBand(ctx, spr, w, h, s, y0, y1) {
        y0 = Math.max(y0, -h / 2 - PAD);
        y1 = Math.min(y1, h / 2 + PAD);
        if (y1 <= y0) return;
        const sy = (y0 + h / 2 + PAD) * s;
        const sh = (y1 - y0) * s;
        ctx.drawImage(spr, 0, sy, spr.width, sh, -w / 2 - PAD, y0, w + PAD * 2, y1 - y0);
    }

    // Draw the logical rect x0..x1, y0..y1 of a sprite.
    function drawSpriteRect(ctx, spr, w, h, s, x0, y0, x1, y1) {
        if (x1 <= x0 || y1 <= y0) return;
        const sx = (x0 + w / 2 + PAD) * s, sy = (y0 + h / 2 + PAD) * s;
        ctx.drawImage(spr, sx, sy, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0);
    }

    // 0..1 envelopes for the point reactions: rise fast, hold, fade.
    function reactEnv(m, type) {
        if (!m || m.react !== type) return 0;
        const t = m.reactT;
        return Math.min(1, t / 0.12) * Math.max(0, 1 - Math.max(0, t - 0.5) / 0.6);
    }

    // Seeded random numbers, so a design's rough edges and cracks come out
    // the same every time it is baked.
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // Elongated hexagon with pointed ends (World Shield, Prizma).
    function hexPoints(hw, hh, k) {
        return [[0, -hh], [hw, -hh + k], [hw, hh - k], [0, hh], [-hw, hh - k], [-hw, -hh + k]];
    }
    function polyPath(ctx, pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
    }
    function pointOnPolygon(pts, t) {
        const lens = [];
        let total = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
            lens.push(l);
            total += l;
        }
        let d = (((t % 1) + 1) % 1) * total;
        for (let i = 0; i < pts.length; i++) {
            if (d <= lens[i]) {
                const a = pts[i], b = pts[(i + 1) % pts.length], k = d / (lens[i] || 1);
                return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
            }
            d -= lens[i];
        }
        return pts[0];
    }

    // Soft dot: a bright core and a faint halo, drawn under 'lighter'.
    // The halo is kept tight so small accents stay crisp next to each other.
    function glowDot(ctx, x, y, r, core, halo, alpha) {
        ctx.globalAlpha = alpha * 0.16;
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
        ctx.globalAlpha = alpha * 0.42;
        ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, TAU); ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    function star(ctx, x, y, r) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.closePath();
        ctx.fill();
    }

    // Saturated reds and magentas bloom more on a dark court than cyan does
    // at the same alpha, and the small accents start to run together. Scale
    // baked glow down for them so both sides read equally clean.
    function bloomFor(c) {
        const redness = clamp((c[0] - Math.max(c[1], c[2])) / 255, 0, 1);
        return 1 - 0.32 * redness;
    }

    // Soft drop shadow inside a shape: dark along the right and bottom
    // edges, a light lip along the left and top. Gives flat fills some
    // thickness. The caller has already built the path.
    function innerBevel(g, x0, y0, x1, y1, depth) {
        g.save();
        g.clip();
        const sx = g.createLinearGradient(x0, 0, x1, 0);
        sx.addColorStop(0, 'rgba(255,255,255,0.16)');
        sx.addColorStop(Math.min(0.45, depth / (x1 - x0)), 'rgba(255,255,255,0)');
        sx.addColorStop(Math.max(0.55, 1 - depth / (x1 - x0)), 'rgba(0,0,0,0)');
        sx.addColorStop(1, 'rgba(0,0,0,0.42)');
        g.fillStyle = sx;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.restore();
    }

    // Brushed gunmetal, lit from the upper left.
    function metalGradient(g, x0, x1) {
        const mg = g.createLinearGradient(x0, 0, x1, 0);
        mg.addColorStop(0, '#5b6576');
        mg.addColorStop(0.35, '#d4dbe6');
        mg.addColorStop(0.55, '#7d8797');
        mg.addColorStop(1, '#2a303b');
        return mg;
    }

    // ── Satelliten ────────────────────────────────────────────────────
    // A satellite stretched into a paddle: solar-panel wings either side of
    // a central hub, dish antennas at both ends, and three small satellites
    // orbiting the whole paddle (they pass behind it on the far side).
    const satelliten = {
        layout(w, h) {
            const hw = w / 2, hh = h / 2;
            const endH = clamp(w * 0.75, 8, 18);        // room for the antenna
            const hubR = clamp(w * 0.58, 5, 14);
            const gap = hubR + 3;
            const cellH = clamp(h / 14, 6, 12);
            const panels = [];
            for (const dir of [-1, 1]) {
                const a = dir < 0 ? -hh + endH : gap;
                const b = dir < 0 ? -gap : hh - endH;
                const n = Math.max(2, Math.round((b - a) / cellH));
                panels.push({ y0: a, y1: b, n });
            }
            return { hw, hh, endH, hubR, panels };
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, endH, hubR } = L;
            const light = mix(c, WHITE, 0.6), deep = mix(c, BLACK, 0.72), mid = mix(c, BLACK, 0.45);
            const body = sprite(w, h, s), hi = sprite(w, h, s);
            const g = body.ctx;

            const bloom = bloomFor(c);
            const boomY = hh - endH;                     // cross booms at the panel ends
            const boomX = hw + 4.5;

            // Glow under the panels and hub.
            g.save();
            g.shadowColor = rgba(c, 0.95 * bloom);
            g.shadowBlur = 16 * s * bloom;
            g.fillStyle = rgba(c, 0.35 * bloom);
            for (const p of L.panels) { roundRect(g, -hw, p.y0, w, p.y1 - p.y0, 2); g.fill(); }
            g.beginPath(); g.arc(0, 0, hubR, 0, TAU); g.fill();
            g.restore();

            // Spine (runs end to end, under everything else).
            const spineW = Math.max(2, w * 0.2);
            const sg = g.createLinearGradient(-spineW / 2, 0, spineW / 2, 0);
            sg.addColorStop(0, '#3a4252'); sg.addColorStop(0.5, '#c9d3e2'); sg.addColorStop(1, '#3a4252');
            g.fillStyle = sg;
            g.fillRect(-spineW / 2, -hh + 2, spineW, h - 4);

            // Solar panels: two columns of cells either side of the spine.
            for (const p of L.panels) {
                const ph = p.y1 - p.y0, ch = ph / p.n;
                g.fillStyle = '#060a14';
                roundRect(g, -hw, p.y0, w, ph, 2); g.fill();
                for (let i = 0; i < p.n; i++) {
                    const y = p.y0 + i * ch;
                    for (const side of [-1, 1]) {
                        const x0 = side < 0 ? -hw + 1 : spineW / 2 + 0.8;
                        const cw = hw - spineW / 2 - 1.8;
                        const cg = g.createLinearGradient(x0, y, x0 + cw, y + ch);
                        cg.addColorStop(0, rgba(mid, 1));
                        cg.addColorStop(0.55, rgba(deep, 1));
                        cg.addColorStop(1, rgba(mix(c, BLACK, 0.6), 1));
                        g.fillStyle = cg;
                        g.fillRect(x0, y + 0.8, cw, ch - 1.6);
                        // Diagonal sheen on each cell.
                        g.fillStyle = 'rgba(255,255,255,0.10)';
                        g.beginPath();
                        g.moveTo(x0, y + 0.8); g.lineTo(x0 + cw * 0.55, y + 0.8); g.lineTo(x0, y + ch * 0.75); g.closePath();
                        g.fill();
                        // Lit top lip and shadowed bottom edge: each cell sits in a recess.
                        g.fillStyle = 'rgba(255,255,255,0.16)';
                        g.fillRect(x0, y + 0.8, cw, 0.5);
                        g.fillStyle = 'rgba(0,0,0,0.45)';
                        g.fillRect(x0, y + ch - 1.3, cw, 0.5);
                        hi.ctx.fillStyle = rgba(light, 1);
                        hi.ctx.fillRect(x0, y + 0.8, cw, ch - 1.6);
                    }
                }
                // Gunmetal frame with a thin neon trace inside it.
                g.strokeStyle = metalGradient(g, -hw, hw);
                g.lineWidth = 1.3;
                roundRect(g, -hw + 0.65, p.y0 + 0.65, w - 1.3, ph - 1.3, 2); g.stroke();
                g.strokeStyle = rgba(c, 0.6);
                g.lineWidth = 0.6;
                roundRect(g, -hw + 1.5, p.y0 + 1.5, w - 3, ph - 3, 1.5); g.stroke();
            }

            // Cross booms where the panels meet the antennas: a truss that
            // sticks out past the panels, so the paddle reads as a satellite
            // and not a bar even at a glance.
            for (const dir of [-1, 1]) {
                const y = dir * boomY;
                g.fillStyle = metalGradient(g, -boomX, boomX);
                g.fillRect(-boomX, y - 1.3, boomX * 2, 2.6);
                g.fillStyle = 'rgba(0,0,0,0.5)';
                for (let x = -boomX + 2; x < boomX - 1; x += 2.6) g.fillRect(x, y - 0.6, 1, 1.2);
                g.fillStyle = 'rgba(255,255,255,0.35)';
                g.fillRect(-boomX, y - 1.3, boomX * 2, 0.5);
                g.fillStyle = '#1a1f28';
                for (const sx of [-1, 1]) {
                    g.beginPath(); g.arc(sx * boomX, y, 1.9, 0, TAU); g.fill();
                }
            }

            // Hub: metal collar, dark disc, bright ring, light core.
            g.fillStyle = metalGradient(g, -hubR - 1.6, hubR + 1.6);
            g.beginPath(); g.arc(0, 0, hubR + 1.6, 0, TAU); g.fill();
            g.fillStyle = '#05070d';
            g.beginPath(); g.arc(0, 0, hubR, 0, TAU); g.fill();
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1.4;
            g.beginPath(); g.arc(0, 0, hubR - 1.1, 0, TAU); g.stroke();
            g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
            g.beginPath(); g.arc(0.5, 0.6, hubR - 2.4, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
            g.strokeStyle = rgba(light, 0.6); g.lineWidth = 0.8;
            g.beginPath(); g.arc(0, 0, hubR * 0.62, 0, TAU); g.stroke();
            const core = g.createRadialGradient(0, 0, 0, 0, 0, hubR * 0.5);
            core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, rgba(light, 1)); core.addColorStop(1, rgba(c, 0));
            g.fillStyle = core;
            g.beginPath(); g.arc(0, 0, hubR * 0.5, 0, TAU); g.fill();

            // Dish antennas at both ends.
            for (const dir of [-1, 1]) {
                const baseY = dir * (hh - endH);
                const dishY = dir * (hh - endH * 0.55);
                g.strokeStyle = '#9aa6b8'; g.lineWidth = 1.2;
                g.beginPath(); g.moveTo(0, baseY); g.lineTo(0, dir * (hh - 1.5)); g.stroke();
                g.fillStyle = '#c3ccd9';
                g.beginPath();
                g.ellipse(0, dishY, Math.min(hw * 0.95, 9), endH * 0.2, 0, dir < 0 ? Math.PI : 0, dir < 0 ? TAU : Math.PI);
                g.closePath(); g.fill();
                g.strokeStyle = rgba(c, 0.9); g.lineWidth = 1;
                g.stroke();
            }
            L.boomY = boomY; L.boomX = boomX;
            return { body: body.canvas, hi: hi.canvas, L };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const L = k.sprites.L;
            const { hw, hh, endH, hubR } = L;
            const m = p.motion;
            // The satellites scatter outwards on a hit and on a won point.
            const spread = 1 + hitGlow * 0.45 + reactEnv(m, 'win') * 0.35 - reactEnv(m, 'lose') * 0.15;
            const orbit = (back) => {
                for (let i = 0; i < 3; i++) {
                    for (let trail = 2; trail >= 0; trail--) {
                        const a = t * 1.25 + i * (TAU / 3) + p._seed - trail * 0.09;
                        const z = Math.cos(a);
                        if ((z < 0) !== back) continue;
                        const x = z * (hw + 7) * spread;
                        const y = Math.sin(a) * (hh * 0.86) * (1 + hitGlow * 0.06);
                        const size = (back ? 1.4 : 2.0) * (trail ? 0.75 : 1);
                        glowDot(ctx, x, y, size, back ? rgba(light, 1) : '#ffffff', rgba(c, 1), (back ? 0.35 : 1) * (1 - trail * 0.32));
                    }
                }
            };
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            orbit(true);
            ctx.restore();

            drawSprite(ctx, k.sprites.body, w, h);

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // A wave of light running over the solar cells.
            const span = h - endH * 2;
            const y = -hh + endH + (((t * 0.55 + p._seed) % 1) * span);
            for (let b = 0; b < 3; b++) {
                ctx.globalAlpha = (0.28 - b * 0.08) + hitGlow * 0.35;
                drawSpriteBand(ctx, k.sprites.hi, w, h, s, y - 3 - b * 4, y + 3 + b * 4);
            }
            if (hitGlow > 0.01) {
                ctx.globalAlpha = hitGlow * 0.45;
                drawSprite(ctx, k.sprites.hi, w, h);
            }
            // Hub pulse ring.
            const ring = (t * 0.8 + p._seed) % 1;
            ctx.globalAlpha = (1 - ring) * 0.7;
            ctx.strokeStyle = rgba(c, 1);
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(0, 0, hubR + ring * 10, 0, TAU); ctx.stroke();
            // Antenna tips blink in turn.
            const blink = Math.floor(t * 1.6) % 2;
            for (const dir of [-1, 1]) {
                const on = (dir < 0) === (blink === 0);
                glowDot(ctx, 0, dir * (hh - 1.5), 1.6, '#ffffff', rgba(c, 1), on ? 1 : 0.25);
                // Boom tip lights: red and green like real navigation lights.
                for (const sx of [-1, 1]) {
                    const nav = sx < 0 ? '#ff5a5a' : '#5aff8c';
                    glowDot(ctx, sx * L.boomX, dir * L.boomY, 1.05, nav, nav, on ? 0.95 : 0.35);
                }
            }
            orbit(false);
            ctx.restore();
        },
    };

    // ── World Shield ──────────────────────────────────────────────────
    // A pointed energy shield: honeycomb field inside a bright rim, a globe
    // at its heart with meridians that turn, and ripples running outwards
    // through the honeycomb.
    const worldShield = {
        shape(w, h) {
            const hw = w / 2, hh = h / 2;
            const k = Math.min(w * 0.95, h * 0.14);
            return { hw, hh, k, pts: hexPoints(hw, hh, k) };
        },
        honeycomb(g, w, h, r) {
            const dx = r * Math.sqrt(3), dy = r * 1.5;
            g.beginPath();
            for (let row = -Math.ceil(h / 2 / dy) - 1, ri = 0; row * dy < h / 2 + dy; row++, ri++) {
                const y = row * dy;
                const off = (row & 1) ? dx / 2 : 0;
                for (let x = -w / 2 - dx + off; x < w / 2 + dx; x += dx) {
                    for (let i = 0; i < 6; i++) {
                        const a = Math.PI / 6 + i * Math.PI / 3;
                        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
                        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
                    }
                    g.closePath();
                }
            }
        },
        bake(c, w, h, s) {
            const S = this.shape(w, h);
            const { hw, hh, pts } = S;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s), mesh = sprite(w, h, s);
            const g = body.ctx;
            const R = clamp(hw * 0.92, 4, 15);

            const bloom = bloomFor(c);
            g.save();
            g.shadowColor = rgba(c, bloom);
            g.shadowBlur = 18 * s * bloom;
            g.fillStyle = rgba(c, 0.4 * bloom);
            polyPath(g, pts); g.fill();
            g.restore();

            // Guard fins either side of the globe: they stick out past the
            // shield, so it reads as a cross-guard shape and not a bar.
            const finW = 6, finH = clamp(R * 1.9, 10, 26);
            const fin = (sx) => [[sx * (hw - 1), -finH], [sx * (hw + finW), -finH * 0.25], [sx * (hw + finW), finH * 0.25], [sx * (hw - 1), finH]];
            for (const sx of [-1, 1]) {
                const fp = fin(sx);
                g.fillStyle = metalGradient(g, sx < 0 ? -hw - finW : hw - 1, sx < 0 ? -hw + 1 : hw + finW);
                polyPath(g, fp); g.fill();
                g.strokeStyle = rgba(c, 0.9); g.lineWidth = 0.7;
                polyPath(g, fp); g.stroke();
                g.fillStyle = 'rgba(0,0,0,0.5)';
                g.fillRect(sx < 0 ? -hw - finW + 1.2 : hw + 1.4, -finH * 0.12, finW - 2.4, finH * 0.24);
            }

            const bg = g.createLinearGradient(-hw, 0, hw, 0);
            bg.addColorStop(0, rgba(mix(c, BLACK, 0.88), 1));
            bg.addColorStop(0.5, rgba(mix(c, BLACK, 0.7), 1));
            bg.addColorStop(1, rgba(mix(c, BLACK, 0.88), 1));
            g.fillStyle = bg;
            polyPath(g, pts); g.fill();

            const cell = Math.max(3, w * 0.2);
            g.save();
            polyPath(g, pts); g.clip();
            this.honeycomb(g, w, h, cell);
            g.strokeStyle = rgba(c, 0.38); g.lineWidth = 0.7; g.stroke();
            // Vertical sheen down the middle.
            const sheen = g.createLinearGradient(-hw, 0, hw, 0);
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.42, 'rgba(255,255,255,0.08)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,0.14)');
            sheen.addColorStop(0.58, 'rgba(255,255,255,0.08)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = sheen;
            g.fillRect(-hw, -hh, w, h);
            g.restore();

            const m = mesh.ctx;
            m.save();
            polyPath(m, pts); m.clip();
            this.honeycomb(m, w, h, cell);
            m.strokeStyle = rgba(light, 1); m.lineWidth = 1.1; m.stroke();
            m.restore();

            // Depth: the field is recessed behind a metal rim.
            polyPath(g, pts);
            innerBevel(g, -hw, -hh, hw, hh, 4);
            const inset = hexPoints(hw - 2.6, hh - 3.2, S.k - 0.6);
            g.strokeStyle = rgba(light, 0.4); g.lineWidth = 0.9;
            polyPath(g, inset); g.stroke();
            // Rim: a gunmetal band with the energy edge glowing just inside it.
            g.strokeStyle = metalGradient(g, -hw, hw); g.lineWidth = 2.2;
            polyPath(g, pts); g.stroke();
            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 6 * s * bloom;
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1;
            polyPath(g, hexPoints(hw - 1.4, hh - 1.8, S.k - 0.3)); g.stroke();
            g.restore();

            // Bosses above and below the globe.
            for (const dir of [-1, 1]) {
                const y = dir * hh * 0.56, d = Math.min(hw * 0.5, 5);
                g.fillStyle = rgba(light, 0.95);
                g.beginPath(); g.moveTo(0, y - d); g.lineTo(d * 0.7, y); g.lineTo(0, y + d); g.lineTo(-d * 0.7, y); g.closePath(); g.fill();
                g.strokeStyle = rgba(c, 1); g.lineWidth = 0.8; g.stroke();
            }

            // Globe: dark sea, bright limb, latitude lines.
            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 8 * s * bloom;
            const sea = g.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
            sea.addColorStop(0, rgba(mix(c, WHITE, 0.25), 0.9));
            sea.addColorStop(0.55, rgba(mix(c, BLACK, 0.45), 1));
            sea.addColorStop(1, rgba(mix(c, BLACK, 0.8), 1));
            g.fillStyle = sea;
            g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
            g.restore();
            g.strokeStyle = rgba(light, 0.55); g.lineWidth = 0.7;
            for (const ly of [-0.5, 0, 0.5]) {
                const rx = R * Math.sqrt(1 - ly * ly);
                g.beginPath(); g.ellipse(0, ly * R, rx, R * 0.09, 0, 0, TAU); g.stroke();
            }
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1.3;
            g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
            return { body: body.canvas, mesh: mesh.canvas, S, R };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const { S, R } = k.sprites;
            drawSprite(ctx, k.sprites.body, w, h);

            // Turning meridians.
            ctx.save();
            ctx.lineWidth = 0.9;
            for (let j = 0; j < 3; j++) {
                const ph = t * 0.9 + p._seed + j * (Math.PI / 3);
                const rx = R * Math.abs(Math.cos(ph));
                ctx.strokeStyle = rgba(light, Math.sin(ph) > 0 ? 0.85 : 0.3);
                ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.3, rx), R, 0, 0, TAU); ctx.stroke();
            }
            ctx.restore();

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Ripples running from the globe to the tips.
            for (let r = 0; r < 2; r++) {
                const q = ((t * 0.55 + p._seed + r * 0.5) % 1);
                const d = R + q * (S.hh - R);
                ctx.globalAlpha = (1 - q) * 0.75;
                drawSpriteBand(ctx, k.sprites.mesh, w, h, s, -d - 4, -d + 4);
                drawSpriteBand(ctx, k.sprites.mesh, w, h, s, d - 4, d + 4);
            }
            if (hitGlow > 0.01) {
                ctx.globalAlpha = hitGlow * 0.85;
                drawSprite(ctx, k.sprites.mesh, w, h);
            }
            // A ripple spreads through the honeycomb from where the ball hit.
            const m = p.motion;
            if (m && m.sinceHit < 0.5) {
                const q = m.sinceHit / 0.5, iy = m.impactY * S.hh, d = q * S.hh * 1.3;
                ctx.globalAlpha = (1 - q) * 0.95;
                drawSpriteBand(ctx, k.sprites.mesh, w, h, s, iy - d - 3, iy - d + 3);
                drawSpriteBand(ctx, k.sprites.mesh, w, h, s, iy + d - 3, iy + d + 3);
            }
            // A spark running round the rim.
            for (let i = 0; i < 2; i++) {
                const [x, y] = pointOnPolygon(S.pts, t * 0.18 + p._seed + i * 0.5);
                glowDot(ctx, x, y, 1.6, '#ffffff', rgba(c, 1), 0.95);
            }
            ctx.restore();
        },
    };

    // ── AI Rebel ──────────────────────────────────────────────────────
    // A rogue machine: stacked armour plates over a glowing core that shows
    // through the seams, and a single eye in a visor slot that follows the
    // ball. Now and then it glitches.
    const aiRebel = {
        layout(w, h) {
            const hw = w / 2, hh = h / 2;
            const n = Math.max(5, Math.round(h / 17));
            const gap = 2;
            const ph = (h - 4 - gap * (n - 1)) / n;
            const plates = [];
            for (let i = 0; i < n; i++) {
                const y0 = -hh + 2 + i * (ph + gap);
                plates.push({ y0, y1: y0 + ph });
            }
            const visorH = Math.min(h * 0.36, 60);
            const visorW = Math.max(4, w * 0.5);
            const shoulder = 3;
            return { hw, hh, plates, gap, visorH, visorW, shoulder };
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, plates, gap, visorH, visorW } = L;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s);
            const g = body.ctx;
            const r = Math.min(w * 0.3, 6);

            const bloom = bloomFor(c);
            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 15 * s * bloom;
            g.fillStyle = rgba(c, 0.38 * bloom);
            roundRect(g, -hw, -hh, w, h, r); g.fill();
            g.restore();

            // Glowing core that shows through the seams.
            const core = g.createLinearGradient(-hw, 0, hw, 0);
            core.addColorStop(0, rgba(mix(c, BLACK, 0.3), 1));
            core.addColorStop(0.5, rgba(light, 1));
            core.addColorStop(1, rgba(mix(c, BLACK, 0.3), 1));
            g.fillStyle = core;
            roundRect(g, -hw, -hh, w, h, r); g.fill();

            // Armour plates. The end plates are heavy shoulder guards that
            // jut out past the body with chamfered corners, and the plates in
            // between alternate in width, so the outline is stepped and
            // mechanical rather than a plain bar.
            const last = plates.length - 1;
            for (let i = 0; i < plates.length; i++) {
                const p = plates[i];
                const pg = g.createLinearGradient(0, p.y0, 0, p.y1);
                pg.addColorStop(0, '#454d5b');
                pg.addColorStop(0.18, '#262b34');
                pg.addColorStop(1, '#0d1015');
                g.fillStyle = pg;
                if (i === 0 || i === last) {
                    const x = hw + L.shoulder, ch = Math.min(3.5, (p.y1 - p.y0) * 0.35);
                    const top = i === 0;
                    g.beginPath();
                    if (top) {
                        g.moveTo(-hw + r * 0.6, p.y0); g.lineTo(hw - r * 0.6, p.y0);
                        g.lineTo(x, p.y0 + ch + r * 0.4); g.lineTo(x, p.y1); g.lineTo(-x, p.y1); g.lineTo(-x, p.y0 + ch + r * 0.4);
                    } else {
                        g.moveTo(-x, p.y0); g.lineTo(x, p.y0); g.lineTo(x, p.y1 - ch - r * 0.4);
                        g.lineTo(hw - r * 0.6, p.y1); g.lineTo(-hw + r * 0.6, p.y1); g.lineTo(-x, p.y1 - ch - r * 0.4);
                    }
                    g.closePath(); g.fill();
                    g.strokeStyle = rgba(c, 0.55); g.lineWidth = 0.7; g.stroke();
                    // Bolt heads on the shoulders.
                    g.fillStyle = '#8b95a5';
                    const by = (p.y0 + p.y1) / 2;
                    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * (x - 1.6), by, 0.9, 0, TAU); g.fill(); }
                } else {
                    const inset = i % 2 ? 1.6 : 0.6;
                    roundRect(g, -hw + inset, p.y0, w - inset * 2, p.y1 - p.y0, Math.min(2, r));
                    g.fill();
                }
                // Each plate is a curved shell: lit on the left, dark on the right.
                g.save();
                g.beginPath(); g.rect(-hw - L.shoulder, p.y0, w + L.shoulder * 2, p.y1 - p.y0);
                innerBevel(g, -hw - (i === 0 || i === last ? L.shoulder : 0), p.y0, hw + (i === 0 || i === last ? L.shoulder : 0), p.y1, 3);
                g.restore();
                g.fillStyle = 'rgba(255,255,255,0.26)';
                g.fillRect(-hw + 2, p.y0 + 0.6, w - 4, 0.8);
                g.fillStyle = 'rgba(0,0,0,0.55)';
                g.fillRect(-hw + 2, p.y1 - 0.7, w - 4, 0.7);
                // Vent slits on the end plates.
                if (i === 0 || i === plates.length - 1 || i === 1 || i === plates.length - 2) {
                    g.fillStyle = 'rgba(0,0,0,0.65)';
                    const cy = (p.y0 + p.y1) / 2;
                    for (let v = -1; v <= 1; v++) g.fillRect(-hw * 0.55, cy + v * 2.6 - 0.5, w * 0.55, 1);
                }
            }

            // Edge rails.
            const ry0 = plates[0].y1, ry1 = plates[last].y0;
            g.fillStyle = rgba(c, 0.85);
            g.fillRect(-hw + 0.4, ry0, 1, ry1 - ry0);
            g.fillRect(hw - 1.4, ry0, 1, ry1 - ry0);

            // Rebel mark on the top plate: two slashes.
            const top = plates[0];
            const my = (top.y0 + top.y1) / 2;
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1.3; g.lineCap = 'round';
            g.beginPath();
            for (const ox of [-2.2, 2.2]) { g.moveTo(ox - 1.6, my + 2.6); g.lineTo(ox + 1.6, my - 2.6); }
            g.stroke();

            // Visor slot.
            g.fillStyle = '#020204';
            roundRect(g, -visorW / 2, -visorH / 2, visorW, visorH, visorW / 2); g.fill();
            g.strokeStyle = rgba(c, 0.75); g.lineWidth = 1;
            roundRect(g, -visorW / 2, -visorH / 2, visorW, visorH, visorW / 2); g.stroke();
            g.fillStyle = rgba(c, 0.14);
            for (let y = -visorH / 2 + 3; y < visorH / 2 - 2; y += 3) g.fillRect(-visorW / 2 + 1.5, y, visorW - 3, 0.7);

            const seams = [];
            for (let i = 1; i < plates.length; i++) seams.push(plates[i].y0 - gap / 2);
            // LED sockets on the rails, one per plate between the visor and the shoulders.
            L.leds = [];
            for (let i = 1; i < last; i++) {
                const cy = (plates[i].y0 + plates[i].y1) / 2;
                if (Math.abs(cy) < visorH / 2 + 2) continue;
                for (const sx of [-1, 1]) {
                    const x = sx * (hw - 0.9);
                    L.leds.push({ x, y: cy });
                    g.fillStyle = '#05060a';
                    g.fillRect(x - 1, cy - 1.6, 2, 3.2);
                }
            }
            return { body: body.canvas, L, seams };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const { L, seams } = k.sprites;
            const { hw, visorH, visorW } = L;

            // Glitch: every few seconds the body tears sideways for a moment,
            // and hard when it loses a point.
            const m = p.motion;
            const gl = (t + p._seed * 2.3) % 3.4;
            if (gl < 0.14 || (m?.react === 'lose' && m.reactT < 0.35)) {
                const slices = 5, bandH = h / slices, step = Math.floor(t * 40);
                for (let i = 0; i < slices; i++) {
                    const off = (((step * 7 + i * 13) % 5) - 2) * 1.6;
                    const y0 = -h / 2 + i * bandH;
                    ctx.save();
                    ctx.translate(off, 0);
                    drawSpriteBand(ctx, k.sprites.body, w, h, s, i === 0 ? -h / 2 - PAD : y0, i === slices - 1 ? h / 2 + PAD : y0 + bandH);
                    ctx.restore();
                }
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = 'rgba(255,40,140,1)';
                ctx.fillRect(-hw - 2, -h / 2 + ((step * 37) % Math.max(1, Math.floor(h))), w, 2);
                ctx.fillStyle = 'rgba(40,220,255,1)';
                ctx.fillRect(-hw + 2, -h / 2 + ((step * 53 + 20) % Math.max(1, Math.floor(h))), w, 2);
                ctx.restore();
            } else {
                drawSprite(ctx, k.sprites.body, w, h);
            }

            // The eye follows the ball (or scans when there is none).
            const game = window.game;
            const ball = game?.ball;
            const range = visorH / 2 - 4;
            let target;
            if (ball && (game.running || game.introActive) && Number.isFinite(ball.pos?.y)) {
                target = ball.pos.y - (p.pos.y + p.h / 2);
            } else {
                target = Math.sin(t * 1.1 + p._seed) * range;
            }
            target = clamp(target, -range, range);
            const now = performance.now();
            const dt = p._eyeAt ? Math.min(0.1, (now - p._eyeAt) / 1000) : 0;
            p._eyeAt = now;
            p._eyeY = p._eyeY == null ? target : p._eyeY + (target - p._eyeY) * Math.min(1, dt * 10);
            const ey = p._eyeY;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Seams pulse outwards from the eye like a heartbeat.
            const beat = (t * 0.9 + p._seed) % 1;
            const reach = beat * (h / 2);
            for (const y of seams) {
                const d = Math.abs(Math.abs(y - ey) - reach);
                const a = Math.max(0, 1 - d / 10) * (1 - beat) * 0.9 + hitGlow * 0.6;
                if (a <= 0.01) continue;
                ctx.globalAlpha = Math.min(1, a);
                ctx.fillStyle = rgba(light, 1);
                ctx.fillRect(-hw + 1, y - 1, w - 2, 2);
            }
            // Eye: opens wide on a hit, narrows to a slit when it loses a
            // point and turns into a grin when it wins one.
            const ew = visorW * 0.72;
            const win = reactEnv(m, 'win'), lose = reactEnv(m, 'lose');
            const open = Math.max(0.35, 1 + hitGlow * 0.9 + (m?.ant || 0) * 0.3 - lose * 0.65);
            ctx.globalAlpha = 0.35 + hitGlow * 0.4;
            ctx.fillStyle = rgba(c, 1);
            ctx.beginPath(); ctx.ellipse(0, ey, ew * 0.9, 7 * Math.min(1.4, open), 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
            if (win > 0.05) {
                ctx.strokeStyle = rgba(light, 1);
                ctx.lineWidth = 1.8; ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-ew / 2, ey + 1.5 * win); ctx.quadraticCurveTo(0, ey - 4 * win, ew / 2, ey + 1.5 * win);
                ctx.stroke();
                ctx.globalAlpha = 1 - win;
            }
            if (win < 0.95) {
                const eh = 4 * open;
                ctx.fillStyle = rgba(light, 1);
                roundRect(ctx, -ew / 2, ey - eh / 2, ew, eh, eh / 2); ctx.fill();
                ctx.fillStyle = '#ffffff';
                roundRect(ctx, -ew / 4, ey - eh / 4, ew / 2, eh / 2, eh / 4); ctx.fill();
            }
            ctx.globalAlpha = 1;
            // Visor scan flicker.
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = rgba(c, 1);
            const sy = -visorH / 2 + ((t * 30) % visorH);
            ctx.fillRect(-visorW / 2 + 1.5, sy, visorW - 3, 1);
            // Status LEDs down the edge rails, chasing towards the eye.
            const leds = L.leds;
            for (let i = 0; i < leds.length; i++) {
                const ph = (t * 2.4 - Math.abs(leds[i].y) / 22 + p._seed) % 1;
                const on = ph < 0.3 ? 1 - ph / 0.3 : 0;
                ctx.globalAlpha = 0.18 + on * 0.82;
                ctx.fillStyle = on > 0.5 ? '#ffffff' : rgba(light, 1);
                ctx.fillRect(leds[i].x - 0.6, leds[i].y - 1.1, 1.2, 2.2);
            }
            ctx.restore();
        },
    };

    // ── Prizma ────────────────────────────────────────────────────────
    // A cut crystal: pointed ends, three long facets catching the light,
    // a spectrum sweeping through the glass and glints at the corners.
    const prizma = {
        shape(w, h) {
            const hw = w / 2, hh = h / 2;
            const k = Math.min(w * 1.15, h * 0.17);
            const xr = hw * 0.36, ky = k * 0.62;
            const T = [0, -hh], B = [0, hh];
            const A = [
                [-hw, -hh + k], [-xr, -hh + ky], [xr, -hh + ky], [hw, -hh + k],
                [hw, hh - k], [xr, hh - ky], [-xr, hh - ky], [-hw, hh - k],
            ];
            const facets = [
                { pts: [A[0], A[1], A[6], A[7]], tone: 'left' },
                { pts: [A[1], A[2], A[5], A[6]], tone: 'mid' },
                { pts: [A[2], A[3], A[4], A[5]], tone: 'right' },
                { pts: [T, A[0], A[1]], tone: 'tipL' },
                { pts: [T, A[1], A[2]], tone: 'tipM' },
                { pts: [T, A[2], A[3]], tone: 'tipR' },
                { pts: [B, A[7], A[6]], tone: 'tipR' },
                { pts: [B, A[6], A[5]], tone: 'tipM' },
                { pts: [B, A[5], A[4]], tone: 'tipL' },
            ];
            // Two smaller crystals grow out of opposite flanks, one high on the
            // left and one low on the right, so the outline is a cluster and
            // not a single bar.
            const shards = [];
            for (const sx of [-1, 1]) {
                const y = -sx * hh * 0.36;
                const dir = y < 0 ? -1 : 1;               // leans towards its nearer end
                const len = clamp(h * 0.15, 14, 24);
                const base0 = [sx * (hw - 1.5), y + dir * len * 0.3];
                const base1 = [sx * (hw - 1.5), y - dir * len * 0.4];
                const out = [sx * (hw + len * 0.26), y - dir * len * 0.2];
                const tip = [sx * (hw + len * 0.5), y + dir * len * 0.9];
                shards.push({ pts: [base0, tip, out, base1], lit: [base0, tip, out], tip });
            }
            return { hw, hh, k, xr, outline: hexPoints(hw, hh, k), facets, shards, verts: [T, B, ...A, ...shards.map((q) => q.tip)] };
        },
        bake(c, w, h, s) {
            const S = this.shape(w, h);
            const { hw, hh, outline, facets } = S;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s), flash = sprite(w, h, s);
            const g = body.ctx;

            const bloom = bloomFor(c);
            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 18 * s * bloom;
            g.fillStyle = rgba(c, 0.35 * bloom);
            polyPath(g, outline); g.fill();
            for (const q of S.shards) { polyPath(g, q.pts); g.fill(); }
            g.restore();

            // Side shards sit behind the main crystal.
            for (const q of S.shards) {
                g.fillStyle = 'rgba(4,6,12,0.9)';
                polyPath(g, q.pts); g.fill();
                g.fillStyle = rgba(mix(c, BLACK, 0.25), 0.7);
                polyPath(g, q.pts); g.fill();
                g.fillStyle = rgba(mix(c, WHITE, 0.55), 0.45);
                polyPath(g, q.lit); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.6;
                polyPath(g, q.lit); g.stroke();
                g.strokeStyle = rgba(c, 1); g.lineWidth = 1;
                polyPath(g, q.pts); g.stroke();
            }

            g.fillStyle = 'rgba(4,6,12,0.88)';
            polyPath(g, outline); g.fill();

            const tones = {
                left: rgba(mix(c, WHITE, 0.15), 0.5),
                mid: rgba(mix(c, WHITE, 0.55), 0.34),
                right: rgba(mix(c, BLACK, 0.3), 0.62),
                tipL: rgba(mix(c, WHITE, 0.4), 0.55),
                tipM: rgba(mix(c, WHITE, 0.75), 0.5),
                tipR: rgba(mix(c, BLACK, 0.15), 0.6),
            };
            for (const f of facets) {
                g.fillStyle = tones[f.tone];
                polyPath(g, f.pts); g.fill();
            }
            // Light inside the glass: soft vertical glow and a few refractions.
            g.save();
            polyPath(g, outline); g.clip();
            const inner = g.createLinearGradient(0, -hh, 0, hh);
            inner.addColorStop(0, 'rgba(255,255,255,0.22)');
            inner.addColorStop(0.3, 'rgba(255,255,255,0.02)');
            inner.addColorStop(0.7, 'rgba(255,255,255,0.02)');
            inner.addColorStop(1, 'rgba(255,255,255,0.16)');
            g.fillStyle = inner;
            g.fillRect(-hw, -hh, w, h);
            g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.7;
            for (let i = 0; i < 5; i++) {
                const y = -hh * 0.7 + i * hh * 0.35;
                g.beginPath(); g.moveTo(-hw, y + hw * 0.9); g.lineTo(hw, y - hw * 0.9); g.stroke();
            }
            g.restore();
            // Glass thickness: a darker band just inside the outline, where
            // light bends at the edge, and a bright line on the lit side.
            g.save();
            polyPath(g, outline); g.clip();
            g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 3.2;
            polyPath(g, outline); g.stroke();
            g.restore();
            g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 0.7;
            polyPath(g, hexPoints(hw - 1.9, hh - 2.6, S.k - 0.4)); g.stroke();
            // Facet edges.
            g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.75;
            for (const f of facets) { polyPath(g, f.pts); g.stroke(); }
            // Specular streak down the lit facet.
            const st = g.createLinearGradient(0, -hh, 0, hh);
            st.addColorStop(0, 'rgba(255,255,255,0)');
            st.addColorStop(0.25, 'rgba(255,255,255,0.55)');
            st.addColorStop(0.5, 'rgba(255,255,255,0.12)');
            st.addColorStop(0.7, 'rgba(255,255,255,0.4)');
            st.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = st;
            g.fillRect(-hw * 0.72, -hh + S.k, Math.max(0.8, hw * 0.16), h - S.k * 2);
            // Rim.
            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 6 * s * bloom;
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1.6;
            polyPath(g, outline); g.stroke();
            g.restore();
            g.strokeStyle = rgba(light, 0.9); g.lineWidth = 0.6;
            polyPath(g, outline); g.stroke();

            // Hit flash layer: the facets lit white.
            const f2 = flash.ctx;
            for (const f of facets) {
                f2.fillStyle = f.tone === 'right' || f.tone === 'tipR' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)';
                polyPath(f2, f.pts); f2.fill();
            }

            // Spectrum band, drawn through the glass as it sweeps.
            const bandH = Math.max(18, Math.min(34, h * 0.22));
            const band = makeCanvas((w + 24) * s, bandH * s);
            const b = band.getContext('2d');
            const sg = b.createLinearGradient(0, 0, 0, band.height);
            const spec = ['rgba(255,60,90,0)', 'rgba(255,70,90,0.85)', 'rgba(255,190,60,0.85)', 'rgba(120,255,120,0.85)',
                'rgba(60,220,255,0.85)', 'rgba(110,90,255,0.85)', 'rgba(200,80,255,0)'];
            spec.forEach((col, i) => sg.addColorStop(i / (spec.length - 1), col));
            b.fillStyle = sg;
            b.fillRect(0, 0, band.width, band.height);
            return { body: body.canvas, flash: flash.canvas, band, bandH, S };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, c, light } = k;
            const { S, band, bandH } = k.sprites;
            drawSprite(ctx, k.sprites.body, w, h);

            ctx.save();
            polyPath(ctx, S.outline);
            ctx.clip();
            ctx.globalCompositeOperation = 'lighter';
            // Spectrum sweep, slightly tilted, once every couple of seconds.
            const q = ((t * 0.42 + p._seed) % 1);
            const y = -S.hh - bandH + q * (h + bandH * 2);
            ctx.globalAlpha = 0.55;
            ctx.translate(0, y);
            ctx.rotate(-0.42);
            ctx.drawImage(band, -w / 2 - 12, -bandH / 2, w + 24, bandH);
            ctx.restore();

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Core light in the middle facet breathes.
            ctx.globalAlpha = 0.28 + 0.18 * Math.sin(t * 2.2 + p._seed) + hitGlow * 0.4;
            ctx.fillStyle = rgba(light, 1);
            ctx.fillRect(-0.8, -S.hh * 0.62, 1.6, S.hh * 1.24);
            if (hitGlow > 0.01) {
                ctx.globalAlpha = hitGlow * 0.9;
                drawSprite(ctx, k.sprites.flash, w, h);
            }
            // The corners nearest the ball flash together on a hit.
            const m = p.motion;
            const verts = S.verts;
            if (m && m.sinceHit < 0.35) {
                const q = m.sinceHit / 0.35, iy = m.impactY * S.hh;
                for (let i = 0; i < verts.length; i++) {
                    const near = 1 - Math.abs(verts[i][1] - iy) / (h * 0.45);
                    if (near <= 0) continue;
                    const a = Math.sin(Math.min(1, q * 1.4) * Math.PI) * near;
                    ctx.globalAlpha = a;
                    ctx.fillStyle = '#ffffff';
                    star(ctx, verts[i][0], verts[i][1], 3 + a * 6);
                }
            }
            // Glints pop on the crystal's corners in turn.
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < verts.length; i++) {
                const v = ((t * 0.55 + i * 0.29 + p._seed) % 1.6);
                if (v > 0.22) continue;
                const a = Math.sin((v / 0.22) * Math.PI);
                ctx.globalAlpha = a;
                star(ctx, verts[i][0], verts[i][1], 2 + a * 4);
                ctx.globalAlpha = a * 0.35;
                ctx.fillStyle = rgba(c, 1);
                ctx.beginPath(); ctx.arc(verts[i][0], verts[i][1], 4 + a * 3, 0, TAU); ctx.fill();
                ctx.fillStyle = '#ffffff';
            }
            ctx.restore();
        },
    };

    // ── Riptide ───────────────────────────────────────────────────────
    // A glass tube of glowing liquid between two metal caps. Light ripples
    // flow through it, bubbles rise, and the surface sloshes when the paddle
    // moves or stops. A hit sends a pressure ring through the liquid.
    const riptide = {
        layout(w, h) {
            const hw = w / 2, hh = h / 2;
            const cap = clamp(w * 0.85, 7, 13);
            const x0 = -hw + 1.8, x1 = hw - 1.8;
            const y0 = -hh + cap, y1 = hh - cap;
            return { hw, hh, cap, x0, x1, y0, y1, r: Math.max(1, (x1 - x0) / 2) };
        },
        innerPath(ctx, L) {
            roundRect(ctx, L.x0, L.y0 - 1, L.x1 - L.x0, L.y1 - L.y0 + 2, Math.min(3, L.r));
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, cap, x0, x1, y0, y1 } = L;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s);
            const g = body.ctx;
            const bloom = bloomFor(c);
            const R = Math.min(hw, 7);

            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 16 * s * bloom;
            g.fillStyle = rgba(c, 0.35 * bloom);
            roundRect(g, -hw, y0 - 2, w, y1 - y0 + 4, R); g.fill();
            g.restore();

            // Glass wall, then the liquid shaded like a cylinder.
            g.fillStyle = 'rgba(8,14,24,0.92)';
            roundRect(g, -hw, -hh + 2, w, h - 4, R); g.fill();
            const lg = g.createLinearGradient(x0, 0, x1, 0);
            lg.addColorStop(0, rgba(mix(c, BLACK, 0.7), 1));
            lg.addColorStop(0.3, rgba(mix(c, BLACK, 0.12), 1));
            lg.addColorStop(0.55, rgba(mix(c, BLACK, 0.32), 1));
            lg.addColorStop(1, rgba(mix(c, BLACK, 0.78), 1));
            g.fillStyle = lg;
            this.innerPath(g, L); g.fill();
            // Deeper colour towards the bottom of the column.
            g.save();
            this.innerPath(g, L); g.clip();
            const dg = g.createLinearGradient(0, y0, 0, y1);
            dg.addColorStop(0, 'rgba(255,255,255,0.10)');
            dg.addColorStop(0.5, 'rgba(0,0,0,0)');
            dg.addColorStop(1, 'rgba(0,0,0,0.35)');
            g.fillStyle = dg;
            g.fillRect(x0, y0 - 1, x1 - x0, y1 - y0 + 2);
            g.restore();
            // Etched level marks on the glass.
            g.fillStyle = 'rgba(255,255,255,0.22)';
            for (let y = y0 + 8; y < y1 - 4; y += 8) g.fillRect(x1 - 2.6, y, (y / 8) % 2 ? 1.6 : 2.6, 0.6);

            // Glass highlights: a long streak on the lit side, a thin rim.
            const hl = g.createLinearGradient(0, y0, 0, y1);
            hl.addColorStop(0, 'rgba(255,255,255,0)');
            hl.addColorStop(0.15, 'rgba(255,255,255,0.5)');
            hl.addColorStop(0.6, 'rgba(255,255,255,0.18)');
            hl.addColorStop(0.9, 'rgba(255,255,255,0.4)');
            hl.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = hl;
            g.fillRect(-hw * 0.55, y0, Math.max(0.8, hw * 0.22), y1 - y0);
            g.strokeStyle = rgba(light, 0.55); g.lineWidth = 0.7;
            roundRect(g, -hw + 0.4, -hh + 2.4, w - 0.8, h - 4.8, R); g.stroke();

            // Metal end caps with a neon seal where they meet the glass.
            for (const dir of [-1, 1]) {
                const ya = dir < 0 ? -hh : hh - cap - 1, hgt = cap + 1;
                g.fillStyle = metalGradient(g, -hw - 1, hw + 1);
                roundRect(g, -hw - 1, ya, w + 2, hgt, Math.min(3, hgt / 2)); g.fill();
                g.fillStyle = 'rgba(0,0,0,0.45)';
                for (let x = -hw + 1.5; x < hw - 1; x += 2.4) g.fillRect(x, ya + hgt * 0.3, 1, hgt * 0.4);
                g.fillStyle = dir < 0 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
                g.fillRect(-hw - 1, dir < 0 ? ya : ya + hgt - 0.6, w + 2, 0.6);
                const sealY = dir < 0 ? y0 - 0.5 : y1 + 0.5;
                g.save();
                g.shadowColor = rgba(c, bloom); g.shadowBlur = 5 * s * bloom;
                g.fillStyle = rgba(light, 1);
                g.fillRect(-hw - 1, sealY - 0.7, w + 2, 1.4);
                g.restore();
            }

            // Caustic light, a tile that repeats every P px, scrolled live.
            const P = 48;
            const span = (y1 - y0) + P + 4;
            const caustic = makeCanvas((x1 - x0) * s, span * s);
            const cg = caustic.getContext('2d');
            cg.setTransform(s, 0, 0, s, 0, 0);
            cg.strokeStyle = rgba(light, 1);
            cg.lineCap = 'round';
            const cw = x1 - x0;
            for (let y = -6; y < span + 6; y += 6) {
                const row = Math.round(y / 6);
                const ph = (((row % 8) + 8) % 8) * 0.9;
                cg.globalAlpha = 0.35 + 0.25 * Math.sin(ph * 1.7);
                cg.lineWidth = 0.6 + 0.3 * Math.cos(ph);
                cg.beginPath();
                for (let x = 0; x <= cw; x += 1) {
                    const yy = y + Math.sin(x * 0.9 + ph) * 1.4 + Math.sin(x * 0.37 + ph * 2) * 0.8;
                    if (x === 0) cg.moveTo(x, yy); else cg.lineTo(x, yy);
                }
                cg.stroke();
            }
            return { body: body.canvas, caustic, P, L };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, c, light } = k;
            const { L, caustic, P } = k.sprites;
            const { x0, x1, y0, y1 } = L;
            const m = p.motion;
            drawSprite(ctx, k.sprites.body, w, h);

            // Slosh: the liquid lags behind the paddle's motion on a loose
            // spring, so a sudden stop sends the surface swinging.
            const st = p._rip || (p._rip = { y: 0, v: 0, at: 0 });
            const now = performance.now();
            const dt = st.at ? Math.min(0.05, (now - st.at) / 1000) : 0;
            st.at = now;
            const target = clamp((m?.vy || 0) * 0.012, -9, 9);
            for (let i = 0, n = Math.ceil(dt / 0.01); i < n; i++) {
                const hs = dt / n;
                st.v += (-60 * (st.y - target) - 2 * 0.18 * Math.sqrt(60) * st.v) * hs;
                st.y += st.v * hs;
            }
            const gap = Math.max(4, (y1 - y0) * 0.07);
            const surf = y0 + gap + clamp(st.y, -gap + 1, 12) + (reactEnv(m, 'lose') * 6);
            const amp = Math.min(2.4, 0.5 + Math.abs(st.v) * 0.05 + hitGlow);

            ctx.save();
            this.innerPath(ctx, L);
            ctx.clip();
            // Air above the surface.
            ctx.fillStyle = 'rgba(6,10,20,0.94)';
            ctx.beginPath();
            ctx.moveTo(x0 - 1, y0 - 2);
            ctx.lineTo(x1 + 1, y0 - 2);
            const wave = (x) => surf + Math.sin(x * 0.8 + t * 5) * amp + Math.sin(x * 0.3 - t * 3) * amp * 0.5;
            for (let x = x1 + 1; x >= x0 - 1; x -= 1.5) ctx.lineTo(x, wave(x));
            ctx.closePath();
            ctx.fill();

            ctx.globalCompositeOperation = 'lighter';
            // Caustic light flowing up the column.
            const off = (t * 16) % P;
            ctx.globalAlpha = 0.3 + hitGlow * 0.45 + (m?.ant || 0) * 0.15;
            ctx.drawImage(caustic, x0, y0 - 2 - off + P, x1 - x0, caustic.height / k.s);
            // Surface line.
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = rgba(light, 1);
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = x0 - 1; x <= x1 + 1; x += 1.5) { const y = wave(x); if (x === x0 - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            // Bubbles rise and pop at the surface; a won point makes it fizz.
            const fizz = reactEnv(m, 'win');
            const nb = 7 + Math.round(fizz * 5);
            const depth = Math.max(1, y1 - surf);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.6;
            for (let i = 0; i < nb; i++) {
                const speed = 0.22 + ((i * 7) % 11) * 0.035;
                const q = (t * speed + i * 0.377 + p._seed) % 1;
                const y = y1 - q * depth;
                const x = Math.sin(t * 2 + i * 1.7) * (x1 - x0) * 0.28 + (((i * 5) % 7) - 3) * (x1 - x0) * 0.06;
                const r = 0.7 + (i % 3) * 0.4;
                ctx.globalAlpha = 0.75 * Math.min(1, (1 - q) * 6);
                ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
            }
            // Pressure ring from the impact point.
            if (m && m.sinceHit < 0.45) {
                const q = m.sinceHit / 0.45, iy = clamp(m.impactY * L.hh, y0, y1);
                ctx.globalAlpha = (1 - q) * 0.85;
                ctx.lineWidth = 1.6 * (1 - q) + 0.4;
                ctx.beginPath(); ctx.ellipse(0, iy, (x1 - x0) * (0.3 + q * 0.6), 2 + q * L.hh * 0.7, 0, 0, TAU); ctx.stroke();
                ctx.globalAlpha = hitGlow * 0.35;
                ctx.fillStyle = rgba(light, 1);
                ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
            }
            ctx.restore();
        },
    };

    // ── Magma ─────────────────────────────────────────────────────────
    // A slab of cracked basalt with lava running through the cracks. The
    // veins smoulder and breathe, heat up as the ball comes in, flare white
    // hot on a hit and cool off for a moment when a point is lost. Embers
    // drift up off the rock.
    const magma = {
        layout(w, h) {
            const hw = w / 2, hh = h / 2;
            const R = rng(Math.round(w * 131 + h * 7));
            // Rough outline: chipped corners and a few bumps along the edges.
            const pts = [];
            const step = 9;
            pts.push([-hw + 2.5, -hh], [hw - 1.5, -hh + 0.5], [hw + 0.6, -hh + 3]);
            for (let y = -hh + step; y < hh - 4; y += step) pts.push([hw + (R() * 2.6 - 0.8), y]);
            pts.push([hw - 0.5, hh - 2], [hw - 3, hh], [-hw + 1.5, hh - 0.5], [-hw - 0.6, hh - 3]);
            for (let y = hh - step; y > -hh + 4; y -= step) pts.push([-hw - (R() * 2.6 - 0.8), y]);
            // Cracks: a main vein down the middle and branches out to the edges.
            const main = [];
            for (let y = -hh + 3; y <= hh - 3; y += 6) main.push([(R() - 0.5) * hw * 0.7, y]);
            main[main.length - 1][1] = hh - 3;
            const branches = [];
            for (let i = 2; i < main.length - 1; i += 3 + Math.floor(R() * 2)) {
                const sx = R() < 0.5 ? -1 : 1;
                const b = [main[i]];
                let x = main[i][0], y = main[i][1];
                for (let j = 0; j < 3; j++) {
                    x += sx * (hw * 0.32 + R() * hw * 0.25);
                    y += (R() - 0.5) * 9;
                    b.push([clamp(x, -hw + 0.5, hw - 0.5), y]);
                }
                branches.push(b);
            }
            return { hw, hh, pts, main, branches, R };
        },
        strokeCracks(g, L) {
            g.beginPath();
            for (const line of [L.main, ...L.branches]) {
                g.moveTo(line[0][0], line[0][1]);
                for (let i = 1; i < line.length; i++) g.lineTo(line[i][0], line[i][1]);
            }
            g.stroke();
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, pts } = L;
            const hot = mix(c, WHITE, 0.72);
            const body = sprite(w, h, s), veins = sprite(w, h, s);
            const g = body.ctx;
            const bloom = bloomFor(c);

            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 15 * s * bloom;
            g.fillStyle = rgba(c, 0.32 * bloom);
            polyPath(g, pts); g.fill();
            g.restore();

            // Basalt: warm dark stone, shaded like a rounded slab.
            const rg = g.createLinearGradient(-hw, 0, hw, 0);
            rg.addColorStop(0, '#2b2422');
            rg.addColorStop(0.4, '#1d1816');
            rg.addColorStop(1, '#0c0a09');
            g.fillStyle = rg;
            polyPath(g, pts); g.fill();
            // Rock grain: small faceted chips, light and dark.
            g.save();
            polyPath(g, pts); g.clip();
            const R = rng(Math.round(w * 17 + h * 3));
            for (let i = 0; i < h / 3; i++) {
                const x = (R() - 0.5) * w, y = (R() - 0.5) * h, r = 1 + R() * 2.4;
                g.fillStyle = R() < 0.5 ? 'rgba(255,240,230,0.07)' : 'rgba(0,0,0,0.28)';
                g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.4); g.lineTo(x - r * 0.8, y + r * 0.7); g.closePath(); g.fill();
            }
            // Warm underglow from the lava inside, strongest at the core.
            const ug = g.createLinearGradient(-hw, 0, hw, 0);
            ug.addColorStop(0, rgba(c, 0));
            ug.addColorStop(0.5, rgba(c, 0.16));
            ug.addColorStop(1, rgba(c, 0));
            g.fillStyle = ug;
            g.fillRect(-hw - 2, -hh, w + 4, h);
            g.restore();
            polyPath(g, pts);
            innerBevel(g, -hw - 2, -hh, hw + 2, hh, 3);
            // Cracks cut into the rock.
            g.strokeStyle = '#050303'; g.lineWidth = 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
            this.strokeCracks(g, L);
            g.strokeStyle = rgba(mix(c, BLACK, 0.55), 1); g.lineWidth = 1.2;
            this.strokeCracks(g, L);
            // Crust edge.
            g.strokeStyle = 'rgba(255,235,220,0.2)'; g.lineWidth = 0.8;
            polyPath(g, pts); g.stroke();

            // The lava layer: glowing veins with a white-hot core.
            const v = veins.ctx;
            v.lineJoin = 'round'; v.lineCap = 'round';
            v.save();
            v.shadowColor = rgba(c, bloom); v.shadowBlur = 6 * s * bloom;
            v.strokeStyle = rgba(c, 1); v.lineWidth = 1.8;
            this.strokeCracks(v, L);
            v.restore();
            v.strokeStyle = rgba(hot, 1); v.lineWidth = 0.7;
            this.strokeCracks(v, L);
            return { body: body.canvas, veins: veins.canvas, L, hot };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, c } = k;
            const { L, hot } = k.sprites;
            const m = p.motion;
            drawSprite(ctx, k.sprites.body, w, h);

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const heat = clamp(0.5 + 0.16 * Math.sin(t * 1.7 + p._seed) + 0.1 * Math.sin(t * 4.3 + 1)
                + (m?.ant || 0) * 0.3 + hitGlow * 0.9 + reactEnv(m, 'win') * 0.5 - reactEnv(m, 'lose') * 0.45, 0.08, 1.6);
            ctx.globalAlpha = Math.min(1, heat);
            drawSprite(ctx, k.sprites.veins, w, h);
            if (heat > 1) {
                ctx.globalAlpha = heat - 1;
                drawSprite(ctx, k.sprites.veins, w, h);
            }
            // A blob of brighter lava runs down the main vein.
            const main = L.main;
            const q = ((t * 0.3 + p._seed) % 1) * (main.length - 1);
            const i = Math.floor(q), f = q - i;
            const a = main[i], b = main[Math.min(main.length - 1, i + 1)];
            glowDot(ctx, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 1.5, rgba(hot, 1), rgba(c, 1), Math.min(1, 0.4 + heat * 0.5));
            // Embers drift up off the rock and fade.
            ctx.fillStyle = rgba(hot, 1);
            for (let e = 0; e < 7; e++) {
                const cyc = (t * (0.32 + (e % 3) * 0.06) + e * 0.37 + p._seed) % 1;
                const side = e % 2 ? 1 : -1;
                const x0 = side * L.hw * (0.2 + ((e * 3) % 5) * 0.18);
                const y0 = -L.hh + ((e * 41) % Math.max(1, Math.floor(h)));
                const x = x0 + Math.sin(cyc * 6 + e) * 2.2 + side * cyc * 4;
                const y = y0 - cyc * 24;
                ctx.globalAlpha = (1 - cyc) * Math.min(1, heat) * 0.9;
                const r = 0.6 + (1 - cyc) * 0.7;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            }
            ctx.restore();
        },
    };

    // ── Bassline ──────────────────────────────────────────────────────
    // A speaker stack: woofers at both ends and a stereo level meter between
    // them that grows from the middle outwards. It dances to the game's
    // music when there is some (a beat of its own when there isn't), spikes
    // on every hit and maxes out on a won point.
    const bassline = {
        layout(w, h) {
            const hw = w / 2, hh = h / 2;
            const spk = clamp(w * 0.62, 5, 11);
            const spkY = hh - spk - 2.5;
            const top = -spkY + spk + 3.5, bot = spkY - spk - 3.5;
            const rowH = 4.2;
            const half = Math.max(2, Math.floor((bot - top) / 2 / rowH));
            const cols = [[-hw + 2, -0.6], [0.6, hw - 2]];
            return { hw, hh, spk, spkY, rowH, half, cols };
        },
        cell(L, i, dir) {
            // Row i (0 at the centre) going up (dir -1) or down (dir 1).
            const y = dir < 0 ? -(i + 1) * L.rowH + 0.6 : i * L.rowH + 0.6;
            return [y, y + L.rowH - 1.2];
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, spk, spkY, half, cols } = L;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s), lit = sprite(w, h, s);
            const g = body.ctx;
            const bloom = bloomFor(c);
            const r = Math.min(hw, 5);

            g.save();
            g.shadowColor = rgba(c, bloom); g.shadowBlur = 14 * s * bloom;
            g.fillStyle = rgba(c, 0.3 * bloom);
            roundRect(g, -hw, -hh, w, h, r); g.fill();
            g.restore();

            // Cabinet.
            const cg = g.createLinearGradient(-hw, 0, hw, 0);
            cg.addColorStop(0, '#262a33');
            cg.addColorStop(0.35, '#171a21');
            cg.addColorStop(1, '#07080b');
            g.fillStyle = cg;
            roundRect(g, -hw, -hh, w, h, r); g.fill();
            roundRect(g, -hw, -hh, w, h, r);
            innerBevel(g, -hw, -hh, hw, hh, 3);
            g.strokeStyle = metalGradient(g, -hw, hw); g.lineWidth = 1.2;
            roundRect(g, -hw + 0.6, -hh + 0.6, w - 1.2, h - 1.2, r); g.stroke();

            // Woofers.
            for (const dir of [-1, 1]) {
                const y = dir * spkY;
                g.fillStyle = metalGradient(g, -spk - 1, spk + 1);
                g.beginPath(); g.arc(0, y, spk + 1, 0, TAU); g.fill();
                const cone = g.createRadialGradient(-spk * 0.3, y - spk * 0.3, spk * 0.1, 0, y, spk);
                cone.addColorStop(0, '#3a3f4a');
                cone.addColorStop(0.6, '#15181e');
                cone.addColorStop(1, '#050608');
                g.fillStyle = cone;
                g.beginPath(); g.arc(0, y, spk - 0.4, 0, TAU); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 0.6;
                for (const f of [0.78, 0.56]) { g.beginPath(); g.arc(0, y, spk * f, 0, TAU); g.stroke(); }
                g.fillStyle = '#20242c';
                g.beginPath(); g.arc(0, y, spk * 0.32, 0, TAU); g.fill();
                g.fillStyle = 'rgba(255,255,255,0.3)';
                g.beginPath(); g.arc(-spk * 0.1, y - spk * 0.12, spk * 0.12, 0, TAU); g.fill();
                g.strokeStyle = rgba(c, 0.8); g.lineWidth = 0.8;
                g.beginPath(); g.arc(0, y, spk - 0.4, 0, TAU); g.stroke();
            }

            // Meter: unlit cells in the body, lit cells in their own layer.
            const l = lit.ctx;
            l.save();
            l.shadowColor = rgba(c, bloom); l.shadowBlur = 4 * s * bloom;
            for (const [xa, xb] of cols) {
                for (let i = 0; i < half; i++) {
                    const hotness = i / Math.max(1, half - 1);
                    for (const dir of [-1, 1]) {
                        const [ya, yb] = this.cell(L, i, dir);
                        g.fillStyle = rgba(c, 0.13);
                        g.fillRect(xa, ya, xb - xa, yb - ya);
                        l.fillStyle = rgba(mix(c, WHITE, hotness * 0.75), 1);
                        l.fillRect(xa, ya, xb - xa, yb - ya);
                    }
                }
            }
            l.restore();
            g.fillStyle = rgba(light, 0.5);
            g.fillRect(-hw + 2, -0.3, w - 4, 0.6);
            return { body: body.canvas, lit: lit.canvas, L };
        },
        // Music levels for the two meter columns, shared by both paddles and
        // read once per frame.
        music() {
            const now = performance.now();
            const cache = this._music || (this._music = { at: 0, l: 0, r: 0, on: false });
            if (now - cache.at < 12) return cache;
            cache.at = now;
            const snap = window.game?.audio?.getVisualizerSnapshot?.(4);
            cache.on = !!(snap && snap.active && snap.level > 0.04);
            if (cache.on) {
                cache.l = clamp((snap.bars[0] + snap.bars[1]) / 2, 0, 1);
                cache.r = clamp((snap.bars[1] + snap.bars[2]) / 2, 0, 1);
            }
            return cache;
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const { L } = k.sprites;
            const m = p.motion;
            drawSprite(ctx, k.sprites.body, w, h);

            const st = p._bass || (p._bass = { lv: [0, 0], pk: [0, 0], at: 0 });
            const now = performance.now();
            const dt = st.at ? Math.min(0.05, (now - st.at) / 1000) : 0;
            st.at = now;
            const mus = this.music();
            const beat = (t * 1.9 + p._seed) % 1;
            const kick = Math.exp(-beat * 7);
            const win = reactEnv(m, 'win'), lose = reactEnv(m, 'lose');
            for (let i = 0; i < 2; i++) {
                const own = 0.3 + 0.18 * Math.sin(t * 3.1 + i * 1.3) + 0.12 * Math.sin(t * 7.7 + i * 2.1) + kick * 0.3;
                let target = mus.on ? (i ? mus.r : mus.l) * 1.1 : own;
                target = Math.max(target + (m?.ant || 0) * 0.25, hitGlow, win) * (1 - lose * 0.85);
                target = clamp(target, 0.04, 1);
                // Fast attack, slow release, like a real meter.
                const lv = st.lv[i];
                st.lv[i] = lv + (target - lv) * (1 - Math.exp(-(target > lv ? 30 : 6) * dt));
                st.pk[i] = Math.max(st.lv[i], st.pk[i] - dt * 0.6);
            }

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 2; i++) {
                const [xa, xb] = L.cols[i];
                const n = Math.round(st.lv[i] * L.half);
                if (n > 0) {
                    ctx.globalAlpha = 1;
                    drawSpriteRect(ctx, k.sprites.lit, w, h, s, xa - 0.5, -n * L.rowH, xb + 0.5, n * L.rowH);
                }
                // Peak hold marks.
                const pr = Math.min(L.half - 1, Math.round(st.pk[i] * L.half) - 1);
                if (pr >= 0) {
                    ctx.globalAlpha = 0.9;
                    ctx.fillStyle = '#ffffff';
                    for (const dir of [-1, 1]) {
                        const [ya, yb] = this.cell(L, pr, dir);
                        ctx.fillRect(xa, dir < 0 ? ya : yb - 0.8, xb - xa, 0.8);
                    }
                }
            }
            // Woofers thump: a ring pushes out of each cone on the beat.
            const thump = mus.on ? (st.lv[0] - 0.3) * 1.4 : kick;
            const push = clamp(thump + hitGlow + win * 0.6, 0, 1.4);
            ctx.strokeStyle = rgba(light, 1);
            for (const dir of [-1, 1]) {
                const y = dir * L.spkY;
                ctx.globalAlpha = 0.25 + push * 0.45;
                ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.arc(0, y, L.spk * (0.45 + push * 0.22), 0, TAU); ctx.stroke();
                ctx.globalAlpha = 0.18 + push * 0.4;
                ctx.fillStyle = rgba(c, 1);
                ctx.beginPath(); ctx.arc(0, y, L.spk * 0.3, 0, TAU); ctx.fill();
            }
            ctx.restore();
        },
    };

    const DESIGNS = {
        neonBlade: satelliten, shieldWall: worldShield, arcadeBlock: aiRebel, prismGlass: prizma,
        riptide, magmaCore: magma, bassline,
    };

    // Pixel scale of the current transform, in quarter steps so a little
    // squash on a hit never forces a rebake.
    function pixelScale(ctx) {
        let s = 1;
        try {
            const m = ctx.getTransform();
            s = Math.hypot(m.a, m.b);
        } catch (e) { /* old browsers: assume 1 */ }
        return clamp(Math.round(s * 4) / 4, 1, 3);
    }

    // Draw a paddle's design in paddle-local space (origin at its centre).
    function render(ctx, paddle, style, time, hitGlow, scaleHint) {
        const d = DESIGNS[style];
        if (!d) return false;
        const w = paddle.w, h = paddle.h;
        const color = paddle.primaryColor || paddle.color || '#00ffd6';
        const s = scaleHint || pixelScale(ctx);
        const key = `${style}|${color}|${w}|${h}|${s}`;
        let cache = paddle._designCache;
        if (!cache || cache.key !== key) {
            const c = parse(color);
            cache = paddle._designCache = { key, w, h, s, c, light: mix(c, WHITE, 0.6), sprites: d.bake(c, w, h, s) };
        }
        if (paddle._seed == null) paddle._seed = Math.random() * 10;
        ctx.save();
        d.draw(ctx, paddle, cache, paddle.motion ? paddle.motion.phase : time, hitGlow || 0);
        ctx.restore();
        return true;
    }

    window.PaddleDesigns = { LIST, IDS, render, pixelScale, normalize: (id) => (IDS.includes(id) ? id : 'classic') };
})();
