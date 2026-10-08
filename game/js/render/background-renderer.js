class BackgroundRenderer {
    // ------------------------------------------------------------------
    // CONSTRUCTION
    // ------------------------------------------------------------------
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.mode = 'classic';
        this.time = 0;

        this._zombieStaticInitialized = false;

        this.rainParticles = [];
        this.fogParticles = [];
        this.orbParticles = [];
        this.starParticles = [];
        this.nebulaParticles = [];
        this.debrisParticles = [];
        this.sparkParticles = [];
        this.smokeParticles = [];
        this.lavaDropParticles = [];
        this.dustParticles = [];
        this.swarmParticles = [];
        this.zombieHands = [];
        this.zombieCracks = [];
        this._zombieHandsByScale = [];

        this.stars = [];
        this.lavaVeins = null;
        this.cityLights = null;

        this._swarmSVGs = {
            bat: null,
            moth: null,
        };
        this._initSwarmSVGs();

        this.gridOffset = 0;
        this.scanlineOffset = 0;
        this.modePhase = 0;
        this.skyHueShift = 0;

        this.lightLayers = [];
        this.dynamicLights = true;
        this.lightIntensityMultiplier = 1.0;

        this._buildingData = null;
        this._windowList = null;
        this._neonSigns = null;

        this._farCanvas = null;
        this._farCtx = null;
        this._zombieStaticCanvas = null;
        this._zombieStaticCtx = null;
        this._gravityStaticCanvas = null;
        this._gravityStaticCtx = null;
        this._obstacleStaticBaseCanvas = null;
        this._obstacleStaticBaseCtx = null;
        this._obstacleStaticOverlayCanvas = null;
        this._obstacleStaticOverlayCtx = null;
        this._gravityClusterSprite = null;
        this._gravityCoreSprite = null;
        this._obstacleFirePitSprite = null;
        this._obstacleHeatPlumeSprite = null;
        this._obstacleSmokeSprite = null;
        this._obstacleSparkSprite = null;
        this._obstacleShimmerSprite = null;
        this._obstacleShimmerRadius = 0;
        this._obstacleArenaState = null;
        this._customToneBaseCanvas = null;
        this._customToneBaseCtx = null;
        this._customToneCanvas = null;
        this._customToneCtx = null;
        this._backgroundRenderCache = {
            canvas: null,
            ctx: null,
            mode: null,
            width: 0,
            height: 0,
            scale: 1,
            lastRenderMs: -Infinity,
            dirty: true,
        };

        this._rngState = 1;

        this._introPreview = null;

        // Worker + WASM background simulation (non-blocking)
        this._bgSim = null;
        this._bgSimEnabled = false;
        this._bgWasm = {
            speed: {
                initialized: false,
                inFlight: false,
                pending: null,
            },
            gravity: {
                initialized: false,
                inFlight: false,
                pending: null,
            },
            intro: {
                inFlight: false,
                values: null,
            },
        };

        // Speed mode v2 — road splashes pool
        this._splashes = [];
        this._MAX_SPLASHES = 20;

        // Speed mode v2 — baked rain config (matches screenshot settings)
        this._speedRainSlant = 0.60;   // slant (0–1)
        this._speedRainSpeed = 2.00;   // speed multiplier
        this._speedPollutionAmt = 1.00;   // sky light pollution strength
        this._speedBloomAmt = 0.25;   // bloom intensity
        this._speedSaturation = 0.00;   // colour saturation (0 = greyscale/gritty)

        // Speed mode — lightning strike state
        this._speedLightning = null;
        this._resetSpeedLightning();

        this._initWasmBridge();
        if (typeof window !== 'undefined') {
            window.addEventListener('backgroundWasmReady', () => {
                this._initWasmBridge();
                this._initWasmModeState();
            });
        }

        this.initElements();
    }

    _initWasmBridge() {
        try {
            this._bgSim = (typeof window !== 'undefined') ? window.BackgroundWasmSim : null;
            this._bgSimEnabled = !!(this._bgSim && this._bgSim.isReady && this._bgSim.isReady());
        } catch (err) {
            this._bgSimEnabled = false;
            this._bgSim = null;
        }
    }

    // ------------------------------------------------------------------
    // SINGLE SOURCE OF TRUTH for the road horizon line
    // ------------------------------------------------------------------
    get roadY() { return this.height * 0.80; }  // screenshot: Road Y = 0.80

    // ------------------------------------------------------------------
    // SEEDED RNG
    // ------------------------------------------------------------------
    _seedRng(seed) { this._rngState = seed >>> 0 || 1; }

    _rng() {
        let t = (this._rngState += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // ------------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------------
    static _parseColor(colorStr) {
        const m = colorStr.match(/[\d.]+/g);
        if (m && m.length >= 4) {
            return { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]), a: parseFloat(m[3]) };
        }
        return null;
    }

    static _rgba(parsed, alphaOverride) {
        const a = alphaOverride !== undefined ? alphaOverride : parsed.a;
        return `rgba(${parsed.r},${parsed.g},${parsed.b},${a.toFixed(4)})`;
    }

    // ------------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------------
    setMode(mode) {
        this.mode = mode;
        this._zombieStaticInitialized = false;
        this._invalidateBackgroundRenderCache();
        this._cleanupSpeedCache();
        this._cleanupZombieCache();
        this._cleanupGravityCache();
        this._cleanupObstacleCache();
        this._introPreview = null;
        this.initElements();
    }

    _initSwarmSVGs() {
        const batSvg = `
            <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 20 C40 10 20 5 5 25 C0 35 15 55 50 45 C85 55 100 35 95 25 C80 5 60 10 50 20 Z" fill="black"/>
                <circle cx="45" cy="25" r="2" fill="#ff2200"/>
                <circle cx="55" cy="25" r="2" fill="#ff2200"/>
            </svg>`;

        const mothSvg = `
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 20 L5 5 Q0 15 5 25 L20 20 L35 5 Q40 15 35 25 L20 20 Z" fill="#665544"/>
                <path d="M20 20 L10 35 Q20 40 30 35 L20 20 Z" fill="#443322"/>
            </svg>`;

        const createImg = (svg) => {
            const img = new Image();
            img.src = 'data:image/svg+xml;base64,' + btoa(svg);
            return img;
        };

        this._swarmSVGs.bat = createImg(batSvg);
        this._swarmSVGs.moth = createImg(mothSvg);
    }

    resize(newWidth, newHeight) {
        const scaleX = newWidth / this.width;
        const scaleY = newHeight / this.height;

        const scaleArray = (arr, fields) => {
            arr.forEach(p => {
                if (fields.x && p.x !== undefined) p.x *= scaleX;
                if (fields.y && p.y !== undefined) p.y *= scaleY;
            });
        };

        [this.rainParticles, this.fogParticles, this.orbParticles,
        this.debrisParticles, this.sparkParticles, this.smokeParticles,
        this.lavaDropParticles, this.dustParticles, this.nebulaParticles].forEach(arr => {
            scaleArray(arr, { x: true, y: true });
        });
        this.stars.forEach(s => { s.x *= scaleX; s.y *= scaleY; });
        if (this.cityLights) {
            this.cityLights.forEach(l => { l.xf = l.x / this.width; l.yf = l.y / this.height; });
        }
        if (this.lavaVeins) {
            this.lavaVeins.forEach(v => { v.x *= scaleX; });
        }

        this.rainParticles.forEach(p => {
            if (p.maxY !== undefined) p.maxY *= scaleY;
            p._gradient = null;
        });

        // Scale v2 splashes
        this._splashes.forEach(s => { s.x *= scaleX; s.y *= scaleY; });

        this.width = newWidth;
        this.height = newHeight;

        this._resetSpeedLightning(this.mode === 'speed'
            ? 0.6 + Math.random() * 1.4
            : 1.8 + Math.random() * 3.0);

        this._cleanupSpeedCache();
        this._cleanupZombieCache();
        this._cleanupGravityCache();
        this._cleanupObstacleCache();
        this._invalidateBackgroundRenderCache();
        if (this.mode === 'speed') {
            this._buildSpeedCity();
            this._buildWindowList();
            this._buildNeonSigns();
        }

        if (this._introPreview) {
            this._introPreview.canvas = this.ctx.canvas;
            this._introPreview.ctx = this.ctx;
        }
    }

    // ------------------------------------------------------------------
    // INIT
    // ------------------------------------------------------------------
    initElements() {
        this.rainParticles = [];
        this.fogParticles = [];
        this.orbParticles = [];
        this.starParticles = [];
        this.nebulaParticles = [];
        this.debrisParticles = [];
        this.sparkParticles = [];
        this.smokeParticles = [];
        this.lavaDropParticles = [];
        this.dustParticles = [];
        this.swarmParticles = [];
        this.stars = [];
        this.lightLayers = [];
        this.lavaVeins = null;
        this.cityLights = null;
        this._splashes = [];
        this.zombieHands = [];
        this.zombieCracks = [];
        this._zombieHandsByScale = [];
        this._resetSpeedLightning(this.mode === 'speed'
            ? 0.9 + Math.random() * 1.5
            : 1.8 + Math.random() * 3.0);
        this._cleanupZombieCache();
        this._cleanupGravityCache();
        this._cleanupObstacleCache();

        const W = this.width, H = this.height;

        switch (this.mode) {

            // ── CLASSIC ──────────────────────────────────────────────
            case 'classic':
                for (let i = 0; i < 50; i++) {
                    this.dustParticles.push({
                        x: Math.random() * W,
                        y: Math.random() * H,
                        size: Math.random() * 1.8 + 0.3,
                        speed: Math.random() * 6 + 1,
                        alpha: Math.random() * 0.35 + 0.05,
                        drift: (Math.random() - 0.5) * 0.4,
                        hue: Math.random() > 0.5 ? 290 : 195,
                    });
                }
                this.lightLayers.push(this._makeLight('radial', {
                    x: W * 0.5, y: H * 0.42,
                    radius: Math.min(W, H) * 0.6,
                    color: 'rgba(255,50,150,0.08)',
                    pulseSpeed: 1.5, pulseMagnitude: 0.2,
                }));
                break;

            // ── ZOMBIE ───────────────────────────────────────────────
            case 'zombie':
                for (let i = 0; i < 12; i++) {
                    this.fogParticles.push({
                        x: Math.random() * W,
                        y: Math.random() * H,
                        size: Math.random() * 90 + 36,
                        speed: Math.random() * 3.2 + 0.4,
                        alpha: Math.random() * 0.10 + 0.03,
                        drift: (Math.random() - 0.5) * 0.35,
                        fogHue: 62 + Math.random() * 26,
                        sprite: null,
                    });
                }
                this.lightLayers.push(this._makeLight('radial', {
                    x: W * 0.72, y: H * 0.18,
                    radius: Math.min(W, H) * 0.34,
                    color: 'rgba(190,215,170,0.06)',
                    pulseSpeed: 0.28, pulseMagnitude: 0.05,
                }));
                this.lightLayers.push(this._makeLight('radial', {
                    x: W * 0.42, y: H * 0.72,
                    radius: Math.min(W, H) * 0.48,
                    color: 'rgba(85,110,58,0.05)',
                    pulseSpeed: 0.55, pulseMagnitude: 0.10,
                }));
                this.lightLayers.push(this._makeLight('linear', {
                    x1: 0, y1: H * 0.72, x2: 0, y2: H,
                    color: 'rgba(74,96,46,0.06)',
                }));

                [0.22, 0.50, 0.78].forEach((xf, i) => {
                    this.zombieHands.push({
                        xf: Math.max(0.08, Math.min(0.92, xf + (Math.random() - 0.5) * 0.02)),
                        scale: 0.92 + Math.random() * 0.18 + i * 0.03,  // larger hands for detail
                        riseBase: 0.44 + Math.random() * 0.16,
                        riseAmp: 0.06 + Math.random() * 0.08,
                        riseSpeed: 0.22 + Math.random() * 0.12,
                        bobSpeed: 0.58 + Math.random() * 0.34,
                        bobOffset: Math.random() * Math.PI * 2,
                        rotOffset: (Math.random() - 0.5) * 7,
                        drift: 6 + Math.random() * 8,
                        poseSeq: i % 10,
                        poseStep: 1 + Math.floor(Math.random() * 3),
                        poseBlend: Math.random(),
                        poseDuration: 1.7 + Math.random() * 0.72,
                        poseOffset: Math.random() * Math.PI * 2,
                        twitch: 0.9 + Math.random() * 0.5,
                        splayAmp: 0.04 + Math.random() * 0.06,
                        detail: 1.0 + Math.random() * 0.8,
                    });
                });
                this._zombieHandsByScale = this.zombieHands.slice().sort((a, b) => a.scale - b.scale);

                for (let i = 0; i < 10; i++) {
                    this.zombieCracks.push({
                        xf: 0.04 + Math.random() * 0.92,
                        yOff: Math.random() * 0.035,
                        length: 0.04 + Math.random() * 0.08,
                        spread: 12 + Math.random() * 18,
                        phase: Math.random() * Math.PI * 2,
                        width: 0.8 + Math.random() * 1.2,
                        alpha: 0.16 + Math.random() * 0.24,
                    });
                }
                break;

            // ── GRAVITY ──────────────────────────────────────────────
            case 'gravity':
                for (let i = 0; i < 200; i++) {
                    this.stars.push({
                        x: Math.random() * W,
                        y: Math.random() * H,
                        size: Math.random() * 1.8 + 0.3,
                        alpha: Math.random() * 0.8 + 0.2,
                        twinkleSpeed: Math.random() * 1.5 + 0.5,
                        twinklePhase: Math.random() * Math.PI * 2,
                        cold: Math.random() > 0.3,
                    });
                }
                for (let i = 0; i < 18; i++) {
                    this.nebulaParticles.push({
                        x: Math.random() * W,
                        y: Math.random() * H,
                        size: Math.random() * 200 + 80,
                        speed: Math.random() * 2 + 0.5,
                        alpha: Math.random() * 0.09 + 0.03,
                        drift: (Math.random() - 0.5) * 0.3,
                        hue: Math.random() > 0.5
                            ? 10 + Math.random() * 30
                            : 200 + Math.random() * 30,
                        sprite: null,
                    });
                }
                this.lightLayers.push(this._makeLight('linear', {
                    x1: W * 0.22, y1: H * 0.18, x2: W * 0.78, y2: H * 0.82,
                    color: 'rgba(115,170,255,0.03)',
                }));
                this.lightLayers.push(this._makeLight('linear', {
                    x1: W * 0.72, y1: H * 0.65, x2: W * 0.28, y2: H * 0.35,
                    color: 'rgba(255,140,70,0.03)',
                }));
                break;

            // ── SPEED ────────────────────────────────────────────────
            case 'speed':
                // Rain particles — v2 schema with slant + wobble fields
                this._buildSpeedRain();
                this.lightLayers.push(this._makeLight('linear', {
                    x1: 0, y1: H * 0.7, x2: 0, y2: H,
                    color: 'rgba(255,50,0,0.04)',
                    gradientStops: [[0, 'rgba(255,50,0,0.08)'], [1, 'transparent']],
                }));
                break;

            // ── OBSTACLE ─────────────────────────────────────────────
            case 'obstacle':
                this.lavaVeins = null;
                break;
        }

        this._initWasmModeState();
    }

    _initWasmModeState() {
        if (!this._bgSimEnabled || !this._bgSim) return;

        if (this.mode === 'speed' && this.rainParticles.length) {
            const packed = new Float32Array(this.rainParticles.length * 8);
            for (let i = 0; i < this.rainParticles.length; i++) {
                const p = this.rainParticles[i];
                const base = i * 8;
                packed[base + 0] = p.x;
                packed[base + 1] = p.y;
                packed[base + 2] = p.speed;
                packed[base + 3] = p.maxYf;
                packed[base + 4] = p.slantVar;
                packed[base + 5] = p.wobbleFreq;
                packed[base + 6] = p.wobblePhase;
                packed[base + 7] = p.length;
            }

            this._bgWasm.speed.initialized = false;
            this._bgWasm.speed.inFlight = false;
            this._bgWasm.speed.pending = null;

            this._bgSim.initSpeedRain(packed.buffer, this.rainParticles.length)
                .then(() => { this._bgWasm.speed.initialized = true; })
                .catch((err) => {
                    console.warn('[BackgroundRenderer] Speed WASM init failed, using JS path.', err);
                    this._bgWasm.speed.initialized = false;
                });
        }

        if (this.mode === 'gravity' && this.stars.length) {
            const packed = new Float32Array(this.stars.length * 2);
            for (let i = 0; i < this.stars.length; i++) {
                const s = this.stars[i];
                const base = i * 2;
                packed[base + 0] = s.twinklePhase;
                packed[base + 1] = s.twinkleSpeed;
            }

            this._bgWasm.gravity.initialized = false;
            this._bgWasm.gravity.inFlight = false;
            this._bgWasm.gravity.pending = null;

            this._bgSim.initGravityStars(packed.buffer, this.stars.length)
                .then(() => { this._bgWasm.gravity.initialized = true; })
                .catch((err) => {
                    console.warn('[BackgroundRenderer] Gravity WASM init failed, using JS path.', err);
                    this._bgWasm.gravity.initialized = false;
                });
        }
    }

    // ------------------------------------------------------------------
    // SPEED RAIN BUILDER — v2 schema
    // ------------------------------------------------------------------
    _buildSpeedRain() {
        const W = this.width, H = this.height;
        const count = 200;  // screenshot: Count = 200
        this.rainParticles = [];
        for (let i = 0; i < count; i++) {
            const slantVar = 0.8 + Math.random() * 0.4;
            this.rainParticles.push({
                x: Math.random() * W,
                y: -Math.random() * H * 1.5,
                length: Math.random() * 55 + 18,
                speed: Math.random() * 480 + 320,
                alpha: Math.random() * 0.45 + 0.12,
                hue: 190 + Math.random() * 20,
                sat: 30 + Math.random() * 25,
                maxYf: 0.74 + Math.random() * 0.06,
                slantVar,
                wobblePhase: Math.random() * Math.PI * 2,
                wobbleFreq: 0.8 + Math.random() * 1.4,
                width: 0.45 + Math.random() * 0.55,
                _gradient: null,
                _gx1: 0, _gy1: 0,
            });
        }
    }

    // ------------------------------------------------------------------
    // SPEED SPLASH SPAWNER
    // ------------------------------------------------------------------
    _spawnSplash(x, y) {
        if (this._splashes.length >= this._MAX_SPLASHES) this._splashes.shift();
        this._splashes.push({
            x, y,
            r: 0,
            maxR: 5 + Math.random() * 14,
            life: 1,
            alpha: 0.4 + Math.random() * 0.3,
        });
    }

    _resetSpeedLightning(cooldown = 1.8 + Math.random() * 3.0) {
        this._speedLightning = {
            active: false,
            cooldown,
            age: 0,
            duration: 0,
            intensity: 0,
            darken: 0,
            glowRadius: 0,
            glowX: this.width * 0.5,
            glowY: this.height * 0.2,
            mainBolt: [],
            branches: [],
            flickerA: Math.random() * Math.PI * 2,
            flickerB: Math.random() * Math.PI * 2,
        };
    }

    _buildSpeedLightningBolt(startX, startY, endY, maxStepX, segments, driftBias = 0) {
        const pts = [{ x: startX, y: startY }];
        const totalY = Math.max(24, endY - startY);
        const stepY = totalY / Math.max(1, segments);
        const stepBias = driftBias / Math.max(1, segments);
        let x = startX;

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            x += (Math.random() - 0.5) * maxStepX * (0.85 + t * 0.55) + stepBias;
            x = Math.max(-this.width * 0.08, Math.min(this.width * 1.08, x));
            pts.push({ x, y: startY + stepY * i });
        }

        return pts;
    }

    _triggerSpeedLightning() {
        const w = this.width;
        const h = this.height;
        const roadY = this.roadY;
        const startX = w * (0.18 + Math.random() * 0.64);
        const startY = h * (0.04 + Math.random() * 0.12);
        const endY = Math.min(roadY * 0.88, h * (0.34 + Math.random() * 0.22));
        const mainBolt = this._buildSpeedLightningBolt(
            startX,
            startY,
            endY,
            w * (0.045 + Math.random() * 0.03),
            8 + Math.floor(Math.random() * 5),
            (Math.random() - 0.5) * w * 0.05,
        );

        const branches = [];
        const branchCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < branchCount; i++) {
            const startIndex = 2 + Math.floor(Math.random() * Math.max(1, mainBolt.length - 4));
            const branchStart = mainBolt[Math.min(startIndex, mainBolt.length - 2)];
            const branchEndY = Math.min(
                roadY * 0.90,
                branchStart.y + h * (0.06 + Math.random() * 0.12),
            );
            const driftBias = (Math.random() > 0.5 ? 1 : -1) * w * (0.05 + Math.random() * 0.08);

            branches.push({
                points: this._buildSpeedLightningBolt(
                    branchStart.x,
                    branchStart.y,
                    branchEndY,
                    w * (0.028 + Math.random() * 0.02),
                    3 + Math.floor(Math.random() * 3),
                    driftBias,
                ),
                alpha: 0.38 + Math.random() * 0.28,
            });
        }

        this._speedLightning = {
            active: true,
            cooldown: 0,
            age: 0,
            duration: 0.14 + Math.random() * 0.12,
            intensity: 1,
            darken: 0.48,
            glowRadius: Math.min(w, h) * (0.16 + Math.random() * 0.12),
            glowX: startX + (mainBolt[mainBolt.length - 1].x - startX) * 0.24,
            glowY: startY + (endY - startY) * 0.35,
            mainBolt,
            branches,
            flickerA: Math.random() * Math.PI * 2,
            flickerB: Math.random() * Math.PI * 2,
        };
    }

    _updateSpeedLightning(dt) {
        if (!this._speedLightning) this._resetSpeedLightning();
        const strike = this._speedLightning;

        if (!strike.active) {
            strike.cooldown -= dt;
            if (strike.cooldown <= 0) this._triggerSpeedLightning();
            return;
        }

        strike.age += dt;
        const progress = strike.age / strike.duration;
        const falloff = Math.max(0, 1 - progress);
        const flicker = 0.80
            + Math.sin(progress * 34 + strike.flickerA) * 0.16
            + Math.sin(progress * 71 + strike.flickerB) * 0.08;

        strike.intensity = Math.max(0, Math.min(1, Math.pow(falloff, 0.24) * flicker));
        strike.darken = 0.18 + strike.intensity * 0.36;

        if (progress > 1.18 || strike.intensity <= 0.01) {
            this._resetSpeedLightning(2.0 + Math.random() * 4.8);
        }
    }

    // ------------------------------------------------------------------
    // LIGHT FACTORY
    // ------------------------------------------------------------------
    _makeLight(type, opts) {
        const light = Object.assign({ type }, opts);
        light._parsedColor = BackgroundRenderer._parseColor(opts.color);
        return light;
    }

    // ------------------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------------------
    update(dt) {
        this.time += dt;
        this.gridOffset += dt * 22;
        this.scanlineOffset += dt * 30;
        this.modePhase += dt * 0.22;
        this.skyHueShift = Math.sin(this.modePhase) * 4;

        const W = this.width, H = this.height;
        const pfx = areParticleEffectsEnabled();

        if (this.mode === 'speed') this._updateSpeedLightning(dt);

        if (!pfx) return;

        for (let i = 0; i < this.dustParticles.length; i++) {
            const p = this.dustParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
            if (p.x < -p.size) p.x = W + p.size;
            if (p.x > W + p.size) p.x = -p.size;
        }

        for (let i = 0; i < this.fogParticles.length; i++) {
            const p = this.fogParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
            if (p.x < -p.size) p.x = W + p.size;
            if (p.x > W + p.size) p.x = -p.size;
        }

        for (let i = 0; i < this.orbParticles.length; i++) {
            const p = this.orbParticles[i];
            p.y -= p.speed * dt;
            p.x += Math.sin(this.time * 0.8 + p.phase) * 0.6
                + Math.sin(this.modePhase + p.phase) * 0.3;
            if (p.y < -60) p.y = H + 60;
        }

        for (let i = 0; i < this.nebulaParticles.length; i++) {
            const p = this.nebulaParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
        }

        if (this.mode === 'gravity' && this._bgSimEnabled && this._bgWasm.gravity.initialized) {
            if (this._bgWasm.gravity.pending) {
                const phases = this._bgWasm.gravity.pending;
                this._bgWasm.gravity.pending = null;
                for (let i = 0; i < this.stars.length; i++) {
                    this.stars[i].twinklePhase = phases[i * 2];
                }
            }

            if (!this._bgWasm.gravity.inFlight) {
                this._bgWasm.gravity.inFlight = true;
                this._bgSim.stepGravityStars(dt)
                    .then((result) => { this._bgWasm.gravity.pending = result; })
                    .catch((err) => {
                        console.warn('[BackgroundRenderer] Gravity WASM step failed, fallback JS.', err);
                        this._bgWasm.gravity.initialized = false;
                    })
                    .finally(() => { this._bgWasm.gravity.inFlight = false; });
            }
        } else {
            for (let i = 0; i < this.stars.length; i++) {
                const s = this.stars[i];
                s.twinklePhase += dt * s.twinkleSpeed;
            }
        }

        if (this.mode === 'zombie') {
            for (let i = 0; i < this.swarmParticles.length; i++) {
                const p = this.swarmParticles[i];
                // Move toward target
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Add some noise to movement
                const noiseX = Math.sin(this.time * 2 + p.noiseOffset) * 20;
                const noiseY = Math.cos(this.time * 2.5 + p.noiseOffset) * 15;

                if (dist > 5) {
                    p.x += (dx / dist) * p.speed * dt + noiseX * dt;
                    p.y += (dy / dist) * p.speed * dt + noiseY * dt;
                } else {
                    // New random target
                    p.targetX = Math.random() * W;
                    p.targetY = Math.random() * H * 0.58;
                }

                p.flapPhase += dt * p.flapSpeed;
            }

            for (let i = 0; i < this.zombieHands.length; i++) {
                const hand = this.zombieHands[i];
                hand.poseBlend += dt / hand.poseDuration;
                if (hand.poseBlend >= 1) {
                    hand.poseBlend = 0;
                    hand.poseSeq = (hand.poseSeq + (hand.poseStep || 1)) % 10;
                    hand.poseDuration = 1.85 + ((hand.poseSeq % 3) * 0.22) + (hand.twitch - 0.8) * 0.18;
                }
            }
        }

        if (this.mode === 'speed' && this._bgSimEnabled && this._bgWasm.speed.initialized) {
            if (this._bgWasm.speed.pending) {
                const result = this._bgWasm.speed.pending;
                this._bgWasm.speed.pending = null;

                const particles = result.particles;
                const splashes = result.splashes;
                const rainCount = this.rainParticles.length;

                for (let i = 0; i < rainCount; i++) {
                    const p = this.rainParticles[i];
                    const base = i * 8;
                    p.x = particles[base + 0];
                    p.y = particles[base + 1];
                    p._gradient = null;
                }

                for (let i = 0; i < result.splashCount; i++) {
                    this._spawnSplash(splashes[i * 2], splashes[i * 2 + 1]);
                }
            }

            if (!this._bgWasm.speed.inFlight) {
                this._bgWasm.speed.inFlight = true;
                this._bgSim.stepSpeedRain({
                    dt,
                    time: this.time,
                    width: W,
                    height: H,
                    roadY: this.roadY,
                    slant: this._speedRainSlant,
                    speedMul: this._speedRainSpeed,
                })
                    .then((result) => { this._bgWasm.speed.pending = result; })
                    .catch((err) => {
                        console.warn('[BackgroundRenderer] Speed WASM step failed, fallback JS.', err);
                        this._bgWasm.speed.initialized = false;
                    })
                    .finally(() => { this._bgWasm.speed.inFlight = false; });
            }

            // Update splashes even when rain simulation is worker-driven.
            let splashWriteIndex = 0;
            for (let i = 0; i < this._splashes.length; i++) {
                const splash = this._splashes[i];
                splash.r += dt * 75;
                splash.life -= dt * 2.6;
                if (splash.life > 0) {
                    this._splashes[splashWriteIndex++] = splash;
                }
            }
            this._splashes.length = splashWriteIndex;
        } else if (this.mode === 'speed') {
            // v2 rain update — slanted, wobbled
            const slantPx = this._speedRainSlant * 220 * this._speedRainSpeed;
            for (let i = 0; i < this.rainParticles.length; i++) {
                const p = this.rainParticles[i];
                const spd = p.speed * this._speedRainSpeed;
                p.y += spd * dt;
                const prevX = p.x;
                p.x += slantPx * p.slantVar * dt
                    + Math.sin(this.time * p.wobbleFreq + p.wobblePhase) * 0.5;
                if (Math.abs(p.x - prevX) > 0.8) p._gradient = null;
                if (p.x > W + 40) { p.x -= W + 80; p._gradient = null; }
                if (p.x < -40) { p.x += W + 80; p._gradient = null; }
                const maxY = p.maxYf * H;
                if (p.y > maxY) {
                    if (p.y < this.roadY + 30)
                        this._spawnSplash(p.x, this.roadY + Math.random() * 6);
                    p.y = -p.length - Math.random() * 200;
                    p.x = Math.random() * W;
                    p._gradient = null;
                }
            }

            // Update splashes
            let splashWriteIndex = 0;
            for (let i = 0; i < this._splashes.length; i++) {
                const splash = this._splashes[i];
                splash.r += dt * 75;
                splash.life -= dt * 2.6;
                if (splash.life > 0) {
                    this._splashes[splashWriteIndex++] = splash;
                }
            }
            this._splashes.length = splashWriteIndex;
        } else {
            // Legacy rain update (classic/other modes that use rain)
            for (let i = 0; i < this.rainParticles.length; i++) {
                const p = this.rainParticles[i];
                p.y += p.speed * dt;
                const prevX = p.x;
                p.x += Math.sin(this.modePhase * 0.5) * dt * 20
                    + Math.sin(this.modePhase * 1.9) * 2;
                if (Math.abs(p.x - prevX) > 1) p._gradient = null;
                const maxY = p.maxYf !== undefined ? p.maxYf * H : (p.maxY ?? H);
                if (p.y > maxY) {
                    p.y = -p.length - Math.random() * 200;
                    p.x = Math.random() * W;
                    p._gradient = null;
                }
            }
        }

        if (this.cityLights) {
            for (let i = 0; i < this.cityLights.length; i++) {
                const l = this.cityLights[i];
                l.flickerPhase += dt * l.flickerSpeed;
            }
        }

        if (this.lavaVeins) {
            for (let i = 0; i < this.lavaVeins.length; i++) {
                const v = this.lavaVeins[i];
                v.x += v.speed * dt;
                if (v.x - v.width > W) v.x = -v.width;
            }
        }

        for (let i = 0; i < this.debrisParticles.length; i++) {
            const p = this.debrisParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            p.rotation += p.rotSpeed * dt;
            if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
        }

        for (let i = 0; i < this.sparkParticles.length; i++) {
            const p = this.sparkParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt + Math.sin(this.modePhase * 0.9) * 1.6;
            p.life -= dt * 1.8;
            if (p.life <= 0 || p.y > H) {
                p.y = H * 0.4 + Math.random() * H * 0.3;
                p.x = Math.random() * W;
                p.life = 0.7 + Math.random() * 0.3;
                p.temp = Math.random();
            }
        }

        for (let i = 0; i < this.smokeParticles.length; i++) {
            const p = this.smokeParticles[i];
            p.y -= p.speed * dt;
            p.x += p.drift * dt;
            p.alpha -= dt * 0.02;
            p.rotation += p.rotSpeed * dt;
            if (p.alpha <= 0 || p.y < -p.size * 1.5) {
                p.y = H - 10;
                p.x = Math.random() * W;
                p.alpha = 0.12 + Math.random() * 0.1;
            }
        }

        for (let i = 0; i < this.lavaDropParticles.length; i++) {
            const p = this.lavaDropParticles[i];
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > H + 20) {
                p.y = -Math.random() * H;
                p.x = Math.random() * W;
            }
        }
    }

    // ------------------------------------------------------------------
    // RENDER DISPATCH
    // ------------------------------------------------------------------
    _invalidateBackgroundRenderCache() {
        if (this._backgroundRenderCache) {
            this._backgroundRenderCache.dirty = true;
            this._backgroundRenderCache.lastRenderMs = -Infinity;
        }
    }

    _getBackgroundRenderScale(w, h) {
        const pixels = w * h;
        let scale = 1;
        if (pixels > 1800000) {
            scale = 0.72;
        } else if (pixels > 1100000) {
            scale = 0.82;
        } else if (pixels > 700000) {
            scale = 0.90;
        }

        if (this.mode === 'zombie' || this.mode === 'obstacle' || this.mode === 'speed' || this.mode === 'gravity') {
            scale = Math.min(scale, 0.90);
        }

        return Math.max(0.70, Math.min(1, scale));
    }

    _getBackgroundFrameMs() {
        // Redraw rate follows the quality tier: at the top tier backgrounds
        // animate every frame so they don't judder behind a 120 fps foreground.
        const tier = typeof PerfGovernor !== 'undefined' ? PerfGovernor.current : null;
        if (tier && Number.isFinite(tier.bgFps)) {
            return tier.bgFps > 0 ? 1000 / tier.bgFps : 0;
        }
        switch (this.mode) {
            case 'zombie':
            case 'obstacle':
                return 1000 / 24;
            case 'speed':
            case 'gravity':
            case 'classic':
            default:
                return 1000 / 30;
        }
    }

    _renderModeBackground(ctx, w, h) {
        switch (this.mode) {
            case 'classic': this.renderClassic(ctx, w, h); break;
            case 'zombie': this.renderZombie(ctx, w, h); break;
            case 'gravity': this.renderGravity(ctx, w, h); break;
            case 'speed': this.renderSpeed(ctx, w, h); break;
            case 'obstacle': this.renderObstacle(ctx, w, h); break;
            case 'customise': this.renderClassic(ctx, w, h); break;
        }
    }

    _renderCachedBackground(ctx, w, h, applyCustomTone) {
        if (applyCustomTone) return false;

        const cache = this._backgroundRenderCache;
        if (!cache) return false;

        const scale = this._getBackgroundRenderScale(w, h);
        const cacheW = Math.max(1, Math.round(w * scale));
        const cacheH = Math.max(1, Math.round(h * scale));
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const needsResize = !cache.canvas || cache.canvas.width !== cacheW || cache.canvas.height !== cacheH;
        const needsMode = cache.mode !== this.mode || cache.width !== w || cache.height !== h || cache.scale !== scale;
        const needsFrame = now - cache.lastRenderMs >= this._getBackgroundFrameMs();

        if (needsResize) {
            cache.canvas = document.createElement('canvas');
            cache.ctx = cache.canvas.getContext('2d', { alpha: false });
            cache.canvas.width = cacheW;
            cache.canvas.height = cacheH;
            cache.dirty = true;
        }

        if (!cache.ctx || !cache.canvas) return false;

        if (cache.dirty || needsMode || needsFrame) {
            const cctx = cache.ctx;
            cctx.save();
            cctx.setTransform(scale, 0, 0, scale, 0, 0);
            cctx.clearRect(0, 0, w, h);
            this._renderModeBackground(cctx, w, h);
            cctx.restore();

            cache.mode = this.mode;
            cache.width = w;
            cache.height = h;
            cache.scale = scale;
            cache.lastRenderMs = now;
            cache.dirty = false;
        }

        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.drawImage(cache.canvas, 0, 0, w, h);
        ctx.imageSmoothingEnabled = smoothing;
        return true;
    }

    render() {
        const { ctx } = this;
        const w = this.width, h = this.height;
        const game = typeof window !== 'undefined' ? window.game : null;
        const settings = game?.customSettings;
        const applyCustomTone = !!(game && game.gameMode === 'customise' && settings && !settings.previewModeActive);

        if (this._renderCachedBackground(ctx, w, h, applyCustomTone)) {
            // Cached path handled the mode background; dynamic lighting below stays live.
        } else if (applyCustomTone) {
            this._ensureCustomToneBuffers(w, h);
            const baseCtx = this._customToneBaseCtx;
            const toneCtx = this._customToneCtx;
            const baseCanvas = this._customToneBaseCanvas;
            const toneCanvas = this._customToneCanvas;

            if (baseCtx && toneCtx && baseCanvas && toneCanvas) {
                baseCtx.save();
                baseCtx.setTransform(1, 0, 0, 1, 0, 0);
                baseCtx.clearRect(0, 0, w, h);
                this._renderModeBackground(baseCtx, w, h);
                baseCtx.restore();

                toneCtx.save();
                toneCtx.setTransform(1, 0, 0, 1, 0, 0);
                toneCtx.clearRect(0, 0, w, h);
                toneCtx.filter = game.getCustomBackgroundToneFilter();
                toneCtx.drawImage(baseCanvas, 0, 0, w, h);
                toneCtx.restore();

                ctx.drawImage(toneCanvas, 0, 0, w, h);
            }
        } else {
            this._renderModeBackground(ctx, w, h);
        }

        this.renderEnhancedLighting(ctx, w, h);
        if (this.mode === 'speed') this._renderSpeedLightningPass(ctx, w, h);
    }

    _ensureCustomToneBuffers(w, h) {
        if (!this._customToneBaseCanvas || this._customToneBaseCanvas.width !== w || this._customToneBaseCanvas.height !== h) {
            this._customToneBaseCanvas = document.createElement('canvas');
            this._customToneBaseCanvas.width = w;
            this._customToneBaseCanvas.height = h;
            this._customToneBaseCtx = this._customToneBaseCanvas.getContext('2d');
        }

        if (!this._customToneCanvas || this._customToneCanvas.width !== w || this._customToneCanvas.height !== h) {
            this._customToneCanvas = document.createElement('canvas');
            this._customToneCanvas.width = w;
            this._customToneCanvas.height = h;
            this._customToneCtx = this._customToneCanvas.getContext('2d');
        }
    }

    renderCustomiseTint(ctx, w, h) {
        return;
    }

    _renderSpeedLightningPass(ctx, w, h) {
        const strike = this._speedLightning;
        if (!strike?.active || strike.intensity <= 0.01 || strike.mainBolt.length < 2) return;

        const intensity = strike.intensity;
        const darken = Math.max(0, Math.min(0.72, strike.darken));

        const drawBolt = (points, outerWidth, innerWidth, alphaMul = 1) => {
            if (!points || points.length < 2) return;

            const alpha = intensity * alphaMul;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.shadowBlur = 18 + outerWidth * 1.8;
            ctx.shadowColor = `rgba(200,225,255,${(0.50 * alpha).toFixed(3)})`;
            ctx.strokeStyle = `rgba(140,200,255,${(0.36 * alpha).toFixed(3)})`;
            ctx.lineWidth = outerWidth;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(255,255,255,${(0.90 * alpha).toFixed(3)})`;
            ctx.lineWidth = innerWidth;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();
        };

        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${darken.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'screen';

        const skyGlow = ctx.createRadialGradient(
            strike.glowX, strike.glowY, 0,
            strike.glowX, strike.glowY, strike.glowRadius,
        );
        skyGlow.addColorStop(0, `rgba(245,248,255,${(0.18 + intensity * 0.30).toFixed(3)})`);
        skyGlow.addColorStop(0.45, `rgba(140,185,255,${(0.08 + intensity * 0.14).toFixed(3)})`);
        skyGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = skyGlow;
        ctx.fillRect(0, 0, w, Math.min(h, this.roadY + h * 0.08));

        strike.branches.forEach(branch => {
            drawBolt(branch.points, Math.max(1.2, w * 0.0032), Math.max(0.6, w * 0.0012), branch.alpha);
        });
        drawBolt(strike.mainBolt, Math.max(2.8, w * 0.0060), Math.max(1.4, w * 0.0022), 1);

        ctx.restore();
    }

    // ------------------------------------------------------------------
    // ENHANCED LIGHTING
    // ------------------------------------------------------------------
    renderEnhancedLighting(ctx, w, h) {
        if (!this.dynamicLights || this.lightLayers.length === 0) return;

        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'overlay';

        for (const light of this.lightLayers) {
            const pc = light._parsedColor;
            const mul = this.lightIntensityMultiplier;

            if (light.type === 'radial') {
                const pulse = light.pulseSpeed
                    ? 1 + Math.sin(this.time * light.pulseSpeed) * light.pulseMagnitude
                    : 1;
                const radius = light.radius * pulse;
                const grad = ctx.createRadialGradient(
                    light.x, light.y, 0, light.x, light.y, radius,
                );
                if (pc) {
                    const a = pc.a * mul;
                    grad.addColorStop(0, BackgroundRenderer._rgba(pc, a));
                    grad.addColorStop(0.7, BackgroundRenderer._rgba(pc, a * 0.4));
                    grad.addColorStop(1, 'transparent');
                } else {
                    grad.addColorStop(0, light.color);
                    grad.addColorStop(0.7, light.color.replace(/[\d.]+\)$/, '0.4)'));
                    grad.addColorStop(1, 'transparent');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);

            } else if (light.type === 'linear') {
                const grad = ctx.createLinearGradient(
                    light.x1, light.y1, light.x2, light.y2,
                );
                if (light.gradientStops) {
                    light.gradientStops.forEach(([pos, col]) => grad.addColorStop(pos, col));
                } else if (pc) {
                    const a = pc.a * mul;
                    grad.addColorStop(0, BackgroundRenderer._rgba(pc, a));
                    grad.addColorStop(1, 'transparent');
                } else {
                    grad.addColorStop(0, light.color);
                    grad.addColorStop(1, 'transparent');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
            }
        }

        ctx.globalCompositeOperation = prev;
    }

    // ------------------------------------------------------------------
    // SHARED HELPERS
    // ------------------------------------------------------------------
    renderPeripheralLightRigs(ctx, w, h, leftColor, rightColor, intensity = 1) {
        const pulse = 0.8 + Math.sin(this.time * 1.35) * 0.2;
        const alphaMul = intensity * pulse * this.lightIntensityMultiplier;
        const prev = ctx.globalCompositeOperation;

        ctx.globalCompositeOperation = 'screen';

        const leftRig = ctx.createRadialGradient(-w * 0.08, h * 0.55, 0, -w * 0.08, h * 0.55, w * 0.55);
        leftRig.addColorStop(0, leftColor.replace('ALPHA', (0.24 * alphaMul).toFixed(3)));
        leftRig.addColorStop(0.35, leftColor.replace('ALPHA', (0.14 * alphaMul).toFixed(3)));
        leftRig.addColorStop(1, 'transparent');
        ctx.fillStyle = leftRig;
        ctx.fillRect(0, 0, w, h);

        const rightRig = ctx.createRadialGradient(w * 1.08, h * 0.45, 0, w * 1.08, h * 0.45, w * 0.55);
        rightRig.addColorStop(0, rightColor.replace('ALPHA', (0.24 * alphaMul).toFixed(3)));
        rightRig.addColorStop(0.35, rightColor.replace('ALPHA', (0.14 * alphaMul).toFixed(3)));
        rightRig.addColorStop(1, 'transparent');
        ctx.fillStyle = rightRig;
        ctx.fillRect(0, 0, w, h);

        const kicker = ctx.createLinearGradient(0, 0, 0, h * 0.35);
        kicker.addColorStop(0, `rgba(255,255,255,${(0.045 * alphaMul).toFixed(3)})`);
        kicker.addColorStop(1, 'transparent');
        ctx.fillStyle = kicker;
        ctx.fillRect(0, 0, w, h * 0.35);

        ctx.globalCompositeOperation = prev;
    }

    applyGameplayVisibilityPass(ctx, w, h, centerLift = 0.07, edgeDim = 0.26) {
        const sideMask = ctx.createLinearGradient(0, 0, w, 0);
        sideMask.addColorStop(0, `rgba(0,0,0,${edgeDim.toFixed(3)})`);
        sideMask.addColorStop(0.22, 'rgba(0,0,0,0.10)');
        sideMask.addColorStop(0.42, 'rgba(0,0,0,0.00)');
        sideMask.addColorStop(0.58, 'rgba(0,0,0,0.00)');
        sideMask.addColorStop(0.78, 'rgba(0,0,0,0.10)');
        sideMask.addColorStop(1, `rgba(0,0,0,${edgeDim.toFixed(3)})`);
        ctx.fillStyle = sideMask;
        ctx.fillRect(0, 0, w, h);

        const center = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, Math.min(w, h) * 0.52);
        center.addColorStop(0, `rgba(255,255,255,${centerLift.toFixed(3)})`);
        center.addColorStop(0.45, `rgba(255,255,255,${(centerLift * 0.35).toFixed(3)})`);
        center.addColorStop(1, 'transparent');
        ctx.fillStyle = center;
        ctx.fillRect(0, 0, w, h);
    }

    // ------------------------------------------------------------------
    // CLASSIC
    // ------------------------------------------------------------------
    renderClassic(ctx, w, h) {
        this._renderSynthwaveBackground(ctx, w, h);
    }

    _renderSynthwaveBackground(ctx, w, h) {
        const horizonY = h * (0.52 + Math.sin(this.modePhase * 1.1) * 0.004);
        const bloomPulse = 0.9 + Math.sin(this.modePhase * 2.2) * 0.10;
        const baseHue = 270 + this.skyHueShift;

        // ── 1. SKY ────────────────────────────────────────────────────────────
        const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
        sky.addColorStop(0, `hsl(${baseHue.toFixed(1)},30%,4%)`);
        sky.addColorStop(0.25, `hsl(${(baseHue + 5).toFixed(1)},35%,8%)`);
        sky.addColorStop(0.55, `hsl(${(baseHue + 18).toFixed(1)},42%,15%)`);
        sky.addColorStop(0.8, `hsl(${(baseHue + 30).toFixed(1)},48%,20%)`);
        sky.addColorStop(1, `hsl(${(baseHue + 40).toFixed(1)},40%,16%)`);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizonY + 1);

        // ── 2. STARS ──────────────────────────────────────────────────────────
        if (areParticleEffectsEnabled()) {
            for (let i = 0; i < this.dustParticles.length; i++) {
                const p = this.dustParticles[i];
                if (p.y >= horizonY) continue;
                // Re-use dustParticles as stars — treat hue 290 as cold, 195 as warm
                const tw = (Math.sin(this.time * (p.speed * 0.4) + p.x) + 1) / 2;
                const a = p.alpha * (0.35 + tw * 0.65);
                const sz = p.size * (0.65 + tw * 0.35);
                const hue = p.hue === 290 ? 210 : 50;
                ctx.fillStyle = `hsla(${hue},90%,90%,${a})`;
                ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
                if (p.size > 1.2) {
                    ctx.fillStyle = `hsla(${hue},80%,80%,${(a * 0.22).toFixed(3)})`;
                    const haloSz = sz * 3.5;
                    ctx.fillRect(p.x - haloSz * 0.5, p.y - 0.6, haloSz, 1.2);
                    ctx.fillRect(p.x - 0.6, p.y - haloSz * 0.5, 1.2, haloSz);
                }
            }
        }

        // ── 3. SUN ────────────────────────────────────────────────────────────
        const sunCX = w * 0.5 + Math.sin(this.modePhase * 0.3) * w * 0.012;
        const sunCY = horizonY * 0.74;
        const sunR = Math.min(w, h) * 0.072;

        // Outer glow halo
        {
            const halo = ctx.createRadialGradient(sunCX, sunCY, 0, sunCX, sunCY, sunR * 3.2);
            halo.addColorStop(0, `rgba(255,180,80,${(0.22 * bloomPulse).toFixed(4)})`);
            halo.addColorStop(0.28, `rgba(255,80,180,${(0.14 * bloomPulse).toFixed(4)})`);
            halo.addColorStop(0.6, `rgba(180,30,255,${(0.06 * bloomPulse).toFixed(4)})`);
            halo.addColorStop(1, 'transparent');
            ctx.fillStyle = halo;
            ctx.fillRect(sunCX - sunR * 3.5, sunCY - sunR * 3.5, sunR * 7, sunR * 7);
        }

        // Sun disc — drawn on offscreen canvas to use destination-out stripe clipping
        {
            const side = Math.ceil(sunR * 2 + 4);
            const ox = Math.round(sunCX - sunR);
            const oy = Math.round(sunCY - sunR);

            if (!this._sunCanvas || this._sunCanvas._sunR !== sunR) {
                const sc = document.createElement('canvas');
                sc.width = side;
                sc.height = side;
                const sctx = sc.getContext('2d');
                const half = side * 0.5;

                // Gradient disc
                sctx.beginPath();
                sctx.arc(half, half, sunR, 0, Math.PI * 2);
                const sunFill = sctx.createLinearGradient(0, 0, 0, side);
                sunFill.addColorStop(0, '#ffde80');
                sunFill.addColorStop(0.35, '#ff8c30');
                sunFill.addColorStop(0.72, '#e8206a');
                sunFill.addColorStop(1, '#c00060');
                sctx.fillStyle = sunFill;
                sctx.fill();

                // Stripe cutouts via destination-out
                sctx.globalCompositeOperation = 'destination-out';
                const stripeCount = 7;
                const totalH = sunR * 2;
                const gapFrac = 0.32; // fraction of each band that is transparent
                const bandH = totalH / stripeCount;
                const gapH = bandH * gapFrac;
                for (let s = 1; s < stripeCount; s++) {
                    const sy = half - sunR + s * bandH - gapH * 0.5;
                    sctx.fillStyle = 'rgba(0,0,0,1)';
                    sctx.fillRect(0, sy, side, gapH);
                }

                sc._sunR = sunR;
                this._sunCanvas = sc;
            }

            ctx.drawImage(this._sunCanvas, ox, oy, side, side);

            // Screen-blend rim on the disc
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
            ctx.clip();
            const rim = ctx.createLinearGradient(sunCX - sunR, sunCY - sunR, sunCX + sunR, sunCY + sunR);
            rim.addColorStop(0, `rgba(255,255,200,${0.18 * bloomPulse})`);
            rim.addColorStop(0.5, 'transparent');
            rim.addColorStop(1, 'transparent');
            ctx.fillStyle = rim;
            ctx.fillRect(sunCX - sunR, sunCY - sunR, sunR * 2, sunR * 2);
            ctx.restore();
        }

        // ── 4. HORIZON BLOOM ─────────────────────────────────────────────────
        {
            const bloom = ctx.createLinearGradient(0, horizonY - 55, 0, horizonY + 30);
            bloom.addColorStop(0, 'transparent');
            bloom.addColorStop(0.28, `rgba(255,140,20,${0.18 * bloomPulse})`);
            bloom.addColorStop(0.58, `rgba(255,40,170,${0.26 * bloomPulse})`);
            bloom.addColorStop(1, 'transparent');
            ctx.fillStyle = bloom;
            ctx.fillRect(0, horizonY - 55, w, 85);
        }

        // ── 5. MOUNTAIN SILHOUETTES ───────────────────────────────────────────
        // Far layer — lighter purple
        {
            ctx.save();
            ctx.beginPath();
            const farPts = [
                [0, horizonY + 14],
                [w * 0.06, horizonY - 52],
                [w * 0.15, horizonY - 18],
                [w * 0.24, horizonY - 82],
                [w * 0.33, horizonY - 38],
                [w * 0.42, horizonY - 105],
                [w * 0.50, horizonY - 60],
                [w * 0.58, horizonY - 118],
                [w * 0.66, horizonY - 44],
                [w * 0.75, horizonY - 88],
                [w * 0.83, horizonY - 28],
                [w * 0.91, horizonY - 66],
                [w, horizonY + 10],
                [w, horizonY + 30],
                [0, horizonY + 30],
            ];
            ctx.moveTo(farPts[0][0], farPts[0][1]);
            for (let i = 1; i < farPts.length; i++) ctx.lineTo(farPts[i][0], farPts[i][1]);
            ctx.closePath();
            ctx.fillStyle = '#1c0a38';
            ctx.globalAlpha = 0.88;
            ctx.fill();
            ctx.restore();
        }

        // Near layer — dark purple-black + neon rim
        {
            const nearPts = [
                [0, horizonY + 22],
                [w * 0.04, horizonY - 20],
                [w * 0.12, horizonY + 4],
                [w * 0.21, horizonY - 58],
                [w * 0.29, horizonY - 14],
                [w * 0.38, horizonY - 76],
                [w * 0.46, horizonY - 28],
                [w * 0.54, horizonY - 94],
                [w * 0.62, horizonY - 36],
                [w * 0.70, horizonY - 62],
                [w * 0.79, horizonY - 8],
                [w * 0.87, horizonY - 48],
                [w * 0.94, horizonY + 2],
                [w, horizonY + 20],
                [w, horizonY + 38],
                [0, horizonY + 38],
            ];

            const buildPath = () => {
                ctx.beginPath();
                ctx.moveTo(nearPts[0][0], nearPts[0][1]);
                for (let i = 1; i < nearPts.length; i++) ctx.lineTo(nearPts[i][0], nearPts[i][1]);
                ctx.closePath();
            };

            ctx.save();
            buildPath();
            ctx.fillStyle = '#0d0420';
            ctx.fill();

            // Neon rim along mountain ridgeline — screen blend
            ctx.globalCompositeOperation = 'screen';
            buildPath();
            const rimGrad = ctx.createLinearGradient(0, horizonY - 94, 0, horizonY + 10);
            rimGrad.addColorStop(0, `rgba(255,60,210,${0.30 * bloomPulse})`);
            rimGrad.addColorStop(0.35, `rgba(200,30,255,${0.12 * bloomPulse})`);
            rimGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = rimGrad;
            ctx.fill();
            ctx.restore();
        }

        // ── 6. GROUND — dark base ─────────────────────────────────────────────
        const ground = ctx.createLinearGradient(0, horizonY, 0, h);
        ground.addColorStop(0, `hsl(${(baseHue + 36).toFixed(1)},28%,7%)`);
        ground.addColorStop(0.4, `hsl(${(baseHue + 32).toFixed(1)},24%,5%)`);
        ground.addColorStop(1, `hsl(${(baseHue + 28).toFixed(1)},20%,3%)`);
        ctx.fillStyle = ground;
        ctx.fillRect(0, horizonY, w, h - horizonY);

        // ── 7. PERSPECTIVE GRID ───────────────────────────────────────────────
        {
            const lines = 22;
            const gridShift = this.gridOffset % ((h - horizonY) / lines);
            for (let i = 0; i < lines; i++) {
                const t = i / lines;
                let y = horizonY + Math.pow(t, 1.55) * (h - horizonY) + gridShift;
                if (y > h) y -= (h - horizonY);
                ctx.strokeStyle = `rgba(0,215,255,${Math.pow(t, 0.38) * 0.55})`;
                ctx.lineWidth = t > 0.78 ? 1.6 : 0.9;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }

            const vx = w * 0.5 + Math.sin(this.modePhase * 0.4) * w * 0.006;
            const cols = 22;
            for (let i = -cols; i <= cols; i++) {
                const sway = Math.sin(this.modePhase + i * 0.14) * 5;
                const bx = vx + i * (w / (cols * 1.9)) + sway;
                const dist = Math.abs(i) / cols;
                ctx.strokeStyle = `rgba(0,215,255,${0.16 - dist * 0.09})`;
                ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(vx, horizonY); ctx.lineTo(bx, h); ctx.stroke();
            }
        }

        // ── 8. GROUND GLOW ────────────────────────────────────────────────────
        {
            const gGlow = ctx.createLinearGradient(0, h - 90, 0, h);
            gGlow.addColorStop(0, 'transparent');
            gGlow.addColorStop(0.38, `rgba(255,0,175,${0.24 * bloomPulse})`);
            gGlow.addColorStop(1, `rgba(210,0,135,${0.42 * bloomPulse})`);
            ctx.fillStyle = gGlow;
            ctx.fillRect(0, h - 90, w, 90);
        }

        // ── 9. DUST PARTICLES (only below horizon — above handled as stars) ───
        if (areParticleEffectsEnabled()) {
            this.dustParticles.forEach(p => {
                if (p.y < horizonY) return;
                ctx.fillStyle = `hsla(${p.hue},100%,70%,${p.alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // ── 10. SCANLINES ─────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.032)';
        let startY = -(this.scanlineOffset % 3);
        for (let y = startY; y < h; y += 3) ctx.fillRect(0, y, w, 1);

        // ── 11. VIGNETTES & PERIPHERAL RIGS ──────────────────────────────────
        const topVig = ctx.createLinearGradient(0, 0, 0, h * 0.22);
        topVig.addColorStop(0, 'rgba(0,0,0,0.68)');
        topVig.addColorStop(1, 'transparent');
        ctx.fillStyle = topVig;
        ctx.fillRect(0, 0, w, h * 0.22);

        this.renderPeripheralLightRigs(ctx, w, h,
            'rgba(255,60,220,ALPHA)', 'rgba(20,225,255,ALPHA)', 1.15);
        this.applyGameplayVisibilityPass(ctx, w, h, 0.075, 0.22);
    }

    // ------------------------------------------------------------------
    // ZOMBIE
    // ------------------------------------------------------------------
    _ensureZombieStaticLayer(w, h, groundY) {
        if (!this._zombieStaticCanvas ||
            this._zombieStaticCanvas.width !== w ||
            this._zombieStaticCanvas.height !== h) {
            this._zombieStaticCanvas = document.createElement('canvas');
            this._zombieStaticCanvas.width = w;
            this._zombieStaticCanvas.height = h;
            this._zombieStaticCtx = this._zombieStaticCanvas.getContext('2d');
            this._zombieStaticInitialized = false;
        } else if (this._zombieStaticInitialized) {
            return this._zombieStaticCanvas;
        }

        const zctx = this._zombieStaticCtx;
        if (!zctx) return null;
        const horizonY = h * 0.68;

        zctx.clearRect(0, 0, w, h);

        const sky = zctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#020301');
        sky.addColorStop(0.18, '#060804');
        sky.addColorStop(0.52, '#0f0d09');
        sky.addColorStop(0.76, '#14100c');
        sky.addColorStop(1, '#0c0a07');
        zctx.fillStyle = sky;
        zctx.fillRect(0, 0, w, h);

        // ── Draw Moon in static layer ──
        const moonX = w * 0.72;
        const moonY = h * 0.18;
        const moonRadius = Math.min(w, h) * 0.06;
        zctx.fillStyle = '#e8e8d8';
        zctx.beginPath();
        zctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        zctx.fill();

        const moonGlow = zctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, Math.min(w, h) * 0.42);
        moonGlow.addColorStop(0, 'rgba(185,210,160,0.22)');
        moonGlow.addColorStop(0.25, 'rgba(148,166,125,0.12)');
        moonGlow.addColorStop(0.65, 'rgba(90,110,68,0.05)');
        moonGlow.addColorStop(1, 'transparent');
        zctx.fillStyle = moonGlow;
        zctx.fillRect(0, 0, w, h);

        const horizonGlow = zctx.createLinearGradient(0, horizonY - h * 0.08, 0, groundY + h * 0.08);
        horizonGlow.addColorStop(0, 'transparent');
        horizonGlow.addColorStop(0.4, 'rgba(50,66,36,0.14)');
        horizonGlow.addColorStop(0.7, 'rgba(48,32,14,0.18)');
        horizonGlow.addColorStop(1, 'rgba(15,10,5,0.35)');
        zctx.fillStyle = horizonGlow;
        zctx.fillRect(0, horizonY - h * 0.12, w, h - horizonY + h * 0.12);

        const soil = zctx.createLinearGradient(0, groundY - 24, 0, h);
        soil.addColorStop(0, 'rgba(30,22,12,0.65)');
        soil.addColorStop(0.18, 'rgba(42,30,16,0.92)');
        soil.addColorStop(0.65, '#181008');
        soil.addColorStop(1, '#0b0805');
        zctx.fillStyle = soil;
        zctx.fillRect(0, groundY - 24, w, h - groundY + 24);

        zctx.fillStyle = 'rgba(8,6,4,0.98)';
        zctx.beginPath();
        zctx.moveTo(0, horizonY + 12);
        zctx.quadraticCurveTo(w * 0.18, horizonY - 22, w * 0.34, horizonY + 6);
        zctx.quadraticCurveTo(w * 0.48, horizonY + 22, w * 0.64, horizonY - 10);
        zctx.quadraticCurveTo(w * 0.82, horizonY - 34, w, horizonY + 18);
        zctx.lineTo(w, h);
        zctx.lineTo(0, h);
        zctx.closePath();
        zctx.fill();

        // Front Fog
        const frontFog = zctx.createLinearGradient(0, groundY - 18, 0, h);
        frontFog.addColorStop(0, 'rgba(120,140,90,0)');
        frontFog.addColorStop(0.24, 'rgba(84,102,60,0.07)');
        frontFog.addColorStop(0.55, 'rgba(36,30,18,0.10)');
        frontFog.addColorStop(1, 'rgba(10,8,6,0.26)');
        zctx.fillStyle = frontFog;
        zctx.fillRect(0, groundY - 18, w, h - groundY + 18);

        // Vignette
        const vig = zctx.createRadialGradient(w / 2, h / 2, h * 0.22, w / 2, h / 2, h * 0.92);
        vig.addColorStop(0, 'transparent');
        vig.addColorStop(1, 'rgba(0,0,0,0.82)');
        zctx.fillStyle = vig;
        zctx.fillRect(0, 0, w, h);

        // Top Black gradient
        const topBlack = zctx.createLinearGradient(0, 0, 0, h * 0.34);
        topBlack.addColorStop(0, 'rgba(0,0,0,0.85)');
        topBlack.addColorStop(0.7, 'rgba(0,0,0,0.3)');
        topBlack.addColorStop(1, 'transparent');
        zctx.fillStyle = topBlack;
        zctx.fillRect(0, 0, w, h * 0.34);

        // Static tree silhouettes
        zctx.save();
        zctx.strokeStyle = 'rgba(20,16,10,0.95)';
        zctx.lineWidth = 1.6;
        const treeX = [0.05, 0.11, 0.18, 0.26, 0.33, 0.41, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 0.96];
        for (let i = 0; i < treeX.length; i++) {
            const x = treeX[i] * w;
            const baseY = horizonY + 12 + (i % 3) * 4;
            const hMul = 0.75 + (i % 5) * 0.08;
            const trunkH = 38 * hMul;
            const sway = (i % 2 === 0 ? -1 : 1) * (3 + (i % 4));

            zctx.beginPath();
            zctx.moveTo(x, baseY + 28);
            zctx.lineTo(x + sway, baseY - trunkH);
            zctx.stroke();

            zctx.beginPath();
            zctx.moveTo(x + sway * 0.2, baseY - trunkH * 0.66);
            zctx.lineTo(x - 12, baseY - trunkH * 0.88);
            zctx.moveTo(x + sway * 0.2, baseY - trunkH * 0.62);
            zctx.lineTo(x + 10, baseY - trunkH * 0.82);
            zctx.moveTo(x + sway * 0.25, baseY - trunkH * 0.45);
            zctx.lineTo(x - 8, baseY - trunkH * 0.58);
            zctx.stroke();
        }

        // Static ground bumps
        for (let i = 0; i < 8; i++) {
            const x = (i * 0.125 + 0.05) * w;
            const y = groundY + (i % 2 === 0 ? 4 : -2);
            const size = 6 + (i % 3) * 2;
            const clump = zctx.createRadialGradient(x, y, 0, x, y, size);
            clump.addColorStop(0, 'rgba(25,18,10,0.25)');
            clump.addColorStop(1, 'transparent');
            zctx.fillStyle = clump;
            zctx.beginPath();
            zctx.arc(x, y, size, 0, Math.PI * 2);
            zctx.fill();
        }

        zctx.restore();
        this._zombieStaticInitialized = true;
        return this._zombieStaticCanvas;
    }

    renderZombie(ctx, w, h) {
        const groundY = h * 0.90;
        const staticLayer = this._ensureZombieStaticLayer(w, h, groundY);
        if (staticLayer) ctx.drawImage(staticLayer, 0, 0);

        // Moon coordinates for lighting (subtle movement)
        const moonX = w * (0.72 + Math.sin(this.time * 0.06) * 0.012);
        const moonY = h * (0.18 + Math.sin(this.time * 0.05) * 0.008);

        if (areParticleEffectsEnabled()) {
            for (let i = 0; i < this.fogParticles.length; i++) {
                const p = this.fogParticles[i];
                if (!p.sprite) p.sprite = this._buildZombieFogSprite(p);
                if (!p.sprite) continue;
                ctx.drawImage(p.sprite, p.x - p.sprite.width * 0.5, p.y - p.sprite.height * 0.5);
            }
        }

        // Simplified ground line
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = 'rgba(20,14,8,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(w, groundY);
        ctx.stroke();
        ctx.restore();

        // Simple cracks (reduced count and complexity)
        ctx.save();
        ctx.strokeStyle = 'rgba(12,8,4,0.4)';
        ctx.lineCap = 'round';
        for (let i = 0; i < this.zombieCracks.length; i++) {
            const crack = this.zombieCracks[i];
            let x = crack.xf * w;
            let y = groundY - 2 + crack.yOff * h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let step = 1; step <= 2; step++) {
                x += Math.sin(crack.phase + this.time * 0.12 + step * 0.9) * crack.spread * 0.35;
                y += crack.length * h * 0.15;
                ctx.lineTo(x, y);
            }
            ctx.globalAlpha = crack.alpha * 0.8;
            ctx.lineWidth = crack.width;
            ctx.stroke();
        }
        ctx.restore();

        const hands = this._zombieHandsByScale.length ? this._zombieHandsByScale : this.zombieHands;
        const handsToDraw = hands;

        // 1. Draw Mounds First
        handsToDraw.forEach(hand => this._renderZombieHandMound(ctx, hand, w, h, groundY));

        // 2. Draw Hands (Clipped to groundY)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, groundY + 4);
        ctx.clip();
        handsToDraw.forEach(hand => this._renderZombieHand(ctx, hand, w, h, groundY, moonX, moonY));
        ctx.restore();

        this.renderPeripheralLightRigs(ctx, w, h,
            'rgba(70,90,50,ALPHA)', 'rgba(100,110,80,ALPHA)', 0.45);
        this.applyGameplayVisibilityPass(ctx, w, h, 0.05, 0.4);
    }

    _degToRad(deg) {
        return deg * Math.PI / 180;
    }

    _getZombieHandState(hand, w, h, groundY) {
        const scale = hand.scale * Math.min(w, h) / 820;
        const emerge = Math.max(0.38, Math.min(0.98,
            hand.riseBase + Math.sin(this.time * hand.riseSpeed + hand.poseOffset) * hand.riseAmp,
        ));

        // More dynamic drift and bob for expressive movement
        const driftPhase = this.time * 0.15 + hand.poseOffset;
        const bobPhase = this.time * hand.bobSpeed + hand.bobOffset;
        const secondaryWiggle = Math.sin(this.time * 1.3 + hand.poseOffset) * hand.drift * 0.5;

        return {
            scale,
            emerge,
            x: hand.xf * w + Math.sin(driftPhase) * hand.drift + secondaryWiggle,
            y: groundY + 24 * scale
                - emerge * (118 + hand.scale * 14) * scale
                + Math.sin(bobPhase) * (6 + emerge * 5) * scale
                + Math.cos(bobPhase * 0.7) * 2 * scale,
            rot: hand.rotOffset
                + Math.sin(this.time * hand.bobSpeed * 0.7 + hand.poseOffset) * 4.5
                + Math.sin(this.time * 0.42 + hand.poseOffset) * 2.8,
        };
    }

    _getZombieHandPose(hand) {
        const poses = [
            { fi: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], th: [-5, 8] },           // Relaxed
            { fi: [[-8, -2, -1], [-5, -1, 0], [-4, -2, -1], [-3, 0, 0]], th: [-12, 3] },         // Tensing
            { fi: [[8, 30, 18], [6, 25, 15], [7, 28, 16], [9, 22, 14]], th: [5, 25] },          // Clawing
            { fi: [[2, 2, 2], [8, 55, 34], [9, 52, 32], [10, 50, 30]], th: [6, 20] },          // Grasping
            { fi: [[10, 45, 28], [8, 50, 30], [9, 48, 30], [11, 44, 28]], th: [10, 30] },         // Full grip
            { fi: [[6, 15, 10], [4, 12, 7], [5, 14, 8], [7, 16, 10]], th: [2, 18] },          // Releasing
            { fi: [[12, 44, 27], [10, 47, 29], [11, 45, 28], [13, 41, 25]], th: [14, 34] },         // Hooking
            { fi: [[-14, 2, 0], [-11, 1, -1], [-9, 0, -1], [-7, -1, 0]], th: [-16, 10] },        // Scraping
            { fi: [[4, 20, 11], [7, 28, 17], [8, 30, 18], [9, 26, 16]], th: [8, 23] },          // Prying
            { fi: [[14, 58, 36], [12, 54, 34], [13, 56, 35], [15, 52, 33]], th: [16, 28] },         // Snatching
        ];
        const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const idx = hand.poseSeq % order.length;
        const from = poses[order[idx]];
        const to = poses[order[(idx + 1) % order.length]];

        // Smoother easing for pose transitions
        const rawBlend = Math.min(1, hand.poseBlend);
        const blend = 0.5 - Math.cos(rawBlend * Math.PI) * 0.5;

        const fingers = from.fi.map((finger, i) => finger.map((angle, joint) => {
            const microTwitch = Math.sin(this.time * (1.25 + i * 0.15) + hand.poseOffset + joint * 0.9) * hand.twitch;
            const secondaryTwitch = Math.sin(this.time * 0.65 + hand.poseOffset) * hand.twitch * 0.4;
            const amp = joint === 0 ? 1.8 : (joint === 1 ? 2.4 : 1.6);
            return angle + (to.fi[i][joint] - angle) * blend + (microTwitch + secondaryTwitch) * amp;
        }));

        const thumb = from.th.map((angle, i) => {
            const microTwitch = Math.sin(this.time * 1.05 + hand.poseOffset + i * 0.8) * hand.twitch;
            const secondaryTwitch = Math.sin(this.time * 0.78 + hand.poseOffset + i * 0.3) * hand.twitch * 0.5;
            return angle + (to.th[i] - angle) * blend + (microTwitch + secondaryTwitch) * (i === 0 ? 1.5 : 2.1);
        });

        return {
            fingers,
            thumb,
            splay: Math.sin(this.time * 0.52 + hand.poseOffset) * (0.08 + hand.splayAmp)
                + Math.sin(this.time * 0.35 + hand.poseOffset) * (0.04 + hand.splayAmp * 0.5),
        };
    }

    _renderZombieHand(ctx, hand, w, h, groundY, lightX, lightY) {
        const fingerDefs = [
            { ox: -37, oy: 2, ang: -8, pl: 60, ml: 40, dl: 30, pw: 14, mw: 12, dw: 10, nw: 9 },
            { ox: -12, oy: -4, ang: -1, pl: 67, ml: 44, dl: 33, pw: 16, mw: 14, dw: 12, nw: 10 },
            { ox: 13, oy: -2, ang: 5, pl: 62, ml: 41, dl: 31, pw: 14, mw: 12, dw: 10, nw: 9 },
            { ox: 36, oy: 9, ang: 13, pl: 44, ml: 29, dl: 22, pw: 11, mw: 9, dw: 7.5, nw: 7 },
        ];
        const state = this._getZombieHandState(hand, w, h, groundY);
        const pose = this._getZombieHandPose(hand);
        const lightAngle = Math.atan2(lightY - state.y, lightX - state.x);

        // Animated shadow
        ctx.save();
        const shadowIntensity = 0.15 + hand.scale * 0.05 + Math.sin(this.time * 2 + hand.poseOffset) * 0.03;
        ctx.fillStyle = `rgba(0,0,0,${shadowIntensity.toFixed(3)})`;
        ctx.beginPath();
        const shadowScale = 1 + Math.sin(this.time * 1.8 + hand.poseOffset) * 0.15;
        ctx.ellipse(state.x, groundY + 15, (24 + hand.scale * 18) * shadowScale, (8 + hand.scale * 6) * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(state.x, state.y);
        ctx.scale(state.scale, state.scale);
        ctx.rotate(this._degToRad(state.rot));
        ctx.globalAlpha = Math.min(1, 0.48 + state.emerge * 0.78);

        this._drawZombieWrist(ctx, lightAngle);
        this._drawZombieThumb(ctx, pose.thumb, lightAngle);
        this._drawZombiePalm(ctx, pose.splay, lightAngle);
        fingerDefs.forEach((def, i) => {
            this._drawZombieFinger(ctx, def, pose.fingers[i], lightAngle, i === 1);
        });

        // Subtle glow that pulses with emergence
        if (hand.detail > 1.05) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const glowAmount = 0.08 + (hand.detail - 1) * 0.12 + Math.sin(this.time * 3) * 0.06;
            ctx.globalAlpha = Math.min(0.28, glowAmount * state.emerge);
            ctx.shadowColor = 'rgba(180,225,255,0.3)';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = 'rgba(180,225,255,0.3)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(0, -40, 40 * state.scale, 72 * state.scale, -0.14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    _renderZombieHandMound(ctx, hand, w, h, groundY) {
        const state = this._getZombieHandState(hand, w, h, groundY);
        const moundW = (58 + hand.scale * 32) * state.scale;
        const moundH = (18 + hand.scale * 10) * state.scale;

        ctx.save();

        // 1. Hole / Depletion (Deep Dark Center) - Animated breathing
        const holeBreath = Math.sin(this.time * 0.8 + hand.poseOffset) * 0.08 + 1;
        const holeG = ctx.createRadialGradient(state.x, groundY + 2, 0, state.x, groundY + 2, moundW * 0.45 * holeBreath);
        holeG.addColorStop(0, '#050402');
        holeG.addColorStop(1, 'rgba(10,8,6,0)');
        ctx.fillStyle = holeG;
        ctx.beginPath();
        ctx.ellipse(state.x, groundY + 2, moundW * 0.45 * holeBreath, moundH * 0.35 * holeBreath, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Dirt Mound (Raised Soil) - Dynamic settling
        const settleAmount = Math.max(0, Math.sin(this.time * 1.2 + hand.poseOffset) * 0.05);
        const grad = ctx.createRadialGradient(state.x, groundY + 4 + settleAmount, 0, state.x, groundY + 6 + settleAmount, moundW);
        grad.addColorStop(0, 'rgba(48,36,22,0.95)');
        grad.addColorStop(0.4, 'rgba(32,22,14,0.98)');
        grad.addColorStop(0.75, 'rgba(22,14,9,0.4)');
        grad.addColorStop(1, 'rgba(12,8,4,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(state.x, groundY + 6 + settleAmount, moundW, moundH, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3. Debris Pieces (Physicality) - Animated tumbling
        ctx.fillStyle = 'rgba(18,12,8,0.85)';
        for (let j = 0; j < 10; j++) {
            const tension = 0.85 + Math.sin(this.time * 0.4 + j * 0.3 + hand.poseOffset) * 0.2;
            const ang = j * (Math.PI / 5) + state.x * 0.08 + this.time * 0.15;
            const rx = state.x + Math.cos(ang) * moundW * 0.42 * tension;
            const ry = groundY + 4 + Math.sin(ang) * moundH * 0.32;
            const tumble = Math.sin(this.time * 2.5 + j) * 0.5;
            ctx.save();
            ctx.translate(rx, ry);
            ctx.rotate(tumble);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(3 + (j % 2), -4 - (j % 2));
            ctx.lineTo(6 + (j % 3), 1 - (j % 3));
            ctx.fill();
            ctx.restore();
        }

        // Additional soil sparkle for high detail
        if (hand.detail > 1.15) {
            ctx.fillStyle = 'rgba(160,120,72,0.25)';
            for (let j = 0; j < 4; j++) {
                const sparkPhase = Math.sin(this.time * 1.8 + j * 0.7) * 0.5 + 0.5;
                const rx = state.x + (Math.cos(this.time * 0.4 + j) - 0.5) * moundW * 0.65;
                const ry = groundY + 2 + (Math.sin(this.time * 0.6 + j) * 0.5 + 0.5) * moundH * 0.18;
                const rw = 2 + Math.random() * 3;
                const rh = 1 + Math.random() * 2;
                ctx.fillRect(rx, ry, rw, rh);
            }
        }

        ctx.strokeStyle = 'rgba(12,8,4,0.35)';
        ctx.lineWidth = Math.max(0.6, 1.0 * state.scale);
        for (let i = 0; i < 4; i++) {
            const dir = i - 1.5;
            ctx.beginPath();
            ctx.moveTo(state.x + dir * moundW * 0.12, groundY + 1);
            ctx.quadraticCurveTo(
                state.x + dir * moundW * 0.5,
                groundY + moundH * (0.3 + i * 0.1),
                state.x + dir * moundW * 0.85,
                groundY + moundH * (0.7 + i * 0.05),
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawZombiePalm(ctx, splay, lightAngle) {
        const pw = 114, ph = 102, hw = pw / 2, hwb = pw * 0.42, topY = -ph, botY = 0;
        const sOff = splay * 5;
        const palmPath = () => {
            ctx.beginPath();
            ctx.moveTo(-hwb, botY);
            ctx.bezierCurveTo(-hwb - 5, botY - ph * 0.22, -hw - sOff, topY + ph * 0.28, -hw - sOff, topY);
            ctx.bezierCurveTo(-hw * 0.28 - sOff, topY - 4, hw * 0.28 + sOff, topY - 4, hw + sOff, topY);
            ctx.bezierCurveTo(hw + sOff, topY + ph * 0.28, hwb + 3, botY - ph * 0.22, hwb, botY);
            ctx.closePath();
        };

        palmPath();
        const base = ctx.createLinearGradient(-hw, botY, hw, botY);
        base.addColorStop(0, '#3a4a26');
        base.addColorStop(0.35, '#253018');
        base.addColorStop(0.7, '#18240f');
        base.addColorStop(1, '#121a0a');
        ctx.fillStyle = base;
        ctx.fill();

        palmPath();
        const shade = ctx.createLinearGradient(0, topY, 0, botY);
        shade.addColorStop(0, 'rgba(80,110,48,0.12)');
        shade.addColorStop(0.4, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = shade;
        ctx.fill();

        const lx = Math.cos(lightAngle) * hw * 0.95;
        const ly = Math.sin(lightAngle) * ph * 0.55;
        palmPath();
        const glow = ctx.createRadialGradient(lx, ly + topY, 0, lx, ly + topY, hw * 1.5);
        glow.addColorStop(0, 'rgba(180,215,255,0.22)');
        glow.addColorStop(0.4, 'rgba(60,110,180,0.06)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fill();

        palmPath();
        ctx.strokeStyle = 'rgba(5,8,2,0.85)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // ── Moonlight Top Rim (High contrast) ──────────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        palmPath();
        const rim = ctx.createLinearGradient(0, -ph, 0, -ph * 0.4);
        rim.addColorStop(0, 'rgba(210,240,255,0.22)');
        rim.addColorStop(0.6, 'rgba(100,160,255,0.02)');
        rim.addColorStop(1, 'transparent');
        ctx.fillStyle = rim;
        ctx.fill();
        ctx.restore();

        [[-hw * 0.58, topY + ph * 0.31, hw * 0.66, topY + ph * 0.34],
        [-hw * 0.52, topY + ph * 0.5, hw * 0.60, topY + ph * 0.55],
        [-hw * 0.64, topY + ph * 0.17, -hw * 0.08, botY - 5]].forEach((line, i) => {
            ctx.beginPath();
            ctx.moveTo(line[0], line[1]);
            ctx.quadraticCurveTo((line[0] + line[2]) * 0.35, (line[1] + line[3]) * 0.5 - 4, line[2], line[3]);
            ctx.strokeStyle = `rgba(18,26,7,${(0.42 - i * 0.06).toFixed(3)})`;
            ctx.lineWidth = 1 - i * 0.08;
            ctx.stroke();
        });
    }

    _drawZombieWrist(ctx, lightAngle) {
        const ww = 114 * 0.68, hw = ww / 2, h = 125, palmBotY = 0;
        const wristPath = () => {
            ctx.beginPath();
            ctx.moveTo(-hw, palmBotY);
            ctx.bezierCurveTo(-hw - 2, palmBotY + h * 0.35, -hw * 0.93, palmBotY + h * 0.75, -hw * 0.88, palmBotY + h);
            ctx.lineTo(hw * 0.88, palmBotY + h);
            ctx.bezierCurveTo(hw * 0.93, palmBotY + h * 0.75, hw + 2, palmBotY + h * 0.35, hw, palmBotY);
            ctx.closePath();
        };

        wristPath();
        const base = ctx.createLinearGradient(-hw, palmBotY, hw, palmBotY);
        base.addColorStop(0, '#3a4a26');
        base.addColorStop(0.4, '#253018');
        base.addColorStop(0.76, '#18240f');
        base.addColorStop(1, '#121a0a');
        ctx.fillStyle = base;
        ctx.fill();

        wristPath();
        const glow = ctx.createRadialGradient(Math.cos(lightAngle) * hw, Math.sin(lightAngle) * h * 0.4, 0, 0, 0, hw * 2);
        glow.addColorStop(0, 'rgba(180,215,255,0.18)');
        glow.addColorStop(0.5, 'rgba(60,110,180,0.04)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fill();

        wristPath();
        ctx.strokeStyle = 'rgba(5,8,2,0.85)';
        ctx.lineWidth = 0.7;
        ctx.stroke();

        // ── Moonlight Top Rim (Consistency) ──
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        wristPath();
        const rim = ctx.createLinearGradient(0, palmBotY, 0, palmBotY + h * 0.4);
        rim.addColorStop(0, 'rgba(210,240,255,0.16)');
        rim.addColorStop(1, 'transparent');
        ctx.fillStyle = rim;
        ctx.fill();
        ctx.restore();

        [-ww * 0.14, 0, ww * 0.14].forEach(tx => {
            ctx.beginPath();
            ctx.moveTo(tx, palmBotY);
            ctx.lineTo(tx + tx * 0.03, palmBotY + h);
            ctx.strokeStyle = 'rgba(22,34,9,0.3)';
            ctx.lineWidth = 0.9;
            ctx.stroke();
        });
    }

    _drawZombieThumb(ctx, thumbAngles, lightAngle) {
        const TH = { pl: 50, dl: 42, pw: 17, mw: 15, dw: 13, nw: 11 };
        const palmTopY = -102;
        ctx.save();
        ctx.translate(-114 / 2 + 6, palmTopY + 102 * 0.28);
        ctx.rotate(this._degToRad(-52 + thumbAngles[0]));
        this._drawZombiePhalanx(ctx, TH.pl, TH.pw, TH.mw, { knuckleBase: true, lightAngle });
        ctx.translate(0, -TH.pl);
        ctx.rotate(this._degToRad(thumbAngles[1]));
        this._drawZombiePhalanx(ctx, TH.dl, TH.mw, TH.dw * 0.6, { nail: true, nailW: TH.nw, lightAngle, sssAmt: 0.38 });
        ctx.restore();
    }

    _drawZombieFinger(ctx, def, angles, lightAngle, exposedBone) {
        const sss = Math.max(0.2, Math.min(0.7, 1 - (def.pw / 18)));
        ctx.save();
        ctx.translate(def.ox, -102 + def.oy);
        ctx.rotate(this._degToRad(def.ang + angles[0]));
        this._drawZombiePhalanx(ctx, def.pl, def.pw, def.mw, {
            knuckleBase: true,
            wound: exposedBone ? -1 : 0.48,
            lightAngle,
            sssAmt: sss * 0.45,
        });
        ctx.translate(0, -def.pl);
        ctx.rotate(this._degToRad(angles[1]));
        this._drawZombiePhalanx(ctx, def.ml, def.mw, def.dw, {
            knuckleTip: true,
            lightAngle,
            sssAmt: sss * 0.6,
        });
        ctx.translate(0, -def.ml);
        ctx.rotate(this._degToRad(angles[2]));
        this._drawZombiePhalanx(ctx, def.dl, def.dw, def.dw * 0.52, {
            nail: true,
            nailW: def.nw,
            bone: exposedBone,
            lightAngle,
            sssAmt: sss * 0.72,
        });
        ctx.restore();
    }

    // Phalanx gradients use only local coordinates and fixed colours, so for a
    // given geometry they are identical every frame. Cache per context; a
    // CanvasGradient is bound to the context that created it.
    _phalanxGradient(ctx, key, build) {
        let perCtx = ZOMBIE_PHALANX_GRADS.get(ctx);
        if (!perCtx) {
            perCtx = new Map();
            ZOMBIE_PHALANX_GRADS.set(ctx, perCtx);
        }
        let grad = perCtx.get(key);
        if (!grad) {
            grad = build();
            perCtx.set(key, grad);
        }
        return grad;
    }

    // A phalanx's own shading is fixed for a given geometry + light angle: the
    // animation lives in the finger joint rotations, not inside the segment. So
    // bake each distinct segment into a sprite once and blit it thereafter,
    // instead of replaying ~6 layered fills/strokes per segment per frame.
    _drawZombiePhalanx(ctx, len, wb, wt, opt = {}) {
        const {
            nailW = 8, lightAngle = 0, sssAmt = 0,
            knuckleBase = false, knuckleTip = false, nail = false,
            bone = false, wound = -1,
        } = opt;

        // Light angle and sss are continuous; quantise so the cache stays bounded.
        const qAngle = Math.round(lightAngle / (Math.PI / 16)) * (Math.PI / 16);
        const qSss = Math.round(sssAmt * 10) / 10;
        const key = `${len}|${wb}|${wt}|${nailW}|${qAngle.toFixed(3)}|${qSss}|${knuckleBase ? 1 : 0}${knuckleTip ? 1 : 0}${nail ? 1 : 0}${bone ? 1 : 0}|${wound}`;

        let sprite = ZOMBIE_PHALANX_SPRITES.get(key);
        if (!sprite) {
            const wb2 = wb / 2;
            // Local drawing bounds: the widest fill is the base at ±wb2, the bone
            // stub reaches -len-11, and knuckle ellipses extend a little past y=0.
            const pad = 6;
            const minX = -(wb2 + pad);
            const minY = -len - 13 - pad;
            const maxX = wb2 + pad;
            const maxY = wb * 0.25 + pad;
            const cw = Math.max(1, Math.ceil(maxX - minX));
            const ch = Math.max(1, Math.ceil(maxY - minY));

            // Supersample: hands are scaled up on screen, so bake at 2x to keep edges crisp.
            const SS = 2;
            const canvas = document.createElement('canvas');
            canvas.width = cw * SS;
            canvas.height = ch * SS;
            const sctx = canvas.getContext('2d');
            sctx.scale(SS, SS);
            sctx.translate(-minX, -minY);
            this._paintZombiePhalanx(sctx, len, wb, wt, { ...opt, lightAngle: qAngle, sssAmt: qSss });

            sprite = { canvas, minX, minY, cw, ch };
            if (ZOMBIE_PHALANX_SPRITES.size > 400) ZOMBIE_PHALANX_SPRITES.clear();
            ZOMBIE_PHALANX_SPRITES.set(key, sprite);
        }

        ctx.drawImage(sprite.canvas, sprite.minX, sprite.minY, sprite.cw, sprite.ch);
    }

    _paintZombiePhalanx(ctx, len, wb, wt, opt = {}) {
        const {
            knuckleBase = false,
            knuckleTip = false,
            nail = false,
            nailW = 8,
            bone = false,
            wound = -1,
            lightAngle = 0,
            sssAmt = 0,
        } = opt;
        const wb2 = wb / 2, wt2 = wt / 2;
        const skinPath = () => {
            ctx.beginPath();
            ctx.moveTo(-wb2, 0);
            ctx.bezierCurveTo(-wb2 - 1.8, -len * 0.27, -wt2 - 0.6, -len * 0.62, -wt2, -len);
            ctx.lineTo(wt2, -len);
            ctx.bezierCurveTo(wt2 + 0.6, -len * 0.62, wb2 + 1.8, -len * 0.27, wb2, 0);
            ctx.closePath();
        };

        // Base skin layer
        skinPath();
        const base = this._phalanxGradient(ctx, `b${wb2}`, () => {
            const g = ctx.createLinearGradient(-wb2, 0, wb2, 0);
            g.addColorStop(0, '#3a4a26');
            g.addColorStop(0.28, '#253018');
            g.addColorStop(0.62, '#18240f');
            g.addColorStop(1, '#121a0a');
            return g;
        });
        ctx.fillStyle = base;
        ctx.fill();

        // Directional lighting calculations
        const lx = Math.cos(lightAngle) * wb2 * 1.3;
        const ly = Math.sin(lightAngle) * len * 0.42;

        // Ambient occlusion and Depth shadow combined
        skinPath();
        const depthAO = this._phalanxGradient(ctx, `d${len}`, () => {
            const g = ctx.createLinearGradient(0, 0, 0, -len);
            g.addColorStop(0, 'rgba(0,0,0,0.35)');
            g.addColorStop(0.5, 'rgba(0,0,0,0.05)');
            g.addColorStop(1, 'rgba(0,0,0,0.25)');
            return g;
        });
        ctx.fillStyle = depthAO;
        ctx.fill();

        // Moonlight glow (directional). Light angle is continuous, so quantise the
        // centre to keep the cache bounded — sub-pixel, so it is not visible.
        skinPath();
        const glx = Math.round(lx * 4) / 4;
        const gly = Math.round(ly * 4) / 4;
        const glow = this._phalanxGradient(ctx, `g${glx},${gly},${wb2}`, () => {
            const g = ctx.createRadialGradient(glx, gly, 0, glx, gly, wb2 * 2.5);
            g.addColorStop(0, 'rgba(180,215,255,0.28)');
            g.addColorStop(0.5, 'rgba(60,110,180,0.08)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            return g;
        });
        ctx.fillStyle = glow;
        ctx.fill();

        // Conditional Specular and Rim
        if (sssAmt > 0.4) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            skinPath();
            const spec = ctx.createRadialGradient(lx * 0.8, ly * 0.8, 0, lx * 0.8, ly * 0.8, wb2 * 0.5);
            spec.addColorStop(0, 'rgba(255,255,255,0.12)');
            spec.addColorStop(1, 'transparent');
            ctx.fillStyle = spec;
            ctx.fill();

            const rim = ctx.createLinearGradient(0, -len, 0, -len * 0.3);
            rim.addColorStop(0, 'rgba(210,240,255,0.24)');
            rim.addColorStop(1, 'transparent');
            ctx.fillStyle = rim;
            ctx.fill();
            ctx.restore();
        }

        // Subsurface scattering
        if (sssAmt > 0.15) {
            skinPath();
            const sss = ctx.createRadialGradient(0, -len * 0.5, 0, 0, -len * 0.5, wb2 * 1.2);
            sss.addColorStop(0, `rgba(220,140,80,${sssAmt * 0.1})`);
            sss.addColorStop(1, 'transparent');
            ctx.fillStyle = sss;
            ctx.fill();
        }

        // Simplified Skin wrinkles/details
        ctx.save();
        ctx.strokeStyle = 'rgba(20,24,12,0.3)';
        ctx.lineWidth = 0.4;
        // Horizontal wrinkles (only middle)
        const wy = -len * 0.5;
        ctx.beginPath();
        ctx.moveTo(-wb2 * 0.6, wy);
        ctx.quadraticCurveTo(0, wy - 1, wb2 * 0.6, wy);
        ctx.stroke();
        ctx.restore();

        // Outline
        skinPath();
        ctx.strokeStyle = 'rgba(5,8,2,0.8)';
        ctx.lineWidth = 0.7;
        ctx.stroke();

        // Knuckles and features
        if (knuckleBase) {
            ctx.beginPath();
            ctx.ellipse(0, -wb * 0.05, wb * 0.48, wb * 0.18, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(100,160,255,0.12)';
            ctx.fill();
        }
        if (knuckleTip) {
            ctx.beginPath();
            ctx.ellipse(0, -len, wt * 0.56, wt * 0.2, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(104,120,62,0.22)';
            ctx.fill();
        }
        if (wound >= 0) {
            const wy = -len * wound;
            const woundGrad = ctx.createRadialGradient(-2, wy, 0, -2, wy, wb * 0.34);
            woundGrad.addColorStop(0, '#380303');
            woundGrad.addColorStop(0.45, '#6a0808');
            woundGrad.addColorStop(1, 'rgba(80,5,5,0)');
            ctx.beginPath();
            ctx.ellipse(-2, wy, wb * 0.3, wb * 0.21, 0.3, 0, Math.PI * 2);
            ctx.fillStyle = woundGrad;
            ctx.fill();
        }
        if (bone) {
            ctx.fillStyle = '#e3d6ad';
            ctx.fillRect(-wt * 0.28, -len - 11, wt * 0.56, 12);
            ctx.strokeStyle = 'rgba(120,105,62,0.7)';
            ctx.lineWidth = 0.6;
            ctx.strokeRect(-wt * 0.28, -len - 11, wt * 0.56, 12);
        }
        if (nail) {
            const nw2 = nailW / 2, nh = nailW * 0.63, ny = -len + 0.5;
            ctx.fillStyle = '#263012';
            ctx.fillRect(-nw2, ny - nh, nailW, nh);
            ctx.fillStyle = 'rgba(195,220,145,0.12)';
            ctx.fillRect(-nw2 * 0.55, ny - nh * 0.78, nailW * 0.28, nh * 0.22);
        }
    }

    // ------------------------------------------------------------------
    // GRAVITY
    // ------------------------------------------------------------------
    _buildGravityNebulaSprite(p) {
        const size = Math.max(8, Math.round(p.size));
        const side = size * 2;
        const sprite = document.createElement('canvas');
        sprite.width = side;
        sprite.height = side;
        const sctx = sprite.getContext('2d');
        if (!sctx) return null;

        const g = sctx.createRadialGradient(size, size, 0, size, size, size);
        g.addColorStop(0, `hsla(${p.hue},90%,38%,${p.alpha * 1.4})`);
        g.addColorStop(0.4, `hsla(${p.hue},70%,22%,${p.alpha * 0.6})`);
        g.addColorStop(1, 'transparent');
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, side, side);
        return sprite;
    }

    _buildRadialSprite(side, stops) {
        const sprite = document.createElement('canvas');
        sprite.width = side;
        sprite.height = side;
        const sctx = sprite.getContext('2d');
        if (!sctx) return null;

        const half = side * 0.5;
        const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
        for (let i = 0; i < stops.length; i++) {
            grad.addColorStop(stops[i][0], stops[i][1]);
        }
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, side, side);
        return sprite;
    }

    _buildVerticalSprite(width, height, stops) {
        const sprite = document.createElement('canvas');
        sprite.width = width;
        sprite.height = height;
        const sctx = sprite.getContext('2d');
        if (!sctx) return null;

        const grad = sctx.createLinearGradient(width * 0.5, 0, width * 0.5, height);
        for (let i = 0; i < stops.length; i++) {
            grad.addColorStop(stops[i][0], stops[i][1]);
        }
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, width, height);
        return sprite;
    }

    _buildZombieFogSprite(p) {
        const maxR = p.size * 1.3;
        const side = Math.max(8, Math.ceil(maxR * 2));
        const half = side * 0.5;
        const sprite = document.createElement('canvas');
        sprite.width = side;
        sprite.height = side;
        const sctx = sprite.getContext('2d');
        if (!sctx) return null;

        sctx.fillStyle = `hsla(${p.fogHue - 8},25%,12%,${p.alpha * 0.5})`;
        sctx.beginPath();
        sctx.arc(half, half, p.size * 1.3, 0, Math.PI * 2);
        sctx.fill();

        sctx.fillStyle = `hsla(${p.fogHue},32%,18%,${p.alpha * 0.9})`;
        sctx.beginPath();
        sctx.arc(half, half, p.size, 0, Math.PI * 2);
        sctx.fill();

        return sprite;
    }

    _buildZombieOrbSprite(p) {
        const baseRadius = p.size * 3.0;
        const side = Math.max(8, Math.ceil(baseRadius * 2));
        const half = side * 0.5;
        const sprite = document.createElement('canvas');
        sprite.width = side;
        sprite.height = side;
        const sctx = sprite.getContext('2d');
        if (!sctx) return null;

        sctx.fillStyle = `hsla(${p.hue},85%,72%,${p.alpha * 0.55})`;
        sctx.beginPath();
        sctx.arc(half, half, baseRadius, 0, Math.PI * 2);
        sctx.fill();

        sctx.fillStyle = `hsla(${p.hue - 10},70%,40%,${p.alpha * 0.18})`;
        sctx.beginPath();
        sctx.arc(half, half, baseRadius * 0.65, 0, Math.PI * 2);
        sctx.fill();

        p.baseRadius = baseRadius;
        return sprite;
    }

    _ensureGravityGlowSprites() {
        if (!this._gravityClusterSprite) {
            this._gravityClusterSprite = this._buildRadialSprite(240, [
                [0, 'rgba(140,200,255,0.18)'],
                [0.4, 'rgba(100,160,255,0.08)'],
                [1, 'transparent'],
            ]);
        }
        if (!this._gravityCoreSprite) {
            this._gravityCoreSprite = this._buildRadialSprite(360, [
                [0, 'rgba(255,140,40,0.16)'],
                [0.4, 'rgba(200,80,20,0.08)'],
                [1, 'transparent'],
            ]);
        }
    }

    _ensureObstacleDynamicSprites() {
        if (!this._obstacleFirePitSprite) {
            this._obstacleFirePitSprite = this._buildRadialSprite(512, [
                [0, 'rgba(255,220,120,0.9)'],
                [0.2, 'rgba(255,135,35,1)'],
                [0.5, 'rgba(255,55,0,0.55)'],
                [1, 'transparent'],
            ]);
        }
        if (!this._obstacleHeatPlumeSprite) {
            this._obstacleHeatPlumeSprite = this._buildRadialSprite(512, [
                [0, 'rgba(255,120,20,0.20)'],
                [0.22, 'rgba(230,55,0,0.14)'],
                [0.52, 'rgba(120,10,0,0.07)'],
                [1, 'transparent'],
            ]);
        }
        if (!this._obstacleSmokeSprite) {
            this._obstacleSmokeSprite = this._buildRadialSprite(256, [
                [0, 'rgba(70,12,8,0.95)'],
                [0.35, 'rgba(35,6,6,0.55)'],
                [0.75, 'rgba(14,2,4,0.18)'],
                [1, 'transparent'],
            ]);
        }
        if (!this._obstacleSparkSprite) {
            this._obstacleSparkSprite = this._buildRadialSprite(128, [
                [0, 'rgba(255,245,180,0.9)'],
                [0.3, 'rgba(255,150,50,0.55)'],
                [1, 'transparent'],
            ]);
        }
    }

    _ensureObstacleShimmerSprite(w, h) {
        const radius = Math.max(w, h) * 0.82;
        if (this._obstacleShimmerSprite && Math.abs(this._obstacleShimmerRadius - radius) < 1) {
            return;
        }

        const side = Math.max(8, Math.ceil(radius * 2));
        const half = side * 0.5;
        const sprite = document.createElement('canvas');
        sprite.width = side;
        sprite.height = side;
        const sctx = sprite.getContext('2d');
        if (!sctx) return;

        const innerY = half + h * 0.04;
        const outerY = half;
        const g = sctx.createRadialGradient(half, innerY, 0, half, outerY, radius);
        g.addColorStop(0, 'rgba(255,110,10,0.10)');
        g.addColorStop(0.55, 'rgba(150,20,0,0.06)');
        g.addColorStop(1, 'transparent');
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, side, side);

        this._obstacleShimmerSprite = sprite;
        this._obstacleShimmerRadius = radius;
    }

    _ensureGravityStaticLayer(w, h) {
        if (!this._gravityStaticCanvas ||
            this._gravityStaticCanvas.width !== w ||
            this._gravityStaticCanvas.height !== h) {
            this._gravityStaticCanvas = document.createElement('canvas');
            this._gravityStaticCanvas.width = w;
            this._gravityStaticCanvas.height = h;
            this._gravityStaticCtx = this._gravityStaticCanvas.getContext('2d');
        }

        const gctx = this._gravityStaticCtx;
        if (!gctx) return null;

        gctx.clearRect(0, 0, w, h);

        const base = gctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
        base.addColorStop(0, '#06030f');
        base.addColorStop(0.5, '#030208');
        base.addColorStop(1, '#010104');
        gctx.fillStyle = base;
        gctx.fillRect(0, 0, w, h);

        const vig = gctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h);
        vig.addColorStop(0, 'transparent');
        vig.addColorStop(1, 'rgba(0,0,0,0.65)');
        gctx.fillStyle = vig;
        gctx.fillRect(0, 0, w, h);

        return this._gravityStaticCanvas;
    }

    renderGravity(ctx, w, h) {
        const staticLayer = this._ensureGravityStaticLayer(w, h);
        if (staticLayer) ctx.drawImage(staticLayer, 0, 0);
        this._ensureGravityGlowSprites();
        const game = typeof window !== 'undefined' ? window.game : null;
        const gravityInteraction = game?.gravityInteraction || null;
        const ambient = gravityInteraction?.ambient || 0;
        const proximity = gravityInteraction?.proximity || 0;
        const focusBlend = Math.max(0, Math.min(1, ambient * 0.9 + proximity * 0.72));
        const starPullStrength = Math.max(0, Math.min(1, ambient * 0.42 + proximity * 0.88));
        const starPullRadius = Math.max(w, h) * (0.22 + ambient * 0.18 + proximity * 0.12);
        const starPullRadiusSq = starPullRadius * starPullRadius;
        const clusterBaseX = w * 0.22 + Math.cos(this.modePhase * 0.4) * 18;
        const clusterBaseY = h * 0.18 + Math.sin(this.modePhase * 0.4) * 12;
        const focusX = gravityInteraction?.focusX ?? clusterBaseX;
        const focusY = gravityInteraction?.focusY ?? clusterBaseY;
        const pulse = gravityInteraction?.phase !== undefined
            ? 0.92 + Math.sin(gravityInteraction.phase) * 0.08
            : 1;

        if (areParticleEffectsEnabled()) {
            for (let i = 0; i < this.nebulaParticles.length; i++) {
                const p = this.nebulaParticles[i];
                if (!p.sprite) p.sprite = this._buildGravityNebulaSprite(p);
                if (p.sprite) {
                    const side = p.size * 2;
                    ctx.drawImage(p.sprite, p.x - p.size, p.y - p.size, side, side);
                }
            }

            const hueShift = Math.sin(this.modePhase * 0.3) * 20;
            for (let i = 0; i < this.stars.length; i++) {
                const s = this.stars[i];
                const tw = (Math.sin(s.twinklePhase) + 1) / 2;
                const a = s.alpha * (0.45 + tw * 0.55) * (1 + ambient * 0.24);
                const size = s.size * (0.7 + tw * 0.4);

                // Find the strongest pulling well for this specific star
                const activeWells = gravityInteraction?.activeWells || [];
                let bestDx = 0;
                let bestDy = 0;
                let bestPullAmount = 0;

                if (activeWells.length > 0) {
                    for (let j = 0; j < activeWells.length; j++) {
                        const w = activeWells[j];
                        const dx = w.x - s.x;
                        const dy = w.y - s.y;
                        const dSq = dx * dx + dy * dy;

                        const effectiveRadiusSq = starPullRadiusSq * (1.0 + (w.excitement || 0) * 0.8);

                        if (dSq < effectiveRadiusSq) {
                            const falloff = 1 - (dSq / effectiveRadiusSq);
                            const pull = falloff * falloff * (0.4 + (w.excitement || 0) * 0.6);
                            if (pull > bestPullAmount) {
                                bestPullAmount = pull;
                                bestDx = dx;
                                bestDy = dy;
                            }
                        }
                    }
                }

                const pullAmount = bestPullAmount * starPullStrength;

                // Enhanced Visual: Star Warping/Trails with "CSS-like" glow
                const drawX = s.x + bestDx * pullAmount * 0.75;
                const drawY = s.y + bestDy * pullAmount * 0.75;
                const trailX = s.x + bestDx * pullAmount * 0.35;
                const trailY = s.y + bestDy * pullAmount * 0.35;

                // Star Core HSLA
                const baseHue = s.cold ? 210 + hueShift : 50 + hueShift;
                const glowA = a * pullAmount * 0.85;

                if (pullAmount > 0.15) {
                    // Aberration/Glow Trail - simulates a stretched light effect
                    ctx.fillStyle = `hsla(${baseHue + 20}, 100%, 70%, ${glowA * 0.6})`;
                    ctx.fillRect(trailX - size * 0.8, trailY - size * 0.8, size * 1.6, size * 1.6);

                    // Motion line
                    ctx.beginPath();
                    ctx.strokeStyle = `hsla(${baseHue}, 100%, 80%, ${glowA * 0.4})`;
                    ctx.lineWidth = size * 0.5;
                    ctx.moveTo(s.x, s.y);
                    ctx.lineTo(drawX, drawY);
                    ctx.stroke();
                }

                ctx.fillStyle = s.cold
                    ? `hsla(${baseHue}, 90%, 85%, ${a})`
                    : `hsla(${baseHue}, 85%, 75%, ${a})`;

                // Draw Star
                ctx.fillRect(drawX - size * 0.5, drawY - size * 0.5, size, size);

                // Pseudo-Bloom (CSS 'box-shadow' equivalent on Canvas)
                if (s.size > 1.1 || pullAmount > 0.2) {
                    const bloomSize = size * (2 + pullAmount * 4);
                    ctx.fillStyle = s.cold
                        ? `hsla(${baseHue}, 100%, 70%, ${a * 0.22})`
                        : `hsla(${baseHue}, 100%, 60%, ${a * 0.22})`;
                    ctx.fillRect(drawX - bloomSize * 0.5, drawY - bloomSize * 0.5, bloomSize, bloomSize);
                }

                if (s.size > 1.3) {
                    ctx.fillStyle = s.cold
                        ? `rgba(150,190,255,${a * 0.25})`
                        : `rgba(255,200,100,${a * 0.25})`;

                    const halo = s.size * (2.5 + pullAmount * 5);
                    ctx.fillRect(drawX - halo * 0.5, drawY - 0.6, halo, 1.2);
                    ctx.fillRect(drawX - 0.6, drawY - halo * 0.5, 1.2, halo);
                }
            }
        }

        const clusterX = clusterBaseX + (focusX - clusterBaseX) * focusBlend;
        const clusterY = clusterBaseY + (focusY - clusterBaseY) * focusBlend;
        if (this._gravityClusterSprite) {
            const clusterSize = 240 * (0.9 + ambient * 0.18 + pulse * 0.05);
            ctx.globalAlpha = 0.68 + ambient * 0.28;
            ctx.drawImage(this._gravityClusterSprite, clusterX - clusterSize * 0.5, clusterY - clusterSize * 0.5, clusterSize, clusterSize);
            ctx.globalAlpha = 1;
        }

        const coreBaseX = w * 0.72 + Math.cos(this.modePhase * 0.6) * 20;
        const coreBaseY = h * 0.65 + Math.sin(this.modePhase * 0.6) * 14;
        const coreX = coreBaseX + (focusX - coreBaseX) * (focusBlend * 0.6);
        const coreY = coreBaseY + (focusY - coreBaseY) * (focusBlend * 0.6);
        if (this._gravityCoreSprite) {
            const coreSize = 360 * (0.9 + ambient * 0.2 + pulse * 0.04);
            ctx.globalAlpha = 0.62 + ambient * 0.28;
            ctx.drawImage(this._gravityCoreSprite, coreX - coreSize * 0.5, coreY - coreSize * 0.5, coreSize, coreSize);
            ctx.globalAlpha = 1;
        }

        this.renderPeripheralLightRigs(ctx, w, h,
            'rgba(115,170,255,ALPHA)', 'rgba(255,140,70,ALPHA)', 1.12);
        this.applyGameplayVisibilityPass(ctx, w, h, 0.06, 0.27);
    }

    // ------------------------------------------------------------------
    // SPEED — v2 (realism pass)
    // Settings baked from screenshot:
    //   count=200, slant=0.60, speed=2.00
    //   roadY=0.80, pollution=1.00, bloom=0.25, saturation=0.00
    // ------------------------------------------------------------------
    _hash(n) {
        n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
        n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
        return ((n >> 16) ^ n) >>> 0;
    }

    renderSpeed(ctx, w, h) {
        const t = this.time;
        const roadY = this.roadY;   // h * 0.80
        const vx = w * 0.50;
        const vy = roadY;

        // Convenience aliases for baked settings
        const pollA = this._speedPollutionAmt;  // 1.00
        const bloom = this._speedBloomAmt;      // 0.25
        const sat = this._speedSaturation;    // 0.00

        // Saturation scale helper — sat=0 collapses all colours toward grey
        const sSat = (s) => (s * sat).toFixed(1);

        // ── 1. SKY — sodium light-pollution palette ───────────────────
        const sky = ctx.createLinearGradient(0, 0, 0, roadY);
        sky.addColorStop(0, `hsl(240,${sSat(14)}%,3%)`);
        sky.addColorStop(0.5, `hsl(245,${sSat(18)}%,5%)`);
        sky.addColorStop(0.8, `hsl(32,${sSat(30)}%,7%)`);
        sky.addColorStop(1, `hsl(28,${sSat(35)}%,10%)`);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, roadY + 1);

        // Light-pollution dome
        const pollDome = ctx.createRadialGradient(vx, roadY + h * 0.1, 0, vx, roadY * 0.45, w * 0.9);
        pollDome.addColorStop(0, `rgba(200,130,40,${(0.12 * pollA).toFixed(4)})`);
        pollDome.addColorStop(0.3, `rgba(160,90,20,${(0.07 * pollA).toFixed(4)})`);
        pollDome.addColorStop(1, 'transparent');
        ctx.fillStyle = pollDome;
        ctx.fillRect(0, 0, w, roadY);

        // Faint neon bleed from city (scaled by saturation)
        const neonBleed = ctx.createLinearGradient(0, roadY * 0.80, 0, roadY);
        neonBleed.addColorStop(0, 'transparent');
        neonBleed.addColorStop(1, `rgba(40,20,80,${(0.12 * sat).toFixed(4)})`);
        ctx.fillStyle = neonBleed;
        ctx.fillRect(0, roadY * 0.80, w, roadY * 0.20);

        // ── 2. CITY — far layer ───────────────────────────────────────
        ctx.save();
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(40,20,60,0.5)';
        const farCount = Math.max(28, Math.floor(w / 34));
        for (let i = 0; i < farCount; i++) {
            const fi = this._hash(0xDEADBEEF + i);
            const xf = (i + (fi & 0xFF) / 510) / farCount;
            const wf = 0.014 + ((fi >> 8 & 0xFF) / 255) * 0.018;
            const hf = 0.05 + ((fi >> 16 & 0xFF) / 255) * 0.09;
            const bx = xf * w, bw = Math.max(2, wf * w), bh = hf * h;
            ctx.fillStyle = '#0c0a14';
            ctx.fillRect(bx, roadY - bh, bw, bh);
        }
        ctx.restore();

        // Far haze — warm-tinted
        const fHaze = ctx.createLinearGradient(0, roadY * 0.70, 0, roadY);
        fHaze.addColorStop(0, 'rgba(8,5,14,0.0)');
        fHaze.addColorStop(1, 'rgba(16,11,12,0.74)');
        ctx.fillStyle = fHaze;
        ctx.fillRect(0, roadY * 0.70, w, roadY * 0.30);

        // Window colour palettes — mixed colour temperatures
        const WIN_PALETTE = [
            [42, 65, 72],   // warm amber
            [210, 75, 72],   // cool blue-white
            [35, 55, 78],   // orange
            [220, 28, 88],   // near-white office
            [260, 65, 65],   // faint purple
        ];

        const drawWindows = (seed, bx, by, bw, bh, maxY) => {
            const padX = Math.max(2, bw * 0.12);
            const padY = Math.max(3, bh * 0.06);
            const cols = Math.max(1, Math.floor((bw - padX * 2) / 7));
            const gx = (bw - padX * 2) / Math.max(1, cols);
            const gy = Math.max(6, bh * 0.07);
            let winIdx = 0;
            for (let wy = by + padY; wy < maxY - 4; wy += gy) {
                for (let col = 0; col < cols; col++) {
                    const wh = this._hash(seed + winIdx++);
                    if ((wh & 0xFF) > 118) continue;
                    const wx = bx + padX + col * gx;
                    const ww = Math.max(1.5, bw * 0.055);
                    const wht = Math.max(1.5, bh * 0.038);
                    const phase = (wh >> 8 & 0xFF) / 255 * Math.PI * 2;
                    const flick = 0.55 + Math.sin(t * (0.3 + (wh >> 16 & 0xFF) / 255 * 1.0) + phase) * 0.45;
                    const [ph, ps, pl] = WIN_PALETTE[(wh >> 20) % 5];
                    const wSat = ps * (0.4 + sat * 0.6);
                    ctx.fillStyle = `hsla(${ph},${wSat.toFixed(1)}%,${pl}%,${(flick * 0.7).toFixed(3)})`;
                    ctx.fillRect(wx, wy, ww, wht);
                }
            }
        };

        // Mid buildings
        const midCount = Math.max(12, Math.floor(w / 80));
        for (let i = 0; i < midCount; i++) {
            const fi = this._hash(0xCAFEBABE + i);
            const xf = (i + (fi & 0xFF) / 380) / midCount;
            const wf = 0.032 + ((fi >> 8 & 0xFF) / 255) * 0.052;
            const hf = 0.12 + ((fi >> 16 & 0xFF) / 255) * 0.28;
            const bx = xf * w, bw = Math.max(4, wf * w), bh = hf * h, by = roadY - bh;

            const mg = ctx.createLinearGradient(0, by, 0, roadY);
            mg.addColorStop(0, '#0c0a1a'); mg.addColorStop(0.6, '#080616'); mg.addColorStop(1, '#040310');
            ctx.fillStyle = mg;
            ctx.fillRect(bx, by, bw, bh);

            // Roof rim — warm vs cool based on saturation
            const rimA = 0.35 + Math.sin(t * 0.9 + xf * 14) * 0.09;
            const rimSat = 55 * sat;
            ctx.fillStyle = `hsla(245,${rimSat.toFixed(1)}%,68%,${rimA.toFixed(3)})`;
            ctx.fillRect(bx, by, bw, 1.2);

            drawWindows(0xCAFEBABE + i * 1000, bx, by, bw, bh, roadY);

            // Antenna with red beacon
            if ((fi >> 24 & 0xFF) > 90) {
                const ax = bx + bw / 2;
                const aH = h * (0.012 + ((fi >> 20 & 0xFF) / 255) * 0.022);
                const bPhase = (fi >> 12 & 0xFF) / 255 * Math.PI * 2;
                ctx.strokeStyle = 'rgba(60,40,140,0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(ax, by); ctx.lineTo(ax, by - aH); ctx.stroke();
                if (Math.sin(t * 1.8 + bPhase) > 0.5) {
                    ctx.save();
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = 'rgba(255,60,60,0.8)';
                    ctx.fillStyle = 'rgba(255,40,40,0.9)';
                    ctx.beginPath(); ctx.arc(ax, by - aH, 2.2, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            }
        }

        // Near buildings
        const nearCount = Math.max(3, Math.floor(w / 240));
        for (let i = 0; i < nearCount; i++) {
            const fi = this._hash(0xBEEFCAFE + i);
            const xf = (i + 0.08 + (fi & 0xFF) / 255 * 0.42) / nearCount;
            const wf = 0.13 + ((fi >> 8 & 0xFF) / 255) * 0.15;
            const hf = 0.20 + ((fi >> 16 & 0xFF) / 255) * 0.18;
            const bx = xf * w, bw = Math.max(6, wf * w), by = Math.max(0, roadY - hf * h);
            ctx.fillStyle = '#030210';
            ctx.fillRect(bx, by, bw, h - by);
            ctx.fillStyle = `rgba(50,30,140,${(0.18 * sat).toFixed(3)})`;
            ctx.fillRect(bx, by, bw, 2);
            drawWindows(0xBEEFCAFE + i * 1000, bx, by, bw, h - by, roadY);
        }

        // ── 3. HORIZON GLOW — toned down, mixed warm+cool ─────────────
        const horizPulse = 0.90 + Math.sin(t * 0.28) * 0.10;
        const hGlow = ctx.createRadialGradient(vx, vy, 0, vx, vy, w * 0.62);
        hGlow.addColorStop(0, `rgba(35,20,140,${(0.11 * horizPulse * sat).toFixed(4)})`);
        hGlow.addColorStop(0.3, `rgba(90,55,35,${(0.07 * horizPulse * pollA).toFixed(4)})`);
        hGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = hGlow;
        ctx.fillRect(0, roadY - h * 0.12, w, h * 0.18);

        // ── 4. ROAD — dark wet asphalt ────────────────────────────────
        const road = ctx.createLinearGradient(0, roadY, 0, h);
        road.addColorStop(0, `hsl(26,${sSat(18)}%,10%)`);
        road.addColorStop(0.15, `hsl(24,${sSat(15)}%,8%)`);
        road.addColorStop(0.45, `hsl(240,${sSat(12)}%,6%)`);
        road.addColorStop(0.80, `hsl(240,${sSat(10)}%,4%)`);
        road.addColorStop(1, `hsl(240,${sSat(8)}%,3%)`);
        ctx.fillStyle = road;
        ctx.fillRect(0, roadY, w, h - roadY);

        // Anisotropic centre sheen
        const sheenP = 0.08 + Math.sin(t * 0.48) * 0.025;
        const sheen = ctx.createLinearGradient(w * 0.28, 0, w * 0.72, 0);
        sheen.addColorStop(0, 'transparent');
        sheen.addColorStop(0.35, `hsla(26,${sSat(20)}%,30%,${sheenP.toFixed(4)})`);
        sheen.addColorStop(0.50, `hsla(24,${sSat(24)}%,38%,${(sheenP * 1.25).toFixed(4)})`);
        sheen.addColorStop(0.65, `hsla(26,${sSat(20)}%,30%,${sheenP.toFixed(4)})`);
        sheen.addColorStop(1, 'transparent');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, roadY, w, h - roadY);

        // ── 5. ROAD LINES ─────────────────────────────────────────────
        ctx.save();
        const scroll = this.gridOffset * 1.2;

        ctx.strokeStyle = `hsla(26,${sSat(18)}%,48%,0.16)`;
        ctx.lineWidth = 1.5;
        [w * 0.16, w * 0.84].forEach(nearX => {
            ctx.beginPath(); ctx.moveTo(vx, roadY); ctx.lineTo(nearX, h); ctx.stroke();
        });

        [w * 0.36, w * 0.50, w * 0.64].forEach(baseX => {
            for (let s = 0; s < 16; s++) {
                const dashT = 0.038;
                const t0 = ((s / 16) + (scroll % (h - roadY)) / ((h - roadY) * 16)) % 1;
                const t1 = Math.min(1, t0 + dashT);
                if (t1 <= t0) continue;
                const ease = Math.pow(t0, 1.4);
                const x0 = vx + (baseX - vx) * t0, y0 = roadY + (h - roadY) * t0;
                const x1 = vx + (baseX - vx) * t1, y1 = roadY + (h - roadY) * t1;
                ctx.strokeStyle = `hsla(28,${sSat(24)}%,58%,${(0.04 + ease * 0.18).toFixed(3)})`;
                ctx.lineWidth = 0.5 + ease * 1.3;
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            }
        });

        // Shoulder glows (muted at sat=0)
        [[0, w * 0.10], [1, w * 0.90]].forEach(([side, baseX]) => {
            const origin = side === 0 ? 0 : w;
            const pulse = 0.05 + Math.sin(t * 0.9 + side * Math.PI) * 0.015;
            const sg = ctx.createLinearGradient(origin, 0, baseX, 0);
            sg.addColorStop(0, `rgba(45,25,160,${(pulse * sat).toFixed(4)})`);
            sg.addColorStop(0.5, `rgba(45,25,160,${(pulse * 0.3 * sat).toFixed(4)})`);
            sg.addColorStop(1, 'transparent');
            ctx.fillStyle = sg;
            ctx.fillRect(side === 0 ? 0 : baseX, roadY, Math.abs(baseX - origin), h - roadY);
        });
        ctx.restore();

        // ── 6. SPEED LINES — forward cone only ───────────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const lineScroll = (scroll * 0.9) % 1;
        for (let i = 0; i < 32; i++) {
            const fi = this._hash(0xFEEDFACE + i);
            const baseA = (fi & 0xFFFF) / 65535;
            const angle = (baseA * 2 - 1) * (Math.PI * 0.36);
            const side = (fi >> 22) & 1 ? 1 : -1;
            const actualAngle = side > 0 ? angle : Math.PI - angle;
            const phase = ((fi >> 16 & 0x3FFF) / 16383 + lineScroll) % 1;
            const near = Math.pow(phase, 1.5);
            const far = Math.pow(Math.min(1, phase + 0.055), 1.5);
            const reach = Math.min(w, h) * 0.92;
            const alpha = (near * 0.10 + 0.012) * sat;
            const lw = 0.4 + near * 1.4;
            const hue = [195, 205, 42, 215, 198][(fi >> 20) % 5];
            ctx.strokeStyle = `hsla(${hue},65%,78%,${alpha.toFixed(3)})`;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(vx + Math.cos(actualAngle) * reach * far, vy + Math.sin(actualAngle) * reach * far);
            ctx.lineTo(vx + Math.cos(actualAngle) * reach * near, vy + Math.sin(actualAngle) * reach * near);
            ctx.stroke();
        }
        ctx.restore();

        // ── 7. REFLECTIONS — anisotropic wet-road ────────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Tail-light bloom — restrained
        const bloomA = bloom * (0.16 + Math.sin(t * 0.62) * 0.03);
        const bloomG = ctx.createRadialGradient(vx, h * 0.89, 0, vx, h * 0.89, w * 0.22);
        bloomG.addColorStop(0, `rgba(220,30,38,${bloomA.toFixed(4)})`);
        bloomG.addColorStop(0.5, `rgba(160,15,22,${(bloomA * 0.4).toFixed(4)})`);
        bloomG.addColorStop(1, 'transparent');
        ctx.fillStyle = bloomG;
        ctx.fillRect(0, roadY, w, h - roadY);

        // Anisotropic specular streaks — tall, mixed colour temps
        const speculars = [
            { hue: 40, sat: 60, xf: 0.30, spd: 0.48, a: 0.13 },
            { hue: 210, sat: 55, xf: 0.50, spd: 0.90, a: 0.11 },
            { hue: 38, sat: 55, xf: 0.70, spd: 0.60, a: 0.12 },
            { hue: 255, sat: 60, xf: 0.18, spd: 1.15, a: 0.08 },
            { hue: 195, sat: 55, xf: 0.82, spd: 0.72, a: 0.09 },
        ];
        speculars.forEach(r => {
            const rx = w * (r.xf + Math.sin(t * r.spd) * 0.012);
            const ry = roadY + (h - roadY) * 0.12;
            const sH = (h - roadY) * 0.78;
            const sW = w * 0.065;
            const rSat = r.sat * (0.5 + sat * 0.5);
            const rg = ctx.createLinearGradient(0, ry, 0, ry + sH);
            rg.addColorStop(0, `hsla(${r.hue},${rSat.toFixed(1)}%,62%,${(r.a * bloom).toFixed(4)})`);
            rg.addColorStop(0.4, `hsla(${r.hue},${rSat.toFixed(1)}%,52%,${(r.a * bloom * 0.35).toFixed(4)})`);
            rg.addColorStop(1, 'transparent');
            ctx.fillStyle = rg;
            ctx.fillRect(rx - sW, ry, sW * 2, sH);
        });

        // Surface ripple bands
        for (let i = 0; i < 9; i++) {
            const tf = i / 8;
            const py = roadY + (h - roadY) * (0.04 + tf * 0.88)
                + Math.sin(t * (0.52 + i * 0.27) + i * 2.1) * (1.5 + tf * 6);
            const brt = (0.016 + tf * 0.012) * bloom;
            const rp = ctx.createLinearGradient(0, py - 6, 0, py + 12);
            rp.addColorStop(0, 'transparent');
            rp.addColorStop(0.5, `hsla(26,${sSat(16)}%,42%,${brt.toFixed(4)})`);
            rp.addColorStop(1, 'transparent');
            ctx.fillStyle = rp;
            ctx.fillRect(0, py - 6, w, 18);
        }
        ctx.restore();

        // ── 8. RAIN — slanted, variable, wobbled ─────────────────────
        if (areParticleEffectsEnabled()) {
            ctx.save();
            ctx.beginPath(); ctx.rect(0, 0, w, h * 0.82); ctx.clip();

            const slantDxPerL = this._speedRainSlant * 0.55;

            for (let i = 0; i < this.rainParticles.length; i++) {
                const p = this.rainParticles[i];
                const fadeStart = roadY - h * 0.06;
                const fade = p.y > fadeStart
                    ? Math.max(0, 1 - (p.y - fadeStart) / (h * 0.09))
                    : 1;
                if (fade <= 0) return;

                const slantDx = p.length * slantDxPerL * p.slantVar;
                const wobble = Math.sin(this.time * p.wobbleFreq + p.wobblePhase) * p.length * 0.025;
                const x2 = p.x, y2 = p.y;
                const x1 = p.x - slantDx + wobble, y1 = p.y - p.length;

                const needRebuild = !p._gradient
                    || Math.abs(x1 - p._gx1) > 1.2
                    || Math.abs(y1 - p._gy1) > 2;
                if (needRebuild) {
                    const rg = ctx.createLinearGradient(x1, y1, x2, y2);
                    rg.addColorStop(0, 'transparent');
                    rg.addColorStop(0.55, `hsla(${p.hue},${p.sat}%,78%,${(p.alpha * 0.55).toFixed(3)})`);
                    rg.addColorStop(1, `hsla(${p.hue},${p.sat}%,92%,${p.alpha.toFixed(3)})`);
                    p._gradient = rg; p._gx1 = x1; p._gy1 = y1;
                }

                ctx.globalAlpha = fade;
                ctx.strokeStyle = p._gradient;
                ctx.lineWidth = p.width;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                // Bright droplet tip
                if (p.alpha > 0.36 && fade > 0.5) {
                    ctx.fillStyle = `hsla(${p.hue},${p.sat + 10}%,94%,${(p.alpha * fade * 0.55).toFixed(3)})`;
                    ctx.beginPath(); ctx.arc(x2, y2, p.width * 0.85, 0, Math.PI * 2); ctx.fill();
                }
            }

            ctx.globalAlpha = 1;
            ctx.restore();

            // Splashes at road surface
            if (this._splashes.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                for (let i = 0; i < this._splashes.length; i++) {
                    const s = this._splashes[i];
                    const a = s.alpha * s.life * 0.32;
                    if (a <= 0.005) continue;
                    ctx.beginPath();
                    ctx.ellipse(s.x, s.y, s.r, s.r * 0.26, 0, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(155,175,215,${a.toFixed(3)})`;
                    ctx.lineWidth = 0.65 * s.life;
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Horizon mist
            const mist = ctx.createLinearGradient(0, roadY - h * 0.02, 0, roadY + h * 0.04);
            mist.addColorStop(0, 'transparent');
            mist.addColorStop(0.5, 'rgba(18,10,28,0.16)');
            mist.addColorStop(1, 'transparent');
            ctx.fillStyle = mist;
            ctx.fillRect(0, roadY - h * 0.02, w, h * 0.06);
        }

        // ── 9. FINAL COMPOSITING ──────────────────────────────────────

        // Top vignette
        const topV = ctx.createLinearGradient(0, 0, 0, h * 0.16);
        topV.addColorStop(0, 'rgba(0,0,0,0.92)');
        topV.addColorStop(1, 'transparent');
        ctx.fillStyle = topV;
        ctx.fillRect(0, 0, w, h * 0.16);

        // Peripheral rigs — warm left, cool right, restrained
        {
            const pulse = 0.85 + Math.sin(t * 1.15) * 0.15;
            const alphaMul = 0.9 * pulse * bloom;
            const prev = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'screen';

            const leftRig = ctx.createRadialGradient(-w * 0.05, h * 0.62, 0, -w * 0.05, h * 0.62, w * 0.42);
            leftRig.addColorStop(0, `rgba(200,105,30,${(0.16 * alphaMul).toFixed(3)})`);
            leftRig.addColorStop(0.4, `rgba(200,105,30,${(0.07 * alphaMul).toFixed(3)})`);
            leftRig.addColorStop(1, 'transparent');
            ctx.fillStyle = leftRig; ctx.fillRect(0, 0, w, h);

            const rightRig = ctx.createRadialGradient(w * 1.05, h * 0.52, 0, w * 1.05, h * 0.52, w * 0.42);
            rightRig.addColorStop(0, `rgba(35,100,200,${(0.16 * alphaMul).toFixed(3)})`);
            rightRig.addColorStop(0.4, `rgba(35,100,200,${(0.07 * alphaMul).toFixed(3)})`);
            rightRig.addColorStop(1, 'transparent');
            ctx.fillStyle = rightRig; ctx.fillRect(0, 0, w, h);

            ctx.globalCompositeOperation = prev;
        }

        // Camera specular on road
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const camSpec = ctx.createRadialGradient(vx, h * 0.89, 0, vx, h * 0.89, w * 0.20);
        camSpec.addColorStop(0, `rgba(160,125,200,${(0.07 * bloom).toFixed(4)})`);
        camSpec.addColorStop(0.6, `rgba(90,70,140,${(0.03 * bloom).toFixed(4)})`);
        camSpec.addColorStop(1, 'transparent');
        ctx.fillStyle = camSpec;
        ctx.fillRect(vx - w * 0.25, roadY, w * 0.50, h - roadY);
        ctx.restore();

        // Edge vignette
        const sideMask = ctx.createLinearGradient(0, 0, w, 0);
        sideMask.addColorStop(0, 'rgba(0,0,0,0.20)');
        sideMask.addColorStop(0.18, 'rgba(0,0,0,0.08)');
        sideMask.addColorStop(0.40, 'rgba(0,0,0,0.00)');
        sideMask.addColorStop(0.60, 'rgba(0,0,0,0.00)');
        sideMask.addColorStop(0.82, 'rgba(0,0,0,0.08)');
        sideMask.addColorStop(1, 'rgba(0,0,0,0.20)');
        ctx.fillStyle = sideMask; ctx.fillRect(0, 0, w, h);

        // Variable chromatic aberration
        const caAmt = 0.012 + Math.sin(t * 3.4 + 0.9) * 0.009;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255,8,8,${caAmt.toFixed(4)})`; ctx.fillRect(1, 0, w, h);
        ctx.fillStyle = `rgba(8,8,255,${caAmt.toFixed(4)})`; ctx.fillRect(-1, 0, w, h);
        ctx.restore();

        this.applyGameplayVisibilityPass(ctx, w, h, 0.05, 0.14);
    }

    // ------------------------------------------------------------------
    // OBSTACLE
    // ------------------------------------------------------------------
    _ensureObstacleStaticBaseLayer(w, h) {
        if (!this._obstacleStaticBaseCanvas || this._obstacleStaticBaseCanvas.width !== w || this._obstacleStaticBaseCanvas.height !== h) {
            this._obstacleStaticBaseCanvas = document.createElement('canvas');
            this._obstacleStaticBaseCanvas.width = w;
            this._obstacleStaticBaseCanvas.height = h;
            const bctx = this._obstacleStaticBaseCanvas.getContext('2d');

            const grad = bctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#050a14');
            grad.addColorStop(0.45, '#0a121e');
            grad.addColorStop(1, '#1a0802');

            bctx.fillStyle = grad;
            bctx.fillRect(0, 0, w, h);
        }
        return this._obstacleStaticBaseCanvas;
    }

    _getObstacleVignette(ctx, w, h) {
        if (!this._obstacleVignette || this._obstacleVignetteWidth !== w || this._obstacleVignetteHeight !== h) {
            this._obstacleVignette = ctx.createRadialGradient(w / 2, h, 0, w / 2, h * 0.8, h);
            this._obstacleVignette.addColorStop(0, 'rgba(255, 40, 0, 0.12)');
            this._obstacleVignette.addColorStop(0.6, 'rgba(20, 5, 0, 0.05)');
            this._obstacleVignette.addColorStop(1, 'transparent');
            this._obstacleVignetteWidth = w;
            this._obstacleVignetteHeight = h;
        }
        return this._obstacleVignette;
    }

    renderObstacle(ctx, w, h) {
        const game = window.game;
        const ball = game?.ball;
        const obstacles = game?.obstacles || [];
        const course = game?.obstacleCourse || null;
        const grid = course?.grid || {
            left: Math.min(Math.max(72, w * 0.13), w * 0.24),
            right: w - Math.min(Math.max(72, w * 0.13), w * 0.24),
            top: Math.min(Math.max(52, h * 0.12), h * 0.22),
            bottom: h - Math.min(Math.max(48, h * 0.10), h * 0.18),
            cols: w < 760 ? 6 : 8,
            rows: h < 520 ? 5 : 6,
        };
        grid.cellW = grid.cellW || ((grid.right - grid.left) / Math.max(1, grid.cols - 1));
        grid.cellH = grid.cellH || ((grid.bottom - grid.top) / Math.max(1, grid.rows - 1));

        const phase = course?.phase || this.time;
        ctx.save();

        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#061320');
        base.addColorStop(0.52, '#071827');
        base.addColorStop(1, '#030812');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);

        const courtGlow = ctx.createLinearGradient(grid.left, 0, grid.right, 0);
        courtGlow.addColorStop(0, 'rgba(0,255,214,0.02)');
        courtGlow.addColorStop(0.5, 'rgba(80,210,255,0.07)');
        courtGlow.addColorStop(1, 'rgba(255,209,102,0.02)');
        ctx.fillStyle = courtGlow;
        ctx.fillRect(grid.left, grid.top, grid.right - grid.left, grid.bottom - grid.top);

        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(116, 235, 255, 0.14)';
        for (let c = 0; c < grid.cols; c++) {
            const x = grid.left + grid.cellW * c;
            ctx.beginPath();
            ctx.moveTo(x, grid.top);
            ctx.lineTo(x, grid.bottom);
            ctx.stroke();
        }
        for (let r = 0; r < grid.rows; r++) {
            const y = grid.top + grid.cellH * r;
            ctx.beginPath();
            ctx.moveTo(grid.left, y);
            ctx.lineTo(grid.right, y);
            ctx.stroke();
        }

        const sweepCol = Math.floor((phase * 1.4) % Math.max(1, grid.cols));
        ctx.fillStyle = 'rgba(0, 255, 214, 0.035)';
        ctx.fillRect(
            grid.left + grid.cellW * sweepCol - grid.cellW * 0.5,
            grid.top,
            grid.cellW,
            grid.bottom - grid.top
        );

        ctx.fillStyle = 'rgba(180, 250, 255, 0.22)';
        for (let c = 0; c < grid.cols; c++) {
            for (let r = 0; r < grid.rows; r++) {
                ctx.fillRect(
                    grid.left + grid.cellW * c - 1,
                    grid.top + grid.cellH * r - 1,
                    2,
                    2
                );
            }
        }

        ctx.strokeStyle = 'rgba(0, 255, 214, 0.34)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 14]);
        ctx.beginPath();
        ctx.moveTo(w / 2, grid.top);
        ctx.lineTo(w / 2, grid.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(grid.left, grid.top, grid.right - grid.left, grid.bottom - grid.top);

        if (course && typeof course.renderRails === 'function') {
            course.renderRails(ctx);
        }

        for (const obs of obstacles) {
            if (!obs) continue;
            try {
                if (typeof obs.render === 'function') obs.render(ctx);
            } catch (e) {
                console.warn('Obstacle render error', e);
            }
        }

        if (ball) {
            ctx.globalAlpha = Math.min(0.24, 0.08 + (ball._obstacleFieldEnergy || 0) * 0.14);
            ctx.strokeStyle = '#7df9ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ball.pos.x, ball.pos.y, Math.max(16, ball.r * 2.2), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
        this.applyGameplayVisibilityPass(ctx, w, h, 0.04, 0.20);
        return;
        const arena = this._obstacleArenaState || {
            activeCount: 0,
            centerX: w * 0.5,
            centerY: h * 0.5,
            spread: Math.min(w, h) * 0.24,
            energy: 0,
            beat: 0.5,
            flowX: 0,
            flowY: 0,
            spin: 0,
            dominantType: 'none',
        };

        ctx.save();
        const sceneShiftX = arena.flowX * 0.18 + Math.sin(this.time * 0.6 + arena.centerY * 0.01) * (8 + arena.energy * 12);
        const sceneShiftY = arena.flowY * 0.12 + Math.cos(this.time * 0.55 + arena.centerX * 0.01) * (6 + arena.energy * 10);
        const sceneSpin = (arena.flowX - arena.flowY) * 0.0018 + arena.spin * 0.00035;
        const sceneScale = 1 + arena.energy * 0.012;
        ctx.translate(w / 2 + sceneShiftX, h / 2 + sceneShiftY);
        ctx.rotate(sceneSpin);
        ctx.scale(sceneScale, sceneScale);
        ctx.translate(-w / 2, -h / 2);

        // -- 1. BASE COURT --------------------------------------------
        // Neon court backdrop with a cool ping-pong arena feel
        const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
        baseGrad.addColorStop(0, '#04111f');
        baseGrad.addColorStop(0.38, '#071a30');
        baseGrad.addColorStop(0.74, '#050f20');
        baseGrad.addColorStop(1, '#02060f');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, w, h);

        const arenaGlow = ctx.createRadialGradient(arena.centerX, arena.centerY, Math.max(24, Math.min(w, h) * 0.08), arena.centerX, arena.centerY, Math.max(w, h) * (0.42 + arena.energy * 0.14));
        arenaGlow.addColorStop(0, `rgba(0,255,214,${0.10 + arena.energy * 0.16})`);
        arenaGlow.addColorStop(0.4, `rgba(255,78,205,${0.05 + arena.beat * 0.08})`);
        arenaGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = arenaGlow;
        ctx.fillRect(0, 0, w, h);

        // -- 2. BALL HEAT-TRAIL ---------------------------------------
        // Leaves a soft glowing smear where the ball has been
        if (ball) {
            // Initialise the heat canvas once (or when canvas size changes)
            if (!this._heatCanvas ||
                this._heatCanvas.width !== Math.ceil(w / 4) ||
                this._heatCanvas.height !== Math.ceil(h / 4)) {
                this._heatCanvas = document.createElement('canvas');
                this._heatCanvas.width = Math.ceil(w / 4);
                this._heatCanvas.height = Math.ceil(h / 4);
                this._heatCtx = this._heatCanvas.getContext('2d');
            }
            const hc = this._heatCtx;
            const hW = this._heatCanvas.width;
            const hH = this._heatCanvas.height;

            // Decay existing heat
            hc.globalAlpha = 0.93;
            hc.globalCompositeOperation = 'source-over';
            hc.fillStyle = 'rgba(0,0,0,0.06)';
            hc.fillRect(0, 0, hW, hH);

            // Stamp current ball position
            const bx = ball.pos.x * (hW / w);
            const by = ball.pos.y * (hH / h);
            const br = Math.max(4, ball.r * (hW / w) * 3);
            const heatSpot = hc.createRadialGradient(bx, by, 0, bx, by, br);
            heatSpot.addColorStop(0, 'rgba(0,255,214,0.58)');
            heatSpot.addColorStop(0.45, 'rgba(255,78,205,0.28)');
            heatSpot.addColorStop(1, 'transparent');
            hc.globalAlpha = 1;
            hc.globalCompositeOperation = 'lighter';
            hc.fillStyle = heatSpot;
            hc.beginPath();
            hc.arc(bx, by, br, 0, Math.PI * 2);
            hc.fill();

            // Blit heat map onto main canvas
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.globalCompositeOperation = 'screen';
            ctx.drawImage(this._heatCanvas, 0, 0, w, h);
            ctx.restore();
        }

        // -- 3. COURT LANE LINES --------------------------------------
        const midX = w / 2;
        const glowPulse = 0.48 + Math.sin(this.time * 1.4 + arena.beat * 2) * 0.2 + arena.energy * 0.2;

        // Centre seam
        ctx.save();
        ctx.setLineDash([12, 16]);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = `rgba(0,255,214,${glowPulse * 0.46})`;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#00ffd6';
        ctx.lineDashOffset = -this.time * (3.5 + arena.beat * 5.5);
        ctx.beginPath();
        const seamShift = Math.sin(this.time * 1.6 + arena.centerY * 0.01) * (6 + arena.energy * 10);
        ctx.moveTo(midX + seamShift, 0);
        ctx.quadraticCurveTo(midX - seamShift * 0.35, h * 0.5, midX - seamShift * 0.15, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Service lines
        for (const yf of [0.33, 0.67]) {
            const lineY = h * yf;
            ctx.save();
            ctx.setLineDash([10, 18]);
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = yf < 0.5
                ? `rgba(255,78,205,${glowPulse * 0.28})`
                : `rgba(255,211,74,${glowPulse * 0.26})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = yf < 0.5 ? '#ff4ecd' : '#ffd34a';
            ctx.lineDashOffset = this.time * (2.6 + arena.energy * 4.4);
            ctx.beginPath();
            const lineWave = Math.sin(this.time * 1.1 + arena.centerX * 0.01 + yf * 8) * (4 + arena.energy * 6);
            ctx.moveTo(0, lineY + lineWave * 0.2);
            ctx.quadraticCurveTo(w * 0.5, lineY - lineWave, w, lineY + lineWave * 0.2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // -- 4. OBSTACLE INFLUENCE ZONES ------------------------------
        // Each obstacle paints a hazard zone behind itself.
        // The zone pulses when the ball is nearby.
        if (ball) {
            for (const obs of obstacles) {
                if (!obs.active) continue;

                const ocx = obs.cx;
                const ocy = obs.cy;
                const oR = Math.max(obs.w, obs.h) * 0.8;
                const ballDist = Math.hypot(ball.pos.x - ocx, ball.pos.y - ocy);
                const proximity = Math.max(0, 1 - ballDist / (oR * 4));

                if (proximity < 0.03 && obs.glowIntensity < 0.08) continue;

                // Type-based halo colour
                const typeAlpha = 0.14 + proximity * 0.32 + obs.glowIntensity * 0.28;
                const haloColor = obs.colorGlow || obs.colorPrimary || '#00ffd6';

                const zone = ctx.createRadialGradient(ocx, ocy, oR * 0.3, ocx, ocy, oR * 2.5);
                zone.addColorStop(0, `${haloColor}${Math.floor(typeAlpha * 255).toString(16).padStart(2, '0')}`);
                zone.addColorStop(1, 'transparent');

                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = zone;
                ctx.beginPath();
                ctx.arc(ocx, ocy, oR * 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Grid distortion lines near spinners
                if (obs.obstacleType === 'spinner' && proximity > 0.1) {
                    ctx.save();
                    ctx.globalAlpha = proximity * 0.2;
                    ctx.strokeStyle = obs.colorAccent || obs.colorPrimary;
                    ctx.lineWidth = 1;
                    const gridStep = 22;
                    const distRange = oR * 1.8;
                    ctx.beginPath();
                    for (let gx = ocx - distRange; gx < ocx + distRange; gx += gridStep) {
                        const ang = obs.rotation + (gx - ocx) * 0.04;
                        const warp = Math.sin(ang) * proximity * 12;
                        ctx.moveTo(gx, ocy - distRange);
                        ctx.lineTo(gx + warp, ocy + distRange);
                    }
                    for (let gy = ocy - distRange; gy < ocy + distRange; gy += gridStep) {
                        const ang = obs.rotation + (gy - ocy) * 0.04;
                        const warp = Math.cos(ang) * proximity * 12;
                        ctx.moveTo(ocx - distRange, gy + warp);
                        ctx.lineTo(ocx + distRange, gy);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // -- 5. MAGNET FIELD LINES ------------------------------------
        for (const obs of obstacles) {
            if (!obs.active || obs.obstacleType !== 'magnet') continue;
            const ocx = obs.cx;
            const ocy = obs.cy;
            const fieldR = obs.magnetRadius;
            const lineCount = 6;
            ctx.save();
            ctx.globalAlpha = 0.12 + Math.sin(this.time * 2.2 + obs.pulsePhase) * 0.05;
            ctx.strokeStyle = obs.colorAccent || obs.colorPrimary;
            ctx.lineWidth = 1;
            for (let i = 0; i < lineCount; i++) {
                const angle = (i / lineCount) * Math.PI * 2 + this.time * 0.25;
                const innerR = Math.min(obs.w, obs.h) / 2 + 4;
                ctx.beginPath();
                ctx.moveTo(ocx + Math.cos(angle) * innerR, ocy + Math.sin(angle) * innerR);
                ctx.lineTo(ocx + Math.cos(angle) * fieldR, ocy + Math.sin(angle) * fieldR);
                ctx.stroke();
            }
            ctx.restore();
        }

        // -- 5.5 OBSTACLE BACKGROUND LAYER -------------------------
        // Let each obstacle contribute a subtle background halo and propagate lighting
        for (const obs of obstacles) {
            if (!obs) continue;
            try {
                if (typeof obs.propagateCoreLighting === 'function') obs.propagateCoreLighting();
                if (typeof obs.renderBackground === 'function') obs.renderBackground(ctx);
            } catch (e) {
                // defensive: don't let one obstacle break the whole background render
                console.warn('Obstacle background render error', e);
            }
        }

        // Draw full obstacle bodies in the background pass to avoid duplicate drawing
        for (const obs of obstacles) {
            if (!obs) continue;
            try {
                if (typeof obs.render === 'function') obs.render(ctx);
            } catch (e) {
                console.warn('Obstacle render error', e);
            }
        }

        // -- 6. BALL PROXIMITY SHOCKWAVE ------------------------------
        if (ball) {
            const spd = ball._speed || 0;
            const bx = ball.pos.x;
            const by = ball.pos.y;
            const rWave = 20 + spd * 0.04;
            const wAlpha = Math.max(0, 0.12 + (spd / 1400) * 0.22);

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const wave = ctx.createRadialGradient(bx, by, rWave * 0.4, bx, by, rWave);
            wave.addColorStop(0, `rgba(255,255,255,${wAlpha})`);
            wave.addColorStop(0.45, `rgba(0,255,214,${wAlpha * 0.7})`);
            wave.addColorStop(1, 'transparent');
            ctx.fillStyle = wave;
            ctx.beginPath();
            ctx.arc(bx, by, rWave, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // -- 7. SPEED SPARKS (particle layer) ------------------------
        if (areParticleEffectsEnabled() && this.sparkParticles?.length) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < Math.min(6, this.sparkParticles.length); i++) {
                const p = this.sparkParticles[i];
                const life = (this.time * 0.5 + i * 0.1) % 1;
                const py2 = h - (life * h * 0.75);
                const px2 = ((p.x || 0) + Math.sin(this.time + i) * 18) % w;
                ctx.globalAlpha = 0.45 * (1 - life);
                ctx.fillStyle = `hsl(${40 + i * 15}, 100%, 70%)`;
                ctx.fillRect(px2, py2, 2, 2);
            }
            ctx.restore();
        }

        // -- 8. VIGNETTE ----------------------------------------------
        const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.22, w / 2, h / 2, h * 0.85);
        vig.addColorStop(0, 'transparent');
        vig.addColorStop(1, 'rgba(1,4,14,0.68)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();

        this.applyGameplayVisibilityPass(ctx, w, h, 0.05, 0.18);
    }

    applyObstacleGameplayEffects(ball, dt = 1 / 60) {
        const game = window.game;
        if (!game || game.gameMode !== 'obstacle' || !ball) return 0;

        const activeCourseObstacles = game.obstacles || [];
        let courseFieldEnergy = 0;
        for (const obs of activeCourseObstacles) {
            if (!obs?.active) continue;
            const range = Math.max(obs.w, obs.h) * 2.4;
            const dist = Math.hypot(ball.pos.x - obs.cx, ball.pos.y - obs.cy);
            courseFieldEnergy = Math.max(courseFieldEnergy, Math.max(0, 1 - dist / Math.max(1, range)));
        }
        ball._obstacleFieldEnergy = courseFieldEnergy;

        this._obstacleGameplayAccumulator = (this._obstacleGameplayAccumulator || 0) + dt;
        if (this._obstacleGameplayAccumulator < (1 / 60)) {
            return ball._obstacleFieldEnergy || 0;
        }

        const stepDt = this._obstacleGameplayAccumulator;
        this._obstacleGameplayAccumulator = 0;

        const obstacles = game.obstacles || [];
        let fieldEnergy = 0;
        let forceX = 0;
        let forceY = 0;

        for (const obs of obstacles) {
            if (!obs.active) continue;

            const ocx = obs.cx;
            const ocy = obs.cy;
            const dx = ball.pos.x - ocx;
            const dy = ball.pos.y - ocy;
            const dist = Math.hypot(dx, dy) || 0.001;
            const range = Math.max(obs.w, obs.h) * (
                obs.obstacleType === 'spinner' ? 3.4 :
                    obs.obstacleType === 'magnet' ? 3.9 :
                        obs.obstacleType === 'repulsor' ? 3.2 :
                            2.9
            );

            if (dist >= range) continue;

            const proximity = 1 - dist / range;
            const nx = dx / dist;
            const ny = dy / dist;
            fieldEnergy = Math.max(fieldEnergy, proximity);

            switch (obs.obstacleType) {
                case 'bumper': {
                    const repulse = 300 * proximity * proximity;
                    forceX += nx * repulse;
                    forceY += ny * repulse;
                    ball.spin += nx * proximity * stepDt * 0.9;
                    break;
                }
                case 'repulsor': {
                    const repulse = 260 * proximity * (0.7 + proximity);
                    forceX += nx * repulse;
                    forceY += ny * repulse;
                    break;
                }
                case 'wall': {
                    const swirlX = -ny;
                    const swirlY = nx;
                    const swirlDir = ((ball.pos.x - ocx) * swirlX + (ball.pos.y - ocy) * swirlY) >= 0 ? 1 : -1;
                    const shear = 180 * proximity * (0.55 + proximity);
                    forceX += swirlX * shear * swirlDir + nx * 36 * proximity;
                    forceY += swirlY * shear * swirlDir + ny * 36 * proximity;
                    break;
                }
                case 'spinner': {
                    const spinDir = obs.rotationSpeed >= 0 ? 1 : -1;
                    const swirl = 340 * proximity * (0.45 + Math.abs(obs.rotationSpeed) * 0.12);
                    forceX += (-ny * spinDir) * swirl + nx * 32 * proximity;
                    forceY += (nx * spinDir) * swirl + ny * 32 * proximity;
                    ball.spin += spinDir * proximity * stepDt * 1.1;
                    break;
                }
                case 'magnet': {
                    const pull = 240 * proximity * (0.5 + proximity);
                    forceX -= nx * pull;
                    forceY -= ny * pull;
                    break;
                }
            }
        }

        const centerPull = Math.max(0, 1 - Math.abs(ball.pos.x - game.width * 0.5) / (game.width * 0.35));
        if (centerPull > 0) {
            const towardCenter = Math.sign(game.width * 0.5 - ball.pos.x) || 1;
            forceX += towardCenter * 42 * centerPull;
            fieldEnergy = Math.max(fieldEnergy, centerPull * 0.65);
        }

        if (fieldEnergy > 0.001) {
            const timeWobble = Math.sin(this.time * 2.2 + ball.pos.y * 0.02) * 16 * fieldEnergy;
            forceX += timeWobble * 0.28;
            forceY += Math.cos(this.time * 1.8 + ball.pos.x * 0.02) * 10 * fieldEnergy;

            ball.vel.x += forceX * stepDt;
            ball.vel.y += forceY * stepDt;
            ball._obstacleFieldEnergy = Math.max(ball._obstacleFieldEnergy || 0, fieldEnergy);
            if (typeof game.screenShake === 'number') {
                game.screenShake = Math.max(game.screenShake, fieldEnergy * 1.9);
            }
        } else if (ball._obstacleFieldEnergy) {
            ball._obstacleFieldEnergy = Math.max(0, ball._obstacleFieldEnergy - stepDt * 1.5);
        }

        return fieldEnergy;
    }
    _renderObstacleRingAndSea(rCtx, w, h) { return h * 0.8; }
    _ensureObstacleDynamicSprites() { }
    _ensureObstacleShimmerSprite() { }
    _ensureObstacleStaticOverlayLayer() { }
    syncObstacleArenaState(obstacles = [], ball = null, game = null, dt = 1 / 60) {
        const activeObstacles = Array.isArray(obstacles) ? obstacles.filter(obs => obs?.active) : [];
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        const lerp = (from, to, amount) => from + (to - from) * amount;

        if (!this._obstacleArenaState) {
            this._obstacleArenaState = {
                activeCount: 0,
                centerX: this.width * 0.5,
                centerY: this.height * 0.5,
                spread: Math.min(this.width, this.height) * 0.24,
                energy: 0,
                beat: 0.5,
                flowX: 0,
                flowY: 0,
                spin: 0,
                dominantType: 'none',
            };
        }

        const state = this._obstacleArenaState;
        if (!activeObstacles.length) {
            state.activeCount = 0;
            state.energy = Math.max(0, state.energy - dt * 1.2);
            state.beat = lerp(state.beat, 0.5 + Math.sin(this.time * 1.15) * 0.08, Math.min(1, 0.08 + dt * 1.4));
            state.flowX *= Math.pow(0.88, dt * 60);
            state.flowY *= Math.pow(0.88, dt * 60);
            state.spin *= Math.pow(0.90, dt * 60);
            state.dominantType = 'none';
            return state;
        }

        let weightSum = 0;
        let centerX = 0;
        let centerY = 0;
        const typeCounts = { bumper: 0, wall: 0, spinner: 0, magnet: 0 };

        for (const obs of activeObstacles) {
            const glow = clamp(0.45 + (obs.glowIntensity || 0) * 1.2 + (obs.hitFlash || 0) * 0.3, 0.45, 2.0);
            const typeWeight = obs.obstacleType === 'spinner' ? 1.4
                : obs.obstacleType === 'magnet' ? 1.2
                    : obs.obstacleType === 'wall' ? 1.05
                        : 0.95;
            const weight = glow * typeWeight;
            weightSum += weight;
            centerX += obs.cx * weight;
            centerY += obs.cy * weight;
            typeCounts[obs.obstacleType] = (typeCounts[obs.obstacleType] || 0) + 1;
        }

        if (weightSum <= 0.001) {
            centerX = this.width * 0.5;
            centerY = this.height * 0.5;
            weightSum = 1;
        }

        centerX /= weightSum;
        centerY /= weightSum;

        let spread = 0;
        let flowX = 0;
        let flowY = 0;
        let spin = 0;
        let proximity = 0;

        for (const obs of activeObstacles) {
            const glow = clamp(0.45 + (obs.glowIntensity || 0) * 1.2 + (obs.hitFlash || 0) * 0.3, 0.45, 2.0);
            const typeWeight = obs.obstacleType === 'spinner' ? 1.4
                : obs.obstacleType === 'magnet' ? 1.2
                    : obs.obstacleType === 'wall' ? 1.05
                        : 0.95;
            const weight = glow * typeWeight;

            const dx = obs.cx - centerX;
            const dy = obs.cy - centerY;
            spread += Math.hypot(dx, dy) * weight;
            flowX += (obs.driftVel?.x || 0) * weight;
            flowY += (obs.driftVel?.y || 0) * weight;
            spin += (obs.rotationSpeed || 0) * (obs.obstacleType === 'spinner' ? 1.5 : 0.25) * weight;

            if (ball) {
                const bx = ball.pos.x - obs.cx;
                const by = ball.pos.y - obs.cy;
                const dist = Math.hypot(bx, by);
                const range = Math.max(obs.w, obs.h) * (
                    obs.obstacleType === 'spinner' ? 3.4 :
                        obs.obstacleType === 'magnet' ? 3.9 :
                            2.9
                );
                proximity = Math.max(proximity, Math.max(0, 1 - dist / range));
            }
        }

        spread /= weightSum;
        flowX /= weightSum;
        flowY /= weightSum;
        spin /= weightSum;

        const crowd = clamp(activeObstacles.length / 8, 0, 1);
        const spreadNorm = clamp(spread / Math.max(1, Math.min(this.width, this.height) * 0.45), 0, 1);
        const motionNorm = clamp(Math.hypot(flowX, flowY) / 120, 0, 1);
        const spinNorm = clamp(Math.abs(spin) / 2.5, 0, 1);
        const targetEnergy = clamp(
            0.16 + proximity * 0.46 + crowd * 0.18 + spreadNorm * 0.16 + motionNorm * 0.14 + spinNorm * 0.08,
            0,
            1
        );
        const beatTarget = 0.5 + 0.5 * Math.sin(
            this.time * (1.2 + targetEnergy * 0.9) +
            centerX * 0.004 +
            centerY * 0.003 +
            spin * 0.08
        );

        state.activeCount = activeObstacles.length;
        state.centerX = lerp(state.centerX, centerX, Math.min(1, 0.08 + dt * 2.2));
        state.centerY = lerp(state.centerY, centerY, Math.min(1, 0.08 + dt * 2.2));
        state.spread = lerp(state.spread, spread, Math.min(1, 0.10 + dt * 1.8));
        state.flowX = lerp(state.flowX, flowX, Math.min(1, 0.12 + dt * 2.4));
        state.flowY = lerp(state.flowY, flowY, Math.min(1, 0.12 + dt * 2.4));
        state.spin = lerp(state.spin, spin, Math.min(1, 0.10 + dt * 2.0));
        state.energy = lerp(state.energy, targetEnergy, Math.min(1, 0.07 + dt * 1.5));
        state.beat = lerp(state.beat, beatTarget, Math.min(1, 0.14 + dt * 2.0));
        state.energy = clamp(state.energy, 0, 1);
        state.beat = clamp(state.beat, 0, 1);
        state.dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
        state.lastUpdate = this.time;
        return state;
    }
    _buildSpeedCity() { /* no-op */ }
    _buildWindowList() { /* no-op */ }
    _buildNeonSigns() { /* no-op */ }
    _buildFarCanvas() { /* no-op */ }
    _buildCityLights() { /* no-op */ }

    _cleanupZombieCache() {
        this._zombieStaticCanvas = null;
        this._zombieStaticCtx = null;
        this._zombieStaticInitialized = false;
    }

    _cleanupGravityCache() {
        this._gravityStaticCanvas = null;
        this._gravityStaticCtx = null;
    }

    _cleanupObstacleCache() {
        this._obstacleStaticBaseCanvas = null;
        this._obstacleStaticBaseCtx = null;
        this._obstacleStaticOverlayCanvas = null;
        this._obstacleStaticOverlayCtx = null;
        this._obstacleShimmerSprite = null;
        this._obstacleShimmerRadius = 0;
        this._obstacleVignette = null;
        this._obstacleArenaState = null;
    }

    _cleanupSpeedCache() {
        this._buildingData = null;
        this._windowList = null;
        this._neonSigns = null;
        this._farCanvas = null;
        this._farCtx = null;
        this._splashes = [];
    }

    // ------------------------------------------------------------------
    // PERFORMANCE CONTROLS
    // ------------------------------------------------------------------
    toggleDynamicLights(enabled) {
        this.dynamicLights = enabled !== undefined ? enabled : !this.dynamicLights;
    }

    setLightIntensity(multiplier) {
        this.lightIntensityMultiplier = multiplier;
    }
}


// ===================================================================
// PARTICLE CLASS - cartoony & short-lived edition
// ===================================================================
