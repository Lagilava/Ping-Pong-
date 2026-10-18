const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const diceSource = fs.readFileSync(path.join(__dirname, '../game/js/modes/obstacle-dice.js'), 'utf8');
const warpSource = fs.readFileSync(path.join(__dirname, '../game/js/modes/gravity-wormhole.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../game/js/modes/mode-abilities.js'), 'utf8');
class Ball {
    constructor(x, y, r) { this.pos = { x, y }; this.vel = { x: 0, y: 0 }; this.r = r; }
}
const context = { window: {}, Math, Ball, setTimeout, performance };
vm.createContext(context);
vm.runInContext(diceSource, context);
vm.runInContext(warpSource, context);
vm.runInContext(source, context);
const ModeAbilities = context.window.ModeAbilities;

function game(mode) {
    const ball = { pos: { x: 180, y: 300 }, vel: { x: -900, y: 0 }, r: 9,
        baseSpeed: 800, maxSpeed: 2200, getSpeed() { return Math.hypot(this.vel.x, this.vel.y); } };
    return { gameMode: mode, width: 1000, height: 600, ball,
        player: { pos: { x: 35, y: 250 }, w: 16, h: 100 },
        aiPaddle: { pos: { x: 949, y: 250 }, w: 16, h: 100 },
        paused: false, introActive: false, serveHold: 0, net: null,
        gravityWells: [], obstacleCourse: null,
        postFx: { ripple() {}, punch() {} }, particles: { spawnGodTierHit() {} },
        popText() {}, screenShake: 0, hitStop: 0 };
}

{
    const g = game('speed'), ability = new ModeAbilities(g);
    g.ball.pos.x = 160;
    assert.equal(ability.trigger('player'), true);
    assert.equal(ability.speedScale(), 0.42);
    ability.onPaddleHit('player', g.ball);
    assert.equal(ability.speedScale(), 1);
    assert.ok(g.ball.getSpeed() > 900, 'parry boosts the return');
    assert.ok(g.ball.maxSpeed > 2200, 'sonic return temporarily raises the speed cap');
    assert.equal(ability.side('player').trail.length, 1, 'return trail begins at the contact point');
    g.ball.pos.x += 30;
    ability.update(0.02);
    assert.ok(ability.side('player').trail.length > 1, 'return trail follows the moving ball');
    ability.update(0.49);
    assert.equal(g.ball.maxSpeed, 2200, 'speed cap returns after the sonic trail');
    assert.equal(ability.side('player').trail.length, 0, 'trail clears after its visual window');
    assert.equal(ability.trigger('player'), false, 'cooldown blocks immediate reuse');
    ability.update(1.82);
    g.ball.vel.x = -900;
    g.ball.pos.x = 160;
    assert.equal(ability.trigger('player'), true);
    ability.update(0.33);
    assert.equal(ability.speedScale(), 1, 'missed parry expires');
    assert.ok(ability.side('player').miss > 0, 'miss feedback appears');
    ability.update(2);
    g.ball.pos.x = 500;
    assert.equal(ability.trigger('player'), false, 'parry cannot be spent too far from contact');
}

function gravityGame() {
    const g = game('gravity');
    const vec = (x, y) => ({ x, y, set(nx, ny) { this.x = nx; this.y = ny; } });
    g.ball.pos = vec(260, 300);
    g.ball.prev = vec(260, 300);
    g.ball.vel = vec(-900, 0);
    const well = (x, y) => ({ pos: { x, y }, radius: 90, active: true, flares: 0, flare() { this.flares++; } });
    g.near = well(190, 310);
    g.mid = well(560, 120);
    g.far = well(820, 420);
    g.gravityWells = [g.mid, g.near, g.far];
    g.gravityWarp = new context.window.GravityWormhole(g);
    return g;
}
const WARP = context.window.GravityWormhole;
const runWarp = (g, ability) => {
    for (let i = 0; i < 30; i++) { ability.update(1 / 60); g.gravityWarp.update(1 / 60); }
};

{
    const g = gravityGame(), ability = new ModeAbilities(g);
    assert.equal(ability.nearestWell(), g.near, 'the hole the ball is passing is the entry');
    assert.equal(g.gravityWarp.exitFor('player', g.near), g.mid, 'the exit is the most forward hole that leaves the computer room');
    assert.equal(g.gravityWarp.exitFor('ai', g.far), g.mid, 'player two exits toward player one the same way');
    g.mid.pos.x = 400;
    assert.equal(g.gravityWarp.exitFor('player', g.near), g.mid);
    g.mid.pos.x = 560;
    assert.equal(ability.trigger('player'), true);
    assert.ok(g.gravityWarp.holdsBall(), 'the wormhole owns the ball while it warps');
    assert.equal(g.ball.vel.x, 0, 'the ball stops moving on its own inside the hole');
    for (let i = 0; i < 6; i++) g.gravityWarp.update(1 / 60);
    assert.ok(Math.hypot(g.ball.pos.x - 190, g.ball.pos.y - 310) < 70, 'the ball spirals into the entry hole');
    assert.ok(g.gravityWarp.ballScale() < 1, 'the ball shrinks as it is swallowed');
    runWarp(g, ability);
    assert.equal(g.gravityWarp.holdsBall(), false, 'the ball comes back out');
    assert.ok(Math.hypot(g.ball.pos.x - 560, g.ball.pos.y - 120) < 90, 'it comes out of the exit hole');
    assert.ok(g.ball.vel.x > 0, 'and flies at the computer goal');
    assert.ok(Math.hypot(g.ball.vel.x, g.ball.vel.y) > 900 * 1.05, 'faster than it went in');
    assert.ok(Math.abs(Math.atan2(g.ball.vel.y, g.ball.vel.x)) <= WARP.MAX_AIM + 1e-9, 'aim stays within the cone');
    assert.equal(g.ball.warpCharge, 1, 'a warp makes the point worth one more');
    assert.ok(g.gravityWarp.ignores(g.mid, g.ball), 'the exit hole lets go of the ball');
    assert.equal(g.near.flares + g.mid.flares, 2, 'both holes flare');
    assert.equal(ability.trigger('player'), false, 'cooldown blocks an immediate second warp');
    assert.equal(g.gravityWarp.consumeGoalBonus(g.ball), 1, 'the bonus is cashed on a goal');
    assert.equal(g.ball.warpCharge, 0);
}

{
    // With every other hole close to the computer, the ball leaves from the
    // one that gives it the most room.
    const g = gravityGame();
    g.mid.pos.x = 900;
    assert.equal(g.gravityWarp.exitFor('player', g.near), g.far);
    g.gravityWells = [g.near];
    assert.equal(g.gravityWarp.exitFor('player', g.near), g.near, 'a lone hole is its own exit');
    // A new serve cancels a warp in progress.
    g.gravityWells = [g.near, g.mid];
    assert.equal(g.gravityWarp.start('player'), true);
    g.serveHold = 0.5;
    g.gravityWarp.update(1 / 60);
    assert.equal(g.gravityWarp.holdsBall(), false);
}

{
    const g = gravityGame(), ability = new ModeAbilities(g);
    g.aiPaddle.pos.y = 40;
    ability.trigger('player'); runWarp(g, ability);
    assert.ok(g.ball.vel.y > 0, 'with their paddle high, the warp aims low');
    g.ball.warpCharge = 2;
    g.gravityWarp.emerge({ side: 'player', from: g.near, to: g.far, speed: 900 });
    assert.equal(g.ball.warpCharge, 2, 'warp bonus stops at +2');
}

{
    const g = gravityGame(), ability = new ModeAbilities(g);
    g.ball.pos.x = 400; g.ball.pos.y = 450;
    assert.equal(ability.nearestWell(), null);
    assert.equal(ability.trigger('player'), false, 'no black hole in reach: the press is ignored, not spent');
    assert.equal(ability.side('player').cooldown, 0);
    g.ball.pos.x = 260; g.ball.pos.y = 300;
    assert.equal(ability.trigger('ai'), false, 'the computer opponent never warps');
    g.isMultiplayer = true;
    assert.equal(ability.trigger('ai'), true, 'player two warps in a local match');
    assert.equal(ability.trigger('player'), false, 'one warp at a time');
}

function obstacleGame() {
    const g = game('obstacle');
    for (const p of [g.player, g.aiPaddle]) {
        p.originalHeight = p.h;
        p.grow = function (f) { const c = this.pos.y + this.h / 2; this.h = this.originalHeight * f; this.pos.y = c - this.h / 2; };
        p.resetSize = function () { this.grow(1); };
    }
    g.additionalBalls = [];
    g.obstacleArcade = {
        starTime: 0, starOwner: 'player', boosted: 0,
        grantStar(side) { this.starTime = 6; this.starOwner = side; },
        boost(ball, mult) { this.boosted = mult; ball.vel.x *= mult; ball.vel.y *= mult; }
    };
    g.showNotification = () => {};
    return g;
}
const DICE = context.window.ObstacleDice;
const settle = ability => { for (let i = 0; i < 70; i++) ability.update(1 / 60); };

{
    const g = obstacleGame(), ability = new ModeAbilities(g);
    assert.equal(ability.trigger('player'), true, 'the dice can be rolled at any point in a rally');
    assert.equal(ability.trigger('player'), false, 'cooldown blocks a second roll');
    assert.equal(ability.dice.status('player').text, 'ROLLING…');
    assert.equal(ability.trigger('ai'), false, 'the computer opponent never rolls');
}

{
    // Every face lands exactly on its value: the front face of the cube.
    for (let v = 1; v <= 6; v++) {
        const g = obstacleGame(), ability = new ModeAbilities(g);
        ability.dice.roll('player', v);
        const d = ability.dice.side('player').die;
        d.t = DICE.C.ROLL;
        const pose = ability.dice.pose('player', d, true);
        // Rebuild the rotation the renderer uses (minus the fixed tilt).
        const c = Math.cos, sn = Math.sin;
        const front = { 1: [0, 0, 1], 6: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 1, 0], 5: [0, -1, 0] }[v];
        let [x, y, z] = front;
        [y, z] = [y * c(pose.a) - z * sn(pose.a), y * sn(pose.a) + z * c(pose.a)];
        [x, z] = [x * c(pose.b) + z * sn(pose.b), -x * sn(pose.b) + z * c(pose.b)];
        assert.ok(z > 0.999, `face ${v} ends facing the player`);
    }
}

{
    const g = obstacleGame(), ability = new ModeAbilities(g);
    ability.dice.roll('player', 6); settle(ability);
    assert.equal(g.obstacleArcade.starTime, 6, 'six grants Star power');
    assert.equal(g.obstacleArcade.starOwner, 'player');

    const g5 = obstacleGame(), a5 = new ModeAbilities(g5);
    a5.dice.roll('player', 5); settle(a5);
    assert.equal(g5.additionalBalls.length, 2, 'five shoots two balls');
    assert.ok(g5.additionalBalls.every(b => b.vel.x > 0), 'shots fly toward the opponent');

    const g3 = obstacleGame(), a3 = new ModeAbilities(g3);
    a3.dice.roll('player', 3); settle(a3);
    for (let i = 0; i < 30; i++) a3.update(1 / 60);
    assert.ok(Math.abs(g3.player.h - 160) < 0.5, 'three grows the paddle');
    for (let i = 0; i < 60 * 8; i++) a3.update(1 / 60);
    assert.equal(g3.player.h, 100, 'big paddle returns to normal size');

    const g1 = obstacleGame(), a1 = new ModeAbilities(g1);
    a1.dice.roll('player', 1); settle(a1);
    assert.equal(g1.obstacleArcade.boosted, 1.35, 'one is a fast ball');

    const g2 = obstacleGame(), a2 = new ModeAbilities(g2);
    const before = { ...g2.ball.vel };
    a2.dice.roll('player', 2); settle(a2);
    assert.deepEqual({ ...g2.ball.vel }, before, 'two does nothing');
    assert.equal(g2.additionalBalls.length, 0);
}

{
    const g = obstacleGame(), ability = new ModeAbilities(g);
    ability.dice.roll('player', 4); settle(ability);
    g.ball.pos.x = 300; g.ball.pos.y = 120; g.ball.vel.x = -900; g.ball.vel.y = 0;
    const speed = 900;
    for (let i = 0; i < 20; i++) {
        ability.update(1 / 60);
        g.ball.pos.x += g.ball.vel.x / 60; g.ball.pos.y += g.ball.vel.y / 60;
    }
    assert.ok(g.ball.vel.y > 0, 'pull steers the ball toward the paddle');
    assert.ok(Math.abs(Math.hypot(g.ball.vel.x, g.ball.vel.y) - speed) < 1, 'pull keeps the ball speed');
    assert.ok(Math.abs(g.ball.pos.y - 300) < Math.abs(120 - 300), 'ball ends closer to the paddle centre');
    g.ball.vel.x = 900; g.ball.vel.y = 0;
    ability.update(1 / 60);
    assert.equal(g.ball.vel.y, 0, 'a ball leaving the paddle is not pulled back');
}

{
    const g = obstacleGame(), ability = new ModeAbilities(g);
    g.isMultiplayer = true;
    assert.equal(ability.trigger('ai'), true, 'player two rolls in a local match');
}

console.log('Mode ability behavior passed.');
