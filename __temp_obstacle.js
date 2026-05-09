        class Obstacle {
            // reusable trail objects to avoid constant allocation
            static _trailPool = [];
            static activeTrailCount = 0;  // global across all obstacles

            constructor(x, y, w, h) {
                this.pos = new Vec2(x, y);
                this.w = w;
                this.h = h;
                this.active = true;
                this.hitParticles = [];
                this.respawnTimer = 0;
                this.respawnDelay = 3;
                this.originalPos = new Vec2(x, y);
                this.pulsePhase = Math.random() * 10;

                // Movement pattern system
                this.pattern = this.choosePattern();
                this.patternTimer = 0;
                this.patternDuration = 8 + Math.random() * 12;

                // Pattern-specific state
                this.orbitCenter = null;
                this.orbitRadius = 0;
                this.orbitSpeed = 0;
                this.phase = Math.random() * Math.PI * 2;
                this.waveAmplitude = 0;
                this.waveFreq = 0;
                this.baseX = x;
                this.baseY = y;
                this.spiralCenter = null;
                this.spiralMinRadius = 0;
                this.spiralMaxRadius = 0;
                this.spiralRadius = 0;
                this.spiralRadiusSpeed = 0;
                this.figure8Center = null;
                this.figure8Scale = 0;
                this.figure8Speed = 0;
                this.teleportTarget = null;
                this.teleportTimer = 0;
                this.teleportInterval = 0;
                this.teleportFlash = 0;
                this.flightGroup = null;
                this.flightGroupSlot = 0;
                this.flightGroupColumns = 1;
                this.flightGroupRows = 1;
                this.flightTargetX = x;
                this.flightTargetY = y;
                this.flightSlotOffsetX = 0;
                this.flightSlotOffsetY = 0;
                this.flightArcPhase = Math.random() * Math.PI * 2;

                // Fallback drift velocity
                this.driftVelocity = new Vec2(
                    (Math.random() - 0.5) * 0.6,
                    (Math.random() - 0.5) * 0.6
                );
                this.driftChangeTimer = 0;
                this.driftChangeInterval = 1.8 + Math.random() * 2.2;

                // Physics properties for more realistic motion
                this.velocity = this.driftVelocity.copy().mul(80); // scaled initial velocity
                this.acceleration = new Vec2(0, 0);
                this.mass = 1 + Math.random() * 1.8;
                this.maxSpeed = 160 + Math.random() * 60;
                this.maxAcceleration = 280 + Math.random() * 140;
                this.drag = 0.92 + Math.random() * 0.06;

                // Damage & degradation system
                this.damageLevel = 0;
                this.maxDamage = 3 + Math.floor(Math.random() * 2);

                this.hitParticles.forEach(p => p.render(ctx));
            }

            renderGlobalEffects(ctx, particleEffectsEnabled) {
                if (particleEffectsEnabled) {
                    window.globalFragmentPool.renderAll(ctx, true);
                }
            }

            propagateCoreLighting() {
                if (this.agitationLevel < 0.1 || !this.active) return;

                const game = window.game;
                const corePos = this.getCorePosition();
                const lightRadius = 120 + this.agitationLevel * 80;

                if (game.obstacles) {
                    for (const obs of game.obstacles) {
                        if (obs !== this && obs.active) {
                            const dx = obs.pos.x + obs.w / 2 - corePos.x;
                            const dy = obs.pos.y + obs.h / 2 - corePos.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist < lightRadius) {
                                const lightFactor = (lightRadius - dist) / lightRadius;
                                obs.agitationLevel = Math.min(1.0, obs.agitationLevel + lightFactor * 0.15);
                            }
                        }
                    }
                }
            }

            drawCircuitPattern(ctx, x, y, w, h) {
                        this.waveAmplitude = 45 + Math.random() * 90;
                        this.waveFreq = 0.6 + Math.random() * 1.4;
                        this.baseX = this.pos.x;
                        break;

                    case "spiral":
                        this.spiralCenter = {
                            x: midX + (Math.random() - 0.5) * 280,
                            y: midY + (Math.random() - 0.5) * 200
                        };
                        this.spiralMinRadius = 34 + Math.random() * 42;
                        this.spiralMaxRadius = 110 + Math.random() * 140;
                        this.spiralRadius = this.spiralMinRadius + Math.random() * (this.spiralMaxRadius - this.spiralMinRadius);
                        this.spiralRadiusSpeed = (36 + Math.random() * 34) * (Math.random() < 0.5 ? -1 : 1);
                        this.phase = Math.random() * Math.PI * 2;
                        break;

                    case "figure_eight":
                        this.figure8Center = {
                            x: midX + (Math.random() - 0.5) * 240,
                            y: midY + (Math.random() - 0.5) * 170
                        };
                        this.figure8Scale = 60 + Math.random() * 100;
                        this.figure8Speed = 0.8 + Math.random() * 1.4;
                        this.phase = Math.random() * Math.PI * 2;
                        break;

                    case "teleport":
                        this.teleportInterval = 1.2 + Math.random() * 1.8;
                        this.teleportTimer = this.teleportInterval;
                        this.teleportTarget = { x: this.pos.x, y: this.pos.y };
                        break;

                    case "chase_light":
                    case "avoid_paddle":
                        // no special init needed
                        break;

                    default: // drift
                        this.driftVelocity = new Vec2(
                            (Math.random() - 0.5) * 0.8,
                            (Math.random() - 0.5) * 0.8
                        );
                        this.driftChangeTimer = 0;
                        this.driftChangeInterval = 1.8 + Math.random() * 2.2;
                }
            }

            setFlightGroup(group, slotIndex = 0, slotCount = 1, columns = 1) {
                this.flightGroup = group || null;
                this.flightGroupSlot = slotIndex;
                this.flightGroupColumns = Math.max(1, columns || 1);
                this.flightGroupRows = Math.max(1, Math.ceil(Math.max(1, slotCount) / this.flightGroupColumns));
                this.flightArcPhase = Math.random() * Math.PI * 2;

                if (group) {
                    this.pattern = group.pattern;
                    this.patternTimer = 0;
                    this.patternDuration = 9999;
                }
            }

            getFlightTarget() {
                if (Number.isFinite(this.flightTargetX) && Number.isFinite(this.flightTargetY)) {
                    return { x: this.flightTargetX, y: this.flightTargetY };
                }
                return { x: this.pos.x, y: this.pos.y };
            }

            pickTeleportTarget(game) {
                const padding = 70;
                const minX = padding;
                const maxX = Math.max(minX, game.width - padding - this.w);
                const minY = padding;
                const maxY = Math.max(minY, game.height - padding - this.h);

                for (let attempts = 0; attempts < 24; attempts++) {
                    const x = minX + Math.random() * (maxX - minX);
                    const y = minY + Math.random() * (maxY - minY);

                    const playerPaddle = game.player;
                    const aiPaddle = game.aiPaddle;
                    const centerX = x + this.w / 2;
                    const centerY = y + this.h / 2;

                    const playerDist = Math.hypot(
                        centerX - (playerPaddle.pos.x + playerPaddle.w / 2),
                        centerY - (playerPaddle.pos.y + playerPaddle.h / 2)
                    );

                    const aiDist = Math.hypot(
                        centerX - (aiPaddle.pos.x + aiPaddle.w / 2),
                        centerY - (aiPaddle.pos.y + aiPaddle.h / 2)
                    );

                    let tooClose = false;
                    for (const other of game.obstacles) {
                        if (other !== this && other.active) {
                            const dist = Math.hypot(
                                centerX - (other.pos.x + other.w / 2),
                                centerY - (other.pos.y + other.h / 2)
                            );
                            if (dist < 90) {
                                tooClose = true;
                                break;
                            }
                        }
                    }

                    if (playerDist > 110 && aiDist > 110 && !tooClose) {
                        return { x, y };
                    }
                }

                return {
                    x: Math.min(Math.max(this.originalPos.x, minX), maxX),
                    y: Math.min(Math.max(this.originalPos.y, minY), maxY)
                };
            }

            update(dt) {
                this.updateParticles(dt);

                // Visibility culling: check if obstacle is on-screen
                const game = window.game;
                const margin = 250;
                this.lastVisibilityCheck += dt;
                if (this.lastVisibilityCheck > this.visibilityCheckInterval) {
                    this.lastVisibilityCheck = 0;
                    this.isVisibleThisFrame = !(
                        this.pos.x + this.w < -margin || this.pos.x > game.width + margin ||
                        this.pos.y + this.h < -margin || this.pos.y > game.height + margin
                    );
                }

                // Skip expensive effects if off-screen
                if (this.isVisibleThisFrame && areParticleEffectsEnabled()) {
                    let bloomWriteIndex = 0;
                    for (let i = 0; i < this.bloomLayers.length; i++) {
                        const layer = this.bloomLayers[i];
                        layer.life -= dt;
                        layer.alpha -= dt * 2;
                        if (layer.life > 0 && layer.alpha > 0) {
                            this.bloomLayers[bloomWriteIndex++] = layer;
                        }
                    }
                    this.bloomLayers.length = bloomWriteIndex;

                    // Reduced bloom generation rate (was 0.15s, now 0.5s)
                    this.bloomUpdateTime += dt;
                    if (this.bloomUpdateTime > 0.5 && this.active) {
                        this.bloomUpdateTime = 0;
                        if (this.bloomLayers.length < 3) { // Cap bloom layers to 3
                            this.bloomLayers.push({
                                x: this.pos.x + Math.random() * this.w,
                                y: this.pos.y + this.floatOffset + Math.random() * this.h,
                                radius: 10 + Math.random() * 15,
                                life: 0.3 + Math.random() * 0.3,
                                alpha: 0.4 + Math.random() * 0.3
                            });
                        }
                    }
                } else if (!areParticleEffectsEnabled()) {
                    this.hitParticles.length = 0;
                    this.bloomLayers.length = 0;
                    this.bloomUpdateTime = 0;
                }

                // Update afterimages (only if visible)
                let afterWriteIdx = 0;
                for (let i = 0; i < this.afterimages.length; i++) {
                    this.afterimages[i].life -= dt;
                    if (this.afterimages[i].life > 0) {
                        this.afterimages[afterWriteIdx++] = this.afterimages[i];
                    }
                }
                this.afterimages.length = afterWriteIdx;

                // Decay agitation
                this.agitationLevel = Math.max(0, this.agitationLevel - this.agitationDecayRate * dt);
                this.lastHitTime += dt;

                if (!this.active) {
                    this.respawnTimer -= dt;
                    if (this.respawnTimer <= 0) {
                        this.respawn();
                    }
                } else {
                    this.floatPhase += dt * this.floatSpeed;
                    this.floatOffset = Math.sin(this.floatPhase) * this.floatRange;
                    this.rotation += dt * this.rotationSpeed;

                    this.corePhase += dt * this.coreSpeed;
                    this.innerGlowPhase += dt * this.glowPulseSpeed;

                    if (!this.flightGroup) {
                        // Pattern switching for free-flying obstacles only
                        this.patternTimer += dt;
                        if (this.patternTimer >= this.patternDuration) {
                            this.pattern = this.choosePattern();
                            this.patternTimer = 0;
                            this.patternDuration = 7 + Math.random() * 15;
                            this.initPattern();
                        }
                    } else {
                        this.patternTimer += dt;
                    }

                    this.applyMovementPattern(dt);

                    // Generate afterimages during high-speed movement (only if visible)
                    if (this.isVisibleThisFrame) {
                        const currentSpeed = this.velocity.len();
                        if ((currentSpeed > 120 || this.agitationLevel > 0.3) && areParticleEffectsEnabled()) {
                            this.afterImageTimer += dt;
                            if (this.afterImageTimer > this.afterImageInterval) {
                                this.afterImageTimer = 0;
                                if (this.afterimages.length < 8) { // Limit afterimages to 8
                                    this.afterimages.push({
                                        x: this.pos.x,
                                        y: this.pos.y,
                                        floatOffset: this.floatOffset,
                                        rotation: this.rotation,
                                        alpha: 0.25 + Math.random() * 0.15,
                                        life: 0.2 + Math.random() * 0.15,
                                        w: this.w,
                                        h: this.h,
                                        colorHue: this.colorHue,
                                        saturation: this.saturation,
                                        lightness: this.lightness
                                    });
                                }
                            }
                        }
                    }

                    // Soft world bounds
                    const padding = 90;
                    if (this.pos.x < padding) {
                        this.pos.x = padding;
                        if (this.driftVelocity) this.driftVelocity.x *= -0.7;
                    }
                    if (this.pos.x + this.w > game.width - padding) {
                        this.pos.x = game.width - padding - this.w;
                        if (this.driftVelocity) this.driftVelocity.x *= -0.7;
                    }
                    if (this.pos.y < padding) {
                        this.pos.y = padding;
                        if (this.driftVelocity) this.driftVelocity.y *= -0.7;
                    }
                    if (this.pos.y + this.h > game.height - padding) {
                        this.pos.y = game.height - padding - this.h;
                        if (this.driftVelocity) this.driftVelocity.y *= -0.7;
                    }
                }

                if (this.showShieldBurst) {
                    this.shieldBurstTime -= dt;
                    this.shieldBurstRadius += dt * 500;
                    if (this.shieldBurstTime <= 0) this.showShieldBurst = false;
                }

                if (this.teleportFlash > 0) {
                    this.teleportFlash = Math.max(0, this.teleportFlash - dt * 2.5);
                }

                if (this.hitFlash > 0) {
                    this.hitFlash -= dt * 4;
                }

                this.pulsePhase += dt * 2.5;
            }

            applyMovementPattern(dt) {
                const game = window.game;
                const centerX = this.pos.x + this.w / 2;
                const centerY = this.pos.y + this.h / 2 + this.floatOffset;

                let desiredVel = new Vec2(0, 0);

                if (this.flightGroup) {
                    const targetX = Number.isFinite(this.flightTargetX) ? this.flightTargetX : centerX;
                    const targetY = Number.isFinite(this.flightTargetY) ? this.flightTargetY : centerY;
                    const leadX = targetX + Math.cos(this.flightArcPhase + this.flightGroup.phase * 0.8) * 10;
                    const leadY = targetY + Math.sin(this.flightArcPhase + this.flightGroup.phase * 0.95) * 8;
                    desiredVel = new Vec2((leadX - centerX) * 4.8, (leadY - centerY) * 4.8);
                    desiredVel.x += Math.sin(this.flightGroup.phase + this.flightArcPhase) * 6;
                    desiredVel.y += Math.cos(this.flightGroup.phase * 1.4 + this.flightArcPhase) * 4;
                } else switch (this.pattern) {
                    case "slow_orbit":
                    case "ring_clockwise":
                    case "ring_counter": {
                        this.phase += dt * this.orbitSpeed;
                        const targetX = this.orbitCenter.x + Math.cos(this.phase) * this.orbitRadius;
                        const targetY = this.orbitCenter.y + Math.sin(this.phase) * this.orbitRadius;
                        const offset = new Vec2(targetX - centerX, targetY - centerY);
                        desiredVel = offset.copy().mul(4.2);
                        break;
                    }

                    case "wave_horizontal":
                        this.phase += dt * 1.8;
                        const waveY = this.baseY + Math.sin(this.phase * this.waveFreq) * this.waveAmplitude;
                        desiredVel = new Vec2(0, (waveY - centerY) * 2.5);
                        break;

                    case "wave_vertical":
                        this.phase += dt * 1.7;
                        const waveX = this.baseX + Math.sin(this.phase * this.waveFreq) * this.waveAmplitude;
                        desiredVel = new Vec2((waveX - centerX) * 2.5, 0);
                        break;

                    case "spiral": {
                        this.phase += dt * 1.8;
                        this.spiralRadius += dt * this.spiralRadiusSpeed;
                        if (this.spiralRadius <= this.spiralMinRadius || this.spiralRadius >= this.spiralMaxRadius) {
                            this.spiralRadiusSpeed *= -1;
                            this.spiralRadius = Math.max(this.spiralMinRadius, Math.min(this.spiralMaxRadius, this.spiralRadius));
                        }
                        const spiralAngle = this.phase * 2.1;
                        const spiralX = this.spiralCenter.x + Math.cos(spiralAngle) * this.spiralRadius;
                        const spiralY = this.spiralCenter.y + Math.sin(spiralAngle) * this.spiralRadius;
                        desiredVel = new Vec2((spiralX - centerX) * 4.0, (spiralY - centerY) * 4.0);
                        break;
                    }

                    case "figure_eight": {
                        this.phase += dt * this.figure8Speed;
                        const t = this.phase;
                        const loopX = Math.sin(t) * this.figure8Scale;
                        const loopY = Math.sin(t) * Math.cos(t) * this.figure8Scale * 0.72;
                        const figureX = this.figure8Center.x + loopX;
                        const figureY = this.figure8Center.y + loopY;
                        desiredVel = new Vec2((figureX - centerX) * 4.4, (figureY - centerY) * 4.4);
                        break;
                    }

                    case "teleport": {
                        this.teleportTimer -= dt;
                        if (this.teleportTimer <= 0) {
                            const target = this.pickTeleportTarget(game);
                            this.pos.set(target.x, target.y);
                            this.teleportTarget = target;
                            this.teleportFlash = 1;
                            this.teleportInterval = 1.2 + Math.random() * 1.8;
                            this.teleportTimer = this.teleportInterval;
                            this.velocity.set((Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140);
                            this.rotation = Math.random() * Math.PI * 2;
                            this.floatPhase = Math.random() * Math.PI * 2;
                            this.agitationLevel = Math.min(1, this.agitationLevel + 0.25);
                        }

                        if (this.teleportTarget) {
                            const targetCenterX = this.teleportTarget.x + this.w / 2;
                            const targetCenterY = this.teleportTarget.y + this.h / 2;
                            desiredVel = new Vec2((targetCenterX - centerX) * 5.8, (targetCenterY - centerY) * 5.8);
                        }
                        break;
                    }

                    case "chase_light": {
                        const dx = game.ball.pos.x - centerX;
                        const dy = game.ball.pos.y - centerY;
                        const dist = Math.hypot(dx, dy);
                        if (dist < 420 && dist > 70) {
                            const strength = (420 - dist) / 420 * 0.85;
                            desiredVel = new Vec2(dx * strength * 0.0048 * 100, dy * strength * 0.0048 * 100);
                        }
                        break;
                    }

                    case "avoid_paddle": {
                        const paddles = [game.player, game.aiPaddle];
                        let closest = null;
                        let minDist = Infinity;
                        for (const p of paddles) {
                            const d = Math.hypot(
                                p.pos.x + p.w / 2 - centerX,
                                p.pos.y + p.h / 2 - centerY
                            );
                            if (d < minDist) {
                                minDist = d;
                                closest = p;
                            }
                        }
                        if (closest && minDist < 260) {
                            const dx = centerX - (closest.pos.x + closest.w / 2);
                            const dy = centerY - (closest.pos.y + closest.h / 2);
                            const force = (260 - minDist) / 260;
                            desiredVel = new Vec2(dx * force * 0.007 * 120, dy * force * 0.007 * 120);
                        }
                        break;
                    }

                    default: // drift
                        this.driftChangeTimer += dt;
                        if (this.driftChangeTimer > this.driftChangeInterval) {
                            this.driftChangeTimer = 0;
                            this.driftVelocity.x += (Math.random() - 0.5) * 1.3;
                            this.driftVelocity.y += (Math.random() - 0.5) * 1.3;
                            this.driftVelocity.x = Math.max(-1.7, Math.min(1.7, this.driftVelocity.x));
                            this.driftVelocity.y = Math.max(-1.7, Math.min(1.7, this.driftVelocity.y));
                        }
                        desiredVel = this.driftVelocity.copy().mul(60);
                }

                // Steering and physics integration
                const steer = desiredVel.copy().add(this.velocity.copy().mul(-1));
                steer.clampLength(this.maxAcceleration * dt / this.mass);
                this.acceleration.set(steer.x, steer.y);

                this.velocity.add(this.acceleration);
                this.velocity.clampLength(this.maxSpeed);
                this.velocity.mul(Math.pow(this.drag, dt * 60));

                this.pos.add(this.velocity.copy().mul(dt));
            }

            getCorePosition() {
                const orbitX = Math.sin(this.corePhase * 1.7) * (this.w / 2 - 25);
                const orbitY = Math.cos(this.corePhase * 1.3) * (this.h / 2 - 25);
                return {
                    x: this.pos.x + this.w / 2 + orbitX,
                    y: this.pos.y + this.h / 2 + this.floatOffset + orbitY
                };
            }

            respawn() {
                const game = window.game;
                const padding = 80;
                const minX = padding;
                const maxX = game.width - padding - this.w;
                const minY = padding;
                const maxY = game.height - padding - this.h;

                const hasFlightGroup = !!this.flightGroup;
                if (hasFlightGroup && Number.isFinite(this.flightTargetX) && Number.isFinite(this.flightTargetY)) {
                    this.pos.x = Math.min(Math.max(this.flightTargetX, minX), maxX);
                    this.pos.y = Math.min(Math.max(this.flightTargetY, minY), maxY);
                } else {
                    let attempts = 0;
                    let validPosition = false;

                    while (!validPosition && attempts < 20) {
                        this.pos.x = minX + Math.random() * (maxX - minX);
                        this.pos.y = minY + Math.random() * (maxY - minY);

                        const playerPaddle = game.player;
                        const aiPaddle = game.aiPaddle;

                        const playerDist = Math.hypot(
                            this.pos.x + this.w / 2 - (playerPaddle.pos.x + playerPaddle.w / 2),
                            this.pos.y + this.h / 2 - (playerPaddle.pos.y + playerPaddle.h / 2)
                        );

                        const aiDist = Math.hypot(
                            this.pos.x + this.w / 2 - (aiPaddle.pos.x + aiPaddle.w / 2),
                            this.pos.y + this.h / 2 - (aiPaddle.pos.y + aiPaddle.h / 2)
                        );

                        let tooCloseToOther = false;
                        for (const other of game.obstacles) {
                            if (other !== this && other.active) {
                                const dist = Math.hypot(
                                    this.pos.x + this.w / 2 - (other.pos.x + other.w / 2),
                                    this.pos.y + this.h / 2 - (other.pos.y + other.h / 2)
                                );
                                if (dist < 80) {
                                    tooCloseToOther = true;
                                    break;
                                }
                            }
                        }

                        if (playerDist > 100 && aiDist > 100 && !tooCloseToOther) {
                            validPosition = true;
                        }
                        attempts++;
                    }

                    if (!validPosition) {
                        // Fall back to the original spawn area if the search could not
                        // find a safe spot (small canvases or crowded layouts).
                        this.pos.x = Math.min(Math.max(this.originalPos.x, minX), maxX);
                        this.pos.y = Math.min(Math.max(this.originalPos.y, minY), maxY);
                    }
                }

                this.active = true;
                this.hitParticles = [];
                this.coreTrails = [];
                this.bloomLayers = [];
                this.afterimages = [];
                this.showShieldBurst = false;
                this.shieldBurstTime = 0;
                this.shieldBurstRadius = 0;
                this.hitFlash = 0;
                this.floatPhase = Math.random() * Math.PI * 2;
                this.corePhase = Math.random() * Math.PI * 2;
                this.rotation = Math.random() * Math.PI * 2;
                this.colorHue = (this.pos.x + this.pos.y * 37) % 360;
                this.patternType = Math.floor(Math.random() * 5);
                this.detailVariant = Math.floor(Math.random() * 4);
                this.damageLevel = 0;

                // Reset agitation and hit tempo after respawn
                this.agitationLevel = 0;
                this.lastHitTime = 100;
                this.afterImageTimer = 0;

                // Reset physics state
                this.velocity.set((Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140);
                this.acceleration.set(0, 0);

                // Reset movement pattern
                if (this.flightGroup) {
                    this.pattern = this.flightGroup.pattern;
                    this.patternTimer = 0;
                    this.patternDuration = 9999;
                } else {
                    this.pattern = this.choosePattern();
                    this.patternTimer = 0;
                    this.patternDuration = 8 + Math.random() * 12;
                    this.initPattern();
                }

                this.originalPos.set(this.pos.x, this.pos.y);

                this.generateSurfaceDetails();
                this.updateColors();
                this.buildDetailCache();
            }

            getCollisionNormal(ball) {
                const closestX = Math.max(this.pos.x, Math.min(ball.pos.x, this.pos.x + this.w));
                const closestY = Math.max(this.pos.y, Math.min(ball.pos.y, this.pos.y + this.h));
                const normal = new Vec2(ball.pos.x - closestX, ball.pos.y - closestY);
                if (normal.lenSq() < 1e-10) {
                    const left = Math.abs(ball.pos.x - this.pos.x);
                    const right = Math.abs(this.pos.x + this.w - ball.pos.x);
                    const top = Math.abs(ball.pos.y - this.pos.y);
                    const bottom = Math.abs(this.pos.y + this.h - ball.pos.y);
                    const nearestSide = Math.min(left, right, top, bottom);

                    if (nearestSide === left) normal.set(-1, 0);
                    else if (nearestSide === right) normal.set(1, 0);
                    else if (nearestSide === top) normal.set(0, -1);
                    else normal.set(0, 1);
                    return normal;
                }
                normal.normalize();
                return normal;
            }

            checkCollision(ball) {
                if (!this.active) return false;

                const closestX = Math.max(this.pos.x, Math.min(ball.pos.x, this.pos.x + this.w));
                const closestY = Math.max(this.pos.y, Math.min(ball.pos.y, this.pos.y + this.h));
                const distX = ball.pos.x - closestX;
                const distY = ball.pos.y - closestY;
                const distSq = distX * distX + distY * distY;

                if (distSq <= ball.r * ball.r) {
                    const impactNormal = this.getCollisionNormal(ball);
                    const separation = ball.r + 0.5;
                    ball.pos.x = closestX + impactNormal.x * separation;
                    ball.pos.y = closestY + impactNormal.y * separation;

                    this.showShieldBurst = true;
                    this.shieldBurstTime = 0.5;
                    this.shieldBurstRadius = 0;
                    this.hitFlash = 1;

                    // Update damage and agitation
                    this.damageLevel = Math.min(this.maxDamage, this.damageLevel + 1);
                    this.agitationLevel = Math.min(1.0, this.agitationLevel + 0.4);
                    this.lastHitTime = 0;

                    this.active = this.damageLevel < this.maxDamage; // Obstacle breaks on maxDamage
                    this.respawnTimer = this.respawnDelay;

                    // Generate destructible fragments (reduced count for performance)
                    const fragmentCount = 5 + Math.floor(this.damageLevel * 1.5); // was 8+damage*2
                    const ballVelMag = ball.vel ? ball.vel.len() : 200;
                    const pool = window.globalFragmentPool;
                    for (let i = 0; i < fragmentCount; i++) {
                        const angle = (i / fragmentCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
                        const speed = 200 + Math.random() * 250 + ballVelMag * 0.5;
                        const fx = Math.cos(angle) * speed;
                        const fy = Math.sin(angle) * speed;

                        pool.get(closestX, closestY, this.highlightColor, fx, fy);
                    }

                    if (areParticleEffectsEnabled()) {
                        // Simplified lighting: one soft halo, one compact core, and the preserved detail layers.
                        const corePos = this.getCorePosition();
                        const ambientGlowRadius = Math.max(this.w, this.h) * (0.58 + this.agitationLevel * 0.12 + this.musicEnergy * 0.05);
                        const ambientGlowOpacity = Math.min(0.34, 0.12 + this.agitationLevel * 0.18 + this.musicEnergy * 0.08);

                        ctx.save();
                        ctx.globalCompositeOperation = 'lighter';
                        const ambientGlow = ctx.createRadialGradient(corePos.x, corePos.y, 0, corePos.x, corePos.y, ambientGlowRadius);
                        ambientGlow.addColorStop(0, `hsla(${this.colorHue}, ${this.saturation}%, 94%, ${ambientGlowOpacity})`);
                        ambientGlow.addColorStop(0.7, `hsla(${this.colorHue}, ${this.saturation}%, 70%, ${ambientGlowOpacity * 0.25})`);
                        ambientGlow.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = ambientGlow;
                        ctx.beginPath();
                        ctx.arc(corePos.x, corePos.y, ambientGlowRadius, 0, Math.PI * 2);
                        ctx.fill();

                        const coreGlowRadius = 18 + Math.sin(this.pulsePhase * 3) * 3 + this.agitationLevel * 6 + this.damageLevel * 2;
                        const coreGlow = ctx.createRadialGradient(corePos.x, corePos.y, 0, corePos.x, corePos.y, coreGlowRadius);
                        coreGlow.addColorStop(0, `hsla(0, 0%, 100%, ${0.9 + this.agitationLevel * 0.2})`);
                        coreGlow.addColorStop(0.45, `hsla(${this.colorHue}, ${this.saturation}%, 92%, ${0.55 + this.damageLevel * 0.08})`);
                        coreGlow.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation}%, 70%, 0)`);

                        ctx.fillStyle = coreGlow;
                        ctx.beginPath();
                        ctx.arc(corePos.x, corePos.y, coreGlowRadius, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(corePos.x, corePos.y, 3.2 + this.agitationLevel * 1.2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        if (particleEffectsEnabled && this.bloomLayers.length > 0) {
                            ctx.save();
                            ctx.globalCompositeOperation = 'lighter';
                            this.bloomLayers.forEach((layer, idx) => {
                                if (idx > 1) return;
                                ctx.globalAlpha = layer.alpha * 0.45;
                                const bloomGrad = ctx.createRadialGradient(layer.x, layer.y, 0, layer.x, layer.y, layer.radius);
                                bloomGrad.addColorStop(0, `hsla(${this.colorHue}, ${this.saturation}%, 100%, 0.5)`);
                                bloomGrad.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation}%, 90%, 0)`);
                                ctx.fillStyle = bloomGrad;
                                ctx.beginPath();
                                ctx.arc(layer.x, layer.y, layer.radius, 0, Math.PI * 2);
                                ctx.fill();
                            });
                            ctx.restore();
                        }

                        // Edge outline with subtle glow
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = `hsla(${this.colorHue}, ${this.saturation}%, 90%, 0.6)`;
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = `hsla(${this.colorHue}, ${this.saturation}%, 90%, 0.4)`;
                        ctx.strokeRect(bodyX, bodyY, this.w, this.h);
                        ctx.shadowBlur = 0;

                        if (this.teleportFlash > 0) {
                            ctx.save();
                            ctx.globalCompositeOperation = 'screen';
                            ctx.globalAlpha = this.teleportFlash * 0.45;
                            const blink = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, ambientGlowRadius * 1.1);
                            blink.addColorStop(0, `hsla(${(this.colorHue + 45) % 360}, 100%, 95%, 0.9)`);
                            blink.addColorStop(0.55, `hsla(${this.colorHue}, 100%, 70%, 0.25)`);
                            blink.addColorStop(1, 'rgba(0,0,0,0)');
                            ctx.fillStyle = blink;
                            ctx.fillRect(bodyX - 12, bodyY - 12, this.w + 24, this.h + 24);
                            ctx.restore();
                        }

                        ctx.restore();

                        if (this.showShieldBurst) {
                            ctx.save();
                            const burstAlpha = Math.min(1, this.shieldBurstTime * 3);
                            const ringRadius = this.shieldBurstRadius * 0.8;
                            const ringGrad = ctx.createRadialGradient(centerX, centerY, ringRadius * 0.9, centerX, centerY, ringRadius);
                            ringGrad.addColorStop(0, `hsla(${this.colorHue}, 100%, 100%, ${burstAlpha * 0.55})`);
                            ringGrad.addColorStop(1, `hsla(${this.colorHue}, 100%, 80%, 0)`);

                            ctx.globalAlpha = burstAlpha;
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.fillStyle = ringGrad;
                            ctx.beginPath();
                            ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.restore();
                        }

                        this.hitParticles.forEach(p => p.render(ctx));
                this.primaryColor = `hsl(${this.colorHue}, ${this.saturation}%, ${this.lightness}%)`;
                this.secondaryColor = `hsl(${this.colorHue}, ${this.saturation}%, ${Math.max(20, this.lightness * 0.85)}%)`;
                this.highlightColor = `hsl(${this.colorHue}, ${this.saturation * 0.8}%, ${Math.min(95, this.lightness * 1.15)}%)`;

                this.glowColor = `hsla(${this.colorHue}, ${this.saturation}%, ${this.lightness * 1.2}%, 0.5)`;
                this.deepGlowColor = `hsla(${this.colorHue}, ${this.saturation}%, ${this.lightness * 1.3}%, 0.2)`;

                this.edgeGlowTop = `hsla(${(this.colorHue + 15) % 360}, ${this.saturation * 0.9}%, 85%, 0.6)`;
                this.edgeGlowBottom = `hsla(${(this.colorHue - 15 + 360) % 360}, ${this.saturation * 0.8}%, 65%, 0.3)`;
                
                // Pre-compute pattern colors to avoid recreating on every render
                this.glowColor80 = `hsla(${this.colorHue}, ${this.saturation}%, 80%, 0.8)`;
                this.glowColor60 = `hsla(${this.colorHue}, ${this.saturation}%, 60%, 0.5)`;
                this.coreWhite = '#ffffff';
                this.coreDim = `hsl(${this.colorHue}, ${this.saturation}%, 80%)`;
            }

            buildDetailCache() {
                const cacheWidth = Math.max(1, Math.ceil(this.w));
                const cacheHeight = Math.max(1, Math.ceil(this.h));

                if (!this.detailCanvas || this.detailCanvas.width !== cacheWidth || this.detailCanvas.height !== cacheHeight) {
                    this.detailCanvas = document.createElement('canvas');
                    this.detailCanvas.width = cacheWidth;
                    this.detailCanvas.height = cacheHeight;
                    this.detailCtx = this.detailCanvas.getContext('2d');
                }

                const dctx = this.detailCtx;
                if (!dctx) return;

                dctx.clearRect(0, 0, cacheWidth, cacheHeight);
                dctx.save();
                dctx.globalCompositeOperation = 'overlay';

                if (this.detailVariant === 0) {
                    for (let i = 0; i < this.surfacePanels.length; i++) {
                        const panel = this.surfacePanels[i];
                        dctx.globalAlpha = panel.alpha * 0.9;
                        dctx.fillStyle = `hsla(${(this.colorHue + 12) % 360}, ${this.saturation}%, ${Math.min(95, this.lightness + 12)}%, 0.55)`;
                        dctx.fillRect(panel.x, panel.y, panel.w, panel.h);
                        if (panel.cracked) {
                            dctx.strokeStyle = `rgba(255,255,255,${0.18 + this.damageLevel * 0.1})`;
                            dctx.lineWidth = 1;
                            dctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
                        }
                    }
                } else if (this.detailVariant === 1) {
                    dctx.globalAlpha = 0.75;
                    dctx.strokeStyle = this.highlightColor;
                    dctx.lineWidth = 1.1;
                    this.circuitLinks.forEach(([startIndex, endIndex], linkIndex) => {
                        const start = this.circuitNodes[startIndex];
                        const end = this.circuitNodes[endIndex];
                        if (!start || !end) return;

                        const startX = start.x;
                        const startY = start.y;
                        const endX = end.x;
                        const endY = end.y;
                        const midX = linkIndex % 2 === 0 ? startX : endX;

                        dctx.beginPath();
                        dctx.moveTo(startX, startY);
                        dctx.lineTo(midX, startY);
                        dctx.lineTo(midX, endY);
                        dctx.lineTo(endX, endY);
                        dctx.stroke();
                    });

                    dctx.fillStyle = this.highlightColor;
                    this.circuitNodes.forEach(node => {
                        dctx.beginPath();
                        dctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
                        dctx.fill();
                    });
                } else if (this.detailVariant === 2) {
                    dctx.globalAlpha = 0.82;
                    dctx.fillStyle = `rgba(255, 190, 80, ${0.08 + this.damageLevel * 0.08})`;
                    for (let i = 0; i < this.hazardBands.length; i++) {
                        const band = this.hazardBands[i];
                        const bandY = this.h * 0.24 + band.offset;
                        dctx.fillRect(0, bandY, this.w, band.width);
                    }

                    dctx.strokeStyle = `rgba(255,255,255,${0.10 + this.damageLevel * 0.05})`;
                    dctx.lineWidth = 1;
                    for (let i = 0; i < this.scanLineOffsets.length; i++) {
                        const scanY = this.scanLineOffsets[i];
                        dctx.beginPath();
                        dctx.moveTo(3, scanY);
                        dctx.lineTo(this.w - 3, scanY + Math.sin(i * 1.7) * 1.2);
                        dctx.stroke();
                    }
                } else {
                    const radius = Math.max(this.w, this.h) * 0.38;
                    const stepCount = 22;
                    dctx.strokeStyle = `rgba(255,255,255,${0.11 + this.damageLevel * 0.04})`;
                    dctx.lineWidth = 1;
                    dctx.beginPath();
                    for (let i = 0; i <= stepCount; i++) {
                        const t = i / stepCount;
                        const angle = t * Math.PI * 4;
                        const r = radius * (0.34 + 0.66 * Math.sin(t * Math.PI));
                        const x = this.w / 2 + Math.cos(angle) * r;
                        const y = this.h / 2 + Math.sin(angle) * r;
                        if (i === 0) dctx.moveTo(x, y);
                        else dctx.lineTo(x, y);
                    }
                    dctx.stroke();
                }

                dctx.restore();
            }

            render(ctx) {
                this.updateParticles(1 / 60);
                const particleEffectsEnabled = areParticleEffectsEnabled();

                if (!this.active) {
                    if (particleEffectsEnabled) {
                        this.hitParticles.forEach(p => p.render(ctx));
                    }
                    // Global fragments are rendered at game level
                    return;
                }

                // Music-reactive attachment: sample global audio level
                const audioSnapshot = window.game?.audio?.getVisualizerSnapshot?.(18);
                const musicLevel = audioSnapshot?.level || 0;
                this.musicEnergy = Math.max(this.musicEnergy * 0.85, Math.min(1, musicLevel * 1.5));

                // Add audio energy into agitation (for cooler in-game pulse)
                if (this.musicEnergy > 0.05) {
                    this.agitationLevel = Math.min(1, Math.max(this.agitationLevel, this.musicEnergy * 0.6));
                }

                // Skip expensive rendering for off-screen obstacles (except particles)
                if (!this.isVisibleThisFrame) {
                    if (particleEffectsEnabled) {
                        this.hitParticles.forEach(p => p.render(ctx));
                    }
                    return;
                }

                ctx.save();

                const centerX = this.pos.x + this.w / 2;
                const centerY = this.pos.y + this.h / 2 + this.floatOffset;

                // Render afterimages (faint ghost copies trailing behind)
                if (particleEffectsEnabled && this.afterimages.length > 0) {
                    ctx.save();
                    this.afterimages.forEach((img, idx) => {
                        if (idx > 4) return; // Skip rendering over 4 afterimages for performance
                        ctx.globalAlpha = img.alpha * (img.life / 0.35) * 0.6; // Reduced opacity
                        ctx.translate(img.x + img.w / 2, img.y + img.h / 2 + img.floatOffset);
                        ctx.rotate(img.rotation);
                        ctx.translate(-(img.x + img.w / 2), -(img.y + img.h / 2 + img.floatOffset));

                        const imgColor = `hsl(${img.colorHue}, ${img.saturation}%, ${img.lightness}%)`;
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.fillStyle = imgColor;
                        ctx.fillRect(img.x, img.y, img.w, img.h);
                    });
                    ctx.restore();
                }

                ctx.translate(centerX, centerY);
                ctx.rotate(this.rotation);
                ctx.translate(-centerX, -centerY);

                const bodyX = this.pos.x;
                const bodyY = this.pos.y + this.floatOffset;

                if (this.detailCanvas) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.drawImage(this.detailCanvas, bodyX, bodyY);
                    ctx.restore();
                }

                // Simplified agitation effect (reduced overdraw)
                if (this.agitationLevel > 0.3) {
                    ctx.save();
                    const distortAmount = this.agitationLevel * 4;
                    const distortOpacity = this.agitationLevel * 0.1;

                    ctx.globalAlpha = distortOpacity;
                    ctx.globalCompositeOperation = 'screen';
                    const offsetX = Math.sin(this.pulsePhase * 11.3 + this.colorHue) * distortAmount * 0.5;
                    const offsetY = Math.cos(this.pulsePhase * 9.7 + this.rotation) * distortAmount * 0.5;
                    ctx.translate(offsetX, offsetY);

                    const distGrad = ctx.createLinearGradient(
                        this.pos.x, this.pos.y,
                        this.pos.x + this.w, this.pos.y + this.h
                    );
                    distGrad.addColorStop(0, `hsl(${this.colorHue}, 100%, 80%)`);
                    distGrad.addColorStop(1, `hsl(${this.colorHue}, 100%, 60%)`);

                    ctx.fillStyle = distGrad;
                    ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
                    ctx.restore();
                }

                // Compact thrust slice keeps the motion readable without the old heavy lighting stack.
                {
                    const boostLen = 18 + Math.sin(this.pulsePhase * 2) * 4;
                    const tailX = bodyX + this.w * 0.5;
                    const tailY = bodyY + this.h;

                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    const grad = ctx.createLinearGradient(tailX, tailY, tailX, tailY + boostLen);
                    grad.addColorStop(0, this.highlightColor);
                    grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(tailX - this.w * 0.3, tailY);
                    ctx.lineTo(tailX + this.w * 0.3, tailY);
                    ctx.lineTo(tailX + this.w * 0.1, tailY + boostLen);
                    ctx.lineTo(tailX - this.w * 0.1, tailY + boostLen);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }

                const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + this.w, bodyY + this.h);
                bodyGrad.addColorStop(0, `hsl(${(this.colorHue + 18) % 360}, ${this.saturation}%, ${Math.min(100, this.lightness + 8)}%)`);
                bodyGrad.addColorStop(1, `hsl(${this.colorHue}, ${this.saturation}%, ${Math.max(28, this.lightness - 10)}%)`);

                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = bodyGrad;
                ctx.fillRect(bodyX, bodyY, this.w, this.h);

                // One soft ambient halo keeps the silhouette lively without a stack of glow passes.
                const glowRadius = Math.max(this.w, this.h) * (0.58 + this.agitationLevel * 0.12 + this.musicEnergy * 0.05);
                const glowOpacity = Math.min(0.34, 0.12 + this.agitationLevel * 0.18 + this.musicEnergy * 0.08);
                ctx.globalCompositeOperation = 'lighter';
                const glowGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
                glowGrad.addColorStop(0, `hsla(${this.colorHue}, ${this.saturation}%, 94%, ${glowOpacity})`);
                glowGrad.addColorStop(0.7, `hsla(${this.colorHue}, ${this.saturation}%, 70%, ${glowOpacity * 0.25})`);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
                ctx.fill();

                // Base edge lighting remains for readability.
                ctx.lineWidth = 2;

                const edgeGradTop = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + 8);
                edgeGradTop.addColorStop(0, this.edgeGlowTop);
                edgeGradTop.addColorStop(1, 'transparent');

                ctx.strokeStyle = edgeGradTop;
                ctx.beginPath();
                ctx.moveTo(bodyX, bodyY);
                ctx.lineTo(bodyX + this.w, bodyY);
                ctx.stroke();

                const edgeGradLeft = ctx.createLinearGradient(bodyX, bodyY, bodyX + 8, bodyY);
                edgeGradLeft.addColorStop(0, this.edgeGlowTop);
                edgeGradLeft.addColorStop(1, 'transparent');

                ctx.strokeStyle = edgeGradLeft;
                ctx.beginPath();
                ctx.moveTo(bodyX, bodyY);
                ctx.lineTo(bodyX, bodyY + this.h);
                ctx.stroke();

                ctx.save();
                // Only render corner rivets, skip center rivets (performance)
                const cornerRivets = this.rivetPoints.slice(0, 4);
                cornerRivets.forEach((rivet, index) => {
                    const rivetGrad = ctx.createRadialGradient(
                        bodyX + rivet.x - 1,
                        bodyY + rivet.y - 1,
                        0,
                        bodyX + rivet.x,
                        bodyY + rivet.y,
                        3
                    );
                    rivetGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                    rivetGrad.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation * 0.75}%, 28%, 0.9)`);

                    ctx.fillStyle = rivetGrad;
                    ctx.beginPath();
                    ctx.arc(bodyX + rivet.x, bodyY + rivet.y, 2.5, 0, Math.PI * 2); // Smaller rivets
                    ctx.fill();
                });
                ctx.restore();

                // LAYER 6: Skip expensive pattern rendering (major performance win)
                // Patterns were: energy grid, rings, radials, circuits, swirls
                // Removed entirely for performance - visual cost justified by FPS gain




                // LAYER 8: Energy core with dynamic lighting & interaction radius
                const corePos = this.getCorePosition();

                // Core lighting expands when agitated or damaged
                const coreLightRadius = 80 + Math.sin(this.pulsePhase * 2) * 20 + this.agitationLevel * 60 + this.damageLevel * 40;
                const coreLightIntensity = 0.15 + this.agitationLevel * 0.2 + this.damageLevel * 0.1;

                // Far field lighting (dim background illumination)
                const farLightGrad = ctx.createRadialGradient(
                    corePos.x, corePos.y, 0,
                    corePos.x, corePos.y, coreLightRadius
                );
                farLightGrad.addColorStop(0, `hsla(${this.colorHue}, 80%, 60%, ${coreLightIntensity * 0.3})`);
                farLightGrad.addColorStop(0.5, `hsla(${this.colorHue}, 70%, 50%, ${coreLightIntensity * 0.15})`);
                farLightGrad.addColorStop(1, `hsla(${this.colorHue}, 60%, 40%, 0)`);

                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = farLightGrad;
                ctx.beginPath();
                ctx.arc(corePos.x, corePos.y, coreLightRadius, 0, Math.PI * 2);
                ctx.fill();

                const coreGlowRadius = 30 + Math.sin(this.pulsePhase * 3) * 5 + this.agitationLevel * 10;
                const coreGlow = ctx.createRadialGradient(
                    corePos.x, corePos.y, 0,
                    corePos.x, corePos.y, coreGlowRadius
                );
                coreGlow.addColorStop(0, `hsla(0, 0%, 100%, ${0.9 + this.agitationLevel * 0.3})`);
                coreGlow.addColorStop(0.4, `hsla(${this.colorHue}, ${this.saturation}%, 90%, ${0.6 + this.damageLevel * 0.15})`);
                coreGlow.addColorStop(0.8, `hsla(${this.colorHue}, ${this.saturation}%, 80%, 0.2)`);
                coreGlow.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation}%, 70%, 0)`);

                ctx.fillStyle = coreGlow;
                ctx.beginPath();
                ctx.arc(corePos.x, corePos.y, coreGlowRadius, 0, Math.PI * 2);
                ctx.fill();

                const coreSize = 8 + Math.sin(this.pulsePhase * 4) * 4 + this.agitationLevel * 3;
                const coreInnerGrad = ctx.createRadialGradient(
                    corePos.x, corePos.y, 0,
                    corePos.x, corePos.y, coreSize
                );
                coreInnerGrad.addColorStop(0, '#ffffff');
                coreInnerGrad.addColorStop(0.3, `hsl(${this.colorHue}, ${this.saturation}%, 95%)`);
                coreInnerGrad.addColorStop(1, `hsl(${this.colorHue}, ${this.saturation}%, 80%)`);

                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = coreInnerGrad;
                ctx.beginPath();
                ctx.arc(corePos.x, corePos.y, coreSize, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                // Compact core lighting keeps the center readable without the old multi-layer bloom.
                        const bloomColor = `hsla(${this.colorHue}, ${this.saturation}%, 100%, 0.5)`;
                const coreGlowRadius = 18 + Math.sin(this.pulsePhase * 3) * 3 + this.agitationLevel * 6 + this.damageLevel * 2;
                const coreGlow = ctx.createRadialGradient(corePos.x, corePos.y, 0, corePos.x, corePos.y, coreGlowRadius);
                coreGlow.addColorStop(0, `hsla(0, 0%, 100%, ${0.9 + this.agitationLevel * 0.2})`);
                coreGlow.addColorStop(0.45, `hsla(${this.colorHue}, ${this.saturation}%, 92%, ${0.55 + this.damageLevel * 0.08})`);
                coreGlow.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation}%, 70%, 0)`);

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = coreGlow;
                ctx.beginPath();
                ctx.arc(corePos.x, corePos.y, coreGlowRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(corePos.x, corePos.y, 3.2 + this.agitationLevel * 1.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                if (particleEffectsEnabled && this.bloomLayers.length > 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    this.bloomLayers.forEach((layer, idx) => {
                        if (idx > 1) return;
                        ctx.globalAlpha = layer.alpha * 0.45;
                        const bloomGrad = ctx.createRadialGradient(layer.x, layer.y, 0, layer.x, layer.y, layer.radius);
                        bloomGrad.addColorStop(0, `hsla(${this.colorHue}, ${this.saturation}%, 100%, 0.5)`);
                        bloomGrad.addColorStop(1, `hsla(${this.colorHue}, ${this.saturation}%, 90%, 0)`);
                        ctx.fillStyle = bloomGrad;
                        ctx.beginPath();
                        ctx.arc(layer.x, layer.y, layer.radius, 0, Math.PI * 2);
                        ctx.fill();
                    });
                    ctx.restore();
                }


                // Edge outline with subtle glow
                if (this.agitationLevel < 0.1 || !this.active) return;

                const game = window.game;
                const corePos = this.getCorePosition();
                const lightRadius = 120 + this.agitationLevel * 80;

                // Light up nearby obstacles
                if (game.obstacles) {
                    for (const obs of game.obstacles) {
                        if (obs !== this && obs.active) {
                            const dist = Math.hypot(
                    const blink = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius * 1.1);
                                obs.pos.y + obs.h / 2 - corePos.y
                            );
                            if (dist < lightRadius) {
                                const lightFactor = (lightRadius - dist) / lightRadius;
                                obs.agitationLevel = Math.min(1.0, obs.agitationLevel + lightFactor * 0.15);
                            }
                        }
                    }
                }
            }

            drawCircuitPattern(ctx, x, y, w, h) {
                this.circuitLinks.forEach(([startIndex, endIndex], linkIndex) => {
                    const start = this.circuitNodes[startIndex];
                    const end = this.circuitNodes[endIndex];
                    if (!start || !end) return;

                    const startX = x + start.x;
                    const startY = y + start.y;
                    const endX = x + end.x;
                    const endY = y + end.y;
                    const midX = linkIndex % 2 === 0 ? startX : endX;

                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(midX, startY);
                    ctx.lineTo(midX, endY);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                });

                ctx.fillStyle = this.highlightColor;
                this.circuitNodes.forEach(node => {
                    ctx.beginPath();
                    ctx.arc(x + node.x, y + node.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            drawSwirlPattern(ctx, cx, cy, radius) {
                ctx.beginPath();
                const segments = 50;
                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    const angle = t * Math.PI * 4 + this.pulsePhase;
                    const r = radius * (0.3 + 0.7 * Math.sin(t * Math.PI));
                    const x = cx + Math.cos(angle) * r;
                    const y = cy + Math.sin(angle) * r;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }
        }

        // ===================================================================
        // ZombieBoss - Simplified with Leftward Burst Fire & Magma Paddle
        // ===================================================================
