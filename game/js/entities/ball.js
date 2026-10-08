class Ball {
    constructor(x, y, r = 10) {
        this.pos = new Vec2(x, y);
        this.prev = this.pos.copy();
        this.vel = new Vec2(0, 0);
        this.r = r;
        this.maxSpeed = 1400;
        this.minSpeed = 300;
        this.spin = 0;
        this.lastHit = null;
        this.baseSpeed = 560;

        // Trail optimization - store as Float32Array for better memory layout
        this.trailPoints = new Float32Array(2 * 64); // [x1, y1, x2, y2, ...]
        this.trailCount = 0;
        this.maxTrailPoints = 22;

        // Cache frequently used values
        this._speed = 0;
        this._renderCache = {
            ballGradient: null,
            trailGradient: null,
            lastRadius: 0,
            lastSpeed: 0
        };

        // Reusable objects to avoid allocations
        this._tempVec = new Vec2();
        this._tempPoint = { x: 0, y: 0 };

        // Particle system (simplified version to reduce overhead)
        this.particles = [];
        this.maxParticles = 8; // Reduced from default

        this.customBallColor = null;
        this.customTrailColor = null;
        this.customGlowTint = null;
        this.customImageSource = '';
        this.customImage = null;
        this.customImageLoaded = false;
        this.customImageError = false;
        this.customImageOpacity = 0.85;
        this.customImageBlendMode = 'screen';
        this.customImageFit = 'cover';
        this.customImageScale = 1;
        this.customEffectMode = 'custom';
        this.customEffectCode = '';
        this.customEffectFn = null;
        this.customEffectError = '';
        this.studioActive = false;
        this.studioSavedColors = null;
    }

    setCustomColors(options = {}) {
        this.customBallColor = options.ballColor || null;
        this.customTrailColor = options.trailColor || null;
    }

    setStudioConfig(config = {}) {
        const nextConfig = config && typeof config === 'object' ? config : {};
        if (!this.studioActive) {
            this.studioSavedColors = {
                ballColor: this.customBallColor,
                trailColor: this.customTrailColor,
            };
        }
        this.studioActive = true;

        this.setCustomColors({
            ballColor: nextConfig.ballColor,
            trailColor: nextConfig.trailColor,
        });
        this.customGlowTint = typeof nextConfig.glowTint === 'string' && nextConfig.glowTint.trim()
            ? nextConfig.glowTint.trim()
            : null;

        this.customImageOpacity = Number.isFinite(Number(nextConfig.imageOpacity))
            ? Math.max(0, Math.min(1, Number(nextConfig.imageOpacity)))
            : 0.85;
        this.customImageBlendMode = typeof nextConfig.imageBlendMode === 'string' && nextConfig.imageBlendMode.trim()
            ? nextConfig.imageBlendMode.trim()
            : 'screen';
        this.customImageFit = nextConfig.imageFit === 'contain' ? 'contain' : 'cover';
        this.customImageScale = Number.isFinite(Number(nextConfig.imageScale))
            ? Math.max(0.5, Math.min(3, Number(nextConfig.imageScale)))
            : 1;

        this.customEffectMode = 'custom';
        const source = typeof nextConfig.imageSrc === 'string' ? nextConfig.imageSrc.trim() : '';
        if (source !== this.customImageSource) {
            this.customImageSource = source;
            this.customImage = null;
            this.customImageLoaded = false;
            this.customImageError = false;

            if (source) {
                const image = new Image();
                image.decoding = 'async';
                image.onload = () => {
                    if (this.customImage === image) {
                        this.customImageLoaded = true;
                        this._renderCache.ballGradient = null;
                    }
                };
                image.onerror = () => {
                    if (this.customImage === image) {
                        this.customImageLoaded = false;
                        this.customImageError = true;
                    }
                };
                image.src = source;
                this.customImage = image;
            }
        }

        this.customEffectCode = typeof nextConfig.effectCode === 'string' ? nextConfig.effectCode : '';
        this._compileStudioEffect(this.customEffectCode);
    }

    clearStudioConfig() {
        if (this.studioActive && this.studioSavedColors) {
            this.setCustomColors(this.studioSavedColors);
        }
        this.customImageSource = '';
        this.customImage = null;
        this.customImageLoaded = false;
        this.customImageError = false;
        this.customImageOpacity = 0.85;
        this.customImageBlendMode = 'screen';
        this.customImageFit = 'cover';
        this.customImageScale = 1;
        this.customEffectMode = 'custom';
        this.customEffectCode = '';
        this.customEffectFn = null;
        this.customEffectError = '';
        this.customGlowTint = null;
        this.studioActive = false;
        this.studioSavedColors = null;
    }

    _compileStudioEffect(code) {
        this.customEffectError = '';
        this.customEffectFn = null;

        const trimmed = (code || '').trim();
        if (!trimmed) return;

        try {
            this.customEffectFn = new Function('ctx', 'ball', 'time', 'api', trimmed);
        } catch (error) {
            this.customEffectError = error?.message || String(error);
        }
    }

    _drawStudioImage(ctx, scale = 1) {
        const image = this.customImage;
        if (!image || !this.customImageLoaded || !image.naturalWidth || !image.naturalHeight) {
            return;
        }

        const baseSize = this.r * 2 * Math.max(0.5, scale);
        const drawSize = Math.max(4, baseSize);

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.customImageOpacity));
        ctx.globalCompositeOperation = this.customImageBlendMode || 'screen';

        if (this.customImageFit === 'contain') {
            const imageAspect = image.naturalWidth / image.naturalHeight;
            const targetAspect = 1;
            let drawW = drawSize;
            let drawH = drawSize;

            if (imageAspect > targetAspect) {
                drawH = drawSize / imageAspect;
            } else {
                drawW = drawSize * imageAspect;
            }

            ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            this._drawImageCover(ctx, image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }

        ctx.restore();
    }

    _drawImageCover(ctx, image, dx, dy, dw, dh) {
        if (!image || !image.naturalWidth || !image.naturalHeight) return;

        const sourceRatio = image.naturalWidth / image.naturalHeight;
        const destRatio = dw / dh;
        let sx = 0;
        let sy = 0;
        let sw = image.naturalWidth;
        let sh = image.naturalHeight;

        if (sourceRatio > destRatio) {
            sw = image.naturalHeight * destRatio;
            sx = (image.naturalWidth - sw) / 2;
        } else {
            sh = image.naturalWidth / destRatio;
            sy = (image.naturalHeight - sh) / 2;
        }

        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    _runStudioEffect(ctx, x, y, speedRatio, isZombieMode) {
        if (typeof this.customEffectFn !== 'function') return;

        const api = {
            ball: this,
            x,
            y,
            speedRatio,
            isZombieMode,
            radius: this.r,
            color: this.customBallColor,
            trailColor: this.customTrailColor,
            image: this.customImage,
            drawImageCover: (image = this.customImage, dx = -this.r, dy = -this.r, dw = this.r * 2, dh = this.r * 2) => {
                this._drawImageCover(ctx, image, dx, dy, dw, dh);
            },
            drawImageContain: (image = this.customImage, dx = -this.r, dy = -this.r, dw = this.r * 2, dh = this.r * 2) => {
                if (!image || !image.naturalWidth || !image.naturalHeight) return;
                const imageAspect = image.naturalWidth / image.naturalHeight;
                const destAspect = dw / dh;
                let drawW = dw;
                let drawH = dh;
                if (imageAspect > destAspect) {
                    drawH = dw / imageAspect;
                } else {
                    drawW = dh * imageAspect;
                }
                ctx.drawImage(image, dx + (dw - drawW) / 2, dy + (dh - drawH) / 2, drawW, drawH);
            }
        };

        try {
            this.customEffectFn(ctx, this, performance.now() * 0.001, api);
        } catch (error) {
            if (!this.customEffectError) {
                this.customEffectError = error?.message || String(error);
            }
        }
    }

    reset(center, speed = null) {
        const actualSpeed = Number.isFinite(speed) ? speed : this.baseSpeed;
        // Serve at a lively but readable angle: 8-25 degrees up or down.
        const angle = (0.14 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1);
        const dir = Math.random() > 0.5 ? 1 : -1;
        PhysicsCore.reset(this, center.x, center.y, actualSpeed, angle, dir);
        this.lastHit = null;
        this.trailCount = 0;
        this.particles.length = 0; // Clear particles without reallocation
    }

    // Advances the ball. The physics itself (spin, drag, wall bounces, speed
    // clamps) runs in C++ via PhysicsCore; this method also maintains the
    // visual trail and particles. Returns PhysicsCore.EVT flags.
    integrate(dt, height = window.game?.height ?? 600) {
        const events = PhysicsCore.integrate(this, dt, height);
        const particlesEnabled = areParticleEffectsEnabled();

        if (particlesEnabled) {
            // Preserve the legacy drifting trail only for special modes.
            if (this.trailCount > 0 && this._isSpecialTrailMode()) {
                for (let i = 0; i < this.trailCount * 2; i += 2) {
                    this.trailPoints[i + 1] += 15 * dt * (1 + i * 0.05);
                }
            }

            // Update trail with circular buffer pattern
            const updateThreshold = 8; // Only add point if ball moved enough
            const lastIdx = (this.trailCount - 1) * 2;
            const distToLast = this.trailCount > 0 ?
                Math.hypot(this.pos.x - this.trailPoints[lastIdx], this.pos.y - this.trailPoints[lastIdx + 1]) :
                999;

            if (distToLast > updateThreshold) {
                if (this.trailCount < this.maxTrailPoints) {
                    const idx = this.trailCount * 2;
                    this.trailPoints[idx] = this.pos.x;
                    this.trailPoints[idx + 1] = this.pos.y;
                    this.trailCount++;
                } else {
                    // Shift array efficiently
                    for (let i = 0; i < (this.maxTrailPoints - 1) * 2; i++) {
                        this.trailPoints[i] = this.trailPoints[i + 2];
                    }
                    const lastIdx = (this.maxTrailPoints - 1) * 2;
                    this.trailPoints[lastIdx] = this.pos.x;
                    this.trailPoints[lastIdx + 1] = this.pos.y;
                }
            }
        } else {
            this.trailCount = 0;
            this.particles.length = 0;
        }

        // Update particles (simplified)
        if (particlesEnabled) {
            this._updateParticles(dt);
        }
        return events;
    }

    // Enhanced particle physics with air resistance
    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Air resistance on particles (size-dependent)
            const particleDrag = 1 - (0.15 + p.size * 0.05) * dt;
            p.vx *= particleDrag;
            p.vy *= particleDrag;

            // Update position
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Life decay based on initial velocity (faster particles fade quicker)
            const velocityFactor = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.001;
            p.life -= dt * (1.5 + velocityFactor);
            p.alpha = p.life;

            // Gravity with damping
            p.vy += 180 * dt * (1 - p.life * 0.5);

            // Size reduction over time
            p.size *= 0.98;

            if (p.life <= 0 || p.size < 0.5) {
                this.particles.splice(i, 1);
            }
        }
    }

    triggerHitEffect(x, y) {
        // Allow rendering the new Speed Mode background (sea + palette)
        // even if particle effects are disabled — particles are optional.
        const particleEffects = areParticleEffectsEnabled();
        const speed = Math.min(this._speed, 1000);
        const intensity = Math.min(speed / 800, 1.5);
        const count = Math.floor(4 + intensity * 4);

        // Inherit ball's velocity for more realistic particle emission
        const inheritX = this.vel.x * 0.3;
        const inheritY = this.vel.y * 0.3;

        // Reuse particle objects when possible
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) break;

            const angle = Math.random() * Math.PI * 2;
            const power = 100 + Math.random() * 200 * intensity;

            // Create new particle only if needed
            if (this.particles.length < this.maxParticles) {
                this.particles.push({
                    x: x + (Math.random() - 0.5) * this.r,
                    y: y + (Math.random() - 0.5) * this.r,
                    vx: Math.cos(angle) * power + inheritX,
                    vy: Math.sin(angle) * power + inheritY,
                    life: 0.5 + Math.random() * 0.5,
                    alpha: 1,
                    size: 2 + Math.random() * 4
                });
            }
        }

        // Transfer some spin to particles (using existing spin variable conceptually)
        if (Math.abs(this.spin) > 1) {
            // Reduce spin slightly on impact (energy transfer to particles)
            this.spin *= 0.9;
        }
    }

    render(ctx, interp) {
        // Interpolated position (reduces stutter)
        const x = this.prev.x + (this.pos.x - this.prev.x) * interp;
        const y = this.prev.y + (this.pos.y - this.prev.y) * interp;
        const isZombieMode = this._isZombieMode();
        const isSpecialTrailMode = this._isSpecialTrailMode();
        const particlesEnabled = areParticleEffectsEnabled();

        // Render trail only when meaningful (skip zombie mode - uses motion blur instead)
        if (particlesEnabled && this.trailCount > 2 && this._speed > 200 && !isZombieMode) {
            // Use simplified trail in obstacle mode to unify visuals and reduce glow
            if (window.game?.gameMode === 'obstacle') {
                // draw the simplified single-stroke trail
                this._renderTrail(ctx, x, y);
            } else if (isSpecialTrailMode) {
                this._renderZombieTrail(ctx, x, y);
            } else {
                this._renderTrail(ctx, x, y);
            }
        }

        // Render ball with cached gradients
        this._renderBall(ctx, x, y, isZombieMode);

        // Render particles
        if (particlesEnabled) {
            this._renderParticles(ctx);
        }
    }

    _isZombieMode() {
        return typeof window !== 'undefined' && window.game?.gameMode === 'zombie';
    }

    _isSpecialTrailMode() {
        if (typeof window === 'undefined') return false;
        const mode = window.game?.gameMode;
        return mode === 'zombie' || mode === 'survival';
    }

    _hexToRgb(hex) {
        if (typeof hex !== 'string') return null;
        const cleaned = hex.replace('#', '').trim();
        if (cleaned.length !== 6) return null;
        const num = parseInt(cleaned, 16);
        if (Number.isNaN(num)) return null;
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255,
        };
    }

    _getTrailColorRgb() {
        const custom = this._hexToRgb(this.customTrailColor);
        if (custom) return custom;
        return { r: 170, g: 205, b: 255 };
    }

    _renderTrail(ctx, ballX, ballY) {
        const speedRatio = Math.min(1, this._speed / 1200);
        const tailLength = Math.min(this.trailCount, Math.max(2, Math.min(8, this.maxTrailPoints || 14)));
        const trailRgb = this._getTrailColorRgb();

        if (tailLength < 2) return;

        ctx.save();

        // PERFORMANCE OPTIMIZATION: Use a single stroke but with a linear gradient 
        // to simulate motion blur fade-out without multiple draw calls.
        const lastIdx = (this.trailCount - 1) * 2;
        const endIdx = Math.max(0, this.trailCount - tailLength) * 2;

        const grad = ctx.createLinearGradient(
            ballX, ballY,
            this.trailPoints[endIdx], this.trailPoints[endIdx + 1]
        );

        const baseAlpha = 0.4 + speedRatio * 0.4;
        grad.addColorStop(0, `rgba(${trailRgb.r}, ${trailRgb.g}, ${trailRgb.b}, ${baseAlpha})`);
        grad.addColorStop(0.3, `rgba(${trailRgb.r}, ${trailRgb.g}, ${trailRgb.b}, ${baseAlpha * 0.6})`);
        grad.addColorStop(1, `rgba(${trailRgb.r}, ${trailRgb.g}, ${trailRgb.b}, 0)`);

        ctx.lineWidth = this.r * 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(ballX, ballY);

        // Draw path in reverse from current ball pos back through tail
        for (let i = 0; i < tailLength; i++) {
            const idx = (this.trailCount - 1 - i) * 2;
            if (idx < 0) break;
            ctx.lineTo(this.trailPoints[idx], this.trailPoints[idx + 1]);
        }

        // Use 'lighter' for that neon / motion blur glow feel
        ctx.globalCompositeOperation = 'lighter';
        ctx.stroke();

        // Add a thinner, brighter core for "speed streak" look
        ctx.lineWidth = this.r * 0.5;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.restore();
    }

    _drawTaperedTrailSegments(ctx, ballX, ballY, tailLength, maxWidth, alphaScale, r, g, b) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let fromX = ballX;
        let fromY = ballY;

        for (let i = 0; i < tailLength; i++) {
            const idx = (this.trailCount - 1 - i) * 2;
            if (idx < 0) break;

            const toX = this.trailPoints[idx];
            const toY = this.trailPoints[idx + 1];
            const age = i / Math.max(1, tailLength - 1);
            const fade = 1 - age;

            ctx.lineWidth = Math.max(0.75, maxWidth * (0.2 + fade * 0.8));
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${fade * fade * alphaScale})`;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            fromX = toX;
            fromY = toY;
        }
    }

    // Helper method to draw trail with proper alpha gradient
    _drawTrailPath(ctx, ballX, ballY, lineWidth) {
        if (this.trailCount < 2) return;

        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        // Start from ball position
        ctx.moveTo(ballX, ballY);

        // Draw through all trail points with fading alpha
        for (let i = 0; i < this.trailCount; i++) {
            const idx = i * 2;
            const trailX = this.trailPoints[idx];
            const trailY = this.trailPoints[idx + 1];
            ctx.lineTo(trailX, trailY);
        }

        ctx.stroke();
    }

    _renderZombieTrail(ctx, ballX, ballY) {
        ctx.save();
        const speedRatio = Math.min(1, this._speed / 1200);
        const motion = this._getMotionVector(ballX, ballY);
        const tailLength = Math.min(this.trailCount, Math.max(2, this.maxTrailPoints || 12));

        if (tailLength >= 2) {
            ctx.globalCompositeOperation = 'lighter';

            // Draw flame trail as a continuous path with multiple layers
            const now = performance.now() * 0.006;

            for (let layer = 0; layer < 3; layer++) {
                // Different layers for depth
                const layerAlpha = [0.18, 0.32, 0.55][layer];
                const layerWidth = this.r * [2.2, 1.4, 0.7][layer];

                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = layerWidth;
                ctx.globalAlpha = layerAlpha * (1 - layer * 0.2);

                // Base color for this layer (outer = orange, inner = yellow)
                const colors = [
                    'rgba(220, 80, 0, 1)',    // Outer orange
                    'rgba(255, 140, 20, 1)',   // Mid orange-yellow
                    'rgba(255, 200, 80, 1)'    // Inner yellow
                ];
                ctx.strokeStyle = colors[layer];

                ctx.moveTo(ballX, ballY);

                for (let i = 0; i < tailLength; i++) {
                    const idx = (this.trailCount - 1 - i) * 2;
                    const ptX = this.trailPoints[idx];
                    const ptY = this.trailPoints[idx + 1];
                    const t = i / Math.max(1, tailLength - 1);

                    // Organic wave motion for flame turbulence
                    const wave1 = Math.sin(now + i * 0.5) * this.r * 0.2 * (1 - t);
                    const wave2 = Math.cos(now * 0.7 + i * 0.3) * this.r * 0.15 * (1 - t);
                    const sway = wave1 + wave2;

                    ctx.lineTo(
                        ptX + motion.px * sway * (1 - layer * 0.15),
                        ptY + motion.py * sway * (1 - layer * 0.15)
                    );
                }
                ctx.stroke();
            }

            // Heat haze effect - animated distortion shimmer
            ctx.globalCompositeOperation = 'screen';
            const hazeCount = Math.min(this.trailCount, Math.max(2, Math.floor((this.maxTrailPoints || 12) * 0.45)));
            for (let i = Math.max(0, hazeCount - 5); i < hazeCount; i++) {
                const idx = (this.trailCount - 1 - i) * 2;
                const ptX = this.trailPoints[idx];
                const ptY = this.trailPoints[idx + 1];
                const t = i / Math.max(1, hazeCount - 1);

                // Animated shimmer for heat distortion
                const shimmerPhase = now * 1.2 + i * 0.6;
                const shimmerAmount = Math.sin(shimmerPhase) * 0.5 + 0.5;

                // Haze radius increases with distance from fireball
                const baseHazeRadius = this.r * (0.4 + t * 1.1);
                const hazeRadius = baseHazeRadius * (0.8 + shimmerAmount * 0.4);

                // Random offset for organic heat shimmer
                const offsetPhase = now * 0.008 + i * 1.3;
                const offsetAmount = Math.sin(offsetPhase) * this.r * 0.18;

                const hx = ptX + motion.px * offsetAmount;
                const hy = ptY + motion.py * offsetAmount;

                // Heat haze gradient - very subtle and transparent
                const alpha = (1 - t) * (0.08 + speedRatio * 0.08);
                const haze = ctx.createRadialGradient(hx, hy, 0, hx, hy, hazeRadius);
                haze.addColorStop(0, `rgba(255, 200, 100, ${alpha * shimmerAmount})`);
                haze.addColorStop(0.5, `rgba(255, 140, 40, ${alpha * shimmerAmount * 0.5})`);
                haze.addColorStop(1, 'rgba(255, 80, 10, 0)');

                ctx.globalAlpha = 0.9;
                ctx.fillStyle = haze;
                ctx.beginPath();
                ctx.arc(hx, hy, hazeRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    // Add sparkles at high speeds for extra realism
    _drawTrailSparkles(ctx, ballX, ballY, speedRatio) {
        if (this.trailCount < 3) return;

        const sparkleCount = Math.floor((speedRatio - 0.5) * 10);
        ctx.save();

        for (let i = 1; i < Math.min(this.trailCount, sparkleCount + 1); i++) {
            const idx = i * 2;
            const trailX = this.trailPoints[idx];
            const trailY = this.trailPoints[idx + 1];

            // Only add sparkles to newer trail points
            const sparkleAlpha = (i / this.trailCount) * speedRatio;
            if (sparkleAlpha < 0.3) continue;

            const size = 1 + Math.random() * 2 * speedRatio;

            // Outer glow for sparkle
            const grad = ctx.createRadialGradient(trailX, trailY, 0, trailX, trailY, size * 3);
            grad.addColorStop(0, `rgba(255, 255, 255, ${sparkleAlpha})`);
            grad.addColorStop(0.5, `rgba(150, 220, 255, ${sparkleAlpha * 0.5})`);
            grad.addColorStop(1, 'transparent');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(trailX, trailY, size * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _renderBall(ctx, x, y, isZombieMode = false) {
        ctx.save();
        ctx.translate(x, y);

        const roll = this.spin * 0.0025;
        if (roll) {
            ctx.rotate(roll);
        }

        // Speed-based color shift (Doppler-like effect)
        const speedRatio = Math.min(1, this._speed / 1200);
        const blueShift = Math.floor(50 + speedRatio * 100);
        const customColor = this.customBallColor;

        // ZOMBIE MODE: Deep magma orange color
        const mainColor = customColor
            ? customColor
            : (isZombieMode
                ? `rgb(255, ${170 - Math.floor(speedRatio * 50)}, ${40 + Math.floor((1 - speedRatio) * 20)})`
                : `rgb(255, ${255 - blueShift * 0.5}, ${255 - blueShift})`);

        // === ZOMBIE MODE: Motion blur effect ===
        if (isZombieMode && this._speed > 300) {
            ctx.globalCompositeOperation = 'lighter';
            const blurDist = Math.min(this.r * 3, this._speed * 0.08);
            const blurCount = 6;

            // Calculate velocity direction
            const vx = this.vel?.x || 0;
            const vy = this.vel?.y || 0;
            const vMag = Math.hypot(vx, vy) || 1;
            const vxNorm = vx / vMag;
            const vyNorm = vy / vMag;

            // Draw motion blur ghosts
            for (let i = 1; i < blurCount; i++) {
                const progress = i / blurCount;
                const ghostX = -vxNorm * blurDist * progress;
                const ghostY = -vyNorm * blurDist * progress;
                const ghostAlpha = (1 - progress) * 0.35;

                ctx.globalAlpha = ghostAlpha;
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.arc(ghostX, ghostY, this.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        // Cache gradient creation
        if (!this._renderCache.ballGradient ||
            this._renderCache.lastRadius !== this.r ||
            this._renderCache.lastSpeed !== this._speed ||
            this._renderCache.lastZombieMode !== isZombieMode) {

            // Update gradient with speed-based colors
            if (isZombieMode) {
                // Fiery gradient for zombie mode
                this._renderCache.ballGradient = ctx.createRadialGradient(
                    -this.r * 0.3, -this.r * 0.3, 0,
                    0, 0, this.r
                );
                this._renderCache.ballGradient.addColorStop(0, `rgba(255,240,180,${0.95})`);
                this._renderCache.ballGradient.addColorStop(0.5, `rgba(255,180,80,${0.5})`);
                this._renderCache.ballGradient.addColorStop(1, 'rgba(255,100,20,0)');
            } else {
                // Normal gradient
                this._renderCache.ballGradient = ctx.createRadialGradient(
                    -this.r * 0.3, -this.r * 0.3, 0,
                    0, 0, this.r
                );
                this._renderCache.ballGradient.addColorStop(0, `rgba(255,255,255,${0.9 - speedRatio * 0.3})`);
                this._renderCache.ballGradient.addColorStop(0.7, `rgba(255,255,255,${0.3 - speedRatio * 0.1})`);
                this._renderCache.ballGradient.addColorStop(1, 'rgba(255,255,255,0)');
            }
            this._renderCache.lastRadius = this.r;
            this._renderCache.lastSpeed = this._speed;
            this._renderCache.lastZombieMode = isZombieMode;
        }

        // Main ball with speed-based color
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();

        // Glow effect (enhanced at high speeds and MORE visible in zombie mode)
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this._renderCache.ballGradient;
        ctx.globalAlpha = isZombieMode ? 1.2 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * (1 + speedRatio * (isZombieMode ? 0.3 : 0.1)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        this._drawStudioImage(ctx, 1 + speedRatio * 0.08);

        if (this.customGlowTint) {
            const glowRgb = this._hexToRgb(this.customGlowTint);
            if (glowRgb) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 1.9);
                aura.addColorStop(0, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, 0.42)`);
                aura.addColorStop(0.55, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, 0.18)`);
                aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = aura;
                ctx.beginPath();
                ctx.arc(0, 0, this.r * 1.9, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        this._runStudioEffect(ctx, x, y, speedRatio, isZombieMode);

        if (isZombieMode) {
            this._renderZombieFireAura(ctx, speedRatio);
        }

        // Spin indicator with intensity based on spin magnitude
        if (Math.abs(this.spin) > 0.1) {
            ctx.globalCompositeOperation = 'source-over';
            const spinIntensity = Math.min(1, Math.abs(this.spin) * 0.5);
            ctx.strokeStyle = `rgba(0, 255, 170, ${0.3 + spinIntensity * 0.5})`;
            ctx.lineWidth = 1.5 + spinIntensity * 2;
            ctx.beginPath();

            // Curved indicator for spin direction
            const indicatorLength = this.r * 0.8;
            const spinDirection = this.spin > 0 ? 1 : -1;
            const curveFactor = spinIntensity * 0.5;

            ctx.moveTo(indicatorLength * spinDirection, this.r * 0.1);
            ctx.quadraticCurveTo(
                indicatorLength * spinDirection * 0.5,
                -this.r * curveFactor,
                0, 0
            );
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderZombieFireAura(ctx, speedRatio) {
        const now = performance.now() * 0.012;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // === LAYER 1: Outer heat haze glow (BOOSTED VISIBILITY) ===
        const outerGlowRadius = this.r * (2.2 + speedRatio * 0.6);
        const glowFlicker = 0.85 + Math.sin(now * 1.3) * 0.15;

        const glowGrad = ctx.createRadialGradient(
            -this.r * 0.15, -this.r * 0.15, this.r * 0.3,
            0, 0, outerGlowRadius * glowFlicker
        );
        glowGrad.addColorStop(0, 'rgba(255, 255, 200, 0.4)');
        glowGrad.addColorStop(0.25, 'rgba(255, 200, 80, 0.35)');
        glowGrad.addColorStop(0.6, 'rgba(255, 120, 30, 0.2)');
        glowGrad.addColorStop(1, 'rgba(255, 60, 10, 0.05)');

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, outerGlowRadius * glowFlicker, 0, Math.PI * 2);
        ctx.fill();

        // === LAYER 2: Main fireball body (INTENSIFIED) ===
        const mainRadius = this.r * 0.95;
        const fireCoreGrad = ctx.createRadialGradient(
            -this.r * 0.25, -this.r * 0.25, 0,
            0, 0, mainRadius
        );

        // White-hot core that fades to deep red (MORE VIBRANT)
        fireCoreGrad.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
        fireCoreGrad.addColorStop(0.25, 'rgba(255, 230, 120, 0.95)');
        fireCoreGrad.addColorStop(0.5, 'rgba(255, 160, 40, 0.9)');
        fireCoreGrad.addColorStop(0.75, 'rgba(220, 80, 15, 0.75)');
        fireCoreGrad.addColorStop(1, 'rgba(120, 30, 5, 0.4)');

        ctx.fillStyle = fireCoreGrad;
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, mainRadius, 0, Math.PI * 2);
        ctx.fill();

        // === LAYER 3: Animated heat shimmer bands (FASTER & BRIGHTER) ===
        ctx.globalCompositeOperation = 'screen';
        const shimmerBands = 8;
        for (let band = 0; band < shimmerBands; band++) {
            const bandAngle = (now + band * (Math.PI * 2 / shimmerBands)) * 1.2;
            const bandRadius = mainRadius * (0.6 + Math.sin(now * 2 + band) * 0.3);
            const bandWidth = mainRadius * 0.2;

            // Draw radial bands of shimmer
            const x = Math.cos(bandAngle) * bandRadius;
            const y = Math.sin(bandAngle) * bandRadius;

            const shimmerGrad = ctx.createRadialGradient(x, y, 0, x, y, bandWidth);
            shimmerGrad.addColorStop(0, 'rgba(255, 240, 180, 0.6)');
            shimmerGrad.addColorStop(0.5, 'rgba(255, 200, 100, 0.3)');
            shimmerGrad.addColorStop(1, 'rgba(255, 120, 40, 0.05)');

            ctx.fillStyle = shimmerGrad;
            ctx.globalAlpha = 0.8 + Math.sin(now * 2.5 + band) * 0.3;
            ctx.beginPath();
            ctx.arc(x, y, bandWidth, 0, Math.PI * 2);
            ctx.fill();
        }

        // === LAYER 4: Pulse effect (EMPHASIZED) ===
        const pulseAlpha = 0.5 + Math.sin(now * 2.2) * 0.35;
        const pulseRadius = mainRadius * (1.0 + Math.sin(now * 1.6) * 0.2);

        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulseAlpha * 0.7;
        ctx.strokeStyle = 'rgba(255, 180, 40, 1)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    _getMotionVector(ballX, ballY) {
        let dx = this.vel?.x || 0;
        let dy = this.vel?.y || 0;

        if (Math.hypot(dx, dy) < 1.5 && this.trailCount > 1) {
            const idx = (this.trailCount - 2) * 2;
            dx = ballX - this.trailPoints[idx];
            dy = ballY - this.trailPoints[idx + 1];
        }

        let mag = Math.hypot(dx, dy);
        if (mag < 0.001) {
            dx = 1;
            dy = 0;
            mag = 1;
        }

        dx /= mag;
        dy /= mag;
        return { dx, dy, px: -dy, py: dx };
    }

    _renderParticles(ctx) {
        if (this.particles.length === 0) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const isZombieMode = this._isZombieMode();

        for (const p of this.particles) {
            // Particles glow more when they're fast
            const velocity = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            const intensity = Math.min(1, velocity * 0.005);

            ctx.fillStyle = isZombieMode
                ? `rgba(255, ${135 + Math.floor(intensity * 75)}, ${40 + Math.floor(intensity * 30)}, ${p.alpha * (0.5 + intensity * 0.5)})`
                : (() => {
                    const trailRgb = this._getTrailColorRgb();
                    return `rgba(${trailRgb.r}, ${trailRgb.g}, ${trailRgb.b}, ${p.alpha * (0.5 + intensity * 0.5)})`;
                })();
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();

            // Add a smaller, brighter core for fast particles
            if (intensity > 0.3) {
                ctx.fillStyle = isZombieMode
                    ? `rgba(255, 250, 220, ${p.alpha * intensity * 0.7})`
                    : `rgba(255, 255, 255, ${p.alpha * intensity * 0.7})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    getSpeed() {
        return this._speed; // Return cached value
    }
}

// Paddle
