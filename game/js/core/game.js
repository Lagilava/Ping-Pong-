class Game {
    // Per-mode colour grade, applied inside the existing post-process pass
    // (a few extra multiply-adds per pixel; no extra passes or texture reads).
    //   sat/contrast: global punch; shadow/highlight: split-tone offsets added
    //   to dark/bright areas; tint: overall per-channel gain.
    static MODE_GRADES = {
        // Synthwave sunset: violet shadows, warm highlights.
        classic:   { sat: 1.12, contrast: 1.06, shadow: [0.020, 0.000, 0.035], highlight: [0.030, 0.012, 0.000], tint: [1.00, 1.00, 1.02] },
        // Sickly horror: desaturated, crunchy, teal-green darks, bilious highlights.
        zombie:    { sat: 0.90, contrast: 1.12, shadow: [0.000, 0.025, 0.012], highlight: [0.018, 0.028, -0.010], tint: [0.97, 1.04, 0.94] },
        // Deep space: cold blue shadows, icy cyan highlights.
        gravity:   { sat: 1.15, contrast: 1.08, shadow: [0.000, 0.008, 0.045], highlight: [0.000, 0.018, 0.032], tint: [0.96, 1.00, 1.08] },
        // Hot velocity: magenta shadows, orange highlights, extra punch.
        speed:     { sat: 1.18, contrast: 1.10, shadow: [0.028, 0.000, 0.022], highlight: [0.045, 0.018, -0.010], tint: [1.06, 1.00, 0.95] },
        // Tactical grid: teal shadows, violet highlights.
        obstacle:  { sat: 1.08, contrast: 1.08, shadow: [0.000, 0.022, 0.032], highlight: [0.022, 0.000, 0.028], tint: [1.03, 0.97, 1.06] },
        // Custom matches stay neutral so the player's own colours read true.
        customise: { sat: 1.08, contrast: 1.04, shadow: [0, 0, 0], highlight: [0, 0, 0], tint: [1, 1, 1] },
    };

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        PerfGovernor.attach(this.ctx);

        // GPU post-processing (bloom, ripples, grading). Creating its WebGL
        // context and compiling shaders is the most expensive part of startup
        // and it isn't needed in the menu, so it's built in idle time after the
        // menu appears (or on match start, whichever comes first).
        this.postFx = null;
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
        idle(() => this.ensurePostFx(), { timeout: 2500 });
        PerfGovernor.onChange((tier) => {
            this.postFx?.setQuality(tier.fx);
            PerfGovernor.fxActive = !!this.postFx?.active;
            const dpr = PerfGovernor.renderScale;
            if (Math.abs(this.canvas.width - Math.round(this.width * dpr)) > 1) this.setupCanvas();
        });
        const viewport = this.getViewportSize();
        this.width = viewport.width;
        this.height = viewport.height;
        canvas.width = this.width;
        canvas.height = this.height;

        // Initialize background renderer
        this.bgRenderer = new BackgroundRenderer(this.ctx, this.width, this.height);
        this.audio = new AudioEngine();
        this.particles = new ParticleSystem();
        this.screenFlash = 0;
        this.shockwave = null;
        this.screenShake = 0;
        this.rafId = null;
        this.introRafId = null;
        this.player = null;
        this.aiPaddle = null;
        this.ball = null;
        this.ai = null;
        this.matchEnding = false;
        this.scores = { player: 0, ai: 0 };
        this.rallyCount = 0;
        this.maxRally = 0;
        this.maxScore = 11;
        this.running = false;
        this.paused = false;
        this.userPaused = false;
        this.challengePaused = false;
        this._pausedMediaElements = [];
        this.gameMode = 'classic';
        this.isMultiplayer = false;
        this.customSettings = this.loadCustomSettings();
        this.refreshBallStudioConfig();
        this.comeback = false;
        this.physicsHz = 240;
        this.dt = 1 / this.physicsHz;
        this.accumulator = 0;
        this.lastTime = performance.now() / 1000;
        this.keys = {};
        this.touch = { active: false, id: null, startY: 0, lastY: 0 };
        this.pointerControls = { player: null, ai: null };
        this.mouseX = 0;
        this.mouseY = 0;
        this.obstacles = [];
        this.obstacleCourse = null;
        Obstacle.groups = []; // Initialize obstacle group system
        this.gravityWells = [];
        this.gravityInteractionPhase = 0;
        this.gravityInteraction = {
            activeCount: 0,
            focusX: this.width * 0.5,
            focusY: this.height * 0.5,
            proximity: 0,
            ambient: 0,
            phase: 0,
            nearestDistanceSq: null
        };
        this.powerUps = [];
        this.additionalBalls = [];
        this.lasers = [];
        this.powerUpTimers = {
            slowBall: 0, fastPaddle: 0, freezeAI: 0, doublePoints: 0,
            bigPaddle: 0, smallBall: 0, invincible: 0,
            multiBall: 0, powerShot: 0, timeWarp: 0, magnetPaddle: 0,
            ghostBall: 0, laserPaddle: 0, shrinkOpponent: 0, chaosMode: 0, shield: 0
        };
        this.invincibleTime = 0;
        this.setTimeWarpFactor(1);
        this.shieldActive = { player: false, ai: false };
        this.ghostBallActive = false;
        this.powerShotActive = false;
        this.magnetPaddleActive = false;
        this.scoreElements = {
            player: document.getElementById('playerScore'),
            ai: document.getElementById('aiScore')
        };
        this.scoreDivider = document.querySelector('.score-divider');
        this.speedDisplay = document.getElementById('speedDisplay');
        this.rallyDisplay = document.getElementById('rallyDisplay');
        this.waveDisplay = document.getElementById('waveDisplay');
        this.breachDisplay = document.getElementById('breachDisplay');
        this.zombiePowerDisplay = document.getElementById('zombiePowerDisplay');
        this.zombieProgressOverlay = document.getElementById('zombieProgressOverlay');
        this.zombieProgressWave = document.getElementById('zombieProgressWave');
        this.zombieProgressBreaches = document.getElementById('zombieProgressBreaches');
        this.streakDisplay = document.getElementById('streakDisplay');
        this.difficultyDisplay = document.getElementById('difficultyDisplay');
        this.gameModeDisplay = document.getElementById('gameMode');
        this.hud = document.getElementById('hud');
        this.powerUpsContainer = document.getElementById('powerUpsContainer');
        this.zombieWaveChoice = document.getElementById('zombieWaveChoice');
        this.zombieWaveChoiceTitle = document.getElementById('zombieWaveChoiceTitle');
        this.zombieWaveChoiceCopy = document.getElementById('zombieWaveChoiceCopy');
        this.zombieWaveChoiceTimer = document.getElementById('zombieWaveChoiceTimer');
        this._defaultPowerUpsMarkup = this.powerUpsContainer?.innerHTML || '';
        this._zombieEnemyCatalog = null;
        this._zombiePickupPalette = null;
        this._zombieNextServeDirection = null;
        this._zombieWaveChoiceTimerId = null;
        this._zombieWaveChoiceAutoPickId = null;

        this.speedParticles = [];
        this.speedPulsePhase = 0;
        this.speedBgPhase = 0;
        this.lastHitFlash = 0;
        this.hitFlashDirection = 1;
        this.baseHue = 280;

        this.progression = new ProgressionSystem();
        this.speedChallenge = new SpeedChallenge(this);
        this.notifications = [];
        this._tauntLayoutCache = {
            text: '',
            font: '',
            maxWidth: 0,
            lines: []
        };
        this._perfStats = {
            frameCount: 0,
            frameTimeMs: 0,
            physicsTimeMs: 0,
            renderTimeMs: 0,
            lastFlush: performance.now(),
            snapshot: {
                fps: 0,
                frameMs: 0,
                physicsMs: 0,
                renderMs: 0,
                particles: 0,
                additionalBalls: 0,
                powerUps: 0,
            }
        };
        this.modeSpeeds = {
            classic: { ballBase: 860, ballMax: 1500, paddleMax: 870 },
            zombie: { ballBase: 860, ballMax: 1500, paddleMax: 820 },
            gravity: { ballBase: 860, ballMax: 1500, paddleMax: 850 },
            obstacle: { ballBase: 920, ballMax: 1680, paddleMax: 880 },
            speed: { ballBase: 900, ballMax: 1800, paddleMax: 1000 },
            customise: { ballBase: 860, ballMax: 1500, paddleMax: 870 }
        };
        this.lastRallyMilestone = 0;
        this.zombieState = this.createZombieModeState();

        // Initialize intro system
        this.intro = new Intro(this);
        this.introActive = false;
        this.lastIntroTime = 0;
        this.introHasPlayed = !!window.PP_SKIP_MATCH_INTRO;
        this.boundHandleResize = this.handleResize.bind(this);
        this.boundSyncViewportMetrics = this.syncViewportMetrics.bind(this);
        this.boundHandleBallStudioChange = this.handleBallStudioChange.bind(this);

        this.syncViewportMetrics();
        this.setupCanvas();
        this.setupInput();
        this.bindUI();
        this.createGameObjects();
        this.initializeGameMode();
        // Ensure ball is reset after mode initialization so scaled speeds apply
        if (this.ball && this.center && typeof this.ball.reset === 'function') {
            this.ball.reset(this.center);
        }
        this.resizeTimeout = null;
        window.addEventListener('resize', this.boundHandleResize, { passive: true });
        window.addEventListener('orientationchange', this.boundHandleResize, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.boundHandleResize, { passive: true });
            window.visualViewport.addEventListener('scroll', this.boundSyncViewportMetrics, { passive: true });
        }
        window.addEventListener('storage', this.boundHandleBallStudioChange, { passive: true });
        window.addEventListener('pp-ball-studio-updated', this.boundHandleBallStudioChange, { passive: true });
        this.progression.updateUI();

        // Don't start immediately - wait for intro
        // this.start();

        this.applyCustomiseHudRestrictions();
    }

    _roundRect(ctx, x, y, width, height, radius) {
        let left = x;
        let top = y;
        let w = width;
        let h = height;

        if (w < 0) {
            left += w;
            w = Math.abs(w);
        }

        if (h < 0) {
            top += h;
            h = Math.abs(h);
        }

        radius = Math.max(0, radius || 0);
        radius = Math.min(radius, w / 2, h / 2);

        ctx.beginPath();
        ctx.moveTo(left + radius, top);
        ctx.lineTo(left + w - radius, top);
        ctx.arcTo(left + w, top, left + w, top + radius, radius);
        ctx.lineTo(left + w, top + h - radius);
        ctx.arcTo(left + w, top + h, left + w - radius, top + h, radius);
        ctx.lineTo(left + radius, top + h);
        ctx.arcTo(left, top + h, left, top + h - radius, radius);
        ctx.lineTo(left, top + radius);
        ctx.arcTo(left, top, left + radius, top, radius);
        ctx.closePath();
    }

    _colorWithAlpha(color, alpha) {
        if (!color) return `rgba(255,255,255,${alpha})`;
        if (typeof color !== 'string') return color;

        if (color.startsWith('rgba(')) {
            return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
        }

        if (color.startsWith('rgb(')) {
            return color.replace(/^rgb\(([^)]+)\)$/, `rgba($1, ${alpha})`);
        }

        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const normalized = hex.length === 3
                ? hex.split('').map(ch => ch + ch).join('')
                : hex;
            const r = parseInt(normalized.slice(0, 2), 16);
            const g = parseInt(normalized.slice(2, 4), 16);
            const b = parseInt(normalized.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        return color;
    }

    getDefaultCustomSettings() {
        return {
            previewModeActive: false,
            backgroundMode: 'classic',
            backgroundBrightness: 1,
            backgroundSaturation: 1,
            backgroundContrast: 1,
            backgroundTintA: '#0f6eff',
            backgroundTintB: '#00142f',
            paddleStyle: 'classic',
            leftPaddleColor: '#00ffd6',
            rightPaddleColor: '#ff0044',
            ballColor: '#ffffff',
            ballTrailColor: '#a8ddff',
            audioSource: '',
            audioTrack: '',
            audioCustomPath: '',
            enabledPowerUps: []
        };
    }

    getDefaultCustomPowerUps() {
        return [
            'slowBall', 'fastPaddle', 'doublePoints',
            'bigPaddle', 'smallBall', 'invincible',
            'multiBall', 'powerShot', 'timeWarp',
            'magnetPaddle', 'ghostBall', 'laserPaddle',
            'shrinkOpponent', 'chaosMode', 'shield'
        ];
    }

    getDefaultBallStudioConfig() {
        return {
            version: 1,
            ballColor: '#ffffff',
            trailColor: '#a8ddff',
            glowTint: '#c4f6ff',
            effectMode: 'custom',
            imageSrc: '',
            imageOpacity: 0.85,
            imageBlendMode: 'screen',
            imageFit: 'cover',
            imageScale: 1,
            effectCode: ''
        };
    }

    loadBallStudioConfig() {
        const defaults = this.getDefaultBallStudioConfig();
        try {
            const raw = localStorage.getItem('pp-ball-studio-v1');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const migrated = parsed && typeof parsed === 'object' ? { ...parsed } : {};
            return {
                ...defaults,
                ...migrated,
                ballColor: migrated.ballColor || defaults.ballColor,
                trailColor: migrated.trailColor || defaults.trailColor,
                glowTint: typeof migrated.glowTint === 'string' ? migrated.glowTint : defaults.glowTint,
                imageSrc: typeof migrated.imageSrc === 'string' ? migrated.imageSrc : defaults.imageSrc,
                imageOpacity: Number.isFinite(Number(migrated.imageOpacity)) ? Number(migrated.imageOpacity) : defaults.imageOpacity,
                imageBlendMode: typeof migrated.imageBlendMode === 'string' ? migrated.imageBlendMode : defaults.imageBlendMode,
                imageFit: migrated.imageFit === 'contain' ? 'contain' : 'cover',
                imageScale: Number.isFinite(Number(migrated.imageScale)) ? Number(migrated.imageScale) : defaults.imageScale,
                effectCode: typeof migrated.effectCode === 'string' ? migrated.effectCode : defaults.effectCode,
            };
        } catch (_) {
            return null;
        }
    }

    saveBallStudioConfig(config) {
        const defaults = this.getDefaultBallStudioConfig();
        try {
            const payload = {
                ...defaults,
                ...(config && typeof config === 'object' ? config : {}),
            };
            localStorage.setItem('pp-ball-studio-v1', JSON.stringify(payload));
            window.dispatchEvent(new CustomEvent('pp-ball-studio-updated', { detail: payload }));
        } catch (error) {
            console.warn('Could not save ball studio config:', error);
        }
    }

    refreshBallStudioConfig() {
        this.ballStudioConfig = this.loadBallStudioConfig();
        return this.ballStudioConfig;
    }

    handleBallStudioChange(event) {
        if (event?.type === 'storage' && event.key && event.key !== 'pp-ball-studio-v1') {
            return;
        }

        this.refreshBallStudioConfig();
        this.applyBallStudioConfig();
        this._customBallPreviewRefreshCallback?.();
    }

    applyBallStudioConfig() {
        if (!this.ball) return;

        if (!this.ballStudioConfig) {
            this.ball.clearStudioConfig?.();
            return;
        }

        this.ball.setStudioConfig?.(this.ballStudioConfig);
    }

    getCustomPreviewImageMap() {
        return {
            classic: 'assets/images/customise-previews/classic.png',
            zombie: 'assets/images/customise-previews/zombie.png',
            gravity: 'assets/images/customise-previews/gravity.png',
            speed: 'assets/images/customise-previews/speed.png',
            obstacle: 'assets/images/customise-previews/obstacle.png'
        };
    }

    getCustomPreviewBackgroundEntry(mode) {
        const previewMap = this.getCustomPreviewImageMap();
        const imagePath = previewMap[mode] || previewMap.classic;
        const resolvedPath = typeof window.resolveAssetUrl === 'function'
            ? window.resolveAssetUrl(imagePath)
            : imagePath;

        if (!this._customPreviewBackgroundCache) {
            this._customPreviewBackgroundCache = Object.create(null);
        }

        let entry = this._customPreviewBackgroundCache[mode];
        if (!entry) {
            entry = this._customPreviewBackgroundCache[mode] = {
                source: '',
                image: new Image(),
                loaded: false,
                error: false,
                baseCanvas: null,
                baseCtx: null,
                toneCanvas: null,
                toneCtx: null,
            };

            entry.image.decoding = 'async';
            entry.image.addEventListener('load', () => {
                entry.loaded = true;
                entry.error = false;
                if ((this.gameMode === 'customise' || this.customSettings?.previewModeActive) && this.customSettings?.backgroundMode === mode) {
                    this._customPreviewRefreshCallback?.();
                }
            });
            entry.image.addEventListener('error', () => {
                entry.loaded = false;
                entry.error = true;
                if ((this.gameMode === 'customise' || this.customSettings?.previewModeActive) && this.customSettings?.backgroundMode === mode) {
                    this._customPreviewRefreshCallback?.();
                }
            });
        }

        if (entry.source !== resolvedPath) {
            entry.source = resolvedPath;
            entry.loaded = false;
            entry.error = false;
            if (entry.image.src !== resolvedPath) {
                entry.image.src = resolvedPath;
            }
        }

        if (entry.image.complete && entry.image.naturalWidth > 0) {
            entry.loaded = true;
        }

        return entry;
    }

    preloadCustomPreviewBackgrounds() {
        const previewMap = this.getCustomPreviewImageMap();
        Object.keys(previewMap).forEach(mode => {
            this.getCustomPreviewBackgroundEntry(mode);
        });
    }

    getEnabledCustomPowerUps() {
        const defaults = this.getDefaultCustomPowerUps();
        const configured = Array.isArray(this.customSettings?.enabledPowerUps)
            ? this.customSettings.enabledPowerUps
            : [];
        return configured.filter(type => defaults.includes(type));
    }

    getPowerUpLabelMap() {
        return {
            slowBall: 'Slow Ball',
            fastPaddle: 'Fast Paddle',
            freezeAI: 'Freeze AI',
            doublePoints: 'Double Points',
            bigPaddle: 'Big Paddle',
            smallBall: 'Small Ball',
            invincible: 'Invincible',
            multiBall: 'Multi-Ball',
            powerShot: 'Power Shot',
            timeWarp: 'Time Warp',
            magnetPaddle: 'Magnet Paddle',
            ghostBall: 'Ghost Ball',
            laserPaddle: 'Laser Paddle',
            shrinkOpponent: 'Shrink Opponent',
            chaosMode: 'Chaos Mode',
            shield: 'Shield'
        };
    }

    renderPowerUpHud(types) {
        if (!this.powerUpsContainer) return;

        const labelMap = this.getPowerUpLabelMap();
        const safeTypes = Array.isArray(types) ? types.filter(type => labelMap[type]) : [];

        if (!safeTypes.length) {
            this.powerUpsContainer.innerHTML = '';
            this.powerUpsContainer.hidden = true;
            return;
        }

        this.powerUpsContainer.hidden = false;
        this.powerUpsContainer.innerHTML = safeTypes.map(type => `
            <button class="power-up" id="${type}" type="button" data-powerup="${type}">
                <div class="cooldown"></div>
                <span class="label">${labelMap[type]}</span>
            </button>
        `).join('');
    }

    updateCustomPowerUpVisibility() {
        if (!this.powerUpsContainer) return;

        if (this.gameMode === 'customise' && !this.customSettings.previewModeActive) {
            this.renderPowerUpHud(this.getEnabledCustomPowerUps());
            this.updatePowerUpButtons();
            return;
        }

        if (this._defaultPowerUpsMarkup) {
            this.powerUpsContainer.innerHTML = this._defaultPowerUpsMarkup;
        }
        this.powerUpsContainer.hidden = false;
    }

    loadCustomSettings() {
        const defaults = this.getDefaultCustomSettings();
        try {
            const raw = localStorage.getItem('pp-customise-settings-v1');
            if (!raw) return { ...defaults };
            const parsed = JSON.parse(raw);
            const migrated = parsed && typeof parsed === 'object' ? { ...parsed } : {};
            const validPowerUps = new Set(this.getDefaultCustomPowerUps());
            if (!migrated.leftPaddleColor && migrated.playerPaddleColor) {
                migrated.leftPaddleColor = migrated.playerPaddleColor;
            }
            if (!migrated.rightPaddleColor && migrated.aiPaddleColor) {
                migrated.rightPaddleColor = migrated.aiPaddleColor;
            }
            return {
                ...defaults,
                ...migrated,
                enabledPowerUps: Array.isArray(migrated.enabledPowerUps)
                    ? migrated.enabledPowerUps.filter(type => validPowerUps.has(type))
                    : [],
                paddleStyle: migrated.paddleStyle === 'human' ? 'classic' : (migrated.paddleStyle || defaults.paddleStyle),
                audioSource: '',
                audioTrack: '',
                audioCustomPath: '',
                backgroundBrightness: Number(migrated.backgroundBrightness ?? defaults.backgroundBrightness),
                backgroundSaturation: Number(migrated.backgroundSaturation ?? defaults.backgroundSaturation),
                backgroundContrast: Number(migrated.backgroundContrast ?? defaults.backgroundContrast),
                previewModeActive: false,
            };
        } catch (_) {
            return { ...defaults };
        }
    }

    saveCustomSettings() {
        try {
            if (!this.customSettings) return;
            const validPowerUps = new Set(this.getDefaultCustomPowerUps());
            const payload = {
                ...this.customSettings,
                audioSource: '',
                audioTrack: '',
                audioCustomPath: '',
                paddleStyle: this.customSettings.paddleStyle || 'classic',
                previewModeActive: false,
                enabledPowerUps: Array.isArray(this.customSettings.enabledPowerUps)
                    ? this.customSettings.enabledPowerUps.filter(type => validPowerUps.has(type))
                    : [],
            };
            localStorage.setItem('pp-customise-settings-v1', JSON.stringify(payload));
        } catch (_) { }
    }

    resetCustomSettings() {
        if (this.customAudioRuntimeSource) {
            try {
                URL.revokeObjectURL(this.customAudioRuntimeSource);
            } catch (_) { }
        }
        this.customAudioRuntimeSource = '';
        this.customSettings = this.getDefaultCustomSettings();
        this.saveCustomSettings();
    }

    applyCustomiseHudRestrictions() {
        const isStrictCustom = this.gameMode === 'customise';
        document.body.classList.toggle('customise-strict-hud', isStrictCustom);
    }

    getViewportSize() {
        const viewport = window.visualViewport;
        const fallbackWidth = this.canvas?.parentElement?.clientWidth || document.documentElement.clientWidth || window.innerWidth || 1280;
        const fallbackHeight = this.canvas?.parentElement?.clientHeight || document.documentElement.clientHeight || window.innerHeight || 720;
        return {
            width: Math.max(320, Math.round(viewport?.width || fallbackWidth)),
            height: Math.max(240, Math.round(viewport?.height || fallbackHeight))
        };
    }

    syncViewportMetrics() {
        const { width, height } = this.getViewportSize();
        document.documentElement.style.setProperty('--app-width', `${width}px`);
        document.documentElement.style.setProperty('--app-height', `${height}px`);
    }

    getActiveBackgroundMode() {
        if (this.gameMode === 'customise') {
            return this.customSettings.backgroundMode || 'classic';
        }
        return this.gameMode || 'classic';
    }

    getCustomBackgroundToneFilter() {
        const settings = this.customSettings || {};
        const brightness = Number(settings.backgroundBrightness ?? 1);
        const saturation = Number(settings.backgroundSaturation ?? 1);
        const contrast = Number(settings.backgroundContrast ?? 1);
        return `brightness(${brightness}) saturate(${saturation}) contrast(${contrast})`;
    }

    getCustomAudioTrackSource() {
        if (this.gameMode !== 'customise') return null;
        const runtimeSource = (this.customAudioRuntimeSource || '').trim();
        if (runtimeSource) return runtimeSource;

        const customPath = (this.customSettings.audioCustomPath || '').trim();
        const selectedTrack = (this.customSettings.audioTrack || '').trim();
        const source = this.normalizeCustomAudioSource(customPath) || this.normalizeCustomAudioSource(selectedTrack);
        if (!source) return null;
        if (typeof window.resolveAssetUrl === 'function') {
            return window.resolveAssetUrl(source);
        }
        return source;
    }

    getPendingCustomAudioTrackSource() {
        const runtimeSource = (this.customAudioRuntimeSource || '').trim();
        if (runtimeSource) return runtimeSource;

        const customPath = (this.customSettings.audioCustomPath || '').trim();
        const selectedTrack = (this.customSettings.audioTrack || '').trim();
        const source = this.normalizeCustomAudioSource(customPath) || this.normalizeCustomAudioSource(selectedTrack);
        if (!source) return '';
        if (typeof window.resolveAssetUrl === 'function') {
            return window.resolveAssetUrl(source);
        }
        return source;
    }

    preloadCustomMatchAudio() {
        const source = this.getPendingCustomAudioTrackSource();
        if (!source || this.isHtmlTrackSource(source)) return;
        if (this._customAudioPreloadSource === source && this._customAudioPreloadEl) {
            return;
        }

        this._customAudioPreloadSource = source;
        if (!this._customAudioPreloadEl) {
            this._customAudioPreloadEl = document.createElement('audio');
            this._customAudioPreloadEl.preload = 'auto';
            this._customAudioPreloadEl.muted = true;
            this._customAudioPreloadEl.setAttribute('aria-hidden', 'true');
            this._customAudioPreloadEl.hidden = true;
            document.body.appendChild(this._customAudioPreloadEl);
        }

        if (this._customAudioPreloadEl.src !== source) {
            this._customAudioPreloadEl.src = source;
        }
        this._customAudioPreloadEl.load();
    }

    prepareCustomMatchResources() {
        if (typeof window.ensureAudioEnhancementsLoaded === 'function' && !this._customMatchEnhancementsPromise) {
            this._customMatchEnhancementsPromise = window.ensureAudioEnhancementsLoaded().catch(() => { });
        }

        if (this.audio?.ensureContext) {
            try {
                this.audio.ensureContext();
            } catch (_) { }
        }

        this.preloadCustomMatchAudio();

        return this._customMatchEnhancementsPromise || Promise.resolve();
    }

    normalizeCustomAudioSource(source) {
        const trimmed = (source || '').trim();
        if (!trimmed) return '';
        if (/^search-ms:/i.test(trimmed)) return '';
        if (/^file:/i.test(trimmed)) return '';
        if (/^[a-z]:[\\/]/i.test(trimmed)) return '';
        return trimmed;
    }

    isHtmlTrackSource(source) {
        return /\.html?(?:$|[?#])/i.test(source || '');
    }

    stopCustomHtmlTrack() {
        const frame = document.getElementById('ppCustomTrackFrame');
        if (frame) frame.remove();
    }

    startCustomHtmlTrack(source) {
        if (!source) return;
        this.stopCustomHtmlTrack();
        const frame = document.createElement('iframe');
        frame.id = 'ppCustomTrackFrame';
        frame.src = source;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.display = 'none';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        document.body.appendChild(frame);
    }

    applyCustomiseSettings(previewOnly = false) {
        if (!previewOnly && this.gameMode !== 'customise') {
            this.customSettings.previewModeActive = false;
            this.applyCustomiseHudRestrictions();
            return;
        }

        if (previewOnly && this.gameMode !== 'customise' && !this.customSettings.previewModeActive) {
            this.applyCustomiseHudRestrictions();
            return;
        }

        if (this.player) {
            this.player.setStyle?.(this.customSettings.paddleStyle || 'classic');
            this.player.setBaseColor(this.customSettings.leftPaddleColor);
            this.player.isAI = false;
        }
        if (this.aiPaddle) {
            this.aiPaddle.setStyle?.(this.customSettings.paddleStyle || 'classic');
            this.aiPaddle.setZombieBossSkin(false);
            this.aiPaddle.setBaseColor(this.customSettings.rightPaddleColor);
            this.aiPaddle.isAI = false;
        }
        if (this.ball) {
            this.ball.setCustomColors({
                ballColor: this.customSettings.ballColor,
                trailColor: this.customSettings.ballTrailColor,
            });
            this.applyBallStudioConfig();
        }
        if (this.bgRenderer && typeof this.bgRenderer.setMode === 'function') {
            const activeBackgroundMode = this.getActiveBackgroundMode();
            if (this.bgRenderer.mode !== activeBackgroundMode) {
                this.bgRenderer.setMode(activeBackgroundMode);
            }
        }

        if (this.gameMode === 'customise') {
            if (!previewOnly) {
                this.enforceFairCustomisePaddles();
            }
            this.updateCustomPowerUpVisibility();
        }

        this.applyCustomiseHudRestrictions();
    }

    disablePowerUpsForCustomise() {
        this.powerUps = [];
        this.additionalBalls = [];
        for (const type in this.powerUpTimers) {
            this.powerUpTimers[type] = 0;
        }
        this.setTimeWarpFactor(1);
        this.ghostBallActive = false;
        this.powerShotActive = false;
        this.magnetPaddleActive = false;
        this.invincibleTime = 0;
        this.shieldActive = this.isMultiplayer ? { player: false, ai: false } : false;

        if (this.player) {
            this.player.deactivateLaser?.();
            this.player.resetSize?.();
        }
        if (this.aiPaddle) {
            this.aiPaddle.deactivateLaser?.();
            this.aiPaddle.resetSize?.();
            this.aiPaddle.vel.y = 0;
        }
        this.updatePowerUpButtons?.();
    }

    enforceFairCustomisePaddles() {
        if (this.gameMode !== 'customise' || !this.player || !this.aiPaddle) return;

        const targetWidth = this.player.w;
        const targetHeight = this.player.h;
        this.aiPaddle.w = targetWidth;
        this.aiPaddle.originalHeight = targetHeight;
        this.aiPaddle.h = targetHeight;

        const currentCenter = this.aiPaddle.pos.y + this.aiPaddle.h / 2;
        this.aiPaddle.pos.y = currentCenter - targetHeight / 2;
        this.aiPaddle.clampTo(this.height);
    }

    getResponsivePaddleMetrics() {
        const aspectRatio = this.width / this.height;
        let paddleHFactor = 0.18;
        if (aspectRatio > 2.5) {
            paddleHFactor = 0.14;
        } else if (aspectRatio < 0.5) {
            paddleHFactor = 0.20;
        } else if (aspectRatio >= 0.5 && aspectRatio <= 0.67) {
            paddleHFactor = 0.22;
        }

        let paddleWFactor = 0.015;
        if (this.width < 400) {
            paddleWFactor = 0.018;
        } else if (this.width > 1400) {
            paddleWFactor = 0.014;
        }

        return {
            height: Math.max(50, Math.min(160, Math.floor(this.height * paddleHFactor))),
            width: Math.max(10, Math.min(35, Math.floor(this.width * paddleWFactor))),
            margin: Math.max(16, Math.min(40, this.width * 0.025))
        };
    }

    applyPaddleViewportState(paddle, metrics, x, centerRatio) {
        if (!paddle) return;

        const safeCenterRatio = Number.isFinite(centerRatio) ? centerRatio : 0.5;
        paddle.w = metrics.width;
        paddle.originalHeight = metrics.height;
        paddle.h = metrics.height;
        paddle.pos.x = x;
        paddle.setCenterY(this.height * safeCenterRatio);
        paddle.clampTo(this.height);
        paddle.vel.y = 0;

        if (typeof paddle._initCircuitNodes === 'function') {
            paddle._initCircuitNodes();
        }
    }

    scaleBallViewportState(ball, scaleX, scaleY, radiusScale) {
        if (!ball?.pos || !ball?.prev || !ball?.vel) return;

        ball.pos.x *= scaleX;
        ball.pos.y *= scaleY;
        ball.prev.x *= scaleX;
        ball.prev.y *= scaleY;
        ball.vel.x *= scaleX;
        ball.vel.y *= scaleY;
        ball.r = Math.max(5, Math.min(28, ball.r * radiusScale));
        ball.pos.x = Math.max(ball.r, Math.min(this.width - ball.r, ball.pos.x));
        ball.pos.y = Math.max(ball.r, Math.min(this.height - ball.r, ball.pos.y));
        ball.prev.x = Math.max(ball.r, Math.min(this.width - ball.r, ball.prev.x));
        ball.prev.y = Math.max(ball.r, Math.min(this.height - ball.r, ball.prev.y));
    }

    scalePositionalCollection(items, scaleX, scaleY) {
        if (!Array.isArray(items)) return;

        for (const item of items) {
            if (!item) continue;
            if (item.pos) {
                item.pos.x *= scaleX;
                item.pos.y *= scaleY;
            }
            if (item.prev) {
                item.prev.x *= scaleX;
                item.prev.y *= scaleY;
            }
            if (item.originalPos) {
                item.originalPos.x *= scaleX;
                item.originalPos.y *= scaleY;
            }
            if (item.vel) {
                item.vel.x *= scaleX;
                item.vel.y *= scaleY;
            }
            if (typeof item.x === 'number') item.x *= scaleX;
            if (typeof item.y === 'number') item.y *= scaleY;
            if (typeof item.baseX === 'number') item.baseX *= scaleX;
            if (typeof item.baseY === 'number') item.baseY *= scaleY;
            if (typeof item.w === 'number') item.w *= scaleX;
            if (typeof item.h === 'number') item.h *= scaleY;
            if (typeof item.size === 'number') item.size *= Math.min(scaleX, scaleY);
            if (typeof item.baseSize === 'number') item.baseSize *= Math.min(scaleX, scaleY);
            if (typeof item.auraRadius === 'number') item.auraRadius *= Math.min(scaleX, scaleY);
            if (typeof item.innerGlowSize === 'number') item.innerGlowSize *= Math.min(scaleX, scaleY);
            if (typeof item.outerRingSize === 'number') item.outerRingSize *= Math.min(scaleX, scaleY);
            if (typeof item.orbitRadius === 'number') item.orbitRadius *= Math.min(scaleX, scaleY);
            if (typeof item.waveAmplitude === 'number') item.waveAmplitude *= scaleY;
        }
    }

    getCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        return {
            x: (clientX - rect.left) * (this.width / rect.width),
            y: (clientY - rect.top) * (this.height / rect.height)
        };
    }

    getPointerTarget(canvasX) {
        if (!this.isMultiplayer) return 'player';
        return canvasX >= this.width * 0.5 ? 'ai' : 'player';
    }

    // Mouse/touch set a target; the paddle chases it in updatePaddles with a
    // fast but finite response, so it has real velocity (spin + english work
    // for mouse players) and can't teleport through the ball.
    updatePointerControlledPaddle(target, canvasY) {
        const paddle = target === 'ai' ? this.aiPaddle : this.player;
        if (!paddle) return;
        paddle.pointerTargetY = canvasY;
    }

    followPointerTarget(paddle, dt) {
        if (!Number.isFinite(paddle.pointerTargetY)) { paddle.vel.y *= paddle.friction; return; }
        const centre = paddle.pos.y + paddle.h / 2;
        const error = paddle.pointerTargetY - centre;
        const speedMul = (paddle === this.player && this.powerUpTimers.fastPaddle > 0) ? 1.5 : 1;
        const maxSpeed = 2600 * speedMul;
        // Critically damped approach (~45 ms), capped to a believable top speed.
        const desired = Math.max(-maxSpeed, Math.min(maxSpeed, error * 22));
        paddle.vel.y += (desired - paddle.vel.y) * Math.min(1, dt * 45);
    }

    initSpeedParticles() {
        this.speedParticles = [];
        const count = Math.min(120, Math.floor(this.width * this.height / 1800));
        for (let i = 0; i < count; i++) {
            this.speedParticles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: 1.2 + Math.random() * 2.3,
                speed: 40 + Math.random() * 90,
                angle: Math.random() * Math.PI * 2,
                hue: 260 + Math.random() * 80,
                alpha: 0.4 + Math.random() * 0.5,
                life: 1
            });
        }
    }

    updateSpeedBackground(dt) {
        if (this.gameMode !== 'speed') return;
        if (!areParticleEffectsEnabled()) {
            this.speedParticles = [];
            return;
        }

        this.speedPulsePhase += dt * 2.1;
        this.speedBgPhase += dt * 0.28;

        this.lastHitFlash *= Math.pow(0.06, dt * 60);

        const ballSpeed = this.ball.getSpeed();
        const speedFactor = Math.min(1.8, ballSpeed / 1200);
        const rallyFactor = Math.min(1.4, this.rallyCount / 18);

        const reactivity = 1 + speedFactor * 0.7 + rallyFactor * 0.4;

        for (let i = 0; i < this.speedParticles.length; i++) {
            const p = this.speedParticles[i];
            const dx = p.x - this.width / 2;
            const dy = p.y - this.height / 2;
            const dist = Math.hypot(dx, dy) || 1;

            const radialSpeed = p.speed * (dist / 380) * reactivity * dt;
            p.x += Math.cos(p.angle) * radialSpeed;
            p.y += Math.sin(p.angle) * radialSpeed;

            p.life -= dt * (0.38 + speedFactor * 0.25);

            if (p.life <= 0 ||
                p.x < -80 || p.x > this.width + 80 ||
                p.y < -80 || p.y > this.height + 80) {
                p.x = this.width / 2 + (Math.random() - 0.5) * 140;
                p.y = this.height / 2 + (Math.random() - 0.5) * 140;
                p.angle = Math.random() * Math.PI * 2;
                p.life = 0.8 + Math.random() * 0.7;
                p.alpha = 0.35 + Math.random() * 0.55;
            }
        }
    }

    renderSpeedBackground() {
        if (this.gameMode !== 'speed') return;
        // Always render the speed-mode background (city + sea).
        // Particle-specific behavior is toggled separately.
        const particlesEnabled = areParticleEffectsEnabled();

        const ctx = this.ctx;
        const W = this.width, H = this.height;
        const time = performance.now() * 0.001;

        const ballSpeed = this.ball.getSpeed();
        const speedNorm = Math.min(1.6, ballSpeed / 1100);
        const pulse = 0.88 + Math.sin(this.speedPulsePhase * 2.8) * 0.14 * (1 + speedNorm * 0.4);

        const globalHue = (this.baseHue + this.speedBgPhase * 60 + speedNorm * 80) % 360;

        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        grad.addColorStop(0.00, `hsla(${globalHue}, ${65 + speedNorm * 35}%, ${12 + speedNorm * 8}%, ${0.58 * pulse})`);
        grad.addColorStop(0.35, `hsla(${(globalHue + 30) % 360}, ${75 + speedNorm * 40}%, ${9 + speedNorm * 6}%, ${0.38 * pulse})`);
        grad.addColorStop(0.70, `hsla(${(globalHue + 70) % 360}, ${90 + speedNorm * 30}%, ${6 + speedNorm * 5}%, ${0.22 * pulse})`);
        grad.addColorStop(1.00, `hsla(${(globalHue + 140) % 360}, 70%, 4%, 0.09)`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        if (this.lastHitFlash > 0.02) {
            const flashAlpha = this.lastHitFlash * (0.35 + speedNorm * 0.25);
            const flashHue = this.hitFlashDirection > 0 ? 200 : 340;
            ctx.fillStyle = `hsla(${flashHue}, 80%, 75%, ${flashAlpha * 0.7})`;
            ctx.fillRect(0, 0, W, H);
        }

        // Blade Runner palette
        const skyTop = '#0b0226';
        const skyMid = '#3a004a';
        const skyBottom = '#001f3f';
        const neonCyan = '#00fff6';
        const neonMagenta = '#ff00cc';

        // soft vignette and ambient tint (blend with original radial grad)
        ctx.globalCompositeOperation = 'source-over';

        // Draw distant city silhouette (subtle) — positioned above the sea
        const cityY = H * 0.56;
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,12,0.45)';
        const skylineCount = Math.max(6, Math.floor(W / 120));
        let sx = 0;
        for (let i = 0; i < skylineCount; i++) {
            const bw = 40 + Math.random() * 160;
            const bh = (0.06 + Math.random() * 0.28) * H;
            ctx.fillRect(sx, cityY - bh, bw, bh);
            sx += bw + Math.random() * 30;
        }
        ctx.restore();

        // Render sea with layered sine waves and neon reflections
        const seaTop = cityY + 6;
        const seaHeight = H - seaTop;

        // Base sea fill
        const seaGrad = ctx.createLinearGradient(0, seaTop, 0, H);
        seaGrad.addColorStop(0, '#001a2b');
        seaGrad.addColorStop(0.5, '#001428');
        seaGrad.addColorStop(1, '#000814');
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, seaTop, W, seaHeight);

        // Waves: multiple layers of sine shapes
        ctx.save();
        ctx.translate(0, 0);
        ctx.globalCompositeOperation = 'lighter';
        const waveCount = 3;
        for (let layer = 0; layer < waveCount; layer++) {
            const amp = 6 + layer * 8 + speedNorm * 18;
            const freq = 0.002 + layer * 0.0015 + speedNorm * 0.0015;
            const speed = 0.6 + layer * 0.4 + speedNorm * 1.2;
            const alpha = 0.06 + layer * 0.04 + speedNorm * 0.06;

            const g = ctx.createLinearGradient(0, seaTop, 0, H);
            if (layer === 0) {
                g.addColorStop(0, hexToRgba(neonCyan, 0.22 * (0.7 + layer * 0.2)));
                g.addColorStop(1, 'transparent');
            } else if (layer === 1) {
                g.addColorStop(0, hexToRgba(neonMagenta, 0.14 * (0.7 + layer * 0.2)));
                g.addColorStop(1, 'transparent');
            } else {
                g.addColorStop(0, hexToRgba('#ff8c00', 0.08 * (0.7 + layer * 0.2)));
                g.addColorStop(1, 'transparent');
            }

            ctx.fillStyle = g;
            ctx.beginPath();
            const step = 10;
            ctx.moveTo(0, H);
            for (let x = 0; x <= W + step; x += step) {
                const t = (x * freq) + (time * speed);
                const y = seaTop + (Math.sin(t) * amp) + layer * 6;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.globalAlpha = alpha;
            ctx.fill();
        }
        ctx.restore();

        // Neon reflections of the center glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const centerX = W / 2;
        const reflWidth = W * 0.6;
        const reflGrad = ctx.createLinearGradient(centerX, seaTop, centerX, H);
        reflGrad.addColorStop(0, hexToRgba(neonCyan, 0.18));
        reflGrad.addColorStop(0.3, hexToRgba(neonMagenta, 0.12));
        reflGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = reflGrad;
        ctx.fillRect(centerX - reflWidth / 2, seaTop, reflWidth, seaHeight);
        ctx.restore();

        // Helper: small glow at horizon
        ctx.save();
        const horizonGlow = ctx.createRadialGradient(W / 2, seaTop, 0, W / 2, seaTop, Math.max(W, H) * 0.25);
        horizonGlow.addColorStop(0, hexToRgba(neonMagenta, 0.12));
        horizonGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, seaTop - 40, W, 120);
        ctx.restore();

        // utility: convert hex to rgba string
        function hexToRgba(hex, alpha) {
            const h = hex.replace('#', '');
            const r = parseInt(h.substring(0, 2), 16);
            const g = parseInt(h.substring(2, 4), 16);
            const b = parseInt(h.substring(4, 6), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
    }

    start() {
        if (this.rafId !== null) {
            // Already running
            return;
        }
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;
        this.running = true;
        this.rafId = requestAnimationFrame(() => this.step());
    }

    stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.introRafId !== null) {
            cancelAnimationFrame(this.introRafId);
            this.introRafId = null;
        }
        if (typeof this.audio?.stopAllGravityWellSounds === 'function') {
            this.audio.stopAllGravityWellSounds();
        }
        if (typeof this.setTimeWarpFactor === 'function') {
            this.setTimeWarpFactor(1);
        }
        this.running = false;
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        if (!container) {
            console.error("Canvas setup failed: The canvas element has no parent container.");
            return;
        }
        this.syncViewportMetrics();
        const viewport = this.getViewportSize();
        // Backing-store scale comes from the quality governor (≤ devicePixelRatio).
        const dpr = PerfGovernor.renderScale;
        const width = Math.max(1, Math.round(container.clientWidth || viewport.width));
        const height = Math.max(1, Math.round(container.clientHeight || viewport.height));
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if ('imageSmoothingEnabled' in this.ctx) {
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.width = width;
        this.height = height;
        this.center = new Vec2(this.width / 2, this.height / 2);
        if (typeof this.bgRenderer?.resize === 'function') {
            this.bgRenderer.resize(this.width, this.height);
        }
        if (this.gameMode === 'speed') {
            this.initSpeedParticles();
        }
    }

    handleResize() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            try {
                const previousWidth = Math.max(1, this.width || 1);
                const previousHeight = Math.max(1, this.height || 1);
                const scaleMinPrev = Math.max(1, Math.min(previousWidth, previousHeight));
                const playerCenterRatio = this.player
                    ? (this.player.pos.y + this.player.h / 2) / previousHeight
                    : 0.5;
                const aiCenterRatio = this.aiPaddle
                    ? (this.aiPaddle.pos.y + this.aiPaddle.h / 2) / previousHeight
                    : 0.5;

                this.setupCanvas();

                if (!this.player || !this.aiPaddle || !this.ball) {
                    this.createGameObjects();
                    this.initializeGameMode();
                    return;
                }

                const scaleX = this.width / previousWidth;
                const scaleY = this.height / previousHeight;
                const radiusScale = Math.min(this.width, this.height) / scaleMinPrev;
                const metrics = this.getResponsivePaddleMetrics();

                this.applyPaddleViewportState(this.player, metrics, metrics.margin, playerCenterRatio);
                this.applyPaddleViewportState(
                    this.aiPaddle,
                    metrics,
                    this.width - metrics.margin - metrics.width,
                    aiCenterRatio
                );

                this.scaleBallViewportState(this.ball, scaleX, scaleY, radiusScale);
                this.additionalBalls.forEach(ball => this.scaleBallViewportState(ball, scaleX, scaleY, radiusScale));
                this.scalePositionalCollection(this.powerUps, scaleX, scaleY);
                this.scalePositionalCollection(this.lasers, scaleX, scaleY);

                if (this.ai) {
                    this.ai.canvasW = this.width;
                    this.ai.canvasH = this.height;
                }

                if (this.initializeGameMode) {
                    this.initializeGameMode();
                }

                if (this.ball?.trailPoints instanceof Float32Array) {
                    for (let i = 0; i < this.ball.trailCount * 2; i += 2) {
                        this.ball.trailPoints[i] *= scaleX;
                        this.ball.trailPoints[i + 1] *= scaleY;
                    }
                }

                if (this.gameMode === 'speed') {
                    this.initSpeedParticles();
                }
            } catch (error) {
                console.error("Error during resize handling:", error);
            }
        }, 250);
    }

    createGameObjects() {
        this.refreshBallStudioConfig();

        const paddleMetrics = this.getResponsivePaddleMetrics();
        const paddleH = paddleMetrics.height;
        const paddleW = paddleMetrics.width;

        const isCustomMatch = this.gameMode === 'customise';

        const playerColor = isCustomMatch
            ? (this.customSettings?.leftPaddleColor || '#00ffd6')
            : (getComputedStyle(document.documentElement)
                .getPropertyValue('--player-color')
                .trim() || '#4CAF50');

        const aiColor = isCustomMatch
            ? (this.customSettings?.rightPaddleColor || '#ff0044')
            : (getComputedStyle(document.documentElement)
                .getPropertyValue('--ai-color')
                .trim() || '#F44336');

        // Create core game objects first (always needed)
        const horizontalMargin = paddleMetrics.margin;

        this.player = new Paddle(
            horizontalMargin,
            this.height / 2 - paddleH / 2,
            paddleW,
            paddleH,
            playerColor,
            false
        );

        this.aiPaddle = new Paddle(
            this.width - horizontalMargin - paddleW,
            this.height / 2 - paddleH / 2,
            paddleW,
            paddleH,
            aiColor,
            true
        );

        if (isCustomMatch) {
            const paddleStyle = this.customSettings?.paddleStyle || 'classic';
            this.player.applyCustomPaddleVisualState?.(paddleStyle, playerColor);
            this.aiPaddle.applyCustomPaddleVisualState?.(paddleStyle, aiColor);
        }

        // Ball size: scale based on available space, accounting for aspect ratio
        const minBallSize = Math.max(5, Math.min(12, Math.floor(Math.min(this.width, this.height) * 0.008)));
        const maxBallSize = Math.max(15, Math.min(28, Math.floor(Math.min(this.width, this.height) * 0.025)));
        const ballSize = Math.max(minBallSize, Math.min(maxBallSize, Math.floor(this.height * 0.015)));
        this.ball = new Ball(this.width / 2, this.height / 2, ballSize);
        this.ball.reset(this.center);
        this.applyBallStudioConfig();

        // Default AI difficulty (0-4)
        const aiDifficulty = 2; // Medium difficulty

        // Mode-specific initialization
        if (this.gameMode === 'zombie') {
            // Safety check: only create boss if core objects exist
            if (this.player && this.aiPaddle && this.ball) {
                // Create ZombieBoss AI
                this.ai = new ZombieBoss(this.aiPaddle, this.ball, this);
            } else {
                console.warn(
                    "[createGameObjects] Zombie mode activated but core objects missing → " +
                    "falling back to normal AI"
                );
                // Fallback to normal AI if something went wrong
                this.ai = new AIController(
                    this.aiPaddle,
                    this.ball,
                    this.width,
                    this.height,
                    aiDifficulty
                );
            }
        } else {
            // Normal AI for all other modes
            this.ai = new AIController(
                this.aiPaddle,
                this.ball,
                this.width,
                this.height,
                aiDifficulty
            );
        }

        // Optional: reset any zombie-specific state just in case
        if (this.ai instanceof ZombieBoss) {
            this.ai.reset?.();  // safe call in case reset exists
        }
    }

    bindUI() {
        const restartBtn = document.getElementById('restart');
        if (restartBtn && typeof this.resetMatch === 'function') {
            restartBtn.addEventListener('click', () => this.resetMatch());
        }

        // Menu toggle button - opens cyberbar and pauses game
        const menuToggleBtn = document.getElementById('menuToggleBtn');
        if (menuToggleBtn && typeof this.togglePause === 'function') {
            menuToggleBtn.addEventListener('click', () => {
                this.togglePause();
                const cyberBar = document.getElementById('cyber-control-bar');
                if (cyberBar) {
                    const isVisible = cyberBar.style.opacity === '1';
                    cyberBar.style.opacity = isVisible ? '0' : '1';
                    cyberBar.style.transform = isVisible ? 'translateX(-50%) scale(0.95)' : 'translateX(-50%) scale(1)';
                    cyberBar.style.pointerEvents = isVisible ? 'none' : 'auto';
                    menuToggleBtn.classList.toggle('active', !isVisible);
                }
            });
        }

        const pauseBtn = document.getElementById('pause');
        if (pauseBtn && typeof this.togglePause === 'function') {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }
        const fullscreenBtn = document.getElementById('fullscreen');
        if (fullscreenBtn && typeof this.toggleFullscreen === 'function') {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }
        const diffSlider = document.getElementById('diff');
        if (diffSlider && typeof this.updateDifficultyDisplay === 'function') {
            diffSlider.addEventListener('input', e => {
                const d = Number(e.target.value);
                if (this.ai && typeof this.ai.setDifficulty === 'function') {
                    this.ai.setDifficulty(d);
                }
                this.updateDifficultyDisplay(d);
            });
        }
        const powerUpsContainer = document.getElementById('powerUpsContainer');
        if (powerUpsContainer) {
            powerUpsContainer.addEventListener('click', (event) => {
                const button = event.target.closest('.power-up');
                if (!button || !powerUpsContainer.contains(button)) return;
                if (typeof this.activatePowerUp === 'function') {
                    this.activatePowerUp(button.id);
                }
            });
        }
        document.querySelectorAll('#hud .mode-btn').forEach(btn => {
            if (typeof this.setGameMode === 'function') {
                btn.addEventListener('click', e => {
                    const mode = e.target.dataset.mode;
                    if (mode === 'customise') {
                        if (typeof window.openCustomiseOverlay === 'function') {
                            window.openCustomiseOverlay();
                        }
                        return;
                    }
                    this.setGameMode(mode);
                    document.querySelectorAll('#hud .mode-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                });
            }
        });
        ['keydown', 'mousedown', 'touchstart'].forEach(ev => {
            document.addEventListener(ev, () => {
                try {
                    if (this.audio && typeof this.audio.resume === 'function') {
                        this.audio.resume();
                    }
                } catch (error) {
                    console.error('Failed to resume audio context:', error);
                }
            }, { once: true, passive: true });
        });
        const startBtn = document.getElementById('startBtn');
        const overlay = document.getElementById('overlay');
        const menuModeSelector = document.getElementById('menuModeSelector');
        if (overlay && menuModeSelector) {
            // Multiplayer Selection Logic
            const pvpSelector = document.getElementById('pvpSelector');
            const backToModes = document.getElementById('backToModes');
            const startBtnText = document.getElementById('startBtnText');
            const customiseOverlay = document.getElementById('customiseOverlay');
            const customiseBackBtn = document.getElementById('customiseBackBtn');
            const customisePanel = document.getElementById('customisePanel');
            const customBackgroundMode = document.getElementById('customBackgroundMode');
            const customBgBrightness = document.getElementById('customBgBrightness');
            const customBgSaturation = document.getElementById('customBgSaturation');
            const customBgContrast = document.getElementById('customBgContrast');
            const customBgBrightnessValue = document.getElementById('customBgBrightnessValue');
            const customBgSaturationValue = document.getElementById('customBgSaturationValue');
            const customBgContrastValue = document.getElementById('customBgContrastValue');
            const customPaddleStyle = document.getElementById('customPaddleStyle');
            const customLeftPaddleColor = document.getElementById('customLeftPaddleColor');
            const customRightPaddleColor = document.getElementById('customRightPaddleColor');
            const customBgTintA = document.getElementById('customBgTintA');
            const customBgTintB = document.getElementById('customBgTintB');
            const customAudioTrack = document.getElementById('customAudioTrack');
            const customAudioCustomPath = document.getElementById('customAudioCustomPath');
            const customAudioFilePicker = document.getElementById('customAudioFilePicker');
            const customPowerupsGrid = document.getElementById('customPowerupsGrid');
            const customStartMatchBtn = document.getElementById('customStartMatchBtn');
            const customResetDefaultsBtn = document.getElementById('customResetDefaultsBtn');
            const customPreviewLeftPaddle = document.getElementById('customPreviewLeftPaddle');
            const customPreviewRightPaddle = document.getElementById('customPreviewRightPaddle');
            const openBallStudioBtn = document.getElementById('openBallStudioBtn');
            const customLivePreview = document.getElementById('customiseLivePreview');
            const customLiveBackgroundImage = document.getElementById('customLiveBackgroundImage');
            const customLiveBackgroundCanvas = document.getElementById('customLiveBackgroundCanvas');
            const customPreviewImages = this.getCustomPreviewImageMap ? this.getCustomPreviewImageMap() : {};
            let customPreviewLeftPaddleInstance = null;
            let customPreviewRightPaddleInstance = null;
            let inPvPSelection = false;

            const getSelectedMenuMode = () => {
                const activeBtn = menuModeSelector.querySelector('.mode-btn.active');
                return activeBtn ? activeBtn.dataset.mode : 'classic';
            };

            const renderPaddlePreview = (canvas, paddleInstance, color) => {
                if (!canvas || typeof Paddle !== 'function') return paddleInstance;

                const ctx = canvas.getContext('2d');
                if (!ctx) return paddleInstance;

                const deviceScale = Math.max(1, window.devicePixelRatio || 1);
                const cssWidth = Math.max(260, Math.floor(canvas.clientWidth || 260));
                const cssHeight = Math.max(130, Math.floor(canvas.clientHeight || 130));
                const width = Math.max(1, Math.floor(cssWidth * deviceScale));
                const height = Math.max(1, Math.floor(cssHeight * deviceScale));

                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }

                const paddleHeight = Math.max(88, Math.round(height * 0.78));
                const paddleWidth = Math.max(12, Math.round(paddleHeight * 0.18));

                if (!paddleInstance) {
                    paddleInstance = new Paddle(0, 0, paddleWidth, paddleHeight, color, false);
                }

                paddleInstance.w = paddleWidth;
                paddleInstance.h = paddleHeight;
                paddleInstance.pos.x = 0;
                paddleInstance.pos.y = 0;
                paddleInstance.isAI = false;
                const previewStyle = this.customSettings.paddleStyle || 'classic';
                paddleInstance.applyCustomPaddleVisualState?.(previewStyle, color);
                const previewOffsetX = previewStyle === 'classic' ? 0 : -Math.min(width * 0.1, paddleWidth * 1.25);

                const stage = ctx.createLinearGradient(0, 0, 0, height);
                stage.addColorStop(0, 'rgba(6, 14, 26, 0.96)');
                stage.addColorStop(1, 'rgba(2, 8, 18, 0.98)');
                ctx.fillStyle = stage;
                ctx.fillRect(0, 0, width, height);

                const sweep = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
                sweep.addColorStop(0, 'rgba(0, 212, 255, 0.08)');
                sweep.addColorStop(1, 'transparent');
                ctx.fillStyle = sweep;
                ctx.fillRect(0, 0, width, height);

                ctx.save();
                ctx.translate(width / 2 + previewOffsetX, height / 2);
                if (previewStyle === 'classic') {
                    paddleInstance.renderPlayer(ctx, performance.now() * 0.001, 0, 0.5, 0.8, 0);
                } else {
                    paddleInstance.renderStyledPaddle(ctx, performance.now() * 0.001, 0, 0.5, 0.8, 0, previewStyle);
                }
                ctx.restore();

                return paddleInstance;
            };

            const renderBallPreview = (canvas, ballInstance, ballColor, trailColor) => {
                if (!canvas || typeof Ball !== 'function') return ballInstance;

                const ctx = canvas.getContext('2d');
                if (!ctx) return ballInstance;

                const deviceScale = Math.max(1, window.devicePixelRatio || 1);
                const cssWidth = Math.max(280, Math.floor(canvas.clientWidth || 280));
                const cssHeight = Math.max(104, Math.floor(canvas.clientHeight || 104));
                const width = Math.max(1, Math.floor(cssWidth * deviceScale));
                const height = Math.max(1, Math.floor(cssHeight * deviceScale));

                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }

                const radius = Math.max(10, Math.round(Math.min(width, height) * 0.16));
                const centerX = Math.round(width * 0.5);
                const centerY = Math.round(height * 0.5);
                const angle = -0.28;
                const speed = 820;
                const trailSpacing = radius * 1.35;
                const studioConfig = this.ballStudioConfig || this.loadBallStudioConfig?.();

                if (!ballInstance) {
                    ballInstance = new Ball(centerX, centerY, radius);
                }

                if (studioConfig && typeof ballInstance.setStudioConfig === 'function') {
                    ballInstance.setStudioConfig(studioConfig);
                } else if (typeof ballInstance.clearStudioConfig === 'function') {
                    ballInstance.clearStudioConfig();
                    ballInstance.setCustomColors({
                        ballColor: ballColor || '#ffffff',
                        trailColor: trailColor || '#a8ddff'
                    });
                } else {
                    ballInstance.setCustomColors({
                        ballColor: ballColor || '#ffffff',
                        trailColor: trailColor || '#a8ddff'
                    });
                }

                ballInstance.r = radius;
                ballInstance.pos.set(centerX, centerY);
                ballInstance.prev.set(centerX, centerY);
                ballInstance.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
                ballInstance._speed = speed;
                ballInstance.spin = 0;
                ballInstance.lastHit = null;
                ballInstance.trailCount = Math.min(8, ballInstance.maxTrailPoints);
                ballInstance.particles.length = 0;

                for (let i = 0; i < ballInstance.trailCount; i++) {
                    const idx = i * 2;
                    const progress = (ballInstance.trailCount - i) / Math.max(1, ballInstance.trailCount);
                    ballInstance.trailPoints[idx] = centerX - Math.cos(angle) * trailSpacing * progress * 2.5;
                    ballInstance.trailPoints[idx + 1] = centerY - Math.sin(angle) * trailSpacing * progress * 2.5;
                }

                const stage = ctx.createLinearGradient(0, 0, 0, height);
                stage.addColorStop(0, 'rgba(6, 14, 26, 0.96)');
                stage.addColorStop(1, 'rgba(2, 8, 18, 0.98)');
                ctx.fillStyle = stage;
                ctx.fillRect(0, 0, width, height);

                const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.48);
                glow.addColorStop(0, 'rgba(0, 212, 255, 0.1)');
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, width, height);

                ballInstance.render(ctx, performance.now() * 0.001);
                return ballInstance;
            };

            const renderStaticCustomBackgroundPreview = () => {
                const mode = this.customSettings.backgroundMode || 'classic';
                const deviceScale = Math.max(1, window.devicePixelRatio || 1);
                const width = Math.max(280, Math.floor((customLivePreview?.clientWidth || 620) * deviceScale));
                const height = Math.max(90, Math.floor((customLivePreview?.clientHeight || 130) * deviceScale));

                const previewEntry = this.getCustomPreviewBackgroundEntry(mode);
                const resolvedSource = previewEntry?.source || this.getCustomPreviewImageMap()[mode] || this.getCustomPreviewImageMap().classic;

                if (customLiveBackgroundImage) {
                    customLiveBackgroundImage.style.opacity = '1';
                    customLiveBackgroundImage.style.filter = this.getCustomBackgroundToneFilter();
                    if (customLiveBackgroundImage.getAttribute('src') !== resolvedSource) {
                        customLiveBackgroundImage.src = resolvedSource;
                    }
                }

                if (customLiveBackgroundCanvas) {
                    customLiveBackgroundCanvas.style.display = previewEntry?.loaded ? 'none' : 'block';
                    const ctx = customLiveBackgroundCanvas.getContext('2d');
                    if (!ctx) return;

                    if (customLiveBackgroundCanvas.width !== width || customLiveBackgroundCanvas.height !== height) {
                        customLiveBackgroundCanvas.width = width;
                        customLiveBackgroundCanvas.height = height;
                    }

                    ctx.clearRect(0, 0, width, height);

                    if (!previewEntry?.loaded || !previewEntry.image || previewEntry.image.naturalWidth <= 0) {
                        const fallback = ctx.createLinearGradient(0, 0, 0, height);
                        fallback.addColorStop(0, '#081a70');
                        fallback.addColorStop(0.5, '#051540');
                        fallback.addColorStop(1, '#020820');
                        ctx.fillStyle = fallback;
                        ctx.fillRect(0, 0, width, height);

                        const tint = ctx.createLinearGradient(0, 0, width, height);
                        tint.addColorStop(0, `${this.customSettings.backgroundTintA}2e`);
                        tint.addColorStop(1, `${this.customSettings.backgroundTintB}28`);
                        ctx.fillStyle = tint;
                        ctx.fillRect(0, 0, width, height);
                    }
                }
            };

            this._customPreviewRefreshCallback = renderStaticCustomBackgroundPreview;

            const updateCustomPreview = () => {
                if (customBgBrightnessValue) customBgBrightnessValue.textContent = Number(this.customSettings.backgroundBrightness ?? 1).toFixed(2);
                if (customBgSaturationValue) customBgSaturationValue.textContent = Number(this.customSettings.backgroundSaturation ?? 1).toFixed(2);
                if (customBgContrastValue) customBgContrastValue.textContent = Number(this.customSettings.backgroundContrast ?? 1).toFixed(2);

                if (customPreviewLeftPaddle) {
                    customPreviewLeftPaddleInstance = renderPaddlePreview(
                        customPreviewLeftPaddle,
                        customPreviewLeftPaddleInstance,
                        this.customSettings.leftPaddleColor || '#00ffd6'
                    );
                }
                if (customPreviewRightPaddle) {
                    customPreviewRightPaddleInstance = renderPaddlePreview(
                        customPreviewRightPaddle,
                        customPreviewRightPaddleInstance,
                        this.customSettings.rightPaddleColor || '#ff0044'
                    );
                }
                if (customLivePreview) {
                    customLivePreview.style.background = 'transparent';
                }
                renderStaticCustomBackgroundPreview();
            };

            this._customBallPreviewRefreshCallback = updateCustomPreview;
            window.__ppRefreshCustomBallPreview = updateCustomPreview;

            const refreshCustomPreviewNow = () => {
                updateCustomPreview();
                this._customPreviewRefreshCallback?.();
            };
            window.__ppRefreshCustomPreviewNow = refreshCustomPreviewNow;
            window.__ppRefreshCustomPreview = refreshCustomPreviewNow;

            const syncCustomSettingsFromControls = () => {
                const selectedTrack = customAudioTrack?.value || this.customSettings.audioTrack;
                const typedAudioPath = customAudioCustomPath?.value || '';
                const normalizedTypedAudioPath = this.normalizeCustomAudioSource(typedAudioPath);
                const normalizedSelectedTrack = this.normalizeCustomAudioSource(selectedTrack);
                this.customSettings.backgroundMode = customBackgroundMode?.value || this.customSettings.backgroundMode;
                this.customSettings.backgroundBrightness = Number(customBgBrightness?.value || this.customSettings.backgroundBrightness || 1);
                this.customSettings.backgroundSaturation = Number(customBgSaturation?.value || this.customSettings.backgroundSaturation || 1);
                this.customSettings.backgroundContrast = Number(customBgContrast?.value || this.customSettings.backgroundContrast || 1);
                this.customSettings.paddleStyle = customPaddleStyle?.value || this.customSettings.paddleStyle || 'classic';
                this.customSettings.leftPaddleColor = customLeftPaddleColor?.value || this.customSettings.leftPaddleColor;
                this.customSettings.rightPaddleColor = customRightPaddleColor?.value || this.customSettings.rightPaddleColor;
                this.customSettings.backgroundTintA = customBgTintA?.value || this.customSettings.backgroundTintA;
                this.customSettings.backgroundTintB = customBgTintB?.value || this.customSettings.backgroundTintB;
                this.customSettings.audioTrack = selectedTrack;
                this.customSettings.audioCustomPath = normalizedTypedAudioPath;
                this.customSettings.audioSource = normalizedTypedAudioPath || normalizedSelectedTrack || this.customSettings.audioSource;
                if (customPowerupsGrid) {
                    const checked = Array.from(customPowerupsGrid.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
                    this.customSettings.enabledPowerUps = checked;
                }
                this.saveCustomSettings();
                this.applyCustomiseSettings(true);
                this.preloadCustomMatchAudio();
                refreshCustomPreviewNow();
            };

            window.__ppSyncCustomSettingsFromControls = syncCustomSettingsFromControls;

            const applyCustomSettingsToControls = () => {
                if (customBackgroundMode) customBackgroundMode.value = this.customSettings.backgroundMode || 'classic';
                if (customBgBrightness) customBgBrightness.value = String(this.customSettings.backgroundBrightness ?? 1);
                if (customBgSaturation) customBgSaturation.value = String(this.customSettings.backgroundSaturation ?? 1);
                if (customBgContrast) customBgContrast.value = String(this.customSettings.backgroundContrast ?? 1);
                if (customPaddleStyle) customPaddleStyle.value = this.customSettings.paddleStyle || 'classic';
                if (customLeftPaddleColor) customLeftPaddleColor.value = this.customSettings.leftPaddleColor || '#00ffd6';
                if (customRightPaddleColor) customRightPaddleColor.value = this.customSettings.rightPaddleColor || '#ff0044';
                if (customBgTintA) customBgTintA.value = this.customSettings.backgroundTintA || '#0f6eff';
                if (customBgTintB) customBgTintB.value = this.customSettings.backgroundTintB || '#00142f';
                if (customAudioTrack) customAudioTrack.value = this.customSettings.audioTrack || '';
                if (customAudioCustomPath) customAudioCustomPath.value = this.customSettings.audioCustomPath || '';
                if (customPowerupsGrid) {
                    const enabledSet = new Set(this.getEnabledCustomPowerUps());
                    customPowerupsGrid.querySelectorAll('input[type="checkbox"]').forEach(input => {
                        input.checked = enabledSet.has(input.value);
                    });
                }
                this.preloadCustomPreviewBackgrounds();
                this.preloadCustomMatchAudio();
                refreshCustomPreviewNow();
            };

            window.__ppApplyCustomSettingsToControls = applyCustomSettingsToControls;

            const updateMenuState = () => {
                const selectedMode = getSelectedMenuMode();
                const isCustomMode = selectedMode === 'customise';
                this.customSettings.previewModeActive = isCustomMode;
                customisePanel?.classList.toggle('active', isCustomMode);
                customiseOverlay?.classList.toggle('active', isCustomMode);
                if (customiseOverlay) {
                    customiseOverlay.setAttribute('aria-hidden', isCustomMode ? 'false' : 'true');
                }
                if (isCustomMode) {
                    pvpSelector.classList.remove('active');
                    menuModeSelector.classList.add('hidden');
                    backToModes.classList.add('hidden');
                    startBtn?.classList.add('hidden');
                    inPvPSelection = false;
                    if (startBtnText) startBtnText.textContent = 'Open Customiser';
                    this.isMultiplayer = true;
                    this.preloadCustomPreviewBackgrounds();
                    syncCustomSettingsFromControls();
                    this.prepareCustomMatchResources();
                } else {
                    if (this.bgRenderer) {
                        this.bgRenderer.setMode(selectedMode);
                    }
                    menuModeSelector.classList.remove('hidden');
                    startBtn?.classList.remove('hidden');
                    if (startBtnText) startBtnText.textContent = inPvPSelection ? 'Start Battle' : 'Select Opponent';
                }
            };

            const showCustomiseSelection = () => {
                menuModeSelector.querySelectorAll('.mode-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.mode === 'customise');
                });
                menuModeSelector.classList.remove('hidden');
                pvpSelector.classList.remove('active');
                backToModes.classList.add('hidden');
                startBtn?.classList.add('hidden');
                inPvPSelection = false;
                if (this.bgRenderer) {
                    this.bgRenderer.setMode('classic');
                }
                updateMenuState();
            };

            const openBallStudioFromCustomise = () => {
                try {
                    sessionStorage.setItem('pp-return-to-menu', '1');
                    sessionStorage.setItem('pp-skip-intro', '1');
                } catch (e) {
                    // ignore storage failures
                }
                window.location.href = 'ball-studio.html?from_customise=1';
            };

            const showModeSelection = () => {
                menuModeSelector.querySelectorAll('.mode-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.mode === 'classic');
                });
                menuModeSelector.classList.remove('hidden');
                pvpSelector.classList.remove('active');
                backToModes.classList.add('hidden');
                startBtn.classList.remove('hidden');
                customiseOverlay?.classList.remove('active');
                customiseOverlay?.setAttribute('aria-hidden', 'true');
                inPvPSelection = false;
                if (this.bgRenderer) {
                    this.bgRenderer.setMode('classic');
                }
                updateMenuState();
            };

            window.__ppShowModeSelection = showModeSelection;

            const showPvPSelection = () => {
                if (getSelectedMenuMode() === 'customise') {
                    return;
                }
                menuModeSelector.classList.add('hidden');
                pvpSelector.classList.add('active');
                backToModes.classList.remove('hidden');
                if (startBtnText) startBtnText.textContent = 'Start Battle';
                const selectedOpponent = pvpSelector.querySelector('.pvp-option.selected');
                this.isMultiplayer = selectedOpponent?.dataset.multiplayer === 'true';
                inPvPSelection = true;
            };

            backToModes.addEventListener('click', showModeSelection);
            customiseBackBtn?.addEventListener('click', showModeSelection);
            openBallStudioBtn?.addEventListener('click', openBallStudioFromCustomise);

            pvpSelector.querySelectorAll('.pvp-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    pvpSelector.querySelectorAll('.pvp-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    this.isMultiplayer = opt.dataset.multiplayer === 'true';
                });
            });

            [
                customBackgroundMode,
                customBgBrightness,
                customBgSaturation,
                customBgContrast,
                customPaddleStyle,
                customLeftPaddleColor,
                customRightPaddleColor,
                customBgTintA,
                customBgTintB,
                customAudioTrack,
                customAudioCustomPath
            ].forEach(control => {
                if (!control) return;
                control.addEventListener('input', syncCustomSettingsFromControls);
                control.addEventListener('change', syncCustomSettingsFromControls);
            });

            if (customAudioCustomPath && customAudioFilePicker) {
                customAudioCustomPath.addEventListener('click', () => {
                    customAudioFilePicker.value = '';
                    customAudioFilePicker.click();
                });

                customAudioCustomPath.addEventListener('input', () => {
                    if (this.customAudioRuntimeSource && customAudioCustomPath.value.trim() !== (this.customAudioRuntimeLabel || '')) {
                        try {
                            URL.revokeObjectURL(this.customAudioRuntimeSource);
                        } catch (_) { }
                        this.customAudioRuntimeSource = '';
                        this.customAudioRuntimeLabel = '';
                    }
                });

                customAudioFilePicker.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        if (this.customAudioRuntimeSource) {
                            try {
                                URL.revokeObjectURL(this.customAudioRuntimeSource);
                            } catch (_) { }
                        }
                        this.customAudioRuntimeSource = URL.createObjectURL(file);
                        this.customAudioRuntimeLabel = file.name;
                        customAudioCustomPath.value = file.name;
                        syncCustomSettingsFromControls();
                    }
                });
            }

            if (customPowerupsGrid) {
                customPowerupsGrid.querySelectorAll('input[type="checkbox"]').forEach(input => {
                    input.addEventListener('change', syncCustomSettingsFromControls);
                });
            }

            if (customResetDefaultsBtn) {
                customResetDefaultsBtn.addEventListener('click', () => {
                    this.resetCustomSettings();
                    if (customAudioFilePicker) customAudioFilePicker.value = '';
                    this.customAudioRuntimeLabel = '';
                    applyCustomSettingsToControls();
                    this.applyCustomiseSettings(true);
                    updateCustomPreview();
                });
            }

            const startSelectedMatch = async (forceCustomStart = false) => {
                const selectedMode = forceCustomStart ? 'customise' : getSelectedMenuMode();
                if (selectedMode === 'customise') {
                    syncCustomSettingsFromControls();
                }
                if (!inPvPSelection) {
                    if (selectedMode === 'customise') {
                        if (!forceCustomStart) {
                            showCustomiseSelection();
                            return;
                        }
                        this.isMultiplayer = true;
                    } else {
                        showPvPSelection();
                        return;
                    }
                }

                if (selectedMode === 'customise') {
                    await this.prepareCustomMatchResources();
                } else if (typeof window.ensureAudioEnhancementsLoaded === 'function') {
                    try {
                        await window.ensureAudioEnhancementsLoaded();
                    } catch (error) {
                        console.warn('[Audio] Deferred enhancement load failed:', error);
                    }
                }

                try {
                    // Unlock audio on the same trusted click used to start the match.
                    if (this.audio?.enable) {
                        await this.audio.enable();
                    } else if (this.audio?.resume) {
                        await Promise.resolve(this.audio.resume());
                    }
                } catch (err) {
                    console.warn('[Audio] Failed to unlock on start click:', err);
                }

                if (selectedMode !== 'customise' || this.gameMode !== 'customise') {
                    if (typeof this.setGameMode === 'function') {
                        this.setGameMode(selectedMode);
                    }
                }
                if (selectedMode === 'customise' && typeof this.applyCustomiseSettings === 'function') {
                    this.customSettings.previewModeActive = false;
                    this.applyCustomiseSettings();
                    this.updateCustomPowerUpVisibility?.();
                }
                document.querySelectorAll('#hud .mode-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
                });
                window.__ppAllowOverlayHide = true;
                window.__ppStopOverlayGuard = true;
                window.__ppReleaseOverlayGuard?.();
                this.running = false;
                if (selectedMode === 'customise') {
                    customisePanel?.classList.remove('active');
                    customiseOverlay?.classList.remove('active');
                    customiseOverlay?.setAttribute('aria-hidden', 'true');
                }
                overlay.classList.add('hidden');

                // Set paddle states
                if (selectedMode === 'customise') {
                    this.isMultiplayer = true;
                    if (this.player) this.player.isAI = false;
                    if (this.aiPaddle) this.aiPaddle.isAI = false;
                    this.customSettings.previewModeActive = false;
                    this.updateCustomPowerUpVisibility?.();
                    if (customiseOverlay) {
                        customiseOverlay.classList.remove('active');
                        customiseOverlay.setAttribute('aria-hidden', 'true');
                    }
                    if (customisePanel) {
                        customisePanel.classList.remove('active');
                    }
                    if (overlay) {
                        overlay.classList.add('hidden');
                    }
                    this.running = false;
                    this.startIntro();
                    if (typeof this.startMatchMusic === 'function') {
                        await this.startMatchMusic();
                    }
                    return;
                } else {
                    if (this.player) this.player.isAI = false;
                    if (this.aiPaddle) this.aiPaddle.isAI = !this.isMultiplayer;
                }

                // Start intro immediately
                this.startIntro();

                // Kick off match music within the same user gesture that started the game
                // so autoplay policies don't delay playback.
                if (typeof this.startMatchMusic === 'function') {
                    await this.startMatchMusic();
                }

            };

            window.__ppStartCustomMatchCore = () => startSelectedMatch(true);
            window.__ppStartCustomMatch = window.__ppStartCustomMatchCore;

            startBtn?.addEventListener('click', startSelectedMatch);

            menuModeSelector.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    menuModeSelector.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    updateMenuState();
                });
            });

            applyCustomSettingsToControls();
            this.applyCustomiseSettings(true);
            if (window.PP_OPEN_CUSTOMISE) {
                showCustomiseSelection();
                window.PP_OPEN_CUSTOMISE = false;
            } else {
                updateMenuState();
            }
        }
        // Add skip intro button handler
        const skipIntroBtn = document.getElementById('skipIntro');
        if (skipIntroBtn) {
            skipIntroBtn.addEventListener('click', () => this.skipIntro());
        }
    }

    finalizeIntro() {
        this.introRafId = null;
        // CRITICAL: Reset timing for main game loop
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;

        this.running = true;
        this.introActive = false;
        this.introHasPlayed = true;
        this.lastIntroTime = 0;

        // Make sure game loop is running
        if (this.rafId === null) {
            this.start();
        }

        // Show HUD
        if (this.hud) {
            setTimeout(() => {
                this.hud.style.transition = 'opacity 0.9s ease-out';
                this.hud.style.opacity = '1';
                this.hud.style.pointerEvents = 'auto';
            }, 600);
        }

        // Hide skip button
        const skipBtn = document.getElementById('skipIntro');
        if (skipBtn) skipBtn.classList.add('hidden');

        // Call AI game start callback
        if (this.ai && typeof this.ai.onGameStart === 'function') {
            this.ai.onGameStart();
        }
    }

    startIntro() {
        this.ensurePostFx();
        // Full cinematic on the first match of a session; a short version after
        // that so rematches get to the action quickly. Click/Esc/Skip skips it.
        if (this.intro) {
            this.intro.duration = this._introsPlayed ? 3.4 : Intro.DURATION;
            this._introsPlayed = (this._introsPlayed || 0) + 1;
        }
        const skipButton = document.getElementById('skipIntro');
        if (skipButton && !skipButton.__ppBound) {
            skipButton.__ppBound = true;
            skipButton.addEventListener('click', () => this.skipIntro());
        }
        // If intro was already played or explicitly skipped via query/session flags, skip intro playback.
        if (this.introHasPlayed) {
            this.finalizeIntro();
            return;
        }

        // Reset intro flag for new match — ensures intro plays at start of every match
        this.introHasPlayed = false;

        if (this.introRafId !== null) {
            cancelAnimationFrame(this.introRafId);
            this.introRafId = null;
        }

        // Show skip button
        const skipBtn = document.getElementById('skipIntro');
        if (skipBtn) skipBtn.classList.remove('hidden');

        // Hide HUD during intro
        if (this.hud) {
            this.hud.style.opacity = '0';
            this.hud.style.pointerEvents = 'none';
        }

        // CRITICAL FIX: Reset timing variables before intro starts
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;
        this.running = false; // Set to false during intro
        this.introActive = true;
        this.lastIntroTime = 0;

        this.intro.start();

        // Start the intro loop
        this.introLoop();
    }

    skipIntro() {
        if (this.introActive && this.intro && this.intro.active) {
            this.intro.skip();

            // Hide skip button
            const skipBtn = document.getElementById('skipIntro');
            if (skipBtn) skipBtn.classList.add('hidden');
        }
    }

    ensureMatchSnapshot() {
        if (!this.progression || typeof this.progression.captureMatchSnapshot !== 'function') return;
        if (typeof this.progression.hasMatchSnapshot === 'function' && this.progression.hasMatchSnapshot()) return;
        if (this.progression.matchSnapshot) return;
        this.progression.captureMatchSnapshot();
    }

    introLoop() {
        if (!this.introActive || (!this.intro || !this.intro.running)) {
            this.introRafId = null;
            // CRITICAL: Reset timing for main game loop
            this.lastTime = performance.now() / 1000;
            this.accumulator = 0;

            this.running = true;
            this.introActive = false;

            // Ensure match track is active as gameplay starts.
            this.startMatchMusic();

            // Make sure game loop is running
            if (this.rafId === null) {
                this.start();
            }

            // Show HUD
            if (this.hud) {
                setTimeout(() => {
                    this.hud.style.transition = 'opacity 0.9s ease-out';
                    this.hud.style.opacity = '1';
                    this.hud.style.pointerEvents = 'auto';
                }, 600);
            }

            // Hide skip button
            const skipBtn = document.getElementById('skipIntro');
            if (skipBtn) skipBtn.classList.add('hidden');

            // Call AI game start callback
            if (this.ai && typeof this.ai.onGameStart === 'function') {
                this.ai.onGameStart();
            }
            return;
        }

        // Safety check: ensure intro instance exists
        if (!this.intro) {
            this.introRafId = null;
            return;
        }

        const now = performance.now() / 1000;
        if (!this.lastIntroTime) this.lastIntroTime = now;
        const dt = Math.min(now - this.lastIntroTime, 0.1);
        this.lastIntroTime = now;

        this.pollGamepads();
        this.intro.render(dt);
        this.postFx?.present(dt);
        this.introRafId = requestAnimationFrame(() => this.introLoop());
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.canvas.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    }

    startMatchMusic() {
        const now = Date.now();
        if (this._matchMusicKickAt && now - this._matchMusicKickAt < 1400) {
            return;
        }
        this._matchMusicKickAt = now;

        const mode = this.gameMode || 'classic';
        const musicInfo = Intro.MODE_MUSIC[mode] || Intro.DEFAULT_MUSIC;
        const customMusicSrc = typeof this.getCustomAudioTrackSource === 'function'
            ? this.getCustomAudioTrackSource()
            : null;
        const musicSrc = customMusicSrc || (typeof window.resolveAssetUrl === 'function'
            ? window.resolveAssetUrl(musicInfo.src)
            : musicInfo.src);
        const effectiveMusicInfo = customMusicSrc
            ? { src: customMusicSrc, volume: 0.55, name: 'Custom Track' }
            : musicInfo;

        // Ensure audio context is running before starting music. In some browsers the context
        // can remain suspended even if enabled flag is true, causing delays until another gesture.
        const ensureAudioReady = (this.audio?.ensureContext && typeof this.audio.ensureContext === 'function')
            ? this.audio.ensureContext().catch(() => { })
            : Promise.resolve();

        ensureAudioReady.finally(() => {
            if (this.audio?.enabled === false && typeof this.audio.enable === 'function') {
                this.audio.enable().catch(err => {
                    console.warn('[Music] Failed to enable audio before match track:', err);
                });
            }
        });

        const isMusicMuted = this.audio && this.audio.musicMuted;
        const isAudioDisabled = this.audio && this.audio.enabled === false;
        if (isMusicMuted || isAudioDisabled) {
            return;
        }

        if (customMusicSrc && this.isHtmlTrackSource(customMusicSrc)) {
            if (typeof this.audio?.stopMusic === 'function') {
                this.audio.stopMusic('all');
            }
            this.startCustomHtmlTrack(customMusicSrc);
            return;
        }

        const currentTrack = (this.intro && this.intro.bgMusic) || document.getElementById('bgMusic');
        if (currentTrack && currentTrack.src) {
            try {
                const currentUrl = new URL(currentTrack.src, window.location.href).toString();
                const requestedUrl = new URL(musicSrc, window.location.href).toString();
                if (currentUrl === requestedUrl && !currentTrack.paused) {
                    return;
                }
            } catch (_) {
                if (currentTrack.src === musicSrc && !currentTrack.paused) {
                    return;
                }
            }
        }


        if (this.audio?.playMusic) {
            // Stop all previous music first
            if (this.audio?.stopMusic) {
                this.audio.stopMusic('all');
            }
            this.stopCustomHtmlTrack();

            this.audio.playMusic('match-track', {
                src: musicSrc,
                loop: true,
                volume: effectiveMusicInfo.volume
            });
        } else if (window.Howl) {
            // Fallback: stop old audio and play new
            this.stopCustomHtmlTrack();
            const bgAudio = document.getElementById('bgMusic');
            if (bgAudio) {
                bgAudio.pause();
                bgAudio.currentTime = 0;
                bgAudio.src = musicSrc;
                bgAudio.volume = this.audio?.getEffectiveMusicVolume
                    ? this.audio.getEffectiveMusicVolume(effectiveMusicInfo.volume)
                    : effectiveMusicInfo.volume;
                bgAudio.load();
                bgAudio.play().catch(err => {
                    console.warn(`Autoplay blocked for ${effectiveMusicInfo.name}:`, err);
                });
            }
        }
    }

    setGameMode(mode) {
        // Remove any previous mode classes from body
        document.body.classList.remove('classic-mode', 'zombie-mode', 'gravity-mode', 'speed-mode', 'obstacle-mode', 'customise-mode');
        document.body.classList.add(`${mode}-mode`);
        if (mode === 'obstacle' && typeof this.setupCanvas === 'function') {
            this.setupCanvas();
        }

        // CRITICAL FIX: Stop any ongoing game/intro loop immediately
        this.stop();
        if (this.speedChallenge && typeof this.speedChallenge.terminateChallenge === 'function') {
            this.speedChallenge.terminateChallenge('mode-switch');
        }
        if (typeof this.audio?.stopAllGravityWellSounds === 'function') {
            this.audio.stopAllGravityWellSounds();
        }

        // ✅ CRITICAL FIX: Stop all music when switching modes
        if (typeof this.audio?.stopMusic === 'function') {
            this.audio.stopMusic('all');
        }
        this.stopCustomHtmlTrack();

        // Set the new mode first
        this.gameMode = mode;
        this.postFx?.setGrade(Game.MODE_GRADES[mode] || Game.MODE_GRADES.classic);
        if (mode === 'customise') {
            this.isMultiplayer = true;
        } else {
            this.customSettings.previewModeActive = false;
        }
        this.applyCustomiseHudRestrictions();
        this.gameModeDisplay.textContent = this.getModeDisplayName(mode);

        // Update background renderer
        if (this.bgRenderer) {
            this.bgRenderer.setMode(this.getActiveBackgroundMode());
        }

        // Reset ALL game state (like resetMatch does)
        this.progression.clearRecentlyUnlocked();
        this.scores.player = 0;
        this.scores.ai = 0;
        this.matchEnding = false;
        this.rallyCount = 0;
        this.maxRally = 0;
        this.maxScore = 11;
        this.running = false;
        this.userPaused = false;
        this.challengePaused = false;
        this.paused = false;
        this.syncPauseState();
        this.comeback = false;
        this.physicsHz = 240;
        this.dt = 1 / this.physicsHz;
        this.accumulator = 0;
        this.lastTime = performance.now() / 1000;
        this.keys = {};
        this.touch = { active: false, id: null, startY: 0, lastY: 0 };
        this.mouseX = 0;
        this.mouseY = 0;
        this.obstacles = [];
        this.obstacleCourse = null;
        this.gravityWells = [];
        this.powerUps = [];
        this.zombieHands = [];
        this.resetZombieModeState();
        this.additionalBalls = [];
        this.lasers = [];
        this.powerUpTimers = {
            slowBall: 0, fastPaddle: 0, freezeAI: 0, doublePoints: 0,
            bigPaddle: 0, smallBall: 0, invincible: 0,
            multiBall: 0, powerShot: 0, timeWarp: 0, magnetPaddle: 0,
            ghostBall: 0, laserPaddle: 0, shrinkOpponent: 0, chaosMode: 0, shield: 0
        };
        this.invincibleTime = 0;
        this.setTimeWarpFactor(1);
        this.shieldActive = this.isMultiplayer ? { player: false, ai: false } : false;
        this.ghostBallActive = false;
        this.powerShotActive = false;
        this.magnetPaddleActive = false;

        // Reset intro and flags
        this.introActive = false;
        this.lastIntroTime = 0;

        // Deactivate lasers BEFORE resetting paddles
        if (this.player) this.player.deactivateLaser();
        if (this.aiPaddle) this.aiPaddle.deactivateLaser();

        // Initialize game mode BEFORE resetting ball
        this.initializeGameMode();

        // Reset ball with correct baseSpeed
        this.ball.reset(this.center);
        this.powerUps = [];

        // Reset paddles to center position with zero velocity
        if (this.player) {
            this.player.pos.y = this.height / 2 - this.player.h / 2;
            this.player.vel.y = 0;
            this.player.resetSize();
        }
        if (this.aiPaddle) {
            this.aiPaddle.pos.y = this.height / 2 - this.aiPaddle.h / 2;
            this.aiPaddle.vel.y = 0;
            this.aiPaddle.resetSize();
        }

        if (this.gameMode === 'customise') {
            this.applyCustomiseSettings();
            this.enforceFairCustomisePaddles();
        } else {
            const playerColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--player-color')
                .trim() || '#00ffd6';
            const aiColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--ai-color')
                .trim() || '#ff0044';
            if (this.player) {
                this.player.applyCustomPaddleVisualState?.('classic', playerColor);
            }
            if (this.aiPaddle) {
                this.aiPaddle.applyCustomPaddleVisualState?.('classic', aiColor);
                this.aiPaddle.isAI = !this.isMultiplayer;
            }
            if (this.ball) {
                this.ball.setCustomColors({ ballColor: null, trailColor: null });
            }
        }

        // Recreate AI with clean state
        if (this.gameMode === 'zombie') {
            if (this.player && this.aiPaddle && this.ball) {
                this.ai = new ZombieBoss(this.aiPaddle, this.ball, this);
            } else {
                this.ai = new AIController(
                    this.aiPaddle,
                    this.ball,
                    this.width,
                    this.height,
                    2
                );
            }
        } else if (this.gameMode === 'customise') {
            this.ai = null;
        } else {
            const aiDifficulty = 2; // Medium difficulty
            this.ai = new AIController(
                this.aiPaddle,
                this.ball,
                this.width,
                this.height,
                aiDifficulty
            );
        }

        // Update UI to reflect new mode
        this._setText(this.scoreElements.player, '0');
        this._setText(this.scoreElements.ai, '0');
        this._setText(this.rallyDisplay, '0');
        this._setText(this.streakDisplay, this.progression.winStreak);
        this.syncZombieHUD();

        // Show skip button
        const skipBtn = document.getElementById('skipIntro');
        if (skipBtn) skipBtn.classList.remove('hidden');

        // Hide HUD during intro
        if (this.hud) {
            this.hud.style.opacity = '0';
            this.hud.style.pointerEvents = 'none';
        }

        // Reset timing variables before intro starts
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;
        this.running = false; // Set to false during intro
        this.introActive = true;
        this.introHasPlayed = false; // Reset intro flag for new mode
        this.lastIntroTime = 0;

        // Create fresh Intro instance
        this.intro = new Intro(this);
        this.intro.start();

        // Start the intro loop
        this.introLoop();
    }

    getModeDisplayName(mode) {
        const names = {
            classic: 'Classic Mode',
            zombie: 'Zombie Mode',
            gravity: 'Gravity Mode',
            speed: 'Speed Mode',
            obstacle: 'Obstacle Course',
            customise: 'Customise PvP'
        };
        return names[mode] || 'Classic Mode';
    }

    createZombieModeState() {
        return {
            active: false,
            waveStarted: false,
            wave: 1,
            maxWave: 10,
            kills: 0,
            totalKills: 0,
            waveTarget: 0,
            waveBreaches: 0,
            totalBreaches: 0,
            transitionTimer: 0,
            transitionWave: 0,
            introTimer: 0,
            choicePending: false,
            pendingWave: 0,
            choiceCountdown: 0,
            wavePhase: 0,
            zombies: [],
            spitBalls: [],
            pickups: [],
            breachLimit: 12,
            bossHitsThisWave: 0,
            bossHitsTarget: 2,
            finalBossPrompted: false,
            shieldBlocks: 0,
            powerupChoices: 0,
            powerups: {
                rage: 0,
                slow: 0
            },
            shieldCharges: 0
        };
    }

    isZombieWaveMode() {
        return this.gameMode === 'zombie' && !this.isMultiplayer;
    }

    getZombieEnemyCatalog() {
        if (!this._zombieEnemyCatalog) {
            this._zombieEnemyCatalog = {
                shambler: {
                    color: '#384535',
                    skinColor: '#5a6750',
                    eyeColor: '#d6e88b',
                    accentColor: '#6a493c',
                    shadowColor: '#0b100b',
                    hp: 1,
                    speed: 80,
                    size: 0.060,
                    score: 14,
                    label: 'Shambler'
                },
                runner: {
                    color: '#573331',
                    skinColor: '#7b4a42',
                    eyeColor: '#ff9b6d',
                    accentColor: '#9b5a42',
                    shadowColor: '#160c0c',
                    hp: 1,
                    speed: 180,
                    size: 0.048,
                    score: 24,
                    label: 'Runner'
                },
                tank: {
                    color: '#303846',
                    skinColor: '#4c5862',
                    eyeColor: '#98d8e4',
                    accentColor: '#a99f88',
                    shadowColor: '#0a0d12',
                    hp: 4,
                    speed: 45,
                    size: 0.088,
                    score: 65,
                    label: 'Tank'
                },
                spitter: {
                    color: '#3f4b2e',
                    skinColor: '#687849',
                    eyeColor: '#d7e875',
                    accentColor: '#8fc46d',
                    shadowColor: '#0e1309',
                    hp: 1,
                    speed: 67,
                    size: 0.056,
                    score: 38,
                    label: 'Spitter'
                }
            };
        }
        return this._zombieEnemyCatalog;
    }

    getZombiePickupPalette() {
        if (!this._zombiePickupPalette) {
            this._zombiePickupPalette = {
                rage: { color: '#ff5a1f', accent: '#ffd59d', label: 'Rage' },
                shield: { color: '#42b6ff', accent: '#d9f4ff', label: 'Shield' },
                slow: { color: '#68ff95', accent: '#d8ffe0', label: 'Slow' }
            };
        }
        return this._zombiePickupPalette;
    }

    resetZombieModeState() {
        this.hideZombieWaveChoice();
        this.zombieState = this.createZombieModeState();
        this._zombieNextServeDirection = null;
        this.syncZombieHUD();
    }

    hideZombieWaveChoice() {
        if (this._zombieWaveChoiceTimerId) {
            clearInterval(this._zombieWaveChoiceTimerId);
            this._zombieWaveChoiceTimerId = null;
        }
        if (this._zombieWaveChoiceAutoPickId) {
            clearTimeout(this._zombieWaveChoiceAutoPickId);
            this._zombieWaveChoiceAutoPickId = null;
        }
        if (this.zombieWaveChoice) {
            this.zombieWaveChoice.classList.remove('visible');
            this.zombieWaveChoice.setAttribute('aria-hidden', 'true');
        }
    }

    showZombieWaveChoice(nextWave) {
        if (!this.isZombieWaveMode()) {
            this.startZombieWave(nextWave);
            return;
        }

        const state = this.zombieState;
        if (!this.zombieWaveChoice) {
            this.startZombieWave(nextWave);
            return;
        }

        this.hideZombieWaveChoice();
        state.choicePending = true;
        state.pendingWave = nextWave;
        state.choiceCountdown = 8;

        if (this.zombieWaveChoiceTitle) {
            this.zombieWaveChoiceTitle.textContent = `Wave ${nextWave} reward`;
        }
        if (this.zombieWaveChoiceCopy) {
            this.zombieWaveChoiceCopy.textContent = 'Pick one powerup before the horde advances.';
        }
        if (this.zombieWaveChoiceTimer) {
            this.zombieWaveChoiceTimer.textContent = 'Auto-pick in 8s';
        }

        this.zombieWaveChoice.classList.add('visible');
        this.zombieWaveChoice.setAttribute('aria-hidden', 'false');
        this.setChallengePaused(true);
        this.showNotification('Wave Clear', `Choose a reward for wave ${nextWave}`, '#ffd166');
        this.audio?.zombieChoice?.();

        const buttons = this.zombieWaveChoice.querySelectorAll('.zombie-wave-choice-btn');
        buttons.forEach(button => {
            button.onclick = () => this.applyZombieWaveChoice(button.dataset.powerup || 'shield');
        });

        this._zombieWaveChoiceTimerId = setInterval(() => {
            if (!this.zombieState?.choicePending) {
                this.hideZombieWaveChoice();
                return;
            }

            state.choiceCountdown = Math.max(0, state.choiceCountdown - 1);
            if (this.zombieWaveChoiceTimer) {
                this.zombieWaveChoiceTimer.textContent = state.choiceCountdown > 0
                    ? `Auto-pick in ${state.choiceCountdown}s`
                    : 'Auto-picking shield';
            }

            if (state.choiceCountdown <= 0) {
                this.applyZombieWaveChoice('shield', true);
            }
        }, 1000);

        this._zombieWaveChoiceAutoPickId = setTimeout(() => {
            if (this.zombieState?.choicePending) {
                this.applyZombieWaveChoice('shield', true);
            }
        }, 8000);
    }

    applyZombieWaveChoice(type, autoSelected = false) {
        const state = this.zombieState;
        if (!state || !state.choicePending) {
            this.hideZombieWaveChoice();
            this.setChallengePaused(false);
            return;
        }

        const nextWave = state.pendingWave || (state.wave + 1);
        state.choicePending = false;
        state.pendingWave = 0;
        state.choiceCountdown = 0;
        state.powerupChoices += 1;
        this.progression.incrementAchievementProgress('zombieTactician', 1);
        state.transitionWave = nextWave;
        state.transitionTimer = 0.18;

        this.hideZombieWaveChoice();
        try {
            this.applyZombiePickup(type);
            if (autoSelected) {
                this.showNotification('Auto-pick', `${type.toUpperCase()} selected for the next wave`, '#9fffab');
            }
        } catch (error) {
            console.warn('[ZombieMode] Failed to apply wave reward, continuing safely:', error);
        } finally {
            this.setChallengePaused(false);
            this.running = true;
            this.introActive = false;
            this.lastTime = performance.now() / 1000;
        }
    }

    syncZombieHUD() {
        const state = this.zombieState;
        const zombieMode = this.isZombieWaveMode();
        const rageSeconds = Math.ceil(state.powerups.rage || 0);
        const slowSeconds = Math.ceil(state.powerups.slow || 0);
        const currentWave = Math.min(state.wave, state.maxWave);
        const wavesLeft = Math.max(0, state.maxWave - currentWave);
        const resetBreachesForWaveStart = zombieMode && (state.choicePending || state.transitionTimer > 0 || state.introTimer > 0);
        const breachesLeft = resetBreachesForWaveStart
            ? state.breachLimit
            : Math.max(0, state.breachLimit - state.waveBreaches);
        const boostParts = [];
        if (state.shieldCharges > 0) boostParts.push(`Shield x${state.shieldCharges}`);
        if (rageSeconds > 0) boostParts.push(`Rage ${rageSeconds}s`);
        if (slowSeconds > 0) boostParts.push(`Slow ${slowSeconds}s`);

        const set = (el, v) => this._setText(el, v);
        if (this.scoreElements?.player && this.scoreElements?.ai) {
            if (zombieMode) {
                set(this.scoreElements.player, `${currentWave}/${state.maxWave}`);
                set(this.scoreElements.ai, `${breachesLeft} left`);
                this.scoreElements.player.setAttribute('data-score-label', 'wave');
                this.scoreElements.ai.setAttribute('data-score-label', 'breaches left');
            } else {
                this.scoreElements.player.removeAttribute('data-score-label');
                this.scoreElements.ai.removeAttribute('data-score-label');
            }
        }
        set(this.scoreDivider, zombieMode ? '/' : '—');

        set(this.waveDisplay, zombieMode ? `W ${currentWave}/${state.maxWave}` : '-');
        set(this.breachDisplay, zombieMode ? `B ${breachesLeft}/${state.breachLimit}` : '-');
        set(this.zombiePowerDisplay, zombieMode ? (boostParts.length ? boostParts.join(' | ') : 'None') : '-');

        if (this.zombieProgressOverlay && this._zombieOverlayShown !== zombieMode) {
            this._zombieOverlayShown = zombieMode;
            this.zombieProgressOverlay.classList.toggle('visible', zombieMode);
            this.zombieProgressOverlay.setAttribute('aria-hidden', zombieMode ? 'false' : 'true');
        }
        if (zombieMode) {
            this._setHTML(this.zombieProgressWave, `Wave <strong>${currentWave}/${state.maxWave}</strong>`);
            this._setHTML(this.zombieProgressBreaches, `Breaches <strong>${breachesLeft}/${state.breachLimit}</strong>`);
        }

        if (this.gameModeDisplay) {
            if (zombieMode) {
                set(this.gameModeDisplay, 'Zombie Mode');
            } else if (this.gameMode === 'obstacle' && this.obstacleCourse?.getCourseStatusText) {
                set(this.gameModeDisplay, this.obstacleCourse.getCourseStatusText());
            } else {
                set(this.gameModeDisplay, this.getModeDisplayName(this.gameMode));
            }
        }
    }

    getZombieWaveComposition(wave) {
        const composition = [];
        const count = Math.min(4 + wave * 2, wave >= 10 ? 20 : 18);

        for (let i = 0; i < count; i++) {
            const roll = Math.random();
            let typeKey = 'shambler';

            if (wave >= 8 && roll > 0.82) {
                typeKey = 'tank';
            } else if (wave >= 5 && roll > 0.56) {
                typeKey = 'spitter';
            } else if (wave >= 2 && roll > 0.32) {
                typeKey = 'runner';
            }

            composition.push(typeKey);
        }

        if (wave >= 4 && !composition.includes('spitter')) {
            composition[0] = 'spitter';
        }
        if (wave >= 7 && !composition.includes('tank')) {
            composition[composition.length - 1] = 'tank';
        }
        if (wave === 10) {
            composition[0] = 'tank';
            composition[1] = 'tank';
            composition[2] = 'spitter';
            composition[3] = 'runner';
        }

        return composition;
    }

    spawnZombieEnemy(typeKey) {
        const catalog = this.getZombieEnemyCatalog();
        const definition = catalog[typeKey] || catalog.shambler;
        const state = this.zombieState;
        const wave = state.wave || 1;
        const radius = Math.max(16, this.height * definition.size * 0.5);
        const left = this.width * 0.27;
        const right = this.width * 0.73;
        const top = radius + 18;
        const bottom = this.height - radius - 18;
        let x = this.width * 0.5;
        let y = this.height * 0.5;

        for (let attempt = 0; attempt < 10; attempt++) {
            const nextX = left + Math.random() * Math.max(1, right - left);
            const nextY = top + Math.random() * Math.max(1, bottom - top);
            let overlaps = false;

            for (let i = 0; i < state.zombies.length; i++) {
                const other = state.zombies[i];
                const spacing = (other.radius + radius) * 1.15;
                const dx = nextX - other.x;
                const dy = nextY - other.y;
                if (dx * dx + dy * dy < spacing * spacing) {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps) {
                x = nextX;
                y = nextY;
                break;
            }
        }

        const speedScale = (this.height / 720) * (1 + wave * 0.035);
        const baseSpeed = definition.speed * speedScale;
        const variant = Math.floor(Math.random() * 4);
        const visualScale = 0.9 + Math.random() * 0.22;
        const asymmetry = (Math.random() - 0.5) * 0.34;
        const decayPattern = Array.from({ length: 5 }, () => ({
            x: (Math.random() - 0.5) * 1.45,
            y: (Math.random() - 0.5) * 1.8,
            r: 0.08 + Math.random() * 0.14,
            rot: Math.random() * Math.PI,
            tone: Math.random()
        }));
        const tearPattern = Array.from({ length: 4 }, () => ({
            x: (Math.random() - 0.5) * 1.55,
            y: -0.25 + Math.random() * 1.35,
            len: 0.18 + Math.random() * 0.32,
            sway: (Math.random() - 0.5) * 0.22
        }));
        const scarPattern = Array.from({ length: 3 }, () => ({
            x: (Math.random() - 0.5) * 0.9,
            y: -0.85 + Math.random() * 1.2,
            len: 0.22 + Math.random() * 0.34,
            rot: -0.9 + Math.random() * 1.8
        }));

        state.zombies.push({
            typeKey,
            type: definition,
            x,
            y,
            vx: 0,
            vy: 0,
            radius,
            hp: definition.hp,
            maxHp: definition.hp,
            baseSpeed,
            homeX: x,
            homeY: y,
            phaseOffset: Math.random() * Math.PI * 2,
            wobble: Math.random() * Math.PI * 2,
            wobbleDir: Math.random() > 0.5 ? 1 : -1,
            animSeed: Math.random() * Math.PI * 2,
            animPhase: Math.random() * Math.PI * 2,
            visual: {
                variant,
                visualScale,
                asymmetry,
                scarAngle: Math.random() * Math.PI * 2,
                shoulderBias: (Math.random() - 0.5) * 0.4,
                eyeOffset: (Math.random() - 0.5) * 0.18,
                rotTint: Math.random(),
                posture: 0.78 + Math.random() * 0.42,
                hunch: 0.72 + Math.random() * 0.5,
                jawSlack: Math.random(),
                limbThinness: 0.72 + Math.random() * 0.45,
                gaitDrag: 0.35 + Math.random() * 0.55,
                clothHue: Math.random(),
                boneHue: Math.random(),
                decayPattern,
                tearPattern,
                scarPattern
            },
            anim: null,
            flash: 0,
            hitCooldown: 0,
            spitTimer: 4 + Math.random() * 0.8,
            dead: false
        });
    }

    spawnZombiePickup(type) {
        const palette = this.getZombiePickupPalette();
        const pickup = palette[type];
        if (!pickup) return;

        this.zombieState.pickups.push({
            type,
            x: this.width * 0.34 + Math.random() * this.width * 0.32,
            y: this.height * 0.15 + Math.random() * this.height * 0.7,
            r: Math.max(14, this.width * 0.018),
            pulse: Math.random() * Math.PI * 2,
            life: 12,
            color: pickup.color,
            accent: pickup.accent
        });
    }

    primeZombieBall(direction = -1, stationary = false) {
        if (!this.ball || !this.center) return;

        this.ball.reset(this.center);
        this.ball.pos.set(this.center.x, this.center.y);
        this.ball.prev.set(this.center.x, this.center.y);

        if (stationary) {
            this.ball.vel.set(0, 0);
            this.ball._speed = 0;
            return;
        }

        const dir = direction >= 0 ? 1 : -1;
        this.ball.vel.x = Math.abs(this.ball.vel.x) * dir;
        this.ball.vel.y *= 0.7;
        this.ball._speed = this.ball.vel.len();
    }

    resetZombieWaveActors() {
        if (this.player) {
            this.player.pos.y = this.height / 2 - this.player.h / 2;
            this.player.vel.y = 0;
            this.player.resetSize();
        }
        if (this.aiPaddle) {
            this.aiPaddle.pos.y = this.height / 2 - this.aiPaddle.h / 2;
            this.aiPaddle.vel.y = 0;
            this.aiPaddle.resetSize();
        }
        this.primeZombieBall(-1, true);
    }

    startZombieWave(wave) {
        const state = this.zombieState;
        if (!this.isZombieWaveMode()) return;
        if (!state || !this.ball || !this.player || !this.aiPaddle) {
            console.warn('[ZombieMode] startZombieWave aborted: missing state or core actors', {
                state: !!state,
                ball: !!this.ball,
                player: !!this.player,
                aiPaddle: !!this.aiPaddle
            });
            this.setChallengePaused(false);
            return;
        }

        this.running = true;
        this.introActive = false;
        this.resetZombieWaveActors();

        if (wave > state.maxWave) {
            this.finishZombieMode(true);
            return;
        }

        this.hideZombieWaveChoice();

        state.active = true;
        state.waveStarted = true;
        state.wave = wave;
        state.kills = 0;
        state.waveTarget = 0;
        state.waveBreaches = 0;
        state.transitionTimer = 0;
        state.transitionWave = 0;
        state.introTimer = 1.45;
        state.choicePending = false;
        state.pendingWave = 0;
        state.choiceCountdown = 0;
        state.zombies = [];
        state.spitBalls = [];
        state.pickups = [];
        state.bossHitsThisWave = 0;
        state.bossHitsTarget = wave >= 10 ? 4 : (wave >= 7 ? 3 : 2);
        state.finalBossPrompted = false;
        state.wavePhase = 0;

        const composition = this.getZombieWaveComposition(wave);
        state.waveTarget = composition.length;
        composition.forEach(typeKey => this.spawnZombieEnemy(typeKey));

        if (wave === 1 || wave % 2 === 0 || Math.random() < 0.45) {
            const pickupTypes = ['rage', 'shield', 'slow'];
            this.spawnZombiePickup(pickupTypes[Math.floor(Math.random() * pickupTypes.length)]);
        }

        if (this.ai instanceof ZombieBoss && typeof this.ai.configureForWave === 'function') {
            this.ai.configureForWave(wave, state.maxWave);
        }

        this.primeZombieBall(-1, true);
        this.audio?.zombieWave?.();
        if (wave === 1) {
            this.showNotification(
                `Wave ${wave}`,
                `${state.waveTarget} undead incoming · survive 10 waves before 7 breaches`,
                '#7dff9b'
            );
        } else {
            this.showNotification(`Wave ${wave}`, `${state.waveTarget} undead incoming`, '#7dff9b');
        }
        this.syncZombieHUD();
    }

    queueZombieNextWave() {
        const state = this.zombieState;
        if (!this.isZombieWaveMode() || this.matchEnding) return;

        if (state.wave >= state.maxWave) {
            this.finishZombieMode(true);
            return;
        }

        const nextWave = state.wave + 1;
        this.running = true;
        this.introActive = false;
        this.setChallengePaused(false);
        state.introTimer = 0;
        state.spitBalls = [];
        state.pickups = [];
        this.primeZombieBall(-1, true);
        this.showZombieWaveChoice(nextWave);
    }

    addZombieScore(points) {
        this.scores.player += Math.max(0, Math.round(points));
        if (!this.isZombieWaveMode()) {
            this._setText(this.scoreElements.player, this.scores.player);
        }
    }

    tryConsumeZombieShield(message = 'Shield absorbed the hit') {
        const state = this.zombieState;
        if (state.shieldCharges > 0) {
            state.shieldCharges--;
            state.shieldBlocks += 1;
            this.progression.incrementAchievementProgress('zombieShieldBearer', 1);
            this.showNotification('Shield!', message, '#42b6ff');
            this.particles.spawnGodTierHit(
                this.player.pos.x + this.player.w * 0.5,
                this.player.pos.y + this.player.h * 0.5,
                '#42b6ff',
                780
            );
            this.syncZombieHUD();
            return true;
        }
        return false;
    }

    applyZombiePickup(type) {
        const state = this.zombieState;
        if (!state) return;
        this.progression?.recordPowerUpUsed?.();
        if (type === 'rage') {
            state.powerups.rage = 8;
            this.showNotification('Rage!', 'Your returns hit harder and faster', '#ff5a1f');
        } else if (type === 'slow') {
            state.powerups.slow = 7;
            this.showNotification('Rot Slow!', 'The horde lurches in molasses', '#68ff95');
        } else if (type === 'shield') {
            state.shieldCharges = Math.min(3, state.shieldCharges + 1);
            this.showNotification('Shield!', 'Blocks fire breath, spits, and a breach', '#42b6ff');
        }
        this.audio?.powerUp?.();
        this.syncZombieHUD();
    }

    applyZombieBreach(reason = 'The horde broke through') {
        const state = this.zombieState;
        if (this.tryConsumeZombieShield('The shield held the line')) {
            this._zombieNextServeDirection = 1;
            this.primeZombieBall(1);
            return;
        }

        state.waveBreaches += 1;
        state.totalBreaches += 1;
        this.audio.score();
        this.audio?.zombieBreach?.();
        this.screenShake = Math.max(this.screenShake, 12);
        this.resetRally();

        if (this.ai && typeof this.ai.onAIScore === 'function') {
            this.ai.onAIScore();
        }

        if (state.waveBreaches >= state.breachLimit) {
            this.finishZombieMode(false);
            return;
        }

        const left = Math.max(0, state.breachLimit - state.waveBreaches);
        this.showNotification('Breach!', `${reason} · ${left} breaches left`, '#ff7043');
        this._zombieNextServeDirection = 1;
    }

    handleZombieGoalScore() {
        const state = this.zombieState;
        const baseScore = 40 + state.wave * 12;
        const rageBonus = state.powerups.rage > 0 ? 24 : 0;
        const scoreGain = baseScore + rageBonus;

        this.addZombieScore(scoreGain);
        this.progression.recordPoint('player', 1);
        this.audio.score();
        this.audio?.zombieHit?.();
        this.resetRally();

        state.bossHitsThisWave++;

        if (this.ai && typeof this.ai.onPlayerScore === 'function') {
            this.ai.onPlayerScore();
        }

        this.showNotification('Gate Breached!', `+${scoreGain} score`, '#91ff75');

        if (state.wave === state.maxWave && state.zombies.length === 0 && state.bossHitsThisWave >= state.bossHitsTarget) {
            this.finishZombieMode(true);
            return;
        }

        this._zombieNextServeDirection = -1;
    }

    finishZombieMode(playerWon) {
        if (this.matchEnding) return;

        const state = this.zombieState;
        this.hideZombieWaveChoice();
        this.setChallengePaused(false);
        const clearedWaves = playerWon
            ? state.maxWave
            : Math.max(1, Math.min(state.wave, state.maxWave));
        const summaryHtml = playerWon
            ? `Survivor Wins!<br>Waves Cleared: ${state.maxWave}/${state.maxWave}<br>Breaches Taken: ${this.scores.ai}/${state.breachLimit}<br>Undead Score: ${this.scores.player}<br>Mode: Zombie Mode`
            : `Horde Wins!<br>Reached Wave: ${Math.min(state.wave, state.maxWave)}/${state.maxWave}<br>Breaches Taken: ${this.scores.ai}/${state.breachLimit}<br>Undead Score: ${this.scores.player}<br>Goal: survive 10 waves before 7 breaches<br>Mode: Zombie Mode`;

        this.finishMatch(playerWon, {
            delayMs: 1100,
            summaryHtml,
            matchStats: {
                playerScore: clearedWaves,
                aiScore: this.scores.ai,
                maxScore: state.maxWave,
                wavesCleared: clearedWaves,
                zombieShieldBlocks: state.shieldBlocks,
                zombiePowerChoices: state.powerupChoices
            }
        });
    }

    updateZombieMode(dt) {
        if (!this.isZombieWaveMode() || this.matchEnding) return;

        const state = this.zombieState;
        state.active = true;

        if (!state.waveStarted) {
            this.startZombieWave(1);
            return;
        }

        state.powerups.rage = Math.max(0, state.powerups.rage - dt);
        state.powerups.slow = Math.max(0, state.powerups.slow - dt);

        if (state.transitionTimer > 0) {
            state.transitionTimer -= dt;
            if (state.transitionTimer <= 0) {
                this.startZombieWave(state.transitionWave || (state.wave + 1));
            }
            this.syncZombieHUD();
            return;
        }

        if (state.introTimer > 0) {
            state.introTimer -= dt;
            if (state.introTimer <= 0) {
                state.introTimer = 0;
                this._zombieNextServeDirection = -1;
                this.primeZombieBall(-1, false);
                this.showNotification('Fight!', 'Wave is live', '#ffd166');
            } else {
                this.ball.vel.set(0, 0);
                this.ball._speed = 0;
            }
            this.syncZombieHUD();
            return;
        }

        if (state.choicePending) {
            this.syncZombieHUD();
            return;
        }

        state.wavePhase += dt * (0.8 + state.wave * 0.045);

        const slowMul = state.powerups.slow > 0 ? 0.42 : 1;
        const spitSlowMul = state.powerups.slow > 0 ? 0.18 : 1;
        const corridorLeft = this.width * 0.22;
        const corridorRight = this.width * 0.78;
        const nextZombies = [];
        const playerCenterX = this.player.pos.x + this.player.w * 0.5;
        const playerCenterY = this.player.pos.y + this.player.h * 0.5;
        const ballTargetX = this.ball.pos.x + (this.ball.vel?.x || 0) * 0.18;
        const ballTargetY = this.ball.pos.y + (this.ball.vel?.y || 0) * 0.18;

        for (let i = 0; i < state.zombies.length; i++) {
            const zombie = state.zombies[i];
            if (zombie.dead) continue;

            zombie.wobble += dt * (1.5 + zombie.baseSpeed * 0.0045) * zombie.wobbleDir;
            zombie.flash = Math.max(0, zombie.flash - dt * 7);
            zombie.hitCooldown = Math.max(0, zombie.hitCooldown - dt);

            let targetX = zombie.homeX ?? zombie.x;
            let targetY = zombie.homeY ?? zombie.y;
            let steer = 18;
            let maxSpeed = zombie.baseSpeed * 0.95;

            if (zombie.typeKey === 'runner') {
                targetX = ballTargetX;
                targetY = ballTargetY;
                steer = 34;
                maxSpeed = zombie.baseSpeed * 1.45;
            } else if (zombie.typeKey === 'spitter') {
                const dx = playerCenterX - zombie.x;
                const dy = playerCenterY - zombie.y;
                const dist = Math.hypot(dx, dy) || 1;
                const preferredRange = 170 + state.wave * 6;
                const rangePush = dist < preferredRange ? -1 : 1;
                targetX = zombie.x + (dx / dist) * preferredRange * rangePush + Math.sin(state.wavePhase + zombie.phaseOffset) * 24;
                targetY = playerCenterY + Math.cos(state.wavePhase * 1.1 + zombie.phaseOffset) * 26;
                steer = 21;
                maxSpeed = zombie.baseSpeed * 1.05;
            } else if (zombie.typeKey === 'tank') {
                targetX = this.width * 0.58 + Math.sin(state.wavePhase * 0.5 + zombie.phaseOffset) * 22;
                targetY = this.height * 0.5 + Math.cos(state.wavePhase * 0.35 + zombie.phaseOffset) * 34;
                steer = 16;
                maxSpeed = zombie.baseSpeed * 0.82;
            } else {
                targetX = zombie.homeX + Math.sin(state.wavePhase * 0.75 + zombie.phaseOffset) * 42;
                targetY = zombie.homeY + Math.cos(state.wavePhase * 0.58 + zombie.phaseOffset) * 28;
                steer = 15;
                maxSpeed = zombie.baseSpeed * 0.9;
            }

            const dx = targetX - zombie.x;
            const dy = targetY - zombie.y;
            const dist = Math.hypot(dx, dy) || 1;
            zombie.vx += (dx / dist) * steer * dt * 6;
            zombie.vy += (dy / dist) * steer * dt * 5.4;

            if (zombie.typeKey === 'runner') {
                zombie.vy += Math.sin(state.wavePhase * 2.3 + zombie.phaseOffset) * 6 * dt;
            } else if (zombie.typeKey === 'spitter') {
                zombie.vx += Math.cos(state.wavePhase * 1.8 + zombie.phaseOffset) * 4 * dt;
            } else {
                zombie.vx += Math.sin(state.wavePhase + zombie.phaseOffset) * 2.4 * dt;
            }

            const speed = Math.hypot(zombie.vx, zombie.vy) || 1;
            if (speed > maxSpeed) {
                zombie.vx = zombie.vx / speed * maxSpeed;
                zombie.vy = zombie.vy / speed * maxSpeed;
            }

            const speedRatio = Math.min(1, speed / Math.max(1, zombie.baseSpeed));
            const animTime = state.wavePhase * (0.85 + zombie.baseSpeed * 0.0012) + zombie.phaseOffset;
            const walkPhase = animTime * (1.1 + speedRatio * 0.85);
            const wobblePhase = animTime * (0.72 + speedRatio * 0.18);
            zombie.anim = zombie.anim || {};
            zombie.anim.speedRatio = speedRatio;
            zombie.anim.walkPhase = walkPhase;
            zombie.anim.limbSwing = Math.sin(walkPhase) * (0.18 + speedRatio * 0.34);
            zombie.anim.limbSwing2 = Math.sin(walkPhase + Math.PI) * (0.18 + speedRatio * 0.34);
            zombie.anim.headBob = Math.sin(walkPhase * 0.82 + zombie.animSeed) * (8 + speedRatio * 9);
            zombie.anim.breath = Math.sin(animTime * 1.7 + zombie.animPhase) * 0.04;
            zombie.anim.tilt = (zombie.vx || 0) * 0.0035 + Math.atan2(zombie.vy || 0, zombie.vx || 1) * 0.04;
            zombie.anim.blink = Math.pow(Math.sin(animTime * 0.45 + zombie.animSeed), 8);
            zombie.anim.roll = Math.sin(wobblePhase) * 0.15;
            zombie.anim.swing = Math.sin(wobblePhase * 1.7 + zombie.animSeed) * (0.6 + speedRatio * 0.4);
            zombie.anim.jitter = Math.sin(animTime * 2.6 + zombie.animPhase) * (0.35 + speedRatio * 0.4);
            const poseRate = zombie.typeKey === 'runner' ? 1.7 : (zombie.typeKey === 'spitter' ? 1.05 : (zombie.typeKey === 'tank' ? 0.7 : 0.88));
            const poseCycle = (animTime * poseRate + zombie.animPhase * 0.25 + zombie.animSeed * 0.1) % 10;
            zombie.anim.poseIndex = Math.floor(poseCycle);
            zombie.anim.poseBlend = poseCycle - zombie.anim.poseIndex;
            zombie.anim.posePulse = 0.5 - Math.cos(zombie.anim.poseBlend * Math.PI) * 0.5;
            const playerDist = Math.hypot(playerCenterX - zombie.x, playerCenterY - zombie.y);
            const ballDist = Math.hypot(this.ball.pos.x - zombie.x, this.ball.pos.y - zombie.y);
            const threatRange = zombie.typeKey === 'runner' ? 320 : (zombie.typeKey === 'spitter' ? 420 : 260);
            zombie.anim.threat = Math.max(0, 1 - Math.min(playerDist, ballDist) / threatRange);
            zombie.anim.attackPulse = Math.max(
                zombie.anim.threat,
                zombie.typeKey === 'spitter' ? Math.max(0, 1 - zombie.spitTimer / 1.1) : 0
            );
            zombie.anim.facingX = Math.abs(zombie.vx) > 4
                ? (zombie.vx >= 0 ? 1 : -1)
                : (zombie.anim.facingX || 1);
            zombie.anim.footfall = Math.max(0, Math.sin(walkPhase));
            zombie.anim.recoil = Math.max(0, zombie.flash || 0);
            zombie.anim.shoulderTwitch = Math.sin(animTime * (zombie.typeKey === 'runner' ? 6.4 : 3.8) + zombie.animSeed) * (0.12 + speedRatio * 0.14);
            zombie.anim.neckTwitch = Math.sin(animTime * 7.2 + zombie.animPhase) * (0.08 + zombie.anim.threat * 0.08);
            zombie.anim.inhale = zombie.typeKey === 'spitter'
                ? Math.max(0, 1 - zombie.spitTimer / 1.25)
                : zombie.anim.attackPulse * 0.35;
            zombie.anim.dragSide = Math.sin(zombie.animSeed) >= 0 ? 1 : -1;

            zombie.x += zombie.vx * dt * slowMul;
            zombie.y += zombie.vy * dt * slowMul;

            if (zombie.x - zombie.radius < corridorLeft) {
                zombie.x = corridorLeft + zombie.radius;
                zombie.vx = Math.abs(zombie.vx);
            }
            if (zombie.x + zombie.radius > corridorRight) {
                zombie.x = corridorRight - zombie.radius;
                zombie.vx = -Math.abs(zombie.vx);
            }
            if (zombie.y - zombie.radius < 14) {
                zombie.y = 14 + zombie.radius;
                zombie.vy = Math.abs(zombie.vy);
            }
            if (zombie.y + zombie.radius > this.height - 14) {
                zombie.y = this.height - 14 - zombie.radius;
                zombie.vy = -Math.abs(zombie.vy);
            }

            if (zombie.typeKey === 'spitter') {
                zombie.spitTimer -= dt;
                if (zombie.spitTimer <= 0) {
                    const tx = this.player.pos.x + this.player.w * 0.5;
                    const ty = this.player.pos.y + this.player.h * 0.5;
                    const dx = tx - zombie.x;
                    const dy = ty - zombie.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const speedScale = (this.height / 720) * (state.wave >= 8 ? 1.15 : 1);
                    state.spitBalls.push({
                        x: zombie.x,
                        y: zombie.y,
                        vx: (dx / len) * 380 * speedScale,
                        vy: (dy / len) * 380 * speedScale,
                        r: Math.max(6, this.width * 0.007),
                        life: 3.2
                    });
                    this.audio?.zombieSpit?.();
                    zombie.spitTimer = 4 + Math.random() * 0.8;
                }
            }

            nextZombies.push(zombie);
        }
        state.zombies = nextZombies;

        const nextSpitBalls = [];
        for (let i = 0; i < state.spitBalls.length; i++) {
            const spit = state.spitBalls[i];
            spit.x += spit.vx * dt * spitSlowMul;
            spit.y += spit.vy * dt * spitSlowMul;
            spit.life -= dt;

            const hitPlayer =
                spit.x + spit.r > this.player.pos.x &&
                spit.x - spit.r < this.player.pos.x + this.player.w &&
                spit.y + spit.r > this.player.pos.y &&
                spit.y - spit.r < this.player.pos.y + this.player.h;

            if (hitPlayer) {
                if (this.tryConsumeZombieShield('Shield held the line against the spit')) {
                    continue;
                }

                if (this.player && typeof this.player.stun === 'function') {
                    this.player.stun(1.0);
                    this.showNotification('Frozen!', 'Your paddle is frozen by the spit', '#81c784');
                    this.audio?.hit?.();
                }
                continue;
            }

            if (
                spit.life <= 0 ||
                spit.x < -40 ||
                spit.x > this.width + 40 ||
                spit.y < -40 ||
                spit.y > this.height + 40
            ) {
                continue;
            }

            nextSpitBalls.push(spit);
        }
        state.spitBalls = nextSpitBalls;

        const nextPickups = [];
        for (let i = 0; i < state.pickups.length; i++) {
            const pickup = state.pickups[i];
            pickup.pulse += dt * 4.8;
            pickup.life -= dt;

            if (Math.hypot(this.ball.pos.x - pickup.x, this.ball.pos.y - pickup.y) < this.ball.r + pickup.r) {
                this.applyZombiePickup(pickup.type);
                this.particles.spawnGodTierHit(pickup.x, pickup.y, pickup.color, 720);
                continue;
            }

            if (pickup.life > 0) {
                nextPickups.push(pickup);
            }
        }
        state.pickups = nextPickups;

        if (state.zombies.length === 0) {
            if (state.wave === state.maxWave && state.bossHitsThisWave < state.bossHitsTarget) {
                if (!state.finalBossPrompted) {
                    state.finalBossPrompted = true;
                    this.showNotification(
                        'Final Push',
                        `${state.bossHitsTarget - state.bossHitsThisWave} boss breaches to survive`,
                        '#ffd166'
                    );
                }
            } else {
                this.queueZombieNextWave();
            }
        }

        this.syncZombieHUD();
    }

    handleZombieBallCollisions(ball = this.ball) {
        if (!this.isZombieWaveMode() || !ball) return;

        const state = this.zombieState;
        const rageActive = state.powerups.rage > 0;
        let rageHit = false;

        for (let i = 0; i < state.zombies.length; i++) {
            const zombie = state.zombies[i];
            if (zombie.dead) continue;

            const dx = ball.pos.x - zombie.x;
            const dy = ball.pos.y - zombie.y;
            const minDistance = ball.r + zombie.radius * 0.82;
            const distSq = dx * dx + dy * dy;

            if (distSq >= minDistance * minDistance) continue;

            const dist = Math.sqrt(distSq) || 1;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDistance - dist;
            const ballSpeed = Math.max(ball.minSpeed, ball.getSpeed ? ball.getSpeed() : ball.vel.len());

            if (rageActive) {
                zombie.dead = true;
                state.kills++;
                state.totalKills++;
                this.addZombieScore(zombie.type.score);
                this.screenFlash = Math.max(this.screenFlash, 0.2);
                this.particles.spawnGodTierHit(zombie.x, zombie.y, zombie.type.eyeColor, ballSpeed);
                this.audio?.zombieHit?.();
                rageHit = true;
                continue;
            }

            ball.pos.x += nx * overlap;
            ball.pos.y += ny * overlap;
            ball.prev.set(ball.pos.x, ball.pos.y);
            ball.vel.x = nx * ballSpeed;
            ball.vel.y = ny * ballSpeed + zombie.vy * 0.08;
            ball.spin += (Math.random() - 0.5) * 0.12;
            ball.triggerHitEffect?.(ball.pos.x, ball.pos.y);
            this.audio?.zombieHit?.();

            if (zombie.hitCooldown > 0) {
                this.audio.hit();
                break;
            }

            zombie.hitCooldown = 0.18;
            zombie.flash = 1;

            const hitDamage = 1;
            zombie.hp -= hitDamage;
            this.audio.hit();
            this.screenShake = Math.max(this.screenShake, 8);
            this.particles.spawnGodTierHit(zombie.x, zombie.y, zombie.type.eyeColor, ballSpeed);

            if (zombie.hp <= 0) {
                zombie.dead = true;
                state.kills++;
                state.totalKills++;
                this.addZombieScore(zombie.type.score);
                this.screenFlash = Math.max(this.screenFlash, 0.2);

                if (Math.random() < 0.18 && state.pickups.length < 2) {
                    const lootTypes = ['rage', 'shield', 'slow'];
                    this.spawnZombiePickup(lootTypes[Math.floor(Math.random() * lootTypes.length)]);
                }
            }

            break;
        }

        if (state.zombies.length) {
            state.zombies = state.zombies.filter(zombie => !zombie.dead);
        }

        if (rageHit) {
            return;
        }
    }

    renderZombieModeEntities(ctx) {
        if (!this.isZombieWaveMode()) return;

        const state = this.zombieState;
        for (let i = 0; i < state.pickups.length; i++) {
            this.renderZombiePickup(ctx, state.pickups[i]);
        }
        for (let i = 0; i < state.zombies.length; i++) {
            this.renderZombieEnemy(ctx, state.zombies[i]);
        }
        for (let i = 0; i < state.spitBalls.length; i++) {
            this.renderZombieSpit(ctx, state.spitBalls[i]);
        }
    }

    renderZombiePickup(ctx, pickup) {
        const pulse = 1 + Math.sin(pickup.pulse) * 0.12;

        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.shadowBlur = 20;
        ctx.shadowColor = pickup.color;
        ctx.fillStyle = pickup.color;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(0, 0, pickup.r * 1.6 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        const orb = ctx.createRadialGradient(-pickup.r * 0.25, -pickup.r * 0.35, pickup.r * 0.12, 0, 0, pickup.r * 1.12);
        orb.addColorStop(0, pickup.accent);
        orb.addColorStop(0.45, pickup.color);
        orb.addColorStop(1, '#10151b');
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(0, 0, pickup.r * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = pickup.accent;
        ctx.beginPath();
        ctx.arc(0, 0, pickup.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = pickup.accent;
        ctx.lineCap = 'round';

        if (pickup.type === 'rage') {
            ctx.beginPath();
            ctx.moveTo(-pickup.r * 0.18, -pickup.r * 0.7);
            ctx.lineTo(pickup.r * 0.12, -pickup.r * 0.18);
            ctx.lineTo(-pickup.r * 0.08, -pickup.r * 0.18);
            ctx.lineTo(pickup.r * 0.2, pickup.r * 0.72);
            ctx.lineTo(-pickup.r * 0.12, pickup.r * 0.08);
            ctx.lineTo(pickup.r * 0.08, pickup.r * 0.08);
            ctx.stroke();
        } else if (pickup.type === 'shield') {
            ctx.beginPath();
            ctx.moveTo(0, -pickup.r * 0.74);
            ctx.quadraticCurveTo(pickup.r * 0.72, -pickup.r * 0.42, pickup.r * 0.52, pickup.r * 0.34);
            ctx.quadraticCurveTo(0, pickup.r * 0.86, -pickup.r * 0.52, pickup.r * 0.34);
            ctx.quadraticCurveTo(-pickup.r * 0.72, -pickup.r * 0.42, 0, -pickup.r * 0.74);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, pickup.r * 0.38, 0, Math.PI * 2);
            ctx.moveTo(-pickup.r * 0.72, 0);
            ctx.quadraticCurveTo(0, pickup.r * 0.76, pickup.r * 0.72, 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    renderZombieSpit(ctx, spit) {
        ctx.save();
        ctx.translate(spit.x, spit.y);
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#b7ff39';
        ctx.fillStyle = '#9ff23b';
        ctx.beginPath();
        ctx.arc(0, 0, spit.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#dfff90';
        ctx.beginPath();
        ctx.arc(-spit.r * 0.28, -spit.r * 0.28, spit.r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderZombieEnemy(ctx, zombie) {
        const radius = zombie.radius;
        const flash = Math.max(0, Math.min(1, zombie.flash));
        const baseColor = zombie.type.color;
        const eyeColor = zombie.type.eyeColor;
        const typeKey = zombie.typeKey;
        const anim = zombie.anim || {};
        const time = this.time || performance.now() * 0.001;
        const isTank = typeKey === 'tank';
        const isRunner = typeKey === 'runner';
        const isSpitter = typeKey === 'spitter';
        const speedRatio = anim.speedRatio ?? Math.min(1, Math.hypot(zombie.vx || 0, zombie.vy || 0) / (isTank ? 200 : (isRunner ? 320 : 180)));
        const limbSwing = anim.limbSwing ?? Math.sin(zombie.wobble * (0.5 + speedRatio * 1.2)) * (0.2 + speedRatio * 0.35);
        const limbSwing2 = anim.limbSwing2 ?? -limbSwing;
        const headBob = anim.headBob ?? Math.sin(zombie.wobble * 0.8) * (15 * speedRatio);
        const breathingCycle = anim.breath ?? Math.sin(time * 2 + zombie.phaseOffset) * 0.04;
        const visual = zombie.visual || {};
        const visualScale = visual.visualScale || 1;
        const asymmetry = visual.asymmetry || 0;
        const impactForce = Math.max(0, Math.abs(zombie.vy) * 0.003);
        const footfall = anim.footfall ?? Math.sin(zombie.wobble * 2.2);
        const landingSquash = 1 - impactForce * 0.05;
        const typeSquash = isTank ? 0.035 : (isRunner ? 0.075 : 0.055);
        const squash = landingSquash + footfall * typeSquash * (0.45 + speedRatio);
        const stretch = 1 / Math.max(0.82, squash);
        const facingX = anim.facingX || (zombie.vx >= 0 ? 1 : -1);
        const activeTilt = (anim.tilt ?? ((zombie.vx || 0) * 0.0035)) + breathingCycle + asymmetry * 0.06 + (isRunner ? -0.16 : 0);

        ctx.save();
        ctx.translate(zombie.x, zombie.y);

        ctx.save();
        const shadowOscillate = 0.86 + speedRatio * 0.12;
        const shadowCompress = 1 - (impactForce * 0.15);
        ctx.globalAlpha = 0.34 * shadowCompress;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, radius * 1.08, radius * (1.08 + speedRatio * 0.42) * shadowOscillate, radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        this._renderGrittyZombieTrace(ctx, zombie, radius, typeKey, time, speedRatio, flash, eyeColor);

        ctx.rotate(activeTilt);
        ctx.scale(facingX * squash * visualScale, stretch * (2 - visualScale));

        if (isTank) {
            this._renderGrittyTankZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob);
        } else if (isRunner) {
            this._renderGrittyRunnerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob);
        } else if (isSpitter) {
            this._renderGrittySpitterZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob);
        } else {
            this._renderGrittyShamblerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob);
        }

        this._renderGrittyZombieStatus(ctx, zombie, radius, typeKey, time, flash, eyeColor);

        ctx.restore();
    }

    _getGrittyZombiePalette(zombie, typeKey) {
        const banks = {
            shambler: { skin: '#596553', low: '#1a2118', mid: '#384435', cloth: '#2a3028', bone: '#b8b095', wound: '#5b3831', eye: '#d8e992', acid: '#8fa96a', rim: '#879577' },
            runner: { skin: '#72463e', low: '#1b0f0e', mid: '#4b2f2b', cloth: '#2b2522', bone: '#c0ae99', wound: '#743128', eye: '#ff9a69', acid: '#c66b49', rim: '#ad6a58' },
            tank: { skin: '#56636a', low: '#11161b', mid: '#333e46', cloth: '#262d31', bone: '#b7ae96', wound: '#5a4037', eye: '#a7dce8', acid: '#95b6bc', rim: '#95a6a8' },
            spitter: { skin: '#697950', low: '#12170d', mid: '#414c32', cloth: '#2f3528', bone: '#b7b48d', wound: '#655230', eye: '#dce87b', acid: '#8ed36b', rim: '#95aa72' }
        };
        const palette = banks[typeKey] || banks.shambler;
        return {
            ...palette,
            glow: zombie?.type?.eyeColor || palette.eye,
            shadow: zombie?.type?.shadowColor || palette.low
        };
    }

    _renderGrittyZombieTrace(ctx, zombie, radius, typeKey, time, speedRatio, flash, eyeColor) {
        const speed = Math.hypot(zombie.vx || 0, zombie.vy || 0);
        if (speed < 12 && flash <= 0.01) return;

        const palette = this._getGrittyZombiePalette(zombie, typeKey);
        const nx = speed ? (zombie.vx || 0) / speed : 0;
        const ny = speed ? (zombie.vy || 0) / speed : 0;
        const count = typeKey === 'runner' ? 3 : 2;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < count; i++) {
            const lane = (i - (count - 1) * 0.5) * radius * 0.26;
            const back = radius * (0.75 + speedRatio * 0.85 + i * 0.28);
            ctx.globalAlpha = Math.min(0.26, 0.07 + speedRatio * 0.18 + flash * 0.12) * (1 - i * 0.22);
            ctx.strokeStyle = this._colorWithAlpha(typeKey === 'spitter' ? palette.acid : palette.rim, 0.8);
            ctx.lineWidth = Math.max(1, radius * (typeKey === 'runner' ? 0.035 : 0.025));
            ctx.beginPath();
            ctx.moveTo(-nx * radius * 0.25 - ny * lane, -ny * radius * 0.25 + nx * lane);
            ctx.quadraticCurveTo(
                -nx * back * 0.62 - ny * lane,
                -ny * back * 0.62 + nx * lane + Math.sin(time * 9 + i + zombie.phaseOffset) * radius * 0.08,
                -nx * back - ny * lane * 0.6,
                -ny * back + nx * lane * 0.6
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawGrittyLimb(ctx, x1, y1, x2, y2, width, palette, flex = 0, handScale = 1) {
        const mx = (x1 + x2) * 0.5 + flex;
        const my = (y1 + y2) * 0.5;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(3, 5, 4, 0.92)';
        ctx.lineWidth = width * 1.55;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
        ctx.strokeStyle = palette.mid;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
        ctx.fillStyle = palette.low;
        ctx.beginPath();
        ctx.ellipse(x2, y2, width * 0.55 * handScale, width * 0.75 * handScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawGrittyEyes(ctx, radius, palette, eyeY, spread, threat = 0, blink = 1, single = false) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.shadowBlur = radius * (0.24 + threat * 0.2);
        ctx.shadowColor = palette.eye;
        ctx.fillStyle = this._colorWithAlpha(palette.eye, 0.9);
        if (single) {
            ctx.beginPath();
            ctx.ellipse(0, eyeY, radius * (0.18 + threat * 0.04), radius * 0.08 * blink, -0.08, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(-spread, eyeY, radius * 0.12, radius * 0.055 * blink, -0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(spread * 0.82, eyeY + radius * 0.02, radius * 0.11, radius * 0.05 * blink, 0.16, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    _drawZombieDecayMarks(ctx, zombie, radius, palette, time, alpha = 0.9) {
        const marks = zombie.visual?.decayPattern || [];
        ctx.save();
        for (let i = 0; i < marks.length; i++) {
            const mark = marks[i];
            const pulse = 0.85 + Math.sin(time * 1.7 + i + zombie.phaseOffset) * 0.12;
            ctx.globalAlpha = alpha * (0.34 + mark.tone * 0.32);
            ctx.fillStyle = mark.tone > 0.55 ? palette.wound : palette.low;
            ctx.beginPath();
            ctx.ellipse(mark.x * radius, mark.y * radius, mark.r * radius * pulse, mark.r * radius * (0.55 + mark.tone * 0.45), mark.rot, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawZombieTears(ctx, zombie, radius, palette, time, yBias = 0) {
        const tears = zombie.visual?.tearPattern || [];
        ctx.save();
        ctx.fillStyle = palette.cloth;
        ctx.strokeStyle = 'rgba(5, 6, 5, 0.75)';
        ctx.lineWidth = Math.max(1, radius * 0.025);
        for (let i = 0; i < tears.length; i++) {
            const tear = tears[i];
            const sway = Math.sin(time * 1.4 + i + zombie.phaseOffset) * radius * tear.sway;
            const x = tear.x * radius * 0.62;
            const y = tear.y * radius + yBias;
            ctx.beginPath();
            ctx.moveTo(x - radius * 0.11, y);
            ctx.lineTo(x + radius * 0.12, y + radius * 0.04);
            ctx.lineTo(x + sway, y + tear.len * radius);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawZombieScars(ctx, zombie, radius, palette, time) {
        const scars = zombie.visual?.scarPattern || [];
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = this._colorWithAlpha(palette.bone, 0.5);
        ctx.lineWidth = Math.max(1, radius * 0.025);
        for (let i = 0; i < scars.length; i++) {
            const scar = scars[i];
            const x = scar.x * radius;
            const y = scar.y * radius;
            const len = scar.len * radius;
            const dx = Math.cos(scar.rot) * len * 0.5;
            const dy = Math.sin(scar.rot) * len * 0.5;
            ctx.globalAlpha = 0.38 + Math.sin(time * 2 + i) * 0.06;
            ctx.beginPath();
            ctx.moveTo(x - dx, y - dy);
            ctx.lineTo(x + dx, y + dy);
            ctx.stroke();
        }
        ctx.restore();
    }

    _renderGrittyZombieStatus(ctx, zombie, radius, typeKey, time, flash, eyeColor) {
        const palette = this._getGrittyZombiePalette(zombie, typeKey);
        ctx.save();
        if (flash > 0.01) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = Math.min(0.42, flash * 0.5);
            ctx.strokeStyle = '#f5efe2';
            ctx.lineWidth = Math.max(1.5, radius * 0.055);
            ctx.beginPath();
            ctx.ellipse(0, -radius * 0.08, radius * 1.05, radius * 1.3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (typeKey === 'tank') {
            ctx.globalAlpha = 0.86;
            for (let i = 0; i < zombie.maxHp; i++) {
                const lit = i < zombie.hp;
                ctx.fillStyle = lit ? this._colorWithAlpha(palette.eye, 0.82) : 'rgba(18, 20, 20, 0.8)';
                ctx.beginPath();
                ctx.ellipse((i - (zombie.maxHp - 1) * 0.5) * radius * 0.25, radius * 1.2, radius * 0.07, radius * 0.04, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (typeKey === 'runner') {
            ctx.globalAlpha = 0.38;
            ctx.strokeStyle = this._colorWithAlpha(palette.rim, 0.72);
            ctx.lineWidth = Math.max(1, radius * 0.025);
            for (let i = 0; i < 2; i++) {
                const y = -radius * 0.5 + i * radius * 0.42;
                ctx.beginPath();
                ctx.moveTo(-radius * 0.8, y);
                ctx.lineTo(-radius * (1.08 + i * 0.12), y + radius * 0.18);
                ctx.stroke();
            }
        } else if (typeKey === 'spitter') {
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = this._colorWithAlpha(palette.acid, 0.58);
            for (let i = 0; i < 3; i++) {
                const drop = (time * 1.5 + i * 0.3 + zombie.phaseOffset) % 1;
                ctx.globalAlpha = (1 - drop) * 0.34;
                ctx.beginPath();
                ctx.ellipse((i - 1) * radius * 0.15, radius * (0.25 + drop * 0.62), radius * 0.035, radius * 0.075, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    _renderGrittyShamblerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const palette = this._getGrittyZombiePalette(zombie, 'shambler');
        const anim = zombie.anim || {};
        const visual = zombie.visual || {};
        const hunch = visual.hunch || 1;
        const drag = visual.gaitDrag || 0.5;
        const legY = radius * 0.62;
        const shoulderY = -radius * 0.46;
        const hipY = radius * 0.35;
        const outline = Math.max(1.2, radius * 0.055);

        this._drawGrittyLimb(ctx, -radius * 0.32, hipY, -radius * (0.48 + drag * 0.16), legY + radius * 0.62, radius * 0.18, palette, limbSwing * radius * 0.38);
        this._drawGrittyLimb(ctx, radius * 0.34, hipY, radius * (0.35 - drag * 0.08), legY + radius * (0.55 + speedRatio * 0.14), radius * 0.17, palette, -limbSwing2 * radius * 0.28);

        const bodyGrad = ctx.createRadialGradient(-radius * 0.32, -radius * 0.62, radius * 0.12, 0, 0, radius * 1.28);
        bodyGrad.addColorStop(0, this._colorWithAlpha(palette.skin, 0.95));
        bodyGrad.addColorStop(0.58, palette.mid);
        bodyGrad.addColorStop(1, palette.low);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.82, -radius * 0.74);
        ctx.quadraticCurveTo(-radius * 0.38, -radius * (1.0 + hunch * 0.18), radius * 0.7, -radius * 0.58);
        ctx.quadraticCurveTo(radius * 0.86, radius * 0.18, radius * 0.36, radius * 0.92);
        ctx.lineTo(-radius * 0.36, radius * 0.84 + (visual.asymmetry || 0) * radius * 0.18);
        ctx.quadraticCurveTo(-radius * 0.98, radius * 0.28, -radius * 0.82, -radius * 0.74);
        ctx.fill();
        this._strokeZombiePart(ctx, outline, 'rgba(3, 5, 4, 0.96)');

        this._drawZombieDecayMarks(ctx, zombie, radius, palette, time, 0.95);
        this._drawZombieTears(ctx, zombie, radius, palette, time, radius * 0.08);

        const droop = radius * (0.35 + drag * 0.28);
        this._drawGrittyLimb(ctx, -radius * 0.72, shoulderY, -radius * 0.95, shoulderY + droop, radius * 0.16, palette, -radius * 0.12 + limbSwing * radius * 0.14, 0.9);
        this._drawGrittyLimb(ctx, radius * 0.66, shoulderY + radius * 0.06, radius * 0.92, shoulderY + droop * 0.88, radius * 0.15, palette, radius * 0.1 - limbSwing2 * radius * 0.1, 0.85);

        ctx.save();
        ctx.translate(radius * (0.12 + (visual.asymmetry || 0) * 0.16), -radius * 1.05 + headBob * 0.018 + (anim.neckTwitch || 0) * radius);
        ctx.rotate(-0.2 + (anim.neckTwitch || 0) + (visual.asymmetry || 0) * 0.2);
        ctx.fillStyle = palette.skin;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.42, -radius * 0.42);
        ctx.quadraticCurveTo(radius * 0.18, -radius * 0.68, radius * 0.48, -radius * 0.15);
        ctx.quadraticCurveTo(radius * 0.34, radius * 0.45, -radius * 0.24, radius * 0.48);
        ctx.quadraticCurveTo(-radius * 0.58, radius * 0.12, -radius * 0.42, -radius * 0.42);
        ctx.fill();
        this._strokeZombiePart(ctx, outline * 0.82, 'rgba(4, 5, 4, 0.94)');
        ctx.fillStyle = palette.low;
        ctx.beginPath();
        ctx.ellipse(radius * 0.04, radius * (0.17 + (visual.jawSlack || 0) * 0.08), radius * 0.18, radius * (0.1 + (visual.jawSlack || 0) * 0.09), 0.12, 0, Math.PI * 2);
        ctx.fill();
        this._drawGrittyEyes(ctx, radius, palette, -radius * 0.12, radius * 0.22, anim.threat || 0, 0.35 + (anim.blink || 0) * 0.65);
        this._drawZombieScars(ctx, zombie, radius * 0.72, palette, time);
        ctx.restore();
    }

    _renderGrittyRunnerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const palette = this._getGrittyZombiePalette(zombie, 'runner');
        const anim = zombie.anim || {};
        const visual = zombie.visual || {};
        const outline = Math.max(1.1, radius * 0.045);
        const stride = 0.52 + speedRatio * 0.34;

        this._drawGrittyLimb(ctx, -radius * 0.26, radius * 0.42, -radius * (0.72 + stride * 0.18), radius * (1.05 + Math.abs(limbSwing) * 0.18), radius * 0.12, palette, limbSwing * radius * 0.52, 0.72);
        this._drawGrittyLimb(ctx, radius * 0.2, radius * 0.48, radius * (0.58 + stride * 0.12), radius * (0.98 + Math.abs(limbSwing2) * 0.12), radius * 0.115, palette, -limbSwing2 * radius * 0.48, 0.7);

        const torsoGrad = ctx.createLinearGradient(0, -radius * 1.2, 0, radius * 0.82);
        torsoGrad.addColorStop(0, palette.skin);
        torsoGrad.addColorStop(0.5, palette.mid);
        torsoGrad.addColorStop(1, palette.low);
        ctx.fillStyle = torsoGrad;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.42, -radius * 1.18);
        ctx.lineTo(radius * (0.64 + speedRatio * 0.18), -radius * 0.32);
        ctx.lineTo(radius * 0.36, radius * 0.84);
        ctx.quadraticCurveTo(-radius * 0.18, radius * 1.05, -radius * 0.54, radius * 0.35);
        ctx.quadraticCurveTo(-radius * 0.78, -radius * 0.54, -radius * 0.42, -radius * 1.18);
        ctx.fill();
        this._strokeZombiePart(ctx, outline, 'rgba(5, 4, 4, 0.96)');

        this._drawZombieDecayMarks(ctx, zombie, radius * 0.82, palette, time, 0.72);
        this._drawZombieTears(ctx, zombie, radius * 0.88, palette, time, -radius * 0.05);

        this._drawGrittyLimb(ctx, -radius * 0.54, -radius * 0.72, -radius * (1.04 + speedRatio * 0.2), -radius * 0.3 + limbSwing * radius * 0.28, radius * 0.11, palette, -radius * 0.18, 0.72);
        this._drawGrittyLimb(ctx, radius * 0.58, -radius * 0.46, radius * (1.0 + speedRatio * 0.18), -radius * 0.76 - limbSwing2 * radius * 0.3, radius * 0.105, palette, radius * 0.15, 0.7);

        ctx.save();
        ctx.translate(radius * 0.12, -radius * 1.36 + headBob * 0.012 + (anim.neckTwitch || 0) * radius * 0.6);
        ctx.rotate(-0.26 + (anim.shoulderTwitch || 0) * 0.22);
        ctx.fillStyle = palette.skin;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.36, -radius * 0.28);
        ctx.lineTo(radius * 0.52, -radius * 0.52);
        ctx.lineTo(radius * 0.32, radius * 0.28);
        ctx.quadraticCurveTo(-radius * 0.18, radius * 0.42, -radius * 0.48, radius * 0.06);
        ctx.closePath();
        ctx.fill();
        this._strokeZombiePart(ctx, outline * 0.85, 'rgba(5, 4, 4, 0.94)');
        this._drawGrittyEyes(ctx, radius, palette, -radius * 0.1, radius * 0.2, anim.threat || 0, 0.45 + (anim.blink || 0) * 0.42);
        ctx.restore();
    }

    _renderGrittyTankZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const palette = this._getGrittyZombiePalette(zombie, 'tank');
        const anim = zombie.anim || {};
        const visual = zombie.visual || {};
        const outline = Math.max(1.6, radius * 0.062);
        const stomp = Math.abs(anim.footfall || 0);

        this._drawGrittyLimb(ctx, -radius * 0.48, radius * 0.54, -radius * 0.6, radius * (1.18 + stomp * 0.08), radius * 0.23, palette, limbSwing * radius * 0.15, 1.2);
        this._drawGrittyLimb(ctx, radius * 0.48, radius * 0.54, radius * 0.62, radius * (1.14 - stomp * 0.04), radius * 0.23, palette, -limbSwing2 * radius * 0.14, 1.2);

        const bodyGrad = ctx.createRadialGradient(-radius * 0.36, -radius * 0.72, radius * 0.18, 0, 0, radius * 1.55);
        bodyGrad.addColorStop(0, palette.skin);
        bodyGrad.addColorStop(0.5, palette.mid);
        bodyGrad.addColorStop(1, palette.low);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(-radius * 1.05, -radius * 1.05);
        ctx.lineTo(radius * 0.92, -radius * 1.22 + (visual.shoulderBias || 0) * radius * 0.12);
        ctx.quadraticCurveTo(radius * 1.22, -radius * 0.2, radius * 0.92, radius * 0.95);
        ctx.lineTo(-radius * 0.92, radius * 1.02);
        ctx.quadraticCurveTo(-radius * 1.25, -radius * 0.05, -radius * 1.05, -radius * 1.05);
        ctx.fill();
        this._strokeZombiePart(ctx, outline, 'rgba(4, 5, 5, 0.97)');

        ctx.save();
        ctx.strokeStyle = this._colorWithAlpha(palette.bone, 0.42);
        ctx.lineWidth = Math.max(1, radius * 0.04);
        for (let i = 0; i < 4; i++) {
            const y = -radius * 0.62 + i * radius * 0.32;
            ctx.beginPath();
            ctx.moveTo(-radius * 0.72, y + Math.sin(time * 1.6 + i) * radius * 0.025);
            ctx.lineTo(radius * 0.72, y - Math.sin(time * 1.5 + i) * radius * 0.025);
            ctx.stroke();
        }
        ctx.restore();

        this._drawZombieDecayMarks(ctx, zombie, radius, palette, time, 0.65);
        this._drawZombieScars(ctx, zombie, radius, palette, time);

        this._drawGrittyLimb(ctx, -radius * 0.98, -radius * 0.58, -radius * 1.1, radius * 0.38, radius * 0.24, palette, -radius * 0.12 + limbSwing * radius * 0.16, 1.42);
        this._drawGrittyLimb(ctx, radius * 0.98, -radius * 0.58, radius * 1.12, radius * 0.34, radius * 0.24, palette, radius * 0.12 - limbSwing2 * radius * 0.16, 1.42);

        ctx.save();
        ctx.translate(radius * 0.04, -radius * 1.32 + headBob * 0.01);
        ctx.fillStyle = palette.skin;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.58, radius * 0.62, 0.05, 0, Math.PI * 2);
        ctx.fill();
        this._strokeZombiePart(ctx, outline * 0.8, 'rgba(4, 5, 5, 0.94)');
        ctx.fillStyle = palette.low;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.08, radius * 0.42, radius * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        this._drawGrittyEyes(ctx, radius, palette, -radius * 0.02, radius * 0.16, anim.threat || 0, 1, true);
        ctx.restore();

        if (zombie.hp < zombie.maxHp) {
            const damage = 1 - zombie.hp / zombie.maxHp;
            ctx.save();
            ctx.globalAlpha = 0.32 + damage * 0.38;
            ctx.strokeStyle = this._colorWithAlpha(palette.wound, 0.9);
            ctx.lineWidth = Math.max(1, radius * 0.032);
            ctx.setLineDash([radius * 0.08, radius * 0.06]);
            ctx.beginPath();
            ctx.moveTo(-radius * 0.62, -radius * 0.84);
            ctx.lineTo(radius * 0.18, -radius * 0.2);
            ctx.lineTo(-radius * 0.08, radius * 0.68);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    _renderGrittySpitterZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const palette = this._getGrittyZombiePalette(zombie, 'spitter');
        const anim = zombie.anim || {};
        const inhale = anim.inhale || 0;
        const outline = Math.max(1.3, radius * 0.052);
        const pulse = 1 + Math.sin(time * 3.1 + zombie.phaseOffset) * 0.035 + inhale * 0.14;

        this._drawGrittyLimb(ctx, -radius * 0.38, radius * 0.5, -radius * 0.62, radius * 1.04, radius * 0.15, palette, limbSwing * radius * 0.18, 0.82);
        this._drawGrittyLimb(ctx, radius * 0.35, radius * 0.5, radius * 0.54, radius * 1.0, radius * 0.15, palette, -limbSwing2 * radius * 0.16, 0.82);

        const sacGrad = ctx.createRadialGradient(-radius * 0.34, -radius * 0.44, radius * 0.12, 0, 0, radius * 1.35);
        sacGrad.addColorStop(0, this._colorWithAlpha(palette.acid, 0.58));
        sacGrad.addColorStop(0.36, palette.skin);
        sacGrad.addColorStop(0.78, palette.mid);
        sacGrad.addColorStop(1, palette.low);
        ctx.fillStyle = sacGrad;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.02 + inhale * radius * 0.05, radius * 1.02 * pulse, radius * 0.98 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        this._strokeZombiePart(ctx, outline, 'rgba(4, 6, 4, 0.96)');

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.2 + inhale * 0.32;
        ctx.strokeStyle = this._colorWithAlpha(palette.acid, 0.75);
        ctx.lineWidth = Math.max(1, radius * 0.026);
        for (let i = 0; i < 5; i++) {
            const a = time * 0.8 + i * 1.35 + zombie.phaseOffset;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * radius * 0.2, Math.sin(a) * radius * 0.16);
            ctx.quadraticCurveTo(Math.cos(a + 0.8) * radius * 0.55, Math.sin(a + 0.8) * radius * 0.42, Math.cos(a + 1.6) * radius * 0.8, Math.sin(a + 1.6) * radius * 0.58);
            ctx.stroke();
        }
        ctx.restore();

        this._drawZombieDecayMarks(ctx, zombie, radius * 0.9, palette, time, 0.82);
        this._drawGrittyLimb(ctx, -radius * 0.78, -radius * 0.24, -radius * 1.02, radius * 0.36, radius * 0.13, palette, -radius * 0.08, 0.75);
        this._drawGrittyLimb(ctx, radius * 0.78, -radius * 0.18, radius * 1.0, radius * 0.32, radius * 0.13, palette, radius * 0.08, 0.75);

        ctx.save();
        ctx.translate(0, -radius * (0.9 + inhale * 0.1) + headBob * 0.012 + (anim.neckTwitch || 0) * radius * 0.4);
        ctx.fillStyle = palette.skin;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (0.44 + inhale * 0.08), radius * (0.56 + inhale * 0.1), 0, 0, Math.PI * 2);
        ctx.fill();
        this._strokeZombiePart(ctx, outline * 0.78, 'rgba(4, 6, 4, 0.94)');
        ctx.fillStyle = palette.low;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.1, radius * (0.2 + inhale * 0.1), radius * (0.12 + inhale * 0.14), 0, 0, Math.PI * 2);
        ctx.fill();
        this._drawGrittyEyes(ctx, radius, palette, -radius * 0.22, radius * 0.19, anim.threat || 0, 0.45 + (anim.blink || 0) * 0.42);
        ctx.restore();
    }

    _getZombieMotionPreset(typeKey, poseIndex = 0) {
        const banks = {
            tank: [
                { bodyShift: -4, lean: -0.06, bounce: 0.84, shoulder: -4, head: -2, arm: 0.86, eye: 0.92, jaw: 0.14, twist: -0.08, drag: 0.06 },
                { bodyShift: -2, lean: -0.04, bounce: 0.92, shoulder: -2, head: -1, arm: 0.95, eye: 0.98, jaw: 0.16, twist: -0.04, drag: 0.05 },
                { bodyShift: 4, lean: 0.10, bounce: 1.16, shoulder: 4, head: 2, arm: 1.18, eye: 1.08, jaw: 0.26, twist: 0.10, drag: 0.02, kind: 'attack' },
                { bodyShift: 2, lean: 0.03, bounce: 1.04, shoulder: 2, head: 1, arm: 0.92, eye: 0.95, jaw: 0.17, twist: 0.05, drag: 0.03 },
                { bodyShift: 4, lean: 0.05, bounce: 1.08, shoulder: 4, head: 2, arm: 0.88, eye: 0.90, jaw: 0.16, twist: 0.08, drag: 0.02 },
                { bodyShift: -5, lean: -0.10, bounce: 0.76, shoulder: -5, head: -4, arm: 0.78, eye: 0.84, jaw: 0.10, twist: -0.10, drag: 0.10, kind: 'recoil' },
                { bodyShift: 0, lean: 0.04, bounce: 0.90, shoulder: 1, head: -1, arm: 1.14, eye: 0.96, jaw: 0.22, twist: 0.12, drag: 0.07 },
                { bodyShift: -2, lean: 0.01, bounce: 0.94, shoulder: -1, head: -2, arm: 0.97, eye: 0.90, jaw: 0.17, twist: 0.06, drag: 0.08 },
                { bodyShift: -5, lean: -0.02, bounce: 0.88, shoulder: -3, head: -3, arm: 0.84, eye: 0.88, jaw: 0.15, twist: -0.02, drag: 0.09, kind: 'react' },
                { bodyShift: -1, lean: 0.02, bounce: 1.12, shoulder: 0, head: 1, arm: 1.06, eye: 1.04, jaw: 0.19, twist: 0.01, drag: 0.04 },
            ],
            runner: [
                { bodyShift: -4, lean: -0.26, bounce: 0.92, shoulder: -6, head: -4, arm: 1.10, eye: 0.85, jaw: 0.10, twist: -0.10, drag: 0.00 },
                { bodyShift: -2, lean: -0.22, bounce: 0.98, shoulder: -5, head: -3, arm: 1.18, eye: 0.88, jaw: 0.11, twist: -0.05, drag: 0.02 },
                { bodyShift: 4, lean: -0.08, bounce: 1.16, shoulder: -2, head: -1, arm: 1.34, eye: 1.00, jaw: 0.18, twist: 0.08, drag: 0.01, kind: 'attack' },
                { bodyShift: 3, lean: -0.14, bounce: 1.10, shoulder: -2, head: -1, arm: 1.18, eye: 0.95, jaw: 0.13, twist: 0.05, drag: 0.04 },
                { bodyShift: 5, lean: -0.10, bounce: 1.16, shoulder: 0, head: 0, arm: 1.14, eye: 0.98, jaw: 0.14, twist: 0.09, drag: 0.05 },
                { bodyShift: -5, lean: -0.30, bounce: 0.82, shoulder: -6, head: -5, arm: 0.92, eye: 0.78, jaw: 0.08, twist: -0.12, drag: 0.11, kind: 'recoil' },
                { bodyShift: 1, lean: -0.20, bounce: 1.00, shoulder: -1, head: -2, arm: 1.24, eye: 1.06, jaw: 0.14, twist: 0.16, drag: 0.07 },
                { bodyShift: -2, lean: -0.24, bounce: 0.94, shoulder: -3, head: -3, arm: 1.16, eye: 0.90, jaw: 0.12, twist: 0.12, drag: 0.08 },
                { bodyShift: -5, lean: -0.28, bounce: 0.90, shoulder: -5, head: -4, arm: 1.08, eye: 0.82, jaw: 0.10, twist: 0.06, drag: 0.10, kind: 'react' },
                { bodyShift: -1, lean: -0.12, bounce: 1.20, shoulder: 1, head: 1, arm: 1.26, eye: 1.00, jaw: 0.15, twist: 0.02, drag: 0.04 },
            ],
            spitter: [
                { bodyShift: -3, lean: -0.02, bounce: 0.88, shoulder: -2, head: -2, arm: 0.94, eye: 0.92, jaw: 0.28, twist: -0.06, drag: 0.04 },
                { bodyShift: -1, lean: 0.00, bounce: 0.94, shoulder: -1, head: -1, arm: 0.98, eye: 0.96, jaw: 0.32, twist: -0.03, drag: 0.05 },
                { bodyShift: 5, lean: 0.10, bounce: 1.12, shoulder: 2, head: 2, arm: 1.14, eye: 1.10, jaw: 0.52, twist: 0.10, drag: 0.02, kind: 'attack' },
                { bodyShift: 3, lean: 0.04, bounce: 1.06, shoulder: 1, head: 1, arm: 0.98, eye: 1.04, jaw: 0.40, twist: 0.04, drag: 0.07 },
                { bodyShift: 4, lean: 0.06, bounce: 1.10, shoulder: 2, head: 2, arm: 1.04, eye: 1.08, jaw: 0.44, twist: 0.07, drag: 0.08 },
                { bodyShift: -4, lean: -0.04, bounce: 0.80, shoulder: -4, head: -4, arm: 0.84, eye: 0.80, jaw: 0.18, twist: -0.09, drag: 0.14, kind: 'recoil' },
                { bodyShift: 0, lean: 0.10, bounce: 0.96, shoulder: 0, head: -1, arm: 1.16, eye: 0.98, jaw: 0.52, twist: 0.14, drag: 0.10 },
                { bodyShift: -2, lean: 0.12, bounce: 0.92, shoulder: -1, head: -2, arm: 1.08, eye: 0.94, jaw: 0.46, twist: 0.10, drag: 0.11 },
                { bodyShift: -4, lean: 0.08, bounce: 0.86, shoulder: -3, head: -3, arm: 0.96, eye: 0.90, jaw: 0.34, twist: 0.05, drag: 0.12, kind: 'react' },
                { bodyShift: -1, lean: 0.14, bounce: 1.12, shoulder: 1, head: 1, arm: 1.12, eye: 1.10, jaw: 0.50, twist: 0.02, drag: 0.08 },
            ],
            shambler: [
                { bodyShift: -4, lean: -0.10, bounce: 0.82, shoulder: -4, head: -3, arm: 0.84, eye: 0.90, jaw: 0.18, twist: -0.08, drag: 0.08 },
                { bodyShift: -3, lean: -0.06, bounce: 0.88, shoulder: -3, head: -2, arm: 0.88, eye: 0.94, jaw: 0.20, twist: -0.05, drag: 0.10 },
                { bodyShift: 3, lean: 0.06, bounce: 1.02, shoulder: -1, head: 1, arm: 1.02, eye: 1.06, jaw: 0.28, twist: 0.06, drag: 0.04, kind: 'attack' },
                { bodyShift: 1, lean: 0.00, bounce: 1.00, shoulder: -1, head: 0, arm: 0.96, eye: 1.00, jaw: 0.24, twist: 0.00, drag: 0.13 },
                { bodyShift: 3, lean: 0.02, bounce: 1.06, shoulder: 0, head: 1, arm: 0.94, eye: 1.02, jaw: 0.26, twist: 0.02, drag: 0.14 },
                { bodyShift: 2, lean: 0.04, bounce: 1.02, shoulder: 1, head: 0, arm: 0.98, eye: 0.96, jaw: 0.28, twist: 0.05, drag: 0.15 },
                { bodyShift: -5, lean: -0.08, bounce: 0.76, shoulder: -4, head: -4, arm: 0.74, eye: 0.80, jaw: 0.12, twist: -0.10, drag: 0.18, kind: 'recoil' },
                { bodyShift: -2, lean: 0.08, bounce: 0.90, shoulder: 1, head: -2, arm: 0.90, eye: 0.88, jaw: 0.24, twist: 0.11, drag: 0.17 },
                { bodyShift: -5, lean: 0.10, bounce: 0.84, shoulder: -1, head: -3, arm: 0.82, eye: 0.86, jaw: 0.16, twist: 0.06, drag: 0.18, kind: 'react' },
                { bodyShift: -1, lean: 0.12, bounce: 1.10, shoulder: 0, head: 1, arm: 0.96, eye: 1.04, jaw: 0.28, twist: 0.03, drag: 0.12 },
            ],
        };

        const bank = banks[typeKey] || banks.shambler;
        const pose = { ...(bank[poseIndex % bank.length]) };

        if (pose.kind === 'attack') {
            pose.bodyShift += 3;
            pose.lean += 0.04;
            pose.bounce += 0.12;
            pose.shoulder += 2;
            pose.head += 1;
            pose.arm += 0.14;
            pose.eye += 0.08;
            pose.jaw += 0.08;
            pose.twist += 0.04;
            pose.drag -= 0.02;
        } else if (pose.kind === 'recoil') {
            pose.bodyShift -= 4;
            pose.lean -= 0.06;
            pose.bounce *= 0.88;
            pose.shoulder -= 3;
            pose.head -= 2;
            pose.arm -= 0.12;
            pose.eye -= 0.04;
            pose.jaw -= 0.04;
            pose.twist -= 0.03;
            pose.drag += 0.06;
        } else if (pose.kind === 'react') {
            pose.bodyShift += 1;
            pose.lean += 0.02;
            pose.bounce += 0.06;
            pose.shoulder += 1;
            pose.head += 2;
            pose.arm += 0.04;
            pose.eye += 0.12;
            pose.jaw += 0.03;
            pose.twist += 0.06;
            pose.drag += 0.10;
        }

        return pose;
    }

    _strokeZombiePart(ctx, lineWidth, color = 'rgba(4, 8, 5, 0.92)') {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();
    }

    _getZombieAccent(zombie, fallback = '#9fff5f') {
        return zombie?.type?.accentColor || zombie?.type?.eyeColor || fallback;
    }

    _renderZombieMotionAura(ctx, zombie, radius, typeKey, time, speedRatio, flash, eyeColor) {
        const vx = zombie.vx || 0;
        const vy = zombie.vy || 0;
        const speed = Math.hypot(vx, vy);
        const visual = zombie.visual || {};
        const accent = this._getZombieAccent(zombie, eyeColor);
        const alpha = Math.min(0.58, 0.16 + speedRatio * 0.34 + flash * 0.25);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        if (speed > 8) {
            const nx = vx / speed;
            const ny = vy / speed;
            const streakCount = typeKey === 'runner' ? 5 : (typeKey === 'tank' ? 2 : 3);
            for (let i = 0; i < streakCount; i++) {
                const lane = (i - (streakCount - 1) * 0.5) * radius * 0.34;
                const back = radius * (0.72 + i * 0.32 + speedRatio * 0.75);
                ctx.globalAlpha = alpha * (1 - i / (streakCount + 1));
                ctx.strokeStyle = this._colorWithAlpha(accent, 0.72);
                ctx.lineWidth = Math.max(1, radius * (typeKey === 'runner' ? 0.08 : 0.045));
                ctx.beginPath();
                ctx.moveTo(-nx * radius * 0.28 - ny * lane, -ny * radius * 0.28 + nx * lane);
                ctx.quadraticCurveTo(
                    -nx * back * 0.7 - ny * lane * 1.15,
                    -ny * back * 0.7 + nx * lane * 1.15 + Math.sin(time * 8 + i + (visual.rotTint || 0)) * radius * 0.12,
                    -nx * back - ny * lane * 0.75,
                    -ny * back + nx * lane * 0.75
                );
                ctx.stroke();
            }
        }

        if (typeKey === 'spitter') {
            for (let i = 0; i < 5; i++) {
                const drift = time * (0.7 + i * 0.08) + zombie.phaseOffset + i;
                ctx.globalAlpha = 0.16 + Math.sin(drift * 2) * 0.05;
                ctx.fillStyle = this._colorWithAlpha(accent, 0.55);
                ctx.beginPath();
                ctx.ellipse(
                    Math.cos(drift) * radius * (0.55 + i * 0.11),
                    Math.sin(drift * 1.23) * radius * (0.35 + i * 0.06),
                    radius * (0.08 + i * 0.012),
                    radius * 0.045,
                    drift,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }
        } else if (typeKey === 'tank') {
            ctx.globalAlpha = 0.18 + flash * 0.28;
            ctx.strokeStyle = this._colorWithAlpha(eyeColor, 0.7);
            ctx.lineWidth = Math.max(1.5, radius * 0.05);
            ctx.beginPath();
            ctx.ellipse(0, radius * 0.24, radius * 1.45, radius * 1.04, Math.sin(time + zombie.phaseOffset) * 0.08, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderZombieSilhouetteAura(ctx, zombie, radius, typeKey, time, flash, eyeColor) {
        const accent = this._getZombieAccent(zombie, eyeColor);
        const pulse = 0.5 + Math.sin(time * 4 + zombie.phaseOffset) * 0.5;
        const threat = zombie.anim?.attackPulse || 0;
        const visual = zombie.visual || {};

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.12 + threat * 0.18 + flash * 0.22;
        const aura = ctx.createRadialGradient(0, -radius * 0.1, radius * 0.2, 0, 0, radius * (1.65 + threat * 0.28));
        aura.addColorStop(0, this._colorWithAlpha(eyeColor, 0.24));
        aura.addColorStop(0.55, this._colorWithAlpha(accent, 0.12));
        aura.addColorStop(1, this._colorWithAlpha(accent, 0));
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.55, radius * 1.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this._colorWithAlpha(zombie.type?.shadowColor || '#050805', 0.62);

        if (typeKey === 'runner') {
            ctx.beginPath();
            ctx.moveTo(-radius * (1.1 + threat * 0.25), radius * 0.7);
            ctx.quadraticCurveTo(-radius * 0.15, -radius * (1.75 + pulse * 0.12), radius * (1.08 + threat * 0.18), radius * 0.58);
            ctx.quadraticCurveTo(radius * 0.1, radius * 0.18, -radius * (1.1 + threat * 0.25), radius * 0.7);
            ctx.fill();
        } else if (typeKey === 'tank') {
            this._roundRect(ctx, -radius * 1.25, -radius * 1.42, radius * 2.5, radius * 2.66, radius * 0.42);
            ctx.fill();
            ctx.globalAlpha = 0.38;
            ctx.strokeStyle = this._colorWithAlpha(accent, 0.7);
            ctx.lineWidth = Math.max(1.2, radius * 0.04);
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.moveTo(-radius * 1.05, i * radius * 0.44 + visual.shoulderBias * radius * 0.18);
                ctx.lineTo(radius * 1.05, i * radius * 0.44 - visual.shoulderBias * radius * 0.18);
                ctx.stroke();
            }
        } else if (typeKey === 'spitter') {
            ctx.beginPath();
            ctx.ellipse(0, radius * 0.04, radius * (1.3 + pulse * 0.09), radius * (1.08 + threat * 0.18), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.32 + threat * 0.25;
            ctx.strokeStyle = this._colorWithAlpha(accent, 0.75);
            ctx.lineWidth = Math.max(1, radius * 0.035);
            for (let i = 0; i < 4; i++) {
                const a = time * 1.5 + i * Math.PI * 0.5 + zombie.phaseOffset;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * radius * 0.52, Math.sin(a) * radius * 0.32, radius * (0.18 + threat * 0.06), 0, Math.PI * 2);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(-radius * 1.15, -radius * 0.5);
            ctx.quadraticCurveTo(-radius * 0.78, radius * 0.28, -radius * 1.05, radius * 1.24);
            ctx.lineTo(-radius * 0.46, radius * 0.9 + visual.asymmetry * radius * 0.6);
            ctx.lineTo(0, radius * 1.25);
            ctx.lineTo(radius * 0.52, radius * 0.82 - visual.asymmetry * radius * 0.4);
            ctx.quadraticCurveTo(radius * 0.88, radius * 0.22, radius * 1.1, -radius * 0.42);
            ctx.quadraticCurveTo(0, -radius * 1.16, -radius * 1.15, -radius * 0.5);
            ctx.fill();
        }

        ctx.restore();
    }

    _renderZombieTypeReadout(ctx, zombie, radius, typeKey, time, flash, eyeColor) {
        const accent = this._getZombieAccent(zombie, eyeColor);
        const visual = zombie.visual || {};
        const threat = zombie.anim?.attackPulse || 0;
        const pulse = 0.55 + Math.sin(time * 5 + zombie.phaseOffset) * 0.45;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (flash > 0.01) {
            ctx.globalAlpha = Math.min(0.7, flash * 0.75);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(2, radius * 0.08);
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * 1.18, radius * 1.28, visual.scarAngle || 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = this._colorWithAlpha(accent, 0.82);
        ctx.lineWidth = Math.max(1, radius * 0.045);

        if (typeKey === 'runner') {
            for (let i = 0; i < 3; i++) {
                const y = -radius * 0.55 + i * radius * 0.38;
                ctx.beginPath();
                ctx.moveTo(-radius * (0.86 + threat * 0.18), y);
                ctx.lineTo(-radius * 1.32, y + radius * (0.18 + pulse * 0.08));
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(radius * (0.86 + threat * 0.18), y + radius * 0.08);
                ctx.lineTo(radius * 1.28, y - radius * (0.15 + pulse * 0.08));
                ctx.stroke();
            }
        } else if (typeKey === 'spitter') {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 4; i++) {
                const drop = (time * 1.8 + i * 0.24 + zombie.phaseOffset) % 1;
                ctx.globalAlpha = (1 - drop) * (0.35 + threat * 0.35);
                ctx.fillStyle = this._colorWithAlpha(accent, 0.75);
                ctx.beginPath();
                ctx.ellipse(
                    (i - 1.5) * radius * 0.18,
                    radius * (0.18 + drop * 0.78),
                    radius * 0.045,
                    radius * (0.08 + drop * 0.04),
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }
        } else if (typeKey === 'tank') {
            ctx.globalAlpha = 0.86;
            for (let i = 0; i < zombie.maxHp; i++) {
                const lit = i < zombie.hp;
                ctx.fillStyle = lit ? this._colorWithAlpha(eyeColor, 0.9) : 'rgba(25, 30, 42, 0.72)';
                ctx.beginPath();
                ctx.ellipse(
                    (i - (zombie.maxHp - 1) * 0.5) * radius * 0.26,
                    radius * 1.18,
                    radius * 0.08,
                    radius * 0.045,
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }
        } else {
            ctx.strokeStyle = this._colorWithAlpha(accent, 0.68);
            ctx.setLineDash([radius * 0.08, radius * 0.1]);
            ctx.beginPath();
            ctx.moveTo(-radius * 0.55, -radius * 0.92);
            ctx.quadraticCurveTo(-radius * 0.12 + visual.asymmetry * radius, -radius * 0.15, radius * 0.5, radius * 0.72);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    _renderTankZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const tau = Math.PI * 2;
        const anim = zombie.anim || {};
        const pose = this._getZombieMotionPreset(zombie.typeKey, anim.poseIndex || 0);
        const silhouetteLine = Math.max(1.6, radius * 0.06);

        // Draw legs - Heavy, stomping gait
        const legStride = limbSwing * 0.18 * pose.arm;
        const legStride2 = limbSwing2 * 0.18 * pose.arm;
        const legBounce = Math.abs(Math.sin(zombie.wobble * 2.0 + pose.twist)) * (5 * speedRatio) * pose.bounce;

        ctx.save();
        // Left leg
        ctx.save();
        ctx.translate(-radius * 0.35, radius * 0.8 + legBounce + pose.bodyShift * 0.15);
        ctx.rotate(legStride);
        ctx.fillStyle = this._darkenColor(baseColor, 0.15);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.25, radius * 0.65, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine);
        ctx.restore();

        // Right leg
        ctx.save();
        ctx.translate(radius * 0.35, radius * 0.8 + legBounce - pose.bodyShift * 0.15);
        ctx.rotate(-legStride2);
        ctx.fillStyle = this._darkenColor(baseColor, 0.15);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.25, radius * 0.65, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine);
        ctx.restore();

        // Main torso with layered armor effect
        const bodyGrad = ctx.createRadialGradient(0, -radius * 0.3, radius * 0.5, 0, 0, radius * 1.3);
        bodyGrad.addColorStop(0, this._lightenColor(baseColor, 0.2));
        bodyGrad.addColorStop(0.5, baseColor);
        bodyGrad.addColorStop(1, this._darkenColor(baseColor, 0.3));
        ctx.fillStyle = bodyGrad;
        this._roundRect(ctx, -radius * 1.1, -radius * 1.4, radius * 2.2, radius * 2.4, radius * 0.4);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 1.1);

        // Breathing/pulsing armor
        const breathPulse = (Math.sin(time * 2.5 + pose.twist) * 0.02 + 1) * (1 + pose.jaw * 0.06);
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = this._lightenColor(baseColor, 0.3);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.9, -radius * 0.8);
        ctx.lineTo(radius * 0.9, -radius * 0.8);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-radius * 0.9, -radius * 0.2);
        ctx.lineTo(radius * 0.9, -radius * 0.2);
        ctx.stroke();

        // Metallic ribs with breathing animation
        for (let i = 0; i < 3; i++) {
            const y = -radius * 0.5 + i * radius * 0.4;
            const ribWave = Math.sin(time * 2.5 + i * 0.4) * (radius * 0.08);
            ctx.beginPath();
            ctx.moveTo(-radius * 0.7 + ribWave, y);
            ctx.lineTo(radius * 0.7 + ribWave, y);
            ctx.stroke();
        }
        ctx.restore();

        // Shoulder armor
        ctx.fillStyle = this._darkenColor(baseColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(-radius * 0.9, -radius * 0.9, radius * 0.35, radius * 0.45, 0, 0, tau);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(radius * 0.9, -radius * 0.9, radius * 0.35, radius * 0.45, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.95);

        // Arms - Powerful swinging with shoulder rotation
        const armRotL = limbSwing * 0.45;
        const armRotR = -limbSwing2 * 0.45;
        const shoulderBounce = Math.abs(Math.sin(zombie.wobble * 2.0 + pose.twist)) * (3 * speedRatio) * pose.arm;

        ctx.save();
        ctx.translate(-radius * 1.0, -radius * 0.7 - shoulderBounce + pose.shoulder * 0.3);
        ctx.rotate(armRotL);
        ctx.fillStyle = this._darkenColor(baseColor, 0.1);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.22, radius * 0.7, 0, 0, tau);
        ctx.fill();
        // Fist with impact flex
        const fistSize = radius * 0.28 * (1 + Math.sin(zombie.wobble * 3) * 0.08);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 1.2, fistSize, fistSize * 1.15, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.88);
        ctx.restore();

        ctx.save();
        ctx.translate(radius * 1.0, -radius * 0.7 - shoulderBounce - pose.shoulder * 0.3);
        ctx.rotate(armRotR);
        ctx.fillStyle = this._darkenColor(baseColor, 0.1);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.22, radius * 0.7, 0, 0, tau);
        ctx.fill();
        // Fist
        const fistSize2 = radius * 0.28 * (1 + Math.sin(zombie.wobble * 3 + Math.PI) * 0.08);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 1.2, fistSize2, fistSize2 * 1.15, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.88);
        ctx.restore();

        // Head - Tracking and nodding
        ctx.fillStyle = baseColor;
        ctx.save();
        ctx.translate(0, -radius * 1.3 + headBob * 0.12 + pose.head * 0.6);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (0.7 + pose.jaw * 0.06), radius * (0.8 + pose.jaw * 0.04), 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.88);

        // Face details with animation
        ctx.fillStyle = this._darkenColor(baseColor, 0.3);
        ctx.beginPath();
        ctx.ellipse(0, headBob * 0.04 + pose.bodyShift * 0.03, radius * (0.6 + pose.eye * 0.02), radius * (0.65 - pose.eye * 0.015), 0, 0, tau);
        ctx.fill();

        // Giant tracking eye with pupil dilation
        const angleToPlayer = Math.atan2(this.player.pos.y - zombie.y, this.player.pos.x - zombie.x);
        const eyeX = Math.cos(angleToPlayer) * radius * 0.15;
        const eyeY = 0;

        ctx.fillStyle = eyeColor;
        ctx.shadowBlur = 25;
        ctx.shadowColor = eyeColor;
        const pupilSize = radius * (0.08 + Math.sin(time * 3 + pose.twist) * 0.02 + pose.jaw * 0.01);
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, radius * 0.28, 0, tau);
        ctx.fill();

        // Pupil tracking with dilation based on alert
        const alertness = Math.max(0, 1 - Math.hypot(this.player.pos.x - zombie.x, this.player.pos.y - zombie.y) / 400);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeX + Math.cos(angleToPlayer) * (8 + pose.drag * 5), eyeY + Math.sin(angleToPlayer) * (8 + pose.drag * 3), pupilSize + alertness * 3, 0, tau);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Damage cracks when hurt
        if (zombie.hp < zombie.maxHp) {
            const hpPct = zombie.hp / zombie.maxHp;
            ctx.strokeStyle = `rgba(255,100,100,${0.3 + (1 - hpPct) * 0.5})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.2, 0, tau);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    _renderRunnerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const tau = Math.PI * 2;
        const anim = zombie.anim || {};
        const pose = this._getZombieMotionPreset(zombie.typeKey, anim.poseIndex || 0);
        const silhouetteLine = Math.max(1.4, radius * 0.05);

        // Sleek, aerodynamic design with aggressive running gait
        const legStride = limbSwing * 0.35 * pose.arm;
        const legStride2 = limbSwing2 * 0.35 * pose.arm;
        const legBounce = Math.abs(Math.sin(zombie.wobble * 2.5 + (anim.swing || 0) + pose.twist)) * (8 * speedRatio) * pose.bounce;

        // Legs - Thin and fast with high stride
        ctx.save();
        ctx.translate(-radius * 0.3, radius * 0.9 + legBounce + pose.bodyShift * 0.12);
        ctx.rotate(legStride);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.55, radius * 0.18, radius * 0.75, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.95);
        ctx.restore();

        ctx.save();
        ctx.translate(radius * 0.3, radius * 0.9 + legBounce - pose.bodyShift * 0.12);
        ctx.rotate(-legStride2);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.55, radius * 0.18, radius * 0.75, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.95);
        ctx.restore();

        // Sleek elongated torso with breathing
        const torsoGrad = ctx.createLinearGradient(0, -radius * 1.2, 0, radius * 1.0);
        torsoGrad.addColorStop(0, this._lightenColor(baseColor, 0.15));
        torsoGrad.addColorStop(0.5, baseColor);
        torsoGrad.addColorStop(1, this._darkenColor(baseColor, 0.25));
        ctx.fillStyle = torsoGrad;

        const torsoHeightVariation = headBob * 0.08 + (anim.roll || 0) * radius * 0.08 + pose.bodyShift * 0.18;
        ctx.beginPath();
        ctx.moveTo(0, -radius * 1.5 + torsoHeightVariation);
        ctx.lineTo(radius * 0.7, radius * 0.5);
        ctx.quadraticCurveTo(0, radius * 1.2, -radius * 0.7, radius * 0.5);
        ctx.closePath();
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine);

        ctx.fillStyle = this._darkenColor(baseColor, 0.22);
        ctx.beginPath();
        ctx.moveTo(-radius * 0.58, -radius * 0.9);
        ctx.quadraticCurveTo(-radius * 0.95, -radius * 0.55, -radius * 0.82, -radius * 0.1);
        ctx.quadraticCurveTo(-radius * 0.42, -radius * 0.34, -radius * 0.2, -radius * 0.9);
        ctx.closePath();
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.72, 'rgba(11, 15, 10, 0.9)');

        // Speed lines/muscle definition with animation
        ctx.strokeStyle = this._darkenColor(baseColor, 0.4);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const y = -radius * 0.8 + i * radius * 0.5;
            const muscleBulge = Math.sin(zombie.wobble * 2.2 + i * 0.5 + (anim.swing || 0) + pose.twist) * (radius * 0.1) * pose.arm;
            ctx.beginPath();
            ctx.moveTo(-radius * 0.4 + muscleBulge, y);
            ctx.quadraticCurveTo(muscleBulge, y - 15, radius * 0.4 + muscleBulge, y);
            ctx.stroke();
        }

        // Arms - Rapid swinging with full extension
        const armRotL = limbSwing * 0.65;
        const armRotR = -limbSwing2 * 0.65;
        const armExtension = speedRatio * (radius * 0.15);

        ctx.save();
        ctx.translate(-radius * 0.8 - armExtension - pose.shoulder * 0.25, -radius * 0.6 + pose.head * 0.2);
        ctx.rotate(armRotL);
        ctx.fillStyle = this._darkenColor(baseColor, 0.15);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.19, radius * 0.8, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.88);
        ctx.restore();

        ctx.save();
        ctx.translate(radius * 0.8 + armExtension + pose.shoulder * 0.25, -radius * 0.6 - pose.head * 0.2);
        ctx.rotate(armRotR);
        ctx.fillStyle = this._darkenColor(baseColor, 0.15);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.19, radius * 0.8, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.88);
        ctx.restore();

        // Pointed head (aggressive profile) with movement
        ctx.fillStyle = baseColor;
        ctx.save();
        ctx.translate(0, -radius * 1.65 + Math.sin(zombie.wobble * 1.8 + (anim.jitter || 0) + pose.twist) * (radius * 0.15) + headBob * 0.02 + pose.head * 0.6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 0.5, -radius * 0.6);
        ctx.lineTo(radius * 0.35, -radius * 0.4);
        ctx.quadraticCurveTo(0, -radius * 0.3, -radius * 0.35, -radius * 0.4);
        ctx.lineTo(-radius * 0.5, -radius * 0.6);
        ctx.closePath();
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.92);

        ctx.fillStyle = this._darkenColor(baseColor, 0.18);
        ctx.beginPath();
        ctx.moveTo(-radius * 0.42, -radius * 0.28);
        ctx.quadraticCurveTo(0, -radius * 0.52, radius * 0.42, -radius * 0.28);
        ctx.quadraticCurveTo(radius * 0.18, radius * 0.05, 0, radius * 0.12);
        ctx.quadraticCurveTo(-radius * 0.18, radius * 0.05, -radius * 0.42, -radius * 0.28);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.68, 'rgba(12, 14, 10, 0.88)');

        // Eyes - Narrowed and predatory with rapid blinking
        ctx.fillStyle = eyeColor;
        ctx.shadowBlur = 20;
        ctx.shadowColor = eyeColor;
        const eyeY = -radius * 0.55 + headBob * 0.03 + (anim.jitter || 0) * 0.02;
        const blinkCycle = anim.blink ?? Math.pow(Math.sin(time * 4 + zombie.phaseOffset), 8);
        const eyeHeightL = Math.max(0.05 * radius, radius * 0.12 * (0.1 + blinkCycle * 0.9 + pose.eye * 0.05));
        const eyeHeightR = Math.max(0.05 * radius, radius * 0.12 * (0.12 + blinkCycle * 0.35 + (anim.roll || 0) * 0.15 + pose.eye * 0.04));

        ctx.beginPath();
        ctx.ellipse(-radius * 0.25, eyeY, radius * 0.15, eyeHeightL, -0.3, 0, tau);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(radius * 0.25, eyeY, radius * 0.15, eyeHeightR, 0.3, 0, tau);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        ctx.restore();
    }

    _renderSpitterZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const tau = Math.PI * 2;
        const anim = zombie.anim || {};
        const pose = this._getZombieMotionPreset(zombie.typeKey, anim.poseIndex || 0);
        const silhouetteLine = Math.max(1.5, radius * 0.055);

        // Bloated, unstable form with constant pulsing
        const nerveJitter = Math.sin(time * 15 + (anim.swing || 0) + pose.twist) * 2 * pose.bounce;
        const bulgePhase = Math.sin(time * 2.5 + (anim.roll || 0) + pose.twist) * 0.2;
        const tensionPulse = Math.sin(time * 4) * 0.1 + 1;

        // Main bulbous body with internal pressure visualization
        const bodyGrad = ctx.createRadialGradient(0, -radius * 0.2, radius * 0.3, 0, 0, radius * 1.35);
        bodyGrad.addColorStop(0, this._lightenColor(baseColor, 0.25));
        bodyGrad.addColorStop(0.4, baseColor);
        bodyGrad.addColorStop(0.8, this._darkenColor(baseColor, 0.2));
        bodyGrad.addColorStop(1, this._darkenColor(baseColor, 0.35));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, nerveJitter + bulgePhase * radius * 0.1 + headBob * 0.02 + (anim.jitter || 0) * 0.12 + pose.bodyShift * 0.16, radius * 1.2 * tensionPulse, radius * (0.95 + pose.jaw * 0.05) * tensionPulse, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine);

        ctx.fillStyle = this._darkenColor(baseColor, 0.18);
        ctx.beginPath();
        ctx.ellipse(-radius * 0.85, -radius * 0.05 + nerveJitter * 0.15, radius * 0.3, radius * 0.42, -0.5, 0, tau);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(radius * 0.82, radius * 0.06 + nerveJitter * 0.12, radius * 0.34, radius * 0.45, 0.35, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.75, 'rgba(12, 14, 10, 0.9)');

        // Acidic pustules/lesions with animated swelling
        ctx.fillStyle = this._darkenColor(baseColor, 0.3);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * tau + time * 0.6;
            const px = Math.cos(ang) * radius * (0.75 + pose.eye * 0.04);
            const py = Math.sin(ang) * radius * 0.55 + nerveJitter + pose.bodyShift * 0.04;
            const swellPhase = Math.sin(time * 3.5 + i * 0.8 + (anim.swing || 0) + pose.twist) * 0.5 + 0.5;
            const sz = radius * (0.12 + swellPhase * 0.08);
            ctx.beginPath();
            ctx.ellipse(px, py, sz, sz * 0.8, 0, 0, tau);
            ctx.fill();
        }

        // Pulsing internal organs visible through thin skin
        const organPulse = Math.sin(time * 5) * 0.4 + 0.6;
        ctx.strokeStyle = `rgba(255,150,100,${(0.2 + organPulse * 0.2)})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * tau + time * 0.8;
            const length = radius * (0.7 + Math.sin(time * 3 + i + (anim.roll || 0) + pose.twist) * 0.2) * (1 + pose.arm * 0.03);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * length, Math.sin(ang) * length * 0.7 + nerveJitter);
            ctx.stroke();
        }

        // Neck/head area - where acid comes from
        ctx.fillStyle = baseColor;
        ctx.save();
        ctx.translate(0, -radius * 0.85 + headBob * 0.02 + (anim.jitter || 0) * 0.1 + pose.head * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.5, radius * 0.6, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.82);

        // Mouth opening with reactive behavior and drooling
        const dx = this.ball.pos.x - zombie.x;
        const dy = this.ball.pos.y - zombie.y;
        const dist = Math.hypot(dx, dy);
        const alertness = Math.max(0, 1 - dist / 550);

        ctx.fillStyle = this._darkenColor(baseColor, 0.5);
        const mouthOpen = 0.3 + alertness * 0.6 + Math.sin(time * 4 + (anim.roll || 0) + pose.twist) * 0.15 + pose.jaw * 0.1;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.25, radius * mouthOpen * 0.25, 0, 0, tau);
        ctx.fill();

        // Acidic drool
        const droolSize = (0.2 + alertness * 0.6) * radius;
        if (alertness > 0.1) {
            ctx.fillStyle = `rgba(100,255,50,${alertness * 0.4})`;
            ctx.beginPath();
            ctx.ellipse(0, radius * 0.15, droolSize * 0.15, droolSize * 0.25, 0, 0, tau);
            ctx.fill();
        }

        // Reactive multiple eyes (panic when threatened)
        ctx.fillStyle = eyeColor;
        ctx.shadowBlur = 18;
        ctx.shadowColor = eyeColor;
        for (let i = 0; i < 3; i++) {
            const panicJitter = (Math.sin(time * 12 + i) - 0.5) * 4 * alertness;
            const eyeX = (i - 1) * radius * (0.35 + pose.eye * 0.04) + panicJitter + pose.bodyShift * 0.1;
            const eyeY = -radius * 0.55 + headBob * 0.02 + (anim.jitter || 0) * 0.08 + Math.sin(time * 14 + i * 0.5 + pose.twist) * (3 + alertness * 5);
            const eyeSize = radius * (0.12 + alertness * 0.05);
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeSize, 0, tau);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();

        ctx.restore();
    }

    _renderShamblerZombie(ctx, radius, time, limbSwing, limbSwing2, speedRatio, flash, baseColor, eyeColor, zombie, headBob) {
        const tau = Math.PI * 2;
        const anim = zombie.anim || {};
        const pose = this._getZombieMotionPreset(zombie.typeKey, anim.poseIndex || 0);
        const silhouetteLine = Math.max(1.4, radius * 0.05);

        // Hunched, shambling form with poor coordination
        const legStride = limbSwing * 0.22 * pose.arm;
        const legStride2 = limbSwing2 * 0.22 * pose.arm;
        const legBounce = Math.abs(Math.sin(zombie.wobble * 1.8 + (anim.swing || 0) + pose.twist)) * (4 * speedRatio) * pose.bounce;

        // Left leg
        ctx.save();
        ctx.translate(-radius * 0.4, radius * 0.85 + legBounce + pose.bodyShift * 0.08);
        ctx.rotate(legStride + Math.sin(time * 1.5) * 0.15);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.22, radius * 0.68, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.92);
        ctx.restore();

        // Right leg - Offset timing for shambling effect
        ctx.save();
        ctx.translate(radius * 0.4, radius * 0.85 + legBounce - pose.bodyShift * 0.08);
        ctx.rotate(-legStride2 + Math.sin(time * 1.5 + 0.5) * 0.15);
        ctx.fillStyle = this._darkenColor(baseColor, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.5, radius * 0.22, radius * 0.68, 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.92);
        ctx.restore();

        // Hunched torso with breathing and decay
        const torsoGrad = ctx.createRadialGradient(-radius * 0.1, 0, radius * 0.4, 0, radius * 0.2, radius * 1.2);
        torsoGrad.addColorStop(0, this._lightenColor(baseColor, 0.1));
        torsoGrad.addColorStop(0.5, baseColor);
        torsoGrad.addColorStop(1, this._darkenColor(baseColor, 0.3));
        ctx.fillStyle = torsoGrad;

        const hunchBreathe = Math.sin(time * 1.8 + (anim.roll || 0) + pose.twist) * (radius * 0.12) * pose.arm;
        const torsoSkew = 1 - Math.sin(time * 2 + zombie.phaseOffset) * 0.05;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.1 + hunchBreathe + pose.bodyShift * 0.06, radius * 0.1 + (anim.jitter || 0) * 0.12, radius * (1.0 + pose.eye * 0.03) * torsoSkew, radius * (1.15 + pose.jaw * 0.05), 0, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine);

        ctx.fillStyle = this._darkenColor(baseColor, 0.22);
        ctx.beginPath();
        ctx.moveTo(-radius * 0.98, -radius * 0.45);
        ctx.quadraticCurveTo(-radius * 0.62, -radius * 0.18, -radius * 0.42, radius * 0.08);
        ctx.quadraticCurveTo(-radius * 0.72, radius * 0.26, -radius * 0.96, radius * 0.32);
        ctx.lineTo(-radius * 0.66, radius * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(radius * 0.98, -radius * 0.35);
        ctx.quadraticCurveTo(radius * 0.65, -radius * 0.12, radius * 0.5, radius * 0.12);
        ctx.quadraticCurveTo(radius * 0.8, radius * 0.3, radius * 0.96, radius * 0.39);
        ctx.lineTo(radius * 0.6, radius * 0.03);
        ctx.closePath();
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.7, 'rgba(12, 14, 10, 0.88)');

        // Decay patches with pulsing animation
        ctx.fillStyle = this._darkenColor(baseColor, 0.4);
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * tau + time * 0.4;
            const px = Math.cos(ang) * radius * 0.6;
            const py = radius * 0.1 + Math.sin(ang) * radius * 0.7;
            const decayPulse = Math.sin(time * 2.5 + i * 0.6) * 0.5 + 0.5;
            const sz = radius * (0.18 + decayPulse * 0.1);
            ctx.beginPath();
            ctx.ellipse(px, py, sz, sz * 1.2, 0, 0, tau);
            ctx.fill();
        }

        // Arms - Weak and drooping with slight quiver
        const armRotL = limbSwing * 0.25 + Math.sin(time * 3 + zombie.phaseOffset) * 0.08 + (anim.swing || 0) * 0.04 + pose.twist * 0.1;
        const armRotR = -limbSwing2 * 0.25 + Math.sin(time * 3 + zombie.phaseOffset + Math.PI) * 0.08 - (anim.swing || 0) * 0.04 - pose.twist * 0.1;
        const armDroop = Math.sin(time * 2) * (radius * 0.1);

        ctx.save();
        ctx.translate(-radius * 0.85, -radius * 0.5 + armDroop + pose.shoulder * 0.15);
        ctx.rotate(armRotL);
        ctx.fillStyle = this._darkenColor(baseColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.55, radius * 0.2, radius * 0.75, 0, 0, tau);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(radius * 0.85, -radius * 0.5 + armDroop - pose.shoulder * 0.15);
        ctx.rotate(armRotR);
        ctx.fillStyle = this._darkenColor(baseColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.55, radius * 0.2, radius * 0.75, 0, 0, tau);
        ctx.fill();
        ctx.restore();

        // Head - Tilted and misaligned with tremor
        const headTilt = Math.sin(time * 1.2 + zombie.phaseOffset) * 0.25 + (anim.roll || 0) * 0.1 + pose.twist * 0.12;
        const headTwitch = Math.sin(time * 4 + zombie.animPhase) * 0.08 + (anim.jitter || 0) * 0.03 + pose.head * 0.08;
        ctx.fillStyle = baseColor;
        ctx.save();
        ctx.translate(radius * 0.15, -radius * 1.15 + headTwitch + headBob * 0.02 + pose.head * 0.5);
        ctx.rotate(headTilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (0.65 + pose.eye * 0.02), radius * (0.75 + pose.jaw * 0.04), 0.2, 0, tau);
        ctx.fill();

        // Face with asymmetric features
        ctx.fillStyle = this._darkenColor(baseColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (0.5 + pose.eye * 0.02), radius * (0.6 + pose.jaw * 0.03), 0.2, 0, tau);
        ctx.fill();
        this._strokeZombiePart(ctx, silhouetteLine * 0.76);

        // Hollow, dead eyes with slow, irregular blinking
        ctx.fillStyle = eyeColor;
        ctx.shadowBlur = 16;
        ctx.shadowColor = eyeColor;
        const slowBlink = (anim.blink ?? Math.pow(Math.sin(time * 0.3 + zombie.phaseOffset), 12)) > 0.92 ? 0.08 : 1.0;
        const irregularBlink = Math.sin(time * 0.25 + pose.twist) < 0.5 ? slowBlink : 0.15 + pose.eye * 0.06;
        const eyeYOffset = -radius * 0.2 + headBob * 0.015;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.35 + pose.bodyShift * 0.04, eyeYOffset, radius * (0.18 + pose.eye * 0.01), radius * 0.18 * irregularBlink, 0, 0, tau);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(radius * 0.25 - pose.bodyShift * 0.04, eyeYOffset, radius * (0.18 + pose.eye * 0.01), radius * 0.18 * irregularBlink, 0, 0, tau);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Stitching marks (lore detail)
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([1.5, 1.5]);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.45, 0, tau);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();

        ctx.restore();
    }

    // Helper functions for color manipulation
    _lightenColor(color, amount = 0.1) {
        // Convert hex to RGB, lighten, return hex
        const hex = color.replace('#', '');
        const r = Math.min(255, Math.round(parseInt(hex.substr(0, 2), 16) * (1 + amount)));
        const g = Math.min(255, Math.round(parseInt(hex.substr(2, 2), 16) * (1 + amount)));
        const b = Math.min(255, Math.round(parseInt(hex.substr(4, 2), 16) * (1 + amount)));
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    _darkenColor(color, amount = 0.1) {
        // Convert hex to RGB, darken, return hex
        const hex = color.replace('#', '');
        const r = Math.round(parseInt(hex.substr(0, 2), 16) * (1 - amount));
        const g = Math.round(parseInt(hex.substr(2, 2), 16) * (1 - amount));
        const b = Math.round(parseInt(hex.substr(4, 2), 16) * (1 - amount));
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    _colorWithAlpha(color, alpha) {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        return color;
    }

    initializeGameMode() {
        this.refreshBallStudioConfig();

        // Defensive check: ensure ball exists before setting properties
        if (!this.ball) {
            console.warn('[initializeGameMode] Ball is null, cannot initialize game mode');
            return;
        }

        if (this.canvas) {
            this.canvas.style.transition = 'opacity 180ms ease, filter 180ms ease';
            this.canvas.style.opacity = '1';
            this.canvas.style.filter = 'none';
        }

        const config = this.modeSpeeds[this.gameMode] || this.modeSpeeds.classic;
        this.resetZombieModeState();

        // Scale speeds based on canvas size so gameplay feels consistent
        const BASE_AREA = 1280 * 720; // reference resolution used for tuning
        const currentArea = Math.max(1, this.width * this.height);
        // Use square-root area scaling to keep linear dimensions roughly proportional
        let scale = Math.sqrt(currentArea / BASE_AREA);
        // Clamp scale to avoid extreme values on very small/large screens
        scale = Math.max(0.6, Math.min(1.6, scale));

        const scaledBase = Math.max(300, Math.round(config.ballBase * scale));
        const scaledMax = Math.max(scaledBase + 200, Math.round(config.ballMax * scale));
        const scaledMin = Math.max(200, Math.round(config.ballBase * 0.35 * scale));
        // Enforce a sensible floor so the game never gets too slow on large screens
        const GLOBAL_MIN_BALL_SPEED = 420; // editable constant — keeps pace
        // Ensure min is not higher than base (use 90% of base as safety)
        const allowedMin = Math.min(Math.max(scaledMin, GLOBAL_MIN_BALL_SPEED), Math.round(scaledBase * 0.9));

        const paddleScale = Math.max(0.7, Math.min(1.8, this.height / 720));
        const scaledPaddleMax = Math.max(300, Math.round(config.paddleMax * paddleScale));

        this.ball.baseSpeed = scaledBase;
        this.ball.maxSpeed = scaledMax;
        this.ball.minSpeed = allowedMin;
        this.player.maxSpeed = scaledPaddleMax;
        this.aiPaddle.maxSpeed = scaledPaddleMax;
        this.player.resetSize();
        this.aiPaddle.resetSize();
        this.obstacles = [];
        this.obstacleCourse = null;
        Obstacle.groups = []; // Clear obstacle groups when changing modes
        this.gravityWells = [];

        // ensure the AI paddle has the correct skin when modes change
        if (this.aiPaddle && typeof this.aiPaddle.setZombieBossSkin === 'function') {
            // In multiplayer modes the right paddle is human-controlled; do not lock it into boss render state.
            this.aiPaddle.setZombieBossSkin(this.gameMode === 'zombie' && !this.isMultiplayer);
        }

        switch (this.gameMode) {
            case 'customise':
                this.bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
                this.bgGradient.addColorStop(0, '#081a70');
                this.bgGradient.addColorStop(0.2, '#0a1a50');
                this.bgGradient.addColorStop(0.5, '#051540');
                this.bgGradient.addColorStop(0.8, '#051030');
                this.bgGradient.addColorStop(1, '#020820');
                if (this.gameMode !== 'customise' || this.customSettings.previewModeActive) {
                    this.disablePowerUpsForCustomise();
                }
                this.applyCustomiseSettings(this.customSettings.previewModeActive);
                if (!this.customSettings.previewModeActive) {
                    this.updateCustomPowerUpVisibility();
                }
                break;
            case 'obstacle':
                this.createObstacles();
                this.bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
                this.bgGradient.addColorStop(0.0, '#061320');
                this.bgGradient.addColorStop(0.52, '#071827');
                this.bgGradient.addColorStop(1.0, '#030812');
                this.asphaltNoise = [];
                this.asphaltCracks = [];
                this.renderStreetCourt = null;
                break;
            case 'gravity':
                this.createGravityWells();
                this.bgGradient = this.ctx.createRadialGradient(
                    this.width / 2, this.height / 2, 0,
                    this.width / 2, this.height / 2, Math.max(this.width, this.height) / 2
                );
                this.bgGradient.addColorStop(0, '#0a0533');
                this.bgGradient.addColorStop(0.3, '#1a0b4a');
                this.bgGradient.addColorStop(0.6, '#0f0530');
                this.bgGradient.addColorStop(0.9, '#050015');
                this.bgGradient.addColorStop(1, '#000008');
                break;
            case 'speed':
                this.initSpeedParticles();
                break;
            case 'zombie':
                if (!this.ai || !(this.ai instanceof ZombieBoss)) {
                    this.ai = new ZombieBoss(this.aiPaddle, this.ball, this);
                }
                this.bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
                this.bgGradient.addColorStop(0, '#0f0918');
                this.bgGradient.addColorStop(0.3, '#1a1026');
                this.bgGradient.addColorStop(0.7, '#100a1c');
                this.bgGradient.addColorStop(1, '#05020b');
                break;
            default:
                this.bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
                this.bgGradient.addColorStop(0, '#081a70');
                this.bgGradient.addColorStop(0.2, '#0a1a50');
                this.bgGradient.addColorStop(0.5, '#051540');
                this.bgGradient.addColorStop(0.8, '#051030');
                this.bgGradient.addColorStop(1, '#020820');
        }
    }

    createObstacles() {
        this.obstacles = [];
        Obstacle.groups = [];
        this.obstacleCourse = new ObstacleCourse(this);
        this.obstacleCourse.rebuild(true);
    }

    createGravityWells() {
        this.gravityWells = [];
        const count = 3 + Math.floor(Math.random() * 3);
        const centerX = this.width * 0.5;
        const centerY = this.height * 0.5;
        const minCenterDist = Math.max(180, Math.min(this.width, this.height) * 0.22);
        const minWellSpacing = Math.max(140, Math.round(Math.min(this.width, this.height) * 0.18));
        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            do {
                x = 80 + Math.random() * (this.width - 160);
                y = 80 + Math.random() * (this.height - 160);
                attempts++;
            } while (
                attempts < 30 && (
                    this.isNearObstacle(x, y) ||
                    Math.hypot(x - centerX, y - centerY) < minCenterDist ||
                    this.gravityWells.some(well => Math.hypot(x - well.pos.x, y - well.pos.y) < minWellSpacing)
                )
            );
            const levelMultiplier = (this.progression?.level ?? 1) / 10;
            const strength = 4200 + Math.random() * 500 * levelMultiplier;
            this.gravityWells.push(new GravityWell(x, y, strength));
        }
    }

    updateGravityInteractionState(dt) {
        const wells = Array.isArray(this.gravityWells) ? this.gravityWells : [];
        const ball = this.ball;
        const ballPos = ball?.pos || null;

        let activeCount = 0;
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        let totalExcitement = 0;
        let nearestDistanceSq = Infinity;
        let nearestRadius = 1;

        for (let i = 0; i < wells.length; i++) {
            const well = wells[i];
            if (!well?.active || !well?.pos) continue;

            activeCount++;

            const excitement = Math.max(0, Math.min(1, well.excitement || 0));
            const strengthWeight = Math.max(0.35, Math.min(2.25, (well.strength || 0) / 4200));
            const weight = strengthWeight * (0.72 + excitement * 0.28);

            totalWeight += weight;
            weightedX += well.pos.x * weight;
            weightedY += well.pos.y * weight;
            totalExcitement += excitement;

            if (ballPos) {
                const dx = well.pos.x - ballPos.x;
                const dy = well.pos.y - ballPos.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < nearestDistanceSq) {
                    nearestDistanceSq = distSq;
                    nearestRadius = Math.max(1, well.radius || 1);
                }
            }
        }

        const centerX = totalWeight > 0 ? weightedX / totalWeight : this.width * 0.5;
        const centerY = totalWeight > 0 ? weightedY / totalWeight : this.height * 0.5;
        const averageExcitement = activeCount > 0 ? totalExcitement / activeCount : 0;
        const proximity = Number.isFinite(nearestDistanceSq)
            ? Math.max(0, 1 - (Math.sqrt(nearestDistanceSq) / Math.max(1, nearestRadius * 2.4)))
            : 0;
        const ambient = Math.max(0, Math.min(1, (activeCount / 5) * 0.22 + averageExcitement * 0.58 + proximity * 0.58));

        this.gravityInteractionPhase = (this.gravityInteractionPhase + dt * (1.1 + ambient * 2.2)) % (Math.PI * 2);

        // Snapshot active gravity wells for precise background star-pulling
        const activeWellSnapshots = [];
        for (let i = 0; i < wells.length; i++) {
            const well = wells[i];
            if (well?.active && well?.pos) {
                activeWellSnapshots.push({
                    x: well.pos.x,
                    y: well.pos.y,
                    radius: well.radius || 1,
                    excitement: well.excitement || 0,
                    strength: well.strength || 0
                });
            }
        }

        this.gravityInteraction = {
            activeCount,
            focusX: centerX,
            focusY: centerY,
            proximity,
            ambient,
            phase: this.gravityInteractionPhase,
            activeWells: activeWellSnapshots,
            nearestDistanceSq: Number.isFinite(nearestDistanceSq) ? nearestDistanceSq : null
        };

        return this.gravityInteraction;
    }

    isNearObstacle(x, y, minDist = 120) {
        for (let obs of this.obstacles) {
            const dist = Math.hypot(x - (obs.pos.x + obs.w / 2), y - (obs.pos.y + obs.h / 2));
            if (dist < minDist) return true;
        }
        return false;
    }

    updateDifficultyDisplay(d) {
        const names = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Expert'];
        this.difficultyDisplay.textContent = names[d];
    }

    setupInput() {
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.paused) return;
            const point = this.getCanvasPoint(e.clientX, e.clientY);
            if (!point) return;
            this.mouseX = point.x;
            this.mouseY = point.y;
        });
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.paused) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            const point = this.getCanvasPoint(e.clientX, e.clientY);
            if (!point) return;

            this.mouseX = point.x;
            this.mouseY = point.y;

            if (this.introActive && this.intro && this.intro.active) {
                this.skipIntro();
            }

            const target = this.getPointerTarget(point.x);
            if (this.pointerControls[target] !== null) return;

            this.pointerControls[target] = e.pointerId;
            if (target === 'player') {
                this.touch.active = true;
                this.touch.id = e.pointerId;
                this.touch.startY = point.y;
                this.touch.lastY = point.y;
            }
            if (typeof this.canvas.setPointerCapture === 'function') {
                try {
                    this.canvas.setPointerCapture(e.pointerId);
                } catch (_) {
                    // Ignore capture failures on older browsers.
                }
            }

            this.updatePointerControlledPaddle(target, point.y);
            if (e.pointerType !== 'mouse') {
                e.preventDefault();
            }
        }, { passive: false });
        this.canvas.addEventListener('pointermove', (e) => {
            if (this.paused) return;
            const point = this.getCanvasPoint(e.clientX, e.clientY);
            if (!point) return;

            this.mouseX = point.x;
            this.mouseY = point.y;

            if (this.pointerControls.player === e.pointerId) {
                this.touch.lastY = point.y;
                this.updatePointerControlledPaddle('player', point.y);
            }
            if (this.pointerControls.ai === e.pointerId) {
                this.updatePointerControlledPaddle('ai', point.y);
            }

            if (e.pointerType !== 'mouse' && (this.pointerControls.player === e.pointerId || this.pointerControls.ai === e.pointerId)) {
                e.preventDefault();
            }
        }, { passive: false });
        const releasePointer = (e) => {
            if (this.pointerControls.player === e.pointerId) {
                this.pointerControls.player = null;
                this.touch.active = false;
            }
            if (this.pointerControls.ai === e.pointerId) {
                this.pointerControls.ai = null;
            }
        };
        this.canvas.addEventListener('pointerup', releasePointer);
        this.canvas.addEventListener('pointercancel', releasePointer);
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.paused) {
                this.togglePause();
                e.preventDefault();
                return;
            }

            if (this.paused) return;

            if (e.key === 'F2') {
                this.togglePerfOverlay();
                e.preventDefault();
                return;
            }

            this.keys[e.key.toLowerCase()] = true;
            if (e.key === ' ' || e.key === 'Enter') e.preventDefault();

            if (e.key === 'Escape') {
                if (this.introActive && this.intro && this.intro.active) {
                    // Skip the match intro.
                    this.skipIntro();
                    e.preventDefault();
                } else if (this.gameMode === 'speed' && this.speedChallenge?.isActive) {
                    // Escape leaves the challenge; it must not also pause the match.
                    this.speedChallenge.cancelChallenge();
                } else {
                    this.togglePause();
                }
            }
        });
        window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
        // Releasing a key while the window is unfocused never sends keyup, which
        // left paddles running away after alt-tab.
        window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
        // Tilt control is for phones/tablets only; 2-in-1 laptops also report
        // orientation and would drift the paddle.
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
        if (window.DeviceOrientationEvent && coarsePointer) {
            window.addEventListener('deviceorientation', e => {
                if (!this.running || this.paused || !e.gamma) return;
                const tilt = e.gamma / 45;
                this.player.pos.y += tilt * this.player.maxSpeed * (1 / 60);
                this.player.clampTo(this.height);
            });
        }

        // Add click to skip intro
        this.canvas.addEventListener('click', () => {
            if (this.introActive && this.intro && this.intro.active) {
                this.skipIntro();
            }
        });
    }

    togglePause() {
        this.setUserPaused(!this.userPaused);

        if (this.paused && typeof this.audio?.stopAllGravityWellSounds === 'function') {
            this.audio.stopAllGravityWellSounds();
        }
    }

    setUserPaused(paused) {
        this.userPaused = !!paused;
        this.syncPauseState();
    }

    setChallengePaused(paused) {
        this.challengePaused = !!paused;
        this.syncPauseState();
    }

    syncPauseState() {
        const nextPaused = !!(this.userPaused || this.challengePaused);
        const wasPaused = this.paused;
        this.paused = nextPaused;

        this.syncMatchAudioState();

        if (this.speedChallenge && typeof this.speedChallenge.setPaused === 'function') {
            this.speedChallenge.setPaused(this.userPaused);
        }

        const pauseBtn = document.getElementById('pause');
        if (pauseBtn && wasPaused !== nextPaused) {
            pauseBtn.textContent = nextPaused ? 'Resume' : 'Pause';
        }
    }

    syncMatchAudioState() {
        const mediaElements = [this.intro?.bgMusic, document.getElementById('bgMusic')]
            .filter(element => element && typeof element.pause === 'function' && typeof element.play === 'function');

        if (this.userPaused) {
            this._pausedMediaElements = mediaElements.filter(element => !element.paused);
            this._pausedMediaElements.forEach(element => {
                try {
                    element.pause();
                } catch (_) {
                    // Ignore media pause failures.
                }
            });
            return;
        }

        if (!this._pausedMediaElements.length) return;

        const mediaToResume = this._pausedMediaElements.slice();
        this._pausedMediaElements = [];
        mediaToResume.forEach(element => {
            try {
                const playResult = element.play();
                if (playResult && typeof playResult.catch === 'function') {
                    playResult.catch(() => { });
                }
            } catch (_) {
                // Ignore media resume failures.
            }
        });
    }

    resetMatch() {
        // Stop any ongoing game loop
        this.stop();
        this.serveHold = 0;
        this.pendingServe = null;
        this.hitStop = 0;
        if (this.speedChallenge && typeof this.speedChallenge.terminateChallenge === 'function') {
            this.speedChallenge.terminateChallenge('reset');
        }
        if (typeof this.audio?.stopAllGravityWellSounds === 'function') {
            this.audio.stopAllGravityWellSounds();
        }

        // Reset game state variables (preserve gameMode — do NOT reset to 'classic')
        this.progression.clearRecentlyUnlocked();
        this.scores.player = 0;
        this.scores.ai = 0;
        this.matchEnding = false;
        this.rallyCount = 0;
        this.maxRally = 0;
        this.maxScore = 11;
        this.running = false;
        this.userPaused = false;
        this.challengePaused = false;
        this.paused = false;
        this.syncPauseState();
        // gameMode intentionally NOT reset here — keep whatever mode was selected
        this.comeback = false;
        this.physicsHz = 240;
        this.dt = 1 / this.physicsHz;
        this.accumulator = 0;
        this.lastTime = performance.now() / 1000;
        this.keys = {};
        this.touch = { active: false, id: null, startY: 0, lastY: 0 };
        this.mouseX = 0;
        this.mouseY = 0;
        this.obstacles = [];
        this.obstacleCourse = null;
        this.gravityWells = [];
        this.powerUps = [];
        this.zombieHands = [];
        this.resetZombieModeState();
        this.additionalBalls = [];
        this.lasers = [];
        this.powerUpTimers = {
            slowBall: 0, fastPaddle: 0, freezeAI: 0, doublePoints: 0,
            bigPaddle: 0, smallBall: 0, invincible: 0,
            multiBall: 0, powerShot: 0, timeWarp: 0, magnetPaddle: 0,
            ghostBall: 0, laserPaddle: 0, shrinkOpponent: 0, chaosMode: 0, shield: 0
        };
        this.invincibleTime = 0;
        this.setTimeWarpFactor(1);
        this.shieldActive = { player: false, ai: false };
        this.ghostBallActive = false;
        this.powerShotActive = false;
        this.magnetPaddleActive = false;

        // Reset intro and flags
        this.introActive = false;
        this.lastIntroTime = 0;

        // Deactivate lasers BEFORE resetting paddles
        if (this.player) this.player.deactivateLaser();
        if (this.aiPaddle) this.aiPaddle.deactivateLaser();

        // CRITICAL FIX: Initialize game mode BEFORE resetting ball
        // This ensures ball.baseSpeed is set correctly before ball.reset() uses it
        this.initializeGameMode();

        // Reset game-specific objects with proper initialization
        this.ball.reset(this.center);
        this.powerUps = [];
        // Reset timers for power-ups (redundant but keeps pattern clear)
        this.powerUpTimers = {
            slowBall: 0,
            fastPaddle: 0,
            freezeAI: 0,
            doublePoints: 0,
            bigPaddle: 0,
            smallBall: 0,
            invincible: 0,
            multiBall: 0,
            powerShot: 0,
            timeWarp: 0,
            magnetPaddle: 0,
            ghostBall: 0,
            laserPaddle: 0,
            shrinkOpponent: 0,
            chaosMode: 0,
            shield: 0
        };
        this.invincibleTime = 0;
        this.additionalBalls = [];
        this.lasers = [];
        this.setTimeWarpFactor(1);
        this.shieldActive = this.isMultiplayer ? { player: false, ai: false } : false;
        this.ghostBallActive = false;
        this.powerShotActive = false;
        this.magnetPaddleActive = false;

        // Reset timing variables
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;
        if (this.introRafId !== null) {
            cancelAnimationFrame(this.introRafId);
            this.introRafId = null;
        }

        // Reset paddles to center position with zero velocity
        if (this.player) {
            this.player.pos.y = this.height / 2 - this.player.h / 2;
            this.player.vel.y = 0;
            this.player.resetSize();
        }
        if (this.aiPaddle) {
            this.aiPaddle.pos.y = this.height / 2 - this.aiPaddle.h / 2;
            this.aiPaddle.vel.y = 0;
            this.aiPaddle.resetSize();
        }

        // CRITICAL FIX: Recreate AI to ensure clean state for second match
        // This prevents stale state like targetPowerUp, performance metrics, taunt cooldowns, etc.
        if (this.gameMode === 'zombie') {
            if (this.player && this.aiPaddle && this.ball) {
                this.ai = new ZombieBoss(this.aiPaddle, this.ball, this);
            } else {
                this.ai = new AIController(
                    this.aiPaddle,
                    this.ball,
                    this.width,
                    this.height,
                    2
                );
            }
        } else if (this.gameMode === 'customise') {
            this.ai = null;
        } else {
            const aiDifficulty = 2; // Medium difficulty for consistency
            this.ai = new AIController(
                this.aiPaddle,
                this.ball,
                this.width,
                this.height,
                aiDifficulty
            );
        }

        // Show skip button
        const skipBtn = document.getElementById('skipIntro');
        if (skipBtn) skipBtn.classList.remove('hidden');

        // Hide HUD during intro
        if (this.hud) {
            this.hud.style.opacity = '0';
            this.hud.style.pointerEvents = 'none';
        }

        // CRITICAL FIX: Reset timing variables before intro starts
        this.lastTime = performance.now() / 1000;
        this.accumulator = 0;
        this.running = false; // Set to false during intro
        this.introActive = true;
        this.lastIntroTime = 0;

        // Create a fresh Intro instance to ensure clean state
        this.intro = new Intro(this);
        this.intro.start();

        // Start the intro loop
        this.introLoop();
    }


    spawnPowerUp() {
        if (!this.running || this.paused) return;
        // Disable powerups in zombie mode
        if (this.gameMode === 'zombie') return;
        const spawnScale = Math.max(0.25, Math.min(1, this.timeWarpFactor || 1));
        const isObstacleMode = this.gameMode === 'obstacle';
        const spawnChance = (isObstacleMode ? 0.0065 : 0.02) * spawnScale;
        const maxActivePowerUps = isObstacleMode ? 1 : 3;
        if (Math.random() < spawnChance && this.powerUps.length < maxActivePowerUps) {
            const baseTypes = [
                'slowBall', 'fastPaddle', 'freezeAI', 'doublePoints',
                'bigPaddle', 'smallBall', 'invincible',
                'multiBall', 'powerShot', 'timeWarp', 'magnetPaddle',
                'ghostBall', 'laserPaddle', 'shrinkOpponent', 'chaosMode', 'shield'
            ];
            let types = baseTypes;
            if (isObstacleMode) {
                types = ['slowBall', 'bigPaddle', 'powerShot', 'timeWarp', 'shield'];
            }
            if (this.gameMode === 'customise') {
                const enabled = this.getEnabledCustomPowerUps();
                types = baseTypes.filter(type => enabled.includes(type));
                if (!types.length) return;
            }
            const type = types[Math.floor(Math.random() * types.length)];
            const x = this.width / 2 + (Math.random() - 0.5) * this.width * 0.6;
            const y = this.height / 2 + (Math.random() - 0.5) * this.height * 0.6;
            this.powerUps.push(new PowerUp(x, y, type));
        }
    }

    getMusicPlaybackRate() {
        return Math.max(0.25, Math.min(2, this.timeWarpFactor || 1));
    }

    syncMusicPlaybackRate() {
        const playbackRate = this.getMusicPlaybackRate();

        if (this.audio && typeof this.audio.applyMusicPlaybackRate === 'function') {
            this.audio.applyMusicPlaybackRate(playbackRate);
            return playbackRate;
        }

        const audioElements = [this.intro?.bgMusic, document.getElementById('bgMusic')];
        audioElements.forEach(audio => {
            if (audio instanceof HTMLMediaElement) {
                audio.playbackRate = playbackRate;
                // When slowed down, allow the pitch to drop instead of sounding "choppy"
                const preserve = playbackRate >= 0.9;
                if ('preservesPitch' in audio) audio.preservesPitch = preserve;
                else if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = preserve;
                else if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = preserve;
            }
        });

        return playbackRate;
    }

    setTimeWarpFactor(factor) {
        this.timeWarpFactor = Number.isFinite(factor) ? Math.max(0.25, Math.min(2, factor)) : 1;
        this.syncMusicPlaybackRate();
        return this.timeWarpFactor;
    }

    activatePowerUp(type) {
        if (this.gameMode === 'customise' && type === 'freezeAI') return;
        if (this.powerUpTimers[type] > 0) return;
        // Default duration is 5s, override for certain powerups below
        this.powerUpTimers[type] = 5;
        this.audio.powerUp();
        this.progression.recordPowerUpUsed();
        this.updatePowerUpButtons();
        if (this.ai && typeof this.ai.onPowerUpGrab === 'function') {
            this.ai.onPowerUpGrab(type);
        }
        switch (type) {
            case 'slowBall':
                this.ball.vel.mul(0.7);
                this.showNotification('Slow Ball!', 'Ball is slower', '#90caf9');
                break;
            case 'fastPaddle':
                this.player.maxSpeed *= 1.5;
                if (this.isMultiplayer) this.aiPaddle.maxSpeed *= 1.5;
                this.showNotification('Fast Paddle!', 'Both move faster', '#ffeb3b');
                break;
            case 'freezeAI':
                this.aiPaddle.vel.y = 0;
                this.showNotification('Freeze!', this.isMultiplayer ? 'P2 is frozen' : 'AI is frozen', '#81c784');
                break;
            case 'bigPaddle':
                this.player.grow(1.8);
                if (this.isMultiplayer) this.aiPaddle.grow(1.8);
                this.showNotification('Big Paddle!', 'Easier to hit', '#e91e63');
                break;
            case 'smallBall':
                this.ball.r *= 0.6;
                this.showNotification('Small Ball!', 'Harder to see', '#9966cc');
                break;
            case 'invincible':
                this.invincibleTime = 5;
                this.showNotification('Invincible!', this.isMultiplayer ? "Opponent can't score" : "AI can't score", '#fff176');
                break;
            case 'multiBall':
                this.spawnAdditionalBalls(2);
                break;
            case 'powerShot':
                this.powerShotActive = true;
                this.showNotification('Power Shot!', 'Next hit = OP', '#ff5252');
                break;
            case 'timeWarp':
                this.setTimeWarpFactor(0.5);
                this.showNotification('Time Warp!', 'Slow motion', '#9c27b0');
                this.progression.incrementAchievementProgress('timeWarpWizard');
                break;
            case 'magnetPaddle':
                this.magnetPaddleActive = true;
                this.showNotification('Magnet!', 'Ball comes to you', '#795548');
                break;
            case 'ghostBall':
                this.ghostBallActive = true;
                this.showNotification('Ghost Ball!', 'No obstacles', '#e0e0e0');
                break;
            case 'laserPaddle':
                this.player.activateLaser(3);
                this.aiPaddle.activateLaser(3);
                this.showNotification('Laser Paddle!', this.isMultiplayer ? 'SPACE/ENTER = 3 laser shots' : 'SPACE = 3 laser shots', '#f44336');
                break;
            case 'shrinkOpponent':
                this.aiPaddle.shrink(0.6);
                if (this.isMultiplayer) this.player.shrink(0.6);
                // Make shrink last longer for fairness
                this.powerUpTimers.shrinkOpponent = 10;
                this.showNotification('Tiny!', 'Both paddles shrunk', '#607d8b');
                break;
            case 'chaosMode':
                this.activateChaosMode();
                // make chaos effects persist a bit longer
                this.powerUpTimers.chaosMode = 10;
                break;
            case 'shield':
                if (this.isMultiplayer) {
                    if (!this.shieldActive || typeof this.shieldActive !== 'object') {
                        this.shieldActive = { player: false, ai: false };
                    }
                    this.shieldActive.player = true;
                    this.shieldActive.ai = true;
                } else {
                    this.shieldActive = true;
                }
                this.showNotification('Shield!', 'One free life', '#00bcd4');
                break;
        }
    }

    spawnAdditionalBalls(count) {
        const maxBalls = 4;
        const currentBalls = 1 + this.additionalBalls.length;
        const ballsToSpawn = Math.min(count, maxBalls - currentBalls);
        if (ballsToSpawn <= 0) {
            this.showNotification('Max Balls!', 'Already at maximum', '#ff9900');
            return;
        }
        for (let i = 0; i < ballsToSpawn; i++) {
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            const newBall = new Ball(
                this.ball.pos.x + offsetX,
                this.ball.pos.y + offsetY,
                this.ball.r
            );
            // Give each extra ball a limited lifespan (seconds)
            newBall.life = 10; // auto-remove after 10 seconds
            const angle = (Math.random() - 0.5) * Math.PI;
            const originalSpeed = this.ball.getSpeed();
            const newSpeed = originalSpeed * 0.8;
            newBall.vel.x = Math.cos(angle) * newSpeed * (Math.random() > 0.5 ? 1 : -1);
            newBall.vel.y = Math.sin(angle) * newSpeed;
            newBall.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
            this.additionalBalls.push(newBall);
        }
        // update progress for multi-ball mastery
        this.progression.incrementAchievementProgress('multiBallMaster', ballsToSpawn);
        this.showNotification('Multi-Ball!', `${ballsToSpawn} extra balls`, '#ffffff');
    }

    activateChaosMode() {
        this.showNotification('Chaos Mode!', 'Random effects with warnings', '#ff00ff');
        const chaosInterval = setInterval(() => {
            if (this.powerUpTimers.chaosMode <= 0) {
                clearInterval(chaosInterval);
                return;
            }
            this.showNotification('Warning!', 'Chaos incoming!', '#ff9900');
            setTimeout(() => {
                const effect = Math.floor(Math.random() * 5);
                switch (effect) {
                    case 0:
                        this.ball.vel.x *= -0.8;
                        this.showNotification('Chaos!', 'Reversed!', '#ff00ff');
                        break;
                    case 1:
                        const swapAmount = Math.min(20, Math.max(5, this.player.h * 0.2));
                        this.player.h = Math.max(20, this.player.h - swapAmount);
                        this.aiPaddle.h = Math.max(20, this.aiPaddle.h + swapAmount);
                        this.showNotification('Chaos!', 'Paddles adjusted', '#ff00ff');
                        break;
                    case 2:
                        const margin = 50;
                        this.ball.pos.set(
                            margin + Math.random() * (this.width - margin * 2),
                            margin + Math.random() * (this.height - margin * 2)
                        );
                        this.showNotification('Chaos!', 'Teleported', '#ff00ff');
                        break;
                    case 3:
                        this.ball.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
                        break;
                    case 4:
                        this.ball.vel.mul(1.2);
                        this.showNotification('Chaos!', 'Speed boost!', '#ff00ff');
                        break;
                }
            }, 750);
        }, 2000 + Math.random() * 1000);
    }

    updatePowerUpTimers(dt) {
        for (const type in this.powerUpTimers) {
            if (this.powerUpTimers[type] > 0) {
                this.powerUpTimers[type] -= dt;
                if (this.powerUpTimers[type] <= 0) {
                    // Deactivate all active powerups
                    if (type === 'fastPaddle') {
                        const config = this.modeSpeeds[this.gameMode] || this.modeSpeeds.classic;
                        this.player.maxSpeed = config.paddleMax;
                    }
                    if (type === 'bigPaddle') {
                        this.player.resetSize();
                    }
                    if (type === 'smallBall') {
                        this.ball.r = Math.max(8, this.height * 0.012);
                    }
                    if (type === 'shrinkOpponent') {
                        this.aiPaddle.resetSize();
                    }
                    if (type === 'slowBall') {
                        // Velocity is already reduced; no need to restore (it was a one-time effect)
                    }
                    if (type === 'freezeAI') {
                        // Re-enable AI control
                        this.aiPaddle.vel.y = 0;
                    }
                    if (type === 'timeWarp') {
                        this.setTimeWarpFactor(1);
                    }
                    if (type === 'magnetPaddle') {
                        this.magnetPaddleActive = false;
                    }
                    if (type === 'ghostBall') {
                        this.ghostBallActive = false;
                    }
                    if (type === 'powerShot') {
                        this.powerShotActive = false;
                    }
                    if (type === 'laserPaddle') {
                        this.player.deactivateLaser();
                        this.aiPaddle.deactivateLaser();
                    }
                    if (type === 'multiBall') {
                        // Additional balls persist and are only removed on ball loss
                    }
                    if (type === 'chaosMode') {
                        // Chaos mode effects stop being triggered — restore paddles
                        if (this.player && typeof this.player.resetSize === 'function') {
                            this.player.resetSize();
                        }
                        if (this.aiPaddle && typeof this.aiPaddle.resetSize === 'function') {
                            this.aiPaddle.resetSize();
                        }
                    }
                    if (type === 'shield') {
                        // Shield is consumed when used; no deactivation needed
                    }
                    if (type === 'invincible') {
                        // Invincible time is tracked separately
                    }
                }
            }
        }
        if (this.invincibleTime > 0) this.invincibleTime -= dt;
        this.updatePowerUpButtons();
    }

    updatePowerUpButtons() {
        const powerUpNames = {
            slowBall: 'Slow Ball', fastPaddle: 'Fast Paddle', freezeAI: 'Freeze AI',
            doublePoints: 'Double Points', bigPaddle: 'Big Paddle', smallBall: 'Small Ball', invincible: 'Invincible',
            multiBall: 'Multi-Ball', powerShot: 'Power Shot', timeWarp: 'Time Warp', magnetPaddle: 'Magnet Paddle',
            ghostBall: 'Ghost Ball', laserPaddle: 'Laser Paddle', shrinkOpponent: 'Shrink Opponent', chaosMode: 'Chaos Mode', shield: 'Shield'
        };
        for (const type in this.powerUpTimers) {
            const btn = document.getElementById(type);
            if (!btn) continue;
            const cooldown = btn.querySelector('.cooldown');
            const label = btn.querySelector('.label');
            if (!cooldown || !label) continue;
            if (this.powerUpTimers[type] > 0) {
                btn.disabled = true;
                const progress = this.powerUpTimers[type] / 5;
                cooldown.style.clipPath = `polygon(0 0, 100% 0, 100% ${100 - progress * 100}%, 0 ${100 - progress * 100}%)`;
                label.textContent = `${powerUpNames[type]} (${Math.ceil(this.powerUpTimers[type])}s)`;
            } else {
                btn.disabled = false;
                cooldown.style.clipPath = 'polygon(0 0, 100% 0, 100% 0%, 0 0%)';
                label.textContent = powerUpNames[type];
            }
        }
    }

    showNotification(title, message, color) {
        this.notifications.push({ title, message, color, time: 2000, opacity: 1 });
    }

    updateNotifications(dt) {
        let writeIndex = 0;
        for (let i = 0; i < this.notifications.length; i++) {
            const n = this.notifications[i];
            n.time -= dt * 1000;
            if (n.time <= 1000) n.opacity = n.time / 1000;
            if (n.time > 0) {
                this.notifications[writeIndex++] = n;
            }
        }
        this.notifications.length = writeIndex;
    }

    renderNotifications() {
        const maxNotifications = 2;
        const startIndex = Math.max(0, this.notifications.length - maxNotifications);
        for (let i = startIndex; i < this.notifications.length; i++) {
            const n = this.notifications[i];
            const displayIndex = i - startIndex;
            // Bottom-left: the top corners hold the scores and achievement toasts.
            const x = 20;
            const y = this.height - 76 - displayIndex * 60;
            this.ctx.save();
            this.ctx.globalAlpha = n.opacity * 0.8;
            this.ctx.fillStyle = 'rgba(20, 20, 20, 0.5)';
            this.roundRect(x, y, 200, 50, 8);
            this.ctx.fill();
            this.ctx.strokeStyle = n.color;
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(n.title, x + 10, y + 20);
            this.ctx.font = '12px Arial';
            this.ctx.fillStyle = '#cccccc';
            this.ctx.fillText(n.message, x + 10, y + 38);
            this.ctx.restore();
        }
    }

    getTauntLayout(ctx, text, maxWidth) {
        const font = ctx.font;
        const cache = this._tauntLayoutCache;
        if (cache.text === text && cache.font === font && cache.maxWidth === maxWidth) {
            return cache.lines;
        }

        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(candidate).width < maxWidth) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }

        cache.text = text;
        cache.font = font;
        cache.maxWidth = maxWidth;
        cache.lines = lines;
        return lines;
    }

    recordPerfSample(frameMs, physicsMs, renderMs) {
        const perf = this._perfStats;
        perf.frameCount++;
        perf.frameTimeMs += frameMs;
        perf.physicsTimeMs += physicsMs;
        perf.renderTimeMs += renderMs;

        const nowMs = performance.now();
        const elapsed = nowMs - perf.lastFlush;
        if (elapsed < 500) {
            return;
        }

        const count = Math.max(1, perf.frameCount);
        perf.snapshot = {
            fps: count * 1000 / elapsed,
            frameMs: perf.frameTimeMs / count,
            physicsMs: perf.physicsTimeMs / count,
            renderMs: perf.renderTimeMs / count,
            particles: this.particles?.activeCount || 0,
            additionalBalls: this.additionalBalls.length,
            powerUps: this.powerUps.length,
        };

        if (typeof window !== 'undefined') {
            window.PingPongPerf = perf.snapshot;
        }

        perf.frameCount = 0;
        perf.frameTimeMs = 0;
        perf.physicsTimeMs = 0;
        perf.renderTimeMs = 0;
        perf.lastFlush = nowMs;
    }

    roundRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
    }

    ensurePostFx() {
        if (this._postFxTried) return this.postFx;
        this._postFxTried = true;
        // Null if WebGL is missing: the 2D canvas is then shown directly.
        this.postFx = window.PostFX ? PostFX.create(this.canvas) : null;
        PerfGovernor.fxActive = !!this.postFx;
        if (this.postFx) {
            this.postFx.setQuality(PerfGovernor.current.fx);
            this.postFx.setGrade(Game.MODE_GRADES[this.gameMode] || Game.MODE_GRADES.classic);
        }
        return this.postFx;
    }

    // ── Gamepads ────────────────────────────────────────────────────────────
    // Pad 1 drives the left paddle, pad 2 the right paddle in local 1v1.
    // Left stick / d-pad move (analog), A = laser (or skip intro), Start = pause.
    pollGamepads() {
        if (!navigator.getGamepads) return;
        const list = navigator.getGamepads();
        const pads = [];
        for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) pads.push(list[i]);
        const prev = this._padPrev || (this._padPrev = []);
        this.padState = pads.slice(0, 2).map((pad, i) => {
            const raw = pad.axes[1] || 0;
            const dead = 0.18;
            // Rescale past the deadzone and add a gentle curve for fine aiming.
            let axis = Math.abs(raw) < dead ? 0 : Math.sign(raw) * ((Math.abs(raw) - dead) / (1 - dead)) ** 1.35;
            if (pad.buttons[12]?.pressed) axis = -1;
            if (pad.buttons[13]?.pressed) axis = 1;
            const a = !!pad.buttons[0]?.pressed;
            const start = !!pad.buttons[9]?.pressed;
            const was = prev[i] || {};
            prev[i] = { a, start };
            return { pad, axis, aPressed: a && !was.a, startPressed: start && !was.start };
        });

        const p1 = this.padState[0];
        if (p1?.startPressed) {
            if (this.introActive && this.intro?.active) this.skipIntro();
            else if (this.running || this.paused) this.togglePause();
        }
        for (let i = 0; i < this.padState.length; i++) {
            const st = this.padState[i];
            if (!st.aPressed) continue;
            if (this.introActive && this.intro?.active) { this.skipIntro(); continue; }
            this.keys[i === 0 ? ' ' : 'enter'] = true;   // laser, consumed in updatePaddles
        }
    }

    // side: 'left' | 'right' (which player's pad), strength 0..1
    rumble(side, strength, ms = 90) {
        const st = this.padState?.[side === 'right' ? 1 : 0];
        if (side === 'right' && !this.isMultiplayer) return;
        const act = st?.pad?.vibrationActuator;
        if (!act?.playEffect) return;
        const k = Math.max(0, Math.min(1, strength));
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: Math.min(1, k * 0.6 + 0.2) }).catch(() => {});
    }

    // F2: frame rate, detected refresh rate, quality tier and physics backend.
    togglePerfOverlay() {
        if (this.perfOverlay) {
            this.perfOverlay.remove();
            this.perfOverlay = null;
            return;
        }
        const el = document.createElement('div');
        el.className = 'perf-overlay';
        document.body.appendChild(el);
        this.perfOverlay = el;
        this._perfFrames = 0;
        this._perfStart = performance.now();
    }

    updatePerfOverlay() {
        if (!this.perfOverlay) return;
        this._perfFrames++;
        const now = performance.now();
        const elapsed = now - this._perfStart;
        if (elapsed < 500) return;
        const fps = Math.round(this._perfFrames * 1000 / elapsed);
        this._perfFrames = 0;
        this._perfStart = now;
        const gov = PerfGovernor;
        this.perfOverlay.textContent =
            `${fps} FPS  ·  display ${gov.fps} Hz  ·  quality ${gov.tierName}  ·  ` +
            `scale ${gov.renderScale.toFixed(2)}x  ·  shaders ${this.postFx?.active ? 'on' : 'off'}  ·  ` +
            `physics ${PhysicsCore.backend === 'wasm' ? 'C++/wasm' : 'JS'}`;
    }

    // Per-hit speed multiplier. Rallies speed up gradually rather than doubling,
    // so long exchanges build tension without instantly maxing the ball out.
    getPaddleSpeedIncrease(isPlayer) {
        let inc = 1.045;
        if (this.gameMode === 'speed') inc = 1.11;
        else if (this.gameMode === 'obstacle') inc = 1.04;
        if (this.isZombieWaveMode() && isPlayer && this.zombieState.powerups.rage > 0) inc *= 1.18;
        inc += Math.min(0.035, this.rallyCount * 0.0025);
        if (this.powerShotActive && isPlayer) inc *= 1.9;
        return inc;
    }

    checkPaddleCollision(paddle, isPlayer, ball = this.ball) {
        if (paddle.laserStunned) return false;

        const b = ball;
        const p = paddle;
        const maxAngle = Math.PI / 3.4;
        const preHitSpeed = b.getSpeed();
        const hit = PhysicsCore.collidePaddle(b, p, isPlayer, this.getPaddleSpeedIncrease(isPlayer), maxAngle, this.dt);
        if (!hit) return false;

        const speed = preHitSpeed;
        // Trigger Speed Challenge in Speed Mode every N hits.
        // For single-player only trigger when the HUMAN player is the one being scored against
        // (i.e. the AI just hit the ball toward the player). Multiplayer retains original behaviour.
        if (this.gameMode === 'speed' && this.rallyCount > 0 && this.rallyCount % 6 === 0) {
            if (this.speedChallenge) {
                if (this.isMultiplayer) {
                    this.speedChallenge.startChallenge();
                } else {
                    // In single-player, only start if the last hit was by the AI
                    // (so the human is the one being scored against)
                    if (!isPlayer) {
                        this.speedChallenge.startChallenge();
                    }
                }
            }
        }

        if (this.powerShotActive && isPlayer) {
            this.powerShotActive = false;
            this.particles.spawnGodTierHit(b.pos.x, b.pos.y, '#ff5252', speed * 2);
            if (this.ai && typeof this.ai.onPowerShot === 'function') {
                this.ai.onPowerShot();
            }
        }

        // NEW: Trigger fire burst on zombie boss paddle collision
        if (!isPlayer && this.gameMode === 'zombie' && this.ai && typeof this.ai.onBallHit === 'function') {
            this.ai.onBallHit(speed);
        }

        b.lastHit = isPlayer ? 'player' : 'ai';

        const hitX = isPlayer ? p.pos.x + p.w : p.pos.x;
        this.particles.spawnGodTierHit(hitX, b.pos.y, p.color, speed);
        this.audio.hit(b.lastImpact || 0.4, this.panFor(b.pos.x), isPlayer ? 'left' : 'right');
        this.rallyCount++;
        this._setText(this.rallyDisplay, this.rallyCount);
        this.progression.incrementAchievementProgress('rallyLegend');
        this.checkRallyMilestones();

        // NEW: Drug mode hit flash trigger
        if (this.gameMode === 'speed') {
            this.lastHitFlash = 1.0;
            this.hitFlashDirection = isPlayer ? 1 : -1;
        }

        this.onPaddleImpact(b, p, isPlayer, hit === 2);
        return true;
    }

    // A point was won: let it land before play resumes.
    onGoalScored(goalOnRight, y) {
        const x = goalOnRight ? this.width : 0;
        this.rumble(goalOnRight ? 'right' : 'left', 0.9, 260);
        this.rallyPop = 0;
        this.postFx?.ripple(x, y, 1.15);
        this.postFx?.punch(1.0);
        this.screenShake = Math.max(this.screenShake || 0, 15);
        if (this.cameraKick) this.cameraKick.vx += goalOnRight ? 420 : -420;
        this.screenFlash = Math.max(this.screenFlash || 0, 0.35);
        this.particles.spawnGodTierHit(goalOnRight ? this.width - 6 : 6, y, goalOnRight ? '#ff3a5c' : '#00ffd6', 1400);
    }

    // Hold the ball at the serve spot briefly (with a telegraph) so each point
    // has a beat between them and the receiver can get set.
    holdServe(seconds) {
        const b = this.ball;
        this.pendingServe = { vx: b.vel.x, vy: b.vel.y };
        this.serveHold = seconds;
        this.serveHoldTotal = seconds;
        b.vel.set(0, 0);
        b.trailCount = 0;
    }

    updateServeHold(dt) {
        const b = this.ball;
        // Something else served (e.g. the Speed challenge, a reset): stand down.
        if (Math.abs(b.vel.x) + Math.abs(b.vel.y) > 1 || !this.pendingServe) {
            this.serveHold = 0;
            this.pendingServe = null;
            return false;
        }
        this.serveHold -= dt;
        b.prev.set(b.pos.x, b.pos.y);
        if (this.serveHold > 0) return true;
        b.vel.set(this.pendingServe.vx, this.pendingServe.vy);
        this.pendingServe = null;
        this.serveHold = 0;
        this.audio.bounce?.(0.5, this.panFor(b.pos.x));
        this.postFx?.ripple(b.pos.x, b.pos.y, 0.4);
        return false;
    }

    renderServeTelegraph(ctx) {
        if (!(this.serveHold > 0) || !this.pendingServe) return;
        const b = this.ball;
        const t = 1 - this.serveHold / (this.serveHoldTotal || 1);
        const dir = this.pendingServe.vx >= 0 ? 1 : -1;
        const ang = Math.atan2(this.pendingServe.vy, Math.abs(this.pendingServe.vx));
        ctx.save();
        ctx.translate(b.pos.x, b.pos.y);
        // Closing ring = countdown.
        ctx.globalAlpha = 0.35 + 0.5 * t;
        ctx.strokeStyle = '#bff8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, b.r + 6 + (1 - t) * 46, 0, Math.PI * 2);
        ctx.stroke();
        // Chevrons show where the serve is going.
        ctx.scale(dir, 1);
        ctx.rotate(ang * 0.6);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const phase = (t * 2 + i / 3) % 1;
            ctx.globalAlpha = (1 - phase) * 0.8;
            const cx = b.r + 18 + phase * 40;
            ctx.beginPath();
            ctx.moveTo(cx, -8);
            ctx.lineTo(cx + 8, 0);
            ctx.lineTo(cx, 8);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Stereo position for a sound at canvas x (-1 left … 1 right), kept subtle.
    panFor(x) {
        return Math.max(-1, Math.min(1, (x / Math.max(1, this.width) - 0.5) * 1.3));
    }

    // Juice for a paddle hit, scaled by how hard the ball was travelling.
    onPaddleImpact(ball, paddle, isPlayer, edgeHit) {
        const impact = ball.lastImpact || 0;
        paddle.kick?.(isPlayer ? -1 : 1, 0.35 + impact * 0.9);
        ball.squashImpact?.(0, 0.3 + impact * 0.45);
        if (this.cameraKick) this.cameraKick.vx += (isPlayer ? 1 : -1) * (40 + impact * 260);
        this.hitStop = Math.max(this.hitStop || 0, 0.012 + impact * 0.045 + (edgeHit ? 0.02 : 0));
        this.screenShake = Math.max(this.screenShake || 0, 2 + impact * 9);
        this.postFx?.ripple(ball.pos.x, ball.pos.y, 0.35 + impact * 0.65);
        this.postFx?.punch(0.25 + impact * 0.75);

        const side = isPlayer ? 'left' : 'right';
        const human = isPlayer || this.isMultiplayer;
        if (human) this.rumble(side, 0.25 + impact * 0.6, 60 + impact * 80);

        // Rally counter pop + milestone callouts every 5 hits.
        this.rallyPop = 1;
        const r = this.rallyCount;
        if (r >= 5 && r % 5 === 0) {
            this.popText(`${r} RALLY`, this.width / 2, this.height * 0.3, Game.rallyColor(r), 46);
            this.postFx?.punch(0.6);
        }
        // Clutch: a human returns the ball off the very end of the paddle.
        if (edgeHit && human) {
            const x = isPlayer ? paddle.pos.x + paddle.w + 70 : paddle.pos.x - 70;
            this.popText('CLUTCH!', x, ball.pos.y, '#ffe066', 30);
            this.hitStop = Math.max(this.hitStop, 0.09);
        }
    }

    // 0..1 per paddle: how imminent the ball's arrival is (drives the paddle
    // accent animations). Smoothed so it eases in and out.
    updatePaddleAnticipation(dt) {
        const b = this.ball;
        if (!b) return;
        const reach = this.width * 0.55;
        for (const [p, dir] of [[this.player, -1], [this.aiPaddle, 1]]) {
            if (!p) continue;
            let target = 0;
            if (Math.sign(b.vel.x) === dir) {
                const faceX = dir < 0 ? p.pos.x + p.w : p.pos.x;
                target = Math.max(0, 1 - Math.abs(b.pos.x - faceX) / reach);
                target *= target;
            }
            const a = p.anticipation || 0;
            p.anticipation = a + (target - a) * Math.min(1, dt * 12);
        }
    }

    static rallyColor(r) {
        if (r >= 20) return '#ff4fd8';
        if (r >= 15) return '#ff8a3d';
        if (r >= 10) return '#ffe066';
        if (r >= 5) return '#5dffa8';
        return '#7fe9ff';
    }

    // Short animated callout drawn in the playfield (rises, scales in, fades).
    popText(text, x, y, color = '#ffffff', size = 32) {
        const list = this.popTexts || (this.popTexts = []);
        if (list.length > 6) list.shift();
        list.push({ text, x, y, color, size, t: 0, life: 1.1 });
    }

    renderPopTexts(ctx, dt) {
        const list = this.popTexts;
        if (!list || !list.length) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.t += dt;
            const k = p.t / p.life;
            if (k >= 1) { list.splice(i, 1); continue; }
            const appear = Math.min(1, p.t / 0.12);
            const scale = 0.6 + 0.55 * (1 - Math.pow(1 - appear, 3)) - 0.1 * k;
            ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
            ctx.font = `900 ${Math.round(p.size * scale)}px Orbitron, Audiowide, sans-serif`;
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            const y = p.y - k * 36;
            ctx.strokeText(p.text, p.x, y);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, p.x, y);
        }
        ctx.restore();
    }

    // Live rally count under the menu button; grows and warms up as it builds.
    renderRallyCounter(ctx, dt) {
        const r = this.rallyCount || 0;
        this.rallyPop = Math.max(0, (this.rallyPop || 0) - dt * 4);
        if (r < 3 || this.isZombieWaveMode()) return;
        const pop = this.rallyPop;
        const size = Math.min(44, 22 + r * 0.8) * (1 + pop * 0.35);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.75 + pop * 0.25;
        ctx.font = `900 ${Math.round(size)}px Orbitron, Audiowide, sans-serif`;
        ctx.fillStyle = Game.rallyColor(r);
        ctx.fillText(String(r), this.width / 2, 96);
        ctx.globalAlpha = 0.55;
        ctx.font = '700 11px Orbitron, Audiowide, sans-serif';
        ctx.fillStyle = '#d9f6ff';
        ctx.fillText('RALLY', this.width / 2, 96 + size * 0.62 + 6);
        ctx.restore();
    }

    checkRallyMilestones() {
        const milestones = [5, 10, 15, 20, 25, 30];
        for (const milestone of milestones) {
            if (this.rallyCount >= milestone && this.lastRallyMilestone < milestone) {
                this.lastRallyMilestone = milestone;
                if (this.ai && typeof this.ai.onRallyMilestone === 'function') {
                    this.ai.onRallyMilestone(milestone);
                }
                break;
            }
        }
    }

    reflectVelocity(velocity, normal, energyLossFactor) {
        const dot = velocity.dot(normal);
        return new Vec2(
            (velocity.x - 2 * dot * normal.x) * energyLossFactor,
            (velocity.y - 2 * dot * normal.y) * energyLossFactor
        );
    }

    resetRally() {
        this.rallyCount = 0;
        this.lastRallyMilestone = 0;
        this._setText(this.rallyDisplay, this.rallyCount);
    }

    // Extra balls (multi-ball / chaos). dt already includes time warp.
    updateAdditionalBalls(dt) {
        const effectiveDt = dt;
        const balls = this.additionalBalls;
        let writeIndex = 0;
        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i];
            // decrement lifespan and remove expired extra balls
            if (typeof ball.life === 'number') {
                ball.life -= effectiveDt;
                if (ball.life <= 0) {
                    continue;
                }
            }
            if (this.magnetPaddleActive) {
                const distToPlayer = Math.hypot(
                    ball.pos.x - this.player.pos.x,
                    ball.pos.y - (this.player.pos.y + this.player.h / 2)
                );
                const attractionRadius = 300;
                if (distToPlayer < attractionRadius) {
                    const pullForce = 200 * (1 - distToPlayer / attractionRadius);
                    const angle = Math.atan2(
                        this.player.pos.y + this.player.h / 2 - ball.pos.y,
                        this.player.pos.x - ball.pos.x
                    );
                    ball.vel.x += Math.cos(angle) * pullForce * effectiveDt;
                    ball.vel.y += Math.sin(angle) * pullForce * effectiveDt;
                }
            }
            if (ball.integrate(effectiveDt, this.height) & (PhysicsCore.EVT.WALL_TOP | PhysicsCore.EVT.WALL_BOTTOM)) {
                this.audio.bounce();
            }
            if (!this.ghostBallActive) {
                for (let obstacleIndex = 0; obstacleIndex < this.obstacles.length; obstacleIndex++) {
                    const o = this.obstacles[obstacleIndex];
                    if (o.checkCollision(ball)) {
                        this.audio.hit();
                        if (this.gameMode !== 'obstacle') {
                            this.particles.spawnGodTierHit(ball.pos.x, ball.pos.y, '#e040fb', ball.getSpeed());
                            this.screenShake = Math.max(this.screenShake, 8);
                        } else {
                            this.screenShake = Math.max(this.screenShake, 2);
                        }
                    }
                }
            }
            this.checkPaddleCollision(this.player, true, ball);
            this.checkPaddleCollision(this.aiPaddle, false, ball);
            if (ball.pos.x < -50) {
                if (this.invincibleTime > 0 || (this.isMultiplayer ? this.shieldActive.player : this.shieldActive)) {
                    ball.pos.x = ball.r + 10;
                    ball.vel.x = Math.abs(ball.vel.x) * 1.1;
                    this.audio.bounce();
                    this.particles.spawnGodTierHit(ball.pos.x, ball.pos.y, '#fff176', 600);
                    if (this.isMultiplayer) {
                        if (this.shieldActive.player) {
                            this.shieldActive.player = false;
                            this.showNotification('Shield Blocked!', 'P1 saved!', '#00bcd4');
                        }
                    } else {
                        if (this.shieldActive) {
                            this.shieldActive = false;
                            this.showNotification('Shield Blocked!', 'Shield activated!', '#00bcd4');
                        }
                    }
                    balls[writeIndex++] = ball;
                    continue;
                } else {
                    if (this.gameMode === 'speed') {
                        ball.pos.x = -30;
                        ball.vel.x = 0;
                        ball.vel.y = 0;
                        this.speedChallenge.startChallenge();
                        continue;
                    }
                    const points = this.powerUpTimers.doublePoints > 0 ? 2 : 1;
                    this.scores.ai += points;
                    this.audio.score();
                    this.updateScoreUI();
                    this.resetRally();
                    if (this.ai && typeof this.ai.onAIScore === 'function') {
                        this.ai.onAIScore();
                    }
                    continue;
                }
            }
            if (ball.pos.x > this.width + 50) {
                const points = this.powerUpTimers.doublePoints > 0 ? 2 : 1;
                this.scores.player += points;
                this.audio.score();
                this.updateScoreUI();
                this.resetRally();
                if (this.ai && typeof this.ai.onPlayerScore === 'function') {
                    this.ai.onPlayerScore();
                }
                continue;
            }
            balls[writeIndex++] = ball;
        }
        balls.length = writeIndex;
    }

    renderAdditionalBalls() {
        for (let i = 0; i < this.additionalBalls.length; i++) {
            const ball = this.additionalBalls[i];
            const tempColor = ball.color;
            ball.color = '#ffffff';
            ball.render(this.ctx, 0);
            ball.color = tempColor;
        }
    }

    physicsStep(dt, updateGravityWells = true) {
        if (this.paused) return;
        // Hit-stop: on a hard paddle hit the world briefly runs at a crawl, which
        // sells the impact without feeling like input lag.
        let hitStopScale = 1;
        if (this.hitStop > 0) {
            this.hitStop -= dt;
            hitStopScale = 0.12;
        }
        const effectiveDt = this.timeWarpFactor * dt * hitStopScale;
        if (this.player) this.player._prevY = this.player.pos.y;
        if (this.aiPaddle) this.aiPaddle._prevY = this.aiPaddle.pos.y;
        this.updateSpeedBackground(effectiveDt);
        this.updateGameState(effectiveDt);
        this.updateGameObjects(effectiveDt, updateGravityWells);
        const holding = this.serveHold > 0 && this.updateServeHold(dt);
        if (!holding) {
            this.updateBallPhysics(this.ball, effectiveDt);
            this.handleCollisions(effectiveDt);
        }
        this.updatePaddles(effectiveDt);
        this.checkScoringConditions();
        this.updateGameUI();
    }

    updateGameState(dt) {
        this.particles.update(dt);
        this.updatePowerUpTimers(dt);
        this.updateNotifications(dt);
        if (this.screenFlash > 0.001) {
            this.screenFlash *= 0.9;
        }
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 25);
        }
        if (this.shockwave) {
            const s = this.shockwave;
            const speedFactor = 1 - (s.radius / s.maxRadius);
            const currentSpeed = (s.initialSpeed || 950) * speedFactor;
            s.radius += currentSpeed * dt;
            s.alpha = 1 - (s.radius / s.maxRadius);
            if (s.alpha <= 0) {
                this.shockwave = null;
            }
        }
        // ghost ball duration tracking
        if (this.ghostBallActive) {
            this.progression.incrementAchievementProgress('ghostBallSurvivor', dt);
        }
    }

    updateGameObjects(dt, updateGravityWells = true) {
        this.spawnPowerUp();
        let powerUpWriteIndex = 0;
        for (let i = 0; i < this.powerUps.length; i++) {
            const pu = this.powerUps[i];
            pu.update(dt);
            if (pu.checkCollision(this.ball)) {
                this.activatePowerUp(pu.type);
                this.particles.spawnGodTierHit(pu.pos.x, pu.pos.y, pu.color, 800);
                if (this.ai && typeof this.ai.onPowerUpGrab === 'function') {
                    this.ai.onPowerUpGrab(pu.type);
                }
                continue;
            }
            if (pu.active) {
                this.powerUps[powerUpWriteIndex++] = pu;
            }
        }
        this.powerUps.length = powerUpWriteIndex;
        if (this.gameMode === 'obstacle') {
            if (!this.obstacleCourse) {
                this.obstacleCourse = new ObstacleCourse(this);
                this.obstacleCourse.rebuild(true);
            }
            this.obstacleCourse.update(dt);

            if (this.bgRenderer && typeof this.bgRenderer.syncObstacleArenaState === 'function') {
                this.bgRenderer.syncObstacleArenaState(this.obstacles, this.ball, this, dt);
            }
        }
        if (this.gameMode === 'gravity' && updateGravityWells) {
            const ball = this.ball;
            const additionalBalls = this.additionalBalls;

            for (let i = 0; i < this.gravityWells.length; i++) {
                const w = this.gravityWells[i];
                w.update(dt, ball);

                if (w.isBallInRange(ball)) {
                    w.applyGravity(ball, dt, true);
                }

                for (let ballIndex = 0; ballIndex < additionalBalls.length; ballIndex++) {
                    const ab = additionalBalls[ballIndex];
                    if (w.isBallInRange(ab)) {
                        w.applyGravity(ab, dt, false);
                    }
                }
            }

            this.updateGravityInteractionState(dt);
        } else if (this.gameMode !== 'gravity') {
            this.gravityInteraction = {
                activeCount: 0,
                focusX: this.width * 0.5,
                focusY: this.height * 0.5,
                proximity: 0,
                ambient: 0,
                phase: this.gravityInteractionPhase,
                nearestDistanceSq: null
            };
        }
        this.updateZombieMode(dt);
        this.updateAdditionalBalls(dt);
        if (this.player && typeof this.player.updateLasers === 'function') {
            this.player.updateLasers(dt, this);
        }
        if (this.aiPaddle && typeof this.aiPaddle.updateLasers === 'function') {
            this.aiPaddle.updateLasers(dt, this);
        }
    }

    updateBallPhysics(ball, dt) {
        if (this.gameMode === 'obstacle' && this.bgRenderer?.applyObstacleGameplayEffects) {
            this.bgRenderer.applyObstacleGameplayEffects(ball, dt);
        }

        // update high speed achievement (guard in case achievements not initialized)
        const speedAch = this.progression.achievements?.speedLegend;
        if (speedAch && !speedAch.unlocked) {
            const sp = Math.floor(ball.getSpeed());
            if (sp > speedAch.progress) {
                const before = speedAch.progress;
                speedAch.progress = Math.min(speedAch.maxProgress, sp);
                if (speedAch.progress >= speedAch.maxProgress) {
                    this.progression.unlockAchievement('speedLegend');
                } else if (Math.floor(speedAch.progress / 50) !== Math.floor(before / 50)) {
                    // Rebuilding the sidebar is DOM-heavy: only refresh in 50-unit steps.
                    this.progression.updateAchievementSidebar();
                }
            }
        }
        if (this.magnetPaddleActive) {
            const distToPlayer = Math.hypot(
                ball.pos.x - this.player.pos.x,
                ball.pos.y - (this.player.pos.y + this.player.h / 2)
            );
            const attractionRadius = 300;
            const wasAttracted = ball._magnetized;
            ball._magnetized = distToPlayer < attractionRadius;
            if (distToPlayer < attractionRadius) {
                const pullForce = 200 * (1 - distToPlayer / attractionRadius);
                const angle = Math.atan2(
                    this.player.pos.y + this.player.h / 2 - ball.pos.y,
                    this.player.pos.x - ball.pos.x
                );
                ball.vel.x += Math.cos(angle) * pullForce * dt;
                ball.vel.y += Math.sin(angle) * pullForce * dt;

                // One attraction per approach, not one per physics step.
                if (!wasAttracted) this.progression.incrementAchievementProgress('magnetMaster');
            }
        }
        const events = ball.integrate(dt, this.height);
        if (events & (PhysicsCore.EVT.WALL_TOP | PhysicsCore.EVT.WALL_BOTTOM)) {
            this.onBallWallHit(ball, events);
        }
    }

    // Rail contact: sound plus a little feedback scaled by how hard it hit.
    onBallWallHit(ball, events) {
        const impact = ball.lastImpact || 0;
        this.audio.bounce(impact, this.panFor(ball.pos.x));
        ball.squashImpact?.(Math.PI / 2, 0.15 + impact * 0.35);
        if (impact > 0.35) {
            this.screenShake = Math.max(this.screenShake || 0, impact * 4);
            const y = (events & PhysicsCore.EVT.WALL_TOP) ? 0 : this.height;
            this.postFx?.ripple(ball.pos.x, y, 0.25 + impact * 0.35);
        }
    }

    handleCollisions(dt) {
        this.checkPaddleCollision(this.player, true);
        this.checkPaddleCollision(this.aiPaddle, false);
        this.handleZombieBallCollisions(this.ball);
        if (!this.ghostBallActive) {
            const ball = this.ball;
            for (let i = 0; i < this.obstacles.length; i++) {
                if (this.obstacles[i].checkCollision(ball)) {
                    this.audio.hit();
                    if (this.gameMode !== 'obstacle') {
                        this.particles.spawnGodTierHit(ball.pos.x, ball.pos.y, '#e040fb', ball.getSpeed());
                        this.screenShake = Math.max(this.screenShake, 8);
                    } else {
                        this.screenShake = Math.max(this.screenShake, 2);
                    }
                    break;
                }
            }
        }
    }

    updatePaddles(dt) {
        if (this.gameMode === 'customise') {
            this.enforceFairCustomisePaddles();
        }
        // Player 1 (Left)
        if (this.player.laserStunned) {
            this.player.vel.y = 0;
        } else if (this.pointerControls.player !== null) {
            this.followPointerTarget(this.player, dt);
        } else {
            let p1MoveDir = this.keys['w'] ? -1 : (this.keys['s'] ? 1 : 0);
            const pad1 = this.padState?.[0];
            if (pad1 && pad1.axis !== 0) p1MoveDir = pad1.axis;
            if (p1MoveDir !== 0) {
                const speedMul = this.powerUpTimers.fastPaddle > 0 ? 1.5 : 1;
                const targetVelY = p1MoveDir * this.player.maxSpeed * speedMul;
                this.player.vel.y += (targetVelY - this.player.vel.y) * 0.1;
            } else {
                this.player.vel.y *= this.player.friction;
            }
        }
        this.player.pos.y += this.player.vel.y * dt;
        this.player.clampTo(this.height);

        // Player 2 or AI (Right)
        if (this.isMultiplayer) {
            // human-controlled second paddle
            if (this.aiPaddle.laserStunned) {
                this.aiPaddle.vel.y = 0;
            } else if (this.pointerControls.ai !== null) {
                this.followPointerTarget(this.aiPaddle, dt);
            } else {
                let p2MoveDir = this.keys['arrowup'] ? -1 : (this.keys['arrowdown'] ? 1 : 0);
                const pad2 = this.padState?.[1];
                if (pad2 && pad2.axis !== 0) p2MoveDir = pad2.axis;
                if (p2MoveDir !== 0) {
                    const speedMul = 1; // Standard speed for P2 for now
                    const targetVelY = p2MoveDir * this.aiPaddle.maxSpeed * speedMul;
                    this.aiPaddle.vel.y += (targetVelY - this.aiPaddle.vel.y) * 0.1;
                } else {
                    this.aiPaddle.vel.y *= this.aiPaddle.friction;
                }
            }
        }

        // boss updates (curse, particles, etc.) – run regardless of PvP so the
        // overlay can animate.  update() itself decides what behaviour to execute.
        if (this.gameMode === 'zombie' && this.ai instanceof ZombieBoss) {
            this.ai.update(dt);
        } else if (!this.isMultiplayer) {
            // normal AI routine for non-zombie modes or when not using the boss
            if (this.powerUpTimers.freezeAI <= 0) {
                if (typeof this.ai.updateGameState === 'function') {
                    this.ai.updateGameState({
                        playerScore: this.scores.player,
                        aiScore: this.scores.ai,
                        rallyCount: this.rallyCount
                    });
                }
                this.ai.update(dt, this.powerUps);
            }
        }

        // Apply Right Paddle Movement (AI or P2)
        this.aiPaddle.pos.y += this.aiPaddle.vel.y * dt;
        this.aiPaddle.clampTo(this.height);

        // Player 1 Laser
        if (this.keys[' '] && this.player.hasLaser && !this.player.laserStunned) {
            this.player.fireLaser(this);
            this.keys[' '] = false;
        }

        // AI or Player 2 Laser
        if (this.isMultiplayer) {
            if (this.keys['enter'] && this.aiPaddle.hasLaser && !this.aiPaddle.laserStunned) {
                this.aiPaddle.fireLaser(this);
                this.keys['enter'] = false;
            }
        } else if (this.aiPaddle.hasLaser && Math.random() < 1.2 * dt && !this.aiPaddle.laserStunned) {
            this.aiPaddle.fireLaser(this);
        }

        // Recoil springs, hit particles and idle animation.
        this.player.update(dt);
        this.aiPaddle.update(dt);
    }

    checkScoringConditions() {
        const checkBallScore = (ball) => {
            if (this.isZombieWaveMode()) {
                if (ball.pos.x > this.width + 50) {
                    this.handleZombieGoalScore();
                    return false;
                }
                if (ball.pos.x < -50) {
                    this.applyZombieBreach('The brain slipped past your paddle');
                    return false;
                }
                return true;
            }

            if (ball.pos.x > this.width + 50) {
                if (this.invincibleTime > 0 || (this.isMultiplayer && this.shieldActive.ai)) {
                    ball.pos.x = this.width - ball.r - 10;
                    ball.vel.x = -Math.abs(ball.vel.x) * 1.1;
                    this.audio.bounce();
                    this.particles.spawnGodTierHit(ball.pos.x, ball.pos.y, '#fff176', 600);
                    if (this.isMultiplayer && this.shieldActive.ai) {
                        this.shieldActive.ai = false;
                        this.showNotification('Shield Blocked!', 'P2 saved!', '#00bcd4');
                    }
                    return true;
                }
                const points = this.powerUpTimers.doublePoints > 0 ? 2 : 1;
                const prevP2Score = this.scores.ai;
                this.scores.player += points;
                this.progression.recordPoint('player', points);
                // remember point for challenge resolution
                if (this.speedChallenge) {
                    this.speedChallenge.lastScoreChange = { scorer: 'player', points };
                }
                this.audio.score();
                this.resetRally();
                if (this.ai && typeof this.ai.onPlayerScore === 'function') {
                    this.ai.onPlayerScore();
                }
                if (this.gameMode === 'speed') {
                    // Set intended active player (the one being scored against)
                    this.speedChallenge.activePlayer = 'ai';

                    // In single-player we only challenge the HUMAN player (not the AI).
                    // Since here the AI would be the one being scored against, skip starting
                    // the challenge in single-player. In multiplayer start normally.
                    if (this.isMultiplayer) {
                        // Special Tiebreaker check: if score was 10-10 BEFORE this point was added
                        if (this.scores.player > 10 && prevP2Score === 10) {
                            const actualP1Score = this.scores.player;
                            this.scores.player = 10;
                            this.speedChallenge.startChallenge();
                            this.scores.player = actualP1Score;
                        } else {
                            this.speedChallenge.startChallenge();
                        }
                    }
                }
                return false;
            }
            if (ball.pos.x < -50) {
                if (this.invincibleTime > 0 || (this.isMultiplayer ? this.shieldActive.player : this.shieldActive)) {
                    ball.pos.x = ball.r + 10;
                    ball.vel.x = Math.abs(ball.vel.x) * 1.1;
                    this.audio.bounce();
                    this.particles.spawnGodTierHit(ball.pos.x, ball.pos.y, '#fff176', 600);
                    if (this.isMultiplayer) {
                        if (this.shieldActive.player) {
                            this.shieldActive.player = false;
                            this.showNotification('Shield Blocked!', 'P1 saved!', '#00bcd4');
                        }
                    } else {
                        if (this.shieldActive) {
                            this.shieldActive = false;
                            this.showNotification('Shield Blocked!', 'Shield activated!', '#00bcd4');
                        }
                    }
                    return true;
                } else {
                    if (this.gameMode === 'speed') {
                        const points = this.powerUpTimers.doublePoints > 0 ? 2 : 1;
                        const prevP1Score = this.scores.player;
                        this.scores.ai += points;
                        this.progression.recordPoint('ai', points);
                        // remember what just happened for the upcoming speed challenge
                        if (this.speedChallenge) {
                            this.speedChallenge.lastScoreChange = { scorer: 'ai', points };
                        }
                        this.audio.score();
                        this.resetRally();
                        if (this.ai && typeof this.ai.onAIScore === 'function') {
                            this.ai.onAIScore();
                        }
                        // Set intended active player (the one being scored against)
                        this.speedChallenge.activePlayer = 'player';

                        // In single-player we only challenge the HUMAN player (which is correct here),
                        // so start the challenge. In multiplayer also start as before.
                        if (this.isMultiplayer) {
                            if (this.scores.ai > 10 && prevP1Score === 10) {
                                const actualP2Score = this.scores.ai;
                                this.scores.ai = 10;
                                this.speedChallenge.startChallenge();
                                this.scores.ai = actualP2Score;
                            } else {
                                this.speedChallenge.startChallenge();
                            }
                        } else {
                            // single-player: activePlayer is 'player' so start challenge
                            this.speedChallenge.startChallenge();
                        }
                        return false;
                    }
                    const points = this.powerUpTimers.doublePoints > 0 ? 2 : 1;
                    this.scores.ai += points;
                    this.progression.recordPoint('ai', points);
                    this.audio.score();
                    this.resetRally();
                    if (this.ai && typeof this.ai.onAIScore === 'function') {
                        this.ai.onAIScore();
                    }
                    return false;
                }
            }
            return true;
        };
        if (!checkBallScore(this.ball)) {
            const goalOnRight = this.ball.pos.x > this.width * 0.5;
            const goalY = Math.max(0, Math.min(this.height, this.ball.pos.y));
            this.onGoalScored(goalOnRight, goalY);
            this.ball.reset(this.center);
            if (this.isZombieWaveMode() && Number.isFinite(this._zombieNextServeDirection)) {
                const dir = this._zombieNextServeDirection >= 0 ? 1 : -1;
                this.ball.vel.x = Math.abs(this.ball.vel.x) * dir;
                this._zombieNextServeDirection = null;
            } else {
                // The player who conceded receives the serve.
                this.ball.vel.x = goalOnRight ? Math.abs(this.ball.vel.x) : -Math.abs(this.ball.vel.x);
            }
            if (!this.isZombieWaveMode() && !this.speedChallenge?.isActive) {
                this.holdServe(0.85);
            }
        }
        let writeIndex = 0;
        for (let i = 0; i < this.additionalBalls.length; i++) {
            const ball = this.additionalBalls[i];
            if (checkBallScore(ball)) {
                this.additionalBalls[writeIndex++] = ball;
            }
        }
        this.additionalBalls.length = writeIndex;
    }

    updateGameUI() {
        const speed = this.ball.getSpeed();
        this._setText(this.speedDisplay, Math.round(speed));
        if (speed > 1000 && !this.progression.achievements.speedDemon.unlocked) {
            this.progression.unlockAchievement('speedDemon');
        }
        if (this.rallyCount >= 20 && !this.progression.achievements.rallyMaster.unlocked) {
            this.progression.unlockAchievement('rallyMaster');
        }
        this.updateScoreUI();
    }

    finishMatch(playerWon, options = {}) {
        if (this.matchEnding) {
            return;
        }

        this.matchEnding = true;
        if (this.gameMode === 'speed' && this.speedChallenge && typeof this.speedChallenge.terminateChallenge === 'function') {
            this.speedChallenge.terminateChallenge('match-end');
        }

        const matchStats = {
            playerScore: Number(options.matchStats?.playerScore ?? this.scores.player),
            aiScore: Number(options.matchStats?.aiScore ?? this.scores.ai),
            maxScore: Number(options.matchStats?.maxScore ?? this.maxScore)
        };
        const progressionEnabled = !this.isMultiplayer && this.gameMode !== 'customise';
        let xp = Number.isFinite(options.xp)
            ? Number(options.xp)
            : (playerWon ? 8 : 4) + Math.min(4, Math.floor(this.maxRally / 3));

        if (!Number.isFinite(options.xp)) {
            if (this.gameMode === 'speed') xp += 8;
            if (this.gameMode === 'zombie') xp += 6;
            if (this.gameMode === 'obstacle') xp += 4;
            if (this.gameMode === 'gravity') xp += 4;
        }

        if (progressionEnabled && playerWon && matchStats.aiScore === 0 && !this.progression.achievements.perfectGame.unlocked) {
            this.progression.unlockAchievement('perfectGame');
        }

        if (progressionEnabled && playerWon && matchStats.playerScore === matchStats.maxScore &&
            !this.progression.achievements.firstBlood.unlocked) {
            this.progression.unlockAchievement('firstBlood');
        }

        if (progressionEnabled) {
            this.checkAchievementsOnWin(playerWon);
        }

        if (progressionEnabled && playerWon) {
            this.progression.recordGameWin(
                this.comeback,
                options.progressionMode || this.gameMode,
                matchStats
            );
        } else if (progressionEnabled) {
            this.progression.recordGameLoss();
        }

        if (progressionEnabled) {
            this.progression.addXP(xp);
        }

        this.running = false;
        if (typeof this.audio?.stopAllGravityWellSounds === 'function') {
            this.audio.stopAllGravityWellSounds();
        }

        if (this.ai && typeof this.ai.onGameEnd === 'function') {
            this.ai.onGameEnd(!playerWon);
        }

        setTimeout(() => {
            this.stop();
            const overlay = document.getElementById('overlay');
            if (!overlay) return;

            const p = overlay.querySelector('p');
            if (p) {
                const winnerLabel = this.gameMode === 'customise'
                    ? (playerWon ? 'Left Player' : 'Right Player')
                    : (playerWon ? 'Player' : 'AI');
                const showCustomiseReturn = this.gameMode === 'customise' && !options.summaryHtml;
                p.innerHTML = options.summaryHtml || `
            ${winnerLabel} Wins!<br>
            Final Score: ${this.scores.player} - ${this.scores.ai}<br>
            XP Earned: +${xp}<br>
            Mode: ${options.modeLabel || this.getModeDisplayName(this.gameMode)}<br>
            ${showCustomiseReturn ? `<div class="end-match-actions"><button id="backToCustomise" class="btn">Go Back to Customise</button></div>` : ''}
        `;
            }

            overlay.classList.remove('hidden');
            overlay.classList.add('post-match');

            if (this.progression && typeof this.progression.captureMatchAchievements === 'function') {
                this.progression.captureMatchAchievements();
            }

            const menuProgressPanel = document.getElementById('menuProgressPanel');
            if (menuProgressPanel) {
                menuProgressPanel.style.display = '';
            }

            const menuAchievements = document.getElementById('menuRecentAchievements');
            if (menuAchievements) {
                menuAchievements.style.display = '';
                if (typeof updateMenuAchievements === 'function') {
                    updateMenuAchievements();
                }
            }

            if (typeof this.audio?.stopMusic === 'function') {
                this.audio.stopMusic('all');
            }

            const backToCustomiseBtn = document.getElementById('backToCustomise');
            if (backToCustomiseBtn) {
                const newBackBtn = backToCustomiseBtn.cloneNode(true);
                backToCustomiseBtn.parentNode.replaceChild(newBackBtn, backToCustomiseBtn);
                newBackBtn.addEventListener('click', () => {
                    const customiseOverlay = document.getElementById('customiseOverlay');
                    const customisePanel = document.getElementById('customisePanel');
                    overlay.classList.add('hidden');
                    if (customiseOverlay) {
                        customiseOverlay.classList.add('active');
                        customiseOverlay.setAttribute('aria-hidden', 'false');
                    }
                    customisePanel?.classList.add('active');
                    this.customSettings.previewModeActive = true;
                });
            }

            this.progression.showEndGameAchievementSummary();
        }, Number.isFinite(options.delayMs) ? options.delayMs : 1800);
    }

    updateScoreUI() {
        if (this.matchEnding) {
            return;
        }

        if (!this.isZombieWaveMode()) {
            this._setText(this.scoreElements.player, this.scores.player);
            this._setText(this.scoreElements.ai, this.scores.ai);
        }
        this._setText(this.streakDisplay, this.progression.winStreak);
        this.syncZombieHUD();

        if (this.isZombieWaveMode()) {
            return;
        }

        // Match end. Speed Mode's challenge can still overturn the final point.
        if (this.scores.player >= this.maxScore || this.scores.ai >= this.maxScore) {
            if (this.gameMode === 'speed' && this.speedChallenge && this.speedChallenge.isActive) {
                return;
            }
            this.finishMatch(this.scores.player >= this.maxScore);
        }
    }

    _setHTML(el, html) {
        if (el && el.__ppHTML !== html) {
            el.innerHTML = html;
            el.__ppHTML = html;
        }
    }

    // Write to the DOM only when the value actually changed: this runs every
    // physics step and unchanged textContent writes still cost layout work.
    _setText(el, value) {
        if (!el) return;
        const text = String(value);
        if (el.__ppText !== text) {
            el.textContent = text;
            el.__ppText = text;
        }
    }

    checkAchievementsOnWin(playerWon) {
        // Achievements are only available in AI/Story modes
        if (this.isMultiplayer) return;

        // Win-only achievements
        if (playerWon) {
            // Perfect game
            if (this.scores.ai === 0 && !this.progression.achievements.perfectGame.unlocked) {
                this.progression.unlockAchievement('perfectGame');
            }

            // First blood (first point ever scored)
            if (this.scores.player === this.maxScore &&
                this.progression.gamesWon === 0 &&
                !this.progression.achievements.firstBlood.unlocked) {
                this.progression.unlockAchievement('firstBlood');
            }
        }

        // Achievements that can unlock on win or loss
        // Speed demon (ball speed > 1000)
        if (this.ball.getSpeed() > 1000 && !this.progression.achievements.speedDemon.unlocked) {
            this.progression.unlockAchievement('speedDemon');
        }

        // Rally master (any time rally reaches 20+)
        if (this.rallyCount >= 20 && !this.progression.achievements.rallyMaster.unlocked) {
            this.progression.unlockAchievement('rallyMaster');
        }
    }

    // Paddles move on the 240 Hz physics clock; draw them interpolated between
    // the last two steps (like the ball) so they don't judder on 144/165 Hz
    // screens, where frames don't divide evenly into physics steps.
    render(interp) {
        if (this.introActive || this.paused) return;
        const paddles = [this.player, this.aiPaddle];
        const realY = [];
        for (let i = 0; i < paddles.length; i++) {
            const p = paddles[i];
            realY[i] = p ? p.pos.y : 0;
            if (p && Number.isFinite(p._prevY) && Math.abs(p.pos.y - p._prevY) < 200) {
                p.pos.y = p._prevY + (p.pos.y - p._prevY) * interp;
            }
        }
        try {
            this.renderScene(interp);
        } finally {
            for (let i = 0; i < paddles.length; i++) if (paddles[i]) paddles[i].pos.y = realY[i];
        }
    }

    renderScene(interp) {

        const ctx = this.ctx;
        const W = this.width, H = this.height;
        const renderDt = this.lastDt || this.dt || (1 / 60);
        const renderBackgroundLayer = () => {
            if (this.gameMode === 'speed') {
                if (this.bgRenderer) {
                    this.bgRenderer.update(renderDt);
                    this.bgRenderer.render();
                } else {
                    this.renderSpeedBackground();
                }
            } else {
                if (this.bgRenderer) {
                    this.bgRenderer.update(renderDt);
                    this.bgRenderer.render();
                } else {
                    ctx.fillStyle = this.bgGradient;
                    ctx.fillRect(0, 0, W, H);
                }
            }
        };
        renderBackgroundLayer();
        // Camera: smooth multi-sine shake (no per-frame white noise) plus a
        // spring-damped directional kick that pushes along the impact.
        let shakeApplied = false;
        const kick = this.cameraKick || (this.cameraKick = { x: 0, y: 0, vx: 0, vy: 0 });
        {
            const k = 900, c = 2 * Math.sqrt(k) * 0.55;
            const kdt = Math.min(renderDt, 1 / 30);
            kick.vx += (-k * kick.x - c * kick.vx) * kdt;
            kick.vy += (-k * kick.y - c * kick.vy) * kdt;
            kick.x += kick.vx * kdt;
            kick.y += kick.vy * kdt;
        }
        let shakeMag = 0;
        if (typeof this.screenShake === 'object' && this.screenShake) {
            shakeMag = Math.hypot(this.screenShake.x || 0, this.screenShake.y || 0);
        } else if (this.screenShake) {
            shakeMag = this.screenShake;
        }
        if (shakeMag > 0.05 || Math.abs(kick.x) + Math.abs(kick.y) > 0.05) {
            shakeApplied = true;
            ctx.save();
            const t = performance.now() * 0.001;
            // Shake grows with the square of its strength ("trauma"), so small
            // taps stay subtle and big impacts really land.
            const trauma = Math.min(shakeMag, 25) / 25;
            const amp = trauma * trauma * 16;
            const nx = Math.sin(t * 47.3) * 0.6 + Math.sin(t * 83.1 + 1.7) * 0.4;
            const ny = Math.sin(t * 53.7 + 0.5) * 0.6 + Math.sin(t * 91.3 + 2.9) * 0.4;
            ctx.translate(nx * amp + kick.x, ny * amp + kick.y);
            const roll = Math.sin(t * 37.1 + 4.2) * trauma * trauma * 0.006;
            if (roll) {
                ctx.translate(W / 2, H / 2);
                ctx.rotate(roll);
                ctx.translate(-W / 2, -H / 2);
            }
        }
        if (this.screenFlash > 0.001) {
            ctx.save();
            ctx.globalAlpha = Math.min(this.screenFlash * 0.5, 0.5);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        if (this.shockwave) {
            const s = this.shockwave;
            const speedFactor = 1 - (s.radius / s.maxRadius);
            const currentSpeed = (s.initialSpeed || 950) * speedFactor;
            s.radius += currentSpeed * (this.lastDt || 1 / 60);
            s.alpha = 1 - (s.radius / s.maxRadius);
            if (s.alpha <= 0) {
                this.shockwave = null;
            } else {
                ctx.save();
                ctx.globalAlpha = s.alpha * 0.45;
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 4 + s.alpha * 10;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }
        if (this.gameMode === 'speed') {
            ctx.save();
            ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.003) * 0.2;
            ctx.fillStyle = '#ff00ff';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff00ff';
            ctx.fillText('⚡  ⚡', W / 2, 40);
            ctx.restore();
        }
        ctx.strokeStyle = 'rgba(0, 255, 214, 0.12)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 12);
        ctx.lineTo(W / 2, H - 12);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, H * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        if (this.gameMode === 'gravity') {
            const gravityRenderTime = performance.now() * 0.001;
            for (let i = 0; i < this.gravityWells.length; i++) {
                this.gravityWells[i].render(ctx, gravityRenderTime);
            }
        }
        if (this.gameMode === 'obstacle') {
            // Obstacle bodies and their background-linked visuals are rendered by the
            // BackgroundRenderer to avoid duplicate draws. Keep fragment pool here.
            window.globalFragmentPool.renderAll(ctx, areParticleEffectsEnabled());
        }

        // Render powerups and their tooltips
        for (let i = 0; i < this.powerUps.length; i++) {
            const pu = this.powerUps[i];
            pu.render(ctx);
            // Ensure tooltips render even when paused so players can inspect items
            pu.renderTooltip(ctx, this.mouseX, this.mouseY);
        }

        this.renderZombieModeEntities(ctx);

        this.renderAdditionalBalls();
        this.updatePaddleAnticipation(renderDt);
        // draw player and AI paddles every frame regardless of mode
        this.player.render(ctx);
        if (this.isZombieWaveMode() && this.player) {
            const state = this.zombieState;
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.01);
            const baseX = this.player.pos.x;
            const baseY = this.player.pos.y;
            const baseW = this.player.w;
            const baseH = this.player.h;

            ctx.save();
            if (state.shieldCharges > 0) {
                ctx.lineWidth = 4;
                ctx.strokeStyle = `rgba(92, 209, 255, ${0.8 + pulse * 0.15})`;
                ctx.shadowColor = '#57d6ff';
                ctx.shadowBlur = 18 + pulse * 10;
                ctx.strokeRect(baseX - 7, baseY - 7, baseW + 14, baseH + 14);
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = 2;
                ctx.strokeRect(baseX - 12, baseY - 12, baseW + 24, baseH + 24);
                ctx.globalAlpha = 1;
            }

            if (state.powerups.rage > 0) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = `rgba(255, 132, 58, ${0.75 + pulse * 0.2})`;
                ctx.shadowColor = '#ff7c32';
                ctx.shadowBlur = 14 + pulse * 8;
                ctx.strokeRect(baseX - 3, baseY - 3, baseW + 6, baseH + 6);
                ctx.beginPath();
                ctx.moveTo(baseX + baseW + 4, baseY + baseH * 0.2);
                ctx.lineTo(baseX + baseW + 14, baseY + baseH * 0.35);
                ctx.moveTo(baseX + baseW + 2, baseY + baseH * 0.55);
                ctx.lineTo(baseX + baseW + 12, baseY + baseH * 0.72);
                ctx.moveTo(baseX + baseW + 4, baseY + baseH * 0.82);
                ctx.lineTo(baseX + baseW + 13, baseY + baseH * 0.96);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Render fire hit effect (blue → yellow flash → back to blue)
        if (this.player && this.player.fireHitFlashing && this.player.fireHitFlashTimer > 0) {
            const flashIntensity = this.player.fireHitFlashTimer / 0.5; // 1.0 at start, 0.0 at end
            ctx.save();
            ctx.globalAlpha = flashIntensity * 0.8; // 80% transparent yellow
            ctx.fillStyle = '#FFFF00'; // Bright yellow
            ctx.fillRect(
                this.player.pos.x,
                this.player.pos.y,
                this.player.w,
                this.player.h
            );
            ctx.restore();
        }

        if (this.aiPaddle && !this.aiPaddle.isCustomRendered) {
            this.aiPaddle.render(ctx);
        }

        // if we're running the special zombie boss AI, render its effects on top
        if (this.gameMode === 'zombie' && this.ai instanceof ZombieBoss) {
            this.ai.render(ctx);
            if (this.aiPaddle.hasLaser && this.aiPaddle.laserCharges > 0) {
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#00ffff';
                ctx.fillText(`⚡${this.aiPaddle.laserCharges}`,
                    this.aiPaddle.pos.x + this.aiPaddle.w / 2,
                    this.aiPaddle.pos.y + this.aiPaddle.h / 2);
                ctx.restore();
            }
        }
        this.ball.render(ctx, interp);
        this.renderServeTelegraph(ctx);
        this.renderRallyCounter(ctx, renderDt);
        this.renderPopTexts(ctx, renderDt);
        if (this.shieldActive) {
            ctx.save();
            ctx.strokeStyle = '#00bcd4';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, H);
            ctx.stroke();
            ctx.restore();
        }
        this.particles.render(ctx);

        // Skip taunt rendering in zombie mode
        if (this.gameMode !== 'zombie') {
            const taunt = this.ai && this.ai.getCurrentTaunt ? this.ai.getCurrentTaunt() : "";
            if (taunt && taunt.text) {
                ctx.save();
                ctx.globalAlpha = taunt.opacity || 1;
                const paddleX = this.aiPaddle.pos.x;
                const paddleY = this.aiPaddle.pos.y + this.aiPaddle.h / 2;
                ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                const maxBubbleWidth = 220;
                const padding = 14;
                const maxTextWidth = maxBubbleWidth - padding * 2;
                const lines = this.getTauntLayout(ctx, taunt.text, maxTextWidth);
                const lineHeight = 20;
                const bubbleHeight = Math.max(36, lines.length * lineHeight + padding);
                const bubbleWidth = maxBubbleWidth;
                const bubbleX = paddleX - bubbleWidth - 50;
                const bubbleY = paddleY - bubbleHeight / 2;
                ctx.fillStyle = '#0088ff';
                this.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 18);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(paddleX - 50, paddleY);
                ctx.lineTo(paddleX - 40, paddleY - 8);
                ctx.lineTo(paddleX - 40, paddleY + 8);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                for (let index = 0; index < lines.length; index++) {
                    const line = lines[index];
                    const y = bubbleY + padding / 2 + (index + 0.5) * lineHeight;
                    ctx.fillText(line, bubbleX + padding, y);
                }
                ctx.restore();
            }
        }
        this.renderNotifications();
        if (shakeApplied) ctx.restore();
    }

    step() {
        // Safety check: prevent multiple concurrent loops
        if (this.rafId !== null && !this.running && !this.introActive) {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = null;
        }

        this.rafId = requestAnimationFrame(() => this.step());
        const now = performance.now() / 1000;
        this.pollGamepads();

        // Only gameplay frames feed the quality governor (the menu and intro have
        // their own costs and shouldn't lower in-match quality).
        if (this.running && !this.paused && !this.introActive) {
            if (this._govLast !== undefined) PerfGovernor.sample((now - this._govLast) * 1000);
            this._govLast = now;
        } else {
            this._govLast = undefined;
        }

        // Don't run game logic if intro is active
        if (this.introActive) {
            this.lastTime = now;
            return;
        }

        if (!this.running) {
            return;
        }

        if (this.paused) {
            this.lastTime = now;
            return;
        }

        let frameTime = now - this.lastTime;
        this.lastTime = now;
        frameTime = Math.min(frameTime, 0.25);
        this.lastDt = frameTime;

        this.accumulator += frameTime;

        const frameStartMs = performance.now();
        let physicsTimeMs = 0;
        let physicsSteps = 0;
        const physicsStepDt = this.dt;

        // FIXED: Support physics sub-stepping for smoother gravity mode.
        // Avoid excessively heavy sub-stepping when the frame is already running slow.
        let subSteps = (this.gameMode === 'gravity') ? 2 : 1;
        if (this.gameMode === 'gravity' && frameTime > 0.04) {
            subSteps = 1;
        }
        const subStepDt = physicsStepDt / subSteps;

        while (this.accumulator >= physicsStepDt && physicsSteps < 10) {
            const physicsStepStartMs = performance.now();
            physicsSteps++;

            for (let s = 0; s < subSteps; s++) {
                this.physicsStep(subStepDt, s === 0);
            }

            this.accumulator -= physicsStepDt;
            physicsTimeMs += performance.now() - physicsStepStartMs;
        }

        const alpha = this.accumulator / physicsStepDt;
        const renderStartMs = performance.now();
        this.render(alpha);
        this.postFx?.present(frameTime);
        this.updatePerfOverlay();
        const renderTimeMs = performance.now() - renderStartMs;
        this.recordPerfSample(performance.now() - frameStartMs, physicsTimeMs, renderTimeMs);
    }
}

// Ensure `Game` is exposed on `window` so the loader can reliably access it
if (typeof window !== 'undefined' && typeof Game !== 'undefined') {
    window.Game = Game;
}
