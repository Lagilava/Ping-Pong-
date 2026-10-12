/**
 * Lightweight animated backdrop for the speed challenge cockpit.
 * Pure DOM + CSS: every moving piece animates only transform/opacity, so it
 * runs on the compositor with no per-frame JavaScript and no canvas.
 * Theme matches the speed-mode game background: rainy night city, sodium
 * glow on the horizon, wet road with lane dashes and passing headlights.
 * Styles live in css/speed-challenge-redesign.css (.cockpit-scene).
 */
class SpeedCockpitScene {
    constructor(container) {
        this.container = container;
        this.node = document.createElement('div');
        this.node.className = 'cockpit-scene';
        this.node.setAttribute('aria-hidden', 'true');
        this.node.innerHTML = this._markup();
        this.kickEl = this.node.querySelector('.sc-kick');
        this.kickTimer = 0;
    }

    // Skyline tile as an SVG data URI (built once per layer, never redrawn)
    _skyline(seed, minH, maxH, fill, windowChance) {
        let state = seed;
        const rnd = () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
        let rects = '';
        let x = 0;
        while (x < 1000) {
            const w = 28 + rnd() * 52;
            const h = minH + rnd() * (maxH - minH);
            const y = 100 - h;
            rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
            for (let wy = y + 5; wy < 96; wy += 7) {
                for (let wx = x + 4; wx < x + w - 5; wx += 8) {
                    if (rnd() < windowChance) {
                        const warm = rnd() < 0.7;
                        rects += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="3" fill="${warm ? '#ffb45a' : '#7fe9ff'}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
                    }
                }
            }
            x += w + rnd() * 6;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none">${rects}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }

    _markup() {
        const far = this._skyline(7, 14, 42, '#0d0b1a', 0.12);
        const near = this._skyline(31, 28, 72, '#06050f', 0.2);

        let dashes = '';
        // three lane lines drifting from the horizon toward the viewer
        [-16, 0, 16].forEach(lane => {
            for (let i = 0; i < 6; i++) {
                dashes += `<i class="sc-dash" style="--lx:${lane}cqw;--d:${(i * -0.5).toFixed(2)}s"></i>`;
            }
        });

        // [lane offset in cqw, type, delay]
        const cars = [[-30, 'head', 0], [-12, 'head', -2.4], [14, 'tail', -1.1], [32, 'tail', -3.6]]
            .map(([lx, type, d]) => `<i class="sc-car ${type}" style="--lx:${lx}cqw;--d:${d}s"></i>`).join('');

        let rain = '';
        for (let i = 0; i < 16; i++) {
            rain += `<i class="sc-rain" style="--x:${(i * 6.4 + (i % 3) * 2).toFixed(1)}cqw;--d:${(-(i * 0.173) % 1.1).toFixed(2)}s;--s:${(0.8 + (i % 4) * 0.12).toFixed(2)}s"></i>`;
        }

        return `
            <div class="sc-sky"></div>
            <div class="sc-glow"></div>
            <div class="sc-skyline far" style="background-image:${far}"></div>
            <div class="sc-skyline near" style="background-image:${near}"></div>
            <i class="sc-beacon" style="left:18%"></i>
            <i class="sc-beacon" style="left:57%;animation-delay:-0.7s"></i>
            <i class="sc-beacon" style="left:83%;animation-delay:-1.3s"></i>
            <div class="sc-ground">
                <div class="sc-road"></div>
                ${dashes}
                ${cars}
            </div>
            ${rain}
            <div class="sc-flash"></div>
            <div class="sc-kick"></div>`;
    }

    // intensity: higher player levels make the storm and traffic quicker
    setLevel(level) {
        const speed = Math.max(0.55, 1 - (level - 1) * 0.035);
        this.node.style.setProperty('--sc-speed', speed.toFixed(2));
    }

    start() {
        if (this.node.parentNode !== this.container) {
            this.container.insertBefore(this.node, this.container.firstChild);
        }
    }

    stop() {
        clearTimeout(this.kickTimer);
        this.node.remove();
    }

    setPaused(paused) {
        this.node.classList.toggle('sc-paused', paused);
    }

    // brief colour flash on hit / fail
    kick(color = 'cyan', strength = 1) {
        const colors = { cyan: '61,230,255', gold: '255,226,122', red: '255,77,109' };
        const el = this.kickEl;
        el.style.setProperty('--kick', colors[color] || colors.cyan);
        el.style.setProperty('--kick-a', (0.1 + strength * 0.2).toFixed(2));
        el.classList.remove('on');
        void el.offsetWidth;
        el.classList.add('on');
    }
}
