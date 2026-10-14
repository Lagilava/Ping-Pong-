// Mode-specific guides from the opponent picker and Custom setup screen.
(() => {
    const guides = {
        classic: {
            name: 'Classic', number: '01', color: '#ff5a76', tagline: 'The clean duel',
            goal: 'Keep the ball in play and send it past the other paddle. First to the match point total wins.',
            steps: [
                ['Return the ball', 'Move your paddle into its path. A hit near the paddle tip sends the ball at a sharper angle.'],
                ['Shape your shot', 'Move while making contact to add spin. The ball also gets faster through long rallies.'],
                ['Finish the match', 'Score when the ball passes your opponent. The default target is 11 points; change it in Settings.']
            ],
            tip: 'Watch the ball, then move early. A centered return is safer; an edge hit creates a tougher angle.'
        },
        zombie: {
            name: 'Zombie', number: '02', color: '#9bea78', tagline: 'Survive ten waves',
            goal: 'Clear each wave by hitting every zombie with the ball. In the boss wave, score past the boss until its health is gone.',
            steps: [
                ['Protect five lives', 'A ball past your paddle or a zombie reaching the barricade costs one life for the whole run.'],
                ['Use your pull', 'Hold Space to drag nearby zombies toward the barricade, where they are destroyed for points. Pull uses energy and only reaches part of the court.'],
                ['Grow stronger', 'Collect glowing orbs with the ball and pick a reward after each wave. Defeat the boss in wave 10 to win.']
            ],
            tip: 'Use pull when a zombie is close to your side, then let its energy recover. On touch, use a second finger; with a mouse, use the right button.'
        },
        gravity: {
            name: 'Gravity', number: '03', color: '#72b4ff', tagline: 'Bend the rally',
            goal: 'Score past your opponent while black holes curve the ball across the court.',
            steps: [
                ['Read the curve', 'Gravity wells tug the ball off its straight path. Follow its current direction rather than where it first appeared to be going.'],
                ['Set up a slingshot', 'Send the ball around a well. A successful slingshot launches it out faster and charges the next goal.'],
                ['Cash in', 'Each slingshot adds one bonus point to the next goal, up to two bonus points (a three-point goal).']
            ],
            tip: 'Aim a little wide of a well to sling around it; a direct line is harder to predict.'
        },
        speed: {
            name: 'Speed', number: '04', color: '#ffd16b', tagline: 'Keep up with the pace',
            goal: 'Win the rally as the ball keeps accelerating. A timed target challenge can give you another chance after a miss.',
            steps: [
                ['Stay ahead', 'The ball speeds up during play, so start moving before it crosses the center line.'],
                ['Earn saves', 'Clear every target in a challenge to earn a save charge. Winning two points also earns one.'],
                ['Cancel a point', 'When the computer scores and you have a save, clear the timed targets to cancel that point.']
            ],
            tip: 'Solo: click or tap all real targets before time runs out; later rounds add movement and decoys. Local 1v1: press the shown key combo during the challenge.'
        },
        obstacle: {
            name: 'Obstacle', number: '05', color: '#ffab6e', tagline: 'Play the course',
            goal: 'Score past your opponent while navigating moving hazards, checkpoints, coins and boost pads.',
            steps: [
                ['Follow the route', 'Hit glowing checkpoints in order during one run for a bonus point. An opponent touch breaks the run.'],
                ['Use the court', 'Boost pads launch the ball. Collect coins with the ball: ten coins make one point. Question blocks can give coins, Turbo or Star power.'],
                ['Fire the flipper', 'Line up your paddle and tap Space as the ball reaches the projected flipper to send it toward the next checkpoint. The layout changes every four points.']
            ],
            tip: 'For player two, use Enter to fire the flipper. On touch, tap with a second finger.'
        },
        customise: {
            name: 'Custom', number: '06', color: '#72f4da', tagline: 'Build your own match',
            goal: 'Choose a court and rules, then play a local or online match with your own look and power-ups.',
            steps: [
                ['Build the arena', 'In Arena & rules, choose a map, set the rules and open Forge to place or edit court objects.'],
                ['Make it yours', 'Use the other tabs to style paddles and ball, choose music and a background, and select power-ups.'],
                ['Play together', 'Start a local two-player match or create an online room. The host’s arena and rules are used online.']
            ],
            tip: 'Try a preset map first, then use Forge to adjust it. Custom matches are for two players and do not award XP or achievements.'
        }
    };

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
        dialog.style.setProperty('--tutorial-accent', guide.color);
        dialog.innerHTML = `
            <article class="mode-tutorial-card">
                <header class="mode-tutorial-head">
                    <div><span class="mode-tutorial-eyebrow">FIELD GUIDE / ${guide.number}</span>
                        <h2 id="modeTutorialTitle">${guide.name} <span>tutorial</span></h2>
                        <p>${guide.tagline}</p></div>
                    <button type="button" class="mode-tutorial-close" data-close-tutorial aria-label="Close tutorial">&times;</button>
                </header>
                <div class="mode-tutorial-content">
                    <section class="mode-tutorial-goal"><span class="mode-tutorial-label">Your objective</span><p>${guide.goal}</p></section>
                    <section class="mode-tutorial-steps" aria-label="How to play">
                        ${guide.steps.map(([title, description], index) => `<div class="mode-tutorial-step"><span class="mode-tutorial-step-number">0${index + 1}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}
                    </section>
                    <aside class="mode-tutorial-tip"><span class="mode-tutorial-label">Pro tip</span><p>${guide.tip}</p></aside>
                    <p class="mode-tutorial-controls"><b>Controls</b> Player 1: W / S &nbsp;·&nbsp; Player 2: ↑ / ↓ &nbsp;·&nbsp; Drag on touch or with the mouse. Rebind keys in Settings.</p>
                </div>
                <footer class="mode-tutorial-foot"><span>Ready to play?</span><button type="button" data-close-tutorial>Back to setup <span aria-hidden="true">→</span></button></footer>
            </article>`;
        dialog.hidden = false;
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
        const focusable = [...dialog.querySelectorAll('button')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
})();
