/**
 * Classic mode scenery: a packed table tennis arena at night, matching the
 * Classic key art on the menu card. Red banners with the paddle crest hang
 * from a lighting truss, spotlights sweep over two tiers of crowd, LED boards
 * scroll and the glossy floor mirrors the lights.
 *
 * Everything static (roof, truss, banners, crowd, boards, floor) is painted
 * once into offscreen canvases at the canvas pixel scale. A frame is a few
 * drawImage calls: the base, the scrolling LED strips, five spotlight beams
 * and their floor pools (additive), camera flashes, and the vignette. No
 * draw-time blur.
 */
(function () {
    const TAU = Math.PI * 2;
    // Custom Match retains its original palette when it selects this backdrop.
    const cardColor = (original, matched) => window.game?.gameMode === 'customise' ? original : matched;
    const FLOOR = 0.6;      // floor horizon as a fraction of the screen height
    const SPOTS = [0.1, 0.29, 0.5, 0.71, 0.9];

    function rng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    function canvas(w, h, sx, sy) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * sx));
        c.height = Math.max(1, Math.round(h * sy));
        const x = c.getContext('2d');
        x.setTransform(sx, 0, 0, sy, 0, 0);
        return [c, x];
    }

    function glowSprite(rgb, size = 128) {
        const [c, x] = canvas(size, size, 1, 1);
        const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.2, `rgba(${rgb},0.55)`);
        g.addColorStop(0.55, `rgba(${rgb},0.14)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, size, size);
        return c;
    }

    // ── Layout shared by the base painter and the per-frame pass ─────────
    function layout(w, h) {
        const fy = Math.round(h * FLOOR);
        return {
            fy,
            upper: [h * 0.205, h * 0.355],   // upper bowl crowd
            ribbon: [h * 0.355, h * 0.383],  // LED ribbon between the tiers
            lower: [h * 0.383, h * 0.556],   // lower bowl crowd
            board: [h * 0.556, fy],          // courtside LED boards
            truss: { cx: w * 0.5, cy: -h * 0.62, rx: w * 0.78, ry: h * 0.74 },
        };
    }

    function trussY(L, x) {
        const t = L.truss;
        const u = (x - t.cx) / t.rx;
        return t.cy + t.ry * Math.sqrt(Math.max(0, 1 - u * u));
    }

    // ── Roof, haze and lighting truss ───────────────────────────────────
    function paintRoof(x, w, h, L) {
        const g = x.createLinearGradient(0, 0, 0, L.fy);
        g.addColorStop(0, '#05020a');
        g.addColorStop(0.3, '#0d0410');
        g.addColorStop(0.62, '#1d0714');
        g.addColorStop(1, '#2a0a18');
        x.fillStyle = g;
        x.fillRect(0, 0, w, L.fy + 1);

        // Warm haze hanging under the roof, brightest in the middle.
        const hz = x.createRadialGradient(w * 0.5, h * 0.12, 0, w * 0.5, h * 0.12, w * 0.6);
        hz.addColorStop(0, cardColor('rgba(255,60,90,0.22)', 'rgba(255,35,95,0.28)'));
        hz.addColorStop(0.5, 'rgba(160,20,70,0.1)');
        hz.addColorStop(1, 'rgba(60,0,30,0)');
        x.fillStyle = hz;
        x.fillRect(0, 0, w, L.fy);

        // Roof ribs radiating from the centre of the dome.
        x.strokeStyle = 'rgba(120,50,90,0.16)';
        x.lineWidth = 1;
        x.beginPath();
        for (let i = 0; i <= 18; i++) {
            const a = Math.PI * (0.05 + 0.9 * i / 18);
            x.moveTo(w * 0.5, -h * 0.5);
            x.lineTo(w * 0.5 - Math.cos(a) * w * 1.1, -h * 0.5 + Math.sin(a) * h * 0.78);
        }
        x.stroke();
    }

    function paintTruss(x, w, h, L, lights) {
        // Two curved chords with a zig-zag lattice between them.
        const path = (dy) => {
            x.beginPath();
            for (let i = 0; i <= 64; i++) {
                const px = -w * 0.02 + (w * 1.04) * i / 64;
                const py = trussY(L, px) + dy;
                if (i) x.lineTo(px, py); else x.moveTo(px, py);
            }
        };
        const depth = h * 0.024;
        x.lineCap = 'round';
        x.strokeStyle = '#2a1a26';
        x.lineWidth = 3;
        path(0); x.stroke();
        path(depth); x.stroke();
        x.strokeStyle = 'rgba(70,40,60,0.9)';
        x.lineWidth = 1.2;
        x.beginPath();
        const n = 70;
        for (let i = 0; i < n; i++) {
            const a = -w * 0.02 + (w * 1.04) * i / n;
            const b = -w * 0.02 + (w * 1.04) * (i + 1) / n;
            x.moveTo(a, trussY(L, a));
            x.lineTo(b, trussY(L, b) + depth);
        }
        x.stroke();
        // Highlight on the top chord where the haze catches it.
        x.strokeStyle = 'rgba(255,120,150,0.28)';
        x.lineWidth = 1;
        path(-1.5); x.stroke();

        // Rows of lamps along the lower chord, a few big spotlight housings.
        const r = rng(77);
        for (let i = 0; i < 46; i++) {
            const px = w * (0.02 + 0.96 * i / 45) + (r() - 0.5) * 6;
            const py = trussY(L, px) + depth + 3;
            const warm = r() < 0.65;
            lights.push({ x: px, y: py, s: 7 + r() * 6, warm });
        }
        for (const sxF of SPOTS) {
            const px = w * sxF, py = trussY(L, px) + depth;
            x.fillStyle = '#1b1018';
            x.beginPath();
            x.ellipse(px, py + 6, 9, 7, 0, 0, TAU);
            x.fill();
            x.strokeStyle = 'rgba(255,170,190,0.45)';
            x.lineWidth = 1;
            x.stroke();
            lights.push({ x: px, y: py + 9, s: 20, warm: true, spot: true });
        }
    }

    function paintLights(x, lights, glowW, glowR) {
        for (const l of lights) {
            const s = l.s * (l.spot ? 1.6 : 1);
            x.drawImage(l.warm ? glowW : glowR, l.x - s, l.y - s, s * 2, s * 2);
            x.fillStyle = l.warm ? cardColor('#fff3e8', '#ffe5f0') : '#ffd0dc';
            x.beginPath();
            x.arc(l.x, l.y, l.spot ? 3.2 : 1.4, 0, TAU);
            x.fill();
        }
    }

    // ── Banners with the paddle crest ───────────────────────────────────
    function paintBanner(x, cx, top, bw, bh, far) {
        x.save();
        // Hanging wires.
        x.strokeStyle = 'rgba(40,20,30,0.9)';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(cx - bw * 0.35, top - bh * 0.3); x.lineTo(cx - bw * 0.35, top);
        x.moveTo(cx + bw * 0.35, top - bh * 0.3); x.lineTo(cx + bw * 0.35, top);
        x.stroke();

        // Cloth: a slight fold shading across, lit from above.
        const cloth = x.createLinearGradient(0, top, 0, top + bh);
        cloth.addColorStop(0, far ? cardColor('#c0233a', '#d62646') : cardColor('#e3283f', '#f12c46'));
        cloth.addColorStop(0.55, far ? cardColor('#8a1028', '#a41030') : cardColor('#b3122d', '#cc1237'));
        cloth.addColorStop(1, far ? '#4a0716' : '#650a1d');
        x.fillStyle = cloth;
        x.beginPath();
        x.moveTo(cx - bw / 2, top);
        x.lineTo(cx + bw / 2, top);
        x.lineTo(cx + bw / 2, top + bh);
        x.lineTo(cx, top + bh - bw * 0.16);
        x.lineTo(cx - bw / 2, top + bh);
        x.closePath();
        x.fill();
        x.clip();
        const fold = x.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
        fold.addColorStop(0, 'rgba(0,0,0,0.35)');
        fold.addColorStop(0.3, 'rgba(255,255,255,0.06)');
        fold.addColorStop(0.55, 'rgba(0,0,0,0.12)');
        fold.addColorStop(0.8, 'rgba(255,255,255,0.05)');
        fold.addColorStop(1, 'rgba(0,0,0,0.4)');
        x.fillStyle = fold;
        x.fillRect(cx - bw / 2, top, bw, bh);
        // Trim bands.
        x.fillStyle = 'rgba(255,215,215,0.55)';
        x.fillRect(cx - bw / 2, top + bh * 0.06, bw, Math.max(1, bh * 0.012));
        x.fillRect(cx - bw / 2, top + bh * 0.8, bw, Math.max(1, bh * 0.012));
        x.restore();

        // Crest: a red paddle on a pale disc, as on the key art.
        const ey = top + bh * 0.4, er = bw * 0.36;
        x.fillStyle = far ? 'rgba(250,220,220,0.8)' : 'rgba(255,236,234,0.95)';
        x.beginPath(); x.arc(cx, ey, er, 0, TAU); x.fill();
        x.save();
        x.translate(cx, ey);
        x.rotate(0.55);
        // Handle with a wood grain stripe.
        x.fillStyle = '#3b1c12';
        x.beginPath();
        x.moveTo(-er * 0.11, er * 0.2);
        x.lineTo(er * 0.11, er * 0.2);
        x.lineTo(er * 0.14, er * 0.86);
        x.lineTo(-er * 0.14, er * 0.86);
        x.closePath();
        x.fill();
        x.fillStyle = 'rgba(255,190,140,0.35)';
        x.fillRect(-er * 0.02, er * 0.3, er * 0.04, er * 0.5);
        // Rubber face.
        x.fillStyle = '#7a0618';
        x.beginPath(); x.ellipse(0, -er * 0.16, er * 0.52, er * 0.56, 0, 0, TAU); x.fill();
        x.fillStyle = '#d2142e';
        x.beginPath(); x.ellipse(0, -er * 0.18, er * 0.46, er * 0.5, 0, 0, TAU); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.18)';
        x.beginPath(); x.ellipse(-er * 0.15, -er * 0.34, er * 0.16, er * 0.22, -0.4, 0, TAU); x.fill();
        x.restore();
    }

    // ── Crowd ───────────────────────────────────────────────────────────
    function paintTier(x, w, y0, y1, rows, seed, opts) {
        const r = rng(seed);
        // Seating bowl behind the people.
        const bowl = x.createLinearGradient(0, y0, 0, y1);
        bowl.addColorStop(0, opts.bowlTop);
        bowl.addColorStop(1, opts.bowlBottom);
        x.fillStyle = bowl;
        x.fillRect(0, y0, w, y1 - y0);
        const rh = (y1 - y0) / rows;
        x.strokeStyle = 'rgba(255,90,120,0.07)';
        x.lineWidth = 1;
        x.beginPath();
        for (let i = 1; i < rows; i++) { x.moveTo(0, y0 + i * rh); x.lineTo(w, y0 + i * rh); }
        x.stroke();

        const aisles = opts.aisles;
        const inAisle = (px) => aisles.some(a => Math.abs(px - a * w) < rh * 0.9);
        for (let row = 0; row < rows; row++) {
            const ry = y0 + row * rh;
            const step = rh * (0.72 + r() * 0.06);
            const lit = opts.lit * (0.55 + 0.45 * row / Math.max(1, rows - 1));
            for (let px = -r() * step; px < w + step; px += step * (0.85 + r() * 0.35)) {
                if (inAisle(px)) continue;
                const hx = px + (r() - 0.5) * step * 0.25;
                const hr = rh * (0.2 + r() * 0.05);
                const hy = ry + rh * (0.36 + r() * 0.1) - (r() < 0.12 ? rh * 0.18 : 0); // some stand up
                const shade = 6 + Math.floor(r() * 12);
                x.fillStyle = `rgb(${shade + 6},${Math.floor(shade * 0.35)},${Math.floor(shade * 0.6)})`;
                // Shoulders, then head.
                x.beginPath();
                x.ellipse(hx, hy + hr * 2.1, hr * 1.9, hr * 1.25, 0, Math.PI, TAU);
                x.lineTo(hx + hr * 1.9, ry + rh + 1);
                x.lineTo(hx - hr * 1.9, ry + rh + 1);
                x.fill();
                x.beginPath();
                x.arc(hx, hy, hr, 0, TAU);
                x.fill();
                // Faces turned toward the court catch a little light.
                if (r() < 0.55) {
                    x.fillStyle = `rgba(255,${120 + Math.floor(r() * 60)},${120 + Math.floor(r() * 40)},${(lit * (0.18 + r() * 0.22)).toFixed(3)})`;
                    x.beginPath();
                    x.arc(hx, hy + hr * 0.12, hr * 0.62, 0, TAU);
                    x.fill();
                }
                // Rim light from the stage lights above.
                x.strokeStyle = `rgba(255,${80 + Math.floor(r() * 60)},${110 + Math.floor(r() * 40)},${(lit * (0.5 + r() * 0.5)).toFixed(3)})`;
                x.lineWidth = Math.max(0.9, hr * 0.32);
                x.beginPath();
                x.arc(hx, hy, hr * 0.92, Math.PI * 1.15, Math.PI * 1.85);
                x.stroke();
                // Raised arms here and there.
                if (r() < opts.arms) {
                    const side = r() < 0.5 ? -1 : 1;
                    x.strokeStyle = x.fillStyle;
                    x.lineWidth = hr * 0.55;
                    x.beginPath();
                    x.moveTo(hx + side * hr * 1.3, hy + hr * 1.6);
                    x.lineTo(hx + side * hr * 1.9, hy - hr * 1.6);
                    x.stroke();
                }
                // Phone screens and scarves catch the light.
                if (r() < opts.phones) {
                    x.fillStyle = r() < 0.5 ? 'rgba(255,250,240,0.85)' : 'rgba(255,90,120,0.8)';
                    x.fillRect(hx + (r() - 0.5) * hr * 2, hy + hr * 0.9, Math.max(1, hr * 0.35), Math.max(1, hr * 0.5));
                }
            }
        }
        // Aisle stairs with step lights.
        for (const a of aisles) {
            const ax = a * w;
            x.fillStyle = 'rgba(8,2,6,0.85)';
            x.fillRect(ax - rh * 0.7, y0, rh * 1.4, y1 - y0);
            x.fillStyle = 'rgba(255,170,120,0.5)';
            for (let row = 0; row < rows; row++) {
                x.fillRect(ax - rh * 0.55, y0 + (row + 0.85) * rh, rh * 1.1, Math.max(1, rh * 0.06));
            }
        }
        // Distance haze: the far tier sits back in the red air.
        const hz = x.createLinearGradient(0, y0, 0, y1);
        hz.addColorStop(0, `rgba(70,8,30,${opts.haze})`);
        hz.addColorStop(1, `rgba(70,8,30,${opts.haze * 0.35})`);
        x.fillStyle = hz;
        x.fillRect(0, y0, w, y1 - y0);
    }

    // Balcony fascia under each tier.
    function paintFascia(x, w, y, hgt) {
        const g = x.createLinearGradient(0, y, 0, y + hgt);
        g.addColorStop(0, '#2b0d1c');
        g.addColorStop(1, '#12050c');
        x.fillStyle = g;
        x.fillRect(0, y, w, hgt);
        x.fillStyle = 'rgba(255,120,150,0.35)';
        x.fillRect(0, y, w, 1);
    }

    // ── LED boards: a repeating strip of panels, scrolled each frame ────
    function paintLedStrip(pw, ph, sx, sy, words, seed) {
        const r = rng(seed);
        const n = 6;
        const tw = pw * n;
        const [c, x] = canvas(tw, ph, sx, sy);
        x.fillStyle = '#12040a';
        x.fillRect(0, 0, tw, ph);
        for (let i = 0; i < n; i++) {
            const px = i * pw;
            const red = i % 2 === 0;
            const g = x.createLinearGradient(0, 0, 0, ph);
            g.addColorStop(0, red ? cardColor('#ff3150', '#ff285b') : '#2a0a18');
            g.addColorStop(1, red ? cardColor('#a3102a', '#c01444') : '#14050c');
            x.fillStyle = g;
            x.fillRect(px + 1, 1, pw - 2, ph - 2);
            x.fillStyle = red ? '#fff3f3' : '#ff5a74';
            x.font = `700 ${Math.round(ph * 0.5)}px Orbitron, 'Segoe UI', sans-serif`;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            const word = words[Math.floor(r() * words.length)];
            x.fillText(word, px + pw * 0.56, ph * 0.54, pw * 0.72);
            // Little paddle mark before the word.
            const mx = px + pw * 0.13, my = ph * 0.5, mr = ph * 0.2;
            x.beginPath(); x.arc(mx, my - mr * 0.2, mr, 0, TAU); x.fill();
            x.fillRect(mx - mr * 0.18, my + mr * 0.6, mr * 0.36, mr * 0.9);
        }
        // LED pixel grid.
        x.fillStyle = 'rgba(0,0,0,0.28)';
        const cell = Math.max(2, ph / 9);
        for (let yy = 0; yy < ph; yy += cell) x.fillRect(0, yy, tw, Math.max(0.6, cell * 0.22));
        for (let xx = 0; xx < tw; xx += cell) x.fillRect(xx, 0, Math.max(0.6, cell * 0.22), ph);
        return { c, w: tw, h: ph };
    }

    // ── Floor ───────────────────────────────────────────────────────────
    function paintFloor(x, w, h, L) {
        const fy = L.fy, fh = h - fy;
        const g = x.createLinearGradient(0, fy, 0, h);
        g.addColorStop(0, cardColor('#2b0d2c', '#380e30'));
        g.addColorStop(0.18, cardColor('#1a0a26', '#220a29'));
        g.addColorStop(0.6, '#0d0718');
        g.addColorStop(1, '#06040c');
        x.fillStyle = g;
        x.fillRect(0, fy, w, fh);

        // Mirror glow of the courtside boards.
        const m = x.createLinearGradient(0, fy, 0, fy + fh * 0.22);
        m.addColorStop(0, cardColor('rgba(255,50,90,0.35)', 'rgba(255,38,115,0.46)'));
        m.addColorStop(1, cardColor('rgba(255,50,90,0)', 'rgba(255,38,115,0)'));
        x.fillStyle = m;
        x.fillRect(0, fy, w, fh * 0.22);

        // Long light streaks under every spotlight and banner.
        const streak = (cx, width, a, rgb) => {
            const sg = x.createLinearGradient(0, fy, 0, h);
            sg.addColorStop(0, `rgba(${rgb},${a})`);
            sg.addColorStop(0.5, `rgba(${rgb},${a * 0.35})`);
            sg.addColorStop(1, `rgba(${rgb},0)`);
            x.fillStyle = sg;
            x.fillRect(cx - width / 2, fy, width, fh);
        };
        for (const s of SPOTS) streak(w * s, w * 0.018, 0.16, cardColor('255,190,200', '255,170,212'));
        for (const s of [0.17, 0.83]) streak(w * s, w * 0.07, 0.12, cardColor('255,40,70', '255,35,102'));

        // Court markings in perspective toward a point above the floor line.
        const vx = w * 0.5, vy = fy - fh * 0.9;
        const at = (X, Y) => [vx + (X - vx) * (Y - vy) / (h - vy), Y];
        x.strokeStyle = 'rgba(255,235,240,0.16)';
        x.lineWidth = 2;
        x.beginPath();
        const fyIn = fy + fh * 0.06;
        for (const X of [-w * 0.2, w * 1.2]) {
            const [ax, ay] = at(X, fyIn);
            x.moveTo(ax, ay);
            x.lineTo(X, h);
        }
        const [l0] = at(-w * 0.2, fyIn), [r0] = at(w * 1.2, fyIn);
        x.moveTo(l0, fyIn); x.lineTo(r0, fyIn);
        x.stroke();
        x.strokeStyle = 'rgba(255,235,240,0.07)';
        x.lineWidth = 1;
        x.beginPath();
        for (const X of [w * 0.2, w * 0.8]) {
            const [ax, ay] = at(X, fyIn);
            x.moveTo(ax, ay); x.lineTo(X, h);
        }
        x.stroke();

        // Varnish sheen: a soft horizontal band of reflected haze.
        const sheen = x.createLinearGradient(0, fy + fh * 0.25, 0, fy + fh * 0.6);
        sheen.addColorStop(0, 'rgba(180,90,200,0)');
        sheen.addColorStop(0.5, 'rgba(180,90,200,0.06)');
        sheen.addColorStop(1, 'rgba(180,90,200,0)');
        x.fillStyle = sheen;
        x.fillRect(0, fy + fh * 0.25, w, fh * 0.35);
    }

    function paintOverlay(x, w, h) {
        const v = x.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(0.7, 'rgba(3,0,4,0.28)');
        v.addColorStop(1, 'rgba(3,0,4,0.62)');
        x.fillStyle = v;
        x.fillRect(0, 0, w, h);
    }

    // A spotlight cone, apex at the top centre, pointing down.
    function paintBeam(len, spread, sx, sy) {
        const bw = len * spread * 2 + 8;
        const [c, x] = canvas(bw, len, sx, sy);
        if ('filter' in x) x.filter = `blur(${Math.max(2, bw * 0.05)}px)`;
        const g = x.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, cardColor('rgba(255,230,235,1)', 'rgba(255,220,239,1)'));
        g.addColorStop(0.2, cardColor('rgba(255,140,165,0.7)', 'rgba(255,116,180,0.76)'));
        g.addColorStop(0.7, 'rgba(255,70,110,0.26)');
        g.addColorStop(1, 'rgba(255,60,100,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(bw / 2 - 2, 0);
        x.lineTo(bw / 2 + 2, 0);
        x.lineTo(bw / 2 + len * spread, len);
        x.lineTo(bw / 2 - len * spread, len);
        x.closePath();
        x.fill();
        // Brighter core.
        x.globalAlpha = 0.5;
        x.beginPath();
        x.moveTo(bw / 2 - 1, 0);
        x.lineTo(bw / 2 + 1, 0);
        x.lineTo(bw / 2 + len * spread * 0.35, len * 0.8);
        x.lineTo(bw / 2 - len * spread * 0.35, len * 0.8);
        x.closePath();
        x.fill();
        return { c, w: bw, h: len };
    }

    class ClassicArt {
        constructor() {
            this.key = '';
            this.t = 0;
            this.pulse = 0;
            this.cheer = 0;
            this.flashes = [];
            this._rally = 0;
            this._score = -1;
            this._rnd = rng(4242);
        }

        _bake(ctx, w, h) {
            const m = ctx.getTransform();
            const sx = Math.hypot(m.a, m.b) || 1, sy = Math.hypot(m.c, m.d) || 1;
            const key = `${w}|${h}|${sx.toFixed(3)}|${sy.toFixed(3)}|${window.game?.gameMode === 'customise' ? 'original' : 'card'}`;
            if (key === this.key) return;
            this.key = key;
            const L = this.L = layout(w, h);
            const glowW = glowSprite(cardColor('255,215,190', '255,198,225'));
            const glowR = glowSprite(cardColor('255,70,110', '255,50,125'));
            this.glowW = glowW;
            this.glowR = glowR;
            this.pool = glowSprite('255,90,130', 256);

            const [bc, bx] = canvas(w, h, sx, sy);
            paintRoof(bx, w, h, L);
            const lights = [];
            // Far banners first, then the truss in front of them.
            const bwFar = w * 0.05, bwNear = w * 0.078;
            for (const f of [0.33, 0.67]) paintBanner(bx, w * f, h * 0.085, bwFar, h * 0.15, true);
            paintTruss(bx, w, h, L, lights);
            paintTier(bx, w, L.upper[0], L.upper[1], 7, 31, {
                bowlTop: '#2a0a18', bowlBottom: '#3a0e20', lit: 0.55, haze: 0.2, arms: 0.05, phones: 0.03,
                aisles: [0.08, 0.24, 0.41, 0.59, 0.76, 0.92],
            });
            for (const f of [0.17, 0.83]) paintBanner(bx, w * f, h * 0.05, bwNear, h * 0.27, false);
            paintFascia(bx, w, L.ribbon[0], L.ribbon[1] - L.ribbon[0]);
            paintTier(bx, w, L.ribbon[1], L.lower[1], 6, 57, {
                bowlTop: '#320c1b', bowlBottom: '#3e1021', lit: 0.74, haze: 0.06, arms: 0.1, phones: 0.04,
                aisles: [0.15, 0.37, 0.63, 0.85],
            });
            paintFascia(bx, w, L.board[0], L.board[1] - L.board[0]);
            paintFloor(bx, w, h, L);
            paintLights(bx, lights, glowW, glowR);
            this.base = bc;
            this.lights = lights;

            // Light glow layer reused for hit pulses (additive on top).
            const [gc, gx] = canvas(w, Math.ceil(h * 0.3), sx, sy);
            for (const l of lights) {
                const s = l.s * (l.spot ? 3 : 2.2);
                gx.drawImage(l.warm ? glowW : glowR, l.x - s, l.y - s, s * 2, s * 2);
            }
            this.lightGlow = gc;
            this.lightGlowH = Math.ceil(h * 0.3);

            const rh = L.ribbon[1] - L.ribbon[0] - 4;
            this.ribbon = paintLedStrip(rh * 7, rh, sx, sy, ['PING PONG', 'CLASSIC', 'GAME POINT', 'RALLY'], 3);
            const bh = L.board[1] - L.board[0] - 4;
            this.board = paintLedStrip(bh * 6, bh, sx, sy, ['PING PONG', 'CLASSIC', 'ACE', 'NICE SHOT'], 9);

            const len = h * 0.95;
            this.beam = paintBeam(len, 0.17, Math.min(sx, 1), Math.min(sy, 1));

            const [oc, ox] = canvas(w, h, sx, sy);
            paintOverlay(ox, w, h);
            this.overlay = oc;
        }

        _strip(ctx, s, y, w, speed) {
            const off = ((this.t * speed) % s.w + s.w) % s.w;
            for (let x = -off; x < w; x += s.w) ctx.drawImage(s.c, x, y, s.w, s.h);
        }

        /** @param st {dt, rally, score} */
        draw(ctx, w, h, st) {
            this._bake(ctx, w, h);
            const L = this.L;
            const dt = Math.max(0, Math.min(0.1, st.dt || 0));
            this.t += dt;
            if (st.rally !== this._rally) {
                if (st.rally > this._rally) this.pulse = 1;
                this._rally = st.rally;
            }
            if (this._score >= 0 && st.score !== this._score) this.cheer = 1;
            this._score = st.score;
            this.pulse = Math.max(0, this.pulse - dt * 2.4);
            this.cheer = Math.max(0, this.cheer - dt * 0.45);

            ctx.drawImage(this.base, 0, 0, w, h);

            // LED boards scroll in opposite directions.
            this._strip(ctx, this.ribbon, L.ribbon[0] + 2, w, -w * 0.035);
            this._strip(ctx, this.board, L.board[0] + 2, w, w * 0.05);

            // Camera flashes in the stands, a burst after every point.
            const r = this._rnd;
            const rate = 2.5 + this.cheer * 40 + this.pulse * 4;
            if (r() < rate * dt) {
                const tier = r() < 0.55 ? L.lower : L.upper;
                this.flashes.push({ x: r() * w, y: tier[0] + r() * (tier[1] - tier[0]), life: 1, s: 7 + r() * 9 });
            }

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Spotlights sweep the court; a point makes them swing wider.
            const beam = this.beam;
            const sweep = 0.16 + this.cheer * 0.14;
            const beamA = 0.3 + this.pulse * 0.12 + this.cheer * 0.14;
            for (let i = 0; i < SPOTS.length; i++) {
                const px = w * SPOTS[i];
                const py = trussY(L, px) + h * 0.024 + 9;
                const lean = (0.5 - SPOTS[i]) * 0.55;
                const a = lean + Math.sin(this.t * (0.33 + i * 0.07) + i * 1.9) * sweep;
                ctx.globalAlpha = beamA;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(a);
                ctx.drawImage(beam.c, -beam.w / 2, 0, beam.w, beam.h);
                ctx.restore();
                // Pool of light where the beam meets the floor.
                const dist = (L.fy + (h - L.fy) * 0.35 - py) / Math.cos(a);
                const fx = px - Math.sin(a) * dist;
                const pw = w * 0.16, ph = (h - L.fy) * 0.28;
                ctx.globalAlpha = 0.16 + this.pulse * 0.08 + this.cheer * 0.08;
                ctx.drawImage(this.pool, fx - pw / 2, L.fy + (h - L.fy) * 0.35 - ph / 2, pw, ph);
            }

            // Truss lamps flare on hits.
            const flare = this.pulse * 0.45 + this.cheer * 0.35;
            if (flare > 0.02) {
                ctx.globalAlpha = Math.min(1, flare);
                ctx.drawImage(this.lightGlow, 0, 0, w, this.lightGlowH);
            }

            let keep = 0;
            for (let i = 0; i < this.flashes.length; i++) {
                const f = this.flashes[i];
                f.life -= dt * 7;
                if (f.life <= 0) continue;
                this.flashes[keep++] = f;
                const s = f.s * (0.6 + f.life * 0.6);
                ctx.globalAlpha = f.life;
                ctx.drawImage(this.glowW, f.x - s, f.y - s, s * 2, s * 2);
            }
            this.flashes.length = keep;
            ctx.restore();

            ctx.drawImage(this.overlay, 0, 0, w, h);
        }
    }

    window.ClassicArt = ClassicArt;
})();
