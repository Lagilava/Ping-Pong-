// Zombie mode: the paddle's Undead Pull.
//
// Hold Space (or A on a gamepad, a second finger, or the right mouse button)
// and the paddle opens up and drags nearby zombies towards the barricade
// line. A zombie that reaches the line while it is being pulled is destroyed
// for points and costs no life. The reach is limited: less than half the
// court across, and only a band above and below the paddle.
//
// This file holds the rules (energy, range, pull force) and every visual of
// the ability that is drawn on the 2D canvas. The refraction and flowing
// light inside the pull field come from the post-process shader (PostFX
// setPullField), with a plain canvas version when that shader is off.
(function () {
    'use strict';

    const C = {
        RANGE: 0.44,          // reach in front of the paddle, fraction of court width (< 0.5)
        HALF_BAND: 0.28,      // reach above and below the paddle centre, fraction of court height
        DRAIN: 0.42,           // energy per second while pulling (2 s from full)
        REGEN: 0.45,           // energy per second while idle
        REGEN_DELAY: 0.35,    // seconds after letting go before it recharges
        MIN_START: 0.12,      // energy needed to start a pull
        PULL_SPEED: 320,      // px/s at 720p, close to the paddle
        TAG_TIME: 1.1,        // a zombie stays "pulled" this long after leaving the field
        KILL_SCORE: 0.75,      // share of the normal kill score for a barricade kill
        MASS: { shambler: 1, runner: 0.8, spitter: 0.9, tank: 0.62 },
    };

    const TAU = Math.PI * 2;
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    class ZombiePull {
        static C = C;

        constructor(game) {
            this.game = game;
            this.reset();
            this.touchId = null;
            this.mouseHeld = false;
            this.motes = [];
            for (let i = 0; i < 16; i++) this.motes.push({ u: Math.random(), v: (Math.random() - 0.5) * 2, s: 0.4 + Math.random() * 0.8, a: 0 });
            this.tethers = [];
            this.eaten = [];
        }

        reset() {
            this.energy = 1;
            this.active = false;
            this.ramp = 0;          // 0 closed .. 1 fully open (drives every visual)
            this.idle = 0;
            this.exhaust = 0;       // sputter after running dry
            this.gulp = 0;          // pulse when a zombie is devoured
            this.snap = 0;          // ring when the pull is released
            this.time = 0;
            this.beat = 0;
            this.spin = 0;
            this.sfxTimer = 0;
            this.rings = [];
            this.eaten = [];
            this.band = { x0: 0, y0: 0, range: 0, half: 0 };
        }

        // ── Input ───────────────────────────────────────────────────────────
        isHeld() {
            const g = this.game;
            if (this.mouseHeld || this.touchId !== null) return true;
            if (g.keys && g.keys[' ']) return true;
            const pad = g.padState && g.padState[0] && g.padState[0].pad;
            return !!(pad && pad.buttons && pad.buttons[0] && pad.buttons[0].pressed);
        }

        // ── Rules ───────────────────────────────────────────────────────────
        canPull() {
            const g = this.game, st = g.zombieState;
            return !!(g.isZombieWaveMode() && st && st.waveStarted && !(st.introTimer > 0) && !st.choicePending &&
                !(st.transitionTimer > 0) && !g.matchEnding && g.player && !g.player.laserStunned);
        }

        update(dt) {
            const g = this.game;
            this.time += dt;
            const can = this.canPull();
            const held = can && this.isHeld();

            if (!this.active && held && this.energy >= C.MIN_START && this.exhaust <= 0) {
                this.active = true;
                this.snap = 0;
                g.audio?.zombiePull?.('start');
            }
            if (this.active && (!held || this.energy <= 0)) {
                this.active = false;
                this.idle = 0;
                if (this.energy <= 0) { this.exhaust = 0.7; g.audio?.zombiePull?.('empty'); }
                else g.audio?.zombiePull?.('end');
                this.snap = 1;
                this.rings.push({ age: 0 });
            }

            if (this.active) {
                this.energy = Math.max(0, this.energy - C.DRAIN * dt);
                this.ramp = Math.min(1, this.ramp + dt / 0.22);
                this.sfxTimer -= dt;
                if (this.sfxTimer <= 0) { this.sfxTimer = 0.2; g.audio?.zombiePull?.('tick'); }
            } else {
                this.ramp = Math.max(0, this.ramp - dt / 0.18);
                this.idle += dt;
                if (this.idle > C.REGEN_DELAY) this.energy = Math.min(1, this.energy + C.REGEN * dt);
            }
            this.exhaust = Math.max(0, this.exhaust - dt);
            this.gulp = Math.max(0, this.gulp - dt * 3.2);
            this.snap = Math.max(0, this.snap - dt * 3.5);
            for (let i = this.rings.length - 1; i >= 0; i--) {
                this.rings[i].age += dt;
                if (this.rings[i].age > 0.5) this.rings.splice(i, 1);
            }
            this.beat += dt * (this.active ? 9 : 0);
            this.spin += dt * (1.5 + 5 * this.ramp);
            for (let i = this.eaten.length - 1; i >= 0; i--) {
                this.eaten[i].t += dt / 0.28;
                if (this.eaten[i].t >= 1) this.eaten.splice(i, 1);
            }

            // Band geometry (world px), tracking the paddle.
            const p = g.player;
            if (p) {
                const b = this.band;
                b.x0 = p.pos.x + p.w;
                b.y0 = p.pos.y + p.h / 2;
                b.range = g.width * C.RANGE;
                b.half = g.height * C.HALF_BAND;
            }
        }

        // Applies the pull to one zombie. Returns true when it was pulled this frame.
        affect(zombie, dt, slowMul = 1) {
            zombie.pullTag = Math.max(0, (zombie.pullTag || 0) - dt);
            zombie.pullAmt = Math.max(0, (zombie.pullAmt || 0) - dt * 4);
            if (!this.active || this.ramp < 0.45) return false;

            const b = this.band;
            const dx = zombie.x - zombie.radius * 0.5 - b.x0;
            const dy = zombie.y - b.y0;
            if (dx < 0 || dx > b.range || Math.abs(dy) > b.half) return false;

            const g = this.game;
            const scale = g.height / 720;
            const near = 1 - dx / b.range;
            const mass = C.MASS[zombie.typeKey] || 1;
            const speed = C.PULL_SPEED * scale * (0.45 + 0.55 * near) * mass;
            // Steer hard towards the line, and gently towards the paddle's height.
            const lineX = g.getZombieBarricadeX();
            zombie.vx += (-speed - zombie.vx) * Math.min(1, dt * 7);
            zombie.vy += (-dy * 1.1 - zombie.vy) * Math.min(1, dt * 3);
            zombie.homeX = zombie.x;
            zombie.homeY = zombie.y;
            zombie.pullTag = C.TAG_TIME;
            zombie.pullAmt = Math.min(1, (zombie.pullAmt || 0) + dt * 9);
            zombie._lineX = lineX;
            return true;
        }

        // A pulled zombie reached the line: destroyed for points, no life lost.
        devour(zombie) {
            const g = this.game, st = g.zombieState;
            zombie.dead = true;
            // Keep a copy that spirals into the maw for a moment.
            if (this.eaten.length < 8) this.eaten.push({ z: Object.assign({}, zombie), t: 0, x: zombie.x, y: zombie.y });
            st.kills++;
            st.totalKills++;
            g.addZombieScore(Math.round(zombie.type.score * C.KILL_SCORE));
            g.particles.spawnGodTierHit(zombie.x, zombie.y, '#9dff6a', 900);
            g.audio?.zombiePull?.('devour');
            g.screenShake = Math.max(g.screenShake || 0, 4);
            this.gulp = 1;
            this.rings.push({ age: 0 });
        }

        // World-space data for the shader (null when idle).
        getFieldState() {
            if (this.ramp <= 0.01 && this.snap <= 0.01) return null;
            const b = this.band;
            return { x: b.x0, y: b.y0, range: b.range, half: b.half, k: this.ramp, snap: this.snap, exhaust: this.exhaust > 0 ? 1 : 0 };
        }

        // ── Drawing ─────────────────────────────────────────────────────────
        // Field outline and flowing marks. Drawn under the zombies. With the
        // post shader on this is only the faint outline; without it the flow
        // is drawn here too.
        renderField(ctx) {
            if (this.ramp <= 0.01) return;
            const g = this.game, b = this.band, r = this.ramp;
            const shader = !!(g.postFx && g.postFx.active);
            const t = this.time;
            ctx.save();
            ctx.lineWidth = 1.5;
            ctx.setLineDash([10, 9]);
            ctx.lineDashOffset = -t * 40;
            ctx.strokeStyle = `rgba(157,255,106,${0.28 * r})`;
            const top = b.y0 - b.half, bot = b.y0 + b.half, end = b.x0 + b.range;
            ctx.beginPath();
            ctx.moveTo(b.x0, top); ctx.lineTo(end, top);
            ctx.moveTo(b.x0, bot); ctx.lineTo(end, bot);
            ctx.stroke();
            ctx.setLineDash([]);
            // Far edge: a bracket so the reach is readable.
            ctx.strokeStyle = `rgba(190,140,255,${0.4 * r})`;
            ctx.beginPath();
            ctx.moveTo(end - 12, top); ctx.lineTo(end, top); ctx.lineTo(end, bot); ctx.lineTo(end - 12, bot);
            ctx.stroke();

            if (!shader) {
                // Fallback flow: chevrons sliding towards the paddle.
                ctx.lineWidth = 2;
                for (let i = 0; i < 14; i++) {
                    const u = ((i * 0.137 + t * (0.5 + (i % 3) * 0.15)) % 1);
                    const x = b.x0 + b.range * (1 - u);
                    const y = b.y0 + (((i * 0.61) % 1) - 0.5) * 2 * b.half * 0.9;
                    ctx.strokeStyle = `rgba(157,255,106,${0.5 * r * (1 - u)})`;
                    ctx.beginPath();
                    ctx.moveTo(x + 10, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + 10, y + 6);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        // Tendrils from the paddle to every zombie it is dragging.
        renderTethers(ctx, zombies) {
            if (this.ramp <= 0.3) return;
            const b = this.band, t = this.time, r = this.ramp;
            ctx.save();
            ctx.lineCap = 'round';
            for (let i = 0; i < zombies.length; i++) {
                const z = zombies[i];
                if (z.dead || !(z.pullAmt > 0.05)) continue;
                const sx = b.x0 + 2, sy = b.y0 + (z.y - b.y0) * 0.25;
                const ex = z.x - z.radius * 0.7, ey = z.y;
                const mx = (sx + ex) / 2, my = (sy + ey) / 2 + Math.sin(t * 7 + i * 1.7) * 18 * r;
                const a = Math.min(1, z.pullAmt) * r;
                ctx.strokeStyle = `rgba(120,255,140,${0.16 * a})`;
                ctx.lineWidth = 9;
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
                ctx.strokeStyle = `rgba(214,255,200,${0.75 * a})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
                // Beads of light running down the tether into the paddle.
                ctx.fillStyle = `rgba(240,255,225,${0.95 * a})`;
                for (let k = 0; k < 4; k++) {
                    const u = 1 - ((t * 1.6 + k / 4 + i * 0.13) % 1);
                    const iu = 1 - u;
                    const bx = iu * iu * sx + 2 * iu * u * mx + u * u * ex;
                    const by = iu * iu * sy + 2 * iu * u * my + u * u * ey;
                    ctx.beginPath(); ctx.arc(bx, by, 2.6 * (0.4 + u), 0, TAU); ctx.fill();
                }
            }
            ctx.restore();
            // Zombies being swallowed: shrink and spiral into the maw.
            const g = this.game;
            for (let i = 0; i < this.eaten.length; i++) {
                const e = this.eaten[i];
                const k = e.t, ease = k * k;
                const tx = b.x0 + 4, ty = b.y0;
                ctx.save();
                ctx.translate(tx + (e.x - tx) * (1 - ease), ty + (e.y - ty) * (1 - ease));
                ctx.rotate(k * 7);
                const sc = Math.max(0.05, 1 - ease * 0.95);
                ctx.scale(sc, sc);
                ctx.globalAlpha = 1 - k * 0.4;
                e.z.x = 0; e.z.y = 0; e.z.vx = 0; e.z.vy = 0; e.z.pullAmt = 0; e.z.flash = 0.6 * (1 - k);
                g.renderZombieEnemy(ctx, e.z);
                ctx.restore();
            }
        }

        // The paddle's body transform: it breathes, braces before the pull and
        // gulps when it eats a zombie. Wrap Paddle.render with begin/end.
        beginPaddle(ctx) {
            const p = this.game.player;
            const r = this.ramp;
            if (r <= 0.01 && this.gulp <= 0.01 && this.snap <= 0.01) { this._wrapped = false; return; }
            this._wrapped = true;
            const t = this.time;
            // lub-dub heartbeat while the pull is open
            const hb = r * (Math.max(0, Math.sin(this.beat)) ** 6 * 0.07 + Math.max(0, Math.sin(this.beat - 0.9)) ** 6 * 0.04);
            const brace = r < 1 ? Math.sin(Math.min(1, r / 0.55) * Math.PI) * 0.1 : 0;   // squash, then open
            const sx = 1 + hb + this.gulp * 0.25 + r * 0.14 - brace - this.snap * 0.1;
            const sy = 1 - hb * 0.4 + r * 0.03 + brace * 0.4 + this.gulp * 0.04;
            const shake = this.exhaust > 0 ? Math.sin(t * 90) * 1.6 : 0;
            ctx.save();
            ctx.translate(p.pos.x + p.w * 0.35 + shake, p.pos.y + p.h / 2);
            ctx.scale(sx, sy);
            ctx.translate(-(p.pos.x + p.w * 0.35), -(p.pos.y + p.h / 2));
        }

        endPaddle(ctx) {
            if (this._wrapped) { ctx.restore(); this._wrapped = false; }
        }

        // Everything that makes the paddle look alive. Drawn after the paddle.
        renderPaddle(ctx) {
            const g = this.game, p = g.player;
            if (!p) return;
            const r = this.ramp, t = this.time;
            const x = p.pos.x, y = p.pos.y, w = p.w, h = p.h;
            const front = x + w, cy = y + h / 2;

            // Energy bar on the back edge of the paddle: always shown below full.
            if (this.energy < 0.995 || this.active) {
                const bx = x - 8, bw = 4, bh = h;
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.fillRect(bx, y, bw, bh);
                const low = this.energy < C.MIN_START;
                ctx.fillStyle = low ? '#ff6b6b' : (this.active ? '#d6ffb0' : '#9dff6a');
                const fh = bh * this.energy;
                ctx.fillRect(bx, y + bh - fh, bw, fh);
                ctx.restore();
            }

            if (r <= 0.01 && this.gulp <= 0.01 && this.snap <= 0.01) return;

            ctx.save();
            const flicker = this.exhaust > 0 ? (Math.sin(t * 70) > 0 ? 0.35 : 1) : 1;

            // Aura behind and around the paddle.
            ctx.globalAlpha = (0.55 * r + this.gulp * 0.4) * flicker;
            const aura = ctx.createRadialGradient(front, cy, 2, front, cy, h * 0.95);
            aura.addColorStop(0, 'rgba(160,255,120,0.55)');
            aura.addColorStop(0.5, 'rgba(120,80,255,0.2)');
            aura.addColorStop(1, 'rgba(120,80,255,0)');
            ctx.fillStyle = aura;
            ctx.fillRect(front - h, cy - h, h * 2, h * 2);
            ctx.globalAlpha = 1;

            // Veins: light pulses running up and down the paddle.
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.setLineDash([h * 0.07, h * 0.11]);
            for (let i = 0; i < 3; i++) {
                const vx = x + w * (0.22 + i * 0.28);
                ctx.lineDashOffset = -t * (60 + i * 25) * (i % 2 ? -1 : 1);
                ctx.strokeStyle = `rgba(190,255,150,${0.75 * r * flicker})`;
                ctx.beginPath(); ctx.moveTo(vx, y + 3); ctx.lineTo(vx, y + h - 3); ctx.stroke();
            }
            ctx.setLineDash([]);

            // Tendrils: three thin feelers waving out of the maw.
            for (let i = 0; i < 5; i++) {
                const dir = (i - 2) * 0.75;
                const len = h * (0.6 + 0.18 * (i % 2)) * r;
                const sway = Math.sin(t * 5 + i * 2.1) * h * 0.1;
                ctx.strokeStyle = `rgba(214,255,200,${0.7 * r * flicker})`;
                ctx.lineWidth = 2.2 - Math.abs(dir) * 0.5;
                ctx.beginPath();
                ctx.moveTo(front, cy + dir * h * 0.12);
                ctx.bezierCurveTo(front + len * 0.35, cy + dir * h * 0.2 + sway, front + len * 0.7, cy + dir * h * 0.3 - sway, front + len, cy + dir * h * 0.38 + sway * 0.6);
                ctx.stroke();
                // glowing tip
                ctx.fillStyle = `rgba(230,255,200,${0.9 * r * flicker})`;
                ctx.beginPath(); ctx.arc(front + len, cy + dir * h * 0.38 + sway * 0.6, 2.4, 0, TAU); ctx.fill();
            }

            // Rune ring turning around the maw.
            if (r > 0.05) {
                const rr = h * 0.34 * (0.6 + 0.4 * r);
                ctx.strokeStyle = `rgba(190,140,255,${0.8 * r * flicker})`;
                ctx.lineWidth = 2;
                ctx.setLineDash([h * 0.05, h * 0.045]);
                ctx.lineDashOffset = -this.spin * 14;
                ctx.beginPath(); ctx.ellipse(front, cy, rr * 0.55, rr, 0, 0, TAU); ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = `rgba(157,255,106,${0.7 * r * flicker})`;
                for (let k = 0; k < 4; k++) {
                    const a = this.spin + k * Math.PI / 2;
                    const px = front + Math.cos(a) * rr * 0.55, py = cy + Math.sin(a) * rr;
                    ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3, py); ctx.closePath(); ctx.stroke();
                }
            }

            // The maw: a slit down the front edge that opens and has teeth.
            const open = r * (0.85 + 0.15 * Math.sin(t * 13)) + this.gulp * 0.25;
            const mh = h * 0.5 * Math.min(1.2, open), mw = (w * 0.5 + 5) * Math.min(1.2, open);
            if (mh > 1) {
                const grad = ctx.createRadialGradient(front, cy, 1, front, cy, mw * 1.8);
                grad.addColorStop(0, 'rgba(8,0,18,0.95)');
                grad.addColorStop(0.55, 'rgba(60,20,120,0.85)');
                grad.addColorStop(1, 'rgba(157,255,106,0.9)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.ellipse(front, cy, mw, mh, 0, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = `rgba(230,255,210,${0.9 * flicker})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                // teeth
                ctx.fillStyle = `rgba(240,250,225,${0.95 * flicker})`;
                const teeth = 5;
                for (let k = 0; k < teeth; k++) {
                    const a = -Math.PI * 0.42 + (k / (teeth - 1)) * Math.PI * 0.84;
                    for (const side of [-1, 1]) {
                        const px = front + Math.sin(a) * mw * 0.9;
                        const py = cy + side * Math.cos(a) * mh * 0.92;
                        ctx.beginPath();
                        ctx.moveTo(px - 2.2, py);
                        ctx.lineTo(px + 2.2, py);
                        ctx.lineTo(px, py - side * Math.min(9, mh * 0.2));
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            }

            // Motes drifting out of the field and into the maw.
            if (r > 0.3) {
                const b = this.band;
                ctx.fillStyle = '#d8ffbf';
                for (let i = 0; i < this.motes.length; i++) {
                    const m = this.motes[i];
                    m.u -= (0.25 + 0.9 * (1 - m.u)) * m.s * (1 / 60);
                    if (m.u <= 0.02) { m.u = 0.5 + Math.random() * 0.5; m.v = (Math.random() - 0.5) * 2; }
                    const mx = b.x0 + b.range * m.u * 0.9;
                    const my = b.y0 + m.v * b.half * m.u * 0.9;
                    ctx.globalAlpha = Math.min(1, m.u * 3) * 0.8 * r;
                    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
                }
                ctx.globalAlpha = 1;
            }

            // Rings when the pull ends or a zombie is eaten.
            for (let i = 0; i < this.rings.length; i++) {
                const k = this.rings[i].age / 0.5;
                ctx.strokeStyle = `rgba(190,255,150,${0.7 * (1 - k)})`;
                ctx.lineWidth = 3 * (1 - k) + 1;
                ctx.beginPath();
                ctx.arc(front, cy, h * 0.15 + k * h * 0.7, 0, TAU);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    window.ZombiePull = ZombiePull;
})();
