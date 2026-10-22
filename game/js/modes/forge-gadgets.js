// Forge gadgets: deflectors, laser gates, crystal blocks and portal pairs
// placed by hand in a Custom (Forge) arena.
//   Deflector  an angled slab that turns the ball through a right angle.
//   Laser gate two posts with a beam that is solid while lit. It runs on a
//              fixed cycle (lit, flicker warning, off, charging) so a rally
//              can be timed through it. Mirrored lasers share a phase.
//   Crystal    takes three hits, cracking on each, then shatters and opens
//              the way. It grows back after a while.
//   Portal     portals link in pairs in the order they were placed (1st with
//              2nd, 3rd with 4th). The ball keeps its speed and heading and
//              comes out of the partner. A portal on its own does nothing.
// Everything is baked in ForgeLook; a frame is drawImage calls plus three
// strokes per lit beam. The host owns crystal hit points and the laser
// clock online; the guest runs the same collisions so the ball stays smooth.
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const LASER = { period: 4.4, lit: 2.4, warn: 2.9, charge: 3.9 };
    const CRYSTAL_HP = 3;
    const CRYSTAL_RESPAWN = 9;
    const SIM_DT = 1 / 120;

    const laserPhase = (l, time) => ((time + l.offset) % LASER.period + LASER.period) % LASER.period;
    const laserSolid = (l, time) => laserPhase(l, time) < LASER.warn;

    class ForgeGadgets {
        constructor(game) {
            this.game = game;
            this.clear();
        }

        clear() {
            this.deflectors = [];
            this.lasers = [];
            this.crystals = [];
            this.portals = [];
            this.shards = [];
            this.bursts = [];
            this.time = 0;
        }

        get count() {
            return this.deflectors.length + this.lasers.length + this.crystals.length + this.portals.length;
        }

        isGuest() { return this.game.net?.role === 'guest'; }

        // items: [{ kind, x, y, s, rot }] with x, y in court pixels and s the
        // Forge size (a fraction of court height).
        build(items) {
            this.clear();
            const g = this.game;
            const W = g.width, H = g.height;
            const portals = [];
            for (const it of items || []) {
                if (it.kind === 'deflector') {
                    const a = it.rot ? -Math.PI / 4 : Math.PI / 4;
                    this.deflectors.push({ x: it.x, y: it.y, len: it.s * H, th: Math.max(8, 0.026 * H), angle: a, ux: Math.cos(a), uy: Math.sin(a), flash: 0 });
                } else if (it.kind === 'laser') {
                    const len = it.s * H, vertical = !it.rot;
                    const ux = vertical ? 0 : 1, uy = vertical ? 1 : 0;
                    // Mirrored twins (same row, opposite sides) get the same phase.
                    const offset = ((Math.abs(it.x / W - 0.5) * 3.7 + (it.y / H) * 1.9) % 1) * LASER.period;
                    this.lasers.push({
                        x1: it.x - ux * len / 2, y1: it.y - uy * len / 2, x2: it.x + ux * len / 2, y2: it.y + uy * len / 2,
                        ux, uy, len, pr: 0.022 * H, bt: Math.max(2, 0.006 * H), th: Math.max(2, 0.008 * H), offset, flash: 0, wasSolid: true,
                    });
                } else if (it.kind === 'crystal') {
                    this.crystals.push({ x: it.x, y: it.y, S: 0.062 * H, hp: CRYSTAL_HP, respawn: 0, grow: 1, flash: 0 });
                } else if (it.kind === 'portal') {
                    portals.push({ x: it.x, y: it.y, R: 0.05 * H, pair: -1, partner: -1, flash: 0, spin: 0 });
                }
            }
            // Pair in placement order; an odd one out stays idle.
            for (let i = 0; i + 1 < portals.length; i += 2) {
                portals[i].pair = portals[i + 1].pair = i / 2;
                portals[i].partner = i + 1;
                portals[i + 1].partner = i;
                portals[i + 1].spin = 1;
            }
            this.portals = portals;
            // Bake every sprite up front so the first hit never hitches.
            const L = window.ForgeLook;
            if (L) {
                this.deflectors.forEach(d => { L.deflector(d.len, d.th, false); L.deflector(d.len, d.th, true); });
                this.lasers.forEach(l => { L.emitter(l.pr, false); L.emitter(l.pr, true); });
                this.crystals.forEach(c => { for (let k = 0; k < CRYSTAL_HP; k++) { L.crystal(c.S, k, false); L.crystal(c.S, k, true); } });
                this.portals.forEach(p => { L.portalRing(p.R, p.pair); L.portalSwirl(p.R, p.pair); });
            }
        }

        // The serve sits still in the middle; nothing acts on it until it flies.
        serving() {
            const g = this.game;
            return g.serveHold > 0 && !!g.pendingServe;
        }

        update(dt) {
            if (!this.count && !this.shards.length && !this.bursts.length) return;
            const g = this.game;
            this.time += dt;
            const guest = this.isGuest();
            for (const d of this.deflectors) d.flash = Math.max(0, d.flash - dt * 5);
            for (const p of this.portals) p.flash = Math.max(0, p.flash - dt * 3.5);
            for (const l of this.lasers) {
                l.flash = Math.max(0, l.flash - dt * 6);
                const solid = laserSolid(l, this.time);
                // A crackle as each beam comes back on, quiet enough to stack.
                if (solid && !l.wasSolid) g.audio?.createOscillatorSound?.(1500, 'sawtooth', 0.05, 0.035);
                l.wasSolid = solid;
            }
            const ball = g.ball;
            for (const c of this.crystals) {
                c.flash = Math.max(0, c.flash - dt * 6);
                if (c.hp > 0) {
                    c.grow = Math.min(1, c.grow + dt / 0.45);
                    continue;
                }
                if (guest) continue;
                c.respawn -= dt;
                // Wait for the ball to be clear before growing back.
                const clear = !ball || Math.hypot(ball.pos.x - c.x, ball.pos.y - c.y) > c.S * 1.4 + ball.r;
                if (c.respawn <= 0 && clear) this.regrow(c);
            }
            let w = 0;
            for (let i = 0; i < this.shards.length; i++) {
                const s = this.shards[i];
                s.life -= dt;
                if (s.life <= 0) continue;
                const drag = Math.pow(0.08, dt);
                s.vx *= drag; s.vy *= drag;
                s.vy += 260 * dt;
                s.x += s.vx * dt; s.y += s.vy * dt;
                s.a += s.va * dt;
                this.shards[w++] = s;
            }
            this.shards.length = w;
            w = 0;
            for (let i = 0; i < this.bursts.length; i++) {
                const b = this.bursts[i];
                b.t += dt;
                if (b.t < b.life) this.bursts[w++] = b;
            }
            this.bursts.length = w;
            if (ball && ball._forgePortalLock >= 0) this.releaseLock(ball);
        }

        regrow(c) {
            c.hp = CRYSTAL_HP;
            c.grow = 0;
            c.flash = 0.8;
            this.game.audio?.createOscillatorSound?.(1180, 'sine', 0.12, 0.05);
        }

        // A ball that came out of a portal ignores it until it has left.
        releaseLock(b, lockKey = '_forgePortalLock') {
            const p = this.portals[b[lockKey]];
            if (!p || Math.hypot(b.pos.x - p.x, b.pos.y - p.y) > p.R * 0.55 + b.r) b[lockKey] = -1;
        }

        // ── collisions ──────────────────────────────────────────────────
        // Ball against every gadget. `sim` runs the same rules on a scratch
        // ball for the AI's prediction: no effects and no state changes.
        collide(ball) {
            if (!ball || !this.count) return;
            if (this.serving()) { ball._forgePortalLock = -1; return; }
            this.step(ball, false, this.time);
        }

        step(b, sim, time) {
            const g = this.game;
            const star = !!g.obstacleArcade?.isStarActive?.();
            let changed = this.portalStep(b, sim);
            for (let i = 0; i < this.crystals.length; i++) {
                if (this.crystalStep(b, this.crystals[i], sim, star)) { changed = true; break; }
            }
            if (star) return changed;
            for (let i = 0; i < this.deflectors.length; i++) {
                if (this.deflectorStep(b, this.deflectors[i], sim)) { changed = true; break; }
            }
            for (let i = 0; i < this.lasers.length; i++) {
                if (this.laserStep(b, this.lasers[i], sim, time)) { changed = true; break; }
            }
            return changed;
        }

        portalStep(b, sim) {
            const lockKey = sim ? '_simLock' : '_forgePortalLock';
            if (!(b[lockKey] >= -1)) b[lockKey] = -1;
            if (b[lockKey] >= 0) this.releaseLock(b, lockKey);
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                if (p.partner < 0 || b[lockKey] === i) continue;
                const dx = b.pos.x - p.x, dy = b.pos.y - p.y;
                const reach = p.R * 0.55;
                if (dx * dx + dy * dy > reach * reach) continue;
                const out = this.portals[p.partner];
                // Come out at the same offset from the partner's centre, so a
                // grazing entry is a grazing exit.
                b.pos.x = out.x + dx;
                b.pos.y = out.y + dy;
                b[lockKey] = p.partner;
                if (!sim) this.onWarp(b, p, out);
                return true;
            }
            return false;
        }

        onWarp(b, from, to) {
            const g = this.game;
            b.prev?.set?.(b.pos.x, b.pos.y);
            b.trailCount = 0;
            from.flash = to.flash = 1;
            const color = window.ForgeLook?.PORTAL_COLORS?.[from.pair % 2]?.rim || '#ffffff';
            this.bursts.push({ x: from.x, y: from.y, R: from.R, t: 0, life: 0.45, color, implode: true });
            this.bursts.push({ x: to.x, y: to.y, R: to.R, t: 0, life: 0.5, color, implode: false });
            if (this.bursts.length > 8) this.bursts.splice(0, this.bursts.length - 8);
            g.audio?.createOscillatorSound?.(440, 'sine', 0.14, 0.12);
            g.audio?.createOscillatorSound?.(1320, 'triangle', 0.1, 0.06);
            g.postFx?.ripple?.(to.x, to.y, 0.35);
            g.particles?.spawnGodTierHit?.(to.x, to.y, color, 520);
        }

        crystalStep(b, c, sim, star) {
            if (c.hp <= 0 || c.grow < 0.5) return false;
            const h = c.S / 2;
            const cx = Math.max(c.x - h, Math.min(b.pos.x, c.x + h));
            const cy = Math.max(c.y - h, Math.min(b.pos.y, c.y + h));
            let dx = b.pos.x - cx, dy = b.pos.y - cy;
            if (dx * dx + dy * dy > b.r * b.r) return false;
            if (star) {
                // Star power smashes straight through.
                if (!sim && !this.isGuest()) this.shatter(c, b);
                return false;
            }
            let nx, ny;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
                nx = dx / dist; ny = dy / dist;
                b.pos.x = cx + nx * (b.r + 0.5);
                b.pos.y = cy + ny * (b.r + 0.5);
            } else {
                // Centre inside the gem: leave by the nearest face.
                dx = b.pos.x - c.x; dy = b.pos.y - c.y;
                if (Math.abs(dx) > Math.abs(dy)) { nx = Math.sign(dx) || 1; ny = 0; b.pos.x = c.x + nx * (h + b.r + 0.5); } else { nx = 0; ny = Math.sign(dy) || 1; b.pos.y = c.y + ny * (h + b.r + 0.5); }
            }
            const dot = b.vel.x * nx + b.vel.y * ny;
            if (dot < 0) { b.vel.x -= 2 * dot * nx; b.vel.y -= 2 * dot * ny; }
            if (sim) return true;
            this.onSolidHit(b, c.x + nx * h, c.y + ny * h, 'crystal');
            c.flash = 1;
            if (!this.isGuest()) {
                c.hp -= 1;
                if (c.hp <= 0) this.shatter(c, b);
                else this.game.audio?.createOscillatorSound?.(1900 + (CRYSTAL_HP - c.hp) * 260, 'triangle', 0.07, 0.07);
            }
            return true;
        }

        shatter(c, b) {
            const g = this.game;
            c.hp = 0;
            c.respawn = CRYSTAL_RESPAWN;
            c.flash = 0;
            const vx = b ? b.vel.x * 0.25 : 0, vy = b ? b.vel.y * 0.25 : 0;
            const n = 14;
            if (this.shards.length > 42) this.shards.splice(0, this.shards.length - 28);
            for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + Math.random() * 0.4;
                const v = 120 + Math.random() * 260;
                this.shards.push({
                    x: c.x + Math.cos(a) * c.S * 0.2, y: c.y + Math.sin(a) * c.S * 0.2,
                    vx: Math.cos(a) * v + vx, vy: Math.sin(a) * v + vy,
                    a: Math.random() * TAU, va: (Math.random() - 0.5) * 18,
                    size: c.S * (0.12 + Math.random() * 0.16), life: 0.55 + Math.random() * 0.35, max: 0.9,
                    light: i % 3 === 0,
                });
            }
            g.audio?.createOscillatorSound?.(2400, 'triangle', 0.09, 0.09);
            g.audio?.createOscillatorSound?.(3100, 'sine', 0.16, 0.06);
            g.audio?.createOscillatorSound?.(220, 'square', 0.06, 0.05);
            g.screenShake = Math.max(g.screenShake || 0, 5);
            g.postFx?.ripple?.(c.x, c.y, 0.3);
        }

        deflectorStep(b, d, sim) {
            const dx = b.pos.x - d.x, dy = b.pos.y - d.y;
            const lx = dx * d.ux + dy * d.uy;
            const ly = -dx * d.uy + dy * d.ux;
            const hw = d.len / 2 + b.r, hh = d.th / 2 + b.r;
            if (Math.abs(lx) > hw || Math.abs(ly) > hh) return false;
            const ox = hw - Math.abs(lx), oy = hh - Math.abs(ly);
            let nx, ny, push;
            if (oy <= ox) {
                const s = ly >= 0 ? 1 : -1;
                nx = -d.uy * s; ny = d.ux * s; push = oy;
            } else {
                const s = lx >= 0 ? 1 : -1;
                nx = d.ux * s; ny = d.uy * s; push = ox;
            }
            const dot = b.vel.x * nx + b.vel.y * ny;
            if (dot < 0) {
                b.vel.x -= 2 * dot * nx;
                b.vel.y -= 2 * dot * ny;
            }
            b.pos.x += nx * (push + 0.5);
            b.pos.y += ny * (push + 0.5);
            if (sim) return true;
            const speed = Math.hypot(b.vel.x, b.vel.y);
            const cap = b.maxSpeed || speed;
            const k = Math.min(cap, speed * 1.02) / Math.max(1e-3, speed);
            b.vel.x *= k; b.vel.y *= k;
            d.flash = 1;
            this.onSolidHit(b, b.pos.x - nx * b.r, b.pos.y - ny * b.r, 'deflector');
            return true;
        }

        laserStep(b, l, sim, time) {
            // Posts are always solid.
            for (const end of [0, 1]) {
                const px = end ? l.x2 : l.x1, py = end ? l.y2 : l.y1;
                const dx = b.pos.x - px, dy = b.pos.y - py;
                const min = l.pr + b.r;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue;
                const dist = Math.sqrt(d2) || 1;
                const nx = d2 ? dx / dist : -l.ux * (end ? -1 : 1), ny = d2 ? dy / dist : -l.uy * (end ? -1 : 1);
                b.pos.x = px + nx * (min + 0.5);
                b.pos.y = py + ny * (min + 0.5);
                const dot = b.vel.x * nx + b.vel.y * ny;
                if (dot < 0) { b.vel.x -= 2 * dot * nx; b.vel.y -= 2 * dot * ny; }
                if (!sim) this.onSolidHit(b, px + nx * l.pr, py + ny * l.pr, 'post');
                return true;
            }
            if (!laserSolid(l, time)) return false;
            // Beam: a thin capsule between the posts, with a swept check so a
            // fast ball can't slip through between two steps.
            const nx0 = -l.uy, ny0 = l.ux;
            const along = (b.pos.x - l.x1) * l.ux + (b.pos.y - l.y1) * l.uy;
            const side = (b.pos.x - l.x1) * nx0 + (b.pos.y - l.y1) * ny0;
            const min = l.bt + b.r;
            let s = 0;
            if (along > 0 && along < l.len && Math.abs(side) < min) {
                s = side >= 0 ? 1 : -1;
                const prevSide = b.prev ? (b.prev.x - l.x1) * nx0 + (b.prev.y - l.y1) * ny0 : side;
                if (Math.abs(prevSide) >= min * 0.5) s = prevSide >= 0 ? 1 : -1;
            } else if (b.prev && !sim) {
                const prevSide = (b.prev.x - l.x1) * nx0 + (b.prev.y - l.y1) * ny0;
                if (Math.sign(prevSide) !== Math.sign(side) && prevSide !== 0) {
                    const t = prevSide / (prevSide - side);
                    const cx = b.prev.x + (b.pos.x - b.prev.x) * t, cy = b.prev.y + (b.pos.y - b.prev.y) * t;
                    const a = (cx - l.x1) * l.ux + (cy - l.y1) * l.uy;
                    if (a > 0 && a < l.len) s = prevSide >= 0 ? 1 : -1;
                }
            }
            if (!s) return false;
            const nx = nx0 * s, ny = ny0 * s;
            const a = Math.max(0, Math.min(l.len, along));
            b.pos.x = l.x1 + l.ux * a + nx * (min + 0.5);
            b.pos.y = l.y1 + l.uy * a + ny * (min + 0.5);
            const dot = b.vel.x * nx + b.vel.y * ny;
            if (dot < 0) { b.vel.x -= 2 * dot * nx; b.vel.y -= 2 * dot * ny; }
            if (sim) return true;
            l.flash = 1;
            this.onSolidHit(b, b.pos.x - nx * b.r, b.pos.y - ny * b.r, 'laser');
            return true;
        }

        onSolidHit(b, x, y, kind) {
            const g = this.game;
            b.prev?.set?.(b.pos.x, b.pos.y);
            b.triggerHitEffect?.(x, y);
            const impact = Math.max(0, Math.min(1, Math.hypot(b.vel.x, b.vel.y) / (b.maxSpeed || 1400)));
            if (kind === 'laser') {
                g.audio?.createOscillatorSound?.(980, 'sawtooth', 0.06, 0.08 + impact * 0.06);
                g.particles?.spawnGodTierHit?.(x, y, '#ff3a5c', 300 + impact * 400);
            } else if (kind === 'crystal') {
                g.particles?.spawnGodTierHit?.(x, y, '#b48cff', 260 + impact * 300);
            } else {
                g.audio?.hit?.(impact, g.panFor?.(x));
                g.particles?.spawnGodTierHit?.(x, y, kind === 'deflector' ? '#ff4fd8' : '#ff5a78', 240 + impact * 360);
            }
            g.screenShake = Math.max(g.screenShake || 0, 2 + impact * 4);
        }

        // ── AI ──────────────────────────────────────────────────────────
        // Where the ball will cross x = faceX, following it through portals
        // and off deflectors, lit beams and crystals. Straight-line marching
        // finds the gadget contacts; the last leg goes to the real physics
        // predictor so spin still counts. Returns null with no gadgets.
        predictY(ball, faceX, maxSteps, H) {
            if (!this.count || !ball || typeof PhysicsCore === 'undefined') return null;
            const sim = {
                pos: { x: ball.pos.x, y: ball.pos.y }, vel: { x: ball.vel.x, y: ball.vel.y },
                r: ball.r, maxSpeed: ball.maxSpeed, minSpeed: ball.minSpeed, spin: ball.spin || 0,
                _simLock: ball._forgePortalLock >= 0 ? ball._forgePortalLock : -1,
            };
            let start = { pos: { ...sim.pos }, vel: { ...sim.vel }, spin: sim.spin, r: sim.r, maxSpeed: sim.maxSpeed, minSpeed: sim.minSpeed };
            let left = maxSteps, startSteps = maxSteps;
            let t = this.time;
            const dir = Math.sign(faceX - ball.pos.x);
            for (let hops = 0; left > 0 && hops < 4;) {
                left--;
                t += SIM_DT;
                sim.pos.x += sim.vel.x * SIM_DT;
                sim.pos.y += sim.vel.y * SIM_DT;
                if (sim.pos.y < sim.r) { sim.pos.y = sim.r; sim.vel.y = Math.abs(sim.vel.y); }
                if (sim.pos.y > H - sim.r) { sim.pos.y = H - sim.r; sim.vel.y = -Math.abs(sim.vel.y); }
                if ((sim.vel.x > 0 && sim.pos.x >= faceX) || (sim.vel.x < 0 && sim.pos.x <= faceX)) break;
                if (this.step(sim, true, t)) {
                    hops++;
                    // Heading away from us now: nothing more to read.
                    if (Math.sign(sim.vel.x) !== dir) return null;
                    start = { pos: { ...sim.pos }, vel: { ...sim.vel }, spin: sim.spin, r: sim.r, maxSpeed: sim.maxSpeed, minSpeed: sim.minSpeed };
                    startSteps = left;
                }
            }
            return PhysicsCore.predictY(start, faceX, startSteps, H);
        }

        // ── drawing ─────────────────────────────────────────────────────
        render(ctx) {
            if (!this.count && !this.shards.length && !this.bursts.length) return;
            const L = window.ForgeLook;
            if (!L) return;
            const time = this.time;
            for (const p of this.portals) {
                ctx.save();
                ctx.translate(p.x, p.y);
                const pop = 1 + Math.sin(Math.min(1, (1 - p.flash) * 2) * Math.PI) * p.flash * 0.18;
                ctx.scale(pop, pop);
                const ring = L.portalRing(p.R, p.pair);
                ctx.drawImage(ring, -ring.lw / 2, -ring.lh / 2, ring.lw, ring.lh);
                ctx.rotate((p.spin ? 1 : -1) * time * (p.pair < 0 ? 0.6 : 2.6));
                const sw = L.portalSwirl(p.R, p.pair);
                ctx.globalAlpha = p.pair < 0 ? 0.45 : 0.85 + p.flash * 0.15;
                ctx.drawImage(sw, -sw.lw / 2, -sw.lh / 2, sw.lw, sw.lh);
                ctx.restore();
            }
            for (const b of this.bursts) {
                const k = b.t / b.life;
                const r = b.implode ? b.R * (1.3 - k) : b.R * (0.4 + k * 1.4);
                ctx.save();
                ctx.globalAlpha = (1 - k) * 0.9;
                ctx.strokeStyle = b.color;
                ctx.lineWidth = Math.max(1.5, b.R * 0.14 * (1 - k));
                ctx.beginPath();
                ctx.arc(b.x, b.y, Math.max(1, r), 0, TAU);
                ctx.stroke();
                ctx.restore();
            }
            for (const l of this.lasers) {
                const ph = laserPhase(l, time);
                let power = 0, lit = false;
                if (ph < LASER.lit) {
                    power = Math.min(1, ph / 0.08);
                    lit = true;
                } else if (ph < LASER.warn) {
                    // Flicker warning: about to switch off.
                    power = Math.sin(ph * 70) > -0.2 ? 0.85 : 0.25;
                    lit = true;
                }
                if (lit) {
                    L.drawBeam(ctx, l.x1, l.y1, l.x2, l.y2, l.th * (1 + l.flash * 0.7), power, time);
                } else {
                    const charge = ph >= LASER.charge ? (ph - LASER.charge) / (LASER.period - LASER.charge) : 0;
                    L.drawBeamGuide(ctx, l.x1, l.y1, l.x2, l.y2, l.th, charge);
                    if (charge > 0 && Math.sin(ph * 90) > 0) L.drawBeam(ctx, l.x1, l.y1, l.x2, l.y2, l.th * 0.35, charge * 0.6, time);
                }
                const angle = Math.atan2(l.uy, l.ux);
                const em = L.emitter(l.pr, lit);
                for (const end of [0, 1]) {
                    ctx.save();
                    ctx.translate(end ? l.x2 : l.x1, end ? l.y2 : l.y1);
                    ctx.rotate(angle + (end ? Math.PI : 0));
                    ctx.drawImage(em, -em.lw / 2, -em.lh / 2, em.lw, em.lh);
                    ctx.restore();
                }
            }
            for (const d of this.deflectors) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(d.angle);
                const pop = 1 + d.flash * 0.05;
                ctx.scale(pop, pop);
                const spr = L.deflector(d.len, d.th, false);
                ctx.drawImage(spr, -spr.lw / 2, -spr.lh / 2, spr.lw, spr.lh);
                if (d.flash > 0.02) {
                    ctx.globalAlpha = d.flash;
                    const hot = L.deflector(d.len, d.th, true);
                    ctx.drawImage(hot, -hot.lw / 2, -hot.lh / 2, hot.lw, hot.lh);
                }
                ctx.restore();
            }
            for (const c of this.crystals) {
                if (c.hp <= 0) {
                    // A faint socket marks where it will grow back.
                    if (c.respawn < 2) {
                        ctx.save();
                        ctx.globalAlpha = 0.15 + 0.35 * (1 - c.respawn / 2) * (0.6 + 0.4 * Math.sin(time * 12));
                        ctx.strokeStyle = '#b48cff';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([4, 4]);
                        ctx.strokeRect(c.x - c.S / 2, c.y - c.S / 2, c.S, c.S);
                        ctx.restore();
                    }
                    continue;
                }
                const damage = CRYSTAL_HP - c.hp;
                const k = c.grow < 1 ? c.grow * c.grow * (3 - 2 * c.grow) : 1;
                const pop = 1 + Math.sin(Math.min(1, (1 - c.flash) * 2.2) * Math.PI) * c.flash * 0.12;
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.scale(k * pop, k * pop);
                const spr = L.crystal(c.S, damage, false);
                ctx.drawImage(spr, -spr.lw / 2, -spr.lh / 2, spr.lw, spr.lh);
                // A slow glint every few seconds; brighter while flashing.
                const shimmer = Math.max(c.flash, Math.max(0, Math.sin(time * 1.6 + c.x * 0.01) - 0.6) * 0.45);
                if (shimmer > 0.02) {
                    ctx.globalAlpha = Math.min(1, shimmer);
                    const hot = L.crystal(c.S, damage, true);
                    ctx.drawImage(hot, -hot.lw / 2, -hot.lh / 2, hot.lw, hot.lh);
                }
                ctx.restore();
            }
            if (this.shards.length) {
                ctx.save();
                for (const s of this.shards) {
                    ctx.globalAlpha = Math.min(1, s.life / s.max * 1.6);
                    ctx.fillStyle = s.light ? '#efe4ff' : '#9d6bff';
                    const c = Math.cos(s.a) * s.size, sn = Math.sin(s.a) * s.size;
                    ctx.beginPath();
                    ctx.moveTo(s.x + c, s.y + sn);
                    ctx.lineTo(s.x - sn * 0.6 - c * 0.5, s.y + c * 0.6 - sn * 0.5);
                    ctx.lineTo(s.x + sn * 0.6 - c * 0.5, s.y - c * 0.6 - sn * 0.5);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // ── online ──────────────────────────────────────────────────────
        // The host sends the gadget clock (laser phases) and crystal health.
        snapshot() {
            return { t: Math.round(this.time * 100) / 100, c: this.crystals.map(c => c.hp).join('') };
        }

        applySnapshot(data, lat = 0) {
            if (!data) return;
            const t = Number(data.t) + lat;
            if (Number.isFinite(t) && Math.abs(t - this.time) > 0.08) this.time = t;
            const hp = String(data.c || '');
            if (hp.length !== this.crystals.length) return;
            this.crystals.forEach((c, i) => {
                const next = Number(hp[i]) || 0;
                if (next === c.hp) return;
                if (next <= 0) this.shatter(c, this.game.ball);
                else if (c.hp <= 0) this.regrow(c);
                else c.flash = 1;
                c.hp = next;
            });
        }
    }

    window.ForgeGadgets = ForgeGadgets;
})();
