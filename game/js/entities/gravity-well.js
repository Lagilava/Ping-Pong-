class GravityWell {
    #pos;
    #strength;
    #baseRadius;
    #origStrength;
    #origBaseRadius;
    #radius;
    #active;
    #angle;
    #speed;
    #dir;
    #pulsePhase;
    #excitement;
    #id;
    #isAffectingBall;
    #lastRenderTime = 0;
    #diskPoints = [];
    #particles = []; // Event horizon particles
    #movementAngle; // Internal angle for velocity vector
    #rotationalDir; // Current spin direction
    #frameCanvas;
    #frameCtx;
    #frameTime = -Infinity;
    #frameBaseRadius = 0;

    // Reduced lighting properties
    #lightAngle = 0;
    #lightIntensity = 1;

    // Cached vector paths
    #diskPath;

    #soundEventListeners = new Map();
    #pullRadius = 0;
    #pullRadiusSq = 0;
    #ringLineWidths = [];

    static MIN_DISTANCE_SQ = 400;

    static COLORS = {
        EVENT_HORIZON: "#03050d",
        ACCRETION_DISK_HOT: "#dcf6ff",
        ACCRETION_DISK_COOL: "#4c1b9a",
        SPIRAL_ARM: "rgba(158, 200, 255, 0.34)",
        CORE_GLOW: "rgba(118, 178, 255, 0.48)",
        HALO_GLOW: "rgba(119, 88, 255, 0.34)",
        LENS_RING: "rgba(235, 246, 255, 0.9)",
        ACCENT: "rgba(102, 236, 255, 0.82)",
        INNER_SHADOW: "rgba(4, 8, 20, 0.98)"
    };

    constructor(x, y, strength = 900) {
        this.#pos = new Vec2(x, y);

        // Store originals so we can rescale reliably on resize
        // INCREASED: strength increased from 900 and base radius from 90
        this.#origStrength = strength * 3;
        this.#origBaseRadius = 130;

        // Scale based on canvas size so wells feel consistent across screens
        const BASE_AREA = 1280 * 720;
        const w = (window.game && window.game.width) || window.innerWidth || 1280;
        const h = (window.game && window.game.height) || window.innerHeight || 720;
        let scale = Math.sqrt((w * h) / BASE_AREA);
        scale = Math.max(0.6, Math.min(1.6, scale));

        this.#baseRadius = Math.max(39, Math.round(this.#origBaseRadius * scale));
        this.#radius = this.#baseRadius;
        this.#strength = Math.max(120, Math.round(this.#origStrength * scale));

        this.#active = true;

        this.#angle = Math.random() * Math.PI * 2;
        this.#movementAngle = this.#angle; // Start movement matching visual spin
        this.#speed = 15 + Math.random() * 30;
        this.#rotationalDir = Math.random() > 0.5 ? 1 : -1;
        this.#dir = this.#rotationalDir;
        this.#pulsePhase = Math.random() * 10;
        this.#excitement = 0;
        this.#lightAngle = Math.random() * Math.PI * 2;

        this.#id = Math.random().toString(36).substr(2, 9);
        this.#isAffectingBall = false;
        this.#pullRadius = this.#radius * 1.5;
        this.#pullRadiusSq = this.#pullRadius * this.#pullRadius;
        this.#diskPoints = this.#createAccretionDiskPoints();

        // Initialize local particles
        for (let i = 0; i < 4; i++) {
            this.#particles.push(this.#createParticle());
        }
    }

    // Forge arenas place wells by hand: keep them where the builder put them.
    pin() {
        this.#speed = 0;
    }

    #createParticle() {
        const angle = Math.random() * Math.PI * 2;
        const dist = this.#baseRadius * (1.5 + Math.random() * 2);
        return {
            angle,
            dist,
            speed: 0.5 + Math.random() * 2,
            size: 1 + Math.random() * 3,
            alpha: 0.1 + Math.random() * 0.5
        };
    }

    // Recompute radius/strength if canvas size changes
    #rescaleIfNeeded() {
        const BASE_AREA = 1280 * 720;
        const w = (window.game && window.game.width) || window.innerWidth || 1280;
        const h = (window.game && window.game.height) || window.innerHeight || 720;
        let scale = Math.sqrt((w * h) / BASE_AREA);
        scale = Math.max(0.6, Math.min(1.6, scale));

        const newBase = Math.max(39, Math.round(this.#origBaseRadius * scale));
        const newStrength = Math.max(180, Math.round(this.#origStrength * scale));

        if (Math.abs(newBase - this.#baseRadius) > 1 || Math.abs(newStrength - this.#strength) > 4) {
            this.#baseRadius = newBase;
            this.#radius = Math.max(this.#radius, this.#baseRadius);
            this.#strength = newStrength;
            // Rebuild cached geometry to match the new surface size
            this.#diskPoints = this.#createAccretionDiskPoints();
        }
    }

    // Getters & setters
    get pos() { return this.#pos; }
    get strength() { return this.#strength; }
    get radius() { return this.#radius; }
    get active() { return this.#active; }
    get excitement() { return this.#excitement; }
    get id() { return this.#id; }

    set active(value) { this.#active = Boolean(value); }
    set strength(value) { this.#strength = Math.max(0, Number(value)); }

    // Full excitement burst (a wormhole swallowed or released the ball here).
    flare() { this.#excitement = 1; }

    isBallInRange(ball) {
        if (!ball?.pos) return false;
        const dx = this.#pos.x - ball.pos.x;
        const dy = this.#pos.y - ball.pos.y;
        return (dx * dx + dy * dy) < this.#pullRadiusSq;
    }

    update(dt, ball = null) {
        // Keep sizing in sync with canvas and then update local state
        try { this.#rescaleIfNeeded(); } catch (e) { /* ignore */ }
        this.#updateMovement(dt);
        this.#updatePulsing(dt);
        this.#updateExcitement(dt, ball);
        this.#updateLighting(dt);

        if (!areParticleEffectsEnabled()) return;

        // Keep particle work tiny so gravity mode stays smooth on weak CPUs.
        const excit = this.#excitement;
        for (let i = 0; i < this.#particles.length; i++) {
            const p = this.#particles[i];
            p.angle += (p.speed + excit * 2) * dt * this.#dir;
            p.dist -= (0.08 + excit * 0.2) * dt * this.#baseRadius;
            if (p.dist < this.#baseRadius * 0.35) {
                Object.assign(p, this.#createParticle());
            }
        }
    }

    #updateMovement(dt) {
        // 1. Separate Visual Spin from Physical Velocity
        // Visual spin is constant and doesn't snap on wall hits
        this.#angle += dt * this.#rotationalDir * 0.4;

        // 2. Continuous velocity vector for smooth bouncing
        let vx = Math.cos(this.#movementAngle) * this.#speed;
        let vy = Math.sin(this.#movementAngle) * this.#speed;

        this.#pos.x += vx * dt;
        this.#pos.y += vy * dt;

        const margin = this.#radius + 30;
        const bounds = {
            left: margin,
            right: (window.game?.width || 800) - margin,
            top: margin,
            bottom: (window.game?.height || 600) - margin
        };

        let bounced = false;
        // Precise reflection logic
        if (this.#pos.x < bounds.left) {
            this.#pos.x = bounds.left;
            vx = Math.abs(vx); // Ensure x-velocity is positive
            bounced = true;
        } else if (this.#pos.x > bounds.right) {
            this.#pos.x = bounds.right;
            vx = -Math.abs(vx); // Ensure x-velocity is negative
            bounced = true;
        }

        if (this.#pos.y < bounds.top) {
            this.#pos.y = bounds.top;
            vy = Math.abs(vy); // Ensure y-velocity is positive
            bounced = true;
        } else if (this.#pos.y > bounds.bottom) {
            this.#pos.y = bounds.bottom;
            vy = -Math.abs(vy); // Ensure y-velocity is negative
            bounced = true;
        }

        if (bounced) {
            // Update physical movement angle based on new velocity reflection
            this.#movementAngle = Math.atan2(vy, vx);
        }
    }

    #updatePulsing(dt) {
        this.#pulsePhase += dt * 2.0;
        this.#radius = this.#baseRadius + Math.sin(this.#pulsePhase) * 4;
        this.#pullRadius = this.#radius * 1.5;
        this.#pullRadiusSq = this.#pullRadius * this.#pullRadius;
    }

    #updateLighting(dt) {
        this.#lightAngle += dt * 0.3;
        this.#lightIntensity = 0.8 + this.#excitement * 0.4;
    }

    #updateExcitement(dt, ball) {
        if (!ball?.pos) return;
        const dx = this.#pos.x - ball.pos.x;
        const dy = this.#pos.y - ball.pos.y;
        const distSq = dx * dx + dy * dy;
        const pulling = distSq < this.#pullRadiusSq * 0.72;
        this.#excitement += (pulling ? 3.0 : -1.5) * dt;
        this.#excitement = Math.max(0, Math.min(1, this.#excitement));
    }

    applyGravity(ball, dt, emitSound = true) {
        if (!this.#active || !ball?.pos || !ball?.vel) return;
        const dx = this.#pos.x - ball.pos.x;
        const dy = this.#pos.y - ball.pos.y;
        const distSq = dx * dx + dy * dy;
        const inPullRange = distSq < this.#pullRadiusSq;
        const inForceRange = inPullRange && distSq > GravityWell.MIN_DISTANCE_SQ;
        let currentlyAffecting = false;

        if (inForceRange) {
            PhysicsCore.gravityWell(ball, this.#pos.x, this.#pos.y,
                this.#pullRadiusSq, this.#strength, dt, GravityWell.MIN_DISTANCE_SQ);
        }

        currentlyAffecting = inPullRange;

        if (emitSound && currentlyAffecting !== this.#isAffectingBall) {
            this.#isAffectingBall = currentlyAffecting;
            this.#emitSoundEvent(currentlyAffecting ? 'start' : 'stop');
        }
    }

    // Fixed-size maps are shared by every well, including Forge wells.
    // Movement and pulse still render every frame; soft gradients are baked once.
    static #glowSprites = new Map();

    static #sprite(kind) {
        if (this.#glowSprites.has(kind)) return this.#glowSprites.get(kind);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const stops = {
            bloom: [[0, 'rgba(185,225,255,0.28)'], [0.45, 'rgba(118,178,255,0.16)'], [1, 'transparent']],
            core: [[0, 'rgba(18,24,48,0)'], [0.55, 'rgba(18,24,48,0)'], [0.76, GravityWell.COLORS.CORE_GLOW], [0.9, 'rgba(195,230,255,0.18)'], [1, 'transparent']],
            horizon: [[0, '#000'], [0.7, 'rgba(3,5,13,0.98)'], [1, 'rgba(10,18,40,0.1)']],
            burst: [[0, 'rgba(215,240,255,0.75)'], [0.35, 'rgba(118,178,255,0.28)'], [1, 'transparent']]
        };
        const gradient = ctx.createRadialGradient(128, 128, kind === 'core' ? 32 : 0, 128, 128, 128);
        for (const [at, color] of stops[kind]) gradient.addColorStop(at, color);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(128, 128, 128, 0, Math.PI * 2);
        ctx.fill();
        this.#glowSprites.set(kind, canvas);
        return canvas;
    }

    #drawGlow(ctx, kind, radius, alpha, screen = true) {
        const sprite = GravityWell.#sprite(kind);
        if (!sprite) return;
        ctx.save();
        if (screen) ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha *= alpha;
        ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
        ctx.restore();
    }

    #renderLightBloom(ctx, pulse, excit, intensity = this.#lightIntensity) {
        this.#drawGlow(ctx, 'bloom', this.#radius * (1.8 + excit * 0.2) * pulse,
            0.3 * intensity * (1 + excit * 0.2));
    }

    #renderCoreGlow(ctx, pulse, excit) {
        this.#drawGlow(ctx, 'core', this.#radius * pulse * 1.2, 0.75 + excit * 0.2);
    }

    #renderEventHorizon(ctx, pulse, excit) {
        this.#drawGlow(ctx, 'horizon', this.#radius * pulse, 1, false);
    }

    render(ctx, timeOverride) {
        if (!this.#active) return;
        const time = typeof timeOverride === 'number' ? timeOverride : performance.now() * 0.001;
        if (window.GravityArt?.drawWell(ctx, this.#pos.x, this.#pos.y, this.#radius, time, this.#excitement, this.#rotationalDir, this.#id.length + (parseInt(this.#id.slice(0,4),36)||0)*.0001)) return;
        if (!this.#frameCanvas) {
            this.#frameCanvas = document.createElement('canvas');
            this.#frameCanvas.width = this.#frameCanvas.height = 384;
            this.#frameCtx = this.#frameCanvas.getContext('2d');
        }
        const frame = this.#frameCtx;
        if (!frame) { this.#paint(ctx, time); return; }
        const extent = this.#baseRadius * 3.6;
        if (time < this.#frameTime || time - this.#frameTime >= 1 / 30 || this.#frameBaseRadius !== this.#baseRadius) {
            frame.setTransform(1, 0, 0, 1, 0, 0);
            frame.clearRect(0, 0, 384, 384);
            const scale = 384 / (extent * 2);
            frame.setTransform(scale, 0, 0, scale, 192 - this.#pos.x * scale, 192 - this.#pos.y * scale);
            this.#paint(frame, time);
            this.#frameTime = time;
            this.#frameBaseRadius = this.#baseRadius;
        }
        ctx.drawImage(this.#frameCanvas, this.#pos.x - extent, this.#pos.y - extent, extent * 2, extent * 2);
    }

    #paint(ctx, timeOverride) {
        if (!this.#active) return;

        const time = typeof timeOverride === 'number' ? timeOverride : performance.now() * 0.001;
        this.#lastRenderTime = time * 1000;
        const gravityInteraction = window.game?.gravityInteraction || null;
        const sharedPulse = gravityInteraction ? 1 + (gravityInteraction.ambient || 0) * 0.08 : 1;
        const sharedExcitement = gravityInteraction
            ? Math.min(1, this.#excitement + (gravityInteraction.proximity || 0) * 0.35)
            : this.#excitement;
        const sharedIntensity = this.#lightIntensity * (1 + (gravityInteraction?.ambient || 0) * 0.18);

        ctx.save();

        // PERFORMANCE FIX: Replace heavy SVG Filter with light Canvas Blur/Glow
        ctx.translate(this.#pos.x, this.#pos.y);

        const pulse = (1 + 0.15 * Math.sin(this.#pulsePhase)) * sharedPulse;
        const excit = sharedExcitement;

        // VISUAL UPGRADE: Add a subtle rotating space ripple (No SVG filter required)
        ctx.save();
        const rippleScale = 1.0 + Math.sin(time * 1.5) * 0.05;
        ctx.scale(rippleScale, rippleScale);
        this.#renderLightBloom(ctx, pulse, excit, sharedIntensity);
        ctx.restore();

        this.#renderCoreGlow(ctx, pulse, excit);
        this.#renderEventHorizon(ctx, pulse, excit);
        window.SurfaceTextures?.well(ctx, 0, 0, this.#radius * pulse, time, 0.85 + excit * 0.3);

        // Intensity burst (Visual pop without blur overhead)
        if (excit > 0.8) {
            this.#drawGlow(ctx, 'burst', this.#radius * 3, (excit - 0.8) * 0.3);
        }

        ctx.restore();
    }

    onSoundEvent(eventType, callback) {
        if (!this.#soundEventListeners.has(eventType)) this.#soundEventListeners.set(eventType, []);
        this.#soundEventListeners.get(eventType).push(callback);
    }

    #emitSoundEvent(type) {
        const listeners = this.#soundEventListeners.get(type) || [];
        listeners.forEach(cb => cb(this.#id, this.#strength));
        if (type === 'start' && window.game?.audio?.startGravityWellSound)
            window.game.audio.startGravityWellSound(this.#id, this.#strength);
        else if (type === 'stop' && window.game?.audio?.stopGravityWellSound)
            window.game.audio.stopGravityWellSound(this.#id);
    }

    #createAccretionDiskPoints() {
        const points = [];
        const r = this.#baseRadius;
        const count = 12; // Plasma hotspots (reduced for stable frame cost)

        for (let i = 0; i < count; i++) {
            const dist = r * (1.1 + Math.random() * 1.5);
            const baseAngle = Math.random() * Math.PI * 2;
            const speed = 1.0 + Math.random() * 2.5; // Differing orbital speeds

            const hue = 180 + Math.random() * 40; // Range from Cyan to Blue
            const lightness = 70 + Math.random() * 30;

            points.push({
                dist,
                baseAngle,
                speed,
                size: 1.5 + Math.random() * 3.5,
                color: `hsla(${hue}, 100%, ${lightness}%, 0.9)`,
                alpha: 0.3 + Math.random() * 0.7
            });
        }
        return points;
    }
}

// Ball

