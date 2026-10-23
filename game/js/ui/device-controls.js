// Touch ability buttons and the first-match controls tutorial.
//
// PPDevice (js/core/boot.js) decides once, at start, whether this is a touch
// device (phone/tablet) or a PC. Touch players move with the right thumb
// (drag anywhere on the right side: the paddle follows the slide) and use the
// mode's ability with the left thumb on a button in the bottom-left corner.
// PC players keep the keyboard/mouse controls. Each kind gets its own
// tutorial the first time a match starts on that kind of device.
(() => {
    'use strict';

    const device = window.PPDevice || { touch: false, kind: 'pc' };
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } }
    };
    const TUTORIAL_KEY = `pp-controls-tutorial-v1-${device.kind}`;
    const HINT_KEY = (mode) => `pp-touch-ability-hint-v1-${mode}`;

    const ICONS = {
        speed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
        gravity: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="15.5" r="2.6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M6.5 10.4a5.1 5.1 0 1 0 5 6M17.5 13.6a5.1 5.1 0 1 0-5-6M9 13c2-1 4-2 6-2" fill="none" stroke-width="1.9" stroke-linecap="round"/></svg>',
        obstacle: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke-width="2.2"/><circle cx="8.5" cy="8.5" r="1.7"/><circle cx="15.5" cy="15.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/></svg>',
        zombie: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 4h4M14 4h4" fill="none" stroke-width="2"/></svg>'
    };
    // What each mode's ability is called and how it is used, for the button
    // and both tutorials. Classic and Custom have none.
    const ABILITIES = {
        speed: {
            name: 'Overcharge', hold: false,
            touch: 'Tap it just before the ball reaches your paddle. Time slows, and your return leaves as a faster Sonic Return.',
            pc: 'Press it just before the ball reaches your paddle. Time slows, and your return leaves as a faster Sonic Return.'
        },
        gravity: {
            name: 'Wormhole', hold: false,
            touch: 'Tap it as the ball passes a black hole. The hole swallows the ball and fires it from another black hole at your opponent\'s goal. Each warp makes the point worth one more.',
            pc: 'Press it as the ball passes a black hole. The hole swallows the ball and fires it from another black hole at your opponent\'s goal. Each warp makes the point worth one more.'
        },
        obstacle: {
            name: 'Lucky Dice', hold: false,
            touch: 'Tap it to roll: 6 Star power, 5 shooting balls, 4 pulls the ball to you, 3 big paddle, 2 no luck, 1 fast ball. It recharges in nine seconds.',
            pc: 'Press it to roll: 6 Star power, 5 shooting balls, 4 pulls the ball to you, 3 big paddle, 2 no luck, 1 fast ball. It recharges in nine seconds.'
        },
        zombie: {
            name: 'Pull', hold: true,
            touch: 'Hold it to drag nearby zombies to your barricade, where they are destroyed. Let go to let its energy recover.',
            pc: 'Hold it to drag nearby zombies to your barricade, where they are destroyed. Let go to let its energy recover.'
        }
    };
    const MODE_NAMES = { classic: 'Classic', zombie: 'Zombie', gravity: 'Gravity', speed: 'Speed', obstacle: 'Obstacle', customise: 'Custom' };

    const game = () => window.game;
    const abilityMode = (g) => {
        if (!g || g.net) return null;
        if (g.isZombieWaveMode?.()) return 'zombie';
        return ['speed', 'gravity', 'obstacle'].includes(g.gameMode) ? g.gameMode : null;
    };
    const keyLabel = (action, fallback) => {
        const key = window.PPSettings?.get('bindings')?.[action];
        return window.PPSettings?.keyLabel(key || fallback) || fallback;
    };
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

    // ── Touch ability buttons ───────────────────────────────────────────────
    const buttons = {};
    let placedFor = '';

    function makeButton(side) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pp-ability-btn ${side === 'player' ? 'left' : 'right'}`;
        btn.dataset.side = side;
        btn.hidden = true;
        btn.innerHTML = '<span class="pp-ab-ring" aria-hidden="true"></span><span class="pp-ab-icon"></span><span class="pp-ab-status" aria-hidden="true"></span><span class="pp-ab-name"></span>';
        const release = () => {
            const g = game();
            if (g?.zombiePull && side === 'player') g.zombiePull.buttonHeld = false;
            btn.classList.remove('pressed');
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const g = game();
            const mode = abilityMode(g);
            if (!g || !mode || g.paused) return;
            try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            btn.classList.add('pressed');
            hideHint();
            if (mode === 'zombie') {
                g.zombiePull.buttonHeld = true;
            } else if (!g.modeAbilities?.request(side)) {
                // Same rule as the key: an early press is ignored, not spent.
                btn.classList.remove('nope');
                void btn.offsetWidth;
                btn.classList.add('nope');
            }
        });
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
        btn.addEventListener('animationend', () => btn.classList.remove('nope'));
        document.body.appendChild(btn);
        return { el: btn, ring: btn.querySelector('.pp-ab-ring'), icon: btn.querySelector('.pp-ab-icon'), status: btn.querySelector('.pp-ab-status'), name: btn.querySelector('.pp-ab-name'), state: {} };
    }

    function set(b, key, value, apply) {
        if (b.state[key] === value) return;
        b.state[key] = value;
        apply(value);
    }

    // Right of the paddle lane, so the button never covers your own paddle.
    function place(b, side, g) {
        const rect = g.canvas.getBoundingClientRect();
        const paddle = side === 'player' ? g.player : g.aiPaddle;
        if (!paddle || !rect.width) return;
        const sx = rect.width / g.width;
        const lane = side === 'player'
            ? rect.left + (paddle.pos.x + paddle.w) * sx
            : innerWidth - (rect.left + paddle.pos.x * sx);
        const inset = Math.max(14, lane + 14);
        const bottom = Math.max(14, innerHeight - rect.bottom + 14);
        b.el.style.setProperty('--ab-x', `${Math.round(inset)}px`);
        b.el.style.setProperty('--ab-bottom', `${Math.round(bottom)}px`);
    }

    function wantedSides(g) {
        if (!device.touch) return [];
        const mode = abilityMode(g);
        if (!mode) return [];
        if (mode === 'zombie') return ['player'];
        return g.isMultiplayer ? ['player', 'ai'] : ['player'];
    }

    // Whether the canvas status pill for this side is replaced by a button.
    function showsButton(side) {
        return !!buttons[side] && !buttons[side].el.hidden;
    }

    function updateButtons(g, live) {
        const sides = live ? wantedSides(g) : [];
        const mode = abilityMode(g);
        for (const side of ['player', 'ai']) {
            const want = sides.includes(side);
            let b = buttons[side];
            if (!want) { if (b && !b.el.hidden) { b.el.hidden = true; if (side === 'player' && g?.zombiePull) g.zombiePull.buttonHeld = false; } continue; }
            if (!b) b = buttons[side] = makeButton(side);
            const info = ABILITIES[mode];
            set(b, 'mode', mode, () => {
                b.icon.innerHTML = ICONS[mode];
                b.name.textContent = info.name;
                b.el.dataset.mode = mode;
                b.el.setAttribute('aria-label', `${info.name} (${info.hold ? 'hold' : 'tap'})`);
            });
            if (b.el.hidden) { b.el.hidden = false; placedFor = ''; }
            let progress, status, tone;
            if (mode === 'zombie') {
                const zp = g.zombiePull, C = window.ZombiePull?.C || { MIN_START: 0.12 };
                progress = zp.energy;
                const low = zp.energy < C.MIN_START || zp.exhaust > 0;
                const can = zp.canPull();
                status = zp.active ? 'Pulling' : !can ? 'Wait' : low ? 'Empty' : zp.energy < 0.995 ? 'Charging' : 'Hold';
                tone = zp.active ? 'active' : (low || !can) ? 'cooling' : 'ready';
            } else {
                const ab = g.modeAbilities, s = ab.side(side), ready = s.cooldown <= 0;
                const inRange = mode === 'speed' ? ab.speedInRange(side) : mode === 'gravity' ? !!ab.nearestWell() : false;
                progress = ready ? 1 : 1 - s.cooldown / ModeAbilities.COOLDOWN[mode];
                // Abilities are off while the serve is held.
                const waiting = !ab.enabled;
                // Lucky Dice reports its roll and the face's effect.
                const dice = mode === 'obstacle' ? ab.dice?.status(side) : null;
                const diceText = dice ? (dice.text.includes('·') ? dice.text.split('·')[0].trim() : dice.text.replace(/\s*\d+s$/, '').replace('ROLLING…', 'Rolling')) : '';
                status = dice ? diceText.charAt(0) + diceText.slice(1).toLowerCase() : s.active > 0 ? 'Active' : s.miss > 0 ? 'Missed' : waiting ? 'Wait' : ready ? (inRange ? 'Now!' : 'Ready') : `${s.cooldown.toFixed(1)}s`;
                tone = s.active > 0 ? 'active' : s.miss > 0 ? 'missed' : (waiting || !ready) ? 'cooling' : inRange ? 'now' : 'ready';
            }
            set(b, 'p', Math.round(Math.max(0, Math.min(1, progress)) * 100), (v) => b.ring.style.setProperty('--p', `${v}%`));
            set(b, 'status', status, (v) => { b.status.textContent = v; });
            set(b, 'tone', tone, (v) => { b.el.dataset.tone = v; });
        }
        const key = `${innerWidth}x${innerHeight}|${g?.width}x${g?.height}|${sides.join()}`;
        if (sides.length && key !== placedFor) {
            placedFor = key;
            for (const side of sides) place(buttons[side], side, g);
        }
        if (sides.includes('player') && mode) maybeShowHint(mode);
        else hideHint();
    }

    // First time a mode's button appears: a short pointer to it.
    let hintEl = null, hintTimer = 0;
    function maybeShowHint(mode) {
        if (hintEl?.dataset.mode === mode || store.get(HINT_KEY(mode)) === '1' || tutorialOpen()) return;
        store.set(HINT_KEY(mode), '1');
        hideHint();
        const info = ABILITIES[mode];
        hintEl = document.createElement('div');
        hintEl.className = 'pp-ability-hint';
        hintEl.dataset.mode = mode;
        hintEl.setAttribute('role', 'status');
        hintEl.innerHTML = `<b>${esc(info.name)}</b> ${esc(info.hold ? 'Hold with your left thumb.' : 'Tap with your left thumb.')}<span>${esc(info.touch)}</span>`;
        const btn = buttons.player.el;
        hintEl.style.left = btn.style.getPropertyValue('--ab-x');
        hintEl.style.bottom = `calc(${btn.style.getPropertyValue('--ab-bottom')} + 104px)`;
        document.body.appendChild(hintEl);
        hintTimer = setTimeout(hideHint, 7000);
    }
    function hideHint() {
        clearTimeout(hintTimer);
        if (!hintEl) return;
        const el = hintEl;
        hintEl = null;
        el.classList.add('out');
        setTimeout(() => el.remove(), 250);
    }

    // ── First-match controls tutorial ───────────────────────────────────────
    let tutorial = null;
    function tutorialOpen() { return !!tutorial && !tutorial.hidden; }

    function steps(g) {
        const mode = abilityMode(g);
        const info = mode ? ABILITIES[mode] : null;
        const two = !!g?.isMultiplayer;
        const modeName = MODE_NAMES[g?.gameMode] || 'This mode';
        if (device.touch) {
            const move = two
                ? ['Each player takes a half', 'Player 1 slides a thumb up and down on the left half of the screen, player 2 on the right half. Each paddle follows its thumb’s slide.']
                : ['Move with your right thumb', 'Rest your right thumb anywhere on the right side of the screen and slide it up and down. Your paddle follows the slide, so your thumb never covers it or the ball.'];
            const ability = info
                ? [`${info.hold ? 'Hold' : 'Tap'} ${info.name} with your left thumb`, `${two ? 'Each player has a button in their bottom corner; player 1’s is bottom left.' : 'The round button sits in the bottom-left corner.'} ${info.touch}`]
                : [`${modeName} has no ability button`, two
                    ? 'If either player catches a Laser power-up, they tap their half with a second finger to fire it.'
                    : 'It is just you and the ball. If you catch a Laser power-up, tap the screen with a second finger to fire it.'];
            const pause = ['Pause any time', 'Tap MENU at the top of the screen. Turning your phone upright also pauses the match.'];
            return [move, ability, pause];
        }
        const up = keyLabel('p1Up', 'w'), down = keyLabel('p1Down', 's'), fire = keyLabel('p1Fire', ' ');
        const move = two
            ? ['Move your paddle', `Player 1 uses ${up} and ${down}, player 2 uses ${keyLabel('p2Up', 'arrowup')} and ${keyLabel('p2Down', 'arrowdown')}. You can also hold the mouse button and drag on your half.`]
            : ['Move your paddle', `${up} and ${down} move your paddle. You can also hold the left mouse button and drag.`];
        const ability = info
            ? [`${info.hold ? 'Hold' : 'Press'} ${fire} for ${info.name}`, `${info.pc}${two ? ` Player 2 uses ${keyLabel('p2Fire', 'enter')}.` : ' The right mouse button works too.'}`]
            : [`${modeName} has no ability`, `It is just you and the ball. If you catch a Laser power-up, ${fire} fires it.`];
        const pause = ['Pause any time', 'Esc pauses the match. Keys can be changed in Settings → Controls.'];
        return [move, ability, pause];
    }

    function visual(g) {
        const mode = abilityMode(g);
        if (device.touch) {
            // Two players: a thumb sliding on each half, each moving its paddle.
            const two = !!g?.isMultiplayer;
            return `<div class="pp-ct-phone${two ? ' two' : ''}" data-mode="${mode || 'none'}">
                <i class="pp-ct-paddle"></i><i class="pp-ct-ball"></i><i class="pp-ct-mid"></i>
                ${two ? '<i class="pp-ct-paddle r"></i><i class="pp-ct-thumb p1"></i><i class="pp-ct-slide p1"></i>'
                    : (mode ? `<i class="pp-ct-abtn">${ICONS[mode]}</i><i class="pp-ct-thumb left"></i>` : '')}
                <i class="pp-ct-thumb right"></i><i class="pp-ct-slide"></i>
            </div>`;
        }
        const fire = keyLabel('p1Fire', ' ');
        return `<div class="pp-ct-keys">
            <span class="pp-ct-keycol"><kbd>${esc(keyLabel('p1Up', 'w'))}</kbd><kbd>${esc(keyLabel('p1Down', 's'))}</kbd><small>Move</small></span>
            ${mode ? `<span class="pp-ct-keycol"><kbd class="wide">${esc(fire)}</kbd><small>${esc(ABILITIES[mode].name)}</small></span>` : ''}
            <span class="pp-ct-keycol"><kbd>Esc</kbd><small>Pause</small></span>
        </div>`;
    }

    function showTutorial(g) {
        if (!tutorial) {
            tutorial = document.createElement('div');
            tutorial.id = 'ppControlsTutorial';
            tutorial.className = 'pp-controls-tutorial';
            tutorial.setAttribute('role', 'dialog');
            tutorial.setAttribute('aria-modal', 'true');
            tutorial.setAttribute('aria-labelledby', 'ppControlsTutorialTitle');
            document.body.appendChild(tutorial);
            tutorial.addEventListener('click', (e) => { if (e.target.closest('[data-ct-close]')) closeTutorial(); });
            window.addEventListener('keydown', (e) => {
                if (!tutorialOpen()) return;
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    closeTutorial();
                }
            }, true);
        }
        const list = steps(g);
        tutorial.dataset.device = device.kind;
        tutorial.innerHTML = `
            <div class="pp-ct-card">
                <div class="pp-ct-visual" aria-hidden="true">${visual(g)}</div>
                <div class="pp-ct-body">
                    <span class="pp-ct-kicker">${device.touch ? 'Playing on a touch screen' : 'Playing on a computer'}</span>
                    <h2 id="ppControlsTutorialTitle">How to play</h2>
                    <ol class="pp-ct-steps">${list.map(([t, d], i) => `<li><span class="pp-ct-n">${i + 1}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></li>`).join('')}</ol>
                    <button type="button" class="pp-ct-go" data-ct-close>Got it, let’s play</button>
                </div>
            </div>`;
        // The mode's scene (js/menu/mode-art.js) frames the controls picture.
        const art = window.ModeArt?.url(g.gameMode);
        const vis = tutorial.querySelector('.pp-ct-visual');
        if (art && vis) {
            vis.classList.add('has-art');
            vis.style.backgroundImage = `linear-gradient(180deg, rgba(3, 8, 20, .3), rgba(3, 8, 20, .62)), ${art}`;
        }
        tutorial.hidden = false;
        document.body.classList.add('pp-controls-tutorial-open');
        g.setChallengePaused(true);
        requestAnimationFrame(() => tutorial.querySelector('.pp-ct-go')?.focus({ preventScroll: true }));
    }

    function closeTutorial() {
        if (!tutorialOpen()) return;
        tutorial.hidden = true;
        document.body.classList.remove('pp-controls-tutorial-open');
        store.set(TUTORIAL_KEY, '1');
        const g = game();
        // A mode's rules card (Zombie, Obstacle) may be waiting underneath and
        // keeps the match paused until it is dismissed too.
        if (g && !g._dismissModeBriefing && !g._dismissZombieBriefing) {
            g.setChallengePaused(false);
            g.lastTime = performance.now() / 1000;
        }
    }

    function maybeShowTutorial(g) {
        if (tutorialOpen() || store.get(TUTORIAL_KEY) === '1') return;
        if (g.net || g.introActive || g.userPaused || g.matchEnding || document.body.classList.contains('pp-replaying')) return;
        if (!g.running) return;
        showTutorial(g);
    }

    // ── Loop ────────────────────────────────────────────────────────────────
    // One light check per frame; DOM is only written when something changes.
    function frame() {
        requestAnimationFrame(frame);
        const g = game();
        const inMatch = !!g && document.body.classList.contains('pp-in-match');
        if (inMatch) maybeShowTutorial(g);
        // A rules card closing underneath must not resume the match early.
        if (tutorialOpen() && g && !g.challengePaused) g.setChallengePaused(true);
        const live = inMatch && !g.paused && !g.introActive && !g.matchEnding && !tutorialOpen() &&
            !document.body.classList.contains('pp-replaying') && !document.body.classList.contains('pp-results-open');
        if (!live && !buttons.player && !buttons.ai) return;
        updateButtons(g, live);
    }
    requestAnimationFrame(frame);

    window.PPDeviceControls = { showsButton, abilities: ABILITIES, icons: ICONS, steps, isTutorialOpen: tutorialOpen };
})();
