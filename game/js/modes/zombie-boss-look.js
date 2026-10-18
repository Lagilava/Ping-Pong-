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
// Fire charges behind a compact split in the existing obsidian face. The
// silhouette stays intact: no extending snout, extra eyes or oversized teeth.
// The visual jet bridges to the existing emitter; attack rules stay unchanged.
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const PAD = 44;                       // room for horns, spikes and glow
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const seg = (d, a, b) => clamp((d - a) / (b - a), 0, 1);
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
        // A restrained tension cue; keep the original body silhouette stable.
        const shake = window.PPSettings?.get('reduceMotion') ? 0 : (breathing ? 0.45 : charge * charge * 0.2);
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

    let flameLobes = null;
    function getFlameLobes() {
        if (flameLobes) return flameLobes;
        // Match the downstream particle palette and soft radial falloff. Bake
        // once; the plume uses sprite blits, never a smooth filled ribbon.
        flameLobes = [0.28, 0.68, 0.95].map(temp => {
            const c = ZombieBoss.tRGB(temp);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const g = canvas.getContext('2d');
            const glow = g.createRadialGradient(32, 32, 0, 32, 32, 31);
            glow.addColorStop(0, `rgb(${Math.min(255, c[0] + 20)},${Math.min(255, c[1] + 16)},${Math.min(255, c[2] + 12)})`);
            glow.addColorStop(0.4, `rgb(${c[0]},${c[1]},${c[2]})`);
            glow.addColorStop(1, `rgba(${Math.max(0, c[0] - 50)},${Math.max(0, c[1] - 40)},0,0)`);
            g.fillStyle = glow;
            g.fillRect(0, 0, 64, 64);
            return canvas;
        });
        return flameLobes;
    }

    function drawJet(ctx, x0, y0, jetLen, t, cut, alpha) {
        if (jetLen <= 0 || alpha <= 0.01) return;
        const sprites = getFlameLobes();
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        // A continuous flow of overlapping, uneven lobes grows out of the maw
        // and fades into the existing simulation at its ignition distance.
        for (let layer = 0; layer < 3; layer++) {
            const count = 16 + layer * 4;
            for (let i = 0; i < count; i++) {
                const f = (t * (0.9 + layer * 0.22) + i / count) % 1;
                const distance = f * jetLen;
                if (distance < cut) continue;
                const eddy = Math.sin(i * 2.4 + t * 4.1) * (3 + f * 15);
                const y = y0 + eddy * (layer === 2 ? 0.35 : 1);
                const radius = (4 + f * (layer === 0 ? 25 : 17))
                    * (0.8 + 0.2 * Math.sin(i * 7.3 + t * 5));
                const stretch = layer === 2 ? 2.4 : 1.7;
                // Fade at both ends, leaving a tight hot source and a soft
                // handoff. No round opaque bubbles or flat white centreline.
                const fade = Math.min(1, f * 14) * Math.min(1, (1 - f) * 4);
                ctx.globalAlpha = alpha * fade * (layer === 2 ? 0.72 : 0.6);
                ctx.save();
                ctx.translate(x0 - distance, y);
                ctx.rotate(Math.sin(i * 3.7 + t * 2.5) * 0.28);
                ctx.drawImage(sprites[layer], -radius * stretch, -radius,
                    radius * stretch * 2, radius * 2);
                ctx.restore();
            }
        }
        ctx.restore();
    }

    function renderJet(boss, ctx, mouthX, mouthY) {
        const t = boss.time || 0;
        const J = boss._lookJet || (boss._lookJet = { alpha: 0, cut: 0, x: 0, y: 0, at: t });
        const dt = clamp(t - J.at, 0, 0.1);
        J.at = t;
        if (boss.fireBreathingState === 'breathing' && mouthX != null) {
            J.alpha = 1; J.cut = 0; J.x = mouthX; J.y = mouthY; J.len = jetLength(boss) + Math.max(0,
                mouthX - (boss.paddle.pos.x - boss.getCannonLength() * (boss.cannonDeploy || 0)));
        } else if (J.alpha > 0) {
            J.cut += dt * 900;              // the tail flies on at about jet speed
            J.alpha = Math.max(0, J.alpha - dt * 2.6);
        }
        if (J.alpha > 0) drawJet(ctx, J.x, J.y, J.len, t, J.cut, J.alpha);
    }

    // ── Fire windup: a restrained fissure in the existing face ─────────
    function renderMaw(boss, ctx) {
        const p = boss.paddle;
        if (!p) return;
        const { d, breathing, charge } = chargeState(boss);
        if (d <= 0.001) { renderJet(boss, ctx, null, null); return; }
        const t = boss.time || 0;
        const opening = easeInOut(seg(d, 0.15, 0.95));
        const heat = breathing ? 1 : charge;
        const mx = p.pos.x - 4;
        const cy = p.pos.y + p.h / 2;
        const halfHeight = Math.min(18, p.h * 0.13) * opening;
        const halfWidth = Math.max(4, Math.min(10, p.w * 0.42));
        ctx.save();
        // The jaw separates slightly inside the armour instead of growing a
        // second head. Dark chipped plates keep the original visual language.
        ctx.fillStyle = '#080605';
        ctx.strokeStyle = '#54362b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx - halfWidth, cy);
        ctx.lineTo(mx - halfWidth * 0.5, cy - halfHeight * 0.8);
        ctx.lineTo(mx + 3, cy - halfHeight);
        ctx.lineTo(mx + halfWidth, cy - halfHeight * 0.4);
        ctx.lineTo(mx + halfWidth, cy + halfHeight * 0.55);
        ctx.lineTo(mx + 1, cy + halfHeight);
        ctx.lineTo(mx - halfWidth * 0.7, cy + halfHeight * 0.7);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // A furnace glow deep in the throat is the principal charge warning.
        const radius = 8 + heat * 13;
        const glow = ctx.createRadialGradient(mx, cy, 0, mx, cy, radius);
        glow.addColorStop(0, `rgba(255,209,130,${heat * 0.85})`);
        glow.addColorStop(0.28, `rgba(225,100,34,${heat * 0.6})`);
        glow.addColorStop(1, 'rgba(130,35,12,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(mx - radius, cy - radius, radius * 2, radius * 2);
        // Short, uneven stone ridges, avoiding the previous rows of white fangs.
        ctx.strokeStyle = `rgba(188,123,79,${0.2 + heat * 0.45})`;
        for (const dir of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(mx - halfWidth * 0.8, cy + dir * halfHeight * 0.7);
            ctx.lineTo(mx - 2, cy + dir * halfHeight * 0.85);
            ctx.lineTo(mx + 2, cy + dir * halfHeight * 0.7);
            ctx.lineTo(mx + halfWidth * 0.7, cy + dir * halfHeight * 0.4);
            ctx.stroke();
        }
        if (!breathing && heat > 0.1) {
            // A few embers pull inward; the signal stays local to the boss.
            for (let i = 0; i < 6; i++) {
                const life = (t * 0.55 + i / 6) % 1;
                const distance = 8 + (1 - life) * 24;
                const angle = i * 2.4 + t * 0.5;
                ctx.globalAlpha = life * heat * 0.65;
                ctx.fillStyle = '#cf8d51';
                ctx.fillRect(mx - Math.abs(Math.cos(angle)) * distance,
                    cy + Math.sin(angle) * distance * 0.65, 1.5, 1.5);
            }
            ctx.globalAlpha = 1;
        }
        // Only the visual bridge changes length; particle emission, damage,
        // reach and the warning timer remain owned by zombie-boss.js.
        renderJet(boss, ctx, breathing ? mx : null, breathing ? cy : null);
        ctx.restore();
    }

    window.ZombieBossLook = { renderBody, renderMaw };
})();
