const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Particles { spawnSparkle() {} spawnGodTierHit() {} }
const context = vm.createContext({ window: { PPSettings: { get: () => false } }, ParticleSystem: Particles, Date, Math });
for (const file of ['game/js/core/vec2.js', 'game/js/entities/paddle.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const { Paddle, Vec2 } = vm.runInContext('({Paddle, Vec2})', context);
let sounds = 0;
const game = {
    player: new Paddle(30, 100, 16, 100), aiPaddle: new Paddle(950, 100, 16, 100),
    width: 1000, height: 600, screenShake: 0, gameMode: 'classic',
    audio: { laser() { sounds++; } }
};
const p = game.player;
assert.equal(p.fireLaser(game), false);
p.activateLaser(3);
assert.equal(p.fireLaser(game), true);
assert.equal(p.laserCharges, 2);
assert.equal(p.lasers[0].vel.x, 1200);
assert.equal(p.lasers[0].width, 14, 'visual upgrade must preserve the hitbox');
assert.equal(p.fireLaser(game), false, 'cooldown prevents duplicate shots');
assert.equal(sounds, 1);
for (let i = 0; i < 2; i++) {
    p.updateLasers(0.21, game);
    assert.equal(p.fireLaser(game), true);
}
assert.equal(p.laserCharges, 0);
assert.equal(p.fireLaser(game), false);
assert.equal(sounds, 3);
// Both sides retain correct direction and opponent collision/stun behavior.
game.aiPaddle.activateLaser();
assert.equal(game.aiPaddle.fireLaser(game), true);
assert.equal(game.aiPaddle.lasers[0].vel.x, -1200);
p.activateLaser();p.laserCooldown = 0;p.fireLaser(game);
const shot = p.lasers.at(-1);
shot.pos.set(game.aiPaddle.pos.x + 4, game.aiPaddle.pos.y + 30);
p.updateLasers(0, game);
assert.equal(game.aiPaddle.laserStunned, true);
assert.equal(game.aiPaddle.laserStunTime, 1);
p.deactivateLaser();
assert.equal(p.lasers.length, 0);
assert.equal(p.hasLaser, false);
// A loaded power-up owns the shared gamepad action; when empty, the arena
// ability receives it again. Exercise the actual input polling method.
const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
context.navigator = { getGamepads: () => [pad] };
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/core/game.js'), 'utf8'), context);
const input = Object.create(context.window.Game.prototype);
let abilities = 0;
Object.assign(input, { player: p, aiPaddle: game.aiPaddle, keys: {}, modeAbilities: { trigger() { abilities++; return true; } } });
p.activateLaser();
pad.buttons[0].pressed = true;
input.pollGamepads();
assert.equal(input.keys[' '], true);
assert.equal(abilities, 0);
pad.buttons[0].pressed = false;
input.pollGamepads();
input.keys = {};
p.laserCharges = 0;
pad.buttons[0].pressed = true;
input.pollGamepads();
assert.equal(input.keys[' '], undefined);
assert.equal(abilities, 1);
console.log('Laser power-up behavior passed.');
