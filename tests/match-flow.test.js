const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const context = vm.createContext({window: {}, Math});
vm.runInContext(load('game/js/core/game.js'), context);
const game = Object.create(context.window.Game.prototype);
const vector = (x, y) => ({x, y, set(x, y) { this.x = x; this.y = y; }});
game.gameMode = 'obstacle';
game.ball = {vel: vector(700, 90), pos: vector(400, 300), prev: vector(400, 300)};
game.audio = {}; game.panFor = () => 0;
game.holdServe(2);
game.arenaReveal = {t: 0};
for (let i = 0; i < 600; i++) assert.equal(game.updateServeHold(1 / 240), true);
assert.equal(game.serveHold, 2, 'camera reveal cannot consume the serve countdown');
assert.equal(game.ball.vel.x, 0);
game.arenaReveal = null;
game.ball.vel.set(120, 40); // A stale course force must not cancel the hold.
assert.equal(game.updateServeHold(0.5), true);
assert.equal(game.ball.vel.x, 0);
assert.equal(game.serveHold, 1.5);
assert.equal(game.updateServeHold(1.49), true);
assert.equal(game.isObstacleServeWaiting(), true);
assert.equal(game.updateServeHold(0.02), false);
assert.equal(game.ball.vel.x, 700);
assert.equal(game.ball.vel.y, 90);
assert.equal(game.isObstacleServeWaiting(), false);

vm.runInContext(load('game/js/modes/obstacles.js'), context);
const course = Object.create(vm.runInContext('ObstacleCourse.prototype', context));
let obstacleUpdates = 0, routeUpdates = 0;
course.game = game; course.phase = 0; course.rebuild = () => {};
course.obstacles = [{update() { obstacleUpdates++; }}];
course.updateCourseRoute = () => { routeUpdates++; };
game.serveHold = 1;
course.update(0.5);
assert.equal(course.phase, 0);
assert.equal(obstacleUpdates, 0);
assert.equal(routeUpdates, 0, 'route forces cannot touch an unserved ball');
game.serveHold = 0;
course.update(0.5);
assert.equal(course.phase, 0.5);
assert.equal(obstacleUpdates, 1);
assert.equal(routeUpdates, 1);

vm.runInContext(load('game/js/modes/obstacle-arcade.js'), context);
const arcade = Object.create(context.window.ObstacleArcade.prototype);
arcade.game = game; arcade.fixedLayout = true; arcade.time = 0; arcade.sprites = null;
arcade.updateCoinFlights = () => { throw new Error('must remain frozen'); };
game.serveHold = 1;
arcade.update(0.5);
assert.equal(arcade.time, 0, 'arcade interactions wait for serve too');

// A completed match must reject any remaining fixed steps and render calls.
game.matchEnding = true;
game.physicsStep(0.01);
game.render(0.5);
game.step();
assert.equal(game.rafId, null);

(async () => {
    let now = 0, id = 0, captureCount = 0;
    const frames = new Map(), timers = new Map(), overlays = [];
    const noopCtx = new Proxy({}, {get: (_, key) => key === 'drawImage'
        ? source => { if (source === game.canvas) captureCount++; }
        : () => {}});
    context.performance = {now: () => now};
    context.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
    context.cancelAnimationFrame = id => frames.delete(id);
    context.setTimeout = fn => { timers.set(++id, fn); return id; };
    context.clearTimeout = id => timers.delete(id);
    context.window.innerWidth = 1280; context.window.innerHeight = 720;
    context.document = {createElement: () => ({style: {}, setAttribute() {},
        getContext: () => noopCtx, remove() { overlays.splice(overlays.indexOf(this), 1); }}),
        body: {appendChild(node) { overlays.push(node); }}};
    game.canvas = {width: 1280, height: 720,
        getBoundingClientRect: () => ({left: 0, top: 0, width: 1280, height: 720})};
    vm.runInContext(load('game/js/ui/match-end-transition.js'), context);
    const transition = context.window.MatchEndTransition;
    const tick = time => { now = time; const [key, fn] = frames.entries().next().value; frames.delete(key); fn(time); };
    const completion = transition.play(game, {duration: 1000});
    tick(500); tick(850);
    assert.equal(captureCount, 1, 'animation reuses one frozen frame');
    tick(1000);
    assert.equal(await completion, true);
    assert.equal(overlays.length, 0);
    assert.equal(frames.size, 0);
    assert.equal(timers.size, 0);
    const cancelled = transition.play(game);
    transition.cancel();
    assert.equal(await cancelled, false, 'leaving cancels stale results');
    assert.equal(overlays.length, 0);
    assert.equal(frames.size, 0);
    assert.equal(timers.size, 0);
    console.log('Obstacle serve/reveal hold, frozen course, CRT capture and cancellation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
