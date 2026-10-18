// Gravity mode's ability: the Wormhole.
//
// Press it while the ball passes a black hole. The hole swallows the ball,
// and it bursts out of another black hole further up the court, faster,
// aimed at the open side of the opponent's goal. Every warp adds +1 to what the next
// goal is worth (up to +2). The value rides on the ball until someone scores,
// so a returned warp raises the stakes for both sides.
class GravityWormhole {
    static REACH = 2.25;          // x well radius: how close the ball must be
    static SWALLOW = 0.2;         // seconds the ball spirals into the entry hole
    static TRANSIT = 0.12;        // seconds it is gone, travelling
    static GROW = 0.12;           // seconds it takes to pop back to full size
    static FLASH = 0.5;           // exit burst lifetime
    static SPEED_KICK = 1.1;
    static MIN_EXIT = 1;          // x baseSpeed: a slow ball still leaves at serve pace
    static MAX_AIM = 0.6;         // radians off a straight line at the goal
    static AIM_EDGE = 0.25;       // aim this far (share of height) from the open edge
    static IMMUNE = 0.45;         // the exit hole cannot grab the ball straight back
    static MIN_GAP = 0.45;        // share of the court left between exit and goal
    static MAX_CHARGE = 2;
    static COLORS = ['#ffd166', '#ff8a3d'];
    static WARP = '#b494ff';

    constructor(game) {
        this.game = game;
        this.reset();
    }

    reset() {
        this.warp = null;
        this.flashes = [];
        this.sinceEmerge = Infinity;
        this.badgePop = 0;
        this.clock = 0;
        this.introShown = false;
        const ball = this.game.ball;
        if (ball) {
            ball.warpCharge = 0;
            ball.warpImmune = null;
            ball.warpImmuneT = 0;
        }
    }

    get active() {
        return this.game.gameMode === 'gravity' && !this.game.isZombieWaveMode?.();
    }

    // While true the wormhole owns the ball: no physics, collisions or pull.
    holdsBall() { return !!this.warp; }

    // The exit hole leaves the ball alone for a moment after spitting it out.
    ignores(well, ball) {
        return !!this.warp && ball === this.game.ball
            || (ball?.warpImmune === well && ball.warpImmuneT > 0);
    }

    nearestWell(ball = this.game.ball) {
        if (!this.active || !ball?.pos || this.warp) return null;
        let nearest = null, best = Infinity;
        for (const well of this.game.gravityWells) {
            if (!well.active || this.ignores(well, ball)) continue;
            const d = Math.hypot(well.pos.x - ball.pos.x, well.pos.y - ball.pos.y);
            if (d <= well.radius * GravityWormhole.REACH && d < best) { best = d; nearest = well; }
        }
        return nearest;
    }

    // The black hole furthest toward the opponent's goal that still leaves
    // them room to react (MIN_GAP of the court), never the entry hole unless
    // it is the only one on the court.
    exitFor(side, from) {
        const g = this.game;
        const gap = g.width * GravityWormhole.MIN_GAP;
        let exit = null, best = -Infinity, back = null, backBest = Infinity;
        for (const well of g.gravityWells) {
            if (!well.active || well === from) continue;
            const room = side === 'player' ? g.width - well.pos.x : well.pos.x;
            if (room >= gap && -room > best) { best = -room; exit = well; }
            if (-room < backBest) { backBest = -room; back = well; }
        }
        return exit || back || from;
    }

    // Aim at the goal line on the side away from the opponent's paddle.
    aim(side, x, y) {
        const g = this.game;
        const opp = side === 'player' ? g.aiPaddle : g.player;
        const dir = side === 'player' ? 1 : -1;
        const oppY = opp ? opp.pos.y + opp.h / 2 : g.height / 2;
        const edge = GravityWormhole.AIM_EDGE;
        const targetY = oppY > g.height / 2 ? g.height * edge : g.height * (1 - edge);
        const goalX = side === 'player' ? g.width : 0;
        const max = GravityWormhole.MAX_AIM;
        const angle = Math.max(-max, Math.min(max, Math.atan2(targetY - y, Math.max(40, Math.abs(goalX - x)))));
        return { x: Math.cos(angle) * dir, y: Math.sin(angle) };
    }

    start(side) {
        const g = this.game, ball = g.ball;
        if (!this.active || this.warp || !ball?.pos || g.serveHold > 0) return false;
        if (Math.abs(ball.vel.x) + Math.abs(ball.vel.y) < 1) return false;
        const from = this.nearestWell(ball);
        if (!from) return false;
        const dx = ball.pos.x - from.pos.x, dy = ball.pos.y - from.pos.y;
        // Spiral in the direction the ball was already circling.
        const spin = dx * ball.vel.y - dy * ball.vel.x >= 0 ? 1 : -1;
        this.warp = {
            side, from, t: 0, spin,
            a0: Math.atan2(dy, dx), r0: Math.hypot(dx, dy),
            speed: ball.getSpeed(), emerged: false
        };
        ball.vel.x = 0;
        ball.vel.y = 0;
        ball.wellEntrySpeed = 0;
        from.flare?.();
        g.postFx?.ripple(from.pos.x, from.pos.y, 0.6);
        g.audio?.warpIn?.(g.panFor?.(from.pos.x) || 0);
        return true;
    }

    // Called every physics step in Gravity mode, at real (unslowed) time.
    update(dt) {
        const g = this.game, ball = g.ball;
        if (!this.active || !ball?.pos) return;
        this.clock += dt;
        this.badgePop = Math.max(0, this.badgePop - dt * 3);
        this.sinceEmerge += dt;
        if (ball.warpImmuneT > 0) ball.warpImmuneT = Math.max(0, ball.warpImmuneT - dt);
        for (let i = this.flashes.length - 1; i >= 0; i--) {
            this.flashes[i].t -= dt;
            if (this.flashes[i].t <= 0) this.flashes.splice(i, 1);
        }

        if (!this.introShown && !g.paused && !g.net && g.serveHold <= 0
            && Math.abs(ball.vel.x) + Math.abs(ball.vel.y) > 1) {
            this.introShown = true;
            g.showNotification?.('Wormhole', 'Use your ability as the ball passes a black hole: it warps out at their goal', GravityWormhole.WARP);
        }

        const w = this.warp;
        if (!w) return;
        // A new serve (goal, reset) ends any warp the old rally left behind.
        if (g.serveHold > 0) { this.warp = null; return; }
        w.t += dt;
        ball.prev.set(ball.pos.x, ball.pos.y);
        if (w.t < GravityWormhole.SWALLOW) {
            const k = w.t / GravityWormhole.SWALLOW, ease = k * k;
            const r = w.r0 * (1 - ease);
            const a = w.a0 + w.spin * ease * 2.6;
            ball.pos.set(w.from.pos.x + Math.cos(a) * r, w.from.pos.y + Math.sin(a) * r);
        } else if (w.t < GravityWormhole.SWALLOW + GravityWormhole.TRANSIT) {
            ball.pos.set(w.from.pos.x, w.from.pos.y);
            if (!w.to) w.to = this.exitFor(w.side, w.from);
        } else {
            this.emerge(w);
        }
    }

    emerge(w) {
        const g = this.game, ball = g.ball;
        const to = w.to || this.exitFor(w.side, w.from);
        const d = this.aim(w.side, to.pos.x, to.pos.y);
        const base = (ball.baseSpeed || w.speed) * GravityWormhole.MIN_EXIT;
        const speed = Math.min(ball.maxSpeed || Infinity, Math.max(w.speed, base) * GravityWormhole.SPEED_KICK);
        const out = to.radius * 0.6 + ball.r;
        const x = to.pos.x + d.x * out;
        const y = Math.max(ball.r + 4, Math.min(g.height - ball.r - 4, to.pos.y + d.y * out));
        ball.pos.set(x, y);
        ball.prev.set(x, y);
        ball.vel.x = d.x * speed;
        ball.vel.y = d.y * speed;
        ball.spin = 0;
        ball.trailCount = 0;
        ball.wellEntrySpeed = 0;
        ball.warpImmune = to;
        ball.warpImmuneT = GravityWormhole.IMMUNE;

        const before = ball.warpCharge || 0;
        const charge = Math.min(GravityWormhole.MAX_CHARGE, before + 1);
        ball.warpCharge = charge;
        this.badgePop = 1;
        this.warp = null;
        this.sinceEmerge = 0;
        this.flashes.push({ x: to.pos.x, y: to.pos.y, r: to.radius, dx: d.x, dy: d.y, t: GravityWormhole.FLASH });

        const color = GravityWormhole.COLORS[charge - 1];
        to.flare?.();
        g.popText?.(charge > before ? `WARP +${charge}` : 'WARP', x, y - 34, color, 30);
        g.particles?.spawnGodTierHit(x, y, GravityWormhole.WARP, 900);
        g.postFx?.ripple(to.pos.x, to.pos.y, 0.75);
        g.postFx?.punch(0.55);
        g.hitStop = Math.max(g.hitStop || 0, 0.03);
        g.screenShake = Math.max(g.screenShake || 0, 5);
        g.audio?.warpOut?.(charge, g.panFor?.(x) || 0);
    }

    // How big to draw the ball: it shrinks into the hole, vanishes in
    // transit and pops back out.
    ballScale() {
        const w = this.warp;
        if (w) {
            if (w.t >= GravityWormhole.SWALLOW) return 0;
            const k = w.t / GravityWormhole.SWALLOW;
            return 1 - k * k * 0.85;
        }
        return this.sinceEmerge < GravityWormhole.GROW ? 0.45 + 0.55 * this.sinceEmerge / GravityWormhole.GROW : 1;
    }

    // Extra points a goal is worth; consumes the charge.
    consumeGoalBonus(ball) {
        if (!this.active || ball !== this.game.ball) return 0;
        const bonus = ball.warpCharge || 0;
        ball.warpCharge = 0;
        return bonus;
    }

    announceGoal(points, x, y) {
        if (!this.active) return;
        const color = GravityWormhole.COLORS[Math.min(1, points - 2)];
        this.game.popText(`${points}-POINT GOAL!`, x, y, color, 38);
    }

    // World layer, drawn over the black holes. `ready` lists the sides whose
    // ability is charged, for the aim preview.
    render(ctx, motion, ready) {
        if (!this.active) return;
        const g = this.game;
        ctx.save();
        ctx.lineCap = 'round';
        if (!this.warp && ready.length) {
            const entry = this.nearestWell();
            if (entry) {
                ctx.globalAlpha = 0.6;
                ctx.strokeStyle = '#cbb8ff';
                ctx.lineWidth = 1.6;
                ctx.setLineDash([5, 9]);
                ctx.lineDashOffset = motion ? -this.clock * 24 : 0;
                ctx.beginPath(); ctx.arc(entry.pos.x, entry.pos.y, entry.radius * 1.35, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                for (const side of ready) this.renderExitMarker(ctx, side, this.exitFor(side, entry), motion);
            }
        }
        const w = this.warp;
        if (w) this.renderWarp(ctx, w, motion);
        for (const f of this.flashes) this.renderFlash(ctx, f, motion);
        ctx.restore();
    }

    // Small chevrons on the hole the ball will come out of.
    renderExitMarker(ctx, side, well, motion) {
        if (!well) return;
        const d = this.aim(side, well.pos.x, well.pos.y);
        const a = Math.atan2(d.y, d.x);
        const r = well.radius * 1.12;
        const bob = motion ? Math.sin(this.clock * 6) * 4 : 0;
        ctx.save();
        ctx.translate(well.pos.x, well.pos.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#e6dcff';
        ctx.shadowColor = GravityWormhole.WARP;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3.2;
        ctx.lineJoin = 'round';
        for (let i = 0; i < 3; i++) {
            const x = r + 6 + i * 15 + bob;
            ctx.globalAlpha = 0.9 - i * 0.22;
            ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 10, 0); ctx.lineTo(x, 10); ctx.stroke();
        }
        ctx.restore();
    }

    renderWarp(ctx, w, motion) {
        const from = w.from;
        const k = Math.min(1, w.t / GravityWormhole.SWALLOW);
        // A violet vortex tightening over the entry hole.
        ctx.save();
        ctx.translate(from.pos.x, from.pos.y);
        ctx.rotate((motion ? this.clock * 7 : 0) * w.spin);
        ctx.strokeStyle = GravityWormhole.WARP;
        ctx.shadowColor = GravityWormhole.WARP;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.85 * (1 - Math.max(0, w.t - GravityWormhole.SWALLOW) / GravityWormhole.TRANSIT);
        for (let i = 0; i < 3; i++) {
            const rr = from.radius * (1.25 - k * 0.5) * (1 - i * 0.2);
            const a = i * Math.PI * 2 / 3;
            ctx.lineWidth = 3 - i * 0.7;
            ctx.beginPath(); ctx.arc(0, 0, rr, a, a + Math.PI * (0.55 + k * 0.4)); ctx.stroke();
        }
        ctx.restore();
        // Once the ball is gone, a thread of light runs to the exit hole.
        if (w.t < GravityWormhole.SWALLOW * 0.6) return;
        const to = w.to || this.exitFor(w.side, from);
        if (!to || to === from) return;
        const p = Math.min(1, (w.t - GravityWormhole.SWALLOW * 0.6) / (GravityWormhole.SWALLOW * 0.4 + GravityWormhole.TRANSIT));
        const mx = (from.pos.x + to.pos.x) / 2, my = (from.pos.y + to.pos.y) / 2;
        const nx = -(to.pos.y - from.pos.y) * 0.18, ny = (to.pos.x - from.pos.x) * 0.18;
        ctx.save();
        ctx.strokeStyle = '#e6dcff';
        ctx.shadowColor = GravityWormhole.WARP;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([16, 12]);
        ctx.lineDashOffset = motion ? -this.clock * 900 : 0;
        ctx.beginPath();
        // Draw only the travelled part of the curve.
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * p, u = 1 - t;
            const x = u * u * from.pos.x + 2 * u * t * (mx + nx) + t * t * to.pos.x;
            const y = u * u * from.pos.y + 2 * u * t * (my + ny) + t * t * to.pos.y;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    renderFlash(ctx, f, motion) {
        const k = f.t / GravityWormhole.FLASH, e = 1 - k;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.strokeStyle = '#e6dcff';
        ctx.shadowColor = GravityWormhole.WARP;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, f.r * (0.7 + e * (motion ? 0.9 : 0.3)), 0, Math.PI * 2); ctx.stroke();
        if (motion) {
            // Streaks fan out in the direction the ball left.
            const a0 = Math.atan2(f.dy, f.dx);
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 7; i++) {
                const a = a0 + (i - 3) * 0.16;
                const inner = f.r * (0.8 + e * 0.6), outer = inner + 26 + e * 60;
                ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
                ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // Loaded ball: small satellites orbit it, one per charge, plus a fixed
    // badge so the stakes are readable without chasing the ball.
    renderBall(ctx, interp) {
        const ball = this.game.ball;
        const charge = ball?.warpCharge || 0;
        if (!this.active || charge <= 0 || this.warp) return;
        const x = ball.prev.x + (ball.pos.x - ball.prev.x) * interp;
        const y = ball.prev.y + (ball.pos.y - ball.prev.y) * interp;
        const t = performance.now() * 0.001;
        const color = GravityWormhole.COLORS[charge - 1];
        const orbit = ball.r + 9;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, orbit, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < charge; i++) {
            const a = t * 6 + (i * Math.PI * 2) / charge;
            const sx = x + Math.cos(a) * orbit;
            const sy = y + Math.sin(a) * orbit;
            ctx.moveTo(sx + 3.5, sy);
            ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();

        this.renderBadge(ctx, charge, color);
    }

    renderBadge(ctx, charge, color) {
        const game = this.game;
        const k = Math.max(0.8, Math.min(1.2, game.height / 720));
        const pop = this.badgePop;
        const size = Math.round((15 + pop * 6) * k);
        const text = `POINT WORTH ${1 + charge}`;
        // Top centre, under the rally counter: the bottom holds notifications.
        const y = 168 * k;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${size}px Orbitron, Audiowide, sans-serif`;
        const w = ctx.measureText(text).width + 28 * k;
        const h = size + 14 * k;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(10, 8, 24, 0.72)';
        game.roundRect(game.width / 2 - w / 2, y - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.fillText(text, game.width / 2, y + 1);
        ctx.restore();
    }
}

window.GravityWormhole = GravityWormhole;
