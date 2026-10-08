class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    add(other) {
        return new Vector2(this.x + other.x, this.y + other.y);
    }
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

// ===================================================================
// ZombieBoss - Simplified with Leftward Burst Fire & Magma Paddle
// ===================================================================
class ZombieBoss {
    // Bake one crack's blurred glow stroke into a sprite. Rage shifts the glow's
    // hue, so bucket it instead of rebaking every frame; the caller applies the
    // per-frame brightness pulse via globalAlpha.
    _getCrackGlowSprite(index, crack) {
        const bucket = Math.round(Math.max(0, Math.min(1, this.rageLevel)) * 5); // 6 steps
        const key = `${index}|${bucket}`;
        this._crackGlowCache = this._crackGlowCache || new Map();
        let sprite = this._crackGlowCache.get(key);
        if (sprite) return sprite;

        const pts = crack.pts;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
        if (!isFinite(minX)) return null;

        const blur = crack.main ? 8 : 4;
        const lineWidth = crack.main ? 1.8 : 0.9;
        const pad = Math.ceil(blur * 2 + lineWidth + 2);
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const w = Math.max(1, Math.ceil(maxX - minX));
        const h = Math.max(1, Math.ceil(maxY - minY));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d');
        c.translate(-minX, -minY);

        const rageBoost = (bucket / 5) * 80;
        // Bake at full brightness; the pulse is reapplied per frame as alpha.
        c.strokeStyle = crack.main
            ? `rgba(255, ${Math.floor(140 + rageBoost)}, 20, 0.9)`
            : `rgba(255, ${Math.floor(80 + rageBoost)}, 0, 0.55)`;
        c.lineWidth = lineWidth;
        c.shadowBlur = blur;
        c.shadowColor = crack.main ? 'rgba(255,120,0,0.9)' : 'rgba(255,60,0,0.6)';
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.stroke();

        sprite = { canvas, minX, minY, w, h };
        this._crackGlowCache.set(key, sprite);
        return sprite;
    }

    constructor(paddle, ball, game) {
        this.paddle = paddle;
        this.ball = ball;
        this.game = game;
        this.isPvP = !!(game && game.isMultiplayer);

        if (this.isPvP) return;

        // Mark paddle as magma boss and disable standard rendering
        if (this.paddle) {
            this.paddle.isZombieBoss = true;
            this.paddle.isCustomRendered = true; // This prevents normal paddle drawing
        }

        this.originalPaddleWidth = paddle.w;
        this.originalPaddleHeight = paddle.h;
        this.targetPaddleWidth = this.originalPaddleWidth;
        this.paddleRecoverySpeed = 80;
        this.paddleRecoveryDelay = 1.2;
        this.recoveryTimer = 0;

        this.aiController = new AIController(paddle, ball, game.width, game.height, 3);
        this.aiController.voice = null;

        // Burst fire particles - LEFT direction only
        this.burstParticles = [];
        this.maxBurstParticles = 120;
        this.particlePool = [];

        // Boss state
        this.maxHealth = 110;
        this.health = this.maxHealth;
        this.lastPlayerScore = 0;
        this.rageLevel = 0;
        this.phase = 1;
        this.wave = 1;
        this.maxWave = 10;
        this.staggerTimer = 0;
        this.bossDisabled = false;

        // Screen effects
        this.screenShake = 0;
        this.screenShakeIntensity = 0;
        this.time = 0;

        // Magma paddle animation
        this.magmaPulse = 0;
        this.glowIntensity = 0;

        // Fire breathing state
        this.fireBreathingCooldown = 0;
        this.fireBreathingTimer = 3.0; // Overall timing
        this.fireBreathingState = 'normal'; // 'warning' → 'breathing' → 'normal'
        this.fireBreathingIntensity = 0; // Will scale with rage
        this.fireWarningIntensity = 0; // Magma blink warning intensity
        this.isBreathingFire = false; // Currently breathing fire
        this.fireBreathingUnlocked = false;

        // Phase-based fire intervals
        this.phaseFireIntervals = {
            1: 10.0, // Phase 1 (Molten): Fire every 10 seconds
            2: 7.0,  // Phase 2 (Erupting): Fire every 7 seconds
            3: 5.0   // Phase 3 (Cataclysm): Fire every 5 seconds
        };
        this.fireWarningDuration = 3.0; // 3 second warning
        this.fireBreathDuration = 0.67;  // 1 second fire breath (shortened for better zombie pacing)

        // ===== TYPED ARRAY PARTICLE POOL FOR PHOTOREAL FIRE =====
        this.particlePoolSize = 2000;
        this.pX = new Float32Array(this.particlePoolSize);
        this.pY = new Float32Array(this.particlePoolSize);
        this.pVX = new Float32Array(this.particlePoolSize);
        this.pVY = new Float32Array(this.particlePoolSize);
        this.pLife = new Float32Array(this.particlePoolSize);
        this.pMax = new Float32Array(this.particlePoolSize);
        this.pSz = new Float32Array(this.particlePoolSize);
        this.pTemp = new Float32Array(this.particlePoolSize);
        this.pType = new Uint8Array(this.particlePoolSize); // 0-2=fire, 3=ember, 4=smoke, 5=soot, 6=pre-ignition
        this.pWob = new Float32Array(this.particlePoolSize); // wobble for animation
        this.pWS = new Float32Array(this.particlePoolSize);  // wobble speed
        this.pRot = new Float32Array(this.particlePoolSize); // rotation
        this.pAng = new Float32Array(this.particlePoolSize); // velocity angle cache

        // Free list for O(1) allocation
        this.freeList = new Int32Array(this.particlePoolSize);
        this.freeCount = this.particlePoolSize;
        for (let i = 0; i < this.particlePoolSize; i++) {
            this.freeList[i] = i;
        }
        this.activeIndices = new Int32Array(this.particlePoolSize);
        this.activeCount = 0;

        // Frame time tracking for noise
        this.fireFrameTime = 0;
    }

    // ===== PARTICLE POOL MANAGEMENT =====
    allocParticle() {
        return this.freeCount > 0 ? this.freeList[--this.freeCount] : -1;
    }

    freeParticle(i) {
        this.freeList[this.freeCount++] = i;
    }

    spawnFireParticle(x, y, vx, vy, life, sz, type, temp) {
        const i = this.allocParticle();
        if (i < 0) return;
        this.pX[i] = x;
        this.pY[i] = y;
        this.pVX[i] = vx;
        this.pVY[i] = vy;
        this.pAng[i] = Math.atan2(vy, vx);
        this.pLife[i] = life;
        this.pMax[i] = life;
        this.pSz[i] = sz;
        this.pType[i] = type;
        this.pTemp[i] = temp;
        this.pWob[i] = Math.random() * 6.283;
        this.pWS[i] = 0.055 + Math.random() * 0.095;
        this.pRot[i] = Math.random() * 6.283;
        this.activeIndices[this.activeCount++] = i;
    }

    // Trigger burst fire on ball collision (called from game logic)
    onBallHit(ballSpeed = 10) {
        if (this.isPvP) return;
        if (!areParticleEffectsEnabled()) return;

        const centerX = this.paddle.pos.x + this.paddle.w / 2;
        const centerY = this.paddle.pos.y + this.paddle.h / 2;
        const burstCount = 2 + Math.floor(this.rageLevel * 6); // More particles at higher rage

        // Spread angle for burst pattern ±45° from base LEFT direction
        const baseAngle = Math.PI; // LEFT = 180°
        const spreadRange = Math.PI / 4; // ±45°

        for (let i = 0; i < burstCount; i++) {
            let particle;
            if (this.particlePool.length > 0) {
                particle = this.particlePool.pop();
            } else {
                particle = {};
            }

            const spreadAngle = baseAngle + (Math.random() - 0.5) * spreadRange;
            const speed = 3 + Math.random() * 8 + this.rageLevel * 5;

            particle.x = centerX;
            particle.y = centerY;
            particle.vx = Math.cos(spreadAngle) * speed;
            particle.vy = Math.sin(spreadAngle) * speed;
            particle.life = 0.8 + Math.random() * 0.4;
            particle.maxLife = particle.life;
            particle.size = 6 + Math.random() * 12;
            particle.temperature = 0.8 + Math.random() * 0.2;

            this.burstParticles.push(particle);
        }

        // Screen shake on hit
        this.screenShake = 0.15;
        this.screenShakeIntensity = 4 + this.rageLevel * 3;
    }

    shrinkPaddle(newWidth) {
        newWidth = Math.max(20, Math.min(this.originalPaddleWidth * 0.35, newWidth));
        this.paddle.w = newWidth;
        this.targetPaddleWidth = newWidth;
        this.recoveryTimer = this.paddleRecoveryDelay;
    }

    updateFireBreathing(dt) {
        if (this.isPvP || !areParticleEffectsEnabled()) return;

        if (!this.fireBreathingUnlocked) {
            this.fireBreathingState = 'normal';
            this.fireWarningIntensity = 0;
            this.isBreathingFire = false;
            return;
        }

        this.fireBreathingTimer -= dt;

        // Get current phase fire interval
        const phaseInterval = this.phaseFireIntervals[this.phase] || 10.0;

        // State machine for fire breathing
        if (this.fireBreathingState === 'normal') {
            // Check if it's time to start warning
            if (this.fireBreathingTimer <= 0) {
                this.fireBreathingState = 'warning';
                this.fireBreathingTimer = this.fireWarningDuration;
                // Play warning sound: Death Star charging up
                if (window.game && window.game.audio && window.game.audio.fireBreathWarning) {
                    window.game.audio.fireBreathWarning();
                }
            }
        }
        else if (this.fireBreathingState === 'warning') {
            // Flicker effect: oscillate between 0 and 1
            const warningPhase = (this.fireWarningDuration - this.fireBreathingTimer) / 0.2; // Flicker every 0.2 seconds
            this.fireWarningIntensity = Math.sin(warningPhase * Math.PI) ** 2; // Smooth pulsing

            // Check if warning duration is over
            if (this.fireBreathingTimer <= 0) {
                this.fireBreathingState = 'breathing';
                this.fireBreathingTimer = this.fireBreathDuration;
                this.isBreathingFire = true;
                // Play release sound: Nuclear blast impact
                if (window.game && window.game.audio && window.game.audio.fireBreathRelease) {
                    window.game.audio.fireBreathRelease();
                }
                // Play ambient rumble during breathing
                if (window.game && window.game.audio && window.game.audio.fireBreathAmbient) {
                    window.game.audio.fireBreathAmbient();
                }
            }
        }
        else if (this.fireBreathingState === 'breathing') {
            // Spawn fire particles continuously
            this.fireBreathingEmission();
            this.fireWarningIntensity = 0; // No warning glow during breathing

            // Check if breathing duration is over
            if (this.fireBreathingTimer <= 0) {
                this.fireBreathingState = 'normal';
                this.fireBreathingTimer = phaseInterval; // Reset to phase interval
                this.isBreathingFire = false;
                this.fireWarningIntensity = 0;
            }
        }

        // Update fire particles
        this.updateFireBreathingParticles(dt);

        // Check collision with player paddle
        this.checkFirePaddleCollision();
    }

    fireBreathingEmission() {
        if (!this.paddle) return;

        // Fire spawns from LEFT SIDE (boss on right), travels LEFT across screen
        const ox = this.paddle.pos.x; // Origin X (flush with paddle edge)
        const oy = this.paddle.pos.y + this.paddle.h / 2; // Origin Y (paddle center)

        const baseAngle = Math.PI; // LEFT = 180°
        const dx = -1, dy = 0; // Direction unit vector
        const reach = this.game?.width * 1.0 || 800; // Full canvas width reach
        const fuelFraction = this.rageLevel; // 0-1 rage level controls intensity
        const pressure = 0.48 + fuelFraction * 0.52;
        const spoolUp = Math.min(1, this.fireBreathingIntensity || 0.8);
        const jet = (13 + Math.random() * 4.5) * Math.sqrt(pressure) * (0.50 + spoolUp * 0.50);
        const heat = 0.50 + spoolUp * 0.50;
        const ignD = (22 + (1 - spoolUp) * 52) * (reach / 100); // Much more aggressive scaling

        // Helper to emit a single particle
        const at = (d, spr, vspd, life, sz, type, temp) => {
            const angle = baseAngle + (Math.random() - 0.5) * spr;
            const ox2 = ox + dx * d + (Math.random() - 0.5) * d * 0.035;
            const oy2 = oy + dy * d + (Math.random() - 0.5) * d * 0.035;
            const vx = Math.cos(angle) * vspd;
            const vy = Math.sin(angle) * vspd;
            this.spawnFireParticle(ox2, oy2, vx, vy, life, sz, type, temp);
        };

        // Pre-ignition dark fuel streaks (type 6) — REDUCED: 2 -> 1
        for (let i = 0; i < 1; i++) {
            at(3 + Math.random() * ignD * 0.42, 0.020, jet * (1.08 + Math.random() * 0.07),
                3 + Math.random() * 3.5, 3.5 + Math.random() * 2.5, 6, 0);
        }

        // CORE FIRE (type 0) — tight, white-hot — REDUCED: 6 -> 4
        for (let i = 0; i < 4; i++) {
            const d = ignD * (0.72 + Math.random() * 0.48);
            at(d, 0.028 + (1 - spoolUp) * 0.038, jet * (1.02 + Math.random() * 0.08),
                8 + Math.random() * 6.5, (8.5 + Math.random() * 4.8) * (0.48 + heat * 0.52), 0, 0.85 + Math.random() * 0.15);
        }

        // MID FIRE (type 1) — turbulent, orange-yellow — REDUCED: 9 -> 6
        for (let i = 0; i < 6; i++) {
            const d = ignD * (1.12 + Math.random() * 0.88);
            const spr = 0.088 + (d / reach) * 0.22;
            at(d, spr, jet * (0.74 + Math.random() * 0.24),
                12 + Math.random() * 21, (11.5 + Math.random() * 13) * (0.48 + heat * 0.52), 1, 0.54 + Math.random() * 0.34);
        }

        // OUTER LOBES (type 2) — deep orange-red — REDUCED: 7 -> 4
        for (let i = 0; i < 4; i++) {
            const d = ignD * (1.72 + Math.random() * 1.28);
            const spr = 0.19 + (d / reach) * 0.32;
            at(d, spr, jet * (0.44 + Math.random() * 0.32),
                16 + Math.random() * 36, (15.5 + Math.random() * 22) * (0.48 + heat * 0.52), 2, 0.16 + Math.random() * 0.28);
        }

        // Embers (type 3) — hot radiant — REDUCED: 0.62 -> 0.35
        if (Math.random() < 0.35) {
            const d = ignD * (0.52 + Math.random() * 0.58);
            at(d, 0.28 + Math.random() * 0.13, jet * (1.04 + Math.random() * 0.24) + 2.2,
                24 + Math.random() * 30, 1.1 + Math.random() * 1.5, 3, 0.74 + Math.random() * 0.26);
        }

        // Smoke (type 4) — volumetric effect (further reduced for FPS) — REDUCED: 0.38 -> 0.25
        if (Math.random() < 0.25) {
            const t = 0.24 + Math.random() * 0.56;
            const d = reach * t;
            const sT = Math.max(0, 0.52 - t * 0.64);
            const sa = baseAngle + (Math.random() - 0.5) * 0.32;
            this.spawnFireParticle(
                ox + Math.cos(sa) * d + (Math.random() - 0.5) * 24,
                oy + Math.sin(sa) * d + (Math.random() - 0.5) * 24,
                dx * (0.10 + Math.random() * 0.22) + (Math.random() - 0.5) * 0.40,
                dy * (0.04 + Math.random() * 0.16) - (0.28 + sT * 1.48),
                90 + Math.random() * 90,
                19 + Math.random() * 24, 4, sT
            );
        }

        // Soot (type 5) — DISABLED for FPS improvement (minimal visual impact)
    }

    updateFireBreathingParticles(dt) {
        this.fireFrameTime += dt;

        // Direction toward player paddle (LEFT = 180°)
        const dx = -1, dy = 0;
        const ft = this.fireFrameTime * 0.0008;

        let nc = 0;
        for (let ai = 0; ai < this.activeCount; ai++) {
            const i = this.activeIndices[ai];
            this.pLife[i]--;

            if (this.pLife[i] <= 0) {
                this.freeParticle(i);
                continue;
            }

            this.activeIndices[nc++] = i;
            const type = this.pType[i];
            const t = 1 - this.pLife[i] / this.pMax[i]; // Lifetime progress 0-1
            const tx = this.pX[i] * ZombieBoss.TURB_SC + ft;
            const ty = this.pY[i] * ZombieBoss.TURB_SC + ft * 0.8;
            const tX = ZombieBoss.fbmCoarse(tx, ty) * ZombieBoss.TURB_G;
            const tY = ZombieBoss.fbmCoarse(tx + 3.7, ty + 2.9) * ZombieBoss.TURB_G;

            if (type === 4) { // SMOKE
                this.pTemp[i] = Math.max(0, this.pTemp[i] - 0.0035);
                this.pVY[i] -= this.pTemp[i] * 0.80 + 0.010;
                this.pVX[i] += tX * 0.082;
                this.pVY[i] += tY * 0.062;
                this.pVX[i] *= 0.982;
                this.pVY[i] *= 0.984;
                this.pX[i] += this.pVX[i];
                this.pY[i] += this.pVY[i];
                this.pWob[i] += this.pWS[i];
                this.pRot[i] += 0.0025 + tX * 0.0018;
                continue;
            }

            if (type === 5) { // SOOT
                this.pVY[i] += ZombieBoss.GRAV * 0.50;
                this.pVX[i] += tX * 0.035;
                this.pVX[i] *= 0.972;
                this.pVY[i] *= 0.974;
                this.pX[i] += this.pVX[i];
                this.pY[i] += this.pVY[i];
                continue;
            }

            if (type === 3) { // EMBER
                this.pVY[i] += ZombieBoss.GRAV * 0.78;
                this.pVX[i] += tX * 0.046;
                this.pVY[i] += tY * 0.026;
                this.pVX[i] *= 0.975;
                this.pVY[i] *= 0.976;
                this.pX[i] += this.pVX[i];
                this.pY[i] += this.pVY[i];
                this.pTemp[i] = Math.max(0, this.pTemp[i] - this.pTemp[i] * this.pTemp[i] * 0.0052 - 0.0020);
                continue;
            }

            if (type === 6) { // PRE-IGNITION
                this.pVX[i] *= 0.978;
                this.pVY[i] *= 0.978;
                this.pX[i] += this.pVX[i];
                this.pY[i] += this.pVY[i];
                continue;
            }

            // FIRE CORE/MID/OUTER (0, 1, 2)
            this.pWob[i] += this.pWS[i];
            this.pVY[i] += ZombieBoss.GRAV - this.pTemp[i] * (0.050 + t * 0.038) * 2.4;

            const tm = type === 2 ? 1.85 : (type === 1 ? 1.08 : 0.50);
            this.pVX[i] += tX * 0.028 * tm;
            this.pVY[i] += tY * 0.019 * tm;

            if (type === 2) {
                const ph = this.pWob[i] * 1.32 + t * 8.6;
                const vs = (0.088 + t * 0.22) * (0.80 + 0.20 * Math.sin(this.pWob[i] * 2.95));
                this.pVX[i] += -dy * Math.sin(ph) * vs;
                this.pVY[i] += dx * Math.sin(ph) * vs;
            }

            const spd = Math.hypot(this.pVX[i], this.pVY[i]);
            this.pVX[i] += dx * ZombieBoss.ENTR * spd * (1 + t) * 0.48 + (Math.random() - 0.5) * 0.014;
            this.pVY[i] += dy * ZombieBoss.ENTR * spd * (1 + t) * 0.48;

            const re = Math.max(0.12, spd * this.pSz[i]);
            const dr = 1 - (0.34 + 0.40 / re) * 0.030;
            this.pVX[i] *= dr;
            this.pVY[i] *= dr;

            this.pX[i] += this.pVX[i];
            this.pY[i] += this.pVY[i];

            const T4 = this.pTemp[i] * this.pTemp[i] * this.pTemp[i] * this.pTemp[i];
            this.pTemp[i] = Math.max(0, this.pTemp[i] - T4 * 0.0080 - 0.0030);
        }

        this.activeCount = nc;
    }

    checkFirePaddleCollision() {
        if (!this.game || !this.game.player) return;
        const playerPaddle = this.game.player;

        // Already shrunken, don't shrink again
        if (playerPaddle.fireShrinked) return;

        // Reasonable collision buffer - fire must be close to the paddle
        const collisionBuffer = 25; // 25px buffer around paddle (tight near-miss edge)
        const paddleLeft = playerPaddle.pos.x - collisionBuffer;
        const paddleRight = playerPaddle.pos.x + playerPaddle.w + collisionBuffer;
        const paddleTop = playerPaddle.pos.y - collisionBuffer;
        const paddleBottom = playerPaddle.pos.y + playerPaddle.h + collisionBuffer;

        let hitDetected = false;
        const usesWaveMode = !!(this.game && typeof this.game.isZombieWaveMode === 'function' && this.game.isZombieWaveMode());

        for (let ai = 0; ai < this.activeCount; ai++) {
            const i = this.activeIndices[ai];

            // Only count FIRE particles (types 0, 1, 2) — NOT smoke (type 4) or soot (type 5)
            const particleType = this.pType[i];
            if (particleType === 4 || particleType === 5 || particleType === 6) continue;

            // Check if particle is in the collision box
            if (this.pX[i] > paddleLeft &&
                this.pX[i] < paddleRight &&
                this.pY[i] > paddleTop &&
                this.pY[i] < paddleBottom) {
                hitDetected = true;
                break;
            }
        }

        // On fire contact: shrink paddle based on phase damage
        // Phase 1: 1/3 shrink | Phase 2: 1/2 shrink | Phase 3+: 4/5 shrink
        if (hitDetected && !playerPaddle.fireShrinked) {
            if (usesWaveMode && typeof this.game.tryConsumeZombieShield === 'function' &&
                this.game.tryConsumeZombieShield('Shield burned out blocking the fire breath')) {
                for (let ai = 0; ai < this.activeCount; ai++) {
                    const i = this.activeIndices[ai];
                    if (this.pX[i] > paddleLeft && this.pX[i] < paddleRight &&
                        this.pY[i] > paddleTop && this.pY[i] < paddleBottom) {
                        this.pLife[i] = 0;
                    }
                }
                this.screenShake = 0.12;
                this.screenShakeIntensity = 6;
                return;
            }
            this.shrinkPlayerPaddleByPhase(this.phase);
        }
    }

    shrinkPlayerPaddleByPhase(phase) {
        if (!this.game || !this.game.player) return;
        const playerPaddle = this.game.player;

        // Store original unshrunken HEIGHT ONLY on first fire hit
        if (!playerPaddle.originalUnshrunkenHeight) {
            playerPaddle.originalUnshrunkenHeight = playerPaddle.h;
        }

        // Calculate shrink multiplier based on phase
        let shrinkMultiplier;
        if (phase === 1) {
            shrinkMultiplier = 2 / 3; // Phase 1: shrink 1/3, keep 2/3
        } else if (phase === 2) {
            shrinkMultiplier = 1 / 2; // Phase 2: shrink 1/2, keep 1/2
        } else {
            shrinkMultiplier = 1 / 5; // Phase 3+: shrink 4/5, keep 1/5
        }

        const shrunkenHeight = playerPaddle.originalUnshrunkenHeight * shrinkMultiplier;

        // Mark as shrunken and start recovery timer
        if (!playerPaddle.fireShrinked) {
            playerPaddle.fireShrinked = true;
            playerPaddle.fireRecoveryTimer = 7.0; // 7 second recovery timer
            playerPaddle.fireHitFlashTimer = 0.5; // 0.5 second yellow flash
            playerPaddle.fireHitFlashing = true; // Currently flashing
            const shrinkPercent = Math.round((1 - shrinkMultiplier) * 100);
            console.log(`🔥 PHASE ${phase} Paddle hit! Shrinking HEIGHT by ${shrinkPercent}% (from ${playerPaddle.originalUnshrunkenHeight} to ${Math.round(shrunkenHeight)}px)`);
        }

        // Apply shrink with minimum scaling by phase
        const minHeight = phase === 3 ? 15 : 25; // More dangerous at phase 3
        playerPaddle.h = Math.max(minHeight, Math.round(shrunkenHeight));

        // Clamp paddle vertically so it doesn't go off screen
        if (playerPaddle.pos.y + playerPaddle.h > this.game.height) {
            playerPaddle.pos.y = this.game.height - playerPaddle.h;
        }
    }

    resetPaddleSize() {
        this.paddle.w = this.originalPaddleWidth;
        this.targetPaddleWidth = this.originalPaddleWidth;
        this.recoveryTimer = 0;
    }

    configureForWave(wave = 1, maxWave = 10) {
        this.wave = wave;
        this.maxWave = maxWave;
        this.maxHealth = 92 + wave * 12;
        this.health = this.maxHealth;
        this.rageLevel = Math.min(0.92, 0.16 + (wave / Math.max(1, maxWave)) * 0.46);
        this.staggerTimer = 0;
        this.bossDisabled = false;
        this.fireBreathingUnlocked = wave >= 5;
        this.phase = wave >= 9 ? 3 : (wave >= 7 ? 2 : 1);
        this.fireBreathingState = 'normal';
        this.fireWarningIntensity = 0;
        this.fireBreathingTimer = this.fireBreathingUnlocked
            ? Math.max(2.4, 6.2 - wave * 0.22)
            : 9999;
        this.isBreathingFire = false;
        this.resetPaddleSize();
        if (this.aiController && typeof this.aiController.setDifficulty === 'function') {
            this.aiController.setDifficulty(Math.min(4, 1 + Math.floor(wave / 3)));
        }
    }

    registerGoalHit(damage = null) {
        if (this.isPvP) return;

        const hitDamage = Number.isFinite(damage) ? damage : (14 + this.wave * 2);
        this.health = Math.max(0, this.health - hitDamage);
        this.rageLevel = Math.min(1, 1 - (this.health / Math.max(1, this.maxHealth)));
        this.screenShake = 0.28;
        this.screenShakeIntensity = 12;

        if (this.health <= 0) {
            this.bossDisabled = true;
            this.health = 0;
            this.rageLevel = 1;
            this.fireBreathingState = 'normal';
            this.fireWarningIntensity = 0;
            this.fireBreathingTimer = Math.max(1.1, 4 - this.wave * 0.1);
            this.resetPaddleSize();
            this.paddle.w = Math.max(this.originalPaddleWidth * 0.56, this.originalPaddleWidth - this.wave * 4);

            if (this.game && typeof this.game.queueZombieNextWave === 'function' && this.game.isZombieWaveMode()) {
                this.game.queueZombieNextWave();
            }
        }
    }

    onPlayerScore() {
        if (this.game && typeof this.game.isZombieWaveMode === 'function' && this.game.isZombieWaveMode()) {
            this.registerGoalHit(14 + this.wave * 2.5);
        }
    }

    onAIScore() {
        if (this.game && typeof this.game.isZombieWaveMode === 'function' && this.game.isZombieWaveMode()) {
            this.health = Math.min(this.maxHealth, this.health + 8 + this.wave * 1.5);
            this.rageLevel = Math.min(1, Math.max(this.rageLevel, 0.22 + this.wave * 0.04));
            this.fireBreathingTimer = Math.max(0.8, this.fireBreathingTimer - 0.45);
            this.screenShake = 0.16;
            this.screenShakeIntensity = 7;
        }
    }

    update(dt) {
        if (!dt || dt > 0.1) dt = 0.016;
        this.time += dt;
        const usesWaveMode = !!(this.game && typeof this.game.isZombieWaveMode === 'function' && this.game.isZombieWaveMode());
        const waveHolding = usesWaveMode && this.game?.zombieState?.introTimer > 0;

        if (this.isPvP) {
            // In PvP, boss is not active; no AI controller behavior
            return;
        }

        if (this.aiController) {
            if (waveHolding) {
                const targetY = this.game.height * 0.5 - this.paddle.h * 0.5;
                const diff = targetY - this.paddle.pos.y;
                this.paddle.vel.y = diff * 4.5;
            } else if (usesWaveMode && (this.staggerTimer > 0 || this.bossDisabled)) {
                this.paddle.vel.y = 0;
            } else {
                this.aiController.update(dt);
            }
        }

        // Update paddle recovery
        if (this.paddle.w < this.originalPaddleWidth) {
            if (this.recoveryTimer > 0) {
                this.recoveryTimer -= dt;
            } else {
                const growAmount = this.paddleRecoverySpeed * dt;
                this.paddle.w = Math.min(this.originalPaddleWidth, this.paddle.w + growAmount);
            }
        }

        if (usesWaveMode) {
            const healthRatio = this.health / Math.max(1, this.maxHealth);
            this.phase = this.wave >= 9 ? 3 : (this.wave >= 7 ? 2 : 1);
            if (this.staggerTimer > 0) {
                this.staggerTimer -= dt;
                this.paddle.w = Math.max(this.originalPaddleWidth * 0.55, this.paddle.w - dt * 28);
                this.fireBreathingState = 'normal';
                this.fireWarningIntensity = 0;
                this.isBreathingFire = false;
            } else if (this.bossDisabled) {
                this.paddle.vel.y = 0;
                this.fireBreathingState = 'normal';
                this.fireWarningIntensity = 0;
                this.isBreathingFire = false;
            }
        } else {
            // Update health and rage based on player score
            const playerScore = this.game.scores?.player || 0;
            if (playerScore > this.lastPlayerScore) {
                const damage = (playerScore - this.lastPlayerScore) * 10;
                this.health = Math.max(0, this.health - damage);
                this.lastPlayerScore = playerScore;
                this.rageLevel = 1 - (this.health / this.maxHealth);
                this.screenShake = 0.2;
                this.screenShakeIntensity = 10;
            }

            // Update phase based on health
            if (this.health > 66) this.phase = 1;
            else if (this.health > 33) this.phase = 2;
            else this.phase = 3;
        }

        // Update burst particles
        this.updateBurstParticles(dt);

        // Update fire breathing
        const shouldUpdateFire = !waveHolding && !this.bossDisabled && (!usesWaveMode || this.staggerTimer <= 0);
        if (shouldUpdateFire) {
            this.updateFireBreathing(dt);
        } else if (waveHolding || this.bossDisabled) {
            this.fireBreathingState = 'normal';
            this.fireWarningIntensity = 0;
            this.isBreathingFire = false;
        }

        // Handle player paddle fire damage recovery (7-second timer)
        if (this.game && this.game.player && this.game.player.fireShrinked) {
            const paddle = this.game.player;

            // Handle flash timer (color change effect)
            if (paddle.fireHitFlashing && paddle.fireHitFlashTimer > 0) {
                paddle.fireHitFlashTimer -= dt;
            } else {
                paddle.fireHitFlashing = false;
            }

            // Handle recovery timer
            if (paddle.fireRecoveryTimer > 0) {
                paddle.fireRecoveryTimer -= dt;
                if (paddle.fireRecoveryTimer <= 0) {
                    // Restore paddle to original unshrunken HEIGHT
                    paddle.h = paddle.originalUnshrunkenHeight;
                    paddle.fireShrinked = false;
                    paddle.fireRecoveryTimer = 0;
                    paddle.fireHitFlashing = false;
                    console.log(`✅ Paddle recovered to ${paddle.h}px`);
                }
            }
        }

        // Update magma animation
        this.magmaPulse += dt * 2.5;
        this.glowIntensity = 0.5 + Math.sin(this.magmaPulse) * 0.3 + this.rageLevel * 0.3;

        // Decay screen shake
        if (this.screenShake > 0) this.screenShake -= dt;
    }

    updateBurstParticles(dt) {
        let writeIndex = 0;
        for (let i = 0; i < this.burstParticles.length; i++) {
            const p = this.burstParticles[i];
            p.life -= dt;
            p.temperature = Math.max(0, p.temperature - dt * 1.5);
            p.size *= 0.94;

            // Apply gravity and drag to particles
            p.vy += 0.08; // gravity
            p.vx *= 0.985; // drag
            p.vy *= 0.985;

            p.x += p.vx;
            p.y += p.vy;

            if (p.life > 0 && p.size > 1.2) {
                this.burstParticles[writeIndex++] = p;
            } else {
                // Recycle to pool
                if (this.particlePool.length < this.maxBurstParticles) {
                    this.particlePool.push(p);
                }
            }
        }
        this.burstParticles.length = writeIndex;
    }

    renderMagmaPaddle(ctx) {
        const p = this.paddle;
        const cx = p.pos.x + p.w / 2;
        const cy = p.pos.y + p.h / 2;
        const t = this.time;

        // Generate crack network once per paddle instance (local coords)
        if (!this._cracks || this._crackPaddleW !== p.w || this._crackPaddleH !== p.h) {
            this._cracks = this._genCrackNetwork(0, 0, p.w, p.h);
            this._crackPaddleW = p.w;
            this._crackPaddleH = p.h;
        }

        ctx.save();

        // Clip all rendering to paddle bounds
        ctx.beginPath();
        ctx.rect(p.pos.x, p.pos.y, p.w, p.h);
        ctx.clip();

        // === LAYER 1: Deep volcanic rock base ===
        const base = ctx.createLinearGradient(p.pos.x, p.pos.y, p.pos.x + p.w, p.pos.y + p.h);
        base.addColorStop(0, '#1a0400');
        base.addColorStop(0.25, '#2e0a00');
        base.addColorStop(0.5, '#3d1200');
        base.addColorStop(0.75, '#2a0800');
        base.addColorStop(1, '#1a0400');
        ctx.fillStyle = base;
        ctx.fillRect(p.pos.x, p.pos.y, p.w, p.h);

        // === LAYER 2: Subsurface molten glow (pulses through cracks) ===
        const lavaFlicker = 0.55 + Math.sin(t * 4.1) * 0.15 + Math.sin(t * 7.3) * 0.08;
        ctx.globalCompositeOperation = 'screen';
        const lavaGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.h * 0.6);
        lavaGrad.addColorStop(0, `rgba(255, 200, 60, ${lavaFlicker * 0.9})`);
        lavaGrad.addColorStop(0.3, `rgba(255, 110, 10, ${lavaFlicker * 0.7})`);
        lavaGrad.addColorStop(0.7, `rgba(180, 40, 0,  ${lavaFlicker * 0.4})`);
        lavaGrad.addColorStop(1, 'rgba(80, 10, 0, 0)');
        ctx.fillStyle = lavaGrad;
        ctx.fillRect(p.pos.x, p.pos.y, p.w, p.h);
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 3: Rock surface texture (noise approximation) ===
        ctx.globalCompositeOperation = 'multiply';
        const noiseStep = 6;
        for (let ny = p.pos.y; ny < p.pos.y + p.h; ny += noiseStep) {
            for (let nx = p.pos.x; nx < p.pos.x + p.w; nx += noiseStep) {
                const n = Math.sin(nx * 0.04 + t * 0.2) * Math.cos(ny * 0.04 + t * 0.15) * 0.5
                    + Math.sin(nx * 0.11 - t * 0.1) * Math.cos(ny * 0.09) * 0.3;
                const dark = Math.max(0, -n);
                if (dark > 0.08) {
                    ctx.fillStyle = `rgba(0,0,0,${dark * 0.5})`;
                    ctx.fillRect(nx, ny, noiseStep, noiseStep);
                }
            }
        }
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 4: Crack shadows ===
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        for (const crack of this._cracks) {
            if (crack.pts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(crack.pts[0].x, crack.pts[0].y);
            for (let i = 1; i < crack.pts.length; i++) ctx.lineTo(crack.pts[i].x, crack.pts[i].y);
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = crack.main ? 2.5 : 1.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        ctx.restore();

        // (see _getCrackGlowSprite)
        // === LAYER 5: Crack molten glow ===
        // Crack geometry is fixed once generated; only brightness pulses. Baking
        // each crack's blurred stroke into a sprite turns ~16 shadowBlur strokes
        // per frame (the single most expensive thing zombie mode draws) into ~16
        // cheap blits, while the per-crack alpha pulse below keeps the shimmer.
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.globalCompositeOperation = 'screen';
        for (let ci = 0; ci < this._cracks.length; ci++) {
            const crack = this._cracks[ci];
            if (crack.pts.length < 2) continue;
            const cf = 0.55 + Math.sin(t * 3.5 + crack.pts[0].x * 0.2 + this.rageLevel) * 0.3;
            const sprite = this._getCrackGlowSprite(ci, crack);
            if (!sprite) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, cf));
            ctx.drawImage(sprite.canvas, sprite.minX, sprite.minY, sprite.w, sprite.h);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';

        ctx.restore(); // End clip

        ctx.save();

        // === LAYER 6: Lava drips (bottom edge) ===
        if (!this._drips) {
            this._drips = Array.from({ length: 4 }, (_, i) => ({
                x: p.pos.x + 4 + (i / 3) * (p.w - 8),
                phase: i * 1.3,
                speed: 0.7 + i * 0.2,
                size: 2 + (i % 2)
            }));
        }
        ctx.globalCompositeOperation = 'screen';
        for (const drip of this._drips) {
            const progress = ((t * drip.speed + drip.phase) % 2.8) / 2.8;
            if (progress > 0.65) continue;
            const dropY = p.pos.y + p.h + progress * 20;
            const alpha = Math.max(0, 0.85 - progress * 1.4);
            const r = drip.size * (1 - progress * 0.3);
            const dFlicker = 0.7 + Math.sin(t * 5 + drip.phase) * 0.2;
            ctx.beginPath();
            ctx.arc(drip.x, dropY, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, ${Math.floor(130 + dFlicker * 90)}, 20, ${alpha * dFlicker})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255,80,0,0.9)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(drip.x, p.pos.y + p.h);
            ctx.lineTo(drip.x, dropY - r);
            ctx.strokeStyle = `rgba(255,70,10,${alpha * 0.45})`;
            ctx.lineWidth = r * 0.6;
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 7: Surface heat shimmer bands ===
        ctx.globalCompositeOperation = 'screen';
        for (let si = 0; si < 3; si++) {
            const shimY = p.pos.y + (si / 2) * p.h;
            const shimW = p.w * (0.5 + Math.sin(t * 1.8 + si * 2.1) * 0.3);
            const shimX = cx - shimW / 2 + Math.sin(t * 2.3 + si) * 3;
            const shimA = 0.03 + Math.abs(Math.sin(t * 3 + si * 1.7)) * 0.07;
            ctx.fillStyle = `rgba(255, 180, 60, ${shimA})`;
            ctx.fillRect(shimX, shimY, shimW, 2);
        }
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 8: Energy core (multi-ring, flickering) ===
        ctx.globalCompositeOperation = 'screen';
        const corePulse = 0.72 + Math.sin(t * 4.8) * 0.18 + Math.sin(t * 11.3) * 0.08;
        const coreFlare = 0.5 + Math.sin(t * 2.1) * 0.3;

        // Outer bloom
        const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.w * 1.6);
        bloom.addColorStop(0, `rgba(255, 160, 40, ${0.20 * corePulse})`);
        bloom.addColorStop(0.4, `rgba(255, 80, 10, ${0.12 * corePulse})`);
        bloom.addColorStop(1, 'rgba(200, 30, 0, 0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(cx, cy, p.w * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Mid glow
        const mid = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.w * 0.85);
        mid.addColorStop(0, `rgba(255, 220, 100, ${0.60 * corePulse})`);
        mid.addColorStop(0.5, `rgba(255, 120, 20, ${0.38 * corePulse})`);
        mid.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.arc(cx, cy, p.w * 0.85, 0, Math.PI * 2);
        ctx.fill();

        // Bright inner core
        const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.w * 0.35);
        inner.addColorStop(0, `rgba(255, 255, 200, ${0.92 * corePulse})`);
        inner.addColorStop(0.5, `rgba(255, 200, 80, ${0.65 * corePulse})`);
        inner.addColorStop(1, 'rgba(255, 100, 10, 0)');
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(cx, cy, p.w * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Pinpoint white-hot center
        const pin = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.w * 0.12);
        pin.addColorStop(0, `rgba(255, 255, 240, ${corePulse})`);
        pin.addColorStop(0.6, `rgba(255, 220, 140, ${0.5 * corePulse})`);
        pin.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = pin;
        ctx.beginPath();
        ctx.arc(cx, cy, p.w * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Rotating core spike flares
        for (let fi = 0; fi < 4; fi++) {
            const fa = (fi / 4) * Math.PI * 2 + t * 0.4;
            const flen = (p.w * 0.5 + Math.sin(t * 3 + fi * 1.5) * p.w * 0.2) * coreFlare;
            const fGrad = ctx.createLinearGradient(cx, cy,
                cx + Math.cos(fa) * flen, cy + Math.sin(fa) * flen);
            fGrad.addColorStop(0, `rgba(255, 240, 160, ${0.55 * corePulse})`);
            fGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
            ctx.strokeStyle = fGrad;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(fa) * flen, cy + Math.sin(fa) * flen);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 9: Glowing ember rim ===
        ctx.globalCompositeOperation = 'screen';
        const rimPulse = 0.5 + Math.sin(t * 3.2) * 0.3;
        ctx.strokeStyle = `rgba(255, ${Math.floor(70 + rimPulse * 110)}, 10, ${0.4 + rimPulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 14;
        ctx.shadowColor = 'rgba(255, 70, 0, 0.85)';
        ctx.strokeRect(p.pos.x + 0.5, p.pos.y + 0.5, p.w - 1, p.h - 1);
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';

        // === LAYER 10: Warning pre-fire charge blink ===
        if (this.fireWarningIntensity > 0.05) {
            ctx.globalCompositeOperation = 'screen';
            const wGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(p.w, p.h) * 1.2);
            wGrad.addColorStop(0, `rgba(255, 220, 80, ${this.fireWarningIntensity * 0.55})`);
            wGrad.addColorStop(1, 'rgba(255, 100, 20, 0)');
            ctx.fillStyle = wGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(p.w, p.h) * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();
    }

    _genCrackNetwork(px, py, pw, ph) {
        const cracks = [];
        // Deterministic-ish seed from position
        let s = (px * 7919 + py * 6271 + pw * 4703 + ph * 3529) | 0;
        function rnd() {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            return (s >>> 0) / 0xffffffff;
        }

        for (let m = 0; m < 4; m++) {
            const startX = px + rnd() * pw;
            const startY = py + rnd() * ph;
            const pts = [{ x: startX, y: startY }];
            const angle = rnd() * Math.PI * 2;
            let ax = angle;
            for (let step = 0; step < 8; step++) {
                ax += (rnd() - 0.5) * 0.7;
                const len = 8 + rnd() * (Math.min(pw, ph) * 0.4);
                const last = pts[pts.length - 1];
                pts.push({
                    x: Math.max(px + 1, Math.min(px + pw - 1, last.x + Math.cos(ax) * len)),
                    y: Math.max(py + 1, Math.min(py + ph - 1, last.y + Math.sin(ax) * len))
                });
            }
            cracks.push({ pts, main: true });

            // Branch cracks
            for (let b = 0; b < 3; b++) {
                const base = pts[1 + Math.floor(rnd() * (pts.length - 2))];
                const ba = angle + (rnd() > 0.5 ? 1 : -1) * (0.5 + rnd() * 0.9);
                const bpts = [{ x: base.x, y: base.y }];
                let bax = ba;
                for (let bs = 0; bs < 4; bs++) {
                    bax += (rnd() - 0.5) * 0.55;
                    const blen = 5 + rnd() * (Math.min(pw, ph) * 0.25);
                    const blast = bpts[bpts.length - 1];
                    bpts.push({
                        x: Math.max(px + 1, Math.min(px + pw - 1, blast.x + Math.cos(bax) * blen)),
                        y: Math.max(py + 1, Math.min(py + ph - 1, blast.y + Math.sin(bax) * blen))
                    });
                }
                cracks.push({ pts: bpts, main: false });
            }
        }
        return cracks;
    }

    renderFireBreathingParticles(ctx, now) {
        if (!ctx || this.activeCount === 0) return;

        // Sort particles by type for batch rendering
        const si = [], fi = [], ei = [], oi = [], pi = [];
        for (let ai = 0; ai < this.activeCount; ai++) {
            const i = this.activeIndices[ai];
            const t = this.pType[i];
            if (t === 4) si.push(i);
            else if (t === 3) ei.push(i);
            else if (t === 5) oi.push(i);
            else if (t === 6) pi.push(i);
            else fi.push(i);
        }

        ctx.save();

        // Render energy drain lighting effect from boss paddle
        if (this.fireBreathingState === 'breathing' && this.paddle) {
            const paddleX = this.paddle.pos.x - this.paddle.w * 0.5;
            const paddleY = this.paddle.pos.y + this.paddle.h / 2;
            const spawnX = this.paddle.pos.x;
            const spawnY = this.paddle.pos.y + this.paddle.h / 2;
            const intensity = this.fireBreathingIntensity * 0.85;
            const flicker = 0.65 + Math.sin(now * 0.008) * 0.35;

            ctx.globalCompositeOperation = 'lighten';
            ctx.save();

            // ===== DRAMATIC ENERGY DRAIN LIGHTING =====
            const startX = paddleX;
            const startY = paddleY;
            const endX = spawnX;
            const endY = spawnY;
            const beamLength = Math.hypot(endX - startX, endY - startY);

            // Outermost glow halo (massive, low opacity for atmosphere)
            const haloGrad = ctx.createLinearGradient(startX, startY, endX, endY);
            haloGrad.addColorStop(0, `rgba(255, 180, 60, ${intensity * 0.25 * flicker})`);
            haloGrad.addColorStop(0.5, `rgba(255, 160, 40, ${intensity * 0.18 * flicker})`);
            haloGrad.addColorStop(1, `rgba(255, 100, 20, 0)`);
            ctx.strokeStyle = haloGrad;
            ctx.lineWidth = this.paddle.w * 0.48;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Mid-tier glow beam (brighter)
            const midGlowGrad = ctx.createLinearGradient(startX, startY, endX, endY);
            midGlowGrad.addColorStop(0, `rgba(255, 210, 100, ${intensity * 0.45 * flicker})`);
            midGlowGrad.addColorStop(1, `rgba(255, 120, 40, ${intensity * 0.25 * flicker})`);
            ctx.strokeStyle = midGlowGrad;
            ctx.lineWidth = this.paddle.w * 0.32;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Core bright beam (intense center)
            const coreGrad = ctx.createLinearGradient(startX, startY, endX, endY);
            coreGrad.addColorStop(0, `rgba(255, 225, 140, ${intensity * 0.75 * flicker})`);
            coreGrad.addColorStop(0.5, `rgba(255, 200, 100, ${intensity * 0.65 * flicker})`);
            coreGrad.addColorStop(1, `rgba(255, 150, 60, ${intensity * 0.4 * flicker})`);
            ctx.strokeStyle = coreGrad;
            ctx.lineWidth = this.paddle.w * 0.16;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Animated energy pulses traveling along beam
            for (let pulse = 0; pulse < 3; pulse++) {
                const pulsePhase = (now * 0.008 + pulse * 2.094) % (beamLength + 100);
                const pulseLoc = pulsePhase / (beamLength + 100);
                const pulseX = startX + (endX - startX) * pulseLoc;
                const pulseY = startY + (endY - startY) * pulseLoc;

                // Radiant burst at pulse position
                const pulseRad = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, this.paddle.w * 0.35);
                pulseRad.addColorStop(0, `rgba(255, 240, 180, ${(intensity * 0.8 * flicker) * (1 - Math.abs(pulseLoc - 0.5) * 2)})`);
                pulseRad.addColorStop(0.6, `rgba(255, 180, 80, ${(intensity * 0.4 * flicker) * (1 - Math.abs(pulseLoc - 0.5) * 2)})`);
                pulseRad.addColorStop(1, `rgba(255, 100, 30, 0)`);
                ctx.fillStyle = pulseRad;
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, this.paddle.w * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }

            // Energy node at paddle (bright origin)
            const startGlow = ctx.createRadialGradient(startX, startY, 0, startX, startY, this.paddle.w * 0.40);
            startGlow.addColorStop(0, `rgba(255, 255, 200, ${intensity * 0.9 * flicker})`);
            startGlow.addColorStop(0.5, `rgba(255, 220, 140, ${intensity * 0.6 * flicker})`);
            startGlow.addColorStop(1, `rgba(255, 160, 80, 0)`);
            ctx.fillStyle = startGlow;
            ctx.beginPath();
            ctx.arc(startX, startY, this.paddle.w * 0.40, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
        }

        // ===== SMOKE (TYPE 4) — OPTIMIZED RENDERING =====
        for (const i of si) {
            // Skip off-screen particles for performance
            if (this.pX[i] < -100 || this.pX[i] > ctx.canvas.width + 100 ||
                this.pY[i] < -100 || this.pY[i] > ctx.canvas.height + 100) continue;

            const t = 1 - this.pLife[i] / this.pMax[i];
            const hot = this.pTemp[i];
            const br = this.pSz[i] * (1 + t * 2.6);
            const outerRad = br * 1.55;
            const innerRad = br * 0.75;

            ctx.save();
            ctx.translate(this.pX[i], this.pY[i]);
            ctx.globalAlpha = Math.min(0.22, (1 - t) * 0.21 + 0.022) * (1 + hot * 0.28);

            // Single-pass gradient for outer shell (simplified)
            const oG = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRad);
            oG.addColorStop(0, `rgba(46,38,30,${0.6 * (1 + hot * 0.28)})`);
            oG.addColorStop(1, `rgba(16,12,10,0)`);
            ctx.fillStyle = oG;

            // Simplified ellipse (no rotation/scaling for perf)
            ctx.beginPath();
            ctx.arc(0, 0, outerRad, 0, 6.28);
            ctx.fill();

            // Inner warm shell (simplified - skip scale transform)
            ctx.globalAlpha = Math.min(0.30, (1 - t) * 0.28 + 0.045) * (0.32 + hot * 0.88);
            const iR = Math.round(48 + hot * 48);
            const iG = Math.round(36 + hot * 22);
            const iB = Math.round(28 + hot * 10);
            const iG2 = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRad);
            iG2.addColorStop(0, `rgb(${iR},${iG},${iB})`);
            iG2.addColorStop(1, `rgba(${iR - 20},${iG - 15},${iB - 11},0)`);
            ctx.fillStyle = iG2;
            ctx.beginPath();
            ctx.arc(0, 0, innerRad, 0, 6.28);
            ctx.fill();
            ctx.restore();
        }

        // ===== FIRE (TYPES 0-2) — SCREEN COMPOSITE =====
        ctx.globalCompositeOperation = 'screen';

        // Pre-ignition dark streaks (type 6)
        for (const i of pi) {
            const t = 1 - this.pLife[i] / this.pMax[i];
            const spd = Math.hypot(this.pVX[i], this.pVY[i]);
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.28;
            ctx.fillStyle = '#3e1008';
            ctx.translate(this.pX[i], this.pY[i]);
            ctx.rotate(Math.atan2(this.pVY[i], this.pVX[i]));
            ctx.scale(Math.min(2.8, 1 + spd * 0.063), 0.50);
            ctx.beginPath();
            ctx.arc(0, 0, this.pSz[i], 0, 6.28);
            ctx.fill();
            ctx.restore();
        }

        // Fire particles (types 0, 1, 2)
        const flicker = 0.7 + Math.sin(now * 0.012) * 0.3;
        for (const i of fi) {
            const t = 1 - this.pLife[i] / this.pMax[i];
            const type = this.pType[i];
            const temp = this.pTemp[i];
            const hot = 1 - t;
            const c = ZombieBoss.tRGB(temp);
            const spd = Math.hypot(this.pVX[i], this.pVY[i]);
            const ang = this.pAng[i];

            // Per-type shape parameters
            let sX, sY, bs;
            if (type === 0) { // CORE
                sX = Math.min(3.8, 1.1 + spd * 0.072 + hot * 0.15);
                sY = Math.max(0.26, 0.56 - t * 0.22);
                bs = 1.0;
            } else if (type === 1) { // MID
                sX = Math.min(2.6, 0.95 + spd * 0.060 + hot * 0.09);
                sY = Math.max(0.42, 0.72 - t * 0.16);
                bs = 1 + Math.sin(this.pWob[i]) * 0.08;
            } else { // OUTER
                sX = Math.min(1.8, 0.98 + spd * 0.035);
                sY = Math.max(0.56, 0.86 - t * 0.12);
                bs = 1 + Math.sin(this.pWob[i] * 1.2) * 0.16 * (1 - t * 0.35);
            }

            const sz = this.pSz[i] * (1 + t * 0.24) * bs;
            const ba = type === 0 ? 0.94 : (type === 1 ? 0.84 : 0.72);
            const alpha = Math.min(1, hot * hot * ba * (0.64 + 0.36 * flicker));

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(this.pX[i], this.pY[i]);
            ctx.rotate(ang);
            ctx.scale(sX, sY);

            const cr = Math.min(255, c[0] + 20);
            const cg = Math.min(255, c[1] + 16);
            const cb = Math.min(255, c[2] + 12);
            const er = Math.max(0, c[0] - 50);
            const eg = Math.max(0, c[1] - 40);
            const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
            grd.addColorStop(0, `rgb(${cr},${cg},${cb})`);
            grd.addColorStop(0.40, `rgb(${c[0]},${c[1]},${c[2]})`);
            grd.addColorStop(1, `rgba(${er},${eg},0,0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(0, 0, sz, sz * 0.86, 0, 0, 6.28);
            ctx.fill();

            if (temp > 0.58 && type < 2) {
                const cR = sz * (0.26 + temp * 0.24);
                const wb = Math.min(255, Math.round(178 + temp * 77));
                const cGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, cR);
                cGrd.addColorStop(0, `rgba(255,255,${wb},${0.94 * temp})`);
                cGrd.addColorStop(0.38, `rgba(255,${Math.round(208 * temp)},${Math.round(50 * temp)},${0.63 * temp})`);
                cGrd.addColorStop(1, `rgba(255,75,0,0)`);
                ctx.fillStyle = cGrd;
                ctx.beginPath();
                ctx.arc(0, 0, cR, 0, 6.28);
                ctx.fill();
            }
            ctx.restore();
        }

        // ===== EMBERS (TYPE 3) =====
        ctx.globalCompositeOperation = 'source-over';
        for (const i of ei) {
            const t = 1 - this.pLife[i] / this.pMax[i];
            const temp = this.pTemp[i];
            const c = ZombieBoss.tRGB(temp);
            const spd = Math.hypot(this.pVX[i], this.pVY[i]);
            const sz = this.pSz[i] * (1 - t * 0.50);
            ctx.save();
            ctx.shadowBlur = 6 + 6 * temp;
            ctx.shadowColor = `rgb(${c[0]},${Math.min(255, c[1] + 32)},0)`;
            ctx.globalAlpha = (1 - t) * 0.88;
            ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
            ctx.translate(this.pX[i], this.pY[i]);
            ctx.rotate(Math.atan2(this.pVY[i], this.pVX[i]));
            ctx.scale(Math.min(4.4, 1 + spd * 0.12), 1);
            ctx.beginPath();
            ctx.arc(0, 0, sz, 0, 6.28);
            ctx.fill();
            if (temp > 0.26) {
                ctx.fillStyle = `rgba(255,255,208,${temp * 0.84 * (1 - t)})`;
                ctx.beginPath();
                ctx.arc(0, 0, sz * 0.32, 0, 6.28);
                ctx.fill();
            }
            ctx.restore();
        }

        // ===== SOOT (TYPE 5) =====
        for (const i of oi) {
            const t = 1 - this.pLife[i] / this.pMax[i];
            ctx.save();
            ctx.globalAlpha = Math.min(0.50, (1 - t) * 0.54 + 0.042);
            ctx.fillStyle = '#09070500';
            ctx.translate(this.pX[i], this.pY[i]);
            ctx.rotate(this.pWob[i]);
            ctx.beginPath();
            ctx.ellipse(0, 0, this.pSz[i] * (1 + t * 0.78), this.pSz[i] * (0.66 + t * 0.57), 0, 0, 6.28);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    renderBurstParticles(ctx, now) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const fireNow = now * 0.012;
        const flicker = 0.7 + Math.sin(fireNow * 2.5) * 0.3;

        for (const p of this.burstParticles) {
            const alpha = (p.life / p.maxLife) * p.temperature * flicker;
            const size = p.size;

            // Color based on temperature: deep orange to yellow
            const hue = 15 + p.temperature * 35; // From deep orange to yellow
            const saturation = 100 - p.temperature * 20;
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, 55%)`;

            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();

            // Glow layer
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 1.8, 0, Math.PI * 2);
            ctx.fill();

            // White hot core
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = '#fffaf0';
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    render(ctx) {
        if (!ctx) return;

        // In PvP, nothing is rendered (paddle renders as normal)
        if (this.isPvP) return;

        const now = performance.now();
        ctx.save();

        // Screen shake
        if (this.screenShake > 0.05) {
            const mul = this.screenShakeIntensity * this.screenShake;
            ctx.translate((Math.random() - 0.5) * mul, (Math.random() - 0.5) * mul);
        }

        // Render magma paddle (replaces normal paddle rendering)
        this.renderMagmaPaddle(ctx);

        // Render fire breathing particles
        this.renderFireBreathingParticles(ctx, now);

        // Render burst particles
        this.renderBurstParticles(ctx, now);

        // Render health bar
        this.renderHealthBar(ctx, now);

        ctx.restore();
    }

    renderHealthBar(ctx, now) {
        const barWidth = 320;
        const barHeight = 28;
        const x = this.game.width / 2 - barWidth / 2;
        const y = 20;
        const healthRatio = this.health / this.maxHealth;

        ctx.fillStyle = '#220022';
        ctx.fillRect(x, y, barWidth, barHeight);

        const grad = ctx.createLinearGradient(x, y, x + barWidth, y);
        if (healthRatio > 0.5) {
            grad.addColorStop(0, '#ff9900');
            grad.addColorStop(1, '#ffdd00');
        } else if (healthRatio > 0.25) {
            grad.addColorStop(0, '#ff5500');
            grad.addColorStop(1, '#ff9900');
        } else {
            grad.addColorStop(0, '#ff1100');
            grad.addColorStop(1, '#ff5500');
        }

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth * healthRatio, barHeight);

        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(x, y, barWidth, barHeight);
        ctx.shadowBlur = 0;

        if (healthRatio < 0.3) {
            const flash = 0.6 + Math.sin(now * 0.015) * 0.4;
            ctx.strokeStyle = `rgba(255,0,0,${flash})`;
            ctx.lineWidth = 5;
            ctx.strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`ZOMBIE BOSS – ${Math.ceil(this.health)}%`, this.game.width / 2, y + barHeight + 35);
    }

    getPhaseDescription() {
        switch (this.phase) {
            case 1: return "Molten";
            case 2: return "Erupting";
            case 3: return "Cataclysm";
            default: return "Unknown";
        }
    }

    reset() {
        this.health = this.maxHealth;
        this.phase = 1;
        this.rageLevel = 0;
        this.lastPlayerScore = 0;
        this.wave = 1;
        this.maxWave = 10;
        this.staggerTimer = 0;
        this.screenShake = 0;
        this.time = 0;
        this.magmaPulse = 0;
        this.glowIntensity = 0;
        this.fireBreathingTimer = 3.0; // Start first warning after 3 seconds
        this.fireBreathingState = 'normal';
        this.fireWarningIntensity = 0;
        this.isBreathingFire = false;

        // Clear particle pool
        this.activeCount = 0;
        this.freeCount = this.particlePoolSize;
        for (let i = 0; i < this.particlePoolSize; i++) {
            this.freeList[i] = i;
        }
        this.fireFrameTime = 0;

        this.resetPaddleSize();
        if (this.aiController) {
            this.aiController.reset();
        }
        this.burstParticles.length = 0;
        this.particlePool.length = 0;
    }

    getBossData() {
        const center = new Vector2(
            this.paddle.pos.x + this.paddle.w / 2,
            this.paddle.pos.y + this.paddle.h / 2
        );
        return {
            health: this.health,
            phase: this.phase,
            rageLevel: this.rageLevel,
            position: { x: center.x, y: center.y },
            isActive: this.health > 0
        };
    }
}

// ===== BLACKBODY RADIATION LUT (1200-3500K) & PERLIN NOISE =====
// Static initialization
try {
    // ZombieBoss static properties initialized for in-game performance.
    ZombieBoss.LUT_SIZE = 512;
    ZombieBoss.bbR = new Uint8Array(ZombieBoss.LUT_SIZE);
    ZombieBoss.bbG = new Uint8Array(ZombieBoss.LUT_SIZE);
    ZombieBoss.bbB = new Uint8Array(ZombieBoss.LUT_SIZE);
    ZombieBoss._tempCache = new Uint8Array(3);

    console.debug('[DEBUG] ZombieBoss static properties initialized');
} catch (e) {
    console.error('[ERROR] Failed to initialize basic static properties:', e);
    throw e;
}

// Initialize blackbody LUT
try {
    (() => {
        const LUT = ZombieBoss.LUT_SIZE;
        for (let i = 0; i < LUT; i++) {
            const T = 1200 + (i / (LUT - 1)) * 2300;

            // Enhanced red channel: deep crimson to saturated red
            if (T < 1400) ZombieBoss.bbR[i] = Math.round(88 + (T - 1200) * 0.090);
            else if (T < 1800) ZombieBoss.bbR[i] = Math.round(116 + (T - 1400) * 0.098);
            else if (T < 2400) ZombieBoss.bbR[i] = Math.round(178 + (T - 1800) * 0.065);
            else ZombieBoss.bbR[i] = 255;

            // Enhanced green: rises more dramatically
            if (T < 1400) ZombieBoss.bbG[i] = Math.round(8 + (T - 1200) * 0.063);
            else if (T < 1800) ZombieBoss.bbG[i] = Math.round(20 + (T - 1400) * 0.153);
            else if (T < 2400) ZombieBoss.bbG[i] = Math.round(92 + (T - 1800) * 0.110);
            else if (T < 2900) ZombieBoss.bbG[i] = Math.round(158 + (T - 2400) * 0.062);
            else ZombieBoss.bbG[i] = Math.min(255, 189 + (T - 2900) * 0.025);

            // Blue: emerges sharply at higher K
            if (T < 2200) ZombieBoss.bbB[i] = 0;
            else if (T < 2700) ZombieBoss.bbB[i] = Math.round((T - 2200) * 0.084);
            else if (T < 3100) ZombieBoss.bbB[i] = Math.round(42 + (T - 2700) * 0.13);
            else ZombieBoss.bbB[i] = Math.min(255, 114 + (T - 3100) * 0.048);
        }
    })();
    console.debug('[DEBUG] Blackbody LUT initialized');
} catch (e) {
    console.error('[ERROR] Failed to initialize blackbody LUT:', e);
    throw e;
}

// Perlin noise for turbulence
try {
    ZombieBoss.NP = 256;
    ZombieBoss._pm = new Uint16Array(ZombieBoss.NP * 2);
    (() => {
        const p = new Uint16Array(ZombieBoss.NP);
        for (let i = 0; i < ZombieBoss.NP; i++) p[i] = i;
        for (let i = ZombieBoss.NP - 1; i > 0; i--) {
            const j = Math.random() * (i + 1) | 0;
            const t = p[i];
            p[i] = p[j];
            p[j] = t;
        }
        for (let i = 0; i < ZombieBoss.NP; i++) {
            ZombieBoss._pm[i] = ZombieBoss._pm[i + ZombieBoss.NP] = p[i];
        }
    })();

    ZombieBoss._gvecs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

    // Physics constants
    ZombieBoss.GRAV = 0.042;
    ZombieBoss.TURB_SC = 0.0024;
    ZombieBoss.TURB_G = 1.3;
    ZombieBoss.ENTR = 0.0095;
    ZombieBoss.DRAG_BASE = 0.978;

    console.debug('[DEBUG] Perlin noise and physics initialized');
} catch (e) {
    console.error('[ERROR] Failed to initialize Perlin noise/physics:', e);
    throw e;
}

// Static helper methods for noise and temperature
try {
    ZombieBoss._ng = function (hash, x, y) {
        const g = ZombieBoss._gvecs[hash & 7];
        return g[0] * x + g[1] * y;
    };

    ZombieBoss._fd = function (t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    ZombieBoss.n2 = function (x, y) {
        const xi = Math.floor(x) & (ZombieBoss.NP - 1);
        const yi = Math.floor(y) & (ZombieBoss.NP - 1);
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = ZombieBoss._fd(xf);
        const v = ZombieBoss._fd(yf);
        const aa = ZombieBoss._pm[ZombieBoss._pm[xi] + yi];
        const ab = ZombieBoss._pm[ZombieBoss._pm[xi] + yi + 1];
        const ba = ZombieBoss._pm[ZombieBoss._pm[xi + 1] + yi];
        const bb = ZombieBoss._pm[ZombieBoss._pm[xi + 1] + yi + 1];
        const g00 = ZombieBoss._ng(aa, xf, yf);
        const g10 = ZombieBoss._ng(ba, xf - 1, yf);
        const g01 = ZombieBoss._ng(ab, xf, yf - 1);
        const g11 = ZombieBoss._ng(bb, xf - 1, yf - 1);
        const i0 = g00 * (1 - u) * (1 - v) + g10 * u * (1 - v);
        const i1 = g01 * (1 - u) * v + g11 * u * v;
        return i0 * (1 - v) + i1 * v;
    };

    ZombieBoss.fbmCoarse = function (x, y) {
        return ZombieBoss.n2(x, y) * 0.6 + ZombieBoss.n2(x * 2.2, y * 2.2) * 0.4;
    };

    ZombieBoss.tRGB = function (t) {
        const i = Math.min(ZombieBoss.LUT_SIZE - 1, Math.round(t * (ZombieBoss.LUT_SIZE - 1)));
        ZombieBoss._tempCache[0] = ZombieBoss.bbR[i];
        ZombieBoss._tempCache[1] = ZombieBoss.bbG[i];
        ZombieBoss._tempCache[2] = ZombieBoss.bbB[i];
        return ZombieBoss._tempCache;
    };

    console.log('[DEBUG] ✓ All static methods initialized');
    console.log('[DEBUG] ZombieBoss class ready:', Object.keys(ZombieBoss).slice(0, 10).join(', ') + '...');
} catch (e) {
    console.error('[ERROR] Failed to initialize static methods:', e);
    throw e;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ZombieBoss, SpriteFireRenderer };
}

// AI Controller is now loaded from game-enhancements.js
