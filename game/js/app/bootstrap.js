(function init() {
    const canvas = document.getElementById('c');
    if (!canvas) {
        console.error("Canvas not found!");
        return;
    }

    window.__ppAudioEnhancementsReady = false;
    let audioEnhancementsLoadPromise = null;

    window.ensureAudioEnhancementsLoaded = function ensureAudioEnhancementsLoaded() {
        if (window.__ppAudioEnhancementsReady) {
            return Promise.resolve();
        }
        if (audioEnhancementsLoadPromise) {
            return audioEnhancementsLoadPromise;
        }

        audioEnhancementsLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'js/audio/audio-enhancements.js';
            script.async = true;
            script.onload = () => {
                window.__ppAudioEnhancementsReady = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load audio-enhancements.js'));
            document.head.appendChild(script);
        }).catch((error) => {
            audioEnhancementsLoadPromise = null;
            throw error;
        });

        return audioEnhancementsLoadPromise;
    };

    window.ensureAudioEnhancementsLoaded().catch((error) => {
        console.warn('[Audio] Eager enhancement load failed:', error);
    });

    function startGame() {
        // Add loading indicator if it doesn't exist
        if (!document.getElementById('game-loading')) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'game-loading';
            loadingDiv.innerHTML = `
    <style>
        #game-loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            transition: opacity 0.5s;
        }
        #game-loading.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #333;
            border-top: 5px solid #4CAF50;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
    <div class="spinner"></div>
    <div>Loading Game...</div>
`;
            document.body.appendChild(loadingDiv);
        }

        // Show loading screen
        const loadingScreen = document.getElementById('game-loading');
        window.__ppLoadingScreen = loadingScreen;
        loadingScreen.classList.remove('hidden');

        // All game scripts (including the AI controller) are loaded synchronously
        // before this file, so the game can be built right away. One frame of
        // delay lets the browser paint the menu first.
        requestAnimationFrame(initializeGameAfterLoad);
    }

    // Make startGame globally accessible for menu system
    window.startGame = startGame;

    (function () {
        // ===== MENU RECENT ACHIEVEMENTS - SOLE DISPLAY SYSTEM =====
        // Function to update menu recent achievements (only one used for menu display)
        function updateMenuAchievements() {
            window.__ppMenuUpdateSeq = (window.__ppMenuUpdateSeq || 0) + 1;
            const menuAchievements = document.getElementById('menuRecentAchievements');
            const menuList = document.getElementById('menuAchievementsList');
            const overlay = document.getElementById('overlay');
            const isPostMatch = overlay?.classList.contains('post-match');
            const summaryOpen = !!document.querySelector('.achievement-summary-modal');

            const snapshotDebug = () => ({
                isPostMatch,
                summaryOpen,
                overlayClasses: overlay ? Array.from(overlay.classList) : [],
                menuAchievementsExists: !!menuAchievements,
                menuListExists: !!menuList,
                windowMenuDisplay: Array.isArray(window.__ppMenuDisplayAchievements) ? window.__ppMenuDisplayAchievements.slice() : null,
                windowMenuDisplayIndex: window.__ppMenuDisplayAchievementIndex,
                windowLastMatch: Array.isArray(window.__ppLastMatchAchievements) ? window.__ppLastMatchAchievements.slice() : null,
                windowLastMatchIndex: window.__ppLastMatchAchievementIndex
            });

            const logSnapshot = (label, extra = {}) => {
                const payload = { seq: window.__ppMenuUpdateSeq, label, ...snapshotDebug(), ...extra };
                window.__ppMenuDebugLastRead = payload;
                return payload;
            };

            if (menuAchievements) {
                // Keep the unified recent achievements strip visible during post-match,
                // even when the end-match achievement summary modal is present.
                menuAchievements.style.display = (summaryOpen && !isPostMatch) ? 'none' : '';
            }

            if (!menuList || (summaryOpen && !isPostMatch)) {
                logSnapshot('early-return', { reason: !menuList ? 'missing-menu-list' : 'summary-open-not-post-match' });
                return;
            }

            const recent = Array.isArray(window.__ppMenuDisplayAchievements) ? window.__ppMenuDisplayAchievements.slice() : [];

            if (!recent.length) {
                const promptStack = (new Error('[MenuAchievementsPrompt]')).stack || '';
                logSnapshot('fallback-to-prompt', {
                    recentCount: recent.length,
                    menuRecentCount: recent.length,
                    displayedText: isPostMatch ? 'No achievements unlocked in the previous match.' : 'Press Ctrl + Shift + A to open achievement sidebar.',
                    promptStack: promptStack.split('\n').slice(1, 6).map(line => line.trim())
                });
                menuList.innerHTML = `<li class="menu-achievements-empty" id="menuAchievementsEmpty">${isPostMatch ? 'No achievements unlocked in the previous match.' : 'Press Ctrl + Shift + A to open achievement sidebar.'}</li>`;
                return;
            }

            logSnapshot('rendering-achievements', {
                recentCount: recent.length,
                menuRecentCount: recent.length
            });

            const totalRecent = recent.length;
            let displayRecent = recent.slice();

            if (totalRecent > 1) {
                const nextIndex = Number.isFinite(window.__ppMenuDisplayAchievementIndex)
                    ? window.__ppMenuDisplayAchievementIndex % totalRecent
                    : (Number(menuList.dataset.achievementIndex || 0) % totalRecent);
                window.__ppMenuDisplayAchievementIndex = (nextIndex + 1) % totalRecent;
                window.__ppMenuRecentAchievementIndex = window.__ppMenuDisplayAchievementIndex;
                window.__ppMenuLastNonEmptyAchievementIndex = window.__ppMenuDisplayAchievementIndex;
                displayRecent = [recent[nextIndex]];
                menuList.dataset.achievementIndex = String(window.__ppMenuDisplayAchievementIndex);
            } else {
                menuList.dataset.achievementIndex = '0';
            }

            menuList.innerHTML = displayRecent.map(a => {
                const icon = a.icon || '★';
                const shortName = a.title.length > 20 ? a.title.substring(0, 18) + '...' : a.title;
                return `
                    <li class="menu-achievement-item" title="${a.title}">
                        <span class="menu-achievement-icon">${icon}</span>
                        <span class="menu-achievement-name">${shortName}</span>
                    </li>
                `;
            }).join('');
        }

        // Set up periodic menu achievement updates (every 2 seconds when on menu)
        setInterval(() => {
            if (window.game && document.getElementById('overlay').classList.contains('visible')) {
                updateMenuAchievements();
            }
        }, 2000);

    })();

    function initializeGameAfterLoad() {
        {
            try {
                const loadingScreen = window.__ppLoadingScreen || document.getElementById('game-loading');
                const canvas = document.getElementById('c');
                if (!canvas) throw new Error('Game canvas element not found');
                // ensure Game is defined; if not, retry shortly
                if (typeof Game === 'undefined' && typeof window.Game === 'undefined') {
                    setTimeout(initializeGameAfterLoad, 50);
                    return;
                }
                const GameClass = (typeof Game !== 'undefined' ? Game : window.Game);
                if (!GameClass) throw new Error('Game constructor unavailable');
                window.game = new GameClass(canvas);
                // Initialize background renderer mode
                if (window.game.bgRenderer) {
                    const bgMode = typeof window.game.getActiveBackgroundMode === 'function'
                        ? window.game.getActiveBackgroundMode()
                        : (window.game.gameMode || 'classic');
                    window.game.bgRenderer.setMode(bgMode);
                }

                // Enhanced HUD initialization
                initializeEnhancedHUD();

                // Fade the loading screen straight away.
                loadingScreen.style.transition = 'opacity 0.2s';
                loadingScreen.classList.add('hidden');
                setTimeout(() => loadingScreen.remove(), 220);
                window.dispatchEvent(new Event('pp-game-ready'));

            } catch (error) {
                console.error('Game initialization failed:', error);

                // Show error message on loading screen
                loadingScreen.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h2 style="color: #ff6b6b;">Game Failed to Load</h2>
            <p>${error.message}</p>
            <button onclick="location.reload()" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px 20px;
                margin-top: 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            ">Retry</button>
        </div>
    `;
            }
        }
    }

    function initializeEnhancedHUD() {
        const hud = document.getElementById('hud');
        if (!hud) {
            console.warn('HUD element not found');
            return;
        }

        // Add smooth transition styles if not present
        if (!document.getElementById('hud-styles')) {
            const style = document.createElement('style');
            style.id = 'hud-styles';
            style.textContent = `
    #hud {
        transition: all 0.3s ease;
    }
    .hud-tooltip {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
        margin-bottom: 5px;
    }
    #hud:hover .hud-tooltip {
        opacity: 1;
    }
`;
            document.head.appendChild(style);
        }

        let hudTimeout;
        let hudVisible = true;
        let lastInteraction = Date.now();

        const showHud = (immediate = false) => {
            if (!hudVisible) {
                hud.classList.remove('collapsed');
                hud.classList.add('expanded');
                hudVisible = true;
            }

            lastInteraction = Date.now();
            clearTimeout(hudTimeout);

            if (!immediate) {
                hudTimeout = setTimeout(() => {
                    if (Date.now() - lastInteraction >= 3000) {
                        hud.classList.replace('expanded', 'collapsed');
                        hudVisible = false;
                    }
                }, 3000);
            }
        };

        const hideHud = () => {
            if (hudVisible) {
                hud.classList.replace('expanded', 'collapsed');
                hudVisible = false;
            }
        };

        // Throttle mousemove events for performance
        let mouseMoveTimer;
        document.addEventListener('mousemove', () => {
            clearTimeout(mouseMoveTimer);
            mouseMoveTimer = setTimeout(() => showHud(), 100);
        });

        // Touch and keyboard events
        document.addEventListener('touchstart', () => showHud(true), { passive: true });
        document.addEventListener('keydown', () => showHud());

        // Gamepad/controller support
        if ('getGamepads' in navigator) {
            setInterval(() => {
                const gamepads = navigator.getGamepads();
                if (gamepads[0] && gamepads[0].buttons.some(btn => btn.pressed)) {
                    showHud();
                }
            }, 500);
        }

        // Add toggle hotkey (Ctrl+H or Cmd+H)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                hudVisible ? hideHud() : showHud(true);
            }
        });

        // Initial show
        showHud(true);

        // Auto-hide after 5 seconds if no interaction
        setTimeout(() => {
            if (Date.now() - lastInteraction >= 3000) {
                hideHud();
            }
        }, 5000);
    }

    // Optional: Add a restart function for easier debugging
    window.restartGame = function () {
        if (window.game && typeof window.game.destroy === 'function') {
            window.game.destroy();
        }
        window.startGame();
    };

    // small helper to trigger the fade animation explicitly on startup
    function fadeInOverlay() {
        const overlay = document.getElementById('overlay');
        if (!overlay) return;
        // make it visible for animation, then remove inline opacity so CSS can animate
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '';
        // force repaint to ensure animation runs from 0
        void overlay.offsetWidth;
        // add a class so CSS keyframe kicks in
        overlay.classList.add('visible');

        // Show the menu achievements section when displaying the normal menu
        const menuAchievements = document.getElementById('menuRecentAchievements');
        if (menuAchievements) {
            menuAchievements.style.display = '';
        }

        const menuProgressPanel = document.getElementById('menuProgressPanel');
        if (menuProgressPanel) {
            menuProgressPanel.style.display = '';
        }

        if (overlay) {
            overlay.classList.remove('post-match');
        }

        // Update menu achievements when overlay is shown
        if (typeof updateMenuAchievements === 'function') {
            updateMenuAchievements();
        }
        try { window.__ppTraceMenuAchievements('fadeInOverlay'); } catch (_) { }
    }

    function bindGlobalAudioUnlock() {
        if (window.__ppAudioUnlockBound) return;
        window.__ppAudioUnlockBound = true;

        const attemptUnlock = () => {
            if (!window.__ppAudioEnhancementsReady) return;
            const game = window.game;
            if (!game) return;

            if (game.audio?.enabled === false && typeof game.audio.enable === 'function') {
                game.audio.enable().catch(() => { });
            }

            const intro = game.intro;
            const introMusic = intro?.bgMusic;
            if (intro?.active && introMusic && !game.audio?.musicMuted && introMusic.paused) {
                introMusic.play().catch(() => { });
                return;
            }

            if (game.running && !game.audio?.musicMuted) {
                const overlay = document.getElementById('overlay');
                const overlayVisible = !!overlay && !overlay.classList.contains('hidden');
                if (overlayVisible) return;
                if (typeof game.startMatchMusic === 'function') {
                    const now = Date.now();
                    if (window.__ppLastMatchMusicKick && now - window.__ppLastMatchMusicKick < 1800) return;
                    window.__ppLastMatchMusicKick = now;
                    game.startMatchMusic();
                }
            }
        };

        ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown'].forEach((evt) => {
            document.addEventListener(evt, attemptUnlock, { capture: true, passive: evt !== 'keydown' });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.startGame();
            fadeInOverlay();
            bindGlobalAudioUnlock();
        });
    } else {
        window.startGame();
        fadeInOverlay();
        bindGlobalAudioUnlock();
    }

    // Periodically attempt to resume the audio context if it became suspended
    // (some browsers auto-suspend after a while if no audio activity is detected).
    setInterval(() => {
        const ctx = window.game?.audio?.ctx;
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => { });
        }
    }, 30000);

})();
