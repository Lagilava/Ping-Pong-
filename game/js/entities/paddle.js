class Paddle {
    constructor(x, y, w, h, color = '#00ffd6', isAI = false) {
        // baseColor preserves the original choice so we can revert later
        this.baseColor = color;

        this.pos = new Vec2(x, y);
        this.w = w;
        this.h = h;
        this.isAI = isAI;
        this.vel = new Vec2(0, 0);
        this.maxSpeed = 850;

        // Enhanced color system
        this.primaryColor = color;
        this.secondaryColor = this._adjustColor(color, 1.5); // Brighter version
        this.accentColor = this._adjustColor(color, 0.7); // Darker version
        this.color = color; // Keep for compatibility
        this.paddleStyle = 'classic';

        // paddle skin modifiers
        this.isZombieBoss = false;

        this.particleSystem = new ParticleSystem();
        this.lastHitTime = 0;

        this.originalHeight = h;
        this.originalSpeed = 850;
        this.friction = 0.9;

        // Laser properties
        this.hasLaser = false;
        this.laserCharges = 0;
        this.lasers = [];
        this.laserCooldown = 0;
        this.laserStunned = false;
        this.laserStunTime = 0;

        // Visual effects for laser
        this.laserChargeIndicator = 0;
        this.laserReadyGlow = 0;

        // Enhanced visual effects
        this.stripeOffset = 0;
        this.glowIntensity = 0;
        this.hitEffectRadius = 0;
        this.powerUpPulse = 0;

        // New visual properties
        this.energyPulse = 0;
        this.pulseDirection = 1;
        this.lastUpdateTime = Date.now();

        // Hit response: horizontal recoil (px) and squash, both spring back.
        this.recoil = 0;
        this.recoilVel = 0;
        this.squash = 0;

        // "Alive" behaviour
        this.circuitNodes = [];
        this.circuitSparkTimer = 0;
        this.alivePhase = 0;
        this._initCircuitNodes();
    }

    // Helper method to adjust color brightness
    _adjustColor(color, factor) {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            const adjust = (c) => Math.min(255, Math.max(0, Math.floor(c * factor)));

            return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`;
        }
        return color;
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

    // Helper method for rounded rectangles
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

    _normalizePaddleStyle(style) {
        const value = String(style || 'classic').trim();
        return Paddle.STYLES.includes(value) ? value : 'classic';
    }

    setStyle(style) {
        this.paddleStyle = this._normalizePaddleStyle(style);
    }

    // Center helper
    _recenter() {
        const centerY = this.pos.y + this.h / 2;
        this.pos.y = centerY - this.h / 2;
    }

    setCenterY(y) {
        this.pos.y = y - this.h / 2;
    }

    // initialize list of circuit node positions (relative to paddle centre)
    _initCircuitNodes() {
        this.circuitNodes = [];
        const num = Math.max(3, Math.floor(this.h / 24));
        const hullInset = 8;
        for (let i = 0; i < num; i++) {
            const t = num === 1 ? 0.5 : i / (num - 1);
            const y = -this.h / 2 + 12 + t * (this.h - 24);
            const x = this.w / 2 - hullInset - 6;
            this.circuitNodes.push({ x, y });
        }
    }

    clampTo(hCanvas) {
        this.pos.y = Math.max(0, Math.min(hCanvas - this.h, this.pos.y));
    }

    grow(factor = 1.8) {
        const centerY = this.pos.y + this.h / 2;
        this.h = this.originalHeight * factor;
        this.pos.y = centerY - this.h / 2;
        this.clampTo(window.game?.height || Infinity);

        this._initCircuitNodes();
        this.glowIntensity = 1.0;
        this.energyPulse = 1.0;
    }

    shrink(factor = 0.85) {
        const centerY = this.pos.y + this.h / 2;
        this.h = Math.max(20, this.h * factor);
        this.pos.y = centerY - this.h / 2;
        this.clampTo(window.game?.height || Infinity);

        this._initCircuitNodes();
        this.glowIntensity = 1.0;
        this.energyPulse = 1.0;
    }

    resetSize() {
        const centerY = this.pos.y + this.h / 2;
        this.h = this.originalHeight;
        this.pos.y = centerY - this.h / 2;
        this.clampTo(window.game?.height || Infinity);

        this._initCircuitNodes();
        this.glowIntensity = 1.0;
        this.energyPulse = 1.0;
    }

    // Activate laser powerup
    activateLaser(charges = 3) {
        this.hasLaser = true;
        this.laserCharges = charges;
        this.laserReadyGlow = 1;

        // Enhanced visual feedback
        this.powerUpPulse = 1.0;
        this.energyPulse = 1.0;
    }

    // Deactivate laser powerup
    deactivateLaser() {
        this.hasLaser = false;
        this.laserCharges = 0;
        this.lasers = [];
    }

    // Fire a laser from this paddle
    fireLaser(game) {
        if (!this.hasLaser || this.laserCharges <= 0 || this.laserCooldown > 0) {
            return false;
        }

        this.laserCharges--;
        this.laserCooldown = 0.2;

        const isPlayer = this === game.player;
        const direction = isPlayer ? 1 : -1;
        const startX = direction > 0 ? this.pos.x + this.w : this.pos.x;

        // Enhanced laser projectile with more visual properties
        const laser = {
            pos: new Vec2(startX, this.pos.y + this.h / 2),
            vel: new Vec2(direction * 1200, 0),
            // make the beam thinner so it reads like a laser rather than a
            // dart projectile
            width: 14,
            height: 4,
            color: isPlayer ? '#ff513c' : '#53dfff',
            glowColor: isPlayer ? '#ff513c' : '#53dfff',
            owner: isPlayer ? 'player' : 'ai',
            active: true,
            life: 2,
            sparkleTimer: 0,
            trail: [], // NEW: Trail effect
            pulsePhase: 0, // NEW: For pulsing effect
            energy: 1.0 // NEW: Laser energy level
        };

        this.lasers.push(laser);

        if (game.audio && game.audio.laser) {
            game.audio.laser();
        }

        this.laserReadyGlow = 0;
        this._laserFiredAt = Date.now();
        if (!window.PPSettings?.get('reduceMotion')) this.kick(-direction, 0.24);
        this.energyPulse = 1.0;
        if (window.PPSettings?.get('particles') !== false && !window.PPSettings?.get('reduceMotion')) {
            this.particleSystem.spawnSparkle(laser.pos.x, laser.pos.y, laser.glowColor, 2, 0.15);
        }

        if (game) {
            game.screenShake = Math.max(game.screenShake, 5);
        }

        return true;
    }

    // Update laser projectiles
    updateLasers(dt, game) {
        // Update cooldown
        if (this.laserCooldown > 0) {
            this.laserCooldown -= dt;
        }

        // Update stun timer
        if (this.laserStunned) {
            this.laserStunTime -= dt;
            if (this.laserStunTime <= 0) {
                this.laserStunned = false;
            }
        }

        // Update visual effects
        this.laserChargeIndicator += dt * 3;
        if (this.laserReadyGlow > 0) {
            this.laserReadyGlow -= dt * 2;
        }

        // Update enhanced visual effects
        this.stripeOffset = (this.stripeOffset + dt * 50) % 20;
        if (this.glowIntensity > 0) {
            this.glowIntensity -= dt * 2;
        }
        if (this.powerUpPulse > 0) {
            this.powerUpPulse -= dt * 1.5;
        }
        if (this.hitEffectRadius > 0) {
            this.hitEffectRadius -= dt * 100;
        }

        // Update energy pulse
        if (this.energyPulse > 0) {
            this.energyPulse -= dt * 2;
        }

        // Update active lasers
        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];

            // Update position
            laser.pos.x += laser.vel.x * dt;
            laser.pos.y += laser.vel.y * dt;
            laser.life -= dt;
            laser.sparkleTimer += dt;
            laser.pulsePhase += dt * 10; // Update pulse phase
            laser.energy -= dt * 0.5; // Laser loses energy over time

            // Remove if expired or off-screen
            if (laser.life <= 0 || laser.energy <= 0 ||
                laser.pos.x < -100 ||
                laser.pos.x > game.width + 100 ||
                laser.pos.y < -100 ||
                laser.pos.y > game.height + 100) {
                this.lasers.splice(i, 1);
                continue;
            }

            // Add sparkle effect periodically
            if (laser.sparkleTimer > 0.09 && window.PPSettings?.get('particles') !== false && !window.PPSettings?.get('reduceMotion')) {
                laser.sparkleTimer = 0;
                this.particleSystem.spawnSparkle(
                    laser.pos.x + (Math.random() - 0.5) * 10,
                    laser.pos.y,
                    laser.color,
                    1.5,
                    0.6
                );
            }

            // Check collision with ball (optimized collision detection)
            if (game.ball) {
                const dx = laser.pos.x - game.ball.pos.x;
                const dy = laser.pos.y - game.ball.pos.y;
                const distanceSquared = dx * dx + dy * dy;
                const minDistance = game.ball.r + laser.width / 2;

                if (distanceSquared < minDistance * minDistance) {
                    // Laser hits ball - super boost!
                    const hitPower = 2.0;
                    const currentSpeed = game.ball.vel.len();
                    game.ball.vel.x = Math.sign(laser.vel.x) * Math.abs(game.ball.vel.x) * hitPower;
                    game.ball.vel.y += (Math.random() - 0.5) * 200;

                    // Limit maximum speed
                    const newSpeed = game.ball.vel.len();
                    if (newSpeed > game.ball.maxSpeed) {
                        game.ball.vel = game.ball.vel.normalize().mul(game.ball.maxSpeed);
                    }

                    // Enhanced visual effect
                    this.particleSystem.spawnGodTierHit(
                        game.ball.pos.x,
                        game.ball.pos.y,
                        laser.color,
                        currentSpeed * 1.5
                    );

                    // Add hit effect radius for visual feedback
                    this.hitEffectRadius = 50;
                    this.energyPulse = 1.0;

                    if (game.audio && game.audio.hit) {
                        game.audio.hit();
                    }

                    game.screenShake = Math.max(game.screenShake, 10);

                    this.lasers.splice(i, 1);
                    continue;
                }
            }

            // Check collision with opponent paddle
            const targetPaddle = laser.owner === 'player' ? game.aiPaddle : game.player;
            if (laser.pos.x > targetPaddle.pos.x &&
                laser.pos.x < targetPaddle.pos.x + targetPaddle.w &&
                laser.pos.y > targetPaddle.pos.y &&
                laser.pos.y < targetPaddle.pos.y + targetPaddle.h) {

                // Hit opponent - stun them
                targetPaddle.laserStunned = true;
                targetPaddle.laserStunTime = 1.0;

                // Enhanced visual effect
                this.particleSystem.spawnGodTierHit(
                    laser.pos.x,
                    laser.pos.y,
                    laser.glowColor,
                    800
                );

                if (game.audio && game.audio.hit) {
                    game.audio.hit();
                }

                game.screenShake = Math.max(game.screenShake, 8);
                this.energyPulse = 1.0;

                this.lasers.splice(i, 1);
                continue;
            }

            // Check collision with obstacles
            if (game.gameMode === 'obstacle' && game.obstacles && !game.ghostBallActive) {
                for (const obstacle of game.obstacles) {
                    if (obstacle.active &&
                        laser.pos.x > obstacle.pos.x &&
                        laser.pos.x < obstacle.pos.x + obstacle.w &&
                        laser.pos.y > obstacle.pos.y &&
                        laser.pos.y < obstacle.pos.y + obstacle.h) {

                        // Destroy obstacle
                        obstacle.active = false;

                        // Enhanced visual effect
                        this.particleSystem.spawnSparkleWave(
                            laser.pos.x,
                            laser.pos.y,
                            laser.glowColor,
                            600
                        );

                        this.lasers.splice(i, 1);
                        this.energyPulse = 1.0;
                        break;
                    }
                }
            }
        }
    }

    // Render lasers from this paddle
    renderLasers(ctx) {
        window.LaserFX?.shots(ctx, this);
    }

    // Get stunned by opponent laser
    stun(duration = 1.0) {
        this.laserStunned = true;
        this.laserStunTime = duration;
        this.particleSystem.spawnSparkleWave(
            this.pos.x + this.w / 2,
            this.pos.y + this.h / 2,
            '#ff0000',
            400
        );

        // Visual feedback for stun
        this.glowIntensity = 1.0;
        this.energyPulse = 1.0;
    }

    // Trigger a paddle hit particle effect
    // Knock the paddle back on contact. dir is -1 (push left) or 1 (push right).
    kick(dir, strength = 1) {
        this.recoilVel += dir * 420 * strength;
        this.squash = Math.min(1, this.squash + 0.55 * strength);
        this.lastHitTime = Date.now();
        this.energyPulse = 1.0;
    }

    addHitParticles(x, y, speed = 800) {
        const hitColor = this.isZombieBoss ? '#44ff44' : this.color;
        this.particleSystem.spawnGodTierHit(x, y, hitColor, speed);

        if (this.isZombieBoss) {
            // extra goo droplets
            this.particleSystem.spawnSparkle(x, y, '#00ff00', 2, 0.4);
            this.particleSystem.spawnSparkle(x, y, '#88ff88', 1.2, 0.3);
        }

        this.lastHitTime = Date.now();

        // Visual feedback for hit
        this.hitEffectRadius = 30;
        this.energyPulse = 1.0;
    }

    update(dt) {
        // Update the particle system
        this.particleSystem.update(dt);

        // Critically damped spring pulls the recoil back to rest.
        const k = 520, c = 2 * Math.sqrt(k);
        this.recoilVel += (-k * this.recoil - c * this.recoilVel) * dt;
        this.recoil += this.recoilVel * dt;
        this.squash *= Math.exp(-10 * dt);

        // "alive" behaviour
        if (this.isAI) {
            this.alivePhase += dt;
            this.circuitSparkTimer += dt;
            if (this.circuitSparkTimer > 0.22) {
                this.circuitSparkTimer = 0;
                if (this.circuitNodes.length) {
                    const node = this.circuitNodes[Math.floor(Math.random() * this.circuitNodes.length)];
                    const worldX = this.pos.x + this.w / 2 + node.x;
                    const worldY = this.pos.y + this.h / 2 + node.y;
                    // small green spark
                    this.particleSystem.spawnSparkle(worldX, worldY, '#00ff88', 1.8, 0.4);
                }
            }
        }

        // Update time for animations
        this.lastUpdateTime = Date.now();
    }

    render(ctx) {
        const time = Date.now() * 0.001;
        const hitGlow = Math.max(0, 1 - (Date.now() - this.lastHitTime) / 250);
        const pulse = Math.sin(time * 6) * 0.5 + 0.5;
        const pulseIntensity = Math.sin(time * 10) * 0.3 + 0.7;
        const transformPulse = this.energyPulse + hitGlow;
        const style = this._normalizePaddleStyle(this.paddleStyle);

        // Designs bake their sprites at the canvas's pixel scale; read it
        // before the squash/alive scaling below so hits never force a rebake.
        this._scaleHint = style !== 'classic' && window.PaddleDesigns ? window.PaddleDesigns.pixelScale(ctx) : 0;

        ctx.save();
        // Stun wobble is visual only so it never drifts the paddle's real position.
        const wobble = this.laserStunned ? Math.sin(Date.now() * 0.02) * 3 : 0;
        ctx.translate(this.pos.x + this.w / 2 + this.recoil, this.pos.y + this.h / 2 + wobble);
        if (this.squash > 0.01) {
            ctx.scale(1 + this.squash * 0.35, 1 - this.squash * 0.12);
        }

        if (this.isAI && this.isZombieBoss) {
            this.renderZombieBossAI(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse);
        } else if (style === 'classic') {
            if (this.isAI) {
                // apply subtle living scale oscillation
                const aliveScale = 1 + Math.sin(this.alivePhase * 1.8) * 0.015;
                ctx.scale(aliveScale, aliveScale);
                this.renderAI(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse);
            } else {
                this.renderPlayer(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse);
            }
        } else {
            if (this.isAI) {
                const aliveScale = 1 + Math.sin(this.alivePhase * 1.8) * 0.015;
                ctx.scale(aliveScale, aliveScale);
            }
            this.renderStyledPaddle(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse, style);
        }

        if (!this.isZombieBoss) this._renderAnimatedAccents(ctx, time, hitGlow, style !== 'classic');
        window.LaserFX?.ready(ctx, this, time);

        ctx.restore();

        // Particles + lasers on top
        this.particleSystem.render(ctx);
        this.renderLasers(ctx);
    }


    /**
     * Animated touches layered over whichever paddle design is drawn. Plain
     * fills/strokes only (no shadowBlur, no gradients): the post-process bloom
     * turns the bright lines into glow for free. Drawn in paddle-local space.
     *  - face light: the striking face brightens as the ball approaches
     *  - scanner: a light band sweeps along the paddle
     *  - corner brackets: breathe, and tighten when a hit is coming
     *  - afterimages: outlines trail the paddle when it moves fast
     *  - hit ring: an outline snaps outwards on contact
     */
    _renderAnimatedAccents(ctx, time, hitGlow, shaped = false) {
        const w = this.w, h = this.h, hw = w / 2, hh = h / 2;
        const color = this.primaryColor || this.color || '#00ffd6';
        const ant = this.anticipation || 0;
        // Which side faces the court: +1 for the left paddle, -1 for the right.
        const gameW = (typeof window !== 'undefined' && window.game?.width) || 0;
        const face = gameW && this.pos.x > gameW / 2 ? -1 : 1;
        const seed = face > 0 ? 0 : 1.37;                       // desync the two paddles

        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        // Afterimages along the direction of travel.
        const speed = Math.abs(this.vel?.y || 0);
        if (speed > 280) {
            const k = Math.min(1, (speed - 280) / 900);
            const dir = this.vel.y > 0 ? -1 : 1;
            ctx.lineWidth = 1.5;
            for (let i = 1; i <= 2; i++) {
                ctx.globalAlpha = k * (0.32 / i);
                ctx.strokeRect(-hw, -hh + dir * i * (6 + k * 10), w, h);
            }
        }

        // Scanner band sweeping along the paddle (~2.4 s cycle). The shaped
        // designs animate their own bodies, so they skip the band and the
        // face light, which are drawn as plain rectangles.
        const cycle = ((time * 0.42 + seed) % 1);
        if (!shaped && cycle < 0.55) {
            const y = -hh + (cycle / 0.55) * h;
            ctx.globalAlpha = 0.22 + ant * 0.25;
            ctx.fillRect(-hw, y - 3, w, 6);
        }

        // Striking-face light: brightens as the ball comes in, flares on a hit.
        if (!shaped) {
            const faceX = face > 0 ? hw - 1.5 : -hw - 1.5;
            ctx.globalAlpha = Math.min(1, 0.15 + ant * 0.65 + hitGlow * 0.6);
            ctx.fillRect(faceX, -hh + 4, 3, h - 8);
        }

        // Corner brackets: breathe gently, pull in tight when a hit is coming.
        const gap = 5 + Math.sin(time * 2.2 + seed * 3) * 1.5 - ant * 3;
        const arm = Math.min(10, h * 0.1);
        ctx.globalAlpha = 0.35 + ant * 0.5;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const x = sx * (hw + gap), y = sy * (hh + gap);
                ctx.moveTo(x, y - sy * arm);
                ctx.lineTo(x, y);
                ctx.lineTo(x - sx * arm, y);
            }
        }
        ctx.stroke();

        // Hit ring: snaps outwards and fades over ~0.3 s.
        const sinceHit = (Date.now() - this.lastHitTime) / 300;
        if (sinceHit >= 0 && sinceHit < 1) {
            const grow = 4 + sinceHit * 22;
            ctx.globalAlpha = (1 - sinceHit) * 0.8;
            ctx.lineWidth = 2.5 * (1 - sinceHit) + 0.5;
            ctx.strokeRect(-hw - grow, -hh - grow, w + grow * 2, h + grow * 2);
        }

        ctx.restore();
    }

    // Satelliten, World Shield, AI Rebel and Prizma live in paddle-designs.js:
    // a baked body plus light animated touches. This adds the laser and
    // power-up cues every design shares.
    renderStyledPaddle(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse, style) {
        if (!window.PaddleDesigns?.render(ctx, this, style, time, hitGlow, this._scaleHint)) {
            this.renderPlayer(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse);
            return;
        }



        if (this.powerUpPulse > 0 && !this.hasLaser) {
            ctx.save();
            ctx.lineWidth = 5;
            ctx.strokeStyle = this.secondaryColor;
            ctx.globalAlpha = this.powerUpPulse;
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(this.w, this.h) * 0.45 + i * 16 + this.powerUpPulse * 55, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    renderAI(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse) {
        // special skin for the ZombieBoss paddle
        if (this.isZombieBoss) {
            this.renderZombieBossAI(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse);
            return;
        }

        // AI PADDLE: Robotic menace with energy field and circuit patterns

        // STUNNED = FULL EMERGENCY MODE
        if (this.laserStunned) {
            ctx.globalAlpha = 0.5 + pulse * 0.5;
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(-this.w / 2 - 20, -this.h / 2 - 20, this.w + 40, this.h + 40);
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#FF0033';
            ctx.font = 'bold 32px "Transformers", "Arial Black", sans-serif';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 6;
            ctx.textAlign = 'center';
            ctx.strokeText('ERROR', 0, -15);
            ctx.fillText('ERROR', 0, -15);
            ctx.strokeText('404', 0, 20);
            ctx.fillText('404', 0, 20);
        }

        // TRANSFORMATION SEQUENCE EFFECT (subtle sweep)
        if (transformPulse > 0.08) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.6, transformPulse * 0.6);
            ctx.strokeStyle = 'rgba(255,120,60,0.16)';
            ctx.lineWidth = 6 * transformPulse;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.w * (0.95 + transformPulse * 0.2), this.h * (0.9 + transformPulse * 0.15), 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // MAIN HULL - armored monolith silhouette instead of the old goofy wedge
        const halfW = this.w / 2;
        const halfH = this.h / 2;
        const shoulder = Math.max(3, Math.min(7, this.w * 0.22));
        const crown = Math.max(10, Math.min(18, this.h * 0.12));
        const waist = Math.max(2, Math.min(6, this.w * 0.18));
        const traceHullPath = (w = this.w, h = this.h, waistMul = 1) => {
            const hw = w / 2;
            const hh = h / 2;
            const localShoulder = Math.max(2, Math.min(hw - 1, shoulder * (w / this.w)));
            const localCrown = Math.max(6, Math.min(hh - 6, crown * (h / this.h)));
            const localWaist = Math.max(1.5, Math.min(hw - 1.5, waist * waistMul * (w / this.w)));

            ctx.beginPath();
            ctx.moveTo(-hw + localShoulder, -hh);
            ctx.lineTo(hw - localShoulder, -hh);
            ctx.lineTo(hw, -hh + localCrown);
            ctx.lineTo(hw - localWaist, -hh * 0.18);
            ctx.lineTo(hw - localWaist * 0.7, hh * 0.18);
            ctx.lineTo(hw, hh - localCrown);
            ctx.lineTo(hw - localShoulder, hh);
            ctx.lineTo(-hw + localShoulder, hh);
            ctx.lineTo(-hw, hh - localCrown);
            ctx.lineTo(-hw + localWaist * 0.7, hh * 0.18);
            ctx.lineTo(-hw + localWaist, -hh * 0.18);
            ctx.lineTo(-hw, -hh + localCrown);
            ctx.closePath();
        };

        ctx.save();
        traceHullPath(this.w + 10 + transformPulse * 8, this.h + 12 + transformPulse * 14, 0.9);
        const silhouetteGlow = ctx.createLinearGradient(0, -halfH, 0, halfH);
        silhouetteGlow.addColorStop(0, 'rgba(255,70,40,0.20)');
        silhouetteGlow.addColorStop(0.5, `rgba(255,40,40,${(0.32 + transformPulse * 0.16).toFixed(2)})`);
        silhouetteGlow.addColorStop(1, 'rgba(120,10,10,0.10)');
        ctx.fillStyle = silhouetteGlow;
        ctx.fill();
        ctx.restore();

        traceHullPath();
        const hullGradient = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
        hullGradient.addColorStop(0, '#050507');
        hullGradient.addColorStop(0.45, '#15161d');
        hullGradient.addColorStop(0.7, '#0b0c10');
        hullGradient.addColorStop(1, '#020203');
        ctx.fillStyle = hullGradient;
        ctx.fill();

        // Strong outer stroke + glow
        ctx.save();
        traceHullPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(220,30,30,0.95)';
        ctx.shadowColor = 'rgba(255,60,40,0.9)';
        ctx.shadowBlur = 12 + transformPulse * 30;
        ctx.stroke();
        ctx.restore();

        // Inner armor plate for a heavier, cleaner silhouette
        traceHullPath(this.w * 0.7, this.h * 0.82, 1.25);
        const armorGradient = ctx.createLinearGradient(0, -halfH * 0.82, 0, halfH * 0.82);
        armorGradient.addColorStop(0, '#242730');
        armorGradient.addColorStop(0.48, '#0e1015');
        armorGradient.addColorStop(0.52, '#1c0e10');
        armorGradient.addColorStop(1, '#050608');
        ctx.fillStyle = armorGradient;
        ctx.fill();

        // Central spine - sells the armored war-machine look
        const spineGradient = ctx.createLinearGradient(0, -halfH * 0.42, 0, halfH * 0.42);
        spineGradient.addColorStop(0, 'rgba(255,150,90,0.9)');
        spineGradient.addColorStop(0.2, 'rgba(255,60,60,0.95)');
        spineGradient.addColorStop(0.5, 'rgba(255,220,120,1)');
        spineGradient.addColorStop(0.8, 'rgba(255,60,60,0.95)');
        spineGradient.addColorStop(1, 'rgba(255,150,90,0.9)');
        ctx.fillStyle = spineGradient;
        ctx.beginPath();
        ctx.moveTo(-this.w * 0.10, -this.h * 0.40);
        ctx.lineTo(this.w * 0.08, -this.h * 0.46);
        ctx.lineTo(this.w * 0.14, 0);
        ctx.lineTo(this.w * 0.08, this.h * 0.46);
        ctx.lineTo(-this.w * 0.10, this.h * 0.40);
        ctx.lineTo(-this.w * 0.02, 0);
        ctx.closePath();
        ctx.fill();

        // CENTRAL ENERGY CORE - cleaner pulsing core
        const coreScale = 1 + transformPulse * 0.6 + Math.sin(time * 10) * 0.07;
        const coreR = this.w * 0.26 * coreScale;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.6);
        core.addColorStop(0, 'rgba(255,255,255,1)');
        core.addColorStop(0.15, 'rgba(255,220,80,1)');
        core.addColorStop(0.4, 'rgba(255,40,40,0.95)');
        core.addColorStop(0.75, 'rgba(140,20,20,0.25)');
        core.addColorStop(1, 'transparent');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fill();

        // CONNECTED CIRCUITS - deterministic, anchored to hull and core
        ctx.lineWidth = 1.6;
        const circuitAlpha = 0.45 + Math.sin(time * 6) * 0.25;
        ctx.strokeStyle = `rgba(0,255,120,${circuitAlpha.toFixed(2)})`;
        const numBranches = Math.max(3, Math.floor(this.h / 24));
        for (let i = 0; i < numBranches; i++) {
            const t = i / (numBranches - 1);
            const y = -this.h / 2 + 12 + t * (this.h - 24);
            const xOuter = this.w / 2 - Math.max(3, shoulder * 0.9);
            ctx.beginPath();
            ctx.moveTo(xOuter, y);
            // smooth curve into core
            const cx = xOuter - this.w * 0.35;
            const cy = y + Math.sin(time * 2 + i) * 6;
            ctx.quadraticCurveTo(cx, cy, 0 + Math.cos(i + time) * 4, Math.sin(i * 1.2 + time) * 3);
            ctx.stroke();
            // small animated node near hull
            ctx.fillStyle = `rgba(255,255,120,${(0.35 + Math.abs(Math.sin(time * 6 + i)) * 0.6).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(xOuter - 6, y + Math.sin(time * 3 + i) * 2, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // DETERMINISTIC ELECTRIC ARCS - few, visible, anchored to hull and core
        ctx.lineWidth = 2;
        for (let a = 0; a < 3; a++) {
            const phase = time * (3 + a) + a * 1.37;
            const ax = Math.cos(phase) * (this.w * 0.55);
            const ay = Math.sin(phase * 0.9) * (this.h * 0.35);
            const bx = Math.cos(phase + 1.2) * (this.w * 0.2);
            const by = Math.sin(phase + 0.8) * (this.h * 0.15);

            // bright inner stroke
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,220,90,${(0.6 + Math.sin(phase * 4) * 0.2).toFixed(2)})`;
            ctx.moveTo(ax, ay);
            ctx.bezierCurveTo(ax * 0.6, ay * 0.4, bx * 1.2, by * 1.4, bx, by);
            ctx.stroke();

            // outer glow
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,80,40,${(0.18 + Math.abs(Math.sin(phase * 2)) * 0.1).toFixed(2)})`;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.lineWidth = 2;
        }

        // subtle outer aura fill (keeps body visually connected)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        traceHullPath(this.w + 14 + transformPulse * 10, this.h + 18 + transformPulse * 16, 0.85);
        const auraGradient = ctx.createRadialGradient(0, 0, coreR * 0.1, 0, 0, Math.max(this.w, this.h) * 0.7);
        auraGradient.addColorStop(0, `rgba(255,60,40,${(0.22 + transformPulse * 0.18).toFixed(2)})`);
        auraGradient.addColorStop(0.5, `rgba(255,40,20,${(0.12 + transformPulse * 0.08).toFixed(2)})`);
        auraGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGradient;
        ctx.fill();
        ctx.restore();

        // LASER HUD - ENHANCED WEAPON DISPLAY

    }

    // ────── Helpers ──────

    renderPlayer(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse) {

        // MAIN HULL
        ctx.fillStyle = '#0D0D14';
        this._roundRect(ctx, -this.w / 2, -this.h / 2, this.w, this.h, 3);
        ctx.fill();

        // Armor panels
        ctx.fillStyle = '#1C1C26';
        ctx.beginPath();
        ctx.moveTo(-this.w / 2, -this.h / 2);
        ctx.lineTo(this.w / 2 * 0.9, -this.h / 2 + this.h * 0.25);
        ctx.lineTo(this.w / 2 * 0.9, this.h / 2 - this.h * 0.25);
        ctx.lineTo(-this.w / 2, this.h / 2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(this.w / 2, -this.h / 2);
        ctx.lineTo(-this.w / 2 * 0.9, -this.h / 2 + this.h * 0.25);
        ctx.lineTo(-this.w / 2 * 0.9, this.h / 2 - this.h * 0.25);
        ctx.lineTo(this.w / 2, this.h / 2);
        ctx.closePath();
        ctx.fill();

        // Pulsing hex grid
        const hexAlpha = Math.floor(pulse * 128 + 64).toString(16).padStart(2, '0');
        ctx.strokeStyle = this.primaryColor + hexAlpha;
        ctx.lineWidth = 1.5;
        const hexSize = 16 + Math.sin(time * 3) * 2;
        for (let y = -this.h / 2 + hexSize; y < this.h / 2; y += hexSize * 1.5) {
            for (let x = -this.w / 2 + hexSize; x < this.w / 2; x += hexSize * 2) {
                const offset = (Math.floor((y + hexSize) / (hexSize * 1.5)) % 2) * hexSize;
                this._drawHex(ctx, x + offset, y, hexSize * 0.85);
            }
        }

        // CENTRAL ALLSPARK CORE
        const coreScale = 1 + transformPulse * 0.6 + Math.sin(time * 8) * 0.1;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, this.w * 0.4 * coreScale);
        core.addColorStop(0, '#FFFFFF');
        core.addColorStop(0.15, this.secondaryColor);
        core.addColorStop(0.4, this.primaryColor);
        core.addColorStop(0.8, this.primaryColor + '44');
        core.addColorStop(1, '#00000000');
        ctx.fillStyle = core;
        this._drawAllSpark(ctx, 0, 0, this.w * 0.35 * coreScale);

        // Glowing seams
        ctx.strokeStyle = this.secondaryColor;
        ctx.lineWidth = 3 + transformPulse * 12;
        ctx.globalAlpha = 0.7 + pulse * 0.3;
        ctx.strokeRect(-this.w / 2 + 6, -this.h / 2 + 6, this.w - 12, this.h - 12);
        ctx.globalAlpha = 1;

        // Fixed bevel lighting (this was the crash source)
        const withAlpha = (color, alpha) => {
            const rgb = color.replace(/[^\d,]/g, '').split(',').map(Number);
            return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        };

        const topLight = ctx.createLinearGradient(0, -this.h / 2, 0, -this.h / 2 + 30);
        topLight.addColorStop(0, withAlpha(this.secondaryColor, 1));
        topLight.addColorStop(1, withAlpha(this.secondaryColor, 0));
        ctx.fillStyle = topLight;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, 30);

        const bottomLight = ctx.createLinearGradient(0, this.h / 2, 0, this.h / 2 - 30);
        bottomLight.addColorStop(0, withAlpha(this.secondaryColor, 1));
        bottomLight.addColorStop(1, withAlpha(this.secondaryColor, 0));
        ctx.fillStyle = bottomLight;
        ctx.fillRect(-this.w / 2, this.h / 2 - 30, this.w, 30);

        // LASER HUD - ENHANCED WEAPON DISPLAY


        // POWER-UP SHOCKWAVE
        if (this.powerUpPulse > 0 && !this.hasLaser) {
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#00FFFF';
            ctx.globalAlpha = this.powerUpPulse;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, this.w * 0.7 + i * 30 + this.powerUpPulse * 100, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    // ────── Helpers ──────
    _drawHex(ctx, x, y, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i + 0.1;
            const hx = x + Math.cos(angle) * size;
            const hy = y + Math.sin(angle) * size * 0.9; // Slightly compressed vertically

            if (i === 0) {
                ctx.moveTo(hx, hy);
            } else {
                ctx.lineTo(hx, hy);
            }
        }
        ctx.closePath();
        ctx.stroke();
    }

    setZombieBossSkin(enabled = true) {
        this.isZombieBoss = enabled;
        if (enabled) {
            // store original base so we can revert later
            this._originalBaseColor = this.baseColor;
            this.baseColor = '#66ff66';
            this.isCustomRendered = true;
        } else {
            if (this._originalBaseColor) {
                this.baseColor = this._originalBaseColor;
            }
            this.isCustomRendered = false;
        }
        // recalc derived colours
        this.primaryColor = this.baseColor;
        this.secondaryColor = this._adjustColor(this.baseColor, 1.5);
        this.accentColor = this._adjustColor(this.baseColor, 0.7);
        this.color = this.primaryColor;
    }

    setBaseColor(color) {
        if (!color) return;
        this.baseColor = color;
        this.primaryColor = color;
        this.secondaryColor = this._adjustColor(color, 1.5);
        this.accentColor = this._adjustColor(color, 0.7);
        this.color = this.primaryColor;
        this.isZombieBoss = false;
    }

    applyCustomPaddleVisualState(style, color) {
        this.setStyle?.(style || 'classic');
        this.setBaseColor(color);
        this.originalHeight = this.h;
        this.originalSpeed = 850;
        this.lastHitTime = 0;
        this.energyPulse = 1.0;
        this.glowIntensity = 1.0;
        this.hitEffectRadius = 0;
        this.powerUpPulse = 0;
        this.laserChargeIndicator = 0;
        this.laserReadyGlow = 0;
        this.hasLaser = false;
        this.laserCharges = 0;
        this.lasers = [];
        this.laserCooldown = 0;
        this.laserStunned = false;
        this.laserStunTime = 0;
        this.deactivateLaser?.();
        this.isAI = false;
    }

    renderZombieBossAI(ctx, time, hitGlow, pulse, pulseIntensity, transformPulse) {
        // Modern detailed boss zombie with layered anatomy
        const halfW = this.w / 2;
        const halfH = this.h / 2;
        const jitter = Math.sin(time * 2.5) * 3;
        const corruptAnim = Math.sin(time * 1.5) * 0.08;
        const tau = Math.PI * 2;

        ctx.save();

        // DETAILED BODY STRUCTURE with gradient fills
        // 1. MAIN BODY HULL - Organic, corrupted shape
        const bodyGrad = ctx.createRadialGradient(-halfW * 0.2, -halfH * 0.1, halfW * 0.3, 0, 0, halfW * 1.2);
        bodyGrad.addColorStop(0, '#3a5a3a');
        bodyGrad.addColorStop(0.4, '#2a4a2a');
        bodyGrad.addColorStop(0.8, '#1a2a1a');
        bodyGrad.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = bodyGrad;

        ctx.beginPath();
        ctx.moveTo(-halfW + jitter, -halfH);
        ctx.bezierCurveTo(-halfW - 15, -halfH + 10, -halfW, 0, -halfW + jitter * 0.5, halfH + Math.sin(time) * 5);
        ctx.bezierCurveTo(-halfW * 0.5, halfH + 8, halfW * 0.5, halfH + 8, halfW - jitter * 0.5, halfH + Math.sin(time) * 5);
        ctx.bezierCurveTo(halfW, 0, halfW + 15, -halfH + 10, halfW - jitter, -halfH);
        ctx.bezierCurveTo(halfW * 0.6, -halfH - 15, -halfW * 0.6, -halfH - 15, -halfW + jitter, -halfH);
        ctx.closePath();
        ctx.fill();

        // 2. DECAY PATCHES - Detailed decay areas
        ctx.fillStyle = '#1a1a1a';
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * tau + time * 0.4;
            const px = Math.cos(ang) * halfW * 0.6;
            const py = halfH * 0.3 + Math.sin(ang) * halfH * 0.5;
            const sz = 35 + Math.sin(time * 2 + i * 0.5) * 15;
            ctx.beginPath();
            ctx.ellipse(px, py, sz * 0.8, sz * 1.1, ang * 0.3, 0, tau);
            ctx.fill();
        }

        // 3. BONE SPIKE RIDGE - Along back/top
        ctx.fillStyle = '#e8dcc8';
        for (let i = 0; i < 5; i++) {
            const xPos = -halfW + (i + 0.5) * (this.w / 5);
            const heightVariation = Math.sin(time * 1.2 + i * 0.6) * 8;
            const spikeHeight = 35 + heightVariation;

            // Main spike
            ctx.beginPath();
            ctx.moveTo(xPos, -halfH - 2);
            ctx.lineTo(xPos + 12, -halfH - spikeHeight);
            ctx.lineTo(xPos - 12, -halfH - spikeHeight);
            ctx.closePath();
            ctx.fill();

            // Bone texture
            ctx.strokeStyle = 'rgba(160,140,120,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xPos, -halfH - 5);
            ctx.lineTo(xPos, -halfH - spikeHeight + 10);
            ctx.stroke();
        }

        // 4. DETAILED BONE ARMOR PLATING
        ctx.fillStyle = '#d9c9b8';
        for (let i = 0; i < 3; i++) {
            const y = -halfH + 30 + i * 40;
            ctx.beginPath();
            ctx.rect(-halfW * 0.7, y, this.w * 1.4, 20);
            ctx.fill();

            // Plate edges
            ctx.strokeStyle = 'rgba(100,80,60,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-halfW * 0.7, y);
            ctx.lineTo(halfW * 0.7, y);
            ctx.stroke();
        }

        // 5. GLOWING EYES - Menacing and expressive
        const eyeGradL = ctx.createRadialGradient(-halfW * 0.25, -halfH + 20, 2, -halfW * 0.25, -halfH + 20, 12);
        eyeGradL.addColorStop(0, '#ff6666');
        eyeGradL.addColorStop(0.5, '#ff4444');
        eyeGradL.addColorStop(1, '#cc0000');

        const eyeGradR = ctx.createRadialGradient(halfW * 0.25, -halfH + 20, 2, halfW * 0.25, -halfH + 20, 12);
        eyeGradR.addColorStop(0, '#ff6666');
        eyeGradR.addColorStop(0.5, '#ff4444');
        eyeGradR.addColorStop(1, '#cc0000');

        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ff4444';

        // Left eye
        ctx.fillStyle = eyeGradL;
        ctx.beginPath();
        ctx.arc(-halfW * 0.25, -halfH + 20, 10, 0, tau);
        ctx.fill();

        // Eye rim/socket
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-halfW * 0.25, -halfH + 20, 12, 0, tau);
        ctx.stroke();

        // Right eye
        ctx.fillStyle = eyeGradR;
        ctx.beginPath();
        ctx.arc(halfW * 0.25, -halfH + 20, 10, 0, tau);
        ctx.fill();

        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(halfW * 0.25, -halfH + 20, 12, 0, tau);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // 6. CORRUPTED VEINS - Pulsing corruption indicator
        const veinPhase = Math.sin(time * 3) * 0.6 + 0.4;
        ctx.strokeStyle = `rgba(255,100,100,${0.3 + veinPhase * 0.4})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * tau;
            const startX = Math.cos(ang) * halfW * 0.3;
            const startY = Math.sin(ang) * halfH * 0.3;
            const endX = Math.cos(ang) * halfW * 0.8;
            const endY = Math.sin(ang) * halfH * 0.8;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            const ctrlX = Math.cos(ang + 0.5) * halfW * 0.6;
            const ctrlY = Math.sin(ang + 0.5) * halfH * 0.6;
            ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
            ctx.stroke();
        }

        // 7. ACID DRIPS from bottom - Animated
        const dripCount = 4;
        for (let i = 0; i < dripCount; i++) {
            const dripX = -halfW * 0.6 + (i / dripCount) * this.w * 1.2;
            const dripPhase = time * 2 + i * 0.8;
            const dripLen = 20 + Math.sin(dripPhase) * 12;
            const dripWidth = 5 + Math.sin(dripPhase * 1.5) * 2;

            // Acid glow
            ctx.fillStyle = `rgba(100,255,50,${0.4 + Math.sin(dripPhase) * 0.2})`;
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(100,255,50,0.6)';

            // Drip shape
            ctx.beginPath();
            ctx.moveTo(dripX, halfH);
            ctx.bezierCurveTo(dripX + dripWidth, halfH + dripLen * 0.4, dripX + dripWidth, halfH + dripLen * 0.7, dripX, halfH + dripLen);
            ctx.bezierCurveTo(dripX - dripWidth, halfH + dripLen * 0.7, dripX - dripWidth, halfH + dripLen * 0.4, dripX, halfH);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;
        }

        // 8. PULSE EFFECT - Boss status indicator
        if (pulseIntensity > 0) {
            ctx.strokeStyle = `rgba(255,200,100,${pulseIntensity * 0.5})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.rect(-halfW * 1.1, -halfH * 1.1, this.w * 2.2, this.h * 2.2);
            ctx.stroke();
        }

        // 9. INTERNAL ORGAN VISUALIZATION
        ctx.fillStyle = 'rgba(150,50,50,0.25)';
        ctx.beginPath();
        ctx.ellipse(-halfW * 0.35, 0, halfW * 0.4, halfH * 0.5, 0, 0, tau);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(halfW * 0.35, 0, halfW * 0.4, halfH * 0.5, 0, 0, tau);
        ctx.fill();

        // 10. CORRUPTED FLESH DETAIL
        ctx.fillStyle = 'rgba(200,50,50,0.2)';
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * tau;
            const x = Math.cos(ang) * halfW * 0.7;
            const y = Math.sin(ang) * halfH * 0.6;
            const size = 12 + Math.sin(time + i) * 5;
            ctx.beginPath();
            ctx.ellipse(x, y, size, size * 0.7, ang, 0, tau);
            ctx.fill();
        }

        ctx.restore();
    }

    _drawAllSpark(ctx, x, y, size) {
        const time = Date.now() * 0.001;
        const points = 8;
        const pulsate = Math.sin(time * 6) * 0.5 + 0.5;
        const animatedSize = size * (0.9 + pulsate * 0.1);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time);

        // Create spark effect with bezier curves
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
            const angle1 = (i * 2) * Math.PI / points;
            const angle2 = (i * 2 + 1) * Math.PI / points;

            const x1 = Math.cos(angle1) * animatedSize;
            const y1 = Math.sin(angle1) * animatedSize * 1.2;
            const x2 = Math.cos(angle2) * animatedSize * 0.6;
            const y2 = Math.sin(angle2) * animatedSize * 0.6 * 1.2;

            // Outer point
            ctx.lineTo(x1, y1);

            // Quadratic curve to inner point for smoother star shape
            const controlX = Math.cos((angle1 + Math.PI / points)) * animatedSize * 0.8;
            const controlY = Math.sin((angle1 + Math.PI / points)) * animatedSize * 0.8 * 1.2;

            ctx.quadraticCurveTo(controlX, controlY, x2, y2);
        }
        ctx.closePath();

        // Multi-layer gradient for depth
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, animatedSize);
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.1, '#FFD700');
        gradient.addColorStop(0.3, this.secondaryColor);
        gradient.addColorStop(0.6, this.primaryColor + 'AA');
        gradient.addColorStop(1, this.primaryColor + '00');

        ctx.fillStyle = gradient;
        ctx.fill();

        // Add energy sparks
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 4; i++) {
            const sparkAngle = time * 2 + i * Math.PI / 2;
            const sparkLength = animatedSize * (0.3 + Math.random() * 0.2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
                Math.cos(sparkAngle) * sparkLength,
                Math.sin(sparkAngle) * sparkLength
            );
            ctx.stroke();
        }

        ctx.restore();
    }
}

// Fragment system for destructible obstacle rendering

Paddle.STYLES = ['classic', 'neonBlade', 'shieldWall', 'arcadeBlock', 'prismGlass'];
