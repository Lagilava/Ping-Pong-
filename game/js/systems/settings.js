// Player settings: one store for every option in the Settings panel.
// Saved per browser under pp-settings-v1. Game code reads values with
// PPSettings.get(key) at the moment it needs them, and UI listens with
// PPSettings.on(handler) to react to changes.
(function () {
    'use strict';

    const KEY = 'pp-settings-v1';

    const DEFAULT_BINDINGS = {
        p1Up: 'w', p1Down: 's', p1Fire: ' ',
        p2Up: 'arrowup', p2Down: 'arrowdown', p2Fire: 'enter',
    };

    const DEFAULTS = {
        // Gameplay
        aiLevel: 2,               // 0 Rookie .. 4 Insane
        pointsToWin: 11,          // Classic, Gravity, Speed, Obstacle
        powerUps: true,           // power-ups on the court in the standard modes
        replays: 'auto',          // auto | offer | off
        taunts: true,             // AI trash-talk bubbles
        autoPause: true,          // pause when the window loses focus
        // Controls
        paddleSpeed: 100,         // keyboard / gamepad paddle speed, percent
        bindings: DEFAULT_BINDINGS,
        padRumble: true,          // controller vibration
        phoneVibrate: true,       // phone vibration on points
        // Display
        graphics: 'auto',         // visual quality: auto | low | medium | high | ultra
        fxBloom: true,            // WebGL bloom, colour grade and ripples
        fxGlow: true,             // neon glow on paddles, ball, court and HUD
        fxBgAnim: true,           // animated mode scenery
        shake: 100,               // screen shake strength, percent
        flash: true,              // white flash on big hits and goals
        particles: true,
        hudSize: 'normal',        // small | normal | large
        showFps: false,
        // Accessibility
        reduceMotion: false,
        ballOutline: false,       // high-visibility ring around the ball
        uiScale: 100,             // menus and panels, percent
        noir: false,              // black-and-white film look for the whole game
        // Audio
        muteInBackground: true,
        // Online
        playerName: '',
        // Paddle design per mode. left is your paddle; right is the computer
        // or player 2. Online, each player's own left choice is shown.
        paddles: null,
    };

    const PADDLE_MODES = ['classic', 'zombie', 'gravity', 'speed', 'obstacle', 'customise'];
    const PADDLE_IDS = ['classic', 'neonBlade', 'shieldWall', 'arcadeBlock', 'prismGlass', 'riptide', 'magmaCore', 'bassline'];
    const defaultPaddles = () => Object.fromEntries(PADDLE_MODES.map((m) => [m, { left: 'classic', right: 'classic' }]));
    function cleanPaddles(raw) {
        const out = defaultPaddles();
        if (raw && typeof raw === 'object') {
            for (const m of PADDLE_MODES) {
                for (const side of ['left', 'right']) {
                    const v = raw[m]?.[side];
                    if (PADDLE_IDS.includes(v)) out[m][side] = v;
                }
            }
        }
        return out;
    }

    const CANONICAL_KEYS = Object.values(DEFAULT_BINDINGS);

    function load() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { saved = {}; }
        if (!localStorage.getItem(KEY)) {
            // First run on this version: carry over the old settings panel's choices.
            try {
                const old = JSON.parse(localStorage.getItem('pingpong-prefs-v6') || '{}');
                if (typeof old.aiDifficulty === 'number') saved.aiLevel = Math.round((old.aiDifficulty / 100) * 4);
                if (typeof old.showFps === 'boolean') saved.showFps = old.showFps;
                if (typeof old.disableParticles === 'boolean') saved.particles = !old.disableParticles;
            } catch (e) { /* no old settings */ }
        }
        delete saved.invertColors; // replaced by Noir
        const merged = { ...DEFAULTS, ...saved };
        merged.bindings = { ...DEFAULT_BINDINGS, ...(saved.bindings || {}) };
        if (!saved.paddles) {
            // First run with per-mode paddles: Custom keeps the style picked
            // on the Custom screen.
            try {
                const custom = JSON.parse(localStorage.getItem('pp-customise-settings-v1') || '{}');
                saved.paddles = { customise: { left: custom.paddleStyle, right: custom.paddleStyle } };
            } catch (e) { /* none saved */ }
        }
        merged.paddles = cleanPaddles(saved.paddles);
        return merged;
    }

    const values = load();
    const listeners = new Set();

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* storage full or blocked */ }
    }

    function emit(key, value) {
        listeners.forEach((fn) => { try { fn(key, value); } catch (e) { console.error('[Settings]', e); } });
    }

    const PPSettings = {
        DEFAULTS,
        DEFAULT_BINDINGS,
        get(key) { return values[key]; },
        set(key, value) {
            if (values[key] === value) return;
            values[key] = value;
            save();
            emit(key, value);
        },
        setBinding(action, key) {
            const next = { ...values.bindings };
            // A key drives one action: swap it away from wherever it was.
            const clash = Object.keys(next).find((a) => a !== action && next[a] === key);
            if (clash) next[clash] = next[action];
            next[action] = key;
            values.bindings = next;
            save();
            emit('bindings', next);
        },
        reset() {
            Object.keys(DEFAULTS).forEach((k) => {
                values[k] = k === 'bindings' ? { ...DEFAULT_BINDINGS } : k === 'paddles' ? defaultPaddles() : DEFAULTS[k];
            });
            save();
            emit('*', null);
        },
        on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

        PADDLE_MODES,
        PADDLE_IDS,
        getPaddle(mode, side = 'left') {
            const m = PADDLE_MODES.includes(mode) ? mode : 'classic';
            return values.paddles[m][side === 'right' ? 'right' : 'left'];
        },
        setPaddle(mode, side, id) {
            if (!PADDLE_MODES.includes(mode) || !PADDLE_IDS.includes(id)) return;
            const key = side === 'right' ? 'right' : 'left';
            if (values.paddles[mode][key] === id) return;
            values.paddles = { ...values.paddles, [mode]: { ...values.paddles[mode], [key]: id } };
            save();
            emit('paddles', values.paddles);
        },

        // Effective values: Reduce motion overrides shake and flash.
        shakeScale() { return values.reduceMotion ? 0 : Math.max(0, values.shake) / 100; },
        flashEnabled() { return values.flash && !values.reduceMotion; },

        // Keyboard: turn a pressed key into the game's built-in key names
        // (w/s/space for player 1, arrows/enter for player 2). Returns the list
        // of names to set, which is empty for a built-in key that has been
        // rebound away so it no longer moves a paddle.
        translateKey(key) {
            const out = [];
            const b = values.bindings;
            for (const action in b) {
                if (b[action] === key) out.push(DEFAULT_BINDINGS[action]);
            }
            if (!out.length && !CANONICAL_KEYS.includes(key)) out.push(key);
            return out;
        },

        keyLabel(key) {
            if (key === ' ') return 'Space';
            if (key === 'arrowup') return '↑';
            if (key === 'arrowdown') return '↓';
            if (key === 'arrowleft') return '←';
            if (key === 'arrowright') return '→';
            if (!key) return '—';
            return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
        },
    };

    window.PPSettings = PPSettings;
})();
