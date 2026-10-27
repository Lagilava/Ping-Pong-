// Generated cel-shaded enemy atlas, decoded into reusable animation frames.
// The previous procedural sprites remain as a loading/error fallback.
// Hit points, movement, facing, pull deformation and attacks stay live.
(function () {
    'use strict';

    const FRAMES = 16;
    const ATTACK_FRAMES = 4;
    const TAU = Math.PI * 2;
    const MAX_ENTRIES = 320;
    const SPEED_RATIO = { shambler: 0.45, runner: 0.8, spitter: 0.5, tank: 0.35 };

    const GENERATED_TYPES = ['shambler', 'runner', 'tank', 'spitter'];
    const GENERATED_PACE = { shambler: 0.65, runner: 0.95, tank: 0.5, spitter: 0.6 };
    let generatedAtlas = null;
    let generatedLoad = null;

    // Image generation can place a claw over a nominal cell edge. Extract the
    // six connected silhouettes in each row instead of slicing off those limbs
    // or letting neighboring pixels bleed into a frame. This runs once, yields
    // between rows, and preserves the generated colors and antialiased edges.
    async function prepareGeneratedAtlas(image) {
        const density = image.naturalWidth / 1536;
        if (density < 1 || image.naturalHeight !== 1024 * density) throw new Error('Expected a 6 × 4 enemy atlas');
        const source = document.createElement('canvas');
        source.width = 1536; source.height = 256;
        const ctx = source.getContext('2d', { willReadFrequently: true });
        const atlas = {};
        for (let row = 0; row < 4; row++) {
            ctx.clearRect(0, 0, 1536, 256);
            // Analyse topology at the authored grid size, then extract color
            // from the full-density source. Upscaling cannot shift hitboxes.
            ctx.drawImage(image, 0, row * 256 * density, image.naturalWidth, 256 * density, 0, 0, 1536, 256);
            const pixels = ctx.getImageData(0, 0, 1536, 256);
            const labels = new Uint16Array(1536 * 256);
            const queue = new Int32Array(labels.length);
            const parts = [];
            let label = 0;
            for (let start = 0; start < labels.length; start++) {
                if (labels[start] || pixels.data[start * 4 + 3] < 80) continue;
                label++;
                let head = 0, tail = 1;
                queue[0] = start; labels[start] = label;
                let x0 = 1536, x1 = 0, y0 = 256, y1 = 0;
                while (head < tail) {
                    const index = queue[head++], x = index % 1536, y = (index / 1536) | 0;
                    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                    for (let d = 0; d < 4; d++) {
                        const next = d === 0 ? (x ? index - 1 : -1)
                            : d === 1 ? (x < 1535 ? index + 1 : -1)
                            : d === 2 ? (y ? index - 1536 : -1)
                            : (y < 255 ? index + 1536 : -1);
                        if (next >= 0 && !labels[next] && pixels.data[next * 4 + 3] >= 80) {
                            labels[next] = label; queue[tail++] = next;
                        }
                    }
                }
                if (tail > 2000) parts.push({ label, x0, x1, y0, y1 });
            }
            if (parts.length !== 6) throw new Error(`Expected six ${GENERATED_TYPES[row]} silhouettes; found ${parts.length}`);
            parts.sort((a, b) => a.x0 - b.x0);
            const bodyHeight = Math.max(...parts.slice(0, 4).map(p => p.y1 - p.y0 + 1));
            const frames = [];
            for (let col = 0; col < parts.length; col++) {
                const part = parts[col];
                const x0 = Math.max(0, part.x0 - 4), y0 = Math.max(0, part.y0 - 4);
                const width = Math.min(1536, part.x1 + 5) - x0;
                const height = Math.min(256, part.y1 + 5) - y0;
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const frameCtx = canvas.getContext('2d');
                const frame = frameCtx.createImageData(width, height);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const sx = x0 + x, sy = y0 + y, sourceIndex = sy * 1536 + sx;
                        if (!pixels.data[sourceIndex * 4 + 3]) continue;
                        let belongs = labels[sourceIndex] === part.label;
                        // Retain up to four pixels of the original soft edge.
                        for (let dy = -4; !belongs && dy <= 4; dy++) {
                            for (let dx = -4; dx <= 4; dx++) {
                                const nx = sx + dx, ny = sy + dy;
                                if (nx >= 0 && nx < 1536 && ny >= 0 && ny < 256 && labels[ny * 1536 + nx] === part.label) { belongs = true; break; }
                            }
                        }
                        if (!belongs) continue;
                        const to = (y * width + x) * 4, from = sourceIndex * 4;
                        frame.data[to] = pixels.data[from]; frame.data[to + 1] = pixels.data[from + 1];
                        frame.data[to + 2] = pixels.data[from + 2]; frame.data[to + 3] = pixels.data[from + 3];
                    }
                }
                frameCtx.putImageData(frame, 0, 0);
                let artwork = canvas;
                if (density > 1) {
                    artwork = document.createElement('canvas');
                    artwork.width = Math.round(width * density); artwork.height = Math.round(height * density);
                    const high = artwork.getContext('2d');
                    high.drawImage(image, x0 * density, (row * 256 + y0) * density,
                        width * density, height * density, 0, 0, artwork.width, artwork.height);
                    high.globalCompositeOperation = 'destination-in';
                    high.drawImage(canvas, 0, 0, artwork.width, artwork.height);
                }
                const hit = document.createElement('canvas');
                hit.width = artwork.width; hit.height = artwork.height;
                const hitCtx = hit.getContext('2d');
                hitCtx.drawImage(artwork, 0, 0);
                hitCtx.globalCompositeOperation = 'source-in';
                hitCtx.fillStyle = '#e5f3e8'; hitCtx.fillRect(0, 0, hit.width, hit.height);
                frames.push({ canvas: artwork, hit, width, height, ox: col * 256 + 128 - x0,
                    // Align the feet while preserving the smaller coiled pose.
                    oy: part.y1 - bodyHeight * 0.5 - y0, bodyHeight });
            }
            atlas[GENERATED_TYPES[row]] = frames;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return atlas;
    }

    function loadGeneratedAtlas() {
        if (generatedLoad) return generatedLoad;
        generatedLoad = new Promise(resolve => {
            const image = new Image();
            image.onload = async () => {
                try { generatedAtlas = await prepareGeneratedAtlas(image); resolve(true); }
                catch (error) { console.warn('[ZombieSprites] Generated atlas unavailable; using procedural sprites.', error); resolve(false); }
            };
            image.onerror = () => resolve(false);
            const src = 'assets/images/enemies/zombie-atlas.webp?v=20261027-4k-1';
            image.src = window.resolveAssetUrl?.(src) || src;
        });
        return generatedLoad;
    }

    class ZombieSprites {
        constructor(game) {
            this.game = game;
            this.cache = new Map();
            this.reps = new Map();   // type|variant -> the zombie whose look the sprites copy
            this.failed = false;
            this.artLoaded = false;
            this.artReady = loadGeneratedAtlas().then(loaded => {
                this.artLoaded = loaded;
                if (loaded) this.clear();
                return loaded;
            });
        }

        // Queue every walk frame for the zombies of a new wave; pump() bakes a
        // couple per update so no single frame pays for them.
        prewarm(zombies) {
            if (generatedAtlas) return;
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

        clear() { this.cache.clear(); this.reps.clear(); this.queue = []; }

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
            if (generatedAtlas?.[zombie.typeKey]) return this._drawGenerated(ctx, zombie);
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

        _generatedFrame(zombie) {
            if (zombie.typeKey === 'spitter') {
                if (zombie.spitAnim > 0) return 5;
                if (zombie.spitTimer <= 0.85) return 4;
            } else if ((zombie.anim?.attackPulse || 0) > 0.72) {
                return 4 + (Math.floor((zombie.frameT || 0) * 0.45) % 2);
            }
            const pace = GENERATED_PACE[zombie.typeKey];
            return Math.floor((zombie.frameT || 0) * pace) % 4;
        }

        _drawGenerated(ctx, zombie) {
            const frame = generatedAtlas[zombie.typeKey][this._generatedFrame(zombie)];
            const radius = zombie.radius;
            const scale = radius * 2.6 / frame.bodyHeight;
            const visualScale = Math.max(0.9, Math.min(1.1, zombie.visual?.visualScale || 1));
            const anim = zombie.anim || {};
            let facing = anim.facingX || (zombie.vx >= 0 ? 1 : -1);
            if (zombie.typeKey === 'spitter' && this.game.isZombieWaveMode?.()) {
                facing = Math.sign(this.game.player.pos.x + this.game.player.w / 2 - zombie.x) || facing;
            }
            const pull = Math.max(0, Math.min(1, zombie.pullAmt || 0));
            const motion = !window.PPSettings?.get('reduceMotion');
            const tilt = motion ? Math.max(-0.15, Math.min(0.15, (zombie.vx || 0) * 0.001)) : 0;
            const bob = motion ? Math.sin((zombie.frameT || 0) * Math.PI / 2) * radius * 0.025 : 0;
            ctx.save();
            ctx.translate(zombie.x, zombie.y);
            ctx.fillStyle = 'rgba(0,4,8,0.4)';
            ctx.beginPath();
            ctx.ellipse(0, radius * 1.3, radius * 0.85, radius * 0.18, 0, 0, TAU);
            ctx.fill();
            ctx.rotate(tilt - pull * 0.12);
            ctx.translate(0, bob);
            ctx.scale(facing * scale * visualScale * (1 + pull * 0.18), scale * visualScale * (1 - pull * 0.08));
            ctx.drawImage(frame.canvas, -frame.ox, -frame.oy, frame.width, frame.height);
            const flash = Math.max(0, Math.min(1, zombie.flash || 0));
            if (flash > 0.04 && (window.PPSettings?.flashEnabled?.() ?? true)) {
                ctx.globalAlpha *= flash * 0.6;
                ctx.drawImage(frame.hit, -frame.ox, -frame.oy, frame.width, frame.height);
            }
            ctx.restore();
            if (zombie.typeKey === 'tank' || zombie.typeKey === 'spitter') {
                ctx.save();
                ctx.translate(zombie.x, zombie.y + (zombie.typeKey === 'tank' ? radius * 0.25 : 0));
                this.game._renderGrittyZombieStatus(ctx, zombie, radius, zombie.typeKey,
                    this.game.time || performance.now() * 0.001, 0, zombie.type.eyeColor);
                ctx.restore();
            }
            return true;
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
