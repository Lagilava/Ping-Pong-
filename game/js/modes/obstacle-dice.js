// Obstacle mode: the Lucky Dice ability.
//
// Press the ability button (Space / Enter for player two, right-click, a
// second finger on touch, or gamepad A) and your paddle throws a die onto the
// court. It tumbles, bounces and settles on a face, and the face decides what
// you get:
//   6 Star power      (the ? block Star: invincible, smashes hazards, pulls coins)
//   5 Shooting balls  (your paddle fires two extra balls at the other goal)
//   4 Pull            (the Zombie Pull, aimed at the ball: it is steered to your paddle)
//   3 Big paddle
//   2 No luck
//   1 Fast ball       (the boost pad's Turbo)
//
// The die is a real cube: each frame its three visible faces are projected
// with an affine transform, so pips stay round on tilted faces. The tumble is
// one eased rotation that always ends exactly on the rolled face, so there is
// no snap at the end. Only the computer opponent is left out: it never rolls.
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const C = {
        ROLL: 1.05,          // throw, bounces and settle
        HOLD: 0.8,           // the result stays on court
        FADE: 0.34,          // the die flies back into the paddle
        COOLDOWN: 9,         // from the throw to the next roll
        BIG_TIME: 7,
        BIG_SCALE: 1.6,
        BIG_ANIM: 0.3,
        PULL_TIME: 5,
        PULL_RANGE: 0.46,    // reach in front of the paddle, share of court width
        PULL_BAND: 0.3,      // reach above and below the paddle, share of court height
        SHOTS: 2,
        MAX_BALLS: 4,
    };
    const FACES = {
        1: { key: 'fast', name: 'FAST BALL', color: '#ff9a2e' },
        2: { key: 'none', name: 'NO LUCK', color: '#9fb2c4' },
        3: { key: 'big', name: 'BIG PADDLE', color: '#ff6ad5' },
        4: { key: 'pull', name: 'PULL', color: '#9dff6a' },
        5: { key: 'shots', name: 'SHOOTING BALLS', color: '#7df9ff' },
        6: { key: 'star', name: 'STAR POWER', color: '#ffe14d' },
    };
    // Cube faces: outward normal, two edge axes and the value printed on it.
    // Opposite faces add up to seven, like a real die.
    const CUBE = [
        { n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0], v: 1 },
        { n: [0, 0, -1], u: [-1, 0, 0], w: [0, 1, 0], v: 6 },
        { n: [1, 0, 0], u: [0, 0, -1], w: [0, 1, 0], v: 3 },
        { n: [-1, 0, 0], u: [0, 0, 1], w: [0, 1, 0], v: 4 },
        { n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, -1], v: 2 },
        { n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1], v: 5 },
    ];
    // Euler angles (x then y) that turn each value's face toward the viewer.
    const FRONT = { 1: [0, 0], 6: [Math.PI, 0], 3: [0, -Math.PI / 2], 4: [0, Math.PI / 2], 2: [Math.PI / 2, 0], 5: [-Math.PI / 2, 0] };
    const PIPS = {
        1: [[0, 0]],
        2: [[-1, -1], [1, 1]],
        3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };
    // Bounce schedule: share of the throw and relative height of each hop.
    const HOPS = [[0.40, 1], [0.26, 0.42], [0.17, 0.15], [0.17, 0]];
    const LIGHT = (() => { const l = [-0.42, -0.62, 0.66], m = Math.hypot(...l); return l.map(v => v / m); })();

    const clamp01 = x => Math.max(0, Math.min(1, x));
    const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
    const easeOutBack = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

    // Rotation matrices as flat row-major arrays.
    function rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
    function ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
    function mul(a, b) {
        const o = new Array(9);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        }
        return o;
    }
    function apply(m, v) {
        return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    }
    // A fixed resting tilt so the settled die shows its top and side, not a flat square.
    const TILT = mul(rx(-0.36), ry(0.42));

    class ObstacleDice {
        static C = C;
        static FACES = FACES;

        constructor(game, abilities) {
            this.game = game;
            this.abilities = abilities;
            this.reset();
        }

        reset() {
            for (const side of ['player', 'ai']) {
                const old = this.sides?.[side];
                if (old && old.bigScale !== 1) this.paddle(side)?.resetSize?.();
            }
            this.sides = { player: this.blank(), ai: this.blank() };
            this.clock = 0;
        }

        blank() {
            return { die: null, face: 0, shown: 0, big: 0, bigScale: 1, pull: 0, pulling: 0, tether: 0, shots: 0, shotX: 0, shotY: 0 };
        }

        side(side) { return this.sides[side]; }
        paddle(side) { return side === 'player' ? this.game.player : this.game.aiPaddle; }
        motion() { return !window.PPSettings?.get?.('reduceMotion'); }

        rolling(side) {
            const d = this.sides[side].die;
            return !!d && d.t < C.ROLL;
        }

        // Throws the die. The face is decided now so the tumble can be planned
        // to land on it; the effect starts the moment the die settles.
        roll(side, face) {
            const g = this.game, s = this.sides[side], paddle = this.paddle(side);
            if (!paddle || this.rolling(side)) return false;
            const value = face || 1 + Math.floor(Math.random() * 6);
            const dir = side === 'player' ? 1 : -1;
            const size = Math.max(26, Math.min(48, g.height * 0.062));
            const x0 = paddle.pos.x + (dir > 0 ? paddle.w : 0) + dir * size * 0.7;
            const y0 = Math.max(size * 1.4, Math.min(g.height - size * 1.4, paddle.pos.y + paddle.h / 2));
            const [ta, tb] = FRONT[value];
            const a0 = Math.random() * TAU, b0 = Math.random() * TAU, c0 = Math.random() * TAU;
            const spinA = (Math.random() < 0.5 ? -1 : 1), spinB = (Math.random() < 0.5 ? -1 : 1);
            // End two to three whole turns past the start, exactly on the face.
            const endA = ta + TAU * Math.round((a0 - ta) / TAU) + spinA * TAU * 2;
            const endB = tb + TAU * Math.round((b0 - tb) / TAU) + spinB * TAU * (1 + Math.round(Math.random()));
            const endC = Math.round((c0 + TAU * 1.25) / (Math.PI / 2)) * (Math.PI / 2);
            s.die = {
                value, t: 0, size, dir, x0, y0,
                x1: x0 + dir * g.width * 0.15,
                y1: Math.max(size * 1.4, Math.min(g.height - size * 1.4, y0 + (g.height / 2 - y0) * 0.18)),
                a0, b0, c0, endA, endB, endC, hop: 0, squash: 0, landed: false,
            };
            s.face = 0;
            this.sound(side, 'throw');
            return true;
        }

        update(dt) {
            const g = this.game;
            this.clock += dt;
            for (const side of ['player', 'ai']) {
                const s = this.sides[side];
                const d = s.die;
                if (d) {
                    const before = d.t;
                    d.t += dt;
                    d.squash = Math.max(0, d.squash - dt * 9);
                    // A click and a squash on every bounce contact.
                    let edge = 0;
                    for (let i = 0; i < HOPS.length - 1; i++) {
                        edge += HOPS[i][0];
                        const at = edge * C.ROLL;
                        if (before < at && d.t >= at) {
                            d.squash = 1 - i * 0.25;
                            this.sound(side, 'bounce', i);
                        }
                    }
                    if (!d.landed && d.t >= C.ROLL) {
                        d.landed = true;
                        this.resolve(side, d.value);
                    }
                    if (d.t >= C.ROLL + C.HOLD + C.FADE) {
                        const paddle = this.paddle(side);
                        if (paddle && this.motion()) {
                            g.particles?.spawnGodTierHit?.(paddle.pos.x + paddle.w / 2, paddle.pos.y + paddle.h / 2, FACES[d.value].color, 520);
                        }
                        s.die = null;
                    }
                }
                s.shown = Math.max(0, s.shown - dt);
                s.shots = Math.max(0, s.shots - dt);
                this.updateBig(side, s, dt);
                this.updatePull(side, s, dt);
            }
        }

        // ── Effects ─────────────────────────────────────────────────────
        resolve(side, value) {
            const g = this.game, s = this.sides[side], d = s.die;
            const face = FACES[value];
            s.face = value;
            s.shown = 1.6;
            const x = d ? d.x1 : g.width / 2, y = d ? d.y1 : g.height / 2;
            const labelSize = Math.max(18, Math.min(28, g.width * 0.07));
            const margin = Math.min(180, g.width * 0.36);
            g.popText?.(face.name, Math.max(margin, Math.min(g.width - margin, x)), y - (d ? d.size * 1.5 : 40), face.color, labelSize);
            g.postFx?.ripple?.(x, y, value === 2 ? 0.2 : 0.45);
            this.sound(side, face.key);
            const arcade = g.obstacleArcade;
            const ball = g.ball;
            switch (face.key) {
                case 'star':
                    if (arcade?.grantStar) arcade.grantStar(side, x, y);
                    g.postFx?.punch?.(0.4);
                    break;
                case 'shots':
                    this.fireShots(side);
                    break;
                case 'pull':
                    s.pull = C.PULL_TIME;
                    break;
                case 'big':
                    s.big = C.BIG_TIME;
                    break;
                case 'fast':
                    if (ball) {
                        if (arcade?.boost) arcade.boost(ball, 1.35);
                        else {
                            const sp = Math.hypot(ball.vel.x, ball.vel.y) || 1;
                            const next = Math.min(ball.maxSpeed || sp * 1.35, sp * 1.35);
                            ball.vel.x *= next / sp; ball.vel.y *= next / sp;
                        }
                        g.particles?.spawnGodTierHit?.(ball.pos.x, ball.pos.y, face.color, 900);
                    }
                    break;
                default:
                    if (this.motion()) g.particles?.spawnGodTierHit?.(x, y, '#7d8ea0', 260);
            }
        }

        fireShots(side) {
            const g = this.game, s = this.sides[side], paddle = this.paddle(side), main = g.ball;
            const BallClass = typeof Ball === 'function' ? Ball : window.Ball;
            if (!paddle || !main || !BallClass) return;
            const extra = g.additionalBalls || (g.additionalBalls = []);
            const count = Math.min(C.SHOTS, C.MAX_BALLS - 1 - extra.length);
            const dir = side === 'player' ? 1 : -1;
            const x = paddle.pos.x + (dir > 0 ? paddle.w : 0) + dir * (main.r + 4);
            const y = paddle.pos.y + paddle.h / 2;
            s.shots = 0.42; s.shotX = x; s.shotY = y;
            if (count <= 0) {
                g.showNotification?.('Max Balls!', 'Already at maximum', '#ff9900');
                return;
            }
            const speed = Math.max(main.getSpeed ? main.getSpeed() : Math.hypot(main.vel.x, main.vel.y), main.baseSpeed || 560) * 1.05;
            for (let i = 0; i < count; i++) {
                const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * 0.46;
                const ball = new BallClass(x, y + spread * paddle.h * 0.8, main.r);
                ball.maxSpeed = main.maxSpeed;
                ball.baseSpeed = main.baseSpeed;
                ball.vel.x = Math.cos(spread) * speed * dir;
                ball.vel.y = Math.sin(spread) * speed;
                ball.life = 10;
                ball.lastHit = side;
                ball.color = FACES[5].color;
                extra.push(ball);
            }
            g.particles?.spawnGodTierHit?.(x, y, FACES[5].color, 1000);
            g.screenShake = Math.max(g.screenShake || 0, 4);
        }

        updateBig(side, s, dt) {
            const paddle = this.paddle(side);
            if (!paddle) return;
            if (this.game.gameMode !== 'obstacle') s.big = 0;
            s.big = Math.max(0, s.big - dt);
            // Grow with a little overshoot, shrink back smoothly near the end.
            let target = 1;
            if (s.big > 0) {
                const grown = C.BIG_TIME - s.big;
                target = s.big < C.BIG_ANIM
                    ? 1 + (C.BIG_SCALE - 1) * easeOutCubic(s.big / C.BIG_ANIM)
                    : 1 + (C.BIG_SCALE - 1) * easeOutBack(clamp01(grown / C.BIG_ANIM), 2.2);
            }
            if (target === s.bigScale) return;
            s.bigScale = target;
            if (target === 1) paddle.resetSize?.();
            else paddle.grow?.(target);
        }

        updatePull(side, s, dt) {
            const g = this.game, ball = g.ball, paddle = this.paddle(side);
            if (g.gameMode !== 'obstacle') s.pull = 0;
            s.pull = Math.max(0, s.pull - dt);
            let engaged = false;
            if (s.pull > 0 && ball && paddle && !(g.serveHold > 0)) {
                const dir = side === 'player' ? 1 : -1;
                const face = paddle.pos.x + (dir > 0 ? paddle.w : 0);
                const dx = (ball.pos.x - face) * dir;
                const cy = paddle.pos.y + paddle.h / 2;
                const dy = cy - ball.pos.y;
                const approaching = ball.vel.x * dir < 0;
                if (approaching && dx > -ball.r && dx < g.width * C.PULL_RANGE &&
                    Math.abs(dy) < g.height * C.PULL_BAND + paddle.h / 2) {
                    engaged = true;
                    // Steer the ball so it arrives at the paddle's centre.
                    const speed = Math.hypot(ball.vel.x, ball.vel.y) || 1;
                    const time = Math.max(0.08, dx / Math.max(1, Math.abs(ball.vel.x)));
                    const want = Math.max(-speed * 0.8, Math.min(speed * 0.8, dy / time));
                    const k = 1 - Math.exp(-dt * 7);
                    ball.vel.y += (want - ball.vel.y) * k;
                    const vx = Math.max(speed * 0.45, Math.sqrt(Math.max(0, speed * speed - ball.vel.y * ball.vel.y)));
                    ball.vel.x = -dir * vx;
                    const fix = speed / Math.hypot(ball.vel.x, ball.vel.y);
                    ball.vel.x *= fix; ball.vel.y *= fix;
                }
            }
            s.pulling = engaged ? Math.min(1, s.pulling + dt * 6) : Math.max(0, s.pulling - dt * 4);
            s.tether += dt * (engaged ? 1 : 0.3);
        }

        // ── Status for the ability pill ─────────────────────────────────
        status(side) {
            const s = this.sides[side];
            if (this.rolling(side)) return { text: 'ROLLING…', color: '#fff3c4' };
            if (s.big > 0) return { text: `BIG PADDLE ${Math.ceil(s.big)}s`, color: FACES[3].color };
            if (s.pull > 0) return { text: `PULL ${Math.ceil(s.pull)}s`, color: FACES[4].color };
            const arcade = this.game.obstacleArcade;
            if (arcade?.starTime > 0 && arcade.starOwner === side && s.face === 6) return { text: `STAR ${Math.ceil(arcade.starTime)}s`, color: FACES[6].color };
            if (s.shown > 0 && s.face) return { text: `${s.face} · ${FACES[s.face].name}`, color: FACES[s.face].color };
            return null;
        }

        // ── Sound ───────────────────────────────────────────────────────
        sound(side, kind, i = 0) {
            const a = this.game.audio;
            const tone = (f, type, dur, vol, delay = 0) => {
                if (!a?.createOscillatorSound) return;
                if (delay) setTimeout(() => a.createOscillatorSound(f, type, dur, vol), delay);
                else a.createOscillatorSound(f, type, dur, vol);
            };
            switch (kind) {
                case 'throw': tone(330, 'triangle', 0.06, 0.12); tone(1240, 'square', 0.025, 0.07, 30); break;
                case 'bounce': tone(150 - i * 18, 'sine', 0.06, 0.2 - i * 0.04); tone(1500 + i * 260, 'triangle', 0.025, 0.1 - i * 0.02, 8); break;
                case 'star': [523, 659, 784, 1047].forEach((f, k) => tone(f, 'square', 0.1, 0.14, k * 70)); break;
                case 'shots': tone(196, 'sawtooth', 0.12, 0.18); tone(784, 'square', 0.08, 0.12, 50); tone(988, 'square', 0.08, 0.12, 120); break;
                case 'pull': tone(110, 'sine', 0.35, 0.22); tone(220, 'triangle', 0.3, 0.1, 60); break;
                case 'big': tone(262, 'square', 0.08, 0.12); tone(392, 'square', 0.08, 0.12, 70); tone(523, 'square', 0.14, 0.14, 140); break;
                case 'fast': break; // the boost plays its own whoosh
                default: tone(392, 'triangle', 0.14, 0.12); tone(330, 'triangle', 0.14, 0.12, 150); tone(262, 'triangle', 0.3, 0.12, 300);
            }
        }

        // ── Render (court space) ────────────────────────────────────────
        render(ctx) {
            const motion = this.motion();
            for (const side of ['player', 'ai']) {
                const s = this.sides[side];
                this.renderBig(ctx, side, s, motion);
                this.renderPull(ctx, side, s, motion);
                this.renderShots(ctx, s, motion);
                if (s.die) this.renderDie(ctx, side, s.die, motion);
            }
        }

        // Where the die is and how it is turned at its current time.
        pose(side, d, motion) {
            const paddle = this.paddle(side);
            const t = d.t;
            const p = clamp01(t / C.ROLL);
            let x = d.x0 + (d.x1 - d.x0) * easeOutCubic(p);
            let y = d.y0 + (d.y1 - d.y0) * easeOutCubic(p);
            let z = 0;
            if (motion && p < 1) {
                let start = 0;
                for (const [share, height] of HOPS) {
                    const end = start + share;
                    if (p < end) {
                        const k = (p - start) / share;
                        z = height * 4 * k * (1 - k);
                        break;
                    }
                    start = end;
                }
            }
            const e = motion ? easeOutCubic(p) : 1;
            let a = d.a0 + (d.endA - d.a0) * e;
            let b = d.b0 + (d.endB - d.b0) * e;
            let c = d.c0 + (d.endC - d.c0) * e;
            let scale = 1, alpha = 1;
            const after = t - C.ROLL;
            if (after > 0) {
                // Settle wobble, then a pop when the result reads.
                c += motion ? 0.16 * Math.exp(-after * 9) * Math.sin(after * 30) : 0;
                scale *= 1 + 0.16 * Math.exp(-after * 7) * Math.sin(Math.min(after * 14, Math.PI));
            }
            const fade = t - C.ROLL - C.HOLD;
            if (fade > 0 && paddle) {
                const k = easeOutCubic(clamp01(fade / C.FADE));
                const px = paddle.pos.x + paddle.w / 2, py = paddle.pos.y + paddle.h / 2;
                x += (px - x) * k;
                y += (py - y) * k;
                scale *= 1 - 0.8 * k;
                alpha = 1 - k * 0.6;
                c += k * 2.4 * d.dir;
            }
            return { x, y, z, a, b, c, scale, alpha };
        }

        renderDie(ctx, side, d, motion) {
            const pose = this.pose(side, d, motion);
            const color = FACES[d.value].color;
            const size = d.size * pose.scale * (1 + pose.z * 0.38);
            const lift = pose.z * d.size * 1.1;
            ctx.save();
            ctx.globalAlpha = pose.alpha;
            // Contact shadow stays on the court while the die is in the air.
            const shadowW = d.size * (0.95 - pose.z * 0.3) * pose.scale;
            ctx.fillStyle = `rgba(0, 0, 0, ${0.34 - pose.z * 0.16})`;
            ctx.beginPath();
            ctx.ellipse(pose.x + lift * 0.35, pose.y + d.size * 0.42, shadowW * 0.62, shadowW * 0.22, 0, 0, TAU);
            ctx.fill();
            // Result halo: a cheap radial gradient, no shadowBlur.
            const after = d.t - C.ROLL;
            if (after > 0) {
                const k = Math.min(1, after / 0.12) * (1 - clamp01((d.t - C.ROLL - C.HOLD) / C.FADE));
                const r = d.size * (1.5 + 0.25 * Math.sin(this.clock * 8));
                const halo = ctx.createRadialGradient(pose.x, pose.y, d.size * 0.3, pose.x, pose.y, r);
                halo.addColorStop(0, this.rgba(color, 0.42 * k));
                halo.addColorStop(1, this.rgba(color, 0));
                ctx.fillStyle = halo;
                ctx.beginPath(); ctx.arc(pose.x, pose.y, r, 0, TAU); ctx.fill();
                if (after < 0.45) {
                    const ring = easeOutCubic(after / 0.45);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = pose.alpha * (1 - ring);
                    ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(pose.x, pose.y, d.size * (0.6 + ring * 1.6), 0, TAU); ctx.stroke();
                    ctx.globalAlpha = pose.alpha;
                }
            }
            const sq = d.squash;
            ctx.translate(pose.x, pose.y - lift);
            if (sq > 0) ctx.scale(1 + 0.16 * sq, 1 - 0.16 * sq);
            this.drawCube(ctx, pose.a, pose.b, pose.c, size, d.t >= C.ROLL ? color : null);
            ctx.restore();
        }

        // Draws the visible faces of a die centred on the origin.
        drawCube(ctx, a, b, c, size, glow) {
            const m = mul(TILT, mul(rz(c), mul(ry(b), rx(a))));
            const faces = [];
            for (const f of CUBE) {
                const n = apply(m, f.n);
                if (n[2] <= 0.015) continue;
                faces.push({ f, n, u: apply(m, f.u), w: apply(m, f.w) });
            }
            faces.sort((p, q) => p.n[2] - q.n[2]);
            // Dark edge pass: sharp faces make one solid silhouette.
            for (const face of faces) {
                ctx.save();
                ctx.transform(face.u[0] * size, face.u[1] * size, face.w[0] * size, face.w[1] * size, face.n[0] * size * 0.5, face.n[1] * size * 0.5);
                ctx.fillStyle = '#5b4a33';
                ctx.fillRect(-0.5, -0.5, 1, 1);
                ctx.restore();
            }
            for (const face of faces) {
                const light = Math.max(0, face.n[0] * LIGHT[0] + face.n[1] * LIGHT[1] + face.n[2] * LIGHT[2]);
                const shade = 0.56 + 0.44 * light;
                ctx.save();
                ctx.transform(face.u[0] * size, face.u[1] * size, face.w[0] * size, face.w[1] * size, face.n[0] * size * 0.5, face.n[1] * size * 0.5);
                const front = face.f.v === faces[faces.length - 1].f.v;
                ctx.fillStyle = `rgb(${Math.round(252 * shade)}, ${Math.round(246 * shade)}, ${Math.round(228 * shade)})`;
                ctx.beginPath(); ctx.roundRect(-0.46, -0.46, 0.92, 0.92, 0.2); ctx.fill();
                // A soft top-left sheen on each face.
                const sheen = ctx.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
                sheen.addColorStop(0, `rgba(255, 255, 255, ${0.35 * shade})`);
                sheen.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = sheen;
                ctx.fill();
                if (glow && front) {
                    ctx.strokeStyle = glow;
                    ctx.lineWidth = 0.07;
                    ctx.stroke();
                }
                const value = face.f.v;
                ctx.fillStyle = value === 1 ? '#d6202f' : (glow && front ? '#1b1206' : '#2a2016');
                for (const [px, py] of PIPS[value]) {
                    ctx.beginPath();
                    ctx.arc(px * 0.25, py * 0.25, value === 1 ? 0.14 : 0.088, 0, TAU);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // Flat die used on the ability pill.
        renderIcon(ctx, side, x, y, size, ready) {
            const s = this.sides[side];
            let value = s.face || 6;
            let a = 0, b = 0, c = 0;
            if (this.rolling(side)) {
                const d = s.die;
                const pose = this.pose(side, d, this.motion());
                a = pose.a; b = pose.b; c = pose.c;
                value = d.value;
            } else {
                [a, b] = FRONT[value];
                if (ready && this.motion()) c = Math.sin(this.clock * 5) * 0.12;
            }
            ctx.save();
            ctx.translate(x, y);
            ctx.globalAlpha = ready || this.rolling(side) ? 1 : 0.45;
            this.drawCube(ctx, a, b, c, size, null);
            ctx.restore();
        }

        renderBig(ctx, side, s, motion) {
            if (s.big <= 0) return;
            const paddle = this.paddle(side);
            if (!paddle) return;
            const blink = s.big < 1.2 && Math.floor(this.clock * 10) % 2 === 0;
            if (blink) return;
            const color = FACES[3].color;
            const pad = 6;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.75 + Math.sin(this.clock * 6) * 0.15;
            ctx.beginPath();
            ctx.roundRect(paddle.pos.x - pad, paddle.pos.y - pad, paddle.w + pad * 2, paddle.h + pad * 2, 8);
            ctx.stroke();
            if (motion) {
                // Chevrons at both ends show the paddle has stretched.
                ctx.globalAlpha = 0.6;
                const cx = paddle.pos.x + paddle.w / 2;
                const k = (this.clock * 1.6) % 1;
                for (const end of [-1, 1]) {
                    const y = end < 0 ? paddle.pos.y - pad - 6 - k * 10 : paddle.pos.y + paddle.h + pad + 6 + k * 10;
                    ctx.globalAlpha = 0.65 * (1 - k);
                    ctx.beginPath();
                    ctx.moveTo(cx - 7, y - end * 5);
                    ctx.lineTo(cx, y);
                    ctx.lineTo(cx + 7, y - end * 5);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        // The Zombie Pull's green field and tether, aimed at the ball.
        renderPull(ctx, side, s, motion) {
            if (s.pull <= 0 && s.pulling <= 0) return;
            const g = this.game, paddle = this.paddle(side), ball = g.ball;
            if (!paddle) return;
            const dir = side === 'player' ? 1 : -1;
            const face = paddle.pos.x + (dir > 0 ? paddle.w : 0);
            const cy = paddle.pos.y + paddle.h / 2;
            const range = g.width * C.PULL_RANGE;
            const half = g.height * C.PULL_BAND + paddle.h / 2;
            const fadeOut = s.pull > 0 ? Math.min(1, s.pull / 0.4) : 0;
            const base = (s.pull < 1 && Math.floor(this.clock * 10) % 2 === 0) ? 0.5 : 1;
            ctx.save();
            const field = ctx.createLinearGradient(face, 0, face + dir * range, 0);
            field.addColorStop(0, `rgba(157, 255, 106, ${(0.12 + 0.1 * s.pulling) * fadeOut * base})`);
            field.addColorStop(1, 'rgba(157, 255, 106, 0)');
            ctx.fillStyle = field;
            ctx.beginPath();
            ctx.moveTo(face, cy - paddle.h * 0.55);
            ctx.lineTo(face + dir * range, cy - half);
            ctx.lineTo(face + dir * range, cy + half);
            ctx.lineTo(face, cy + paddle.h * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = `rgba(214, 255, 176, ${0.32 * fadeOut * base})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 10]);
            ctx.lineDashOffset = motion ? this.clock * 40 * dir : 0;
            ctx.stroke();
            ctx.setLineDash([]);
            if (ball && s.pulling > 0.02) {
                // A wavy tether with motes flowing toward the paddle.
                const bx = ball.pos.x, by = ball.pos.y;
                const dx = bx - face, dy = by - cy;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len, ny = dx / len;
                const amp = Math.min(14, len * 0.06) * s.pulling;
                ctx.lineCap = 'round';
                for (const layer of [0, 1]) {
                    ctx.strokeStyle = layer ? `rgba(230, 255, 210, ${0.85 * s.pulling})` : `rgba(157, 255, 106, ${0.35 * s.pulling})`;
                    ctx.lineWidth = layer ? 2 : 7;
                    ctx.beginPath();
                    for (let i = 0; i <= 18; i++) {
                        const u = i / 18;
                        const wave = Math.sin(u * Math.PI) * Math.sin(u * 9 - (motion ? this.clock * 14 : 0)) * amp;
                        const x = face + dx * u + nx * wave, y = cy + dy * u + ny * wave;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
                if (motion) {
                    ctx.fillStyle = `rgba(214, 255, 176, ${0.9 * s.pulling})`;
                    for (let i = 0; i < 5; i++) {
                        const u = 1 - ((s.tether * 1.6 + i / 5) % 1);
                        ctx.beginPath();
                        ctx.arc(face + dx * u, cy + dy * u, 2.4, 0, TAU);
                        ctx.fill();
                    }
                }
                ctx.strokeStyle = `rgba(157, 255, 106, ${0.8 * s.pulling})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(bx, by, ball.r * (1.6 + 0.2 * Math.sin(this.clock * 12)), 0, TAU); ctx.stroke();
            }
            ctx.restore();
        }

        // Muzzle flash when the paddle fires its two balls.
        renderShots(ctx, s, motion) {
            if (s.shots <= 0) return;
            const k = s.shots / 0.42;
            const color = FACES[5].color;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            const r = 10 + (1 - k) * (motion ? 70 : 26);
            ctx.beginPath(); ctx.arc(s.shotX, s.shotY, r, 0, TAU); ctx.stroke();
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(s.shotX, s.shotY, r * 0.6, 0, TAU); ctx.stroke();
            ctx.restore();
        }

        rgba(hex, alpha) {
            const v = parseInt(hex.slice(1), 16);
            return `rgba(${v >> 16 & 255}, ${v >> 8 & 255}, ${v & 255}, ${alpha})`;
        }
    }

    window.ObstacleDice = ObstacleDice;
})();
