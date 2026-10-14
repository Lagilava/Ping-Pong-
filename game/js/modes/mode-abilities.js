// Active abilities for the three arcade arenas. Timers use real game time so
// Speed's brief time warp cannot extend its own parry window.
class ModeAbilities {
    static SPEED_WINDOW = 0.32;
    static SPEED_SLOW = 0.42;
    static GRAVITY_WINDOW = 0.62;
    static FLIP_WINDOW = 0.28;
    static COOLDOWN = { speed: 2.3, gravity: 3.5, obstacle: 1.8 };

    constructor(game) { this.game = game; this.reset(); }

    reset() {
        this.sonicMax = 0;
        this.clock = 0;
        this.sides = {
            player: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0 },
            ai: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0 }
        };
    }

    get enabled() { return !this.game.net && !this.game.paused && !this.game.introActive && this.game.serveHold <= 0; }
    side(side) { return this.sides[side]; }

    paddle(side) { return side === 'player' ? this.game.player : this.game.aiPaddle; }
    flipperY(side) {
        const paddle = this.paddle(side);
        return paddle ? paddle.pos.y + paddle.h / 2 : this.game.height / 2;
    }
    speedReach(side) {
        const ball = this.game.ball;
        const paddle = this.paddle(side);
        if (!ball || !paddle) return 0;
        const closingSpeed = side === 'player' ? -ball.vel.x : ball.vel.x;
        if (closingSpeed <= 0) return 0;
        // The far edge of this range can still reach the paddle during the
        // slowed parry window. Earlier presses no longer waste a charge.
        return Math.min(this.game.width * 0.24,
            closingSpeed * ModeAbilities.SPEED_SLOW * ModeAbilities.SPEED_WINDOW + paddle.w / 2 + ball.r - 8);
    }
    speedInRange(side) {
        const ball = this.game.ball, paddle = this.paddle(side);
        if (!ball || !paddle) return false;
        const center = paddle.pos.x + paddle.w / 2;
        const distance = side === 'player' ? ball.pos.x - center : center - ball.pos.x;
        return distance >= 0 && distance <= this.speedReach(side);
    }
    flipperInRange(side) {
        const ball = this.game.ball;
        if (!ball || (side === 'player' ? ball.vel.x >= 0 : ball.vel.x <= 0)) return false;
        const x = this.flipperX(side), y = this.flipperY(side);
        return Math.abs(ball.pos.x - x) <= this.game.width * 0.17 &&
            Math.abs(ball.pos.y - y) <= this.game.height * 0.18;
    }

    nearestWell() {
        const ball = this.game.ball;
        if (!ball) return null;
        let nearest = null, distance = Infinity;
        for (const well of this.game.gravityWells) {
            if (!well.active) continue;
            const d = Math.hypot(well.pos.x - ball.pos.x, well.pos.y - ball.pos.y);
            if (d < distance) { distance = d; nearest = well; }
        }
        return nearest && distance <= nearest.radius * 2.25 ? nearest : null;
    }

    trigger(side = 'player') {
        const g = this.game, b = g.ball, s = this.side(side);
        if (!this.enabled || !b?.pos || !s || s.cooldown > 0 || (side === 'ai' && !g.isMultiplayer)) return false;
        if (g.gameMode === 'speed') {
            const paddle = this.paddle(side);
            if (!this.speedInRange(side)) return false;
            s.active = ModeAbilities.SPEED_WINDOW;
            s.cooldown = ModeAbilities.COOLDOWN.speed;
            g.postFx?.ripple(paddle.pos.x, paddle.pos.y + paddle.h / 2, 0.35);
            g.audio?.createOscillatorSound?.(220, 'sine', 0.16, 0.12);
        } else if (g.gameMode === 'gravity') {
            const nearest = this.nearestWell();
            if (!nearest || nearest.pulseRemaining > 0) return false;
            nearest.pulseRemaining = ModeAbilities.GRAVITY_WINDOW;
            s.cooldown = ModeAbilities.COOLDOWN.gravity;
            g.postFx?.ripple(nearest.pos.x, nearest.pos.y, 0.65);
            g.audio?.createOscillatorSound?.(330, 'triangle', 0.24, 0.18);
        } else if (g.gameMode === 'obstacle') {
            const x = this.flipperX(side);
            if (!this.flipperInRange(side)) return false;
            s.y = this.flipperY(side);
            s.active = ModeAbilities.FLIP_WINDOW;
            s.cooldown = ModeAbilities.COOLDOWN.obstacle;
            g.postFx?.ripple(x, s.y, 0.4);
            g.audio?.createOscillatorSound?.(520, 'square', 0.08, 0.16);
        } else return false;
        return true;
    }

    flipperX(side) { return this.game.width * (side === 'player' ? 0.31 : 0.69); }

    update(dt) {
        this.clock += dt;
        for (const s of Object.values(this.sides)) {
            const wasActive = s.active > 0;
            s.cooldown = Math.max(0, s.cooldown - dt);
            s.active = Math.max(0, s.active - dt);
            s.sonic = Math.max(0, s.sonic - dt);
            s.miss = Math.max(0, s.miss - dt);
            if (wasActive && s.active === 0 && (this.game.gameMode === 'speed' || this.game.gameMode === 'obstacle')) s.miss = 0.45;
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
        return this.sides.player.active > 0 || this.sides.ai.active > 0 ? ModeAbilities.SPEED_SLOW : 1;
    }

    onPaddleHit(side, ball) {
        if (this.game.gameMode !== 'speed' || ball !== this.game.ball) return;
        const s = this.side(side);
        if (s.active <= 0) return;
        s.active = 0;
        s.miss = 0;
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
            const dir = side === 'player' ? 1 : -1;
            if (ball.vel.x * dir >= 0) continue;
            const x0 = x - dir * reach * 0.5, y0 = s.y + reach * 0.38;
            const x1 = x + dir * reach * 0.5, y1 = s.y - reach * 0.38;
            const vx = x1 - x0, vy = y1 - y0;
            const t = Math.max(0, Math.min(1, ((ball.pos.x - x0) * vx + (ball.pos.y - y0) * vy) / (vx * vx + vy * vy)));
            if (Math.hypot(ball.pos.x - (x0 + vx * t), ball.pos.y - (y0 + vy * t)) > ball.r + Math.max(8, this.game.height * 0.017)) continue;
            const route = this.game.obstacleCourse?.courseRoute;
            const target = route?.points?.[this.game.obstacleCourse.courseRouteIndex];
            const ahead = target && (target.x - x) * dir > this.game.width * 0.08;
            const assist = ahead ? (target.y - ball.pos.y) / Math.abs(target.x - x) : (ball.pos.y < this.game.height / 2 ? 0.28 : -0.28);
            const contact = Math.max(-1, Math.min(1, (ball.pos.y - s.y) / (reach * 0.45)));
            const dy = Math.max(-0.8, Math.min(0.8, assist * 0.72 + contact * 0.28));
            const speed = Math.min(ball.maxSpeed, Math.max(ball.getSpeed(), ball.baseSpeed) * 1.16);
            ball.vel.x = dir * speed / Math.hypot(1, dy);
            ball.vel.y = dy * speed / Math.hypot(1, dy);
            ball.pos.x = x + dir * (ball.r + 12);
            ball.lastHit = side;
            s.active = 0;
            s.miss = 0;
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
        const color = mode === 'speed' ? '#7cf4ff' : mode === 'gravity' ? '#8deeff' : '#ffd477';
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            const s = this.side(side);
            const ready = s.cooldown <= 0;
            const bound = window.PPSettings?.get('bindings')?.[side === 'player' ? 'p1Fire' : 'p2Fire'];
            const key = window.PPSettings?.keyLabel(bound || (side === 'player' ? ' ' : 'enter')) || (side === 'player' ? 'Space' : 'Enter');
            const inRange = mode === 'speed' ? this.speedInRange(side) : mode === 'gravity' ? !!this.nearestWell() : this.flipperInRange(side);
            const label = mode === 'speed' ? 'OVERCHARGE' : mode === 'gravity' ? 'POLARITY' : 'FLIPPER';
            const status = s.active > 0 ? 'ACTIVE' : s.miss > 0 ? 'MISSED' : ready ? (inRange ? 'PRESS NOW' : 'READY') : `${s.cooldown.toFixed(1)}s`;
            const pillW = Math.min(236, g.width * (g.isMultiplayer ? 0.38 : 0.48));
            const pillH = Math.max(38, Math.min(48, g.height * 0.071));
            const pillX = side === 'player' ? 20 : g.width - pillW - 20;
            const pillY = g.height - pillH - 16;
            ctx.fillStyle = 'rgba(3, 13, 29, 0.84)';
            ctx.strokeStyle = ready ? color : '#526779';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 9); ctx.fill(); ctx.stroke();
            const progress = ready ? 1 : 1 - s.cooldown / ModeAbilities.COOLDOWN[mode];
            ctx.fillStyle = ready ? color : '#698394';
            ctx.fillRect(pillX + 7, pillY + pillH - 6, (pillW - 14) * Math.max(0, Math.min(1, progress)), 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.max(10, Math.min(13, pillH * 0.28))}px Orbitron, sans-serif`;
            ctx.fillStyle = '#e8f7ff';
            ctx.fillText(`${key.toUpperCase()}  ${label}`, pillX + 10, pillY + pillH * 0.34);
            ctx.fillStyle = s.miss > 0 ? '#ffae8f' : ready ? color : '#90a9bb';
            ctx.font = `700 ${Math.max(10, Math.min(13, pillH * 0.27))}px Orbitron, sans-serif`;
            ctx.fillText(status, pillX + 10, pillY + pillH * 0.69);
            if (mode === 'speed' && s.active > 0) {
                const paddle = this.paddle(side);
                if (paddle) {
                    ctx.save();
                    const cx = paddle.pos.x + paddle.w / 2, cy = paddle.pos.y + paddle.h / 2;
                    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 45);
                    ctx.strokeStyle = '#98faff'; ctx.lineWidth = 2 + pulse * 2;
                    ctx.shadowColor = '#62eaff'; ctx.shadowBlur = 22;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, paddle.w * 2.8, paddle.h * 0.85, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([5, 9]); ctx.lineDashOffset = -this.clock * 90;
                    ctx.beginPath(); ctx.ellipse(cx, cy, paddle.w * 3.8, paddle.h * 1.03, 0, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
            }
            if (mode === 'obstacle') {
                const fx = this.flipperX(side), fy = s.active > 0 ? s.y : this.flipperY(side);
                const length = g.height * 0.11, dir = side === 'player' ? 1 : -1;
                ctx.save();
                const paddle = this.paddle(side);
                if (paddle) {
                    ctx.globalAlpha = ready ? 0.26 : 0.12;
                    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 12]);
                    ctx.beginPath(); ctx.moveTo(paddle.pos.x + paddle.w / 2, this.flipperY(side)); ctx.lineTo(fx, fy); ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.globalAlpha = 1;
                if (s.active > 0) {
                    ctx.fillStyle = 'rgba(255, 212, 119, 0.10)';
                    ctx.beginPath(); ctx.ellipse(fx, fy, length * 0.66, length * 0.54, 0, 0, Math.PI * 2); ctx.fill();
                }
                ctx.lineCap = 'round';
                ctx.lineWidth = Math.max(7, g.height * 0.015);
                ctx.shadowColor = ready ? '#ffd166' : '#557184';
                ctx.shadowBlur = s.active > 0 ? 25 : 8;
                ctx.strokeStyle = s.active > 0 ? '#fff2ad' : ready ? '#ffbd58' : '#526371';
                ctx.beginPath(); ctx.moveTo(fx - dir * length * 0.5, fy + length * 0.38); ctx.lineTo(fx + dir * length * 0.5, fy - (s.active > 0 ? length * 0.38 : 0)); ctx.stroke();
                const route = g.obstacleCourse?.courseRoute;
                const target = route?.points?.[g.obstacleCourse.courseRouteIndex];
                if (target && (target.x - fx) * dir > g.width * 0.08 && ready && inRange) {
                    ctx.shadowBlur = 0; ctx.globalAlpha = 0.46; ctx.lineWidth = 2;
                    ctx.strokeStyle = '#ffe6a4'; ctx.setLineDash([7, 8]);
                    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(target.x, target.y); ctx.stroke();
                }
                ctx.restore();
            }
        }
        if (mode === 'speed' && this.speedScale() < 1) {
            ctx.fillStyle = 'rgba(80,210,255,0.055)';
            ctx.fillRect(0, 0, g.width, g.height);
        }
        if (mode === 'speed' && (this.sides.player.sonic > 0 || this.sides.ai.sonic > 0) && g.ball?.pos) {
            const b = g.ball, length = g.width * 0.09;
            const speed = Math.max(1, Math.hypot(b.vel.x, b.vel.y));
            ctx.save(); ctx.globalAlpha = Math.max(this.sides.player.sonic, this.sides.ai.sonic) / 0.48;
            ctx.strokeStyle = '#85faff'; ctx.lineWidth = Math.max(4, b.r * 0.8);
            ctx.shadowColor = '#66dfff'; ctx.shadowBlur = 20;
            ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y);
            ctx.lineTo(b.pos.x - b.vel.x / speed * length, b.pos.y - b.vel.y / speed * length);
            ctx.stroke(); ctx.restore();
        }
        if (mode === 'gravity') {
            const target = this.nearestWell();
            if (target && this.sides.player.cooldown <= 0 && !target.pulseRemaining) {
                ctx.save(); ctx.globalAlpha = 0.55;
                ctx.strokeStyle = '#80e9ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 9]);
                ctx.beginPath(); ctx.arc(target.pos.x, target.pos.y, target.radius * 1.35, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
            for (const well of g.gravityWells) {
                if (!(well.pulseRemaining > 0)) continue;
                const k = well.pulseRemaining / ModeAbilities.GRAVITY_WINDOW;
                ctx.save();
                ctx.strokeStyle = `rgba(103,246,255,${0.25 + 0.65 * k})`;
                ctx.lineWidth = 3 + 5 * k;
                ctx.shadowColor = '#67f6ff'; ctx.shadowBlur = 22;
                ctx.beginPath(); ctx.arc(well.pos.x, well.pos.y, well.radius * (1.15 + (1 - k) * 0.7), 0, Math.PI * 2); ctx.stroke();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + this.clock * 0.3;
                    const r0 = well.radius * 1.06, r1 = r0 + 14 + 18 * (1 - k);
                    ctx.beginPath(); ctx.moveTo(well.pos.x + Math.cos(a) * r0, well.pos.y + Math.sin(a) * r0);
                    ctx.lineTo(well.pos.x + Math.cos(a) * r1, well.pos.y + Math.sin(a) * r1); ctx.stroke();
                }
                ctx.restore();
            }
        }
        ctx.restore();
    }
}

window.ModeAbilities = ModeAbilities;
