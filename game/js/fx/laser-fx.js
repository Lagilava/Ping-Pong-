// Shared laser treatment for every paddle design. Visual length is independent
// of the projectile's collision width, speed, charges and cooldown.
(function () {
    const sprites = new Map();
    const TAU = Math.PI * 2;
    function palette(p) {
        const g = window.game;
        return p === g?.player || (!g && !p.isAI) ? '#ff513c' : '#53dfff';
    }
    function sprite(color) {
        if (sprites.has(color)) return sprites.get(color);
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        const x = c.getContext('2d');
        const glow = x.createRadialGradient(48, 48, 0, 48, 48, 47);
        glow.addColorStop(0, '#fff4da');
        glow.addColorStop(0.14, color);
        glow.addColorStop(0.4, color + '75');
        glow.addColorStop(1, color + '00');
        x.fillStyle = glow;
        x.fillRect(0, 0, 96, 96);
        sprites.set(color, c);
        return c;
    }
    function reduced() { return !!window.PPSettings?.get('reduceMotion'); }
    function lowDetail() {
        return (typeof PerfGovernor !== 'undefined' && (PerfGovernor.isMobile || PerfGovernor.current?.particles < 0.5));
    }
    const now = () => performance.now() / 1000;
    const WHITE = '#fff4da';
    // Spine, fins and the muzzle lens. Everything is a flat fill or a pre-baked
    // glow sprite: no shadowBlur, so it costs the same on every paddle design.
    function ready(ctx, p, time) {
        if (!p.hasLaser) return;
        const color = palette(p), glow = sprite(color);
        const hw = p.w / 2, hh = p.h / 2;
        const motion = !reduced(), detail = !lowDetail();
        const phase = motion ? time : 0;
        const face = window.game && p.pos.x > window.game.width / 2 ? -1 : 1;
        const sinceShot = p._laserFiredAt ? (Date.now() - p._laserFiredAt) / 1000 : 9;
        const heat = Math.max(0, 1 - sinceShot / 0.45);
        const cd = Math.max(0, Math.min(1, 1 - p.laserCooldown / 0.2));
        const live = p.laserCharges > 0;
        const intensity = live ? 0.62 + cd * 0.3 + (motion ? Math.sin(phase * 9) * 0.05 : 0) : 0.25;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = intensity * 0.42 + heat * 0.25;
        ctx.drawImage(glow, -hw - 17, -hh - 13, p.w + 34, p.h + 26);

        // Capacitor spine: three glass cells that visibly drain, one per shot.
        const spineW = Math.max(4, p.w * 0.5), gap = 5;
        const cellH = (p.h - 26 - gap * 2) / 3;
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#04080c';
        ctx.fillRect(-spineW / 2 - 1, -hh + 8, spineW + 2, p.h - 16);
        for (let i = 0; i < 3; i++) {
            const y = -hh + 13 + i * (cellH + gap);
            const full = i < p.laserCharges;
            const pulse = motion && full ? 0.82 + Math.sin(phase * 14 + i * 1.7) * 0.18 : 1;
            ctx.globalAlpha = full ? intensity * pulse : 0.1;
            ctx.fillStyle = full ? color : '#879ea3';
            ctx.fillRect(-spineW / 2, y, spineW, cellH);
            if (full) {
                ctx.globalAlpha = intensity * 0.85;
                ctx.fillStyle = WHITE;
                ctx.fillRect(-1, y + 1, 2, cellH - 2);
            }
        }
        // Scanline sweeps the spine so the weapon never looks idle.
        if (live && motion) {
            const sy = -hh + 8 + ((phase * 1.4) % 1) * (p.h - 16);
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = WHITE;
            ctx.fillRect(-spineW / 2 - 2, sy, spineW + 4, 1.5);
        }
        // Rim ticks on the firing edge.
        ctx.globalAlpha = intensity * 0.55;
        ctx.fillStyle = color;
        for (let i = 0; i < 9; i++) ctx.fillRect(face > 0 ? hw - 1 : -hw - 5, -hh + 8 + i * (p.h - 18) / 8, 6, 1.4);

        // Heat fins flare out on each shot and cool back in.
        if (heat > 0 && motion) {
            const n = detail ? 7 : 4;
            for (let i = 0; i < n; i++) {
                const y = -hh + (i + 0.5) * p.h / n;
                const len = 4 + heat * (10 + (i % 2) * 6);
                ctx.globalAlpha = heat * 0.9;
                ctx.fillStyle = i % 2 ? '#ffb347' : color;
                ctx.beginPath();
                ctx.moveTo(face * hw, y - 3);
                ctx.lineTo(face * (hw + len), y);
                ctx.lineTo(face * hw, y + 3);
                ctx.fill();
            }
        }

        // Muzzle lens: brighter as the cooldown refills, flickers when live.
        const lens = (live ? 0.6 + cd * 0.35 : 0.2) * (motion ? 0.9 + Math.sin(phase * 22) * 0.1 : 1);
        ctx.globalAlpha = lens;
        ctx.drawImage(glow, face * hw - 14, -14, 28, 28);
        ctx.globalAlpha = Math.min(1, lens + 0.1);
        ctx.fillStyle = WHITE;
        ctx.beginPath();
        ctx.arc(face * (hw + 1), 0, 2.4 + heat * 2, 0, TAU);
        ctx.fill();
        if (live) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            ctx.globalAlpha = 0.5 + cd * 0.3;
            for (const r of [7, 11]) {
                ctx.beginPath();
                ctx.arc(face * (hw + 1), 0, r, face > 0 ? -1.05 : Math.PI - 1.05, face > 0 ? 1.05 : Math.PI + 1.05);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    function hint(ctx, p) {
        const game = window.game;
        if (!game || !p.hasLaser || p.laserCharges <= 0) return;
        const right = p === game.aiPaddle;
        const local = game.net ? p === (game.net.role === 'guest' ? game.aiPaddle : game.player) : (!right || game.isMultiplayer);
        if (!local) return;
        const mobile = typeof PerfGovernor !== 'undefined' && PerfGovernor.isMobile;
        const pad = game.padState?.[right && !game.net ? 1 : 0]?.pad;
        const action = right && !game.net ? 'p2Fire' : 'p1Fire';
        const binding = window.PPSettings?.get('bindings')?.[action] || (action === 'p2Fire' ? 'enter' : ' ');
        const key = window.PPSettings?.keyLabel(binding) || (binding === ' ' ? 'Space' : binding);
        const text = mobile ? '2-finger tap · fire' : (pad ? 'A · fire' : `${key} · fire`);
        const face = p.pos.x > game.width / 2 ? -1 : 1;
        const size = mobile ? 10 : 11;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.font = `500 ${size}px "Share Tech Mono", monospace`;
        const width = ctx.measureText(text).width + 16;
        const center = p.pos.x + p.w / 2;
        const x = Math.max(8, Math.min(game.width - width - 8, face > 0 ? center - 12 : center - width + 12));
        let y = p.pos.y + p.h + 12;
        if (y + 22 > game.height - 8) y = p.pos.y - 32;
        ctx.fillStyle = '#08131dee';
        ctx.fillRect(x, y, width, 22);
        ctx.strokeStyle = palette(p) + '66';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 21);
        ctx.fillStyle = '#e1e9e6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 8, y + 11);
        ctx.restore();
    }

    // Short-lived world-space effects (muzzle flash, impact rings). They live on
    // the shooter so they render with its lasers and die with a reset.
    function spawn(p, fx) {
        const list = p._laserFx || (p._laserFx = []);
        fx.t0 = now();
        if (list.length > 10) list.shift();
        list.push(fx);
    }
    function muzzle(p, x, y, dir) { spawn(p, { kind: 'muzzle', x, y, dir, life: 0.2 }); }
    function impact(p, x, y, dir, big) { spawn(p, { kind: 'impact', x, y, dir, life: big ? 0.5 : 0.36, big: !!big }); }

    function drawFx(ctx, p, color, glow, motion) {
        const list = p._laserFx;
        if (!list || !list.length) return;
        const t = now();
        for (let i = list.length - 1; i >= 0; i--) {
            const fx = list[i], k = (t - fx.t0) / fx.life;
            if (k >= 1) { list.splice(i, 1); continue; }
            const inv = 1 - k;
            ctx.save();
            ctx.translate(fx.x, fx.y);
            ctx.scale(fx.dir, 1);
            if (fx.kind === 'muzzle') {
                ctx.globalAlpha = inv * 0.9;
                ctx.drawImage(glow, -4, -30, 70 * (0.6 + k), 60);
                ctx.strokeStyle = WHITE;
                ctx.lineWidth = 2;
                if (motion) {
                    ctx.beginPath();
                    for (let r = -3; r <= 3; r++) {
                        const a = r * 0.24, len = (28 + (r & 1) * 14) * (0.4 + k * 0.9);
                        ctx.moveTo(6, 0);
                        ctx.lineTo(6 + Math.cos(a) * len, Math.sin(a) * len);
                    }
                    ctx.stroke();
                }
                ctx.fillStyle = WHITE;
                ctx.fillRect(4, -2, 22 * inv, 4);
            } else {
                // Shock ring, white core flash and a spray of spark ticks.
                const big = fx.big ? 1.5 : 1;
                ctx.globalAlpha = inv;
                ctx.drawImage(glow, -34 * big, -34 * big, 68 * big, 68 * big);
                ctx.strokeStyle = color;
                ctx.lineWidth = 3 * inv + 1;
                const rings = motion ? 2 : 1;
                for (let r = 0; r < rings; r++) {
                    const kk = Math.max(0, k - r * 0.14);
                    ctx.globalAlpha = (1 - kk) * (r ? 0.6 : 1);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, (4 + kk * 30) * big * 0.5, (4 + kk * 30) * big, 0, 0, TAU);
                    ctx.stroke();
                }
                ctx.globalAlpha = inv;
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.arc(0, 0, (7 * inv + 2) * big, 0, TAU);
                ctx.fill();
                if (motion) {
                    ctx.strokeStyle = WHITE;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    for (let s = 0; s < 12; s++) {
                        const a = (s / 12) * TAU + fx.t0 * 7, r0 = (6 + k * 20) * big, r1 = r0 + (6 + (s % 3) * 5) * inv;
                        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 1.2);
                        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 1.2);
                    }
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    }

    // Prism lance: cyan and red fringes split from a white core behind a
    // diamond head, with packets racing along it and a scorch line that fades
    // across the arena behind the shot.
    function shots(ctx, p) {
        const color = palette(p), glow = sprite(color);
        const other = color === '#ff513c' ? '#53dfff' : '#ff513c';
        const motion = !reduced(), detail = !lowDetail();
        const t = now();
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'screen';
        for (const laser of p.lasers) {
            const dir = Math.sign(laser.vel.x) || 1;
            const x = laser.pos.x, y = laser.pos.y;
            if (laser.ox === undefined) laser.ox = x;
            const length = motion ? (detail ? 130 : 90) : 54;
            const scorch = Math.min(Math.abs(x - laser.ox), 520);
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(dir, 1);
            if (motion && scorch > length) {
                const grad = ctx.createLinearGradient(-scorch, 0, -length, 0);
                grad.addColorStop(0, color + '00');
                grad.addColorStop(1, color + '66');
                ctx.fillStyle = grad;
                ctx.fillRect(-scorch, -1, scorch - length, 2);
                ctx.globalAlpha = 0.18;
                ctx.fillRect(-scorch, -6, scorch - length, 12);
            }
            ctx.globalAlpha = 0.7;
            ctx.drawImage(glow, -length, -18, length + 30, 36);
            // Fringes split slightly toward the tail.
            const spread = motion ? 4.5 : 2;
            ctx.lineWidth = 2;
            const fringe = (col, dy) => {
                ctx.strokeStyle = col;
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                ctx.moveTo(8, dy * 0.2);
                ctx.lineTo(-length, dy);
                ctx.stroke();
            };
            fringe(color, spread);
            if (detail) fringe(other, -spread);
            // White-hot core, tapered.
            ctx.globalAlpha = 1;
            ctx.fillStyle = WHITE;
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(-6, -2.6); ctx.lineTo(-length * 0.8, -0.6);
            ctx.lineTo(-length * 0.8, 0.6); ctx.lineTo(-6, 2.6); ctx.closePath();
            ctx.fill();
            // Diamond head.
            ctx.fillStyle = WHITE;
            ctx.beginPath();
            ctx.moveTo(22, 0); ctx.lineTo(8, -6); ctx.lineTo(0, 0); ctx.lineTo(8, 6); ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(26, 0); ctx.lineTo(8, -10); ctx.lineTo(-4, 0); ctx.lineTo(8, 10); ctx.closePath();
            ctx.fill();
            // Packets racing down the beam read as speed.
            if (motion && detail) {
                ctx.fillStyle = WHITE;
                for (let i = 0; i < 4; i++) {
                    const f = ((t * 3.2 + i * 0.25) % 1);
                    ctx.globalAlpha = (1 - f) * 0.9;
                    ctx.fillRect(-f * length - 8, -3, 8 + f * 6, 6);
                }
            }
            ctx.restore();
        }
        drawFx(ctx, p, color, glow, motion);
        ctx.restore();
    }
    window.LaserFX = { ready, shots, muzzle, impact };
})();
