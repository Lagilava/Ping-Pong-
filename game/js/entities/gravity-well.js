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
            if (window.WasmPhysics?.ready && typeof window.WasmPhysics.applyGravityWell === 'function') {
                window.WasmPhysics.applyGravityWell(
                    ball,
                    this.#pos.x,
                    this.#pos.y,
                    this.#pullRadiusSq,
                    this.#strength,
                    dt,
                    GravityWell.MIN_DISTANCE_SQ
                );
            } else {
                const invDist = 1 / Math.sqrt(distSq);
                const pullRatio = Math.max(0, 1 - (distSq / this.#pullRadiusSq));
                const smooth = pullRatio * pullRatio;
                const forceCap = Math.max(420, Math.min(1600, this.#strength * 0.06));
                const force = Math.min(this.#strength * smooth, forceCap);
                const accel = force * dt;

                ball.vel.x += dx * invDist * accel;
                ball.vel.y += dy * invDist * accel;

                // Hard clamp to keep the gravity step from ever exploding.
                const ballSpeedSq = ball.vel.x * ball.vel.x + ball.vel.y * ball.vel.y;
                const maxSpeed = ball.maxSpeed || 1400;
                const maxSpeedSq = maxSpeed * maxSpeed;
                if (ballSpeedSq > maxSpeedSq) {
                    const scale = maxSpeed / Math.sqrt(ballSpeedSq);
                    ball.vel.x *= scale;
                    ball.vel.y *= scale;
                }
            }
        }

        currentlyAffecting = inPullRange;

        if (emitSound && currentlyAffecting !== this.#isAffectingBall) {
            this.#isAffectingBall = currentlyAffecting;
            this.#emitSoundEvent(currentlyAffecting ? 'start' : 'stop');
        }
    }

    #renderLightBloom(ctx, pulse, excit, intensity = this.#lightIntensity) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.3 * intensity;

        const radius = this.#radius * (1.8 + excit * 0.2) * pulse;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, `rgba(185, 225, 255, ${0.28 + excit * 0.12})`);
        grad.addColorStop(0.45, 'rgba(118, 178, 255, 0.16)');
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    #renderCoreGlow(ctx, pulse, excit) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const glowRadius = this.#radius * pulse * 1.2;
        const coreGrad = ctx.createRadialGradient(0, 0, this.#radius * 0.3, 0, 0, glowRadius);
        coreGrad.addColorStop(0, 'rgba(18, 24, 48, 0)');
        coreGrad.addColorStop(0.55, 'rgba(18, 24, 48, 0)');
        coreGrad.addColorStop(0.76, GravityWell.COLORS.CORE_GLOW);
        coreGrad.addColorStop(0.9, 'rgba(195, 230, 255, 0.18)');
        coreGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = 0.75 + excit * 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    #renderEventHorizon(ctx, pulse, excit) {
        ctx.save();
        const radius = this.#radius * pulse;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.7, 'rgba(3, 5, 13, 0.98)');
        grad.addColorStop(1, 'rgba(10, 18, 40, 0.1)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    render(ctx, timeOverride) {
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
        ctx.rotate(time * 0.2);
        const rippleScale = 1.0 + Math.sin(time * 1.5) * 0.05;
        ctx.scale(rippleScale, rippleScale);
        this.#renderLightBloom(ctx, pulse, excit, sharedIntensity);
        ctx.restore();

        this.#renderCoreGlow(ctx, pulse, excit);
        this.#renderEventHorizon(ctx, pulse, excit);

        // Intensity burst (Visual pop without blur overhead)
        if (excit > 0.8) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = (excit - 0.8) * 0.3;

            const burstGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.#radius * 3);
            burstGrad.addColorStop(0, 'rgba(215, 240, 255, 0.75)');
            burstGrad.addColorStop(0.35, 'rgba(118, 178, 255, 0.28)');
            burstGrad.addColorStop(1, 'transparent');

            ctx.fillStyle = burstGrad;
            ctx.beginPath();
            ctx.arc(0, 0, this.#radius * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
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
