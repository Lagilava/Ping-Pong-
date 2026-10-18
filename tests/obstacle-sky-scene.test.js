const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let allocations = 0, invalidations = 0;
const gradient = {addColorStop() {}};
const ctx = new Proxy({}, {get: (target, key) => key.startsWith('create') ? () => gradient : () => {}});
const context = vm.createContext({
    Image: class {}, performance: {now: () => 0},
    window: {matchMedia: () => ({matches: false})},
    PerfGovernor: {isMobile: false},
    document: {createElement: () => { allocations++; return {getContext: () => ctx}; }}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/obstacle-sky-scene.js'), 'utf8') + '\nglobalThis.Scene = ObstacleSkyScene;', context);
const scene = new context.Scene(() => invalidations++);
const grid = {left: 200, right: 3600, top: 150, bottom: 2000, cols: 8, rows: 6};
scene.render(ctx, 3840, 2160, grid, 0);
assert(scene.canvas.width <= 1280 && scene.canvas.height <= 720);
const first = scene.canvas;
for (let i = 1; i < 60; i++) scene.render(ctx, 3840, 2160, grid, i / 60);
assert.equal(scene.canvas, first, 'animation must not rebuild scenery');
assert.equal(allocations, 1);
scene.art.naturalWidth = 1600; scene.art.naturalHeight = 900;
scene.art.onload();
assert.equal(invalidations, 1, 'art readiness must invalidate the outer background cache');
scene.render(ctx, 3840, 2160, grid, 1);
assert.notEqual(scene.canvas, first);
const loaded = scene.canvas;
scene.render(ctx, 3840, 2160, {...grid, left: 240}, 2);
assert.notEqual(scene.canvas, loaded, 'court layout changes must rebake aligned markings');
context.PerfGovernor.isMobile = true;
scene.render(ctx, 390, 844, grid, 3);
assert(scene.canvas.width <= 960 && scene.canvas.height <= 540);
scene.art.onerror();
scene.render(ctx, 390, 844, grid, 4);
assert(scene.canvas && !scene.ready, 'failed art retains the playable procedural scene');
console.log('Obstacle scenery cache, resolution budget and image fallback passed.');
