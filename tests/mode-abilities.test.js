const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../game/js/modes/mode-abilities.js'), 'utf8');
const context = { window: {}, Math };
vm.createContext(context);
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
    assert.equal(ability.trigger('player'), true);
    assert.equal(ability.speedScale(), 0.42);
    ability.onPaddleHit('player', g.ball);
    assert.equal(ability.speedScale(), 1);
    assert.ok(g.ball.getSpeed() > 900, 'parry boosts the return');
    assert.ok(g.ball.maxSpeed > 2200, 'sonic return temporarily raises the speed cap');
    ability.update(0.49);
    assert.equal(g.ball.maxSpeed, 2200, 'speed cap returns after the sonic trail');
    assert.equal(ability.trigger('player'), false, 'cooldown blocks immediate reuse');
    ability.update(1.82);
    assert.equal(ability.trigger('player'), true);
    ability.update(0.23);
    assert.equal(ability.speedScale(), 1, 'missed parry expires');
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
}

{
    const g = game('obstacle'), ability = new ModeAbilities(g);
    g.ball.pos.x = ability.flipperX('player') + 15;
    g.obstacleCourse = { courseRouteIndex: 0, courseRoute: { points: [{ y: 450 }] } };
    assert.equal(ability.trigger('player'), true);
    ability.collideFlipper(g.ball);
    assert.ok(g.ball.vel.x > 0, 'flipper sends ball across court');
    assert.ok(g.ball.vel.y > 0, 'flipper aims toward the checkpoint');
    assert.equal(ability.side('player').active, 0, 'one launch per activation');
}

console.log('Mode ability behavior passed.');
