// Thumb pad and the touch layout editor (phones and tablets).
//
// On a phone your paddle is steered by a thumb. With a 1:1 slide the thumb
// had to sweep almost the whole height of the screen, right over the court.
// The thumb pad is a small marked area in a bottom corner: a slide the
// height of the pad moves the paddle across the whole court (the gain is
// applied in Game.updatePointerControlledPaddle), so the thumb can rest in
// the corner. Touches elsewhere on the screen still steer the same way.
//
// The pad and the ability button can be moved and resized in Settings →
// Controls → Touch layout (stored as PPSettings 'touchLayout', in fractions
// of the screen so it fits any phone). A smaller pad means a faster paddle.
(() => {
    'use strict';

    const device = window.PPDevice || { touch: false, kind: 'pc' };
    const S = () => window.PPSettings;
    const BTN = 74; // ability button size in CSS px at 100%
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const vw = () => window.innerWidth || 800;
    const vh = () => window.innerHeight || 400;

    const PAD_MIN = 0.24, PAD_MAX = 0.72; // pad height, fraction of the screen
    const AB_MIN = 0.75, AB_MAX = 1.45;   // ability button scale

    // Pad width follows its height so a big pad is also easier to find.
    const padWidth = (h) => clamp(h * 0.34, 54, 86);

    function defaults() {
        const h = clamp(vh() * 0.44, 130, 320);
        const w = padWidth(h);
        return {
            pad: { x: (vw() - 12 - w / 2) / vw(), y: (vh() - 12 - h / 2) / vh(), h: h / vh() },
            ab: null // next to your paddle lane (device-controls.js)
        };
    }

    function clean(raw) {
        const d = defaults();
        const out = { pad: { ...d.pad }, ab: null };
        const p = raw?.pad;
        if (p && [p.x, p.y, p.h].every(Number.isFinite)) out.pad = { x: p.x, y: p.y, h: clamp(p.h, PAD_MIN, PAD_MAX) };
        const a = raw?.ab;
        if (a && [a.x, a.y, a.s].every(Number.isFinite)) out.ab = { x: a.x, y: a.y, s: clamp(a.s, AB_MIN, AB_MAX) };
        return out;
    }

    function layout() { return clean(S()?.get('touchLayout')); }

    // The pad in CSS px, kept on screen.
    function padRect(l = layout()) {
        const h = clamp(l.pad.h * vh(), 90, vh() - 16);
        const w = padWidth(h);
        const cx = clamp(l.pad.x * vw(), w / 2 + 4, vw() - w / 2 - 4);
        const cy = clamp(l.pad.y * vh(), h / 2 + 4, vh() - h / 2 - 4);
        return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, cx, cy };
    }

    // The ability button in CSS px, or null for the default spot.
    function abilityRect(l = layout()) {
        if (!l.ab) return null;
        const size = Math.round(BTN * l.ab.s);
        const cx = clamp(l.ab.x * vw(), size / 2 + 4, vw() - size / 2 - 4);
        const cy = clamp(l.ab.y * vh(), size / 2 + 22, vh() - size / 2 - 4);
        return { left: cx - size / 2, top: cy - size / 2, size, cx, cy };
    }

    // How far a thumb slides for the paddle to cross the court.
    function travelPx() {
        if (!device.touch) return 0;
        return padRect().height * 0.86;
    }

    // Which side of the screen the pad (and so the steering thumb) is on.
    function padSide() { return padRect().cx >= vw() / 2 ? 'right' : 'left'; }

    // ── In-match pad ────────────────────────────────────────────────────────
    let el = null, knob = null;
    const st = { shown: false, rect: '', knob: -1, dragging: null, since: 0 };

    function build() {
        el = document.createElement('div');
        el.className = 'pp-thumb-pad';
        el.setAttribute('aria-hidden', 'true');
        el.hidden = true;
        el.innerHTML = '<i class="pp-tp-track"></i><i class="pp-tp-chev up"></i><i class="pp-tp-chev down"></i><i class="pp-tp-knob"></i>';
        knob = el.querySelector('.pp-tp-knob');
        document.body.appendChild(el);
    }

    function localPaddle(g) {
        if (g.net) return g.net.role === 'host' ? g.player : g.aiPaddle;
        return g.player;
    }

    // Called once a frame by device-controls.js. Writes the DOM only on change.
    function update(g, live) {
        const want = !!(device.touch && live && g && !(g.isMultiplayer && !g.net));
        if (!want) {
            if (el && st.shown) { el.hidden = true; st.shown = false; }
            return;
        }
        if (!el) build();
        if (!st.shown) { el.hidden = false; st.shown = true; st.since = performance.now(); el.classList.add('intro'); }
        if (st.since && performance.now() - st.since > 4000) { el.classList.remove('intro'); st.since = 0; }
        const r = padRect();
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (key !== st.rect) {
            st.rect = key;
            el.style.left = `${Math.round(r.left)}px`;
            el.style.top = `${Math.round(r.top)}px`;
            el.style.width = `${Math.round(r.width)}px`;
            el.style.height = `${Math.round(r.height)}px`;
            el.classList.toggle('on-left', r.cx < vw() / 2);
        }
        const pd = localPaddle(g);
        if (pd && g.height > pd.h) {
            const f = clamp((pd.pos.y) / (g.height - pd.h), 0, 1);
            const k = Math.round(f * 1000);
            if (k !== st.knob) { st.knob = k; knob.style.setProperty('--f', (k / 1000).toFixed(3)); }
        }
        const key2 = g.net ? (g.net.role === 'host' ? 'player' : 'ai') : 'player';
        const dragging = g.pointerControls?.[key2] != null && !!g.touchDrag?.[key2];
        if (dragging !== st.dragging) { st.dragging = dragging; el.classList.toggle('active', dragging); }
    }

    // ── Layout editor ───────────────────────────────────────────────────────
    let ed = null;
    let draft = null;
    let selected = 'pad';

    function editorOpen() { return !!ed && !ed.hidden; }

    function openEditor() {
        if (!ed) buildEditor();
        draft = layout();
        if (!draft.ab) openDefaultsAb();
        selected = 'pad';
        ed.hidden = false;
        document.body.classList.add('pp-touch-editor-open');
        renderEditor();
        requestAnimationFrame(() => ed.querySelector('[data-te="done"]')?.focus({ preventScroll: true }));
    }

    function closeEditor(save) {
        if (!editorOpen()) return;
        if (save && draft) {
            const out = { pad: draft.pad, ab: draft.abDefault ? null : draft.ab };
            S()?.set('touchLayout', out);
        }
        ed.hidden = true;
        document.body.classList.remove('pp-touch-editor-open');
        draft = null;
    }

    function buildEditor() {
        ed = document.createElement('div');
        ed.id = 'ppTouchEditor';
        ed.className = 'pp-touch-editor';
        ed.setAttribute('role', 'dialog');
        ed.setAttribute('aria-modal', 'true');
        ed.setAttribute('aria-label', 'Touch layout');
        ed.hidden = true;
        ed.innerHTML = `
            <div class="pp-te-court" aria-hidden="true"><i class="pp-te-mid"></i><i class="pp-te-paddle l"></i><i class="pp-te-paddle r"></i><i class="pp-te-ball"></i></div>
            <div class="pp-te-bar">
                <div class="pp-te-title"><b>Touch layout</b><span>Drag to move. Pick one to resize.</span></div>
                <div class="pp-te-size">
                    <label for="ppTeSize"><span data-te-label>Thumb pad size</span><output data-te-out></output></label>
                    <input id="ppTeSize" type="range" min="0" max="100" step="1" data-te-size>
                    <small data-te-hint></small>
                </div>
                <div class="pp-te-actions">
                    <button type="button" class="pp-te-btn" data-te="swap">Swap sides</button>
                    <button type="button" class="pp-te-btn" data-te="reset">Reset</button>
                    <button type="button" class="pp-te-btn primary" data-te="done">Done</button>
                </div>
            </div>
            <div class="pp-te-item pp-te-pad" data-te-item="pad" tabindex="0" role="button" aria-label="Thumb pad"><i class="pp-tp-track"></i><i class="pp-tp-chev up"></i><i class="pp-tp-chev down"></i><i class="pp-tp-knob"></i><span>Thumb pad</span></div>
            <div class="pp-te-item pp-te-ab" data-te-item="ab" tabindex="0" role="button" aria-label="Ability button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg><span>Ability</span></div>
            <div class="pp-te-rotate"><b>Turn your phone sideways</b><span>Matches are played in landscape, so the layout is set up there.</span><button type="button" class="pp-te-btn" data-te="cancel">Back</button></div>`;
        document.body.appendChild(ed);

        ed.addEventListener('click', (e) => {
            const act = e.target.closest('[data-te]')?.dataset.te;
            if (!act) return;
            if (act === 'done') closeEditor(true);
            else if (act === 'cancel') closeEditor(false);
            else if (act === 'reset') { draft = defaults(); openDefaultsAb(); renderEditor(); }
            else if (act === 'swap') {
                draft.pad = { ...draft.pad, x: 1 - draft.pad.x };
                draft.ab = { ...draft.ab, x: 1 - draft.ab.x };
                draft.abDefault = false;
                renderEditor();
            }
        });
        const range = ed.querySelector('[data-te-size]');
        range.addEventListener('input', () => {
            const t = Number(range.value) / 100;
            if (selected === 'pad') draft.pad = { ...draft.pad, h: PAD_MIN + (PAD_MAX - PAD_MIN) * t };
            else { draft.ab = { ...draft.ab, s: AB_MIN + (AB_MAX - AB_MIN) * t }; draft.abDefault = false; }
            renderEditor(true);
        });

        // Drag either control around the screen.
        let drag = null;
        ed.addEventListener('pointerdown', (e) => {
            const item = e.target.closest('[data-te-item]');
            if (!item) return;
            e.preventDefault();
            selected = item.dataset.teItem;
            const cur = selected === 'pad' ? padRect(draft) : abilityRect(draft);
            drag = { id: e.pointerId, dx: e.clientX - cur.cx, dy: e.clientY - cur.cy };
            try { item.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            renderEditor();
        });
        ed.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.id) return;
            const x = (e.clientX - drag.dx) / vw(), y = (e.clientY - drag.dy) / vh();
            if (selected === 'pad') draft.pad = { ...draft.pad, x, y };
            else { draft.ab = { ...draft.ab, x, y }; draft.abDefault = false; }
            renderEditor(true);
        });
        const end = (e) => {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
            // Store where it really sits (kept on screen).
            if (selected === 'pad') { const r = padRect(draft); draft.pad = { ...draft.pad, x: r.cx / vw(), y: r.cy / vh() }; }
            else { const r = abilityRect(draft); draft.ab = { ...draft.ab, x: r.cx / vw(), y: r.cy / vh() }; }
        };
        ed.addEventListener('pointerup', end);
        ed.addEventListener('pointercancel', end);
        // Escape cancels the edit before anything underneath (settings,
        // pause menu) sees it.
        window.addEventListener('keydown', (e) => {
            if (!editorOpen() || e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            closeEditor(false);
        }, true);
        window.addEventListener('resize', () => { if (editorOpen()) renderEditor(); });
    }

    // Start the button where the game puts it by default: just right of
    // your paddle lane, bottom left (device-controls.js place()).
    function openDefaultsAb() {
        const g = window.game;
        let lane = vw() * 0.05;
        const rect = g?.canvas?.getBoundingClientRect?.();
        if (g?.player && rect?.width) lane = rect.left + (g.player.pos.x + g.player.w) * (rect.width / g.width);
        draft.ab = { x: (Math.max(14, lane + 14) + BTN / 2) / vw(), y: (vh() - 14 - BTN / 2) / vh(), s: 1 };
        draft.abDefault = true;
    }

    function renderEditor(fromInput) {
        if (!ed || !draft) return;
        const pad = ed.querySelector('.pp-te-pad');
        const r = padRect(draft);
        Object.assign(pad.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        pad.classList.toggle('on-left', r.cx < vw() / 2);
        const ab = ed.querySelector('.pp-te-ab');
        const a = abilityRect(draft);
        Object.assign(ab.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.size}px`, height: `${a.size}px` });
        pad.classList.toggle('selected', selected === 'pad');
        ab.classList.toggle('selected', selected === 'ab');
        // The bar sits at the top, away from the controls.
        const range = ed.querySelector('[data-te-size]');
        const t = selected === 'pad' ? (draft.pad.h - PAD_MIN) / (PAD_MAX - PAD_MIN) : (draft.ab.s - AB_MIN) / (AB_MAX - AB_MIN);
        if (!fromInput) range.value = String(Math.round(clamp(t, 0, 1) * 100));
        ed.querySelector('[data-te-label]').textContent = selected === 'pad' ? 'Thumb pad size' : 'Ability button size';
        ed.querySelector('[data-te-out]').textContent = `${Math.round((selected === 'pad' ? draft.pad.h / defaults().pad.h : draft.ab.s) * 100)}%`;
        ed.querySelector('[data-te-hint]').textContent = selected === 'pad'
            ? 'Smaller pad: shorter slides, faster paddle. Larger pad: finer control.'
            : 'Tap or hold it with your other thumb during a match.';
    }

    if (device.touch) {
        S()?.on((key) => { if (key === 'touchLayout' || key === '*') st.rect = ''; });
        window.addEventListener('resize', () => { st.rect = ''; });
    }

    window.PPTouchPad = { layout, padRect, abilityRect, travelPx, padSide, update, openEditor, closeEditor, isEditorOpen: editorOpen };
})();
