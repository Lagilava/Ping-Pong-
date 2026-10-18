// Forge zombies: undead placed by hand in a Custom (Forge) arena.
//
// They reuse Zombie mode's actors and baked sprites, but play as arena
// hazards rather than a horde: each one roams near the spot it was placed,
// the ball bounces off it, and a kill pays coins to whoever hit the ball
// (coins arm a one-goal shield). A killed zombie rises again at its spot.
//   Shambler  lurches about its spot.
//   Runner    lunges at the ball when it comes near, then walks back.
//   Tank      big and slow; takes four hits.
//   Spitter   spits slime at the paddle on its half; a hit freezes it.
// The editor caps how many of each the arena can hold (see forge.js).
(function () {
    'use strict';

    const RESPAWN = 8;          // seconds a killed zombie stays down
    const COINS = { shambler: 1, runner: 2, spitter: 2, tank: 3 };
    const SPIT_EVERY = 4.6;
    const SPIT_STUN = 0.8;
    const BUILD_MIN_X = 0.09, BUILD_MAX_X = 0.91;

    class ForgeZombies {
        constructor(game) {
            this.game = game;
            this.zombies = [];
            this.spits = [];
            this.time = 0;
        }

        // items: [{ kind, x, y }] in court pixels.
        build(items) {
            const g = this.game;
            this.zombies = [];
            this.spits = [];
            if (typeof g.createZombieActor !== 'function') return;
            items.forEach((it, i) => {
                const z = g.createZombieActor(it.kind, it.x, it.y, 1);
                z.homeX = it.x;
                z.homeY = it.y;
                z.rise = 1;
                z.respawn = 0;
                z.spitTimer = 2.5 + (i % 3) * 0.9;
                z.frameT = z.animPhase * 2;
                z.anim = { facingX: it.x < g.width / 2 ? 1 : -1, attackPulse: 0, threat: 0, inhale: 0 };
                this.zombies.push(z);
            });
            g.zombieSprites?.prewarm(this.zombies);
        }

        clear() {
            this.zombies = [];
            this.spits = [];
        }

        isGuest() { return this.game.net?.role === 'guest'; }

        update(dt) {
            if (!this.zombies.length && !this.spits.length) return;
            const g = this.game;
            const W = g.width, H = g.height;
            const ball = g.ball;
            const live = !(g.serveHold > 0) && !g.pendingServe;
            const guest = this.isGuest();
            this.time += dt;
            g.zombieSprites?.pump(2);

            for (let i = 0; i < this.zombies.length; i++) {
                const z = this.zombies[i];
                if (z.dead) {
                    if (guest) continue;
                    z.respawn -= dt;
                    if (z.respawn <= 0) this.revive(z);
                    continue;
                }
                z.rise = Math.min(1, z.rise + dt * 1.4);
                z.flash = Math.max(0, z.flash - dt * 7);
                z.hitCooldown = Math.max(0, z.hitCooldown - dt);

                const t = this.time + z.phaseOffset;
                let tx, ty, steer = 15, maxSpeed = z.baseSpeed * 0.9;
                if (z.typeKey === 'runner' && ball) {
                    const reach = W * 0.2;
                    const bx = ball.pos.x + ball.vel.x * 0.12, by = ball.pos.y + ball.vel.y * 0.12;
                    if (Math.hypot(bx - z.homeX, by - z.homeY) < reach) {
                        tx = bx; ty = by; steer = 34; maxSpeed = z.baseSpeed * 1.35;
                    } else {
                        tx = z.homeX + Math.sin(t * 0.9) * H * 0.03;
                        ty = z.homeY + Math.cos(t * 0.7) * H * 0.05;
                        steer = 22;
                    }
                } else if (z.typeKey === 'tank') {
                    tx = z.homeX + Math.sin(t * 0.35) * H * 0.025;
                    ty = z.homeY + Math.cos(t * 0.28) * H * 0.04;
                    steer = 12; maxSpeed = z.baseSpeed * 0.85;
                } else {
                    tx = z.homeX + Math.sin(t * 0.6) * H * 0.045;
                    ty = z.homeY + Math.cos(t * 0.47) * H * 0.065;
                }
                if (guest) {
                    // The host moves the zombies; only animate here.
                    tx = z.x; ty = z.y;
                }
                const dx = tx - z.x, dy = ty - z.y;
                const dist = Math.hypot(dx, dy) || 1;
                if (!guest) {
                    z.vx += (dx / dist) * steer * dt * 6;
                    z.vy += (dy / dist) * steer * dt * 5.4;
                    // Ease off near the target so they don't orbit it.
                    if (dist < 12) { z.vx *= 1 - Math.min(1, dt * 4); z.vy *= 1 - Math.min(1, dt * 4); }
                    const sp = Math.hypot(z.vx, z.vy);
                    if (sp > maxSpeed) { z.vx = z.vx / sp * maxSpeed; z.vy = z.vy / sp * maxSpeed; }
                    z.x += z.vx * dt;
                    z.y += z.vy * dt;
                    const minX = W * BUILD_MIN_X + z.radius, maxX = W * BUILD_MAX_X - z.radius;
                    if (z.x < minX) { z.x = minX; z.vx = Math.abs(z.vx); }
                    if (z.x > maxX) { z.x = maxX; z.vx = -Math.abs(z.vx); }
                    if (z.y < 14 + z.radius) { z.y = 14 + z.radius; z.vy = Math.abs(z.vy); }
                    if (z.y > H - 14 - z.radius) { z.y = H - 14 - z.radius; z.vy = -Math.abs(z.vy); }
                }

                const speed = Math.hypot(z.vx, z.vy);
                const speedRatio = Math.min(1, speed / Math.max(1, z.baseSpeed));
                z.frameT += dt * (4 + speedRatio * 7);
                const a = z.anim;
                if (Math.abs(z.vx) > 4) a.facingX = z.vx >= 0 ? 1 : -1;
                const near = ball ? Math.hypot(ball.pos.x - z.x, ball.pos.y - z.y) : Infinity;
                a.threat = Math.max(0, 1 - near / (z.typeKey === 'runner' ? 320 : 260));
                a.attackPulse = z.typeKey === 'spitter' ? Math.max(a.threat * 0.6, 1 - z.spitTimer / 1.1) : a.threat * 0.8;
                a.inhale = z.typeKey === 'spitter' ? Math.max(0, 1 - z.spitTimer / 1.25) : 0;

                z.spitAnim = Math.max(0, (z.spitAnim || 0) - dt);
                if (z.typeKey === 'spitter' && live && !guest) {
                    z.spitTimer -= dt;
                    if (z.spitTimer <= 0) {
                        z.spitTimer = SPIT_EVERY + Math.random() * 0.8;
                        this.spit(z);
                    }
                }
            }

            for (let i = this.spits.length - 1; i >= 0; i--) {
                const s = this.spits[i];
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.life -= dt;
                let gone = s.life <= 0 || s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40;
                if (!gone && !guest) {
                    const p = s.side === 'player' ? g.player : g.aiPaddle;
                    if (p && s.x + s.r > p.pos.x && s.x - s.r < p.pos.x + p.w && s.y + s.r > p.pos.y && s.y - s.r < p.pos.y + p.h) {
                        gone = true;
                        p.stun?.(SPIT_STUN);
                        g.particles?.spawnGodTierHit?.(s.x, s.y, '#8ed36b', 420);
                        g.audio?.hit?.();
                        const who = s.side === 'player' ? (g.isMultiplayer ? 'P1' : 'You') : (g.isMultiplayer ? 'P2' : 'AI');
                        g.showNotification?.('Slimed!', `${who} frozen for a moment`, '#8ed36b');
                    }
                }
                if (gone) this.spits.splice(i, 1);
            }
        }

        // Spit at the paddle on the zombie's half of the court.
        spit(z) {
            z.spitAnim = 0.22;
            const g = this.game;
            const side = z.x < g.width / 2 ? 'player' : 'ai';
            const p = side === 'player' ? g.player : g.aiPaddle;
            if (!p) return;
            const dx = p.pos.x + p.w / 2 - z.x, dy = p.pos.y + p.h / 2 - z.y;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 360 * (g.height / 720);
            this.spits.push({ x: z.x, y: z.y, vx: dx / len * speed, vy: dy / len * speed, r: Math.max(6, g.width * 0.007), life: 3.4, side });
            g.audio?.zombieSpit?.();
        }

        revive(z) {
            z.dead = false;
            z.hp = z.maxHp;
            z.x = z.homeX;
            z.y = z.homeY;
            z.vx = z.vy = 0;
            z.rise = 0;
            z.flash = 0;
            z.respawn = 0;
            this.game.particles?.spawnGodTierHit?.(z.x, z.y + z.radius * 0.6, '#6b5a3c', 260);
        }

        kill(z, owner) {
            const g = this.game;
            z.dead = true;
            z.respawn = RESPAWN;
            z.vx = z.vy = 0;
            g.particles?.spawnGodTierHit?.(z.x, z.y, z.type.eyeColor, 900);
            g.screenFlash = Math.max(g.screenFlash || 0, 0.12);
            g.audio?.zombieHit?.();
            if (!this.isGuest()) g.obstacleArcade?.addCoins?.(owner, COINS[z.typeKey] || 1, z.x, z.y - z.radius);
        }

        // Ball against zombies: bounce off, one hit point per hit. Star power
        // smashes straight through.
        collide(ball) {
            if (!ball || !this.zombies.length) return;
            const g = this.game;
            const guest = this.isGuest();
            const star = g.obstacleArcade?.isStarActive?.();
            for (let i = 0; i < this.zombies.length; i++) {
                const z = this.zombies[i];
                if (z.dead || z.rise < 0.6) continue;
                const dx = ball.pos.x - z.x, dy = ball.pos.y - z.y;
                const min = ball.r + z.radius * 0.82;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue;
                const owner = ball.vel.x >= 0 ? 'player' : 'ai';
                if (star) {
                    if (!guest) this.kill(z, owner);
                    continue;
                }
                const dist = Math.sqrt(d2) || 1;
                const nx = dx / dist, ny = dy / dist;
                const speed = Math.max(ball.minSpeed || 0, ball.getSpeed ? ball.getSpeed() : Math.hypot(ball.vel.x, ball.vel.y));
                ball.pos.x += nx * (min - dist);
                ball.pos.y += ny * (min - dist);
                ball.prev?.set?.(ball.pos.x, ball.pos.y);
                // Keep the ball travelling across the court, never straight up
                // and down, so a zombie can't trap a rally.
                let vx = nx, vy = ny;
                if (Math.abs(vx) < 0.35) { vx = (vx >= 0 ? 1 : -1) * 0.35; vy = Math.sign(vy || 1) * Math.sqrt(1 - vx * vx); }
                ball.vel.x = vx * speed;
                ball.vel.y = vy * speed + z.vy * 0.08;
                ball.triggerHitEffect?.(ball.pos.x, ball.pos.y);
                g.audio?.hit?.();
                if (z.hitCooldown > 0) break;
                z.hitCooldown = 0.18;
                z.flash = 1;
                g.screenShake = Math.max(g.screenShake || 0, 6);
                g.particles?.spawnGodTierHit?.(z.x, z.y, z.type.eyeColor, speed);
                if (!guest) {
                    z.hp -= 1;
                    if (z.hp <= 0) this.kill(z, owner);
                    else g.audio?.zombieHit?.();
                }
                break;
            }
        }

        render(ctx) {
            const g = this.game;
            for (let i = 0; i < this.zombies.length; i++) {
                const z = this.zombies[i];
                if (z.dead) {
                    // The ground stirs just before it rises again.
                    if (z.respawn < 1.6) this.renderGrave(ctx, z, 1 - z.respawn / 1.6);
                    continue;
                }
                if (z.rise < 1) {
                    const k = z.rise * z.rise * (3 - 2 * z.rise);
                    ctx.save();
                    ctx.globalAlpha = k;
                    ctx.translate(0, (1 - k) * z.radius * 0.9);
                    g.renderZombieEnemy(ctx, z);
                    ctx.restore();
                } else {
                    g.renderZombieEnemy(ctx, z);
                }
            }
            for (let i = 0; i < this.spits.length; i++) g.renderZombieSpit(ctx, this.spits[i]);
        }

        renderGrave(ctx, z, k) {
            const r = z.radius;
            ctx.save();
            ctx.translate(z.homeX, z.homeY + r * 0.7);
            ctx.globalAlpha = 0.25 + 0.55 * k;
            ctx.fillStyle = 'rgba(30, 22, 14, 0.75)';
            ctx.beginPath();
            ctx.ellipse(0, 0, r * (0.6 + 0.5 * k), r * (0.22 + 0.16 * k), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = z.type.eyeColor;
            ctx.lineWidth = Math.max(1, r * 0.06);
            ctx.globalAlpha = 0.2 + 0.5 * k * (0.6 + 0.4 * Math.sin(this.time * 14));
            ctx.beginPath();
            ctx.moveTo(-r * 0.4, 0); ctx.lineTo(-r * 0.1, -r * 0.08); ctx.lineTo(r * 0.12, r * 0.05); ctx.lineTo(r * 0.42, -r * 0.04);
            ctx.stroke();
            ctx.restore();
        }

        // Online: the host sends positions, hit points and spit.
        snapshot() {
            const r1 = (v) => Math.round(v * 10) / 10;
            return {
                z: this.zombies.map(z => [r1(z.x), r1(z.y), z.dead ? 0 : z.hp, r1(z.vx), r1(z.vy)]),
                s: this.spits.map(s => [r1(s.x), r1(s.y), r1(s.vx), r1(s.vy), s.side === 'player' ? 0 : 1]),
            };
        }

        applySnapshot(data) {
            if (!data || !Array.isArray(data.z) || data.z.length !== this.zombies.length) return;
            data.z.forEach((row, i) => {
                const z = this.zombies[i];
                const [x, y, hp, vx, vy] = row.map(Number);
                if (hp <= 0 && !z.dead) this.kill(z, 'player');
                else if (hp > 0 && z.dead) this.revive(z);
                if (Number.isFinite(x)) z.x = x;
                if (Number.isFinite(y)) z.y = y;
                if (Number.isFinite(vx)) z.vx = vx;
                if (Number.isFinite(vy)) z.vy = vy;
                if (hp > 0) z.hp = hp;
            });
            if (Array.isArray(data.s)) {
                const r = Math.max(6, this.game.width * 0.007);
                this.spits = data.s.map(([x, y, vx, vy, side]) => ({ x: +x, y: +y, vx: +vx, vy: +vy, r, life: 1, side: side ? 'ai' : 'player' }));
            }
        }
    }

    window.ForgeZombies = ForgeZombies;
})();
