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

    const quickGoals = {
        classic: 'Send the ball past the other paddle to score.',
        zombie: 'Survive ten waves and defeat the final boss.',
        gravity: 'Curve shots around black holes and score.',
        speed: 'Keep up with the ball and time Overcharge.',
        obstacle: 'Navigate hazards and score past your opponent.',
        customise: 'Choose your court and rules, then start a match.'
    };

    // Positions refer to the actual captured screens (touch 844x390, PC
    // 1366x768). The marker stays attached to the image as it scales.
    const targets = {
        classic: [
            ['Thumb pad and paddle', [95, 75], [3, 50], 'Slide the right thumb pad to move your cyan paddle at the left.', 'Use W/S or drag on your half to move your cyan paddle.'],
            ['Your paddle', [4, 50], [3, 50], 'Meet the ball near a paddle edge to angle it.', 'Meet the ball near a paddle edge to angle it.'],
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
            ['Start or play online', [12, 82], [74, 96], 'Select power-ups, then play online with a friend.', 'Select power-ups, then start locally or play online.']
        ]
    };
    // One annotated screenshot gets players started. Detailed rules are optional.
    const shot = (mode, kind) => `assets/images/tutorial/${mode === 'customise' ? 'custom-arena' : mode}-${kind}.jpg`;
    const seenKey = mode => `pp-guide-seen-v3-${mode}`;
    const hasViewed = mode => { try { return localStorage.getItem(seenKey(mode)) === '1'; } catch (_) { return false; } };
    let dialog, returnFocus, currentMode, pendingStart;

    function close(accepted = false) {
        if (!dialog || dialog.hidden) return;
        dialog.hidden = true;
        if (accepted) { try { localStorage.setItem(seenKey(currentMode), '1'); } catch (_) { } }
        const start = accepted ? pendingStart : null;
        pendingStart = null;
        if (start) start();
        else returnFocus?.focus({ preventScroll: true });
    }

    function firstTime(mode, trigger) {
        if (guides[mode] && !hasViewed(mode)) open(mode, trigger);
    }

    function beforeStart(mode, start, trigger) {
        if (!guides[mode] || hasViewed(mode)) { start(); return; }
        open(mode, trigger, start);
    }

    function open(mode, trigger, start = null) {
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
            dialog.addEventListener('click', event => {
                if (event.target === dialog || event.target.closest('[data-close-tutorial]')) close();
                if (event.target.closest('[data-guide-accept]')) close(true);
            });
        }
        currentMode = mode;
        pendingStart = start;
        returnFocus = trigger || document.activeElement;
        const touch = !!window.PPDevice?.touch;
        const points = targets[mode];
        const backLabel = document.getElementById('pauseMenu')?.classList.contains('open')
            ? 'Back to pause' : mode === 'customise' ? 'Back to Custom' : 'Back to setup';
        dialog.style.setProperty('--tutorial-accent', guide.color);
        dialog.dataset.mode = mode;
        dialog.innerHTML = `
            <article class="mode-tutorial-card">
                <header class="mode-tutorial-head">
                    <div class="mode-tutorial-heading">
                        <span class="mode-tutorial-eyebrow">${start ? 'BEFORE YOU PLAY' : 'QUICK GUIDE'} / ${guide.number}</span>
                        <h2 id="modeTutorialTitle">${guide.name}</h2>
                        <p>${guide.tagline}</p>
                    </div>
                    <button type="button" class="mode-tutorial-close" data-close-tutorial aria-label="${backLabel}">&times;</button>
                </header>
                <div class="mode-tutorial-content">
                    <div class="guide-shot-frame">
                        <picture class="guide-shot">
                            <source media="(pointer: coarse)" srcset="${shot(mode, 'touch')}">
                            <img src="${shot(mode, 'desktop')}" alt="${guide.name} screen with three numbered areas explained beside it" width="1366" height="768">
                        </picture>
                        ${points.map(([label, touchAt, pcAt], i) => `<span class="guide-pin" style="--touch-x:${touchAt[0]}%;--touch-y:${touchAt[1]}%;--pc-x:${pcAt[0]}%;--pc-y:${pcAt[1]}%" aria-hidden="true">${i + 1}</span>`).join('')}
                    </div>
                    <div class="guide-instructions">
                        <p class="guide-objective">${quickGoals[mode]}</p>
                        <ol>${points.map(([label, , , touchCopy, pcCopy], i) => `<li><b>${i + 1}</b><span><strong>${touch && mode === 'customise' && i === 2 ? 'Play online' : label}</strong>${touch ? touchCopy : pcCopy}</span></li>`).join('')}</ol>
                        <details class="guide-more">
                            <summary>More tips and rules</summary>
                            <p>${touch && mode === 'customise' ? 'Choose a court and rules, then play online with a friend.' : guide.goal}</p>
                            <ul>${guide.steps.map(([title, description]) => `<li><strong>${title}:</strong> ${touch && mode === 'customise' && title === 'Play together' ? 'Create an online room and invite a friend. The host’s arena and rules are used.' : touch ? touchText(description, mode) : description}</li>`).join('')}</ul>
                            <p>${touch && guide.touchTip ? guide.touchTip : guide.tip}</p>
                        </details>
                    </div>
                </div>
                <footer class="mode-tutorial-foot">
                    <button type="button" class="guide-back" data-close-tutorial>${backLabel}</button>
                    <button type="button" class="guide-accept" data-guide-accept>${start ? 'Got it — play now' : 'Got it'}</button>
                </footer>
            </article>`;
        dialog.hidden = false;
        dialog.querySelector('.guide-accept').focus({ preventScroll: true });
    }

    window.ModeTutorial = { open, close, firstTime, beforeStart, hasViewed };

    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-mode-tutorial]');
        if (!trigger) return;
        event.preventDefault();
        open(trigger.dataset.modeTutorial, trigger);
    });
    document.addEventListener('keydown', event => {
        if (!dialog || dialog.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
        if (event.key !== 'Tab') return;
        const focusable = [...dialog.querySelectorAll('button, summary')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
})();

