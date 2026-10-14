// Active abilities for the three arcade arenas. Timers use real game time so
// Speed's brief time warp cannot extend its own parry window.
class ModeAbilities {
    constructor(game) { this.game = game; this.reset(); }

    reset() {
        this.sonicMax = 0;
        this.clock = 0;
        this.sides = {
            player: { cooldown: 0, active: 0, flash: 0, sonic: 0, y: 0, well: null },
            ai: { cooldown: 0, active: 0, flash: 0, sonic: 0, y: 0, well: null }
        };
    }

    get enabled() { return !this.game.net && !this.game.paused && !this.game.introActive && this.game.serveHold <= 0; }
    side(side) { return this.sides[side]; }

    trigger(side = 'player') {
        const g = this.game, b = g.ball, s = this.side(side);
        if (!this.enabled || !b?.pos || !s || s.cooldown > 0 || (side === 'ai' && !g.isMultiplayer)) return false;
        if (g.gameMode === 'speed') {
            const paddle = side === 'player' ? g.player : g.aiPaddle;
            const approaching = side === 'player' ? b.vel.x < 0 : b.vel.x > 0;
            if (!paddle || !approaching || Math.abs(b.pos.x - paddle.pos.x) > g.width * 0.38) return false;
            s.active = 0.22;
            s.cooldown = 2.3;
            s.flash = 1;
            g.postFx?.ripple(paddle.pos.x, paddle.pos.y + paddle.h / 2, 0.35);
            g.audio?.createOscillatorSound?.(220, 'sine', 0.16, 0.12);
        } else if (g.gameMode === 'gravity') {
            let nearest = null, distance = Infinity;
            for (const well of g.gravityWells) {
                if (!well.active || well.pulseRemaining > 0) continue;
                const d = Math.hypot(well.pos.x - b.pos.x, well.pos.y - b.pos.y);
                if (d < distance) { distance = d; nearest = well; }
            }
            if (!nearest || distance > nearest.radius * 2.25) return false;
            nearest.pulseRemaining = 0.62;
            s.well = nearest;
            s.cooldown = 3.5;
            s.flash = 1;
            g.postFx?.ripple(nearest.pos.x, nearest.pos.y, 0.65);
            g.audio?.createOscillatorSound?.(330, 'triangle', 0.24, 0.18);
        } else if (g.gameMode === 'obstacle') {
            const x = this.flipperX(side);
            if (Math.abs(b.pos.x - x) > g.width * 0.19) return false;
            s.y = Math.max(g.height * 0.15, Math.min(g.height * 0.85, b.pos.y));
            s.active = 0.26;
            s.cooldown = 1.8;
            s.flash = 1;
            g.postFx?.ripple(x, s.y, 0.4);
            g.audio?.createOscillatorSound?.(520, 'square', 0.08, 0.16);
        } else return false;
        return true;
    }

    flipperX(side) { return this.game.width * (side === 'player' ? 0.31 : 0.69); }

    update(dt) {
        this.clock += dt;
        for (const s of Object.values(this.sides)) {
            s.cooldown = Math.max(0, s.cooldown - dt);
            s.active = Math.max(0, s.active - dt);
            s.flash = Math.max(0, s.flash - dt * 2.5);
            s.sonic = Math.max(0, s.sonic - dt);
        }
        for (const well of this.game.gravityWells) {
            if (well.pulseRemaining > 0) well.pulseRemaining = Math.max(0, well.pulseRemaining - dt);
        }
        if (this.sonicMax && !this.sides.player.sonic && !this.sides.ai.sonic) {
            if (this.game.ball) this.game.ball.maxSpeed = this.sonicMax;
            this.sonicMax = 0;
        }
    }

    speedScale() {
        if (this.game.gameMode !== 'speed' || this.game.net) return 1;
        return this.sides.player.active > 0 || this.sides.ai.active > 0 ? 0.42 : 1;
    }

    onPaddleHit(side, ball) {
        if (this.game.gameMode !== 'speed' || ball !== this.game.ball) return;
        const s = this.side(side);
        if (s.active <= 0) return;
        s.active = 0;
        s.flash = 1;
        s.sonic = 0.48;
        if (!this.sonicMax) this.sonicMax = ball.maxSpeed;
        ball.maxSpeed = Math.max(ball.maxSpeed, this.sonicMax * 1.12);
        const speed = Math.hypot(ball.vel.x, ball.vel.y);
        if (speed > 0) {
            const gain = Math.min(ball.maxSpeed, speed * 1.22) / speed;
            ball.vel.x *= gain;
            ball.vel.y *= gain;
        }
        this.game.popText('SONIC RETURN', ball.pos.x, ball.pos.y - 32, '#6ffaff', 29);
        this.game.particles?.spawnGodTierHit(ball.pos.x, ball.pos.y, '#6ffaff', 1100);
        this.game.postFx?.punch(0.5);
        this.game.audio?.createOscillatorSound?.(120, 'sawtooth', 0.18, 0.34);
        this.game.audio?.createOscillatorSound?.(880, 'sine', 0.24, 0.18);
        this.game.hitStop = Math.max(this.game.hitStop || 0, 0.035);
        this.game.screenShake = Math.max(this.game.screenShake || 0, 5);
    }

    collideFlipper(ball) {
        if (this.game.gameMode !== 'obstacle' || this.game.net || ball !== this.game.ball) return;
        for (const side of ['player', 'ai']) {
            const s = this.side(side);
            if (s.active <= 0) continue;
            const x = this.flipperX(side), reach = this.game.height * 0.11;
            if (Math.abs(ball.pos.x - x) > reach || Math.abs(ball.pos.y - s.y) > reach * 0.7) continue;
            const dir = side === 'player' ? 1 : -1;
            if (ball.vel.x * dir > 0 && Math.abs(ball.pos.x - x) > ball.r * 2) continue;
            const route = this.game.obstacleCourse?.courseRoute;
            const target = route?.points?.[this.game.obstacleCourse.courseRouteIndex];
            const dy = target ? Math.max(-0.65, Math.min(0.65, (target.y - ball.pos.y) / (this.game.width * 0.4))) : (ball.pos.y < this.game.height / 2 ? 0.38 : -0.38);
            const speed = Math.min(ball.maxSpeed, Math.max(ball.getSpeed(), ball.baseSpeed) * 1.16);
            ball.vel.x = dir * speed / Math.hypot(1, dy);
            ball.vel.y = dy * speed / Math.hypot(1, dy);
            ball.pos.x = x + dir * (ball.r + 12);
            s.active = 0;
            s.flash = 1;
            this.game.popText('FLIP!', x, s.y - reach, '#ffde72', 25);
            this.game.particles?.spawnGodTierHit(x, s.y, '#ffde72', 800);
            this.game.postFx?.ripple(x, s.y, 0.5);
            this.game.audio?.createOscillatorSound?.(680, 'square', 0.12, 0.22);
            this.game.screenShake = Math.max(this.game.screenShake || 0, 3);
            break;
        }
    }

    render(ctx) {
        const g = this.game, mode = g.gameMode;
        if (!['speed', 'gravity', 'obstacle'].includes(mode) || g.net) return;
        ctx.save();
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            const s = this.side(side), x = side === 'player' ? 44 : g.width - 44;
            const ready = s.cooldown <= 0;
            ctx.textAlign = side === 'player' ? 'left' : 'right';
            ctx.font = `700 ${Math.max(12, Math.min(17, g.height * 0.023))}px Orbitron, sans-serif`;
            ctx.fillStyle = ready ? '#a8faff' : '#8b9cae';
            const bound = window.PPSettings?.get('bindings')?.[side === 'player' ? 'p1Fire' : 'p2Fire'];
            const key = window.PPSettings?.keyLabel(bound || (side === 'player' ? ' ' : 'enter')) || (side === 'player' ? 'Space' : 'Enter');
            ctx.fillText(`${key.toUpperCase()} ${mode === 'speed' ? 'OVERCHARGE' : mode === 'gravity' ? 'POLARITY' : 'FLIP'} ${ready ? 'READY' : s.cooldown.toFixed(1) + 's'}`, x, g.height - 28);
            if (mode === 'speed' && s.active > 0) {
                const paddle = side === 'player' ? g.player : g.aiPaddle;
                if (paddle) {
                    ctx.save();
                    ctx.strokeStyle = '#98faff'; ctx.lineWidth = 3;
                    ctx.shadowColor = '#62eaff'; ctx.shadowBlur = 22;
                    ctx.beginPath();
                    ctx.ellipse(paddle.pos.x + paddle.w / 2, paddle.pos.y + paddle.h / 2,
                        paddle.w * 2.8, paddle.h * 0.85, 0, 0, Math.PI * 2);
                    ctx.stroke(); ctx.restore();
                }
            }
            if (mode === 'obstacle') {
                const fx = this.flipperX(side), fy = s.active > 0 ? s.y : g.height * 0.5;
                const length = g.height * 0.11, dir = side === 'player' ? 1 : -1;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineWidth = Math.max(7, g.height * 0.015);
                ctx.shadowColor = ready ? '#ffd166' : '#557184';
                ctx.shadowBlur = s.active > 0 ? 25 : 8;
                ctx.strokeStyle = s.active > 0 ? '#fff2ad' : ready ? '#ffbd58' : '#526371';
                ctx.beginPath(); ctx.moveTo(fx - dir * length * 0.5, fy + length * 0.38); ctx.lineTo(fx + dir * length * 0.5, fy - (s.active > 0 ? length * 0.38 : 0)); ctx.stroke();
                ctx.restore();
            }
        }
        if (mode === 'speed' && this.speedScale() < 1) {
            ctx.fillStyle = 'rgba(80,210,255,0.055)';
            ctx.fillRect(0, 0, g.width, g.height);
        }
        if (mode === 'speed' && (this.sides.player.sonic > 0 || this.sides.ai.sonic > 0) && g.ball?.pos) {
            const b = g.ball, length = g.width * 0.09;
            ctx.save(); ctx.globalAlpha = Math.max(this.sides.player.sonic, this.sides.ai.sonic) / 0.48;
            ctx.strokeStyle = '#85faff'; ctx.lineWidth = Math.max(4, b.r * 0.8);
            ctx.shadowColor = '#66dfff'; ctx.shadowBlur = 20;
            ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y);
            ctx.lineTo(b.pos.x - Math.sign(b.vel.x) * length, b.pos.y - Math.sign(b.vel.y) * length * 0.18);
            ctx.stroke(); ctx.restore();
        }
        if (mode === 'gravity') for (const well of g.gravityWells) {
            if (!(well.pulseRemaining > 0)) continue;
            const k = well.pulseRemaining / 0.62;
            ctx.strokeStyle = `rgba(103,246,255,${0.25 + 0.65 * k})`;
            ctx.lineWidth = 3 + 5 * k;
            ctx.shadowColor = '#67f6ff'; ctx.shadowBlur = 22;
            ctx.beginPath(); ctx.arc(well.pos.x, well.pos.y, well.radius * (1.15 + (1 - k) * 0.7), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
}

window.ModeAbilities = ModeAbilities;
