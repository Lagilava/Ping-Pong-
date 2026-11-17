// Personal records: top-10 ordering, ties, seeding from the profile, saving and
// corrupt storage, what recordMatch writes, and the in-match rally note.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'game/js/systems/records.js'), 'utf8');

const j = (x) => JSON.parse(JSON.stringify(x));
function makeStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function loadRecords(storage, profileStats) {
    const window = { PPProfile: profileStats ? { getStats: () => profileStats } : undefined };
    const ctx = vm.createContext({ window, document: { visibilityState: 'visible' }, localStorage: storage, setInterval() {}, Math, Number, JSON, String, Object, Array, Date });
    vm.runInContext(src, ctx);
    return { R: window.PPRecords, window };
}

// Ordering, ties and the cap.
let { R } = loadRecords(makeStorage());
let win;
assert.equal(R.add('rally', 10, { m: 'classic' }).rank, 1);
assert.equal(R.add('rally', 14, { m: 'speed' }).rank, 1);
assert.deepEqual(j(R.add('rally', 14, { m: 'gravity' })), { rank: 2, record: false, was: 14 }, 'a tie sits behind the older entry');
assert.equal(R.top('rally')[1].m, 'gravity');
assert.equal(R.add('rally', 0).rank, 0, 'zero is not a record');
assert.equal(R.add('nope', 5).rank, 0);
for (let i = 1; i <= 12; i++) R.add('rally', 20 + i, { m: 'classic' });
assert.equal(R.top('rally').length, 10, 'only ten are kept');
assert.equal(R.best('rally'), 32);
assert.equal(R.add('rally', 5).rank, 0, 'too small for a full list');
let r = R.add('rally', 40); assert.equal(r.record, true); assert.equal(r.was, 32);

// First entry is not a "record broken".
({ R } = loadRecords(makeStorage()));
assert.equal(R.add('margin', 4).record, false);
assert.equal(R.add('margin', 6).record, true);

// Seeding from the profile happens once.
const stats = { modes: [{ id: 'classic', bestRally: 12, bestMargin: 5 }, { id: 'zombie', bestRally: 4, bestMargin: 3 }, { id: 'speed', bestRally: 0, bestMargin: 0 }], zombieBest: 900 };
const store = makeStorage();
({ R } = loadRecords(store, stats));
assert.deepEqual(j(R.top('rally').map(e => [e.m, e.v])), [['classic', 12], ['zombie', 4]]);
assert.deepEqual(j(R.top('margin').map(e => [e.m, e.v])), [['classic', 5]], 'Zombie has no margin');
assert.equal(R.best('zombieScore'), 900);
R.reload(); // saved, not seeded again
assert.equal(R.top('rally').length, 2);
// Profile not ready: seeding waits.
({ R } = loadRecords(makeStorage()));
assert.equal(R.best('rally'), 0);

// recordMatch writes what it should.
({ R } = loadRecords(makeStorage(), { modes: [], zombieBest: 0 }));
let broken = R.recordMatch({ mode: 'classic', won: true, rally: 9, margin: 4 });
assert.deepEqual(j(broken), [], 'rally and margin are announced by the profile, not here');
assert.equal(R.best('rally'), 9); assert.equal(R.best('margin'), 4);
R.recordMatch({ mode: 'classic', won: false, rally: 6, margin: -3 });
assert.equal(R.top('margin').length, 1, 'a loss writes no margin');
assert.equal(R.top('rally').length, 2, 'a loss still writes its rally');
R.recordMatch({ mode: 'zombie', won: false, rally: 3, margin: 0, zombie: { wave: 4, score: 500 } });
broken = R.recordMatch({ mode: 'zombie', won: true, rally: 3, margin: 0, zombie: { wave: 8, score: 1200 } });
assert.deepEqual(j(broken.map(b => b.label)), ['Zombie wave', 'Zombie score']);
assert.equal(R.best('zombieWave'), 8);
assert.equal(R.top('margin').length, 1, 'Zombie never writes a margin');
assert.deepEqual(j(R.recordMatch({ mode: 'classic', won: true, rally: 1, margin: 1 })), []);
assert.equal(R.recordMatch(null).length, 0);

// Fastest Tour clear: lower wins, the first clear is not "broken".
assert.equal(R.addFast(2, 120).record, false);
assert.equal(R.addFast(2, 150).record, false); assert.equal(R.fastest(2).v, 120, 'slower is ignored');
assert.equal(R.addFast(2, 95).record, true); assert.equal(R.fastest(2).v, 95);
assert.equal(R.addFast(2, 1).record, false, 'implausibly fast times are ignored');
assert.equal(R.addFast(99999, 100).record, false);

// The in-match rally note: needs a best of 5+ to beat, and fires once per new height.
const prof = { modes: [{ id: 'classic', bestRally: 8, bestMargin: 0 }, { id: 'speed', bestRally: 3, bestMargin: 0 }], zombieBest: 0 };
({ R } = loadRecords(makeStorage(), prof));
R.matchStarted('classic');
assert.equal(R.rallyNote(8), null);
assert.match(R.rallyNote(9), /9 hits/);
assert.equal(R.rallyNote(9), null, 'not again for the same rally');
assert.match(R.rallyNote(12), /12 hits/);
R.matchStarted('speed');
assert.equal(R.rallyNote(10), null, 'a mode with no real record yet is not announced');
R.matchStarted('classic'); assert.match(R.rallyNote(9), /9 hits/, 'a new match starts fresh');

// Real call order for an upgrading player: the board seeds at match start, before the profile folds the match in.
const live = { modes: [{ id: 'classic', bestRally: 9, bestMargin: 4 }, { id: 'zombie', bestRally: 0, bestMargin: 0 }], zombieBest: 800 };
({ R, window: win } = loadRecords(makeStorage(), live));
R.matchStarted('classic');
live.modes[0].bestRally = 12; live.zombieBest = 900; // the profile updates at match end
R.recordMatch({ mode: 'classic', won: true, rally: 12, margin: 4 });
assert.deepEqual(j(R.top('rally').map(e => e.v)), [12, 9], 'the finished match is not listed twice');
broken = R.recordMatch({ mode: 'zombie', won: false, rally: 1, margin: 0, zombie: { wave: 5, score: 900 } });
assert.deepEqual(j(broken.map(b => b.label)), ['Zombie score'], 'beating the seeded Zombie best is announced');
assert.equal(R.best('zombieScore'), 900);
// Zombie runs that never left wave 1 are not listed.
R.recordMatch({ mode: 'zombie', won: false, rally: 1, margin: 0, zombie: { wave: 1, score: 10 } });
assert.equal(R.best('zombieWave'), 5);
// The note's baseline follows the board: after a reset nothing is "your longest".
R.matchStarted('classic'); assert.match(R.rallyNote(13), /13 hits/);
R.reset(); R.matchStarted('classic'); assert.equal(R.rallyNote(13), null);

// Saving, corrupt data, blocked storage, reset, markup.
const s2 = makeStorage();
({ R } = loadRecords(s2, { modes: [], zombieBest: 0 }));
R.add('dailyScore', 1500, { m: 'speed', n: 'Pip' });
R.reload(); assert.equal(R.best('dailyScore'), 1500);
assert.match(R.html(), /Daily Match score/); assert.match(R.html(), /1,500/); assert.match(R.html(), /Pip/);
R.reset(); assert.equal(R.best('dailyScore'), 0); R.reload(); assert.equal(R.best('dailyScore'), 0, 'a reset board stays empty');
for (const junk of ['{nope', '[]', '"x"', '{"lists":{"rally":[{"v":"x"},{"v":-4},null,{"v":7,"m":5}]},"tourFast":{"zz":{"v":5},"3":{"v":"a"}}}']) {
    const l = loadRecords(makeStorage({ 'pp-records-v1': junk }), { modes: [], zombieBest: 0 });
    assert.ok(l.R.top('rally').length <= 1, junk);
    assert.doesNotThrow(() => l.R.html());
}
const blocked = loadRecords({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, { modes: [], zombieBest: 0 });
assert.doesNotThrow(() => blocked.R.add('rally', 5));
assert.match(blocked.R.html('<script>'), /Longest rally/);

console.log('records.test.js passed');
