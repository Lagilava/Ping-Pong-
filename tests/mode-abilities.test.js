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
    g.ball.pos.x = 160;
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
    g.ball.vel.x = -900;
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

{
    const g = game('obstacle'), ability = new ModeAbilities(g);
    g.ball.pos.x = ability.flipperX('player') + 15;
    g.obstacleCourse = { courseRouteIndex: 0, courseRoute: { points: [{ x: 600, y: 450 }] } };
    assert.equal(ability.trigger('player'), true);
    assert.equal(ability.side('player').y, g.player.pos.y + g.player.h / 2, 'flipper stays aligned with the paddle');
    ability.collideFlipper(g.ball);
    assert.ok(g.ball.vel.x > 0, 'flipper sends ball across court');
    assert.ok(g.ball.vel.y > 0, 'flipper aims toward the checkpoint');
    assert.equal(g.ball.lastHit, 'player', 'flipper claims the shot for route and coin scoring');
    assert.equal(ability.side('player').active, 0, 'one launch per activation');
    assert.ok(Math.abs(g.ball.pos.x - ability.flipperX('player')) < 30, 'launch does not teleport the ball across the court');
}

{
    const g = game('obstacle'), ability = new ModeAbilities(g);
    g.isMultiplayer = true;
    g.ball.pos.x = ability.flipperX('ai') - 15;
    g.ball.vel.x = 900;
    assert.equal(ability.trigger('ai'), true);
    ability.collideFlipper(g.ball);
    assert.equal(g.ball.lastHit, 'ai', 'player two flipper claims its shot');
    assert.ok(g.ball.vel.x < 0, 'player two flipper sends the ball left');
}

console.log('Mode ability behavior passed.');
