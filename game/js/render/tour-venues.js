/**
 * Tour venues: two arenas of their own for the Classic Tour stages, instead of
 * the neon night arena every Classic match shares.
 *
 *   hall  (Club tiers)  a community sports hall late on a sunny afternoon:
 *                       clerestory windows with drifting dust in the light,
 *                       wooden bleachers with a handful of locals, swaying
 *                       bunting, pendant lamps and a plank floor.
 *   final (World tier)  the championship final: a steep bowl of thousands of
 *                       camera lights, a ring of floodlights with sweeping
 *                       beams, gold banners, a scoring video board and confetti
 *                       when a point is won.
 *
 * Everything heavy is baked once at the canvas pixel scale. Per frame there is
 * one drawImage for the base, a few batched fills and, for the final, one beam
 * sprite per spotlight. No blur, shadowBlur or gradients are created per frame.
 */
(function () {
    'use strict';
    const TAU = Math.PI * 2;
    const FLOOR = 0.6;

    function rng(seed) {
        let s = seed >>> 0;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }
    function canvas(w, h, sx, sy) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * sx));
        c.height = Math.max(1, Math.round(h * sy));
        const x = c.getContext('2d');
        x.setTransform(sx, 0, 0, sy, 0, 0);
        return [c, x];
    }
    function glow(rgb, size = 128) {
        const [c, x] = canvas(size, size, 1, 1);
        const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.25, `rgba(${rgb},0.5)`);
        g.addColorStop(0.6, `rgba(${rgb},0.12)`); g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g; x.fillRect(0, 0, size, size);
        return c;
    }
    function reduced() { return !!window.PPSettings?.get?.('reduceMotion'); }

    // ════════════════════════════════════════════════════════════════════
    // HALL
    // ════════════════════════════════════════════════════════════════════
    const HALL_COLORS = ['#e8573c', '#f2c14e', '#3fa7a0', '#f4ead2'];

    function bake_hall(x, w, h, S) {
        const fy = S.fy;
        // Back wall: warm plaster over dark timber panelling.
        let g = x.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, '#2a1d18'); g.addColorStop(0.2, '#6a5340'); g.addColorStop(0.55, '#7c6048'); g.addColorStop(1, '#4a3424');
        x.fillStyle = g; x.fillRect(0, 0, w, fy + 1);
        // Timber wainscot with battens.
        const wy = h * 0.46;
        g = x.createLinearGradient(0, wy, 0, fy);
        g.addColorStop(0, '#5a3b22'); g.addColorStop(1, '#2f1d10');
        x.fillStyle = g; x.fillRect(0, wy, w, fy - wy + 1);
        x.fillStyle = 'rgba(0,0,0,0.28)';
        for (let px = 0; px < w; px += Math.max(14, w / 70)) x.fillRect(px, wy, 1.4, fy - wy);
        x.fillStyle = '#8a6840'; x.fillRect(0, wy - 2, w, 3);

        // Clerestory windows: bright sky, mullions, a hint of tree line.
        const wins = [];
        const n = 6, ww = w * 0.098, wh = h * 0.17, wy0 = h * 0.07;
        for (let i = 0; i < n; i++) {
            const cx = w * (0.1 + i * 0.16);
            wins.push({ x: cx - ww / 2, y: wy0, w: ww, h: wh });
            const sky = x.createLinearGradient(0, wy0, 0, wy0 + wh);
            sky.addColorStop(0, '#9fd2f2'); sky.addColorStop(0.7, '#fff0c4'); sky.addColorStop(1, '#ffd994');
            x.fillStyle = sky; x.fillRect(cx - ww / 2, wy0, ww, wh);
            x.fillStyle = 'rgba(40,70,40,0.55)';
            x.beginPath(); x.moveTo(cx - ww / 2, wy0 + wh);
            for (let k = 0; k <= 8; k++) x.lineTo(cx - ww / 2 + (ww * k) / 8, wy0 + wh - (k % 2 ? wh * 0.14 : wh * 0.06));
            x.lineTo(cx + ww / 2, wy0 + wh); x.fill();
            x.strokeStyle = '#2b1c12'; x.lineWidth = 3; x.strokeRect(cx - ww / 2, wy0, ww, wh);
            x.lineWidth = 1.5; x.beginPath();
            x.moveTo(cx, wy0); x.lineTo(cx, wy0 + wh); x.moveTo(cx - ww / 2, wy0 + wh * 0.5); x.lineTo(cx + ww / 2, wy0 + wh * 0.5);
            x.stroke();
        }
        // Roof beams and pendant lamps.
        x.fillStyle = '#1a110b'; x.fillRect(0, 0, w, h * 0.045);
        x.fillStyle = '#2e1e14'; x.fillRect(0, h * 0.045, w, 3);
        const lamps = [];
        for (const f of [0.22, 0.5, 0.78]) {
            const lx = w * f, ly = h * 0.17 + (f === 0.5 ? h * 0.02 : 0);
            x.strokeStyle = '#120a06'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(lx, h * 0.045); x.lineTo(lx, ly - h * 0.02); x.stroke();
            x.fillStyle = '#3a4a42';
            x.beginPath(); x.moveTo(lx - h * 0.028, ly); x.lineTo(lx - h * 0.012, ly - h * 0.026); x.lineTo(lx + h * 0.012, ly - h * 0.026); x.lineTo(lx + h * 0.028, ly); x.closePath(); x.fill();
            x.fillStyle = '#fff2c0'; x.beginPath(); x.ellipse(lx, ly, h * 0.026, h * 0.007, 0, 0, TAU); x.fill();
            lamps.push({ x: lx, y: ly });
        }
        // Wall clock and notice board.
        const cx = w * 0.075, cy = h * 0.325, cr = h * 0.034;
        x.fillStyle = '#efe5cc'; x.beginPath(); x.arc(cx, cy, cr, 0, TAU); x.fill();
        x.strokeStyle = '#2b1c12'; x.lineWidth = 2.5; x.stroke();
        x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - cr * 0.7); x.moveTo(cx, cy); x.lineTo(cx + cr * 0.45, cy + cr * 0.2); x.stroke();
        x.fillStyle = '#5e3d22'; x.fillRect(w * 0.88, h * 0.29, w * 0.07, h * 0.075);
        x.fillStyle = '#d9cfae';
        for (const [dx, dy, rw, rh] of [[0.006, 0.01, 0.022, 0.03], [0.034, 0.014, 0.024, 0.028], [0.012, 0.045, 0.026, 0.022]]) x.fillRect(w * 0.88 + w * dx, h * 0.29 + h * dy, w * rw, h * rh);
        // Bleachers: two wooden tiers, a few locals.
        const rows = [[h * 0.37, h * 0.455], [h * 0.43, h * 0.52]];
        const r = rng(77);
        const folks = [];
        rows.forEach(([y0, y1], ri) => {
            x.fillStyle = ri ? '#6a4526' : '#5a3a20'; x.fillRect(0, y1 - 5, w, 7);
            x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, y1 + 2, w, 4);
            const count = Math.floor(w / (h * 0.055));
            for (let i = 0; i < count; i++) {
                if (r() < 0.42) continue;
                const px = (i + 0.5 + (r() - 0.5) * 0.4) * (w / count), sz = h * (0.021 + r() * 0.006);
                const shirt = ['#c6513a', '#3b6ea5', '#d6b04a', '#4c8a62', '#7a5aa6', '#d9d0bb', '#303a46'][Math.floor(r() * 7)];
                const skin = ['#e1b48c', '#c08a62', '#8a5a3a', '#f0cba8'][Math.floor(r() * 4)];
                const by = y1 - 2;
                x.fillStyle = shirt; x.beginPath(); x.ellipse(px, by - sz * 0.55, sz * 0.95, sz * 0.8, 0, Math.PI, 0); x.fill();
                x.fillRect(px - sz * 0.95, by - sz * 0.55, sz * 1.9, sz * 0.55);
                x.fillStyle = skin; x.beginPath(); x.arc(px, by - sz * 1.45, sz * 0.52, 0, TAU); x.fill();
                x.fillStyle = ['#2a1a10', '#6a4a2a', '#c8a050', '#222'][Math.floor(r() * 4)];
                x.beginPath(); x.arc(px, by - sz * 1.58, sz * 0.52, Math.PI, 0); x.fill();
                if (ri === 1 && folks.length < 14 && r() < 0.5) folks.push({ x: px, y: by - sz * 0.5, s: sz, shirt, phase: r() * TAU });
            }
        });

        // Wooden floor: planks running toward the court, with a high sheen.
        g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, '#4a2c14'); g.addColorStop(0.35, '#7a4a22'); g.addColorStop(1, '#5a3418');
        x.fillStyle = g; x.fillRect(0, fy, w, h - fy);
        const vx = w * 0.5, vy = fy - h * 0.55;
        x.lineWidth = 1;
        for (let i = -26; i <= 26; i++) {
            const bx = w * 0.5 + i * (w / 22);
            x.strokeStyle = i % 2 ? 'rgba(20,8,0,0.34)' : 'rgba(255,200,130,0.10)';
            x.beginPath(); x.moveTo(vx + (bx - vx) * (fy - vy) / (h - vy) * 1, fy); x.lineTo(bx, h); x.stroke();
        }
        for (let yy = fy + 5, k = 1; yy < h; k++, yy += 5 + k * 3.2) {
            x.strokeStyle = 'rgba(20,8,0,0.22)'; x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke();
        }
        // Window reflections lying on the floor.
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const wn of wins) {
            const rg = x.createLinearGradient(0, fy, 0, fy + (h - fy) * 0.9);
            rg.addColorStop(0, 'rgba(255,230,170,0.22)'); rg.addColorStop(1, 'rgba(255,210,150,0)');
            x.fillStyle = rg;
            x.beginPath(); x.moveTo(wn.x, fy); x.lineTo(wn.x + wn.w, fy);
            x.lineTo(wn.x + wn.w * 1.5 - w * 0.02, fy + (h - fy) * 0.9); x.lineTo(wn.x - wn.w * 0.5 - w * 0.02, fy + (h - fy) * 0.9); x.fill();
        }
        x.restore();
        // Skirting where wall meets floor.
        x.fillStyle = '#1c1008'; x.fillRect(0, fy - 3, w, 5);

        // Soft vignette so the neon HUD and court read.
        const vg = x.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, w * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,3,0,0.55)');
        x.fillStyle = vg; x.fillRect(0, 0, w, h);
        S.wins = wins; S.lamps = lamps; S.folks = folks;
    }

    function frame_hall(ctx, w, h, S, st) {
        const t = S.t, cheer = S.cheer, calm = reduced() ? 0 : 1;
        // Sun shafts leaning from every window onto the floor, breathing slowly.
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        S.wins.forEach((wn, i) => {
            const a = 0.5 + 0.18 * Math.sin(t * 0.3 * calm + i * 1.7) + cheer * 0.2;
            ctx.globalAlpha = a; ctx.drawImage(S.shaft, wn.x - wn.w * 0.1, wn.y + wn.h, wn.w * 1.5, S.shaftH);
        });
        for (const l of S.lamps) { ctx.globalAlpha = 0.9 + cheer * 0.1; ctx.drawImage(S.warm, l.x - 70, l.y - 50, 140, 140); }
        // Dust drifting through the light.
        ctx.fillStyle = '#fff2cc';
        for (const m of S.motes) {
            const mx = (m.x + Math.sin(t * 0.2 * calm + m.p) * 14 + t * 2.5 * calm * m.v) % w, my = m.y + Math.sin(t * 0.35 * calm + m.p * 2) * 10;
            ctx.globalAlpha = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * calm + m.p));
            ctx.fillRect(mx < 0 ? mx + w : mx, my, m.s, m.s);
        }
        ctx.restore();
        // Bunting sagging across the wall; it jolts when a point is scored.
        for (let s = 0; s < 2; s++) {
            const y0 = h * (0.215 + s * 0.045), sag = h * (0.045 + s * 0.015), n = 22;
            const paths = HALL_COLORS.map(() => new Path2D());
            for (let i = 0; i < n; i++) {
                const u = (i + 0.5) / n, px = w * u;
                const py = y0 + Math.sin(u * Math.PI) * sag + Math.sin(t * 1.3 * calm + i * 0.6 + s) * (1.2 + cheer * 3);
                const sw = Math.sin(t * 1.6 * calm + i * 0.8) * (1.5 + cheer * 4);
                const p = paths[(i + s) % HALL_COLORS.length], tw = w / n * 0.4;
                p.moveTo(px - tw, py); p.lineTo(px + tw, py); p.lineTo(px + sw, py + h * 0.036);
            }
            HALL_COLORS.forEach((c, k) => { ctx.fillStyle = c; ctx.fill(paths[k]); });
            ctx.strokeStyle = '#2b1c12'; ctx.lineWidth = 1.2; ctx.beginPath();
            for (let i = 0; i <= 40; i++) { const u = i / 40; ctx[i ? 'lineTo' : 'moveTo'](w * u, y0 + Math.sin(u * Math.PI) * sag); }
            ctx.stroke();
        }
        // The locals cheer: arms up after a point, idle sway otherwise.
        for (const f of S.folks) {
            const up = Math.min(1, cheer * 1.4);
            const bob = Math.sin(t * 1.4 * calm + f.phase) * 0.6;
            ctx.strokeStyle = f.shirt; ctx.lineWidth = Math.max(2, f.s * 0.32); ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(f.x - f.s * 0.8, f.y); ctx.lineTo(f.x - f.s * 1.1, f.y - f.s * (0.2 + up * 1.7) + bob);
            ctx.moveTo(f.x + f.s * 0.8, f.y); ctx.lineTo(f.x + f.s * 1.1, f.y - f.s * (0.2 + up * 1.7) + bob);
            ctx.stroke();
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // FINAL
    // ════════════════════════════════════════════════════════════════════
    function bake_final(x, w, h, S) {
        const fy = S.fy, r = rng(2026);
        let g = x.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, '#010208'); g.addColorStop(0.5, '#050a1c'); g.addColorStop(1, '#0a1230');
        x.fillStyle = g; x.fillRect(0, 0, w, fy + 1);
        // The bowl: curved rows of spectators, packed tighter as it climbs.
        const rows = 15, top = h * 0.2, bottom = h * 0.54, spots = [];
        for (let i = 0; i < rows; i++) {
            const u = i / (rows - 1), y = top + (bottom - top) * Math.pow(u, 1.15);
            const sz = h * (0.0105 + u * 0.01), step = sz * 2.15, curve = h * 0.05 * (1 - u * 0.4);
            x.fillStyle = `rgb(${10 + u * 6},${14 + u * 8},${34 + u * 12})`;
            x.fillRect(0, y - sz, w, sz * 2.4);
            for (let px = -step * r(); px < w + step; px += step) {
                const k = (px / w - 0.5) * 2, py = y + curve * k * k;
                const shade = 16 + Math.floor(r() * 36);
                x.fillStyle = `rgb(${shade + 6},${shade + 10},${shade + 30})`;
                x.beginPath(); x.arc(px, py, sz * 0.82, 0, TAU); x.fill();
                if (r() < 0.07 + u * 0.04) spots.push({ x: px, y: py - sz * 0.2, p: r() * TAU, f: 1.2 + r() * 2.6 });
                // Flags and scarves in a few colours.
                if (r() < 0.05) { x.fillStyle = ['#ffd24d', '#47b6ff', '#ff5a7a', '#f2f2f2'][Math.floor(r() * 4)]; x.fillRect(px - sz * 0.5, py - sz * 1.5, sz, sz * 0.7); }
            }
        }
        // Upper dark rim and the floodlight ring hanging in front of it.
        const ring = [];
        const rcx = w * 0.5, rcy = h * 0.075, rrx = w * 0.46, rry = h * 0.05;
        x.strokeStyle = '#23304f'; x.lineWidth = 3; x.beginPath(); x.ellipse(rcx, rcy, rrx, rry, 0, 0, TAU); x.stroke();
        x.strokeStyle = '#0c1226'; x.lineWidth = 6; x.beginPath(); x.ellipse(rcx, rcy + 4, rrx, rry, 0, 0, TAU); x.stroke();
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * TAU, px = rcx + Math.cos(a) * rrx, py = rcy + Math.sin(a) * rry;
            ring.push({ x: px, y: py, front: Math.sin(a) > 0 });
        }
        // Video board over the middle of the stands.
        const bw = w * 0.3, bh = h * 0.085, bx = w * 0.5 - bw / 2, by = h * 0.125;
        x.fillStyle = '#05070f'; x.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
        g = x.createLinearGradient(bx, 0, bx + bw, 0);
        g.addColorStop(0, '#d9a93a'); g.addColorStop(0.5, '#fff0b0'); g.addColorStop(1, '#d9a93a');
        x.strokeStyle = g; x.lineWidth = 3; x.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
        x.fillStyle = '#071029'; x.fillRect(bx, by, bw, bh);
        // Gold banners with a crest, hanging at both sides.
        const banners = [];
        for (const f of [0.1, 0.9]) {
            const bwn = w * 0.07, bhn = h * 0.3, bxn = w * f - bwn / 2, byn = 0;
            const [bc, bxx] = canvas(bwn, bhn, S.sx, S.sy);
            const gg = bxx.createLinearGradient(0, 0, bwn, 0);
            gg.addColorStop(0, '#8a6414'); gg.addColorStop(0.3, '#ffe28a'); gg.addColorStop(0.7, '#d9a93a'); gg.addColorStop(1, '#6a4a0c');
            bxx.fillStyle = gg;
            bxx.beginPath(); bxx.moveTo(0, 0); bxx.lineTo(bwn, 0); bxx.lineTo(bwn, bhn); bxx.lineTo(bwn / 2, bhn * 0.93); bxx.lineTo(0, bhn); bxx.closePath(); bxx.fill();
            bxx.strokeStyle = '#5a3d08'; bxx.lineWidth = 2; bxx.stroke();
            const cy = bhn * 0.42, cr = bwn * 0.28;
            bxx.strokeStyle = '#3a2704'; bxx.lineWidth = 2.5; bxx.beginPath(); bxx.arc(bwn / 2, cy, cr, 0, TAU); bxx.stroke();
            bxx.fillStyle = '#3a2704'; bxx.beginPath();
            for (let k = 0; k < 10; k++) { const rr = k % 2 ? cr * 0.32 : cr * 0.78, a2 = -Math.PI / 2 + (k * Math.PI) / 5; bxx[k ? 'lineTo' : 'moveTo'](bwn / 2 + Math.cos(a2) * rr, cy + Math.sin(a2) * rr); }
            bxx.closePath(); bxx.fill();
            for (const d of [-1, 1]) {
                bxx.beginPath(); bxx.arc(bwn / 2, cy, cr * 1.4, d < 0 ? Math.PI * 0.62 : Math.PI * -0.12, d < 0 ? Math.PI * 1.12 : Math.PI * 0.38); bxx.stroke();
            }
            banners.push({ c: bc, x: bxn, y: byn, w: bwn, h: bhn });
        }
        // Floor: black glass with the board line and a gold ring emblem.
        g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, '#0a1024'); g.addColorStop(0.4, '#05070f'); g.addColorStop(1, '#010206');
        x.fillStyle = g; x.fillRect(0, fy, w, h - fy);
        x.strokeStyle = 'rgba(255,214,120,0.28)'; x.lineWidth = 2;
        x.beginPath(); x.ellipse(w * 0.5, fy + (h - fy) * 0.55, w * 0.36, (h - fy) * 0.34, 0, 0, TAU); x.stroke();
        x.lineWidth = 1; x.strokeStyle = 'rgba(255,214,120,0.16)';
        x.beginPath(); x.ellipse(w * 0.5, fy + (h - fy) * 0.55, w * 0.31, (h - fy) * 0.28, 0, 0, TAU); x.stroke();
        // Gold board edge.
        x.fillStyle = '#1a1405'; x.fillRect(0, h * 0.545, w, fy - h * 0.545);
        g = x.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#6a4a0c'); g.addColorStop(0.5, '#ffe28a'); g.addColorStop(1, '#6a4a0c');
        x.fillStyle = g; x.fillRect(0, h * 0.545, w, 2); x.fillRect(0, fy - 1, w, 2);
        // Dim the stands toward the floor so the court owns the eye.
        const dg = x.createLinearGradient(0, h * 0.4, 0, fy);
        dg.addColorStop(0, 'rgba(0,0,6,0)'); dg.addColorStop(1, 'rgba(0,0,6,0.5)');
        x.fillStyle = dg; x.fillRect(0, h * 0.4, w, fy - h * 0.4);
        S.spots = spots; S.ring = ring; S.banners = banners; S.board = { x: bx, y: by, w: bw, h: bh };
    }

    function frame_final(ctx, w, h, S, st, dt) {
        const t = S.t, cheer = S.cheer, calm = reduced() ? 0 : 1;
        // Camera phones twinkling across the bowl, in three alpha buckets.
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff4d0';
        const buckets = [new Path2D(), new Path2D(), new Path2D()];
        for (const s of S.spots) {
            const v = 0.5 + 0.5 * Math.sin(t * s.f * calm + s.p);
            const k = v > 0.9 ? 2 : v > 0.7 ? 1 : v > 0.45 ? 0 : -1;
            if (k >= 0) buckets[k].rect(s.x - 1, s.y - 1, k === 2 ? 3 : 2, k === 2 ? 3 : 2);
        }
        [0.35, 0.65, 1].forEach((a, i) => { ctx.globalAlpha = Math.min(1, a + cheer * 0.2); ctx.fill(buckets[i]); });
        // Ring lights.
        ctx.fillStyle = '#e8f2ff';
        for (const l of S.ring) {
            ctx.globalAlpha = 0.85; ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
            ctx.globalAlpha = 0.45 + cheer * 0.3; ctx.drawImage(S.cool, l.x - 22, l.y - 22, 44, 44);
        }
        // Sweeping beams from the ring toward the floor.
        const beam = S.beam;
        for (let i = 0; i < 6; i++) {
            const l = S.ring[Math.floor((i + 0.5) * S.ring.length / 6) % S.ring.length];
            const a = (l.x / w - 0.5) * -0.5 + Math.sin(t * (0.28 + i * 0.05) * calm + i * 2) * (0.2 + cheer * 0.15);
            const len = h * 0.62;
            ctx.globalAlpha = 0.26 + cheer * 0.18;
            ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(a);
            ctx.drawImage(beam, -beam.width * 0.5 * len / beam.height, 0, beam.width * len / beam.height, len);
            ctx.restore();
        }
        ctx.restore();
        // Board: scrolling gold text.
        const b = S.board;
        ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        const off = (t * 38 * calm) % S.marquee.w;
        for (let px = -off; px < b.w; px += S.marquee.w) ctx.drawImage(S.marquee.c, b.x + px, b.y, S.marquee.w, S.marquee.h);
        ctx.restore();
        // Banners sway from their top edge.
        for (let i = 0; i < S.banners.length; i++) {
            const bn = S.banners[i], sh = Math.sin(t * 0.9 * calm + i * 2.2) * (0.012 + cheer * 0.03);
            ctx.save(); ctx.translate(bn.x + bn.w / 2, bn.y); ctx.transform(1, 0, sh, 1, 0, 0); ctx.drawImage(bn.c, -bn.w / 2, 0, bn.w, bn.h); ctx.restore();
        }
        // Floor strip scrolling along the boards.
        const sy2 = h * 0.548;
        const so = ((t * w * 0.05 * calm) % S.strip.w + S.strip.w) % S.strip.w;
        for (let px = -so; px < w; px += S.strip.w) ctx.drawImage(S.strip.c, px, sy2, S.strip.w, S.strip.h);
        // Confetti.
        if (S.burst && !reduced()) {
            S.burst = false;
            for (let i = 0; i < 50; i++) S.conf.push({ x: Math.random() * w, y: -10 - Math.random() * h * 0.2, vx: (Math.random() - 0.5) * 40, vy: 70 + Math.random() * 110, c: i % 3, p: Math.random() * TAU });
        }
        if (S.conf.length) {
            const cols = ['#ffd24d', '#f4f8ff', '#47b6ff'];
            let keep = 0;
            const paths = [new Path2D(), new Path2D(), new Path2D()];
            for (const c of S.conf) {
                c.y += c.vy * dt; c.x += c.vx * dt + Math.sin(t * 3 + c.p) * 0.6;
                if (c.y > h * 0.85) continue;
                S.conf[keep++] = c;
                const wob = Math.abs(Math.sin(t * 6 + c.p));
                paths[c.c].rect(c.x, c.y, 5, 1 + wob * 4);
            }
            S.conf.length = keep;
            ctx.save(); ctx.globalAlpha = 0.95;
            paths.forEach((p, i) => { ctx.fillStyle = cols[i]; ctx.fill(p); });
            ctx.restore();
        }
    }

    // ════════════════════════════════════════════════════════════════════
    class TourVenue {
        constructor(kind) {
            this.kind = kind === 'final' ? 'final' : 'hall';
            this.key = ''; this.t = 0; this.cheer = 0; this._score = -1;
        }
        _bake(ctx, w, h) {
            const m = ctx.getTransform();
            const sx = Math.hypot(m.a, m.b) || 1, sy = Math.hypot(m.c, m.d) || 1;
            const key = `${w}|${h}|${sx.toFixed(3)}|${sy.toFixed(3)}`;
            if (key === this.key) return;
            this.key = key;
            const S = this.S = { sx, sy, fy: Math.round(h * FLOOR), t: this.t, cheer: 0, conf: [] };
            const [bc, bx] = canvas(w, h, sx, sy);
            if (this.kind === 'hall') {
                bake_hall(bx, w, h, S);
                S.warm = glow('255,214,150', 128);
                S.shaftH = h * 0.62;
                const [sc, sxx] = canvas(1, 1, 1, 1);
                sc.width = 96; sc.height = 256;
                const gg = sxx.createLinearGradient(0, 0, 0, 256);
                gg.addColorStop(0, 'rgba(255,226,160,0.30)'); gg.addColorStop(1, 'rgba(255,226,160,0)');
                sxx.setTransform(1, 0, 0, 1, 0, 0); sxx.fillStyle = gg;
                sxx.beginPath(); sxx.moveTo(24, 0); sxx.lineTo(72, 0); sxx.lineTo(96, 256); sxx.lineTo(0, 256); sxx.closePath(); sxx.fill();
                S.shaft = sc;
                const r = rng(5); S.motes = [];
                for (let i = 0; i < 34; i++) S.motes.push({ x: r() * w, y: h * (0.2 + r() * 0.45), s: 1 + r() * 1.6, p: r() * TAU, v: 0.4 + r() });
            } else {
                S.sx = sx; S.sy = sy;
                bake_final(bx, w, h, S);
                S.cool = glow('190,220,255', 64);
                const bl = Math.round(h * 0.62), bw2 = 120;
                const [bm, bmx] = canvas(1, 1, 1, 1);
                bm.width = bw2; bm.height = bl; bmx.setTransform(1, 0, 0, 1, 0, 0);
                const gg = bmx.createLinearGradient(0, 0, 0, bl);
                gg.addColorStop(0, 'rgba(210,230,255,0.55)'); gg.addColorStop(1, 'rgba(210,230,255,0)');
                bmx.fillStyle = gg; bmx.beginPath(); bmx.moveTo(bw2 * 0.46, 0); bmx.lineTo(bw2 * 0.54, 0); bmx.lineTo(bw2, bl); bmx.lineTo(0, bl); bmx.closePath(); bmx.fill();
                S.beam = bm;
                // Marquee text for the video board, and the LED strip on the boards.
                // A looping ticker is as wide as its text, so the tile seam never cuts a word.
                const ticker = (text, th, px, bg, fg) => {
                    const font = `800 ${Math.round(px)}px Orbitron, Rajdhani, sans-serif`;
                    const probe = document.createElement('canvas').getContext('2d');
                    probe.font = font;
                    const tw = Math.ceil(probe.measureText(text).width + px * 2);
                    const [c, x] = canvas(tw, th, sx, sy);
                    x.fillStyle = bg; x.fillRect(0, 0, tw, th);
                    x.fillStyle = fg; x.textBaseline = 'middle'; x.font = font;
                    x.fillText(text, px, th * 0.54);
                    return { c, w: tw, h: th };
                };
                const b = S.board;
                S.marquee = ticker('WORLD FINAL   \u2605   CENTRE COURT   \u2605', b.h, b.h * 0.36, '#071029', '#ffd96a');
                const sh = h * 0.6 - h * 0.548 - 4;
                S.strip = ticker('WORLD CHAMPIONSHIP  \u25C6  MATCH POINT  \u25C6  CHAMPIONS  \u25C6', sh, sh * 0.62, '#0d0a02', '#ffd96a');
            }
            this.base = bc;
        }
        draw(ctx, w, h, st) {
            this._bake(ctx, w, h);
            const S = this.S, dt = Math.max(0, Math.min(0.1, st.dt || 0));
            if (!reduced()) this.t += dt;
            if (this._score >= 0 && st.score !== this._score) { this.cheer = 1; S.burst = true; }
            this._score = st.score;
            this.cheer = Math.max(0, this.cheer - dt * 0.4);
            S.t = this.t; S.cheer = this.cheer;
            ctx.drawImage(this.base, 0, 0, w, h);
            if (this.kind === 'hall') frame_hall(ctx, w, h, S, st);
            else frame_final(ctx, w, h, S, st, dt);
        }
    }

    window.TourVenue = TourVenue;
})();
