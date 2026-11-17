// End-of-match card: winner, final score, a few stats and the next step
// (play again, back to the menu, back to Custom). Shown over the main menu.
(function () {
    'use strict';

    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    let root = null;
    let lastFocus = null;

    function build() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'pp-results';
        root.className = 'ppres';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'ppresTitle');
        root.setAttribute('aria-hidden', 'true');
        document.body.appendChild(root);
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-res]');
            if (!btn || btn.disabled) return;
            const action = root.__actions?.[Number(btn.dataset.res)];
            if (action?.onClick) action.onClick(e, btn);
        });
        window.addEventListener('keydown', (e) => {
            if (!isOpen()) return;
            if (e.key === 'Escape') {
                // Escape = the card's "back" action (Main menu). Online results
                // have none: leaving the room takes a deliberate click.
                e.preventDefault();
                e.stopPropagation();
                const back = (root.__actions || []).find((a) => a.back);
                if (back?.onClick) back.onClick(e, null);
                return;
            }
            // Keep game shortcuts from firing behind the card; Tab/Enter/Space still work on its buttons.
            if (!['Tab', 'Enter', ' '].includes(e.key)) e.stopPropagation();
        }, true);
        return root;
    }

    // Grow the card on big monitors (1440p, 4K, ultrawide) so it keeps its presence;
    // never shrink it (small screens are handled by max-height and mobile-fit.css).
    function fitScale() {
        if (!root) return;
        const k = Math.min(1.8, Math.max(1, Math.min(window.innerWidth / 1280, window.innerHeight / 760)));
        root.style.setProperty('--ppres-k', k.toFixed(3));
    }
    window.addEventListener('resize', fitScale);

    function isOpen() { return !!root?.classList.contains('open'); }

    // Gamepad: d-pad or left stick moves between the card's buttons, A (on release) presses,
    // B runs the card's back action (none on online results, as with Esc). Polled only while
    // the card is open and a pad is connected.
    let padRaf = 0, padPrev = null, padDir = '', padRepeat = 0;
    function padMove(dir) {
        const items = [...root.querySelectorAll('.ppres-btn:not(:disabled)')];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement);
        if (i < 0) { items[0].focus(); return; }
        const step = (dir === 'down' || dir === 'right') ? 1 : -1;
        items[Math.max(0, Math.min(items.length - 1, i + step))].focus();
    }
    function padPoll() {
        padRaf = 0;
        if (!isOpen()) return;
        const pad = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
        if (!pad) return;
        padRaf = requestAnimationFrame(padPoll);
        const b = (n) => !!pad.buttons[n]?.pressed;
        const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
        const dir = (b(14) || x < -0.55) ? 'left' : (b(15) || x > 0.55) ? 'right' : (b(12) || y < -0.55) ? 'up' : (b(13) || y > 0.55) ? 'down' : '';
        const now = performance.now();
        if (dir && (dir !== padDir || now >= padRepeat)) { padMove(dir); padRepeat = now + (dir !== padDir ? 360 : 170); }
        padDir = dir;
        const cur = { a: b(0), b: b(1) };
        if (!padPrev) { padPrev = cur; return; } // the first frame only records what is already held
        const f = document.activeElement;
        if (padPrev.a && !cur.a && f && root.contains(f) && f.tagName === 'BUTTON') f.click();
        if (padPrev.b && !cur.b) {
            const back = (root.__actions || []).find((a) => a.back);
            if (back?.onClick) back.onClick(null, null);
        }
        padPrev = cur;
    }
    function startPad() {
        if (padRaf || !isOpen()) return;
        padPrev = null; padDir = '';
        padRaf = requestAnimationFrame(padPoll);
    }
    window.addEventListener('gamepadconnected', () => { if (isOpen()) startPad(); });

    // opts: { kicker, title, tone ('win'|'loss'|'neutral'), left: {label, score},
    //         right: {label, score}, lines: [text], actions: [{label, primary, back, data, onClick}], status }
    function show(opts = {}) {
        build();
        const tone = opts.tone || 'neutral';
        const scores = opts.left && opts.right ? `
            <div class="ppres-scores">
                <div class="ppres-side left"><span>${esc(opts.left.label)}</span><strong>${esc(opts.left.score)}</strong></div>
                <div class="ppres-dash">–</div>
                <div class="ppres-side right"><span>${esc(opts.right.label)}</span><strong>${esc(opts.right.score)}</strong></div>
            </div>` : '';
        const lines = (opts.lines || []).filter(Boolean);
        const actions = opts.actions || [];
        root.__actions = actions;
        root.innerHTML = `
            <div class="ppres-box ${tone}">
                <div class="ppres-kicker">${esc(opts.kicker || 'Match over')}</div>
                <h2 id="ppresTitle" class="ppres-title">${esc(opts.title || 'Match over')}</h2>
                ${scores}
                ${lines.length ? `<ul class="ppres-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
                <div class="ppres-actions">${actions.map((a, i) =>
                    `<button type="button" class="ppres-btn${a.primary ? ' primary' : ''}" data-res="${i}"${a.data ? ` data-ppon="${esc(a.data)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>
                <p class="ppres-status ppon-result-status" aria-live="polite">${esc(opts.status || '')}</p>
            </div>`;
        // The mode's scene (js/menu/mode-art.js) as a banner across the top.
        const mode = opts.mode || window.game?.gameMode;
        const art = window.ModeArt?.url(mode);
        if (art) {
            const box = root.querySelector('.ppres-box');
            const layer = document.createElement('div');
            layer.className = 'ppres-art';
            layer.setAttribute('aria-hidden', 'true');
            layer.style.backgroundImage = art;
            layer.style.backgroundPosition = `center ${window.ModeArt.focus(mode)}`;
            box.classList.add('has-art');
            box.prepend(layer);
        }
        fitScale();
        lastFocus = document.activeElement;
        root.classList.add('open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pp-results-open');
        startPad();
        requestAnimationFrame(() => root.querySelector('.ppres-btn.primary, .ppres-btn')?.focus({ preventScroll: true }));
        return root.querySelector('.ppres-box');
    }

    function hide() {
        if (!root || !isOpen()) return;
        root.classList.remove('open');
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pp-results-open');
        if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) {
            try { lastFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        }
    }

    window.PPResults = { show, hide, isOpen };
    // Any new match or a trip back to the menu clears the card.
    window.addEventListener('pp-returned-to-menu', hide);
})();
