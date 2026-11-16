const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({
    window: {}, areParticleEffectsEnabled: () => true,
    PerfGovernor: { particleScale: 1 }
});
function load(file, name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js', file), 'utf8') +
        `\nwindow.${name} = ${name};`, context);
    return context.window[name];
}
const ParticleSystem = load('fx/particles.js', 'ParticleSystem');
const particles = new ParticleSystem(12);
// Clearing before the next physics update must return queued particles too.
for (let cycle = 0; cycle < 100; cycle++) {
    particles.spawnBurst(10, 10, '#ffffff', 12);
    assert.equal(particles.spawnQueue.length, 12);
    particles.clear();
    assert.equal(particles.poolIndex, 11);
    assert.equal(new Set(particles.pool).size, 12);
}
particles.spawnBurst(10, 10, '#ffffff', 12);
particles.update(1 / 240);
const rendered = [];
for (const p of particles.active) p.render = () => rendered.push(p.size);
particles.render({});
assert.deepEqual(rendered, [...rendered].sort((a, b) => b - a));
const order = [...particles.active];
particles.render({});
assert.deepEqual([...particles.active], order, 'repeat renders preserve draw order');
particles.clear();
assert.equal(particles.poolIndex, 11);

const Obstacle = load('modes/obstacles.js', 'Obstacle');
const hitParticles = Array.from({ length: 80 }, (_, i) => ({
    x: i, y: 100 - i, vx: i - 40, vy: i * 3, life: i / 100
}));
let reference = hitParticles.map(p => ({ ...p }));
const obstacle = { hitParticles };
for (let step = 0; step < 240; step++) {
    const dt = step % 2 ? 1 / 120 : 1 / 240;
    reference = reference.filter(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt;
        p.vx *= Math.pow(0.92, dt * 60); p.vy *= Math.pow(0.96, dt * 60);
        p.life -= dt;
        return p.life > 0;
    });
    Obstacle.prototype._updateParticles.call(obstacle, dt);
    assert.equal(obstacle.hitParticles, hitParticles, 'reuse storage');
    assert.deepEqual(obstacle.hitParticles, reference, 'identical positions, fading and order');
}
console.log('Particle pool reuse, draw ordering and exact obstacle effect equivalence passed.');
