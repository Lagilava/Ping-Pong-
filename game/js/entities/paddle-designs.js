// Paddle designs: Satelliten, World Shield, AI Rebel and Prizma.
//
// Classic keeps its own renderer in paddle.js. Each design here is split in
// two: a static body baked once into an offscreen sprite, glow included, and
// a few animated touches drawn live every frame with plain fills, slices of
// baked sprites and the 'lighter' blend. Nothing here runs shadowBlur per
// frame. Sprites are baked at the canvas's real pixel scale, so they stay
// sharp at any resolution, and are rebaked only when the paddle's size,
// colour or the screen scale changes.
(function () {
    'use strict';

    const LIST = [
        { id: 'classic', name: 'Classic', blurb: 'The original neon block' },
        { id: 'neonBlade', name: 'Satelliten', blurb: 'Solar-panel spine with satellites in orbit' },
        { id: 'shieldWall', name: 'World Shield', blurb: 'Honeycomb energy shield around a turning globe' },
        { id: 'arcadeBlock', name: 'AI Rebel', blurb: 'Armour plates and an eye that tracks the ball' },
        { id: 'prismGlass', name: 'Prizma', blurb: 'Faceted crystal with a sweeping spectrum' },
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
    function glowDot(ctx, x, y, r, core, halo, alpha) {
        ctx.globalAlpha = alpha * 0.28;
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
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

            // Glow under the panels and hub.
            g.save();
            g.shadowColor = rgba(c, 0.95);
            g.shadowBlur = 16 * s;
            g.fillStyle = rgba(c, 0.35);
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
                        hi.ctx.fillStyle = rgba(light, 1);
                        hi.ctx.fillRect(x0, y + 0.8, cw, ch - 1.6);
                    }
                }
                g.strokeStyle = rgba(c, 0.95);
                g.lineWidth = 1.2;
                roundRect(g, -hw + 0.6, p.y0 + 0.6, w - 1.2, ph - 1.2, 2); g.stroke();
            }

            // Hub: dark disc, bright ring, light core.
            g.fillStyle = '#05070d';
            g.beginPath(); g.arc(0, 0, hubR, 0, TAU); g.fill();
            g.strokeStyle = rgba(c, 1); g.lineWidth = 1.8;
            g.beginPath(); g.arc(0, 0, hubR - 1, 0, TAU); g.stroke();
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
            return { body: body.canvas, hi: hi.canvas, L };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const L = k.sprites.L;
            const { hw, hh, endH, hubR } = L;
            const orbit = (back) => {
                for (let i = 0; i < 3; i++) {
                    for (let trail = 2; trail >= 0; trail--) {
                        const a = t * 1.25 + i * (TAU / 3) + p._seed - trail * 0.09;
                        const z = Math.cos(a);
                        if ((z < 0) !== back) continue;
                        const x = z * (hw + 7);
                        const y = Math.sin(a) * (hh * 0.86);
                        const size = (back ? 1.5 : 2.3) * (trail ? 0.75 : 1);
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

            g.save();
            g.shadowColor = rgba(c, 1);
            g.shadowBlur = 18 * s;
            g.fillStyle = rgba(c, 0.4);
            polyPath(g, pts); g.fill();
            g.restore();

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

            // Inner bevel and bright rim.
            const inset = hexPoints(hw - 2.6, hh - 3.2, S.k - 0.6);
            g.strokeStyle = rgba(light, 0.45); g.lineWidth = 0.9;
            polyPath(g, inset); g.stroke();
            g.save();
            g.shadowColor = rgba(c, 1); g.shadowBlur = 7 * s;
            g.strokeStyle = rgba(c, 1); g.lineWidth = 2;
            polyPath(g, pts); g.stroke();
            g.restore();
            g.strokeStyle = rgba(light, 0.9); g.lineWidth = 0.7;
            polyPath(g, pts); g.stroke();

            // Bosses above and below the globe.
            for (const dir of [-1, 1]) {
                const y = dir * hh * 0.56, d = Math.min(hw * 0.5, 5);
                g.fillStyle = rgba(light, 0.95);
                g.beginPath(); g.moveTo(0, y - d); g.lineTo(d * 0.7, y); g.lineTo(0, y + d); g.lineTo(-d * 0.7, y); g.closePath(); g.fill();
                g.strokeStyle = rgba(c, 1); g.lineWidth = 0.8; g.stroke();
            }

            // Globe: dark sea, bright limb, latitude lines.
            g.save();
            g.shadowColor = rgba(c, 1); g.shadowBlur = 8 * s;
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
            return { hw, hh, plates, gap, visorH, visorW };
        },
        bake(c, w, h, s) {
            const L = this.layout(w, h);
            const { hw, hh, plates, gap, visorH, visorW } = L;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s);
            const g = body.ctx;
            const r = Math.min(w * 0.3, 6);

            g.save();
            g.shadowColor = rgba(c, 1); g.shadowBlur = 15 * s;
            g.fillStyle = rgba(c, 0.38);
            roundRect(g, -hw, -hh, w, h, r); g.fill();
            g.restore();

            // Glowing core that shows through the seams.
            const core = g.createLinearGradient(-hw, 0, hw, 0);
            core.addColorStop(0, rgba(mix(c, BLACK, 0.3), 1));
            core.addColorStop(0.5, rgba(light, 1));
            core.addColorStop(1, rgba(mix(c, BLACK, 0.3), 1));
            g.fillStyle = core;
            roundRect(g, -hw, -hh, w, h, r); g.fill();

            // Armour plates.
            for (let i = 0; i < plates.length; i++) {
                const p = plates[i];
                const pg = g.createLinearGradient(0, p.y0, 0, p.y1);
                pg.addColorStop(0, '#3a414d');
                pg.addColorStop(0.18, '#262b34');
                pg.addColorStop(1, '#101318');
                g.fillStyle = pg;
                roundRect(g, -hw + 0.6, p.y0, w - 1.2, p.y1 - p.y0, Math.min(3, r));
                g.fill();
                g.fillStyle = 'rgba(255,255,255,0.22)';
                g.fillRect(-hw + 2, p.y0 + 0.6, w - 4, 0.9);
                // Vent slits on the end plates.
                if (i === 0 || i === plates.length - 1 || i === 1 || i === plates.length - 2) {
                    g.fillStyle = 'rgba(0,0,0,0.65)';
                    const cy = (p.y0 + p.y1) / 2;
                    for (let v = -1; v <= 1; v++) g.fillRect(-hw * 0.55, cy + v * 2.6 - 0.5, w * 0.55, 1);
                }
            }

            // Edge rails.
            g.fillStyle = rgba(c, 0.85);
            g.fillRect(-hw + 0.4, -hh + r, 1, h - r * 2);
            g.fillRect(hw - 1.4, -hh + r, 1, h - r * 2);

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
            return { body: body.canvas, L, seams };
        },
        draw(ctx, p, k, t, hitGlow) {
            const { w, h, s, c, light } = k;
            const { L, seams } = k.sprites;
            const { hw, visorH, visorW } = L;

            // Glitch: every few seconds the body tears sideways for a moment.
            const gl = (t + p._seed * 2.3) % 3.4;
            if (gl < 0.14) {
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
            // Eye.
            const ew = visorW * 0.72;
            ctx.globalAlpha = 0.35 + hitGlow * 0.4;
            ctx.fillStyle = rgba(c, 1);
            ctx.beginPath(); ctx.ellipse(0, ey, ew * 0.9, 7, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = rgba(light, 1);
            roundRect(ctx, -ew / 2, ey - 2, ew, 4, 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, -ew / 4, ey - 1, ew / 2, 2, 1); ctx.fill();
            // Visor scan flicker.
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = rgba(c, 1);
            const sy = -visorH / 2 + ((t * 30) % visorH);
            ctx.fillRect(-visorW / 2 + 1.5, sy, visorW - 3, 1);
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
            return { hw, hh, k, xr, outline: hexPoints(hw, hh, k), facets, verts: [T, B, ...A] };
        },
        bake(c, w, h, s) {
            const S = this.shape(w, h);
            const { hw, hh, outline, facets } = S;
            const light = mix(c, WHITE, 0.6);
            const body = sprite(w, h, s), flash = sprite(w, h, s);
            const g = body.ctx;

            g.save();
            g.shadowColor = rgba(c, 1); g.shadowBlur = 18 * s;
            g.fillStyle = rgba(c, 0.35);
            polyPath(g, outline); g.fill();
            g.restore();
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
            // Facet edges.
            g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.75;
            for (const f of facets) { polyPath(g, f.pts); g.stroke(); }
            // Rim.
            g.save();
            g.shadowColor = rgba(c, 1); g.shadowBlur = 6 * s;
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
            // Glints pop on the crystal's corners in turn.
            ctx.fillStyle = '#ffffff';
            const verts = S.verts;
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

    const DESIGNS = { neonBlade: satelliten, shieldWall: worldShield, arcadeBlock: aiRebel, prismGlass: prizma };

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
        d.draw(ctx, paddle, cache, time, hitGlow || 0);
        ctx.restore();
        return true;
    }

    window.PaddleDesigns = { LIST, IDS, render, pixelScale, normalize: (id) => (IDS.includes(id) ? id : 'classic') };
})();
