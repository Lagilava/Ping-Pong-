// Zombie sprites. The procedural zombie renderer (Game.renderZombieEnemyLive)
// draws dozens of gradients and paths per zombie; doing that for a whole
// horde every frame was the main cost of Zombie mode. Each walk frame of each
// zombie type and variant is rendered once into an offscreen canvas, finished
// with a light-from-above shade and a dark outline, and then drawn with a
// single drawImage. Hit flashes, hit points, the pull stretch and the walk
// speed stay live.
(function () {
    'use strict';

    const FRAMES = 16;
    const ATTACK_FRAMES = 4;
    const TAU = Math.PI * 2;
    const MAX_ENTRIES = 320;
    const SPEED_RATIO = { shambler: 0.45, runner: 0.8, spitter: 0.5, tank: 0.35 };

    class ZombieSprites {
        constructor(game) {
            this.game = game;
            this.cache = new Map();
            this.reps = new Map();   // type|variant -> the zombie whose look the sprites copy
            this.failed = false;
        }

        // Queue every walk frame for the zombies of a new wave; pump() bakes a
        // couple per update so no single frame pays for them.
        prewarm(zombies) {
            const tr = this.game.ctx.getTransform();
            const scale = Math.max(1, Math.round(Math.hypot(tr.a, tr.b) * 4) / 4);
            this.queue = this.queue || [];
            const queued = new Set(this.queue.map(([key, frame, radius, density]) => `${key}|${frame}|${radius}|${density}`));
            zombies.forEach((z) => {
                if (!z.visual) return;
                const repKey = `${z.typeKey}|${z.visual.variant | 0}`;
                if (!this.reps.has(repKey)) this.reps.set(repKey, z);
                const radius = Math.max(8, Math.round(z.radius / 3) * 3);
                for (let f = 0; f < FRAMES; f++) {
                    const key = `${repKey}|${f}|${radius}|${scale}`;
                    if (queued.has(key) || this.cache.has(`${repKey}|walk|${f}|0|${radius}|${scale}`)) continue;
                    queued.add(key);
                    this.queue.push([repKey, f, radius, scale]);
                }
            });
        }

        pump(n = 2) {
            while (n-- > 0 && this.queue && this.queue.length) {
                const [repKey, f, radius, scale] = this.queue.shift();
                try { this._get(repKey, this.reps.get(repKey), f, false, radius, scale); } catch (e) { this.failed = true; this.queue = []; }
            }
        }

        clear() { this.cache.clear(); this.reps.clear(); }

        // A stand-in zombie that is mid-stride at a given frame.
        _pose(rep, frame, flash, state = 'walk') {
            const sr = SPEED_RATIO[rep.typeKey] || 0.5;
            const attacking = state === 'attack';
            const walk = (frame / (attacking ? ATTACK_FRAMES : FRAMES)) * TAU;
            const seed = rep.animSeed || 0;
            const anim = {
                speedRatio: sr,
                walkPhase: walk,
                limbSwing: Math.sin(walk) * (attacking ? 0.5 : 0.18 + sr * 0.34),
                limbSwing2: Math.sin(walk + Math.PI) * (attacking ? 0.5 : 0.18 + sr * 0.34),
                headBob: Math.sin(walk * 0.82 + seed) * (8 + sr * 9),
                breath: Math.sin(walk * 1.7 + (rep.animPhase || 0)) * 0.04,
                tilt: 0,
                blink: frame === 7 ? 0.05 : 1,
                roll: Math.sin(walk * 0.7) * 0.15,
                swing: Math.sin(walk * 1.19 + seed) * (0.6 + sr * 0.4),
                jitter: Math.sin(walk * 2.6) * (0.35 + sr * 0.4),
                poseIndex: attacking ? [1, 2, 3, 4][frame] : frame % 10,
                poseBlend: (frame * 0.37) % 1,
                posePulse: 0.5,
                threat: attacking ? 1 : 0.3,
                attackPulse: attacking ? 1 : 0.3,
                facingX: 1,
                footfall: Math.max(0, Math.sin(walk)),
                recoil: flash ? 1 : 0,
                shoulderTwitch: Math.sin(walk * 3.8 + seed) * 0.1,
                neckTwitch: Math.sin(walk * 2.2 + seed) * 0.06,
                inhale: rep.typeKey === 'spitter' ? (attacking ? 1 : 0.25 + 0.2 * Math.sin(walk)) : 0.1,
                dragSide: 1
            };
            return {
                typeKey: rep.typeKey,
                type: rep.type,
                x: 0, y: 0, vx: 0, vy: 0,
                radius: rep.radius,
                hp: rep.maxHp, maxHp: rep.maxHp,
                wobble: walk * 0.8,
                phaseOffset: rep.phaseOffset,
                animSeed: rep.animSeed,
                animPhase: rep.animPhase,
                baseSpeed: rep.baseSpeed,
                visual: rep.visual,
                anim,
                flash: flash ? 1 : 0,
                spitTimer: 4
            };
        }

        _bake(rep, frame, flash, radius, scale, state = 'walk') {
            const g = this.game;
            const ox = radius * 2.5, oy = radius * 2.9;
            const w = Math.ceil(radius * 5.0 * scale), h = Math.ceil(radius * 4.7 * scale);
            const a = document.createElement('canvas');
            a.width = w; a.height = h;
            const actx = a.getContext('2d');
            actx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
            const stand = this._pose(rep, frame, flash, state);
            stand.radius = radius;
            g.renderZombieEnemyLive(actx, stand, { time: frame * 0.37 });
            actx.setTransform(1, 0, 0, 1, 0, 0);

            // Light from above, shade below; only where the zombie is drawn.
            actx.globalCompositeOperation = 'source-atop';
            const shade = actx.createLinearGradient(0, 0, 0, h);
            shade.addColorStop(0, 'rgba(255,255,235,0.10)');
            shade.addColorStop(0.45, 'rgba(0,0,0,0)');
            shade.addColorStop(1, 'rgba(0,0,0,0.30)');
            actx.fillStyle = shade;
            actx.fillRect(0, 0, w, h);
            actx.globalCompositeOperation = 'source-over';

            // Dark outline so each zombie reads against the busy background.
            const sil = document.createElement('canvas');
            sil.width = w; sil.height = h;
            const sctx = sil.getContext('2d');
            sctx.drawImage(a, 0, 0);
            sctx.globalCompositeOperation = 'source-in';
            sctx.fillStyle = 'rgba(4,7,6,0.9)';
            sctx.fillRect(0, 0, w, h);
            const out = document.createElement('canvas');
            out.width = w; out.height = h;
            const octx = out.getContext('2d');
            const o = Math.max(1, scale * 1.4);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * TAU;
                octx.drawImage(sil, Math.cos(ang) * o, Math.sin(ang) * o);
            }
            octx.drawImage(a, 0, 0);
            return { canvas: out, ox, oy, w, h, scale };
        }

        // Returns true when the zombie was drawn.
        draw(ctx, zombie) {
            if (this.failed || !zombie.visual) return false;
            try {
                const tr = ctx.getTransform();
                const scale = Math.max(1, Math.round(Math.hypot(tr.a, tr.b) * 4) / 4);
                const radius = Math.max(8, Math.round(zombie.radius / 3) * 3);
                const variant = zombie.visual.variant | 0;
                const repKey = `${zombie.typeKey}|${variant}`;
                if (!this.reps.has(repKey)) this.reps.set(repKey, zombie);
                const rep = this.reps.get(repKey);
                const attacking = (zombie.anim?.attackPulse || 0) > 0.72;
                const state = attacking ? 'attack' : 'walk';
                const frame = Math.floor(zombie.frameT || 0) % (attacking ? ATTACK_FRAMES : FRAMES);
                const flash = Math.max(0, Math.min(1, zombie.flash));

                const base = this._get(repKey, rep, frame, false, radius, scale, state);
                const k = zombie.radius / radius;
                const anim = zombie.anim || {};
                const facing = anim.facingX || (zombie.vx >= 0 ? 1 : -1);
                const vs = ((zombie.visual.visualScale || 1) / (rep.visual.visualScale || 1));
                const pull = zombie.pullAmt > 0.02 ? Math.min(1, zombie.pullAmt) : 0;
                const tilt = Math.max(-0.28, Math.min(0.28, (zombie.vx || 0) * 0.0035 + Math.atan2(zombie.vy || 0, zombie.vx || 1) * 0.04));
                const squashY = 1 - Math.min(0.1, Math.abs(zombie.vy || 0) * 0.0004);

                ctx.save();
                ctx.translate(zombie.x, zombie.y);
                ctx.rotate(tilt - pull * 0.12);
                // A pulled zombie leans back and stretches towards the paddle.
                ctx.scale(facing * k * vs * (1 + pull * 0.2), k * vs * squashY * (1 - pull * 0.08));
                const dw = base.w / base.scale, dh = base.h / base.scale;
                if (pull > 0) {
                    ctx.globalAlpha = 0.22 * pull;
                    ctx.drawImage(base.canvas, -base.ox - 30 * pull * facing, -base.oy, dw, dh);
                    ctx.globalAlpha = 0.14 * pull;
                    ctx.drawImage(base.canvas, -base.ox - 60 * pull * facing, -base.oy, dw, dh);
                    ctx.globalAlpha = 1;
                }
                ctx.drawImage(base.canvas, -base.ox, -base.oy, dw, dh);
                if (flash > 0.04) {
                    const hit = this._get(repKey, rep, frame, true, radius, scale, state);
                    ctx.globalAlpha = flash;
                    ctx.drawImage(hit.canvas, -hit.ox, -hit.oy, hit.w / hit.scale, hit.h / hit.scale);
                    ctx.globalAlpha = 1;
                }
                ctx.restore();

                // Live status: hit points on tanks, hit flash ring, spitter drips.
                if (zombie.typeKey === 'tank' || zombie.typeKey === 'spitter' || flash > 0.01) {
                    ctx.save();
                    ctx.translate(zombie.x, zombie.y);
                    this.game._renderGrittyZombieStatus(ctx, zombie, zombie.radius, zombie.typeKey, this.game.time || performance.now() * 0.001, flash, zombie.type.eyeColor);
                    ctx.restore();
                }
                return true;
            } catch (err) {
                console.warn('[ZombieSprites] Falling back to live zombies:', err);
                this.failed = true;
                return false;
            }
        }

        _get(repKey, rep, frame, flash, radius, scale, state = 'walk') {
            const key = `${repKey}|${state}|${frame}|${flash ? 1 : 0}|${radius}|${scale}`;
            let e = this.cache.get(key);
            if (e) {
                // Most recently used goes to the back, so eviction drops stale
                // sizes (an editor preview, an old window size) first.
                this.cache.delete(key);
                this.cache.set(key, e);
            } else {
                if (this.cache.size >= MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value);
                e = this._bake(rep, frame, flash, radius, scale, state);
                this.cache.set(key, e);
            }
            return e;
        }
    }

    window.ZombieSprites = ZombieSprites;
})();
