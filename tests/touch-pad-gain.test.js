// Touch steering: a slide the height of the thumb pad crosses the court,
// the target never winds up past the walls, and mouse stays absolute.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const window = { innerHeight: 390, PPTouchPad: { travelPx: () => 160 } };
const context = vm.createContext({ window, Math });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/core/game.js'), 'utf8'), context);
const game = Object.create(context.window.Game.prototype);
game.height = 390;
game.getCanvasPoint = (x, y) => ({ x, y });
game.player = { h: 70, pos: { y: 160 } };
const gain = game.getTouchDragGain(game.player, 700);
assert.ok(Math.abs(gain - 320 / 160) < 1e-9, 'gain = court range / pad travel');
game.player.pointerTargetY = 195;
game.touchDrag = { player: { lastY: 300, gain } };
game.updatePointerControlledPaddle('player', 300 - 80);
assert.equal(game.player.pointerTargetY, 35, 'half a pad up reaches the top wall');
game.updatePointerControlledPaddle('player', 300 - 200);
assert.equal(game.player.pointerTargetY, 35, 'clamped at the wall');
game.updatePointerControlledPaddle('player', 300 - 190);
assert.equal(game.player.pointerTargetY, 55, 'reverses at once, no wound-up dead zone');
game.updatePointerControlledPaddle('player', 300 - 190 + 160);
assert.equal(game.player.pointerTargetY, 355, 'one pad of travel crosses the court');
// A huge pad never makes the paddle slower than the finger.
window.PPTouchPad.travelPx = () => 2000;
assert.equal(game.getTouchDragGain(game.player, 700), 1);
// Mouse: no drag state, the paddle centres on the pointer.
game.touchDrag.player = null;
game.updatePointerControlledPaddle('player', 120);
assert.equal(game.player.pointerTargetY, 120);
console.log('Touch pad gain: full-court slide, wall clamp, instant reversal, min gain 1, mouse absolute passed.');
