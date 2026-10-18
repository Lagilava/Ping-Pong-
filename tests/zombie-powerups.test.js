const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({window: {}, Math});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/core/game.js'), 'utf8'), context);
const game = Object.create(context.window.Game.prototype);
game.zombieState = game.createZombieModeState();
game.showNotification = () => {};
game.syncZombieHUD = () => {};
game.popText = () => {};
let used = 0;
game.progression = {recordPowerUpUsed() { used++; }};
assert.equal(game.getZombiePickupTypes().includes('life'), false, 'full health excludes life drops');
game.zombieState.hearts = 3;
assert.equal(game.getZombiePickupTypes().includes('life'), true, 'wounded players can find life drops');
game.applyZombiePickup('life');
assert.equal(game.zombieState.hearts, 4, 'extra life restores exactly one life');
game.applyZombiePickup('repair');
assert.equal(game.zombieState.hearts, 5, 'legacy repair rewards still work');
game.applyZombiePickup('life');
assert.equal(game.zombieState.hearts, 5, 'health never exceeds the run cap');
game.applyZombiePickup('rage');
game.applyZombiePickup('slow');
for (let i = 0; i < 4; i++) game.applyZombiePickup('shield');
assert.equal(game.zombieState.powerups.rage, 8);
assert.equal(game.zombieState.powerups.slow, 7);
assert.equal(game.zombieState.shieldCharges, 3, 'shield cap remains intact');

game.width = 1000; game.height = 600;
game.zombieState.hearts = 3;
game.spawnZombiePickup('life');
const pickup = game.zombieState.pickups[0];
assert.equal(pickup.life, 12);
assert.ok(pickup.color && pickup.r > 0);
game.ball = {pos: {x: pickup.x, y: pickup.y}, r: 9};
game.updateZombiePickups(0.016);
assert.equal(game.zombieState.hearts, 4, 'ball contact actually collects a life');
assert.equal(game.zombieState.pickups.length, 0, 'collected life disappears immediately');
assert.equal(game.zombieState.pickupBursts.length, 1, 'collection starts one animation');
const recorded = used;
game.updateZombiePickups(0.016);
assert.equal(used, recorded, 'collection cannot apply twice');
game.spawnZombiePickup('shield');
game.zombieState.pickups[0].life = 0.001;
game.ball.pos.x = -100;
game.updateZombiePickups(0.016);
assert.equal(game.zombieState.pickups.length, 0, 'expired pickups are removed');

// Drawing must work before the image loads and with reduced motion enabled.
context.Image = class {complete = false; naturalWidth = 0;};
context.window.PPSettings = {get: () => true};
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/modes/zombie-powerups.js'), 'utf8'), context);
let fallbacks = 0;
const ctx = new Proxy({fillText() { fallbacks++; }}, {get(target, key) { return key in target ? target[key] : () => {}; }});
context.window.ZombiePowerups.draw(ctx, {...pickup, life: 11});
assert.equal(fallbacks, 1, 'life remains visible if generated art is unavailable');
context.window.ZombiePowerups.burst(ctx, game.zombieState.pickupBursts[0], null);
console.log('Zombie life drops, collision, caps, expiry and rendering fallback passed.');

// Both game and system reduced-motion preferences must preserve collectible
// feedback, without changing the global preference or the pickup hitbox.
context.window.matchMedia = () => ({matches: true});
const scales = [], icons = [];
const animated = new Proxy({
    scale(x, y) { scales.push([x, y]); },
    fillText(text, x, y) { icons.push([text, x, y]); }
}, {get(target, key) { return key in target ? target[key] : () => {}; }});
const spawning = {...pickup, life: 11.9, pulse: 1};
const originalRadius = spawning.r;
context.window.ZombiePowerups.draw(animated, spawning);
assert.ok(scales[0][0] > 0 && scales[0][0] < 1, 'spawn scales in despite reduced motion');
assert.notEqual(icons[0][2], 0, 'hover remains animated despite reduced motion');
assert.equal(spawning.r, originalRadius, 'animation preserves collision radius');
const count = icons.length;
context.window.ZombiePowerups.burst(animated,
    {...game.zombieState.pickupBursts[0], age: 0.3},
    {pos: {x: 30, y: 100}, w: 16, h: 80});
assert.equal(icons.length, count + 1, 'collection flight remains visible despite reduced motion');
assert.equal(context.window.PPSettings.get('reduceMotion'), true, 'global setting remains enabled');
