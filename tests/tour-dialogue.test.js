const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ window: {}, document: {}, Math, Date, setTimeout, clearTimeout });
vm.runInContext(load('game/js/systems/tour-dialogue.js'), ctx);
vm.runInContext(load('game/js/systems/tour-rivals.js'), ctx);
vm.runInContext(load('game/js/ai/ai-opponent.js'), ctx);
const D = ctx.window.PPTourDialogue;
const keys = ['intro','ai_point','player_point','match_point_ai','match_point_player','rally_long','lead_big','trail_big','end_win','end_loss'];
test('eight rivals each have 500 distinct event-appropriate combinations', () => {
  assert.equal(D.ids.length, 8);
  for (const id of D.ids) {
    const lines = keys.flatMap(key => Array.from(D.pool(id, key)));
    assert.equal(lines.length, 500, id);
    assert.equal(new Set(lines).size, 500, id);
    for (const line of lines) assert.ok(line.length < 200 && !line.includes('{'), `${id}: ${line}`);
  }
});
test('situational events map to a suitable outcome or a neutral observation', () => {
  assert.equal(D.category('miss_feint'), 'ai_point');
  assert.equal(D.category('hit_spin'), 'player_point');
  assert.equal(D.category('end_loss_spin'), 'end_loss');
  assert.equal(D.category('end_win_feint'), 'end_win');
  assert.equal(D.category('rally_first_spin'), 'rally_first_spin');
  assert.equal(D.category('powerup_player'), 'powerup_player');
  assert.equal(D.pool('not-a-rival', 'intro'), null);
});
test('Tour AI uses rival dialogue exclusively; normal AI keeps its default pool', () => {
  const ball = { pos: {x:0,y:0}, vel:{x:0,y:0} };
  const ai = new ctx.window.AIController({pos:{y:0}, h:10}, ball, 800, 600, 2);
  ai.game = {gameMode:'classic', getTourContext: () => ({ rival: 'juno' })};
  const tour = ai.poolFor('miss_feint');
  assert.equal(tour, D.pool('juno', 'miss_feint'));
  assert.ok(Array.from(tour).every(x => D.pool('juno','ai_point').includes(x)));
  ai.game = {gameMode:'classic', getTourContext: () => null};
  assert.ok(ai.poolFor('ai_point').length > 0);
  assert.notEqual(ai.poolFor('ai_point'), D.pool('juno','ai_point'));
});
