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
            player: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0, trail: [], trailClock: 0, burst: 0, burstX: 0, burstY: 0 },
            ai: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0, trail: [], trailClock: 0, burst: 0, burstX: 0, burstY: 0 }
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
            s.burst = Math.max(0, s.burst - dt);
            if (s.sonic > 0 && this.game.ball?.pos) {
                s.trailClock += dt;
                if (s.trailClock >= 0.016) {
                    s.trailClock %= 0.016;
                    s.trail.push({ x: this.game.ball.pos.x, y: this.game.ball.pos.y });
                    if (s.trail.length > 24) s.trail.shift();
                }
            } else if (s.trail.length) {
                s.trail.length = 0;
                s.trailClock = 0;
            }
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
        s.trail = [{ x: ball.pos.x, y: ball.pos.y }];
        s.trailClock = 0;
        s.burst = 0.38;
        s.burstX = ball.pos.x;
        s.burstY = ball.pos.y;
        if (!this.sonicMax) this.sonicMax = ball.maxSpeed;
        ball.maxSpeed = Math.max(ball.maxSpeed, this.sonicMax * 1.12);
        const speed = Math.hypot(ball.vel.x, ball.vel.y);
        if (speed > 0) {
            const gain = Math.min(ball.maxSpeed, speed * 1.22) / speed;
            ball.vel.x *= gain;
            ball.vel.y *= gain;
        }
        const labelMargin = Math.min(170, this.game.width * 0.39);
        const labelX = Math.max(labelMargin, Math.min(this.game.width - labelMargin, ball.pos.x));
        const labelSize = Math.max(18, Math.min(29, this.game.width * 0.075));
        this.game.popText('SONIC RETURN', labelX, ball.pos.y - 32, '#6ffaff', labelSize);
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
            s.burst = 0.34;
            s.burstX = ball.pos.x;
            s.burstY = ball.pos.y;
            this.game.popText('FLIP!', x, s.y - reach, '#ffde72', 25);
            this.game.particles?.spawnGodTierHit(x, s.y, '#ffde72', 800);
            this.game.postFx?.ripple(x, s.y, 0.5);
            this.game.audio?.createOscillatorSound?.(680, 'square', 0.12, 0.22);
            this.game.screenShake = Math.max(this.game.screenShake || 0, 3);
            break;
        }
    }

    renderSpeedField(ctx, side, s, motion) {
        if (s.active <= 0) return;
        const g = this.game, paddle = this.paddle(side);
        if (!paddle) return;
        const dir = side === 'player' ? 1 : -1;
        const cx = paddle.pos.x + paddle.w / 2, cy = paddle.pos.y + paddle.h / 2;
        const reach = Math.max(72, this.speedReach(side));
        const fade = Math.min(1, s.active / 0.09);
        ctx.save();
        // A shallow corridor keeps the effect attached to the paddle instead
        // of tinting the whole court when time slows.
        const field = ctx.createLinearGradient(cx, cy, cx + dir * reach, cy);
        field.addColorStop(0, `rgba(82, 231, 255, ${0.20 * fade})`);
        field.addColorStop(0.55, `rgba(62, 164, 255, ${0.07 * fade})`);
        field.addColorStop(1, 'rgba(62, 164, 255, 0)');
        ctx.fillStyle = field;
        ctx.beginPath();
        ctx.moveTo(cx, cy - paddle.h * 0.7);
        ctx.lineTo(cx + dir * reach, cy - paddle.h * 1.06);
        ctx.lineTo(cx + dir * reach, cy + paddle.h * 1.06);
        ctx.lineTo(cx, cy + paddle.h * 0.7);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(173, 250, 255, ${0.7 * fade})`;
        ctx.shadowColor = '#69e9ff'; ctx.shadowBlur = 18;
        for (let i = 0; i < 3; i++) {
            const rx = paddle.w * (2.2 + i * 0.75);
            const ry = paddle.h * (0.72 + i * 0.17);
            ctx.lineWidth = i === 0 ? 2.6 : 1.2;
            ctx.setLineDash(i === 0 ? [] : [5, 9]);
            ctx.lineDashOffset = motion ? -this.clock * (60 + i * 24) : 0;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0,
                dir === 1 ? -Math.PI * 0.7 : Math.PI * 0.3,
                dir === 1 ? Math.PI * 0.7 : Math.PI * 1.7);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        if (motion) {
            ctx.shadowBlur = 0;
            for (let i = 0; i < 9; i++) {
                const u = ((i * 0.19 + this.clock * (0.7 + i % 3 * 0.13)) % 1);
                const x = cx + dir * reach * u;
                const y = cy + Math.sin(i * 2.45) * paddle.h * (0.30 + 0.38 * u);
                ctx.globalAlpha = (1 - u) * fade * 0.65;
                ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * (12 + 17 * u), y); ctx.stroke();
            }
        }
        ctx.restore();
    }

    renderSonicTrail(ctx, s) {
        if (s.sonic <= 0 || s.trail.length < 2) return;
        const fade = Math.min(1, s.sonic / 0.18);
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            for (let i = 0; i < s.trail.length; i++) {
                const p = s.trail[i];
                if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            }
            ctx.strokeStyle = layer === 0 ? `rgba(39, 177, 255, ${0.18 * fade})`
                : layer === 1 ? `rgba(99, 240, 255, ${0.44 * fade})` : `rgba(235, 255, 255, ${0.84 * fade})`;
            ctx.lineWidth = layer === 0 ? 18 : layer === 1 ? 7 : 2.5;
            ctx.shadowColor = layer === 2 ? '#67efff' : 'transparent';
            ctx.shadowBlur = layer === 2 ? 12 : 0;
            ctx.stroke();
        }
        ctx.restore();
    }

    renderGravityPulse(ctx, well, motion) {
        const k = Math.max(0, well.pulseRemaining / ModeAbilities.GRAVITY_WINDOW);
        const x = well.pos.x, y = well.pos.y, r = well.radius;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const halo = ctx.createRadialGradient(x, y, r * 0.45, x, y, r * 1.8);
        halo.addColorStop(0, 'rgba(47, 160, 203, 0)');
        halo.addColorStop(0.48, `rgba(44, 218, 255, ${0.18 * k})`);
        halo.addColorStop(0.76, `rgba(70, 185, 255, ${0.09 * k})`);
        halo.addColorStop(1, 'rgba(70, 185, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
        const sweep = motion ? this.clock * 0.85 : 0;
        for (let ring = 0; ring < 2; ring++) {
            const rr = r * (1.08 + ring * 0.30 + (1 - k) * 0.12);
            ctx.strokeStyle = ring === 0 ? `rgba(207, 255, 255, ${0.84 * k})` : `rgba(78, 222, 255, ${0.52 * k})`;
            ctx.lineWidth = ring === 0 ? 3.5 : 1.8;
            ctx.shadowColor = '#68efff'; ctx.shadowBlur = ring === 0 ? 18 : 5;
            for (let segment = 0; segment < 4; segment++) {
                const a = segment * Math.PI / 2 + sweep * (ring ? -1 : 1);
                ctx.beginPath(); ctx.arc(x, y, rr, a, a + Math.PI * 0.30); ctx.stroke();
            }
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(175, 250, 255, ${0.72 * k})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
            const a = i * Math.PI / 5 + (motion ? this.clock * 0.18 : 0);
            const inner = r * (1.03 + (1 - k) * 0.10);
            const outer = inner + 12 + 24 * (1 - k);
            const nx = Math.cos(a), ny = Math.sin(a);
            ctx.beginPath(); ctx.moveTo(x + nx * inner, y + ny * inner);
            ctx.lineTo(x + nx * outer, y + ny * outer); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + nx * outer, y + ny * outer);
            ctx.lineTo(x + nx * (outer - 7) - ny * 4, y + ny * (outer - 7) + nx * 4);
            ctx.moveTo(x + nx * outer, y + ny * outer);
            ctx.lineTo(x + nx * (outer - 7) + ny * 4, y + ny * (outer - 7) - nx * 4);
            ctx.stroke();
        }
        ctx.restore();
    }

    renderFlipper(ctx, side, s, color, motion) {
        const g = this.game, ready = s.cooldown <= 0, active = s.active > 0;
        const x = this.flipperX(side), y = active ? s.y : this.flipperY(side);
        const length = g.height * 0.11, dir = side === 'player' ? 1 : -1;
        const x0 = x - dir * length * 0.5, y0 = y + length * 0.38;
        const x1 = x + dir * length * 0.5, y1 = y - (active ? length * 0.38 : 0);
        const armLength = Math.hypot(x1 - x0, y1 - y0);
        const thickness = Math.max(7, g.height * 0.015);
        ctx.save();
        const paddle = this.paddle(side);
        if (paddle) {
            const py = this.flipperY(side);
            ctx.strokeStyle = ready ? 'rgba(255, 202, 91, 0.27)' : 'rgba(100, 125, 145, 0.17)';
            ctx.lineWidth = 1.5; ctx.setLineDash([5, 11]);
            ctx.lineDashOffset = motion ? -this.clock * 24 : 0;
            ctx.beginPath(); ctx.moveTo(paddle.pos.x + paddle.w / 2, py); ctx.lineTo(x0, y0); ctx.stroke();
            ctx.setLineDash([]);
        }
        if (active) {
            ctx.fillStyle = 'rgba(255, 180, 62, 0.095)';
            ctx.beginPath(); ctx.ellipse(x, y, length * 0.82, length * 0.70, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.translate(x0, y0);
        ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
        ctx.shadowColor = active ? '#ffc96a' : ready ? '#e89b38' : '#577083';
        ctx.shadowBlur = active ? 24 : ready ? 10 : 0;
        ctx.fillStyle = '#0a1722';
        ctx.beginPath(); ctx.roundRect(-3, -thickness * 0.9, armLength + 6, thickness * 1.8, thickness * 0.75); ctx.fill();
        const metal = ctx.createLinearGradient(0, -thickness, 0, thickness);
        metal.addColorStop(0, active ? '#fff4c1' : ready ? '#ffe4a7' : '#78909b');
        metal.addColorStop(0.45, active ? '#ffbf4c' : ready ? '#d48b32' : '#4f6570');
        metal.addColorStop(1, active ? '#b5571b' : ready ? '#74431f' : '#263944');
        ctx.fillStyle = metal;
        ctx.beginPath(); ctx.roundRect(0, -thickness * 0.62, armLength, thickness * 1.24, thickness * 0.62); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = active ? '#fff5d1' : ready ? '#ffd589' : '#7a97a5';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(thickness, -thickness * 0.25); ctx.lineTo(armLength - thickness, -thickness * 0.25); ctx.stroke();
        for (const px of [4, armLength - 4]) {
            ctx.fillStyle = '#11212d'; ctx.beginPath(); ctx.arc(px, 0, thickness * 0.29, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = active ? '#fff2bc' : color; ctx.beginPath(); ctx.arc(px, 0, thickness * 0.13, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    renderBurst(ctx, s, color, duration, motion) {
        if (s.burst <= 0) return;
        const k = s.burst / duration, x = s.burstX, y = s.burstY;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.lineWidth = 2.5;
        const radius = 12 + (1 - k) * (motion ? 78 : 32);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        if (motion) for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const inner = radius * 0.5, outer = radius * 1.22;
            ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
            ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer); ctx.stroke();
        }
        ctx.restore();
    }

    render(ctx) {
        const g = this.game, mode = g.gameMode;
        if (!['speed', 'gravity', 'obstacle'].includes(mode) || g.net) return;
        ctx.save();
        const motion = !window.PPSettings?.get('reduceMotion');
        const color = mode === 'speed' ? '#7cf4ff' : mode === 'gravity' ? '#8deeff' : '#ffd477';
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            const s = this.side(side);
            const ready = s.cooldown <= 0;
            const inRange = mode === 'speed' ? this.speedInRange(side) : mode === 'gravity' ? !!this.nearestWell() : this.flipperInRange(side);
            if (mode === 'speed') this.renderSpeedField(ctx, side, s, motion);
            if (mode === 'obstacle') {
                const fx = this.flipperX(side), fy = s.active > 0 ? s.y : this.flipperY(side);
                const dir = side === 'player' ? 1 : -1;
                ctx.save();
                this.renderFlipper(ctx, side, s, color, motion);
                const route = g.obstacleCourse?.courseRoute;
                const target = route?.points?.[g.obstacleCourse.courseRouteIndex];
                if (target && (target.x - fx) * dir > g.width * 0.08 && ready && inRange) {
                    ctx.shadowBlur = 0; ctx.globalAlpha = 0.46; ctx.lineWidth = 2;
                    ctx.strokeStyle = '#ffe6a4'; ctx.setLineDash([7, 8]);
                    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(target.x, target.y); ctx.stroke();
                }
                ctx.restore();
                this.renderBurst(ctx, s, '#ffd477', 0.34, motion);
            }
        }
        if (mode === 'speed' && this.speedScale() < 1) {
            ctx.fillStyle = 'rgba(80,210,255,0.025)';
            ctx.fillRect(0, 0, g.width, g.height);
        }
        if (mode === 'speed') {
            for (const s of Object.values(this.sides)) {
                if (motion) this.renderSonicTrail(ctx, s);
                this.renderBurst(ctx, s, '#8cf4ff', 0.38, motion);
            }
        }
        if (mode === 'gravity') {
            const target = this.nearestWell();
            if (target && this.sides.player.cooldown <= 0 && !target.pulseRemaining) {
                ctx.save(); ctx.globalAlpha = 0.48;
                ctx.strokeStyle = '#80e9ff'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 9]);
                ctx.lineDashOffset = motion ? -this.clock * 24 : 0;
                ctx.beginPath(); ctx.arc(target.pos.x, target.pos.y, target.radius * 1.35, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
            for (const well of g.gravityWells) {
                if (!(well.pulseRemaining > 0)) continue;
                this.renderGravityPulse(ctx, well, motion);
            }
        }
        ctx.restore();
    }

    // Draw after the arena reveal transform is restored so the ability status
    // stays fixed to the screen while the court camera zooms and moves.
    renderHud(ctx) {
        const g = this.game, mode = g.gameMode;
        if (!['speed', 'gravity', 'obstacle'].includes(mode) || g.net) return;
        const color = mode === 'speed' ? '#7cf4ff' : mode === 'gravity' ? '#8deeff' : '#ffd477';
        ctx.save();
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            const s = this.side(side), ready = s.cooldown <= 0;
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
        }
        ctx.restore();
    }
}

window.ModeAbilities = ModeAbilities;
