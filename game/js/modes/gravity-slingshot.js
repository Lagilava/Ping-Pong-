// Gravity mode's signature mechanic: the slingshot.
//
// Whip the ball around a black hole (it has to sweep a big arc around the
// core, not just graze the field) and it fires out faster, and the point on
// the table gets bigger: every slingshot adds +1 to whatever the next goal is
// worth, up to +2. The value rides on the ball, so returning a loaded ball
// keeps the stakes alive for both sides. Players aim with the paddle angle.
class GravitySlingshot {
    // The ball's path has to turn this far (radians) inside one well's pull.
    // A straight fly-by, even dead through the middle, turns very little.
    static BEND_NEEDED = 1.2;     // ~70°
    static MIN_SPEED = 260;        // a ball crawling out of a well doesn't count
    static MAX_CHARGE = 2;
    static SPEED_KICK = 1.16;
    static FREEZE_GAP = 0.9;      // seconds before another slingshot can freeze the game
    static COLORS = ['#ffd166', '#ff8a3d'];

    constructor(game) {
        this.game = game;
        this.reset();
    }

    reset() {
        this.tracks = new Map();   // well -> { last, sweep }
        this.badgePop = 0;
        this.clock = 0;
        this.lastFreezeAt = undefined;
        this.introShown = false;
        const ball = this.game.ball;
        if (ball) ball.slingCharge = 0;
    }

    static wrap(a) {
        if (a > Math.PI) return a - Math.PI * 2;
        if (a < -Math.PI) return a + Math.PI * 2;
        return a;
    }

    get active() {
        return this.game.gameMode === 'gravity' && !this.game.isZombieWaveMode?.();
    }

    // Called once per physics step after the wells have pulled on the ball.
    update(dt) {
        const game = this.game;
        const ball = game.ball;
        if (!this.active || !ball?.pos) return;
        this.badgePop = Math.max(0, this.badgePop - dt * 3);
        this.clock += dt;

        const moving = Math.abs(ball.vel.x) + Math.abs(ball.vel.y) > 1;
        if (!moving || game.serveHold > 0) return;
        if (!this.introShown && !game.paused) {
            this.introShown = true;
            game.showNotification('Slingshot', 'Curve the ball around a black hole: it speeds up and the point is worth more', GravitySlingshot.COLORS[0]);
        }

        const wells = game.gravityWells;
        for (let i = 0; i < wells.length; i++) {
            const well = wells[i];
            if (!well.active) continue;
            const angle = Math.atan2(ball.pos.y - well.pos.y, ball.pos.x - well.pos.x);
            let track = this.tracks.get(well);
            if (well.isBallInRange(ball)) {
                const heading = Math.atan2(ball.vel.y, ball.vel.x);
                if (!track) {
                    this.tracks.set(well, { last: angle, sweep: 0, start: angle, heading, bend: 0 });
                    continue;
                }
                track.sweep += GravitySlingshot.wrap(angle - track.last);
                track.last = angle;
                // How far the ball's flight path has turned since it entered.
                track.bend += GravitySlingshot.wrap(heading - track.heading);
                track.heading = heading;
            } else if (track) {
                this.tracks.delete(well);
                if (Math.abs(track.bend) >= GravitySlingshot.BEND_NEEDED && ball.getSpeed() >= GravitySlingshot.MIN_SPEED) {
                    this.fire(well, ball);
                }
            }
        }
    }

    fire(well, ball) {
        const game = this.game;
        const charge = Math.min(GravitySlingshot.MAX_CHARGE, (ball.slingCharge || 0) + 1);
        const gained = charge > (ball.slingCharge || 0);
        ball.slingCharge = charge;
        this.badgePop = 1;

        const speed = ball.getSpeed();
        const target = Math.min(ball.maxSpeed || speed, speed * GravitySlingshot.SPEED_KICK);
        if (speed > 0 && target > speed) {
            const k = target / speed;
            ball.vel.x *= k;
            ball.vel.y *= k;
        }

        well.flare?.();
        const color = GravitySlingshot.COLORS[charge - 1];
        const label = gained ? `SLINGSHOT +${charge}` : 'SLINGSHOT';
        game.popText(label, ball.pos.x, ball.pos.y - 34, color, 30);
        game.particles?.spawnGodTierHit(ball.pos.x, ball.pos.y, color, 900);
        game.postFx?.ripple(ball.pos.x, ball.pos.y, 0.7);
        game.postFx?.punch(0.55);
        // One freeze per run of slingshots: a ball whipping through several
        // wells in a row used to stall on every exit, which read as lag.
        if (this.lastFreezeAt === undefined || this.clock - this.lastFreezeAt > GravitySlingshot.FREEZE_GAP) {
            game.hitStop = Math.max(game.hitStop || 0, 0.035);
            this.lastFreezeAt = this.clock;
        }
        game.screenShake = Math.max(game.screenShake || 0, 5);
        game.audio?.slingshot?.(charge, game.panFor(ball.pos.x));
    }

    // A paddle hit resets any orbit in progress (the ball left on a new line).
    onPaddleHit() {
        this.tracks.clear();
    }

    // Extra points a goal is worth; consumes the charge.
    consumeGoalBonus(ball) {
        if (!this.active || ball !== this.game.ball) return 0;
        const bonus = ball.slingCharge || 0;
        ball.slingCharge = 0;
        this.tracks.clear();
        return bonus;
    }

    announceGoal(points, x, y) {
        if (!this.active) return;
        const color = GravitySlingshot.COLORS[Math.min(1, points - 2)];
        this.game.popText(`${points}-POINT GOAL!`, x, y, color, 38);
    }

    // Orbit progress ring on the well the ball is circling: fills as the ball
    // sweeps around and turns gold once the slingshot is primed.
    renderWellArcs(ctx) {
        if (!this.active || this.tracks.size === 0) return;
        ctx.save();
        ctx.lineCap = 'round';
        for (const [well, track] of this.tracks) {
            const progress = Math.min(1, Math.abs(track.bend) / GravitySlingshot.BEND_NEEDED);
            if (progress < 0.15) continue;
            const primed = progress >= 1;
            const r = well.radius * 1.32;
            ctx.globalAlpha = primed ? 0.95 : 0.35 + progress * 0.45;
            ctx.strokeStyle = primed ? GravitySlingshot.COLORS[0] : '#9fd8ff';
            ctx.lineWidth = primed ? 5 : 3;
            ctx.beginPath();
            ctx.arc(well.pos.x, well.pos.y, r, track.start, track.start + track.sweep, track.sweep < 0);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Loaded ball: small satellites orbit it, one per charge, plus a fixed
    // badge so the stakes are readable without chasing the ball.
    renderBall(ctx, interp) {
        const ball = this.game.ball;
        const charge = ball?.slingCharge || 0;
        if (!this.active || charge <= 0) return;
        const x = ball.prev.x + (ball.pos.x - ball.prev.x) * interp;
        const y = ball.prev.y + (ball.pos.y - ball.prev.y) * interp;
        const t = performance.now() * 0.001;
        const color = GravitySlingshot.COLORS[charge - 1];
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

window.GravitySlingshot = GravitySlingshot;
