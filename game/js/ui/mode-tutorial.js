// Mode-specific guides from the opponent picker and Custom setup screen.
(() => {
    const guides = {
        classic: {
            name: 'Classic', number: '01', color: '#ff5a76', tagline: 'The clean duel', fact: 'FIRST TO 11 BY DEFAULT',
            goal: 'Keep the ball in play and send it past the other paddle. First to the match point total wins.',
            steps: [
                ['Return the ball', 'Move your paddle into its path. A hit near the paddle tip sends the ball at a sharper angle.'],
                ['Shape your shot', 'Move while making contact to add spin. The ball also gets faster through long rallies.'],
                ['Finish the match', 'Score when the ball passes your opponent. The default target is 11 points; change it in Settings.']
            ],
            tip: 'Watch the ball, then move early. A centered return is safer; an edge hit creates a tougher angle.'
        },
        zombie: {
            name: 'Zombie', number: '02', color: '#9bea78', tagline: 'Survive ten waves', fact: '10 WAVES · 5 LIVES', action: 'Hold Space to pull',
            goal: 'Clear each wave by hitting every zombie with the ball. In the boss wave, score past the boss until its health is gone.',
            steps: [
                ['Protect five lives', 'A ball past your paddle or a zombie reaching the barricade costs one life for the whole run.'],
                ['Use your pull', 'Hold Space to drag nearby zombies toward the barricade, where they are destroyed for points. Pull uses energy and only reaches part of the court. Devouring zombies restores some energy and awards their full score.'],
                ['Grow stronger', 'Collect glowing orbs with the ball and pick a reward after each wave. Defeat the boss in wave 10 to win.']
            ],
            tip: 'Use pull when a zombie is close to your side, then let its energy recover. With a mouse, the right button pulls too.',
            touchTip: 'Use pull when a zombie is close to your side, then let go so its energy recovers.'
        },
        gravity: {
            name: 'Gravity', number: '03', color: '#72b4ff', tagline: 'Warp the rally', fact: 'UP TO 3-POINT GOALS', action: 'Space: Wormhole near a black hole',
            goal: 'Score past your opponent while black holes curve the ball across the court.',
            steps: [
                ['Read the curve', 'Gravity wells tug the ball off its straight path. Follow its current direction rather than where it first appeared to be going.'],
                ['Open a wormhole', 'Press Space as the ball passes a black hole. The hole swallows it and fires it, faster, out of another black hole toward your opponent, aimed away from their paddle.'],
                ['Cash in', 'Each warp adds one bonus point to the next goal, up to two bonus points (a three-point goal). The bonus rides the ball, so a warp your opponent returns raises their stakes too.']
            ],
            tip: 'A dashed ring shows the hole that will take the ball; arrows mark where it will come out. Wormhole recharges in six seconds.',
            touchTip: 'Tap Wormhole as the ball passes a black hole. A dashed ring shows the hole that will take it; arrows mark where it will come out.'
        },
        speed: {
            name: 'Speed', number: '04', color: '#ffd16b', tagline: 'Keep up with the pace', fact: 'TIMED SONIC RETURNS', action: 'Space: Overcharge near your paddle',
            goal: 'Win the rally as the ball keeps accelerating. Time an Overcharge to turn a close return into a faster shot.',
            steps: [
                ['Stay ahead', 'The ball speeds up during play, so start moving before it crosses the center line.'],
                ['Time Overcharge', 'Press Space when the ball approaches your paddle. The button says PRESS NOW when it is in range.'],
                ['Land a Sonic Return', 'Meet the ball during the brief Overcharge window to send it back faster. The ability recharges after 2.3 seconds.']
            ],
            tip: 'Wait for the ball to come toward your paddle before pressing Space. An early press will not start Overcharge.',
            touchTip: 'Tap Overcharge when the ball is close to your paddle, then meet it for a faster Sonic Return.'
        },
        obstacle: {
            name: 'Obstacle', number: '05', color: '#ffab6e', tagline: 'Play the course', fact: 'COINS = 1 GOAL SHIELD', action: 'Space / Enter rolls the Lucky Dice',
            goal: 'Score past your opponent while navigating moving hazards, checkpoints, coins and boost pads.',
            steps: [
                ['Follow the route', 'Hit glowing checkpoints in order during one run for a bonus point. An opponent touch breaks the run.'],
                ['Use the court', 'Boost pads launch the ball. Coins arm a shield that blocks one goal, and question blocks give coins, Turbo or Star power. Against the computer, only your shots collect them.'],
                ['Roll the Lucky Dice', '6 Star power, 5 shooting balls, 4 pulls the ball to your paddle, 3 big paddle, 2 no luck, 1 fast ball. The dice recharges in nine seconds, and the layout changes every four points.']
            ],
            tip: 'For player two, use Enter to roll. The dice recharges in nine seconds, so save it for a rally you need.',
            touchTip: 'Keep your right thumb sliding on the right side and tap the Lucky Dice button with your left thumb to roll.'
        },
        customise: {
            name: 'Custom', number: '06', color: '#72f4da', tagline: 'Build your own match', fact: 'LOCAL OR ONLINE 1V1',
            goal: 'Choose a court and rules, then play a local or online match with your own look and power-ups.',
            steps: [
                ['Build the arena', 'In Arena & rules, choose a map, set the rules and open Forge to place or edit court objects.'],
                ['Make it yours', 'Use the other tabs to style paddles and ball, choose music and a background, and select power-ups.'],
                ['Play together', 'Start a local two-player match or create an online room. The host’s arena and rules are used online.']
            ],
            tip: 'Try a preset map first, then use Forge to adjust it. Custom matches are for two players and do not award XP or achievements.'
        }
    };

    // Step copy names keys; on touch the same actions are on-screen buttons.
    const touchText = (text, mode) => text
        .replace(/\bHold Space\b/g, 'Hold the Pull button')
        .replace(/\bPress Space\b/g, `Tap ${mode === 'gravity' ? 'Wormhole' : mode === 'speed' ? 'Overcharge' : 'Lucky Dice'}`);

    // Positions refer to the actual captured screens (touch 844x390, PC
    // 1366x768). The marker stays attached to the image as it scales.
    const targets = {
        classic: [
            ['Thumb pad and paddle', [95, 75], [3, 50], 'Slide the right thumb pad to move your cyan paddle at the left.', 'Use W/S or drag on your half to move your cyan paddle.'],
            ['Ball contact', [50, 50], [50, 50], 'Meet the ball near a paddle edge to angle it.', 'Meet the ball near a paddle edge to angle it.'],
            ['Score', [16, 8], [12, 5], 'Send the ball past the other paddle.', 'Send the ball past the other paddle.']
        ],
        zombie: [
            ['Lives and wave', [25, 8], [24, 5], 'Watch your remaining lives and wave.', 'Watch your remaining lives and wave.'],
            ['Pull button', [9, 82], [87, 6], 'Hold Pull when a zombie is near your side.', 'Hold Space or the right mouse button to pull.'],
            ['Hit the zombies', [50, 52], [50, 50], 'Hit zombies and glowing orbs with the ball, then choose a reward.', 'Hit zombies and glowing orbs with the ball, then choose a reward.']
        ],
        gravity: [
            ['Black hole', [75, 66], [35, 54], 'Track the ball as gravity bends it.', 'Track the ball as gravity bends it.'],
            ['Wormhole', [9, 83], [12, 94], 'Tap Wormhole as the ball passes a black hole.', 'Press Space as the ball passes a black hole.'],
            ['Point value', [16, 8], [12, 5], 'Warps add up to two bonus points to the next goal.', 'Warps add up to two bonus points to the next goal.']
        ],
        speed: [
            ['Middle line', [50, 50], [50, 50], 'Start moving before the ball crosses the middle.', 'Start moving before the ball crosses the middle.'],
            ['Overcharge', [9, 83], [12, 94], 'Tap Overcharge just before a return.', 'Press Space just before a return.'],
            ['Your paddle', [3, 51], [3, 50], 'Meet the ball during Overcharge for a Sonic Return.', 'Meet the ball during Overcharge for a Sonic Return.']
        ],
        obstacle: [
            ['Checkpoints', [38, 50], [50, 20], 'Guide the ball through checkpoints in order.', 'Guide the ball through checkpoints in order.'],
            ['Coins and boosts', [20, 86], [28, 80], 'Collect coins for a one-goal shield.', 'Collect coins for a one-goal shield.'],
            ['Lucky Dice', [9, 83], [12, 94], 'Tap Lucky Dice during a rally.', 'Press Space to roll (Enter for player two).']
        ],
        customise: [
            ['Arena and rules', [36, 25], [25, 20], 'Choose a court, then scroll down for Forge and rules.', 'Choose a court, then open Forge or set rules below.'],
            ['Look and sound', [12, 35], [8, 18], 'Use the tabs for paddles, music and background.', 'Use the tabs for paddles, music and background.'],
            ['Start or play online', [12, 82], [74, 96], 'Select power-ups, then start locally or play online.', 'Select power-ups, then start locally or play online.']
        ]
    };
    const shot = (mode, step, kind) => `assets/images/tutorial/${mode === 'customise' ? 'custom-' + ['arena', 'look', 'powerups'][step] : mode}-${kind}.jpg`;

    let dialog;
    let returnFocus;
    let currentMode;
    let currentStep = 0;
    const seenKey = mode => `pp-guide-seen-v2-${mode}`;
    const hasViewed = mode => { try { return localStorage.getItem(seenKey(mode)) === '1'; } catch (_) { return false; } };
    function firstTime(mode, trigger) {
        if (!guides[mode]) return;
        if (hasViewed(mode)) return;
        open(mode, trigger);
    }
    function setStep(step) {
        currentStep = Math.max(0, Math.min(2, step));
        dialog.dataset.step = String(currentStep);
        dialog.querySelectorAll('.mode-tutorial-step').forEach((el, i) => {
            el.classList.toggle('is-current', i === currentStep);
            el.setAttribute('aria-current', i === currentStep ? 'step' : 'false');
        });
        dialog.querySelector('.guide-demo-title').textContent = guides[currentMode].steps[currentStep][0];
        dialog.querySelector('.guide-demo-count').textContent = `${currentStep + 1} / 3`;
        dialog.querySelector('[data-guide-prev]').disabled = currentStep === 0;
        dialog.querySelector('[data-guide-next]').textContent = currentStep === 2 ? 'Replay' : 'Next';
        const source = dialog.querySelector('.guide-shot source');
        const img = dialog.querySelector('.guide-shot img');
        source.srcset = shot(currentMode, currentStep, 'touch');
        img.src = shot(currentMode, currentStep, 'desktop');
        img.alt = `${guides[currentMode].name} ${currentMode === 'customise' ? 'setup' : 'match'} screenshot showing ${targets[currentMode][currentStep][0]}`;
        dialog.querySelector('.guide-callout-title').textContent = currentMode === 'classic' && currentStep === 0
            ? (window.PPDevice?.touch ? 'Thumb pad' : 'Your paddle') : targets[currentMode][currentStep][0];
        dialog.querySelector('.guide-callout-copy').textContent = window.PPDevice?.touch
            ? targets[currentMode][currentStep][3] : targets[currentMode][currentStep][4];
        dialog.querySelectorAll('.guide-pin').forEach((el, i) => el.classList.toggle('is-current', i === currentStep));
        dialog.querySelector('.mode-tutorial-content').scrollTop = 0;
    }
    function close() {
        if (!dialog || dialog.hidden) return;
        dialog.hidden = true;
        try { localStorage.setItem(seenKey(currentMode), '1'); } catch (_) { }
        returnFocus?.focus();
    }

    function open(mode, trigger) {
        const guide = guides[mode];
        if (!guide) return;
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'modeTutorial';
            dialog.className = 'mode-tutorial';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'modeTutorialTitle');
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog || event.target.closest('[data-close-tutorial]')) close();
                if (event.target.closest('[data-guide-prev]')) setStep(currentStep - 1);
                if (event.target.closest('[data-guide-next]')) setStep(currentStep === 2 ? 0 : currentStep + 1);
                const selected = event.target.closest('[data-guide-step]');
                if (selected) setStep(Number(selected.dataset.guideStep));
            });
        }
        currentMode = mode;
        returnFocus = trigger || document.activeElement;
        // Phones and tablets get the touch controls (PPDevice, js/core/boot.js).
        const touch = !!window.PPDevice?.touch;
        const ability = window.PPDeviceControls?.abilities?.[mode] || null;
        dialog.style.setProperty('--tutorial-accent', guide.color);
        dialog.dataset.mode = mode;
        dialog.innerHTML = `
            <article class="mode-tutorial-card">
                <header class="mode-tutorial-head">
                    <div class="mode-tutorial-heading"><span class="mode-tutorial-eyebrow">FIELD GUIDE / ${guide.number}</span>
                        <h2 id="modeTutorialTitle">${guide.name} <span>tutorial</span></h2>
                        <p>${guide.tagline}</p><span class="mode-tutorial-fact">${guide.fact}</span></div>
                    <button type="button" class="mode-tutorial-close" data-close-tutorial aria-label="Close tutorial">&times;</button>
                </header>
                <div class="mode-tutorial-content" role="region" aria-label="Tutorial details" tabindex="0">
                    <div class="guide-demo">
                        <div class="guide-shot-frame">
                            <picture class="guide-shot"><source media="(pointer: coarse)" srcset="${shot(mode, 0, 'touch')}"><img src="${shot(mode, 0, 'desktop')}" alt="${guide.name} screenshot" width="1366" height="768"></picture>
                            ${targets[mode].map(([label, touchAt, pcAt], i) => `<span class="guide-pin${i === 0 ? ' is-current' : ''}" style="--touch-x:${touchAt[0]}%;--touch-y:${touchAt[1]}%;--pc-x:${pcAt[0]}%;--pc-y:${pcAt[1]}%" aria-hidden="true">${i + 1}</span>`).join('')}
                        </div>
                        <div class="guide-callout"><span class="guide-callout-number">LOOK HERE</span><strong class="guide-callout-title"></strong><span class="guide-callout-copy"></span></div>
                    </div>
                    <section class="mode-tutorial-goal"><span class="mode-tutorial-label">Your objective</span><p>${guide.goal}</p></section>
                    <div class="mode-tutorial-section-title"><span class="mode-tutorial-label">How to play</span><span>01 — 03</span></div>
                    <section class="mode-tutorial-steps" aria-label="How to play">
                        ${guide.steps.map(([title, description], index) => `<button type="button" class="mode-tutorial-step" data-guide-step="${index}"><span class="mode-tutorial-step-number">0${index + 1}</span><span><strong>${title}</strong><span>${touch ? touchText(description, mode) : description}</span></span></button>`).join('')}
                    </section>
                    <aside class="mode-tutorial-tip"><span class="mode-tutorial-label">Pro tip</span><p>${touch && guide.touchTip ? guide.touchTip : guide.tip}</p></aside>
                    ${touch ? `<div class="mode-tutorial-controls"><span class="mode-tutorial-label">Touch controls</span><span>Right thumb: slide up and down on the right side to move</span>${ability ? `<span class="mode-tutorial-action">Left thumb: ${ability.hold ? 'hold' : 'tap'} the ${ability.name} button (bottom left)</span>` : '<span>No ability button in this mode</span>'}<span>Local 1v1: each player slides on their own half</span></div>
                    <p class="mode-tutorial-rebind">Tap MENU at the top to pause.</p>`
                    : `<div class="mode-tutorial-controls"><span class="mode-tutorial-label">Quick controls</span><span><kbd>W</kbd> <kbd>S</kbd> Player 1</span><span><kbd>↑</kbd> <kbd>↓</kbd> Player 2</span><span>Mouse: hold and drag on your half</span>${guide.action ? `<span class="mode-tutorial-action">${guide.action}</span>` : ''}</div>
                    <p class="mode-tutorial-rebind">Keys can be changed in Settings → Controls.</p>`}
                </div>
                <footer class="mode-tutorial-foot"><button type="button" data-close-tutorial>Back to setup</button><span class="guide-demo-count">1 / 3</span><strong class="guide-demo-title"></strong><div class="guide-demo-buttons"><button type="button" data-guide-prev aria-label="Previous guide step">Back</button><button type="button" data-guide-next>Next</button></div></footer>
            </article>`;
        dialog.hidden = false;
        setStep(0);
        if (document.getElementById('pauseMenu')?.classList.contains('open')) {
            dialog.querySelector('[data-close-tutorial]:not(.mode-tutorial-close)').textContent = 'Back to pause';
        }
        dialog.querySelector('.mode-tutorial-close').focus();
    }

    window.ModeTutorial = { open, close, firstTime, hasViewed };

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest?.('[data-mode-tutorial]');
        if (!trigger) return;
        event.preventDefault();
        open(trigger.dataset.modeTutorial, trigger);
    });
    document.addEventListener('keydown', (event) => {
        if (!dialog || dialog.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
        if (event.key !== 'Tab') return;
        const focusable = [...dialog.querySelectorAll('button, [tabindex="0"]')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
})();

