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

// Whole-hand poses must be reused across hands and sizes. Once warm, drawing a
// hand must not invoke the expensive articulated painter or allocate textures.
let paintedPoses = 0;
const spriteContext = {translate() {}, scale() {}};
context.document.createElement = () => ({getContext: () => spriteContext});
renderer.time = 0;
renderer._paintZombieHandPose = () => { paintedPoses++; };
const hand = {poseSeq: 0, poseBlend: 0, poseOffset: 0, twitch: 1, splayAmp: 0.1};
const firstPose = renderer._getZombieHandSprite(hand);
assert.equal(renderer._getZombieHandSprite({...hand, scale: 0.7, poseOffset: 5}), firstPose,
    'different hands share a pose texture');
for (let cycle = 0; cycle < 3; cycle++) {
    for (let seq = 0; seq < 10; seq++) {
        for (let frame = 0; frame < 4; frame++) {
            renderer._getZombieHandSprite({...hand, poseSeq: seq, poseBlend: frame / 4});
        }
    }
}
assert.equal(paintedPoses, 40, 'the complete cycle allocates at most 40 textures');
assert.equal(renderer._zombieHandSprites.size, 40);
assert.equal(firstPose.width * firstPose.height * 4 * 40, 4587520,
    'bound total RGBA hand texture memory independently of screen resolution');
let blits = 0;
renderer._getZombieHandState = () => ({x: 10, y: 20, rot: 3, scale: 0.5, emerge: 0.6});
renderer._renderZombieHand({save() {}, restore() {}, translate() {}, rotate() {},
    drawImage() { blits++; }}, hand, 3840, 2160, 1944);
assert.equal(blits, 1, 'a warm hand draws as one sprite');
assert.equal(paintedPoses, 40, 'a warm frame does not repaint articulated geometry');
renderer._cleanupZombieCache();
assert.equal(renderer._zombieHandSprites, null, 'release hand textures on mode cleanup');
