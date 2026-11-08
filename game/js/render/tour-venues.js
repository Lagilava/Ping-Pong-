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
            rg.addColorStop(0, 'rgba(255,230,170,0.10)'); rg.addColorStop(1, 'rgba(255,210,150,0)');
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
            const a = 0.22 + 0.07 * Math.sin(t * 0.3 * calm + i * 1.7) + cheer * 0.08;
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
        // A broad, dim pool of reflected arena light gives the floor depth.
        const floorGlow = x.createRadialGradient(w * 0.5, fy + (h - fy) * 0.12, 0, w * 0.5, fy + (h - fy) * 0.12, w * 0.46);
        floorGlow.addColorStop(0, 'rgba(76,110,180,0.18)');
        floorGlow.addColorStop(1, 'rgba(76,110,180,0)');
        x.fillStyle = floorGlow; x.fillRect(0, fy, w, h - fy);
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
    // DOCK (Regional, Gravity): a station viewport over a ringed gas giant
    // ════════════════════════════════════════════════════════════════════
    function stars(x, w, h, n, seed, maxY) {
        const r = rng(seed);
        for (let i = 0; i < n; i++) {
            const a = 0.25 + r() * 0.75;
            x.fillStyle = `rgba(${200 + Math.floor(r() * 55)},${215 + Math.floor(r() * 40)},255,${a})`;
            const sz = r() < 0.08 ? 2 : 1;
            x.fillRect(r() * w, r() * maxY, sz, sz);
        }
    }

    function bake_dock(x, w, h, S) {
        const fy = S.fy, r = rng(31);
        let g = x.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, '#02030a'); g.addColorStop(0.7, '#070c24'); g.addColorStop(1, '#14143c');
        x.fillStyle = g; x.fillRect(0, 0, w, fy + 1);
        stars(x, w, h, 260, 9, fy);
        // The planet: a banded gas giant with a ring, lit from the upper left.
        const pr = h * 0.2, pcx = w * 0.76, pcy = h * 0.3;
        S.planet = { r: pr, cx: pcx, cy: pcy };
        const ringPath = (front) => { x.beginPath(); x.ellipse(pcx, pcy, pr * 1.9, pr * 0.42, -0.22, front ? 0 : Math.PI, front ? Math.PI : TAU); };
        for (const [rw, col] of [[pr * 0.34, 'rgba(200,170,255,0.18)'], [pr * 0.14, 'rgba(255,230,200,0.3)'], [pr * 0.06, 'rgba(120,200,255,0.4)']]) {
            x.strokeStyle = col; x.lineWidth = rw * 0.5;
            x.save(); x.translate(0, 0); x.beginPath(); x.ellipse(pcx, pcy, pr * (1.55 + rw / pr * 0.5), pr * (0.34 + rw / pr * 0.1), -0.22, Math.PI, TAU); x.stroke(); x.restore();
        }
        // Texture strip for the planet (scrolled live to turn it).
        const tw = Math.ceil(pr * 4), th = Math.ceil(pr * 2);
        const [tc, tx] = canvas(tw, th, S.sx, S.sy);
        const bands = ['#2a1b6a', '#4a2f9a', '#7a4fc4', '#c97ad0', '#f0a0b8', '#6fa0e0', '#3a2a8a'];
        let by = 0;
        while (by < th) { const bh = th * (0.05 + r() * 0.11); tx.fillStyle = bands[Math.floor(r() * bands.length)]; tx.fillRect(0, by, tw, bh + 1); by += bh; }
        tx.globalAlpha = 0.25; tx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) { tx.beginPath(); tx.ellipse(r() * tw, r() * th, 6 + r() * 30, 1 + r() * 3, 0, 0, TAU); tx.fill(); }
        S.planetTex = { c: tc, w: tw, h: th };
        // Planet body is drawn live (texture scroll) over this baked shadow disc.
        const [sc, sx2] = canvas(pr * 2, pr * 2, S.sx, S.sy);
        const sh = sx2.createRadialGradient(pr * 0.65, pr * 0.6, pr * 0.1, pr, pr, pr * 1.05);
        sh.addColorStop(0, 'rgba(255,255,255,0.0)'); sh.addColorStop(0.55, 'rgba(10,6,40,0.25)'); sh.addColorStop(1, 'rgba(2,2,14,0.92)');
        sx2.fillStyle = sh; sx2.beginPath(); sx2.arc(pr, pr, pr, 0, TAU); sx2.fill();
        S.planetShade = sc;
        // Atmosphere glow around the limb.
        const ag = x.createRadialGradient(pcx, pcy, pr * 0.95, pcx, pcy, pr * 1.35);
        ag.addColorStop(0, 'rgba(150,120,255,0.35)'); ag.addColorStop(1, 'rgba(150,120,255,0)');
        x.fillStyle = ag; x.fillRect(pcx - pr * 1.4, pcy - pr * 1.4, pr * 2.8, pr * 2.8);
        // Station frame: a heavy viewport with struts and a lower sill.
        x.fillStyle = '#0a0d1a'; x.fillRect(0, 0, w, h * 0.055);
        x.fillStyle = '#161c34'; x.fillRect(0, h * 0.055, w, 3);
        for (const f of [0.0, 0.31, 0.69, 1.0]) {
            const sx3 = w * f, sw = w * (f === 0 || f === 1 ? 0.05 : 0.028);
            const sg = x.createLinearGradient(sx3 - sw, 0, sx3 + sw, 0);
            sg.addColorStop(0, '#0b1020'); sg.addColorStop(0.5, '#2a3558'); sg.addColorStop(1, '#0b1020');
            x.fillStyle = sg; x.fillRect(sx3 - sw / 2, 0, sw, fy);
            x.fillStyle = 'rgba(160,190,255,0.5)';
            for (let yy = h * 0.09; yy < fy - 6; yy += h * 0.07) { x.beginPath(); x.arc(sx3, yy, 1.4, 0, TAU); x.fill(); }
        }
        // Docking gantry in the corner.
        x.strokeStyle = '#1b2442'; x.lineWidth = 5;
        x.beginPath(); x.moveTo(w * 0.05, h * 0.055); x.lineTo(w * 0.05, h * 0.2); x.lineTo(w * 0.17, h * 0.27); x.stroke();
        x.lineWidth = 2; x.strokeStyle = '#2d3a66';
        for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(w * 0.05, h * (0.075 + i * 0.02)); x.lineTo(w * (0.07 + i * 0.016), h * (0.095 + i * 0.02)); x.stroke(); }
        // Deck: dark plating with glowing lane lines running to the horizon.
        g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, '#0e1430'); g.addColorStop(0.3, '#080c20'); g.addColorStop(1, '#03040c');
        x.fillStyle = g; x.fillRect(0, fy, w, h - fy);
        x.fillStyle = '#1b2442'; x.fillRect(0, fy - 4, w, 6);
        x.fillStyle = '#05070f'; x.fillRect(0, fy + 2, w, 3);
        const vx = w * 0.5, vy = h * 0.12;
        S.lanes = [];
        for (let i = -9; i <= 9; i++) {
            const bx = w * 0.5 + i * (w / 12);
            S.lanes.push([vx + (bx - vx) * (fy - vy) / (h - vy), fy, bx, h]);
            x.strokeStyle = 'rgba(70,90,160,0.28)'; x.lineWidth = 1;
            x.beginPath(); x.moveTo(S.lanes[S.lanes.length - 1][0], fy); x.lineTo(bx, h); x.stroke();
        }
        for (let yy = fy + 6, k = 1; yy < h; k++, yy += 5 + k * 3.4) { x.strokeStyle = 'rgba(70,90,160,0.18)'; x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke(); }
        // The planet reflected faintly in the polished deck.
        x.save(); x.globalCompositeOperation = 'lighter';
        const rg = x.createRadialGradient(pcx, fy + (h - fy) * 0.3, 0, pcx, fy + (h - fy) * 0.3, w * 0.3);
        rg.addColorStop(0, 'rgba(150,110,240,0.22)'); rg.addColorStop(1, 'rgba(150,110,240,0)');
        x.fillStyle = rg; x.fillRect(0, fy, w, h - fy); x.restore();
        S.beacons = [0.31, 0.69].flatMap((f) => [0.12, 0.28, 0.44].map((yy) => ({ x: w * f, y: h * yy })));
        S.rear = { x: pcx, y: pcy };
    }

    function frame_dock(ctx, w, h, S, st) {
        const t = S.t, cheer = S.cheer, calm = reduced() ? 0 : 1, P = S.planet;
        // Planet turning: texture scrolls under a fixed terminator.
        ctx.save();
        ctx.beginPath(); ctx.arc(P.cx, P.cy, P.r, 0, TAU); ctx.clip();
        const off = (t * 9 * calm) % S.planetTex.w;
        for (let px = -off; px < P.r * 2; px += S.planetTex.w) ctx.drawImage(S.planetTex.c, P.cx - P.r + px, P.cy - P.r, S.planetTex.w, P.r * 2);
        ctx.drawImage(S.planetShade, P.cx - P.r, P.cy - P.r, P.r * 2, P.r * 2);
        ctx.restore();
        // Front half of the ring crosses the planet.
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [k, a, wd] of [[1.55, 0.34, 8], [1.78, 0.22, 4], [1.95, 0.4, 2]]) {
            ctx.strokeStyle = `rgba(230,205,255,${a + cheer * 0.35})`; ctx.lineWidth = wd * (P.r / 140);
            ctx.beginPath(); ctx.ellipse(P.cx, P.cy, P.r * k, P.r * (0.34 + (k - 1.55) * 0.1), -0.22, 0, Math.PI); ctx.stroke();
        }
        // A freighter crossing the view.
        const sp = ((t * 0.018 * calm) % 1);
        const sx = w * (1.05 - sp * 1.2), sy = h * 0.19 + Math.sin(sp * 6) * 4;
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(sx, sy, 3, 2);
        ctx.fillStyle = 'rgba(255,90,90,0.9)'; ctx.fillRect(sx + 8, sy + 1, 2, 2);
        ctx.fillStyle = 'rgba(90,255,160,0.9)'; ctx.fillRect(sx - 8, sy + 1, 2, 2);
        // Strut beacons blink in sequence, all at once on a point.
        S.beacons.forEach((b, i) => {
            const on = cheer > 0.3 || Math.floor(t * 1.6 * calm + i * 0.5) % 3 === 0;
            ctx.globalAlpha = on ? 1 : 0.25; ctx.fillStyle = i % 2 ? '#7fe8ff' : '#ff6f91';
            ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
            if (on) { ctx.globalAlpha = 0.5; ctx.drawImage(S.glowA, b.x - 18, b.y - 18, 36, 36); }
        });
        // Light pulses racing along the deck lanes toward the viewport.
        ctx.globalAlpha = 0.36 + cheer * 0.15;
        ctx.strokeStyle = '#7fb4ff'; ctx.lineWidth = 2;
        S.lanes.forEach((l, i) => {
            const u = ((t * 0.35 * calm + i * 0.137) % 1);
            const x0 = l[2] + (l[0] - l[2]) * u, y0 = l[3] + (l[1] - l[3]) * u;
            const u2 = Math.min(1, u + 0.05), x1 = l[2] + (l[0] - l[2]) * u2, y1 = l[3] + (l[1] - l[3]) * u2;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        });
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════════
    // YARD (Regional, Obstacle): a container port at dusk
    // ════════════════════════════════════════════════════════════════════
    const BOX_COLORS = ['#b8432c', '#2f6f8f', '#c99a2a', '#3e7a4a', '#7a3e6a', '#c9c2b0', '#a8552a'];
    function bake_yard(x, w, h, S) {
        const fy = S.fy, r = rng(808);
        let g = x.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, '#14123a'); g.addColorStop(0.45, '#6a2a5a'); g.addColorStop(0.8, '#e0663a'); g.addColorStop(1, '#ffb455');
        x.fillStyle = g; x.fillRect(0, 0, w, fy + 1);
        stars(x, w, h, 60, 4, h * 0.2);
        // Low sun behind the harbour.
        const sg = x.createRadialGradient(w * 0.5, fy, 0, w * 0.5, fy, w * 0.4);
        sg.addColorStop(0, 'rgba(255,220,140,0.85)'); sg.addColorStop(0.3, 'rgba(255,150,80,0.35)'); sg.addColorStop(1, 'rgba(255,100,60,0)');
        x.fillStyle = sg; x.fillRect(0, h * 0.2, w, fy - h * 0.2);
        // Layered harbour silhouettes break up the flat skyline at a low contrast.
        x.fillStyle = 'rgba(65,32,70,0.38)'; x.beginPath(); x.moveTo(0, fy);
        for (let i = 0; i <= 16; i++) x.lineTo(w * i / 16, fy - h * (0.08 + r() * 0.07));
        x.lineTo(w, fy); x.closePath(); x.fill();
        // Far skyline of stacks and a chimney.
        x.fillStyle = '#2a1636';
        for (let px = 0; px < w; px += w * 0.035) { const bh = h * (0.06 + r() * 0.08); x.fillRect(px, fy - bh - h * 0.04, w * 0.034, bh); }
        x.fillRect(w * 0.84, fy - h * 0.3, w * 0.014, h * 0.26);
        S.chimney = { x: w * 0.847, y: fy - h * 0.3 };
        // Near container stacks left and right, drawn as ribbed boxes.
        const box = (bx, by, bw, bh, col) => {
            x.fillStyle = col; x.fillRect(bx, by, bw, bh);
            x.fillStyle = 'rgba(0,0,0,0.3)';
            for (let k = 2; k < bw - 2; k += Math.max(3, bw / 11)) x.fillRect(bx + k, by + 2, 1.2, bh - 4);
            x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(bx, by, bw, 2);
            x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(bx, by + bh - 2, bw, 2);
        };
        const bw = w * 0.07, bh = h * 0.05;
        for (const side of [0, 1]) {
            for (let col = 0; col < 3; col++) {
                const stack = 3 + Math.floor(r() * 3) - col * 0 ;
                for (let row = 0; row < stack - col; row++) {
                    const bx = side ? w - (col + 1) * bw - 2 : col * bw + 2;
                    box(bx, fy - h * 0.025 - (row + 1) * bh, bw - 2, bh - 1, BOX_COLORS[Math.floor(r() * BOX_COLORS.length)]);
                }
            }
        }
        // Gantry crane across the top; the hoist is animated live.
        x.fillStyle = '#1a0f24';
        x.fillRect(0, h * 0.075, w, h * 0.014);
        for (const f of [0.22, 0.78]) { x.fillRect(w * f - 4, h * 0.075, 8, fy - h * 0.1); x.fillRect(w * f - 12, fy - h * 0.03, 24, 6); }
        x.strokeStyle = '#1a0f24'; x.lineWidth = 2;
        for (let px = 0; px < w; px += w * 0.03) { x.beginPath(); x.moveTo(px, h * 0.089); x.lineTo(px + w * 0.015, h * 0.075); x.stroke(); }
        S.crane = { y: h * 0.089, minX: w * 0.3, maxX: w * 0.7 };
        // Floodlight towers.
        S.lights = [];
        for (const f of [0.32, 0.68]) {
            const lx = w * f, ly = h * 0.2;
            x.fillStyle = '#1a0f24'; x.fillRect(lx - 2, ly, 4, fy - ly);
            x.fillRect(lx - 14, ly - 6, 28, 8);
            S.lights.push({ x: lx, y: ly - 2 });
        }
        // Concrete apron, hazard line at the kerb, wet patches.
        g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, '#3a3040'); g.addColorStop(0.4, '#2a2230'); g.addColorStop(1, '#14101a');
        x.fillStyle = g; x.fillRect(0, fy, w, h - fy);
        const hz = Math.max(8, h * 0.018);
        x.save(); x.beginPath(); x.rect(0, fy, w, hz); x.clip();
        x.fillStyle = '#e8b422'; x.fillRect(0, fy, w, hz);
        x.fillStyle = '#16121a';
        for (let px = -hz; px < w + hz; px += hz * 2) { x.beginPath(); x.moveTo(px, fy + hz); x.lineTo(px + hz, fy); x.lineTo(px + hz * 2, fy); x.lineTo(px + hz, fy + hz); x.closePath(); x.fill(); }
        x.restore();
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
        for (let i = -12; i <= 12; i++) { const bx = w * 0.5 + i * (w / 9); x.beginPath(); x.moveTo(w * 0.5 + (bx - w * 0.5) * 0.35, fy + hz); x.lineTo(bx, h); x.stroke(); }
        x.save(); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
            const px = r() * w, py = fy + (h - fy) * (0.15 + r() * 0.8), pw = w * (0.05 + r() * 0.09);
            const pg = x.createLinearGradient(0, py, 0, py + 8);
            pg.addColorStop(0, 'rgba(255,170,100,0.10)'); pg.addColorStop(1, 'rgba(255,170,100,0)');
            x.fillStyle = pg; x.beginPath(); x.ellipse(px, py, pw, 6, 0, 0, TAU); x.fill();
        }
        x.restore();
        const vg = x.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, w * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,2,20,0.5)');
        x.fillStyle = vg; x.fillRect(0, 0, w, h);
    }

    function frame_yard(ctx, w, h, S, st, dt) {
        const t = S.t, cheer = S.cheer, calm = reduced() ? 0 : 1, C = S.crane;
        // Trolley rides the gantry; the hoisted container swings on its cable.
        const u = 0.5 + 0.5 * Math.sin(t * 0.22 * calm);
        const tx = C.minX + (C.maxX - C.minX) * u;
        const drop = h * (0.1 + 0.05 * Math.sin(t * 0.45 * calm + 1));
        const swing = Math.sin(t * 0.9 * calm) * (4 + cheer * 10) * 0.01;
        ctx.save();
        ctx.fillStyle = '#120a1c'; ctx.fillRect(tx - 10, C.y, 20, 8);
        ctx.strokeStyle = '#120a1c'; ctx.lineWidth = 1.5;
        ctx.translate(tx, C.y + 8); ctx.rotate(swing);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, drop); ctx.stroke();
        ctx.fillStyle = BOX_COLORS[2]; ctx.fillRect(-w * 0.03, drop, w * 0.06, h * 0.04);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 3; k < w * 0.06 - 2; k += 5) ctx.fillRect(-w * 0.03 + k, drop + 2, 1, h * 0.04 - 4);
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        // Floodlights with a slow flicker and a spill of light onto the apron.
        S.lights.forEach((l, i) => {
            const fl = 0.85 + 0.15 * Math.sin(t * 7 * calm + i * 3) * (Math.sin(t * 0.4) > 0.9 ? 1 : 0.2) + cheer * 0.2;
            ctx.globalAlpha = fl; ctx.drawImage(S.glowA, l.x - 90, l.y - 70, 180, 180);
            ctx.globalAlpha = fl * 0.55;
            ctx.drawImage(S.beamSoft, l.x - h * 0.14, l.y, h * 0.28, (S.fy - l.y) + (h - S.fy) * 0.5);
        });
        // Crane beacon.
        ctx.globalAlpha = Math.floor(t * 1.4 * calm) % 2 ? 1 : 0.2; ctx.fillStyle = '#ff4030';
        ctx.fillRect(C.minX - 4, C.y - 4, 5, 5);
        // Chimney smoke drifting off to the left.
        ctx.fillStyle = 'rgba(60,40,70,1)';
        for (let i = 0; i < 7; i++) {
            const uu = ((t * 0.07 * calm + i / 7) % 1);
            ctx.globalAlpha = (1 - uu) * 0.35;
            ctx.beginPath(); ctx.arc(S.chimney.x - uu * w * 0.12, S.chimney.y - uu * h * 0.12, 5 + uu * 26, 0, TAU); ctx.fill();
        }
        // Welding sparks when a point is won.
        if (S.burst) { S.burst = false; for (let i = 0; i < 30; i++) S.sparks.push({ x: w * (i % 2 ? 0.12 : 0.88), y: S.fy - h * 0.06, vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 200, life: 1 }); }
        if (S.sparks.length) {
            ctx.fillStyle = '#ffd37a'; let keep = 0;
            for (const sp of S.sparks) {
                sp.life -= dt * 1.4; if (sp.life <= 0) continue;
                sp.vy += 520 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; S.sparks[keep++] = sp;
                ctx.globalAlpha = sp.life; ctx.fillRect(sp.x, sp.y, 2, 2);
            }
            S.sparks.length = keep;
        }
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════════
    // TUNNEL (National, Speed): a ring-lit wind tunnel
    // ════════════════════════════════════════════════════════════════════
    function bake_tunnel(x, w, h, S) {
        const fy = S.fy;
        S.vp = { x: w * 0.5, y: h * 0.4 };
        const g = x.createRadialGradient(S.vp.x, S.vp.y, 0, S.vp.x, S.vp.y, w * 0.7);
        g.addColorStop(0, '#2a1a05'); g.addColorStop(0.18, '#120a1c'); g.addColorStop(1, '#030208');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        // The far end: a bright exit that rings rush out of.
        const eg = x.createRadialGradient(S.vp.x, S.vp.y, 0, S.vp.x, S.vp.y, h * 0.2);
        eg.addColorStop(0, 'rgba(255,220,170,0.45)'); eg.addColorStop(0.25, 'rgba(255,175,60,0.28)'); eg.addColorStop(1, 'rgba(255,120,0,0)');
        x.fillStyle = eg; x.fillRect(0, 0, w, h);
        // Floor and ceiling panels converge on the exit.
        x.strokeStyle = 'rgba(255,170,40,0.12)'; x.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * TAU, ex = S.vp.x + Math.cos(a) * w, ey = S.vp.y + Math.sin(a) * w;
            x.beginPath(); x.moveTo(S.vp.x + Math.cos(a) * h * 0.06, S.vp.y + Math.sin(a) * h * 0.06); x.lineTo(ex, ey); x.stroke();
        }
        // Glossy floor gets a reflection of the exit light.
        const fg = x.createLinearGradient(0, fy, 0, h);
        fg.addColorStop(0, 'rgba(255,170,50,0)'); fg.addColorStop(0.25, 'rgba(255,170,50,0.16)'); fg.addColorStop(1, 'rgba(255,170,50,0)');
        x.fillStyle = fg; x.fillRect(0, fy, w, h - fy);
        const vg = x.createRadialGradient(w / 2, h * 0.5, h * 0.25, w / 2, h * 0.5, w * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.7)');
        x.fillStyle = vg; x.fillRect(0, 0, w, h);
    }

    function frame_tunnel(ctx, w, h, S, st, dt) {
        const calm = reduced() ? 0 : 1, vp = S.vp;
        // Speed rises with the rally and surges on a point.
        const target = 0.32 + Math.min(0.6, (st.rally || 0) * 0.035) + S.cheer * 0.5;
        S.speed += (target - S.speed) * Math.min(1, dt * 2.5);
        S.phase = (S.phase + dt * S.speed * calm) % 1;
        const N = 10, buckets = [new Path2D(), new Path2D(), new Path2D()];
        for (let i = 0; i < N; i++) {
            const u = ((i + S.phase) / N);
            const k = Math.pow(u, 2.6);
            const rw = w * (0.04 + k * 1.2), rh = h * (0.03 + k * 0.95);
            const b = k < 0.25 ? 0 : k < 0.6 ? 1 : 2;
            const p = buckets[b];
            const rx = vp.x - rw / 2, ry = vp.y - rh / 2 + k * h * 0.06, rr = Math.min(rw, rh) * 0.2;
            p.moveTo(rx + rr, ry); p.lineTo(rx + rw - rr, ry); p.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
            p.lineTo(rx + rw, ry + rh - rr); p.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
            p.lineTo(rx + rr, ry + rh); p.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
            p.lineTo(rx, ry + rr); p.quadraticCurveTo(rx, ry, rx + rr, ry); p.closePath();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        [[1, 'rgba(255,180,60,0.24)', 0.55], [1.5, 'rgba(255,196,80,0.38)', 0.7], [2, 'rgba(255,225,150,0.48)', 0.8]].forEach(([lw, col, a], i) => {
            ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.stroke(buckets[i]);
        });
        // Speed streaks radiating from the exit; they lengthen with speed.
        ctx.strokeStyle = 'rgba(255,230,170,0.8)'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.22 + S.speed * 0.18;
        const streaks = new Path2D();
        for (let i = 0; i < 46; i++) {
            const a = (i * 2.399) % TAU, ph2 = ((i * 0.173) + S.phase * (1.5 + (i % 3) * 0.4)) % 1;
            const r0 = Math.pow(ph2, 2) * w * 0.9, r1 = r0 + (6 + S.speed * 70) * (0.2 + ph2);
            streaks.moveTo(vp.x + Math.cos(a) * r0, vp.y + Math.sin(a) * r0 * 0.75);
            streaks.lineTo(vp.x + Math.cos(a) * r1, vp.y + Math.sin(a) * r1 * 0.75);
        }
        ctx.stroke(streaks);
        // Floor chevrons rushing toward the player.
        ctx.strokeStyle = 'rgba(255,190,60,0.9)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const u = ((i + S.phase) / 6), k = Math.pow(u, 2);
            const y = S.fy + (h - S.fy) * k, hw = w * (0.03 + k * 0.2), dh = (h - S.fy) * (0.03 + k * 0.1);
            ctx.globalAlpha = 0.15 + k * 0.5;
            ctx.beginPath(); ctx.moveTo(w * 0.5 - hw, y + dh); ctx.lineTo(w * 0.5, y); ctx.lineTo(w * 0.5 + hw, y + dh); ctx.stroke();
        }
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════════
    // MIRAGE (National, Gravity): an eclipse over a mirror-flat salt pan
    // ════════════════════════════════════════════════════════════════════
    function bake_mirage(x, w, h, S) {
        const fy = S.fy, r = rng(66);
        let g = x.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, '#0a0620'); g.addColorStop(0.45, '#3a1c6a'); g.addColorStop(0.8, '#c0507a'); g.addColorStop(1, '#ffc27a');
        x.fillStyle = g; x.fillRect(0, 0, w, fy + 1);
        stars(x, w, h, 120, 12, h * 0.3);
        S.sun = { x: w * 0.5, y: h * 0.26, r: h * 0.085 };
        S.stones = [];
        for (let i = 0; i < 6; i++) {
            const f = [0.14, 0.27, 0.4, 0.62, 0.76, 0.88][i], sw = w * (0.018 + r() * 0.012), sh = h * (0.07 + r() * 0.06);
            S.stones.push({ x: w * f, y: h * (0.3 + r() * 0.12), w: sw, h: sh, p: r() * TAU });
        }
        // Overlapping distant ridges soften the horizon and give the pan scale.
        const ridge = (base, height, color, seed) => {
            const rand = rng(seed);
            x.fillStyle = color; x.beginPath(); x.moveTo(0, fy);
            x.lineTo(0, base);
            for (let i = 1; i <= 24; i++) {
                const px = w * i / 24;
                x.lineTo(px, base - height * (0.18 + rand() * 0.82));
            }
            x.lineTo(w, fy); x.closePath(); x.fill();
        };
        ridge(fy - h * 0.015, h * 0.10, 'rgba(109,53,112,0.55)', 67);
        ridge(fy + h * 0.005, h * 0.065, '#321a52', 68);
        // The salt pan: a mirror of the sky, dimmer and wavering.
        g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, '#f0b080'); g.addColorStop(0.15, '#a85a8a'); g.addColorStop(0.6, '#32195a'); g.addColorStop(1, '#0c0620');
        x.fillStyle = g; x.fillRect(0, fy, w, h - fy);
        // Hex salt crust fading into the distance.
        x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1;
        for (let k = 1; k < 14; k++) {
            const y = fy + (h - fy) * Math.pow(k / 14, 1.7), cw = w * 0.03 * (1 + k * 0.5);
            for (let px = -cw; px < w + cw; px += cw * 1.5) { x.beginPath(); x.moveTo(px, y); x.lineTo(px + cw * 0.5, y - cw * 0.12); x.lineTo(px + cw, y); x.stroke(); }
        }
        const vg = x.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, w * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,0,16,0.55)');
        x.fillStyle = vg; x.fillRect(0, 0, w, h);
    }

    function frame_mirage(ctx, w, h, S) {
        const t = S.t, cheer = S.cheer, calm = reduced() ? 0 : 1, sun = S.sun;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        // Corona: breathing glow and slow rotating rays.
        const pulse = 0.85 + 0.15 * Math.sin(t * 1.1 * calm) + cheer * 0.5;
        ctx.globalAlpha = pulse; ctx.drawImage(S.corona, sun.x - sun.r * 3, sun.y - sun.r * 3, sun.r * 6, sun.r * 6);
        ctx.strokeStyle = 'rgba(255,214,150,0.32)'; ctx.lineWidth = 1; ctx.globalAlpha = 0.35 + cheer * 0.2;
        const rays = new Path2D();
        for (let i = 0; i < 24; i++) {
            const a = i * TAU / 24 + t * 0.05 * calm, len = sun.r * (1.5 + (i % 3) * 0.55 + Math.sin(t * 1.4 * calm + i) * 0.15);
            rays.moveTo(sun.x + Math.cos(a) * sun.r * 1.1, sun.y + Math.sin(a) * sun.r * 1.1);
            rays.lineTo(sun.x + Math.cos(a) * len * 1.6, sun.y + Math.sin(a) * len * 1.6);
        }
        ctx.stroke(rays);
        ctx.restore();
        // The black disc of the eclipse.
        ctx.fillStyle = '#05010c'; ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r, 0, TAU); ctx.fill();
        // Floating stones and their wavering reflections in the pan.
        const horizon = S.fy;
        for (const st2 of S.stones) {
            const bob = Math.sin(t * 0.7 * calm + st2.p) * 6, y = st2.y + bob;
            ctx.fillStyle = '#12082a';
            ctx.beginPath(); ctx.moveTo(st2.x - st2.w * .9, y + st2.h * .35); ctx.lineTo(st2.x - st2.w * .35, y); ctx.lineTo(st2.x + st2.w * .65, y + st2.h * .12); ctx.lineTo(st2.x + st2.w, y + st2.h * .62); ctx.lineTo(st2.x + st2.w * .1, y + st2.h); ctx.lineTo(st2.x - st2.w * .7, y + st2.h * .8); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,190,140,0.16)'; ctx.beginPath(); ctx.moveTo(st2.x - st2.w * .35, y); ctx.lineTo(st2.x + st2.w * .08, y + st2.h * .36); ctx.lineTo(st2.x - st2.w * .7, y + st2.h * .8); ctx.lineTo(st2.x - st2.w * .9, y + st2.h * .35); ctx.closePath(); ctx.fill();
            // Reflection, mirrored about the horizon, dimmed and rippling.
            const ry = horizon + (horizon - (y + st2.h)), wob = Math.sin(t * 2.3 * calm + st2.p) * 3;
            ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#12082a';
            ctx.beginPath(); ctx.moveTo(st2.x - st2.w + wob, ry); ctx.lineTo(st2.x - st2.w * 0.6 + wob, ry + st2.h); ctx.lineTo(st2.x + st2.w * 0.7 + wob, ry + st2.h - 3); ctx.lineTo(st2.x + st2.w + wob, ry); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#05010c';
        const ry = horizon + (horizon - sun.y);
        ctx.beginPath(); ctx.ellipse(sun.x + Math.sin(t * 1.7 * calm) * 3, ry, sun.r, sun.r * 0.8, 0, 0, TAU); ctx.fill();
        // Shimmer lines sliding over the pan.
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,220,180,0.1)';
        for (let i = 0; i < 9; i++) {
            const y = horizon + 4 + Math.pow(((i / 9) + t * 0.02 * calm) % 1, 1.6) * (S.h - horizon);
            const x0 = ((i * 211 + t * 12 * calm) % (S.w * 1.2)) - S.w * 0.1;
            ctx.fillRect(x0, y, S.w * 0.22, 1.2);
        }
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════════
    // Venue dressing is baked into the scene on resize, never redrawn per frame.
    function dressVenue(x, w, h, S, kind) {
        const fy = S.fy, fh = h - fy;
        x.save();
        if (kind === 'hall') {
            // Court paint and the shadow below the bleachers ground the hall.
            const shade = x.createLinearGradient(0, fy - h * .035, 0, fy + h * .09);
            shade.addColorStop(0, 'rgba(12,7,4,.38)'); shade.addColorStop(1, 'rgba(12,7,4,0)');
            x.fillStyle = shade; x.fillRect(0, fy - h * .035, w, h * .125);
            x.strokeStyle = 'rgba(247,223,181,.25)'; x.lineWidth = Math.max(1, h * .002);
            x.beginPath(); x.moveTo(w * .18, h); x.lineTo(w * .30, fy + fh * .38);
            x.lineTo(w * .70, fy + fh * .38); x.lineTo(w * .82, h); x.stroke();
            x.beginPath(); x.ellipse(w * .5, fy + fh * .76, w * .14, fh * .10, 0, 0, TAU); x.stroke();
        } else if (kind === 'final') {
            // Stepped fascia and cool reflections give the championship bowl depth.
            for (let i = 0; i < 3; i++) {
                const y = h * (.42 + i * .038);
                x.fillStyle = 'rgba(2,6,17,.48)'; x.fillRect(0, y, w, h * .008);
                x.fillStyle = 'rgba(97,151,231,.16)'; x.fillRect(0, y, w, Math.max(1, h * .0015));
            }
            x.strokeStyle = 'rgba(113,154,220,.15)'; x.lineWidth = Math.max(1, h * .002);
            x.beginPath(); x.moveTo(w * .12, h); x.lineTo(w * .30, fy + fh * .16);
            x.lineTo(w * .70, fy + fh * .16); x.lineTo(w * .88, h); x.stroke();
            const sheen = x.createRadialGradient(w * .5, fy, 0, w * .5, fy, w * .4);
            sheen.addColorStop(0, 'rgba(119,161,224,.15)'); sheen.addColorStop(1, 'rgba(119,161,224,0)');
            x.fillStyle = sheen; x.fillRect(0, fy, w, fh);
        } else if (kind === 'dock') {
            // Architectural side frames and deck panels imply a viewing bay.
            x.fillStyle = 'rgba(2,5,15,.6)';
            x.beginPath(); x.moveTo(0,0); x.lineTo(w*.085,0); x.lineTo(w*.04,fy); x.lineTo(0,fy); x.fill();
            x.beginPath(); x.moveTo(w,0); x.lineTo(w*.915,0); x.lineTo(w*.96,fy); x.lineTo(w,fy); x.fill();
            x.strokeStyle = 'rgba(117,165,237,.2)'; x.lineWidth = Math.max(1,h*.003);
            x.beginPath(); x.moveTo(w*.04,fy); x.lineTo(w*.085,0); x.moveTo(w*.96,fy); x.lineTo(w*.915,0); x.stroke();
            x.fillStyle = 'rgba(66,120,199,.11)';
            for (const side of [0,1]) { const px = side ? w*.92 : w*.025; x.fillRect(px, fy+fh*.18, w*.055, fh*.012); x.fillRect(px, fy+fh*.25, w*.035, fh*.008); }
        } else if (kind === 'yard') {
            // Cranes and distant work lights add a real harbour silhouette.
            x.strokeStyle = 'rgba(26,14,35,.55)'; x.lineWidth = Math.max(1,h*.003);
            for (const f of [.13,.88]) {
                const px=w*f, y=fy-h*.13;
                x.beginPath(); x.moveTo(px,fy); x.lineTo(px,y); x.lineTo(px+w*.07,y-h*.075);
                x.moveTo(px-w*.035,y); x.lineTo(px+w*.085,y); x.stroke();
            }
            x.strokeStyle = 'rgba(228,184,129,.11)'; x.lineWidth = Math.max(1,h*.002);
            for (const f of [.26,.74]) { x.beginPath(); x.moveTo(w*f,fy+fh*.23); x.lineTo(w*(f-.04),h); x.stroke(); }
        } else if (kind === 'tunnel') {
            // Side ribs turn a flat ring graphic into a built tunnel.
            x.fillStyle = 'rgba(6,8,20,.65)';
            for (const side of [0,1]) {
                x.save(); if (side) { x.translate(w,0); x.scale(-1,1); }
                x.beginPath(); x.moveTo(0,0); x.lineTo(w*.16,0); x.lineTo(w*.33,h*.37); x.lineTo(w*.18,h); x.lineTo(0,h); x.fill();
                x.strokeStyle = 'rgba(238,164,76,.25)'; x.lineWidth = Math.max(1,h*.003);
                x.beginPath(); x.moveTo(w*.16,0); x.lineTo(w*.33,h*.37); x.lineTo(w*.18,h); x.stroke();
                x.strokeStyle = 'rgba(116,153,195,.14)'; x.lineWidth = 1;
                for(let i=0;i<5;i++) { const y=h*(.08+i*.18); x.beginPath(); x.moveTo(0,y); x.lineTo(w*(.13+i*.025),h*(.15+i*.13)); x.stroke(); }
                x.restore();
            }
        } else if (kind === 'mirage') {
            // Wisps of reflected colour replace the hard, empty horizon.
            const haze = x.createLinearGradient(0, fy-h*.05, 0, fy+fh*.3);
            haze.addColorStop(0,'rgba(255,183,148,0)'); haze.addColorStop(.35,'rgba(255,187,155,.14)'); haze.addColorStop(1,'rgba(255,183,148,0)');
            x.fillStyle=haze; x.fillRect(0,fy-h*.05,w,h*.05+fh*.3);
            x.strokeStyle='rgba(255,215,194,.12)'; x.lineWidth=Math.max(1,h*.002);
            for(let i=0;i<9;i++) { const y=fy+fh*(.08+i*.07), len=w*(.03+(i%3)*.025), px=w*(.15+((i*37)%70)/100); x.beginPath(); x.moveTo(px,y); x.lineTo(px+len,y); x.stroke(); }
        }
        x.restore();
    }

    class TourVenue {
        constructor(kind) {
            this.kind = ['hall', 'final', 'dock', 'yard', 'tunnel', 'mirage'].includes(kind) ? kind : 'hall';
            this.key = ''; this.t = 0; this.cheer = 0; this._score = -1;
        }
        _bake(ctx, w, h) {
            const m = ctx.getTransform();
            const sx = Math.hypot(m.a, m.b) || 1, sy = Math.hypot(m.c, m.d) || 1;
            const key = `${w}|${h}|${sx.toFixed(3)}|${sy.toFixed(3)}`;
            if (key === this.key) return;
            this.key = key;
            const S = this.S = { sx, sy, w, h, fy: Math.round(h * FLOOR), t: this.t, cheer: 0, conf: [], sparks: [], speed: 0.3, phase: 0 };
            const [bc, bx] = canvas(w, h, sx, sy);
            if (this.kind === 'dock') { bake_dock(bx, w, h, S); S.glowA = glow('150,200,255', 64); }
            else if (this.kind === 'yard') {
                bake_yard(bx, w, h, S);
                S.glowA = glow('255,200,120', 128);
                const [bs, bsx] = canvas(1, 1, 1, 1); bs.width = 64; bs.height = 256; bsx.setTransform(1, 0, 0, 1, 0, 0);
                const bg = bsx.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, 'rgba(255,214,150,0.45)'); bg.addColorStop(1, 'rgba(255,214,150,0)');
                bsx.fillStyle = bg; bsx.beginPath(); bsx.moveTo(26, 0); bsx.lineTo(38, 0); bsx.lineTo(64, 256); bsx.lineTo(0, 256); bsx.closePath(); bsx.fill();
                S.beamSoft = bs;
            }
            else if (this.kind === 'tunnel') bake_tunnel(bx, w, h, S);
            else if (this.kind === 'mirage') { bake_mirage(bx, w, h, S); S.corona = glow('255,170,120', 256); }
            else if (this.kind === 'hall') {
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
            dressVenue(bx, w, h, S, this.kind);
            // Bake a gentle edge and floor grade once per size. This unifies the
            // venues and keeps the bright action in the middle easy to read.
            const grade = bx.createRadialGradient(w * 0.5, h * 0.48, h * 0.12, w * 0.5, h * 0.48, Math.max(w, h) * 0.7);
            grade.addColorStop(0, 'rgba(3,8,18,0)');
            grade.addColorStop(1, 'rgba(3,8,18,0.38)');
            bx.fillStyle = grade; bx.fillRect(0, 0, w, h);
            const depth = bx.createLinearGradient(0, S.fy - h * 0.04, 0, S.fy + h * 0.12);
            depth.addColorStop(0, 'rgba(5,10,20,0)');
            depth.addColorStop(0.48, 'rgba(5,10,20,0.16)');
            depth.addColorStop(1, 'rgba(5,10,20,0)');
            bx.fillStyle = depth; bx.fillRect(0, S.fy - h * 0.04, w, h * 0.16);
            this.base = bc;
        }
        draw(ctx, w, h, st) {
            this._bake(ctx, w, h);
            const S = this.S, dt = Math.max(0, Math.min(0.1, st.dt || 0));
            if (!reduced()) this.t += dt;
            if (this._score >= 0 && st.score !== this._score) { this.cheer = 1; S.burst = true; }
            this._score = st.score;
            this.cheer = Math.max(0, this.cheer - dt * 0.4);
            S.t = this.t; S.cheer = this.cheer; S.rally = st.rally;
            ctx.drawImage(this.base, 0, 0, w, h);
            if (this.kind === 'dock') frame_dock(ctx, w, h, S, st);
            else if (this.kind === 'yard') frame_yard(ctx, w, h, S, st, dt);
            else if (this.kind === 'tunnel') frame_tunnel(ctx, w, h, S, st, dt);
            else if (this.kind === 'mirage') frame_mirage(ctx, w, h, S);
            else if (this.kind === 'hall') frame_hall(ctx, w, h, S, st);
            else frame_final(ctx, w, h, S, st, dt);
        }
    }

    window.TourVenue = TourVenue;
})();
