// Casual rating: Elo maths, provisional games, plausibility, bands, damaged saves.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
function load(init) {
    const m = new Map(init ? [['pp-online-rating-v1', init]] : []);
    const window = {};
    const ctx = vm.createContext({ window, localStorage: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }, Math, Number, JSON, Date, Array, Object, Infinity });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game/js/net/online-rating.js'), 'utf8'), ctx);
    return { R: window.PPRating, m };
}
let { R, m } = load();
assert.equal(R.get().rating, 1000); assert.equal(R.get().provisional, true);
assert.equal(R.expected(1000, 1000), 0.5);
let r = R.record(true, 1000);
assert.equal(r.delta, 20, 'provisional K=40, even match');
assert.equal(R.get().rating, 1020); assert.equal(R.get().streak, 1);
r = R.record(false, 1000);
assert.ok(r.delta < 0); assert.equal(R.get().streak, -1);
assert.equal(R.get().games, 2);
// beating a much stronger player pays more than beating a weaker one
const a = load().R.record(true, 1400).delta, b = load().R.record(true, 600).delta;
assert.ok(a > b && a > 30 && b < 10, `${a} ${b}`);
// untrusted opponent rating is clamped and garbage ignored
assert.ok(load().R.record(true, 1e9).delta <= 40);
assert.equal(load().R.record(true, 'abc').delta, 20);
assert.equal(load().R.record(true, NaN).delta, 20);
// after 10 games K drops to 24
for (let i = 0; i < 12; i++) R.record(true, R.get().rating);
assert.equal(R.get().provisional, false);
const before = R.get().rating; assert.equal(R.record(true, before).delta, 12);
// floor
const low = load(JSON.stringify({ rating: 105, games: 50 })).R; low.record(false, 3000); assert.equal(low.get().rating >= 100, true);
// persistence and damaged saves
assert.equal(JSON.parse(m.get('pp-online-rating-v1')).games, R.get().games);
const bad = load('{"rating":"x","games":null,"recent":[1,{"after":"y"}]}').R.get();
assert.equal(bad.rating, 1000); assert.equal(bad.games, 0);
assert.equal(load('not json').R.get().rating, 1000);
// plausibility
assert.equal(R.plausible(7, 3, 7, 60), true);
assert.equal(R.plausible(2, 7, 7, 60), true);
assert.equal(R.plausible(7, 7, 7, 60), false, 'both at target');
assert.equal(R.plausible(5, 3, 7, 60), false, 'nobody reached the target');
assert.equal(R.plausible(7, 0, 7, 5), false, 'too fast to be real');
assert.equal(R.plausible(NaN, 1, 7, 60), false);
// bands widen with waiting
assert.ok(R.band(0) < R.band(12000) && R.band(12000) < R.band(25000) && R.band(60000) === Infinity);
R.reset(); assert.equal(R.get().rating, 1000);
console.log('online rating ok');
