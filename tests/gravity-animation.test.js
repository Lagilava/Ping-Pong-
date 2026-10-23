const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {}, Math };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../game/js/modes/gravity-wormhole.js'), 'utf8'), context);
const well = x => ({ pos: {x, y: 300}, radius: 38, active: true });
const from = well(250), to = well(650);
const ball = {pos: {x: 270, y: 300}, warpCharge: 0};
const game = {gameMode: 'gravity', width: 1000, height: 600, ball, gravityWells: [from, to]};
const effect = new context.window.GravityWormhole(game);
let depth = 0, strokes = 0, calls = 0;
const ctx = new Proxy({globalAlpha: 1}, {
    get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
            calls++;
            for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), key + ' must stay finite');
            if (key === 'save') depth++;
            if (key === 'restore') depth--;
            assert.ok(depth >= 0);
            if (key === 'stroke') strokes++;
            assert.ok(!['createRadialGradient', 'createLinearGradient', 'drawImage'].includes(key), 'VFX require no textures or live gradients');
        };
    },
    set(target, key, value) {
        if (key === 'shadowBlur') assert.equal(value, 0, 'no live blur');
        target[key] = value; return true;
    }
});
for (const motion of [true, false]) {
    for (let frame = 0; frame < 120; frame++) {
        strokes = 0; calls = 0;
        const t = frame / 120;
        effect.warp = t < 0.32 ? {from, to, side: 'player', spin: 1, t} : null;
        effect.flashes = t >= 0.32 && t < 0.82 ? [{x: 650, y: 300, r: 38, dx: 1, dy: 0, t: 0.82 - t}] : [];
        effect.render(ctx, motion, ['player']);
        assert.equal(depth, 0, 'canvas state restored');
        assert.ok(strokes <= 12, 'bounded stroke budget');
        assert.ok(calls < 160, 'bounded geometry budget');
    }
}
assert.equal(effect.flashes.length, 0, 'exit effects expire');
console.log('Gravity animation lifecycle and render budget passed.');
