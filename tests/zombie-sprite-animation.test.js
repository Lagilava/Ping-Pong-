const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/modes/zombie-sprites.js'), 'utf8'), context);
const sprites = Object.create(context.window.ZombieSprites.prototype);
for (const typeKey of ['shambler', 'runner', 'tank', 'spitter']) {
    const zombie = { typeKey, spitTimer: 3, anim: { attackPulse: 0 } };
    const frames = new Set();
    for (let tick = 0; tick < 20; tick++) {
        zombie.frameT = tick;
        frames.add(sprites._generatedFrame(zombie));
    }
    assert.deepEqual([...frames].sort(), [0, 1, 2, 3], `${typeKey} needs the complete walk cycle`);
}
const spitter = { typeKey: 'spitter', frameT: 6, spitTimer: 3, anim: { attackPulse: 1 } };
assert.ok(sprites._generatedFrame(spitter) < 4, 'proximity alone must not depict a spit attack');
spitter.spitTimer = 0.6;
assert.equal(sprites._generatedFrame(spitter), 4, 'inflate only as the actual attack approaches');
spitter.spitTimer = 4.5;
spitter.spitAnim = 0.22;
assert.equal(sprites._generatedFrame(spitter), 5, 'the emission marker owns the release frame');
spitter.spitAnim = 0;
assert.ok(sprites._generatedFrame(spitter) < 4, 'return to locomotion after release');
console.log('Zombie sprite animation passed.');
