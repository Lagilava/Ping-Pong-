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
                ['Use your pull', 'Hold Space to drag nearby zombies toward the barricade, where they are destroyed for points. Pull uses energy and only reaches part of the court.'],
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
            name: 'Speed', number: '04', color: '#ffd16b', tagline: 'Keep up with the pace', fact: 'TIMED SAVE CHALLENGES', action: 'Space: Overcharge · click save-challenge targets',
            goal: 'Win the rally as the ball keeps accelerating. In solo play, a timed target challenge can give you another chance after a miss.',
            steps: [
                ['Stay ahead', 'The ball speeds up during play, so start moving before it crosses the center line.'],
                ['Earn saves', 'Clear every target in a challenge to earn a save charge. Winning two points also earns one.'],
                ['Cancel a point', 'When the computer scores and you have a save, clear the timed targets to cancel that point.']
            ],
            tip: 'Solo: click or tap all real targets before time runs out; later rounds add movement and decoys. Local 1v1: press the shown key combo during the challenge.',
            touchTip: 'Overcharge: tap the button just before the ball reaches you for a faster Sonic Return. Save challenges: tap every real target before time runs out; later rounds add movement and decoys.'
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
    const touchText = (text) => text.replace(/\bHold Space\b/g, 'Hold the Pull button').replace(/\btap Space\b/g, 'tap the Lucky Dice button');

    let dialog;
    let returnFocus;
    function close() {
        if (!dialog || dialog.hidden) return;
        dialog.hidden = true;
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
            });
        }
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
                    <div class="mode-tutorial-visual" aria-hidden="true">
                        <div class="mode-tutorial-court"><i class="mode-tutorial-midline"></i><i class="mode-tutorial-paddle left"></i><i class="mode-tutorial-paddle right"></i><i class="mode-tutorial-ball"></i><i class="mode-tutorial-effect"></i><i class="mode-tutorial-effect second"></i></div>
                    </div>
                    <button type="button" class="mode-tutorial-close" data-close-tutorial aria-label="Close tutorial">&times;</button>
                </header>
                <div class="mode-tutorial-content" role="region" aria-label="Tutorial details" tabindex="0">
                    <section class="mode-tutorial-goal"><span class="mode-tutorial-label">Your objective</span><p>${guide.goal}</p></section>
                    <div class="mode-tutorial-section-title"><span class="mode-tutorial-label">How to play</span><span>01 — 03</span></div>
                    <section class="mode-tutorial-steps" aria-label="How to play">
                        ${guide.steps.map(([title, description], index) => [title, touch ? touchText(description) : description]).map(([title, description], index) => `<div class="mode-tutorial-step"><span class="mode-tutorial-step-number">0${index + 1}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}
                    </section>
                    <aside class="mode-tutorial-tip"><span class="mode-tutorial-label">Pro tip</span><p>${touch && guide.touchTip ? guide.touchTip : guide.tip}</p></aside>
                    ${touch ? `<div class="mode-tutorial-controls"><span class="mode-tutorial-label">Touch controls</span><span>Right thumb: slide up and down on the right side to move</span>${ability ? `<span class="mode-tutorial-action">Left thumb: ${ability.hold ? 'hold' : 'tap'} the ${ability.name} button (bottom left)</span>` : '<span>No ability button in this mode</span>'}<span>Local 1v1: each player slides on their own half</span></div>
                    <p class="mode-tutorial-rebind">Tap MENU at the top to pause.</p>`
                    : `<div class="mode-tutorial-controls"><span class="mode-tutorial-label">Quick controls</span><span><kbd>W</kbd> <kbd>S</kbd> Player 1</span><span><kbd>↑</kbd> <kbd>↓</kbd> Player 2</span><span>Mouse: hold and drag on your half</span>${guide.action ? `<span class="mode-tutorial-action">${guide.action}</span>` : ''}</div>
                    <p class="mode-tutorial-rebind">Keys can be changed in Settings → Controls.</p>`}
                </div>
                <footer class="mode-tutorial-foot"><span class="mode-tutorial-scroll-hint">Ready to play?</span><button type="button" data-close-tutorial>Back to setup <span aria-hidden="true">→</span></button></footer>
            </article>`;
        dialog.hidden = false;
        const content = dialog.querySelector('.mode-tutorial-content');
        const hint = dialog.querySelector('.mode-tutorial-scroll-hint');
        const updateHint = () => {
            const moreBelow = content.scrollHeight - content.scrollTop - content.clientHeight > 8;
            hint.textContent = moreBelow ? 'Scroll for controls ↓' : 'Ready to play?';
            hint.classList.toggle('has-more', moreBelow);
        };
        content.addEventListener('scroll', updateHint, { passive: true });
        updateHint();
        dialog.querySelector('.mode-tutorial-close').focus();
    }

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
