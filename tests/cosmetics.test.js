// Ball trails and titles: what unlocks them, saving, new-unlock reporting, and the
// per-frame trail drawing (no allocation-heavy calls, a small fixed number of draw calls).
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function loadCosmetics(storage, tour = {}, daily = {}) {
    const window = { addEventListener() {}, PPTour: Object.assign({ tierCleared: () => false, totalGold: () => 0, starsOf: () => 0, totalStars: () => 0, MAX_STARS: 27, GOLD_STAGES: new Array(8) }, tour), PPDaily: Object.assign({ bestStreak: () => 0 }, daily) };
    const ctx = vm.createContext({ window, localStorage: storage, Math, Number, JSON, String, Object, Array, Set, Float32Array, performance: { now: () => 0 } });
    vm.runInContext(load('game/js/systems/cosmetics.js'), ctx);
    return window.PPCosmetics;
}

assert.equal(loadCosmetics(makeStorage()).TRAILS.length, 6);
assert.equal(loadCosmetics(makeStorage()).TITLES.length, 10);

// Nothing earned on a fresh save.
let C = loadCosmetics(makeStorage());
assert.deepEqual(Array.from(C.check()), []);
assert.equal(C.activeTrail(), ''); assert.equal(C.titleName(), '');
assert.equal(C.equip('trail', 'ember'), false, 'a locked trail cannot be equipped');
assert.equal(C.equip('title', 'nope'), false);

// Progress unlocks things; the first trail is equipped for the player; announced once.
const state = { cleared: [], stars: {}, gold: 0, streak: 0, total: 0 };
const mk = (store) => loadCosmetics(store, {
    tierCleared: (i) => state.cleared.includes(i), starsOf: (id) => state.stars[id] || 0, totalGold: () => state.gold, totalStars: () => state.total,
}, { bestStreak: () => state.streak });
const store = makeStorage();
C = mk(store);
state.stars[1] = 1; state.cleared = [0]; state.total = 4;
let fresh = Array.from(C.check(), o => `${o.kind}:${o.id}`).sort();
assert.deepEqual(fresh, ['title:clubChampion', 'title:rookieSlayer', 'trail:ember']);
assert.equal(C.activeTrail(0), '', 'a save that already had progress is not switched on behind the player\'s back');
assert.equal(C.equip('trail', 'ember'), true); assert.equal(C.activeTrail(5000), 'ember');
assert.deepEqual(Array.from(C.check()), [], 'nothing is announced twice');
assert.match(C.labelOf({ kind: 'trail', name: 'Ember Tail' }), /New ball trail: Ember Tail/);
assert.equal(C.equip('title', 'clubChampion'), true); assert.equal(C.titleName(), 'Club Champion');
// Gold, streaks, survival.
// A trail turned off on purpose stays off when another is earned.
assert.equal(C.equip('trail', ''), true);
state.gold = 3; state.streak = 7; state.stars[9] = 3; state.stars[8] = 1;
fresh = Array.from(C.check(), o => `${o.kind}:${o.id}`);
for (const id of ['trail:goldleaf', 'trail:spark', 'trail:mist', 'title:graveBane', 'title:worldBeater', 'title:dailyRegular']) assert.ok(fresh.includes(id), id);
assert.ok(!fresh.includes('title:calendarKing'));
state.streak = 14; state.total = 27; state.gold = 8;
fresh = Array.from(C.check(), o => `${o.kind}:${o.id}`).sort();
assert.deepEqual(fresh, ['title:calendarKing', 'title:goldStandard', 'title:perfectionist']);
// Every item has a name and a way to earn it.
for (const t of C.TRAILS.concat(C.TITLES)) assert.ok(t.name && t.how && typeof t.test === 'function');
assert.equal(new Set(C.TRAILS.concat(C.TITLES).map(t => t.id)).size, 16);

assert.equal(C.activeTrail(9000), '', 'off stays off after earning more trails');
C.equip('trail', 'ember');
// A new player's first trail is worn straight away (first check happened earlier, nothing chosen yet).
{ const st2 = { cleared: [], stars: { 1: 1 } }; const fs2 = makeStorage();
  const c2 = loadCosmetics(fs2, { tierCleared: (i) => st2.cleared.includes(i), starsOf: (id) => st2.stars[id] || 0 });
  c2.check(); st2.cleared = [0]; c2.check(); assert.equal(c2.activeTrail(0), 'ember', 'first trail earned after the baseline is worn'); }
// Saved choice survives a reload, and falls back when the source is reset.
C = mk(store);
assert.equal(C.titleName(), 'Club Champion'); assert.equal(C.activeTrail(), 'ember');
state.cleared = []; state.stars = {}; state.gold = 0; state.streak = 0; state.total = 0;
C = mk(store);
assert.equal(C.activeTrail(), '', 'a trail that is no longer earned is not worn'); assert.equal(C.titleName(), '');
assert.deepEqual(Array.from(C.check()), [], 'previously announced rewards stay announced');
// Junk and blocked storage.
for (const junk of ['{bad', '[]', '"x"', '{"trail":"nope","title":5,"seen":"x"}']) {
    const c = loadCosmetics(makeStorage({ 'pp-cosmetics-v1': junk })); assert.equal(c.activeTrail(), ''); assert.equal(c.titleName(), '');
}
const blocked = loadCosmetics({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } });
assert.doesNotThrow(() => { blocked.check(); blocked.equip('trail', ''); });

// ── Drawing ────────────────────────────────────────────────────────────
function mockCtx() {
    const calls = { stroke: 0, fillRect: 0, other: 0, styles: new Set() };
    const grad = { addColorStop(_p, col) { calls.styles.add(col); } };
    const c = { save() { calls.other++; }, restore() { calls.other++; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { calls.stroke++; }, fill() { calls.fillRect++; }, rect() {}, createLinearGradient() { return grad; } };
    for (const k of ['lineCap', 'lineJoin', 'globalCompositeOperation', 'lineWidth', 'fillStyle']) Object.defineProperty(c, k, { set() {}, get() { return ''; } });
    Object.defineProperty(c, 'strokeStyle', { set(v) { if (typeof v === 'string') calls.styles.add(v); }, get() { return ''; } });
    c.calls = calls; return c;
}
C = loadCosmetics(makeStorage());
const ball = C.previewBall(200, 80);
for (const t of C.TRAILS) {
    const c = mockCtx();
    C.drawTrail(c, ball, ball.x, ball.y, t.id, 1234);
    assert.equal(c.calls.stroke, 3, `${t.id} is three strokes`);
    assert.ok(c.calls.fillRect <= 1, `${t.id} accents batched into one fill`);
    for (const s of c.calls.styles) assert.match(s, /^rgba\(/, `${t.id} uses pre-built colours`);
}
// Too little trail: nothing drawn.
const c0 = mockCtx(); C.drawTrail(c0, { trailCount: 2, trailPoints: new Float32Array(4), r: 8, vel: { x: 1, y: 0 } }, 0, 0, 'ember', 0);
assert.equal(c0.calls.stroke, 0);
// Cost on this machine: far below the 0.3 ms frame budget (a mock context, so this is the JS side only).
const bc = mockCtx(); const t0 = process.hrtime.bigint();
for (let i = 0; i < 20000; i++) C.drawTrail(bc, ball, ball.x, ball.y, C.TRAILS[i % 6].id, i * 16);
const perCall = Number(process.hrtime.bigint() - t0) / 20000 / 1e6;
console.log(`drawTrail JS cost: ${(perCall * 1000).toFixed(1)} us per call`);
assert.ok(perCall < 0.1, `drawTrail JS cost ${perCall} ms`);
console.log('cosmetics.test.js passed');
