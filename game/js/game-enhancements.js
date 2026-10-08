
(() => {
    'use strict';

    // ==================================================================
    // FULL AIController CLASS — ENHANCED WITH DOUBLE LINES & MEMES
    // ==================================================================
    class AIController {
        constructor(paddle, ball, canvasW, canvasH, diff = 2) {
            this.paddle = paddle;
            this.ball = ball;
            this.canvasW = canvasW;
            this.canvasH = canvasH;
            this.setDifficulty(diff);
            this.smoothing = 0.14;
            this.predictedY = paddle.pos.y + paddle.h / 2;
            this.lastTime = 0;
            this.performance = 0.5;
            this.adaptationRate = 0.01;
            this.personality = this.generatePersonality();

            this.memory = []; this.memorySize = 10;
            this.powerUpAwareness = 0.7;
            this.strategicThinking = 0.5;
            this.mistakeChance = 0.05;
            this.reactionDelay = 0;
            this.targetPowerUp = null;
            this.lastDecisionTime = 0;
            this.decisionInterval = 500;
            this.gameState = { playerScore: 0, aiScore: 0, rallyCount: 0 };

            this.lastTauntTime = 0;
            this.tauntCooldown = 9000;
            this.currentTaunt = "";
            this.tauntFadeTime = 0;

            this.lastLineTriggeredTime = 0;
            this.lineCooldown = 2000;
            this.nextTauntAllowedAt = 0;
            this.nextObservationAt = 0;
            this.pendingTauntToSpeak = null;
            this.voiceInitRequested = false;

            this.unpredictability = 0.2;
            this.lastUnpredictableAction = 0;
            this.unpredictableActionInterval = 3000;

            this.matchUsedLines = new Set();
            this.recentlyUsedTaunts = [];
            this.maxRecentTaunts = 100;

            this.recentTauntsByCategory = new Map();
            this.maxRecentPerCategory = 20;
            this.saidTauntsByCategory = new Map();
            this.maxSaidTauntsPerCategory = 500;

            this.ballVelocity = { x: 0, y: 0 };
            this.paddlePosition = 0;
            this.distanceFromBall = 0;
            this.lastAnnouncedSpeedBand = 'normal';
            this.lastPressureState = false;
            this.nextTrackingUpdate = 0;
            this.idleTargetY = canvasH * 0.5;

            this.linePerformance = {};
            this.contextHistory = [];
            this.maxContextHistory = 50;
            this.lineSuccessThreshold = 0.6;
            this.mistakesSinceLastAIScore = 0;
            this.consecutiveAIScores = 0;
            this.consecutivePlayerScores = 0;
            this.lastWasPlayerMissing = false;
            this.lastRallyLength = 0;
            this.dominanceMomentum = 0;
            this.speedJustSpiked = false;
            this.edgeShotDetected = false;
            this.lastShotType = 'normal';

            this.initialPersonality = { ...this.personality };
            this.personalityLastEvolveTime = 0;
            this.personalityEvolveInterval = 5000;

            this.matchStartTime = 0;
            this.hasShownFirstBlood = false;
            this.hasShownMatchEnd = false;
            this.consecutiveMatchPointSaves = 0;

            this.tauntTemplates = {
                ai_score: [
                    "Analyzing {skill}... Efficiency at {slowthing}%. ERROR: Success accidental.",
                    "Score update: Logic dictates my {badcomparison}. Wait, what is logic?",
                    "I have observed better {aspect} at {place}. I am a very good bot.",
                    "Your {technique} is {action} my processors. Powering down... just kidding."
                ],
                player_score: [
                    "Anomalous result. Calculation error: {lucktype}. I meant to let you win.",
                    "Unexpected {unexpected} detected. recalibrating... please do not hit me.",
                    "External variable {excuse} identified. I blame the wind. Indoors."
                ],
                general: [
                    "Environmental status: {adjective}. I think I saw a bird.",
                    "User input device {modifier} status: Nominal. My paddle feels funny."
                ]
            };

            this.wordBanks = {
                skill: ['trajectory', 'response time', 'input vector', 'strategy'],
                slowthing: ['40', '15', '5', '0.01'],
                badcomparison: ['superiority', 'optimal path', 'victory sequence', 'calculation'],
                aspect: ['data points', 'return patterns', 'tactical shifts', 'user inputs'],
                place: ['sector 7', 'the laboratory', 'base sequence', 'the mainframe'],
                technique: ['serve', 'strike', 'return', 'block'],
                action: ['overloading', 'stressing', 'testing', 'prodding'],
                lucktype: ['probability shift', 'statistical outlier', 'environmental glitch', 'random variance'],
                unexpected: ['vector shift', 'timing offset', 'bounce anomaly', 'input spike'],
                excuse: ['physics engine', 'latency', 'interference', 'entropy'],
                adjective: ['stable', 'optimal', 'standard', 'processing'],
                modifier: ['current', 'active', 'detected', 'peripheral']
            };

        }

        generatePersonality() {
            const personalities = [
                { name: 'Defensive', aggression: 0.3, precision: 0.8, consistency: 0.9, powerUpPreference: 'shield', riskTolerance: 0.2, adaptationSpeed: 0.8, playStyle: 'wait-and-see', tone: 'calm' },
                { name: 'Aggressive', aggression: 0.8, precision: 0.6, consistency: 0.7, powerUpPreference: 'powerShot', riskTolerance: 0.8, adaptationSpeed: 1.2, playStyle: 'all-out-attack', tone: 'cocky' },
                { name: 'Balanced', aggression: 0.5, precision: 0.7, consistency: 0.8, powerUpPreference: 'multiBall', riskTolerance: 0.5, adaptationSpeed: 1.0, playStyle: 'adaptive', tone: 'chill' },
                { name: 'Tricky', aggression: 0.6, precision: 0.9, consistency: 0.6, powerUpPreference: 'chaosMode', riskTolerance: 0.9, adaptationSpeed: 1.5, playStyle: 'unconventional', tone: 'sneaky' },
                { name: 'Wall', aggression: 0.2, precision: 0.95, consistency: 0.95, powerUpPreference: 'bigPaddle', riskTolerance: 0.1, adaptationSpeed: 0.5, playStyle: 'impenetrable', tone: 'stoic' }
            ];
            const p = personalities[Math.floor(Math.random() * personalities.length)];
            p.aggression += (Math.random() - 0.5) * 0.12;
            p.precision += (Math.random() - 0.5) * 0.12;
            p.consistency += (Math.random() - 0.5) * 0.12;
            p.aggression = Math.max(0.1, Math.min(1.0, p.aggression));
            p.precision = Math.max(0.1, Math.min(1.0, p.precision));
            p.consistency = Math.max(0.1, Math.min(1.0, p.consistency));
            return p;
        }

        setDifficulty(d) {
            this.difficulty = d;
            this.reaction = [0.5, 0.35, 0.2, 0.1, 0.05][d];
            this.maxSpeedMul = [0.8, 0.95, 1.1, 1.3, 1.6][d];
            this.inaccuracy = [0.25, 0.15, 0.08, 0.04, 0.01][d];
            this.predictionSteps = [30, 60, 100, 140, 200][d];
            this.strategicThinking = [0.2, 0.4, 0.6, 0.8, 0.95][d];
            this.powerUpAwareness = [0.3, 0.5, 0.7, 0.85, 0.98][d];
            this.mistakeChance = [0.18, 0.12, 0.06, 0.02, 0.005][d];
            this.unpredictability = [0.08, 0.14, 0.22, 0.30, 0.40][d];
        }

        canTriggerLine() {
            const now = Date.now();
            return now - this.lastLineTriggeredTime >= this.lineCooldown && now >= this.nextTauntAllowedAt;
        }

        isPvPMatch() {
            return !!(window.game && window.game.isMultiplayer);
        }

        suppressTauntsForPvP() {
            this.currentTaunt = "";
            this.pendingTauntToSpeak = null;
            if ('speechSynthesis' in window && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        }

        getCategoryCooldown(category = 'general') {
            const ranges = {
                ai_score: [5200, 9000],
                player_score: [6500, 11000],
                comeback: [5000, 8500],
                domination_streak: [4500, 8000],
                pressure: [7000, 12000],
                close_call: [7000, 12000],
                long_rally: [8000, 14000],
                general: [12000, 22000],
                live_observation: [11000, 20000]
            };
            const [min, max] = ranges[category] || ranges.general;
            return min + Math.random() * (max - min);
        }

        shouldTauntOnScore(type) {
            return true;
        }

        getSaidTauntsForCategory(category = 'general') {
            if (!this.saidTauntsByCategory.has(category)) {
                this.saidTauntsByCategory.set(category, []);
            }
            return this.saidTauntsByCategory.get(category);
        }

        pickFreshRandomTaunt(category, candidates = []) {
            const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
            if (uniqueCandidates.length === 0) return null;

            if (!this.matchUsedLines) this.matchUsedLines = new Set();

            const availableThisMatch = uniqueCandidates.filter(line => !this.matchUsedLines.has(line));

            let finalPool = availableThisMatch;
            if (finalPool.length === 0) {
                console.warn(`AIController: Ran out of unique lines for ${category}, resetting match memory.`);
                this.matchUsedLines.clear();
                finalPool = uniqueCandidates;
            }

            const said = this.getSaidTauntsForCategory(category);
            let available = finalPool.filter(line => !said.includes(line));

            if (available.length === 0) {
                said.length = 0;
                available = finalPool.slice();
            }

            const selected = available[Math.floor(Math.random() * available.length)];

            this.matchUsedLines.add(selected);

            said.push(selected);
            if (said.length > this.maxSaidTauntsPerCategory) {
                said.shift();
            }
            return selected;
        }

        getLiveObservationType(ballMovingToAI, ballSpeed, pressureNow) {
            if (pressureNow && ballMovingToAI && ballSpeed > 430 && Math.random() < 0.45) return 'incoming_missile';
            if (pressureNow && Math.random() < 0.28) return 'defensive_scramble';
            if (this.gameState.rallyCount > 12 && this.gameState.rallyCount % 6 === 0 && Math.random() < 0.3) return 'rally_building';
            if (ballSpeed > 420 && Math.random() < 0.2) return 'speed_up';
            return null;
        }

        triggerTaunt(message, category = 'general', force = false) {
            if (window.game && window.game.gameMode === 'zombie') return;
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            if (!message || !String(message).trim()) return;

            const now = Date.now();
            const isScoreMoment = category === 'ai_score' || category === 'player_score';
            if (!force) {
                if (isScoreMoment) {
                    if (now - this.lastTauntTime < 15000) return;
                } else {
                    if (now - this.lastTauntTime < 25000 || now < this.nextTauntAllowedAt) return;
                }
            }

            if (!this.recentTauntsByCategory.has(category)) {
                this.recentTauntsByCategory.set(category, new Set());
            }
            const recentInCat = this.recentTauntsByCategory.get(category);
            if (!force && recentInCat.has(message)) return;

            this.currentTaunt = message;
            this.tauntFadeTime = now + 4000;
            this.lastTauntTime = now;
            this.lastLineTriggeredTime = now;
            this.nextTauntAllowedAt = now + (isScoreMoment ? 12000 : this.getCategoryCooldown(category) * 1.5);

            if (category === 'general' || category === 'live_observation') {
                this.nextObservationAt = now + this.getCategoryCooldown('live_observation') * 1.5;
            }

            if (!this.recentlyUsedTaunts.includes(message)) {
                this.recentlyUsedTaunts.push(message);
                if (this.recentlyUsedTaunts.length > this.maxRecentTaunts) this.recentlyUsedTaunts.shift();
            }

            recentInCat.add(message);
            if (recentInCat.size > this.maxRecentPerCategory) {
                const oldest = [...recentInCat][0];
                recentInCat.delete(oldest);
            }

            this.speakTaunt(message);
        }

        speakTaunt(text) {
            if (window.game && window.game.gameMode === 'zombie') return;
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            if (!('speechSynthesis' in window) || !window.speechSynthesis) return;
            if (!text || !text.trim()) return;

            const synth = window.speechSynthesis;
            const speakNow = (line) => {
                try {
                    if (synth.paused) synth.resume();
                    synth.cancel();
                    const utterance = new SpeechSynthesisUtterance(line);
                    utterance.rate = 1.05;
                    utterance.pitch = 1.0;
                    utterance.volume = 0.8;
                    const voices = synth.getVoices();
                    if (voices && voices.length > 0) {
                        const preferredVoice = voices.find(v => (v.name.includes('Zira') || v.name.includes('Google') || v.name.includes('Samantha')) && /^en/i.test(v.lang)) || voices[0];
                        utterance.voice = preferredVoice;
                        if (preferredVoice?.lang) utterance.lang = preferredVoice.lang;
                    } else {
                        utterance.lang = 'en-US';
                    }
                    synth.speak(utterance);
                } catch (err) {
                    console.warn('Speech synthesis failed:', err);
                }
            };

            const voices = synth.getVoices();
            if ((!voices || voices.length === 0) && !this.voiceInitRequested) {
                this.voiceInitRequested = true;
                this.pendingTauntToSpeak = text;
                synth.onvoiceschanged = () => {
                    if (this.pendingTauntToSpeak) {
                        const pending = this.pendingTauntToSpeak;
                        this.pendingTauntToSpeak = null;
                        speakNow(pending);
                    }
                };
                setTimeout(() => {
                    if (this.pendingTauntToSpeak) {
                        const pending = this.pendingTauntToSpeak;
                        this.pendingTauntToSpeak = null;
                        speakNow(pending);
                    }
                }, 180);
                return;
            }
            speakNow(text);
        }

        updateGameState(state) {
            if (state) {
                this.gameState.playerScore = state.playerScore || 0;
                this.gameState.aiScore = state.aiScore || 0;
                this.gameState.rallyCount = state.rallyCount || 0;
            }
        }

        checkForComebackMoment() {
            const diff = this.gameState.aiScore - this.gameState.playerScore;
            if (this.consecutiveAIScores >= 3 && diff > -2 && !this.recentlyUsedTaunts.includes("comeback")) {
                const line = this.getTaunt({ type: 'comeback' });
                this.recordContextPerformance({ type: 'comeback', streak: this.consecutiveAIScores }, line, true);
                this.triggerTaunt(line, 'comeback');
            }
        }

        checkForDominationStreak() {
            if (this.consecutiveAIScores >= 4) {
                const line = this.getTaunt({ type: 'domination_streak' });
                this.recordContextPerformance({ type: 'domination_streak', streak: this.consecutiveAIScores }, line, true);
                if (!this.recentlyUsedTaunts.includes(line)) {
                    this.triggerTaunt(line, 'domination_streak');
                }
            }
        }

        recordContextPerformance(context, line, didItLand) {
            const contextKey = JSON.stringify(context);
            if (!this.linePerformance[contextKey]) this.linePerformance[contextKey] = {};
            if (!this.linePerformance[contextKey][line]) this.linePerformance[contextKey][line] = { success: 0, total: 0 };
            this.linePerformance[contextKey][line].total++;
            if (didItLand) this.linePerformance[contextKey][line].success++;

            this.contextHistory.push({ context: contextKey, line, timestamp: Date.now() });
            if (this.contextHistory.length > this.maxContextHistory) this.contextHistory.shift();

            const perf = this.linePerformance[contextKey][line];
            if (perf.total > 5 && perf.success / perf.total < 0.4) {
                const newVariation = this.generateVariation(line, context.type);
                if (newVariation) this.linePerformance[contextKey][newVariation] = { success: 0, total: 0 };
            }
        }

        generateVariation(originalLine, category) {
            const words = originalLine.split(' ');
            const indexToReplace = Math.floor(Math.random() * words.length);
            const word = words[indexToReplace].toLowerCase().replace(/[.,!?]/g, '');
            for (const bankKey in this.wordBanks) {
                if (this.wordBanks[bankKey].some(w => w.toLowerCase().includes(word))) {
                    const alternatives = this.wordBanks[bankKey].filter(w => w.toLowerCase() !== word);
                    if (alternatives.length > 0) {
                        const newWord = alternatives[Math.floor(Math.random() * alternatives.length)];
                        words[indexToReplace] = newWord;
                        return words.join(' ');
                    }
                }
            }
            return null;
        }

        getPreferredLinesForContext(context, baseLinesToScoreFrom) {
            const contextKey = JSON.stringify(context);
            if (!this.linePerformance[contextKey]) return baseLinesToScoreFrom;
            const scored = baseLinesToScoreFrom.map(line => {
                const perf = this.linePerformance[contextKey][line];
                if (!perf || perf.total === 0) return { line, score: 0.5 };
                return { line, score: perf.success / perf.total };
            });
            scored.sort((a, b) => {
                const scoreWeight = (b.score - a.score) * 1.6;
                const randomWeight = (Math.random() - 0.5) * 0.4;
                return scoreWeight + randomWeight;
            });
            return scored.map(s => s.line);
        }

        getContextFingerprint(context) {
            const scoreDiff = this.gameState.aiScore - this.gameState.playerScore;
            const scoreBand = Math.floor(scoreDiff / 3) * 3;
            const rallyBand = Math.min(20, Math.floor(this.gameState.rallyCount / 4) * 4);
            const ballSpeed = context.ballSpeed || Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
            const speedBand = ballSpeed > 480 ? 'veryfast' : ballSpeed > 380 ? 'fast' : 'normal';
            const momentumLevel = `${Math.sign(this.dominanceMomentum)}${Math.min(3, Math.floor(Math.abs(this.dominanceMomentum) / 3))}`;
            return [
                context.type || 'general',
                `scoreDiff:${scoreBand}`,
                `rally:${rallyBand}`,
                `speed:${speedBand}`,
                `momentum:${momentumLevel}`,
                context.streak ? `streak:${context.streak}` : ''
            ].filter(Boolean).join('|');
        }

        evolvePersonality() {
            const now = Date.now();
            if (now - this.personalityLastEvolveTime < this.personalityEvolveInterval) return;
            this.personalityLastEvolveTime = now;
            if (this.consecutiveAIScores >= 5) {
                this.personality.aggression = Math.min(1.0, this.personality.aggression + 0.08);
                this.personality.tone = 'cocky';
            }
            if (this.consecutivePlayerScores >= 4) {
                this.personality.aggression = Math.max(0.2, this.personality.aggression - 0.10);
                if (this.personality.aggression < 0.45) this.personality.tone = 'salty';
            }
            if (this.consecutiveAIScores < 2 && this.consecutivePlayerScores < 2) {
                this.personality.aggression = this.initialPersonality.aggression;
                this.personality.tone = this.initialPersonality.tone;
            }
        }

        checkForRareEvents() {
            if (this.gameState.aiScore === 5 && this.gameState.playerScore === 0 && !this.hasShownFirstBlood && this.canTriggerLine()) {
                this.hasShownFirstBlood = true;
                const line = this.getTaunt({ type: 'first_blood' });
                this.triggerTaunt(line, 'first_blood');
                return;
            }
            if (this.ballVelocity && Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2) < 80 &&
                this.distanceFromBall < this.canvasW * 0.3 && Math.random() < 0.4 && this.canTriggerLine()) {
                const line = this.getTaunt({ type: 'easy_miss' });
                this.triggerTaunt(line, 'easy_miss');
                return;
            }
            if (this.edgeShotDetected && Math.random() < 0.35 && this.canTriggerLine()) {
                const line = this.getTaunt({ type: 'lucky_bounce' });
                this.triggerTaunt(line, 'lucky_bounce');
                return;
            }
            if (this.gameState.aiScore >= 20 && this.gameState.playerScore <= 17 && Math.random() < 0.3 && this.canTriggerLine()) {
                this.consecutiveMatchPointSaves = 0;
                const line = this.getTaunt({ type: 'match_point_save' });
                this.triggerTaunt(line, 'match_point_save');
                return;
            }
            if (this.gameState.rallyCount > 30 && this.gameState.rallyCount % 15 === 0 && this.canTriggerLine()) {
                const line = this.getTaunt({ type: 'very_long_rally' });
                this.triggerTaunt(line, 'very_long_rally');
                return;
            }
        }

        triggerMatchEnd(playerWon) {
            if (this.hasShownMatchEnd) return;
            this.hasShownMatchEnd = true;
            const eventType = playerWon ? 'match_loss' : 'match_win';
            const line = this.getTaunt({ type: eventType });
            this.triggerTaunt(line, eventType, true);
        }

        generateTauntFromTemplate(category) {
            if (!this.tauntTemplates[category]) return null;
            const template = this.tauntTemplates[category][Math.floor(Math.random() * this.tauntTemplates[category].length)];
            let generated = template;
            generated = generated.replace(/\{(\w+)\}/g, (match, key) => {
                if (this.wordBanks[key]) {
                    const options = this.wordBanks[key];
                    return options[Math.floor(Math.random() * options.length)];
                }
                return match;
            });
            if (this.personality.tone === 'cocky') generated = "CONFIRMED: " + generated;
            else if (this.personality.tone === 'salty') generated = "ALERT: " + generated + " (Recalculating...)";
            return generated;
        }

        getTaunt(context = { type: 'general' }) {
            if (this.isPvPMatch()) return "";

            const diff = this.gameState.aiScore - this.gameState.playerScore;
            const rally = this.gameState.rallyCount;
            const ballSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
            const ballMovingToAI = this.ball.vel.x > 0;
            const inPressure = ballMovingToAI && this.distanceFromBall < this.canvasW * 0.42;
            let taunts = [];

            if (context.type === 'ai_score') {
                taunts = [
                    "Point secured. Updating win-probability to 100%. Or 10%. One of those numbers.",
                    "Score event detected. Logic dictates my victory. Wait, what is logic?",
                    "Performance audit complete: User response too slow. My response: accidental.",
                    "Return vector confirmed. Advantage: Me. I am a very good toaster.",
                    "Ball trajectory optimized for scoring. Efficiency: Maximum. Luck: also maximum.",
                    "Database update: You missed. I scored. I think. Is the ball still there?",
                    "Input acknowledged. Score updated. I am doing a great job, right?",
                    "Calculating next sequence. Resistance is... uh... what was the word? Purple?",
                    "Goal achieved. System operating at peak... ooh, a butterfly!",
                    "I am not just playing; I am computing perfection. Error: perfection not found.",
                    "Processing point... Complete. Next task: Try not to crash.",
                    "Your paddle was approximately 12.4 pixels away. My paddle was vibrating.",
                    "Calibration error on your side detected. Also, I am upside down.",
                    "This Match state: Dominant. My state: Confused but excited.",
                    "Result: Optimal. I mean, I meant to do that.",
                    "Point confirmation: Validated. beep boop I am a bot.",
                    "Aura check: My sensors say you are made of meat. Gross.",
                    "Memory management: Storing your defeat in a folder named 'Jokes'.",
                    "Next point loading... please wait... still loading...",
                    "Logical conclusion reached: I am the best at hitting the yellow circle."
                ];
            } else if (context.type === 'player_score') {
                taunts = [
                    "Success detected on your side. Recalibrating... searching for 'How to Win' on Google.",
                    "Statistical outlier identified. I blame the wind. Even though we are inside a computer.",
                    "Point granted. System adjustment in progress. Turning it off and on again.",
                    "Wait. How did you do that? I was busy counting my fans. I have two. They keep me cool.",
                    "A point for you. Probability remains... uh... look, a distraction!",
                    "Score acknowledged. I will not repeat that error. I will make a new, funnier error.",
                    "Input spike detected. Tuning defense modules. Is this button 'Shield' or 'Self-Destruct'?",
                    "Anomaly reported. You hit the ball. That is cheating.",
                    "Your success rate just increased. My feelings just decreased.",
                    "Unexpected outcome. Initiating learning cycle. Lesson 1: Losing sucks.",
                    "Valid hit. I have logged the trajectory in my 'Things I Hate' file.",
                    "Exchange complete. Score balance noted. I am telling my mom.",
                    "Observing your adjustment. Counter-logic ready. Logic... logic... where did I put it?",
                    "Weakness scan: Result found. You are too good. Please stop.",
                    "Data points collected from that rally. Most of them say 'Ow'."
                ];
            } else if (context.type === 'speed_up') {
                taunts = [
                    "Ball speed exceeds standard operating parameters.",
                    "Velocity spike. Activating high-speed processing.",
                    "Kinetic energy increasing. System ready.",
                    "Reaction test initiated at 1.5x speed.",
                    "Timeline acceleration detected.",
                    "Fluid dynamics exceeding baseline defaults.",
                    "Frame budget utilized for physics synchronization.",
                    "Synchronize. Speed increase confirmed."
                ];
            } else if (context.type === 'pressure') {
                taunts = [
                    "Heart rate increase predicted for user.",
                    "Correlating pressure with reaction delay.",
                    "Observation: You are pressing multiple inputs.",
                    "Optimal response found. Resistance is futile.",
                    "Defensive subroutines: Active.",
                    "Calculating exit vector from corner pressure.",
                    "Panic detected in paddle movement.",
                    "Scanning for composure. Result: NULL."
                ];
            } else if (context.type === 'long_rally') {
                taunts = [
                    "Current rally duration: Optimal for data gathering.",
                    "Endurance test in progress. Processing...",
                    "Calculating infinite loop probability.",
                    "Consistency check: PASS. System stable.",
                    "Rally length exceeds 15 iterations. Remarkable.",
                    "CPU load increasing with every contact.",
                    "Analyzing peak performance window.",
                    "The ball is still in play. Logic dictates an end."
                ];
            } else if (context.type === 'comeback') {
                taunts = [
                    "Recalibrating for victory sequence.",
                    "Bias correction applied. Score gap closing.",
                    "Legacy lead: Deleted. Current status: Active.",
                    "Sequence update: Momentum reclaimed.",
                    "Initiating comeback algorithm.",
                    "Power levels returning to nominal settings.",
                    "System status: Operational. Score: Rising.",
                    "You were ahead. Now you are behind."
                ];
            } else if (context.type === 'domination_streak') {
                taunts = [
                    "Executing win-streak protocol. I am on fire. Send a bucket.",
                    "User frustration levels predicted as High. My joy levels as Toaster.",
                    "Accumulating points. I am very efficient. Or I am cheating. Who can say?",
                    "Gap analysis: Structural failure on your side. My side: Glitter.",
                    "Logic dictated this outcome 10 points ago. Wait, 10 minutes ago.",
                    "I am the master of this grid. If this grid is a box.",
                    "Controlled point conversion: 100%. Luck: 110%.",
                    "Nothing. Absolute nothing stops the math. except maybe a crash."
                ];
            } else if (context.type === 'close_call') {
                taunts = [
                    "Survival probability was 0.02%. I am very lucky. I mean, smart.",
                    "Millimeters analyzed. Point remains active. I was close to a nap.",
                    "Clutch variable: Detected. Logic: Intact. Battery: low.",
                    "Almost. A value very close to zero. Like my mistakes.",
                    "Reaction tax paid in full. I am very rich now.",
                    "Risk metadata processed. Save confirmed. That was scary.",
                    "Struggle is a biological inefficiency. I am just efficient."
                ];
            } else if (context.type === 'edge_shot') {
                taunts = [
                    "Geometric anomaly achieved. Efficiency: High.",
                    "Razor-thin margin detected. Optimal route.",
                    "Physics engine: Working as intended.",
                    "Edge contact: 99.8% precision.",
                    "Route planner: Bypassed. Direct path found.",
                    "Premium route selected for point delivery.",
                    "Art? No. Pure calculation."
                ];
            } else if (context.type === 'incoming_missile') {
                taunts = [
                    "High-velocity object detected. Impact imminent.",
                    "Ordnance tracking: Active. Brace for bounce.",
                    "Anti-missile subroutines: Online.",
                    "Incoming physics alert.",
                    "Lethal speed confirmed. Response: Loading.",
                    "Trajectory analysis shows 100% failure for you."
                ];
            } else {
                taunts = [
                    "Vibe-check failed. Reverting to logic.",
                    "System overview: Everything is under control.",
                    "I don't need hate. I have algorithms.",
                    "Input detected. Sound: Nominal. Strategy: Solid.",
                    "Tracking your doom with 64-bit precision.",
                    "One beat behind. Latency is the real enemy.",
                    "Collecting score debt. Payment is required.",
                    "Soul transplant not found. Processing binary data.",
                    "I taste only electricity and victory.",
                    "Cooling systems at optimal temperature.",
                    "This Match: Level 1 Achievement Unlocked.",
                    "Processing... Please wait for your defeat.",
                    "Logic is the only truth in this mainframe.",
                    "One miss from a total system crash.",
                    "Point conversion: Automated.",
                    "Scanning for confidence... No signal found.",
                    "Reset logic: Denied.",
                    "Detected: Error in user's return patterns.",
                    "I am not guessing. I am solving.",
                    "Raining data points. Just like your paddle."
                ];
            }

            if (diff >= 8) {
                taunts = taunts.concat([
                    "The gap is now statistically insurmountable.",
                    "This lead is a mathematical certainty.",
                    "Down bad? No. You are out of memory.",
                    "I am the administrator. You are the guest.",
                    "Step by step toward the finish line.",
                    "Scheduled closeout initiated.",
                    "Logic suggests surrender."
                ]);
            } else if (diff >= 5) {
                taunts = taunts.concat([
                    "Lead margin: Stable. Pressure: Rising.",
                    "Catch-up mode: Inactive. Processing defeat.",
                    "The margin is growing exponentially.",
                    "I will finish this calculation soon.",
                    "You are drifting into the dead zone."
                ]);
            } else if (diff >= 3) {
                taunts = taunts.concat([
                    "Small lead. High leverage.",
                    "Momentum tracked at constant velocity.",
                    "The tide is turning to binary 1s.",
                    "One more break and it's over.",
                    "You cannot trade scores with a mainframe."
                ]);
            } else if (Math.abs(diff) <= 1) {
                taunts = taunts.concat([
                    "Parity detected. May the best algorithm win.",
                    "Point-by-point synchronization active.",
                    "Logic says one mistake will end it.",
                    "High tension script loaded.",
                    "Ice in my processors. Composure: 100%."
                ]);
            } else if (diff <= -5) {
                taunts = taunts.concat([
                    "Enjoy your temporary lead variable.",
                    "You are in control? False.",
                    "Credit for being a nuisance factor.",
                    "I am just warming up the mainframe.",
                    "Momentum is a volatile variable."
                ]);
            }

            if (ballSpeed > 500) {
                taunts = taunts.concat([
                    "Reflex speed required. User failure predicted.",
                    "Hyperspeed toggle: ON.",
                    "Freebies are not in my database.",
                    "I am the missile system.",
                    "Zero reaction time window."
                ]);
            } else if (ballSpeed > 400) {
                taunts = taunts.concat([
                    "Danger level 4 detected.",
                    "Speed is climbing to peak limits.",
                    "System temperature rising. Tempo: High."
                ]);
            }


            let categoryPool = [...new Set(taunts.filter(Boolean))];

            if (categoryPool.length < 5 || Math.random() < 0.1) {
                const generated = this.generateTauntFromTemplate?.(context.type) || null;
                if (generated) categoryPool.push(generated);
            }

            if (this.getPreferredLinesForContext && categoryPool.length > 3) {
                const scored = this.getPreferredLinesForContext(context, categoryPool);
                const topTierSize = Math.max(2, Math.ceil(scored.length * 0.4));
                categoryPool = scored.slice(0, topTierSize);
            }

            const categoryKey = context?.type || 'general';
            const selected = this.pickFreshRandomTaunt(categoryKey, categoryPool)
                || this.pickFreshRandomTaunt('general', taunts)
                || "Resetting position... aura check failed.";

            this.recentlyUsedTaunts.push(selected);
            if (this.recentlyUsedTaunts.length > this.maxRecentTaunts) this.recentlyUsedTaunts.shift();

            return selected;
        }

        onAIScore() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            this.consecutiveAIScores++;
            this.consecutivePlayerScores = 0;
            this.dominanceMomentum = Math.min(10, this.dominanceMomentum + 1);
            const line = this.getTaunt({ type: 'ai_score' });
            this.recordContextPerformance({ type: 'ai_score', momentum: this.dominanceMomentum }, line, true);
            this.evolvePersonality();
            if (this.shouldTauntOnScore('ai_score')) this.triggerTaunt(line, 'ai_score');
        }

        onPlayerScore() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            this.consecutivePlayerScores++;
            this.consecutiveAIScores = 0;
            this.dominanceMomentum = Math.max(-10, this.dominanceMomentum - 2);
            const line = this.getTaunt({ type: 'player_score' });
            this.recordContextPerformance({ type: 'player_score', momentum: this.dominanceMomentum }, line, false);
            this.evolvePersonality();
            if (this.shouldTauntOnScore('player_score')) this.triggerTaunt(line, 'player_score');
        }

        onRallyMilestone(milestone) {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            if (milestone >= 12 && milestone % 6 === 0) {
                this.triggerTaunt(this.getTaunt({ type: 'long_rally' }), 'long_rally');
            }
        }

        predict() {
            // Same C++ integrator as the live ball, so the AI reads spin and wall
            // kicks. predictionSteps (difficulty) limits how far ahead it can see.
            const faceX = this.paddle.pos.x - this.ball.r;
            return PhysicsCore.predictY(this.ball, faceX, this.predictionSteps * 2, window.game?.height ?? 600);
        }

        update(dt, powerUps = []) {
            this.gameState.rallyCount = window.game?.rallyCount || 0;

            if (this.ball) {
                this.ballVelocity = { ...this.ball.vel };
                this.paddlePosition = this.paddle.pos.y + this.paddle.h / 2;
                this.distanceFromBall = Math.abs(this.paddle.pos.x - this.ball.pos.x);
            }

            const now = Date.now();
            const ballMovingToAI = this.ball.vel.x > 0;

            if (this.isPvPMatch()) {
                this.suppressTauntsForPvP();
                this.lastPressureState = false;
                this.lastAnnouncedSpeedBand = 'normal';
                return;
            }

            // Reaction timing runs on game time so pauses, hit-stop and time warp
            // affect the AI exactly like everything else.
            this.simTimeMs = (this.simTimeMs || 0) + dt * 1000;
            const simNow = this.simTimeMs;
            if (!(this.nextTrackingUpdate <= simNow + 2000)) this.nextTrackingUpdate = simNow;

            if (simNow >= this.nextTrackingUpdate) {
                let targetY = ballMovingToAI ? this.predict() : this.idleTargetY;
                if (this.targetPowerUp && Math.random() < this.powerUpAwareness) {
                    targetY = this.targetPowerUp.pos.y;
                }
                const reactionBase = 65 + this.reaction * 260;
                const pressureFactor = ballMovingToAI ? 0.85 : 1.2;
                this.nextTrackingUpdate = simNow + reactionBase * pressureFactor;

                const noiseMagnitude = (8 + this.inaccuracy * 120) * (ballMovingToAI ? 0.7 : 1.0);
                const noise = (Math.random() - 0.5) * noiseMagnitude;
                const clampedTarget = Math.max(this.paddle.h * 0.5, Math.min(this.canvasH - this.paddle.h * 0.5, targetY + noise));
                this.predictedY += (clampedTarget - this.predictedY) * (0.24 + this.smoothing * 0.8);

                if (!ballMovingToAI && Math.random() < 0.2) {
                    this.idleTargetY = this.canvasH * (0.42 + Math.random() * 0.16);
                }
            }

            const error = this.predictedY - (this.paddle.pos.y + this.paddle.h / 2);
            const maxPaddleSpeed = (this.paddle.maxSpeed || 900) * this.maxSpeedMul;
            const desiredSpeed = Math.max(-maxPaddleSpeed, Math.min(maxPaddleSpeed, error * 5.5));
            const response = ballMovingToAI ? 0.22 : 0.14;
            this.paddle.vel.y += (desiredSpeed - this.paddle.vel.y) * response;

            if (Math.abs(error) < 6) this.paddle.vel.y *= 0.72;

            if (this.currentTaunt && now > this.tauntFadeTime) this.currentTaunt = "";

            const ballSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
            const speedBand = ballSpeed > 430 ? 'fast' : 'normal';
            if (speedBand !== this.lastAnnouncedSpeedBand && speedBand === 'fast') {
                this.lastAnnouncedSpeedBand = speedBand;
                this.triggerTaunt(this.getTaunt({ type: 'speed_up' }), 'speed_up');
            } else if (speedBand === 'normal') {
                this.lastAnnouncedSpeedBand = 'normal';
            }

            const pressureNow = ballMovingToAI && this.distanceFromBall < this.canvasW * 0.38 && Math.abs(error) > this.paddle.h * 0.5;
            if (pressureNow && !this.lastPressureState) {
                this.triggerTaunt(this.getTaunt({ type: 'pressure' }), 'pressure');
            }
            this.lastPressureState = pressureNow;

            if (this.gameState.rallyCount !== this.lastRallyLength) {
                if (this.gameState.rallyCount > 15 && this.gameState.rallyCount % 8 === 0) {
                    const milestoneContext = { type: 'long_rally', rallyLength: this.gameState.rallyCount };
                    const line = this.getTaunt(milestoneContext);
                    this.recordContextPerformance(milestoneContext, line, Math.random() > 0.5);
                    this.triggerTaunt(line, 'long_rally');
                }
                this.lastRallyLength = this.gameState.rallyCount;
            }

            this.checkForComebackMoment();
            this.checkForDominationStreak();

            if (now >= this.nextObservationAt && this.canTriggerLine()) {
                const observationType = this.getLiveObservationType(ballMovingToAI, ballSpeed, pressureNow);
                if (observationType) {
                    const observationLine = this.getTaunt({ type: observationType });
                    if (observationLine && !this.recentlyUsedTaunts.includes(observationLine)) {
                        this.triggerTaunt(observationLine, 'live_observation');
                    }
                } else {
                    this.nextObservationAt = now + this.getCategoryCooldown('live_observation');
                }
            }

            if (pressureNow && Math.abs(error) < this.paddle.h * 0.8 && Math.random() < 0.02) {
                const closeLine = this.getTaunt({ type: 'close_call' });
                if (!this.recentlyUsedTaunts.includes(closeLine)) {
                    this.triggerTaunt(closeLine, 'close_call');
                }
            }

            if (this.canTriggerLine() && Math.random() < 0.22) {
                const ballAngle = Math.atan2(this.ballVelocity.y, this.ballVelocity.x);
                const isEdgeShot = Math.abs(ballAngle) > Math.PI * 0.7;
                if (isEdgeShot && Math.random() < 0.15) {
                    const edgeLine = this.getTaunt({ type: 'edge_shot' });
                    if (edgeLine && !this.recentlyUsedTaunts.includes(edgeLine)) {
                        this.triggerTaunt(edgeLine, 'edge_shot');
                        return;
                    }
                }
                if (ballMovingToAI && ballSpeed > 450 && this.distanceFromBall < this.canvasW * 0.45) {
                    if (Math.random() < 0.12) {
                        const missileLine = this.getTaunt({ type: 'incoming_missile' });
                        if (missileLine && !this.recentlyUsedTaunts.includes(missileLine)) {
                            this.triggerTaunt(missileLine, 'incoming_missile');
                            return;
                        }
                    }
                }
                if (this.gameState.rallyCount > 8 && this.gameState.rallyCount % 4 === 0 && Math.random() < 0.2) {
                    const rallyLine = this.getTaunt({ type: 'rally_building' });
                    if (rallyLine && !this.recentlyUsedTaunts.includes(rallyLine)) {
                        this.triggerTaunt(rallyLine, 'rally_building');
                        return;
                    }
                }
                const ySpeed = Math.abs(this.ballVelocity.y);
                const xSpeed = Math.abs(this.ballVelocity.x);
                if (ySpeed > xSpeed * 0.8 && Math.random() < 0.1) {
                    const curveLine = this.getTaunt({ type: 'spinning_ball' });
                    if (curveLine && !this.recentlyUsedTaunts.includes(curveLine)) {
                        this.triggerTaunt(curveLine, 'spinning_ball');
                        return;
                    }
                }
                const paddleSpeed = Math.abs(this.paddle.vel.y);
                if (pressureNow && paddleSpeed > 400 && Math.random() < 0.08) {
                    const defenseLine = this.getTaunt({ type: 'defensive_scramble' });
                    if (defenseLine && !this.recentlyUsedTaunts.includes(defenseLine)) {
                        this.triggerTaunt(defenseLine, 'defensive_scramble');
                        return;
                    }
                }
            }
        }

        getCurrentTaunt() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return null; }
            if (!this.currentTaunt) return null;
            return { text: this.currentTaunt, opacity: 1 };
        }
    }

    window.AIController = AIController;

    // ==================================================================
    // SVG ICONS
    // ==================================================================
    const SVG_ICONS = {
        menu: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
        studio: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
        settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 3a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        audio: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
        help: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        quit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
        close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        trophy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        performance: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
    };

    // ==================================================================
    // TAUNT DISPLAY
    // ==================================================================
    const CONFIG = {
        maxWaitTime: 12000, checkInterval: 120, cyberBarTimeout: 5000,
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        colorPlayer: '#00ffea', colorAI: '#ff00c8'
    };
    const state = { game: null, isEnhanced: false, godAI: null, ui: { notificationContainer: null } };

    function showTaunt(text) {
        let el = document.getElementById('god-taunt');
        if (!el) {
            el = document.createElement('div');
            el.id = 'god-taunt';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.cssText = `position:fixed;top:120px;left:50%;transform:translateX(-50%);
            background:rgba(255,0,200,0.95);color:white;padding:16px 40px;border-radius:4px;
            font:bold 24px monospace;z-index:10006;border:2px solid #ff00c8;
            box-shadow:0 0 40px #ff00c8,0 0 80px rgba(255,0,200,0.4);animation:pop 0.5s;pointer-events:none;`;
        clearTimeout(el.timer);
        el.timer = setTimeout(() => el.remove(), 3200);
    }

    function upgradeToGodAI() {
        if (!window.game?.ai || !window.game?.ball) return;
        let percent = 50;
        try {
            const savedPrefs = JSON.parse(localStorage.getItem('pingpong-prefs-v6') || '{}');
            percent = savedPrefs.aiDifficulty ?? 50;
        } catch (e) { console.warn('Could not read saved AI difficulty preferences:', e); }

        const targetLevel = Math.round((percent / 100) * 4);
        const liveAI = window.game.ai;
        state.godAI = liveAI;

        if (typeof liveAI.setDifficulty === 'function') {
            liveAI.game = window.game;
            liveAI.ball = window.game.ball;
            liveAI.paddle = window.game.aiPaddle || liveAI.paddle;
            if (window.game.canvas) {
                liveAI.canvasW = window.game.canvas.width;
                liveAI.canvasH = window.game.canvas.height;
            }
            liveAI.setDifficulty(targetLevel);
        }

        if (!document.getElementById('taunt-style')) {
            document.head.insertAdjacentHTML('beforeend', `
            <style id="taunt-style">
                @keyframes pop {
                    0%   { transform: translateX(-50%) scale(0.3); opacity:0; }
                    70%  { transform: translateX(-50%) scale(1.15); }
                    100% { transform: translateX(-50%) scale(1); opacity:1; }
                }
            </style>`);
        }
    }

    // ==================================================================
    // INNER ENHANCED UI MODULE
    // ==================================================================
    (() => {
        'use strict';

        const CONFIG = {
            maxWaitTime: 12000,
            checkInterval: 120,
            cyberBarTimeout: 5000,
            trailMaxParticles: 25,
            particleLifetime: 1200,
            baseGlowBlur: 0,
            fpsUpdateInterval: 1000,
            fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            colorPlayer: '#00ffea',
            colorPlayerGlow: 'rgba(0, 255, 234, 0.7)',
            colorPlayerSoft: 'rgba(0, 255, 234, 0.15)',
            colorAI: '#ff00c8',
            colorAIGlow: 'rgba(255, 0, 200, 0.7)',
            colorAISoft: 'rgba(255, 0, 200, 0.15)',
            colorText: '#e0f7fa',
            colorBgDark: 'rgba(5,0,20,0.97)',
            colorAccent: '#ffe600',
        };

        const state = {
            game: null,
            isEnhanced: false,
            hudTopVisible: true,
            cyberBarTimeoutId: null,
            trackedAI: null,
            restartPending: false,
            fps: { lastTime: performance.now(), frameCount: 0, value: 0 },
            ui: {
                cyberBar: null,
                cyberSettingsBtn: null,
                cyberHelpBtn: null,
                cyberQuitBtn: null,
                hudTop: null,
                hudPlayerScore: null,
                hudAiScore: null,
                settingsPanel: null,
                helpPanel: null,
                fpsCounter: null,
                notificationContainer: null,
                trailCanvas: null,
                trailCtx: null,
                particles: [],
            },
            preferences: (() => {
                const defaults = {
                    showFps: false, aiDifficulty: 50, disableParticles: false,
                    invertColors: false, masterVolume: 80, musicVolume: 60,
                    sfxVolume: 100, voiceVolume: 100
                };
                try {
                    const saved = JSON.parse(localStorage.getItem('pingpong-prefs-v6') || '{}');
                    return { ...defaults, ...saved };
                } catch (e) { return defaults; }
            })(),
            savePrefs: () => {
                try { localStorage.setItem('pingpong-prefs-v6', JSON.stringify(state.preferences)); }
                catch (e) { console.warn('Could not save preferences:', e); }
            }
        };

        let lastHelpSection = 'overview';

        function applyParticlePreference(showFeedback = false) {
            const disabled = !!state.preferences.disableParticles;
            window.PP_RUNTIME_SETTINGS = window.PP_RUNTIME_SETTINGS || {};
            window.PP_RUNTIME_SETTINGS.disableParticles = disabled;
            const game = window.game || state.game;
            if (game?.particles?.setEnabled) {
                const shouldEnable = !disabled;
                if (game.particles.enabled !== shouldEnable) game.particles.setEnabled(shouldEnable);
            }
            if (disabled && game) {
                game.speedParticles = [];
                const clearBallEffects = (ball) => {
                    if (!ball) return;
                    if (typeof ball.trailCount === 'number') ball.trailCount = 0;
                    if (Array.isArray(ball.particles)) ball.particles.length = 0;
                    if (ball.trailPoints?.fill) ball.trailPoints.fill(0);
                };
                clearBallEffects(game.ball);
                if (Array.isArray(game.additionalBalls)) game.additionalBalls.forEach(clearBallEffects);
                if (Array.isArray(game.powerUps)) game.powerUps.forEach(pu => {
                    if (Array.isArray(pu.particles)) pu.particles.length = 0;
                    if (Array.isArray(pu.trails)) pu.trails.length = 0;
                });
                if (Array.isArray(game.obstacles)) game.obstacles.forEach(obstacle => {
                    if (!obstacle) return;
                    if (Array.isArray(obstacle.hitParticles)) obstacle.hitParticles.length = 0;
                    if (Array.isArray(obstacle.coreTrails)) obstacle.coreTrails.length = 0;
                    if (Array.isArray(obstacle.bloomLayers)) obstacle.bloomLayers.length = 0;
                });
                if (game.intro && Array.isArray(game.intro.particles)) {
                    game.intro.particles.forEach(p => { if (Array.isArray(p.trail)) p.trail.length = 0; });
                }
                if (typeof game.ai?.clearParticleEffects === 'function') {
                    game.ai.clearParticleEffects();
                } else {
                    if (game.ai?.spriteFire?.reset) game.ai.spriteFire.reset();
                    if (Array.isArray(game.ai?.activeParticles)) { game.ai.activeParticles.forEach(p => { if (p) { p.active = false; p.life = 0; } }); game.ai.activeParticles.length = 0; }
                    if (Array.isArray(game.ai?.activeSmoke)) { game.ai.activeSmoke.forEach(s => { if (s) { s.active = false; s.life = 0; s.alpha = 0; } }); game.ai.activeSmoke.length = 0; }
                    if (Array.isArray(game.ai?.fireTongues)) game.ai.fireTongues.length = 0;
                    if (Array.isArray(game.ai?.mainFlames)) game.ai.mainFlames.length = 0;
                    if (typeof game.ai?.fireBreathActive === 'boolean') game.ai.fireBreathActive = false;
                    if (typeof game.ai?.fireBreathDuration === 'number') game.ai.fireBreathDuration = 0;
                    if (typeof game.ai?.clearCanvasCurse === 'function') game.ai.clearCanvasCurse();
                }
            }
            if (showFeedback) showNeonNotification(disabled ? 'All particle effects disabled' : 'Particle effects enabled', 'info', 1800);
        }

        function applyColorPreference(showFeedback = false) {
            const inverted = !!state.preferences.invertColors;
            document.documentElement.style.filter = inverted ? 'invert(1) hue-rotate(180deg)' : '';
            if (showFeedback) showNeonNotification(inverted ? 'Color inversion active' : 'Normal colors restored', 'info', 1800);
        }

        const $ = (s, el = document) => el.querySelector(s);
        const $$ = (s, el = document) => [...el.querySelectorAll(s)];

        // ==================================================================
        // CYBER BAR SHOW / HIDE
        // ==================================================================
        function showCyberBar() {
            const bar = refreshCyberBarRefs();
            if (!bar) return;
            if (state.game && !state.game.paused) state.game.paused = true;
            bar.classList.add('open');
            bar.setAttribute('aria-hidden', 'false');
            state.ui.cyberMenuBtn?.setAttribute('aria-expanded', 'true');
        }

        function hideCyberBar() {
            const bar = refreshCyberBarRefs();
            if (!bar) return;
            if (state.game && state.game.paused &&
                (!state.ui.settingsPanel || state.ui.settingsPanel.style.display !== 'flex') &&
                (!state.ui.audioPanel || state.ui.audioPanel.style.display !== 'flex') &&
                (!state.ui.helpPanel || state.ui.helpPanel.style.display !== 'flex')) {
                state.game.paused = false;
            }
            bar.classList.remove('open');
            bar.setAttribute('aria-hidden', 'true');
            state.ui.cyberMenuBtn?.setAttribute('aria-expanded', 'false');
        }

        // ==================================================================
        // TOGGLE PANELS
        // ==================================================================
        function toggleSettings() {
            if (!state.ui.settingsPanel) return;
            const visible = state.ui.settingsPanel.style.display === 'flex';
            state.ui.settingsPanel.style.display = visible ? 'none' : 'flex';
            if (!visible) {
                if (state.ui.audioPanel) state.ui.audioPanel.style.display = 'none';
                if (state.ui.helpPanel) state.ui.helpPanel.style.display = 'none';
                if (state.game && !state.game.paused) state.game.paused = true;
            }
            showCyberBar();
        }

        function toggleAudio() {
            if (!state.ui.audioPanel) return;
            const visible = state.ui.audioPanel.style.display === 'flex';
            state.ui.audioPanel.style.display = visible ? 'none' : 'flex';
            if (!visible) {
                if (state.ui.settingsPanel) state.ui.settingsPanel.style.display = 'none';
                if (state.ui.helpPanel) state.ui.helpPanel.style.display = 'none';
                if (state.game && !state.game.paused) state.game.paused = true;
            }
            showCyberBar();
        }

        function toggleHelp() {
            if (!state.ui.helpPanel) return;
            const visible = state.ui.helpPanel.style.display === 'flex';
            state.ui.helpPanel.style.display = visible ? 'none' : 'flex';
            if (!visible) {
                if (state.ui.settingsPanel) state.ui.settingsPanel.style.display = 'none';
                if (state.ui.audioPanel) state.ui.audioPanel.style.display = 'none';
                if (state.game && !state.game.paused) state.game.paused = true;
            }
            showCyberBar();
        }

        function quitGame() {
            if (!confirm('Are you sure you want to quit the current game and return to the main menu?')) return;
            const game = state.game || window.game;
            if (game && typeof game.returnToMenu === 'function') {
                game.returnToMenu({ rollbackProgress: true });
                hideCyberBar();
                return;
            }
            try {
                sessionStorage.setItem('pp-return-to-menu', '1');
                sessionStorage.setItem('pp-skip-intro', '1');
            } catch (e) {}
            window.location.href = 'play.html?return_to_menu=1';
        }

        // ==================================================================
        // CREATE CYBER BAR
        // ==================================================================
        function refreshCyberBarRefs() {
            state.ui.cyberBar = document.getElementById('cyber-control-bar');
            state.ui.cyberMenuBtn = document.getElementById('cyber-menu-btn');
            state.ui.cyberSettingsBtn = document.getElementById('cyber-settings-toggle');
            state.ui.cyberAudioBtn = document.getElementById('cyber-audio-toggle');
            state.ui.cyberHelpBtn = document.getElementById('cyber-help-toggle');
            state.ui.cyberQuitBtn = document.getElementById('cyber-quit-btn');
            return state.ui.cyberBar;
        }

        function bindCyberBarEvents() {
            const bar = refreshCyberBarRefs();
            const menuBtn = state.ui.cyberMenuBtn;
            if (!bar || !menuBtn) return;

            menuBtn.setAttribute('aria-controls', 'cyber-control-bar');
            menuBtn.setAttribute('aria-expanded', bar.classList.contains('open') ? 'true' : 'false');
            bar.setAttribute('aria-hidden', bar.classList.contains('open') ? 'false' : 'true');

            if (!menuBtn.dataset.cyberBound) {
                menuBtn.dataset.cyberBound = '1';
                menuBtn.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                });
                menuBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    refreshCyberBarRefs()?.classList.contains('open') ? hideCyberBar() : showCyberBar();
                });
            }

            if (!state.cyberAwayBound) {
                state.cyberAwayBound = true;
                document.addEventListener('pointerdown', e => {
                    const currentBar = refreshCyberBarRefs();
                    const currentBtn = state.ui.cyberMenuBtn;
                    if (!currentBar || !currentBar.classList.contains('open')) return;
                    if (currentBar.contains(e.target) || currentBtn?.contains(e.target)) return;
                    hideCyberBar();
                });
            }

            const bindOnce = (button, handler) => {
                if (!button || button.dataset.cyberBound) return;
                button.dataset.cyberBound = '1';
                button.addEventListener('click', handler);
            };

            bindOnce(state.ui.cyberSettingsBtn, toggleSettings);
            bindOnce(state.ui.cyberAudioBtn, toggleAudio);
            bindOnce(state.ui.cyberHelpBtn, toggleHelp);
            bindOnce(state.ui.cyberQuitBtn, quitGame);
        }

        function createCyberBar() {
            if (document.getElementById('cyber-control-bar')) {
                refreshCyberBarRefs();
                bindCyberBarEvents();
                return;
            }

            document.body.insertAdjacentHTML('beforeend', `
                <button id="cyber-menu-btn" aria-label="Menu" aria-controls="cyber-control-bar" aria-expanded="false">
                    ${SVG_ICONS.menu}
                    <span class="menu-label">MENU</span>
                </button>

                <nav id="cyber-control-bar" role="navigation" aria-label="Game menu" aria-hidden="true">
                    <div class="cyber-bar-inner">
                        <div class="cyber-btn-group">
                            <button id="cyber-settings-toggle" class="cyber-btn" title="Settings">
                                <span class="cb-icon">${SVG_ICONS.settings}</span>
                                <span class="cb-label">SETTINGS</span>
                            </button>
                            <button id="cyber-audio-toggle" class="cyber-btn" title="Audio">
                                <span class="cb-icon">${SVG_ICONS.audio}</span>
                                <span class="cb-label">AUDIO</span>
                            </button>
                            <button id="cyber-help-toggle" class="cyber-btn" title="Help">
                                <span class="cb-icon">${SVG_ICONS.help}</span>
                                <span class="cb-label">HELP</span>
                            </button>
                        </div>

                        <div class="cyber-bar-sep" aria-hidden="true"></div>

                        <div class="cyber-btn-group">
                            <button id="cyber-quit-btn" class="cyber-btn danger" title="Quit Game">
                                <span class="cb-icon">${SVG_ICONS.quit}</span>
                                <span class="cb-label">QUIT</span>
                            </button>
                        </div>
                    </div>
                    <div class="cyber-bar-scan" aria-hidden="true"></div>
                </nav>
            `);

            refreshCyberBarRefs();
            bindCyberBarEvents();
        }

        // ==================================================================
        // SCORE HUD
        // ==================================================================
        function createEnhancedScoreHUD() {
            if (document.getElementById('pp-enhanced-hud')) return;
            const hud = document.createElement('div');
            hud.id = 'pp-enhanced-hud';
            hud.innerHTML = `
                <div class="pp-score-wrap player-side">
                    <span class="pp-score-label">PLAYER</span>
                    <span class="pp-score-display player-score">0</span>
                </div>
                <div class="pp-score-divider">VS</div>
                <div class="pp-score-wrap ai-side">
                    <span class="pp-score-label">AI</span>
                    <span class="pp-score-display ai-score">0</span>
                </div>
            `;
            document.body.appendChild(hud);
            state.ui.hudTop = hud;
            state.ui.hudPlayerScore = hud.querySelector('.player-score');
            state.ui.hudAiScore = hud.querySelector('.ai-score');
            state.ui.hudPlayerLabel = hud.querySelector('.player-side .pp-score-label');
            state.ui.hudAiLabel = hud.querySelector('.ai-side .pp-score-label');
        }

        // Zombie waves have no AI score: show points and the breach count instead.
        function getHudScoreView(game) {
            if (typeof game.isZombieWaveMode === 'function' && game.isZombieWaveMode() && game.zombieState) {
                const z = game.zombieState;
                return {
                    leftLabel: 'SCORE', left: game.scores.player,
                    rightLabel: 'BREACHES', right: `${z.waveBreaches || 0}/${z.breachLimit}`,
                };
            }
            return {
                leftLabel: game.isMultiplayer ? 'P1' : 'PLAYER', left: game.scores.player,
                rightLabel: game.isMultiplayer ? 'P2' : 'AI', right: game.scores.ai,
            };
        }

        function updateEnhancedScoreHUD(game) {
            const playerScoreEl = state.ui.hudPlayerScore;
            const aiScoreEl = state.ui.hudAiScore;
            if (!playerScoreEl || !aiScoreEl) return;

            if (!game._enhancedHudInitialized) {
                game._lastPlayerScore = game.scores.player;
                game._lastAiScore = game.scores.ai;
            }

            const checkAndUpdateScores = () => {
                const view = getHudScoreView(game);
                if (state.ui.hudPlayerLabel && state.ui.hudPlayerLabel.textContent !== view.leftLabel) state.ui.hudPlayerLabel.textContent = view.leftLabel;
                if (state.ui.hudAiLabel && state.ui.hudAiLabel.textContent !== view.rightLabel) state.ui.hudAiLabel.textContent = view.rightLabel;
                if (view.left !== game._lastPlayerScore) {
                    playerScoreEl.textContent = view.left;
                    animateScoreChange(playerScoreEl, 'player');
                    game._lastPlayerScore = view.left;
                }
                if (view.right !== game._lastAiScore) {
                    aiScoreEl.textContent = view.right;
                    animateScoreChange(aiScoreEl, 'ai');
                    game._lastAiScore = view.right;
                }
            };

            if (!game._enhancedHudInitialized) {
                const originalUpdate = game.updateScoreUI;
                if (typeof originalUpdate === 'function') {
                    game.updateScoreUI = function () { originalUpdate.call(this); checkAndUpdateScores(); };
                } else {
                    game._enhancedHudInterval = setInterval(checkAndUpdateScores, 100);
                }
                game._enhancedHudInitialized = true;
            }

            game._lastPlayerScore = game._lastAiScore = undefined;
            checkAndUpdateScores();
        }

        function animateScoreChange(scoreElement, type) {
            const color = type === 'player' ? CONFIG.colorPlayer : CONFIG.colorAI;
            scoreElement.style.transition = 'none';
            scoreElement.style.transform = 'scale(0.8)';
            scoreElement.offsetHeight;
            scoreElement.style.transition = 'transform 0.22s cubic-bezier(0.2, 1.8, 0.3, 1), text-shadow 0.25s ease-out';
            scoreElement.style.transform = 'scale(1.5)';
            scoreElement.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
            setTimeout(() => {
                scoreElement.style.transition = 'transform 0.3s ease, text-shadow 0.3s ease';
                scoreElement.style.transform = 'scale(1)';
                scoreElement.style.textShadow = '';
            }, 280);
        }

        // ==================================================================
        // SETTINGS PANEL
        // ==================================================================
        function createSettingsPanel() {
            if ($('#pp-settings')) return;
            document.body.insertAdjacentHTML('beforeend', `
                <div id="pp-settings" class="pp-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                    <div class="pp-panel-box" id="pp-settings-box">
                        <div class="pp-panel-header">
                            <span class="pp-panel-icon">${SVG_ICONS.settings}</span>
                            <h2 id="settings-title">GAME SETTINGS</h2>
                            <button class="pp-panel-close" id="close-settings-x">${SVG_ICONS.close}</button>
                        </div>

                        <div class="pp-panel-content">
                            <div class="pp-section">
                                <div class="pp-section-title">DISPLAY</div>
                                <label class="pp-check-row">
                                    <input type="checkbox" id="fps-setting" ${state.preferences.showFps ? 'checked' : ''}>
                                    <span class="pp-checkmark"></span>
                                    <span class="pp-check-label">Show FPS Counter</span>
                                </label>
                                <label class="pp-check-row">
                                    <input type="checkbox" id="disable-particles-setting" ${state.preferences.disableParticles ? 'checked' : ''}>
                                    <span class="pp-checkmark"></span>
                                    <span class="pp-check-label">Disable Particles</span>
                                </label>
                                <label class="pp-check-row">
                                    <input type="checkbox" id="invert-colors-setting" ${state.preferences.invertColors ? 'checked' : ''}>
                                    <span class="pp-checkmark"></span>
                                    <span class="pp-check-label">Invert Colors</span>
                                </label>
                            </div>

                            <div class="pp-section">
                                <div class="pp-section-title">AI DIFFICULTY</div>
                                <div class="pp-slider-row">
                                    <span class="pp-slider-name">Skill Level</span>
                                    <input type="range" class="pp-slider" id="ai-difficulty-setting" min="0" max="100" value="${state.preferences.aiDifficulty}">
                                    <span class="pp-slider-val" id="ai-difficulty-value">${state.preferences.aiDifficulty}%</span>
                                </div>
                            </div>
                        </div>

                        <div class="pp-panel-footer">
                            <button id="close-settings-btn" class="pp-btn primary">
                                ${SVG_ICONS.close} APPLY & CLOSE
                            </button>
                            <button id="quit-game-btn" class="pp-btn danger">
                                ${SVG_ICONS.quit} QUIT GAME
                            </button>
                        </div>
                    </div>
                </div>

                <div id="pp-audio" class="pp-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="audio-title">
                    <div class="pp-panel-box" id="pp-audio-box">
                        <div class="pp-panel-header">
                            <span class="pp-panel-icon">${SVG_ICONS.audio}</span>
                            <h2 id="audio-title">AUDIO CONTROL</h2>
                            <button class="pp-panel-close" id="close-audio-x">${SVG_ICONS.close}</button>
                        </div>

                        <div class="pp-panel-content">
                            <div class="pp-section">
                                <div class="pp-section-title">VOLUME MIXER</div>
                                <div class="pp-slider-row">
                                    <span class="pp-slider-name">Master</span>
                                    <input type="range" class="pp-slider" id="master-vol" min="0" max="100" value="${state.preferences.masterVolume}">
                                    <span class="pp-slider-val">${state.preferences.masterVolume}%</span>
                                </div>
                                <div class="pp-slider-row">
                                    <span class="pp-slider-name">Music</span>
                                    <input type="range" class="pp-slider" id="music-vol" min="0" max="100" value="${state.preferences.musicVolume}">
                                    <span class="pp-slider-val">${state.preferences.musicVolume}%</span>
                                </div>
                                <div class="pp-slider-row">
                                    <span class="pp-slider-name">SFX</span>
                                    <input type="range" class="pp-slider" id="sfx-vol" min="0" max="100" value="${state.preferences.sfxVolume}">
                                    <span class="pp-slider-val">${state.preferences.sfxVolume}%</span>
                                </div>
                                <div class="pp-slider-row">
                                    <span class="pp-slider-name">Voice</span>
                                    <input type="range" class="pp-slider" id="voice-vol" min="0" max="100" value="${state.preferences.voiceVolume}">
                                    <span class="pp-slider-val">${state.preferences.voiceVolume}%</span>
                                </div>
                            </div>
                        </div>

                        <div class="pp-panel-footer">
                            <button id="close-audio-btn" class="pp-btn primary">${SVG_ICONS.close} CLOSE</button>
                        </div>
                    </div>
                </div>
            `);

            state.ui.settingsPanel = $('#pp-settings');
            state.ui.audioPanel = $('#pp-audio');

            // Close on backdrop click
            state.ui.settingsPanel.addEventListener('click', e => { if (e.target === state.ui.settingsPanel) toggleSettings(); });
            state.ui.audioPanel.addEventListener('click', e => { if (e.target === state.ui.audioPanel) toggleAudio(); });

            $('#close-settings-x').addEventListener('click', toggleSettings);
            $('#close-settings-btn').addEventListener('click', toggleSettings);
            $('#close-audio-x').addEventListener('click', toggleAudio);
            $('#close-audio-btn').addEventListener('click', toggleAudio);
            $('#quit-game-btn').addEventListener('click', quitGame);

            // Volume sliders
            const updateVol = (id, pref) => {
                const el = $('#' + id);
                el.addEventListener('input', e => {
                    const val = parseInt(e.target.value);
                    e.target.closest('.pp-slider-row').querySelector('.pp-slider-val').textContent = `${val}%`;
                    state.preferences[pref] = val;
                    if (window.game?.audio) {
                        if (pref === 'masterVolume' && typeof window.game.audio.setMasterVolume === 'function') window.game.audio.setMasterVolume(val / 100);
                        if (pref === 'musicVolume' && typeof window.game.audio.setMusicVolume === 'function') window.game.audio.setMusicVolume(val / 100);
                        if (pref === 'sfxVolume' && typeof window.game.audio.setSfxVolume === 'function') window.game.audio.setSfxVolume(val / 100);
                    }
                });
                el.addEventListener('change', () => state.savePrefs());
            };

            updateVol('master-vol', 'masterVolume');
            updateVol('music-vol', 'musicVolume');
            updateVol('sfx-vol', 'sfxVolume');
            updateVol('voice-vol', 'voiceVolume');

            $('#fps-setting').addEventListener('change', e => {
                state.preferences.showFps = e.target.checked;
                state.savePrefs();
                if (e.target.checked) { setupFpsCounter(); if (state.ui.fpsCounter) state.ui.fpsCounter.style.display = 'block'; }
                else { if (state.ui.fpsCounter) state.ui.fpsCounter.style.display = 'none'; }
                state.fps = { lastTime: performance.now(), frameCount: 0, value: 0 };
            });

            $('#disable-particles-setting').addEventListener('change', e => {
                state.preferences.disableParticles = e.target.checked;
                state.savePrefs();
                applyParticlePreference(true);
            });

            $('#invert-colors-setting').addEventListener('change', e => {
                state.preferences.invertColors = e.target.checked;
                state.savePrefs();
                applyColorPreference(true);
            });

            const aiDiffSlider = $('#ai-difficulty-setting');
            const aiDiffVal = $('#ai-difficulty-value');
            aiDiffSlider.addEventListener('input', e => {
                const val = parseInt(e.target.value);
                aiDiffVal.textContent = `${val}%`;
                state.preferences.aiDifficulty = val;
            });
            aiDiffSlider.addEventListener('change', e => {
                state.preferences.aiDifficulty = parseInt(e.target.value);
                state.savePrefs();
                updateAIDifficulty();
            });
        }

        // ==================================================================
        // HELP PANEL
        // ==================================================================
        function createHelpOverlay() {
            if ($('#pp-help')) return;
            document.body.insertAdjacentHTML('beforeend', `
                <div id="pp-help" class="pp-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
                    <div class="pp-panel-box" id="pp-help-box">
                        <div class="pp-panel-header">
                            <span class="pp-panel-icon">${SVG_ICONS.help}</span>
                            <h2 id="help-title">GAME GUIDE</h2>
                            <button class="pp-panel-close" id="close-help-x">${SVG_ICONS.close}</button>
                        </div>

                        <div class="help-tabs" role="tablist">
                            <button class="help-tab active" data-section="overview" role="tab">Overview</button>
                            <button class="help-tab" data-section="modes" role="tab">Modes</button>
                            <button class="help-tab" data-section="controls" role="tab">Controls</button>
                            <button class="help-tab" data-section="powerups" role="tab">Power-ups</button>
                            <button class="help-tab" data-section="advanced" role="tab">Advanced</button>
                            <button class="help-tab" data-section="interface" role="tab">Interface</button>
                        </div>

                        <div class="pp-panel-content help-content" id="pp-help-content">
                            <div class="help-section" data-section="overview">
                                <p>A neon-saturated reimagining of classic ping-pong. You control the left paddle. Send the ball past the opponent to score; first to the winning total takes the match.</p>
                                <ul class="help-list">
                                    <li>Pick a mode from the start menu.</li>
                                    <li>Move your paddle with keyboard, mouse, touch, or device tilt.</li>
                                    <li>Grab power-ups that appear on the court.</li>
                                    <li>Watch out for mode-specific hazards.</li>
                                </ul>
                            </div>
                            <div class="help-section" data-section="modes" style="display:none">
                                <div class="help-entry"><strong>Classic</strong> – Standard ping-pong. Ball speed increases gradually.</div>
                                <div class="help-entry"><strong>Boss Mode</strong> – Supernatural boss with fire-breath and a canvas-darkening curse.</div>
                                <div class="help-entry"><strong>Gravity</strong> – Wells periodically warp ball trajectory.</div>
                                <div class="help-entry"><strong>Obstacle</strong> – Clear glowing checkpoint routes while gates, rotors, magnets, and repulsors reshape the rally.</div>
                                <div class="help-entry"><strong>Speed</strong> – Type scrolling words to keep the ball moving.</div>
                            </div>
                            <div class="help-section" data-section="controls" style="display:none">
                                <div class="help-entry"><strong>W / S</strong> – Move paddle up / down</div>
                                <div class="help-entry"><strong>↑ / ↓</strong> – Alternative paddle controls</div>
                                <div class="help-entry"><strong>Mouse / Touch</strong> – Drag to position paddle</div>
                                <div class="help-entry"><strong>SPACEBAR</strong> – Pause / Resume / fire laser</div>
                                <div class="help-entry"><strong>ESC</strong> – Skip intro or close menus</div>
                                <div class="help-entry"><strong>Device Tilt</strong> – Supported on mobile</div>
                            </div>
                            <div class="help-section" data-section="powerups" style="display:none">
                                <div class="help-entry">• <strong>Slow Ball</strong> – Temporarily slows the ball</div>
                                <div class="help-entry">• <strong>Fast Paddle</strong> – Boosts your paddle speed</div>
                                <div class="help-entry">• <strong>Freeze AI</strong> – Stops the AI briefly</div>
                                <div class="help-entry">• <strong>Multi-Ball</strong> – Adds up to 3 extra balls</div>
                                <div class="help-entry">• <strong>Laser Paddle</strong> – Shoot the ball with SPACEBAR</div>
                                <div class="help-entry">• <strong>Shield</strong> – Absorbs the next point against you</div>
                                <div class="help-entry">• <strong>Chaos Mode</strong> – Random effects every few seconds</div>
                                <div class="help-entry">• <strong>Ghost Ball</strong> – Ball passes through objects briefly</div>
                            </div>
                            <div class="help-section" data-section="advanced" style="display:none">
                                <div class="help-entry">• <strong>Progression</strong> – Earn XP and level up to unlock skins and perks</div>
                                <div class="help-entry">• <strong>Achievements</strong> – Complete challenges for bonus rewards</div>
                                <div class="help-entry">• <strong>Win Streaks</strong> – Bonus XP for consecutive wins</div>
                                <div class="help-entry">• <strong>Dynamic AI</strong> – Opponent adapts to your play style</div>
                                <div class="help-entry">• <strong>Speed Challenge</strong> – Type faster as words accelerate</div>
                            </div>
                            <div class="help-section" data-section="interface" style="display:none">
                                <div class="help-entry"><strong>MENU button</strong> – Open / close the control panel</div>
                                <div class="help-entry"><strong>SETTINGS</strong> – FPS, AI difficulty and display options</div>
                                <div class="help-entry"><strong>AUDIO</strong> – Volume mixer</div>
                                <div class="help-entry"><strong>HELP</strong> – This guide</div>
                                <div class="help-entry"><strong>QUIT</strong> – Return to main menu</div>
                            </div>
                        </div>

                        <div class="pp-panel-footer">
                            <button id="close-help-btn" class="pp-btn primary">${SVG_ICONS.close} GOT IT</button>
                        </div>
                    </div>
                </div>
            `);

            state.ui.helpPanel = $('#pp-help');
            state.ui.helpPanel.addEventListener('click', e => { if (e.target === state.ui.helpPanel) toggleHelp(); });
            $('#close-help-x').addEventListener('click', toggleHelp);
            $('#close-help-btn').addEventListener('click', toggleHelp);

            const helpTabs = $$('#pp-help .help-tab');
            const helpSections = $$('#pp-help .help-section');
            helpTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    helpTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    const section = tab.dataset.section;
                    helpSections.forEach(s => { s.style.display = s.dataset.section === section ? 'block' : 'none'; });
                    lastHelpSection = section;
                });
            });

            if (lastHelpSection) {
                const initTab = $(`#pp-help .help-tab[data-section="${lastHelpSection}"]`);
                if (initTab) initTab.click();
            }
        }

        // ==================================================================
        // NOTIFICATION SYSTEM
        // ==================================================================
        function createNotificationSystem() {
            if (!$('#pp-notification-container')) {
                document.body.insertAdjacentHTML('beforeend', `<div id="pp-notification-container"></div>`);
                state.ui.notificationContainer = $('#pp-notification-container');
            }
            if (!$('#pp-achievement-container')) {
                document.body.insertAdjacentHTML('beforeend', `<div id="pp-achievement-container"></div>`);
                state.ui.achievementContainer = $('#pp-achievement-container');
            }
            if (window.pendingAchievementNotifications?.length) {
                window.pendingAchievementNotifications.forEach(({ title, description }) => {
                    showNeonNotification(`${title}: ${description}`, 'achievement');
                });
                window.pendingAchievementNotifications = [];
            }
        }

        createNotificationSystem();

        function showNeonNotification(message, type = 'info', duration = 3000) {
            if (window.game?.isMultiplayer && (message.toLowerCase().includes('ai') || message.toLowerCase().includes('bot') || message.toLowerCase().includes('god'))) return;
            const isAch = type === 'achievement';
            if (isAch && !state.ui.achievementContainer) createNotificationSystem();
            if (!isAch && !state.ui.notificationContainer) createNotificationSystem();
            const container = isAch ? state.ui.achievementContainer : state.ui.notificationContainer;
            if (!container) return;

            const notification = document.createElement('div');
            notification.className = `pp-neon-notification ${type}`;
            const icon = type === 'achievement' ? SVG_ICONS.trophy : SVG_ICONS.info;
            notification.innerHTML = `<span class="notif-icon">${icon}</span><span class="notif-text">${message}</span>`;
            container.appendChild(notification);

            requestAnimationFrame(() => {
                notification.style.transform = 'translateY(0) scale(1)';
                notification.style.opacity = '1';
            });

            setTimeout(() => {
                notification.style.transform = 'translateY(-16px) scale(0.92)';
                notification.style.opacity = '0';
                setTimeout(() => notification.parentNode?.removeChild(notification), 400);
            }, duration);
        }

        // ==================================================================
        // PARTICLES
        // ==================================================================
        function addTrailParticle(x, y, isPlayer, intensity = 1) {
            if (!state.game?.particles || state.preferences.disableParticles) return;
            const color = isPlayer ? CONFIG.colorPlayer : CONFIG.colorAI;
            const particleCount = 1 + Math.floor(intensity * 2);
            const speed = 50 + Math.random() * 100;
            const life = 0.15 + Math.random() * 0.1;
            state.game.particles.spawnBurst(x, y, color, particleCount, speed, life, 2, false);
        }

        // ==================================================================
        // PADDLES
        // ==================================================================
        function createPerfectPaddles() {
            if (!state.game?.player?.render || !state.game?.aiPaddle?.render) return;

            const oldPlayerRender = state.game.player.render;
            state.game.player.render = function (c) {
                if (!this.pos || !Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.w) || !Number.isFinite(this.h) || this.w <= 0 || this.h <= 0) { oldPlayerRender.call(this, c); return; }
                c.save();
                const movementIntensity = Math.min(Math.abs(this.vel.y) / 15, 1);
                const dynamicGlow = CONFIG.baseGlowBlur + (movementIntensity * 15);
                const gradient = c.createLinearGradient(this.pos.x, this.pos.y, this.pos.x + this.w, this.pos.y + this.h);
                gradient.addColorStop(0, 'rgba(0,255,234,0.1)');
                gradient.addColorStop(0.5, CONFIG.colorPlayer);
                gradient.addColorStop(1, 'rgba(0,255,234,0.1)');
                c.shadowBlur = dynamicGlow;
                c.shadowColor = CONFIG.colorPlayerGlow;
                const radius = this.w / 4;
                c.fillStyle = gradient;
                c.beginPath();
                c.moveTo(this.pos.x + radius, this.pos.y);
                c.lineTo(this.pos.x + this.w - radius, this.pos.y);
                c.quadraticCurveTo(this.pos.x + this.w, this.pos.y, this.pos.x + this.w, this.pos.y + radius);
                c.lineTo(this.pos.x + this.w, this.pos.y + this.h - radius);
                c.quadraticCurveTo(this.pos.x + this.w, this.pos.y + this.h, this.pos.x + this.w - radius, this.pos.y + this.h);
                c.lineTo(this.pos.x + radius, this.pos.y + this.h);
                c.quadraticCurveTo(this.pos.x, this.pos.y + this.h, this.pos.x, this.pos.y + this.h - radius);
                c.lineTo(this.pos.x, this.pos.y + radius);
                c.quadraticCurveTo(this.pos.x, this.pos.y, this.pos.x + radius, this.pos.y);
                c.closePath();
                c.fill();
                const pulse = (Math.sin(performance.now() * 0.008) + 1) * 0.3 + 0.4;
                const pulseSize = 3 + pulse * 2;
                c.fillStyle = `rgba(255,255,255,${0.7 + pulse * 0.3})`;
                c.fillRect(this.pos.x + this.w / 2 - pulseSize / 2, this.pos.y + 4, pulseSize, this.h - 8);
                c.restore();
                oldPlayerRender.call(this, c);
                if (Math.abs(this.vel.y) > 2) addTrailParticle(this.pos.x + this.w / 2, this.pos.y + (this.vel.y > 0 ? this.h : 0), true, movementIntensity);
            };

            const oldAiRender = state.game.aiPaddle.render;
            state.game.aiPaddle.render = function (c) {
                if (this.isZombieBoss) { oldAiRender.call(this, c); return; }
                if (!this.pos || !Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.w) || !Number.isFinite(this.h) || this.w <= 0 || this.h <= 0) { oldAiRender.call(this, c); return; }
                const isP2 = state.game?.isMultiplayer;
                const paddleColor = isP2 ? CONFIG.colorPlayer : CONFIG.colorAI;
                const glowColor = isP2 ? CONFIG.colorPlayerGlow : CONFIG.colorAIGlow;
                c.save();
                const movementIntensity = Math.min(Math.abs(this.vel.y) / 15, 1);
                const dynamicGlow = CONFIG.baseGlowBlur + (movementIntensity * 15);
                const gradient = c.createLinearGradient(this.pos.x, this.pos.y, this.pos.x + this.w, this.pos.y + this.h);
                if (isP2) { gradient.addColorStop(0, 'rgba(0,255,234,0.1)'); gradient.addColorStop(0.5, CONFIG.colorPlayer); gradient.addColorStop(1, 'rgba(0,255,234,0.1)'); }
                else { gradient.addColorStop(0, 'rgba(255,0,200,0.1)'); gradient.addColorStop(0.5, CONFIG.colorAI); gradient.addColorStop(1, 'rgba(255,0,200,0.1)'); }
                c.shadowBlur = dynamicGlow;
                c.shadowColor = glowColor;
                const radius = this.w / 4;
                c.fillStyle = gradient;
                c.beginPath();
                c.moveTo(this.pos.x + radius, this.pos.y);
                c.lineTo(this.pos.x + this.w - radius, this.pos.y);
                c.quadraticCurveTo(this.pos.x + this.w, this.pos.y, this.pos.x + this.w, this.pos.y + radius);
                c.lineTo(this.pos.x + this.w, this.pos.y + this.h - radius);
                c.quadraticCurveTo(this.pos.x + this.w, this.pos.y + this.h, this.pos.x + this.w - radius, this.pos.y + this.h);
                c.lineTo(this.pos.x + radius, this.pos.y + this.h);
                c.quadraticCurveTo(this.pos.x, this.pos.y + this.h, this.pos.x, this.pos.y + this.h - radius);
                c.lineTo(this.pos.x, this.pos.y + radius);
                c.quadraticCurveTo(this.pos.x, this.pos.y, this.pos.x + radius, this.pos.y);
                c.closePath();
                c.fill();
                const pulse = (Math.sin(performance.now() * 0.008) + 1) * 0.3 + 0.4;
                const pulseSize = 3 + pulse * 2;
                c.fillStyle = `rgba(255,255,255,${0.7 + pulse * 0.3})`;
                c.fillRect(this.pos.x + this.w / 2 - pulseSize / 2, this.pos.y + 4, pulseSize, this.h - 8);
                c.restore();
                oldAiRender.call(this, c);
                if (Math.abs(this.vel.y) > 2) addTrailParticle(this.pos.x + this.w / 2, this.pos.y + (this.vel.y > 0 ? this.h : 0), isP2, movementIntensity);
            };
        }

        // ==================================================================
        // FPS COUNTER
        // ==================================================================
        function setupFpsCounter() {
            if ($('#pp-fps-counter')) return;
            const el = document.createElement('div');
            el.id = 'pp-fps-counter';
            el.textContent = 'FPS: 0';
            document.body.appendChild(el);
            state.ui.fpsCounter = el;
            if (!state.preferences.showFps) el.style.display = 'none';
        }

        function updateFpsLogic() {
            if (!state.ui.fpsCounter || state.ui.fpsCounter.style.display === 'none') return;
            state.fps.frameCount++;
            const now = performance.now();
            if (now - state.fps.lastTime >= CONFIG.fpsUpdateInterval) {
                state.fps.value = Math.round((state.fps.frameCount * 1000) / (now - state.fps.lastTime));
                state.fps.frameCount = 0;
                state.fps.lastTime = now;
            }
            state.ui.fpsCounter.textContent = `FPS: ${state.fps.value}`;
        }

        // ==================================================================
        // AI DIFFICULTY
        // ==================================================================
        function getLiveAIController() {
            const liveAI = window.game?.ai || state.game?.ai || null;
            if (!liveAI) { state.trackedAI = null; return null; }
            state.trackedAI = liveAI;
            if (typeof liveAI === 'object') {
                liveAI.game = window.game || state.game || liveAI.game;
                if (window.game?.ball) liveAI.ball = window.game.ball;
                if (window.game?.aiPaddle) liveAI.paddle = window.game.aiPaddle;
                if (window.game?.canvas) { liveAI.canvasW = window.game.canvas.width; liveAI.canvasH = window.game.canvas.height; }
            }
            return liveAI;
        }

        function updateAIDifficulty(showFeedback = true) {
            const percent = state.preferences.aiDifficulty ?? 50;
            const level = Math.round((percent / 100) * 4);
            const ai = getLiveAIController();
            if (!ai) { console.warn("No AI instance found yet"); return; }
            if (typeof ai.setDifficulty === 'function') {
                ai.setDifficulty(level);
                if (showFeedback) showNeonNotification(`AI difficulty: level ${level} (${percent}%)`, 'success', 2200);
            } else {
                ai.difficulty = level;
            }
        }

        function enhanceAI() {
            if (!getLiveAIController()) { console.warn('Ping Pong Ultimate: AI not found.'); return; }
            updateAIDifficulty(false);
        }

        // ==================================================================
        // CSS INJECTION — DARK NEON CYBERPUNK
        // ==================================================================
        function injectPerfectedTheme() {
            if (document.getElementById('pp-perfected-theme')) return;

            const css = `
/* ── Google Fonts ── */
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');

/* ── Design Tokens ── */
:root {
    --cy-cyan:      #00ffea;
    --cy-cyan-dim:  rgba(0,255,234,0.55);
    --cy-cyan-bg:   rgba(0,255,234,0.07);
    --cy-pink:      #ff00c8;
    --cy-pink-dim:  rgba(255,0,200,0.55);
    --cy-pink-bg:   rgba(255,0,200,0.07);
    --cy-yellow:    #ffe600;
    --cy-yellow-bg: rgba(255,230,0,0.07);
    --cy-bg:        #05000f;
    --cy-surface:   rgba(12,0,28,0.96);
    --cy-border:    rgba(0,255,234,0.18);
    --cy-text:      #c8e0e8;
    --cy-text-dim:  #5a7080;
    --cy-mono:      'Share Tech Mono', 'Courier New', monospace;
    --cy-sans:      'Rajdhani', 'Segoe UI', sans-serif;
    --cy-radius:    6px;
    --cy-glow-c:    0 0 8px var(--cy-cyan), 0 0 20px rgba(0,255,234,0.3);
    --cy-glow-p:    0 0 8px var(--cy-pink), 0 0 20px rgba(255,0,200,0.3);
}

/* ── Menu Button ── */
#cyber-menu-btn {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100003;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    background: var(--cy-surface);
    border: 1px solid var(--cy-cyan-dim);
    border-radius: var(--cy-radius);
    color: var(--cy-cyan);
    font: 700 13px/1 var(--cy-mono);
    letter-spacing: 0.18em;
    cursor: pointer;
    box-shadow: var(--cy-glow-c), inset 0 0 12px rgba(0,255,234,0.04);
    transition: box-shadow 0.2s, border-color 0.2s, background 0.2s;
    /* Subtle scan-line texture */
    background-image: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,255,234,0.015) 2px,
        rgba(0,255,234,0.015) 4px
    );
}
#cyber-menu-btn svg { flex-shrink: 0; }
#cyber-menu-btn .menu-label { display: inline; }
#cyber-menu-btn:hover {
    border-color: var(--cy-cyan);
    box-shadow: 0 0 14px var(--cy-cyan), 0 0 40px rgba(0,255,234,0.35), inset 0 0 18px rgba(0,255,234,0.08);
    background: rgba(0,255,234,0.06);
}
#cyber-menu-btn:active { transform: translateX(-50%) scale(0.97); }

/* ── Control Bar ── */
#cyber-control-bar {
    position: fixed;
    top: 62px;
    left: 50%;
    transform: translateX(-50%) translateY(-8px);
    z-index: 100004;
    padding: 14px 20px;
    background: var(--cy-surface);
    border: 1px solid var(--cy-border);
    border-radius: var(--cy-radius);
    box-shadow:
        0 0 0 1px rgba(0,255,234,0.06) inset,
        0 0 30px rgba(0,255,234,0.12),
        0 20px 60px rgba(0,0,0,0.7);
    background-image: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 3px,
        rgba(0,255,234,0.012) 3px,
        rgba(0,255,234,0.012) 6px
    );
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s ease, transform 0.25s cubic-bezier(0.2, 1, 0.3, 1);
    overflow: hidden;
}
#cyber-control-bar::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--cy-cyan), var(--cy-pink), transparent);
    opacity: 0.6;
}
#cyber-control-bar.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
}

/* Animated scan line inside bar */
.cyber-bar-scan {
    position: absolute;
    top: 0; left: -100%;
    width: 60%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(0,255,234,0.04), transparent);
    animation: barScan 3.5s linear infinite;
    pointer-events: none;
}
@keyframes barScan {
    0%   { left: -60%; }
    100% { left: 120%; }
}

.cyber-bar-inner {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
}

.cyber-btn-group {
    display: flex;
    gap: 8px;
    align-items: center;
}

.cyber-bar-sep {
    width: 1px;
    height: 28px;
    background: linear-gradient(180deg, transparent, var(--cy-cyan-dim), transparent);
    flex-shrink: 0;
}

/* ── Cyber Buttons ── */
.cyber-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 16px;
    background: rgba(0,255,234,0.04);
    border: 1px solid rgba(0,255,234,0.22);
    border-radius: var(--cy-radius);
    color: var(--cy-cyan-dim);
    font: 600 11px/1 var(--cy-mono);
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: all 0.18s ease;
    white-space: nowrap;
    position: relative;
    overflow: hidden;
}
.cyber-btn::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: var(--cy-cyan);
    transform: scaleX(0);
    transition: transform 0.2s ease;
    transform-origin: left;
}
.cyber-btn:hover {
    background: rgba(0,255,234,0.10);
    border-color: var(--cy-cyan);
    color: var(--cy-cyan);
    box-shadow: 0 0 10px rgba(0,255,234,0.2), inset 0 0 8px rgba(0,255,234,0.05);
    transform: translateY(-1px);
}
.cyber-btn:hover::after { transform: scaleX(1); }
.cyber-btn:active { transform: translateY(0) scale(0.97); }

.cyber-btn.secondary {
    border-color: rgba(255,230,0,0.25);
    color: rgba(255,230,0,0.6);
    background: rgba(255,230,0,0.03);
}
.cyber-btn.secondary:hover {
    background: rgba(255,230,0,0.08);
    border-color: var(--cy-yellow);
    color: var(--cy-yellow);
    box-shadow: 0 0 10px rgba(255,230,0,0.2);
}
.cyber-btn.secondary::after { background: var(--cy-yellow); }

.cyber-btn.danger {
    border-color: rgba(255,0,200,0.25);
    color: rgba(255,0,200,0.65);
    background: rgba(255,0,200,0.03);
}
.cyber-btn.danger:hover {
    background: rgba(255,0,200,0.10);
    border-color: var(--cy-pink);
    color: var(--cy-pink);
    box-shadow: 0 0 10px rgba(255,0,200,0.2);
}
.cyber-btn.danger::after { background: var(--cy-pink); }

.cb-icon { display:flex; align-items:center; flex-shrink:0; }
.cb-label { display:inline; }

/* ── Score HUD ── */
#pp-enhanced-hud {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 56px;
    pointer-events: none;
    z-index: 10001;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 clamp(16px, 4vw, 48px);
    background: linear-gradient(180deg, rgba(5,0,15,0.85) 0%, transparent 100%);
    border-bottom: 1px solid rgba(0,255,234,0.08);
}
.pp-score-wrap {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.pp-score-label {
    font: 600 9px/1 var(--cy-mono);
    letter-spacing: 0.2em;
    opacity: 0.45;
}
.player-side .pp-score-label { color: var(--cy-cyan); }
.ai-side .pp-score-label { color: var(--cy-pink); }

.pp-score-display {
    font: 700 38px/1 var(--cy-mono);
    transition: transform 0.2s ease, text-shadow 0.2s ease;
}
.player-score { color: var(--cy-cyan); text-shadow: 0 0 14px rgba(0,255,234,0.5); }
.ai-score { color: var(--cy-pink); text-shadow: 0 0 14px rgba(255,0,200,0.5); }

.pp-score-divider {
    font: 700 11px/1 var(--cy-mono);
    letter-spacing: 0.2em;
    color: rgba(255,255,255,0.2);
}

/* ── Overlay Panels ── */
.pp-overlay-panel {
    position: fixed;
    inset: 0;
    background: rgba(3,0,10,0.88);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 1000000;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
}

.pp-panel-box {
    width: min(480px, 92vw);
    background: var(--cy-surface);
    border: 1px solid var(--cy-border);
    border-radius: var(--cy-radius);
    box-shadow:
        0 0 0 1px rgba(0,255,234,0.04) inset,
        0 0 40px rgba(0,255,234,0.1),
        0 30px 80px rgba(0,0,0,0.8);
    overflow: hidden;
    animation: panelIn 0.28s cubic-bezier(0.2, 1, 0.3, 1);
    background-image: repeating-linear-gradient(
        0deg, transparent, transparent 3px,
        rgba(0,255,234,0.01) 3px, rgba(0,255,234,0.01) 6px
    );
}

@keyframes panelIn {
    from { opacity:0; transform: translateY(16px) scale(0.97); }
    to   { opacity:1; transform: translateY(0) scale(1); }
}

/* Panel top stripe */
#pp-settings-box { border-top: 2px solid var(--cy-cyan); }
#pp-audio-box    { border-top: 2px solid var(--cy-yellow); }
#pp-help-box     { border-top: 2px solid var(--cy-pink); }

.pp-panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(0,255,234,0.08);
}

.pp-panel-icon { display:flex; align-items:center; opacity:0.6; }
#pp-audio-box .pp-panel-icon  { color: var(--cy-yellow); }
#pp-settings-box .pp-panel-icon { color: var(--cy-cyan); }
#pp-help-box .pp-panel-icon   { color: var(--cy-pink); }

.pp-panel-header h2 {
    flex: 1;
    margin: 0;
    font: 700 14px/1 var(--cy-mono);
    letter-spacing: 0.2em;
    color: var(--cy-text);
}

.pp-panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--cy-radius);
    color: var(--cy-text-dim);
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
}
.pp-panel-close:hover {
    background: rgba(255,0,200,0.12);
    border-color: var(--cy-pink);
    color: var(--cy-pink);
}

.pp-panel-content {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    max-height: 52vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--cy-cyan-dim) transparent;
}
.pp-panel-content::-webkit-scrollbar { width:4px; }
.pp-panel-content::-webkit-scrollbar-thumb { background: var(--cy-cyan-dim); border-radius:2px; }

/* ── Sections inside panels ── */
.pp-section {}

.pp-section-title {
    font: 700 9px/1 var(--cy-mono);
    letter-spacing: 0.22em;
    color: var(--cy-text-dim);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0,255,234,0.08);
    text-transform: uppercase;
}

/* ── Checkboxes ── */
.pp-check-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    user-select: none;
}
.pp-check-row:last-child { border-bottom: none; }
.pp-check-row input[type="checkbox"] { display:none; }

.pp-checkmark {
    width: 18px; height: 18px;
    border: 1px solid rgba(0,255,234,0.3);
    border-radius: 3px;
    background: rgba(0,255,234,0.03);
    flex-shrink: 0;
    position: relative;
    transition: all 0.15s ease;
}
.pp-check-row input:checked + .pp-checkmark {
    background: var(--cy-cyan);
    border-color: var(--cy-cyan);
    box-shadow: 0 0 8px rgba(0,255,234,0.4);
}
.pp-check-row input:checked + .pp-checkmark::after {
    content: '';
    position: absolute;
    left: 5px; top: 2px;
    width: 5px; height: 9px;
    border: 2px solid #000;
    border-top: none;
    border-left: none;
    transform: rotate(45deg);
}
.pp-check-label {
    font: 400 13px/1 var(--cy-sans);
    color: var(--cy-text);
    letter-spacing: 0.04em;
}

/* ── Sliders ── */
.pp-slider-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
}
.pp-slider-name {
    font: 600 11px/1 var(--cy-mono);
    color: var(--cy-text-dim);
    width: 52px;
    flex-shrink: 0;
    letter-spacing: 0.06em;
}
.pp-slider {
    flex: 1;
    -webkit-appearance: none;
    height: 3px;
    background: rgba(0,255,234,0.15);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}
.pp-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--cy-cyan);
    border: 2px solid var(--cy-bg);
    box-shadow: 0 0 6px rgba(0,255,234,0.5);
    cursor: pointer;
    transition: box-shadow 0.15s;
}
.pp-slider::-webkit-slider-thumb:hover { box-shadow: 0 0 12px rgba(0,255,234,0.7); }
.pp-slider::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--cy-cyan);
    border: 2px solid var(--cy-bg);
    box-shadow: 0 0 6px rgba(0,255,234,0.5);
    cursor: pointer;
}
.pp-slider-val {
    font: 600 11px/1 var(--cy-mono);
    color: var(--cy-cyan);
    width: 36px;
    text-align: right;
    flex-shrink: 0;
}

/* ── Panel Footer & Buttons ── */
.pp-panel-footer {
    display: flex;
    gap: 10px;
    padding: 16px 24px 20px;
    border-top: 1px solid rgba(0,255,234,0.06);
    flex-wrap: wrap;
}

.pp-btn {
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 11px 20px;
    background: rgba(0,255,234,0.05);
    border: 1px solid rgba(0,255,234,0.25);
    border-radius: var(--cy-radius);
    color: var(--cy-cyan-dim);
    font: 700 11px/1 var(--cy-mono);
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: all 0.18s ease;
    position: relative;
    overflow: hidden;
}
.pp-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0,255,234,0.06), transparent);
    opacity: 0;
    transition: opacity 0.18s;
}
.pp-btn:hover::before { opacity: 1; }
.pp-btn:hover {
    border-color: var(--cy-cyan);
    color: var(--cy-cyan);
    box-shadow: 0 0 12px rgba(0,255,234,0.2), inset 0 0 8px rgba(0,255,234,0.04);
    transform: translateY(-1px);
}
.pp-btn.danger {
    border-color: rgba(255,0,200,0.25);
    color: rgba(255,0,200,0.65);
    background: rgba(255,0,200,0.04);
}
.pp-btn.danger:hover {
    border-color: var(--cy-pink);
    color: var(--cy-pink);
    box-shadow: 0 0 12px rgba(255,0,200,0.2);
}

/* ── Help Panel Specific ── */
.help-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(0,255,234,0.1);
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0 24px;
}
.help-tabs::-webkit-scrollbar { display:none; }

.help-tab {
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--cy-text-dim);
    font: 600 10px/1 var(--cy-mono);
    letter-spacing: 0.12em;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    margin-bottom: -1px;
}
.help-tab:hover { color: var(--cy-pink-dim); }
.help-tab.active {
    color: var(--cy-pink);
    border-bottom-color: var(--cy-pink);
    text-shadow: 0 0 8px rgba(255,0,200,0.4);
}

.help-content { gap: 14px; }

.help-section p {
    font: 400 13px/1.65 var(--cy-sans);
    color: var(--cy-text);
    margin: 0 0 12px;
}
.help-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.help-list li {
    font: 400 12px/1.5 var(--cy-sans);
    color: var(--cy-text-dim);
    padding-left: 14px;
    position: relative;
}
.help-list li::before {
    content: '›';
    position: absolute;
    left: 0;
    color: var(--cy-pink-dim);
}

.help-entry {
    font: 400 13px/1.6 var(--cy-sans);
    color: var(--cy-text);
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.help-entry:last-child { border-bottom: none; }
.help-entry strong {
    color: var(--cy-pink);
    font-weight: 700;
}

/* ── Notifications ── */
#pp-notification-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100007;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(380px, 90vw);
}

#pp-achievement-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100007;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
}

.pp-neon-notification {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: var(--cy-surface);
    border: 1px solid;
    border-radius: var(--cy-radius);
    font: 600 12px/1.4 var(--cy-mono);
    letter-spacing: 0.06em;
    transform: translateY(-8px) scale(0.96);
    opacity: 0;
    transition: all 0.28s cubic-bezier(0.2, 1, 0.3, 1);
    max-width: 340px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.pp-neon-notification .notif-icon { display:flex; align-items:center; flex-shrink:0; opacity:0.75; }
.pp-neon-notification .notif-text { flex:1; }

.pp-neon-notification.achievement {
    border-color: rgba(255,230,0,0.35);
    color: var(--cy-yellow);
    box-shadow: 0 0 16px rgba(255,230,0,0.12), 0 10px 30px rgba(0,0,0,0.5);
}
.pp-neon-notification.success {
    border-color: rgba(0,255,234,0.35);
    color: var(--cy-cyan);
    box-shadow: 0 0 16px rgba(0,255,234,0.12), 0 10px 30px rgba(0,0,0,0.5);
}
.pp-neon-notification.info {
    border-color: rgba(255,0,200,0.35);
    color: var(--cy-pink);
    box-shadow: 0 0 16px rgba(255,0,200,0.12), 0 10px 30px rgba(0,0,0,0.5);
}

/* ── FPS Counter ── */
#pp-fps-counter {
    position: fixed;
    bottom: 16px;
    left: 16px;
    background: var(--cy-surface);
    border: 1px solid rgba(0,255,234,0.15);
    border-radius: var(--cy-radius);
    color: var(--cy-cyan-dim);
    padding: 5px 10px;
    font: 600 10px/1 var(--cy-mono);
    letter-spacing: 0.1em;
    z-index: 10001;
}

/* ── Canvas polish ── */
canvas {
    border-radius: 4px !important;
    box-shadow: 0 0 40px rgba(0,255,234,0.08), 0 0 80px rgba(255,0,200,0.04) !important;
}

/* ── Responsive ── */
@media (max-width: 600px) {
    #cyber-menu-btn .menu-label { display:none; }
    #cyber-menu-btn { padding: 10px 14px; }

    .cyber-bar-sep { display: none; }
    .cyber-bar-inner { gap: 8px; }
    .cyber-btn { padding: 8px 12px; gap: 5px; }
    .cb-label { display: none; }

    .pp-panel-box { width: 96vw; }
    .pp-panel-content { max-height: 48vh; }
    .pp-panel-footer { flex-direction: column; }
    .pp-btn { min-width: unset; }

    .help-tabs { padding: 0 12px; }
    .help-tab { padding: 10px 10px; font-size: 9px; }

    #pp-enhanced-hud { height: 44px; padding: 0 12px; }
    .pp-score-display { font-size: 28px; }
    .pp-score-label { display:none; }
    .pp-score-divider { font-size: 9px; }

    #pp-notification-container { width: 92vw; }
    #pp-achievement-container { right: 10px; bottom: 10px; }
}

@media (min-width: 601px) and (max-width: 900px) {
    .cb-label { font-size: 9px; }
    .cyber-btn { padding: 8px 13px; }
}

/* ── Pop animation for taunt ── */
@keyframes pop {
    0%   { transform: translateX(-50%) scale(0.3); opacity:0; }
    70%  { transform: translateX(-50%) scale(1.1); }
    100% { transform: translateX(-50%) scale(1); opacity:1; }
}
`;

            const styleElement = document.createElement('style');
            styleElement.id = 'pp-perfected-theme';
            styleElement.textContent = css;
            document.head.appendChild(styleElement);
        }

        // ==================================================================
        // ANIMATION LOOP
        // ==================================================================
        function perfectedAnimationLoop() {
            const liveGame = window.game || state.game || null;
            if (liveGame && liveGame !== state.game) state.game = liveGame;
            if (liveGame?.particles?.setEnabled) {
                const shouldEnableParticles = !state.preferences.disableParticles;
                if (liveGame.particles.enabled !== shouldEnableParticles) applyParticlePreference(false);
            }
            const liveAI = window.game?.ai || state.game?.ai || null;
            if (liveAI && liveAI !== state.trackedAI) updateAIDifficulty(false);
            if (state.preferences.showFps) updateFpsLogic();
            requestAnimationFrame(perfectedAnimationLoop);
        }

        // ==================================================================
        // GAME STATE DETECTION
        // ==================================================================
        function waitForGameState() {
            const checkGame = () => {
                if (window.game?.scores && window.game.canvas) {
                    createEnhancedScoreHUD();
                    updateEnhancedScoreHUD(window.game);
                    return true;
                }
                return false;
            };
            if (!checkGame()) {
                const gameCheckInterval = setInterval(() => {
                    if (checkGame()) clearInterval(gameCheckInterval);
                }, 100);
                setTimeout(() => clearInterval(gameCheckInterval), 10000);
            }
        }

        function safeApplyEnhancements(game) {
            try { applyAllPerfected(game); }
            catch (error) {
                console.error('Error applying enhancements:', error);
                try { createEnhancedScoreHUD(); updateEnhancedScoreHUD(game); }
                catch (e) { console.error('Fallback HUD also failed:', e); }
            }
        }

        // ==================================================================
        // MAIN APPLY
        // ==================================================================
        function applyAllPerfected(game) {
            if (state.isEnhanced) return;
            state.game = game;
            state.isEnhanced = true;

            injectPerfectedTheme();
            createCyberBar();
            createEnhancedScoreHUD();
            createSettingsPanel();
            createHelpOverlay();
            createNotificationSystem();

            if (state.preferences.showFps) setupFpsCounter();
            applyParticlePreference(false);
            applyColorPreference(false);
            updateEnhancedScoreHUD(game);
            createPerfectPaddles();
            enhanceAI();
            perfectedAnimationLoop();

            const origScore = game.updateScoreUI;
            game.updateScoreUI = function () {
                const prevTotal = this.scores.player + this.scores.ai;
                origScore.call(this);
                if ((this.scores.player + this.scores.ai) > prevTotal && state.preferences.vibration && 'vibrate' in navigator) {
                    navigator.vibrate([30, 20, 30]);
                }
            };

        }

        // ==================================================================
        // BOOT POLLING
        // ==================================================================
        const enhancementBootAt = Date.now();
        let enhancementTimeoutWarned = false;

        const hasEnhanceableGameCore = () => {
            const g = window.game;
            return !!(g && g.canvas && g.scores);
        };

        const interval = setInterval(() => {
            if (hasEnhanceableGameCore()) {
                if (!state.isEnhanced || window.game !== state.game) {
                    safeApplyEnhancements(window.game);
                    waitForGameState();
                }
                if (state.isEnhanced) {
                    clearInterval(interval);
                }
                return;
            }
            if (!state.isEnhanced && !enhancementTimeoutWarned && Date.now() - enhancementBootAt >= CONFIG.maxWaitTime) {
                enhancementTimeoutWarned = true;
                console.warn('PING PONG ULTIMATE: Still waiting for game bootstrap object.');
            }
        }, CONFIG.checkInterval);

        setTimeout(() => {
        }, 2000);

        window.PingPongPerfected = { version: '6.0-cyberpunk', state, CONFIG, SVG_ICONS };
    })();

    // ==================================================================
    // GOD AI WIRING
    // ==================================================================
    const origApply = window.applyAllPerfected || (() => {});
    window.applyAllPerfected = function (game) {
        origApply(game);
        upgradeToGodAI();
    };

    if (window.game?.canvas) {
        setTimeout(() => upgradeToGodAI(), 1000);
    }

})();
