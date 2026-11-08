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
test('every rival has distinct openings, rematches and appropriate outcomes', () => {
  assert.equal(D.ids.length, 8);
  const events = ['intro','rematch','afterLoss','end_win','end_loss'];
  for (const id of D.ids) {
    for (const key of events) {
      const lines = Array.from(D.pool(id, key));
      assert.equal(lines.length, 6, `${id} ${key}`);
      assert.equal(new Set(lines).size, lines.length, `${id} ${key}`);
      for (const line of lines) assert.ok(line.length < 200 && !line.includes('{'), `${id}: ${line}`);
    }
    assert.equal(D.pool(id, 'intro_wall'), D.pool(id, 'intro'));
    assert.equal(D.pool(id, 'end_win_feint'), D.pool(id, 'end_win'));
    assert.equal(D.pool(id, 'end_loss_spin'), D.pool(id, 'end_loss'));
    const allKeys = [...keys, 'powerup_player', 'power_shot', 'rally_first_spin', 'flavour'];
    const all = allKeys.flatMap(key => Array.from(D.pool(id, key)));
    assert.ok(new Set(all).size >= 500, `${id} gameplay variety`);
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

test('match screens choose greetings and outcomes using the player perspective', () => {
  let stars = 0, losses = 0, current;
  const stage = { id: 1, tier: 0, rival: 'pip', points: 5, mode: 'classic', goals: [] };
  const window = {
    PPTourDialogue: D,
    PPRivals: {get: () => ({ id:'pip', name:'Pip', accent:'#fff', home:'Hall', meet:['old'], youWin:['old'], youLose:['old'] }),
      pick: pool => pool[0], portrait: () => '', story: () => ''},
    PPTour: { lossesOf: () => losses, starsOf: () => stars, totalStars: () => stars,
      MAX_STARS: 24, TIERS: [{name:'Club'}], STAGES: [stage] },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({matches:false})
  };
  const document = { body: { classList: {contains: () => false}, appendChild: el => { current = el; } },
    createElement: () => ({ style:{setProperty(){}}, classList:{add(){}}, setAttribute(){}, addEventListener(){}, querySelector(){return null}, remove(){} }) };
  const context = vm.createContext({window, document, performance:{now:()=>0}, requestAnimationFrame:()=>0,
    cancelAnimationFrame(){}, setTimeout:()=>0, clearTimeout(){}, navigator:{}, Math});
  vm.runInContext(load('game/js/systems/tour-stage.js'), context);
  const show = () => { window.PPTourStage.versus(stage, () => {}); return current.innerHTML; };
  const html = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  assert.ok(show().includes(html(D.pool('pip','intro')[0])));
  losses = 1;
  assert.ok(show().includes(html(D.pool('pip','rematch')[0])), 'player loss is not rival loss');
  stars = 1;
  assert.ok(show().includes(html(D.pool('pip','rematch')[1])), 'mixed history stays neutral and does not immediately repeat');
  losses = 0;
  assert.ok(show().includes(html(D.pool('pip','afterLoss')[0])), 'player win is rival loss');
  window.PPTourStage.outro({stage, won:true, earned:0, goals:[]}, {player:5, ai:2}, () => {});
  assert.ok(current.innerHTML.includes(html(D.pool('pip','end_loss')[0])));
  window.PPTourStage.outro({stage, won:false}, {player:2, ai:5}, () => {});
  assert.ok(current.innerHTML.includes(html(D.pool('pip','end_win')[0])));
});
