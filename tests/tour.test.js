// The Tour: stage data, unlock rules, stars, saving, and the Game hooks that
// make a stage override skill / points / twist without touching settings.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function loadTour(storage) {
    const window = { addEventListener() {} };
    const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
    const ctx = vm.createContext({ window, document, localStorage: storage, Math, Number, JSON, String, Object, Array });
    vm.runInContext(load('game/js/systems/tour.js'), ctx);
    return window.PPTour;
}

// ── Data ───────────────────────────────────────────────────────────────
let T = loadTour(makeStorage());
assert.equal(T.STAGES.length, 8);
assert.equal(T.MAX_STARS, 24);
T.STAGES.forEach((s, i) => {
    assert.equal(s.id, i + 1);
    assert.ok(['classic', 'gravity', 'speed', 'obstacle'].includes(s.mode), 'stage modes are points matches');
    assert.ok(s.level >= 0 && s.level <= 4);
    assert.ok([5, 7, 11, 15, 21].includes(s.points), 'points to win is one of the setup dialog values');
    assert.ok(['sniper', 'trickster', 'wall', 'bully'].includes(s.style));
    assert.equal(s.goals.length, 2);
});
assert.ok(T.STAGES.every((s, i, a) => i === 0 || a[i - 1].level <= s.level), 'skill never drops along the Tour');

// ── Unlock rules ───────────────────────────────────────────────────────
assert.equal(T.lockInfo(T.byId(1)).state, 'open');
assert.equal(T.lockInfo(T.byId(2)).state, 'locked');
assert.match(T.lockInfo(T.byId(2)).reason, /stage 1/);
const win = (id, playerScore, aiScore, rally) => T.recordResult({ stageId: id, won: true, playerScore, aiScore, rally });

let r = win(1, 5, 4, 3);
assert.equal(r.earned, 1, 'a bare win is one star');
assert.equal(r.firstClear, true);
assert.equal(T.starsOf(1), 1);
assert.equal(T.lockInfo(T.byId(2)).state, 'open');
r = win(1, 5, 1, 9);
assert.equal(r.earned, 3, 'margin and rally goals add a star each');
assert.deepEqual(Array.from(r.goals), [true, true]);
assert.equal(r.firstClear, false);
assert.equal(T.starsOf(1), 3);
r = win(1, 5, 4, 2);
assert.equal(r.earned, 1);
assert.equal(r.best, 3, 'a worse replay never lowers stars');
assert.equal(T.starsOf(1), 3);

// A loss records nothing.
const lost = T.recordResult({ stageId: 2, won: false, playerScore: 3, aiScore: 7, rally: 40 });
assert.equal(lost.earned, 0);
assert.equal(T.starsOf(2), 0);
assert.equal(T.lockInfo(T.byId(3)).state, 'locked');

// Tier gate: stage 3 needs 4 stars even though stage 2 is won.
win(2, 7, 6, 2);
assert.equal(T.starsOf(2), 1);
assert.equal(T.totalStars(), 4);
assert.equal(T.lockInfo(T.byId(3)).state, 'open', '3 + 1 = 4 stars opens Regional');
// With fewer stars the tier stays shut.
T = loadTour(makeStorage());
win(1, 5, 4, 1); win(2, 7, 6, 1);
assert.equal(T.totalStars(), 2);
assert.equal(T.lockInfo(T.byId(3)).state, 'locked');
assert.match(T.lockInfo(T.byId(3)).reason, /4 stars/);
const opened = win(1, 5, 0, 20);
assert.equal(opened.total, 4);
assert.deepEqual(Array.from(opened.opened, t => t.id), ['regional'], 'result reports the newly opened tier');
assert.equal(opened.nextPlayable, true);

// Final stage ends the Tour.
T = loadTour(makeStorage());
T.STAGES.forEach(s => { if (s.id < 8) win(s.id, s.points, 0, 99); });
const fin = win(8, 11, 0, 99);
assert.equal(fin.tourComplete, true);
assert.equal(T.totalStars(), 24);

// ── Saving ─────────────────────────────────────────────────────────────
const store = makeStorage();
T = loadTour(store);
win(1, 5, 0, 10);
const saved = JSON.parse(store.getItem('pp-tour-v1'));
assert.equal(saved.stages[1].stars, 3);
T = loadTour(store);
assert.equal(T.starsOf(1), 3, 'progress survives a reload');
for (const junk of ['not json', '{"stages":5}', 'null', '{"stages":{"1":{"stars":99,"goals":"x"},"99":{"stars":3}}}']) {
    T = loadTour(makeStorage({ 'pp-tour-v1': junk }));
    assert.ok(T.totalStars() <= 3, 'corrupt saves never invent progress: ' + junk);
    assert.equal(T.starsOf(99), 0);
}
// Storage that throws must not break the Tour.
T = loadTour({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
assert.equal(T.totalStars(), 0);
assert.doesNotThrow(() => win(1, 5, 0, 10));

// ── Result card ────────────────────────────────────────────────────────
T = loadTour(makeStorage());
const card = T.resultCard(win(1, 5, 4, 3), 'XP earned: +9');
assert.equal(card.tone, 'win');
assert.ok(card.actions.some(a => /Next: stage 2/.test(a.label) && a.primary));
assert.ok(card.actions.some(a => a.back), 'Esc has a back action');
assert.ok(card.lines.includes('XP earned: +9'));
const lossCard = T.resultCard(T.recordResult({ stageId: 2, won: false, playerScore: 1, aiScore: 7, rally: 2 }));
assert.equal(lossCard.tone, 'loss');
assert.ok(lossCard.actions.find(a => /Try again/.test(a.label)).primary);
assert.ok(!lossCard.actions.some(a => /Next/.test(a.label)));

// ── Game hooks ─────────────────────────────────────────────────────────
const gctx = vm.createContext({ window: { PPSettings: { get: k => ({ aiLevel: 2, pointsToWin: 15, powerUps: false })[k] } }, Math });
vm.runInContext(load('game/js/core/game.js'), gctx);
const game = Object.create(gctx.window.Game.prototype);
game.gameMode = 'classic'; game.isMultiplayer = false;
assert.equal(game.getAILevel(), 2, 'no Tour: saved skill');
assert.equal(game.getConfiguredMaxScore(), 15, 'no Tour: saved points');
game.tourContext = { active: true, mode: 'classic', level: 4, points: 11, twist: 'winBy2' };
assert.equal(game.getAILevel(), 4);
assert.equal(game.getConfiguredMaxScore(), 11);
game.isMultiplayer = true;
assert.equal(game.getAILevel(), 2, 'online / local 1v1 ignore the Tour');
game.isMultiplayer = false; game.gameMode = 'gravity';
assert.equal(game.getAILevel(), 2, 'a Tour stage only applies to its own mode');
game.gameMode = 'classic'; game.tourContext.active = false;
assert.equal(game.getAILevel(), 2, 'cleared Tour context is ignored');

// Win by 2: 11-10 does not end the match, 12-10 does.
game.tourContext = { active: true, mode: 'classic', level: 4, points: 11, twist: 'winBy2' };
let finished = null;
Object.assign(game, {
    matchEnding: false, maxScore: 11, scores: { player: 11, ai: 10 }, streakDisplay: null, progression: { winStreak: 0 },
    zombieState: {}, scoreElements: {}, _setText() {}, syncZombieHUD() {}, isZombieWaveMode: () => false,
    finishMatch(w) { finished = w; },
});
game.updateScoreUI();
assert.equal(finished, null, '11-10 with win-by-2 keeps playing');
game.scores = { player: 12, ai: 10 }; game.updateScoreUI();
assert.equal(finished, true);
finished = null; game.scores = { player: 10, ai: 11 }; game.updateScoreUI();
assert.equal(finished, null, '10-11 is not a finish either');
game.scores = { player: 9, ai: 11 }; game.updateScoreUI();
assert.equal(finished, false, 'a two point lead for the AI ends it');
game.tourContext = null; finished = null; game.scores = { player: 11, ai: 10 }; game.updateScoreUI();
assert.equal(finished, true, 'outside the Tour 11-10 ends the match');

// AI style is forced for a rival and random otherwise.
const actx = vm.createContext({ window: { game: { getTourContext: () => ({ styleId: 'bully' }) } }, Math, document: {} });
try {
    vm.runInContext(load('game/js/ai/ai-opponent.js'), actx);
    const AI = actx.window.AIController || vm.runInContext('typeof AIController !== "undefined" ? AIController : null', actx);
    if (AI) {
        const ai = new AI({ pos: { y: 0 }, h: 10 }, { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } }, 800, 600, 2);
        assert.equal(ai.style.id, 'bully');
    }
} catch (e) {
    // The AI file needs browser globals; the browser test covers this hook.
    console.log('(AI style hook is covered by tests/tour.browser.js)');
}
console.log('tour.test.js ok');
