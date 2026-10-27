const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = vm.createContext({ window: { devicePixelRatio: 1 },
    PerfGovernor: { isMobile: false, renderScale: 1, current: { name: 'high', bgFps: 60 } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/render-resolution.js'), 'utf8'), sandbox);
const resolution = sandbox.window.PPResolution;
for (const mode of ['classic', 'speed', 'gravity', 'zombie', 'obstacle', 'customise']) {
    sandbox.window.game = { gameMode: mode };
    assert.equal(resolution.scale(3840, 2160), 1, mode + ' permits native 4K');
    sandbox.PerfGovernor.renderScale = 2;
    assert.equal(resolution.scale(1920, 1080), 2, mode + ' permits 4K on a high-DPI desktop');
    assert.equal(resolution.scale(7680, 4320), .5, 'larger screens retain a bounded 4K scenery surface');
    sandbox.PerfGovernor.renderScale = 1;
}
sandbox.PerfGovernor.current = { name: 'medium', bgFps: 45 };
assert.equal(resolution.scale(3840, 2160) * 3840, 2560);
sandbox.PerfGovernor.current = { name: 'low', bgFps: -1 };
assert.equal(resolution.scale(3840, 2160) * 3840, 1280, 'animation off retains the selected quality budget');
sandbox.PerfGovernor.isMobile = true;
assert.ok(resolution.scale(844, 390, 768, 432) * 844 <= 768);
assert.equal(resolution.detail(), 1);
assert.equal(resolution.spriteLimit(), 384);
console.log('4K, high-DPI, 8K ceiling, quality tiers and mobile scenery budgets passed.');
