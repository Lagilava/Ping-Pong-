const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let now = 0;
const canvasContext = {save() {}, restore() {}, setTransform() {}, clearRect() {}};
const context = vm.createContext({
    window: {}, performance: {now: () => now},
    PerfGovernor: {isMobile: false, current: {bgFps: 60}},
    document: {createElement: () => ({getContext: () => canvasContext})}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/background-renderer.js'), 'utf8') + '\nglobalThis.Renderer = BackgroundRenderer;', context);
const renderer = Object.create(context.Renderer.prototype);
renderer.mode = 'zombie';
renderer._backgroundRenderCache = {lastRenderMs: -Infinity};
const rendered = [];
renderer._renderModeBackground = (ctx, w, h) => rendered.push([w, h]);
const output = {imageSmoothingEnabled: true, drawImage() {}};
// Even a 4K display must not allocate 4K scenery intermediates.
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.deepEqual(rendered, [[1024, 576]]);
const firstCanvas = renderer._backgroundRenderCache.canvas;
now = 16;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(rendered.length, 1, 'reuse scenery while gameplay renders the next frame');
now = 34;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(rendered.length, 2, 'moving moonlight must keep refreshing');
assert.equal(renderer._backgroundRenderCache.canvas, firstCanvas);
context.PerfGovernor.isMobile = true;
now = 35;
renderer._renderCachedBackground(output, 844, 390, false);
assert.ok(rendered.at(-1)[0] <= 768 && rendered.at(-1)[1] <= 432);
assert.ok(renderer._getBackgroundFrameMs() >= 1000 / 24);
context.PerfGovernor.current.bgFps = 15;
assert.equal(renderer._getBackgroundFrameMs(), 1000 / 15, 'respect a slower governor tier');
console.log('Zombie scenery budget and moving-cache refresh passed.');
