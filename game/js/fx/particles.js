class Particle {
    constructor() {
        this.pos = { x: 0, y: 0 };
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };

        this.color = "#ffffff";
        this.size = 1;
        this.baseSize = 1;

        this.life = 0;
        this.maxLife = 0;
        this.decay = 0;

        this.visible = false;
    }

    reset(x, y, color = "#00ffaa", size = 3, life = 0.35, options = {}) {
        this.pos.x = x;
        this.pos.y = y;
        this.vel.x = 0;
        this.vel.y = 0;

        // Almost no acceleration → cartoony instant burst
        this.acc.x = (Math.random() - 0.5) * 1.5;
        this.acc.y = (Math.random() - 0.5) * 1.5;   // very subtle or zero in many cases

        const speed = options.speed || (180 + Math.random() * 220);
        const angle = Math.random() * Math.PI * 2;
        this.vel.x = Math.cos(angle) * speed;
        this.vel.y = Math.sin(angle) * speed;

        this.color = color;           // keep vivid – no heavy desaturation
        this.size = this.baseSize = size * (0.7 + Math.random() * 0.8);

        this.life = this.maxLife = life * (0.7 + Math.random() * 0.6);
        this.decay = 1 / (this.maxLife * 60);

        this.visible = true;
        return this;
    }

    update(dt) {
        if (!this.visible) return false;

        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        this.life -= this.decay * dt * 60;
        this.size = this.baseSize * (this.life / this.maxLife) ** 0.7; // slight squash feel

        return this.life > 0;
    }

    render(ctx) {
        if (!this.visible) return;

        const alpha = this.life / this.maxLife;
        const sz = Math.max(1, this.size);

        ctx.save();

        // Big, soft glow (cartoony bloom)
        const glowSz = sz * 2.8;
        const g = ctx.createRadialGradient(
            this.pos.x, this.pos.y, 0,
            this.pos.x, this.pos.y, glowSz
        );
        g.addColorStop(0, this.color + 'e0');   // strong center
        g.addColorStop(0.4, this.color + '60');

        g.addColorStop(1, this.color + '00');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, glowSz, 0, Math.PI * 2);
        ctx.fill();

        // Solid core – no extra gradient / highlight
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, sz, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ===================================================================
// PARTICLE SYSTEM – lower counts, snappier
// ===================================================================
class ParticleSystem {
    constructor(maxParticles = 2400) {   // can even go lower (1200–1800)
        this.maxParticles = maxParticles;
        this.pool = new Array(maxParticles);
        this.active = [];
        this.spawnQueue = [];
        this.enabled = true;

        for (let i = 0; i < maxParticles; i++) {
            this.pool[i] = new Particle();
        }

        this.poolIndex = maxParticles - 1;
    }

    _acquire() {
        if (this.poolIndex >= 0) {
            return this.pool[this.poolIndex--];
        }
        return null;
    }

    _release(p) {
        p.visible = false;
        this.pool[++this.poolIndex] = p;
    }

    // ────────────────────────────────────────────────
    //   Main effects – fewer particles, bigger & snappier
    // ────────────────────────────────────────────────

    spawnGodTierHit(x, y, color = '#00ffaa', speed = 1000) {
        if (!this.enabled || !areParticleEffectsEnabled()) return;
        const power = Math.min(2.2, speed / 700);
        const intensity = 1 + power * 0.7;

        // Core pop
        this._spawnBurst(x, y, color, 10 * intensity, 1100, 0.28, 4.5);
        // White flash
        this._spawnBurst(x, y, '#ffffff', 6 * intensity, 1400, 0.18, 5);
        // Secondary vivid color
        this._spawnBurst(x, y, this._lightenColor(color, 50), 8 * intensity, 900, 0.24, 4);

        // Tiny sparkles
        for (let i = 0; i < 4 * intensity; i++) {
            this.spawnSparkle(
                x + (Math.random() - 0.5) * 24,
                y + (Math.random() - 0.5) * 24,
                '#ffffff',
                3.5 + Math.random() * 4,
                0.18 + Math.random() * 0.14
            );
        }
    }

    _spawnBurst(x, y, color, count, speedRange, life, size) {
        if (!this.enabled || !areParticleEffectsEnabled()) return;
        count = Math.min(count, 18);   // hard cap – performance
        // Thin the burst on lower tiers; keep at least one so hits still read.
        count = Math.max(1, Math.round(count * PerfGovernor.particleScale));

        for (let i = 0; i < count; i++) {
            const p = this._acquire();
            if (!p) break;

            const angle = Math.random() * Math.PI * 2;
            const spd = speedRange * (0.65 + Math.random() * 0.7);

            p.reset(x, y, color, size, life, { speed: spd });

            // override – strong directional burst
            p.vel.x = Math.cos(angle) * spd;
            p.vel.y = Math.sin(angle) * spd;
            p.acc.x = p.acc.y = 0;           // no gravity – pure explosion

            this.spawnQueue.push(p);
        }
    }

    // simple horizontal/vertical flash line (for laser impacts)
    _spawnLine(x1, y1, x2, y2, color, thickness = 2, life = 0.05) {
        if (!this.enabled || !areParticleEffectsEnabled()) return;
        // place a few tightly spaced particles along the line
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const segs = Math.max(1, Math.floor(dist / 8));
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            const p = this._acquire();
            if (!p) continue;
            p.reset(px, py, color, thickness, life);
            p.vel.x = p.vel.y = 0;
            p.acc.x = p.acc.y = 0;
            this.spawnQueue.push(p);
        }
    }

    spawnSparkle(x, y, color, size = 4, life = 0.22) {
        if (!this.enabled || !areParticleEffectsEnabled()) return;
        const p = this._acquire();
        if (!p) return;

        p.reset(x, y, color, size, life);

        p.vel.x = (Math.random() - 0.5) * 320;
        p.vel.y = (Math.random() - 0.5) * 320 - 80;
        p.acc.x = p.acc.y = 0;   // float freely – cartoony

        this.spawnQueue.push(p);
    }

    spawnSparkleWave(x, y, color, speed = 500) {
        if (!this.enabled || !areParticleEffectsEnabled()) return;
        const count = Math.min(20, Math.floor(speed / 25)); // scale count with speed
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const dist = 10 + Math.random() * 30;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            this.spawnSparkle(px, py, color, 3 + Math.random() * 4, 0.15 + Math.random() * 0.1);
        }
    }

    spawnLaserImpact(x, y, color = '#00ffff', speed = 800) {  // default to cyan electric blue
        if (!this.enabled || !areParticleEffectsEnabled()) return;

        const intensity = Math.min(3.0, speed / 300);  // scales up nicely for faster shots

        // quick bright line to hint at the beam path
        this._spawnLine(x - 30, y, x + 30, y, '#ffffff', 2 + intensity, 0.04);

        // ─── 1. OVERBRIGHT PLASMA CORE FLASH ───
        // White-hot center + cyan halo burst
        this._spawnBurst(x, y, '#ffffff',
            6 + 5 * intensity,
            1800, 0.12, 8.5          // huge, fast-fading pop
        );
        this._spawnBurst(x, y, '#00ffff',   // cyan plasma
            5 + 4 * intensity,
            1500, 0.10, 7
        );

        // ─── 2. MAIN ELECTRIC EJECTION / PLASMA SPARKS ───
        // Assume laser from top; eject mostly downward + sideways with electric jitter
        const incomingAngle = -Math.PI / 2;  // top-down; pass as param if directional

        for (let i = 0; i < 14 * intensity; i++) {
            const p = this._acquire();
            if (!p) break;

            // Wide backward cone + electric zig-zag feel
            const spread = (Math.random() - 0.5) * 1.6;
            const angle = incomingAngle + Math.PI + spread;

            const spd = speed * (1.0 + Math.random() * 1.2);  // 1–2.2× speed

            p.reset(x, y, '#aaffff',  // bright cyan-white
                3 + Math.random() * 5,
                0.14 + Math.random() * 0.10,
                { speed: spd }
            );

            p.vel.x = Math.cos(angle) * spd * 1.4;
            p.vel.y = Math.sin(angle) * spd * 0.8;

            // Electric jitter + fast gravity drop
            p.acc.x = (Math.random() - 0.5) * 120;   // side jitter
            p.acc.y = 180 + Math.random() * 100;     // snap downward

            this.spawnQueue.push(p);
        }

        // ─── 3. INWARD RETURN ARCS (sci-fi discharge snap-back) ───
        for (let i = 0; i < 5 + 3 * intensity; i++) {
            const p = this._acquire();
            if (!p) break;

            const angle = Math.random() * Math.PI * 2;
            const spd = 400 + Math.random() * 600;  // fast inward pull

            p.reset(x, y, '#88ffff',
                2.5 + Math.random() * 3,
                0.09 + Math.random() * 0.06,
                { speed: spd }
            );

            // Pull toward center-ish (negative velocity)
            p.vel.x = Math.cos(angle) * spd * -0.7;
            p.vel.y = Math.sin(angle) * spd * -0.7;

            p.acc.x = (Math.random() - 0.5) * 80;
            p.acc.y = (Math.random() - 0.5) * 80;  // chaotic inward jitter

            this.spawnQueue.push(p);
        }

        // ─── 4. TINY FORKING LIGHTNING SPARKLES ───
        for (let i = 0; i < 8 * intensity; i++) {
            this.spawnSparkle(
                x + (Math.random() - 0.5) * 18,
                y + (Math.random() - 0.5) * 18,
                Math.random() < 0.6 ? '#ffffff' : '#00aaff',  // mix white & electric blue
                4 + Math.random() * 6,
                0.11 + Math.random() * 0.08
            );
        }

        // Optional: quick radial energy ring for plasma wave feel
        this._spawnBurst(x, y, '#00ffff', 7 * intensity, 1000, 0.18, 4.5);
    }


    // Legacy compatibility for external callers (e.g. UI enhancements)
    // Signature kept permissive: (x, y, color, count, speed, life, size, ...)
    spawnBurst(x, y, color = '#ffffff', count = 10, speed = 600, life = 0.2, size = 3) {
        this._spawnBurst(x, y, color, count, speed, life, size);
    }

    // ────────────────────────────────────────────────
    //   Core loop (unchanged – already efficient)
    // ────────────────────────────────────────────────

    update(dt) {
        if (!this.enabled || !areParticleEffectsEnabled()) {
            if (this.active.length || this.spawnQueue.length) this.clear();
            return;
        }
        if (dt > 0.1) dt = 0.1;

        if (this.spawnQueue.length > 0) {
            this.active.push(...this.spawnQueue);
            this.spawnQueue.length = 0;
        }

        let alive = 0;
        for (let i = 0; i < this.active.length; i++) {
            const p = this.active[i];
            if (p.update(dt)) {
                this.active[alive++] = p;
            } else {
                this._release(p);
            }
        }
        this.active.length = alive;
    }

    render(ctx) {
        if (!this.enabled || !areParticleEffectsEnabled() || !this.active.length) return;

        // optional sort – helps a bit with overdraw
        this.active.sort((a, b) => b.size - a.size);

        for (const p of this.active) p.render(ctx);
    }

    clear() {
        this.active.forEach(p => this._release(p));
        this.active.length = this.spawnQueue.length = 0;
    }

    setEnabled(state) {
        this.enabled = state;
        if (!state) this.clear();
    }

    _lightenColor(color, percent) {
        if (!color?.startsWith?.('#')) return '#ffffff';
        const num = parseInt(color.slice(1), 16);
        const amt = Math.round(2.55 * percent);
        const r = Math.min(255, (num >> 16) + amt);
        const g = Math.min(255, ((num >> 8) & 255) + amt);
        const b = Math.min(255, (num & 255) + amt);
        return `#${(0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    get activeCount() { return this.active.length; }
}



// Audio Engine
