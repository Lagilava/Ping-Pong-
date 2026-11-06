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
    // Each tier is its own occasion in the same arena, set by two things:
    //  look: a colour-grade change laid over the mode's own grade (see
    //        applyTierLook; shader uniforms, so no frame cost)
    //  veil: one static translucent layer over the court (sun shafts, dusk
    //        glow, floodlights, a frame), see syncLook. `tint` is a flat wash
    //        that stands in for the grade in Gravity, where the post-process
    //        shader is off.
    // The court, ball and paddles are never covered, so play stays readable.
    const TIERS = [
        { id: 'club', name: 'Club', need: 0, mood: 'Sunlit open', accent: '#ffd37a',
            look: { sat: 0.95, contrast: 1.02, tint: [1.07, 1.035, 0.93], shadow: [0.04, 0.032, 0.016], highlight: [0.034, 0.022, 0.0] },
            veil: null },
        { id: 'regional', name: 'Regional', need: 4, mood: 'Evening league', accent: '#5ee7ff', look: null, veil: null },
        { id: 'national', name: 'National', need: 8, mood: 'Dusk finals', accent: '#ff7a9c',
            look: { sat: 1.14, contrast: 1.08, tint: [1.08, 0.95, 0.95], shadow: [0.03, -0.01, 0.036], highlight: [0.046, 0.012, -0.012] },
            veil: {
                layers: [
                    'linear-gradient(0deg, rgba(255, 104, 56, .52), transparent 52%)',
                    'linear-gradient(180deg, rgba(84, 18, 140, .56), transparent 46%)',
                    'radial-gradient(ellipse at center, transparent 44%, rgba(28, 4, 36, .5) 100%)',
                ],
                tint: [255, 96, 140, 0.12], frame: '' } },
        { id: 'world', name: 'World', need: 12, mood: 'Floodlit final', accent: '#ffe08a',
            look: { sat: 1.04, contrast: 1.18, tint: [0.97, 0.99, 1.07], shadow: [-0.012, -0.006, 0.012], highlight: [0.02, 0.026, 0.046] },
            veil: { layers: [], tint: null, frame: 'inset 0 0 0 3px rgba(255, 214, 120, .75), inset 0 0 90px rgba(255, 200, 90, .24)' } },
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

    // Mode grade + the tier's look. `look.tint/shadow/highlight` multiply
    // (tint) or add to the base; sat and contrast multiply.
    function applyTierLook(base, stageId) {
        const stage = byId(stageId);
        const look = stage && TIERS[stage.tier].look;
        if (!look || !base) return base;
        const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
        const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
        return {
            sat: (base.sat ?? 1) * look.sat,
            contrast: (base.contrast ?? 1) * look.contrast,
            tint: mul3(base.tint || [1, 1, 1], look.tint),
            shadow: add3(base.shadow || [0, 0, 0], look.shadow),
            highlight: add3(base.highlight || [0, 0, 0], look.highlight),
        };
    }

    // The veil: one static translucent element over the court, plus a title
    // card at the start of each stage. No blend modes and nothing animates
    // while play is running, so it adds no per-frame work. Called whenever a
    // match is set up.
    let veil = null;
    let cardTimer = 0;
    // Club and World Classic stages get their own venue scene (tour-venues.js).
    function venueFor(game) {
        const ctx = game?.getTourContext?.();
        if (!ctx || ctx.mode !== 'classic') return null;
        const tier = byId(ctx.stageId)?.tier;
        return tier === 0 ? 'hall' : tier === 3 ? 'final' : null;
    }

    function syncLook(game) {
        window.clearInterval(cardTimer);
        document.getElementById('ppTourCard')?.remove();
        const ctx = game?.getTourContext?.();
        const stage = ctx ? byId(ctx.stageId) : null;
        const spec = stage ? TIERS[stage.tier].veil : null;
        if (!veil) {
            veil = document.createElement('div');
            veil.id = 'ppTourVeil';
            veil.setAttribute('aria-hidden', 'true');
            // Same layer as the canvases (z-index 1) but later in the page, so it sits just above them and under the HUD.
            veil.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;';
        }
        if (stage) scheduleCard(game, stage);
        if (!spec) { veil.style.display = 'none'; return; }
        const host = document.getElementById('fx') || document.getElementById('c');
        if (host && host.nextElementSibling !== veil) host.after(veil);
        const layers = spec.layers.slice();
        // The flat tint carries the tier's colour where there is no grade, and
        // adds a little under the grade elsewhere; it goes last so it sits underneath.
        if (spec.tint) {
            const [r, g, b, a] = spec.tint;
            const k = game.postFx?.active ? 0.6 : 1.5;
            layers.push(`linear-gradient(rgba(${r}, ${g}, ${b}, ${(a * k).toFixed(3)}), rgba(${r}, ${g}, ${b}, ${(a * k).toFixed(3)}))`);
        }
        veil.style.background = layers.join(', ');
        veil.style.boxShadow = spec.frame || 'none';
        veil.style.display = '';
    }
    window.addEventListener('pp-returned-to-menu', () => {
        window.clearInterval(cardTimer);
        document.getElementById('ppTourCard')?.remove();
        if (veil) veil.style.display = 'none';
    });

    // "Stage 5 / Dusk finals / vs Juno" for three seconds once the intro is over.
    function scheduleCard(game, stage) {
        const tier = TIERS[stage.tier];
        let waited = 0;
        cardTimer = window.setInterval(() => {
            waited += 250;
            if (waited > 30000) { window.clearInterval(cardTimer); return; }
            if (!game.running || game.introActive || game.paused || game.matchEnding) return;
            window.clearInterval(cardTimer);
            const host = document.querySelector('.game-container') || document.body;
            const card = document.createElement('div');
            card.id = 'ppTourCard';
            card.className = 'pptour-title';
            card.setAttribute('aria-hidden', 'true');
            card.style.setProperty('--tier', tier.accent);
            card.innerHTML = `<small>Tour &middot; stage ${stage.id}</small><b>vs ${esc(stage.rival)}</b><span>${esc(tier.name)} &middot; ${esc(tier.mood)}</span>`;
            host.appendChild(card);
            card.addEventListener('animationend', () => card.remove());
            window.setTimeout(() => card.remove(), 5000);
        }, 250);
    }

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

    // ── Paddle rewards ───────────────────────────────────────────────────
    // Clearing both stages of a tier earns that tier's paddle design (defined
    // in paddle-designs.js with a tourTier). Nothing that already existed is
    // locked behind the Tour.
    function tierCleared(i) {
        const list = STAGES.filter((st) => st.tier === i);
        return list.length > 0 && list.every((st) => starsOf(st.id) > 0);
    }
    function rewardDesigns() { return (window.PaddleDesigns?.LIST || []).filter((d) => d.tourTier != null || d.tourComplete); }
    function rewardEarned(d) { return d.tourComplete ? !!ensure().completed : tierCleared(d.tourTier); }
    function rewardOf(tier) { return rewardDesigns().find((d) => d.tourTier === tier) || null; }
    function paddleLocked(id) {
        const d = rewardDesigns().find((x) => x.id === id);
        if (!d) return false;
        ensure();
        return !rewardEarned(d);
    }
    function paddleLockText(id) {
        const d = rewardDesigns().find((x) => x.id === id);
        if (!d) return '';
        return d.tourComplete ? 'Beat the whole Tour (all 8 stages)' : `Clear both ${TIERS[d.tourTier].name} stages in the Tour`;
    }

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
        const clearedBefore = TIERS.map((t, i) => tierCleared(i));
        const completedBefore = !!data.completed;
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
        const newPaddles = TIERS.map((t, i) => (!clearedBefore[i] && tierCleared(i) ? rewardOf(i) : null)).filter(Boolean);
        if (!completedBefore && data.completed) newPaddles.push(...rewardDesigns().filter((d) => d.tourComplete));
        return {
            stage, won: !!info.won, earned, goals,
            best: starsOf(stage.id), firstClear: !!info.won && !before,
            newPaddles, total, next, nextPlayable: !!(next && isPlayable(next)),
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
        const nextPad = rewardDesigns().find((d) => !rewardEarned(d));
        root.querySelector('.pptour-hint').textContent = nextPad ? `${hint} Next paddle: ${nextPad.name}, earned by ${nextPad.tourComplete ? 'beating the whole Tour' : `clearing both ${TIERS[nextPad.tourTier].name} stages`}.` : `${hint} All paddle rewards earned.`;
        root.querySelector('.pptour-grid').innerHTML = stageHtml;
        renderRewards();
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

    // ── Reward strip: the four paddles with their live previews ──────────
    let rewardRaf = 0;
    const rewardPads = new Map();
    function renderRewards() {
        const host = root.querySelector('.pptour-rewards');
        const list = rewardDesigns();
        if (!host) return;
        host.hidden = !list.length;
        host.innerHTML = `<h3>Paddle rewards</h3>` + list.map((d) => {
            const got = rewardEarned(d);
            return `<div class="pptour-reward ${got ? 'got' : 'locked'}" data-design="${d.id}" title="${esc(d.blurb)}">
                <canvas aria-hidden="true"></canvas>
                <span class="pptour-rname">${esc(d.name)}</span>
                <span class="pptour-rstate">${got ? 'Earned' : (d.tourComplete ? 'Beat the whole Tour' : `Clear ${esc(TIERS[d.tourTier].name)} stages`)}</span></div>`;
        }).join('');
        rewardPads.clear();
        cancelAnimationFrame(rewardRaf);
        rewardRaf = requestAnimationFrame(drawRewards);
    }
    function drawRewards() {
        rewardRaf = 0;
        if (!isOpen() || typeof Paddle !== 'function') return;
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        root.querySelectorAll('.pptour-reward canvas').forEach((canvas) => {
            const id = canvas.parentElement.dataset.design;
            const cw = canvas.clientWidth || 40, ch = canvas.clientHeight || 64;
            if (!cw || !ch) return;
            if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
                canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
                rewardPads.delete(canvas);
            }
            let pd = rewardPads.get(canvas);
            const ph = Math.round(ch * 0.8), pw = Math.max(9, Math.round(ph * 0.17));
            if (!pd) {
                pd = new Paddle(0, 0, pw, ph, '#00ffd6', false);
                pd.applyCustomPaddleVisualState?.(id, '#00ffd6');
                rewardPads.set(canvas, pd);
            }
            pd.pos.x = (cw - pw) / 2; pd.pos.y = (ch - ph) / 2;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cw, ch);
            pd.render(ctx);
        });
        rewardRaf = requestAnimationFrame(drawRewards);
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
                <div class="pptour-body"><section class="pptour-rewards" aria-label="Paddle rewards"></section><div class="pptour-grid"></div><footer class="pptour-foot"><button type="button" class="pptour-reset">Reset Tour progress</button></footer></div>
            </div>`;
        document.body.appendChild(root);
        root.addEventListener('click', (e) => {
            if (e.target === root || e.target.closest('.pptour-close')) { close(); return; }
            const rs = e.target.closest('.pptour-reset');
            if (rs) {
                if (rs.dataset.armed) { delete rs.dataset.armed; resetProgress(); return; }
                rs.dataset.armed = '1'; rs.textContent = 'Tap again to erase stars and rewards';
                setTimeout(() => { if (rs.isConnected) { delete rs.dataset.armed; rs.textContent = 'Reset Tour progress'; } }, 4000);
                return;
            }
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

    // ── Gamepad: d-pad or left stick moves between buttons, A (on release)
    // presses, B closes. Polled only while the Tour is open and a pad is
    // connected.
    let padRaf = 0, padPrev = {}, padDir = '', padRepeat = 0;
    function padMove(dir) {
        const items = [...root.querySelectorAll('button:not(:disabled)')].filter((el) => el.getClientRects().length);
        if (!items.length) return;
        let cur = root.contains(document.activeElement) && items.includes(document.activeElement) ? document.activeElement : null;
        if (!cur) { (items.find((el) => el.classList.contains('pptour-play')) || items[0]).focus(); return; }
        const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = null, bestScore = Infinity;
        for (const el of items) {
            if (el === cur) continue;
            const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
            const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
            if (along < 4) continue;
            const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
            const score = along + across * 2.2;
            if (score < bestScore) { bestScore = score; best = el; }
        }
        if (best) best.focus();
    }
    function padPoll() {
        padRaf = 0;
        if (!isOpen()) return;
        const pad = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
        if (!pad) return;
        padRaf = requestAnimationFrame(padPoll);
        if (document.querySelector('#modeTutorial:not([hidden])')) return;
        const b = (i) => !!pad.buttons[i]?.pressed;
        const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
        const dir = (b(14) || x < -0.55) ? 'left' : (b(15) || x > 0.55) ? 'right' : (b(12) || y < -0.55) ? 'up' : (b(13) || y > 0.55) ? 'down' : '';
        const now = performance.now();
        if (dir && (dir !== padDir || now >= padRepeat)) { padMove(dir); padRepeat = now + (dir !== padDir ? 360 : 170); }
        padDir = dir;
        const cur = { a: b(0), b: b(1) };
        if (!padPrev) { padPrev = cur; return; }
        if (padPrev.a && !cur.a && root.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
        if (!padPrev.b && cur.b) close();
        padPrev = cur;
    }
    function startPad() {
        if (padRaf || !isOpen()) return;
        padPrev = null; // the first frame only records which buttons are already held
        padDir = ''; padRaf = requestAnimationFrame(padPoll);
    }
    window.addEventListener('gamepadconnected', () => { if (isOpen()) startPad(); });

    function isOpen() { return !!root?.classList.contains('open'); }

    function open() {
        build();
        render();
        lastFocus = document.activeElement;
        root.classList.add('open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pp-tour-open');
        startPad();
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
            (result.newPaddles || []).forEach((d) => lines.push(`New paddle unlocked: ${d.name}`));
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
        (result.newPaddles || []).slice(0, 1).forEach((d) => actions.push({ label: `Equip ${d.name}`, onClick: function () { equip(d.id); if (this && this.textContent !== undefined) this.textContent = `${d.name} equipped`; } }));
        actions.push({ label: result.won ? 'Replay stage' : 'Try again', primary: !result.won, onClick: () => launch(stage.id) });
        actions.push({ label: 'Tour map', onClick: () => { window.PPResults?.hide(); open(); } });
        actions.push({ label: 'Main menu', back: true, onClick: () => window.PPResults?.hide() });
        return {
            kicker: `Tour · stage ${stage.id} · ${TIERS[stage.tier].name}`,
            title: result.won ? 'You win!' : `${stage.rival} wins`,
            tone: result.won ? 'win' : 'loss', lines, actions,
        };
    }

    // Pause menu: who you are playing and how the stage's goals are going.
    function pauseSummary(game) {
        const ctx = game?.getTourContext?.();
        const stage = ctx ? byId(ctx.stageId) : null;
        if (!stage) return '';
        const sc = game.scores || {};
        const live = { playerScore: sc.player || 0, aiScore: sc.ai || 0, rally: game.maxRally || 0 };
        const rows = [`<li>First to ${stage.points}${stage.twist === 'winBy2' ? ' (win by 2)' : ''}</li>`]
            .concat(stage.goals.map((g) => `<li class="${goalMet(g, live) ? 'done' : ''}">${goalMet(g, live) ? '\u2713' : '\u25CB'} ${esc(g.text)}</li>`));
        return `<p class="pause-tour-head">Tour \u00B7 stage ${stage.id} \u00B7 vs ${esc(stage.rival)}</p><ul>${rows.join('')}</ul>`;
    }

    // Start the career again; the paddle rewards lock again with it.
    function resetProgress() {
        data = blank();
        save();
        updateMenuButton();
        if (root) render();
    }

    // Put a reward on the player's own side in every mode.
    function equip(id) {
        const S = window.PPSettings;
        if (!S?.setPaddle || paddleLocked(id)) return false;
        ['classic', 'zombie', 'gravity', 'speed', 'obstacle', 'customise'].forEach((m) => S.setPaddle(m, 'left', id));
        return true;
    }

    window.PPTour = {
        pauseSummary, resetProgress, venueFor, tierCleared, rewardOf, paddleLocked, paddleLockText, equip,
        STAGES, TIERS, MAX_STARS, byId, lockInfo, isPlayable, totalStars, starsOf,
        recordResult, resultCard, applyTierLook, syncLook, launch, clear, open, close, isOpen, updateMenuButton,
        reload: () => { data = null; load(); },
    };
})();
