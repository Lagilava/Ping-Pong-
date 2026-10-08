class ProgressionSystem {
    constructor() {
        this.level = 1;
        this.xp = 0;
        this.requiredXP = this.calculateRequiredXP(1);
        this.unlockedPaddles = ['default'];
        this.lastMatchUnlocked = [];
        this.lastMatchUnlockedIndex = 0;

        this.achievements = {
            firstBlood: {
                name: 'First Blood',
                description: 'Score your first point in any match.',
                icon: '🩸',
                joke: 'Congrats, you discovered that the ball can, in fact, cross the line.',
                unlocked: false
            },

            comeback: {
                name: 'The Comeback',
                description: 'Win a match after trailing by 3 or more points.',
                icon: '🔄',
                joke: 'You were losing for dramatic effect. Totally planned.',
                unlocked: false
            },

            perfectGame: {
                name: 'Perfect Game',
                description: 'Win a match while conceding 0 points.',
                icon: '💎',
                joke: 'The opponent filed a missing persons report for their offense.',
                unlocked: false
            },

            speedDemon: {
                name: 'Speed Demon',
                description: 'Reach ball speed of 1000 in a match.',
                icon: '⚡',
                joke: 'Blink and you miss it. Blink twice and it already scored.',
                unlocked: false
            },

            rallyMaster: {
                name: 'Rally Master',
                description: 'Reach a rally of 20 hits in a match.',
                icon: '🏸',
                joke: 'At this point it is less a rally and more a custody battle.',
                unlocked: false
            },

            powerPlayer: {
                name: 'Power Player',
                description: 'Use 8 power-ups in total.',
                icon: '🔥',
                joke: 'Raw skill is cool, but random glowing buffs are cooler.',
                unlocked: false
            },

            obstacleCourse: {
                name: 'Obstacle Course',
                description: 'Win 1 match in obstacle mode.',
                icon: '🚧',
                joke: 'You beat both the opponent and the furniture.',
                unlocked: false
            },

            gravityMaster: {
                name: 'Gravity Master',
                description: 'Win 1 match in gravity mode.',
                icon: '🪐',
                joke: 'Newton would like to unsubscribe from this timeline.',
                unlocked: false
            },

            zombieSurvivor: {
                name: 'Zombie Survivor',
                description: 'Survive a full zombie match.',
                icon: '🧟',
                joke: 'You survived. Brain cells uncertain.',
                unlocked: false
            },

            zombieWaveRunner: {
                name: 'Wave Runner',
                description: 'Clear 5 zombie waves.',
                icon: '🌊',
                joke: 'You turned wave clearance into a habit.',
                unlocked: false,
                progress: 0,
                maxProgress: 5
            },

            zombieShieldBearer: {
                name: 'Shield Bearer',
                description: 'Block 3 zombie attacks with Shield.',
                icon: '🛡️',
                joke: 'Your shield has seen things and survived them.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            zombieTactician: {
                name: 'Zombie Tactician',
                description: 'Choose 5 wave rewards.',
                icon: '🧠',
                joke: 'Strategic greed is still strategy.',
                unlocked: false,
                progress: 0,
                maxProgress: 5
            },

            speedRunner: {
                name: 'Speed Runner',
                description: 'Win 1 match in speed mode.',
                icon: '💨',
                joke: 'Your strategy: panic, but in high definition.',
                unlocked: false
            },

            speedChallenger: {
                name: 'Speed Challenger',
                description: 'Complete 3 speed challenges.',
                icon: '🚀',
                joke: 'You volunteered for timed stress and called it fun.',
                unlocked: false
            },

            speedMaster: {
                name: 'Speed Master',
                description: 'Complete 7 speed challenges.',
                icon: '👑',
                joke: 'Your reaction time now qualifies as suspicious.',
                unlocked: false
            },

            pongOverlord: {
                name: 'Pong Overlord',
                description: 'Reach level 2.',
                icon: '🎭',
                joke: 'One level gained and the ego patch is already installed.',
                unlocked: false
            },

            chaoticSpeed: {
                name: 'Chaotic Speed',
                description: 'Reach level 3.',
                icon: '🌀',
                joke: 'Control is temporary, chaos is forever.',
                unlocked: false
            },

            spaghettiHands: {
                name: 'Spaghetti Hands',
                description: 'Reach level 4.',
                icon: '🍝',
                joke: 'Motor skills are optional when confidence is maxed.',
                unlocked: false
            },

            laserFocus: {
                name: 'Laser Focus',
                description: 'Reach level 7.',
                icon: '🎯',
                joke: 'You ignored the world and married the ball trajectory.',
                unlocked: false
            },

            brainMelter: {
                name: 'Brain Melter',
                description: 'Reach level 10.',
                icon: '🧠',
                joke: 'Therapist: show me where the velocity touched you.',
                unlocked: false
            },

            level10: {
                name: 'Veteran',
                description: 'Reach level 5.',
                icon: '🎖️',
                joke: 'Five levels in and already giving unsolicited tips.',
                unlocked: false
            },

            unstoppable: {
                name: 'Unstoppable',
                description: 'Win 4 matches in a row.',
                icon: '⚔️',
                joke: 'Momentum acquired. Humility misplaced.',
                unlocked: false
            },

            /* progress-based achievements */
            multiBallMaster: {
                name: 'Multi-Ball Master',
                description: 'Handle 3 extra balls in total.',
                icon: '🍡',
                joke: 'One ball was too mainstream for your brand.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            ghostBallSurvivor: {
                name: 'Ghost Ball Survivor',
                description: 'Survive 60 seconds with ghost ball active.',
                icon: '👻',
                joke: 'You fought what you could not really see. Very normal behavior.',
                unlocked: false,
                progress: 0,
                maxProgress: 60 // seconds
            },

            timeWarpWizard: {
                name: 'Time Warp Wizard',
                description: 'Use time warp 6 times.',
                icon: '⏳',
                joke: 'You bent time and still almost fumbled.',
                unlocked: false,
                progress: 0,
                maxProgress: 6
            },

            magnetMaster: {
                name: 'Magnet Master',
                description: 'Attract the ball 15 times with magnet paddle.',
                icon: '🧲',
                joke: 'Physics called. It wants its integrity back.',
                unlocked: false,
                progress: 0,
                maxProgress: 15
            },

            powerUpCollector: {
                name: 'Power-Up Collector',
                description: 'Use 25 power-ups.',
                icon: '🎁',
                joke: 'You collect buffs like a dragon hoards treasure.',
                unlocked: false,
                progress: 0,
                maxProgress: 25
            },

            rallyLegend: {
                name: 'Rally Legend',
                description: 'Reach a rally of 15 hits.',
                icon: '🥁',
                joke: 'At this length it counts as cardio and emotional damage.',
                unlocked: false,
                progress: 0,
                maxProgress: 15
            },

            speedLegend: {
                name: 'Speed Legend',
                description: 'Reach ball speed of 1400 units.',
                icon: '🌠',
                joke: 'You were no longer playing Pong. You were forecasting weather.',
                unlocked: false,
                progress: 0,
                maxProgress: 1400
            },

            obstacleNavigator: {
                name: 'Obstacle Navigator',
                description: 'Win 3 obstacle mode matches.',
                icon: '🧱',
                joke: 'Congratulations on your diploma in traffic cone studies.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            gravityDefier: {
                name: 'Gravity Defier',
                description: 'Win 2 gravity mode matches.',
                icon: '🛰️',
                joke: 'Gravity had one job and still lost.',
                unlocked: false,
                progress: 0,
                maxProgress: 2
            },

            gameStarter: {
                name: 'Getting Started',
                description: 'Play 3 matches.',
                icon: '🕹️',
                joke: 'Three matches in and already writing your memoir.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            regularPlayer: {
                name: 'Regular Player',
                description: 'Play 10 matches.',
                icon: '📅',
                joke: 'You do this often enough to worry your calendar.',
                unlocked: false,
                progress: 0,
                maxProgress: 10
            },

            marathonSession: {
                name: 'Marathon Session',
                description: 'Play 25 matches.',
                icon: '🏃',
                joke: 'Hydration optional, rematch mandatory.',
                unlocked: false,
                progress: 0,
                maxProgress: 25
            },

            tenWins: {
                name: 'Ten Wins',
                description: 'Win 10 matches.',
                icon: '🏅',
                joke: 'A double-digit number, finally proof for the doubters.',
                unlocked: false,
                progress: 0,
                maxProgress: 10
            },

            twentyWins: {
                name: 'Twenty Wins',
                description: 'Win 20 matches.',
                icon: '🏆',
                joke: 'At this point, the AI knows your footsteps.',
                unlocked: false,
                progress: 0,
                maxProgress: 20
            },

            pointCollector: {
                name: 'Point Collector',
                description: 'Score 50 points total.',
                icon: '💯',
                joke: 'Every point carefully harvested from the fields of chaos.',
                unlocked: false,
                progress: 0,
                maxProgress: 50
            },

            pointBank: {
                name: 'Point Bank',
                description: 'Score 150 points total.',
                icon: '🏦',
                joke: 'Interest rate: one panic rally per minute.',
                unlocked: false,
                progress: 0,
                maxProgress: 150
            },

            closeCallWinner: {
                name: 'Close Call',
                description: 'Win 2 matches by one point.',
                icon: '😅',
                joke: 'Victory by exactly one heartbeat.',
                unlocked: false,
                progress: 0,
                maxProgress: 2
            },

            dominantDisplay: {
                name: 'Dominant Display',
                description: 'Win 3 matches by 5+ points.',
                icon: '📈',
                joke: 'You call it balance. The scoreboard disagrees.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            tidyDefense: {
                name: 'Tidy Defense',
                description: 'Win 3 matches while allowing 2 or fewer points.',
                icon: '🛡️',
                joke: 'You allowed exactly enough hope to keep it interesting.',
                unlocked: false,
                progress: 0,
                maxProgress: 3
            },

            modeExplorer: {
                name: 'Mode Explorer',
                description: 'Win in 2 different special modes.',
                icon: '🗺️',
                joke: 'Tourist behavior, but with competitive intent.',
                unlocked: false,
                progress: 0,
                maxProgress: 2
            },

            modeConqueror: {
                name: 'Mode Conqueror',
                description: 'Win in all 4 special modes.',
                icon: '🌍',
                joke: 'You touched every mode and left fingerprints everywhere.',
                unlocked: false,
                progress: 0,
                maxProgress: 4
            }
        };


        this.powerUpsUsed = 0;
        this.gamesWon = 0;
        this.gamesPlayed = 0;
        this.gamesLost = 0;
        this.winStreak = 0;
        this.speedChallengesCompleted = 0;
        this.totalPointsScored = 0;
        this.totalPointsConceded = 0;
        this.closeWins = 0;
        this.bigWins = 0;
        this.tidyWins = 0;
        this.zombieWavesCleared = 0;
        this.zombieShieldBlocks = 0;
        this.zombiePowerChoices = 0;
        this.specialModeWins = {
            speed: 0,
            obstacle: 0,
            gravity: 0,
            zombie: 0
        };

        // UI state for achievement sidebar filtering
        this.achievementFilter = '';

        this.recentlyUnlocked = [];
        this.allUnlockedShown = false;
        this.matchSnapshot = null;
        this.activeNotifications = new Set();
        this.notificationQueue = [];
        this.maxNotifications = 1; // Show one by one
        this.notificationDuration = 4000;

        this.notificationContainer = null;
        this.animationFrameId = null;
        this.lastFrameTime = 0;

        this.setupAchievementHotkeys();
        this.createAchievementSidebar();
        this.addGlobalStyles();
        this.setupNotificationContainer();
        // Load persisted progression if available (do this after structure created)
        this.loadProgress();
        // Ensure any progress-maxed achievements are unlocked after load
        this.checkMilestoneAchievements();
        // make sure sidebar reflects persisted unlocks immediately    
        this.updateAchievementSidebar();
        // If this appears to be a fresh install with no saved progress,
        // show the first-launch message for new players.
        try { this.checkFirstLaunchAndShow(); } catch (e) { /* ignore */ }
        // if page is restored from cache or reloaded, update sidebar again
        window.addEventListener('pageshow', () => this.updateAchievementSidebar());
        // We'll process the queue instead of a continuous loop for stacking
    }

    calculateRequiredXP(level) {
        return Math.floor(35 * Math.pow(1.35, level - 1));
    }

    addXP(amount) {
        this.xp += amount;
        let levelsGained = 0;

        while (this.xp >= this.requiredXP) {
            this.xp -= this.requiredXP;
            this.level++;
            levelsGained++;
            this.requiredXP = this.calculateRequiredXP(this.level);
        }

        if (levelsGained > 0) {
            this.queueNotification(
                `Level Up! ×${levelsGained}`,
                `Reached level ${this.level}! 🎉`
            );
            this.checkLevelUnlocks();
        }

        this.updateUI();
        this.saveProgress();
    }

    checkLevelUnlocks() {
        const levelUnlocks = {
            2: 'pongOverlord',
            3: 'chaoticSpeed',
            4: 'spaghettiHands',
            5: 'level10', // veteran at level 5 now
            6: 'speedDemon',
            7: 'laserFocus',
            8: 'rallyMaster',
            9: 'powerPlayer',
            10: 'brainMelter'
        };

        if (levelUnlocks[this.level]) {
            const achId = levelUnlocks[this.level];
            if (!this.achievements[achId]?.unlocked) {
                this.unlockAchievement(achId);
            }
        }
    }

    unlockAchievement(id) {
        // Completely block achievements if in PvP / Multiplayer mode
        if (window.game?.isMultiplayer) {
            return;
        }

        if (!this.achievements?.[id]) {
            console.warn(`Achievement not found: ${id}`);
            return;
        }

        if (this.achievements[id].unlocked) {
            return;
        }

        this.achievements[id].unlocked = true;

        const { name: title, description: desc, icon } = this.achievements[id];

        this.recentlyUnlocked.push({ id, title, desc, icon });
        window.__ppLastMatchAchievements = this.recentlyUnlocked.slice();
        window.__ppLastMatchAchievementIndex = 0;
        window.__ppMenuRecentAchievements = this.recentlyUnlocked.slice();
        window.__ppMenuRecentAchievementIndex = 0;
        window.__ppMenuLastNonEmptyAchievements = this.recentlyUnlocked.slice();
        window.__ppMenuLastNonEmptyAchievementIndex = 0;
        window.__ppMenuDisplayAchievements = this.recentlyUnlocked.slice();
        window.__ppMenuDisplayAchievementIndex = 0;
        try { window.__ppTraceMenuAchievements('unlockAchievement', { id, title }); } catch (_) { }

        // Update menu achievements display
        if (typeof updateMenuAchievements === 'function' && document.getElementById('menuAchievementsList')) {
            updateMenuAchievements();
        }

        this.queueNotification(title, desc);
        this.addXP(75);
        this.updateAchievementSidebar();
        this.saveProgress();
        // If this was the final unlocked achievement, show the completion overlay
        try { this.checkAllUnlockedAndShow(); } catch (e) { /* ignore */ }
    }

    // helper for tracking partial-progress achievements
    incrementAchievementProgress(id, amount = 1) {
        const ach = this.achievements?.[id];
        if (!ach || ach.unlocked || typeof ach.progress !== 'number' || typeof ach.maxProgress !== 'number') return;
        ach.progress = Math.min(ach.maxProgress, ach.progress + amount);
        if (ach.progress >= ach.maxProgress) {
            this.unlockAchievement(id);
            // unlockAchievement will save
        } else {
            // Some callers report progress every physics step (e.g. seconds
            // survived), so coalesce the sidebar rebuild and localStorage write.
            this.scheduleProgressFlush();
        }
    }

    scheduleProgressFlush() {
        if (this._progressFlushTimer) return;
        this._progressFlushTimer = setTimeout(() => {
            this._progressFlushTimer = null;
            this.updateAchievementSidebar();
            this.saveProgress();
        }, 750);
    }

    buildProgressPayload() {
        const payload = {
            level: this.level,
            xp: this.xp,
            requiredXP: this.requiredXP,
            unlockedPaddles: this.unlockedPaddles,
            gamesWon: this.gamesWon,
            gamesPlayed: this.gamesPlayed,
            gamesLost: this.gamesLost,
            winStreak: this.winStreak,
            speedChallengesCompleted: this.speedChallengesCompleted,
            powerUpsUsed: this.powerUpsUsed,
            totalPointsScored: this.totalPointsScored,
            totalPointsConceded: this.totalPointsConceded,
            closeWins: this.closeWins,
            bigWins: this.bigWins,
            tidyWins: this.tidyWins,
            zombieWavesCleared: this.zombieWavesCleared,
            zombieShieldBlocks: this.zombieShieldBlocks,
            zombiePowerChoices: this.zombiePowerChoices,
            specialModeWins: { ...this.specialModeWins },
            achievements: {}
        };
        for (const k of Object.keys(this.achievements)) {
            const a = this.achievements[k];
            payload.achievements[k] = {
                unlocked: !!a.unlocked,
                progress: typeof a.progress === 'number' ? a.progress : undefined
            };
        }
        return payload;
    }

    applyProgressPayload(data) {
        if (!data || typeof data !== 'object') return;
        if (typeof data.level === 'number') this.level = data.level;
        if (typeof data.xp === 'number') this.xp = data.xp;
        if (typeof data.requiredXP === 'number') this.requiredXP = data.requiredXP;
        if (Array.isArray(data.unlockedPaddles)) this.unlockedPaddles = data.unlockedPaddles;
        if (typeof data.gamesWon === 'number') this.gamesWon = data.gamesWon;
        if (typeof data.gamesPlayed === 'number') this.gamesPlayed = data.gamesPlayed;
        if (typeof data.gamesLost === 'number') this.gamesLost = data.gamesLost;
        if (typeof data.winStreak === 'number') this.winStreak = data.winStreak;
        if (typeof data.speedChallengesCompleted === 'number') this.speedChallengesCompleted = data.speedChallengesCompleted;
        if (typeof data.powerUpsUsed === 'number') this.powerUpsUsed = data.powerUpsUsed;
        if (typeof data.totalPointsScored === 'number') this.totalPointsScored = data.totalPointsScored;
        if (typeof data.totalPointsConceded === 'number') this.totalPointsConceded = data.totalPointsConceded;
        if (typeof data.closeWins === 'number') this.closeWins = data.closeWins;
        if (typeof data.bigWins === 'number') this.bigWins = data.bigWins;
        if (typeof data.tidyWins === 'number') this.tidyWins = data.tidyWins;
        if (typeof data.zombieWavesCleared === 'number') this.zombieWavesCleared = data.zombieWavesCleared;
        if (typeof data.zombieShieldBlocks === 'number') this.zombieShieldBlocks = data.zombieShieldBlocks;
        if (typeof data.zombiePowerChoices === 'number') this.zombiePowerChoices = data.zombiePowerChoices;
        if (data.specialModeWins && typeof data.specialModeWins === 'object') {
            this.specialModeWins.speed = Number(data.specialModeWins.speed || 0);
            this.specialModeWins.obstacle = Number(data.specialModeWins.obstacle || 0);
            this.specialModeWins.gravity = Number(data.specialModeWins.gravity || 0);
            this.specialModeWins.zombie = Number(data.specialModeWins.zombie || 0);
        }
        if (data.achievements && typeof data.achievements === 'object') {
            for (const k of Object.keys(data.achievements)) {
                if (!this.achievements[k]) continue;
                const a = data.achievements[k];
                if (typeof a.unlocked === 'boolean') this.achievements[k].unlocked = a.unlocked;
                if (typeof a.progress === 'number') this.achievements[k].progress = a.progress;
            }
        }
        if (!data.requiredXP) this.requiredXP = this.calculateRequiredXP(this.level);
    }

    hasMatchSnapshot() {
        return !!this.matchSnapshot;
    }

    captureMatchSnapshot() {
        this.matchSnapshot = this.buildProgressPayload();
    }

    clearMatchSnapshot() {
        this.matchSnapshot = null;
    }

    rollbackMatchSnapshot() {
        if (!this.matchSnapshot) return false;
        this.applyProgressPayload(this.matchSnapshot);
        this.clearRecentlyUnlocked();
        this.cleanupNotifications();
        this.updateAchievementSidebar();
        this.updateUI();
        this.saveProgress();
        this.matchSnapshot = null;
        return true;
    }

    // Persist progression/achievements to localStorage so quitting the match
    // or re-instantiating the Game doesn't reset player progression.
    saveProgress() {
        try {
            const payload = this.buildProgressPayload();
            localStorage.setItem('pp-progression-v1', JSON.stringify(payload));
        } catch (e) {
            console.warn('Failed to save progression:', e);
        }
    }

    loadProgress() {
        try {
            const raw = localStorage.getItem('pp-progression-v1');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (typeof data.level === 'number') this.level = data.level;
            if (typeof data.xp === 'number') this.xp = data.xp;
            if (typeof data.requiredXP === 'number') this.requiredXP = data.requiredXP;
            if (Array.isArray(data.unlockedPaddles)) this.unlockedPaddles = data.unlockedPaddles;
            if (typeof data.gamesWon === 'number') this.gamesWon = data.gamesWon;
            if (typeof data.gamesPlayed === 'number') this.gamesPlayed = data.gamesPlayed;
            if (typeof data.gamesLost === 'number') this.gamesLost = data.gamesLost;
            if (typeof data.winStreak === 'number') this.winStreak = data.winStreak;
            if (typeof data.speedChallengesCompleted === 'number') this.speedChallengesCompleted = data.speedChallengesCompleted;
            if (typeof data.powerUpsUsed === 'number') this.powerUpsUsed = data.powerUpsUsed;
            if (typeof data.totalPointsScored === 'number') this.totalPointsScored = data.totalPointsScored;
            if (typeof data.totalPointsConceded === 'number') this.totalPointsConceded = data.totalPointsConceded;
            if (typeof data.closeWins === 'number') this.closeWins = data.closeWins;
            if (typeof data.bigWins === 'number') this.bigWins = data.bigWins;
            if (typeof data.tidyWins === 'number') this.tidyWins = data.tidyWins;
            if (data.specialModeWins && typeof data.specialModeWins === 'object') {
                this.specialModeWins.speed = Number(data.specialModeWins.speed || 0);
                this.specialModeWins.obstacle = Number(data.specialModeWins.obstacle || 0);
                this.specialModeWins.gravity = Number(data.specialModeWins.gravity || 0);
                this.specialModeWins.zombie = Number(data.specialModeWins.zombie || 0);
            }
            if (typeof data.zombieWavesCleared === 'number') this.zombieWavesCleared = data.zombieWavesCleared;
            if (typeof data.zombieShieldBlocks === 'number') this.zombieShieldBlocks = data.zombieShieldBlocks;
            if (typeof data.zombiePowerChoices === 'number') this.zombiePowerChoices = data.zombiePowerChoices;
            if (data.achievements && typeof data.achievements === 'object') {
                for (const k of Object.keys(data.achievements)) {
                    if (!this.achievements[k]) continue;
                    const a = data.achievements[k];
                    if (typeof a.unlocked === 'boolean') this.achievements[k].unlocked = a.unlocked;
                    if (typeof a.progress === 'number') this.achievements[k].progress = a.progress;
                }
            }
            // ensure requiredXP matches level if not present
            if (!data.requiredXP) this.requiredXP = this.calculateRequiredXP(this.level);
            // Force unlock for any progress-based achievements at or above maxProgress
            for (const k of Object.keys(this.achievements)) {
                const a = this.achievements[k];
                if (!a.unlocked && typeof a.progress === 'number' && typeof a.maxProgress === 'number' && a.progress >= a.maxProgress) {
                    this.unlockAchievement(k);
                }
            }
            this.checkMilestoneAchievements();
            // refresh sidebar so unlocked achievements appear after load
            this.updateAchievementSidebar();
            // If load restored a full collection, show the completion overlay
            try { this.checkAllUnlockedAndShow(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.warn('Failed to load progression:', e);
        }
    }

    // Queue system to show notifications one by one
    queueNotification(title, description) {
        this.notificationQueue.push({ title, description });
        this.processNotificationQueue();
    }

    processNotificationQueue() {
        // Only show if nothing is currently being displayed
        if (this.activeNotifications.size > 0 || this.notificationQueue.length === 0) return;

        const { title, description } = this.notificationQueue.shift();
        this.showSubtleAchievement(title, description);
    }

    // (container setup removed - enhanced system will handle notifications)
    setupNotificationContainer() {
        if (this.notificationContainer) return;

        this.notificationContainer = document.createElement('div');
        this.notificationContainer.className = 'achievement-notifications-container';
        document.body.appendChild(this.notificationContainer);
    }

    showSubtleAchievement(title, description) {

        // Ensure container exists
        if (!this.notificationContainer) {
            this.setupNotificationContainer();
        }

        // Xbox-style notification implementation
        const notif = document.createElement('div');
        notif.className = 'achievement-notification';
        const nid = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        notif.dataset.id = nid;
        notif.dataset.timestamp = Date.now().toString();

        notif.innerHTML = `
            <div class="achievement-notification-inner">
                <div class="xbox-icon-container">
                    <div class="xbox-trophy-circle">
                        🏆
                    </div>
                </div>
                <div class="xbox-text-container">
                    <div class="xbox-header-text">ACHIEVEMENT UNLOCKED</div>
                    <div class="xbox-title-text">${title}</div>
                </div>
                <div class="xbox-gamerscore">
                    <span class="gs-icon">G</span> 50
                </div>
            </div>
        `;

        this.notificationContainer.appendChild(notif);
        this.activeNotifications.add(nid);

        // Trigger entry animation
        requestAnimationFrame(() => {
            notif.classList.add('visible');
            this.playAchievementSound();
        });

        // Auto-remove after duration
        setTimeout(() => {
            this.removeNotification(notif);
        }, this.notificationDuration);
    }

    removeNotification(notif) {
        if (!notif?.parentNode) return;

        if (notif.dataset.removeTimeout) {
            clearTimeout(notif.dataset.removeTimeout);
        }

        notif.classList.add('fading');

        setTimeout(() => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }

            const nid = notif.dataset.id;
            this.activeNotifications.delete(nid);

            // Process next in queue after a tiny delay for smoothness
            setTimeout(() => this.processNotificationQueue(), 300);
        }, 600);
    }

    processNotificationQueue() {
        if (this.activeNotifications.size >= this.maxNotifications) return;
        if (!this.notificationQueue.length) return;

        const { title, description } = this.notificationQueue.shift();
        this.showSubtleAchievement(title, description);
    }

    handleNotificationStacking() {
        const items = [...this.notificationContainer.querySelectorAll('.achievement-notification')];

        items.sort((a, b) => {
            return parseInt(a.dataset.timestamp || '0', 10) - parseInt(b.dataset.timestamp || '0', 10);
        });

        items.forEach((el, i) => {
            const offset = i * 35;
            el.style.transform = `translateY(${offset}px)`;
            el.style.zIndex = 10000 + (items.length - i);
        });
    }

    startAnimationLoop() {
        const animate = (timestamp) => {
            if (!this.lastFrameTime) this.lastFrameTime = timestamp;
            if (timestamp - this.lastFrameTime >= 16.6) {
                if (this.activeNotifications.size > 0) {
                    this.handleNotificationStacking();
                }
                this.lastFrameTime = timestamp;
            }
            this.animationFrameId = requestAnimationFrame(animate);
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }

    stopAnimationLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    cleanupNotifications() {
        this.stopAnimationLoop();

        this.notificationContainer?.querySelectorAll('.achievement-notification').forEach(notif => {
            if (notif.dataset.removeTimeout) {
                clearTimeout(notif.dataset.removeTimeout);
            }
            notif.remove();
        });

        this.activeNotifications.clear();
        this.notificationQueue = [];

        if (this.notificationContainer && this.notificationContainer.parentNode) {
            this.notificationContainer.parentNode.removeChild(this.notificationContainer);
        }
        this.notificationContainer = null;
    }

    showEndGameAchievementSummary() {
        if (!this.recentlyUnlocked.length) return;

        const modal = document.createElement('div');
        modal.className = 'achievement-summary-modal';
        modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.88); backdrop-filter: blur(10px);
    z-index: 200000; display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none; transition: opacity 0.35s ease;
`;

        const itemsHTML = this.recentlyUnlocked.map(a => `
    <div class="summary-item" style="
        display: flex; align-items: center; gap: 14px; padding: 14px;
        background: rgba(255,255,255,0.06); border-radius: 10px; margin-bottom: 10px;
        opacity: 0; transform: translateX(-16px); transition: all 0.4s ease;
    ">
        <div class="summary-icon" style="
            width: 36px; height: 36px; background: rgba(255,215,0,0.18);
            border-radius: 50%; font-size: 18px; color: #ffd700;
            display: flex; align-items: center; justify-content: center;
        ">🏆</div>
        <div class="summary-content" style="flex:1;">
            <div class="summary-title" style="font-size:15px; font-weight:600; color:#fff; margin-bottom:3px;">${a.title}</div>
            <div class="summary-desc" style="font-size:12.5px; color:rgba(255,255,255,0.78);">${a.desc}</div>
        </div>
        <div class="summary-xp" style="color:#ffd700; font-weight:600; font-size:13px;">+75 XP</div>
    </div>
`).join('');

        modal.innerHTML = `
    <div class="achievement-summary-content" style="
        background: linear-gradient(135deg, rgba(15,20,45,0.96), rgba(25,30,55,0.98));
        border-radius: 16px; padding: 24px; max-width: 460px; width: 92%;
        max-height: 82vh; overflow-y: auto; box-shadow: 0 16px 50px rgba(0,0,0,0.7);
        border: 1px solid rgba(255,215,0,0.25); transform: translateY(24px);
        transition: transform 0.4s ease;
    ">
        <div class="summary-header" style="text-align:center; margin-bottom:20px;">
            <h3 style="font-size:22px; color:#ffd700; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:1px;">
                Achievements Unlocked
            </h3>
            <span style="
                background: rgba(255,215,0,0.2); color:#ffd700; padding:4px 10px;
                border-radius:16px; font-size:13px; font-weight:600;
            ">${this.recentlyUnlocked.length}</span>
        </div>
        ${itemsHTML}
        <div style="text-align:center; margin-top:20px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.12); color:rgba(255,255,255,0.55); font-size:12.5px;">
            To view the achievements again press Ctrl + Shift + A<br>
            Click anywhere or press ESC to continue
        </div>
    </div>
`;

        document.body.appendChild(modal);

        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'all';
            modal.querySelector('.achievement-summary-content').style.transform = 'translateY(0)';

            modal.querySelectorAll('.summary-item').forEach((item, i) => {
                setTimeout(() => {
                    item.style.opacity = '1';
                    item.style.transform = 'translateX(0)';
                }, 60 + i * 70);
            });
        });

        const menuAchievementsStrip = document.getElementById('menuRecentAchievements');
        if (menuAchievementsStrip) {
            menuAchievementsStrip.style.display = 'none';
        }
        try { window.__ppTraceMenuAchievements('showEndGameAchievementSummary:open'); } catch (_) { }

        const close = () => {
            try { window.__ppTraceMenuAchievements('showEndGameAchievementSummary:close:start'); } catch (_) { }
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            modal.querySelector('.achievement-summary-content').style.transform = 'translateY(24px)';

            setTimeout(() => {
                try { window.__ppTraceMenuAchievements('showEndGameAchievementSummary:close:before-clear'); } catch (_) { }
                modal.remove();
                this.clearRecentlyUnlocked();
                try { window.__ppTraceMenuAchievements('showEndGameAchievementSummary:close:after-clear'); } catch (_) { }
                const preservedMenuAchievements = Array.isArray(window.__ppMenuLastNonEmptyAchievements) && window.__ppMenuLastNonEmptyAchievements.length
                    ? window.__ppMenuLastNonEmptyAchievements.slice()
                    : [];
                if (preservedMenuAchievements.length) {
                    window.__ppMenuRecentAchievements = preservedMenuAchievements.slice();
                    window.__ppMenuRecentAchievementIndex = 0;
                    window.__ppLastMatchAchievements = preservedMenuAchievements.slice();
                    window.__ppLastMatchAchievementIndex = 0;
                    window.__ppMenuDisplayAchievements = preservedMenuAchievements.slice();
                    window.__ppMenuDisplayAchievementIndex = 0;
                    if (this.lastMatchUnlocked.length !== preservedMenuAchievements.length) {
                        this.lastMatchUnlocked = preservedMenuAchievements.slice();
                        this.lastMatchUnlockedIndex = 0;
                    }
                }
                if (menuAchievementsStrip) {
                    menuAchievementsStrip.style.display = '';
                }
                if (typeof updateMenuAchievements === 'function') {
                    try { updateMenuAchievements(); } catch (e) { /* ignore */ }
                }
                try { window.__ppTraceMenuAchievements('showEndGameAchievementSummary:close:after-update'); } catch (_) { }
            }, 400);
        };

        modal.addEventListener('click', close);

        const escHandler = e => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    getRecentlyUnlockedAchievements() {
        return [...this.recentlyUnlocked];
    }

    captureMatchAchievements() {
        this.lastMatchUnlocked = this.getRecentlyUnlockedAchievements();
        this.lastMatchUnlockedIndex = 0;
        window.__ppLastMatchAchievements = this.lastMatchUnlocked.slice();
        window.__ppLastMatchAchievementIndex = 0;
        window.__ppMenuRecentAchievements = this.lastMatchUnlocked.slice();
        window.__ppMenuRecentAchievementIndex = 0;
        window.__ppMenuLastNonEmptyAchievements = this.lastMatchUnlocked.slice();
        window.__ppMenuLastNonEmptyAchievementIndex = 0;
        window.__ppMenuDisplayAchievements = this.lastMatchUnlocked.slice();
        window.__ppMenuDisplayAchievementIndex = 0;
        try { window.__ppTraceMenuAchievements('captureMatchAchievements', { count: this.lastMatchUnlocked.length }); } catch (_) { }
    }

    getLastMatchUnlockedAchievements() {
        return [...this.lastMatchUnlocked];
    }

    getNextLastMatchUnlockedAchievement() {
        if (!this.lastMatchUnlocked.length) return null;
        const index = this.lastMatchUnlockedIndex % this.lastMatchUnlocked.length;
        const achievement = this.lastMatchUnlocked[index];
        this.lastMatchUnlockedIndex = (index + 1) % this.lastMatchUnlocked.length;
        return achievement;
    }

    clearLastMatchUnlockedAchievements() {
        const stack = (new Error('[MatchSnapshotClear] clearLastMatchUnlockedAchievements')).stack || '';
        const stackLine = stack.split('\n').slice(1, 5).map(line => line.trim());
        const clearEvent = {
            at: new Date().toISOString(),
            reason: 'clearLastMatchUnlockedAchievements',
            stack: stackLine,
            before: {
                lastMatchUnlockedCount: this.lastMatchUnlocked.length,
                windowLastMatchCount: Array.isArray(window.__ppLastMatchAchievements) ? window.__ppLastMatchAchievements.length : null,
                windowMenuRecentCount: Array.isArray(window.__ppMenuRecentAchievements) ? window.__ppMenuRecentAchievements.length : null
            }
        };
        window.__ppSnapshotClearEvents.push(clearEvent);
        window.__ppLastSnapshotClearEvent = clearEvent;
        console.warn('[MatchSnapshotClear]', clearEvent);
        try { window.__ppTraceMenuAchievements('clearLastMatchUnlockedAchievements', { clearEvent }); } catch (_) { }
        this.lastMatchUnlocked = [];
        this.lastMatchUnlockedIndex = 0;
        window.__ppLastMatchAchievements = [];
        window.__ppLastMatchAchievementIndex = 0;
        window.__ppMenuRecentAchievements = [];
        window.__ppMenuRecentAchievementIndex = 0;
    }

    clearRecentlyUnlocked() {
        this.recentlyUnlocked = [];
    }

    updateUI() {
        const progress = this.requiredXP > 0 ? (this.xp / this.requiredXP) * 100 : 0;

        const els = {
            xpBar: document.getElementById('xpBar'),
            xpText: document.getElementById('xpText'),
            playerLvl: document.getElementById('playerLevel'),
            menuLvl: document.getElementById('menuLevel'),
            menuXpBar: document.getElementById('menuXpBar'),
            menuXpText: document.getElementById('menuXpText')
        };

        if (els.xpBar) els.xpBar.style.width = `${progress}%`;
        if (els.xpText) els.xpText.textContent = `Lv${this.level} ${this.xp}/${this.requiredXP}`;
        if (els.playerLvl) els.playerLvl.textContent = this.level;
        if (els.menuLvl) els.menuLvl.textContent = this.level;
        if (els.menuXpBar) els.menuXpBar.style.width = `${progress}%`;
        if (els.menuXpText) els.menuXpText.textContent = `${this.xp}/${this.requiredXP} XP`;
    }

    recordGameWin(wasComeback, gameMode = 'classic', matchStats = {}) {
        this.gamesPlayed++;
        this.gamesWon++;
        this.winStreak++;

        const playerScore = Number(matchStats.playerScore || 0);
        const aiScore = Number(matchStats.aiScore || 0);

        if (playerScore - aiScore === 1) this.closeWins++;
        if (playerScore - aiScore >= 5) this.bigWins++;
        if (aiScore <= 2) this.tidyWins++;

        if (wasComeback && !this.achievements.comeback.unlocked) {
            this.unlockAchievement('comeback');
        }

        if (this.winStreak >= 4 && !this.achievements.unstoppable.unlocked) {
            this.unlockAchievement('unstoppable');
        }

        // Mode-specific achievements
        if (gameMode === 'speed') {
            if (!this.achievements.speedRunner.unlocked) {
                this.unlockAchievement('speedRunner');
            }
            this.specialModeWins.speed++;
        }
        if (gameMode === 'obstacle') {
            if (!this.achievements.obstacleCourse.unlocked) {
                this.unlockAchievement('obstacleCourse');
            }
            this.incrementAchievementProgress('obstacleNavigator');
            this.specialModeWins.obstacle++;
        }
        if (gameMode === 'gravity') {
            if (!this.achievements.gravityMaster.unlocked) {
                this.unlockAchievement('gravityMaster');
            }
            this.incrementAchievementProgress('gravityDefier');
            this.specialModeWins.gravity++;
        }
        if (gameMode === 'zombie') {
            if (!this.achievements.zombieSurvivor.unlocked) {
                this.unlockAchievement('zombieSurvivor');
            }
            this.zombieWavesCleared += Number(matchStats.wavesCleared || 0);
            this.zombieShieldBlocks += Number(matchStats.zombieShieldBlocks || 0);
            this.zombiePowerChoices += Number(matchStats.zombiePowerChoices || 0);
            this.specialModeWins.zombie++;
        }

        this.checkMilestoneAchievements();
        this.saveProgress();
    }

    recordGameLoss() {
        this.gamesPlayed++;
        this.gamesLost++;
        this.winStreak = 0;
        this.checkMilestoneAchievements();
        this.saveProgress();
    }

    recordSpeedChallenge() {
        this.speedChallengesCompleted++;
        if (this.speedChallengesCompleted >= 3 && !this.achievements.speedChallenger.unlocked) {
            this.unlockAchievement('speedChallenger');
        }
        if (this.speedChallengesCompleted >= 7 && !this.achievements.speedMaster.unlocked) {
            this.unlockAchievement('speedMaster');
        }
        this.saveProgress();
    }

    recordPowerUpUsed() {
        this.powerUpsUsed++;
        // progress-based achievement
        this.incrementAchievementProgress('powerUpCollector');

        if (this.powerUpsUsed >= 8 && !this.achievements.powerPlayer.unlocked) {
            this.unlockAchievement('powerPlayer');
        }

        this.saveProgress();
    }

    recordPoint(scorer, points = 1) {
        const safePoints = Math.max(0, Number(points) || 0);
        if (safePoints <= 0) return;

        if (scorer === 'player') {
            this.totalPointsScored += safePoints;
        } else if (scorer === 'ai') {
            this.totalPointsConceded += safePoints;
        }

        this.checkMilestoneAchievements();
        this.saveProgress();
    }

    checkMilestoneAchievements() {
        this.syncProgressAchievement('gameStarter', this.gamesPlayed);
        this.syncProgressAchievement('regularPlayer', this.gamesPlayed);
        this.syncProgressAchievement('marathonSession', this.gamesPlayed);

        this.syncProgressAchievement('tenWins', this.gamesWon);
        this.syncProgressAchievement('twentyWins', this.gamesWon);

        this.syncProgressAchievement('pointCollector', this.totalPointsScored);
        this.syncProgressAchievement('pointBank', this.totalPointsScored);

        this.syncProgressAchievement('closeCallWinner', this.closeWins);
        this.syncProgressAchievement('dominantDisplay', this.bigWins);
        this.syncProgressAchievement('tidyDefense', this.tidyWins);
        this.syncProgressAchievement('zombieWaveRunner', this.zombieWavesCleared);
        this.syncProgressAchievement('zombieShieldBearer', this.zombieShieldBlocks);
        this.syncProgressAchievement('zombieTactician', this.zombiePowerChoices);

        const specialModeCount = ['speed', 'obstacle', 'gravity', 'zombie']
            .reduce((count, mode) => count + (this.specialModeWins[mode] > 0 ? 1 : 0), 0);
        this.syncProgressAchievement('modeExplorer', specialModeCount);
        this.syncProgressAchievement('modeConqueror', specialModeCount);
    }

    syncProgressAchievement(id, targetValue) {
        const ach = this.achievements?.[id];
        if (!ach || ach.unlocked || typeof ach.progress !== 'number' || typeof ach.maxProgress !== 'number') return;
        const normalizedTarget = Math.max(ach.progress, Math.min(ach.maxProgress, Number(targetValue) || 0));
        if (normalizedTarget <= ach.progress) return;
        ach.progress = normalizedTarget;
        if (ach.progress >= ach.maxProgress) {
            this.unlockAchievement(id);
        }
    }

    createAchievementSidebar() {
        const sidebar = document.createElement('div');
        sidebar.className = 'achievement-sidebar';
        sidebar.innerHTML = `
<div class="sidebar-header">
    <div class="header-content">
        <span class="header-icon">🏆</span>
        <h3>Achievements</h3>
    </div>
    <button class="close-sidebar" aria-label="Close">×</button>
</div>
<div class="sidebar-search-container">
    <input type="text" class="sidebar-search" placeholder="Search achievements…">
</div>
<div class="achievement-list" id="sidebarAchievements"></div>
<div class="sidebar-footer">
    <div class="progress-stats-container">
        <div class="overall-progress-header">
            <span class="overall-label">Collection Progress</span>
            <div class="overall-count"><span id="achievementCount">0</span> / ${Object.keys(this.achievements).length}</div>
        </div>
        <div class="overall-progress-bar-bg">
            <div class="overall-progress-fill" id="achProgressBar"></div>
        </div>
        <div class="overall-percent" id="achievementProgress">0%</div>
    </div>
</div>
    `;

        document.body.appendChild(sidebar);
        this.updateAchievementSidebar();

        // wire up search box
        const searchInput = sidebar.querySelector('.sidebar-search');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                this.achievementFilter = e.target.value.trim();
                this.updateAchievementSidebar();
            });
        }

        sidebar.querySelector('.close-sidebar').onclick = () => sidebar.classList.remove('visible');
        sidebar.onclick = e => { if (e.target === sidebar) sidebar.classList.remove('visible'); };

        return sidebar;
    }

    updateAchievementSidebar() {
        const container = document.getElementById('sidebarAchievements');
        if (!container) return;

        const filter = this.achievementFilter ? this.achievementFilter.toLowerCase() : '';

        // Group achievements: Unlocked first, then Locked
        const sortedAchievements = Object.entries(this.achievements)
            .filter(([_, ach]) => {
                if (!filter) return true;
                return ach.name.toLowerCase().includes(filter) || ach.description.toLowerCase().includes(filter);
            })
            .sort((a, b) => {
                if (a[1].unlocked && !b[1].unlocked) return -1;
                if (!a[1].unlocked && b[1].unlocked) return 1;
                return 0;
            });

        container.innerHTML = '';
        let unlockedCount = 0;
        Object.values(this.achievements).forEach(a => { if (a.unlocked) unlockedCount++; });

        sortedAchievements.forEach(([key, ach]) => {
            const item = document.createElement('div');
            item.className = `sidebar-achievement ${ach.unlocked ? 'unlocked' : 'locked'}`;
            item.dataset.achId = key;
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `View details for ${ach.name}`);

            const progressHTML = ach.progress !== undefined ? `
                <div class="ach-progress-container">
                    <div class="ach-progress-bar-bg">
                        <div class="ach-progress-fill" style="width: ${Math.min(100, (ach.progress / ach.maxProgress) * 100)}%"></div>
                    </div>
                    <div class="ach-progress-stats">
                        <span>Progress</span>
                        <span>${ach.progress} / ${ach.maxProgress}</span>
                    </div>
                </div>
            ` : '';

            item.innerHTML = `
                <div class="ach-gradient-border"></div>
                <div class="ach-main">
                    <div class="ach-icon-frame">
                        <div class="ach-icon-inner ${ach.unlocked ? 'shine' : ''}">
                            ${ach.unlocked ? (ach.icon || '🏆') : '🔒'}
                        </div>
                    </div>
                    <div class="ach-content">
                        <div class="ach-name">${ach.name}</div>
                        <div class="ach-desc">${ach.unlocked ? ach.description : 'Secret Achievement'}</div>
                        ${progressHTML}
                    </div>
                </div>
                <div class="ach-status-badge ${ach.unlocked ? 'unlocked' : 'locked'}">
                    ${ach.unlocked ? 'Unlocked' : 'Locked'}
                </div>
            `;

            container.appendChild(item);

            item.addEventListener('click', () => this.showAchievementDetails(key));
            item.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.showAchievementDetails(key);
                }
            });
        });

        const total = Object.keys(this.achievements).length;
        const percent = Math.round((unlockedCount / total) * 100);

        const countEl = document.getElementById('achievementCount');
        if (countEl) countEl.textContent = unlockedCount;

        const progTextEl = document.getElementById('achievementProgress');
        if (progTextEl) progTextEl.textContent = `${percent}%`;

        const progressBar = document.getElementById('achProgressBar');
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    showAchievementDetails(achievementId) {
        const ach = this.achievements?.[achievementId];
        if (!ach) return;

        const existing = document.getElementById('achievement-detail-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'achievement-detail-modal';
        modal.className = 'achievement-detail-modal';
        const visibleDescription = ach.unlocked ? ach.description : 'Secret Achievement';
        const jokeText = ach.unlocked
            ? (ach.joke || 'No sarcastic commentary available. Tragic.')
            : 'Classified comedic intel. Unlock this first, comedy later.';
        const progressText = (typeof ach.progress === 'number' && typeof ach.maxProgress === 'number')
            ? `<div class="ach-detail-progress">Progress: ${Math.min(ach.maxProgress, ach.progress)} / ${ach.maxProgress}</div>`
            : '';

        modal.innerHTML = `
            <div class="achievement-detail-card" role="dialog" aria-modal="true" aria-label="Achievement details">
                <button class="achievement-detail-close" aria-label="Close">×</button>
                <div class="achievement-detail-header">
                    <div class="achievement-detail-icon">${ach.unlocked ? (ach.icon || '🏆') : '🔒'}</div>
                    <div>
                        <h4>${ach.name}</h4>
                        <div class="achievement-detail-state ${ach.unlocked ? 'is-unlocked' : 'is-locked'}">${ach.unlocked ? 'Unlocked' : 'Locked'}</div>
                    </div>
                </div>
                <div class="achievement-detail-section">
                    <h5>Challenge</h5>
                    <p>${visibleDescription}</p>
                    ${progressText}
                </div>
                <div class="achievement-detail-section achievement-detail-joke">
                    <h5>AI said:</h5>
                    <p>${jokeText}</p>
                </div>
            </div>
        `;

        const closeModal = () => modal.remove();
        modal.addEventListener('click', e => {
            if (e.target === modal) closeModal();
        });
        modal.querySelector('.achievement-detail-close')?.addEventListener('click', closeModal);

        const escHandler = e => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(modal);
    }

    toggleAchievementSidebar() {
        document.querySelector('.achievement-sidebar')?.classList.toggle('visible');
    }

    setupAchievementHotkeys() {
        document.addEventListener('keydown', e => {
            // Ctrl/Cmd + Shift + A => toggle achievement sidebar
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.toggleAchievementSidebar();
            }

            // Ctrl/Cmd + Shift + ArrowUp => developer: unlock all achievements
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowUp') {
                e.preventDefault();
                Object.keys(this.achievements || {}).forEach(k => {
                    try {
                        if (!this.achievements[k].unlocked) this.unlockAchievement(k);
                    } catch (_) { }
                });
            }

            // Ctrl/Cmd + Shift + ArrowDown => developer: lock all achievements and reset XP
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowDown') {
                e.preventDefault();
                try {
                    // Remove any persisted progression before we write a clean state
                    try { localStorage.removeItem('pp-progression-v1'); } catch (_) { }

                    // Reset achievement flags + progress counters
                    Object.keys(this.achievements || {}).forEach(k => {
                        try {
                            if (this.achievements[k]) {
                                this.achievements[k].unlocked = false;
                                if (typeof this.achievements[k].progress === 'number') this.achievements[k].progress = 0;
                            }
                        } catch (_) { }
                    });

                    // Reset core progression/state values
                    this.xp = 0;
                    this.level = 1;
                    this.requiredXP = this.calculateRequiredXP(1);
                    this.unlockedPaddles = ['default'];

                    // Reset counters that can re-trigger achievements on load
                    this.gamesPlayed = 0;
                    this.gamesWon = 0;
                    this.gamesLost = 0;
                    this.winStreak = 0;
                    this.speedChallengesCompleted = 0;
                    this.powerUpsUsed = 0;
                    this.totalPointsScored = 0;
                    this.totalPointsConceded = 0;
                    this.closeWins = 0;
                    this.bigWins = 0;
                    this.tidyWins = 0;
                    this.specialModeWins = { speed: 0, obstacle: 0, gravity: 0, zombie: 0 };

                    // Clear recently unlocked and notifications
                    this.recentlyUnlocked = [];
                    if (typeof this.clearRecentlyUnlocked === 'function') this.clearRecentlyUnlocked();
                    if (typeof this.cleanupNotifications === 'function') this.cleanupNotifications();

                    // Ensure any snapshots are cleared
                    this.matchSnapshot = null;

                    // Remove red theme if active (dev reset should clear visual overhaul)
                    try { document.body.classList.remove('red-theme-overhaul'); } catch (_) { }

                    // Persist the cleared state so reload doesn't reapply old counters
                    this.updateAchievementSidebar();
                    this.updateUI();
                    this.saveProgress();

                    // Allow the all-unlocked overlay (red overhaul) to show again later
                    this.allUnlockedShown = false;
                } catch (err) {
                    console.warn('Failed to reset progression via dev hotkey:', err);
                }
            }

            // Space toggles visible notifications (existing behavior)
            if (e.key === ' ' && e.target === document.body) {
                document.querySelectorAll('.achievement-notification.visible').forEach(n => n.click());
                e.preventDefault();
            }
        });
    }

    playAchievementSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.09);

            gain.gain.setValueAtTime(0.14, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.006, ctx.currentTime + 0.28);

            osc.start();
            osc.stop(ctx.currentTime + 0.28);
        } catch {
            // silent fail
        }
    }

    addGlobalStyles() {
        if (document.getElementById('achievement-styles')) return;

        const style = document.createElement('style');
        style.id = 'achievement-styles';
        style.textContent = `
/* Achievement Notifications Container */
.achievement-notifications-container {
    position: fixed;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
}

.achievement-notification {
    position: absolute;
    right: 0;
    width: 190px;
    max-width: 90vw;
    pointer-events: all;
    will-change: transform, opacity;
}

.achievement-notification-inner {
    background: linear-gradient(135deg, rgba(20,25,50,0.96), rgba(15,20,45,0.98));
    border-radius: 12px;
    padding: 1px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.55);
    backdrop-filter: blur(16px);
    overflow: hidden;
}

.achievement-notification-border {
    position: absolute;
    inset: -1px;
    background: linear-gradient(45deg, #ffd700, #ffeb3b, #ff9800, #ffd700);
    border-radius: 13px;
    opacity: 0;
    transition: opacity 0.5s ease;
    animation: borderGlow 4.5s ease-in-out infinite;
    z-index: -1;
}

.achievement-notification.visible .achievement-notification-border {
    opacity: 0.4;
}

@keyframes borderGlow {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
}

.achievement-notification-content {
    background: linear-gradient(135deg, rgba(15,20,45,0.97), rgba(20,25,50,0.97));
    border-radius: 11px;
    padding: 10px 12px;
}

.achievement-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.achievement-icon {
    width: 26px;
    height: 26px;
    font-size: 14px;
    background: rgba(255,215,0,0.18);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 0 12px rgba(255,215,0,0.3);
}

.achievement-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    flex: 1;
    line-height: 1.3;
}

.achievement-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.65);
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s ease;
}

.achievement-notification:hover .achievement-close {
    opacity: 1;
    color: white;
}

.achievement-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.84);
    line-height: 1.35;
    margin-bottom: 6px;
    padding-left: 34px;
}

.achievement-xp {
    font-size: 11px;
    color: #ffd700;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 34px;
}

.xp-star {
    font-size: 12px;
    animation: starTwinkle 2s infinite ease-in-out;
}

@keyframes starTwinkle {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: 0.65; transform: scale(1.12); }
}

/* Mobile adjustments */
@media (max-width: 768px) {
    .achievement-notifications-container {
        top: 8px;
        right: 8px;
        left: 8px;
        width: calc(100% - 16px);
        max-width: none;
        gap: 8px;
    }

    .achievement-notification {
        width: 100%;
        position: relative;
    }

    .achievement-desc,
    .achievement-xp {
        padding-left: 32px;
    }

    .achievement-close {
        opacity: 1;
        font-size: 18px;
        width: 28px;
        height: 28px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .achievement-notification {
        transition: opacity 0.4s ease !important;
    }
    .xp-star, .achievement-notification-border {
        animation: none !important;
    }
}

/* Achievement Sidebar Styles */
.achievement-sidebar {
    position: fixed;
    inset: 0 0 0 auto;
    width: 400px;
    max-width: 94vw;
    height: 100dvh;
    background: linear-gradient(165deg, rgba(8,10,32,0.98), rgba(20,18,55,0.97));
    backdrop-filter: blur(25px) saturate(180%);
    -webkit-backdrop-filter: blur(25px) saturate(180%);
    border-left: 1px solid rgba(0, 255, 214, 0.2);
    box-shadow: -20px 0 80px rgba(0,0,0,0.8), inset 1px 0 0 rgba(255,255,255,0.05);
    color: #f0f6ff;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    transform: translateX(100%);
    /* Hidden while closed so its glow can't bleed onto the screen edge
       (and the browser skips its backdrop blur). */
    visibility: hidden;
    transition: transform 0.6s cubic-bezier(0.19, 1, 0.22, 1), visibility 0s linear 0.6s;
    z-index: 100000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.achievement-sidebar.visible {
    transform: translateX(0);
    visibility: visible;
    transition: transform 0.6s cubic-bezier(0.19, 1, 0.22, 1), visibility 0s;
}

.sidebar-header {
    padding: 24px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    flex-shrink: 0;
    position: relative;
}

.sidebar-header::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 255, 214, 0.4), transparent);
}

.header-content {
    display: flex;
    align-items: center;
    gap: 16px;
}

.header-icon {
    font-size: 2rem;
    filter: drop-shadow(0 0 15px rgba(0, 255, 214, 0.4));
    animation: iconPulse 3s ease-in-out infinite;
}

@keyframes iconPulse {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 15px rgba(0, 255, 214, 0.4)); }
    50% { transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(0, 255, 214, 0.6)); }
}

.sidebar-header h3 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #fff;
    text-shadow: 
        0 0 5px #fff,
        0 0 10px #00ffd6,
        0 0 20px #00ffd6,
        0 0 40px #00ffd6;
    animation: neonPulse 2s ease-in-out infinite alternate;
}

@keyframes neonPulse {
    from {
        text-shadow: 
            0 0 5px #fff,
            0 0 10px #00ffd6,
            0 0 20px #00ffd6,
            0 0 40px #00ffd6;
    }
    to {
        text-shadow: 
            0 0 2px #fff,
            0 0 5px #00ffd6,
            0 0 10px #00ffd6,
            0 0 20px #00ffd6,
            0 0 30px #00ffd6;
    }
}

.sidebar-search-container {
    padding: 12px 24px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-search {
    width: 100%;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    outline: none;
}

.sidebar-search:focus {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(0, 255, 214, 0.5);
    box-shadow: 0 0 15px rgba(0, 255, 214, 0.2);
}

.close-sidebar {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.8rem;
    cursor: pointer;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    transition: all 0.3s ease;
    line-height: 1;
}

.close-sidebar:hover {
    color: #fff;
    background: rgba(255, 0, 71, 0.2);
    border-color: rgba(255, 0, 71, 0.3);
    transform: rotate(90deg);
}

.achievement-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 255, 214, 0.3) transparent;
}

.achievement-list::-webkit-scrollbar { width: 6px; }
.achievement-list::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 214, 0.3);
    border-radius: 10px;
}

.sidebar-achievement {
    position: relative;
    margin-bottom: 16px;
    padding: 20px;
    border-radius: 18px;
    background: rgba(30, 35, 75, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.sidebar-achievement::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0, 255, 214, 0.05), rgba(144, 64, 255, 0.05));
    opacity: 0;
    transition: opacity 0.3s ease;
}

.sidebar-achievement:hover {
    transform: translateY(-5px);
    background: rgba(35, 45, 95, 0.6);
    border-color: rgba(0, 255, 214, 0.3);
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
}

.sidebar-achievement:focus-visible {
    outline: 2px solid rgba(0, 255, 214, 0.8);
    outline-offset: 2px;
}

.sidebar-achievement:hover::before {
    opacity: 1;
}

.ach-gradient-border {
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: 18px;
    background: linear-gradient(90deg, #00ffd6, #ffd700, #ff00c8, #00ffd6);
    background-size: 300% 100%;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.5s ease;
    animation: borderRotate 4s linear infinite;
}

.sidebar-achievement.unlocked .ach-gradient-border {
    opacity: 0.6;
}

@keyframes borderRotate {
    0% { background-position: 0% 0%; }
    100% { background-position: 300% 0%; }
}

.ach-main {
    display: flex;
    align-items: center;
    gap: 20px;
    position: relative;
    z-index: 2;
}

.ach-icon-frame {
    width: 70px;
    height: 70px;
    border-radius: 20px;
    background: rgba(10, 15, 40, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
    transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: relative;
}

.sidebar-achievement:hover .ach-icon-frame {
    transform: scale(1.1) rotate(5deg);
    border-color: rgba(0, 255, 214, 0.5);
}

.ach-icon-inner {
    font-size: 2.5rem;
    filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5));
    transition: all 0.5s ease;
}

.sidebar-achievement.locked .ach-icon-inner {
    filter: grayscale(1) opacity(0.5);
}

.ach-icon-inner.shine {
    animation: iconFloat 4s ease-in-out infinite;
}

.ach-content {
    flex: 1;
    min-width: 0;
}

.ach-name {
    font-weight: 800;
    font-size: 1.2rem;
    color: #fff;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
}

.sidebar-achievement.unlocked .ach-name {
    background: linear-gradient(90deg, #fff, #00ffd6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.ach-desc {
    font-size: 0.9rem;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.7);
}

.sidebar-achievement.locked .ach-desc {
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
}

.ach-progress-container {
    margin-top: 5px;
}

.ach-progress-bar-bg {
    height: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    margin-bottom: 6px;
}

.ach-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ffd6, #00ff8c);
    box-shadow: 0 0 10px rgba(0, 255, 214, 0.5);
    border-radius: 4px;
    transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ach-progress-stats {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(0, 255, 214, 0.8);
    text-transform: uppercase;
}

.ach-status-badge {
    align-self: flex-start;
    padding: 5px 12px;
    border-radius: 8px;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    position: relative;
    z-index: 2;
}

.ach-status-badge.unlocked {
    background: rgba(0, 255, 214, 0.15);
    color: #00ffd6;
    border: 1px solid rgba(0, 255, 214, 0.3);
    box-shadow: 0 0 15px rgba(0, 255, 214, 0.2);
}

.ach-status-badge.locked {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-footer {
    padding: 24px 28px;
    background: rgba(10, 15, 40, 0.9);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
}

.progress-stats-container {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.overall-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}

.overall-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
}

.overall-count {
    font-size: 1.4rem;
    font-weight: 900;
    color: #fff;
}

.overall-count span {
    color: #00ffd6;
}

.overall-progress-bar-bg {
    height: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
}

.overall-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ffd6, #ffd700, #ff00c8);
    background-size: 200% 100%;
    animation: gradientMove 3s linear infinite;
    border-radius: 6px;
    width: 0%;
    transition: width 1.5s cubic-bezier(0.19, 1, 0.22, 1);
    box-shadow: 0 0 20px rgba(0, 255, 214, 0.3);
}

.achievement-detail-modal {
    position: fixed;
    inset: 0;
    z-index: 100001;
    background: rgba(4, 8, 22, 0.72);
    backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
}

.achievement-detail-card {
    width: min(560px, 100%);
    background: linear-gradient(165deg, rgba(18, 26, 61, 0.95), rgba(11, 17, 40, 0.96));
    border: 1px solid rgba(0, 255, 214, 0.25);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.5);
    position: relative;
    color: #fff;
}

.achievement-detail-close {
    position: absolute;
    right: 16px;
    top: 16px;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 1.5rem;
    cursor: pointer;
    display: grid;
    place-items: center;
    line-height: 1;
}

.achievement-detail-header {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 14px;
}

.achievement-detail-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.08);
    font-size: 2rem;
}

.achievement-detail-header h4 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
}

.achievement-detail-state {
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    margin-top: 4px;
}

.achievement-detail-state.is-unlocked { color: #00ffd6; }
.achievement-detail-state.is-locked { color: rgba(255, 255, 255, 0.55); }

.achievement-detail-section {
    margin-top: 10px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.09);
}

.achievement-detail-section h5 {
    margin: 0 0 6px;
    font-size: 0.85rem;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.75);
}

.achievement-detail-section p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
}

.achievement-detail-progress {
    margin-top: 8px;
    font-size: 0.82rem;
    color: #9be7d9;
    font-weight: 700;
}

.achievement-detail-joke {
    border-color: rgba(255, 215, 0, 0.2);
    background: rgba(255, 215, 0, 0.08);
}

@keyframes gradientMove {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
}

.overall-percent {
    text-align: right;
    font-size: 1.1rem;
    font-weight: 900;
    color: #ffd700;
    letter-spacing: 0.5px;
}

/* All-unlocked overlay */
.all-unlocked-overlay {
    position: fixed;
    inset: 0;
    background: #000;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30000;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    text-align: center;
    padding: 20px;
}
.all-unlocked-overlay .all-unlocked-message {
    font-size: 28px;
    line-height: 1.2;
    max-width: 90%;
}

`;

        document.head.appendChild(style);
        // Red theme overrides for menu overhaul (applied when body has .red-theme-overhaul)
        const redStyle = document.createElement('style');
        redStyle.id = 'achievement-red-theme';
        redStyle.textContent = `
        /* Red theme overhaul when body has class .red-theme-overhaul */
        .red-theme-overhaul .achievement-sidebar {
            background: linear-gradient(165deg, rgba(28,6,6,0.98), rgba(40,10,10,0.97));
            border-left-color: rgba(255,80,80,0.2);
            color: #ffdde0;
        }
        .red-theme-overhaul .header-content { gap: 12px; }
        .red-theme-overhaul .header-icon { filter: drop-shadow(0 0 15px rgba(255,80,80,0.4)); animation: none; }
        .red-theme-overhaul .sidebar-header h3 {
            text-shadow: 0 0 5px #fff, 0 0 10px rgba(255,60,60,0.9), 0 0 20px rgba(255,40,40,0.9);
            color: #fff;
        }
        .red-theme-overhaul .ach-gradient-border { background: linear-gradient(90deg, #ff3b3b, #ff6b6b, #7b0000, #ff3b3b); opacity: 0.9; }
        .red-theme-overhaul .ach-progress-fill { background: linear-gradient(90deg, #ff3b3b, #ff6b6b); box-shadow: 0 0 10px rgba(255,60,60,0.45); }
        .red-theme-overhaul .overall-progress-fill { background: linear-gradient(90deg, #ff3b3b, #ff6b6b, #7b0000); box-shadow: 0 0 20px rgba(255,60,60,0.35); }
        .red-theme-overhaul .ach-status-badge.unlocked { background: rgba(255,80,80,0.12); color: #ffb6b6; border-color: rgba(255,80,80,0.25); }
        .red-theme-overhaul .achievement-notification-inner { background: linear-gradient(135deg, rgba(35,6,6,0.98), rgba(55,10,10,0.98)); border-radius: 12px; }
        .red-theme-overhaul .achievement-notification-border { background: linear-gradient(45deg, #ff3b3b, #ff6b6b, #ff1f1f, #ff3b3b); opacity: 0.6; animation: none; }
        .red-theme-overhaul .xbox-trophy-circle { background: rgba(255,60,60,0.12); color: #ffb6b6; border-radius: 50%; }
        .red-theme-overhaul .achievement-detail-card { background: linear-gradient(165deg, rgba(35,10,10,0.98), rgba(15,6,6,0.96)); border-color: rgba(255,80,80,0.2); }
        .red-theme-overhaul .close-sidebar:hover { background: rgba(255,80,80,0.2); border-color: rgba(255,80,80,0.3); transform: rotate(90deg); }
        .red-theme-overhaul .ach-icon-inner.shine { filter: drop-shadow(0 6px 18px rgba(255,40,40,0.45)); }
        /* Override tech HUD grid to red variant */ 
        .red-theme-overhaul .overlay::before { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='60' height='60' fill='none'/%3E%3Cline x1='0' y1='0' x2='60' y2='0' stroke='%23ff6b6b' stroke-opacity='0.13' stroke-width='0.6'/%3E%3Cline x1='0' y1='20' x2='60' y2='20' stroke='%23ff6b6b' stroke-opacity='0.07' stroke-width='0.4'/%3E%3Cline x1='0' y1='40' x2='60' y2='40' stroke='%23ff6b6b' stroke-opacity='0.07' stroke-width='0.4'/%3E%3Cline x1='0' y1='60' x2='60' y2='60' stroke='%23ff6b6b' stroke-opacity='0.13' stroke-width='0.6'/%3E%3Cline x1='0' y1='0' x2='0' y2='60' stroke='%23ff6b6b' stroke-opacity='0.13' stroke-width='0.6'/%3E%3Cline x1='20' y1='0' x2='20' y2='60' stroke='%23ff6b6b' stroke-opacity='0.07' stroke-width='0.4'/%3E%3Cline x1='40' y1='0' x2='40' y2='60' stroke='%23ff6b6b' stroke-opacity='0.07' stroke-width='0.4'/%3E%3Ccircle cx='30' cy='30' r='1.1' fill='%23ff3b3b' fill-opacity='0.22'/%3E%3C/svg%3E"); }
        `;
        document.head.appendChild(redStyle);
    }

    checkAllUnlockedAndShow() {
        try {
            const total = Object.keys(this.achievements || {}).length;
            const unlockedCount = Object.values(this.achievements || {}).filter(a => a.unlocked).length;
            if (total > 0 && unlockedCount >= total && !this.allUnlockedShown) {
                this.showAllUnlockedOverlay();
                this.allUnlockedShown = true;
            }
        } catch (e) {
            // silent
        }
    }

    showAllUnlockedOverlay() {
        try {
            // remove any legacy overlay element
            const old = document.getElementById('allUnlockedOverlay');
            if (old && old.parentNode) old.parentNode.removeChild(old);

            // apply the red menu overhaul class so menus switch to the red aesthetic
            document.body.classList.add('red-theme-overhaul');

            // refresh menu/achievement UI if helpers exist
            if (typeof updateMenuAchievements === 'function') {
                try { updateMenuAchievements(); } catch (e) { /* ignore */ }
            }
            if (typeof this.updateAchievementSidebar === 'function') {
                try { this.updateAchievementSidebar(); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            // silent fallback
        }
    }

    checkFirstLaunchAndShow() {
        try {
            const shownKey = 'pp-first-launch-shown-v1';
            const alreadyShown = !!localStorage.getItem(shownKey);
            // If progression exists, not a first launch
            if (localStorage.getItem('pp-progression-v1')) return;
            if (alreadyShown) return;
            const unlockedCount = Object.values(this.achievements || {}).filter(a => a.unlocked).length;
            if ((this.xp === 0 || typeof this.xp === 'undefined') && unlockedCount === 0) {
                this.showFirstLaunchOverlay();
                try { localStorage.setItem(shownKey, '1'); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            // silent
        }
    }

    showFirstLaunchOverlay() {
        if (document.getElementById('firstLaunchOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'firstLaunchOverlay';
        overlay.className = 'all-unlocked-overlay';
        overlay.innerHTML = `
            <div class="all-unlocked-message">
                <p>Dear Player,</p>

                <p>I know this is your first time playing this game, so I ask that you follow the most important rule before playing any game, bath first.</p>

                <p>Enjoy this really short game, and try to unlock all the achievements eh? It's not as hard as you think....</p>

                <p>Regards<br/>Lagilava Paulo.</p>
            </div>
        `;
        document.body.appendChild(overlay);

        const remove = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', escHandler);
        };

        // Explicit dismiss button for first-launch overlay
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Got it';
        dismissBtn.style.marginTop = '18px';
        dismissBtn.style.padding = '10px 16px';
        dismissBtn.style.border = 'none';
        dismissBtn.style.borderRadius = '10px';
        dismissBtn.style.cursor = 'pointer';
        dismissBtn.style.background = '#00ffd6';
        dismissBtn.style.color = '#05030b';
        dismissBtn.style.fontWeight = 'bold';
        dismissBtn.addEventListener('click', remove);
        const messageContainer = overlay.querySelector('.all-unlocked-message');
        if (messageContainer) {
            messageContainer.appendChild(dismissBtn);
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) remove();
        });
        const escHandler = (e) => { if (e.key === 'Escape') remove(); };
        document.addEventListener('keydown', escHandler);
    }

    cleanup() {
        this.stopAnimationLoop();
        this.cleanupNotifications();

        window.removeEventListener('resize', () => this.updateNotificationContainerPosition());
        window.removeEventListener('scroll', () => this.updateNotificationContainerPosition());

        const sidebar = document.querySelector('.achievement-sidebar');
        if (sidebar && sidebar.parentNode) {
            sidebar.parentNode.removeChild(sidebar);
        }

        const styles = document.getElementById('achievement-styles');
        if (styles && styles.parentNode) {
            styles.parentNode.removeChild(styles);
        }
    }
}

// Speed Challenge System
