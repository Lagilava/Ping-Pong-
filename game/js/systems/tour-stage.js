// The Tour's own opening and ending for a stage, so it never looks like a plain
// match. Versus screen before the first serve (rival portrait, voice, goals);
// outro after the last point (win or loss, with the rival reacting) that hands
// over to the usual result card. Uses PPTour (stages, progress) and PPRivals.
(function () {
    'use strict';

    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const reduce = () => document.body.classList.contains('pp-reduce-motion')
        || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    let layer = null, closer = null;

    // Close the current screen and run `then` once.
    function dismiss(then) {
        const fn = closer; closer = null;
        if (layer) { layer.remove(); layer = null; }
        if (fn) fn(then);
    }

    // One overlay at a time. `autoMs` 0 means wait for the player.
    function open(cls, accent, html, { autoMs = 0, minMs = 700, done }) {
        if (layer) layer.remove();
        layer = document.createElement('div');
        layer.className = `ppstage ${cls}`;
        layer.style.setProperty('--a', accent);
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.innerHTML = html;
        document.body.appendChild(layer);
        const openedAt = performance.now();
        let finished = false, raf = 0, padHeld = true, timer = 0;
        const finish = () => {
            if (finished) return;
            finished = true;
            cancelAnimationFrame(raf); clearTimeout(timer);
            window.removeEventListener('keydown', onKey, true);
            const el = layer;
            closer = null;
            if (el) { el.classList.add('leaving'); setTimeout(() => el.remove(), cls === 'versus' ? 220 : (reduce() ? 0 : 220)); if (layer === el) layer = null; }
            done && done();
        };
        const go = () => { if (performance.now() - openedAt >= minMs) finish(); };
        const onKey = (e) => {
            if (['Enter', ' ', 'Escape'].includes(e.key)) go();
            if (e.key !== 'F2' && e.key !== 'F5' && e.key !== 'F12') { e.preventDefault(); e.stopPropagation(); }
        };
        window.addEventListener('keydown', onKey, true);
        layer.addEventListener('click', go);
        closer = () => finish();
        // Gamepad: any face button.
        const poll = () => {
            if (finished) return;
            const pad = (navigator.getGamepads && [...navigator.getGamepads()].find(Boolean));
            const down = !!pad && [0, 1, 2, 3, 9].some((i) => pad.buttons[i]?.pressed);
            if (down && !padHeld) go();
            padHeld = down;
            raf = requestAnimationFrame(poll);
        };
        raf = requestAnimationFrame(poll);
        if (autoMs) timer = setTimeout(finish, autoMs);
        requestAnimationFrame(() => layer && layer.querySelector('.ppstage-go')?.focus({ preventScroll: true }));
    }

    // ── Before the match ─────────────────────────────────────────────────
    function versus(stage, done) {
        const T = window.PPTour, Rv = window.PPRivals;
        const rival = Rv?.get(stage.rival);
        if (!rival) { done(); return; }
        const lost = T.lossesOf(stage.id) > 0;
        const played = T.starsOf(stage.id) > 0;
        const pool = lost ? rival.afterLoss : played ? rival.rematch : rival.meet;
        const introPool = !lost && !played ? window.PPTourDialogue?.pool(rival.id, 'intro') : null;
        const quote = Rv.pick(introPool?.length ? introPool : (pool && pool.length ? pool : rival.meet));
        const tier = T.TIERS[stage.tier];
        const firstOfTier = T.STAGES.find((s) => s.tier === stage.tier)?.id === stage.id && !played && !lost;
        const mode = ({ classic: 'Classic', gravity: 'Gravity', speed: 'Speed', obstacle: 'Obstacle' })[stage.mode] || stage.mode;
        const goals = [`Win the match (first to ${stage.points}${stage.twist === 'winBy2' ? ', win by 2' : ''})`].concat(stage.goals.map((g) => g.text));
        const mood = lost ? 'Rematch' : played ? 'Return match' : 'First meeting';
        const html = `
            <div class="ppstage-bg"></div>
            <div class="ppstage-match">
                <header class="ppstage-match-head">
                    <span class="ppstage-series">THE TOUR <b> / </b> ${esc(tier.name)}</span>
                    <span class="ppstage-round">Stage ${stage.id} of ${T.STAGES.length}</span>
                </header>
                <div class="ppstage-match-body">
                    <div class="ppstage-split">
                        <section class="ppstage-side you">
                            <div class="ppstage-portrait"><div class="ppstage-you" aria-hidden="true"><i></i></div><span class="ppstage-player-tag">PLAYER 01</span></div>
                            <div class="ppstage-identity"><span class="ppstage-overline">CHALLENGER</span><h2>You</h2><p>${T.totalStars()} / ${T.MAX_STARS} STARS</p></div>
                        </section>
                        <div class="ppstage-vs" aria-label="versus"><span>VS</span></div>
                        <section class="ppstage-side rival">
                            <div class="ppstage-portrait"><div class="ppstage-face">${Rv.portrait(rival.id)}</div><span class="ppstage-player-tag">RIVAL</span></div>
                            <div class="ppstage-identity"><span class="ppstage-overline">YOUR OPPONENT</span><h2>${esc(rival.name)}</h2><p>${esc(rival.title)}</p></div>
                        </section>
                    </div>
                    <div class="ppstage-info">
                        <div class="ppstage-details-head"><span>THE MATCHUP</span><span>${esc(mood)}</span></div>
                        ${firstOfTier ? `<p class="ppstage-story">${esc(Rv.story(stage.tier))}</p>` : ''}
                        <blockquote class="ppstage-quote"><span>${esc(rival.name)} <i> / </i> RIVAL SAYS</span>${esc(quote)}</blockquote>
                        <p class="ppstage-meta"><span>VENUE</span> ${esc(rival.home)} <b>•</b> ${esc(mode)}${stage.twist ? ' <b>•</b> ' + (esc({ winBy2: 'Win by 2', noPowerUps: 'No power-ups', powerUps: 'Power-ups on' }[stage.twist] || stage.twist)) : ''}</p>
                        <div class="ppstage-goal-head"><span>STAR OBJECTIVES</span><span>★ &nbsp;3 AVAILABLE</span></div>
                        <ul class="ppstage-goals">${goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
                        <button type="button" class="ppstage-go"><span>Start match</span><b aria-hidden="true">→</b></button>
                    </div>
                </div>
            </div>
            <div class="ppstage-timer" aria-hidden="true"><i></i></div>`;
        const ms = 8500;
        open('versus', rival.accent, html, { autoMs: ms, minMs: 900, done });
        const bar = layer && layer.querySelector('.ppstage-timer i');
        if (bar) { bar.style.setProperty('--timer-duration', `${ms}ms`); }
    }

    // ── After the match ──────────────────────────────────────────────────
    function outro(result, scores, done) {
        const Rv = window.PPRivals, T = window.PPTour;
        const stage = result?.stage;
        const rival = stage && Rv?.get(stage.rival);
        if (!rival) { done(); return; }
        const won = !!result.won;
        const resultPool = window.PPTourDialogue?.pool(rival.id, won ? 'end_loss' : 'end_win');
        const quote = Rv.pick(resultPool?.length ? resultPool : (won ? rival.youWin : rival.youLose));
        const stars = [1, 2, 3].map((i) => `<i class="${won && i <= result.earned ? 'on' : ''}" style="--d:${0.7 + i * 0.35}s">&#9733;</i>`).join('');
        const goals = won ? stage.goals.map((g, i) =>
            `<li class="${result.goals[i] ? 'done' : ''}">${result.goals[i] ? '&#10003;' : '&#10007;'} ${esc(g.text)}</li>`).join('') : '';
        const extra = [];
        if (won) {
            (result.opened || []).forEach((t) => extra.push(`${t.name} tier unlocked`));
            (result.newPaddles || []).forEach((d) => extra.push(`New paddle: ${d.name}`));
        }
        const title = won
            ? (result.tourComplete ? 'Tour complete' : 'Stage cleared')
            : `${rival.name} wins`;
        const sub = won
            ? (result.tourComplete ? 'You beat the Champion. Every rival remembers your name.' : `${rival.name} is beaten.`)
            : `Stars are only earned on a win. ${rival.name} will be here when you are ready.`;
        const html = `
            <div class="ppstage-bg"></div>
            <div class="ppstage-outro">
                <div class="ppstage-face big">${Rv.portrait(rival.id)}</div>
                <div class="ppstage-otext">
                    <p class="ppstage-kicker">Stage ${stage.id} &middot; ${esc(rival.name)}</p>
                    <h2 class="ppstage-title">${esc(title)}</h2>
                    <p class="ppstage-score"><b>${scores?.player ?? 0}</b> &ndash; <b>${scores?.ai ?? 0}</b></p>
                    ${won ? `<div class="ppstage-stars" role="img" aria-label="${result.earned} of 3 stars">${stars}</div>` : ''}
                    <blockquote class="ppstage-quote"><span>${esc(rival.name)}</span>${esc(quote)}</blockquote>
                    <p class="ppstage-sub">${esc(sub)}</p>
                    ${goals ? `<ul class="ppstage-goals">${goals}</ul>` : ''}
                    ${extra.length ? `<p class="ppstage-extra">${extra.map(esc).join(' &middot; ')}</p>` : ''}
                    <button type="button" class="ppstage-go">Continue</button>
                </div>
            </div>`;
        open(`outro ${won ? 'win' : 'loss'}${result.tourComplete ? ' final' : ''}`, won ? '#ffd37a' : rival.accent, html, { minMs: 1200, done });
    }

    function hide() { if (layer) dismiss(); }

    window.PPTourStage = { versus, outro, hide, isOpen: () => !!layer };
})();
