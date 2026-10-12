// Zombie boss look: the Magma Demon.
//
// Only how the boss looks. Its fire breath (timing, emission, particles,
// collision) lives in zombie-boss.js and is untouched; this file reads the
// boss's state (cannonDeploy, fireWarningIntensity, fireBreathingState,
// rageLevel, ...) and draws to match.
//
// The body is an obsidian carapace with horns, back spikes, a lava heart and
// a cluster of eyes that follow the ball. It is baked once into sprites (glow
// included) at the canvas's pixel scale; per frame it is a few sprite blits,
// small fills and the 'lighter' blend, with no shadowBlur.
//
// When the fire breath charges, the demon's jaws slide out towards the player
// and prise open, rows of teeth heat up from the throat outwards, its eyes
// flare white, its heartbeat races and the whole body shakes. The jaw tips
// end exactly where the fire is emitted from (getCannonLength * cannonDeploy).
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const PAD = 44;                       // room for horns, spikes and glow
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const seg = (d, a, b) => clamp((d - a) / (b - a), 0, 1);
    const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
    const easeInOut = (x) => x * x * (3 - 2 * x);

    function pixelScale(ctx) {
        let s = 1;
        try { const m = ctx.getTransform(); s = Math.hypot(m.a, m.b); } catch (e) { /* assume 1 */ }
        return clamp(Math.round(s * 2) / 2, 1, 3);
    }

    function layer(w, h, s) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil((w + PAD * 2) * s);
        canvas.height = Math.ceil((h + PAD * 2) * s);
        const g = canvas.getContext('2d');
        g.setTransform(s, 0, 0, s, PAD * s, PAD * s);   // (0,0) = paddle top-left
        return { canvas, g };
    }

    // Small seeded random so every bake of the same size looks the same.
    function rng(seed) {
        let x = seed | 0 || 1;
        return () => { x = (x * 1664525 + 1013904223) | 0; return ((x >>> 0) / 4294967296); };
    }

    // ── Geometry ──────────────────────────────────────────────────────
    function layout(w, h) {
        const cy = h / 2;
        const n = Math.max(6, Math.round(h / 15));
        const segH = h / n;
        const segs = [];
        for (let i = 0; i < n; i++) segs.push({ y0: i * segH, y1: (i + 1) * segH });
        // Eye cluster above and below the mouth, like a spider's.
        const eyes = [
            { x: w * 0.4, y: cy - 17, r: 3.8 },
            { x: w * 0.7, y: cy - 28, r: 2.6 },
            { x: w * 0.32, y: cy - 37, r: 2.0 },
            { x: w * 0.4, y: cy + 17, r: 3.8 },
            { x: w * 0.7, y: cy + 28, r: 2.6 },
            { x: w * 0.32, y: cy + 37, r: 2.0 },
        ];
        return { cy, segs, eyes };
    }

    // Horn: rises off the top (dir -1) or bottom (dir 1), arcs back over
    // the body and curls forward so the tip points at the player.
    function hornPath(g, w, h, dir) {
        const yb = dir < 0 ? 0 : h;
        const k = dir;
        g.beginPath();
        g.moveTo(w * 0.05, yb - k * 8);
        g.quadraticCurveTo(w + 14, yb + k * 4, w + 8, yb + k * 26);      // back of the horn
        g.quadraticCurveTo(w * 0.4, yb + k * 46, -16, yb + k * 34);      // over the top, forward
        g.lineTo(-11, yb + k * 30);                                       // tip
        g.quadraticCurveTo(w * 0.35, yb + k * 32, w * 0.55, yb + k * 18); // inner curve
        g.quadraticCurveTo(w * 0.6, yb + k * 8, w * 0.75, yb - k * 10);
        g.closePath();
    }

    function spikePaths(w, h) {
        const out = [];
        const r = rng(w * 31 + h * 7);
        for (let y = 18, i = 0; y < h - 16; y += 11, i++) {
            const len = (i % 2 ? 8 : 14) + r() * 4;
            out.push([[w - 1, y - 5], [w + len, y - 2 - len * 0.45], [w - 1, y + 5]]);
        }
        return out;
    }

    function poly(g, pts) {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
    }

    // Carapace segment: a chevron of armour, pointed towards the player.
    function segPath(g, w, s, i) {
        const notch = 3.2;
        const j = (i % 2 ? 0.8 : -0.6);
        g.beginPath();
        g.moveTo(-1 + j, s.y0 + notch);
        g.lineTo(w * 0.5, s.y0 + 0.4);
        g.lineTo(w + 1.2, s.y0 + notch * 0.6);
        g.lineTo(w + 1.2, s.y1 - 0.6);
        g.lineTo(w * 0.5, s.y1 - 1.2);
        g.lineTo(-1 + j, s.y1 - 0.4 + notch * 0.2);
        g.closePath();
    }

    // ── Bake ──────────────────────────────────────────────────────────
    function bake(w, h, s) {
        const L = layout(w, h);
        const body = layer(w, h, s), veins = layer(w, h, s), heat = layer(w, h, s);
        const g = body.g, v = veins.g, q = heat.g;
        const spikes = spikePaths(w, h);

        // Hellish under-glow around the whole silhouette.
        g.save();
        g.shadowColor = 'rgba(255,60,10,0.9)';
        g.shadowBlur = 22 * s;
        g.fillStyle = 'rgba(120,20,0,0.55)';
        g.fillRect(0, 0, w, h);
        hornPath(g, w, h, -1); g.fill();
        hornPath(g, w, h, 1); g.fill();
        g.restore();

        // Back spikes.
        for (const sp of spikes) {
            const sg = g.createLinearGradient(w, sp[0][1], w, sp[2][1]);
            sg.addColorStop(0, '#5a3a30');
            sg.addColorStop(0.45, '#24110c');
            sg.addColorStop(1, '#080303');
            g.fillStyle = sg;
            poly(g, sp); g.fill();
            // Lit upper edge.
            g.strokeStyle = 'rgba(255,200,170,0.35)'; g.lineWidth = 0.6;
            g.beginPath(); g.moveTo(sp[0][0], sp[0][1]); g.lineTo(sp[1][0], sp[1][1]); g.stroke();
        }

        // Horns: charred bone, darker at the root, hot cracks along the curve.
        for (const dir of [-1, 1]) {
            const hg = g.createLinearGradient(w * 0.5, dir < 0 ? 0 : h, -14, dir < 0 ? -36 : h + 36);
            hg.addColorStop(0, '#120706');
            hg.addColorStop(0.55, '#3a2420');
            hg.addColorStop(1, '#b9a08a');
            g.fillStyle = hg;
            hornPath(g, w, h, dir); g.fill();
            g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.8; g.stroke();
            // Growth ridges across the horn.
            g.save();
            hornPath(g, w, h, dir); g.clip();
            g.strokeStyle = 'rgba(255,220,190,0.2)'; g.lineWidth = 0.8;
            for (let i = 0; i < 6; i++) {
                const a = -0.3 + i * 0.55;
                const cx = w * 0.45, cyy = (dir < 0 ? 0 : h) + dir * 20;
                g.beginPath();
                g.moveTo(cx + Math.cos(a) * 8, cyy + dir * Math.sin(a) * 8);
                g.lineTo(cx + Math.cos(a) * 30, cyy + dir * Math.sin(a) * 30);
                g.stroke();
            }
            g.restore();
        }

        // Carapace: chevron plates of obsidian.
        L.segs.forEach((sgm, i) => {
            const pg = g.createLinearGradient(0, 0, w, 0);
            pg.addColorStop(0, '#2c1612');
            pg.addColorStop(0.35, '#170a08');
            pg.addColorStop(1, '#070303');
            g.fillStyle = pg;
            segPath(g, w, sgm, i); g.fill();
            // Glassy top lip and a hard dark underside.
            g.strokeStyle = 'rgba(255,190,160,0.16)'; g.lineWidth = 0.7;
            g.beginPath(); g.moveTo(0, sgm.y0 + 3.4); g.lineTo(w * 0.5, sgm.y0 + 0.9); g.lineTo(w, sgm.y0 + 2.3); g.stroke();
            g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(0, sgm.y1 - 0.2); g.lineTo(w * 0.5, sgm.y1 - 1.2); g.lineTo(w, sgm.y1 - 0.6); g.stroke();
            // Seam glow (veins layer) between plates.
            v.strokeStyle = 'rgba(255,120,20,1)'; v.lineWidth = 1.3;
            v.beginPath(); v.moveTo(0, sgm.y1); v.lineTo(w * 0.5, sgm.y1 - 0.9); v.lineTo(w, sgm.y1 - 0.3); v.stroke();
        });

        // Lava veins: branching cracks from the heart outwards.
        const r = rng(w * 13 + h * 17);
        const cracks = [];
        for (let m = 0; m < 6; m++) {
            const up = m % 2 ? -1 : 1;
            let x = w * (0.3 + r() * 0.4), y = L.cy + up * (4 + r() * 6);
            const pts = [[x, y]];
            for (let i = 0; i < 7; i++) {
                x = clamp(x + (r() - 0.5) * w * 0.55, 1.5, w - 1.5);
                y += up * (5 + r() * 9);
                if (y < 3 || y > h - 3) break;
                pts.push([x, y]);
            }
            cracks.push(pts);
        }
        v.save();
        v.lineCap = 'round'; v.lineJoin = 'round';
        v.shadowColor = 'rgba(255,90,0,1)'; v.shadowBlur = 7 * s;
        for (const pts of cracks) {
            v.strokeStyle = 'rgba(255,150,30,1)'; v.lineWidth = 1.4;
            v.beginPath(); v.moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts.slice(1)) v.lineTo(x, y);
            v.stroke();
        }
        v.restore();
        // Dark crack beds on the body, under the glow.
        g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const pts of cracks) {
            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
            g.stroke();
        }

        // Horn cores glow too when the demon heats up.
        for (const dir of [-1, 1]) {
            v.save();
            hornPath(v, w, h, dir); v.clip();
            v.strokeStyle = 'rgba(255,110,20,0.9)'; v.lineWidth = 1.2;
            v.beginPath();
            const yb = dir < 0 ? 0 : h;
            v.moveTo(w * 0.45, yb - dir * 4);
            v.quadraticCurveTo(w + 4, yb + dir * 10, w * 0.6, yb + dir * 30);
            v.quadraticCurveTo(w * 0.1, yb + dir * 38, -12, yb + dir * 32);
            v.stroke();
            v.restore();
        }

        // Closed mouth: a jagged seam across the middle of the face, glowing
        // from inside, with fangs that jut out past the front edge.
        const zig = [];
        for (let i = 0; i <= 6; i++) zig.push([-1 + i * (w * 0.62 / 6), L.cy + (i % 2 ? 1.4 : -1.4)]);
        g.fillStyle = '#050101';
        g.beginPath();
        g.moveTo(-1.5, L.cy - 4.5); g.lineTo(w * 0.62, L.cy - 2.5); g.lineTo(w * 0.62, L.cy + 2.5); g.lineTo(-1.5, L.cy + 4.5);
        g.closePath(); g.fill();
        v.strokeStyle = 'rgba(255,170,40,1)'; v.lineWidth = 1.2; v.lineJoin = 'miter';
        v.beginPath(); v.moveTo(zig[0][0], zig[0][1]);
        for (const [x, y] of zig.slice(1)) v.lineTo(x, y);
        v.stroke();
        // Tusks jutting forward out of the corners of the mouth.
        for (const dir of [-1, 1]) {
            const fg = g.createLinearGradient(3, 0, -8, 0);
            fg.addColorStop(0, '#bfae94'); fg.addColorStop(1, '#fff4e0');
            g.fillStyle = fg;
            g.beginPath();
            g.moveTo(3, L.cy + dir * 6);
            g.quadraticCurveTo(-4, L.cy + dir * 6.5, -8.5, L.cy + dir * 1.2);
            g.quadraticCurveTo(-3, L.cy + dir * 3, 3, L.cy + dir * 3);
            g.closePath(); g.fill();
        }

        // Eye sockets with heavy brow ridges.
        for (const e of L.eyes) {
            const dir = e.y < L.cy ? -1 : 1;
            g.fillStyle = '#020000';
            g.beginPath(); g.ellipse(e.x, e.y, e.r * 1.55, e.r * 1.25, 0, 0, TAU); g.fill();
            g.fillStyle = '#3b211b';
            g.beginPath();
            g.moveTo(e.x - e.r * 2, e.y + dir * e.r * 0.2);
            g.lineTo(e.x + e.r * 1.9, e.y + dir * e.r * 1.9);
            g.lineTo(e.x + e.r * 1.4, e.y + dir * e.r * 0.9);
            g.closePath(); g.fill();
        }

        // Heat layer: the whole body lit from inside, used while charging.
        q.save();
        q.shadowColor = 'rgba(255,80,0,1)'; q.shadowBlur = 16 * s;
        const hg = q.createRadialGradient(w / 2, L.cy, 0, w / 2, L.cy, h * 0.6);
        hg.addColorStop(0, 'rgba(255,230,140,0.95)');
        hg.addColorStop(0.35, 'rgba(255,120,20,0.7)');
        hg.addColorStop(1, 'rgba(160,20,0,0.15)');
        q.fillStyle = hg;
        L.segs.forEach((sgm, i) => { segPath(q, w, sgm, i); q.fill(); });
        q.restore();

        return { body: body.canvas, veins: veins.canvas, heat: heat.canvas, L, w, h, s };
    }

    function blit(ctx, spr, k) {
        ctx.drawImage(spr, -PAD, -PAD, k.w + PAD * 2, k.h + PAD * 2);
    }

    function getKit(boss, ctx) {
        const p = boss.paddle;
        const w = boss.originalPaddleWidth || p.w;
        const h = p.h;
        const s = pixelScale(ctx);
        const key = `${w}|${h}|${s}`;
        if (!boss._lookKit || boss._lookKit.key !== key) {
            boss._lookKit = Object.assign(bake(w, h, s), { key });
        }
        return boss._lookKit;
    }

    // How hard the demon is charging, 0..1, and its heartbeat.
    function chargeState(boss) {
        const d = boss.cannonDeploy || 0;
        const breathing = boss.fireBreathingState === 'breathing';
        const warning = boss.fireBreathingState === 'warning';
        let charge = 0;
        if (breathing) charge = 1;
        else if (warning) charge = clamp(1 - (boss.fireBreathingTimer || 0) / Math.max(0.01, boss.fireWarningDuration || 3), 0, 1);
        charge = Math.max(charge, d * 0.6);
        return { d, breathing, warning, charge };
    }

    function heartbeat(t, rate) {
        const ph = (t * rate) % 1;
        const lub = Math.exp(-((ph - 0.06) ** 2) / 0.0018);
        const dub = Math.exp(-((ph - 0.24) ** 2) / 0.0025) * 0.7;
        return lub + dub;
    }

    // ── Body ──────────────────────────────────────────────────────────
    function renderBody(boss, ctx) {
        const p = boss.paddle;
        if (!p) return;
        const k = getKit(boss, ctx);
        const t = boss.time || 0;
        const rage = clamp(boss.rageLevel || 0, 0, 1);
        const { breathing, charge } = chargeState(boss);
        const dazed = (boss.staggerTimer > 0) || boss.bossDisabled;

        // Heartbeat speeds up with rage and races while charging.
        const rate = dazed ? 0.5 : 0.9 + rage * 0.6 + charge * 2.6;
        const beat = heartbeat(t, rate);
        // Tremble while charging, a hard shudder while breathing.
        const shake = breathing ? 1.6 : charge * charge * 1.4;
        const jx = shake ? Math.sin(t * 71) * shake : 0;
        const jy = shake ? Math.cos(t * 53) * shake * 0.5 : 0;

        ctx.save();
        ctx.translate(p.pos.x + jx, p.pos.y + jy);
        ctx.scale(p.w / k.w, 1);
        blit(ctx, k.body, k);

        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp((dazed ? 0.25 : 0.5) + beat * 0.4 + rage * 0.2 + charge * 0.6, 0, 1);
        blit(ctx, k.veins, k);
        if (charge > 0.02) {
            ctx.globalAlpha = clamp(charge * (0.35 + beat * 0.35) + (breathing ? 0.35 : 0), 0, 1);
            blit(ctx, k.heat, k);
        }
        ctx.restore();

        // Danger aura: the same warning pulse the old boss gave, now a deep
        // blood red that throbs with the charge, so the attack still reads
        // from across the court.
        const warn = boss.fireWarningIntensity || 0;
        if (warn > 0.05 || breathing) {
            const cx = p.pos.x + p.w / 2, cyy = p.pos.y + p.h / 2;
            const R = Math.max(p.w, p.h) * (1.05 + charge * 0.25);
            const a = breathing ? 0.4 : warn * (0.35 + charge * 0.3);
            const ag = ctx.createRadialGradient(cx, cyy, 0, cx, cyy, R);
            ag.addColorStop(0, `rgba(255,70,20,${a})`);
            ag.addColorStop(0.5, `rgba(190,10,0,${a * 0.5})`);
            ag.addColorStop(1, 'rgba(120,0,0,0)');
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = ag;
            ctx.beginPath(); ctx.arc(cx, cyy, R, 0, TAU); ctx.fill();
            ctx.restore();
        }

        // Eyes: slit pupils that follow the ball; sickly orange at rest,
        // blood red with rage, white-hot while charging.
        const L = k.L;
        const sx = p.w / k.w;
        const ball = boss.ball;
        let look = 0;
        if (ball && ball.pos && Number.isFinite(ball.pos.y)) look = clamp((ball.pos.y - (p.pos.y + p.h / 2)) / 160, -1, 1);
        const blink = dazed ? 0.25 : ((t * 0.37 + 0.2) % 4 < 0.12 ? 0.15 : 1);
        ctx.save();
        ctx.translate(p.pos.x + jx, p.pos.y + jy);
        ctx.globalCompositeOperation = 'lighter';
        const hot = clamp(charge * 1.2, 0, 1);
        const er = 255, eg = Math.round(60 - rage * 45 + hot * 190), eb = Math.round(10 + hot * 200);
        for (let i = 0; i < L.eyes.length; i++) {
            const e = L.eyes[i];
            const x = e.x * sx, y = e.y;
            const flick = 0.85 + 0.15 * Math.sin(t * 13 + i * 2.1);
            const a = (0.75 + beat * 0.25) * flick;
            // Halo
            ctx.globalAlpha = a * (0.3 + hot * 0.15);
            ctx.fillStyle = `rgb(${er},${Math.max(30, eg - 40)},${Math.max(0, eb - 40)})`;
            ctx.beginPath(); ctx.arc(x, y, e.r * (2.1 + hot * 0.5), 0, TAU); ctx.fill();
            // Iris
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${er},${eg},${eb})`;
            ctx.beginPath(); ctx.ellipse(x, y, e.r * 1.2, e.r * 0.95 * blink, 0, 0, TAU); ctx.fill();
            // Hot core
            ctx.globalAlpha = Math.min(1, a * 0.9);
            ctx.fillStyle = '#fff6d8';
            ctx.beginPath(); ctx.ellipse(x - 0.3, y, e.r * 0.55, e.r * 0.45 * blink, 0, 0, TAU); ctx.fill();
        }
        // Slit pupils (drawn normally so they cut black through the glow).
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = blink > 0.5 ? 0.92 : 0;
        ctx.fillStyle = '#120000';
        for (const e of L.eyes) {
            const x = e.x * sx - e.r * 0.25, y = e.y + look * e.r * 0.45;
            const wdt = Math.max(0.5, e.r * (0.32 - hot * 0.18));
            ctx.beginPath(); ctx.ellipse(x, y, wdt, e.r * 0.85, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();

        // Embers rising off the back, more of them with rage and heat.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const n = 4 + Math.round(rage * 4 + charge * 6);
        for (let i = 0; i < n; i++) {
            const life = (t * (0.55 + (i % 3) * 0.17) + i * 0.618) % 1;
            const x = p.pos.x + p.w + 2 + Math.sin(i * 12.9 + t * 1.3) * 5 + life * (6 + (i % 4) * 3);
            const y = p.pos.y + ((i * 0.37) % 1) * p.h - life * 34;
            ctx.globalAlpha = (1 - life) * 0.8;
            ctx.fillStyle = life < 0.3 ? '#ffe2a0' : '#ff6a1a';
            const r = 1.4 * (1 - life * 0.6);
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    // ── Breath jet ────────────────────────────────────────────────────
    // The fire particles ignite some way out from the mouth (the emitter's
    // ignition distance), so this draws the jet of burning fuel that joins
    // the jaws to them. While breathing it is redrawn at the mouth every
    // frame, so it stays attached however the demon moves. When the breath
    // stops, the jet is cut off at the mouth and its tail flies on and burns
    // out where it was, instead of vanishing. The distance mirrors ignD in
    // fireBreathingEmission (read only; that code is unchanged).
    function jetLength(boss) {
        const spool = Math.min(1, boss.fireBreathingIntensity || 0.8);
        const courtW = boss.game?.width || 800;
        return (22 + (1 - spool) * 52) * (courtW / 100) * 0.95;
    }

    function drawJet(ctx, x0, y0, jetLen, t, cut, alpha) {
        const steps = 26;
        const f0 = clamp(cut / jetLen, 0, 1);
        if (f0 >= 0.98 || alpha <= 0.01) return;
        const layers = [
            { w0: 7, w1: 26, col: 'rgba(255,70,10,', a: 0.5 },
            { w0: 4.5, w1: 15, col: 'rgba(255,170,40,', a: 0.7 },
            { w0: 2.2, w1: 6, col: 'rgba(255,248,215,', a: 0.95 },
        ];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const L of layers) {
            const top = [], bot = [];
            for (let i = 0; i <= steps; i++) {
                const f = f0 + (1 - f0) * (i / steps);
                const x = x0 - f * jetLen;
                const wob = Math.sin(f * 9 - t * 38) * 2.2 * f + Math.sin(f * 23 + t * 61) * 1.3 * f;
                const half = (L.w0 + (L.w1 - L.w0) * f) * (0.85 + 0.15 * Math.sin(f * 17 - t * 47));
                top.push([x, y0 + wob - half]);
                bot.push([x, y0 + wob + half]);
            }
            const g = ctx.createLinearGradient(x0, 0, x0 - jetLen, 0);
            g.addColorStop(0, L.col + L.a + ')');
            g.addColorStop(0.55, L.col + (L.a * 0.85) + ')');
            g.addColorStop(1, L.col + '0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(top[0][0], top[0][1]);
            for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
            for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
            ctx.closePath();
            ctx.fill();
        }
        // Flame tongues licking off the jet.
        for (let i = 0; i < 9; i++) {
            const f = f0 + (1 - f0) * ((t * 2.6 + i * 0.137) % 1);
            const x = x0 - f * jetLen;
            const y = y0 + Math.sin(i * 7.3 + t * 9) * (4 + f * 14);
            ctx.globalAlpha = (1 - f) * 0.55 * alpha;
            ctx.fillStyle = f < 0.35 ? '#ffd27a' : '#ff6a1a';
            ctx.beginPath(); ctx.arc(x, y, 3 + f * 9, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    function renderJet(boss, ctx, mouthX, mouthY) {
        const t = boss.time || 0;
        const J = boss._lookJet || (boss._lookJet = { alpha: 0, cut: 0, x: 0, y: 0, at: t });
        const dt = clamp(t - J.at, 0, 0.1);
        J.at = t;
        if (boss.fireBreathingState === 'breathing' && mouthX != null) {
            J.alpha = 1; J.cut = 0; J.x = mouthX; J.y = mouthY; J.len = jetLength(boss);
        } else if (J.alpha > 0) {
            J.cut += dt * 900;              // the tail flies on at about jet speed
            J.alpha = Math.max(0, J.alpha - dt * 2.6);
        }
        if (J.alpha > 0) drawJet(ctx, J.x, J.y, J.len, t, J.cut, J.alpha);
    }

    // ── Maw: the fire breath animation ────────────────────────────────
    function jawShape(len, depth) {
        // Upper jaw in hinge space: the hinge is at (0,0), the jaw reaches
        // to the left (-len), its inner edge runs along y = 0.
        return [
            [4, 0], [4, -depth], [-len * 0.35, -depth * 0.95], [-len * 0.78, -depth * 0.6],
            [-len - 4, -depth * 0.15], [-len - 1, 3.5], [-len + 3, 0],
        ];
    }

    function renderMaw(boss, ctx) {
        const p = boss.paddle;
        if (!p) return;
        const { d, breathing, charge } = chargeState(boss);
        if (d <= 0.001) { renderJet(boss, ctx, null, null); return; }
        const t = boss.time || 0;

        // The jaws end where the fire comes out: cannon length times deploy.
        const reach = boss.getCannonLength() * d;
        const ext = easeOutBack(seg(d, 0, 0.55));
        const gape = easeInOut(seg(d, 0.3, 0.95)) * 0.36 + (breathing ? 0.16 + Math.sin(t * 34) * 0.035 : 0);
        const recoil = (boss.cannonRecoil || 0) ** 2 * 8;
        const shake = breathing ? 1.6 : charge * charge * 1.4;
        const jx = shake ? Math.sin(t * 71) * shake : 0;
        const jy = shake ? Math.cos(t * 53) * shake * 0.5 : 0;

        const hingeX = p.pos.x + p.w * 0.6 + recoil + jx;
        const cy = p.pos.y + p.h / 2 + jy;
        const len = Math.max(4, (hingeX - p.pos.x) + reach * ext - 2);
        const depth = Math.max(14, p.w * 0.95) * (0.6 + 0.4 * ext);
        const heat = breathing ? 1 : charge;

        ctx.save();

        // Throat: the glow between the jaws, white-hot at the back.
        const mouthX = hingeX - len;
        const tipY = Math.sin(gape) * len;
        if (gape > 0.02) {
            const tg = ctx.createLinearGradient(hingeX, cy, mouthX, cy);
            tg.addColorStop(0, `rgba(255,250,220,${0.95 * heat})`);
            tg.addColorStop(0.35, `rgba(255,170,50,${0.85 * heat + 0.1})`);
            tg.addColorStop(1, `rgba(150,20,0,${0.5 * heat + 0.2})`);
            ctx.fillStyle = tg;
            ctx.beginPath();
            ctx.moveTo(hingeX, cy);
            ctx.lineTo(mouthX + 3, cy - tipY * 0.9);
            ctx.quadraticCurveTo(mouthX - 2, cy, mouthX + 3, cy + tipY * 0.9);
            ctx.closePath();
            ctx.fill();
        }

        // Both jaws: same shape, the lower one mirrored.
        const shape = jawShape(len, depth);
        for (const dir of [-1, 1]) {
            ctx.save();
            ctx.translate(hingeX, cy);
            ctx.scale(1, -dir);           // dir -1: upper jaw, dir 1: lower jaw
            ctx.rotate(gape);
            // Bone-and-obsidian jaw.
            const jg = ctx.createLinearGradient(0, -depth, 0, 0);
            jg.addColorStop(0, '#080303');
            jg.addColorStop(0.55, '#2a1410');
            jg.addColorStop(1, '#4a2a22');
            ctx.fillStyle = jg;
            poly(ctx, shape); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Back-swept spikes along the top of the jaw.
            ctx.fillStyle = '#1a0b08';
            for (let i = 0; i < 3; i++) {
                const x = -len * (0.2 + i * 0.22);
                const y = -depth * (0.95 - i * 0.12);
                ctx.beginPath(); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x + 5, y - 7 - (2 - i) * 2); ctx.lineTo(x + 3, y + 2); ctx.closePath(); ctx.fill();
            }
            // Hot lip along the inside of the jaw.
            ctx.strokeStyle = `rgba(255,${90 + Math.round(heat * 130)},30,${0.25 + heat * 0.7})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(2, 0.2); ctx.lineTo(-len + 3, 0.2); ctx.stroke();
            // Ridges along the snout.
            ctx.strokeStyle = 'rgba(255,190,150,0.14)'; ctx.lineWidth = 0.8;
            for (let x = -len * 0.15; x > -len * 0.85; x -= 7) {
                ctx.beginPath(); ctx.moveTo(x, -depth * 0.9); ctx.lineTo(x - 3, -depth * 0.55); ctx.stroke();
            }
            // Teeth: fill the inner edge, heated from the throat outwards.
            for (let x = -4, i = 0; x > -len + 2; x -= 5.2, i++) {
                const tl = (i % 3 === 0 ? 6.5 : 4) * (0.7 + 0.3 * ext);
                const fromThroat = clamp((-x) / len, 0, 1);
                const lit = clamp(heat * 1.6 - fromThroat, 0, 1);
                ctx.fillStyle = `rgb(${Math.round(225 + lit * 30)},${Math.round(210 - lit * 60)},${Math.round(190 - lit * 150)})`;
                ctx.beginPath();
                ctx.moveTo(x, 0.5); ctx.lineTo(x - 3, 0.5); ctx.lineTo(x - 1.6, tl);
                ctx.closePath(); ctx.fill();
            }
            // The fang at the tip.
            ctx.fillStyle = '#f2e6d0';
            ctx.beginPath();
            ctx.moveTo(-len + 1, 0); ctx.lineTo(-len - 3, 0); ctx.lineTo(-len - 1.5, 9 * ext);
            ctx.closePath(); ctx.fill();
            // Nostril / eye slit on the upper jaw, lower jaw gets a glowing seam.
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255,${120 + Math.round(heat * 100)},30,${0.4 + heat * 0.5})`;
            ctx.fillRect(-len * 0.72, -depth * 0.55, len * 0.25, 1.4);
            ctx.restore();
        }

        // Smoke curling out of the nostrils while it charges.
        if (!breathing && charge > 0.05) {
            for (let i = 0; i < 5; i++) {
                const life = (t * 0.9 + i / 5) % 1;
                const x = mouthX + len * 0.25 - life * 10 + Math.sin(t * 3 + i) * 3;
                const y = cy - tipY - depth * 0.6 - life * 26;
                ctx.globalAlpha = (1 - life) * 0.35 * charge;
                ctx.fillStyle = '#2a201c';
                ctx.beginPath(); ctx.arc(x, y, 3 + life * 7, 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Heat being sucked into the maw: embers spiral in from the court.
        ctx.globalCompositeOperation = 'lighter';
        const mx = p.pos.x - reach + jx, my = cy;
        if (!breathing && heat > 0.05) {
            for (let i = 0; i < 14; i++) {
                const f = 1 - ((t * (1.6 + heat * 1.4) + i / 14) % 1);
                const a = i * 2.39996 + t * 2.2;
                const rr = 8 + f * (50 + heat * 40);
                const x = mx + Math.cos(a + f * 2) * rr;
                const y = my + Math.sin(a + f * 2) * rr * 0.75;
                ctx.globalAlpha = (1 - f) * heat * 0.95;
                ctx.fillStyle = f > 0.6 ? '#ff5a10' : '#ffd890';
                const r = 0.8 + (1 - f) * 1.4;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            }
        }
        if (ext > 0.6) renderJet(boss, ctx, mx, my);
        else renderJet(boss, ctx, null, null);

        // Ball of fire gathering between the fangs.
        if (heat > 0.05 && ext > 0.6) {
            const r = (6 + heat * 14) * (breathing ? 1.3 : 0.9 + 0.1 * Math.sin(t * 40));
            const core = ctx.createRadialGradient(mx, my, 0, mx, my, r);
            core.addColorStop(0, `rgba(255,255,235,${0.95 * heat})`);
            core.addColorStop(0.3, `rgba(255,200,80,${0.75 * heat})`);
            core.addColorStop(0.7, `rgba(255,70,10,${0.3 * heat})`);
            core.addColorStop(1, 'rgba(200,20,0,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = core;
            ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
        }

        ctx.restore();
    }

    window.ZombieBossLook = { renderBody, renderMaw };
})();
