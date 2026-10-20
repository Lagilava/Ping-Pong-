// Active abilities for the three arcade arenas. Timers use real game time so
// Speed's brief time warp cannot extend its own parry window. Obstacle's
// Lucky Dice lives in obstacle-dice.js and Gravity's Wormhole in
// gravity-wormhole.js; this class routes input and the HUD.
class ModeAbilities {
    static SPEED_WINDOW = 0.32;
    static SPEED_SLOW = 0.42;
    static COOLDOWN = { speed: 2.3, gravity: 6, obstacle: 9 };

    constructor(game) {
        this.game = game;
        this.dice = typeof window.ObstacleDice === 'function' ? new window.ObstacleDice(game, this) : null;
        this.reset();
    }

    reset() {
        this.sonicMax = 0;
        this.clock = 0;
        this.dice?.reset();
        this.sides = {
            player: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0, trail: [], trailClock: 0, burst: 0, burstX: 0, burstY: 0 },
            ai: { cooldown: 0, active: 0, sonic: 0, miss: 0, y: 0, trail: [], trailClock: 0, burst: 0, burstX: 0, burstY: 0 }
        };
    }

    get enabled() { return !this.game.net && !this.game.paused && !this.game.introActive && this.game.serveHold <= 0; }
    side(side) { return this.sides[side]; }

    paddle(side) { return side === 'player' ? this.game.player : this.game.aiPaddle; }
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
    nearestWell() {
        return this.game.gravityWarp?.nearestWell() || null;
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
            if (!g.gravityWarp?.start(side)) return false;
            s.cooldown = ModeAbilities.COOLDOWN.gravity;
        } else if (g.gameMode === 'obstacle') {
            if (!this.dice?.roll(side)) return false;
            s.cooldown = ModeAbilities.COOLDOWN.obstacle;
        } else return false;
        return true;
    }

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
            if (wasActive && s.active === 0 && this.game.gameMode === 'speed') s.miss = 0.45;
        }
        this.dice?.update(dt);
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
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            const s = this.side(side);
            if (mode === 'speed') this.renderSpeedField(ctx, side, s, motion);
        }
        if (mode === 'obstacle') this.dice?.render(ctx);
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
            const ready = ['player', 'ai'].filter(side => (side === 'player' || g.isMultiplayer)
                && this.sides[side].cooldown <= 0 && this.enabled);
            g.gravityWarp?.render(ctx, motion, ready);
        }
        ctx.restore();
    }

    // Draw after the arena reveal transform is restored so the ability status
    // stays fixed to the screen while the court camera zooms and moves.
    renderHud(ctx) {
        const g = this.game, mode = g.gameMode;
        if (!['speed', 'gravity', 'obstacle'].includes(mode) || g.net) return;
        const color = mode === 'speed' ? '#7cf4ff' : mode === 'gravity' ? '#c3b0ff' : '#ffd477';
        ctx.save();
        for (const side of ['player', 'ai']) {
            if (side === 'ai' && !g.isMultiplayer) continue;
            // Touch screens show this as an on-screen button instead.
            if (window.PPDeviceControls?.showsButton(side)) continue;
            const s = this.side(side), ready = s.cooldown <= 0;
            const bound = window.PPSettings?.get('bindings')?.[side === 'player' ? 'p1Fire' : 'p2Fire'];
            const key = window.PerfGovernor?.isMobile ? 'Tap'
                : window.PPSettings?.keyLabel(bound || (side === 'player' ? ' ' : 'enter')) || (side === 'player' ? 'Space' : 'Enter');
            const dice = mode === 'obstacle' ? this.dice?.status(side) : null;
            const inRange = mode === 'speed' ? this.speedInRange(side) : mode === 'gravity' ? !!this.nearestWell() : false;
            const label = mode === 'speed' ? 'OVERCHARGE' : mode === 'gravity' ? 'WORMHOLE' : 'LUCKY DICE';
            const warping = mode === 'gravity' && g.gravityWarp?.warp?.side === side;
            const status = dice ? dice.text : warping ? 'WARPING' : s.active > 0 ? 'ACTIVE' : s.miss > 0 ? 'MISSED' : ready ? (inRange ? 'PRESS NOW' : (mode === 'obstacle' ? 'READY TO ROLL' : 'READY')) : `${s.cooldown.toFixed(1)}s`;
            const pillW = Math.min(236, g.width * (g.isMultiplayer ? 0.38 : 0.48));
            const pillH = Math.max(38, Math.min(48, g.height * 0.071));
            const pillX = side === 'player' ? 20 : g.width - pillW - 20;
            const pillY = g.height - pillH - 16;
            if (window.PPArt) window.PPArt.plate(ctx, pillX, pillY, pillW, pillH, ready ? color : '#526779', 'rgba(3, 13, 29, 0.86)');
            else {
                ctx.fillStyle = 'rgba(3, 13, 29, 0.84)';
                ctx.strokeStyle = ready ? color : '#526779';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 9); ctx.fill(); ctx.stroke();
            }
            const progress = ready ? 1 : 1 - s.cooldown / ModeAbilities.COOLDOWN[mode];
            ctx.fillStyle = ready ? color : '#698394';
            ctx.fillRect(pillX + 7, pillY + pillH - 6, (pillW - 14) * Math.max(0, Math.min(1, progress)), 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.max(10, Math.min(13, pillH * 0.28))}px Orbitron, sans-serif`;
            ctx.fillStyle = '#e8f7ff';
            ctx.fillText(`${key.toUpperCase()}  ${label}`, pillX + 10, pillY + pillH * 0.34);
            ctx.fillStyle = dice ? dice.color : s.miss > 0 ? '#ffae8f' : ready ? color : '#90a9bb';
            ctx.font = `700 ${Math.max(10, Math.min(13, pillH * 0.27))}px Orbitron, sans-serif`;
            ctx.fillText(status, pillX + 10, pillY + pillH * 0.69);
            if (mode === 'obstacle' && this.dice) {
                const iconSize = pillH * 0.46;
                this.dice.renderIcon(ctx, side, pillX + pillW - iconSize * 0.95 - 6, pillY + pillH * 0.48, iconSize, ready);
            }
        }
        ctx.restore();
    }
}

window.ModeAbilities = ModeAbilities;
