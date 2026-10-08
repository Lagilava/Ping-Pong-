class PowerUp {
    constructor(x, y, type) {
        this.pos = new Vec2(x, y);
        this.type = type;
        this.active = true;
        this.baseSize = 14.4; // Reduced from 18 to 80%
        this.size = this.baseSize;
        this.particles = [];
        this.trails = [];
        this.electricArcs = [];

        // Particle pool for optimization
        this.particlePool = [];
        this.trailPool = [];
        this.maxParticles = 100; // Added limit to prevent runaway growth
        this.maxTrails = 50;

        // Rarity system (1-5) - MOVE THIS AFTER METHODS ARE DEFINED
        this.rarity = this.getRarity(type);

        // Personality-based movement
        this.personality = this.getPersonality();
        this.vel = this.getInitialVelocity();
        this.acc = new Vec2(0, 0);
        this.maxSpeed = this.rarity * 0.8 + 1.2;
        this.steeringForce = 0.1 + (this.rarity * 0.05);

        // Visual properties - reduced by 20%
        this.rotation = 0;
        this.rotationSpeed = (Math.random() * 2 + 1) * (this.rarity * 0.3 + 1);
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 3 + this.rarity;
        this.hoverOffset = Math.random() * Math.PI * 2;
        this.hoverAmplitude = 2.4 + (this.rarity * 0.8); // Reduced from 3
        this.collected = false;
        this.collectAnimation = 0;

        // Lifetime system
        this.lifetime = 15000;
        this.spawnTime = Date.now();
        this.warningTime = 5000;
        this.blinkPhase = 0;

        // Enhanced neon visual properties - reduced by 20%
        this.auraRadius = this.baseSize * 2.0; // Reduced from 2.5
        this.innerGlowSize = this.baseSize * 0.56; // Reduced from 0.7
        this.outerRingSize = this.baseSize * 1.04; // Reduced from 1.3
        this.sparkleCount = Math.min(3 + this.rarity, 5); // Limited max sparkles
        this.sparkles = [];
        this.initSparkles();

        // Neon-specific properties
        this.neonPulseIntensity = 0.7 + Math.random() * 0.3;
        this.neonFlickerPhase = Math.random() * Math.PI * 2;
        this.neonFlickerSpeed = 15 + Math.random() * 10;
        this.neonOutlineWidth = 1.6 + (this.rarity * 0.4); // Reduced from 2
        this.electricArcCount = Math.min(3 + Math.floor(this.rarity / 2), 5); // Limited arcs
        this.initElectricArcs();

        // Information properties
        this.icon = this.getIcon(type);
        this.tooltip = this.getTooltip(type);
        this.color = this.getNeonColor(type);
        this.secondaryColor = this.getNeonSecondaryColor(type);
        this.glowColor = this.getNeonGlowColor(type);

        // Special behavior flags
        this.isMagnetic = Math.random() < 0.3;
        this.phaseThroughWalls = this.rarity >= 4;
        this.emitsLight = this.rarity >= 3;

        // Audio identifier
        this.soundId = `powerup_${type}`;
    }

    // Initialize electric arcs for enhanced neon effect
    initElectricArcs() {
        // Clear existing arcs
        this.electricArcs = [];

        // Create more arcs for a denser electric effect
        const arcCount = this.electricArcCount || 8;

        for (let i = 0; i < arcCount; i++) {
            // Create arcs with more dynamic properties
            const baseAngle = (Math.PI * 2 / arcCount) * i;
            const angleVariation = (Math.random() - 0.5) * 0.4;

            this.electricArcs.push({
                // Base angle with slight variation
                angle: baseAngle + angleVariation,

                // More dramatic length variation
                length: this.size * (0.8 + Math.random() * 1.2),

                // Variable width for more realistic electricity
                width: 0.5 + Math.random() * 2.5,

                // Faster movement for more energy
                speed: 3 + Math.random() * 5,

                // Phase for animation
                phase: Math.random() * Math.PI * 2,

                // More segments for more detailed arcs
                segments: 4 + Math.floor(Math.random() * 4),

                // Add color variation for more visual interest
                color: this.getElectricColor(),

                // Add opacity variation
                opacity: 0.6 + Math.random() * 0.4,

                // Add branching property for more realistic electricity
                hasBranch: Math.random() > 0.6,
                branchAngle: (Math.random() - 0.5) * Math.PI,
                branchLength: this.size * (0.3 + Math.random() * 0.5),

                // Add pulsing property
                pulseSpeed: 0.05 + Math.random() * 0.1,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    // Helper method to get electric colors
    getElectricColor() {
        const colors = [
            '#00ffff', // Cyan
            '#0099ff', // Light blue
            '#ffffff', // White
            '#99ccff', // Pale blue
            '#66ffff'  // Light cyan
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Enhanced rendering method for the electric arcs
    renderElectricArcs(ctx, x, y, time) {
        this.electricArcs.forEach(arc => {
            ctx.save();

            // Calculate pulsing effect
            const pulseFactor = 1 + Math.sin(time * arc.pulseSpeed + arc.pulsePhase) * 0.2;

            // Set arc properties with pulsing
            ctx.strokeStyle = arc.color;
            ctx.lineWidth = arc.width * pulseFactor;
            ctx.globalAlpha = arc.opacity * pulseFactor;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = arc.color;

            // Calculate arc endpoints
            const endX = x + Math.cos(arc.angle + time * arc.speed * 0.01) * arc.length * pulseFactor;
            const endY = y + Math.sin(arc.angle + time * arc.speed * 0.01) * arc.length * pulseFactor;

            // Draw main arc with lightning-like jaggedness
            ctx.beginPath();
            ctx.moveTo(x, y);

            // Create jagged lightning path
            for (let i = 1; i <= arc.segments; i++) {
                const segmentRatio = i / arc.segments;
                const jaggedness = (Math.random() - 0.5) * 10;
                const segX = x + (endX - x) * segmentRatio + jaggedness;
                const segY = y + (endY - y) * segmentRatio + jaggedness;
                ctx.lineTo(segX, segY);
            }

            ctx.stroke();

            // Draw branch if it has one
            if (arc.hasBranch) {
                // Choose a random point along the main arc to branch from
                const branchPoint = 0.3 + Math.random() * 0.4;
                const branchX = x + (endX - x) * branchPoint;
                const branchY = y + (endY - y) * branchPoint;

                // Calculate branch endpoint
                const branchEndX = branchX + Math.cos(arc.branchAngle) * arc.branchLength * pulseFactor;
                const branchEndY = branchY + Math.sin(arc.branchAngle) * arc.branchLength * pulseFactor;

                // Draw branch with fewer segments
                ctx.beginPath();
                ctx.moveTo(branchX, branchY);

                for (let i = 1; i <= Math.max(2, arc.segments / 2); i++) {
                    const segmentRatio = i / Math.max(2, arc.segments / 2);
                    const jaggedness = (Math.random() - 0.5) * 5;
                    const segX = branchX + (branchEndX - branchX) * segmentRatio + jaggedness;
                    const segY = branchY + (branchEndY - branchY) * segmentRatio + jaggedness;
                    ctx.lineTo(segX, segY);
                }

                ctx.stroke();
            }

            ctx.restore();
        });
    }

    // Get personality type based on rarity and type
    getPersonality() {
        const personalities = ['timid', 'curious', 'aggressive', 'erratic', 'magnetic'];
        if (this.rarity >= 5) return personalities[4]; // Legendary are magnetic
        if (this.type.includes('chaos') || this.type.includes('ghost')) return personalities[3]; // Erratic
        if (this.type.includes('laser') || this.type.includes('power')) return personalities[2]; // Aggressive
        if (Math.random() > 0.5) return personalities[1]; // Curious
        return personalities[0]; // Timid
    }

    // Get initial velocity based on personality
    getInitialVelocity() {
        const base = 0.5;
        switch (this.personality) {
            case 'timid':
                return new Vec2((Math.random() - 0.5) * base, (Math.random() - 0.5) * base);
            case 'curious':
                return new Vec2((Math.random() - 0.5) * base * 1.5, (Math.random() - 0.5) * base * 1.5);
            case 'aggressive':
                return new Vec2((Math.random() - 0.5) * base * 2, (Math.random() - 0.5) * base * 2);
            case 'erratic':
                return new Vec2((Math.random() * 2 - 1) * base * 3, (Math.random() * 2 - 1) * base * 3);
            case 'magnetic':
                return new Vec2(0, 0); // Start stationary
        }
    }

    // Initialize sparkle particles
    initSparkles() {
        for (let i = 0; i < this.sparkleCount; i++) {
            this.sparkles.push({
                angle: (Math.PI * 2 * i) / this.sparkleCount,
                distance: this.auraRadius * (0.8 + Math.random() * 0.4),
                speed: 2 + Math.random() * 3,
                size: 1 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // Enhanced rarity system with weights
    getRarity(type) {
        const rarityWeights = {
            'common': ['slowBall', 'fastPaddle', 'smallBall'],
            'uncommon': ['bigPaddle', 'magnetPaddle', 'ghostBall'],
            'rare': ['freezeAI', 'shrinkOpponent', 'powerShot'],
            'epic': ['invincible', 'timeWarp', 'laserPaddle', 'shield'],
            'legendary': ['multiBall', 'chaosMode']
        };

        for (const [rarity, types] of Object.entries(rarityWeights)) {
            if (types.includes(type)) {
                return ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(rarity) + 1;
            }
        }
        return 1;
    }

    // Get rarity-based neon color scheme
    getRarityColorScheme() {
        const schemes = {
            1: { primary: '#00ffff', secondary: '#00cccc', glow: '#0099cc' }, // Cyan
            2: { primary: '#00ff00', secondary: '#00cc00', glow: '#009900' }, // Green
            3: { primary: '#ff00ff', secondary: '#cc00cc', glow: '#9900cc' }, // Magenta
            4: { primary: '#ffff00', secondary: '#cccc00', glow: '#999900' }, // Yellow
            5: { primary: '#ff00ff', secondary: '#ff00aa', glow: '#ff0066' }  // Pink/Purple
        };
        return schemes[this.rarity] || schemes[1];
    }

    // Enhanced icon mapping with animations
    getIcon(type) {
        // Icons are now rendered via renderPowerUpIcon using custom vector logic
        return '⭐';
    }

    // Dynamic tooltips with more info
    getTooltip(type) {
        const tips = {
            'slowBall': 'Ball Speed -50%',
            'fastPaddle': 'Paddle Speed +100%',
            'freezeAI': 'AI Frozen for 5s',
            'bigPaddle': 'Paddle Size +50%',
            'smallBall': 'Ball Size -30%',
            'invincible': 'Invincible for 8s',
            'multiBall': 'Spawns 2 Extra Balls',
            'powerShot': 'Next Shot Breaks Walls',
            'timeWarp': 'Slow Motion for 4s',
            'magnetPaddle': 'Ball Attraction Active',
            'ghostBall': 'Phase Through Obstacles',
            'laserPaddle': 'Shoot Projectiles',
            'shrinkOpponent': 'Opponent -40% Size',
            'chaosMode': 'Random Effects!',
            'shield': 'Blocks Next Goal'
        };
        const rarity = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][this.rarity - 1];
        return `${rarity}: ${tips[type]}`;
    }

    // Enhanced neon color system with gradients
    getNeonColor(type) {
        const colors = {
            'slowBall': '#00ffff', // Cyan
            'fastPaddle': '#00ff00', // Green
            'freezeAI': '#0099ff', // Blue
            'bigPaddle': '#ff00ff', // Magenta
            'smallBall': '#ff00aa', // Pink
            'invincible': '#ffaa00', // Orange
            'multiBall': '#ffffff', // White
            'powerShot': '#ff0000', // Red
            'timeWarp': '#aa00ff', // Purple
            'magnetPaddle': '#00ffaa', // Mint
            'ghostBall': '#aaaaaa', // Light Gray
            'laserPaddle': '#ff0055', // Hot Pink
            'shrinkOpponent': '#0055ff', // Deep Blue
            'chaosMode': '#ff00ff', // Magenta
            'shield': '#00aaff' // Sky Blue
        };
        return colors[type] || '#ffffff';
    }

    // Get secondary color for neon gradients
    getNeonSecondaryColor(type) {
        const colors = {
            'slowBall': '#0099cc',
            'fastPaddle': '#00cc00',
            'freezeAI': '#0066cc',
            'bigPaddle': '#cc00cc',
            'smallBall': '#cc0088',
            'invincible': '#cc8800',
            'multiBall': '#cccccc',
            'powerShot': '#cc0000',
            'timeWarp': '#8800cc',
            'magnetPaddle': '#00cc88',
            'ghostBall': '#888888',
            'laserPaddle': '#cc0044',
            'shrinkOpponent': '#0044cc',
            'chaosMode': '#cc00cc',
            'shield': '#0088cc'
        };
        return colors[type] || '#cccccc';
    }

    // Enhanced neon glow colors
    getNeonGlowColor(type) {
        const glows = {
            'slowBall': '#006699',
            'fastPaddle': '#009900',
            'freezeAI': '#004499',
            'bigPaddle': '#990099',
            'smallBall': '#990066',
            'invincible': '#996600',
            'multiBall': '#999999',
            'powerShot': '#990000',
            'timeWarp': '#660099',
            'magnetPaddle': '#009966',
            'ghostBall': '#666666',
            'laserPaddle': '#990033',
            'shrinkOpponent': '#003399',
            'chaosMode': '#990099',
            'shield': '#006699'
        };
        return glows[type] || '#999999';
    }

    // Get particle from pool or create new one
    getParticleFromPool(x, y, color, size, life, vx, vy) {
        if (this.particlePool.length > 0) {
            const particle = this.particlePool.pop();
            particle.reset(x, y, color, size, life, vx, vy);
            return particle;
        }
        return new NeonParticle(x, y, color, size, life, vx, vy);
    }

    // Get trail particle from pool
    getTrailFromPool(x, y, color, size, life, vx, vy) {
        if (this.trailPool.length > 0) {
            const trail = this.trailPool.pop();
            trail.reset(x, y, color, size, life, vx, vy);
            return trail;
        }
        return new NeonTrailParticle(x, y, color, size, life, vx, vy);
    }

    // Return particle to pool when done
    returnParticleToPool(particle) {
        if (this.particlePool.length < 50) { // Limit pool size
            this.particlePool.push(particle);
        }
    }

    // Return trail to pool
    returnTrailToPool(trail) {
        if (this.trailPool.length < 30) {
            this.trailPool.push(trail);
        }
    }

    update(dt, game) {
        const particlesEnabled = areParticleEffectsEnabled();
        if (this.collected) {
            this.collectAnimation += dt * 4;
            this.size = this.baseSize * (1 + this.collectAnimation * 2);
            if (this.collectAnimation > 1) {
                this.active = false;
            }
            return;
        }

        // Check lifetime
        const timeLeft = this.lifetime - (Date.now() - this.spawnTime);
        if (timeLeft <= 0) {
            this.createExpiryEffect();
            this.active = false;
            return;
        }

        // Warning effect
        if (timeLeft < this.warningTime) {
            this.blinkPhase += dt * 10;
            const warningIntensity = 1 - (timeLeft / this.warningTime);
            this.pulseSpeed = 10 + warningIntensity * 20;
        }

        // Update pulsing effect
        this.pulsePhase += dt * this.pulseSpeed;
        const pulseFactor = 1 + Math.sin(this.pulsePhase) * 0.15;
        this.size = this.baseSize * pulseFactor;

        // Update hover effect
        this.hoverOffset += dt * 2;

        // Update rotation
        this.rotation += dt * this.rotationSpeed;

        // Update neon flicker effect
        this.neonFlickerPhase += dt * this.neonFlickerSpeed;

        if (particlesEnabled) {
            // Update sparkles
            this.sparkles.forEach(sparkle => {
                sparkle.phase += dt * sparkle.speed;
            });

            // Update electric arcs
            this.electricArcs.forEach(arc => {
                arc.phase += dt * arc.speed;
                arc.angle += dt * 0.5;
            });

            // OPTIMIZED: Create trail particles less frequently
            if (Math.random() < 0.4 && this.trails.length < this.maxTrails) { // Reduced frequency
                const trail = this.getTrailFromPool(
                    this.pos.x,
                    this.pos.y,
                    this.color,
                    1.5 + Math.random() * 2, // Reduced size
                    0.6, // Shorter life
                    -this.vel.x * 0.3, // Reduced velocity
                    -this.vel.y * 0.3
                );
                this.trails.push(trail);
            }

            // Update trails - return to pool instead of filtering
            const aliveTrails = [];
            this.trails.forEach(t => {
                if (t.update(dt)) {
                    aliveTrails.push(t);
                } else {
                    this.returnTrailToPool(t);
                }
            });
            this.trails = aliveTrails;

            // OPTIMIZED: Reduced ambient particle frequency
            if (Math.random() < 0.2 + (this.rarity * 0.05) && this.particles.length < this.maxParticles) {
                this.createAmbientParticle();
            }

            // Update particles - return to pool instead of filtering
            const aliveParticles = [];
            this.particles.forEach(p => {
                if (p.update(dt)) {
                    aliveParticles.push(p);
                } else {
                    this.returnParticleToPool(p);
                }
            });
            this.particles = aliveParticles;
        } else {
            this.trails.length = 0;
            this.particles.length = 0;
        }

        // Smooth color transition for pulsing lighting
        this.lightingPhase = (this.lightingPhase || 0) + dt * 2;
        this.lightIntensity = 0.8 + Math.sin(this.lightingPhase) * 0.2;

        // Behavior-based movement
        this.updateBehavior(game);

        // Apply physics
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;

        // Limit speed
        const speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
        if (speed > this.maxSpeed) {
            this.vel.x = (this.vel.x / speed) * this.maxSpeed;
            this.vel.y = (this.vel.y / speed) * this.maxSpeed;
        }

        // Apply velocity with reduced hover
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y + Math.sin(Date.now() * 0.002) * 0.2; // Reduced hover

        // Wall collision
        if (!this.phaseThroughWalls) {
            this.handleWallCollision(game);
        }

        // Reset acceleration
        this.acc.x = this.acc.y = 0;
    }

    updateBehavior(game) {
        if (!game) return;

        // Personality-based behaviors
        switch (this.personality) {
            case 'timid':
                this.behaviorTimid(game);
                break;
            case 'curious':
                this.behaviorCurious(game);
                break;
            case 'aggressive':
                this.behaviorAggressive(game);
                break;
            case 'erratic':
                this.behaviorErratic();
                break;
            case 'magnetic':
                this.behaviorMagnetic(game);
                break;
        }

        // Avoid obstacles
        if (game.obstacles) {
            this.avoidObstacles(game.obstacles);
        }

        // Magnetic attraction to player
        if (this.isMagnetic && game.player) {
            this.attractToPlayer(game.player);
        }
    }

    behaviorTimid(game) {
        // Flee from ball and players
        if (game.ball) {
            const distToBall = this.pos.distance(game.ball.pos);
            if (distToBall < 150) {
                this.fleeFrom(game.ball.pos, 0.5);
            }
        }
    }

    behaviorCurious(game) {
        // Follow the ball at a distance
        if (game.ball) {
            const desiredDistance = 80 + this.rarity * 10;
            const distToBall = this.pos.distance(game.ball.pos);

            if (distToBall > desiredDistance) {
                this.seek(game.ball.pos, 0.3);
            } else if (distToBall < desiredDistance * 0.7) {
                this.fleeFrom(game.ball.pos, 0.2);
            }
        }
    }

    behaviorAggressive(game) {
        // Chase the player
        if (game.player) {
            this.seek(game.player.pos, 0.4);
        }
    }

    behaviorErratic() {
        // Random direction changes
        if (Math.random() < 0.02) {
            this.vel.x += (Math.random() - 0.5) * 2;
            this.vel.y += (Math.random() - 0.5) * 2;
        }
    }

    behaviorMagnetic(game) {
        // Strong attraction to player, repulsion from ball
        if (game.player) {
            this.seek(game.player.pos, 0.6);
        }
        if (game.ball) {
            const dist = this.pos.distance(game.ball.pos);
            if (dist < 100) {
                this.fleeFrom(game.ball.pos, 0.4);
            }
        }
    }

    seek(target, strength) {
        const desiredX = target.x - this.pos.x;
        const desiredY = target.y - this.pos.y;
        const dist = Math.sqrt(desiredX * desiredX + desiredY * desiredY);

        if (dist > 0) {
            this.acc.x += (desiredX / dist) * strength;
            this.acc.y += (desiredY / dist) * strength;
        }
    }

    fleeFrom(target, strength) {
        const desiredX = this.pos.x - target.x;
        const desiredY = this.pos.y - target.y;
        const dist = Math.sqrt(desiredX * desiredX + desiredY * desiredY);

        if (dist > 0) {
            this.acc.x += (desiredX / dist) * strength;
            this.acc.y += (desiredY / dist) * strength;
        }
    }

    avoidObstacles(obstacles) {
        const avoidRadius = 60 + this.rarity * 10;

        for (const obstacle of obstacles) {
            const obstacleCenter = new Vec2(
                obstacle.pos.x + obstacle.w / 2,
                obstacle.pos.y + obstacle.h / 2
            );

            const dist = this.pos.distance(obstacleCenter);
            if (dist < avoidRadius) {
                this.fleeFrom(obstacleCenter, 0.8 * (1 - dist / avoidRadius));
            }
        }
    }

    attractToPlayer(player) {
        const attractionRadius = 200;
        const dist = this.pos.distance(player.pos);

        if (dist < attractionRadius) {
            const strength = 0.4 * (1 - dist / attractionRadius);
            this.seek(player.pos, strength);
        }
    }

    handleWallCollision(game) {
        const gameWidth = game ? game.width : 800;
        const gameHeight = game ? game.height : 600;
        const bounceDamping = 0.8;

        if (this.pos.x - this.size < 0) {
            this.pos.x = this.size;
            this.vel.x = Math.abs(this.vel.x) * bounceDamping;
            this.createWallBounceEffect(0, this.pos.y);
        }
        if (this.pos.x + this.size > gameWidth) {
            this.pos.x = gameWidth - this.size;
            this.vel.x = -Math.abs(this.vel.x) * bounceDamping;
            this.createWallBounceEffect(gameWidth, this.pos.y);
        }
        if (this.pos.y - this.size < 0) {
            this.pos.y = this.size;
            this.vel.y = Math.abs(this.vel.y) * bounceDamping;
            this.createWallBounceEffect(this.pos.x, 0);
        }
        if (this.pos.y + this.size > gameHeight) {
            this.pos.y = gameHeight - this.size;
            this.vel.y = -Math.abs(this.vel.y) * bounceDamping;
            this.createWallBounceEffect(this.pos.x, gameHeight);
        }
    }

    createAmbientParticle() {
        const angle = Math.random() * Math.PI * 2;
        const distance = this.auraRadius * 0.8;
        const x = this.pos.x + Math.cos(angle) * distance;
        const y = this.pos.y + Math.sin(angle) * distance;

        this.particles.push(this.getParticleFromPool(
            x,
            y,
            this.secondaryColor,
            0.8 + Math.random() * 1.6, // Reduced size
            1.2, // Reduced life
            (Math.random() - 0.5) * 8, // Reduced velocity
            (Math.random() - 0.5) * 8
        ));
    }

    createWallBounceEffect(x, y) {
        // OPTIMIZED: Reduced particle count
        const count = Math.min(6 + this.rarity, 15); // Limited maximum
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 15 + Math.random() * 30 + (this.rarity * 8); // Reduced speed

            this.particles.push(this.getParticleFromPool(
                x,
                y,
                this.color,
                1.6 + Math.random() * 2.4, // Reduced size
                0.6, // Reduced life
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            ));
        }
    }

    createExpiryEffect() {
        // OPTIMIZED: Significantly reduced particle count
        const count = Math.min(15 + this.rarity * 3, 30); // Limited maximum
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 20 + Math.random() * 30 + (this.rarity * 10); // Reduced speed

            this.particles.push(this.getParticleFromPool(
                this.pos.x,
                this.pos.y,
                this.color,
                1.6 + Math.random() * 3.2, // Reduced size
                1.0, // Reduced life
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            ));
        }
    }

    render(ctx) {
        const particlesEnabled = areParticleEffectsEnabled();
        // OPTIMIZED: Use requestAnimationFrame callback style for better batching
        const renderBatch = (items, renderFn) => {
            if (items.length === 0) return;

            // Batch similar particles together
            let currentColor = null;
            let batchStart = 0;

            for (let i = 0; i <= items.length; i++) {
                const item = items[i];
                if (!item || item.color !== currentColor) {
                    if (i > batchStart) {
                        // Render batch
                        ctx.save();
                        for (let j = batchStart; j < i; j++) {
                            items[j].render(ctx);
                        }
                        ctx.restore();
                    }
                    if (item) {
                        currentColor = item.color;
                        batchStart = i;
                    }
                }
            }
        };

        // Render trails and particles in batches
        if (particlesEnabled) {
            renderBatch(this.trails, 'render');
            renderBatch(this.particles, 'render');
        }

        if (!this.active) return;

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);

        // Apply hover
        const hoverY = Math.sin(this.hoverOffset) * this.hoverAmplitude;
        ctx.translate(0, hoverY);
        ctx.rotate(this.rotation);

        // Warning effect
        const timeLeft = this.lifetime - (Date.now() - this.spawnTime);
        let opacity = 1;
        if (timeLeft < this.warningTime) {
            opacity = 0.7 + Math.sin(this.blinkPhase) * 0.3;
        }

        // Neon flicker effect
        const flicker = 0.8 + Math.sin(this.neonFlickerPhase) * 0.2;
        opacity *= flicker;

        // PERFORMANCE-OPTIMIZED NEON LIGHTING
        // Nested circles for "Bloom" + Dynamic Light Flares
        if (opacity > 0.1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            const baseOpacity = opacity * (this.lightIntensity || 1);

            // 1. Soft Ambient Bloom (Very Large, Very Faint)
            ctx.globalAlpha = baseOpacity * 0.1;
            const ambientRadius = this.auraRadius * (1.8 + Math.sin(this.lightingPhase * 0.5) * 0.2);
            const ambientGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, ambientRadius);
            ambientGradient.addColorStop(0, this.glowColor);
            ambientGradient.addColorStop(1, 'transparent');
            ctx.fillStyle = ambientGradient;
            ctx.beginPath();
            ctx.arc(0, 0, ambientRadius, 0, Math.PI * 2);
            ctx.fill();

            // 2. Focused Core Glow (Mid-size, more intense)
            ctx.globalAlpha = baseOpacity * 0.3;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.auraRadius, 0, Math.PI * 2);
            ctx.fill();

            // 3. Dynamic "Corona" Ring (Subtle shimmer)
            ctx.globalAlpha = baseOpacity * 0.2;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, this.auraRadius * (0.8 + Math.sin(this.lightingPhase) * 0.05), 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }

        // Electric arcs with reduced quality when opacity is low
        if (particlesEnabled && opacity > 0.3) {
            this.electricArcs.forEach(arc => {
                this.renderElectricArc(ctx, arc, opacity);
            });
        }

        // Outer ring - simplified for performance
        ctx.strokeStyle = this.secondaryColor;
        ctx.lineWidth = this.neonOutlineWidth;
        // Removed shadowBlur here for speed, the 'lighter' circles handle the glow
        ctx.beginPath();
        ctx.arc(0, 0, this.outerRingSize, 0, Math.PI * 2);
        ctx.stroke();

        // Main orb with simplified gradient
        const orbGradient = ctx.createRadialGradient(
            -this.size * 0.2, -this.size * 0.2, 0,
            0, 0, this.size
        );
        orbGradient.addColorStop(0, '#ffffff'); // Add white core for "hot" neon look
        orbGradient.addColorStop(0.2, this.color);
        orbGradient.addColorStop(0.7, this.secondaryColor);
        orbGradient.addColorStop(1, `${this.glowColor}aa`);

        ctx.fillStyle = orbGradient;
        // Minimal shadow for the hard object itself
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow immediately

        // Simplified inner glow
        ctx.globalAlpha = opacity * 0.5;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.innerGlowSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = opacity;

        // Emissive light bloom for powerups that emit light
        if (this.emitsLight) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const pulse = 0.6 + Math.abs(Math.sin(this.neonFlickerPhase * 0.12)) * 0.6;
            const bloomRadius = this.auraRadius * (1.2 + 0.4 * pulse);

            // High-quality directional flares for Legendaries/Emissives
            for (let i = 0; i < 2; i++) {
                ctx.rotate(this.neonFlickerPhase * 0.01 * (i + 1));
                const flare = ctx.createLinearGradient(-this.size * 2, 0, this.size * 2, 0);
                flare.addColorStop(0, 'transparent');
                flare.addColorStop(0.5, `${this.color}44`);
                flare.addColorStop(1, 'transparent');
                ctx.fillStyle = flare;
                ctx.fillRect(-this.size * 2, -1, this.size * 4, 2);
            }

            const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
            bloom.addColorStop(0, `${this.glowColor}66`);
            bloom.addColorStop(0.5, `${this.glowColor}33`);
            bloom.addColorStop(1, 'transparent');
            ctx.fillStyle = bloom;
            ctx.globalAlpha = 0.9 * (0.25 + pulse * 0.15);
            ctx.beginPath();
            ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
            ctx.fill();

            // Subtle rotating flare
            ctx.rotate(this.neonFlickerPhase * 0.02);
            const flare = ctx.createLinearGradient(-this.size * 1.5, 0, this.size * 1.5, 0);
            flare.addColorStop(0, 'transparent');
            flare.addColorStop(0.5, `${this.color}88`);
            flare.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.6 * (0.4 + Math.sin(this.neonFlickerPhase * 0.08) * 0.3);
            ctx.fillStyle = flare;
            ctx.fillRect(-this.size * 1.5, -this.size * 0.25, this.size * 3, this.size * 0.5);
            ctx.restore();
        }

        // Reduced sparkle rendering when low opacity
        if (particlesEnabled && opacity > 0.5) {
            this.sparkles.forEach(sparkle => {
                const x = Math.cos(sparkle.angle + sparkle.phase) * sparkle.distance;
                const y = Math.sin(sparkle.angle + sparkle.phase) * sparkle.distance;

                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 5; // Reduced blur
                ctx.beginPath();
                ctx.arc(x, y, sparkle.size * 0.8, 0, Math.PI * 2); // Reduced size
                ctx.fill();
            });
        }

        // Custom SVG-style Icon Rendering
        this.renderPowerUpIcon(ctx, opacity);

        // Simplified rarity stars
        if (this.rarity >= 4 && opacity > 0.7) {
            const starCount = this.rarity - 3;
            for (let i = 0; i < starCount; i++) {
                const angle = (Date.now() * 0.001 + i * Math.PI * 2 / starCount) % (Math.PI * 2);
                const distance = this.size + 8; // Reduced distance
                const x = Math.cos(angle) * distance;
                const y = Math.sin(angle) * distance;

                ctx.fillStyle = '#ffff00';
                ctx.shadowColor = '#ffff00';
                ctx.shadowBlur = 5; // Reduced blur
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2); // Reduced size
                ctx.fill();
            }
        }

        // Simplified neon border
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.neonOutlineWidth * 0.8; // Reduced width
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15; // Reduced blur
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    renderElectricArc(ctx, arc, opacity) {
        // OPTIMIZED: Skip rendering low-opacity arcs
        if (opacity < 0.3) return;

        ctx.save();
        ctx.globalAlpha = opacity * 0.6; // Reduced opacity
        ctx.strokeStyle = this.color;
        ctx.lineWidth = arc.width * 0.8; // Reduced width
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 5; // Reduced blur
        ctx.lineCap = 'round';

        // Simplified arc with fewer segments for performance
        ctx.beginPath();
        const startX = Math.cos(arc.angle) * this.size;
        const startY = Math.sin(arc.angle) * this.size;
        ctx.moveTo(startX, startY);

        // Reduced segments for performance
        const segments = Math.min(arc.segments, 3);
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const length = arc.length * t;
            const offset = Math.sin(arc.phase + t * Math.PI) * 3; // Reduced offset
            const angle = arc.angle + offset * 0.05; // Reduced angle variation

            const x = Math.cos(angle) * (this.size + length);
            const y = Math.sin(angle) * (this.size + length);
            ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    // High-fidelity custom icon rendering (Vector-based)
    renderPowerUpIcon(ctx, opacity) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#111111';
        ctx.lineWidth = 1.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const s = this.size * 0.65; // Core icon scale

        switch (this.type) {
            case 'slowBall': // Advanced Snail SVG
                ctx.beginPath();
                // Shell spiral
                for (let i = 0; i < 30; i++) {
                    const angle = i * 0.4;
                    const r = (i / 30) * s * 0.9;
                    const px = Math.cos(angle) * r;
                    const py = Math.sin(angle) * r - s * 0.1;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
                // Body
                ctx.beginPath();
                ctx.moveTo(-s, s * 0.3);
                ctx.lineTo(s * 0.8, s * 0.3);
                ctx.quadraticCurveTo(s * 1.2, s * 0.3, s * 1.2, -s * 0.1); // Head
                ctx.stroke();
                // Antennas
                ctx.beginPath();
                ctx.moveTo(s * 1.1, -s * 0.1); ctx.lineTo(s * 1.3, -s * 0.4);
                ctx.moveTo(s * 1.0, -s * 0.1); ctx.lineTo(s * 1.1, -s * 0.5);
                ctx.stroke();
                break;

            case 'fastPaddle': // High-voltage bolt
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.moveTo(s * 0.2, -s);
                ctx.lineTo(-s * 0.6, s * 0.1);
                ctx.lineTo(s * 0.1, s * 0.1);
                ctx.lineTo(-s * 0.2, s);
                ctx.lineTo(s * 0.7, -s * 0.1);
                ctx.lineTo(0, -s * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;

            case 'freezeAI': // Intricate Snowflake
                ctx.lineWidth = 1;
                for (let i = 0; i < 6; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 3);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -s);
                    // Side branches
                    ctx.moveTo(0, -s * 0.4); ctx.lineTo(-s * 0.25, -s * 0.6);
                    ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.25, -s * 0.6);
                    ctx.moveTo(0, -s * 0.7); ctx.lineTo(-s * 0.15, -s * 0.85);
                    ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.15, -s * 0.85);
                    ctx.stroke();
                    ctx.restore();
                }
                break;

            case 'bigPaddle': // Expansion Blueprint
                ctx.beginPath();
                ctx.rect(-s, -s * 0.2, s * 2, s * 0.4); // Paddle shape
                ctx.stroke();
                // Extension indicators
                ctx.beginPath();
                ctx.moveTo(-s * 1.2, 0); ctx.lineTo(-s * 0.7, -s * 0.3);
                ctx.moveTo(-s * 1.2, 0); ctx.lineTo(-s * 0.7, s * 0.3);
                ctx.moveTo(s * 1.2, 0); ctx.lineTo(s * 0.7, -s * 0.3);
                ctx.moveTo(s * 1.2, 0); ctx.lineTo(s * 0.7, s * 0.3);
                ctx.stroke();
                break;

            case 'smallBall': // Precision target
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Inward arrows
                for (let i = 0; i < 4; i++) {
                    ctx.rotate(Math.PI / 2);
                    ctx.beginPath();
                    ctx.moveTo(0, -s);
                    ctx.lineTo(0, -s * 0.4);
                    ctx.lineTo(-s * 0.2, -s * 0.6);
                    ctx.moveTo(0, -s * 0.4);
                    ctx.lineTo(s * 0.2, -s * 0.6);
                    ctx.stroke();
                }
                break;

            case 'multiBall': // Tactical group
                const os = s * 0.45;
                const r = s * 0.35;
                [[0, -os], [-os, os], [os, os]].forEach(([x, y]) => {
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    // Detail line on each ball
                    ctx.beginPath();
                    ctx.arc(x, y, r * 0.7, 0, Math.PI, false);
                    ctx.stroke();
                });
                break;

            case 'invincible': // Cross shield
            case 'shield':
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.lineTo(s, -s * 0.6);
                ctx.lineTo(s, s * 0.3);
                ctx.quadraticCurveTo(s, s, 0, s);
                ctx.quadraticCurveTo(-s, s, -s, s * 0.3);
                ctx.lineTo(-s, -s * 0.6);
                ctx.closePath();
                ctx.stroke();
                // Core cross
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.5);
                ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 0.5, 0);
                ctx.stroke();
                break;

            case 'powerShot': // Impact burst
                ctx.lineWidth = 2;
                for (let i = 0; i < 12; i++) {
                    ctx.rotate(Math.PI / 6);
                    const len = i % 2 === 0 ? s : s * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(s * 0.2, 0);
                    ctx.lineTo(len, 0);
                    ctx.stroke();
                }
                ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2); ctx.fill();
                break;

            case 'timeWarp': // Chrono gear
                ctx.beginPath();
                ctx.arc(0, 0, s, 0, Math.PI * 2);
                ctx.stroke();
                // Clock hands
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.7);
                ctx.moveTo(0, 0); ctx.lineTo(s * 0.4, s * 0.2);
                ctx.stroke();
                // Gear teeth
                ctx.lineWidth = 1;
                for (let i = 0; i < 8; i++) {
                    ctx.rotate(Math.PI / 4);
                    ctx.strokeRect(-s * 0.1, -s * 1.1, s * 0.2, s * 0.2);
                }
                break;

            case 'magnetPaddle': // High-power Magnet
                ctx.lineWidth = s * 0.5;
                ctx.beginPath();
                ctx.moveTo(-s * 0.6, -s);
                ctx.lineTo(-s * 0.6, s * 0.2);
                ctx.arc(0, s * 0.2, s * 0.6, Math.PI, 0, true);
                ctx.lineTo(s * 0.6, -s);
                ctx.stroke();
                // Polarity tips
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-s * 0.85, -s, s * 0.5, s * 0.3);
                ctx.fillRect(s * 0.35, -s, s * 0.5, s * 0.3);
                ctx.strokeRect(-s * 0.85, -s, s * 0.5, s * 0.3);
                ctx.strokeRect(s * 0.35, -s, s * 0.5, s * 0.3);
                break;

            case 'ghostBall': // Detailed Specter
                ctx.beginPath();
                ctx.moveTo(-s, s * 0.8);
                ctx.lineTo(-s, -s * 0.2);
                ctx.quadraticCurveTo(-s, -s, 0, -s);
                ctx.quadraticCurveTo(s, -s, s, -s * 0.2);
                ctx.lineTo(s, s * 0.8);
                // Ghostly bottom
                for (let i = 0; i < 3; i++) {
                    ctx.quadraticCurveTo(s * (0.6 - i * 0.6), s * 0.5, s * (0.3 - i * 0.6), s * 0.8);
                }
                ctx.stroke();
                // Eyes
                ctx.beginPath();
                ctx.arc(-s * 0.3, -s * 0.2, s * 0.15, 0, Math.PI * 2);
                ctx.arc(s * 0.3, -s * 0.2, s * 0.15, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'laserPaddle': // Tech blaster
                ctx.beginPath();
                ctx.moveTo(-s, -s * 0.2);
                ctx.lineTo(s * 0.4, -s * 0.2);
                ctx.lineTo(s * 0.4, -s * 0.5);
                ctx.lineTo(s, 0);
                ctx.lineTo(s * 0.4, s * 0.5);
                ctx.lineTo(s * 0.4, s * 0.2);
                ctx.lineTo(-s, s * 0.2);
                ctx.closePath();
                ctx.stroke();
                // Grip
                ctx.strokeRect(-s * 0.8, s * 0.2, s * 0.4, s * 0.5);
                break;

            case 'shrinkOpponent': // Market Crash
                ctx.beginPath();
                ctx.moveTo(-s, -s);
                ctx.lineTo(-s * 0.4, s * 0.2);
                ctx.lineTo(0, -s * 0.3);
                ctx.lineTo(s, s);
                ctx.stroke();
                // Arrow head
                ctx.beginPath();
                ctx.moveTo(s, s); ctx.lineTo(s * 0.4, s * 0.8);
                ctx.moveTo(s, s); ctx.lineTo(s * 0.8, s * 0.4);
                ctx.stroke();
                break;

            case 'chaosMode': // Warp Spiral
                ctx.beginPath();
                for (let i = 0; i < 60; i++) {
                    const angle = i * 0.3;
                    const r = (i / 60) * s * 1.2;
                    const px = Math.cos(angle) * r;
                    const py = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
                break;

            default: // Geometric fallback
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    const px = Math.cos(angle) * s;
                    const py = Math.sin(angle) * s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
        }
        ctx.restore();
    }

    renderTooltip(ctx, mouseX, mouseY) {
        const dist = Math.hypot(this.pos.x - mouseX, this.pos.y - mouseY);
        if (dist >= this.size + 20) return;

        ctx.save();

        const lines = this.tooltip.split(': ');
        const rarityText = lines[0];
        const effectText = lines.slice(1).join(': ');

        ctx.font = 'bold 10px Arial';
        const rarityWidth = ctx.measureText(rarityText).width;
        const effectWidth = ctx.measureText(effectText).width;
        const width = Math.max(rarityWidth, effectWidth) + 16;
        const height = 38;

        const x = this.pos.x - width / 2;
        const y = this.pos.y - this.size - height - 10;

        // Tooltip background with neon gradient
        const gradient = ctx.createLinearGradient(x, y, x, y + height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        gradient.addColorStop(1, 'rgba(20, 20, 20, 0.95)');

        ctx.fillStyle = gradient;
        ctx.strokeStyle = this.rarity >= 4 ? '#ffff00' : this.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;

        // Rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 6);
        ctx.fill();
        ctx.stroke();

        // Rarity text with neon effect
        ctx.fillStyle = this.getRarityColorScheme().glow;
        ctx.shadowColor = this.getRarityColorScheme().glow;
        ctx.shadowBlur = 5;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rarityText, this.pos.x, y + 14);

        // Effect text
        ctx.font = '9px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 3;
        ctx.fillText(effectText, this.pos.x, y + 28);

        // Time remaining indicator with neon effect
        const timeLeft = this.lifetime - (Date.now() - this.spawnTime);
        if (timeLeft < this.warningTime) {
            const progress = timeLeft / this.warningTime;
            ctx.fillStyle = `rgba(255, ${Math.floor(255 * progress)}, 0, 0.8)`;
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 5;
            ctx.fillRect(x + 4, y + height - 6, (width - 8) * progress, 3);
        }

        ctx.restore();
    }

    checkCollision(ball) {
        if (!this.active || this.collected) return false;

        const dist = this.pos.distance(ball.pos);
        if (dist < this.size + ball.r) {
            this.collected = true;
            this.createCollectionEffect();
            return true;
        }
        return false;
    }

    createCollectionEffect() {
        // OPTIMIZED: Reduced particle count
        const particleCount = Math.min(20 + this.rarity * 5, 50); // Limited maximum

        if (typeof playSound === 'function') {
            playSound(this.soundId, { volume: 0.3 + this.rarity * 0.1 });
        }

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3; // Reduced randomness
            const speed = 30 + Math.random() * 60 + (this.rarity * 15); // Reduced speed
            const size = 1.6 + Math.random() * 3.2 + (this.rarity * 0.4); // Reduced size

            let color = this.color;
            if (this.rarity === 5) {
                const hue = (Date.now() * 0.01 + i * 360 / particleCount) % 360;
                color = `hsl(${hue}, 100%, 60%)`;
            }

            this.particles.push(this.getParticleFromPool(
                this.pos.x,
                this.pos.y,
                color,
                size,
                0.8, // Reduced life
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            ));
        }

        if (this.rarity >= 4) {
            // Reduced shockwave particles
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 20 + Math.random() * 20;

                this.particles.push(this.getParticleFromPool(
                    this.pos.x,
                    this.pos.y,
                    '#ffffff',
                    3.2 + Math.random() * 2.4, // Reduced size
                    1.2, // Reduced life
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed
                ));
            }
        }
    }
}

// Enhanced NeonTrailParticle with better performance
