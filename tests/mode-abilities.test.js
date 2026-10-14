const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const diceSource = fs.readFileSync(path.join(__dirname, '../game/js/modes/obstacle-dice.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../game/js/modes/mode-abilities.js'), 'utf8');
class Ball {
    constructor(x, y, r) { this.pos = { x, y }; this.vel = { x: 0, y: 0 }; this.r = r; }
}
const context = { window: {}, Math, Ball, setTimeout };
vm.createContext(context);
vm.runInContext(diceSource, context);
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

{
    const wellSource = fs.readFileSync(path.join(__dirname, '../game/js/entities/gravity-well.js'), 'utf8');
    const wellContext = {
        window: { game: { width: 1000, height: 600 } },
        Vec2: class { constructor(x, y) { this.x = x; this.y = y; } },
        PhysicsCore: { gravityWell() { throw new Error('attraction used during polarity pulse'); } },
        Math
    };
    vm.createContext(wellContext);
    vm.runInContext(wellSource + '\nwindow.TestWell = GravityWell;', wellContext);
    const well = new wellContext.window.TestWell(200, 300);
    const ball = { pos: { x: 260, y: 300 }, vel: { x: 0, y: 0 } };
    well.pulseRemaining = 0.62;
    well.applyGravity(ball, 1 / 60, false);
    assert.ok(ball.vel.x > 0, 'polarity pulse pushes the ball away from the well');
    ball.pos.x = 200; ball.pos.y = 300; ball.vel.x = 100; ball.vel.y = 0;
    well.applyGravity(ball, 1 / 60, false);
    assert.ok(ball.vel.x > 100, 'pulse also works at the center of the well');
}

{
    const g = game('gravity');
    const near = { pos: { x: 190, y: 310 }, radius: 90, active: true };
    const far = { pos: { x: 800, y: 310 }, radius: 90, active: true };
    g.gravityWells = [far, near];
    const ability = new ModeAbilities(g);
    assert.equal(ability.trigger('player'), true);
    assert.equal(near.pulseRemaining, 0.62);
    assert.equal(far.pulseRemaining, undefined);
    ability.update(0.63);
    assert.equal(near.pulseRemaining, 0);
    g.ball.pos.x = 190; g.ball.pos.y = 310;
    near.pulseRemaining = 0.2;
    ability.update(3.5);
    near.pulseRemaining = 0.2;
    assert.equal(ability.trigger('player'), false, 'another well cannot steal the pulse while the nearest is active');
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
