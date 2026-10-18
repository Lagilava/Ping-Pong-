// Floating citadel scenery: one bounded, baked texture plus small live accents.
// Decorative geometry never participates in the obstacle collision grid.
class ObstacleSkyScene {
    constructor(onReady) {
        this.canvas = null;
        this.key = '';
        this.motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        this.shader = typeof ObstacleSkyShader !== 'undefined' ? new ObstacleSkyShader() : null;
        this.art = new Image();
        this.ready = false;
        this.art.onload = () => {
            this.ready = true;
            this.invalidate();
            onReady();
        };
        // A failed download keeps the procedural sunset and playable court.
        this.art.onerror = () => { this.ready = false; };
        this.art.src = 'assets/images/backgrounds/obstacle-citadel.webp';
    }

    invalidate() {
        this.canvas = null;
        this.key = '';
        if (this.shader) this.shader.source = null;
    }

    _bake(w, h, grid) {
        const key = [w, h, grid.left, grid.right, grid.top, grid.bottom, grid.cols, grid.rows, this.ready].join(':');
        if (this.canvas && this.key === key) return this.canvas;
        const mobile = typeof PerfGovernor !== 'undefined' && PerfGovernor.isMobile;
        const scale = Math.min(1, (mobile ? 960 : 1280) / w, (mobile ? 540 : 720) / h);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d', {alpha: false});
        ctx.scale(c.width / w, c.height / h);
        const sky = ctx.createLinearGradient(0, 0, w, h);
        sky.addColorStop(0, '#343044');
        sky.addColorStop(0.65, '#725052');
        sky.addColorStop(1, '#c28b58');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        if (this.ready) {
            const fit = Math.max(w / this.art.naturalWidth, h / this.art.naturalHeight);
            const iw = this.art.naturalWidth * fit, ih = this.art.naturalHeight * fit;
            ctx.drawImage(this.art, (w - iw) / 2, (h - ih) / 2, iw, ih);
            if (w < h) {
                // Portrait cover cropping otherwise loses every citadel. Pin
                // softly masked corner crops at natural proportions instead.
                const size = w * 0.72;
                const crop = Math.min(this.art.naturalWidth, this.art.naturalHeight) * 0.65;
                for (const corner of [0, 1]) {
                    const patch = document.createElement('canvas');
                    patch.width = patch.height = Math.ceil(size * scale);
                    const pc = patch.getContext('2d');
                    pc.drawImage(this.art, corner ? this.art.naturalWidth - crop : 0,
                        corner ? this.art.naturalHeight - crop : 0, crop, crop,
                        0, 0, patch.width, patch.height);
                    pc.globalCompositeOperation = 'destination-in';
                    const fadeX = pc.createLinearGradient(corner ? patch.width : 0, 0, corner ? 0 : patch.width, 0);
                    fadeX.addColorStop(0, 'white'); fadeX.addColorStop(0.45, 'white'); fadeX.addColorStop(1, 'transparent');
                    pc.fillStyle = fadeX; pc.fillRect(0, 0, patch.width, patch.height);
                    const fadeY = pc.createLinearGradient(0, corner ? patch.height : 0, 0, corner ? 0 : patch.height);
                    fadeY.addColorStop(0, 'white'); fadeY.addColorStop(0.45, 'white'); fadeY.addColorStop(1, 'transparent');
                    pc.fillStyle = fadeY; pc.fillRect(0, 0, patch.width, patch.height);
                    ctx.drawImage(patch, corner ? w - size : 0, corner ? h - size : 0, size, size);
                }
            }
        }
        ctx.fillStyle = 'rgba(9,8,20,0.32)';
        ctx.fillRect(0, 0, w, h);
        // Soft darkening keeps the sunset legible at the edges and the ball
        // readable through the whole playfield, without a hard UI-like panel.
        const shade = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
        shade.addColorStop(0, 'rgba(10,12,24,0.83)');
        shade.addColorStop(0.55, 'rgba(10,12,24,0.57)');
        shade.addColorStop(1, 'rgba(10,12,24,0.08)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, w, h);

        const {left, right, top, bottom, cols, rows} = grid;
        const cw = (right - left) / Math.max(1, cols - 1);
        const ch = (bottom - top) / Math.max(1, rows - 1);
        // Quiet bronze inlays echo the card's plated blocks. They preserve
        // grid alignment but don't imply extra platforms or collision walls.
        ctx.strokeStyle = 'rgba(225,172,104,0.075)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < cols; i++) {
            const x = left + i * cw;
            ctx.moveTo(x, top); ctx.lineTo(x, bottom);
        }
        for (let i = 0; i < rows; i++) {
            const y = top + i * ch;
            ctx.moveTo(left, y); ctx.lineTo(right, y);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,193,101,0.24)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left, top, right - left, bottom - top);
        // Warm corner brackets, without expensive live shadow blurs.
        ctx.strokeStyle = '#e8b86e';
        ctx.lineWidth = 2;
        const arm = Math.min(22, h * 0.045);
        ctx.beginPath();
        for (const [x, dx] of [[left, 1], [right, -1]]) {
            for (const [y, dy] of [[top, 1], [bottom, -1]]) {
                ctx.moveTo(x + dx * arm, y);
                ctx.lineTo(x, y); ctx.lineTo(x, y + dy * arm);
            }
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(243,206,145,0.22)';
        ctx.setLineDash([5, 13]);
        ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.lineTo(w / 2, bottom); ctx.stroke();
        this.canvas = c;
        this.key = key;
        return c;
    }

    render(ctx, w, h, grid, time) {
        const source = this._bake(w, h, grid);
        const start = performance.now();
        const shaded = this.shader?.render(source, time, this.motion);
        ctx.drawImage(shaded || source, 0, 0, w, h);
        if (shaded) {
            // Cross-canvas GPU readback can be expensive on hybrid devices.
            // Fall back for the session when measured copies stay too slow.
            const cost = performance.now() - start;
            this.shader.costMs = this.shader.costMs === undefined ? cost : this.shader.costMs * 0.9 + cost * 0.1;
            this.shader.samples = (this.shader.samples || 0) + 1;
            if (this.shader.samples > 30 && this.shader.costMs > 2 && !ObstacleSkyShader.allowSoftware) this.shader.ok = false;
        }
        ctx.save();
        if (!this.motion) time = 0;
        // Small cyan falling glints suggest energy spilling into the abyss.
        // All accents stay in the gutters, away from the playable course.
        ctx.fillStyle = '#8ce9ff';
        for (let i = 0; i < 12; i++) {
            const side = i % 2;
            const x = side ? w * (0.94 + (i % 3) * 0.014) : w * (0.025 + (i % 3) * 0.014);
            const y = ((i * 0.137 + time * 0.035) % 1) * h;
            ctx.globalAlpha = 0.10 + Math.sin(i + time) * 0.045;
            ctx.fillRect(x, y, Math.max(1, w / 1200), Math.max(4, h * 0.018));
        }
        ctx.restore();
    }
}
