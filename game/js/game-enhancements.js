
(() => {
    'use strict';

    // The computer opponent lives in js/ai/ai-opponent.js.

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
        const targetLevel = Math.max(0, Math.min(4, Math.round(window.PPSettings?.get('aiLevel') ?? 2)));
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
            // Live view of the shared settings store (js/systems/settings.js).
            preferences: {
                get showFps() { return !!window.PPSettings?.get('showFps'); },
                get disableParticles() { return window.PPSettings?.get('particles') === false; },
                get aiDifficulty() { return ((window.PPSettings?.get('aiLevel') ?? 2) / 4) * 100; },
                get vibration() { return window.PPSettings?.get('phoneVibrate') !== false; },
            },
            savePrefs: () => {}
        };

        let lastHelpSection = 'basics';

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

        const $ = (s, el = document) => el.querySelector(s);
        const $$ = (s, el = document) => [...el.querySelectorAll(s)];

        // ==================================================================
        // CYBER BAR SHOW / HIDE
        // ==================================================================
        // The in-match MENU button opens the game's pause menu; Settings,
        // Audio and Help open as panels on top of it. Pause state is owned by
        // the Game (setUserPaused) so music, Esc and gamepad Start all agree.
        function openPauseMenu() {
            const game = state.game || window.game;
            if (game?.isInMatch?.() && !game.introActive) game.setUserPaused(true);
        }

        function showCyberBar() { openPauseMenu(); }
        function hideCyberBar() { /* legacy no-op: the bar is replaced by the pause menu */ }

        // Settings and Help are the two panels; "audio" opens Settings on its
        // Audio tab.
        const panelFor = (name) => ({ settings: state.ui.settingsPanel, audio: state.ui.settingsPanel, profile: state.ui.settingsPanel, help: state.ui.helpPanel })[name];

        function setPanel(name, show) {
            const target = (name === 'audio' || name === 'profile') ? 'settings' : name;
            ['settings', 'help'].forEach((n) => {
                const el = panelFor(n);
                if (el) el.style.display = (n === target && show) ? 'flex' : 'none';
            });
            document.body.classList.toggle('pp-panel-open', !!show);
            if (show && target === 'settings') window.PPSettingsPanel?.onOpen(name === 'audio' || name === 'profile' ? name : null);
        }

        function togglePanel(name) {
            const el = panelFor(name);
            if (!el) return;
            const opening = el.style.display !== 'flex';
            if (opening) openPauseMenu();
            setPanel(name, opening);
        }

        function toggleSettings() { togglePanel('settings'); }
        function toggleAudio() { togglePanel('audio'); }
        function toggleHelp() { togglePanel('help'); }

        window.ppOpenPanel = (name) => setPanel(name, true);
        window.ppCloseOpenPanel = () => {
            const open = ['settings', 'help'].find((n) => panelFor(n)?.style.display === 'flex');
            if (!open) return false;
            setPanel(open, false);
            return true;
        };

        function quitGame() {
            const game = state.game || window.game;
            if (game?.returnToMenu) game.returnToMenu();
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
                    const game = state.game || window.game;
                    if (game?.userPaused) game.setUserPaused(false);
                    else openPauseMenu();
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

        // Zombie waves have no AI score: show points and lives left instead.
        function getHudScoreView(game) {
            if (typeof game.isZombieWaveMode === 'function' && game.isZombieWaveMode() && game.zombieState) {
                const z = game.zombieState;
                return {
                    leftLabel: 'SCORE', left: game.scores.player,
                    rightLabel: 'LIVES', right: `${Math.max(0, z.hearts)}/${z.maxHearts}`,
                };
            }
            if (game.net) {
                return {
                    leftLabel: game.net.labelFor('left'), left: game.scores.player,
                    rightLabel: game.net.labelFor('right'), right: game.scores.ai,
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
            state.ui.settingsPanel = window.PPSettingsPanel.build();
            state.ui.audioPanel = state.ui.settingsPanel;
            window.PPSettings?.on((key) => {
                if (key === 'particles' || key === '*') applyParticlePreference(false);
                if (key === 'aiLevel' || key === '*') updateAIDifficulty(false);
                if (key === 'showFps' || key === '*') {
                    if (state.preferences.showFps) { setupFpsCounter(); if (state.ui.fpsCounter) state.ui.fpsCounter.style.display = 'block'; }
                    else if (state.ui.fpsCounter) state.ui.fpsCounter.style.display = 'none';
                    state.fps = { lastTime: performance.now(), frameCount: 0, value: 0 };
                }
            });
        }

        // ==================================================================
        // HELP PANEL
        // ==================================================================
        function createHelpOverlay() {
            if ($('#pp-help')) return;
            const kb = (k) => `<kbd>${k}</kbd>`;
            const sections = [
                ['basics', 'Basics', `
                    <p class="pphelp-lead">Hit the ball past your opponent to score. First to the winning total takes the match (11 by default, change it in Settings).</p>
                    <ul class="pphelp-list">
                        <li><b>Aim with the paddle edge.</b> Center hits go flat; hits near the tip angle sharply.</li>
                        <li><b>Move as you hit</b> to put spin on the ball. Spinning shots curve in flight.</li>
                        <li><b>Rallies speed up</b> with every return, so long rallies get intense.</li>
                        <li><b>Power-ups</b> float on the court. Hit one with the ball to grab it.</li>
                    </ul>`],
                ['modes', 'Modes', `
                    <dl class="pphelp-defs">
                        <dt>Classic</dt><dd>The straight duel: fast, clean, no gimmicks.</dd>
                        <dt>Zombie</dt><dd>Hold the line for ten waves. Smash every zombie or knock out the boss to clear a wave. Five lives; the ball getting past you or a zombie reaching your barricade costs one. Hold Space (right mouse button, or a second finger) to pull nearby zombies to the barricade: they die there for points and cost no life, but it uses energy and only reaches part of the court.</dd>
                        <dt>Gravity</dt><dd>Black holes bend the ball. Curve it around one to slingshot it out faster; each slingshot makes the point worth +1 (up to 3).</dd>
                        <dt>Speed</dt><dd>The ball keeps accelerating. Concede a point and a quick target challenge gives you a chance to win it back.</dd>
                        <dt>Obstacle</dt><dd>Moving gates and nodes carve up the court. Boost pads launch the ball, ? blocks pay out coins, Turbo or Star power, and every 10 coins is a point.</dd>
                        <dt>Custom</dt><dd>Your paddles, background, music and power-ups, on an arena you build in the Forge.</dd>
                    </dl>`],
                ['controls', 'Controls', `
                    <table class="pphelp-keys">
                        <tr><th></th><th>Player 1 (left)</th><th>Player 2 (right)</th></tr>
                        <tr><td>Move</td><td>${kb('W')} ${kb('S')}</td><td>${kb('↑')} ${kb('↓')}</td></tr>
                        <tr><td>Laser</td><td>${kb('Space')}</td><td>${kb('Enter')}</td></tr>
                        <tr><td>Mouse</td><td colspan="2">Hold the button and drag on your half</td></tr>
                        <tr><td>Touch</td><td colspan="2">Drag on your half; tap with a second finger to fire</td></tr>
                        <tr><td>Gamepad</td><td colspan="2">Left stick moves, A fires, Start pauses. A second pad plays Player 2.</td></tr>
                        <tr><td>Pause</td><td colspan="2">${kb('Esc')} (then ${kb('R')} restarts, ${kb('Q')} quits)</td></tr>
                        <tr><td>Other</td><td colspan="2">${kb('F2')} performance readout, ${kb('Ctrl')}+${kb('Shift')}+${kb('A')} achievements</td></tr>
                    </table>
                    <p class="pphelp-note">Rebind any key in Settings &gt; Controls.</p>`],
                ['powerups', 'Power-ups', `
                    <dl class="pphelp-defs pphelp-grid">
                        <dt>Slow Ball</dt><dd>Slows the ball for a few seconds.</dd>
                        <dt>Fast Paddle</dt><dd>Both paddles move faster.</dd>
                        <dt>Freeze AI</dt><dd>The opponent stops briefly.</dd>
                        <dt>Double Points</dt><dd>Points count twice for a while.</dd>
                        <dt>Big Paddle</dt><dd>Bigger paddles, easier hits.</dd>
                        <dt>Small Ball</dt><dd>A smaller, harder-to-read ball.</dd>
                        <dt>Multi-Ball</dt><dd>Up to three extra balls.</dd>
                        <dt>Power Shot</dt><dd>Your next hit is a rocket.</dd>
                        <dt>Time Warp</dt><dd>Everything slows to a crawl.</dd>
                        <dt>Magnet</dt><dd>Your paddle pulls the ball in.</dd>
                        <dt>Ghost Ball</dt><dd>The ball passes through obstacles.</dd>
                        <dt>Laser</dt><dd>Fire with Space (or a second finger) to stun the other paddle.</dd>
                        <dt>Tiny</dt><dd>Both paddles shrink.</dd>
                        <dt>Shield</dt><dd>Blocks the next ball that gets past you.</dd>
                        <dt>Chaos</dt><dd>Random effects every few seconds.</dd>
                        <dt>Invincible</dt><dd>Your opponent can't score for a moment.</dd>
                    </dl>`],
                ['online', 'Versus', `
                    <ul class="pphelp-list">
                        <li><b>Local 1v1:</b> pick a mode, choose Local 1v1, and share the keyboard (or plug in two gamepads).</li>
                        <li><b>Online:</b> pick a mode, choose Online, then <b>Create a room</b>. Send the 5-character code (or the invite link) to a friend; they choose Online, <b>Join a room</b> and type it in. You play on the left, they play on the right.</li>
                        <li>Online works in Classic, Gravity, Obstacle and Custom. The host picks the mode, and the host's points to win, power-ups and Forge arena are used.</li>
                        <li>Online, your paddle answers to every control: ${kb('W')}/${kb('S')}, ${kb('↑')}/${kb('↓')}, mouse, touch or a gamepad.</li>
                        <li>The two browsers connect directly. If it never connects, one network is blocking peer-to-peer games; a phone hotspot usually works.</li>
                    </ul>`],
                ['progress', 'Progress', `
                    <ul class="pphelp-list">
                        <li><b>XP and levels:</b> every match earns XP; wins and long rallies earn more.</li>
                        <li><b>Achievements:</b> 43 to unlock. ${kb('Ctrl')}+${kb('Shift')}+${kb('A')} shows them all.</li>
                        <li><b>Win streaks</b> add bonus XP.</li>
                        <li>Progress is saved in this browser.</li>
                    </ul>`],
            ];
            document.body.insertAdjacentHTML('beforeend', `
                <div id="pp-help" class="pp-overlay-panel ppset pphelp" role="dialog" aria-modal="true" aria-labelledby="help-title">
                    <div class="ppset-box">
                        <header class="ppset-head">
                            <div><div class="ppset-kicker">How to play</div><h2 id="help-title">Game guide</h2></div>
                            <button type="button" class="ppset-close" id="close-help-x" aria-label="Close guide">&times;</button>
                        </header>
                        <nav class="ppset-tabs" role="tablist">${sections.map(([id, label]) =>
                            `<button type="button" role="tab" class="help-tab" data-section="${id}" aria-selected="false">${label}</button>`).join('')}</nav>
                        <div class="ppset-body">${sections.map(([id, , html]) =>
                            `<section class="help-section" data-section="${id}" role="tabpanel" hidden>${html}</section>`).join('')}</div>
                        <footer class="ppset-foot">
                            <span class="ppset-saved">Esc closes this guide</span>
                            <button type="button" id="close-help-btn" class="ppset-btn primary">Got it</button>
                        </footer>
                    </div>
                </div>
            `);

            state.ui.helpPanel = $('#pp-help');
            state.ui.helpPanel.addEventListener('click', e => { if (e.target === state.ui.helpPanel) toggleHelp(); });
            $('#close-help-x').addEventListener('click', toggleHelp);
            $('#close-help-btn').addEventListener('click', toggleHelp);

            const helpTabs = $$('#pp-help .help-tab');
            const helpSections = $$('#pp-help .help-section');
            const showSection = (section) => {
                helpTabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.section === section)));
                helpSections.forEach(sec => { sec.hidden = sec.dataset.section !== section; });
                lastHelpSection = section;
            };
            helpTabs.forEach(tab => tab.addEventListener('click', () => showSection(tab.dataset.section)));
            showSection(lastHelpSection);
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
                // Follow the hit recoil so the underlay stays attached to the paddle.
                c.translate(this.recoil || 0, 0);
                // vel is px/s; full intensity at paddle top speed.
                const movementIntensity = Math.min(Math.abs(this.vel.y) / 850, 1);
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
                if (Math.abs(this.vel.y) > 180) addTrailParticle(this.pos.x + this.w / 2, this.pos.y + (this.vel.y > 0 ? this.h : 0), true, movementIntensity);
            };

            const oldAiRender = state.game.aiPaddle.render;
            state.game.aiPaddle.render = function (c) {
                if (this.isZombieBoss) { oldAiRender.call(this, c); return; }
                if (!this.pos || !Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.w) || !Number.isFinite(this.h) || this.w <= 0 || this.h <= 0) { oldAiRender.call(this, c); return; }
                const isP2 = state.game?.isMultiplayer;
                const paddleColor = isP2 ? CONFIG.colorPlayer : CONFIG.colorAI;
                const glowColor = isP2 ? CONFIG.colorPlayerGlow : CONFIG.colorAIGlow;
                c.save();
                // Follow the hit recoil so the underlay stays attached to the paddle.
                c.translate(this.recoil || 0, 0);
                // vel is px/s; full intensity at paddle top speed.
                const movementIntensity = Math.min(Math.abs(this.vel.y) / 850, 1);
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
                if (Math.abs(this.vel.y) > 180) addTrailParticle(this.pos.x + this.w / 2, this.pos.y + (this.vel.y > 0 ? this.h : 0), isP2, movementIntensity);
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
            const level = Math.max(0, Math.min(4, Math.round(window.PPSettings?.get('aiLevel') ?? 2)));
            const percent = Math.round((level / 4) * 100);
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
    font: 700 11px/1 var(--cy-mono);
    letter-spacing: 0.18em;
    opacity: 0.8;
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
