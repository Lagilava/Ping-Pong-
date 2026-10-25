const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../game/js/render/speed-art.js'), 'utf8');
function setup() {
    let gradients = 0;
    const images = [], canvases = [], draws = [];
    const makeContext = () => new Proxy({
        globalAlpha: 1,
        getTransform: () => ({a: 2, b: 0, c: 0, d: 2}),
        createLinearGradient() {gradients++; return {addColorStop() {}};},
        createRadialGradient() {gradients++; return {addColorStop() {}};},
        drawImage(...args) {draws.push(args);}
    }, {get: (obj, key) => key in obj ? obj[key] : () => {}});
    const context = vm.createContext({
        URL, Promise, window: {game: {gameMode: 'speed'}},
        PerfGovernor: {isMobile: false},
        Image: class {constructor() {images.push(this);}},
        document: {
            currentScript: {src: 'https://example.test/Ping-Pong-/game/js/render/speed-art.js'},
            createElement() {
                const c = {getContext: makeContext}; canvases.push(c); return c;
            }
        }
    });
    vm.runInContext(source, context);
    return {context, images, canvases, draws, makeContext, gradients: () => gradients};
}
async function main() {
    const s = setup(), art = new s.context.window.SpeedArt(), ctx = s.makeContext();
    let invalidations = 0;
    s.context.window.game.bgRenderer = {_invalidateBackgroundRenderCache() {invalidations++;}};
    const state = {dt: 1/30, rush: 1.1, hot: .3, pulse: .5, lean: .4, slow: 1};
    art.draw(ctx, 3840, 2160, state);
    assert.equal(art.generated, false, 'render immediately while images load');
    assert.equal(s.images.length, 2);
    assert.equal(s.images[0].src, 'https://example.test/Ping-Pong-/game/assets/speed/speed-scene.webp');
    for (const [i, image] of s.images.entries()) {
        image.naturalWidth = i ? 1254 : 1672;
        image.naturalHeight = i ? 1254 : 941;
        image.onload();
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(invalidations, 1, 'static-background caches refresh when artwork arrives');
    art.draw(ctx, 3840, 2160, state);
    assert.equal(art.generated, true);
    assert.equal(art.base.width, 1024);
    assert.equal(art.base.height, 576);
    assert.equal(art.hy, Math.round(2160 * .48));
    assert.equal(art.sun, null, 'baked sunset replaces procedural scenery');
    assert.equal(art.sprites.carA, art.sprites.carB, 'traffic shares one decoded sprite');
    for (const sprite of Object.values(art.sprites)) {
        assert.ok(sprite.c.width <= 384 && sprite.c.height <= 384);
    }
    const n = s.canvases.length, gradients = s.gradients(), phase = art.phase;
    s.draws.length = 0;
    for (let frame = 0; frame < 120; frame++) art.draw(ctx, 3840, 2160, state);
    assert.equal(s.canvases.length, n, 'no warm-frame texture allocations');
    assert.equal(s.gradients(), gradients, 'no warm-frame gradients');
    assert.equal(s.images.length, 2, 'no repeated image requests');
    assert.notEqual(art.phase, phase, 'road and props continue moving');
    // Contact shadows and tail-light spill add at most one draw per prop
    // and three per car, still without warm-frame allocations or gradients.
    assert.ok(s.draws.length < 120 * 45, 'bounded image draws including road contact and light spill');
    const held = art.phase;
    art.draw(ctx, 3840, 2160, {...state, slow: 0});
    assert.equal(art.phase, held, 'speed ability freezes scenery consistently');
    s.context.PerfGovernor.isMobile = true;
    art.draw(ctx, 844, 390, state);
    assert.ok(art.base.width <= 768 && art.base.height <= 432);
    const another = new s.context.window.SpeedArt();
    another.draw(ctx, 1280, 720, state);
    assert.equal(s.images.length, 2, 'new matches reuse decoded artwork');
    s.context.window.game.gameMode = 'customise';
    another.draw(ctx, 1280, 720, state);
    assert.equal(another.generated, false, 'custom palette retains its existing look');

    const fail = setup(), fallback = new fail.context.window.SpeedArt(), fctx = fail.makeContext();
    fallback.draw(fctx, 1280, 720, state);
    fail.images[0].onerror(new Error('offline'));
    await new Promise(resolve => setImmediate(resolve));
    for (let i = 0; i < 10; i++) fallback.draw(fctx, 1280, 720, state);
    assert.equal(fallback.generated, false);
    assert.equal(fail.images.length, 2, 'failure does not retry every frame');
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/background-renderer.js'), 'utf8') + '\nglobalThis.Renderer = BackgroundRenderer;', s.context);
    const renderer = Object.create(s.context.Renderer.prototype);
    renderer.mode = 'speed';
    s.context.PerfGovernor.isMobile = false;
    s.context.PerfGovernor.current = {bgFps: 0};
    assert.equal(renderer._getBackgroundRenderScale(3840, 2160) * 3840, 1024);
    assert.equal(renderer._getBackgroundFrameMs(), 1000 / 30, 'Ultra keeps a separate scenery budget');
    s.context.PerfGovernor.isMobile = true;
    assert.equal(renderer._getBackgroundFrameMs(), 1000 / 24);
    s.context.PerfGovernor.current.bgFps = 15;
    assert.equal(renderer._getBackgroundFrameMs(), 1000 / 15);
    s.context.PerfGovernor.current.bgFps = -1;
    assert.equal(renderer._getBackgroundFrameMs(), Infinity);
    console.log('Speed artwork loading, fallback, animation and texture budgets passed.');
}
main().catch(err => {console.error(err); process.exitCode = 1;});

