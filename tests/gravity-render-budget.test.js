const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let now = 0, gradients = 0, allocations = 0, blits = 0;
const canvases = [];
const ctx = {
    globalAlpha: 1, save() {}, restore() {}, setTransform() {}, clearRect() {},
    translate() {}, scale() {}, beginPath() {}, arc() {}, fill() {}, fillRect() {},
    drawImage() { blits++; },
    createRadialGradient() { gradients++; return {addColorStop() {}}; }
};
const context = vm.createContext({
    window: {game: {width: 3840, height: 2160}},
    performance: {now: () => now},
    PerfGovernor: {isMobile: false, current: {bgFps: 0}},
    Vec2: class { constructor(x, y) {this.x = x; this.y = y;} },
    areParticleEffectsEnabled: () => true,
    document: {createElement() {
        allocations++;
        const canvas = {getContext: () => ctx};
        canvases.push(canvas);
        return canvas;
    }}
});
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
vm.runInContext(read('game/js/render/background-renderer.js') + '\nglobalThis.Renderer = BackgroundRenderer;', context);
const renderer = Object.create(context.Renderer.prototype);
renderer.mode = 'gravity';
renderer._backgroundRenderCache = {lastRenderMs: -Infinity};
let paints = 0;
renderer._renderModeBackground = () => {paints++;};
renderer.renderEnhancedLighting = () => {};
const output = {imageSmoothingEnabled: true, drawImage() {}};
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(renderer._backgroundRenderCache.canvas.width, 1024);
assert.equal(renderer._backgroundRenderCache.canvas.height, 576);
now = 16;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(paints, 1, 'Ultra must reuse scenery between its 30 Hz updates');
now = 34;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(paints, 2);
const sky = renderer._ensureGravityStaticLayer(3840, 2160);
assert.equal(sky.width, 1024);
assert.equal(sky.height, 576);
const baked = gradients;
assert.equal(renderer._ensureGravityStaticLayer(3840, 2160), sky);
assert.equal(gradients, baked, 'static sky reuses gradients');
const nebula = renderer._buildGravityNebulaSprite({size: 900, hue: 220, alpha: 0.2});
assert.equal(nebula.width, 256, 'soft cloud textures have a fixed size budget');
context.PerfGovernor.isMobile = true;
assert.ok(renderer._getBackgroundRenderScale(3840, 2160) * 3840 <= 768);
assert.equal(renderer._getBackgroundFrameMs(), 1000 / 24);
context.PerfGovernor.current.bgFps = 15;
assert.equal(renderer._getBackgroundFrameMs(), 1000 / 15);
context.PerfGovernor.current.bgFps = -1;
assert.equal(renderer._getBackgroundFrameMs(), Infinity);

vm.runInContext(read('game/js/entities/gravity-well.js') + '\nglobalThis.Well = GravityWell;', context);
const wells = Array.from({length: 5}, (_, i) => new context.Well(600 + i * 400, 900));
const before = allocations;
wells[0].render(ctx, 0);
assert.equal(allocations - before, 3, 'first well bakes three shared maps');
for (const well of wells) {well.flare(); well.render(ctx, 0);}
assert.equal(allocations - before, 4, 'all five wells share four maps including the burst');
assert.ok(canvases.slice(-4).every(c => c.width === 256 && c.height === 256));
const warmGradients = gradients, warmAllocations = allocations;
blits = 0;
for (let frame = 0; frame < 120; frame++) {
    for (const well of wells) well.render(ctx, frame / 60);
}
assert.equal(gradients, warmGradients, 'warm frames create no radial gradients');
assert.equal(allocations, warmAllocations, 'warm frames allocate no textures');
assert.equal(blits, 120 * 5 * 4, 'each excited well draws four cached maps');
console.log('Gravity scenery budgets and shared well texture reuse passed.');
