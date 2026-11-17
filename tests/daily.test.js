// The Daily Match: seeded setup, score, streak rules, saving, and that a Daily
// result never touches the Tour's own save or the player's settings.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function loadAll(storage) {
    const window = { addEventListener() {}, dispatchEvent() {} };
    const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
    const ctx = vm.createContext({ window, document, localStorage: storage, Math, Number, JSON, String, Object, Array, Date, Set, Map, Intl, CustomEvent: function () {} });
    vm.runInContext(load('game/js/systems/tour.js'), ctx);
    vm.runInContext(load('game/js/systems/daily.js'), ctx);
    return { T: window.PPTour, D: window.PPDaily };
}
const at = (iso) => () => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); };

// ── Same date, same setup ──────────────────────────────────────────────
let { T, D } = loadAll(makeStorage());
const a = D.setupFor('2026-11-17'), b = D.setupFor('2026-11-17');
assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
assert.notDeepEqual(JSON.parse(JSON.stringify(D.setupFor('2026-11-18'))), JSON.parse(JSON.stringify(a)));

// 400 consecutive dates: every setup is valid and every mode, twist and rival shows up.
const modes = new Set(), twists = new Set(), rivals = new Set();
let start = D.dayNum('2026-01-01');
for (let i = 0; i < 400; i++) {
    const d = new Date((start + i) * 86400000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const s = D.setupFor(key);
    assert.ok(D.MODES.includes(s.mode));
    assert.ok(['sniper', 'trickster', 'wall', 'bully'].includes(s.style));
    assert.ok(s.level >= 1 && s.level <= 3);
    assert.ok([7, 11].includes(s.points));
    assert.ok(s.goal.text.length > 0 && s.goal.n > 0);
    modes.add(s.mode); twists.add(String(s.twist)); rivals.add(s.rival);
}
assert.equal(modes.size, 4, 'every mode comes up');
assert.equal(twists.size, 4, 'every twist, and no twist, comes up');
assert.equal(rivals.size, 8, 'every rival comes up');

// Weekday sets the skill: 2026-11-16 is a Monday.
assert.equal(D.weekday('2026-11-16'), 1);
assert.equal(D.setupFor('2026-11-16').level, 1);
assert.equal(D.setupFor('2026-11-18').level, 2);
assert.equal(D.setupFor('2026-11-21').level, 3);
assert.equal(D.setupFor('2026-11-22').level, 3);
assert.equal(D.setupFor('2026-11-21').points, 11);

// ── Score ──────────────────────────────────────────────────────────────
assert.equal(D.scoreOf({ won: false, playerScore: 3, aiScore: 7, rally: 20 }, false).total, 0);
assert.equal(D.scoreOf({ won: true, playerScore: 7, aiScore: 4, rally: 5 }, false).total, 1000 + 300 + 100);
assert.equal(D.scoreOf({ won: true, playerScore: 7, aiScore: 4, rally: 5 }, true).total, 1000 + 300 + 100 + 300);

// ── Streak rules (pure) ────────────────────────────────────────────────
const fresh = () => ({ streak: 0, bestStreak: 0, lastDay: '', freezes: 0 });
let s = fresh();
D.advance(s, '2026-02-27'); assert.equal(s.streak, 1);
D.advance(s, '2026-02-27'); assert.equal(s.streak, 1, 'a second attempt the same day changes nothing');
D.advance(s, '2026-02-28'); D.advance(s, '2026-03-01'); assert.equal(s.streak, 3, 'across a month end');
D.advance(s, '2026-03-05'); assert.equal(s.streak, 1, 'a gap of days starts again');
assert.equal(s.bestStreak, 3);
s = fresh(); D.advance(s, '2026-12-30'); D.advance(s, '2026-12-31'); D.advance(s, '2027-01-01'); assert.equal(s.streak, 3, 'across a year end');
// Daylight-saving weekend: still consecutive days.
s = fresh(); D.advance(s, '2026-03-28'); D.advance(s, '2026-03-29'); D.advance(s, '2026-03-30'); assert.equal(s.streak, 3);
// Clock moved back: ignored.
s = fresh(); D.advance(s, '2026-05-10'); D.advance(s, '2026-05-11'); D.advance(s, '2026-05-02'); assert.equal(s.streak, 2); assert.equal(s.lastDay, '2026-05-11');
// A freeze is earned at 7 days and covers exactly one missed day.
s = fresh();
for (let i = 1; i <= 7; i++) D.advance(s, `2026-06-${String(i).padStart(2, '0')}`);
assert.equal(s.streak, 7); assert.equal(s.freezes, 1);
const r = D.advance(s, '2026-06-09');
assert.equal(r.usedFreeze, true); assert.equal(s.streak, 8); assert.equal(s.freezes, 0);
D.advance(s, '2026-06-11'); assert.equal(s.streak, 1, 'no freeze left: a missed day resets');
// What the player sees today.
s = { streak: 5, bestStreak: 5, lastDay: '2026-06-10', freezes: 0 };
assert.equal(D.liveStreak(s, '2026-06-10'), 5);
assert.equal(D.liveStreak(s, '2026-06-11'), 5);
assert.equal(D.liveStreak(s, '2026-06-12'), 0, 'lapsed');
s.freezes = 1; assert.equal(D.liveStreak(s, '2026-06-12'), 5, 'a freeze keeps it alive');
assert.equal(D.liveStreak(s, '2026-06-13'), 0);

// ── Recording, saving, reload ──────────────────────────────────────────
const storage = makeStorage();
({ T, D } = loadAll(storage));
D._setNow(at('2026-11-17'));
const day1 = D.stage();
assert.equal(day1.id, 'daily'); assert.equal(day1.daily, true); assert.equal(T.byId('daily').date, '2026-11-17');
assert.equal(D.doneToday(), false); assert.equal(D.streak(), 0);
let res = D.recordResult({ stageId: 'daily', won: false, playerScore: 2, aiScore: 7, rally: 6, bestStreak: 0 });
assert.equal(res.score, 0); assert.equal(res.streak, 1, 'a finished loss keeps the streak');
assert.equal(D.doneToday(), true);
res = D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 2, rally: 8, bestStreak: 3 });
assert.ok(res.score >= 1000 + 500 + 160); assert.equal(res.newBest, true); assert.equal(res.streak, 1);
const first = res.score;
res = D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 6, rally: 2, bestStreak: 0 });
assert.equal(res.newBest, false); assert.equal(res.best, first, 'the best attempt of the day counts');
// Through PPTour.recordResult too, as Game calls it.
res = T.recordResult({ stageId: 'daily', won: false, playerScore: 1, aiScore: 7, rally: 1 });
assert.equal(res.daily, true);
// Tour progress is untouched.
assert.equal(T.totalStars(), 0);
assert.equal(storage._m.has('pp-tour-v1'), false, 'the Tour save is not written by a Daily');
// Next day: streak grows; reload keeps everything.
D._setNow(at('2026-11-18'));
assert.equal(D.streak(), 1); assert.equal(D.doneToday(), false);
D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 3, rally: 4 });
assert.equal(D.streak(), 2);
D.reload();
assert.equal(D.streak(), 2); assert.equal(D.today().won, 1);
D._setNow(at('2026-11-17')); assert.equal(D.today().attempts, 4);

// A match started before midnight is recorded for the day it began on.
const night = loadAll(makeStorage());
night.D._setNow(at('2026-11-17')); night.D.play();
night.D._setNow(at('2026-11-18'), true);
assert.equal(night.D.stage().date, '2026-11-17', 'the running match keeps its own date');
const lateRes = night.D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 1, rally: 3 });
assert.equal(lateRes.stage.date, '2026-11-17');
assert.equal(night.D.today(), null, 'the new day is still unplayed');

// ── Bad storage falls back to blank ────────────────────────────────────
for (const junk of ['{nope', '[]', '"x"', '{"days":{"bad":{"best":5}},"streak":"many","lastDay":"zz"}']) {
    const loaded = loadAll(makeStorage({ 'pp-daily-v1': junk }));
    loaded.D._setNow(at('2026-11-17'));
    assert.equal(loaded.D.streak(), 0, junk);
    assert.equal(loaded.D.doneToday(), false);
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const blocked = loadAll(throwing); blocked.D._setNow(at('2026-11-17'));
assert.equal(blocked.D.streak(), 0);
assert.doesNotThrow(() => blocked.D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 0, rally: 1 }));

// ── Old days are pruned ────────────────────────────────────────────────
const oldStore = makeStorage();
const old = loadAll(oldStore);
for (let i = 0; i < 80; i++) {
    old.D._setNow(at(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)));
    old.D.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 0, rally: 1 });
}
assert.equal(old.D.streak(), 80);
assert.equal(Object.keys(JSON.parse(oldStore.getItem('pp-daily-v1')).days).length, 60);

console.log('daily.test.js passed');
