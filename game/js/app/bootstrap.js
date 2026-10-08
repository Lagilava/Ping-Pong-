// Phones: going into a match from a tap goes fullscreen and, where the
// browser allows it (Android Chrome/Edge), locks landscape. iOS Safari has
// neither, so it gets the "turn your phone" card from css/mobile.css instead.
(function mobileImmersive() {
    const root = document.documentElement;
    if (!root.classList.contains('pp-mobile')) return;

    window.ppEnterMobilePlay = function ppEnterMobilePlay() {
        try {
            const lock = () => { try { screen.orientation?.lock?.('landscape').catch(() => { }); } catch (e) { /* ignore */ } };
            if (!document.fullscreenElement && root.requestFullscreen) {
                root.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => { });
            } else {
                lock();
            }
        } catch (e) { /* ignore */ }
    };

    const challengeTitle = document.querySelector('#speedChallenge .challenge-title');
    if (challengeTitle) challengeTitle.textContent = 'TAP TO SAVE!';

    if (!root.requestFullscreen) {
        const btn = document.querySelector('.pp-rotate-block button');
        if (btn) btn.style.display = 'none';
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest?.('#btnGo, #customStartMatchBtn, .pp-rotate-block button')) window.ppEnterMobilePlay();
    }, true);
    window.addEventListener('pp-returned-to-menu', () => {
        try { screen.orientation?.unlock?.(); } catch (e) { /* ignore */ }
    });
})();

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
        // Main-menu "Recent Achievements" panel: the 3 latest unlocks (saved
        // with your progress), NEW tags for the last match, and an unlocked
        // count. Clicking an entry opens the full achievements sidebar.
        let lastMenuHtml = '';
        const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        function updateMenuAchievements() {
            const list = document.getElementById('menuAchievementsList');
            const prog = window.game?.progression;
            if (!list || !prog) return;

            const all = Object.values(prog.achievements || {});
            const unlocked = all.filter((a) => a.unlocked).length;
            const count = document.querySelector('#menuRecentAchievements .menu-achievements-count');
            const countText = `${unlocked}/${all.length} unlocked`;
            if (count && count.textContent !== countText) count.textContent = countText;

            const items = prog.getRecentUnlocks?.(3) || [];
            const html = items.length
                ? items.map((a) => `
                    <li class="menu-achievement-item${a.isNew ? ' is-new' : ''}" data-ach="${escapeHtml(a.id)}" title="${escapeHtml(a.desc)}" tabindex="0" role="button">
                        <span class="menu-achievement-icon">${escapeHtml(a.icon || '★')}</span>
                        <span class="menu-achievement-name">${escapeHtml(a.title)}</span>
                        ${a.isNew ? '<span class="menu-achievement-new">NEW</span>' : ''}
                    </li>`).join('')
                : '<li class="menu-achievements-empty">No achievements yet: win a match to earn your first. <span>Ctrl + Shift + A shows them all.</span></li>';
            if (html !== lastMenuHtml) {
                list.innerHTML = html;
                lastMenuHtml = html;
            }
        }
        window.ppUpdateMenuAchievements = updateMenuAchievements;

        // Clicking a recent achievement opens the full list.
        document.addEventListener('click', (e) => {
            if (e.target.closest?.('#menuAchievementsList .menu-achievement-item')) {
                window.game?.progression?.toggleAchievementSidebar?.();
            }
        });

        // Refresh when the game is ready and whenever we land back on the menu.
        window.addEventListener('pp-game-ready', updateMenuAchievements);
        window.addEventListener('pp-returned-to-menu', updateMenuAchievements);
        // Cheap safety net (no DOM writes unless something changed): covers the
        // post-match screen and XP/level changes.
        setInterval(() => {
            const overlay = document.getElementById('overlay');
            if (window.game && overlay && !overlay.classList.contains('hidden')) updateMenuAchievements();
        }, 1000);

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
        window.ppUpdateMenuAchievements?.();
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
