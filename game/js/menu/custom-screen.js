// Custom setup screen extras: section tabs, live match summary and tab values,
// power-up all/none and count. The screen itself is built in menu.js.
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

        setTabValue('arena', map.replace(/ \(unsaved\)$/, ''));
        setTabValue('look', selectedText('customPaddleStyle'));
        const file = ($('customAudioCustomPath')?.value || '').trim();
        setTabValue('music', file ? (file.length > 22 ? file.slice(0, 21) + '…' : file) : selectedText('customAudioTrack').replace(/^Default \((.*)\)$/, '$1'));
        setTabValue('background', selectedText('customBackgroundMode'));
        setTabValue('powerups', on + ' of ' + boxes.length);
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

    // One section at a time: the tabs replace the long scrolling page, so the
    // arena, rules and Start button are on screen as soon as the screen opens.
    const TAB_KEY = 'pp-custom-tab';

    function tabButtons() {
        return Array.from(document.querySelectorAll('#customiseOverlay [data-custom-tab]'));
    }

    function redrawPreviews() {
        window.Forge?.UI?.drawPreview?.();
        window.__ppDrawCustomLiveBackground?.();
        window.__ppDrawCustomPaddlePreviews?.();
    }

    function showTab(name, focus) {
        const buttons = tabButtons();
        if (!buttons.some((b) => b.dataset.customTab === name)) name = 'arena';
        buttons.forEach((b) => {
            const on = b.dataset.customTab === name;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
            if (on && focus) b.focus();
        });
        document.querySelectorAll('#customisePanel [data-custom-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.customPanel !== name;
        });
        const scroller = document.querySelector('#customiseOverlay .customise-overlay-content');
        if (scroller) scroller.scrollTop = 0;
        try { sessionStorage.setItem(TAB_KEY, name); } catch (e) { /* storage blocked */ }
        // Canvases in a hidden panel have no size; draw them now they show.
        requestAnimationFrame(redrawPreviews);
    }

    function bindTabs() {
        const buttons = tabButtons();
        if (!buttons.length) return;
        buttons.forEach((b, i) => {
            b.addEventListener('click', () => showTab(b.dataset.customTab));
            b.addEventListener('keydown', (e) => {
                let j = -1;
                if (e.key === 'ArrowRight') j = (i + 1) % buttons.length;
                else if (e.key === 'ArrowLeft') j = (i - 1 + buttons.length) % buttons.length;
                else if (e.key === 'Home') j = 0;
                else if (e.key === 'End') j = buttons.length - 1;
                if (j < 0) return;
                e.preventDefault();
                showTab(buttons[j].dataset.customTab, true);
            });
        });
        let saved = 'arena';
        try { saved = sessionStorage.getItem(TAB_KEY) || 'arena'; } catch (e) { /* storage blocked */ }
        showTab(saved);
        window.__ppCustomShowTab = showTab;
    }

    function setTabValue(name, text) {
        const el = document.querySelector('#customiseOverlay [data-tab-value="' + name + '"]');
        if (el && el.textContent !== text) el.textContent = text;
    }

    function init() {
        const panel = $('customisePanel');
        if (!panel) return;
        bindPowerups();
        bindTabs();
        panel.addEventListener('change', refreshSummary);
        panel.addEventListener('input', refreshSummary);
        const overlay = $('customiseOverlay');
        if (overlay) {
            new MutationObserver(refreshSummary).observe(overlay, { attributes: true, attributeFilter: ['class'] });
        }
        // Forge fills its selects after load, and refills them (no change
        // event) after the editor, an import or a reset.
        const hookForge = () => {
            const ui = window.Forge?.UI;
            if (!ui || ui.__ppSummaryHooked || typeof ui.refresh !== 'function') return;
            const refresh = ui.refresh;
            ui.refresh = function () { const r = refresh.apply(this, arguments); refreshSummary(); return r; };
            ui.__ppSummaryHooked = true;
        };
        [300, 1200, 3000].forEach((t) => setTimeout(() => { hookForge(); refreshSummary(); }, t));
        hookForge();
        refreshSummary();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
