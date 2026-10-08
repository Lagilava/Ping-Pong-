class AIVoice {
    constructor() {
        this.isMuted = false;
        this.speakRate = 1;
        this.minSpeechLength = 3;
        this.voiceQueue = [];
        this.isProcessingQueue = false;
        this.isSpeaking = false;
        this.defaultSettings = {
            rate: 1.0,
            pitch: 1.0,
            volume: 0.9
        };

        // Voice categories
        this.voiceCategories = {
            male: ["Google US English Male", "Microsoft David Desktop", "Alex", "Daniel"],
            female: ["Google UK English Female", "Samantha", "Victoria", "Karen"],
            robot: ["Microsoft David Desktop", "Microsoft Hazel Desktop", "Microsoft Zira Desktop"],
            highPitch: ["Google UK English Female", "Samantha", "Victoria"],
            deep: ["Google US English Male", "Alex", "Microsoft Mark", "Daniel"]
        };

        // Special effects
        this.specialEffects = {
            highPitch: { keywords: ["omg", "cute", "tiny", "adorable"], settings: { rate: 1.5, pitch: 2.0 } },
            slowMo: { keywords: ["sad", "bored", "yawn", "tired"], settings: { rate: 0.4, pitch: 0.6 } },
            robot: { keywords: ["error", "404", "circuit", "lag"], settings: { rate: 0.7, pitch: 0.2 } }
        };

        // Emoji mappings
        this.emojiMappings = {
            ":)": "smiley face",
            ":D": "big smile",
            ":(": "sad face",
            ":P": "sticking tongue out",
            ";)": "wink",
            "XD": "laughing",
            ":o": "surprised",
            "<3": "heart"
        };

        // Text replacements
        this.textReplacements = {
            "ratio": "ratio",
            "git gud": "get good",
            "ez": "easy",
            "gg": "good game",
            "afk": "away from keyboard",
            "noob": "newbie",
            "omg": "oh my gosh",
            "lol": "laughing out loud",
            "jk": "just kidding",
            "wtf": "what the heck"
        };

        this.selectedVoice = null;
        this.voiceSettings = { ...this.defaultSettings };
        this.voicesLoaded = false;
        this.speechTimeout = null;
        this.queueProcessor = null;
        this.lastSpeechTime = 0;
        this.speechCooldown = 1000; // Minimum 1 second between speech
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 3;

        // Initialize speech synthesis
        this.initSpeechSynthesis();
    }

    initSpeechSynthesis() {
        // Check if speech synthesis is available
        if (!('speechSynthesis' in window)) {
            console.warn("Speech synthesis not supported in this browser");
            this.voiceReady = false;
            return;
        }

        // Load voices
        this.loadBestVoice();

        // Handle voice changes
        speechSynthesis.onvoiceschanged = () => {
            this.voicesLoaded = true;
            this.loadBestVoice();
        };

        // Initialize voice system
        this.voiceReady = false;
        this.initTimeout = setTimeout(() => {
            if (this.selectedVoice) {
                this.voiceReady = true;
            } else {
                console.warn("Voice not loaded, speech will be disabled");
                this.voiceReady = false;
            }
        }, 1500);
    }

    loadBestVoice() {
        if (!speechSynthesis) {
            console.warn("Speech synthesis not supported");
            return;
        }

        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) {
            console.warn("No voices available");
            // Try again later
            setTimeout(() => this.loadBestVoice(), 1000);
            return;
        }


        // Try to find distinctive voices
        const distinctiveVoices = [
            "Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)",
            "Microsoft Server Speech Text to Speech Voice (en-US, JennyNeural)",
            "Google UK English Female",
            "Samantha",
            "Daniel",
            "Alex",
            "Victoria"
        ];

        for (const name of distinctiveVoices) {
            const found = voices.find(v =>
                v.name.includes(name) ||
                v.name.toLowerCase().includes(name.toLowerCase())
            );
            if (found) {
                this.selectedVoice = found;
                return;
            }
        }

        // Fallback to any English voice
        const englishVoice = voices.find(v => v.lang.includes("en")) || voices[0];
        if (englishVoice) {
            this.selectedVoice = englishVoice;
        }
    }

    shouldSpeak(text) {
        // Check basic conditions
        if (!text || this.isMuted || !this.voiceReady || !this.selectedVoice) {
            return false;
        }

        // Check consecutive errors
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            console.warn("Too many consecutive speech errors, temporarily disabling speech");
            return false;
        }

        // Clean text and check length
        const cleanText = text.replace(/[^a-zA-Z\s]/g, '');
        if (cleanText.trim().length < this.minSpeechLength) {
            return false;
        }

        // Check cooldown
        const now = Date.now();
        if (now - this.lastSpeechTime < this.speechCooldown) {
            return false;
        }

        // Random chance based on speakRate
        return Math.random() < this.speakRate;
    }

    speak(text, priority = false) {
        if (!this.shouldSpeak(text)) return;

        // Clean the text first
        const cleanText = this._processText(text);
        if (!cleanText.trim()) return;

        // Add to queue
        const queueItem = {
            text: cleanText,
            timestamp: Date.now(),
            priority: priority
        };

        if (priority) {
            this.voiceQueue.unshift(queueItem);
        } else {
            this.voiceQueue.push(queueItem);
        }

        // Start processing if not already
        if (!this.queueProcessor) {
            this.queueProcessor = setTimeout(() => this.processQueue(), 200);
        }
    }

    processQueue() {
        // Clear the processor
        this.queueProcessor = null;

        // Remove old items from queue (older than 10 seconds)
        const now = Date.now();
        this.voiceQueue = this.voiceQueue.filter(item => now - item.timestamp < 10000);

        // If queue is empty, stop
        if (this.voiceQueue.length === 0) {
            return;
        }

        // If already speaking, wait
        if (this.isSpeaking || speechSynthesis.speaking || speechSynthesis.pending) {
            // Check again in 300ms
            this.queueProcessor = setTimeout(() => this.processQueue(), 300);
            return;
        }

        // Check cooldown
        if (now - this.lastSpeechTime < this.speechCooldown) {
            this.queueProcessor = setTimeout(() => this.processQueue(),
                this.speechCooldown - (now - this.lastSpeechTime));
            return;
        }

        // Get next text
        const queueItem = this.voiceQueue.shift();
        this._actuallySpeak(queueItem.text);
    }

    _actuallySpeak(text) {
        try {
            if (!text || !this.selectedVoice || !speechSynthesis) {
                this.isSpeaking = false;
                this.queueProcessor = setTimeout(() => this.processQueue(), 300);
                return;
            }

            // Reset error counter on successful speech attempt
            this.consecutiveErrors = 0;

            // Cancel any ongoing speech
            if (speechSynthesis.speaking || speechSynthesis.pending) {
                speechSynthesis.cancel();
                setTimeout(() => this._actuallySpeak(text), 100);
                return;
            }

            this.isSpeaking = true;
            this.lastSpeechTime = Date.now();

            const utter = new SpeechSynthesisUtterance(text);

            // Apply voice settings
            const voiceSettings = this._determineVoiceSettings(text);
            utter.voice = this.selectedVoice;
            utter.rate = voiceSettings.rate;
            utter.pitch = voiceSettings.pitch;
            utter.volume = voiceSettings.volume;

            // Set language
            utter.lang = 'en-US';

            // Event handlers with better error handling
            utter.onstart = () => {
            };

            utter.onend = () => {
                this.isSpeaking = false;
                this.consecutiveErrors = 0; // Reset on success
                // Process next after a short delay
                setTimeout(() => this.processQueue(), 500);
            };

            utter.onerror = (e) => {
                console.warn("Speech error:", e.error, "for text:", text.substring(0, 30));
                this.isSpeaking = false;
                this.consecutiveErrors++;

                // If we're getting too many errors, increase cooldown
                if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                    console.warn("Too many speech errors, increasing cooldown");
                    this.speechCooldown = 3000; // Increase to 3 seconds
                }

                // Continue with next item after longer delay
                setTimeout(() => this.processQueue(), 800);
            };

            // Clear any existing timeout
            if (this.speechTimeout) {
                clearTimeout(this.speechTimeout);
            }

            // Safety timeout
            this.speechTimeout = setTimeout(() => {
                if (this.isSpeaking) {
                    console.warn("Speech timeout, cancelling");
                    speechSynthesis.cancel();
                    this.isSpeaking = false;
                    setTimeout(() => this.processQueue(), 300);
                }
            }, 7000); // 7 second timeout

            // Finally, speak
            speechSynthesis.speak(utter);

        } catch (error) {
            console.error("Speech synthesis error:", error);
            this.isSpeaking = false;
            this.consecutiveErrors++;
            setTimeout(() => this.processQueue(), 1000);
        }
    }

    _processText(text) {
        if (!text) return "";

        let processedText = text.toString();

        // Replace emojis
        Object.entries(this.emojiMappings).forEach(([emoji, replacement]) => {
            const escapedEmoji = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            processedText = processedText.replace(new RegExp(escapedEmoji, 'g'), replacement);
        });

        // Replace abbreviations
        Object.entries(this.textReplacements).forEach(([term, replacement]) => {
            const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            processedText = processedText.replace(regex, replacement);
        });

        // Clean up excessive punctuation
        processedText = processedText.replace(/[!?]{3,}/g, '!');
        processedText = processedText.replace(/\.{4,}/g, '...');

        // Remove any remaining non-printable characters
        processedText = processedText.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

        // Trim and return
        return processedText.trim();
    }

    _determineVoiceSettings(text) {
        const lowerText = text.toLowerCase();
        let settings = { ...this.defaultSettings };

        // Check for special effects
        Object.entries(this.specialEffects).forEach(([effectName, effectData]) => {
            if (effectData.keywords.some(keyword => lowerText.includes(keyword))) {
                settings = { ...settings, ...effectData.settings };
            }
        });

        // Add some natural variation
        settings.rate += (Math.random() - 0.5) * 0.1;
        settings.pitch += (Math.random() - 0.5) * 0.1;

        // Clamp values
        settings.rate = Math.max(0.5, Math.min(2.0, settings.rate));
        settings.pitch = Math.max(0.5, Math.min(2.0, settings.pitch));
        settings.volume = Math.max(0.1, Math.min(1.0, settings.volume));

        return settings;
    }

    setMuted(muted) {
        this.isMuted = muted;
        if (muted) {
            this.clearAll();
        } else {
        }
    }

    clearAll() {
        // Clear queue
        this.voiceQueue = [];

        // Clear timeouts
        if (this.queueProcessor) {
            clearTimeout(this.queueProcessor);
            this.queueProcessor = null;
        }

        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }

        // Cancel speech
        if (speechSynthesis) {
            speechSynthesis.cancel();
        }

        this.isSpeaking = false;
        this.consecutiveErrors = 0;
        this.speechCooldown = 1000; // Reset to default
    }

    setChattiness(level) {
        this.speakRate = Math.max(0, Math.min(1, level));
    }

    // Test speech
    testSpeech() {
        const testPhrases = [
            "Hello! I am your AI opponent.",
            "Ready to play some pong?",
            "Let's have some fun!",
            "Game on!"
        ];

        const phrase = testPhrases[Math.floor(Math.random() * testPhrases.length)];
        this.speak(phrase, true);
        return phrase;
    }

    // Clean up on destruction
    destroy() {
        this.clearAll();
        if (this.initTimeout) {
            clearTimeout(this.initTimeout);
        }
    }
}

// PowerUp with reduced size and optimized particles
