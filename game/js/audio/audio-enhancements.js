// audio-enhancements.js - ENHANCED & OPTIMIZED VERSION v2.1
class EnhancedAudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.masterVolume = 0.7;
        this.initialized = false;
        this.enabled = true; // Start enabled by default
        this.isMobile = !!window.PPDevice?.mobile;
        this.activeGravityWells = new Map();
        this.gravitySyncInterval = null;
        this.voiceSyncInterval = null;
        this.musicSyncInterval = null;
        this.performanceInterval = null;
        this.visualizerAnalyser = null;
        this.visualizerBins = null;
        this.visualizerSmoothing = 0;
        this.visualizerPeak = 0;
        this.mediaElementNodes = new WeakMap();

        // Add music mute state
        this.musicMuted = false;
        this.lastMusicState = {
            src: null,
            volume: 0.5,
            playbackRate: 1,
            wasPlaying: false
        };
        this.sfxVolume = 1;
        this.musicVolume = 1;
        this.voiceVolume = 0.9;
        this.voiceMuted = false;
        this.preferencesKey = 'pingpong-audio-controls-v1';
        this.loadControlState();

        // Ensure music play/pause actions are serialized to avoid browser AbortError races
        this._musicPlayQueue = Promise.resolve();

        // Enhanced sound configurations with bass-heavy, consistent sounds
        this.sounds = {
            hit: {
                freq: 220,
                type: 'sawtooth',
                duration: 0.12,
                vol: 0.4,                    // Slightly reduced for better balance
                variations: [196, 220, 247, 262],
                randomize: true,
                bassImpact: true,
                impactFreq: 55,              // Lowered for more substantial impact
                attack: 0.01,                // Added for sharper attack
                decay: 0.11                  // Added for better envelope
            },
            bounce: {
                freq: 330,
                type: 'triangle',
                duration: 0.08,
                vol: 0.35,                   // Balanced with other sounds
                variations: [294, 330, 370, 392],
                randomize: true,
                bassComponent: 82.5,         // Now a ratio of main frequency (330/4)
                attack: 0.005,
                decay: 0.075
            },
            score: {
                baseFreq: 220,
                type: 'sine',               // Changed back to sine for cleaner chords
                duration: 0.3,              // Slightly reduced
                vol: 0.45,
                chord: [0, 4, 7],           // Major triad instead of 7th for clarity
                arpeggiate: true,
                bassRoot: 110,
                attack: 0.05,
                decay: 0.25
            },
            powerUp: {
                freq: 440,
                type: 'square',
                duration: 0.25,             // Balanced duration
                vol: 0.45,
                sweep: true,
                harmonic: true,
                energizing: true,
                sparkleFreq: 880,
                sweepStart: 330,            // Added start frequency
                sweepEnd: 880,              // Reduced from 1320 for better balance
                attack: 0.1,
                release: 0.15
            },
            levelUp: {
                baseFreq: 165,
                type: 'sine',               // Changed back to sine for cleaner arpeggio
                duration: 0.8,              // Reduced slightly
                vol: 0.45,
                arpeggio: [0, 4, 7, 12, 16, 19, 16, 12, 7, 4], // Major arpeggio
                triumphant: true,
                bassDrop: 82.5,             // Ratio of baseFreq (165/2)
                attack: 0.2,
                release: 0.6
            },
            gameStart: {
                baseFreq: 220,
                type: 'triangle',
                duration: 0.35,
                vol: 0.45,
                chordProgression: [[0, 4, 7], [2, 5, 9], [0, 4, 7]], // Cleaner chord progression
                fanfare: true,
                bassPulse: 110,
                attack: 0.15,
                release: 0.2
            },
            achievement: {
                freq: 660,
                type: 'sine',               // Changed back to sine for less harshness
                duration: 0.7,              // Reduced duration
                vol: 0.45,
                sparkle: true,
                layers: 2,                  // Reduced layers for clarity
                bassThump: 165,             // Better harmonic relationship (660/4)
                attack: 0.1,
                release: 0.6
            },
            obstacleHit: {
                freq: 180,                  // Lowered for more impact
                type: 'sawtooth',
                duration: 0.15,
                vol: 0.35,
                lowFreq: 45,                // Better bass ratio
                impact: true,
                bassRumble: 45,
                attack: 0.005,
                decay: 0.145
            },
            paddleShrink: {
                freq: 165,
                type: 'triangle',
                duration: 0.18,
                vol: 0.35,
                descending: true,
                bassSwoosh: 82.5,           // Better ratio
                attack: 0.02,
                release: 0.16
            },
            zombieWave: {
                freq: 68,
                type: 'sawtooth',
                duration: 0.28,
                vol: 0.32,
                bassSwoosh: 34,
                attack: 0.03,
                release: 0.18
            },
            zombieHit: {
                freq: 96,
                type: 'triangle',
                duration: 0.16,
                vol: 0.28,
                bassSwoosh: 48,
                attack: 0.01,
                release: 0.12
            },
            zombieSpit: {
                freq: 280,
                type: 'square',
                duration: 0.1,
                vol: 0.2,
                sweep: true,
                sweepStart: 420,
                sweepEnd: 220,
                attack: 0.005,
                release: 0.07
            },
            zombieBreach: {
                freq: 44,
                type: 'sawtooth',
                duration: 0.24,
                vol: 0.36,
                bassSwoosh: 22,
                attack: 0.01,
                release: 0.2
            },
            zombieChoice: {
                freq: 330,
                type: 'triangle',
                duration: 0.14,
                vol: 0.18,
                sweep: true,
                sweepStart: 220,
                sweepEnd: 440,
                attack: 0.01,
                release: 0.1
            },
            freeze: {
                freq: 110,
                type: 'square',
                duration: 0.4,              // Balanced duration
                vol: 0.35,
                shimmer: true,
                layers: 2,
                bassCrackle: 55,            // Better ratio
                attack: 0.1,
                release: 0.3
            },
            uiClick: {
                freq: 440,
                type: 'square',
                duration: 0.08,             // Shorter for UI feedback
                vol: 0.25,                  // Quieter as UI sound
                variations: [392, 440, 494, 523], // Tighter variation range
                randomize: true,
                bassPop: 220,
                attack: 0.001,
                decay: 0.079
            },
            rally: {
                baseFreq: 440,
                type: 'sine',               // Changed to sine for less harshness
                duration: 0.12,
                vol: 0.25,                  // Quieter as background effect
                incremental: true,
                bassPulse: 220,             // Better ratio
                attack: 0.01,
                decay: 0.11
            },
            laser: {
                freq: 800,
                type: 'sawtooth',
                duration: 0.12,             // Balanced with other sounds
                vol: 0.35,
                sweep: true,
                sweepStart: 1000,           // Higher start for laser "zap"
                sweepEnd: 600,              // Downward sweep
                harmonic: true,
                harmonicFreq: 1600,
                attack: 0.002,              // Very fast attack for laser
                decay: 0.118
            },
            fireBreathWarning: {
                // Intense charging phase - like Death Star powering up
                baseFreq: 55,               // Ultra-deep bass (subsonic feel)
                type: 'sine',
                duration: 3.0,              // 3 second warning phase
                vol: 0.6,
                sweep: true,
                sweepStart: 55,             // Start very low
                sweepEnd: 110,              // Sweep up to lower frequency
                layers: 3,                  // Multiple harmonic layers
                bassRumble: 27.5,           // Sub-bass at 27.5Hz (feel more than hear)
                intensifying: true,         // Gets louder over duration
                modulation: true,           // LFO modulation for intensity
                modRate: 2.5,               // Slow pulsing buildup
                harmonic1: 110,             // 2x harmonic
                harmonic2: 220,             // 4x harmonic (adds presence)
                attack: 0.3,                // Build into it
                decay: 0.05
            },
            fireBreathRelease: {
                // Explosive release - nuclear blast/AT field death
                baseFreq: 110,              // Low but punchy
                type: 'sawtooth',           // Harsh texture
                duration: 2.0,              // 2 second breathing
                vol: 0.75,                  // LOUD - maximum impact
                sweep: true,
                sweepStart: 220,            // Explosive high impact
                sweepEnd: 55,               // Drops dramatically for menace
                layers: 4,                  // Complex layering
                bassThump: 27.5,            // Deep chest-hitting bass
                impactPeak: 550,            // Initial punch frequency
                noiseComponent: 0.35,       // White noise overlay for explosion texture
                harmonics: [55, 110, 165, 220, 330], // Rich harmonic series
                modulation: true,
                modRate: 8.0,               // Fast chaotic modulation
                tremolo: true,              // Volume tremolo for pulse effect
                tremoloRate: 6.0,
                attack: 0.01,               // Instant impact
                sustain: 1.5,               // Long sustain
                release: 0.5
            },
            fireBreathAmbient: {
                // Continuous low rumble during breathing - threatening presence
                baseFreq: 41.2,             // Low E (sub-bass territory)
                type: 'sine',
                duration: 0.5,              // Short loop, repeats continuously
                vol: 0.4,
                bassRumble: 20.6,           // Ultra-deep subsonic
                harmonic1: 82.4,            // 2x harmonic
                harmonic2: 123.6,           // 3x harmonic
                loopable: true,             // Designed to repeat
                modulation: true,
                modRate: 1.2,               // Slow ominous pulsing
                modDepth: 0.3,              // Subtle modulation
                continuous: true,           // Can sustain indefinitely
                attack: 0.2,
                release: 0.2
            }
        };

        // Audio analytics and performance tracking
        this.analytics = {
            soundsPlayed: 0,
            lastPlayed: {},
            concurrentSounds: 0,
            maxConcurrent: 0,
            totalPlayTime: 0,
            performanceScore: 100
        };

        // Performance optimization
        this.activeOscillators = new Set();
        this.cleanupInterval = null;
        this.maxPolyphony = this.isMobile ? 15 : 25;

        // Game state tracking
        this.lastRallyMilestone = 0;
        this.lastSpeedCheck = 0;
        this.consecutiveHits = 0;

        this.init();
    }

    loadControlState() {
        const fromGamePrefs = window.PingPongPerfected?.state?.preferences;
        const fromStorage = (() => {
            try {
                return JSON.parse(localStorage.getItem(this.preferencesKey) || '{}');
            } catch (_) {
                return {};
            }
        })();

        const prefVolume = typeof fromGamePrefs?.audioVolume === 'number'
            ? Math.max(0, Math.min(1, fromGamePrefs.audioVolume / 100))
            : null;

        this.masterVolume = prefVolume ?? (typeof fromStorage.masterVolume === 'number' ? fromStorage.masterVolume : this.masterVolume);
        this.musicMuted = typeof fromGamePrefs?.musicMuted === 'boolean'
            ? fromGamePrefs.musicMuted
            : !!fromStorage.musicMuted;
        this.sfxVolume = typeof fromStorage.sfxVolume === 'number' ? Math.max(0, Math.min(1, fromStorage.sfxVolume)) : this.sfxVolume;
        this.musicVolume = typeof fromStorage.musicVolume === 'number' ? Math.max(0, Math.min(1, fromStorage.musicVolume)) : this.musicVolume;
        this.voiceVolume = typeof fromStorage.voiceVolume === 'number' ? Math.max(0, Math.min(1, fromStorage.voiceVolume)) : this.voiceVolume;
        this.voiceMuted = !!fromStorage.voiceMuted;
    }

    saveControlState() {
        try {
            localStorage.setItem(this.preferencesKey, JSON.stringify({
                masterVolume: this.masterVolume,
                musicMuted: this.musicMuted,
                sfxVolume: this.sfxVolume,
                musicVolume: this.musicVolume,
                voiceVolume: this.voiceVolume,
                voiceMuted: this.voiceMuted
            }));
        } catch (_) {
            // Ignore storage issues
        }
    }

    getVoiceController() {
        return window.game?.ai?.voice || window.game?.aiController?.voice || null;
    }

    applyVoiceSettings() {
        const voice = this.getVoiceController();
        if (!voice) return;

        const nextMuted = this.voiceMuted || !this.enabled;
        if (typeof voice.setMuted === 'function') {
            voice.setMuted(nextMuted);
        } else {
            voice.isMuted = nextMuted;
        }

        const effectiveVoiceVolume = Math.max(0, Math.min(1, this.voiceVolume * this.masterVolume));
        if (voice.defaultSettings && typeof voice.defaultSettings === 'object') {
            voice.defaultSettings.volume = effectiveVoiceVolume;
        }
        if (voice.voiceSettings && typeof voice.voiceSettings === 'object') {
            voice.voiceSettings.volume = effectiveVoiceVolume;
        }
    }

    getEffectiveMusicVolume(baseVolume = 0.5) {
        if (this.musicMuted || !this.enabled) return 0;
        return Math.max(0, Math.min(1, baseVolume * this.musicVolume * this.masterVolume));
    }

    getEffectiveMusicPlaybackRate() {
        const game = window.game;
        const playbackRate = typeof game?.getMusicPlaybackRate === 'function'
            ? game.getMusicPlaybackRate()
            : game?.timeWarpFactor;
        if (!Number.isFinite(playbackRate)) return 1;
        return Math.max(0.25, Math.min(2, playbackRate));
    }

    applyMusicPlaybackRate(playbackRate = this.getEffectiveMusicPlaybackRate()) {
        const nextRate = Number.isFinite(playbackRate) ? Math.max(0.25, Math.min(2, playbackRate)) : 1;
        this.lastMusicState.playbackRate = nextRate;

        const musicElements = [];
        if (window.game?.intro?.bgMusic instanceof HTMLMediaElement) {
            musicElements.push(window.game.intro.bgMusic);
        }

        // Check for specific intro bgMusic property if it's different from the game's intro
        if (window.game?.bgMusic instanceof HTMLMediaElement && !musicElements.includes(window.game.bgMusic)) {
            musicElements.push(window.game.bgMusic);
        }

        // Check for common audio objects on the game instance itself
        if (window.game?.currentMusicTrack instanceof HTMLMediaElement && !musicElements.includes(window.game.currentMusicTrack)) {
            musicElements.push(window.game.currentMusicTrack);
        }

        const bgAudio = document.getElementById('bgMusic');
        if (bgAudio instanceof HTMLMediaElement && !musicElements.includes(bgAudio)) {
            musicElements.push(bgAudio);
        }

        const updatePitchProperty = (audio, rate) => {
            const preserve = rate >= 0.9;
            if ('preservesPitch' in audio) audio.preservesPitch = preserve;
            else if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = preserve;
            else if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = preserve;
        };

        musicElements.forEach(audio => {
            audio.playbackRate = nextRate;
            updatePitchProperty(audio, nextRate);
        });

        // Also scale active gravity well oscillators if they exist
        if (this.activeGravityWells && this.activeGravityWells.size > 0) {
            this.activeGravityWells.forEach(well => {
                if (well.bassOsc && well.bassOsc.frequency) {
                    // We don't change the base frequency, but we could scale it if we wanted.
                    // However, Web Audio oscillators don't have a playbackRate.
                    // For now, we just ensure they're accounted for in the logic.
                }
            });
        }

        return nextRate;
    }

    // Add methods to control music mute state
    toggleMusicMute() {
        this.musicMuted = !this.musicMuted;

        // Save to preferences
        if (window.PingPongPerfected?.state) {
            window.PingPongPerfected.state.preferences.musicMuted = this.musicMuted;
            window.PingPongPerfected.state.savePrefs();
        }

        // Apply the mute state to any currently playing music
        this.applyMusicMuteState();
        this.saveControlState();

        return this.musicMuted;
    }

    setMusicMuteState(muted) {
        this.musicMuted = !!muted;

        // Save to preferences
        if (window.PingPongPerfected?.state) {
            window.PingPongPerfected.state.preferences.musicMuted = this.musicMuted;
            window.PingPongPerfected.state.savePrefs();
        }

        // Apply the mute state to any currently playing music
        this.applyMusicMuteState();
        this.saveControlState();
    }

    applyMusicMuteState() {
        this.syncMusicVisualizerRouting();
        this.applyMusicPlaybackRate();

        // Handle Intro music specifically
        if (window.game && window.game.intro && window.game.intro.bgMusic) {
            if (this.musicMuted) {
                // Store current volume before muting
                if (window.game.intro.bgMusic.volume > 0) {
                    this.lastMusicState.volume = window.game.intro.bgMusic.volume;
                }

                // Mute by setting volume to 0 (don't pause)
                window.game.intro.bgMusic.volume = 0;
            } else {
                // Unmute by restoring volume
                if (this.lastMusicState.volume > 0) {
                    window.game.intro.bgMusic.volume = this.getEffectiveMusicVolume(this.lastMusicState.volume);
                } else {
                    // Fallback to the selected music's volume
                    const selectedVolume = window.game.intro.selectedMusic ?
                        window.game.intro.selectedMusic.volume : 0.5;
                    window.game.intro.bgMusic.volume = this.getEffectiveMusicVolume(selectedVolume);
                }

                // If music was paused and should be playing, try to resume it
                if (window.game.intro.bgMusic.paused && window.game.intro.active) {
                    const playPromise = window.game.intro.bgMusic.play();
                    if (playPromise) {
                        playPromise.catch(err => {
                            console.warn('Music resume failed:', err);
                        });
                    }
                }
            }
        }

        // Handle any custom audio system music
        if (this.hasCustomAudioSystem && window.game.audio) {
            if (this.musicMuted) {
                // Custom system mute logic would go here
            } else {
                // Custom system unmute logic would go here
            }
        }
    }

    attachMediaElementToVisualizer(element) {
        if (!element || !this.ctx || !this.visualizerAnalyser) return false;

        // When running from file://, browsers often forbid MediaElementAudioSource for security reasons.
        // Avoid creating the node to prevent "outputs zeroes due to CORS" warnings.
        if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
            return false;
        }

        if (this.mediaElementNodes.has(element)) return true;

        try {
            const source = this.ctx.createMediaElementSource(element);
            source.connect(this.visualizerAnalyser);
            this.mediaElementNodes.set(element, source);
            return true;
        } catch (error) {
            // Can occur if the element was already wrapped elsewhere; keep music playback intact.
            console.warn('[Audio] Unable to attach media element to visualizer chain:', error);
            return false;
        }
    }

    syncMusicVisualizerRouting() {
        if (!this.ctx || !this.visualizerAnalyser) return;

        const mediaCandidates = new Set();

        const addMedia = element => {
            if (element instanceof HTMLMediaElement) mediaCandidates.add(element);
        };

        // Core game music elements
        addMedia(window.game?.intro?.bgMusic);
        addMedia(window.game?.bgMusic);
        addMedia(window.game?.currentMusicTrack);

        // Any DOM audio/video elements (e.g., match track, ambient audio, external plugins)
        document.querySelectorAll('audio, video').forEach(addMedia);

        // Also attach the bgMusic id element, if it exists
        addMedia(document.getElementById('bgMusic'));

        let attached = 0;
        mediaCandidates.forEach(media => {
            if (this.attachMediaElementToVisualizer(media)) {
                attached += 1;
            }
        });

        if (attached > 0) {
            // Minimal logging for debugging; production should be quiet.
        }
    }

    // ✅ STOP ALL MUSIC - Properly stops any playing audio tracks
    stopMusic(target = 'all') {
        this.stopAllGravityWellSounds(0.1);
        
        // Stop intro bg music if it exists
        if (window.game && window.game.intro && window.game.intro.bgMusic) {
            const audio = window.game.intro.bgMusic;
            audio.pause();
            audio.currentTime = 0;
            audio.src = ''; // Clear the source
            audio.removeAttribute('src');
        }

        // Stop any HTML audio element with id='bgMusic'
        const bgAudio = document.getElementById('bgMusic');
        if (bgAudio) {
            bgAudio.pause();
            bgAudio.currentTime = 0;
            bgAudio.src = ''; // Clear the source
            bgAudio.removeAttribute('src');
        }

        // Clear any stored music state
        this.lastMusicState = {
            src: null,
            volume: 0.5,
            playbackRate: 1,
            wasPlaying: false
        };
    }

    resolveAssetUrl(src) {
        if (!src) return src;
        if (typeof window !== 'undefined' && typeof window.resolveAssetUrl === 'function') {
            return window.resolveAssetUrl(src);
        }
        return src;
    }

    // ✅ PLAY MUSIC - Plays music with proper setup
    playMusic(trackId, options = {}) {
        const { src, loop = true, volume = 0.5, autoplay = true } = options;
        const resolvedSrc = this.resolveAssetUrl(src);
        
        if (!resolvedSrc) {
            console.warn('[Audio] No music source provided');
            return;
        }

        // Serialize music start/stop calls to prevent "AbortError: The play() request was interrupted by a call to pause()."
        const doPlay = async () => {
            this.lastMusicState.src = resolvedSrc;
            this.lastMusicState.volume = volume;
            this.lastMusicState.wasPlaying = !this.musicMuted && autoplay;

            // Use intro bg music if it exists
            const sameResolvedSrc = (audioEl) => {
                if (!audioEl || !audioEl.src) return false;
                try {
                    return new URL(audioEl.src, window.location.href).toString() === new URL(resolvedSrc, window.location.href).toString();
                } catch (_) {
                    return audioEl.src === resolvedSrc;
                }
            };

            if (window.game && window.game.intro && window.game.intro.bgMusic) {
                const audio = window.game.intro.bgMusic;
                this.syncMusicVisualizerRouting();

                if (!sameResolvedSrc(audio)) {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.src = resolvedSrc;
                    audio.preload = 'auto';
                    audio.load();
                }

                audio.volume = this.getEffectiveMusicVolume(volume);
                audio.loop = loop;
                const initialRate = this.getEffectiveMusicPlaybackRate();
                audio.playbackRate = initialRate;
                
                // Set initial pitch preservation state
                const preserve = initialRate >= 0.9;
                if ('preservesPitch' in audio) audio.preservesPitch = preserve;
                else if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = preserve;
                else if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = preserve;

                if (!this.musicMuted && this.enabled && autoplay && audio.paused) {
                    try {
                        await audio.play();
                    } catch (err) {
                        console.warn(`[Audio] Autoplay failed for ${trackId}:`, err);
                    }
                }
                return;
            }

            // Fallback: try to create or use bgMusic element
            let bgAudio = document.getElementById('bgMusic');
            if (!bgAudio) {
                bgAudio = document.createElement('audio');
                bgAudio.id = 'bgMusic';
                document.body.appendChild(bgAudio);
            }

            this.syncMusicVisualizerRouting();

            if (!sameResolvedSrc(bgAudio)) {
                bgAudio.pause();
                bgAudio.currentTime = 0;
                bgAudio.preload = 'auto';
                bgAudio.src = resolvedSrc;
                bgAudio.load();
            }

            bgAudio.volume = this.getEffectiveMusicVolume(volume);
            bgAudio.loop = loop;
            const bgInitialRate = this.getEffectiveMusicPlaybackRate();
            bgAudio.playbackRate = bgInitialRate;
            
            // Set initial pitch preservation state
            const bgPreserve = bgInitialRate >= 0.9;
            if ('preservesPitch' in bgAudio) bgAudio.preservesPitch = bgPreserve;
            else if ('mozPreservesPitch' in bgAudio) bgAudio.mozPreservesPitch = bgPreserve;
            else if ('webkitPreservesPitch' in bgAudio) bgAudio.webkitPreservesPitch = bgPreserve;

            if (!this.musicMuted && this.enabled && autoplay && bgAudio.paused) {
                try {
                    await bgAudio.play();
                } catch (err) {
                    console.warn(`[Audio] Autoplay failed for ${trackId}:`, err);
                }
            }
        };

        this._musicPlayQueue = this._musicPlayQueue.then(doPlay).catch(() => {});
    }

    // Start bassy gravity well sound
    startGravityWellSound(wellId, strength) {
        if (!this.enabled) return;

        const game = window.game;
        const replayActive = !!(game?.replayActive || game?.isReplay || game?.replay?.isPlaying || game?.replay?.active);
        const canPlayGravityAudio = !!(game &&
            game.running &&
            !game.paused &&
            !game.introActive &&
            !game.matchEnding &&
            game.gameMode === 'gravity' &&
            !replayActive);

        if (!canPlayGravityAudio) return;

        this.ensureContext().then(() => {
            if (!this.ctx || this.activeGravityWells.has(wellId)) return;

            const now = this.ctx.currentTime;
            const hasStereo = typeof this.ctx.createStereoPanner === 'function';

            // Create a bassy drone sound
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            const bassFilter = this.ctx.createBiquadFilter();
            const airOsc = this.ctx.createOscillator();
            const airGain = this.ctx.createGain();
            const airFilter = this.ctx.createBiquadFilter();
            const stereoPan = hasStereo ? this.ctx.createStereoPanner() : this.ctx.createGain();
            const panLfo = hasStereo ? this.ctx.createOscillator() : null;
            const panLfoGain = hasStereo ? this.ctx.createGain() : null;

            // Set up bass oscillator
            bassOsc.type = 'sine';
            bassOsc.frequency.value = 40 + (strength / 30); // Even lower frequency

            // Set up filter for bass emphasis
            bassFilter.type = 'lowpass';
            bassFilter.frequency.value = 150; // Lowered from 200
            bassFilter.Q.value = 3; // Increased from 2

            // Set up gain for smooth fade in - REDUCED VOLUME
            bassGain.gain.setValueAtTime(0.001, now);
            bassGain.gain.linearRampToValueAtTime(0.06, now + 0.2); // Reduced from 0.1

            // Connect nodes
            bassOsc.connect(bassFilter);
            bassFilter.connect(bassGain);

            // Start the oscillator
            bassOsc.start(now);

            // Add a sub-bass oscillator for extra depth
            const subBassOsc = this.ctx.createOscillator();
            const subBassGain = this.ctx.createGain();

            subBassOsc.type = 'sine';
            subBassOsc.frequency.value = 30 + (strength / 60); // Even lower frequency

            subBassGain.gain.setValueAtTime(0.001, now);
            subBassGain.gain.linearRampToValueAtTime(0.06, now + 0.3); // Reduced from 0.1

            // Add a moving atmospheric layer for wider "space" feel
            airOsc.type = 'triangle';
            airOsc.frequency.setValueAtTime(260 + (strength / 18), now);
            airOsc.frequency.linearRampToValueAtTime(420 + (strength / 14), now + 0.8);

            airFilter.type = 'bandpass';
            airFilter.frequency.value = 1200;
            airFilter.Q.value = 0.7;

            airGain.gain.setValueAtTime(0.001, now);
            airGain.gain.linearRampToValueAtTime(0.02, now + 0.35);

            if (hasStereo) {
                stereoPan.pan.setValueAtTime((Math.random() * 2) - 1, now);
                panLfo.type = 'sine';
                panLfo.frequency.value = 0.07 + (Math.random() * 0.06);
                panLfoGain.gain.value = 0.45;
                panLfo.connect(panLfoGain);
                panLfoGain.connect(stereoPan.pan);
            }

            subBassOsc.connect(subBassGain);
            subBassGain.connect(stereoPan);
            bassGain.connect(stereoPan);

            airOsc.connect(airFilter);
            airFilter.connect(airGain);
            airGain.connect(stereoPan);
            stereoPan.connect(this.masterGain);

            subBassOsc.start(now);
            airOsc.start(now);
            if (panLfo) panLfo.start(now);

            // Store the oscillators and gains for later cleanup
            this.activeGravityWells.set(wellId, {
                bassOsc,
                bassGain,
                subBassOsc,
                subBassGain,
                airOsc,
                airGain,
                panLfo,
                stereoPan
            });
        });
    }

    // Stop bassy gravity well sound
    stopGravityWellSound(wellId) {
        if (!this.ctx || !this.activeGravityWells.has(wellId)) return;

        const now = this.ctx.currentTime;
        const sounds = this.activeGravityWells.get(wellId);

        // Fade out bass
        sounds.bassGain.gain.cancelScheduledValues(now);
        sounds.bassGain.gain.setValueAtTime(sounds.bassGain.gain.value, now);
        sounds.bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); // Increased from 0.3

        sounds.subBassGain.gain.cancelScheduledValues(now);
        sounds.subBassGain.gain.setValueAtTime(sounds.subBassGain.gain.value, now);
        sounds.subBassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); // Increased from 0.3

        if (sounds.airGain) {
            sounds.airGain.gain.cancelScheduledValues(now);
            sounds.airGain.gain.setValueAtTime(sounds.airGain.gain.value, now);
            sounds.airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        }

        const bgAudio = document.getElementById('bgMusic');
        if (bgAudio) {
            const baseVolume = this.lastMusicState.volume > 0 ? this.lastMusicState.volume : 0.5;
            bgAudio.volume = this.getEffectiveMusicVolume(baseVolume);
        }

        // Stop oscillators
        sounds.bassOsc.stop(now + 0.4);
        sounds.subBassOsc.stop(now + 0.4);
        if (sounds.airOsc) sounds.airOsc.stop(now + 0.35);
        if (sounds.panLfo) sounds.panLfo.stop(now + 0.35);

        // Remove from active sounds
        this.activeGravityWells.delete(wellId);
    }

    stopAllGravityWellSounds(fadeDuration = 0.2) {
        if (!this.ctx || this.activeGravityWells.size === 0) return;
        const activeIds = Array.from(this.activeGravityWells.keys());
        activeIds.forEach(wellId => this.stopGravityWellSound(wellId));
    }

    syncGravityWellAudioState() {
        if (!this.enabled || !this.ctx) {
            this.stopAllGravityWellSounds(0.1);
            return;
        }

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
            this.stopAllGravityWellSounds(0.1);
            return;
        }

        const wells = Array.isArray(game.gravityWells) ? game.gravityWells : [];
        const ball = game.ball;
        if (!ball?.pos) {
            this.stopAllGravityWellSounds(0.1);
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

    async init() {
        try {
            // Check if audio context is supported
            if (!window.AudioContext && !window.webkitAudioContext) {
                console.warn('Web Audio API not supported');
                this.fallbackToNoAudio();
                return;
            }

            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            // Create advanced audio graph
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.masterVolume;

            // Add compression and EQ for professional sound
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -24;
            this.compressor.knee.value = 30;
            this.compressor.ratio.value = 12;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.25;

            // Add subtle EQ with more bass emphasis
            this.eq = this.ctx.createBiquadFilter();
            this.eq.type = 'peaking';
            this.eq.frequency.value = 200; // Lowered from 1000 for more bass
            this.eq.gain.value = 4; // Increased from 2
            this.eq.Q.value = 1;

            // Add bass boost filter
            this.bassBoost = this.ctx.createBiquadFilter();
            this.bassBoost.type = 'lowshelf';
            this.bassBoost.frequency.value = 200;
            this.bassBoost.gain.value = 6; // Boost bass by 6dB

            // Connect audio graph
            this.masterGain.connect(this.compressor);
            this.compressor.connect(this.bassBoost);
            this.bassBoost.connect(this.eq);

            // Tap final output through analyser so the control panel can render a live spectrum.
            this.visualizerAnalyser = this.ctx.createAnalyser();
            this.visualizerAnalyser.fftSize = 128;
            this.visualizerAnalyser.smoothingTimeConstant = 0.82;
            this.visualizerAnalyser.minDecibels = -90;
            this.visualizerAnalyser.maxDecibels = -12;
            this.visualizerBins = new Uint8Array(this.visualizerAnalyser.frequencyBinCount);

            this.eq.connect(this.visualizerAnalyser);
            this.visualizerAnalyser.connect(this.ctx.destination);

            this.initialized = true;

            // Start cleanup and monitoring intervals
            this.cleanupInterval = setInterval(() => this.cleanupFinishedOscillators(), 3000);
            this.performanceInterval = setInterval(() => this.updatePerformanceScore(), 10000);
            this.gravitySyncInterval = setInterval(() => this.syncGravityWellAudioState(), 120);
            this.voiceSyncInterval = setInterval(() => this.applyVoiceSettings(), 1200);
            // Lower-frequency polling to avoid high-overhead repeated routing.
            this.musicSyncInterval = setInterval(() => this.applyMusicMuteState(), 3000);

            // Observe new media elements added dynamically (event-driven), to avoid repeated DOM scans.
            this.mediaObserver = new MutationObserver(() => this.syncMusicVisualizerRouting());
            if (document.body) {
                this.mediaObserver.observe(document.body, { childList: true, subtree: true });
            }

            this.syncMusicVisualizerRouting();
            this.applyMusicMuteState();
            this.applyVoiceSettings();

        } catch (error) {
            console.warn('Audio initialization failed:', error);
            this.fallbackToNoAudio();
        }
    }

    fallbackToNoAudio() {

        // Create silent stub methods
        const methods = [
            'hit', 'bounce', 'score', 'powerUp', 'levelUp', 'achievement',
            'obstacleHit', 'paddleShrink', 'freezeEffect', 'gameStart', 'uiClick',
            'zombieWave', 'zombieHit', 'zombieSpit', 'zombieBreach', 'zombieChoice',
            'speedChallenge', 'speedChallengeSuccess', 'speedChallengeFail',
            'rallyMilestone', 'createSound', 'createScoreSound', 'createLevelUpSound',
            'startGravityWellSound', 'stopGravityWellSound', 'laser',  // Added laser method
            'stopAllGravityWellSounds', 'syncGravityWellAudioState',
            'toggleMusicMute', 'setMusicMuteState', 'applyMusicMuteState',
            'setSfxVolume', 'setMusicVolume', 'setVoiceVolume', 'setVoiceMute'  // Channel controls
        ];

        methods.forEach(method => {
            this[method] = () => {}; // No-op
        });

        this.setVolume = () => {};
        this.enable = () => Promise.resolve();
        this.disable = () => {};
        this.resume = () => Promise.resolve();
        this.getVolumePercent = () => 0;
        this.getSfxVolumePercent = () => 0;
        this.getMusicVolumePercent = () => 0;
        this.getVoiceVolumePercent = () => 0;
        this.getVisualizerSnapshot = () => ({ bars: new Array(18).fill(0.03), level: 0, peak: 0, active: false });
        this.testAllSounds = () => console.log('🔇 Audio disabled');

        this.initialized = true; // Mark as initialized to prevent repeated attempts
    }

    cleanupFinishedOscillators() {
        const now = Date.now();
        this.activeOscillators.forEach(osc => {
            if (osc._finished || (osc._startTime && now - osc._startTime > 10000)) {
                try {
                    if (!osc._finished) osc.stop();
                } catch (e) {
                    // Oscillator might already be stopped
                }
                this.activeOscillators.delete(osc);
            }
        });
    }

    updatePerformanceScore() {
        const load = this.activeOscillators.size / this.maxPolyphony;
        this.analytics.performanceScore = Math.max(20, 100 - (load * 50));
    }

    ensureContext() {
        if (!this.initialized) {
            return this.init().then(() => {
                if (this.ctx && this.ctx.state === 'suspended') {
                    return this.ctx.resume();
                }
            });
        }

        if (this.ctx && this.ctx.state === 'suspended') {
            return this.ctx.resume();
        }

        return Promise.resolve();
    }

    clampFrequency(freq) {
        return Math.max(20, Math.min(24000, freq));
    }

    getRandomVariation(variations) {
        return variations[Math.floor(Math.random() * variations.length)];
    }

    createSound(freq, type = 'sine', duration = 0.1, vol = 0.5, options = {}) {
        if (!this.initialized || !this.enabled || this.activeOscillators.size >= this.maxPolyphony) {
            return null; // Return null if sound can't be played
        }

        const now = this.ctx.currentTime;
        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.type = type;

        // Handle frequency options
        if (options.sweep) {
            const startFreq = options.sweepStart || freq * 0.5;
            const endFreq = options.sweepEnd || freq * 2;
            oscillator.frequency.setValueAtTime(this.clampFrequency(startFreq), now);
            oscillator.frequency.exponentialRampToValueAtTime(this.clampFrequency(endFreq), now + duration);
        } else if (options.vibrato) {
            const vibDepth = options.vibratoDepth || 10;
            const vibSpeed = options.vibratoSpeed || 5;
            oscillator.frequency.setValueAtTime(this.clampFrequency(freq), now);
            oscillator.frequency.setValueAtTime(this.clampFrequency(freq + vibDepth), now + 0.1);
        } else {
            oscillator.frequency.value = this.clampFrequency(freq);
        }

        // Enhanced ADSR envelope with more sustain
        const attackTime = options.attack || 0.02; // Increased from 0.01
        const decayTime = options.decay || duration * 0.2;
        const sustainLevel = options.sustain || 0.8; // Increased from 0.7
        const releaseTime = options.release || duration * 0.4; // Increased from 0.3
        const sustainTime = Math.max(0, duration - attackTime - decayTime - releaseTime);

        const normalizedVol = Math.max(0, Math.min(1, vol * this.sfxVolume));
        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(normalizedVol, now + attackTime);

        if (decayTime > 0) {
            gainNode.gain.linearRampToValueAtTime(normalizedVol * sustainLevel, now + attackTime + decayTime);
        }

        if (sustainTime > 0) {
            gainNode.gain.linearRampToValueAtTime(normalizedVol * sustainLevel * 0.9, now + attackTime + decayTime + sustainTime);
        }

        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.start(now);
        oscillator.stop(now + duration);

        // Track oscillator for cleanup and analytics
        oscillator._finished = false;
        oscillator._startTime = Date.now();
        oscillator.onended = () => {
            oscillator._finished = true;
            this.analytics.concurrentSounds = Math.max(0, this.analytics.concurrentSounds - 1);
            this.analytics.totalPlayTime += duration;
        };

        this.activeOscillators.add(oscillator);
        this.analytics.soundsPlayed++;
        this.analytics.concurrentSounds++;
        this.analytics.maxConcurrent = Math.max(this.analytics.maxConcurrent, this.analytics.concurrentSounds);
        this.analytics.lastPlayed[type] = now;

        return oscillator;
    }

    createScoreSound() {
        if (!this.initialized || !this.enabled) return;

        const chord = this.sounds.score.chord;

        // Add bass root note
        this.createSound(this.sounds.score.bassRoot, 'sine', 0.5, 0.3);

        if (this.sounds.score.arpeggiate) {
            // Arpeggiated chord
            chord.forEach((interval, i) => {
                setTimeout(() => {
                    const frequency = this.sounds.score.baseFreq * Math.pow(2, interval / 12);
                    this.createSound(
                        frequency,
                        this.sounds.score.type,
                        0.5,
                        0.2,
                        { attack: 0.05, release: 0.3 }
                    );
                }, i * 150); // Increased from 120
            });
        } else {
            // Simultaneous chord
            chord.forEach((interval) => {
                const frequency = this.sounds.score.baseFreq * Math.pow(2, interval / 12);
                this.createSound(
                    frequency,
                    this.sounds.score.type,
                    0.5,
                    0.2,
                    { attack: 0.05, release: 0.3 }
                );
            });
        }
    }

    createLevelUpSound() {
        if (!this.initialized || !this.enabled) return;

        const arpeggio = this.sounds.levelUp.arpeggio;

        // Add bass drop
        this.createSound(this.sounds.levelUp.bassDrop, 'sine', 0.2, 0.4);

        arpeggio.forEach((interval, i) => {
            setTimeout(() => {
                const frequency = this.sounds.levelUp.baseFreq * Math.pow(2, interval / 12);
                const vol = 0.15 + (i * 0.02);

                this.createSound(
                    frequency,
                    this.sounds.levelUp.type,
                    0.4,
                    Math.min(vol, 0.25),
                    {
                        attack: 0.03,
                        release: 0.3,
                        vibrato: this.sounds.levelUp.triumphant,
                        vibratoDepth: 5,
                        vibratoSpeed: 8
                    }
                );
            }, i * 100); // Increased from 80
        });
    }

    // === FIXED: Required by original game ===
    speedChallenge() {
        this.ensureContext().then(() => {
            const now = this.ctx.currentTime;

            // Main accelerating sweep with more bass
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now); // Lowered from 200
            osc.frequency.exponentialRampToValueAtTime(1500, now + 0.7); // Increased duration

            gain.gain.setValueAtTime(0.4, now); // Increased from 0.3
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.7);

            // Add bass component
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();

            bassOsc.type = 'sine';
            bassOsc.frequency.setValueAtTime(80, now);
            bassOsc.frequency.exponentialRampToValueAtTime(120, now + 0.7);

            bassGain.gain.setValueAtTime(0.3, now);
            bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

            bassOsc.connect(bassGain);
            bassGain.connect(this.masterGain);
            bassOsc.start(now);
            bassOsc.stop(now + 0.7);

            // Supporting riser sounds
            [0, 0.15, 0.3].forEach((delay, index) => {
                setTimeout(() => {
                    this.createSound(
                        1000 + Math.random() * 600 + (index * 200), // Lowered from 1200
                        'sine',
                        0.2,
                        0.15 + (index * 0.05),
                        { sweep: true, sweepStart: 600, sweepEnd: 1400 } // Lowered range
                    );
                }, delay * 1000);
            });
        });
    }

    speedChallengeSuccess() {
        this.ensureContext().then(() => {
            const notes = [660, 880, 1108, 1320, 1760]; // Lowered frequencies

            // Add bass component
            this.createSound(220, 'sine', 0.6, 0.3);

            notes.forEach((freq, i) => {
                setTimeout(() => {
                    this.createSound(
                        freq,
                        'triangle',
                        0.5,
                        0.25,
                        {
                            attack: 0.05,
                            release: 0.4,
                            sweep: true,
                            sweepStart: freq * 0.8,
                            sweepEnd: freq * 1.2
                        }
                    );
                }, i * 100); // Increased from 80
            });
        });
    }

    speedChallengeFail() {
        this.ensureContext().then(() => {
            const notes = [0, -2, -4, -6].map(n => 165 * Math.pow(2, n / 12)); // Lowered from 220

            // Add bass component
            this.createSound(110, 'sawtooth', 0.3, 0.3);

            notes.forEach((freq, i) => {
                setTimeout(() => {
                    this.createSound(
                        freq,
                        'sawtooth',
                        0.3,
                        0.2,
                        {
                            attack: 0.01,
                            release: 0.2,
                            sweep: true,
                            sweepStart: freq * 1.5,
                            sweepEnd: freq * 0.5
                        }
                    );
                }, i * 120); // Increased from 100
            });
        });
    }
    // ========================================

    // Enhanced sound methods with bass-heavy, consistent sounds
    /**
     * Layered impact: a short filtered-noise click (the transient you feel), a
     * pitched body whose pitch and loudness follow the hit strength, and a low
     * thump on hard hits. Panned to where it happened; all layers are scheduled
     * on the audio clock so they stay tight.
     */
    playImpact({ strength = 0.5, pan = 0, freq = 440, type = 'triangle', thump = true, length = 0.09 } = {}) {
        if (!this.initialized || !this.enabled || !this.ctx) return;
        if (this.activeOscillators.size >= this.maxPolyphony) return;
        const ctx = this.ctx;
        const now = ctx.currentTime + 0.002;
        const k = Math.max(0, Math.min(1, strength));
        const vol = Math.max(0, Math.min(1, this.sfxVolume)) * (0.35 + 0.65 * k);

        let out = this.masterGain;
        if (typeof ctx.createStereoPanner === 'function') {
            const panner = ctx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            panner.connect(this.masterGain);
            out = panner;
        }

        // Transient click
        if (!this._impactNoise) {
            const len = Math.floor(ctx.sampleRate * 0.05);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
            this._impactNoise = buf;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = this._impactNoise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800 + k * 3200;
        bp.Q.value = 0.9;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.55, now);
        ng.gain.exponentialRampToValueAtTime(0.0005, now + 0.025);
        noise.connect(bp); bp.connect(ng); ng.connect(out);
        noise.start(now);
        noise.stop(now + 0.04);

        // Pitched body: starts a little sharp and settles (reads as "contact").
        const f0 = this.clampFrequency(freq * (1 + k * 0.35));
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f0 * 1.3, now);
        osc.frequency.exponentialRampToValueAtTime(f0, now + 0.025);
        const og = ctx.createGain();
        const bodyLen = length + k * 0.05;
        og.gain.setValueAtTime(0.0005, now);
        og.gain.linearRampToValueAtTime(vol * 0.5, now + 0.002);
        og.gain.exponentialRampToValueAtTime(0.0005, now + bodyLen);
        osc.connect(og); og.connect(out);
        osc.start(now);
        osc.stop(now + bodyLen + 0.01);
        this.activeOscillators.add(osc);
        osc.onended = () => this.activeOscillators.delete(osc);

        // Low thump for hard hits.
        if (thump && k > 0.25) {
            const sub = ctx.createOscillator();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(110, now);
            sub.frequency.exponentialRampToValueAtTime(45, now + 0.12);
            const sg = ctx.createGain();
            sg.gain.setValueAtTime(0.0005, now);
            sg.gain.linearRampToValueAtTime(vol * 0.75 * k, now + 0.004);
            sg.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
            sub.connect(sg); sg.connect(out);
            sub.start(now);
            sub.stop(now + 0.15);
        }
        this.analytics.soundsPlayed++;
    }

    // strength 0..1, pan -1..1, side 'left' | 'right' (left is higher: ping… pong).
    hit(strength = 0.5, pan = 0, side = 'left') {
        this.ensureContext().then(() => {
            this.playImpact({ strength, pan, freq: side === 'right' ? 392 : 523, type: 'triangle', length: 0.1 });
            this.consecutiveHits++;
        });
    }

    bounce(strength = 0.4, pan = 0) {
        this.ensureContext().then(() => {
            this.playImpact({ strength: strength * 0.7, pan, freq: 294, type: 'sine', thump: false, length: 0.07 });
        });
    }

    score() {
        this.ensureContext().then(() => {
            this.createScoreSound();
            this.consecutiveHits = 0;
        });
    }

    powerUp() {
        this.ensureContext().then(() => {
            const sound = this.sounds.powerUp;
            const now = this.ctx.currentTime;
            const volScale = Math.max(0, Math.min(1, this.sfxVolume));
            const notes = [523.25, 659.25, 783.99, 1046.5];

            notes.forEach((baseFreq, i) => {
                const t = now + i * 0.055;

                const bodyOsc = this.ctx.createOscillator();
                const bodyGain = this.ctx.createGain();
                bodyOsc.type = i % 2 === 0 ? 'square' : 'triangle';
                bodyOsc.frequency.setValueAtTime(baseFreq * 0.92, t);
                bodyOsc.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.03);
                bodyGain.gain.setValueAtTime(0.0001, t);
                bodyGain.gain.linearRampToValueAtTime(sound.vol * 0.44 * volScale, t + 0.005);
                bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
                bodyOsc.connect(bodyGain);
                bodyGain.connect(this.masterGain);
                bodyOsc.start(t);
                bodyOsc.stop(t + 0.13);

                const sparkleOsc = this.ctx.createOscillator();
                const sparkleGain = this.ctx.createGain();
                sparkleOsc.type = 'sine';
                sparkleOsc.frequency.setValueAtTime(baseFreq * 2.01, t);
                sparkleGain.gain.setValueAtTime(0.0001, t);
                sparkleGain.gain.linearRampToValueAtTime(sound.vol * 0.16 * volScale, t + 0.004);
                sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
                sparkleOsc.connect(sparkleGain);
                sparkleGain.connect(this.masterGain);
                sparkleOsc.start(t);
                sparkleOsc.stop(t + 0.09);
            });
        });
    }

    levelUp() {
        this.ensureContext().then(() => {
            this.createLevelUpSound();
        });
    }

    achievement() {
        this.ensureContext().then(() => {
            const sound = this.sounds.achievement;

            // Add bass thump if specified
            if (sound.bassThump) {
                this.createSound(sound.bassThump, 'sine', 0.2, 0.4);
            }

            if (sound.sparkle) {
                // Create sparkle effect with multiple layers
                const layers = sound.layers || 3;
                for (let i = 0; i < layers; i++) {
                    setTimeout(() => {
                        // Create a sparkle cluster
                        for (let j = 0; j < 3; j++) {
                            setTimeout(() => {
                                this.createSound(
                                    sound.freq + (i * 165) + (j * 55),
                                    'square',
                                    0.3,
                                    0.15 + (i * 0.05),
                                    { attack: 0.02, release: 0.25 }
                                );
                            }, j * 30);
                        }
                    }, i * 100);
                }
            } else {
                this.createSound(sound.freq, sound.type, sound.duration, sound.vol);
            }
        });
    }

    obstacleHit() {
        this.ensureContext().then(() => {
            const sound = this.sounds.obstacleHit;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol);

            // Add low frequency component
            if (sound.lowFreq) {
                this.createSound(sound.lowFreq, 'sine', 0.2, 0.2);
            }

            // Add bass rumble if specified
            if (sound.bassRumble) {
                setTimeout(() => {
                    this.createSound(sound.bassRumble, 'sine', 0.15, 0.3);
                }, 50);
            }

            if (sound.impact) {
                // Add impact noise
                setTimeout(() => {
                    this.createSound(55, 'square', 0.15, 0.15); // Lowered from 60
                }, 50);
            }
        });
    }

    paddleShrink() {
        this.ensureContext().then(() => {
            const sound = this.sounds.paddleShrink;

            // Main shrink sound
            if (sound.descending) {
                this.createSound(
                    sound.freq,
                    sound.type,
                    sound.duration,
                    sound.vol,
                    {
                        sweep: true,
                        sweepStart: sound.freq * 2,
                        sweepEnd: sound.freq * 0.5
                    }
                );
            } else {
                this.createSound(sound.freq, sound.type, sound.duration, sound.vol);
            }

            // Add bass swoosh if specified
            if (sound.bassSwoosh) {
                setTimeout(() => {
                    this.createSound(
                        sound.bassSwoosh,
                        'sine',
                        0.2,
                        0.3,
                        {
                            sweep: true,
                            sweepStart: sound.bassSwoosh * 1.5,
                            sweepEnd: sound.bassSwoosh * 0.5
                        }
                    );
                }, 30);
            }
        });
    }

    zombieWave() {
        this.ensureContext().then(() => {
            const sound = this.sounds.zombieWave;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol, {
                attack: sound.attack,
                release: sound.release
            });
            if (sound.bassSwoosh) {
                setTimeout(() => this.createSound(sound.bassSwoosh, 'sine', 0.16, 0.22), 35);
            }
        });
    }

    zombieHit() {
        this.ensureContext().then(() => {
            const sound = this.sounds.zombieHit;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol, {
                attack: sound.attack,
                release: sound.release
            });
            if (sound.bassSwoosh) {
                setTimeout(() => this.createSound(sound.bassSwoosh, 'sine', 0.12, 0.2), 20);
            }
        });
    }

    zombieSpit() {
        this.ensureContext().then(() => {
            const sound = this.sounds.zombieSpit;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol, {
                attack: sound.attack,
                release: sound.release,
                sweep: sound.sweep,
                sweepStart: sound.sweepStart,
                sweepEnd: sound.sweepEnd
            });
        });
    }

    zombieBreach() {
        this.ensureContext().then(() => {
            const sound = this.sounds.zombieBreach;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol, {
                attack: sound.attack,
                release: sound.release
            });
            if (sound.bassSwoosh) {
                setTimeout(() => this.createSound(sound.bassSwoosh, 'sine', 0.18, 0.24), 30);
            }
        });
    }

    zombieChoice() {
        this.ensureContext().then(() => {
            const sound = this.sounds.zombieChoice;
            this.createSound(sound.freq, sound.type, sound.duration, sound.vol, {
                attack: sound.attack,
                release: sound.release,
                sweep: sound.sweep,
                sweepStart: sound.sweepStart,
                sweepEnd: sound.sweepEnd
            });
        });
    }

    freezeEffect() {
        this.ensureContext().then(() => {
            const sound = this.sounds.freeze;

            // Main freeze sound
            if (sound.shimmer) {
                const layers = sound.layers || 2;
                for (let i = 0; i < layers; i++) {
                    setTimeout(() => {
                        this.createSound(
                            sound.freq + (i * 55),
                            sound.type,
                            sound.duration - (i * 0.1),
                            sound.vol - (i * 0.1),
                            {
                                attack: 0.1,
                                release: 0.3,
                                vibrato: true,
                                vibratoDepth: 3,
                                vibratoSpeed: 4
                            }
                        );
                    }, i * 100);
                }
            } else {
                this.createSound(sound.freq, sound.type, sound.duration, sound.vol);
            }

            // Add bass crackle if specified
            if (sound.bassCrackle) {
                setTimeout(() => {
                    for (let i = 0; i < 3; i++) {
                        setTimeout(() => {
                            this.createSound(sound.bassCrackle + (i * 20), 'square', 0.1, 0.2);
                        }, i * 40);
                    }
                }, 200);
            }
        });
    }

    gameStart() {
        this.ensureContext().then(() => {
            const chords = this.sounds.gameStart.chordProgression;

            // Add bass pulse if specified
            if (this.sounds.gameStart.bassPulse) {
                this.createSound(this.sounds.gameStart.bassPulse, 'sine', 0.3, 0.3);
            }

            chords.forEach((chord, chordIndex) => {
                chord.forEach((interval, noteIndex) => {
                    setTimeout(() => {
                        const frequency = this.sounds.gameStart.baseFreq * Math.pow(2, interval / 12);
                        this.createSound(
                            frequency,
                            'sine',
                            0.3,
                            0.2,
                            {
                                attack: 0.05,
                                release: 0.25
                            }
                        );
                    }, chordIndex * 250 + noteIndex * 50); // Increased from 200 and 50
                });
            });
        });
    }

    uiClick() {
        this.ensureContext().then(() => {
            const sound = this.sounds.uiClick;
            const freq = sound.randomize && sound.variations
                ? this.getRandomVariation(sound.variations)
                : sound.freq;

            // Main click sound
            this.createSound(freq, sound.type, sound.duration, sound.vol);

            // Add bass pop if specified
            if (sound.bassPop) {
                setTimeout(() => {
                    this.createSound(sound.bassPop, 'sine', 0.05, 0.2);
                }, 20);
            }
        });
    }

    rallyMilestone(count) {
        if (!this.initialized || !this.enabled) return;

        const sound = this.sounds.rally;
        const freq = sound.incremental
            ? sound.baseFreq + (count * 10)
            : sound.baseFreq;

        // Main rally sound
        this.createSound(
            Math.min(freq, 1500), // Lowered cap from 2000
            sound.type,
            sound.duration,
            sound.vol + (count * 0.01) // Slight volume increase
        );

        // Add bass pulse if specified
        if (sound.bassPulse) {
            setTimeout(() => {
                this.createSound(sound.bassPulse, 'sine', 0.1, 0.2);
            }, 50);
        }
    }

    laser() {
        this.ensureContext().then(() => {
            const sound = this.sounds.laser;
            const now = this.ctx.currentTime;
            const laserVol = Math.max(0, Math.min(1, sound.vol * this.sfxVolume));
            const laserOsc = this.ctx.createOscillator();
            const laserGain = this.ctx.createGain();
            const laserFilter = this.ctx.createBiquadFilter();
            const punchOsc = this.ctx.createOscillator();
            const punchGain = this.ctx.createGain();

            // more modern weapon shot: hard transient + compact energy sweep
            laserOsc.type = 'sawtooth';
            laserOsc.frequency.setValueAtTime(2400, now);
            laserOsc.frequency.exponentialRampToValueAtTime(480, now + 0.09);
            laserFilter.type = 'bandpass';
            laserFilter.frequency.setValueAtTime(3200, now);
            laserFilter.frequency.exponentialRampToValueAtTime(980, now + 0.09);
            laserFilter.Q.value = 8;
            laserGain.gain.setValueAtTime(0.001, now);
            laserGain.gain.linearRampToValueAtTime(laserVol * 0.72, now + 0.002);
            laserGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            laserOsc.connect(laserFilter);
            laserFilter.connect(laserGain);
            laserGain.connect(this.masterGain);
            laserOsc.start(now);
            laserOsc.stop(now + 0.13);

            punchOsc.type = 'sine';
            punchOsc.frequency.setValueAtTime(220, now);
            punchOsc.frequency.exponentialRampToValueAtTime(84, now + 0.07);
            punchGain.gain.setValueAtTime(0.001, now);
            punchGain.gain.linearRampToValueAtTime(laserVol * 0.42, now + 0.004);
            punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            punchOsc.connect(punchGain);
            punchGain.connect(this.masterGain);
            punchOsc.start(now);
            punchOsc.stop(now + 0.1);

            // add a short burst of filtered noise for a harder attack
            const noiseBuffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(this.ctx.sampleRate * 0.035)), this.ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                // fade the noise so it doesn't click hard at the end
                noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);
            }

            const noiseSrc = this.ctx.createBufferSource();
            const noiseFilter = this.ctx.createBiquadFilter();
            const noiseGain = this.ctx.createGain();
            noiseSrc.buffer = noiseBuffer;
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(2600, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
            noiseFilter.Q.value = 6;
            noiseGain.gain.setValueAtTime(0.001, now);
            noiseGain.gain.linearRampToValueAtTime(laserVol * 0.24, now + 0.002);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            noiseSrc.start(now);
            noiseSrc.stop(now + 0.06);

            // Track oscillator for cleanup
            laserOsc._finished = false;
            laserOsc._startTime = Date.now();
            laserOsc.onended = () => {
                laserOsc._finished = true;
                this.analytics.concurrentSounds = Math.max(0, this.analytics.concurrentSounds - 1);
                this.analytics.totalPlayTime += 0.125;
            };

            this.activeOscillators.add(laserOsc);
            this.activeOscillators.add(punchOsc);
            punchOsc._finished = false;
            punchOsc._startTime = Date.now();
            punchOsc.onended = () => {
                punchOsc._finished = true;
                this.analytics.concurrentSounds = Math.max(0, this.analytics.concurrentSounds - 1);
                this.analytics.totalPlayTime += 0.1;
            };
            this.analytics.soundsPlayed++;
            this.analytics.concurrentSounds += 2;
            this.analytics.maxConcurrent = Math.max(this.analytics.maxConcurrent, this.analytics.concurrentSounds);
            this.analytics.lastPlayed['laser'] = now;
        });
    }

    fireBreathWarning() {
        // 3-second charging/warning phase - Death Star powering up aesthetic
        this.ensureContext().then(() => {
            const sound = this.sounds.fireBreathWarning;
            const now = this.ctx.currentTime;
            const vol = Math.max(0, Math.min(1, sound.vol * this.sfxVolume));
            
            // Main bass oscillator
            const mainOsc = this.ctx.createOscillator();
            const mainGain = this.ctx.createGain();
            const mainFilter = this.ctx.createBiquadFilter();
            
            mainOsc.type = 'sine';
            mainOsc.frequency.setValueAtTime(55, now);
            mainOsc.frequency.exponentialRampToValueAtTime(110, now + 3.0); // Sweep up over 3s
            
            // LFO for intensity modulation (pulsing buildup)
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(2.5, now); // Slow pulsing
            lfoGain.gain.setValueAtTime(0.1, now);
            lfoGain.gain.linearRampToValueAtTime(0.35, now + 3.0); // Increases intensity
            
            lfo.connect(lfoGain);
            lfoGain.connect(mainGain.gain);
            
            // Second LFO for harmonic complexity
            const lfo2 = this.ctx.createOscillator();
            const lfo2Gain = this.ctx.createGain();
            lfo2.frequency.setValueAtTime(3.7, now); // Different rate
            lfo2Gain.gain.setValueAtTime(0.05, now);
            lfo2Gain.gain.linearRampToValueAtTime(0.2, now + 3.0);
            
            lfo2.connect(lfo2Gain);
            lfo2Gain.connect(mainFilter.frequency);
            
            // Filter for tightening
            mainFilter.type = 'lowpass';
            mainFilter.frequency.setValueAtTime(150, now);
            mainFilter.frequency.exponentialRampToValueAtTime(220, now + 3.0);
            
            mainGain.gain.setValueAtTime(0.01, now);
            mainGain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.3); // Attack over 0.3s
            mainGain.gain.exponentialRampToValueAtTime(0.005, now + 3.0); // Subtle fade
            
            mainOsc.connect(mainFilter);
            mainFilter.connect(mainGain);
            mainGain.connect(this.masterGain);
            
            // Sub-bass harmonics for ultra-deep rumble
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bassOsc.type = 'sine';
            bassOsc.frequency.setValueAtTime(27.5, now);
            
            bassGain.gain.setValueAtTime(0.01, now);
            bassGain.gain.linearRampToValueAtTime(vol * 0.5, now + 0.3);
            bassGain.gain.exponentialRampToValueAtTime(0.01, now + 3.0);
            
            bassOsc.connect(bassGain);
            bassGain.connect(this.masterGain);
            
            // Secondary harmonic for richness
            const harmOsc = this.ctx.createOscillator();
            const harmGain = this.ctx.createGain();
            harmOsc.type = 'sine';
            harmOsc.frequency.setValueAtTime(220, now);
            harmOsc.frequency.exponentialRampToValueAtTime(330, now + 3.0);
            
            harmGain.gain.setValueAtTime(0.01, now);
            harmGain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.3);
            harmGain.gain.exponentialRampToValueAtTime(0.005, now + 3.0);
            
            harmOsc.connect(harmGain);
            harmGain.connect(this.masterGain);
            
            // Extra harmonic layer at 110Hz for resonance
            const harmOsc2 = this.ctx.createOscillator();
            const harmGain2 = this.ctx.createGain();
            harmOsc2.type = 'sine';
            harmOsc2.frequency.setValueAtTime(110, now);
            harmOsc2.frequency.exponentialRampToValueAtTime(165, now + 3.0);
            
            harmGain2.gain.setValueAtTime(0.005, now);
            harmGain2.gain.linearRampToValueAtTime(vol * 0.25, now + 0.3);
            harmGain2.gain.exponentialRampToValueAtTime(0.003, now + 3.0);
            
            harmOsc2.connect(harmGain2);
            harmGain2.connect(this.masterGain);
            
            // Noise texture layer for grittiness
            const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 3.0), this.ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = (Math.random() * 2 - 1) * (0.15 * Math.exp(-i / (noiseData.length * 0.4)));
            }
            
            const noiseSrc = this.ctx.createBufferSource();
            const noiseFilter = this.ctx.createBiquadFilter();
            const noiseGain = this.ctx.createGain();
            
            noiseSrc.buffer = noiseBuffer;
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.setValueAtTime(200, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(400, now + 3.0);
            
            noiseGain.gain.setValueAtTime(0.001, now);
            noiseGain.gain.linearRampToValueAtTime(vol * 0.15, now + 0.5);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 3.0);
            
            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            
            // Saturation layer via square wave
            const satOsc = this.ctx.createOscillator();
            const satGain = this.ctx.createGain();
            satOsc.type = 'square';
            satOsc.frequency.setValueAtTime(55, now);
            satOsc.frequency.exponentialRampToValueAtTime(110, now + 3.0);
            
            satGain.gain.setValueAtTime(0.001, now);
            satGain.gain.linearRampToValueAtTime(vol * 0.08, now + 1.0);
            satGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
            
            satOsc.connect(satGain);
            satGain.connect(this.masterGain);
            
            mainOsc.start(now);
            lfo.start(now);
            lfo2.start(now);
            bassOsc.start(now);
            harmOsc.start(now);
            harmOsc2.start(now);
            noiseSrc.start(now);
            satOsc.start(now);
            
            mainOsc.stop(now + 3.0);
            lfo.stop(now + 3.0);
            lfo2.stop(now + 3.0);
            bassOsc.stop(now + 3.0);
            harmOsc.stop(now + 3.0);
            harmOsc2.stop(now + 3.0);
            noiseSrc.stop(now + 3.0);
            satOsc.stop(now + 3.0);
            
            this.activeOscillators.add(mainOsc);
            this.activeOscillators.add(lfo);
            this.activeOscillators.add(lfo2);
            this.activeOscillators.add(bassOsc);
            this.activeOscillators.add(harmOsc);
            this.activeOscillators.add(harmOsc2);
            this.activeOscillators.add(satOsc);
            
            this.analytics.soundsPlayed++;
            this.analytics.concurrentSounds += 8;
            this.analytics.maxConcurrent = Math.max(this.analytics.maxConcurrent, this.analytics.concurrentSounds);
            this.analytics.lastPlayed['fireBreathWarning'] = now;
        });
    }

    fireBreathRelease() {
        // 2-second explosive release - Nuclear blast + AT field destruction
        this.ensureContext().then(() => {
            const sound = this.sounds.fireBreathRelease;
            const now = this.ctx.currentTime;
            const vol = Math.max(0, Math.min(1, sound.vol * this.sfxVolume));
            
            // Main impact oscillator - explosive sawtooth
            const mainOsc = this.ctx.createOscillator();
            const mainGain = this.ctx.createGain();
            const mainFilter = this.ctx.createBiquadFilter();
            
            mainOsc.type = 'sawtooth';
            mainOsc.frequency.setValueAtTime(220, now);
            mainOsc.frequency.exponentialRampToValueAtTime(55, now + 2.0); // Dramatic downswoop
            
            mainFilter.type = 'lowpass';
            mainFilter.frequency.setValueAtTime(1200, now);
            mainFilter.frequency.exponentialRampToValueAtTime(400, now + 2.0);
            mainFilter.Q.value = 3;
            
            mainGain.gain.setValueAtTime(vol * 0.2, now);
            mainGain.gain.linearRampToValueAtTime(vol * 0.9, now + 0.01); // Instant punch
            mainGain.gain.exponentialRampToValueAtTime(vol * 0.3, now + 1.5); // Sustain
            mainGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0); // Release
            
            mainOsc.connect(mainFilter);
            mainFilter.connect(mainGain);
            mainGain.connect(this.masterGain);
            
            // Deep sub-bass for physical impact
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bassOsc.type = 'sine';
            bassOsc.frequency.setValueAtTime(27.5, now);
            bassOsc.frequency.exponentialRampToValueAtTime(55, now + 2.0);
            
            bassGain.gain.setValueAtTime(0.05, now);
            bassGain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.02);
            bassGain.gain.exponentialRampToValueAtTime(vol * 0.4, now + 1.3);
            bassGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
            
            bassOsc.connect(bassGain);
            bassGain.connect(this.masterGain);
            
            // Chaotic noise for explosion texture
            const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 2.0), this.ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseData.length * 0.3));
            }
            
            const noiseSrc = this.ctx.createBufferSource();
            const noiseFilter = this.ctx.createBiquadFilter();
            const noiseGain = this.ctx.createGain();
            
            noiseSrc.buffer = noiseBuffer;
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.setValueAtTime(300, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(600, now + 2.0);
            
            noiseGain.gain.setValueAtTime(0.01, now);
            noiseGain.gain.linearRampToValueAtTime(vol * 0.25, now + 0.05);
            noiseGain.gain.exponentialRampToValueAtTime(vol * 0.1, now + 1.5);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            
            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            
            // Secondary noise layer for extra chaos texture
            const noiseBuffer2 = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 2.0), this.ctx.sampleRate);
            const noiseData2 = noiseBuffer2.getChannelData(0);
            for (let i = 0; i < noiseData2.length; i++) {
                noiseData2[i] = (Math.random() * 2 - 1) * (0.6 * Math.sin(i / noiseData2.length * Math.PI));
            }
            
            const noiseSrc2 = this.ctx.createBufferSource();
            const noiseFilter2 = this.ctx.createBiquadFilter();
            const noiseGain2 = this.ctx.createGain();
            
            noiseSrc2.buffer = noiseBuffer2;
            noiseFilter2.type = 'bandpass';
            noiseFilter2.frequency.setValueAtTime(800, now);
            noiseFilter2.frequency.exponentialRampToValueAtTime(1200, now + 2.0);
            noiseFilter2.Q.value = 2;
            
            noiseGain2.gain.setValueAtTime(0.01, now);
            noiseGain2.gain.linearRampToValueAtTime(vol * 0.18, now + 0.1);
            noiseGain2.gain.exponentialRampToValueAtTime(vol * 0.08, now + 1.3);
            noiseGain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            
            noiseSrc2.connect(noiseFilter2);
            noiseFilter2.connect(noiseGain2);
            noiseGain2.connect(this.masterGain);
            
            // Mid-range harmonic for sci-fi character
            const harmOsc = this.ctx.createOscillator();
            const harmGain = this.ctx.createGain();
            harmOsc.type = 'sine';
            harmOsc.frequency.setValueAtTime(330, now);
            harmOsc.frequency.exponentialRampToValueAtTime(110, now + 2.0);
            
            harmGain.gain.setValueAtTime(0.01, now);
            harmGain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.05);
            harmGain.gain.exponentialRampToValueAtTime(vol * 0.15, now + 1.3);
            harmGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            
            harmOsc.connect(harmGain);
            harmGain.connect(this.masterGain);
            
            // Extra harmonic at 165Hz for resonance
            const harmOsc2 = this.ctx.createOscillator();
            const harmGain2 = this.ctx.createGain();
            harmOsc2.type = 'sine';
            harmOsc2.frequency.setValueAtTime(165, now);
            harmOsc2.frequency.exponentialRampToValueAtTime(82.5, now + 2.0);
            
            harmGain2.gain.setValueAtTime(0.01, now);
            harmGain2.gain.linearRampToValueAtTime(vol * 0.25, now + 0.1);
            harmGain2.gain.exponentialRampToValueAtTime(vol * 0.08, now + 1.5);
            harmGain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            
            harmOsc2.connect(harmGain2);
            harmGain2.connect(this.masterGain);
            
            // Low-frequency pulse oscillator for extra rumble
            const pulseOsc = this.ctx.createOscillator();
            const pulseGain = this.ctx.createGain();
            pulseOsc.type = 'square';
            pulseOsc.frequency.setValueAtTime(41.2, now);
            pulseOsc.frequency.exponentialRampToValueAtTime(13.75, now + 2.0);
            
            pulseGain.gain.setValueAtTime(0.05, now);
            pulseGain.gain.linearRampToValueAtTime(vol * 0.35, now + 0.05);
            pulseGain.gain.exponentialRampToValueAtTime(vol * 0.15, now + 1.5);
            pulseGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
            
            pulseOsc.connect(pulseGain);
            pulseGain.connect(this.masterGain);
            
            // Tremolo for pulsing effect
            const tremolo = this.ctx.createOscillator();
            const tremoloGain = this.ctx.createGain();
            tremolo.frequency.setValueAtTime(6.0, now); // Fast pulse
            tremoloGain.gain.setValueAtTime(0.1, now);
            tremoloGain.gain.linearRampToValueAtTime(0.25, now + 0.1);
            tremoloGain.gain.exponentialRampToValueAtTime(0.05, now + 2.0);
            
            tremolo.connect(tremoloGain);
            tremoloGain.connect(mainGain.gain);
            
            // Secondary fast tremolo for chaos
            const tremolo2 = this.ctx.createOscillator();
            const tremolo2Gain = this.ctx.createGain();
            tremolo2.frequency.setValueAtTime(13.0, now); // Faster chaos
            tremolo2Gain.gain.setValueAtTime(0.05, now);
            tremolo2Gain.gain.linearRampToValueAtTime(0.15, now + 0.15);
            tremolo2Gain.gain.exponentialRampToValueAtTime(0.02, now + 2.0);
            
            tremolo2.connect(tremolo2Gain);
            tremolo2Gain.connect(harmGain2.gain);
            
            mainOsc.start(now);
            bassOsc.start(now);
            noiseSrc.start(now);
            noiseSrc2.start(now);
            harmOsc.start(now);
            harmOsc2.start(now);
            pulseOsc.start(now);
            tremolo.start(now);
            tremolo2.start(now);
            
            mainOsc.stop(now + 2.0);
            bassOsc.stop(now + 2.0);
            noiseSrc.stop(now + 2.0);
            noiseSrc2.stop(now + 2.0);
            harmOsc.stop(now + 2.0);
            harmOsc2.stop(now + 2.0);
            pulseOsc.stop(now + 2.0);
            tremolo.stop(now + 2.0);
            tremolo2.stop(now + 2.0);
            
            this.activeOscillators.add(mainOsc);
            this.activeOscillators.add(bassOsc);
            this.activeOscillators.add(harmOsc);
            this.activeOscillators.add(harmOsc2);
            this.activeOscillators.add(pulseOsc);
            this.activeOscillators.add(tremolo);
            this.activeOscillators.add(tremolo2);
            
            this.analytics.soundsPlayed++;
            this.analytics.concurrentSounds += 9;
            this.analytics.maxConcurrent = Math.max(this.analytics.maxConcurrent, this.analytics.concurrentSounds);
            this.analytics.lastPlayed['fireBreathRelease'] = now;
        });
    }

    fireBreathAmbient() {
        // Continuous ominous rumble during breathing - threatening presence
        this.ensureContext().then(() => {
            const sound = this.sounds.fireBreathAmbient;
            const now = this.ctx.currentTime;
            const vol = Math.max(0, Math.min(1, sound.vol * this.sfxVolume));
            
            // Ultra-deep subsonic bass
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(20.6, now); // Subsonic rumble
            
            subGain.gain.setValueAtTime(vol * 0.4, now);
            subGain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.5);
            
            subOsc.connect(subGain);
            subGain.connect(this.masterGain);
            
            // Main low bass with slow modulation
            const mainOsc = this.ctx.createOscillator();
            const mainGain = this.ctx.createGain();
            const mainFilter = this.ctx.createBiquadFilter();
            
            mainOsc.type = 'sine';
            mainOsc.frequency.setValueAtTime(41.2, now);
            
            mainFilter.type = 'bandpass';
            mainFilter.frequency.setValueAtTime(60, now);
            mainFilter.Q.value = 2;
            
            mainGain.gain.setValueAtTime(vol * 0.35, now);
            mainGain.gain.linearRampToValueAtTime(vol * 0.35, now + 0.5);
            
            mainOsc.connect(mainFilter);
            mainFilter.connect(mainGain);
            mainGain.connect(this.masterGain);
            
            // Slow LFO modulation for ominous pulsing
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(1.2, now); // Very slow pulse
            lfoGain.gain.setValueAtTime(0.15, now);
            lfoGain.gain.linearRampToValueAtTime(0.15, now + 0.5); // Subtle modulation
            
            lfo.connect(lfoGain);
            lfoGain.connect(mainGain.gain);
            
            // Second LFO for cross-modulation
            const lfo2 = this.ctx.createOscillator();
            const lfo2Gain = this.ctx.createGain();
            lfo2.frequency.setValueAtTime(0.9, now); // Different rate
            lfo2Gain.gain.setValueAtTime(0.08, now);
            lfo2Gain.gain.linearRampToValueAtTime(0.08, now + 0.5);
            
            lfo2.connect(lfo2Gain);
            lfo2Gain.connect(mainFilter.frequency);
            
            // Harmonic richness at 82.4Hz
            const harmOsc = this.ctx.createOscillator();
            const harmGain = this.ctx.createGain();
            harmOsc.type = 'sine';
            harmOsc.frequency.setValueAtTime(82.4, now); // 2x harmonic
            
            harmGain.gain.setValueAtTime(vol * 0.25, now);
            harmGain.gain.linearRampToValueAtTime(vol * 0.25, now + 0.5);
            
            harmOsc.connect(harmGain);
            harmGain.connect(this.masterGain);
            
            // Extra harmonic at 164.8Hz for complexity
            const harmOsc2 = this.ctx.createOscillator();
            const harmGain2 = this.ctx.createGain();
            harmOsc2.type = 'sine';
            harmOsc2.frequency.setValueAtTime(164.8, now); // 4x harmonic
            
            harmGain2.gain.setValueAtTime(vol * 0.12, now);
            harmGain2.gain.linearRampToValueAtTime(vol * 0.12, now + 0.5);
            
            harmOsc2.connect(harmGain2);
            harmGain2.connect(this.masterGain);
            
            // Third harmonic at 123.6Hz for richness
            const harmOsc3 = this.ctx.createOscillator();
            const harmGain3 = this.ctx.createGain();
            harmOsc3.type = 'sine';
            harmOsc3.frequency.setValueAtTime(123.6, now); // 3x harmonic
            
            harmGain3.gain.setValueAtTime(vol * 0.18, now);
            harmGain3.gain.linearRampToValueAtTime(vol * 0.18, now + 0.5);
            
            harmOsc3.connect(harmGain3);
            harmGain3.connect(this.masterGain);
            
            // Noise texture for menace
            const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.5), this.ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = (Math.random() * 2 - 1) * 0.2;
            }
            
            const noiseSrc = this.ctx.createBufferSource();
            const noiseFilter = this.ctx.createBiquadFilter();
            const noiseGain = this.ctx.createGain();
            noiseSrc.loop = true;
            
            noiseSrc.buffer = noiseBuffer;
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(200, now);
            
            noiseGain.gain.setValueAtTime(vol * 0.08, now);
            noiseGain.gain.linearRampToValueAtTime(vol * 0.08, now + 0.5);
            
            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            
            subOsc.start(now);
            mainOsc.start(now);
            lfo.start(now);
            lfo2.start(now);
            harmOsc.start(now);
            harmOsc2.start(now);
            harmOsc3.start(now);
            noiseSrc.start(now);
            
            subOsc.stop(now + 0.5);
            mainOsc.stop(now + 0.5);
            lfo.stop(now + 0.5);
            lfo2.stop(now + 0.5);
            harmOsc.stop(now + 0.5);
            harmOsc2.stop(now + 0.5);
            harmOsc3.stop(now + 0.5);
            noiseSrc.stop(now + 0.5);
            
            this.activeOscillators.add(subOsc);
            this.activeOscillators.add(mainOsc);
            this.activeOscillators.add(lfo);
            this.activeOscillators.add(lfo2);
            this.activeOscillators.add(harmOsc);
            this.activeOscillators.add(harmOsc2);
            this.activeOscillators.add(harmOsc3);
            
            this.analytics.soundsPlayed++;
            this.analytics.concurrentSounds += 8;
            this.analytics.maxConcurrent = Math.max(this.analytics.maxConcurrent, this.analytics.concurrentSounds);
            this.analytics.lastPlayed['fireBreathAmbient'] = now;
        });
    }

    // Enhanced volume control with smooth transitions
    setVolume(volume, fadeDuration = 0.1) {
        const newVolume = Math.max(0, Math.min(1, volume));
        this.masterVolume = newVolume;

        if (this.masterGain) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.linearRampToValueAtTime(newVolume, now + fadeDuration);
        }

        // Save to preferences
        if (window.PingPongPerfected?.state) {
            window.PingPongPerfected.state.preferences.audioVolume = newVolume * 100;
            window.PingPongPerfected.state.savePrefs();
        }

        this.applyMusicMuteState();
        this.applyVoiceSettings();
        this.saveControlState();

        return this;
    }

    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.saveControlState();
        return this;
    }

    getSfxVolumePercent() {
        return Math.round(this.sfxVolume * 100);
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.applyMusicMuteState();
        this.saveControlState();
        return this;
    }

    getMusicVolumePercent() {
        return Math.round(this.musicVolume * 100);
    }

    setVoiceVolume(volume) {
        this.voiceVolume = Math.max(0, Math.min(1, volume));
        this.applyVoiceSettings();
        this.saveControlState();
        return this;
    }

    getVoiceVolumePercent() {
        return Math.round(this.voiceVolume * 100);
    }

    setVoiceMute(muted) {
        this.voiceMuted = !!muted;
        this.applyVoiceSettings();
        this.saveControlState();
        return this.voiceMuted;
    }

    // Mobile-optimized enable with user gesture
    enable() {
        if (this.isMobile && !this.initialized) {
            return Promise.resolve().then(() => {
                return this.init();
            });
        }

        this.enabled = true;
        return this.ensureContext().then(() => {
            if (this.masterGain && this.ctx) {
                const now = this.ctx.currentTime;
                this.masterGain.gain.cancelScheduledValues(now);
                this.masterGain.gain.setValueAtTime(this.masterGain.gain.value || 0.001, now);
                this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.15);
            }
            this.applyMusicMuteState();
            this.applyVoiceSettings();
        });
    }

    disable() {
        this.enabled = false;
        this.stopAllGravityWellSounds(0.1);
        // Smooth fade out
        if (this.masterGain) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
        }
        this.applyMusicMuteState();
        this.applyVoiceSettings();
        return this;
    }

    resume() {
        return this.ensureContext();
    }

    getVolumePercent() {
        return Math.round(this.masterVolume * 100);
    }

    getVisualizerSnapshot(barCount = 18) {
        const safeBarCount = Math.max(1, barCount | 0);
        const fallback = {
            bars: new Array(safeBarCount).fill(0.03),
            level: this.visualizerSmoothing || 0,
            peak: this.visualizerPeak || 0,
            active: false
        };

        if (!this.enabled || !this.visualizerAnalyser || !this.visualizerBins) {
            this.visualizerSmoothing *= 0.92;
            this.visualizerPeak *= 0.9;
            fallback.level = this.visualizerSmoothing;
            fallback.peak = this.visualizerPeak;
            return fallback;
        }

        this.visualizerAnalyser.getByteFrequencyData(this.visualizerBins);
        const bins = this.visualizerBins;
        const bars = new Array(safeBarCount).fill(0.04);
        let energy = 0;

        for (let i = 0; i < safeBarCount; i++) {
            const start = Math.floor((i / safeBarCount) * bins.length * 0.88);
            const end = Math.max(start + 1, Math.floor(((i + 1) / safeBarCount) * bins.length * 0.92));
            let sum = 0;
            for (let j = start; j < end && j < bins.length; j++) {
                sum += bins[j];
            }
            const avg = sum / Math.max(1, end - start);
            const normalized = Math.max(0, Math.min(1, avg / 255));
            const shaped = Math.pow(normalized, 1.28);
            const weighted = Math.min(1, 0.04 + shaped * 1.45);
            bars[i] = weighted;
            energy += shaped;
        }

        const level = energy / safeBarCount;
        this.visualizerSmoothing = (this.visualizerSmoothing * 0.78) + (level * 0.22);
        this.visualizerPeak = Math.max(this.visualizerPeak * 0.94, this.visualizerSmoothing);

        return {
            bars,
            level: this.visualizerSmoothing,
            peak: this.visualizerPeak,
            active: true
        };
    }

    // Get audio analytics
    getAnalytics() {
        return {
            ...this.analytics,
            activeOscillators: this.activeOscillators.size,
            contextState: this.ctx?.state || 'not initialized',
            maxPolyphony: this.maxPolyphony,
            memoryUsage: `${this.activeOscillators.size}/${this.maxPolyphony}`,
            health: this.analytics.performanceScore >= 70 ? 'good' :
                this.analytics.performanceScore >= 40 ? 'fair' : 'poor',
            musicMuted: this.musicMuted,
            sfxVolume: this.sfxVolume,
            musicVolume: this.musicVolume,
            voiceVolume: this.voiceVolume,
            voiceMuted: this.voiceMuted
        };
    }

    // Enhanced test suite with categories and progress
    testAllSounds() {
        if (!this.enabled) {
            console.warn('🔇 Audio disabled - cannot test sounds');
            return;
        }


        const testSuites = {
            'Basic Sounds': [
                { name: 'Hit', fn: () => this.hit() },
                { name: 'Bounce', fn: () => this.bounce() },
                { name: 'UI Click', fn: () => this.uiClick() },
                { name: 'Laser', fn: () => this.laser() }  // Added laser sound to test suite
            ],
            'Game Events': [
                { name: 'Score', fn: () => this.score() },
                { name: 'Power Up', fn: () => this.powerUp() },
                { name: 'Level Up', fn: () => this.levelUp() }
            ],
            'Challenges': [
                { name: 'Speed Challenge', fn: () => this.speedChallenge() },
                { name: 'Success', fn: () => this.speedChallengeSuccess() },
                { name: 'Fail', fn: () => this.speedChallengeFail() }
            ],
            'Special Effects': [
                { name: 'Achievement', fn: () => this.achievement() },
                { name: 'Freeze', fn: () => this.freezeEffect() },
                { name: 'Obstacle', fn: () => this.obstacleHit() },
                { name: 'Paddle Shrink', fn: () => this.paddleShrink() },
                { name: 'Zombie Wave', fn: () => this.zombieWave() },
                { name: 'Zombie Hit', fn: () => this.zombieHit() },
                { name: 'Zombie Spit', fn: () => this.zombieSpit() },
                { name: 'Zombie Breach', fn: () => this.zombieBreach() }
            ]
        };

        let delay = 0;
        Object.entries(testSuites).forEach(([suiteName, sounds]) => {

            sounds.forEach((sound, index) => {
                setTimeout(() => {
                    sound.fn();
                }, delay);
                delay += 700; // Increased from 600
            });

            delay += 1200; // Increased from 1000
        });

        setTimeout(() => {
        }, delay);
    }

    // Clean up resources properly
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
        }
        if (this.gravitySyncInterval) {
            clearInterval(this.gravitySyncInterval);
        }
        if (this.voiceSyncInterval) {
            clearInterval(this.voiceSyncInterval);
        }
        if (this.musicSyncInterval) {
            clearInterval(this.musicSyncInterval);
        }
        if (this.mediaObserver) {
            this.mediaObserver.disconnect();
            this.mediaObserver = null;
        }

        this.stopAllGravityWellSounds(0.1);

        // Stop all active oscillators
        this.activeOscillators.forEach(osc => {
            try {
                if (!osc._finished) {
                    osc.stop();
                }
            } catch (e) {
                // Oscillator might already be stopped
            }
        });
        this.activeOscillators.clear();

        if (this.ctx) {
            this.ctx.close().catch(console.warn);
        }

    }
}

// Enhanced integration with better error handling and features
function enhanceGameAudio() {
    if (!window.game) {
        setTimeout(enhanceGameAudio, 100);
        return;
    }

    if (window.game.audioEnhanced) {
        return;
    }


    try {
        const enhancedAudio = new EnhancedAudioEngine();

        // Preserve original audio methods for maximum compatibility
        const originalAudio = window.game.audio;
        if (originalAudio) {
            Object.getOwnPropertyNames(originalAudio).forEach(prop => {
                if (!enhancedAudio[prop] && typeof originalAudio[prop] === 'function') {
                    enhancedAudio[prop] = originalAudio[prop].bind(originalAudio);
                }
            });

            // Copy any properties that might be needed
            Object.keys(originalAudio).forEach(key => {
                if (typeof originalAudio[key] !== 'function' && !enhancedAudio[key]) {
                    enhancedAudio[key] = originalAudio[key];
                }
            });
        }

        window.game.audio = enhancedAudio;
        window.game.audioEnhanced = true;

        enhanceGameMethods();
        // Audio is mixed from the pause menu's Audio panel; the old floating
        // cyber-bar mixer (and its always-running visualizer loop) is not injected.


        // Ensure audio context is initialized
        enhancedAudio.ensureContext?.().then(() => {
        }).catch(err => {
            console.warn('Audio context initialization note:', err?.message);
        });

    } catch (error) {
        console.error('❌ Failed to enhance game audio:', error);
    }
}

function enhanceGameMethods() {
    if (!window.game) return;

    // Enhanced physics step with rally tracking
    const originalPhysicsStep = window.game.physicsStep;
    const originalCheckPaddleCollision = window.game.checkPaddleCollision;
    const originalActivatePowerUp = window.game.activatePowerUp;
    const originalFireLaser = window.game.fireLaser;

    window.game.physicsStep = function(dt) {
        originalPhysicsStep.call(this, dt);

        if (this.audio && this.audio.enabled) {
            // Enhanced obstacle collision detection
            this.obstacles?.forEach(obstacle => {
                if (obstacle.active && obstacle.checkCollision && obstacle.checkCollision(this.ball)) {
                    this.audio.obstacleHit && this.audio.obstacleHit();
                }
            });

            // Rally milestone sounds
            if (this.rallyCount > 0 && this.rallyCount % 5 === 0 && this.rallyCount !== this.audio.lastRallyMilestone) {
                this.audio.lastRallyMilestone = this.rallyCount;
                this.audio.rallyMilestone && this.audio.rallyMilestone(this.rallyCount);
            }

            // High-speed sound effects
            if (this.ball.getSpeed && this.ball.getSpeed() > 800) {
                const now = Date.now();
                if (now - this.audio.lastSpeedCheck > 500) {
                    this.audio.lastSpeedCheck = now;
                    this.audio.createSound && this.audio.createSound(300, 'sawtooth', 0.2, 0.1); // Lowered from 400
                }
            }
        }
    };

    // Enhanced paddle collision for zombie mode
    window.game.checkPaddleCollision = function(paddle, isPlayer) {
        const result = originalCheckPaddleCollision.call(this, paddle, isPlayer);
        if (result && this.gameMode === 'zombie' && this.audio) {
            if (this.audio.zombieHit) {
                this.audio.zombieHit();
            } else if (this.audio.paddleShrink) {
                this.audio.paddleShrink();
            }
        }
        return result;
    };

    // Enhanced power-up activation
    window.game.activatePowerUp = function(type) {
        originalActivatePowerUp.call(this, type);
        if (this.audio) {
            if (type === 'freezeAI' && this.audio.freezeEffect) {
                this.audio.freezeEffect();
            } else if (type.includes('paddle') && this.audio.powerUp) {
                this.audio.powerUp();
            }
        }
    };

    // Enhanced laser firing
    if (originalFireLaser) {
        window.game.fireLaser = function() {
            const result = originalFireLaser.call(this);
            if (result && this.audio && this.audio.laser) {
                this.audio.laser();
            }
            return result;
        };
    }

    // Enhanced achievement system
    if (window.game.progression && window.game.progression.showAchievement) {
        const originalShowAchievement = window.game.progression.showAchievement;
        window.game.progression.showAchievement = function(container, title, desc) {
            originalShowAchievement.call(this, container, title, desc);
            if (window.game.audio && window.game.audio.achievement) {
                window.game.audio.achievement();
            }
        };
    }

}

function addEnhancedAudioControlsToCyberBar() {
    const waitForCyberBar = setInterval(() => {
        const cyberBar = document.getElementById('cyber-control-bar');
        const audio = window.game?.audio;
        if (!cyberBar || !audio) return;

        clearInterval(waitForCyberBar);
        injectCyberAudioStyles();

        const existingControls = document.getElementById('cyber-audio-controls');
        if (existingControls) {
            if (existingControls._visualizerFrame) cancelAnimationFrame(existingControls._visualizerFrame);
            existingControls.remove();
        }

        const audioControls = document.createElement('div');
        audioControls.id = 'cyber-audio-controls';
        audioControls.innerHTML = `
            <div class="cyber-audio-header">Audio</div>
            <div class="cyber-audio-grid">
                <label class="cyber-audio-row" data-key="master">
                    <span class="cyber-audio-label">Master</span>
                    <input class="cyber-audio-slider" type="range" min="0" max="100" step="1">
                    <span class="cyber-audio-value">0%</span>
                </label>
                <label class="cyber-audio-row" data-key="sfx">
                    <span class="cyber-audio-label">SFX</span>
                    <input class="cyber-audio-slider" type="range" min="0" max="100" step="1">
                    <span class="cyber-audio-value">0%</span>
                </label>
                <label class="cyber-audio-row" data-key="music">
                    <span class="cyber-audio-label">Music</span>
                    <input class="cyber-audio-slider" type="range" min="0" max="100" step="1">
                    <span class="cyber-audio-value">0%</span>
                </label>
                <label class="cyber-audio-row" data-key="voice">
                    <span class="cyber-audio-label">Voice</span>
                    <input class="cyber-audio-slider" type="range" min="0" max="100" step="1">
                    <span class="cyber-audio-value">0%</span>
                </label>
            </div>
            <div class="cyber-audio-visualizer" aria-hidden="true">
                <div class="cyber-audio-visualizer-label">Signal</div>
                <div class="cyber-audio-spectrum" data-role="spectrum"></div>
                <div class="cyber-audio-meter"><span data-role="meter"></span></div>
            </div>
            <div class="cyber-audio-actions">
                <button id="cyber-audio-toggle" class="cyber-btn" type="button">AUDIO ON</button>
                <button id="cyber-music-toggle" class="cyber-btn" type="button">MUSIC ON</button>
                <button id="cyber-voice-toggle" class="cyber-btn" type="button">VOICE ON</button>
                <button id="cyber-test-sounds" class="cyber-btn" type="button">TEST</button>
            </div>
        `;

        const getRow = key => audioControls.querySelector(`.cyber-audio-row[data-key="${key}"]`);
        const rows = {
            master: getRow('master'),
            sfx: getRow('sfx'),
            music: getRow('music'),
            voice: getRow('voice')
        };
        const sliders = {
            master: rows.master.querySelector('.cyber-audio-slider'),
            sfx: rows.sfx.querySelector('.cyber-audio-slider'),
            music: rows.music.querySelector('.cyber-audio-slider'),
            voice: rows.voice.querySelector('.cyber-audio-slider')
        };
        const values = {
            master: rows.master.querySelector('.cyber-audio-value'),
            sfx: rows.sfx.querySelector('.cyber-audio-value'),
            music: rows.music.querySelector('.cyber-audio-value'),
            voice: rows.voice.querySelector('.cyber-audio-value')
        };
        const audioToggle = audioControls.querySelector('#cyber-audio-toggle');
        const musicToggle = audioControls.querySelector('#cyber-music-toggle');
        const voiceToggle = audioControls.querySelector('#cyber-voice-toggle');
        const testButton = audioControls.querySelector('#cyber-test-sounds');
        const spectrum = audioControls.querySelector('[data-role="spectrum"]');
        const meter = audioControls.querySelector('[data-role="meter"]');
        const VISUALIZER_BARS = 18;
        const barNodes = [];

        for (let i = 0; i < VISUALIZER_BARS; i++) {
            const bar = document.createElement('span');
            bar.className = 'cyber-audio-spectrum-bar';
            bar.style.setProperty('--bar-scale', '0.04');
            spectrum.appendChild(bar);
            barNodes.push(bar);
        }

        const animateVisualizer = () => {
            if (!document.body.contains(audioControls)) return;

            const snapshot = audio.getVisualizerSnapshot?.(VISUALIZER_BARS) || {
                bars: new Array(VISUALIZER_BARS).fill(0.03),
                level: 0,
                peak: 0,
                active: false
            };

            barNodes.forEach((bar, idx) => {
                const amp = Math.max(0.03, Math.min(1, snapshot.bars?.[idx] || 0.03));
                bar.style.setProperty('--bar-scale', amp.toFixed(3));
                bar.style.opacity = (0.26 + (amp * 0.74)).toFixed(3);
            });

            const meterScale = Math.max(0.03, Math.min(1, snapshot.peak || snapshot.level || 0.03));
            meter.style.transform = `scaleX(${meterScale.toFixed(3)})`;
            audioControls.style.setProperty('--viz-glow', (0.2 + (Math.min(1, snapshot.level || 0) * 0.8)).toFixed(3));

            audioControls._visualizerFrame = requestAnimationFrame(animateVisualizer);
        };

        const updateStatus = () => {
            const isAudioOn = !!audio.enabled;
            const isMusicOn = !audio.musicMuted;
            const isVoiceOn = !audio.voiceMuted;
            audioToggle.textContent = isAudioOn ? 'AUDIO ON' : 'AUDIO OFF';
            musicToggle.textContent = isMusicOn ? 'MUSIC ON' : 'MUSIC OFF';
            voiceToggle.textContent = isVoiceOn ? 'VOICE ON' : 'VOICE OFF';
            audioToggle.classList.toggle('is-off', !isAudioOn);
            musicToggle.classList.toggle('is-off', !isMusicOn);
            voiceToggle.classList.toggle('is-off', !isVoiceOn);
            audioToggle.classList.toggle('is-on', isAudioOn);
            musicToggle.classList.toggle('is-on', isMusicOn);
            voiceToggle.classList.toggle('is-on', isVoiceOn);
            audioToggle.setAttribute('aria-pressed', String(isAudioOn));
            musicToggle.setAttribute('aria-pressed', String(isMusicOn));
            voiceToggle.setAttribute('aria-pressed', String(isVoiceOn));
        };

        const syncValues = () => {
            const nextValues = {
                master: audio.getVolumePercent ? audio.getVolumePercent() : Math.round((audio.masterVolume || 0) * 100),
                sfx: audio.getSfxVolumePercent ? audio.getSfxVolumePercent() : 100,
                music: audio.getMusicVolumePercent ? audio.getMusicVolumePercent() : 100,
                voice: audio.getVoiceVolumePercent ? audio.getVoiceVolumePercent() : 90
            };
            Object.keys(nextValues).forEach(key => {
                sliders[key].value = String(nextValues[key]);
                values[key].textContent = `${nextValues[key]}%`;
            });
            updateStatus();
        };

        const handleSlider = (key, apply) => {
            sliders[key].addEventListener('input', e => {
                const val = Number(e.target.value);
                values[key].textContent = `${val}%`;
                apply(val);
                showCyberBarTemporarily();
            });
        };

        handleSlider('master', value => audio.setVolume?.(value / 100));
        handleSlider('sfx', value => audio.setSfxVolume?.(value / 100));
        handleSlider('music', value => audio.setMusicVolume?.(value / 100));
        handleSlider('voice', value => audio.setVoiceVolume?.(value / 100));

        audioToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (audio.enabled) {
                    audio.disable?.();
                } else {
                    const enablePromise = audio.enable?.();
                    if (enablePromise && typeof enablePromise.then === 'function') {
                        enablePromise.catch(console.warn);
                    }
                }
                setTimeout(syncValues, 80);
            } catch (err) {
                console.error('Audio toggle error:', err);
            }
            showCyberBarTemporarily();
        });

        musicToggle.addEventListener('click', () => {
            audio.toggleMusicMute?.();
            syncValues();
            if (audio.enabled) audio.uiClick?.();
            showCyberBarTemporarily();
        });

        voiceToggle.addEventListener('click', () => {
            audio.setVoiceMute?.(!audio.voiceMuted);
            syncValues();
            if (audio.enabled) audio.uiClick?.();
            showCyberBarTemporarily();
        });

        testButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (audio.enabled) {
                    audio.testAllSounds?.();
                    const voice = audio.getVoiceController?.();
                    if (voice && !audio.voiceMuted) voice.speak?.('Audio systems online.', true);
                }
            } catch (err) {
                console.error('Test button error:', err);
            }
            showCyberBarTemporarily();
        });

        audioControls._visualizerFrame = requestAnimationFrame(animateVisualizer);
        syncValues();
        cyberBar.appendChild(audioControls);

        setTimeout(() => {
            document.querySelectorAll('button, .btn, .mode-btn, .power-up, [role="button"]').forEach(btn => {
                if (!btn.hasAttribute('data-audio-enhanced')) {
                    btn.setAttribute('data-audio-enhanced', 'true');
                    btn.addEventListener('click', () => {
                        if (window.game?.audio?.enabled && window.game.audio.uiClick) {
                            window.game.audio.uiClick();
                        }
                    });
                }
            });
            const startBtn = document.getElementById('startBtn');
            if (startBtn && !startBtn.hasAttribute('data-audio-enhanced')) {
                startBtn.setAttribute('data-audio-enhanced', 'true');
            }
        }, 1500);

    }, 100);
}

function injectCyberAudioStyles() {
    if (document.getElementById('cyber-audio-controls-style')) return;

    const style = document.createElement('style');
    style.id = 'cyber-audio-controls-style';
    style.textContent = `
        #cyber-audio-controls {
            --viz-glow: 0.3;
            margin-left: 0;
            padding: 16px;
            border-left: none;
            min-width: auto;
            width: 100%;
            max-width: 100%;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .cyber-audio-header {
            color: rgba(234, 248, 255, 0.95);
            letter-spacing: 0.16em;
            font-size: 11px;
            text-transform: uppercase;
            text-shadow: 0 0 12px rgba(0, 229, 255, 0.16);
        }
        .cyber-audio-grid {
            display: grid;
            gap: 8px;
        }
        .cyber-audio-row {
            display: grid;
            grid-template-columns: 64px 1fr 48px;
            align-items: center;
            gap: 10px;
            color: rgba(245, 250, 255, 0.94);
            font-size: 12px;
            padding: 8px 10px;
            border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .cyber-audio-label {
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 700;
            color: rgba(214, 245, 255, 0.9);
        }
        .cyber-audio-slider {
            -webkit-appearance: none;
            width: 100%;
            height: 10px;
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.18), rgba(255, 0, 200, 0.12));
            border-radius: 999px;
            outline: none;
            border: 1px solid rgba(120, 230, 255, 0.2);
            box-shadow:
                inset 0 2px 6px rgba(0,0,0,0.72),
                0 0 12px rgba(0, 212, 255, 0.14);
        }
        .cyber-audio-slider::-webkit-slider-runnable-track {
            height: 10px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.22), rgba(255, 0, 200, 0.12));
        }
        .cyber-audio-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            background: radial-gradient(circle at 35% 35%, #ffffff 0%, #c8f7ff 32%, #4bc8ff 58%, #0b3f66 100%);
            border: 1px solid rgba(255,255,255,0.68);
            border-radius: 50%;
            cursor: pointer;
            box-shadow:
                0 0 12px rgba(0, 212, 255, 0.5),
                0 0 24px rgba(255, 0, 200, 0.18),
                inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .cyber-audio-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            background: radial-gradient(circle at 35% 35%, #ffffff 0%, #c8f7ff 32%, #4bc8ff 58%, #0b3f66 100%);
            border: 1px solid rgba(255,255,255,0.68);
            border-radius: 50%;
            cursor: pointer;
            box-shadow:
                0 0 12px rgba(0, 212, 255, 0.5),
                0 0 24px rgba(255, 0, 200, 0.18),
                inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .cyber-audio-slider:hover::-webkit-slider-thumb {
            filter: brightness(1.15) contrast(1.08);
            border-color: #dfffff;
            box-shadow:
                0 0 14px rgba(0, 229, 255, 0.55),
                0 0 30px rgba(255, 0, 200, 0.22);
        }
        .cyber-audio-value {
            text-align: right;
            opacity: 0.95;
            font-variant-numeric: tabular-nums;
            color: rgba(241, 250, 255, 0.9);
        }
        .cyber-audio-visualizer {
            display: grid;
            gap: 8px;
            padding: 10px 11px 11px;
            border: 1px solid rgba(118, 166, 208, 0.32);
            background:
                linear-gradient(180deg, rgba(18, 26, 42, 0.94), rgba(8, 14, 24, 0.98)),
                radial-gradient(110% 80% at 10% 0%, rgba(35, 93, 140, 0.3), transparent 60%);
            box-shadow:
                inset 0 0 18px rgba(50, 139, 214, calc(var(--viz-glow) * 0.42)),
                0 0 18px rgba(9, 31, 58, 0.58);
            border-radius: 14px;
        }
        .cyber-audio-visualizer-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            color: rgba(201, 230, 255, 0.84);
        }
        .cyber-audio-spectrum {
            height: 38px;
            display: grid;
            grid-template-columns: repeat(18, minmax(0, 1fr));
            gap: 4px;
            align-items: end;
        }
        .cyber-audio-spectrum-bar {
            display: block;
            height: 100%;
            transform-origin: center bottom;
            transform: scaleY(var(--bar-scale, 0.04));
            border-radius: 4px 4px 2px 2px;
            background: linear-gradient(to top, #36dbff 0%, #83e7ff 40%, #fff3b5 100%);
            box-shadow: 0 0 10px rgba(116, 220, 255, 0.5);
            transition: transform 70ms linear, opacity 70ms linear;
            opacity: 0.35;
        }
        .cyber-audio-meter {
            position: relative;
            height: 6px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(8, 15, 24, 0.95);
            border: 1px solid rgba(131, 195, 237, 0.28);
        }
        .cyber-audio-meter span {
            display: block;
            width: 100%;
            height: 100%;
            transform-origin: left center;
            transform: scaleX(0.03);
            transition: transform 85ms linear;
            background: linear-gradient(90deg, #36dbff 0%, #8dffcf 55%, #ffe386 100%);
            box-shadow: 0 0 14px rgba(141, 255, 207, 0.6);
        }
        .cyber-audio-actions {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
        }
        #cyber-audio-controls .cyber-btn {
            min-width: 0;
            padding: 9px 10px;
            font-size: 11px;
            border-radius: 14px;
            justify-content: center;
        }
        #cyber-audio-controls .cyber-btn.is-off {
            border-color: rgba(255, 66, 66, 0.75);
            color: rgba(255, 180, 180, 1);
            background: linear-gradient(135deg, rgba(56, 10, 10, 0.78), rgba(92, 16, 28, 0.72));
            box-shadow: 0 0 18px rgba(255, 66, 66, 0.16);
        }
        #cyber-control-bar {
            position: fixed;
            bottom: 20px;
            left: 50%;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 0;
            background: linear-gradient(135deg, rgba(12, 28, 48, 0.94), rgba(8, 18, 32, 0.96));
            border: 1px solid rgba(80, 190, 255, 0.28);
            border-radius: 18px;
            box-shadow: 0 8px 40px rgba(0, 100, 200, 0.22), inset 0 1px 0 rgba(255,255,255,0.05);
            backdrop-filter: blur(8px);
            min-width: 360px;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
            z-index: 999998;
            opacity: 0;
            transform: translateX(-50%) scale(0.95);
            pointer-events: none;
            transition: opacity 300ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @media (max-width: 900px) {
            #cyber-control-bar {
                bottom: 10px;
                left: 50%;
                max-width: 90vw;
                min-width: 280px;
            }
            #cyber-audio-controls {
                width: 100%;
                margin-left: 0;
                padding: 12px;
                border-left: none;
                border-top: none;
                min-width: 0;
                max-width: none;
            }
            .cyber-audio-actions {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .cyber-audio-row {
                grid-template-columns: 56px 1fr 44px;
            }
        }
    `;
    document.head.appendChild(style);
}

let cyberBarHideTimeout = null;

function showCyberBarTemporarily() {
    try {
        const cyberBar = document.getElementById('cyber-control-bar');
        if (!cyberBar) return;
        
        // Clear any pending hide
        if (cyberBarHideTimeout) clearTimeout(cyberBarHideTimeout);
        
        // Show immediately
        cyberBar.style.opacity = '1';
        cyberBar.style.transform = 'translateX(-50%) scale(1)';
        cyberBar.style.pointerEvents = 'auto';
        
        // Hide after 3 seconds
        cyberBarHideTimeout = setTimeout(() => {
            if (cyberBar && cyberBar.style.opacity === '1') {
                cyberBar.style.opacity = '0';
                cyberBar.style.transform = 'translateX(-50%) scale(0.95)';
                cyberBar.style.pointerEvents = 'none';
            }
        }, 3000);
    } catch (e) {
    }
}

// Enhanced initialization with multiple fallbacks
// Upgrade the audio as soon as the game object exists (no fixed delay).
window.addEventListener('pp-game-ready', () => enhanceGameAudio());
if (window.game) enhanceGameAudio();

// Robust game detection with multiple attempts
let detectionAttempts = 0;
const gameDetection = setInterval(() => {
    if (window.game) {
        clearInterval(gameDetection);
        enhanceGameAudio();
    } else if (++detectionAttempts >= 20) {
        clearInterval(gameDetection);
        console.warn('⏰ Game detection timeout - bass-enhanced audio not applied');

        // Fallback: Try to enhance anyway in case game loads differently
        setTimeout(enhanceGameAudio, 3000);
    }
}, 500);

// Export for debugging
window.AudioEnhancements = {
    version: '2.1',
    engine: EnhancedAudioEngine,
    enhanceGameAudio,
    getStatus: () => ({
        game: !!window.game,
        audio: !!window.game?.audio,
        enhanced: !!window.game?.audioEnhanced,
        initialized: window.game?.audio?.initialized,
        enabled: window.game?.audio?.enabled,
        musicMuted: window.game?.audio?.musicMuted,
        voiceMuted: window.game?.audio?.voiceMuted,
        masterVolume: window.game?.audio?.masterVolume,
        sfxVolume: window.game?.audio?.sfxVolume,
        musicVolume: window.game?.audio?.musicVolume,
        voiceVolume: window.game?.audio?.voiceVolume
    })
};

