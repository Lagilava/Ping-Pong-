const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/background-renderer.js'), 'utf8') + '\nglobalThis.Renderer = BackgroundRenderer;', context);
const renderer = Object.create(context.Renderer.prototype);
renderer._zombieRayCanvas = {};
function anglesAt(time) {
    renderer.time = time;
    const angles = [];
    renderer._drawZombieMoonRays({
        globalAlpha: 1, save() {}, restore() {}, translate() {},
        rotate(angle) { angles.push(angle); }, drawImage() {}
    }, 1280, 720);
    return angles;
}
// Verify visible displacement at the ground within two seconds, including
// phases near an individual shaft's turning point. No real-time sleeps.
for (let t = 0; t < 30; t += 0.5) {
    const before = anglesAt(t), after = anglesAt(t + 2);
    const shifts = before.map((angle, i) => Math.abs(Math.tan(after[i]) - Math.tan(angle)) * 500);
    assert.ok(Math.max(...shifts) > 35, `sweep is barely visible at t=${t}`);
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(anglesAt(t + 1 / 60)[i] - before[i]) < 0.003, 'motion must remain gradual');
    }
}
console.log('Moonbeam motion passed.');
