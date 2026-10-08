class AudioEngine {
    constructor() {
        this.ctx = null;
        this.gain = null;
        this.masterVol = 0.3;
        // Initialize sound effects
        this.sounds = {
            hit: null,
            bounce: null,
            score: null,
            powerUp: null,
            levelUp: null,
            speedChallenge: null,
            speedChallengeSuccess: null,
            speedChallengeFail: null,
            gravityWell: null  // New sound for gravity wells
        };
        // Track active gravity well sounds
        this.activeGravityWells = new Map(); // Map to store active gravity well oscillators
        this.gravitySyncInterval = setInterval(() => this.syncGravityWellAudioState(), 140);
    }
    ensure() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.gain = this.ctx.createGain();
            this.gain.gain.value = this.masterVol;
            this.gain.connect(this.ctx.destination);
        } catch (e) { console.warn("Audio not supported:", e); }
    }
    resume() {
        if (!this.ctx) this.ensure();
        if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
    }
    createOscillatorSound(freq, type = 'square', duration = 0.08, vol = 0.5) {
        this.ensure();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
        o.connect(g);
        g.connect(this.gain);
        o.start(now);
        o.stop(now + duration);
    }
    hit(strength = 0.5, pan = 0, side = 'left') {
        this.createOscillatorSound((side === 'right' ? 660 : 880) * (1 + strength * 0.3), 'square', 0.07, 0.25 + strength * 0.4);
    }
    bounce(strength = 0.4) { this.createOscillatorSound(440, 'sine', 0.05, 0.15 + strength * 0.25); }
    score() {
        const now = this.ctx.currentTime;
        const notes = [0, 4, 7, 12].map(n => 220 * Math.pow(2, n / 12));
        notes.forEach((f, i) => {
            const t = now + i * 0.08;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = i % 2 ? 'sawtooth' : 'triangle';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.18, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            o.connect(g);
            g.connect(this.gain);
            o.start(t);
            o.stop(t + 0.25);
        });
    }
    powerUp() {
        this.ensure();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5];

        notes.forEach((baseFreq, i) => {
            const t = now + i * 0.055;

            const bodyOsc = this.ctx.createOscillator();
            const bodyGain = this.ctx.createGain();
            bodyOsc.type = i % 2 === 0 ? 'square' : 'triangle';
            bodyOsc.frequency.setValueAtTime(baseFreq * 0.92, t);
            bodyOsc.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.03);
            bodyGain.gain.setValueAtTime(0.0001, t);
            bodyGain.gain.linearRampToValueAtTime(0.2, t + 0.005);
            bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
            bodyOsc.connect(bodyGain);
            bodyGain.connect(this.gain);
            bodyOsc.start(t);
            bodyOsc.stop(t + 0.13);

            const sparkleOsc = this.ctx.createOscillator();
            const sparkleGain = this.ctx.createGain();
            sparkleOsc.type = 'sine';
            sparkleOsc.frequency.setValueAtTime(baseFreq * 2.01, t);
            sparkleGain.gain.setValueAtTime(0.0001, t);
            sparkleGain.gain.linearRampToValueAtTime(0.06, t + 0.004);
            sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            sparkleOsc.connect(sparkleGain);
            sparkleGain.connect(this.gain);
            sparkleOsc.start(t);
            sparkleOsc.stop(t + 0.09);
        });
    }
    levelUp() {
        const now = this.ctx.currentTime;
        const notes = [0, 4, 7, 12, 7, 4].map(n => 330 * Math.pow(2, n / 12));
        notes.forEach((f, i) => {
            const t = now + i * 0.1;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.15, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            o.connect(g);
            g.connect(this.gain);
            o.start(t);
            o.stop(t + 0.35);
        });
    }
    speedChallenge() {
        const now = this.ctx.currentTime;
        const notes = [0, 5, 7, 12].map(n => 440 * Math.pow(2, n / 12));
        notes.forEach((f, i) => {
            const t = now + i * 0.05;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.2, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
            o.connect(g);
            g.connect(this.gain);
            o.start(t);
            o.stop(t + 0.2);
        });
    }
    speedChallengeSuccess() {
        const now = this.ctx.currentTime;
        const notes = [0, 4, 7, 12, 16].map(n => 523 * Math.pow(2, n / 12));
        notes.forEach((f, i) => {
            const t = now + i * 0.08;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = i % 2 ? 'sine' : 'triangle';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.25, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            o.connect(g);
            g.connect(this.gain);
            o.start(t);
            o.stop(t + 0.35);
        });
    }
    speedChallengeFail() {
        const now = this.ctx.currentTime;
        const notes = [0, -2, -4, -6].map(n => 220 * Math.pow(2, n / 12));
        notes.forEach((f, i) => {
            const t = now + i * 0.1;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.2, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            o.connect(g);
            g.connect(this.gain);
            o.start(t);
            o.stop(t + 0.25);
        });
    }

    laser() {
        this.ensure();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        const laserOsc = this.ctx.createOscillator();
        const laserGain = this.ctx.createGain();
        const laserFilter = this.ctx.createBiquadFilter();
        laserOsc.type = 'triangle';
        laserOsc.frequency.setValueAtTime(2200, now);
        laserOsc.frequency.exponentialRampToValueAtTime(420, now + 0.11);
        laserFilter.type = 'bandpass';
        laserFilter.frequency.setValueAtTime(3400, now);
        laserFilter.frequency.exponentialRampToValueAtTime(900, now + 0.11);
        laserFilter.Q.value = 7;
        laserGain.gain.setValueAtTime(0.0001, now);
        laserGain.gain.linearRampToValueAtTime(0.24, now + 0.003);
        laserGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        laserOsc.connect(laserFilter);
        laserFilter.connect(laserGain);
        laserGain.connect(this.gain);
        laserOsc.start(now);
        laserOsc.stop(now + 0.125);

        const noiseBuffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(this.ctx.sampleRate * 0.07)), this.ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);

        const noiseSrc = this.ctx.createBufferSource();
        const noiseFilter = this.ctx.createBiquadFilter();
        const noiseGain = this.ctx.createGain();
        noiseSrc.buffer = noiseBuffer;
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1800, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(950, now + 0.07);
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(0.11, now + 0.002);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.gain);
        noiseSrc.start(now);
        noiseSrc.stop(now + 0.07);
    }

    // NEW: Start bassy gravity well sound
    startGravityWellSound(wellId, strength) {
        this.ensure();
        const game = window.game;
        const replayActive = !!(game?.replayActive || game?.isReplay || game?.replay?.isPlaying || game?.replay?.active);
        const canPlayGravityAudio = !!(game &&
            game.running &&
            !game.paused &&
            !game.introActive &&
            !game.matchEnding &&
            game.gameMode === 'gravity' &&
            !replayActive);

        if (!this.ctx || this.activeGravityWells.has(wellId) || !canPlayGravityAudio) return;

        const now = this.ctx.currentTime;

        // Create a bassy drone sound
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        const bassFilter = this.ctx.createBiquadFilter();

        // Set up bass oscillator
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 60 + (strength / 20); // Lower frequency for bass

        // Set up filter for bass emphasis
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 200;
        bassFilter.Q.value = 2;

        // Set up gain for smooth fade in
        bassGain.gain.setValueAtTime(0.001, now);
        bassGain.gain.linearRampToValueAtTime(0.3, now + 0.2);

        // Connect nodes
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.gain);

        // Start oscillator
        bassOsc.start(now);

        // Add a sub-bass oscillator for extra depth
        const subBassOsc = this.ctx.createOscillator();
        const subBassGain = this.ctx.createGain();

        subBassOsc.type = 'sine';
        subBassOsc.frequency.value = 30 + (strength / 40); // Even lower frequency

        subBassGain.gain.setValueAtTime(0.001, now);
        subBassGain.gain.linearRampToValueAtTime(0.2, now + 0.3);

        subBassOsc.connect(subBassGain);
        subBassGain.connect(this.gain);

        subBassOsc.start(now);

        // Store oscillators and gains for later cleanup
        this.activeGravityWells.set(wellId, {
            bassOsc,
            bassGain,
            subBassOsc,
            subBassGain
        });
    }

    // NEW: Stop bassy gravity well sound
    stopGravityWellSound(wellId) {
        if (!this.ctx || !this.activeGravityWells.has(wellId)) return;

        const now = this.ctx.currentTime;
        const sounds = this.activeGravityWells.get(wellId);

        // Fade out bass
        sounds.bassGain.gain.cancelScheduledValues(now);
        sounds.bassGain.gain.setValueAtTime(sounds.bassGain.gain.value, now);
        sounds.bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        sounds.subBassGain.gain.cancelScheduledValues(now);
        sounds.subBassGain.gain.setValueAtTime(sounds.subBassGain.gain.value, now);
        sounds.subBassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        // Stop oscillators
        sounds.bassOsc.stop(now + 0.3);
        sounds.subBassOsc.stop(now + 0.3);

        // Remove from active sounds
        this.activeGravityWells.delete(wellId);
    }

    stopAllGravityWellSounds() {
        if (!this.ctx || this.activeGravityWells.size === 0) return;
        const activeIds = Array.from(this.activeGravityWells.keys());
        activeIds.forEach(wellId => this.stopGravityWellSound(wellId));
    }

    syncGravityWellAudioState() {
        if (!this.ctx) return;

        const game = window.game;
        const replayActive = !!(game?.replayActive || game?.isReplay || game?.replay?.isPlaying || game?.replay?.active);
        const canPlayGravityAudio = !!(game &&
            game.running &&
            !game.paused &&
            !game.introActive &&
            !game.matchEnding &&
            game.gameMode === 'gravity' &&
            !replayActive);

        if (!canPlayGravityAudio) {
            this.stopAllGravityWellSounds();
            return;
        }

        const wells = Array.isArray(game.gravityWells) ? game.gravityWells : [];
        const ball = game.ball;
        if (!ball?.pos) {
            this.stopAllGravityWellSounds();
            return;
        }

        const affectingIds = new Set();
        wells.forEach(well => {
            if (!well?.active || !well?.id || !well?.pos || typeof well.radius !== 'number') return;
            const dx = well.pos.x - ball.pos.x;
            const dy = well.pos.y - ball.pos.y;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq > 400 && distSq < (well.radius * well.radius)) {
                affectingIds.add(well.id);
                if (!this.activeGravityWells.has(well.id)) {
                    this.startGravityWellSound(well.id, well.strength || 900);
                }
            }
        });

        Array.from(this.activeGravityWells.keys()).forEach(wellId => {
            if (!affectingIds.has(wellId)) {
                this.stopGravityWellSound(wellId);
            }
        });
    }
}

//Gravity or gravy
