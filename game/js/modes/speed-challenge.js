class SpeedChallenge {
    constructor(game) {
        this.game = game;
        this.isActive = false;
        this.isMultiplayer = false;
        this.activePlayer = 'player'; // 'player' or 'ai' (P2)
        this.timeLimit = 0;
        this.timeRemaining = 0;
        this.challengeUI = document.getElementById('speedChallenge');
        // store information about the last rally score for challenge resolution
        this.lastScoreChange = null;
        this.timerFill = document.getElementById('challengeTimerFill');
        this.timeDisplay = document.getElementById('challengeTimeDisplay');
        this.status = document.getElementById('challengeStatus');
        this.difficultyDisplay = document.getElementById('targetDifficulty');
        // Query for target-container within the speedChallenge div for specificity
        this.targetContainer = this.challengeUI?.querySelector('.target-container') || document.querySelector('.speed-challenge .target-container');

        // Challenge state
        this.challengeDifficulty = 1;
        this.challengesCompleted = 0;
        this.targetsClicked = 0;
        this.totalTargets = 0;
        this.targetSettings = {
            size: 0,
            count: 0,
            timeLimit: 0,
            moveSpeed: 0,
            movingChance: 0,
            specialTargetChance: 0,
            visualNoise: 0,
            targetTypes: ['static']
        };
        this.activeTargets = new Set();
        this.lastPlayerScore = 0;
        this.combo = 0;
        this.maxCombo = 0;

        // Combo state
        this.currentCombo = [];
        this.targetCombo = [];
        this.comboKeys = {
            player: ['w', 's', 'a', 'd'],
            ai: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter']
        };
        this.countdownState = null;
        this.transitionState = null;

        // Animation intervals
        this.intervals = {
            timer: null,
            countdown: null,
            pulse: null,
            movement: null,
            visualNoise: null,
            flash: null
        };
        this.timeoutHandles = new Set();
        this.paused = false;

        this.cockpitHUD = null;

        // Visual effects elements
        this.distractionElements = [];

        // Accessibility
        this.announcer = document.createElement('div');
        this.announcer.setAttribute('aria-live', 'polite');
        this.announcer.setAttribute('aria-atomic', 'true');
        this.announcer.className = 'sr-only';
        this.challengeUI.appendChild(this.announcer);

        // Event listeners
        this.eventHandlers = {
            keydown: null,
            resize: null
        };

        this.setupEventListeners();
    }

    clearTimer() {
        if (this.intervals.timer) {
            clearInterval(this.intervals.timer);
            this.intervals.timer = null;
        }
    }

    startTimer(intervalMs = 30) {
        if (this.paused || !this.isActive) return;
        this.clearTimer();
        this.intervals.timer = setInterval(() => this.updateTimer(), intervalMs);
    }

    clearCountdown() {
        this.clearTrackedTimeouts('countdown');
        this.countdownState = null;
    }

    trackTimeout(callback, delay, group = 'general') {
        const timeout = {
            callback,
            delay,
            remaining: delay,
            startedAt: 0,
            handle: null,
            group,
            schedule: null
        };

        timeout.schedule = () => {
            timeout.startedAt = performance.now();
            timeout.handle = setTimeout(() => {
                this.timeoutHandles.delete(timeout);
                timeout.handle = null;
                timeout.remaining = 0;
                callback();
            }, Math.max(0, timeout.remaining));
        };

        this.timeoutHandles.add(timeout);

        if (!this.paused) {
            timeout.schedule();
        }

        return timeout;
    }

    clearTrackedTimeouts(group = null) {
        if (!this.timeoutHandles) return;
        this.timeoutHandles.forEach(timeout => {
            if (group !== null && timeout.group !== group) return;
            if (timeout.handle) {
                clearTimeout(timeout.handle);
            }
            this.timeoutHandles.delete(timeout);
        });
    }

    setPaused(paused) {
        if (this.paused === paused) return;
        const now = performance.now();
        this.paused = paused;
        this.challengeUI?.classList.toggle('paused', paused);

        if (paused) {
            this.clearTimer();
            if (this.intervals.pulse) {
                clearInterval(this.intervals.pulse);
                this.intervals.pulse = null;
            }
            this.stopMovementLoop();

            this.timeoutHandles.forEach(timeout => {
                if (!timeout.handle) return;
                clearTimeout(timeout.handle);
                timeout.handle = null;
                timeout.remaining = Math.max(0, timeout.remaining - (now - timeout.startedAt));
            });
            return;
        }

        this.timeoutHandles.forEach(timeout => {
            if (timeout.handle) return;
            if (timeout.remaining <= 0) {
                this.timeoutHandles.delete(timeout);
                timeout.callback();
                return;
            }
            timeout.schedule();
        });

        if (this.isActive && this.timeRemaining > 0) {
            this.startTimer();
        }

        if (this.isActive && (this.countdownState || this.transitionState) && !this.intervals.timer) {
            this.startTimer();
        }

        if (this.isActive && this.challengeUI?.classList.contains('pulse-active') && !this.intervals.pulse) {
            this.startVisualEffects();
        }

        if (this.isActive && this.activeTargets.size > 0) {
            this.startMovementLoop();
        }
    }

    startChallenge() {
        if (this.isActive) return;

        // Defensive checks to ensure all required elements exist
        if (!this.challengeUI || !this.targetContainer || !this.timerFill || !this.status || !this.timeDisplay) {
            console.error('[SpeedChallenge] Missing required DOM elements:', {
                challengeUI: !!this.challengeUI,
                targetContainer: !!this.targetContainer,
                timerFill: !!this.timerFill,
                status: !!this.status,
                timeDisplay: !!this.timeDisplay
            });
            return;
        }

        this.isMultiplayer = this.game.isMultiplayer;
        // activePlayer should already be set by checkScoringConditions()
        // If it isn't set (e.g. initial start), default to player
        if (!this.activePlayer) this.activePlayer = 'player';

        const playerName = this.activePlayer === 'player' ? 'Player 1' : 'Player 2';
        this.game.showNotification(`${playerName}'s Turn!`, this.isMultiplayer ? 'Press the key combo!' : 'Complete the challenge!', '#00ffd6');

        // Calculate difficulty with more balanced progression
        const level = this.game.progression.level;
        const challengeBonus = this.challengesCompleted * 0.15;
        const effectiveLevel = level + challengeBonus;

        // Apply difficulty settings with improved scaling
        this.applyDifficultySettings(effectiveLevel);

        // Clear stale delayed callbacks and transient state from any previous challenge
        this.clearCountdown();
        this.clearTrackedTimeouts();
        this.clearVisualNoise();
        this.clearAllTargets();
        this.resetComboState();

        // Reset challenge state
        // single-player speed challenge should always use a fixed 7 second limit
        // regardless of difficulty level; multiplayer uses the same fairness window
        this.timeLimit = 5.6;
        this.timeRemaining = this.timeLimit;
        this.targetsClicked = 0;
        this.totalTargets = this.targetSettings.count;

        this.challengeUI.classList.toggle('cockpit-mode', !this.isMultiplayer);

        // Initialize combo for PvP
        if (this.isMultiplayer) {
            this.generateCombo(level);
        }

        // Update UI
        this.challengeUI.setAttribute('data-level', level);
        this.difficultyDisplay.textContent = `Level ${level} • ${this.targetSettings.count} targets • ${this.timeLimit.toFixed(1)}s`;

        // Mark active before visual effects so their callbacks are allowed to run.
        if (typeof this.game.setChallengePaused === 'function') {
            this.game.setChallengePaused(true);
        } else {
            this.game.paused = true;
        }
        this.challengeUI.classList.add('active');
        this.isActive = true;

        // Start visual effects
        this.startVisualEffects();

        if (!this.isMultiplayer) {
            this.renderCockpitOverlay(level);
        }

        // Update status
        if (this.isMultiplayer) {
            this.renderComboUI();
            this.updateStatus(`${playerName}: Press the combo in ${this.timeLimit.toFixed(1)}s!`);
        } else {
            const timeText = this.timeLimit.toFixed(1);
            this.updateStatus(`Cockpit lock acquired. Hit ${this.totalTargets} target${this.totalTargets > 1 ? 's' : ''} in ${timeText}s.`);
        }

        this.announcer.textContent = `Speed challenge: ${this.isMultiplayer ? 'Press combo' : 'Click targets'}. Level ${level}.`;

        // Play sound
        this.game.audio.speedChallenge();

        // Start timer
        this.startTimer();

        // Spawn targets only if not in multiplayer
        if (!this.isMultiplayer) {
            this.spawnTargets();
        }
    }

    generateCombo(level) {
        // Combo length starts at 3 and increases with level
        let comboLength = Math.min(12, 3 + Math.floor(level / 2));

        // Special Rule: If both players are at 10, the combo must be exactly 10 keys
        // Using .ai for the right player score as defined in this.game.scores
        console.log(`Checking tiebreaker: Player Score: ${this.game.scores.player}, AI Score: ${this.game.scores.ai}`);
        if (parseInt(this.game.scores.player) === 10 && parseInt(this.game.scores.ai) === 10) {
            console.log("Tiebreaker triggered! Combo length set to 10.");
            comboLength = 10;
        }

        this.targetCombo = [];

        // For Player 1 (wasd), the last key is always 'd'
        // For Player 2 (arrows), the last key is always 'enter'
        const p1Keys = ['w', 'a', 's'];
        const p2Keys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

        const isP1 = (this.activePlayer === 'player');
        const pool = isP1 ? p1Keys : p2Keys;
        const endKey = isP1 ? 'd' : 'enter';

        for (let i = 0; i < comboLength - 1; i++) {
            const randKey = pool[Math.floor(Math.random() * pool.length)];
            this.targetCombo.push(randKey);
        }
        this.targetCombo.push(endKey);
    }

    renderComboUI() {
        this.targetContainer.innerHTML = '';

        const comboHUD = document.createElement('div');
        comboHUD.className = 'combo-hud';

        const title = document.createElement('div');
        title.className = 'combo-title';
        title.textContent = `ENTER SEQUENCE (${this.targetCombo.length}/12)`;
        comboHUD.appendChild(title);

        const comboWrapper = document.createElement('div');
        comboWrapper.className = 'combo-wrapper';

        this.targetCombo.forEach((key, index) => {
            const keyEl = document.createElement('div');
            keyEl.className = 'combo-key';
            keyEl.id = `combo-key-${index}`;

            const idx = document.createElement('span');
            idx.className = 'combo-index';
            idx.textContent = `${index + 1}`;

            const val = document.createElement('span');
            val.className = 'combo-value';
            val.textContent = this.formatKeyName(key);

            keyEl.appendChild(idx);
            keyEl.appendChild(val);

            comboWrapper.appendChild(keyEl);
        });

        comboHUD.appendChild(comboWrapper);
        this.targetContainer.appendChild(comboHUD);
    }

    formatKeyName(key) {
        switch (key) {
            case 'arrowup': return '↑';
            case 'arrowdown': return '↓';
            case 'arrowleft': return '←';
            case 'arrowright': return '→';
            case 'enter': return 'ENTER';
            case 'w': return 'W';
            case 's': return 'S';
            case 'a': return 'A';
            case 'd': return 'D';
            default: return key.toUpperCase();
        }
    }

    handleKeyPress(key) {
        if (!this.isActive || !this.isMultiplayer) return;

        // Normalizing key names for comparison
        let pressedKey = key.toLowerCase();
        if (pressedKey === ' ') pressedKey = 'spacebar';

        const expectedKey = this.targetCombo[this.currentCombo.length];
        console.log(`SpeedChallenge: Pressed ${pressedKey}, Expected ${expectedKey}`);

        if (pressedKey === expectedKey) {
            // Highlight successful key
            const keyEl = document.getElementById(`combo-key-${this.currentCombo.length}`);
            if (keyEl) {
                keyEl.style.backgroundColor = 'rgba(0, 255, 214, 0.9)';
                keyEl.style.borderColor = '#fff';
                keyEl.style.transform = 'scale(1.1)';
                keyEl.style.boxShadow = '0 0 30px #00ffd6';
            }

            this.currentCombo.push(pressedKey);

            // Use a fallback for sound if playTap doesn't exist
            if (this.game.audio && typeof this.game.audio.playTap === 'function') {
                this.game.audio.playTap();
            } else if (this.game.audio && typeof this.game.audio.bounce === 'function') {
                this.game.audio.bounce();
            }

            if (this.currentCombo.length === this.targetCombo.length) {
                // Combo completed
                this.isActive = false; // Prevent further input immediately
                this.trackTimeout(() => this.completeChallenge(true), 100);
            }
        } else {
            // Check if the key belonged to THEIR pool before failing the combo
            const myPool = this.activePlayer === 'player' ? ['w', 'a', 's', 'd'] : ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter'];

            if (myPool.includes(pressedKey)) {
                // Wrong key pressed within their own controls
                this.currentCombo = [];
                // Visual feedback for fail
                const comboWrapper = document.querySelector('.combo-wrapper');
                if (comboWrapper) {
                    comboWrapper.classList.add('combo-fail');
                    this.trackTimeout(() => {
                        comboWrapper.classList.remove('combo-fail');
                        // Reset visuals
                        this.renderComboUI();
                    }, 200);
                }
            }
        }
    }

    applyDifficultySettings(effectiveLevel) {
        if (!this.targetSettings) {
            this.targetSettings = {
                size: 0,
                count: 0,
                timeLimit: 0,
                moveSpeed: 0,
                movingChance: 0,
                specialTargetChance: 0,
                visualNoise: 0,
                targetTypes: ['static']
            };
        }

        // Size decreases with level but with a reasonable minimum
        this.targetSettings.size = Math.max(36, 86 - effectiveLevel * 2.25);

        // Target count increases with level
        this.targetSettings.count = Math.min(10, 2 + Math.floor(effectiveLevel * 0.65));

        // Time limit decreases with level but with a reasonable minimum
        this.targetSettings.timeLimit = Math.max(3, 5 - effectiveLevel * 0.2);

        // Movement starts at moderate level
        this.targetSettings.moveSpeed = effectiveLevel >= 4 ? Math.min(3.4, 0.9 + (effectiveLevel - 4) * 0.35) : 0;
        this.targetSettings.movingChance = Math.min(0.6, Math.max(0.1, 0.06 + effectiveLevel * 0.05));

        // Special targets appear more frequently
        this.targetSettings.specialTargetChance = Math.min(0.22, effectiveLevel * 0.03);

        // Visual noise is now handled with CSS-only intensity states
        this.targetSettings.visualNoise = Math.min(0.6, effectiveLevel * 0.05);

        // Define target types based on level
        this.targetSettings.targetTypes = this.determineTargetTypes(effectiveLevel);
    }

    determineTargetTypes(level) {
        return level >= 3 ? ['static', 'moving'] : ['static'];
    }

    renderCockpitOverlay(level) {
        this.removeCockpitOverlay();

        const hud = document.createElement('div');
        hud.className = 'cockpit-hud';
        hud.innerHTML = `
            <div class="cockpit-panel left">TARGET LINK: ONLINE<br>THREAT LVL: ${level}</div>
            <div class="cockpit-panel right">MODE: SINGLE PILOT<br>WEAPONS: PRIMARY</div>
            <div class="cockpit-bottom">LOCK AND FIRE</div>
        `;

        this.targetContainer.appendChild(hud);
        this.cockpitHUD = hud;
    }

    removeCockpitOverlay() {
        if (this.cockpitHUD && this.cockpitHUD.parentNode) {
            this.cockpitHUD.parentNode.removeChild(this.cockpitHUD);
        }
        this.cockpitHUD = null;
    }

    startVisualEffects() {
        if (this.paused) return;
        // Add visual pulse effect for timer
        this.challengeUI.classList.add('pulse-active');
        if (this.intervals.pulse) clearInterval(this.intervals.pulse);
        this.intervals.pulse = setInterval(() => {
            this.challengeUI.classList.toggle('pulse-highlight');
        }, 650);

        // Add visual noise/distractions
        this.addVisualNoise();
    }

    addVisualNoise() {
        const noiseLevel = this.targetSettings.visualNoise;
        this.clearVisualNoise();

        if (noiseLevel >= 0.45) {
            this.challengeUI.classList.add('visual-intensity');
        }

        if (noiseLevel >= 0.65) {
            this.challengeUI.classList.add('visual-intensity-strong');
        }
    }

    clearVisualNoise() {
        this.distractionElements = [];
        this.challengeUI.classList.remove('visual-intensity', 'visual-intensity-strong');

        if (this.intervals.visualNoise) {
            clearInterval(this.intervals.visualNoise);
            this.intervals.visualNoise = null;
        }

        if (this.intervals.flash) {
            clearInterval(this.intervals.flash);
            this.intervals.flash = null;
        }

        this.clearTrackedTimeouts();

        this.targetContainer.style.transform = 'translate(0, 0)';
    }

    startMovementLoop() {
        if (this.paused) return;
        if (this.intervals.movement) return;
        this.intervals.movement = setInterval(() => this.updateTargetMovement(), 48);
    }

    stopMovementLoop() {
        if (!this.intervals.movement) return;
        clearInterval(this.intervals.movement);
        this.intervals.movement = null;
    }

    updateTargetMovement() {
        if (this.paused || !this.isActive || !this.targetContainer) {
            this.stopMovementLoop();
            return;
        }

        const containerWidth = this.targetContainer.offsetWidth;
        const containerHeight = this.targetContainer.offsetHeight;
        let movingTargets = 0;

        this.activeTargets.forEach(target => {
            if (!target || !target.parentNode || target.classList.contains('clicked') || target.dataset.type !== 'moving') {
                return;
            }

            const state = target._movementState;
            if (!state) {
                return;
            }

            movingTargets++;

            const size = parseFloat(target.dataset.size) || this.targetSettings.size;
            const minX = size + 10;
            const maxX = containerWidth - size - 10;
            const minY = size + 10;
            const maxY = containerHeight - size - 10;

            let newX = state.x;
            let newY = state.y;

            switch (state.pattern) {
                case 'linear': {
                    newX = state.x + Math.cos(state.angle) * state.speed;
                    newY = state.y + Math.sin(state.angle) * state.speed;

                    if (newX <= minX || newX >= maxX) {
                        state.angle = Math.PI - state.angle;
                        newX = Math.max(minX, Math.min(maxX, newX));
                    }

                    if (newY <= minY || newY >= maxY) {
                        state.angle = -state.angle;
                        newY = Math.max(minY, Math.min(maxY, newY));
                    }
                    break;
                }
                case 'arc': {
                    state.time += 0.03;
                    newX = state.originX + Math.cos(state.time) * 50;
                    newY = state.originY + Math.sin(state.time * 1.5) * 30;
                    break;
                }
                case 'bounce': {
                    state.time += 0.03;
                    newX = state.originX + Math.cos(state.time) * 40;
                    newY = state.originY + Math.abs(Math.sin(state.time * 2)) * 30;
                    break;
                }
                case 'zigzag': {
                    state.time += 0.03;
                    newX = state.originX + Math.sin(state.time * 2) * 30;
                    newY = state.originY + state.time * state.speed;
                    break;
                }
                case 'random': {
                    state.changeDirectionCounter++;
                    if (state.changeDirectionCounter > 25) {
                        state.angle = Math.random() * Math.PI * 2;
                        state.changeDirectionCounter = 0;
                    }

                    newX = state.x + Math.cos(state.angle) * state.speed;
                    newY = state.y + Math.sin(state.angle) * state.speed;

                    if (newX <= minX || newX >= maxX) {
                        state.angle = Math.PI - state.angle;
                        newX = Math.max(minX, Math.min(maxX, newX));
                    }

                    if (newY <= minY || newY >= maxY) {
                        state.angle = -state.angle;
                        newY = Math.max(minY, Math.min(maxY, newY));
                    }
                    break;
                }
            }

            newX = Math.max(minX, Math.min(maxX, newX));
            newY = Math.max(minY, Math.min(maxY, newY));

            state.x = newX;
            state.y = newY;

            target.style.left = `${newX}px`;
            target.style.top = `${newY}px`;
        });

        if (movingTargets === 0) {
            this.stopMovementLoop();
        }
    }

    spawnTargets() {
        const fragment = document.createDocumentFragment();
        const spawnedTargets = [];

        // Spawn all targets at once for fair gameplay
        for (let i = 0; i < this.totalTargets; i++) {
            const targetType =
                this.targetSettings.targetTypes.includes('moving') && Math.random() < this.targetSettings.movingChance
                    ? 'moving'
                    : 'static';

            const isSpecial = Math.random() < this.targetSettings.specialTargetChance;
            const target = this.createTarget(i, isSpecial, targetType);
            fragment.appendChild(target);
            spawnedTargets.push(target);
        }

        this.targetContainer.appendChild(fragment);

        spawnedTargets.forEach(target => {
            this.activeTargets.add(target);

            if (target.dataset.type === 'moving') {
                this.startTargetMovement(target);
            }
        });

        // Add visual highlight to first target
        if (this.totalTargets > 0) {
            const firstTarget = this.targetContainer.querySelector('.click-target');
            if (firstTarget) {
                this.trackTimeout(() => {
                    firstTarget.classList.add('first-target');
                    this.trackTimeout(() => firstTarget.classList.remove('first-target'), 1000);
                }, 200);
            }
        }
    }

    createTarget(index, isSpecial, targetType) {
        const target = document.createElement('div');
        target.className = 'click-target';
        target.dataset.index = index;
        target.dataset.special = isSpecial ? 'true' : 'false';
        target.dataset.type = targetType || 'static';

        // Add type-specific classes
        if (targetType === 'moving') {
            target.classList.add('moving-target');
        }

        // Special targets
        if (isSpecial) {
            target.classList.add('special-target');
            target.dataset.glow = 'true';
        }

        target.style.animationDelay = `${index * 35}ms`;

        // Set size with minimum constraint
        const minSize = 36;
        const size = Math.max(minSize, this.targetSettings.size * (isSpecial ? 1.1 : 1));
        target.style.setProperty('--target-size', `${size}px`);
        target.dataset.size = `${size}`;

        // Get container dimensions using offsetWidth/offsetHeight
        const containerWidth = this.targetContainer.offsetWidth;
        const containerHeight = this.targetContainer.offsetHeight;

        // Calculate positions with minimum spacing (as percentages for relative positioning)
        const minX = (size + 10);
        const maxX = containerWidth - size - 10;
        const minY = (size + 10);
        const maxY = containerHeight - size - 10;

        // Generate random position with collision avoidance
        let posX, posY;
        let attempts = 0;
        const maxAttempts = 50;

        do {
            posX = minX + Math.random() * (maxX - minX);
            posY = minY + Math.random() * (maxY - minY);
            attempts++;

            // Check distance from existing targets
            let collision = false;
            this.activeTargets.forEach(existingTarget => {
                const existingX = parseFloat(existingTarget.style.left) || 0;
                const existingY = parseFloat(existingTarget.style.top) || 0;
                const dx = Math.abs(posX - existingX);
                const dy = Math.abs(posY - existingY);
                const minDistance = size + 40; // Increased padding for easier detection

                if (dx < minDistance && dy < minDistance) {
                    collision = true;
                }
            });

            if (!collision || attempts >= maxAttempts) break;
        } while (true);

        // Set position using CSS custom properties for correct centering with translate
        target.style.setProperty('--target-x', `${posX}px`);
        target.style.setProperty('--target-y', `${posY}px`);
        target.style.left = `${posX}px`;
        target.style.top = `${posY}px`;

        // Create target content
        const targetWrapper = document.createElement('div');
        targetWrapper.className = 'target-wrapper';

        let targetHTML = `
    <div class="target-meta">${targetType === 'moving' ? 'MOVING' : 'STATIC'} / ${index + 1}</div>
    <div class="target-outer-ring"></div>
    <div class="target-inner-circle">
        <div class="target-number">${index + 1}</div>
    </div>
`;

        if (isSpecial) {
            targetHTML += '<div class="target-star">★</div>';
        }

        targetWrapper.innerHTML = targetHTML;
        target.appendChild(targetWrapper);

        // Set aria label with type information
        const ariaLabel = `${isSpecial ? 'Special ' : ''}${targetType} target ${index + 1} of ${this.totalTargets}`;

        target.setAttribute('aria-label', ariaLabel);
        target.setAttribute('tabindex', '0');
        target.setAttribute('role', 'button');

        // Event listeners
        target.addEventListener('click', (e) => this.handleTargetClick(e, target));
        target.addEventListener('keydown', (e) => this.handleTargetKeydown(e, target));

        // Add hover effect
        target.addEventListener('mouseenter', () => {
            if (!target.classList.contains('clicked')) {
                target.classList.add('hover');
            }
        });

        target.addEventListener('mouseleave', () => {
            target.classList.remove('hover');
        });

        return target;
    }

    startTargetMovement(target) {
        const movementPatterns = ['linear', 'arc', 'bounce', 'zigzag', 'random'];
        const pattern = movementPatterns[Math.floor(Math.random() * movementPatterns.length)];

        const startX = parseFloat(target.style.left);
        const startY = parseFloat(target.style.top);
        const speed = this.targetSettings.moveSpeed * 1.2;

        target._movementState = {
            pattern,
            originX: startX,
            originY: startY,
            x: startX,
            y: startY,
            angle: Math.random() * Math.PI * 2,
            speed,
            time: Math.random() * Math.PI * 2,
            changeDirectionCounter: 0
        };

        target.style.transition = 'left 0.16s linear, top 0.16s linear, transform 0.18s ease, opacity 0.18s ease';
        target.style.willChange = 'left, top, transform';

        this.startMovementLoop();
    }

    handleTargetClick(event, target) {
        if (this.paused) return;
        event.preventDefault();
        event.stopPropagation();
        this.targetHit(target);
    }

    handleTargetKeydown(event, target) {
        if (this.paused) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            event.stopPropagation();
            this.targetHit(target);
        }
    }

    targetHit(target) {
        if (this.paused || !this.isActive || !this.activeTargets.has(target) || target.classList.contains('clicked')) {
            return;
        }

        // Mark as clicked
        target.classList.add('clicked');
        target.classList.remove('hover');

        // Visual feedback
        const isSpecial = target.dataset.special === 'true';
        const targetType = target.dataset.type;

        // Update combo
        this.combo++;
        if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
        }

        // Update progress
        this.targetsClicked++;

        // Update status
        const remaining = this.totalTargets - this.targetsClicked;
        this.updateStatus(`${remaining} target${remaining !== 1 ? 's' : ''} remaining!`);

        // Accessibility announcement
        this.announcer.textContent = `Target ${this.targetsClicked} of ${this.totalTargets} hit. ${remaining} remaining.`;

        // Play appropriate sound
        if (isSpecial) {
            this.game.audio.specialTarget?.();
            target.classList.add('special-hit');
        } else {
            this.game.audio.hit?.(this.combo);
        }

        // Award points on hit in multiplayer
        if (this.game.isMultiplayer) {
            this.game.scores[this.activePlayer] += 1;
            this.game.updateScoreUI();
        }

        // Clear all intervals for this target
        this.clearTargetIntervals(target);

        // Remove target after delay
        this.trackTimeout(() => {
            if (target.parentNode) {
                target.parentNode.removeChild(target);
            }
            this.activeTargets.delete(target);
        }, 300);

        // Check for completion
        if (this.targetsClicked >= this.totalTargets) {
            this.completeChallenge(true);
        }
    }

    clearTargetIntervals(target) {
        if (target.intervals && target.intervals.movement) {
            clearInterval(target.intervals.movement);
            target.intervals.movement = null;
        }

        target._movementState = null;
        target.style.willChange = 'auto';
    }

    updateTimer() {
        if (!this.isActive || this.paused) return;

        if (this.countdownState) {
            this.advanceCountdownState(30);
            return;
        }

        if (this.transitionState) {
            this.advanceTransitionState(30);
            return;
        }

        // Validate required elements exist
        if (!this.timerFill) {
            console.warn('[SpeedChallenge] timerFill element not found');
            return;
        }

        // Decrement timer (called every 30ms, so reduce by 0.03)
        this.timeRemaining -= 0.03;

        // Ensure time doesn't go negative
        if (this.timeRemaining < 0) {
            this.timeRemaining = 0;
        }

        // Calculate progress percentage
        const pct = Math.max(0, this.timeRemaining / this.timeLimit) * 100;

        // Update progress bar width
        this.timerFill.style.transition = 'width 0.05s linear, background-color 0.3s ease';
        this.timerFill.style.width = `${pct}%`;

        // Visual time warnings with color changes
        if (this.timeRemaining <= 1) {
            this.timerFill.style.background = '#ff0000';
            this.timerFill.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8)';

            // Warning pulse
            if (Math.floor(this.timeRemaining * 20) % 2 === 0) {
                this.challengeUI.classList.add('time-warning');
            } else {
                this.challengeUI.classList.remove('time-warning');
            }

            this.game.audio.heartbeatFast?.();
        } else if (this.timeRemaining <= 2) {
            this.timerFill.style.background = '#ff4444';
            this.timerFill.style.boxShadow = '0 0 15px rgba(255, 68, 68, 0.6)';
            this.updateStatus('Time running out!');
        } else if (this.timeRemaining <= 3) {
            this.timerFill.style.background = '#ffaa33';
            this.timerFill.style.boxShadow = '0 0 10px rgba(255, 170, 51, 0.4)';
        } else {
            this.timerFill.style.background = 'linear-gradient(90deg, #4bc8ff, #007aff, #4bc8ff)';
            this.timerFill.style.boxShadow = '0 0 15px rgba(75, 200, 255, 0.8), 0 0 30px rgba(0, 122, 255, 0.4)';
        }

        // Update time display text using cached property
        if (this.timeDisplay) {
            this.timeDisplay.textContent = Math.max(0, this.timeRemaining).toFixed(1) + 's';
        }

        // Check if time is up
        if (this.timeRemaining <= 0) {
            this.completeChallenge(false);
        }
    }

    updateStatus(message) {
        if (this.status) {
            this.status.textContent = message;
            this.status.classList.add('status-update');
            this.trackTimeout(() => this.status.classList.remove('status-update'), 300);
        }
    }

    serveBall() {
        // Reset ball to center
        this.game.ball.pos.x = this.game.width / 2;
        this.game.ball.pos.y = this.game.height / 2;

        // Calculate direction based on who scored last
        const direction = this.game.scores.player > this.lastPlayerScore ? 1 : -1;

        // Reset with moderate speed
        const speed = 8;
        this.game.ball.vel.x = direction * speed;
        this.game.ball.vel.y = (Math.random() - 0.5) * speed * 0.3;
    }

    completeChallenge(success) {
        if (!this.isActive && !success) return; // Allow success to finish even if isActive was flipped early

        // Store current score
        this.lastPlayerScore = this.game.scores.player;

        // Clear intervals
        this.clearTimer();
        if (this.intervals.pulse) {
            clearInterval(this.intervals.pulse);
            this.intervals.pulse = null;
        }

        // Add transition properties to the UI right before hiding
        this.challengeUI.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.4, 0, 1, 1)';

        this.challengeUI.classList.remove('pulse-active', 'pulse-highlight', 'time-warning');

        // Clear all targets and effects
        this.clearAllTargets();
        this.clearVisualNoise();

        if (success) {
            // In single-player, a chance to flip the previously awarded rally point instead
            if (!this.game.isMultiplayer) {
                const info = this.game.speedChallenge?.lastScoreChange;
                if (info && info.scorer === 'ai') {
                    const pts = info.points || 1;
                    // take back the AI point(s) and give them to the player
                    this.game.scores.ai = Math.max(0, this.game.scores.ai - pts);
                    this.game.scores.player += pts;
                    this.game.showNotification('Challenge Complete!', `Point reversed to you!`, '#4CAF50');
                } else if (info && info.scorer === 'player') {
                    const pts = info.points || 1;
                    this.game.scores.player = Math.max(0, this.game.scores.player - pts);
                    this.game.scores.ai += pts;
                    this.game.showNotification('Challenge Complete!', `Point reversed to AI!`, '#4CAF50');
                } else {
                    // fallback: award single point to player
                    this.game.scores.player += 1;
                    this.game.showNotification('Challenge Complete!', '+1 point', '#4CAF50');
                }
            } else {
                // Multiplayer behaves like before
                if (this.game.scores.player === 10 && this.game.scores.ai === 10) {
                    // tiebreaker: successful challenge gives point to the opponent (activePlayer)
                    this.game.scores[this.activePlayer] += 1;
                    const playerName = this.activePlayer === 'player' ? 'Player 1' : 'Player 2';
                    this.game.showNotification('Tiebreaker!', `${playerName} wins the point!`, '#4CAF50');
                } else {
                    this.game.scores[this.activePlayer] += 1;
                    const playerName = this.activePlayer === 'player' ? 'Player 1' : 'Player 2';
                    this.game.showNotification('Combo Cleared!', `${playerName} scores 1 point!`, '#4CAF50');
                }
            }
            this.challengesCompleted++;
            if (!this.game.isMultiplayer && this.game.progression) {
                this.game.progression.recordSpeedChallenge();
            }

            // Play success sound
            this.game.audio.speedChallengeSuccess?.();
            this.announcer.textContent = 'Challenge completed!';
        } else {
            // failure: in single-player do not add extra points, AI already got rally point
            if (this.game.isMultiplayer) {
                const opponent = this.activePlayer === 'player' ? 'ai' : 'player';
                this.game.scores[opponent] += 1; // 1 point for fail

                // If opponent now has max score, trigger game over
                if (this.game.scores[opponent] >= this.game.maxScore) {
                    const opponentName = opponent === 'player' ? 'Player 1' : 'Player 2';
                    this.game.showNotification('Sudden Death Fail!', `${opponentName} Wins!`, '#ff4444');
                } else {
                    const opponentName = opponent === 'player' ? 'Player 1' : 'Player 2';
                    this.game.showNotification('Time\'s Up!', `${opponentName} scores 1 point!`, '#ff4444');
                }
            } else {
                // single-player: already gave AI the rally point, just show message
                this.game.audio.speedChallengeFail?.();
                this.game.showNotification('Time\'s Up!', 'AI keeps the point', '#ff4444');
            }
            this.announcer.textContent = 'Challenge failed! Time ran out.';
        }


        this.game.updateScoreUI();

        // clear stored score info once used
        this.lastScoreChange = null;

        // If the game should end (score >= 11), end it after updating scores
        if (this.game.scores.player >= this.game.maxScore || this.game.scores.ai >= this.game.maxScore) {
            this.terminateChallenge('match-end');
            // Force match end logic via updateScoreUI which already handles terminal state triggers
            this.game.updateScoreUI();
            // Don't restart ball serve if game is over
            return;
        }

        // Show "Get Ready!" countdown before resuming
        this.startResurrectionCountdown();
    }

    startResurrectionCountdown() {
        this.targetContainer.innerHTML = '';
        this.challengeUI.classList.remove('transitioning-out');
        document.body.classList.remove('speed-transforming');
        const countdownEl = document.createElement('div');
        countdownEl.className = 'resurrection-countdown';
        countdownEl.style.fontSize = '6rem';
        countdownEl.style.fontWeight = 'bold';
        countdownEl.style.color = '#fff';
        countdownEl.style.textShadow = '0 0 20px #4bc8ff';
        countdownEl.style.animation = 'getReadyIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        this.targetContainer.appendChild(countdownEl);

        this.clearCountdown();
        this.isActive = true;
        this.countdownState = {
            remainingMs: 2400,
            element: countdownEl,
            lastStage: null
        };
        this.transitionState = null;
        this.startTimer();
        this.advanceCountdownState(0);
    }

    finalizeChallengeTransition() {
        this.challengeUI.classList.add('transitioning-out');
        document.body.classList.add('speed-transforming');
        this.transitionState = { remainingMs: 800 };
        if (!this.intervals.timer && this.isActive) {
            this.startTimer();
        }
    }

    advanceCountdownState(deltaMs) {
        if (!this.countdownState || !this.countdownState.element) return;

        this.countdownState.remainingMs = Math.max(0, this.countdownState.remainingMs - deltaMs);

        let stage = 'ready';
        let label = 'GET READY';
        if (this.countdownState.remainingMs <= 800) {
            stage = 'one';
            label = '1';
        } else if (this.countdownState.remainingMs <= 1600) {
            stage = 'two';
            label = '2';
        }

        if (this.countdownState.lastStage !== stage) {
            this.countdownState.element.textContent = label;
            this.countdownState.element.style.animation = 'none';
            void this.countdownState.element.offsetWidth;
            this.countdownState.element.style.animation = 'countPulse 0.4s ease-out';
            if (stage !== 'ready') {
                this.game.audio.playTick?.();
            }
            this.countdownState.lastStage = stage;
        }

        if (this.countdownState.remainingMs <= 0) {
            this.countdownState = null;
            this.finalizeChallengeTransition();
        }
    }

    advanceTransitionState(deltaMs) {
        if (!this.transitionState) return;

        this.transitionState.remainingMs = Math.max(0, this.transitionState.remainingMs - deltaMs);
        if (this.transitionState.remainingMs > 0) return;

        this.transitionState = null;
        this.clearTimer();
        this.challengeUI.classList.remove('active', 'transitioning-out');
        document.body.classList.remove('speed-transforming');
        // Removed redundant transform/opacity resets that might conflict with animation completion
        if (typeof this.game.setChallengePaused === 'function') {
            this.game.setChallengePaused(false);
        } else {
            this.game.paused = false;
        }
        this.isActive = false;
        this.serveBall();
    }

    cancelChallenge() {
        if (!this.isActive) return;

        this.lastPlayerScore = this.game.scores.player;

        this.clearTimer();
        this.clearCountdown();
        this.countdownState = null;
        this.transitionState = null;
        document.body.classList.remove('speed-transforming');
        if (this.intervals.pulse) {
            clearInterval(this.intervals.pulse);
            this.intervals.pulse = null;
        }

        this.isActive = false;
        if (typeof this.game.setChallengePaused === 'function') {
            this.game.setChallengePaused(false);
        } else {
            this.game.paused = false;
        }
        this.challengeUI.classList.remove('active', 'pulse-active', 'pulse-highlight', 'time-warning');

        this.clearAllTargets();
        this.clearVisualNoise();
        this.resetComboState();

        // Award 1 point to AI for cancellation
        this.game.scores.ai += 1;
        this.game.updateScoreUI();
        this.game.showNotification('Challenge Cancelled', 'AI scores 1 point', '#ffaa33');
        this.announcer.textContent = 'Challenge cancelled. AI scores 1 point.';

        this.serveBall();
    }

    terminateChallenge(reason = 'cleanup') {
        this.clearTimer();
        this.clearCountdown();
        this.countdownState = null;
        this.transitionState = null;
        if (this.intervals.pulse) {
            clearInterval(this.intervals.pulse);
            this.intervals.pulse = null;
        }

        this.isActive = false;
        this.challengeUI.classList.remove('active', 'pulse-active', 'pulse-highlight', 'time-warning', 'cockpit-mode');
        this.challengeUI.style.transition = '';
        this.challengeUI.style.transform = '';
        this.challengeUI.style.opacity = '';

        this.clearAllTargets();
        this.clearVisualNoise();
        this.removeCockpitOverlay();
        this.resetComboState();

        if (reason === 'match-end') {
            this.updateStatus('Speed challenge disengaged. Match complete.');
        }
    }

    resetComboState() {
        this.currentCombo = [];
        this.targetCombo = [];
        this.combo = 0;
        this.maxCombo = 0;
    }

    clearAllTargets() {
        // Clear timer intervals for all targets
        this.activeTargets.forEach(target => {
            this.clearTargetIntervals(target);
        });

        this.targetContainer.innerHTML = '';
        this.activeTargets.clear();
        this.stopMovementLoop();
        this.removeCockpitOverlay();
    }

    setupEventListeners() {
        this.eventHandlers.keydown = (e) => {
            if (this.game?.userPaused) return;
            if (this.isActive) {
                if (this.isMultiplayer) {
                    this.handleKeyPress(e.key);
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (confirm('Cancel the speed challenge? Opponent will score 1 point.')) {
                        this.cancelChallenge();
                    }
                }
            }
        };
        document.addEventListener('keydown', this.eventHandlers.keydown);

        this.eventHandlers.resize = () => {
            if (this.isActive && this.activeTargets.size > 0) {
                // Reposition targets within bounds using offsetWidth/offsetHeight
                const containerWidth = this.targetContainer.offsetWidth;
                const containerHeight = this.targetContainer.offsetHeight;
                const currentTargets = Array.from(this.activeTargets);

                currentTargets.forEach(target => {
                    const size = parseFloat(target.dataset.size) || this.targetSettings.size;
                    const minX = size + 10;
                    const maxX = Math.max(minX, containerWidth - size - 10);
                    const minY = size + 10;
                    const maxY = Math.max(minY, containerHeight - size - 10);
                    const currentX = parseFloat(target.style.left);
                    const currentY = parseFloat(target.style.top);

                    if (Number.isFinite(currentX)) {
                        target.style.left = `${Math.max(minX, Math.min(maxX, currentX))}px`;
                    }
                    if (Number.isFinite(currentY)) {
                        target.style.top = `${Math.max(minY, Math.min(maxY, currentY))}px`;
                    }
                });
            }
        };
        window.addEventListener('resize', this.eventHandlers.resize);
    }

    destroy() {
        this.clearAllTargets();
        this.clearVisualNoise();
        this.clearTimer();
        this.clearCountdown();
        this.clearTrackedTimeouts();
        if (this.intervals.pulse) clearInterval(this.intervals.pulse);
        document.removeEventListener('keydown', this.eventHandlers.keydown);
        window.removeEventListener('resize', this.eventHandlers.resize);
    }
}
