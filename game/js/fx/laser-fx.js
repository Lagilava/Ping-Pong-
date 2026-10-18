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
    function ready(ctx, p, time) {
        if (!p.hasLaser || p.laserCharges <= 0) return;
        const color = palette(p), glow = sprite(color);
        const hw = p.w / 2, hh = p.h / 2;
        const motion = !reduced();
        const phase = motion ? time : 0;
        const ready = Math.max(0, Math.min(1, 1 - p.laserCooldown / 0.2));
        const intensity = 0.58 + ready * 0.3;
        const face = window.game && p.pos.x > window.game.width / 2 ? -1 : 1;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = intensity * 0.48;
        ctx.drawImage(glow, -hw - 17, -hh - 13, p.w + 34, p.h + 26);
        // Three capacitors live inside the paddle, visibly draining per shot.
        const gap = 5, cellH = (p.h - 22 - gap * 2) / 3;
        for (let i = 0; i < 3; i++) {
            const y = -hh + 11 + i * (cellH + gap);
            ctx.globalAlpha = i < p.laserCharges ? intensity * 0.7 : 0.1;
            ctx.fillStyle = i < p.laserCharges ? color : '#879ea3';
            ctx.fillRect(-Math.max(2, hw * 0.45), y, Math.max(4, p.w * 0.45), cellH);
            if (i < p.laserCharges) {
                ctx.globalAlpha = intensity * 0.9;
                ctx.fillStyle = '#fff2d4';
                ctx.fillRect(face * (hw - 2) - 1, y, 2, cellH);
            }
        }
        // Energy climbs the rails and converges at the firing aperture.
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        const strands = lowDetail() ? 1 : 2;
        for (let i = 0; i < strands; i++) {
            ctx.globalAlpha = intensity * 0.72;
            ctx.beginPath();
            for (let j = 0; j <= 12; j++) {
                const y = -hh + (j / 12) * p.h;
                const x = face * (hw + 3) + Math.sin(j * 1.65 - phase * 7 + i * 3) * (motion ? 2.8 : 1);
                if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        if (motion) {
            ctx.globalAlpha = 0.7;
            for (let i = 0; i < (lowDetail() ? 2 : 4); i++) {
                const y = (((phase * 0.4 + i * 0.25) % 1) - 0.5) * p.h;
                ctx.drawImage(glow, face * hw - 5, y - 5, 10, 10);
            }
        }
        ctx.globalAlpha = 0.65 + ready * 0.3;
        ctx.drawImage(glow, face * hw - 11, -11, 22, 22);
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
    function shots(ctx, p) {
        const color = palette(p), glow = sprite(color);
        const motion = !reduced(), detail = !lowDetail();
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'screen';
        for (const laser of p.lasers) {
            const dir = Math.sign(laser.vel.x) || 1;
            const x = laser.pos.x, y = laser.pos.y;
            const length = motion ? (detail ? 96 : 68) : 38;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(dir, 1);
            ctx.globalAlpha = 0.65;
            ctx.drawImage(glow, -length, -16, length + 24, 32);
            // Tapered plasma sheath, a white-hot core and a sharp leading edge.
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(-6, -4.5); ctx.lineTo(-length, -0.7);
            ctx.lineTo(-length, 0.7); ctx.lineTo(-6, 4.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff6dc';
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(-8, -1.4); ctx.lineTo(-length * 0.7, 0);
            ctx.lineTo(-8, 1.4); ctx.closePath(); ctx.fill();
            if (detail && motion) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                for (let i = 0; i < 2; i++) {
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    for (let j = 0; j <= 7; j++) {
                        const px = -j * length / 7;
                        const py = Math.sin(j * 2.3 + laser.pulsePhase * 2 + i * 3) * (2 + j * 0.5);
                        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
        const flash = Math.max(0, 1 - (Date.now() - (p._laserFiredAt || 0)) / 180);
        if (flash > 0 && motion) {
            const dir = window.game && p.pos.x > window.game.width / 2 ? -1 : 1;
            const x = p.pos.x + (dir > 0 ? p.w : 0), y = p.pos.y + p.h / 2;
            ctx.globalAlpha = flash * 0.8;
            ctx.drawImage(glow, x - 27, y - 24, 54, 48);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(x, y, 5 + (1 - flash) * 16, 10 + (1 - flash) * 19, 0, 0, TAU);
            ctx.stroke();
        }
        ctx.restore();
        hint(ctx, p);
    }
    window.LaserFX = { ready, shots };
})();
