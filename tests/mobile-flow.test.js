const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Run the real immersive entry wiring: settings/card taps must not reclaim
// fullscreen, and a deliberate match-start tap must still request it.
const listeners = {};
let requests = 0;
const root = { classList: { contains: () => true, toggle() {} }, requestFullscreen() {
    requests++; return Promise.resolve();
} };
const context = vm.createContext({ window: {}, document: {
    documentElement: root, fullscreenElement: null,
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; }
}, navigator: { userAgent: 'Android' }, screen: {}, matchMedia() { return { matches: false }; } });
vm.runInContext(read('game/js/app/bootstrap.js').split('(function init()')[0], context);
assert.equal(listeners.pointerup, undefined, 'ordinary taps must not force immersive mode');
listeners.click({ target: { closest: () => null } });
assert.equal(requests, 0, 'browsing leaves fullscreen alone');
listeners.click({ target: { closest: selector => selector.includes('#btnGo') ? ({ id: 'btnGo' }) : null } });
assert.equal(requests, 0, 'the first Start tap leaves room for the guide');
listeners.click({ target: { closest: selector => selector.includes('#customStartMatchBtn') ? ({ id: 'customStartMatchBtn' }) : null } });
assert.equal(requests, 1, 'Custom match launch requests fullscreen');

// Exercise the actual frame gate before its expensive animation/render body.
// Test high refresh rates and small timestamp jitter, which can accidentally
// double-render if a near-deadline timestamp is rounded backwards.
const menu = read('game/js/menu/menu.js');
const start = menu.indexOf('let menuLastFrameMs = 0;');
const end = menu.indexOf('const delta = clock.getDelta();', start);
const gate = menu.slice(start, end) + 'rendered++; }';
for (const hz of [60, 90, 120]) {
    const state = vm.createContext({ MENU_MOBILE: true, rendered: 0,
        performance: { now: () => 0 }, requestAnimationFrame() {},
        document: { hidden: false, querySelector: () => null, body: { classList: { contains: () => false } } },
        menuOverlayEl: { classList: { contains: () => false } }, menuCustomOverlayEl: null,
        menuCoverCheck: 0, menuCovered: false, clock: { getDelta() {} } });
    vm.runInContext(gate, state);
    for (let i = 1; i <= hz * 2; i++) vm.runInContext(`animateMenu(${i * 1000 / hz + (i % 2 ? .12 : -.12)})`, state);
    assert.ok(state.rendered >= 55 && state.rendered <= 61, `${hz}Hz: ${state.rendered} scenery frames in 2s`);
    state.document.body.classList.contains = () => true;
    for (let i = 1; i <= 10; i++) vm.runInContext(`animateMenu(${2100 + i * 20})`, state);
    const covered = state.rendered;
    for (let i = 1; i <= 30; i++) vm.runInContext(`animateMenu(${2400 + i * 20})`, state);
    assert.equal(state.rendered, covered, 'opaque panels stop menu render work');
    state.document.body.classList.contains = () => false;
    state.document.querySelector = () => ({});
    for (let i = 1; i <= 30; i++) vm.runInContext(`animateMenu(${3100 + i * 20})`, state);
    assert.equal(state.rendered, covered, 'guide stops menu render work');
    state.document.hidden = true;
    vm.runInContext('animateMenu(4000)', state);
    assert.equal(state.rendered, covered, 'hidden page does no menu work');
}
console.log('Mobile immersive entry and 60/90/120Hz menu frame budgets passed.');
