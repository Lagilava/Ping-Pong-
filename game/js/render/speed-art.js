/**
 * Speed mode scenery: a night highway racing toward a striped synthwave sun.
 * Generated WebP scenery and a transparent prop atlas are decoded once and
 * baked into bounded textures. Perspective traffic, lane markings and grid
 * rows keep moving; the sky has a subtle parallax. The procedural painter is
 * retained for loading failures and Custom Match's original palette.
 * No draw-time blur, image decoding or texture allocation on warm frames.
 */
(function () {
    const TAU = Math.PI * 2;
    // Custom Match retains its original palette when it selects this backdrop.
    const cardColor = (original, matched) => window.game?.gameMode === 'customise' ? original : matched;
    const NEAR = 1;          // depth of the bottom edge of the screen
    const FAR = 34;          // depth at which objects fade in from the haze
    const HORIZON = 0.44;    // horizon height as a fraction of the screen

    // Shared across matches. Decode once; a failed image leaves the original
    // procedural renderer available, including Custom Match's original palette.
    const assetRoot = document.currentScript?.src
        ? new URL('../../assets/speed/', document.currentScript.src).href : 'assets/speed/';
    const artwork = { started: false, ready: false, scene: null, props: null };
    function loadArtwork() {
        if (artwork.started || typeof Image === 'undefined') return;
        artwork.started = true;
        const load = name => new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => Promise.resolve(image.decode ? image.decode() : undefined)
                .then(() => resolve(image), reject);
            image.onerror = reject;
            image.src = assetRoot + name + '.webp';
        });
        Promise.all([load('speed-scene'), load('speed-props')]).then(([scene, props]) => {
            artwork.scene = scene;
            artwork.props = props;
            artwork.ready = true;
            // Static-background settings still need one repaint after loading.
            window.game?.bgRenderer?._invalidateBackgroundRenderCache?.();
        }).catch(() => { /* retain procedural fallback without retrying each frame */ });
    }

    // Source rectangles follow the delivered atlas rather than assuming the
    // generator produced an exact grid. Crop/flip only when baking a scene.
    function artworkSprite(kind, flip = false) {
        const rects = {
            palm: [90, 0, 495, 745], lamp: [835, 15, 320, 730],
            sign: [55, 840, 510, 360], car: [598, 838, 648, 360]
        };
        const [rx, ry, rw, rh] = rects[kind];
        const w = rw / 1254 * artwork.props.naturalWidth;
        const h = rh / 1254 * artwork.props.naturalHeight;
        const scale = Math.min(1, 384 / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const x = c.getContext('2d');
        if (flip) { x.translate(c.width, 0); x.scale(-1, 1); }
        x.drawImage(artwork.props, rx / 1254 * artwork.props.naturalWidth,
            ry / 1254 * artwork.props.naturalHeight, w, h, 0, 0, c.width, c.height);
        return { c, w: rw, h: rh, anchor: kind === 'lamp' ? (flip ? 0.8 : 0.2) : kind === 'palm' ? (flip ? 0.65 : 0.35) : 0.5 };
    }

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

    // �� Sky, stars and ground (one static base layer) ������������������
    function paintBase(x, w, h, hy) {
        const sky = x.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0, '#03020d');
        sky.addColorStop(0.42, '#0d0526');
        sky.addColorStop(0.72, cardColor('#2a0943', '#3e104e'));
        sky.addColorStop(0.9, cardColor('#5e1356', '#96225f'));
        sky.addColorStop(1, cardColor('#9a2a5e', '#d34c68'));
        x.fillStyle = sky;
        x.fillRect(0, 0, w, hy + 1);

        // Faint aurora bands high in the sky.
        const r = rng(911);
        for (let i = 0; i < 4; i++) {
            const bx = w * (0.1 + r() * 0.8), by = hy * (0.15 + r() * 0.35);
            const g = x.createRadialGradient(bx, by, 0, bx, by, w * (0.22 + r() * 0.18));
            const c = i % 2 ? '60,40,170' : '150,30,140';
            g.addColorStop(0, `rgba(${c},0.16)`);
            g.addColorStop(1, `rgba(${c},0)`);
            x.save();
            x.translate(bx, by);
            x.scale(1, 0.32);
            x.translate(-bx, -by);
            x.fillStyle = g;
            x.fillRect(0, -hy * 4, w, hy * 8);
            x.restore();
        }

        // Stars: dense small ones, a few bright ones with a cross sparkle.
        const sr = rng(1234);
        for (let i = 0; i < 260; i++) {
            const sx = sr() * w, sy = Math.pow(sr(), 1.5) * hy * 0.86;
            const fade = 1 - sy / hy;
            const a = (0.25 + sr() * 0.65) * fade;
            const s = 0.5 + sr() * 1.1;
            x.fillStyle = sr() < 0.2 ? `rgba(160,220,255,${a})` : sr() < 0.3 ? `rgba(255,190,230,${a})` : `rgba(255,255,255,${a})`;
            x.fillRect(sx, sy, s, s);
        }
        for (let i = 0; i < 14; i++) {
            const sx = sr() * w, sy = sr() * hy * 0.6, s = 3 + sr() * 5;
            const g = x.createRadialGradient(sx, sy, 0, sx, sy, s * 1.6);
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(0.25, 'rgba(190,225,255,0.35)');
            g.addColorStop(1, 'rgba(190,225,255,0)');
            x.fillStyle = g;
            x.fillRect(sx - s * 2, sy - s * 2, s * 4, s * 4);
            x.strokeStyle = 'rgba(220,240,255,0.55)';
            x.lineWidth = 0.7;
            x.beginPath();
            x.moveTo(sx - s, sy); x.lineTo(sx + s, sy);
            x.moveTo(sx, sy - s); x.lineTo(sx, sy + s);
            x.stroke();
        }

        // Ground: deep violet plain under a hot horizon.
        const ground = x.createLinearGradient(0, hy, 0, h);
        ground.addColorStop(0, '#2a0838');
        ground.addColorStop(0.08, '#150424');
        ground.addColorStop(0.45, '#08021a');
        ground.addColorStop(1, '#040111');
        x.fillStyle = ground;
        x.fillRect(0, hy, w, h - hy);

        const cx = w * 0.5, gh = h - hy;
        const proj = (X, d) => cx + X * (w * 0.5) / d;
        const rowY = (d) => hy + gh * NEAR / d;

        // Road surface with a soft sheen down its middle.
        const roadHalf = 0.86;
        x.beginPath();
        x.moveTo(proj(-roadHalf, FAR * 3), hy);
        x.lineTo(proj(roadHalf, FAR * 3), hy);
        x.lineTo(proj(roadHalf, 0.55), rowY(0.55));
        x.lineTo(proj(-roadHalf, 0.55), rowY(0.55));
        x.closePath();
        const asphalt = x.createLinearGradient(0, hy, 0, h);
        asphalt.addColorStop(0, '#1c0a30');
        asphalt.addColorStop(0.3, '#0e0620');
        asphalt.addColorStop(1, '#070313');
        x.fillStyle = asphalt;
        x.fill();
        const sheen = x.createRadialGradient(cx, hy, 0, cx, hy, gh * 1.1);
        sheen.addColorStop(0, cardColor('rgba(255,120,170,0.20)', 'rgba(255,65,161,0.30)'));
        sheen.addColorStop(0.5, 'rgba(120,60,200,0.05)');
        sheen.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = sheen;
        x.fill();
        // The sun's reflection on the wet road: broken warm bars.
        const rr = rng(31);
        for (let y = hy + 2, k = 0; y < hy + gh * 0.55; k++) {
            const t = (y - hy) / (gh * 0.55);
            const bw = h * 0.2 * (0.9 - t * 0.5) * (0.6 + rr() * 0.5);
            const bh = 1.2 + t * 5;
            const a = 0.38 * (1 - t) * (0.6 + rr() * 0.4);
            x.fillStyle = k % 3 ? `rgba(255,150,90,${a})` : `rgba(255,90,150,${a})`;
            x.fillRect(cx - bw / 2 + (rr() - 0.5) * 10, y, bw, bh);
            y += bh + 2 + t * 8;
        }

        // Static rails of the ground grid converge on the vanishing point.
        x.lineCap = 'round';
        for (let i = -14; i <= 14; i++) {
            const X = i * 0.55;
            if (Math.abs(X) < roadHalf + 0.05) continue;
            const a = Math.max(0.08, 0.34 - Math.abs(i) * 0.012);
            const lg = x.createLinearGradient(0, hy, 0, h);
            lg.addColorStop(0, `rgba(255,60,190,${a * 0.5})`);
            lg.addColorStop(1, `rgba(255,60,190,${a})`);
            x.strokeStyle = lg;
            x.lineWidth = 1.1;
            x.beginPath();
            x.moveTo(proj(X, FAR * 3), hy);
            x.lineTo(proj(X, 0.4), rowY(0.4));
            x.stroke();
        }
        // Road edges glow cyan (left) and magenta (right) like the paddles.
        for (const [side, rgb] of [[-1, '40,225,255'], [1, '255,60,170']]) {
            const X = side * roadHalf;
            x.save();
            x.shadowColor = `rgba(${rgb},0.9)`;
            x.shadowBlur = 12;
            x.strokeStyle = `rgba(${rgb},0.85)`;
            x.lineWidth = 2.4;
            x.beginPath();
            x.moveTo(proj(X, FAR * 3), hy);
            x.lineTo(proj(X, 0.5), rowY(0.5));
            x.stroke();
            x.restore();
        }

        // Hot horizon line where the road meets the sky.
        const hl = x.createLinearGradient(0, 0, w, 0);
        hl.addColorStop(0, 'rgba(255,70,170,0)');
        hl.addColorStop(0.3, 'rgba(255,90,170,0.7)');
        hl.addColorStop(0.5, 'rgba(255,200,140,0.95)');
        hl.addColorStop(0.7, 'rgba(255,90,170,0.7)');
        hl.addColorStop(1, 'rgba(255,70,170,0)');
        x.save();
        x.shadowColor = 'rgba(255,90,170,0.9)';
        x.shadowBlur = 14;
        x.fillStyle = hl;
        x.fillRect(0, hy - 1, w, 2);
        x.restore();
        const haze = x.createLinearGradient(0, hy - gh * 0.12, 0, hy + gh * 0.14);
        haze.addColorStop(0, 'rgba(255,80,150,0)');
        haze.addColorStop(0.5, cardColor('rgba(255,80,150,0.16)', 'rgba(255,85,145,0.24)'));
        haze.addColorStop(1, 'rgba(255,80,150,0)');
        x.fillStyle = haze;
        x.fillRect(0, hy - gh * 0.12, w, gh * 0.26);
    }

    // �� Striped sun, bottom edge sits on the horizon �������������������
    function paintSun(R, sx, sy) {
        const S = R * 2.8;
        const [c, x] = canvas(S, S * 0.62, sx, sy);
        const cx = S / 2, cy = S * 0.62 - R * 0.12; // centre sits just above the cut
        // Halo
        const halo = x.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.4);
        halo.addColorStop(0, cardColor('rgba(255,90,140,0.32)', 'rgba(255,125,100,0.42)'));
        halo.addColorStop(0.5, 'rgba(255,60,150,0.10)');
        halo.addColorStop(1, 'rgba(255,60,150,0)');
        x.fillStyle = halo;
        x.fillRect(0, 0, S, S);
        // Disc on its own layer so the stripes can cut it.
        const [dc, dx] = canvas(S, S * 0.62, sx, sy);
        const g = dx.createLinearGradient(0, cy - R, 0, cy + R);
        g.addColorStop(0, cardColor('#ffe98a', '#fff18a'));
        g.addColorStop(0.3, cardColor('#ffa94a', '#ffbd4a'));
        g.addColorStop(0.55, cardColor('#ff5d6c', '#ff8357'));
        g.addColorStop(0.85, cardColor('#e0287f', '#f54489'));
        g.addColorStop(1, '#b0108a');
        dx.fillStyle = g;
        dx.beginPath();
        dx.arc(cx, cy, R, 0, TAU);
        dx.fill();
        dx.globalCompositeOperation = 'destination-out';
        let y = cy - R * 0.42, gap = R * 0.03;
        while (y < cy + R) {
            dx.fillRect(cx - R, y, R * 2, gap);
            y += gap + R * 0.1;
            gap *= 1.35;
        }
        x.drawImage(dc, 0, 0, S, S * 0.62);
        return { c, w: S, h: S * 0.62 };
    }

    // �� Long, thin clouds drifting across the sun ����������������������
    function paintClouds(w, hy, sx, sy) {
        const W = w * 2, H = hy * 0.5;
        const [c, x] = canvas(W, H, sx, sy);
        const r = rng(77);
        for (let i = 0; i < 9; i++) {
            const cw = w * (0.18 + r() * 0.3), ch = H * (0.04 + r() * 0.05);
            const cx0 = r() * (W - cw), cy0 = H * (0.25 + r() * 0.65);
            for (const off of [0, -W, W]) {
                const bx = cx0 + off;
                if (bx > W || bx + cw < 0) continue;
                const g = x.createLinearGradient(0, cy0 - ch, 0, cy0 + ch);
                g.addColorStop(0, 'rgba(255,130,170,0.55)');
                g.addColorStop(0.35, 'rgba(110,30,110,0.85)');
                g.addColorStop(1, 'rgba(40,10,60,0.85)');
                x.fillStyle = g;
                x.beginPath();
                x.moveTo(bx, cy0);
                const n = 6;
                for (let k = 0; k <= n; k++) {
                    const px = bx + (cw * k) / n;
                    const bump = Math.sin((k / n) * Math.PI) * ch * (0.7 + r() * 0.6);
                    x.quadraticCurveTo(px - cw / n / 2, cy0 - bump * 1.3, px, cy0 - bump * 0.6);
                }
                x.quadraticCurveTo(bx + cw * 0.5, cy0 + ch * 0.8, bx, cy0);
                x.fill();
            }
        }
        return { c, w: W, h: H };
    }

    // �� Mountain ranges with rim light and wireframe faces �������������
    function ridge(seed, n, rough) {
        const r = rng(seed);
        let pts = [r(), r()];
        for (let it = 0; it < n; it++) {
            const next = [];
            for (let i = 0; i < pts.length - 1; i++) {
                next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * rough / (it + 1));
            }
            next.push(pts[pts.length - 1]);
            pts = next;
        }
        return pts.map(v => Math.max(0, Math.min(1, v)));
    }

    function paintMountains(w, mh, sx, sy, o) {
        const W = w * 1.2, H = mh;
        const [c, x] = canvas(W, H, sx, sy);
        const noise = ridge(o.seed, 7, o.rough);
        // Peaks: overlapping triangles, roughened by the ridge noise.
        const r = rng(o.seed * 7 + 1);
        const peaks = [];
        for (let i = 0; i < o.peaks; i++) {
            const pos = (i + 0.2 + r() * 0.6) / o.peaks;
            const ctr = Math.abs(pos - 0.5) * 2; // 0 centre .. 1 sides
            peaks.push([pos, (0.35 + r() * 0.65) * (1 - o.valley * Math.exp(-ctr * ctr * 9)), 2.2 + r() * 2.5]);
        }
        const pts = noise.map((n, i) => {
            const t = i / (noise.length - 1);
            let v = 0.04;
            for (const [pos, ph, slope] of peaks) v = Math.max(v, ph - Math.abs(t - pos) * slope);
            return Math.max(0.03, Math.min(1, v * (0.86 + n * 0.28)));
        });
        const shape = (i) => H - H * pts[i];
        const path = () => {
            x.beginPath();
            x.moveTo(0, H);
            for (let i = 0; i < pts.length; i++) x.lineTo((i / (pts.length - 1)) * W, shape(i));
            x.lineTo(W, H);
            x.closePath();
        };
        path();
        const g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, o.top);
        g.addColorStop(1, o.bottom);
        x.fillStyle = g;
        x.fill();
        // Wireframe faces: lines from ridge points down to the base.
        x.save();
        path();
        x.clip();
        x.strokeStyle = o.wire;
        x.lineWidth = 0.8;
        x.beginPath();
        for (let i = 0; i < pts.length; i += 4) {
            const px = (i / (pts.length - 1)) * W;
            x.moveTo(px, shape(i));
            x.lineTo(px + (px - W / 2) * 0.12, H);
        }
        for (let k = 1; k < 5; k++) {
            const yy = H * (0.35 + k * 0.15);
            x.moveTo(0, yy); x.lineTo(W, yy);
        }
        x.stroke();
        x.restore();
        // Rim light along the ridge.
        x.save();
        x.shadowColor = o.rim;
        x.shadowBlur = 10;
        x.strokeStyle = o.rim;
        x.lineWidth = 1.6;
        x.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const px = (i / (pts.length - 1)) * W;
            if (i) x.lineTo(px, shape(i)); else x.moveTo(px, shape(i));
        }
        x.stroke();
        x.restore();
        return { c, w: W, h: H };
    }

    // �� City skyline on the horizon, framed by the sun �����������������
    function paintCity(w, ch, sx, sy) {
        const W = w * 0.62, H = ch;
        const [c, x] = canvas(W, H, sx, sy);
        const r = rng(4242);
        const blds = [];
        let bx = 0;
        while (bx < W) {
            const t = bx / W;
            const tall = 0.25 + 0.75 * Math.exp(-Math.pow((t - 0.5) / 0.22, 2));
            const bw = W * (0.018 + r() * 0.03);
            const bh = H * (0.18 + r() * 0.5) * tall + H * 0.06;
            blds.push([bx, bw, bh, r()]);
            bx += bw + r() * W * 0.004;
        }
        for (const [x0, bw, bh, k] of blds) {
            const y0 = H - bh;
            const g = x.createLinearGradient(0, y0, 0, H);
            g.addColorStop(0, '#1d0b33');
            g.addColorStop(1, '#0b0418');
            x.fillStyle = g;
            x.fillRect(x0, y0, bw, bh);
            if (k > 0.6) { // spire
                x.fillRect(x0 + bw * 0.45, y0 - bh * 0.12, Math.max(1, bw * 0.1), bh * 0.12);
                x.fillStyle = 'rgba(255,60,90,0.95)';
                x.fillRect(x0 + bw * 0.45 - 0.5, y0 - bh * 0.12 - 1.5, 2, 2);
            }
            // Lit windows.
            for (let wy = y0 + 3; wy < H - 2; wy += 4) {
                for (let wx = x0 + 2; wx < x0 + bw - 2; wx += 3.5) {
                    const q = r();
                    if (q < 0.26) {
                        x.fillStyle = q < 0.06 ? 'rgba(120,235,255,0.85)' : q < 0.12 ? 'rgba(255,120,200,0.8)' : 'rgba(255,200,120,0.75)';
                        x.fillRect(wx, wy, 1.4, 1.6);
                    }
                }
            }
            // Neon rooftop trim on some towers.
            if (k < 0.22) {
                x.fillStyle = k < 0.11 ? 'rgba(60,230,255,0.9)' : 'rgba(255,70,180,0.9)';
                x.fillRect(x0, y0, bw, 1.2);
            }
        }
        return { c, w: W, h: H };
    }

    // �� Roadside sprites �����������������������������������������������
    function paintPalm(sx, sy, flip) {
        const W = 240, H = 330;
        const [c, x] = canvas(W, H, sx, sy);
        const baseX = W * 0.5, topX = W * (0.5 + 0.13 * flip), topY = H * 0.27;
        const trunkAt = (t) => [baseX + (topX - baseX) * t * t, H - (H - topY) * t];
        // Trunk: one tapered shape, then ring marks and a rim on the lit side.
        const left = [], right = [];
        for (let i = 0; i <= 24; i++) {
            const t = i / 24, [px, py] = trunkAt(t), r = 8.5 - t * 4;
            left.push([px - r, py]); right.push([px + r, py]);
        }
        x.beginPath();
        x.moveTo(left[0][0], left[0][1]);
        for (const [px, py] of left) x.lineTo(px, py);
        for (let i = right.length - 1; i >= 0; i--) x.lineTo(right[i][0], right[i][1]);
        x.closePath();
        const tg = x.createLinearGradient(baseX - 9 * flip, 0, baseX + 9 * flip, 0);
        tg.addColorStop(0, '#1a0828');
        tg.addColorStop(0.65, '#3b1755');
        tg.addColorStop(1, '#ff7cc4');
        x.fillStyle = tg;
        x.fill();
        x.strokeStyle = 'rgba(20,5,30,0.8)';
        x.lineWidth = 1.2;
        x.beginPath();
        for (let i = 1; i < 24; i++) {
            const t = i / 24, [px, py] = trunkAt(t), r = 8.5 - t * 4;
            x.moveTo(px - r, py + 1.5);
            x.quadraticCurveTo(px, py - 2, px + r, py + 1.5);
        }
        x.stroke();
        // Fronds: curved leaves with notched leaflets and a pink rim.
        const fronds = [[-3.05, 1.05], [-2.6, 1.15], [-2.15, 0.9], [-1.75, 0.7], [-1.35, 0.75], [-0.95, 0.95], [-0.5, 1.15], [-0.05, 1.05], [0.35, 0.8], [-3.5, 0.8]];
        for (const [a0, lenK] of fronds) {
            const a = flip > 0 ? a0 : -Math.PI - a0;
            const len = 92 * lenK;
            const ex = topX + Math.cos(a) * len, ey = topY + Math.sin(a) * len * 0.5 + len * 0.55;
            const mx = topX + Math.cos(a) * len * 0.55, my = topY + Math.sin(a) * len * 0.55 - 12;
            const at = (t) => [
                (1 - t) * (1 - t) * topX + 2 * (1 - t) * t * mx + t * t * ex,
                (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * my + t * t * ey,
            ];
            const up = [], dn = [];
            for (let i = 0; i <= 16; i++) {
                const t = i / 16, [px, py] = at(t), [qx, qy] = at(Math.min(1, t + 0.02));
                const dx = qx - px, dy = qy - py, dl = Math.hypot(dx, dy) || 1;
                const nx = -dy / dl, ny = dx / dl;
                const wd = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 21 * (1 - t * 0.3);
                const notch = i % 2 ? 0.45 : 1;
                up.push([px + nx * wd * notch, py + ny * wd * notch]);
                dn.push([px - nx * wd * notch * 0.8, py - ny * wd * notch * 0.8]);
            }
            x.beginPath();
            x.moveTo(topX, topY);
            for (const [px, py] of up) x.lineTo(px, py);
            for (let i = dn.length - 1; i >= 0; i--) x.lineTo(dn[i][0], dn[i][1]);
            x.closePath();
            const fg = x.createLinearGradient(topX, topY - 20, topX, topY + len * 0.6);
            fg.addColorStop(0, '#4a1b66');
            fg.addColorStop(1, '#1c0830');
            x.fillStyle = fg;
            x.fill();
            x.strokeStyle = 'rgba(255,125,205,0.85)';
            x.lineWidth = 1.4;
            x.beginPath();
            x.moveTo(topX, topY);
            for (let i = 0; i <= 16; i++) {
                const [px, py] = at(i / 16);
                x.lineTo(px, py - 0.5);
            }
            x.stroke();
        }
        // Coconuts.
        x.fillStyle = '#2a0e3c';
        for (const [ox, oy] of [[-5, 6], [4, 7], [0, 11]]) {
            x.beginPath();
            x.arc(topX + ox, topY + oy, 4.5, 0, TAU);
            x.fill();
        }
        return { c, w: W, h: H, anchor: 0.5 };
    }

    function paintLamp(sx, sy, side) {
        // side -1: lamp on the left of the road, arm reaches right.
        const W = 200, H = 340;
        const [c, x] = canvas(W, H, sx, sy);
        const px = side < 0 ? W * 0.2 : W * 0.8;
        const armX = side < 0 ? W * 0.82 : W * 0.18;
        // Light cone onto the road.
        const cone = x.createLinearGradient(0, 30, 0, H);
        cone.addColorStop(0, 'rgba(255,190,110,0.30)');
        cone.addColorStop(1, 'rgba(255,150,90,0)');
        x.fillStyle = cone;
        x.beginPath();
        x.moveTo(armX - 8, 34);
        x.lineTo(armX + 8, 34);
        x.lineTo(armX + 34, H);
        x.lineTo(armX - 34, H);
        x.closePath();
        x.fill();
        // Pole and arm.
        x.strokeStyle = '#1e0d2e';
        x.lineCap = 'round';
        x.lineWidth = 7;
        x.beginPath();
        x.moveTo(px, H);
        x.lineTo(px, 40);
        x.quadraticCurveTo(px, 22, px + (armX - px) * 0.3, 22);
        x.lineTo(armX, 26);
        x.stroke();
        x.strokeStyle = 'rgba(120,200,255,0.4)';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(px + side * 2.5, H);
        x.lineTo(px + side * 2.5, 44);
        x.stroke();
        // Lamp head with a glow.
        const glow = x.createRadialGradient(armX, 32, 0, armX, 32, 46);
        glow.addColorStop(0, 'rgba(255,240,200,1)');
        glow.addColorStop(0.2, 'rgba(255,190,110,0.65)');
        glow.addColorStop(1, 'rgba(255,140,80,0)');
        x.fillStyle = glow;
        x.fillRect(armX - 50, -18, 100, 100);
        x.fillStyle = '#2a1338';
        x.fillRect(armX - 14, 22, 28, 8);
        x.fillStyle = '#fff4d8';
        x.fillRect(armX - 11, 29, 22, 3);
        return { c, w: W, h: H, anchor: side < 0 ? 0.2 : 0.8 };
    }

    function paintSign(sx, sy, dir) {
        // Glowing chevron board on two legs, arrows point along the bend.
        const W = 180, H = 150;
        const [c, x] = canvas(W, H, sx, sy);
        x.fillStyle = '#1a0a2a';
        x.fillRect(W * 0.28, H * 0.55, 6, H * 0.45);
        x.fillRect(W * 0.68, H * 0.55, 6, H * 0.45);
        x.fillStyle = '#12061e';
        x.fillRect(10, 12, W - 20, H * 0.5);
        x.strokeStyle = 'rgba(255,200,90,0.9)';
        x.lineWidth = 2;
        x.strokeRect(12, 14, W - 24, H * 0.5 - 4);
        x.save();
        x.shadowColor = 'rgba(255,180,60,1)';
        x.shadowBlur = 10;
        x.strokeStyle = '#ffd25a';
        x.lineWidth = 9;
        x.lineJoin = 'miter';
        for (let i = 0; i < 3; i++) {
            const cx0 = W * (0.3 + i * 0.2);
            x.beginPath();
            x.moveTo(cx0 - 12 * dir, 26);
            x.lineTo(cx0 + 10 * dir, 12 + H * 0.25);
            x.lineTo(cx0 - 12 * dir, H * 0.5 - 2);
            x.stroke();
        }
        x.restore();
        return { c, w: W, h: H, anchor: 0.5 };
    }

    function paintCar(sx, sy, body) {
        // Rear view of a low sports car with a full-width tail light bar.
        const W = 160, H = 70;
        const [c, x] = canvas(W, H, sx, sy);
        const glow = x.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
        glow.addColorStop(0, 'rgba(255,40,80,0.35)');
        glow.addColorStop(1, 'rgba(255,40,80,0)');
        x.fillStyle = glow;
        x.fillRect(0, 0, W, H);
        x.fillStyle = body;
        x.beginPath();
        x.moveTo(22, 58);
        x.lineTo(18, 36);
        x.quadraticCurveTo(40, 14, 80, 13);
        x.quadraticCurveTo(120, 14, 142, 36);
        x.lineTo(138, 58);
        x.closePath();
        x.fill();
        x.fillStyle = 'rgba(140,200,255,0.25)';
        x.beginPath();
        x.moveTo(48, 30);
        x.quadraticCurveTo(80, 16, 112, 30);
        x.closePath();
        x.fill();
        x.fillStyle = '#ff2b54';
        x.fillRect(26, 38, 108, 5);
        x.fillStyle = '#ffd0d8';
        x.fillRect(30, 39, 26, 2);
        x.fillRect(104, 39, 26, 2);
        x.fillStyle = '#07030d';
        x.fillRect(28, 56, 20, 9);
        x.fillRect(112, 56, 20, 9);
        return { c, w: W, h: H, anchor: 0.5 };
    }

    // Centre darkening and corner vignette keep the court readable.
    function paintOverlay(x, w, h) {
        const cx = w * 0.5, cy = h * 0.5;
        const lane = x.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55);
        lane.addColorStop(0, cardColor('rgba(4,2,14,0.55)', 'rgba(4,2,14,0.36)'));
        lane.addColorStop(0.6, cardColor('rgba(4,2,14,0.32)', 'rgba(4,2,14,0.24)'));
        lane.addColorStop(1, 'rgba(4,2,14,0)');
        x.fillStyle = lane;
        x.fillRect(0, 0, w, h);
        const vig = x.createRadialGradient(cx, cy, Math.min(w, h) * 0.45, cx, cy, Math.hypot(cx, cy));
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.45)');
        x.fillStyle = vig;
        x.fillRect(0, 0, w, h);
    }

    function glowSprite(rgb) {
        const s = 128;
        const c = document.createElement('canvas');
        c.width = c.height = s;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, `rgba(${rgb},0.9)`);
        g.addColorStop(0.3, `rgba(${rgb},0.35)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, s, s);
        return c;
    }

    // Roadside layout: [X (world, signed side), kind, spacing slot]
    const PROPS = [];
    (function buildProps() {
        const r = rng(2024);
        const kinds = ['palm', 'lamp', 'palm', 'palm', 'sign', 'lamp', 'palm', 'lamp'];
        for (let i = 0; i < 16; i++) {
            const side = i % 2 ? 1 : -1;
            const kind = kinds[(i >> 1) % kinds.length];
            const X = side * (kind === 'lamp' ? 1.18 : kind === 'sign' ? 1.5 : 1.45 + r() * 0.5);
            PROPS.push({ X, side, kind, slot: i / 16 + r() * 0.02 });
        }
    })();

    class SpeedArt {
        constructor() {
            this.key = '';
            this.phase = 0;
            this.carPhase = 0;
        }

        _bake(ctx, w, h) {
            if (window.game?.gameMode !== 'customise') loadArtwork();
            const m = ctx.getTransform();
            const mobile = typeof PerfGovernor !== 'undefined' && PerfGovernor.isMobile;
            const budget = Math.min(1, (mobile ? 768 : 1024) / w, (mobile ? 432 : 576) / h);
            const sx = Math.min(Math.hypot(m.a, m.b) || 1, budget);
            const sy = Math.min(Math.hypot(m.c, m.d) || 1, budget);
            const generated = artwork.ready && window.game?.gameMode !== 'customise';
            const key = `${w}|${h}|${sx.toFixed(3)}|${sy.toFixed(3)}|${generated}|${window.game?.gameMode === 'customise' ? 'original' : 'card'}`;
            if (key === this.key) return;
            this.key = key;
            this.generated = generated;
            const hy = Math.round(h * (generated ? 0.48 : HORIZON));
            this.hy = hy;
            // Sprites that are drawn scaled get a little extra resolution.
            const ps = Math.max(sx, sy) * 1.25;
            const [bc, bx] = canvas(w, h, sx, sy);
            if (generated) {
                bx.drawImage(artwork.scene, 0, 0, w, h);
                this.base = bc;
                // The sky is a separate parallax strip; the road stays fixed so
                // lane markers and traffic retain their perspective alignment.
                const [sky, skyCtx] = canvas(w, hy, sx, sy);
                skyCtx.drawImage(artwork.scene, 0, 0, artwork.scene.naturalWidth,
                    artwork.scene.naturalHeight * 0.48, 0, 0, w, hy);
                this.sky = sky;
                this.sprites = {
                    palmL: artworkSprite('palm'), palmR: artworkSprite('palm', true),
                    lampL: artworkSprite('lamp'), lampR: artworkSprite('lamp', true),
                    signL: artworkSprite('sign'), signR: artworkSprite('sign', true),
                    carA: artworkSprite('car'), carB: null
                };
                this.sprites.carB = this.sprites.carA;
                this.sun = this.clouds = this.far = this.near = this.city = null;
            } else {
            paintBase(bx, w, h, hy);
            this.base = bc;
            this.sun = paintSun(h * 0.2, sx, sy);
            this.clouds = paintClouds(w, hy, sx, sy);
            this.far = paintMountains(w, h * 0.24, sx, sy, {
                seed: 5, rough: 0.9, valley: 0.55, peaks: 9, top: '#3a1060', bottom: '#1a0634',
                wire: 'rgba(255,90,200,0.10)', rim: cardColor('rgba(255,120,210,0.75)', 'rgba(255,96,203,0.92)'),
            });
            this.city = paintCity(w, h * 0.12, sx, sy);
            this.near = paintMountains(w, h * 0.2, sx, sy, {
                seed: 19, rough: 1.1, valley: 0.9, peaks: 7, top: '#1c0736', bottom: '#09021a',
                wire: 'rgba(60,220,255,0.10)', rim: cardColor('rgba(70,220,255,0.7)', 'rgba(70,232,255,0.88)'),
            });
            this.sprites = {
                palmL: paintPalm(ps, ps, 1), palmR: paintPalm(ps, ps, -1),
                lampL: paintLamp(ps, ps, -1), lampR: paintLamp(ps, ps, 1),
                signL: paintSign(ps, ps, 1), signR: paintSign(ps, ps, -1),
                carA: paintCar(ps, ps, '#1d0f33'), carB: paintCar(ps, ps, '#2a0d24'),
            };
                this.sky = null;
            }
            const [oc, ox] = canvas(w, h, sx, sy);
            paintOverlay(ox, w, h);
            this.overlay = oc;
            this.flash = this.flash || glowSprite('255,150,200');
            this.contact = this.contact || glowSprite('0,0,0');
            this.roadGlow = this.roadGlow || glowSprite('255,90,170');
        }

        /**
         * @param st {rush, hot, pulse, lean, dt, slow}
         */
        draw(ctx, w, h, st) {
            this._bake(ctx, w, h);
            const hy = this.hy, gh = h - hy, cx = w * 0.5;
            const advance = st.dt * (2.6 + st.rush * 6.5) * st.slow;
            this.phase = (this.phase + advance) % 1000;
            this.carPhase += st.dt * st.slow;
            const lean = st.lean;

            ctx.drawImage(this.base, 0, 0, w, h);

            if (this.generated) {
                // Two image copies total for the backdrop; no draw-time filters.
                ctx.drawImage(this.sky, -w * 0.012 - lean * w * 0.008, 0, w * 1.024, hy);
            } else {

            // Sun, anchored on the horizon; it swells a touch on hits.
            const sun = this.sun;
            const sk = 1 + st.pulse * 0.04 + st.hot * 0.03;
            const sw = sun.w * sk, sh = sun.h * sk;
            ctx.drawImage(sun.c, cx - sw / 2 - lean * w * 0.006, hy - sh + 2, sw, sh);

            // Clouds drift slowly; the strip is twice the screen wide.
            const cl = this.clouds;
            const off = ((this.carPhase * w * 0.012) % cl.w + cl.w) % cl.w;
            const cy = hy - cl.h * 0.95;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(cl.c, -off, cy, cl.w, cl.h);
            ctx.drawImage(cl.c, cl.w - off, cy, cl.w, cl.h);
            ctx.globalAlpha = 1;

            // Mountains and skyline with a small parallax toward the ball.
            const far = this.far, near = this.near, city = this.city;
            ctx.drawImage(far.c, (w - far.w) / 2 - lean * w * 0.012, hy - far.h + 1, far.w, far.h);
            ctx.drawImage(city.c, (w - city.w) / 2 - lean * w * 0.018, hy - city.h + 1, city.w, city.h);
            ctx.drawImage(near.c, (w - near.w) / 2 - lean * w * 0.03, hy - near.h + 1, near.w, near.h);
            }

            // Moving ground grid: rows equally spaced in world depth.
            const rowY = (d) => hy + gh * NEAR / d;
            const SPACING = 0.7;
            const z = (this.phase * 0.35) % SPACING;
            const buckets = [[], [], []];
            for (let d = NEAR * 0.8 + SPACING - z; d < FAR; d += SPACING) {
                const y = rowY(d);
                const near01 = 1 - (d - NEAR) / (FAR - NEAR);
                buckets[near01 > 0.8 ? 2 : near01 > 0.55 ? 1 : 0].push(y);
            }
            const ga = 0.18 + st.hot * 0.1 + st.pulse * 0.2;
            for (let b = 0; b < 3; b++) {
                const ys = buckets[b];
                if (!ys.length) continue;
                ctx.strokeStyle = `rgba(255,70,190,${(ga * (0.5 + b * 0.45)).toFixed(3)})`;
                ctx.lineWidth = 0.8 + b * 0.7;
                ctx.beginPath();
                for (const y of ys) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
                ctx.stroke();
            }

            // Centre lane dashes rushing toward the viewer.
            const roadScale = this.generated ? 1.85 : 1;
            const proj = (X, d) => cx + X * roadScale * (w * 0.5) / d;
            const DASH = 2.4, DLEN = 1.0;
            const dz = (this.phase * 0.35) % DASH;
            ctx.fillStyle = `rgba(255,214,140,${(0.55 + st.pulse * 0.3).toFixed(3)})`;
            ctx.beginPath();
            for (let d = NEAR * 0.7 + DASH - dz; d < FAR; d += DASH) {
                const d2 = d + DLEN;
                const y1 = rowY(d), y2 = rowY(d2);
                const hw1 = 0.03 * (w * 0.5) / d, hw2 = 0.03 * (w * 0.5) / d2;
                ctx.moveTo(cx - hw1, y1); ctx.lineTo(cx + hw1, y1);
                ctx.lineTo(cx + hw2, y2); ctx.lineTo(cx - hw2, y2);
                ctx.closePath();
            }
            ctx.fill();

            // Reflector posts along both road edges.
            const POST = 1.6;
            const qz = (this.phase * 0.35) % POST;
            for (const [X, col] of [[-0.97, '70,230,255'], [0.97, '255,80,180']]) {
                ctx.fillStyle = `rgba(${col},${(0.75 + st.pulse * 0.25).toFixed(3)})`;
                ctx.beginPath();
                for (let d = NEAR * 1.2 + POST - qz; d < FAR; d += POST) {
                    const s = (gh * 0.2) / d, px = proj(X, d), py = rowY(d);
                    ctx.rect(px - s * 0.12, py - s, s * 0.24, s * 0.5);
                }
                ctx.fill();
            }

            // Cars ahead, drifting between lanes, tail lights glowing.
            const sp = this.sprites;
            const cars = [
                [sp.carA, -0.42 + Math.sin(this.carPhase * 0.31) * 0.12, 9 + Math.sin(this.carPhase * 0.23) * 3],
                [sp.carB, 0.45 + Math.sin(this.carPhase * 0.27 + 2) * 0.1, 15 + Math.sin(this.carPhase * 0.19 + 1) * 4],
            ];
            cars.sort((a, b) => b[2] - a[2]);
            for (const [s, X, d] of cars) {
                const k = (gh * 0.5) / d / s.h;
                const dw = s.w * k * 1.4, dh = s.h * k * 1.4;
                ctx.globalAlpha = Math.min(1, (FAR - d) / 8);
                const x = proj(X, d), y = rowY(d);
                // Tyres occlude the road; tail lights spill onto the same plane.
                ctx.drawImage(this.contact, x - dw * 0.6, y - dh * 0.14, dw * 1.2, dh * 0.28);
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha *= 0.22;
                ctx.drawImage(this.roadGlow, x - dw * 0.55, y - dh * 0.04, dw * 1.1, dh * 0.4);
                ctx.restore();
                ctx.drawImage(s.c, x - dw / 2, y - dh * 0.92, dw, dh);
            }
            ctx.globalAlpha = 1;

            // Roadside props: far to near so near ones overlap.
            const LOOP = 22;
            const pz = (this.phase * 0.35) % LOOP;
            const list = this._propList || (this._propList = PROPS.map(p => ({ p, d: 0 })));
            for (const it of list) it.d = ((it.p.slot * LOOP - pz) % LOOP + LOOP) % LOOP + 1.6;
            list.sort((a, b) => b.d - a.d);
            for (const it of list) {
                const { p, d } = it;
                if (d > FAR) continue;
                const s = p.kind === 'palm' ? (p.side < 0 ? sp.palmL : sp.palmR)
                    : p.kind === 'lamp' ? (p.side < 0 ? sp.lampL : sp.lampR)
                        : (p.side < 0 ? sp.signL : sp.signR);
                const worldH = p.kind === 'palm' ? 1.35 : p.kind === 'lamp' ? 1.25 : 0.5;
                const dh = gh * worldH / d;
                const dw = dh * (s.w / s.h);
                const x = proj(p.X, d), y = rowY(d);
                // Fade in from the haze and out before props get huge.
                const a = Math.min(1, (FAR - d) / 6, (d - 1.6) / 1.2);
                if (a <= 0.01) continue;
                ctx.globalAlpha = a;
                // Contact stays at the projected foot, at every depth.
                const footprint = Math.max(2, dw * 0.42);
                ctx.drawImage(this.contact, x - footprint * 0.5, y - dh * 0.018,
                    footprint, Math.max(2, dh * 0.045));
                ctx.drawImage(s.c, x - dw * s.anchor, y - dh, dw, dh);
            }
            ctx.globalAlpha = 1;

            // Hits flash the horizon.
            if (st.pulse > 0.02 || st.hot > 0.05) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.min(1, st.pulse * 0.6 + st.hot * 0.25);
                const fw = w * (0.5 + st.pulse * 0.3), fh = gh * 0.3;
                ctx.drawImage(this.flash, cx - fw / 2, hy - fh / 2, fw, fh);
                ctx.restore();
            }

            ctx.drawImage(this.overlay, 0, 0, w, h);
        }
    }

    window.SpeedArt = SpeedArt;
})();

