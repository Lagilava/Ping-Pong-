class Intro {
    // ────────────────────────────────────────────────
    //  TUNING CONSTANTS – cinematic tweaks
    // ────────────────────────────────────────────────
    static PARTICLE_COUNT = 48;
    static DURATION = 8.8;
    static TRANSITION_SPEED = 2.2;
    static GRID_SEGMENTS = 38;
    static HORIZON_Y_RATIO = 0.395;
    static SCANLINE_ALPHA = 0.085;
    static GRAIN_ALPHA = 0.065;

    static COLORS = {
        bg: '#0a0005',          // near-black with very faint red undertone
        deepPurple: '#14000f',          // dark purple-black for depth/shadows
        neonPink: '#c41e3a',          // deep crimson red (main accent color)
        neonCyan: '#8b008b',          // dark magenta-purple (used sparingly for hints)
        neonPurple: '#4b0082',          // deep indigo-purple (glows, distant elements)
        neonMagenta: '#a52a2a',          // dark red-magenta (chromatic split partner)
        sunsetOrange: '#b22222',          // firebrick red – warm but ominous
        accentYellow: '#d4a017',          // muted gold/amber (sun core accent)
        glowOrange: '#8b0000',          // very dark red glow
        textRed: '#dc143c',          // crimson – strong but not neon-bright
        grid: '#3c0000',          // very dark red grid (almost black in distance)
        sunCore: '#ffd700',          // classic sun gold/yellow – radiant center
        sunHalo: '#ff4500'           // orange-red halo – makes it feel like a real sun
    };


    static MODE_MUSIC = {
        classic: { src: 'assets/audio/axel-f.mp3', volume: 0.70, name: 'Axel F' },
        zombie: { src: 'assets/audio/zombies.mp3', volume: 0.50, name: 'She is not there' },
        gravity: { src: 'assets/audio/space.mp3', volume: 0.60, name: 'Just Blue' },
        obstacle: { src: 'assets/audio/obstacles.mp3', volume: 0.50, name: 'Can you deal with this' },
        speed: { src: 'assets/audio/speed.mp3', volume: 0.50, name: 'I luv u baby' }
    };

    static DEFAULT_MUSIC = {
        src: 'assets/audio/axel-f.mp3',
        volume: 0.50,
        name: 'Axel F (fallback)'
    };

    constructor(game) {
        this.game = game;
        this.canvas = game.canvas;
        this.ctx = game.ctx;
        this.running = false;
        this.time = 0;
        this.duration = Intro.DURATION;
        this.bgColor = Intro.COLORS.bg;
        this.active = false;
        this.impactFlash = 0;
        this.screenShake = 0;

        // extra state for background movement
        this.gridScroll = 0;      // drives vertical scroll of grid
        this.mountainShift = 0;   // horizontal wobble for mountains
        this.cityPhase = 0;       // phase offset used in city height animation

        this.initAudio();
        this.initTextConfigs();
        this.initParticles();
        this.createAnimatedTexts();
    }

    initAudio() {
        if (!this.bgMusic) {
            this.bgMusic = new Audio();
            this.bgMusic.loop = true;
            this.bgMusic.preload = 'auto';
        }

        // Explicitly register intro music with the WebAudio visualizer chain.
        if (this.game?.audio?.attachMediaElementToVisualizer) {
            this.game.audio.attachMediaElementToVisualizer(this.bgMusic);
        } else if (this.game?.audio?.syncMusicVisualizerRouting) {
            this.game.audio.syncMusicVisualizerRouting();
        }
    }


    initTextConfigs() {
        const { neonPink, neonMagenta, textRed } = Intro.COLORS;

        this.textConfigs = [
            {
                phrase: "ARE YOU READY?",
                fontSize: 124,                  // ← reduced from 152
                baseColor: neonPink,
                glowColor: neonMagenta,
                y: 0.38,                        // ← moved a bit higher
                delay: 0.8,
                staggerPerLetter: 0.105,        // ← slower = more dramatic entrance
                entrance: 'letterStagger',
                impactAfterLetters: true,
                spaceWidth: 78                  // ← wider space between words (optional but helps)
            },
            {
                phrase: "CHOOSE YOUR FATE",
                fontSize: 44,                   // ← reduced from 52
                color: textRed,
                glowColor: '#ff3366',
                y: 0.62,                        // ← noticeably more separation (was 0.595)
                delay: 4.4,                     // ← comes in a bit later
                staggerPerLetter: 0.085,
                entrance: 'fadeType',
                alphaMult: 0.80
            }
        ];
    }



    initParticles() {
        this.particles = [];
        for (let i = 0; i < Intro.PARTICLE_COUNT; i++) {
            this.particles.push(this.createParticle());
        }
    }

    createParticle() {
        const r = Math.random();
        if (r < 0.14) return this.createComet();
        if (r < 0.38) return this.createStreak();
        if (r < 0.70) return this.createSpark();
        return this.createFloater();
    }

    createComet() {
        // Meteors fly diagonally from one side across the sky
        const goLeft = Math.random() < 0.5;
        const speed = 300 + Math.random() * 220;
        const angle = 0.22 + Math.random() * 0.16; // ~13–22° below horizontal
        const startOnScreen = Math.random() < 0.55;
        return {
            type: 'comet',
            x: startOnScreen
                ? Math.random() * this.canvas.width
                : (goLeft ? this.canvas.width + 80 : -80),
            y: Math.random() * this.canvas.height * 0.38,
            size: 3.0 + Math.random() * 3.8,
            speedX: goLeft ? -speed * Math.cos(angle) : speed * Math.cos(angle),
            speedY: speed * Math.sin(angle),
            color: `hsl(${24 + Math.random() * 22}, 100%, ${74 + Math.random() * 14}%)`,
            coreColor: '#ffffee',
            alpha: 0.95,
            trailLength: 36,
            trail: [],
            glow: 2.2
        };
    }

    createStreak() {
        // Shooting stars — enter from left or right edge, nearly horizontal
        const goRight = Math.random() < 0.5;
        const speed = 420 + Math.random() * 280;
        const drift = (Math.random() - 0.5) * 0.10; // tiny vertical angle
        const startOnScreen = Math.random() < 0.6;
        return {
            type: 'streak',
            x: startOnScreen
                ? Math.random() * this.canvas.width
                : (goRight ? -(60 + Math.random() * 180) : this.canvas.width + 60 + Math.random() * 180),
            y: this.canvas.height * (0.04 + Math.random() * 0.50),
            size: 1.1 + Math.random() * 2.0,
            speedX: goRight ? speed * Math.cos(Math.abs(drift)) : -speed * Math.cos(Math.abs(drift)),
            speedY: speed * Math.sin(drift),
            color: `hsl(${185 + Math.random() * 55}, 92%, 82%)`,
            alpha: 0.60 + Math.random() * 0.32,
            pulse: Math.random() * Math.PI * 2,
            trail: [],
            maxTrailLength: 22
        };
    }

    createSpark() {
        // Twinkling 4-pointed star sparkles drifting in the sky
        return {
            type: 'spark',
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height * 0.56,
            size: 1.8 + Math.random() * 3.2,
            speedX: (Math.random() - 0.5) * 16,
            speedY: -(5 + Math.random() * 18), // float upward
            color: `hsl(${200 + Math.random() * 140}, 100%, 72%)`,
            alpha: 0.52 + Math.random() * 0.34,
            pulse: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 3.8,
            trail: [],
            maxTrailLength: 3
        };
    }

    createFloater() {
        // Neon ping-pong balls — thematic to the game
        return {
            type: 'ball',
            x: 20 + Math.random() * (this.canvas.width - 40),
            y: 20 + Math.random() * this.canvas.height * 0.44,
            size: 5 + Math.random() * 7,
            speedX: (Math.random() - 0.5) * 85,
            speedY: (Math.random() - 0.5) * 65,
            color: `hsl(${170 + Math.random() * 160}, 88%, 65%)`,
            alpha: 0.38 + Math.random() * 0.30,
            pulse: Math.random() * Math.PI * 2,
            seamAngle: Math.random() * Math.PI,
            seamRotSpeed: 0.4 + Math.random() * 0.7,
            trail: [],
            maxTrailLength: 6
        };
    }

    createAnimatedTexts() {
        this.texts = [];

        this.textConfigs.forEach(config => {
            const phrase = config.phrase;
            const letters = phrase.split('');

            // Compute total width of the full phrase first
            let totalWidth = 0;
            letters.forEach(char => {
                if (char === ' ') {
                    totalWidth += config.spaceWidth || 65;   // ← use per-config space if defined
                } else {
                    totalWidth += this.estimateLetterWidth(char, config.fontSize);
                }
            });

            // Center the whole phrase
            const phraseBaseX = -totalWidth / 2;

            let currentXOffset = 0;

            letters.forEach((char, idx) => {
                if (char === ' ') {
                    currentXOffset += config.spaceWidth || 65;
                    return;
                }

                const letterObj = {
                    char,
                    fontSize: config.fontSize,
                    color: config.baseColor || config.color,
                    glowColor: config.glowColor,
                    y: config.y,
                    delay: config.delay + idx * (config.staggerPerLetter || 0.09),
                    alpha: 0,
                    scale: 0.08,
                    rotation: 0,
                    offsetX: phraseBaseX + currentXOffset,
                    glowIntensity: 0,
                    wobble: 0,
                    stretch: 1.0,
                    entrance: config.entrance,
                    impactTriggered: false,
                    alphaMult: config.alphaMult || 1
                };

                if (config.impactAfterLetters && idx === letters.length - 1) {
                    letterObj.isLastOfGroup = true;
                }

                this.texts.push(letterObj);

                currentXOffset += this.estimateLetterWidth(char, config.fontSize);
            });
        });
    }



    estimateLetterWidth(char, size) {
        // These are tuned multipliers — test visually and adjust if needed
        if (char === ' ') return size * 0.55;   // word space — was too small before

        if (/[MW]/i.test(char)) return size * 1.05;   // very wide letters
        if (/[A]/i.test(char)) return size * 0.95;
        if (/[BDFHKNPQR]/i.test(char)) return size * 0.85;
        if (/[CEGOS]/i.test(char)) return size * 0.78;
        if (/[IJLTfijlr]/i.test(char)) return size * 0.45;  // narrow letters

        if (char === '?') return size * 0.72;
        if (char === '!') return size * 0.55;

        // most uppercase + average
        return size * 0.82;   // ← this was ~0.60 before → too tight
    }


    updateParticles(dt) {
        this.particles.forEach(p => {
            this.updateParticleTrail(p);
            p.x += p.speedX * dt;
            p.y += p.speedY * dt;
            this.handleParticleBoundaries(p);
            p.pulse += dt * (p.type === 'streak' || p.type === 'comet' ? 0.85 : 0.65);
            if (p.type === 'spark' && p.rotSpeed !== undefined) {
                p.rotation += dt * p.rotSpeed;
            }
            if (p.type === 'ball' && p.seamRotSpeed !== undefined) {
                p.seamAngle += dt * p.seamRotSpeed;
            }
            p.alpha = 0.32 + Math.sin(p.pulse * 1.6) * 0.18;
            if (p.type === 'comet' || p.type === 'streak') {
                p.alpha = Math.min(0.95, p.alpha + 0.1);
            } else if (p.type === 'ball') {
                p.alpha = 0.38 + Math.sin(p.pulse * 0.9) * 0.14;
            }
        });
    }

    updateParticleTrail(p) {
        const maxLen = p.maxTrailLength || p.trailLength || 8;
        if (p.trail.length >= maxLen) p.trail.shift();
        p.trail.push({
            x: p.x,
            y: p.y,
            alpha: p.alpha * (p.type === 'comet' ? 0.7 : p.type === 'streak' ? 0.48 : 0.25)
        });
    }

    handleParticleBoundaries(p) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Ping-pong balls bounce within the sky area
        if (p.type === 'ball') {
            if (p.x - p.size < 0) { p.x = p.size; p.speedX = Math.abs(p.speedX); }
            if (p.x + p.size > w) { p.x = w - p.size; p.speedX = -Math.abs(p.speedX); }
            if (p.y - p.size < 0) { p.y = p.size; p.speedY = Math.abs(p.speedY); }
            if (p.y + p.size > h * 0.57) { p.y = h * 0.57 - p.size; p.speedY = -Math.abs(p.speedY); }
            return;
        }

        const outX = p.x < -p.size * 12 || p.x > w + p.size * 12;
        const outY = p.y > h + p.size * 10 || p.y < -p.size * 10;
        if (!outX && !outY) return;

        if (p.type === 'comet') {
            const goLeft = p.speedX < 0;
            p.x = goLeft ? w + 80 : -80;
            p.y = Math.random() * h * 0.38;
        } else if (p.type === 'streak') {
            const goRight = p.speedX > 0;
            p.x = goRight ? -120 : w + 120;
            p.y = h * (0.04 + Math.random() * 0.50);
        } else {
            p.y = -p.size * 6;
            p.x = Math.random() * w;
        }
        p.trail = [];
    }

    update(dt) {
        this.time += dt;
        this.impactFlash = Math.max(this.impactFlash - dt * 9, 0);
        this.screenShake = Math.max(this.screenShake - dt * 18, 0);

        // advance continuous background animation variables
        this.gridScroll += dt * 0.14;      // slow forward motion of grid
        this.mountainShift += dt * 0.18;   // controls side‑to‑side mountain wobble
        this.cityPhase += dt * 0.42;       // drives flickering buildings

        if (areParticleEffectsEnabled()) {
            this.updateParticles(dt);
        } else {
            this.particles.forEach(p => {
                p.trail = [];
            });
        }
        this.updateTexts(dt);

        if (this.time >= this.duration) {
            this.end();
        }
    }

    updateTexts(dt) {
        const t = this.time;

        this.texts.forEach(text => {
            const duration = 1.55;
            const start = text.delay;
            let progress = Math.max(0, Math.min(1, (t - start) / duration));

            if (t >= start) {
                this.updateTextAnimation(text, progress, text.entrance, t);
            }

            if (t > start + duration + 3.2) {
                text.alpha = Math.max(text.alpha - dt * 4.2, 0);
                text.glowIntensity = Math.max(text.glowIntensity - dt * 3.8, 0);
            }

            text.wobble = Math.sin(t * 8.5 + text.delay * 6) * 0.016;
        });
    }

    updateTextAnimation(text, progress, type, time) {
        text.alpha = Math.pow(progress, 1.12) * 1.08;
        text.glowIntensity = Math.min(progress * 2.6, 2.4);

        if (type === 'letterStagger') {
            text.scale = 0.22 + Math.pow(progress, 1.35) * 1.0;
            text.rotation = progress < 0.42 ? Math.sin(time * 28) * 0.07 * (1 - progress) : 0;

            if (text.isLastOfGroup && progress > 0.65 && progress < 0.74 && !text.impactTriggered) {
                this.impactFlash = 2.6;
                this.screenShake = 24;
                text.impactTriggered = true;
            }
        } else if (type === 'fadeType') {
            text.alpha = Math.pow(progress, 0.68) * (text.alphaMult || 0.8);
            text.glowIntensity = progress * 1.35;
            text.scale = 0.88 + progress * 0.24;
        }
    }

    render(dt) {
        this.update(dt);

        this.ctx.save();

        if (this.screenShake > 0.01) {
            const shakeX = (Math.random() - 0.5) * this.screenShake * 6.5;
            const shakeY = (Math.random() - 0.5) * this.screenShake * 6.5;
            this.ctx.translate(shakeX, shakeY);
        }

        this.ctx.clearRect(
            -this.screenShake * 12, -this.screenShake * 12,
            this.canvas.width + this.screenShake * 24,
            this.canvas.height + this.screenShake * 24
        );

        this.renderBackground(dt);
        this.renderTexts();

        this.ctx.restore();
    }

    renderBackground(dt = 0) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        const game = typeof window !== 'undefined' ? window.game : null;
        const settings = game?.customSettings;
        const useCustomTone = !!settings?.previewModeActive;
        const brightness = Number(settings?.backgroundBrightness ?? 1);
        const saturation = Number(settings?.backgroundSaturation ?? 1);
        const contrast = Number(settings?.backgroundContrast ?? 1);
        const bgRenderer = game?.bgRenderer;
        const activeMode = typeof game?.getActiveBackgroundMode === 'function'
            ? game.getActiveBackgroundMode()
            : (game?.gameMode || 'classic');

        if (bgRenderer && typeof bgRenderer.setMode === 'function') {
            if (bgRenderer.mode !== activeMode) {
                bgRenderer.setMode(activeMode);
            }
            if (typeof bgRenderer.update === 'function') {
                bgRenderer.update(dt);
            }
            bgRenderer.render();
            return;
        }

        this.ctx.save();
        if (useCustomTone) {
            this.ctx.filter = `brightness(${brightness}) saturate(${saturation}) contrast(${contrast})`;
        }

        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, w, h);

        this.renderSunset();
        this.renderHorizonGlow();
        this.renderMountains();
        this.renderCityLine();
        this.renderDistantGrid();
        this.renderGrid();
        if (areParticleEffectsEnabled()) {
            this.renderParticles();
        }
        this.renderRimLighting();
        this.renderVignette();
        this.renderScanlines();
        this.renderGrain();
        this.ctx.restore();
    }

    renderSunset() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // bob sun up and down slightly for a living sky effect
        const sunY = h * Intro.HORIZON_Y_RATIO - 80 + Math.sin(this.time * 0.08) * 12;
        const sunX = w * 0.5 + Math.sin(this.time * 0.12) * 40;
        const pulse = 1 + Math.sin(this.time * 1.6) * 0.08;

        this.renderSunRays(sunX, sunY, pulse);
        this.renderSunCore(sunX, sunY, pulse);
        this.renderSunHalo(sunX, sunY);
        this.renderSunLightingOverlay(sunX, sunY, pulse);
    }

    renderSunCore(x, y, pulse) {
        const core = this.ctx.createRadialGradient(x, y, 0, x, y, 60 * pulse);
        core.addColorStop(0, Intro.COLORS.sunCore);
        core.addColorStop(0.4, '#ffbb66');
        core.addColorStop(1, 'rgba(255,180,100,0)');

        this.ctx.fillStyle = core;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 60 * pulse, 0, Math.PI * 2);
        this.ctx.fill();
    }

    renderSunLightingOverlay(x, y, pulse) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, h * 0.8);
        grad.addColorStop(0, 'rgba(255,220,180,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    renderSunHalo(x, y) {
        const halo = this.ctx.createRadialGradient(x, y, 50, x, y, 180);
        halo.addColorStop(0, 'rgba(255,100,180,0.45)');
        halo.addColorStop(0.5, 'rgba(255,60,140,0.18)');
        halo.addColorStop(1, 'rgba(255,40,120,0)');

        this.ctx.fillStyle = halo;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 180, 0, Math.PI * 2);
        this.ctx.fill();
    }

    renderSunRays(x, y, pulse) {
        const ctx = this.ctx;
        const horizonY = this.canvas.height * Intro.HORIZON_Y_RATIO;
        const rayCount = 14;
        const innerR = 70 * pulse;
        const outerR = 175 * pulse;
        const spread = 0.030;

        ctx.save();
        // only draw rays above the horizon line to avoid them popping behind buildings
        ctx.beginPath();
        ctx.rect(0, 0, this.canvas.width, horizonY);
        ctx.clip();

        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2 + this.time * 0.055;
            const lenMod = 0.78 + Math.sin(this.time * 0.95 + i * 1.4) * 0.24;
            const rayGrad = ctx.createLinearGradient(
                x + Math.cos(angle) * innerR,
                y + Math.sin(angle) * innerR,
                x + Math.cos(angle) * outerR * lenMod,
                y + Math.sin(angle) * outerR * lenMod
            );
            rayGrad.addColorStop(0, 'rgba(255,210,90,0.52)');
            rayGrad.addColorStop(0.6, 'rgba(255,130,50,0.14)');
            rayGrad.addColorStop(1, 'rgba(255,80,30,0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, outerR * lenMod, angle - spread, angle + spread);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    renderHorizonGlow() {
        const p = Math.min(this.time / this.duration, 1);
        const hueShift = Math.sin(this.time * 0.09) * 18;
        const baseHue = 260 + p * 80 + hueShift;

        const gradient = this.ctx.createLinearGradient(0, this.canvas.height * 0.28, 0, this.canvas.height);
        gradient.addColorStop(0.00, `hsla(${baseHue}, 60%, 2%, 0)`);
        gradient.addColorStop(0.15, `hsla(${baseHue + 20}, 88%, 8%, 0.42)`);
        gradient.addColorStop(0.30, `hsla(${baseHue + 40}, 96%, 14%, 0.80)`);
        gradient.addColorStop(0.45, `hsla(${baseHue + 60}, 94%, 10%, 0.94)`);
        gradient.addColorStop(0.60, `hsla(${baseHue + 80}, 82%, 6%, 0.98)`);
        gradient.addColorStop(0.75, `hsla(${baseHue + 100}, 70%, 4%, 0.98)`);
        gradient.addColorStop(1.00, `hsla(${baseHue + 120}, 60%, 2%, 1)`);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderMountains() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const horizonY = h * Intro.HORIZON_Y_RATIO;

        // apply a slow horizontal wobble to the mountain silhouette
        // use accumulated phase so speed is decoupled from time scaling
        const sh = Math.sin(this.mountainShift) * 28; // ±28px shift

        this.ctx.fillStyle = 'rgba(20, 0, 40, 0.9)';
        this.ctx.beginPath();
        this.ctx.moveTo(0 + sh, horizonY);
        this.ctx.lineTo(w * 0.15 + sh * 0.7, horizonY - 60 + Math.sin(this.time * 0.3) * 3);
        this.ctx.lineTo(w * 0.25 + sh * 0.6, horizonY - 40 + Math.sin(this.time * 0.33) * 2);
        this.ctx.lineTo(w * 0.4 + sh * 0.4, horizonY - 80 + Math.sin(this.time * 0.28) * 4);
        this.ctx.lineTo(w * 0.55 + sh * 0.2, horizonY - 50 + Math.sin(this.time * 0.35) * 2);
        this.ctx.lineTo(w * 0.7 + sh * 0.1, horizonY - 70 + Math.sin(this.time * 0.32) * 3);
        this.ctx.lineTo(w * 0.85 + sh * 0.05, horizonY - 45 + Math.sin(this.time * 0.29) * 2);
        this.ctx.lineTo(w + sh * 0.01, horizonY - 55 + Math.sin(this.time * 0.31) * 3);
        this.ctx.lineTo(w, horizonY);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.fillStyle = 'rgba(10, 0, 20, 0.95)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, horizonY);
        this.ctx.lineTo(w * 0.1, horizonY - 40);
        this.ctx.lineTo(w * 0.2, horizonY - 70);
        this.ctx.lineTo(w * 0.35, horizonY - 50);
        this.ctx.lineTo(w * 0.5, horizonY - 90);
        this.ctx.lineTo(w * 0.65, horizonY - 60);
        this.ctx.lineTo(w * 0.8, horizonY - 80);
        this.ctx.lineTo(w * 0.9, horizonY - 40);
        this.ctx.lineTo(w, horizonY - 50);
        this.ctx.lineTo(w, horizonY);
        this.ctx.closePath();
        this.ctx.fill();

        // Backlit ridge glow — sunset atmosphere on mountain peaks
        this.ctx.strokeStyle = 'rgba(210, 95, 155, 0.44)';
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 16;
        this.ctx.shadowColor = 'rgba(200, 75, 135, 0.9)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, horizonY);
        this.ctx.lineTo(w * 0.1, horizonY - 40);
        this.ctx.lineTo(w * 0.2, horizonY - 70);
        this.ctx.lineTo(w * 0.35, horizonY - 50);
        this.ctx.lineTo(w * 0.5, horizonY - 90);
        this.ctx.lineTo(w * 0.65, horizonY - 60);
        this.ctx.lineTo(w * 0.8, horizonY - 80);
        this.ctx.lineTo(w * 0.9, horizonY - 40);
        this.ctx.lineTo(w, horizonY - 50);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    renderCityLine() {
        const horizonY = this.canvas.height * Intro.HORIZON_Y_RATIO;
        const w = this.canvas.width;

        // Generate building layout once with a deterministic RNG
        if (!this._cityBuildings) {
            const rng = (() => {
                let s = 73;
                return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
            })();
            this._cityBuildings = [];
            let x = 0;
            while (x < w + 80) {
                const bw = 10 + Math.floor(rng() * 36);
                const bh = 16 + Math.floor(rng() * 70);
                const gap = 1 + Math.floor(rng() * 8);
                const antennaH = rng() > 0.68 ? 8 + Math.floor(rng() * 22) : 0;
                this._cityBuildings.push({ x, w: bw, h: bh, antennaH });
                x += bw + gap;
            }
        }

        const ctx = this.ctx;
        ctx.save();

        // Dark building silhouettes
        ctx.fillStyle = 'rgba(3, 0, 10, 0.97)';
        this._cityBuildings.forEach(b => {
            ctx.fillRect(b.x, horizonY - b.h, b.w, b.h);
            if (b.antennaH > 0) {
                const ax = b.x + b.w * 0.5;
                ctx.fillRect(ax - 1, horizonY - b.h - b.antennaH, 2, b.antennaH);
            }
        });

        // Neon rooftop glow
        ctx.strokeStyle = Intro.COLORS.neonPink;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = Intro.COLORS.neonPink;
        this._cityBuildings.forEach(b => {
            ctx.beginPath();
            ctx.moveTo(b.x, horizonY - b.h);
            ctx.lineTo(b.x + b.w, horizonY - b.h);
            ctx.stroke();
            if (b.antennaH > 0) {
                const ax = b.x + b.w * 0.5;
                ctx.beginPath();
                ctx.moveTo(ax, horizonY - b.h);
                ctx.lineTo(ax, horizonY - b.h - b.antennaH);
                ctx.stroke();
                // Blinking antenna tip
                const blink = 0.5 + Math.sin(this.cityPhase * 3.5 + b.x * 0.09) * 0.5;
                ctx.globalAlpha = blink * 0.85;
                ctx.fillStyle = blink > 0.55 ? '#ff3355' : '#ff7700';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 7;
                ctx.beginPath();
                ctx.arc(ax, horizonY - b.h - b.antennaH, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 10;
                ctx.shadowColor = Intro.COLORS.neonPink;
            }
        });

        // Flickering windows
        ctx.shadowBlur = 4;
        this._cityBuildings.forEach(b => {
            if (b.h < 26) return;
            for (let wy = horizonY - b.h + 5; wy < horizonY - 10; wy += 10) {
                for (let wx = b.x + 3; wx < b.x + b.w - 4; wx += 8) {
                    const flicker = Math.sin(this.cityPhase * 2.6 + wx * 0.52 + wy * 0.37);
                    if (flicker > 0.12) {
                        const bright = 0.20 + flicker * 0.55;
                        ctx.globalAlpha = bright;
                        const warm = Math.sin(wx * 3.3 + wy * 1.9) > 0.65;
                        ctx.fillStyle = warm ? '#ff2244' : '#ffdd66';
                        ctx.shadowColor = ctx.fillStyle;
                        ctx.fillRect(wx, wy, 3, 3);
                    }
                }
            }
        });

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    renderDistantGrid() {
        const horizonY = this.canvas.height * Intro.HORIZON_Y_RATIO;
        const vpX = this.canvas.width / 2;
        const segments = Intro.GRID_SEGMENTS;

        const gridPulse = 0.03 + Math.sin(this.time * 0.18) * 0.015;
        const gridHue = 195 + Math.sin(this.time * 0.11) * 12;
        this.ctx.strokeStyle = `hsla(${gridHue}, 78%, 70%, ${gridPulse})`;
        this.ctx.lineWidth = 0.8;

        // scrolling effect: cycle index so lines appear to move toward viewer
        const move = (this.gridScroll % 1);

        for (let i = 1; i <= segments; i++) {
            // wrap index and compute warped position
            let idx = (i + move * segments) % segments;
            if (idx < 1) idx += segments; // ensure in [1,segments]
            const y = horizonY + (this.canvas.height - horizonY) * Math.pow(idx / segments, 2.2);
            const widthAtY = (y - horizonY) * 2.8;

            this.ctx.beginPath();
            this.ctx.moveTo(vpX - widthAtY / 2, y);
            this.ctx.lineTo(vpX + widthAtY / 2, y);
            this.ctx.stroke();

            if (i % 5 === 0) {
                const fade = 0.3 * (1 - (y - horizonY) / (this.canvas.height - horizonY));
                this.ctx.globalAlpha = fade;
                this.ctx.beginPath();
                this.ctx.moveTo(vpX, horizonY);
                this.ctx.lineTo(vpX - widthAtY * 0.5, y);
                this.ctx.moveTo(vpX, horizonY);
                this.ctx.lineTo(vpX + widthAtY * 0.5, y);
                this.ctx.stroke();
            }
        }
        this.ctx.globalAlpha = 1;
    }

    renderGrid() {
        const horizonY = this.canvas.height * Intro.HORIZON_Y_RATIO;
        const vpX = this.canvas.width / 2;
        const segments = Intro.GRID_SEGMENTS;

        const gridPulse = 0.065 + Math.sin(this.time * 0.18) * 0.032;
        const gridHue = 195 + Math.sin(this.time * 0.11) * 12;
        this.ctx.strokeStyle = `hsla(${gridHue}, 78%, 70%, ${gridPulse})`;
        this.ctx.lineWidth = 1.4;

        const move = (this.gridScroll % 1);

        for (let i = 1; i <= segments; i++) {
            let idx = (i + move * segments) % segments;
            if (idx < 1) idx += segments;
            const y = horizonY + (this.canvas.height - horizonY) * Math.pow(idx / segments, 1.7);
            const widthAtY = (y - horizonY) * 4.6;

            this.ctx.beginPath();
            this.ctx.moveTo(vpX - widthAtY / 2, y);
            this.ctx.lineTo(vpX + widthAtY / 2, y);
            this.ctx.stroke();

            if (i % 4 === 0) {
                const fade = 0.42 * (1 - (y - horizonY) / (this.canvas.height - horizonY));
                this.ctx.globalAlpha = fade;
                this.ctx.beginPath();
                this.ctx.moveTo(vpX, horizonY);
                this.ctx.lineTo(vpX - widthAtY * 0.7, y);
                this.ctx.moveTo(vpX, horizonY);
                this.ctx.lineTo(vpX + widthAtY * 0.7, y);
                this.ctx.stroke();
            }
        }
        this.ctx.globalAlpha = 1;
    }

    renderParticles() {
        this.ctx.shadowBlur = 0;

        this.particles.forEach(p => {
            this.renderParticleTrail(p);
            this.renderParticle(p);
        });

        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
    }

    renderParticleTrail(p) {
        if (p.trail.length < 2) return;
        const ctx = this.ctx;

        if (p.type === 'comet' || p.type === 'streak') {
            // Tapered gradient trail aligned to direction of travel
            const tail = p.trail[0];
            const head = p.trail[p.trail.length - 1];
            const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
            if (p.type === 'comet') {
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(0.5, 'rgba(255,200,80,0.22)');
                grad.addColorStop(1, 'rgba(255,235,160,0.60)');
            } else {
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(0.5, 'rgba(160,230,255,0.18)');
                grad.addColorStop(1, 'rgba(220,248,255,0.52)');
            }
            ctx.save();
            ctx.strokeStyle = grad;
            ctx.lineWidth = p.size * (p.type === 'comet' ? 3.8 : 2.4);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.82;
            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            for (let i = 1; i < p.trail.length; i++) {
                ctx.lineTo(p.trail[i].x, p.trail[i].y);
            }
            ctx.stroke();
            ctx.restore();
        } else {
            p.trail.forEach((pt, i) => {
                const fade = (i + 1) / p.trail.length;
                ctx.globalAlpha = pt.alpha * fade * 0.42;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * fade * 0.55, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }
    }

    renderParticle(p) {
        const ctx = this.ctx;
        ctx.save();

        if (p.type === 'comet') {
            // Glowing meteor head – radial gradient with white-hot core
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = p.size * 9 * p.glow;
            ctx.shadowColor = p.color;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.4);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.18, p.coreColor || '#fffde0');
            grad.addColorStop(0.55, p.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3.4, 0, Math.PI * 2);
            ctx.fill();
            // Tiny bright nucleus
            ctx.shadowBlur = p.size * 3;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = p.alpha * 0.92;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
            ctx.fill();

        } else if (p.type === 'streak') {
            // Shooting star – bright tip with soft halo
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = p.size * 6;
            ctx.shadowColor = p.color;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = p.alpha * 0.50;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2);
            ctx.fill();

        } else if (p.type === 'spark') {
            // 4-pointed star sparkle
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = p.size * 4.5;
            ctx.shadowColor = p.color;
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation || 0);
            const outerR = p.size * 2.7;
            const innerR = p.size * 0.48;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const r = i % 2 === 0 ? outerR : innerR;
                const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            // White hot centre
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = p.alpha * 0.88;
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
            ctx.fill();

        } else if (p.type === 'ball') {
            // Glowing neon ping-pong ball with seam lines
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = p.size * 3.8;
            ctx.shadowColor = p.color;
            const ballGrad = ctx.createRadialGradient(
                p.x - p.size * 0.30, p.y - p.size * 0.32, p.size * 0.06,
                p.x, p.y, p.size
            );
            ballGrad.addColorStop(0, '#ffffff');
            ballGrad.addColorStop(0.28, p.color);
            ballGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
            ctx.fillStyle = ballGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            // Seam lines – two perpendicular arcs like a real ball
            ctx.shadowBlur = 0;
            ctx.globalAlpha = p.alpha * 0.55;
            ctx.strokeStyle = 'rgba(0,0,0,0.42)';
            ctx.lineWidth = Math.max(0.8, p.size * 0.12);
            const sa = p.seamAngle || 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.68, sa, sa + Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.68, sa + Math.PI * 0.5, sa + Math.PI * 1.5);
            ctx.stroke();

        } else {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    renderRimLighting() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const sunX = w * 0.5 + Math.sin(this.time * 0.12) * 40;
        const sunY = h * Intro.HORIZON_Y_RATIO - 80;

        const rim = this.ctx.createRadialGradient(sunX, sunY, 40, sunX - 140, sunY - 220, 720);
        rim.addColorStop(0, 'rgba(255,180,220,0.00)');
        rim.addColorStop(0.18, 'rgba(255,140,180,0.09)');
        rim.addColorStop(0.42, 'rgba(220,80,140,0.17)');
        rim.addColorStop(0.68, 'rgba(180,40,100,0.06)');
        rim.addColorStop(1, 'rgba(0,0,0,0)');

        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.fillStyle = rim;
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.globalCompositeOperation = 'source-over';
    }

    renderVignette() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        const vig = this.ctx.createRadialGradient(w / 2, h / 2, h * 0.18, w / 2, h / 2, h * 1.12);
        vig.addColorStop(0.00, 'rgba(0,0,0,0)');
        vig.addColorStop(0.42, 'rgba(8,0,22,0.32)');
        vig.addColorStop(0.76, 'rgba(0,0,0,0.86)');
        vig.addColorStop(0.93, 'rgba(40,0,80,0.96)');
        vig.addColorStop(1.00, 'rgba(0,0,0,1.0)');

        this.ctx.fillStyle = vig;
        this.ctx.fillRect(0, 0, w, h);
    }

    renderScanlines() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const scanMod = 0.5 + Math.sin(this.time * 1.8) * 0.5;

        this.ctx.fillStyle = `rgba(0,0,0,${Intro.SCANLINE_ALPHA * scanMod})`;
        for (let y = 0; y < h; y += 3) {
            this.ctx.fillRect(0, y, w, 1);
        }
    }

    renderGrain() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.globalAlpha = Intro.GRAIN_ALPHA;
        this.ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            this.ctx.fillRect(x, y, 1.2, 1.2);
        }
        this.ctx.globalAlpha = 1;
    }

    // Remove per-letter centering – we already centered the group
    renderTexts() {
        const cx = this.canvas.width / 2;

        if (this.impactFlash > 0.02) {
            this.ctx.globalAlpha = this.impactFlash * 0.70;
            this.ctx.fillStyle = '#ff0066';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
        }

        this.texts.forEach(item => {
            if (item.alpha < 0.03) return;

            // No more per-letter x adjustment
            const x = cx + item.offsetX;           // ← already includes centering shift
            const y = this.canvas.height * item.y;

            this.renderTextLine(
                item.char,
                item.fontSize,
                item.color,
                item.glowColor,
                x,
                y,
                item
            );
        });
    }

    measureTextWidth(text, size) {
        this.ctx.font = `900 italic ${size}px 'Audiowide', 'Orbitron', 'Arial Black', sans-serif`;
        this.ctx.textAlign = 'left';
        return this.ctx.measureText(text).width;
    }

    renderTextLine(txt, size, color, glowColor, x, y, textState) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(textState.scale, textState.scale * textState.stretch);
        this.ctx.rotate(textState.rotation + textState.wobble);
        this.ctx.globalAlpha = textState.alpha;

        this.ctx.font = `900 italic ${size}px 'Audiowide', 'Orbitron', 'Arial Black', sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        this.ctx.shadowBlur = 74 * textState.glowIntensity;
        this.ctx.shadowColor = glowColor;
        this.ctx.fillStyle = color;
        this.ctx.fillText(txt, 0, 0);

        this.ctx.shadowBlur = 138 * textState.glowIntensity * 0.62;
        this.ctx.globalAlpha *= 0.44;
        this.ctx.fillText(txt, 0, 0);

        if (textState.glowIntensity > 0.68) {
            const split = Math.sin(this.time * 15) * 2.1;

            this.ctx.shadowBlur = 0;
            this.ctx.globalAlpha = textState.alpha * 0.58;

            this.ctx.fillStyle = Intro.COLORS.neonCyan;
            this.ctx.fillText(txt, -5 - split, 0);

            this.ctx.fillStyle = Intro.COLORS.neonPink;
            this.ctx.fillText(txt, 5 + split, 0);
        }

        this.ctx.restore();
    }

    start() {
        if (this.game?.bgRenderer && typeof this.game.getActiveBackgroundMode === 'function' && typeof this.game.bgRenderer.setMode === 'function') {
            this.game.bgRenderer.setMode(this.game.getActiveBackgroundMode());
        }

        this.active = true;
        this.running = true;
        this.time = 0;
        this.impactFlash = 0;
        this.screenShake = 0;

        this.hideGameHUD();
        this.playModeSpecificMusic();

        if (this.game.audio?.playIntro) {
            this.game.audio.playIntro();
        }
    }

    hideGameHUD() {
        if (this.game.hud) {
            this.game.hud.style.opacity = '0';
            this.game.hud.style.pointerEvents = 'none';
        }
    }

    playModeSpecificMusic() {
        const mode = this.game.gameMode || 'classic';
        this.selectedMusic = Intro.MODE_MUSIC[mode] || Intro.DEFAULT_MUSIC;
        const customTrack = typeof this.game.getCustomAudioTrackSource === 'function'
            ? this.game.getCustomAudioTrackSource()
            : null;
        if (customTrack) {
            this.selectedMusic = {
                src: customTrack,
                volume: 0.55,
                name: 'Custom Track'
            };
        }
        const canUseCustomAudioSystem = !!this.game?.audio?.playMusic;

        if (this.game?.audio?.attachMediaElementToVisualizer && this.bgMusic) {
            this.game.audio.attachMediaElementToVisualizer(this.bgMusic);
        } else if (this.game?.audio?.syncMusicVisualizerRouting) {
            this.game.audio.syncMusicVisualizerRouting();
        }

        if (this.game.audio?.enabled === false && typeof this.game.audio.enable === 'function') {
            this.game.audio.enable().catch(err => {
                console.warn('[Music] Failed to enable audio before intro track:', err);
            });
        }

        const isMusicMuted = this.game.audio && this.game.audio.musicMuted;
        const isAudioDisabled = this.game.audio && this.game.audio.enabled === false;

        if (isMusicMuted || isAudioDisabled) {
            console.log(`Music muted: Not playing ${this.selectedMusic.name}`);
            return;
        }

        if (this.game.audio?.stopMusic) {
            this.game.audio.stopMusic('all');
        }

        if (this.selectedMusic?.src && typeof this.game.isHtmlTrackSource === 'function' && this.game.isHtmlTrackSource(this.selectedMusic.src)) {
            this.game.startCustomHtmlTrack(this.selectedMusic.src);
            return;
        }

        if (typeof this.game.stopCustomHtmlTrack === 'function') {
            this.game.stopCustomHtmlTrack();
        }

        if (canUseCustomAudioSystem) {
            this.game.audio.playMusic('track', {
                src: this.selectedMusic.src,
                loop: true,
                volume: this.selectedMusic.volume
            });
        } else {
            if (this.bgMusic && this.bgMusic.pause) {
                this.bgMusic.pause();
                this.bgMusic.currentTime = 0;
            }

            const effectiveVolume = this.game.audio?.getEffectiveMusicVolume
                ? this.game.audio.getEffectiveMusicVolume(this.selectedMusic.volume)
                : this.selectedMusic.volume;

            this.bgMusic.src = this.selectedMusic.src;
            this.bgMusic.volume = effectiveVolume;
            this.bgMusic.load();
            this.bgMusic.currentTime = 0;
            this.bgMusic.play().catch(err => {
                console.warn(`Autoplay blocked for ${this.selectedMusic.name}:`, err);
            });
        }
    }

    end() {
        this.active = false;
        this.running = false;
        this.game.introActive = false;

        this.game.screenFlash = 2.0;

        this.showGameHUD();

        setTimeout(() => {
            this.game.running = true;
            this.game.start();
            if (this.game.ai?.onGameStart) {
                this.game.ai.onGameStart();
            }
        }, 1200);
    }

    showGameHUD() {
        if (this.game.hud) {
            setTimeout(() => {
                this.game.hud.style.transition = 'opacity 0.9s ease-out';
                this.game.hud.style.opacity = '1';
                this.game.hud.style.pointerEvents = 'auto';
            }, 600);
        }
    }

    skip() {
        if (this.active) {
            this.end();
        }
    }
}


// Game
