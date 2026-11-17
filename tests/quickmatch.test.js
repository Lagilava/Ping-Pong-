// Quick match: advert parsing, who joins whom, and the flood/expiry rules (no network).
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const intervals = [];
const window = { PPSignal: null };
const ctx = vm.createContext({ window, TextEncoder, TextDecoder, JSON, Math, Date, Map, Set, Array, Object, Number, String, Promise, Uint8Array, crypto: require('node:crypto').webcrypto, setInterval: (f) => { intervals.push(f); return intervals.length; }, clearInterval() {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game/js/net/quickmatch.js'), 'utf8'), ctx);
const Q = window.PPQuick;
const bytes = (o) => new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o));
const ok = { v: 1, p: 3, mode: 'classic', id: 'abcdefghij', code: 'ABCDEFGH' };

// parse
assert.deepEqual({ ...Q.parseAdvert(bytes(ok), 'classic', 3) }, { id: 'abcdefghij', code: 'ABCDEFGH' });
for (const bad of [{ ...ok, v: 2 }, { ...ok, p: 2 }, { ...ok, mode: 'speed' }, { ...ok, id: 'ABC' }, { ...ok, id: 5 }, { ...ok, code: 'abcdefgh' }, { ...ok, code: 'ABCDEFG' }, { ...ok, code: 'ABCDEFGI' }, { ...ok, code: 'ABCDEFGO' }, null, 'nope', '{bad']) {
    assert.equal(Q.parseAdvert(bytes(bad), 'classic', 3), null, JSON.stringify(bad));
}
assert.equal(Q.parseAdvert(new Uint8Array([255, 254, 1]), 'classic', 3), null);

// who joins whom: only rooms with a smaller id, lowest first, fresh, not bad
const T = 100000;
const seen = new Map([['bbbbbbbbbb', { code: 'BBBBBBBB', at: T }], ['cccccccccc', { code: 'CCCCCCCC', at: T }], ['zzzzzzzzzz', { code: 'ZZZZZZZZ', at: T }]]);
const bad = new Map();
assert.equal(Q.pickRoom(seen, 'mmmmmmmmmm', bad, T + 1000).id, 'bbbbbbbbbb', 'lowest id wins');
assert.equal(Q.pickRoom(seen, 'aaaaaaaaaa', bad, T + 1000), null, 'smallest id waits; nobody is lower');
assert.equal(Q.pickRoom(seen, 'mmmmmmmmmm', bad, T + Q.ADVERT_TTL_MS + 1), null, 'stale adverts are ignored');
bad.set('BBBBBBBB', T + 5000);
assert.equal(Q.pickRoom(seen, 'mmmmmmmmmm', bad, T + 1000).id, 'cccccccccc', 'a room that failed is skipped');
assert.equal(Q.pickRoom(seen, 'mmmmmmmmmm', bad, T + 6000).id, 'bbbbbbbbbb', '... for a while only');
// two seekers never both join each other
const a = 'aaaaaaaaaa', b = 'bbbbbbbbbb';
const sa = new Map([[b, { code: 'BBBBBBBB', at: T }]]), sb = new Map([[a, { code: 'AAAAAAAA', at: T }]]);
assert.equal(Q.pickRoom(sa, a, new Map(), T), null);
assert.equal(Q.pickRoom(sb, b, new Map(), T).code, 'AAAAAAAA');

// handles look right
for (let i = 0; i < 50; i++) assert.match(Q.handle(), /^[A-Z][a-z]+[A-Z][a-z]+\d\d$/);

// Seeker: flood cap and own-advert filtering, with a fake relay
const published = [];
class FakeRelay { constructor(u) { this.url = u; this.ready = true; } start(t, on) { this.on = on; FakeRelay.last = this; } publish(t, b) { published.push(JSON.parse(Buffer.from(b).toString())); } stop() {} }
window.PPSignal = { MqttRelay: FakeRelay };
const statuses = []; const joins = [];
const seeker = new Q.Seeker('classic', { relays: ['x'], protocol: 3, code: () => 'ABCDEFGH', join: (c) => { joins.push(c); return new Promise(() => {}); }, status: (i) => statuses.push(i) });
assert.ok(seeker.start());
assert.equal(published.length, 1);
assert.equal(published[0].id, seeker.id); assert.equal(published[0].code, 'ABCDEFGH'); assert.equal(published[0].mode, 'classic');
FakeRelay.last.on(bytes({ ...ok, id: seeker.id }));       // our own advert echoed back is ignored
assert.equal(seeker.others(), 0);
for (let i = 0; i < 60; i++) FakeRelay.last.on(bytes({ ...ok, id: 'x' + String(i).padStart(9, '0'), code: 'ABCDEFGH' }));
assert.ok(seeker.seen.size <= 20, 'adverts per second are capped, got ' + seeker.seen.size);
assert.ok(joins.length <= 1, 'joins one room at a time');
seeker.stop();
console.log('quickmatch ok');
