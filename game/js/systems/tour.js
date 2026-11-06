// The Tour: a solo career of eight matches against named rivals.
//
// Each stage is an ordinary match (mode, computer skill, points to win, one
// forced AI style, at most one rule twist). Winning earns 1 star and each of
// the stage's two goals earns one more. Stars open the next stage and tier.
// Progress is stored in this browser under `pp-tour-v1`.
//
// The match itself is configured through `game.tourContext`, which Game reads
// in getTourContext(); the player's saved settings are never changed.
(function () {
    'use strict';

    const KEY = 'pp-tour-v1';

    // `need` is the total stars required before the tier's stages open.
    const TIERS = [
        { id: 'club', name: 'Club', need: 0 },
        { id: 'regional', name: 'Regional', need: 4 },
        { id: 'national', name: 'National', need: 8 },
        { id: 'world', name: 'World', need: 12 },
    ];
    const SKILLS = ['Rookie', 'Easy', 'Normal', 'Hard', 'Insane'];
    const MODES = {
        classic: { name: 'Classic', hex: '#ff3a5c' },
        gravity: { name: 'Gravity', hex: '#3d9eff' },
        speed: { name: 'Speed', hex: '#ffbe00' },
        obstacle: { name: 'Obstacle', hex: '#ff7620' },
    };
    const STYLE_TEXT = {
        wall: 'Returns everything and waits for a mistake',
        sniper: 'Aims for the corners',
        trickster: 'Fakes one way and spins the other',
        bully: 'Hits hard and keeps the pressure on',
    };
    const TWISTS = {
        powerUps: 'Power-ups always on',
        noPowerUps: 'No power-ups',
        winBy2: 'Win by 2 points',
    };

    const margin = (n) => ({ type: 'margin', n, text: `Win by ${n} or more points` });
    const rally = (n) => ({ type: 'rally', n, text: `Land a ${n}-hit rally` });

    // Order matters: stage N+1 opens when stage N is won (and its tier is open).
    const STAGES = [
        { id: 1, tier: 0, rival: 'Pip', style: 'wall', mode: 'classic', level: 0, points: 5, twist: null, goals: [margin(3), rally(8)] },
        { id: 2, tier: 0, rival: 'Vee', style: 'sniper', mode: 'classic', level: 1, points: 7, twist: 'powerUps', goals: [margin(3), rally(10)], boss: true },
        { id: 3, tier: 1, rival: 'Nova', style: 'trickster', mode: 'gravity', level: 1, points: 7, twist: null, goals: [margin(3), rally(10)] },
        { id: 4, tier: 1, rival: 'Brick', style: 'bully', mode: 'obstacle', level: 2, points: 7, twist: null, goals: [margin(3), rally(8)], boss: true },
        { id: 5, tier: 2, rival: 'Juno', style: 'sniper', mode: 'speed', level: 2, points: 7, twist: null, goals: [margin(3), rally(12)] },
        { id: 6, tier: 2, rival: 'Mirage', style: 'trickster', mode: 'gravity', level: 3, points: 7, twist: null, goals: [margin(3), rally(10)], boss: true },
        { id: 7, tier: 3, rival: 'Atlas', style: 'wall', mode: 'classic', level: 3, points: 11, twist: 'noPowerUps', goals: [margin(4), rally(15)] },
        { id: 8, tier: 3, rival: 'Titan', style: 'bully', mode: 'classic', level: 4, points: 11, twist: 'winBy2', goals: [margin(3), rally(15)], boss: true },
    ];
    const MAX_STARS = STAGES.length * 3;

    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const byId = (id) => STAGES.find((s) => s.id === Number(id)) || null;

    // ── Save data ────────────────────────────────────────────────────────
    let data = null;

    function blank() { return { v: 1, stages: {}, completed: false }; }

    function load() {
        data = blank();
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* storage blocked or corrupt */ }
        if (!raw || typeof raw !== 'object' || !raw.stages || typeof raw.stages !== 'object') return data;
        STAGES.forEach((s) => {
            const r = raw.stages[s.id];
            if (!r || typeof r !== 'object') return;
            const goals = [!!(r.goals && r.goals[0]), !!(r.goals && r.goals[1])];
            // Stars are always derived: 1 for a win plus one per goal.
            const won = Number(r.stars) > 0 || goals[0] || goals[1];
            if (won) data.stages[s.id] = { goals, stars: 1 + goals.filter(Boolean).length };
        });
        data.completed = !!raw.completed && !!data.stages[STAGES[STAGES.length - 1].id];
        return data;
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ }
    }

    function ensure() { if (!data) load(); return data; }

    function starsOf(id) { return ensure().stages[id]?.stars || 0; }
    function totalStars() { return STAGES.reduce((n, s) => n + starsOf(s.id), 0); }

    // 'locked' | 'open' | 'cleared'
    function lockInfo(stage) {
        const total = totalStars();
        if (starsOf(stage.id) > 0) return { state: 'cleared' };
        const tier = TIERS[stage.tier];
        if (stage.id > 1 && starsOf(stage.id - 1) < 1) {
            return { state: 'locked', reason: `Win stage ${stage.id - 1} first` };
        }
        if (total < tier.need) {
            return { state: 'locked', reason: `Needs ${tier.need} stars (you have ${total})` };
        }
        return { state: 'open' };
    }
    function isPlayable(stage) { return lockInfo(stage).state !== 'locked'; }

    function nextTierNeed() {
        const total = totalStars();
        return TIERS.find((t) => t.need > total) || null;
    }

    // ── Results ──────────────────────────────────────────────────────────
    function goalMet(goal, info) {
        if (goal.type === 'margin') return info.playerScore - info.aiScore >= goal.n;
        if (goal.type === 'rally') return info.rally >= goal.n;
        return false;
    }

    // info: { stageId, won, playerScore, aiScore, rally }
    function recordResult(info) {
        const stage = byId(info?.stageId);
        if (!stage) return null;
        ensure();
        const beforeTotal = totalStars();
        const before = data.stages[stage.id] || null;
        const goals = stage.goals.map((g) => !!info.won && goalMet(g, info));
        const earned = info.won ? 1 + goals.filter(Boolean).length : 0;
        if (info.won) {
            const merged = [0, 1].map((i) => goals[i] || !!before?.goals?.[i]);
            data.stages[stage.id] = { goals: merged, stars: 1 + merged.filter(Boolean).length };
            if (stage.id === STAGES[STAGES.length - 1].id) data.completed = true;
            save();
        }
        const total = totalStars();
        updateMenuButton();
        const next = byId(stage.id + 1);
        const opened = TIERS.filter((t) => t.need > beforeTotal && t.need <= total);
        return {
            stage, won: !!info.won, earned, goals,
            best: starsOf(stage.id), firstClear: !!info.won && !before,
            total, next, nextPlayable: !!(next && isPlayable(next)),
            opened, tourComplete: !!info.won && stage.id === STAGES[STAGES.length - 1].id,
        };
    }

    // ── Starting a stage ─────────────────────────────────────────────────
    function clear() {
        if (window.game) window.game.tourContext = null;
    }

    function launch(id) {
        const stage = byId(id);
        const g = window.game;
        if (!stage || !g || !isPlayable(stage)) return false;
        g.tourContext = {
            active: true, stageId: stage.id, mode: stage.mode, level: stage.level, points: stage.points,
            styleId: stage.style, rival: stage.rival, twist: stage.twist,
        };
        window.PPResults?.hide();
        const go = () => {
            close(true);
            window.ppEnterMobilePlay?.();
            const overlay = document.getElementById('overlay');
            if (overlay) { overlay.classList.remove('visible', 'post-match'); overlay.classList.add('hidden'); }
            document.body.classList.remove('has-overlay');
            g.isMultiplayer = false;
            g.setGameMode(stage.mode);
            g.startIntro?.();
            g.startMatchMusic?.();
        };
        const trigger = isOpen() ? root.querySelector(`[data-play="${stage.id}"]`) : document.getElementById('menuTourBtn');
        if (window.ModeTutorial?.beforeStart) window.ModeTutorial.beforeStart(stage.mode, go, trigger);
        else go();
        return true;
    }

    // ── Tour screen ──────────────────────────────────────────────────────
    let root = null;
    let lastFocus = null;

    function starRow(n, label) {
        let s = '';
        for (let i = 1; i <= 3; i++) s += `<i class="${i <= n ? 'on' : ''}" aria-hidden="true">&#9733;</i>`;
        return `<span class="pptour-stars" role="img" aria-label="${esc(label || `${n} of 3 stars`)}">${s}</span>`;
    }

    // The first stage that can be played and has no stars yet.
    function nextUpId() {
        const s = STAGES.find((st) => lockInfo(st).state === 'open');
        return s ? s.id : 0;
    }

    function stageCard(stage, nextUp) {
        const info = lockInfo(stage);
        const rec = data.stages[stage.id];
        const mode = MODES[stage.mode];
        const tier = TIERS[stage.tier];
        const stars = rec?.stars || 0;
        const goals = [{ text: 'Win the match', done: stars > 0 }]
            .concat(stage.goals.map((g, i) => ({ text: g.text, done: !!rec?.goals?.[i] })));
        const chips = [
            `<span class="pptour-chip mode">${esc(mode.name)}</span>`,
            `<span class="pptour-chip">${esc(SKILLS[stage.level])}</span>`,
            `<span class="pptour-chip">First to ${stage.points}</span>`,
        ];
        if (stage.twist) chips.push(`<span class="pptour-chip twist">${esc(TWISTS[stage.twist])}</span>`);
        const locked = info.state === 'locked';
        const label = locked ? 'Locked' : (stars > 0 ? 'Play again' : 'Play');
        return `
            <article class="pptour-card ${info.state}${stage.boss ? ' boss' : ''}${stage.id === nextUp ? ' next' : ''}" style="--c:${mode.hex}" data-stage="${stage.id}" data-mode="${stage.mode}">
                <div class="pptour-card-top">
                    <span class="pptour-stage">Stage ${stage.id}${stage.id === nextUp ? ' &middot; Next up' : ''}</span>
                    <span class="pptour-tier">${esc(tier.name)}${stage.boss ? ' &middot; Rival' : ''}</span>
                </div>
                <h3 class="pptour-rival">${esc(stage.rival)}</h3>
                <p class="pptour-style">${esc(STYLE_TEXT[stage.style])}</p>
                <div class="pptour-chips">${chips.join('')}</div>
                <ul class="pptour-goals">${goals.map((g) =>
                    `<li class="${g.done ? 'done' : ''}"><span class="pptour-tick" aria-hidden="true">${g.done ? '&#9733;' : '&#9734;'}</span><span>${esc(g.text)}<span class="pptour-sr">${g.done ? ' (done)' : ''}</span></span></li>`).join('')}</ul>
                <div class="pptour-card-foot">
                    ${locked ? `<p class="pptour-lock">${esc(info.reason)}</p>` : starRow(stars)}
                    <button type="button" class="pptour-play" data-play="${stage.id}"${locked ? ' disabled' : ''}>${label}</button>
                </div>
            </article>`;
    }

    function render() {
        ensure();
        const total = totalStars();
        const next = nextTierNeed();
        const nextUp = nextUpId();
        const stageHtml = STAGES.map((st) => stageCard(st, nextUp)).join('');
        root.querySelector('.pptour-total b').textContent = String(total);
        root.querySelector('.pptour-total span').textContent = `/ ${MAX_STARS}`;
        const hint = data.completed
            ? 'Tour complete. Replay any stage for a perfect three stars.'
            : (next ? `${next.name} stages open at ${next.need} stars (you have ${total}).` : 'Every tier is open.');
        root.querySelector('.pptour-hint').textContent = hint;
        root.querySelector('.pptour-grid').innerHTML = stageHtml;
        // The arena's own artwork (the same scenes as the menu cards) fills the top of each card.
        root.querySelectorAll('.pptour-card').forEach((card) => {
            const mode = card.dataset.mode;
            const art = window.ModeArt?.url(mode);
            if (!art) return;
            card.style.setProperty('--art', art);
            card.style.setProperty('--art-pos', `center ${window.ModeArt.focus?.(mode) || '40%'}`);
            card.classList.add('has-art');
        });
        // Progress toward the next tier, so the star count always has a goal.
        const bar = root.querySelector('.pptour-progress');
        const fill = bar.querySelector('i');
        if (next) {
            const prev = [...TIERS].reverse().find((t) => t.need <= total) || TIERS[0];
            const span = Math.max(1, next.need - prev.need);
            fill.style.width = `${Math.max(0, Math.min(100, ((total - prev.need) / span) * 100))}%`;
            bar.hidden = false;
            bar.setAttribute('aria-label', `${total} of ${next.need} stars for the ${next.name} tier`);
        } else bar.hidden = true;
    }

    function build() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'ppTour';
        root.className = 'pptour';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'pptourTitle');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="pptour-box">
                <header class="pptour-head">
                    <div class="pptour-heading">
                        <p class="pptour-kicker">Solo career</p>
                        <h2 id="pptourTitle">The Tour</h2>
                    </div>
                    <div class="pptour-hintbox">
                        <p class="pptour-hint" aria-live="polite"></p>
                        <div class="pptour-progress" role="img"><i></i></div>
                    </div>
                    <div class="pptour-total" aria-label="Stars earned"><b>0</b><span>/ ${MAX_STARS}</span><i aria-hidden="true">&#9733;</i></div>
                    <button type="button" class="pptour-close" aria-label="Close the Tour">&times;</button>
                </header>
                <div class="pptour-body"><div class="pptour-grid"></div></div>
            </div>`;
        document.body.appendChild(root);
        root.addEventListener('click', (e) => {
            if (e.target === root || e.target.closest('.pptour-close')) { close(); return; }
            const btn = e.target.closest('[data-play]');
            if (btn && !btn.disabled) launch(Number(btn.dataset.play));
        });
        window.addEventListener('keydown', (e) => {
            if (!isOpen()) return;
            // A how-to-play guide opened from a stage sits on top and handles its own keys.
            if (document.querySelector('#modeTutorial:not([hidden])')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
                return;
            }
            if (e.key === 'Tab') {
                const items = [...root.querySelectorAll('button:not(:disabled)')].filter((el) => el.getClientRects().length);
                if (!items.length) return;
                const first = items[0], last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
                return;
            }
            // Keep menu and game shortcuts from firing behind the Tour.
            if (!['Enter', ' '].includes(e.key)) e.stopPropagation();
        }, true);
        return root;
    }

    function isOpen() { return !!root?.classList.contains('open'); }

    function open() {
        build();
        render();
        lastFocus = document.activeElement;
        root.classList.add('open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pp-tour-open');
        const target = root.querySelector('.pptour-card.open .pptour-play:not(:disabled), .pptour-card.cleared .pptour-play:not(:disabled), .pptour-play:not(:disabled)')
            || root.querySelector('.pptour-close');
        // Scroll the first stage still to play into view, then focus it.
        const firstOpen = root.querySelector('.pptour-card.open');
        requestAnimationFrame(() => {
            (firstOpen?.querySelector('.pptour-play') || target)?.focus({ preventScroll: true });
            firstOpen?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }

    function close(silent) {
        if (!root || !isOpen()) return;
        root.classList.remove('open');
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pp-tour-open');
        if (!silent && lastFocus && document.contains(lastFocus) && lastFocus !== document.body) {
            try { lastFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        }
    }

    // ── Menu button ──────────────────────────────────────────────────────
    function updateMenuButton() {
        const label = document.getElementById('menuTourStars');
        if (!label) return;
        ensure();
        label.textContent = `${totalStars()}/${MAX_STARS}`;
    }

    function bindMenu() {
        updateMenuButton();
        document.getElementById('menuTourBtn')?.addEventListener('click', open);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindMenu);
    else bindMenu();
    window.addEventListener('pp-returned-to-menu', updateMenuButton);

    // ── Result card extras ───────────────────────────────────────────────
    // Lines and buttons for the end-of-match card of a Tour stage.
    function resultCard(result, baseXpLine) {
        if (!result) return null;
        const { stage } = result;
        const lines = [];
        const stars = result.won ? `${'★'.repeat(result.earned)}${'☆'.repeat(3 - result.earned)}` : '';
        if (result.won) {
            lines.push(`Stage ${stage.id} cleared  ${stars}`);
            lines.push(`${result.goals[0] ? '✓' : '✗'} ${stage.goals[0].text}`);
            lines.push(`${result.goals[1] ? '✓' : '✗'} ${stage.goals[1].text}`);
            if (result.best > result.earned) lines.push(`Your best on this stage: ${result.best} of 3 stars`);
            lines.push(`Tour stars: ${result.total} of ${MAX_STARS}`);
            result.opened.forEach((t) => lines.push(`${t.name} tier unlocked`));
            if (result.tourComplete) lines.push('You beat Titan. The Tour is complete.');
            else if (result.next && !result.nextPlayable) lines.push(`Stage ${result.next.id} needs more stars: ${lockInfo(result.next).reason.replace(/^Needs /, 'needs ')}`);
        } else {
            lines.push(`${stage.rival} wins this one. Stars are only earned on a win.`);
        }
        if (baseXpLine) lines.push(baseXpLine);
        const actions = [];
        if (result.won && result.nextPlayable && !result.tourComplete) {
            actions.push({ label: `Next: stage ${result.next.id}`, primary: true, onClick: () => launch(result.next.id) });
        }
        actions.push({ label: result.won ? 'Replay stage' : 'Try again', primary: !result.won, onClick: () => launch(stage.id) });
        actions.push({ label: 'Tour map', onClick: () => { window.PPResults?.hide(); open(); } });
        actions.push({ label: 'Main menu', back: true, onClick: () => window.PPResults?.hide() });
        return {
            kicker: `Tour · stage ${stage.id} · ${TIERS[stage.tier].name}`,
            title: result.won ? 'You win!' : `${stage.rival} wins`,
            tone: result.won ? 'win' : 'loss', lines, actions,
        };
    }

    window.PPTour = {
        STAGES, TIERS, MAX_STARS, byId, lockInfo, isPlayable, totalStars, starsOf,
        recordResult, resultCard, launch, clear, open, close, isOpen, updateMenuButton,
        reload: () => { data = null; load(); },
    };
})();
