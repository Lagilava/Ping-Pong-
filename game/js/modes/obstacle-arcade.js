// Obstacle mode arcade layer: coins, ? blocks, boost pads, Star power and
// goal explosions laid over the obstacle course.
//
// Everything that glows is baked once into small sprite canvases, so a frame
// is a handful of drawImage calls and plain strokes: no shadowBlur, filters
// or blend-mode passes at draw time.
class ObstacleArcade {
    constructor(game) {
        this.game = game;
        this.coins = [];
        this.blocks = [];
        this.pads = [];
        this.pops = [];
        this.confetti = [];
        this.rings = [];
        this.trail = [];
        this.wallet = { player: 0, ai: 0 };
        this.coinsPerPoint = 10;
        this.starTime = 0;
        this.boostTime = 0;
        this.layoutKey = '';
        this.respawnTimer = 0;
        this.time = 0;
        this.sprites = null;
        this.hud = null;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────
    reset() {
        this.coins.length = 0;
        this.blocks.length = 0;
        this.pads.length = 0;
        this.pops.length = 0;
        this.confetti.length = 0;
        this.rings.length = 0;
        this.trail.length = 0;
        this.wallet.player = 0;
        this.wallet.ai = 0;
        this.starTime = 0;
        this.boostTime = 0;
        this.layoutKey = '';
        this.respawnTimer = 0;
        this.syncHud();
    }

    setHudVisible(visible) {
        const hud = this.ensureHud();
        if (hud) hud.classList.toggle('visible', !!visible);
    }

    isStarActive() {
        return this.starTime > 0;
    }

    // ── Sprites (baked once per size) ──────────────────────────────────
    ensureSprites(unit) {
        const key = Math.round(unit);
        if (this.sprites && this.sprites.key === key) return this.sprites;
        // Baked at 2x and drawn at logical size so sprites stay crisp on
        // high-DPI screens.
        const make = (w, h, draw) => {
            const c = document.createElement('canvas');
            c.width = Math.ceil(w * 2);
            c.height = Math.ceil(h * 2);
            c.lw = c.width / 2;
            c.lh = c.height / 2;
            const ctx = c.getContext('2d');
            ctx.scale(2, 2);
            draw(ctx, c.lw, c.lh);
            return c;
        };
        const coinR = Math.max(9, unit * 0.42);
        const coin = make(coinR * 4, coinR * 4, (ctx, w, h) => {
            const cx = w / 2, cy = h / 2;
            ctx.shadowColor = 'rgba(255, 210, 60, 0.9)';
            ctx.shadowBlur = coinR * 0.9;
            const g = ctx.createRadialGradient(cx - coinR * 0.35, cy - coinR * 0.4, coinR * 0.1, cx, cy, coinR);
            g.addColorStop(0, '#fff6c2');
            g.addColorStop(0.45, '#ffd23f');
            g.addColorStop(1, '#c47a00');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, coinR, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(1.5, coinR * 0.14);
            ctx.strokeStyle = '#8a5200';
            ctx.stroke();
            ctx.fillStyle = '#fff3b0';
            ctx.fillRect(cx - coinR * 0.12, cy - coinR * 0.55, coinR * 0.24, coinR * 1.1);
        });
        const blockS = Math.max(34, unit * 1.7);
        const drawBlock = (used) => make(blockS * 1.5, blockS * 1.5, (ctx, w, h) => {
            const x = (w - blockS) / 2, y = (h - blockS) / 2, r = blockS * 0.14;
            ctx.shadowColor = used ? 'rgba(0,0,0,0)' : 'rgba(255, 170, 40, 0.85)';
            ctx.shadowBlur = used ? 0 : blockS * 0.35;
            const g = ctx.createLinearGradient(0, y, 0, y + blockS);
            if (used) {
                g.addColorStop(0, '#8a5a3a');
                g.addColorStop(1, '#4e2f1c');
            } else {
                g.addColorStop(0, '#ffcf4a');
                g.addColorStop(1, '#e07b00');
            }
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(x, y, blockS, blockS, r);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(2, blockS * 0.06);
            ctx.strokeStyle = used ? '#2e1a0e' : '#7a3a00';
            ctx.stroke();
            ctx.fillStyle = used ? '#3a2416' : '#7a3a00';
            const d = blockS * 0.07;
            [[x + d * 1.6, y + d * 1.6], [x + blockS - d * 1.6, y + d * 1.6], [x + d * 1.6, y + blockS - d * 1.6], [x + blockS - d * 1.6, y + blockS - d * 1.6]]
                .forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, d * 0.55, 0, Math.PI * 2); ctx.fill(); });
            if (!used) {
                ctx.font = `900 ${Math.round(blockS * 0.62)}px Arial Black, Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#7a3a00';
                ctx.fillText('?', w / 2 + blockS * 0.04, h / 2 + blockS * 0.06);
                ctx.fillStyle = '#fff4d0';
                ctx.fillText('?', w / 2, h / 2 + blockS * 0.02);
            }
        });
        const padW = Math.max(64, unit * 2.7), padH = Math.max(26, unit * 1.15);
        const pad = make(padW * 1.4, padH * 2, (ctx, w, h) => {
            const x = (w - padW) / 2, y = (h - padH) / 2;
            ctx.shadowColor = 'rgba(255, 140, 30, 0.9)';
            ctx.shadowBlur = padH * 0.6;
            ctx.fillStyle = 'rgba(40, 18, 4, 0.9)';
            ctx.beginPath();
            ctx.roundRect(x, y, padW, padH, padH * 0.5);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ff9a2e';
            ctx.stroke();
        });
        const starR = Math.max(14, unit * 0.75);
        const star = make(starR * 3.4, starR * 3.4, (ctx, w, h) => {
            ctx.translate(w / 2, h / 2);
            ctx.shadowColor = 'rgba(255, 240, 90, 0.95)';
            ctx.shadowBlur = starR * 0.8;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5;
                const rr = i % 2 ? starR * 0.45 : starR;
                ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            const g = ctx.createRadialGradient(0, -starR * 0.2, 1, 0, 0, starR);
            g.addColorStop(0, '#fffbe0');
            g.addColorStop(1, '#ffc400');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#3a2a00';
            ctx.fillRect(-starR * 0.2, -starR * 0.18, starR * 0.1, starR * 0.3);
            ctx.fillRect(starR * 0.1, -starR * 0.18, starR * 0.1, starR * 0.3);
        });
        this.sprites = { key, coin, coinR, block: drawBlock(false), blockUsed: drawBlock(true), blockS, pad, padW, padH, star, starR };
        return this.sprites;
    }

    // ── Layout ─────────────────────────────────────────────────────────
    // Picks free spots on the course grid, away from obstacles, their paths
    // and the checkpoint route, so pickups never sit inside a hazard.
    layout() {
        const game = this.game;
        const course = game.obstacleCourse;
        const g = course?.grid;
        if (!g) return;
        const unit = Math.max(18, Math.min(g.cellW, g.cellH) * 0.42);
        const s = this.ensureSprites(unit);
        const rand = course.createRng((course.courseSeed ^ 0x5bd1e995) >>> 0);

        // Hazards as rectangles (moving gates swept over their whole range,
        // path followers sampled along the path) plus checkpoint circles.
        const rects = [];
        const circles = [];
        for (const o of course.obstacles) {
            let x0 = o.pos.x, y0 = o.pos.y, x1 = o.pos.x + o.w, y1 = o.pos.y + o.h;
            if (o.motion && Number.isFinite(o.motion.min) && Number.isFinite(o.motion.max)) {
                if (o.motion.axis === 'x') { x0 = Math.min(x0, o.motion.min); x1 = Math.max(x1, o.motion.max + o.w); }
                if (o.motion.axis === 'y') { y0 = Math.min(y0, o.motion.min); y1 = Math.max(y1, o.motion.max + o.h); }
            }
            rects.push({ x0, y0, x1, y1 });
            if (Array.isArray(o.path)) {
                const r = Math.max(o.w, o.h) * 0.5;
                o.path.forEach(p => rects.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }));
            }
        }
        if (course.courseRoute) course.courseRoute.points.forEach(p => circles.push({ x: p.x, y: p.y, r: course.courseRoute.checkpointRadius }));
        const margin = 16;
        const clearance = (x, y) => {
            let best = Infinity;
            for (const b of rects) {
                const dx = Math.max(b.x0 - x, 0, x - b.x1);
                const dy = Math.max(b.y0 - y, 0, y - b.y1);
                best = Math.min(best, Math.hypot(dx, dy) - margin);
            }
            for (const c of circles) best = Math.min(best, Math.hypot(x - c.x, y - c.y) - c.r - margin);
            // Keep clear of the paddles' lanes and the rails.
            best = Math.min(best, x - g.left * 0.75, game.width - g.left * 0.75 - x, y - 30, game.height - 30 - y);
            return best;
        };
        const candidates = [];
        for (let c = 0; c <= (g.cols - 1) * 2; c++) {
            for (let r = 0; r <= (g.rows - 1) * 2; r++) {
                const x = g.left + g.cellW * c / 2;
                const y = g.top + g.cellH * r / 2;
                candidates.push({ x, y, score: clearance(x, y) + rand() * 6 });
            }
        }
        const take = (filter, need) => {
            let pick = null;
            for (const cnd of candidates) {
                if (cnd.used || !filter(cnd) || cnd.score < need) continue;
                if (!pick || cnd.score > pick.score) pick = cnd;
            }
            if (pick) {
                pick.used = true;
                pick.clear = pick.score;
                candidates.forEach(c => { c.score = Math.min(c.score, Math.hypot(c.x - pick.x, c.y - pick.y) - need * 2 - 8); });
            }
            return pick;
        };
        const midX = game.width / 2;

        this.pads.length = 0;
        [cnd => cnd.x < midX, cnd => cnd.x > midX].forEach((side, i) => {
            const p = take(side, s.padW * 0.5);
            if (p) this.pads.push({ x: p.x, y: p.y, dir: i === 0 ? 1 : -1, cooldown: 0, flash: 0 });
        });

        this.blocks.length = 0;
        [cnd => cnd.y < game.height / 2, cnd => cnd.y > game.height / 2].forEach(half => {
            const p = take(cnd => half(cnd) && Math.abs(cnd.x - midX) < g.cellW * 3, s.blockS * 0.75);
            if (p) this.blocks.push({ x: p.x, y: p.y, used: false, refill: 0, bump: 0, popIn: 1 });
        });

        this.coins.length = 0;
        for (let i = 0; i < 3; i++) {
            const p = take(() => true, s.coinR * 3);
            if (!p) break;
            const n = 5;
            const span = Math.min(g.cellW * 0.9, s.coinR * 2.6 * (n - 1), Math.max(s.coinR * 4, p.clear * 2 - s.coinR * 2));
            for (let k = 0; k < n; k++) {
                const t = k / (n - 1);
                this.coins.push({
                    x: p.x - span / 2 + span * t,
                    y: p.y - Math.sin(t * Math.PI) * s.coinR * 2.2 + s.coinR,
                    phase: k * 0.5 + i,
                    alive: true,
                });
            }
        }
    }

    // ── Update ─────────────────────────────────────────────────────────
    update(dt) {
        const game = this.game;
        const course = game.obstacleCourse;
        const ball = game.ball;
        if (!ball || (!this.fixedLayout && !course?.grid)) return;
        this.time += dt;

        if (!this.fixedLayout) {
            const key = `${course.patternIndex}:${course.scoreStamp}:${game.width}x${game.height}`;
            if (key !== this.layoutKey) {
                this.layoutKey = key;
                this.layout();
            }
        }
        const s = this.sprites;
        if (!s) return;

        this.starTime = Math.max(0, this.starTime - dt);
        this.boostTime = Math.max(0, this.boostTime - dt);
        const owner = ball.vel.x >= 0 ? 'player' : 'ai';

        // Boost trail samples (fixed-size ring buffer).
        if (this.boostTime > 0 || this.starTime > 0) {
            this.trail.push(ball.pos.x, ball.pos.y);
            if (this.trail.length > 28) this.trail.splice(0, 2);
        } else if (this.trail.length) {
            this.trail.splice(0, 2);
        }

        // Coins: collect on contact; Star power pulls nearby coins in.
        let alive = 0;
        const reach = ball.r + s.coinR;
        for (const coin of this.coins) {
            if (!coin.alive) continue;
            alive++;
            if (this.starTime > 0) {
                const dx = ball.pos.x - coin.x, dy = ball.pos.y - coin.y;
                const d = Math.hypot(dx, dy);
                if (d < 220 && d > 1) {
                    const pull = Math.min(d, 520 * dt);
                    coin.x += dx / d * pull;
                    coin.y += dy / d * pull;
                }
            }
            if (Math.abs(ball.pos.x - coin.x) < reach && Math.abs(ball.pos.y - coin.y) < reach &&
                Math.hypot(ball.pos.x - coin.x, ball.pos.y - coin.y) < reach) {
                coin.alive = false;
                alive--;
                this.addCoins(owner, 1, coin.x, coin.y);
            }
        }
        if (alive === 0 && this.coins.length) {
            this.respawnTimer += dt;
            if (this.respawnTimer > 3) {
                this.respawnTimer = 0;
                this.coins.forEach(c => { c.alive = true; });
                this.layoutCoinsAgain();
            }
        }

        // ? blocks: solid. A hit bumps the block and pays out.
        for (const block of this.blocks) {
            block.bump = Math.max(0, block.bump - dt * 4);
            block.popIn = Math.min(1, block.popIn + dt * 3);
            if (block.used) {
                block.refill -= dt;
                if (block.refill <= 0) {
                    block.used = false;
                    block.popIn = 0;
                }
            }
            const half = s.blockS / 2;
            const nx = Math.max(block.x - half, Math.min(ball.pos.x, block.x + half));
            const ny = Math.max(block.y - half, Math.min(ball.pos.y, block.y + half));
            const dx = ball.pos.x - nx, dy = ball.pos.y - ny;
            if (dx * dx + dy * dy >= ball.r * ball.r) continue;
            if (this.starTime <= 0) {
                if (Math.abs(ball.pos.x - block.x) / half > Math.abs(ball.pos.y - block.y) / half) {
                    ball.vel.x = Math.sign(ball.pos.x - block.x) * Math.abs(ball.vel.x);
                    ball.pos.x = block.x + Math.sign(ball.pos.x - block.x) * (half + ball.r + 0.5);
                } else {
                    ball.vel.y = Math.sign(ball.pos.y - block.y) * Math.abs(ball.vel.y);
                    ball.pos.y = block.y + Math.sign(ball.pos.y - block.y) * (half + ball.r + 0.5);
                }
                ball.prev?.set?.(ball.pos.x, ball.pos.y);
            }
            if (block.bump <= 0.3) {
                block.bump = 1;
                game.audio?.bounce?.(0.6);
                if (!block.used) this.openBlock(block, owner);
            }
        }

        // Boost pads.
        for (const pad of this.pads) {
            pad.cooldown = Math.max(0, pad.cooldown - dt);
            pad.flash = Math.max(0, pad.flash - dt * 2.5);
            if (pad.cooldown > 0) continue;
            if (Math.abs(ball.pos.x - pad.x) < s.padW / 2 + ball.r && Math.abs(ball.pos.y - pad.y) < s.padH / 2 + ball.r) {
                pad.cooldown = 1.1;
                pad.flash = 1;
                this.boost(ball);
            }
        }

        // Pops, rings, confetti.
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const p = this.pops[i];
            p.t += dt;
            p.vy += 1400 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.t > p.life) this.pops.splice(i, 1);
        }
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i];
            r.t += dt;
            if (r.t > r.life) this.rings.splice(i, 1);
        }
        for (let i = this.confetti.length - 1; i >= 0; i--) {
            const c = this.confetti[i];
            c.t += dt;
            c.vy += 900 * dt;
            c.vx *= 1 - dt * 1.5;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.rot += c.spin * dt;
            if (c.t > c.life) this.confetti.splice(i, 1);
        }
    }

    // Custom (Forge) arenas place pads, blocks and coins themselves.
    setFixedLayout(items) {
        this.reset();
        this.fixedLayout = true;
        this.ensureSprites(Math.max(18, this.game.height * 0.034));
        this.pads = items.pads;
        this.blocks = items.blocks;
        this.coins = items.coins;
    }

    clearFixedLayout() {
        this.fixedLayout = false;
        this.reset();
    }

    layoutCoinsAgain() {
        if (this.fixedLayout) {
            this.coins.forEach(c => { c.x = c.homeX ?? c.x; c.y = c.homeY ?? c.y; });
            return;
        }
        const course = this.game.obstacleCourse;
        if (course) course.courseSeed = (course.courseSeed * 1664525 + 1013904223) >>> 0;
        const blocks = this.blocks.map(b => ({ ...b }));
        const pads = this.pads.map(p => ({ ...p }));
        this.layout();
        this.blocks = blocks;
        this.pads = pads;
    }

    addCoins(side, count, x, y) {
        const game = this.game;
        for (let i = 0; i < count; i++) {
            this.pops.push({ kind: 'coin', x, y, vx: (i - (count - 1) / 2) * 90, vy: -520 - i * 40, t: 0, life: 0.55 });
        }
        game.audio?.createOscillatorSound?.(988, 'square', 0.07, 0.18);
        setTimeout(() => game.audio?.createOscillatorSound?.(1319, 'square', 0.22, 0.16), 70);
        this.wallet[side] += count;
        while (this.wallet[side] >= this.coinsPerPoint) {
            this.wallet[side] -= this.coinsPerPoint;
            game.scores[side] += 1;
            game.progression?.recordPoint?.(side, 1);
            game.updateScoreUI?.();
            const who = side === 'player' ? (game.isMultiplayer ? 'P1' : 'You') : (game.isMultiplayer ? 'P2' : 'AI');
            game.showNotification('1-UP!', `${who} turned ${this.coinsPerPoint} coins into a point`, '#ffd23f');
            game.audio?.levelUp?.();
        }
        this.syncHud();
    }

    openBlock(block, owner) {
        const game = this.game;
        block.used = true;
        block.refill = 10;
        const roll = Math.random();
        if (roll < 0.22) {
            this.starTime = 6;
            this.pops.push({ kind: 'star', x: block.x, y: block.y - this.sprites.blockS * 0.6, vx: 0, vy: -380, t: 0, life: 0.7 });
            game.showNotification('Star Power!', 'The ball smashes through hazards and pulls in coins', '#ffe14d');
            [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => game.audio?.createOscillatorSound?.(f, 'square', 0.1, 0.14), i * 70));
        } else if (roll < 0.42) {
            this.boost(game.ball, 1.3);
            game.showNotification('Turbo Block', 'Supersonic!', '#ff9a2e');
        } else {
            this.addCoins(owner, 3, block.x, block.y - this.sprites.blockS * 0.5);
        }
    }

    boost(ball, mult = 1.22) {
        const game = this.game;
        const speed = ball.getSpeed ? ball.getSpeed() : Math.hypot(ball.vel.x, ball.vel.y);
        const cap = (ball.maxSpeed || speed * 1.3) * 1.08;
        const next = Math.min(cap, Math.max(speed * mult, (ball.baseSpeed || speed) * 1.15));
        if (speed > 1) {
            ball.vel.x *= next / speed;
            ball.vel.y *= next / speed;
            if (ball._speed !== undefined) ball._speed = next;
        }
        this.boostTime = 0.8;
        game.screenShake = Math.max(game.screenShake || 0, 4);
        game.audio?.createOscillatorSound?.(220, 'sawtooth', 0.18, 0.12);
        setTimeout(() => game.audio?.createOscillatorSound?.(440, 'sawtooth', 0.22, 0.1), 60);
    }

    onGoal(side, ball) {
        const game = this.game;
        const x = side === 'player' ? game.width : 0;
        const y = Math.max(40, Math.min(game.height - 40, ball.pos.y));
        const colors = side === 'player'
            ? ['#00ffd6', '#7df9ff', '#ffffff', '#ffd23f']
            : ['#ff3a5c', '#ff9a2e', '#ffffff', '#ffd23f'];
        this.rings.push({ x, y, t: 0, life: 0.7, color: colors[0], max: game.height * 0.55 });
        this.rings.push({ x, y, t: -0.12, life: 0.8, color: colors[3], max: game.height * 0.75 });
        const dir = side === 'player' ? -1 : 1;
        for (let i = 0; i < 46; i++) {
            const a = (Math.random() - 0.5) * Math.PI * 0.9;
            const sp = 420 + Math.random() * 760;
            this.confetti.push({
                x, y,
                vx: Math.cos(a) * sp * dir,
                vy: Math.sin(a) * sp - 260,
                rot: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 18,
                w: 5 + Math.random() * 6,
                h: 3 + Math.random() * 3,
                color: colors[i % colors.length],
                t: 0,
                life: 1.1 + Math.random() * 0.5,
            });
        }
        game.screenShake = Math.max(game.screenShake || 0, 10);
        this.starTime = 0;
        this.boostTime = 0;
    }

    // ── Render ─────────────────────────────────────────────────────────
    renderUnder(ctx) {
        const s = this.sprites;
        if (!s) return;
        const t = this.time;
        for (const pad of this.pads) {
            ctx.globalAlpha = pad.cooldown > 0 ? 0.55 : 1;
            ctx.drawImage(s.pad, pad.x - s.pad.lw / 2, pad.y - s.pad.lh / 2, s.pad.lw, s.pad.lh);
            // Scrolling chevrons point the way the pad launches.
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            const cw = s.padH * 0.32;
            for (let i = 0; i < 3; i++) {
                const k = ((t * 2.2 + i / 3) % 1);
                const cx = pad.x + (k - 0.5) * s.padW * 0.7 * pad.dir;
                const a = Math.sin(k * Math.PI) * (0.55 + pad.flash * 0.45);
                ctx.strokeStyle = `rgba(255, ${Math.round(170 + pad.flash * 85)}, 60, ${a})`;
                ctx.beginPath();
                ctx.moveTo(cx - cw * 0.6 * pad.dir, pad.y - cw);
                ctx.lineTo(cx + cw * 0.4 * pad.dir, pad.y);
                ctx.lineTo(cx - cw * 0.6 * pad.dir, pad.y + cw);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    render(ctx) {
        const s = this.sprites;
        if (!s) return;
        const game = this.game;
        const t = this.time;

        // Coins spin by squashing the sprite horizontally.
        const cw = s.coin.lw, ch = s.coin.lh;
        for (const coin of this.coins) {
            if (!coin.alive) continue;
            const sx = Math.max(0.12, Math.abs(Math.cos(t * 3.2 + coin.phase)));
            const bob = Math.sin(t * 2.4 + coin.phase) * 3;
            ctx.drawImage(s.coin, coin.x - cw * sx / 2, coin.y - ch / 2 + bob, cw * sx, ch);
        }

        // ? blocks bump up when hit and pop in when they refill.
        for (const block of this.blocks) {
            const img = block.used ? s.blockUsed : s.block;
            const lift = Math.sin(block.bump * Math.PI) * s.blockS * 0.28;
            const sc = 0.6 + 0.4 * (1 - Math.pow(1 - block.popIn, 3)) + (block.popIn < 1 ? Math.sin(block.popIn * Math.PI) * 0.12 : 0);
            const w = img.lw * sc, h = img.lh * sc;
            ctx.drawImage(img, block.x - w / 2, block.y - h / 2 - lift, w, h);
        }

        // Boost / Star trail behind the ball.
        const pts = this.trail;
        if (pts.length >= 4) {
            const n = pts.length / 2;
            ctx.lineCap = 'round';
            for (let i = 1; i < n; i++) {
                const k = i / n;
                ctx.lineWidth = game.ball.r * 1.6 * k;
                ctx.strokeStyle = this.starTime > 0
                    ? `hsla(${(t * 420 + i * 24) % 360}, 100%, 62%, ${k * 0.8})`
                    : `rgba(255, ${Math.round(120 + 110 * k)}, ${Math.round(40 + 120 * k * k)}, ${k * 0.75})`;
                ctx.beginPath();
                ctx.moveTo(pts[i * 2 - 2], pts[i * 2 - 1]);
                ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
                ctx.stroke();
            }
        }
        if (this.starTime > 0) {
            const b = game.ball;
            const blink = this.starTime < 1.5 && Math.floor(t * 10) % 2 === 0;
            if (!blink) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = `hsl(${(t * 600) % 360}, 100%, 65%)`;
                ctx.beginPath();
                ctx.arc(b.pos.x, b.pos.y, b.r * 1.7, t * 6, t * 6 + Math.PI * 1.4);
                ctx.stroke();
            }
        }

        // Pops (coins flying out of blocks, rising stars).
        for (const p of this.pops) {
            const k = p.t / p.life;
            ctx.globalAlpha = 1 - k * k;
            if (p.kind === 'star') {
                ctx.drawImage(s.star, p.x - s.star.lw / 2, p.y - s.star.lh / 2, s.star.lw, s.star.lh);
            } else {
                const sx = Math.max(0.15, Math.abs(Math.cos(p.t * 22)));
                ctx.drawImage(s.coin, p.x - cw * sx / 2, p.y - ch / 2, cw * sx, ch);
            }
        }
        ctx.globalAlpha = 1;

        // Goal explosion.
        for (const r of this.rings) {
            if (r.t < 0) continue;
            const k = r.t / r.life;
            const ease = 1 - Math.pow(1 - k, 3);
            ctx.lineWidth = 10 * (1 - k) + 2;
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = 1 - k;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.max * ease, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (const c of this.confetti) {
            ctx.globalAlpha = Math.max(0, 1 - c.t / c.life);
            ctx.fillStyle = c.color;
            // Flip by scaling one axis: confetti flutters as it falls.
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(c.rot * 1.7))));
            ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // ── Coin HUD (DOM, so bloom never blurs it) ────────────────────────
    ensureHud() {
        if (this.hud) return this.hud;
        const host = document.querySelector('.game-container');
        if (!host) return null;
        const el = document.createElement('div');
        el.className = 'obstacle-coin-hud';
        el.innerHTML = '<div class="coin-pill left"><span class="coin-icon"></span><span class="coin-count">0</span><span class="coin-goal">/10</span></div>'
            + '<div class="coin-pill right"><span class="coin-icon"></span><span class="coin-count">0</span><span class="coin-goal">/10</span></div>';
        host.appendChild(el);
        this.hud = el;
        this.hudLeft = el.querySelector('.left .coin-count');
        this.hudRight = el.querySelector('.right .coin-count');
        return el;
    }

    syncHud() {
        if (!this.ensureHud()) return;
        const l = String(this.wallet.player), r = String(this.wallet.ai);
        if (this.hudLeft.textContent !== l) this.hudLeft.textContent = l;
        if (this.hudRight.textContent !== r) this.hudRight.textContent = r;
    }
}

window.ObstacleArcade = ObstacleArcade;
