// Custom setup screen extras: live match summary, power-up all/none and count,
// and section nav highlighting. The screen itself is built in menu.js.
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);

    function selectedText(id) {
        const el = $(id);
        return el && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
    }

    function powerBoxes() {
        const grid = $('customPowerupsGrid');
        return grid ? Array.from(grid.querySelectorAll('input[type="checkbox"]')) : [];
    }

    function refreshSummary() {
        if (window.__ppCustomNavUpdate) window.__ppCustomNavUpdate();
        const boxes = powerBoxes();
        const on = boxes.filter((b) => b.checked).length;
        const count = $('customPowerupsCount');
        if (count) count.textContent = on + ' of ' + boxes.length + ' on';
        const bits = [];
        const map = selectedText('forgeMapSelect');
        if (map) bits.push(map);
        const score = selectedText('forgeRule-scoreToWin');
        if (score) bits.push(score);
        const speed = selectedText('forgeRule-ballSpeed');
        if (speed) bits.push(speed + ' ball');
        bits.push(on === 0 ? 'No power-ups' : on + (on === 1 ? ' power-up' : ' power-ups'));
        const line = $('customSummary');
        if (line) line.textContent = bits.join(' · ');
    }

    function bindPowerups() {
        const set = (v) => {
            powerBoxes().forEach((b) => {
                if (b.checked === v) return;
                b.checked = v;
                b.dispatchEvent(new Event('change', { bubbles: true }));
            });
            refreshSummary();
        };
        $('customPowerupsAll')?.addEventListener('click', () => set(true));
        $('customPowerupsNone')?.addEventListener('click', () => set(false));
    }

    function bindNav() {
        const scroller = document.querySelector('#customiseOverlay .customise-overlay-content');
        const links = Array.from(document.querySelectorAll('.customise-section-nav a'));
        if (!scroller || !links.length) return;
        const targets = links.map((a) => $(a.getAttribute('href').slice(1)));
        const update = () => {
            const top = scroller.getBoundingClientRect().top + 90;
            let cur = 0;
            targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= top) cur = i; });
            if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) cur = targets.length - 1;
            links.forEach((a, i) => {
                if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
            });
        };
        scroller.addEventListener('scroll', update, { passive: true });
        links.forEach((a, i) => a.addEventListener('click', (e) => {
            e.preventDefault();
            const t = targets[i];
            if (!t) return;
            const nav = document.querySelector('.customise-section-nav');
            const off = (nav ? nav.offsetHeight : 0) + 12;
            scroller.scrollTo({ top: t.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - off, behavior: 'smooth' });
        }));
        window.__ppCustomNavUpdate = update;
        update();
    }

    function init() {
        const panel = $('customisePanel');
        if (!panel) return;
        bindPowerups();
        bindNav();
        panel.addEventListener('change', refreshSummary);
        panel.addEventListener('input', refreshSummary);
        const overlay = $('customiseOverlay');
        if (overlay) {
            new MutationObserver(refreshSummary).observe(overlay, { attributes: true, attributeFilter: ['class'] });
        }
        // Forge fills its selects after load.
        [300, 1200, 3000].forEach((t) => setTimeout(refreshSummary, t));
        refreshSummary();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
