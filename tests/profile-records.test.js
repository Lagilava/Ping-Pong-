// Profile records: best rally and biggest win per mode, "new record" only when an old one is beaten.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const m = new Map();
const storage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
const window = { addEventListener() {}, dispatchEvent() {}, game: null };
const ctx = vm.createContext({ window, document: { visibilityState: 'visible' }, localStorage: storage, Math, Number, JSON, String, Object, Array, Date, CustomEvent: function () {}, setInterval() { return 0; }, clearInterval() {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game/js/systems/profile.js'), 'utf8'), ctx);
const P = window.PPProfile;
const rec = (o) => P.recordMatch(Object.assign({ mode: 'classic', won: true, pointsFor: 7, pointsAgainst: 3, rally: 8 }, o));

assert.equal(rec({}).length, 0, 'first values are not records to beat');
assert.equal(P.getStats().bestRally, 8);
assert.equal(P.getStats().bestMargin, 4);
assert.equal(rec({ rally: 6, pointsAgainst: 5 }).length, 0, 'lower values break nothing');
let b = rec({ rally: 12, pointsAgainst: 0 });
assert.equal(b.map(x => x.id).join(), 'rally,margin');
assert.equal(b[0].value, '12 hits'); assert.equal(b[1].value, 'by 7 points');
assert.equal(rec({ won: false, pointsFor: 2, pointsAgainst: 7, rally: 3 }).length, 0, 'a loss has no margin');
assert.equal(rec({ mode: 'zombie', pointsFor: 30, pointsAgainst: 0, rally: 5 }).length, 0, 'zombie has no margin and its first rally is not a record');
assert.equal(P.getStats().modes.find(x => x.id === 'zombie').bestMargin, 0);
assert.equal(P.recordMatch({ mode: 'nope' }), null, 'unknown mode ignored');
// old saves without bestMargin load as 0
const m2 = new Map([['pp-profile-v1', JSON.stringify({ modes: { classic: { played: 3, won: 2, bestRally: 9 } } })]]);
const ctx2 = vm.createContext({ window: { addEventListener() {}, dispatchEvent() {} }, document: {}, localStorage: { getItem: k => m2.get(k) || null, setItem() {} }, Math, Number, JSON, String, Object, Array, Date, CustomEvent: function () {}, setInterval() { return 0; }, clearInterval() {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game/js/systems/profile.js'), 'utf8'), ctx2);
assert.equal(ctx2.window.PPProfile.getStats().modes[0].bestMargin, 0);
assert.equal(ctx2.window.PPProfile.getStats().bestRally, 9);
console.log('profile records ok');
