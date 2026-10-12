/**
 * Animated windshield view for the speed challenge cockpit.
 * Mirrors the speed-mode game background (BackgroundRenderer.renderSpeed):
 * rainy night city, sodium light-pollution sky, wet road with scrolling lane
 * dashes, passing traffic lights, slanted rain and lightning. The static
 * parts are baked once per size; only the moving parts redraw each frame.
 */
class SpeedCockpitScene {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'cockpit-scene';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.ctx = this.canvas.getContext('2d');

        this.w = 0;
        this.h = 0;
        this.hy = 0;
        this.dpr = 1;
        this.base = null;
        this.sprites = null;

        this.running = false;
        this.paused = false;
        this.raf = 0;
        this.last = 0;
        this.t = 0;
        this.intensity = 0.4;
        this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        this.rain = [];
        this.cars = [];
        this.lightning = { cooldown: 2 + Math.random() * 2, flash: 0, bolt: null, boltAlpha: 0, echo: 0 };
        this.kickState = { amount: 0, color: '61,230,255' };

        this.resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => this.resize())
            : null;

        this._frame = this._frame.bind(this);
    }

    _hash(n) {
        n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
        n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
        return ((n >> 16) ^ n) >>> 0;
    }

    // ------------------------------------------------------------------
    // lifecycle
    // ------------------------------------------------------------------
    setLevel(level) {
        this.intensity = Math.max(0.25, Math.min(1, (level - 1) / 14 + 0.3));
    }

    start() {
        this.attach();
        this.resize();
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        if (this.resizeObserver) this.resizeObserver.observe(this.container);
        if (this.reducedMotion) {
            this._draw(0);
        } else if (!this.paused) {
            this.raf = requestAnimationFrame(this._frame);
        }
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.canvas.remove();
    }

    attach() {
        if (this.canvas.parentNode !== this.container) {
            this.container.insertBefore(this.canvas, this.container.firstChild);
        }
    }

    setPaused(paused) {
        this.paused = paused;
        if (!this.running || this.reducedMotion) return;
        if (paused) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
        } else if (!this.raf) {
            this.last = performance.now();
            this.raf = requestAnimationFrame(this._frame);
        }
    }

    // brief colour flash on hit / fail
    kick(color = 'cyan', strength = 1) {
        const colors = { cyan: '61,230,255', gold: '255,226,122', red: '255,77,109' };
        this.kickState.color = colors[color] || colors.cyan;
        this.kickState.amount = Math.min(1, strength);
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        if (w === this.w && h === this.h && dpr === this.dpr && this.base) return;

        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.hy = Math.round(h * 0.52);
        this.canvas.width = Math.ceil(w * dpr);
        this.canvas.height = Math.ceil(h * dpr);

        this._buildSprites();
        this.base = this._bake();
        this._seed();
        if (this.running && (this.reducedMotion || this.paused)) this._draw(0);
    }

    _seed() {
        const { w, h } = this;
        this.rain = [];
        for (let i = 0; i < 160; i++) {
            this.rain.push({
                x: Math.random() * (w + h * 0.6) - h * 0.3,
                y: Math.random() * h,
                len: 10 + Math.random() * 18,
                speed: 520 + Math.random() * 380,
                a: 0.14 + Math.random() * 0.2
            });
        }
        this.cars = [];
        const lanes = [
            { x: 0.20, dir: 'oncoming' }, { x: 0.36, dir: 'oncoming' },
            { x: 0.62, dir: 'ahead' }, { x: 0.80, dir: 'ahead' }
        ];
        lanes.forEach((lane, i) => {
            this.cars.push({
                lane: lane.x * w,
                dir: lane.dir,
                p: (i * 0.27 + Math.random() * 0.2) % 1
            });
        });
    }

    _buildSprites() {
        const make = (rgb) => {
            const c = document.createElement('canvas');
            c.width = c.height = 64;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.18, `rgba(${rgb},0.85)`);
            grad.addColorStop(0.5, `rgba(${rgb},0.22)`);
            grad.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = grad;
            g.fillRect(0, 0, 64, 64);
            return c;
        };
        this.sprites = { head: make('255,214,150'), tail: make('255,40,52') };
    }

    // ------------------------------------------------------------------
    // static layer: sky, skyline, road
    // ------------------------------------------------------------------
    _bake() {
        const { w, h, hy, dpr } = this;
        const c = document.createElement('canvas');
        c.width = Math.ceil(w * dpr);
        c.height = Math.ceil(h * dpr);
        const g = c.getContext('2d');
        g.scale(dpr, dpr);
        const vx = w * 0.5;

        // sky - sodium light pollution
        const sky = g.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0, '#03040a');
        sky.addColorStop(0.5, '#080810');
        sky.addColorStop(0.82, '#1a120c');
        sky.addColorStop(1, '#2a1a0e');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, hy + 1);

        const dome = g.createRadialGradient(vx, hy + h * 0.05, 0, vx, hy * 0.5, w * 0.8);
        dome.addColorStop(0, 'rgba(210,130,40,0.26)');
        dome.addColorStop(0.35, 'rgba(160,90,20,0.10)');
        dome.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = dome;
        g.fillRect(0, 0, w, hy);

        // far skyline
        const farCount = Math.max(28, Math.floor(w / 34));
        g.fillStyle = '#0c0a14';
        for (let i = 0; i < farCount; i++) {
            const fi = this._hash(0xDEADBEEF + i);
            const xf = (i + (fi & 0xFF) / 510) / farCount;
            const wf = 0.014 + ((fi >> 8 & 0xFF) / 255) * 0.018;
            const hf = 0.05 + ((fi >> 16 & 0xFF) / 255) * 0.11;
            g.fillRect(xf * w, hy - hf * h, Math.max(2, wf * w), hf * h);
        }

        const haze = g.createLinearGradient(0, hy * 0.7, 0, hy);
        haze.addColorStop(0, 'rgba(8,5,14,0)');
        haze.addColorStop(1, 'rgba(26,16,10,0.75)');
        g.fillStyle = haze;
        g.fillRect(0, hy * 0.7, w, hy * 0.3);

        // mid + near buildings with lit windows
        const palette = [[42, 65, 72], [210, 40, 72], [35, 55, 78], [220, 20, 88], [260, 30, 65]];
        const windows = (seed, bx, by, bw, bh, maxY) => {
            const padX = Math.max(2, bw * 0.12);
            const padY = Math.max(3, bh * 0.06);
            const cols = Math.max(1, Math.floor((bw - padX * 2) / 7));
            const gx = (bw - padX * 2) / cols;
            const gy = Math.max(6, bh * 0.07);
            let idx = 0;
            for (let wy = by + padY; wy < maxY - 4; wy += gy) {
                for (let col = 0; col < cols; col++) {
                    const wh = this._hash(seed + idx++);
                    if ((wh & 0xFF) > 118) continue;
                    const [ph, ps, pl] = palette[(wh >> 20) % 5];
                    g.fillStyle = `hsla(${ph},${ps}%,${pl}%,${0.35 + ((wh >> 8 & 0xFF) / 255) * 0.4})`;
                    g.fillRect(bx + padX + col * gx, wy, Math.max(1.5, bw * 0.055), Math.max(1.5, bh * 0.038));
                }
            }
        };

        this.beacons = [];
        const midCount = Math.max(12, Math.floor(w / 80));
        for (let i = 0; i < midCount; i++) {
            const fi = this._hash(0xCAFEBABE + i);
            const xf = (i + (fi & 0xFF) / 380) / midCount;
            const wf = 0.032 + ((fi >> 8 & 0xFF) / 255) * 0.052;
            const hf = 0.12 + ((fi >> 16 & 0xFF) / 255) * 0.26;
            const bx = xf * w, bw = Math.max(4, wf * w), bh = hf * h, by = hy - bh;
            const mg = g.createLinearGradient(0, by, 0, hy);
            mg.addColorStop(0, '#0e0c1c');
            mg.addColorStop(1, '#040310');
            g.fillStyle = mg;
            g.fillRect(bx, by, bw, bh);
            g.fillStyle = 'rgba(150,150,190,0.3)';
            g.fillRect(bx, by, bw, 1.2);
            windows(0xCAFEBABE + i * 1000, bx, by, bw, bh, hy);
            if ((fi >> 24 & 0xFF) > 90) {
                const ax = bx + bw / 2;
                const aH = h * (0.012 + ((fi >> 20 & 0xFF) / 255) * 0.022);
                g.strokeStyle = 'rgba(90,80,150,0.4)';
                g.lineWidth = 1;
                g.beginPath(); g.moveTo(ax, by); g.lineTo(ax, by - aH); g.stroke();
                this.beacons.push({ x: ax, y: by - aH, phase: (fi >> 12 & 0xFF) / 255 * Math.PI * 2 });
            }
        }

        // near buildings flanking the street
        [[0, 0.16], [0.84, 0.16]].forEach(([xf, wf], i) => {
            const fi = this._hash(0xBEEFCAFE + i);
            const bx = xf * w, bw = wf * w;
            const by = hy - h * (0.20 + ((fi >> 8 & 0xFF) / 255) * 0.14);
            g.fillStyle = '#030210';
            g.fillRect(bx, by, bw, h - by);
            g.fillStyle = 'rgba(120,120,170,0.18)';
            g.fillRect(bx, by, bw, 2);
            windows(0xBEEFCAFE + i * 1000, bx, by, bw, h - by, h);
        });

        // wet road
        const road = g.createLinearGradient(0, hy, 0, h);
        road.addColorStop(0, '#1b1109');
        road.addColorStop(0.15, '#140d08');
        road.addColorStop(0.5, '#0a0a10');
        road.addColorStop(1, '#040408');
        g.fillStyle = road;
        g.beginPath();
        g.moveTo(vx - 2, hy);
        g.lineTo(vx + 2, hy);
        g.lineTo(w * 0.86, h);
        g.lineTo(w * 0.14, h);
        g.closePath();
        g.fill();

        // pavements either side of the road
        g.fillStyle = '#07060c';
        g.beginPath(); g.moveTo(vx - 2, hy); g.lineTo(w * 0.14, h); g.lineTo(0, h); g.lineTo(0, hy); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(vx + 2, hy); g.lineTo(w * 0.86, h); g.lineTo(w, h); g.lineTo(w, hy); g.closePath(); g.fill();

        // anisotropic sheen down the middle of the wet asphalt
        const sheen = g.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
        sheen.addColorStop(0, 'rgba(255,170,80,0)');
        sheen.addColorStop(0.5, 'rgba(255,170,80,0.10)');
        sheen.addColorStop(1, 'rgba(255,170,80,0)');
        g.fillStyle = sheen;
        g.fillRect(0, hy, w, h - hy);

        // road edge lines
        g.strokeStyle = 'rgba(210,150,80,0.22)';
        g.lineWidth = 1.5;
        [0.14, 0.86].forEach(x => {
            g.beginPath(); g.moveTo(vx, hy); g.lineTo(w * x, h); g.stroke();
        });

        // horizon glow
        const glow = g.createRadialGradient(vx, hy, 0, vx, hy, w * 0.5);
        glow.addColorStop(0, 'rgba(255,160,70,0.28)');
        glow.addColorStop(0.4, 'rgba(120,70,30,0.10)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = glow;
        g.fillRect(0, hy - h * 0.14, w, h * 0.2);

        return c;
    }

    // ------------------------------------------------------------------
    // animated layer
    // ------------------------------------------------------------------
    _frame(now) {
        if (!this.running || this.paused) { this.raf = 0; return; }
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this._draw(dt);
        this.raf = requestAnimationFrame(this._frame);
    }

    _draw(dt) {
        const { ctx, w, h, hy, dpr } = this;
        if (!w || !this.base) return;
        this.t += dt;
        const t = this.t;
        const vx = w * 0.5;
        const k = this.intensity;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(this.base, 0, 0, w, h);

        // blinking aircraft beacons
        ctx.fillStyle = 'rgba(255,50,50,0.9)';
        for (const b of this.beacons) {
            if (Math.sin(t * 1.8 + b.phase) > 0.5) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        this._drawLaneDashes(t, vx);
        this._drawTraffic(dt);
        this._drawRain(dt);
        this._drawWiper(t);
        this._drawLightning(dt);

        // hit / fail colour kick
        if (this.kickState.amount > 0.01) {
            ctx.fillStyle = `rgba(${this.kickState.color},${(this.kickState.amount * 0.2).toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
            this.kickState.amount *= Math.pow(0.02, dt);
        }
    }

    _drawLaneDashes(t, vx) {
        const { ctx, w, h, hy } = this;
        const scroll = (t * (0.5 + this.intensity * 0.5)) % 1;
        const span = h - hy;
        [0.34, 0.5, 0.66].forEach(bx => {
            const baseX = w * bx;
            for (let s = 0; s < 14; s++) {
                const t0 = ((s / 14) + scroll / 14) % 1;
                const t1 = Math.min(1, t0 + 0.034);
                if (t1 <= t0) continue;
                const e0 = Math.pow(t0, 1.5), e1 = Math.pow(t1, 1.5);
                ctx.strokeStyle = `rgba(255,190,110,${(0.05 + e0 * 0.3).toFixed(3)})`;
                ctx.lineWidth = 0.6 + e0 * 2.2;
                ctx.beginPath();
                ctx.moveTo(vx + (baseX - vx) * e0, hy + span * e0);
                ctx.lineTo(vx + (baseX - vx) * e1, hy + span * e1);
                ctx.stroke();
            }
        });
    }

    _drawTraffic(dt) {
        const { ctx, w, h, hy } = this;
        const vx = w * 0.5;
        const span = h - hy;
        const k = this.intensity;

        for (const car of this.cars) {
            const rate = car.dir === 'oncoming' ? 0.2 + k * 0.12 : 0.07 + k * 0.04;
            car.p += dt * rate * (0.5 + car.p * 1.4);
            if (car.p > 1.08) car.p = 0.02;

            const e = Math.pow(car.p, 1.6);
            const x = vx + (car.lane - vx) * e;
            const y = hy + span * e;
            const size = 5 + e * 56;
            const gap = size * 0.9;
            const sprite = car.dir === 'oncoming' ? this.sprites.head : this.sprites.tail;
            const fade = Math.min(1, car.p * 6) * Math.min(1, (1.08 - car.p) * 8);

            // car body silhouette (ahead only; oncoming is just headlights)
            if (car.dir === 'ahead') {
                this.ctx.globalAlpha = fade;
                ctx.fillStyle = '#030309';
                ctx.fillRect(x - gap - size * 0.1, y - size * 0.55, gap * 2 + size * 0.2, size * 0.6);
            }

            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = fade;
            const s = size * 2.2;
            ctx.drawImage(sprite, x - gap - s / 2, y - s / 2 - size * 0.1, s, s);
            ctx.drawImage(sprite, x + gap - s / 2, y - s / 2 - size * 0.1, s, s);

            // wet-road reflection smear
            ctx.globalAlpha = fade * 0.32;
            ctx.drawImage(sprite, x - gap - s * 0.3, y + size * 0.1, s * 0.6, s * 1.8);
            ctx.drawImage(sprite, x + gap - s * 0.3, y + size * 0.1, s * 0.6, s * 1.8);

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    }

    _drawRain(dt) {
        const { ctx, w, h } = this;
        const count = Math.floor(70 + this.intensity * 90);
        const slant = 0.6;
        ctx.lineWidth = 1;
        for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass === 0 ? 'rgba(180,195,225,0.17)' : 'rgba(215,225,245,0.32)';
            ctx.beginPath();
            for (let i = pass; i < count; i += 2) {
                const d = this.rain[i];
                d.y += d.speed * dt;
                d.x -= d.speed * slant * dt;
                if (d.y > h || d.x < -40) {
                    d.y = -d.len;
                    d.x = Math.random() * (w + h * 0.6);
                }
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + d.len * slant, d.y - d.len);
            }
            ctx.stroke();
        }
    }

    _drawWiper(t) {
        const { ctx, w, h } = this;
        const period = 8;
        const phase = (t % period) / 1.6;
        if (phase >= 1) return;
        const sweep = Math.sin(phase * Math.PI); // out and back
        const a = -Math.PI * 0.86 + sweep * Math.PI * 0.72;
        const px = w * 0.32, py = h * 1.06, len = h * 1.0;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(2,3,8,0.85)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(160,180,220,0.18)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px + 2, py);
        ctx.lineTo(px + 2 + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
        ctx.restore();
    }

    _drawLightning(dt) {
        const { ctx, w, h, hy } = this;
        const L = this.lightning;

        L.cooldown -= dt;
        if (L.cooldown <= 0) {
            L.cooldown = (3.2 + Math.random() * 4.5) / (0.6 + this.intensity);
            L.flash = 1;
            L.echo = 0.14;
            L.boltAlpha = 1;
            L.bolt = this._buildBolt(Math.random() * w * 0.8 + w * 0.1, hy * (0.72 + Math.random() * 0.2));
        }

        if (L.echo > 0) {
            L.echo -= dt;
            if (L.echo <= 0) L.flash = Math.max(L.flash, 0.8);
        }

        if (L.flash > 0.01) {
            ctx.fillStyle = `rgba(185,205,255,${(L.flash * 0.3).toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
            L.flash *= Math.pow(0.004, dt);
        }

        if (L.bolt && L.boltAlpha > 0.02) {
            ctx.save();
            ctx.strokeStyle = `rgba(235,242,255,${L.boltAlpha.toFixed(3)})`;
            ctx.shadowColor = 'rgba(140,180,255,0.9)';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            L.bolt.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
            ctx.restore();
            L.boltAlpha *= Math.pow(0.01, dt);
        }
    }

    _buildBolt(x, endY) {
        const pts = [{ x, y: 0 }];
        const segs = 9;
        let cx = x;
        for (let i = 1; i <= segs; i++) {
            cx += (Math.random() - 0.5) * 46;
            pts.push({ x: cx, y: (endY * i) / segs });
        }
        return pts;
    }
}
