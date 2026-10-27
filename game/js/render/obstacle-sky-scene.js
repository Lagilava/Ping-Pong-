// Floating citadel scenery: one bounded, baked texture plus small live accents.
// Decorative geometry never participates in the obstacle collision grid.
class ObstacleSkyScene {
    constructor(onReady) {
        this.canvas = null;
        this.waterfalls = null;
        this.key = '';
        this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
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
        this.art.src = 'assets/images/backgrounds/obstacle-citadel.webp?v=20261027-4k-1';
    }

    invalidate() {
        this.canvas = null;
        this.waterfalls = null;
        this.key = '';
        if (this.shader) this.shader.source = null;
    }

    _bake(w, h, grid) {
        const originalPalette = false;
        const color = (original, matched) => originalPalette ? original : matched;
        const resolution = window.PPResolution?.scale(w, h, 960, 540);
        const key = [originalPalette, w, h, resolution, grid.left, grid.right, grid.top, grid.bottom, grid.cols, grid.rows, this.ready].join(':');
        if (this.canvas && this.key === key) return this.canvas;
        const mobile = typeof PerfGovernor !== 'undefined' && PerfGovernor.isMobile;
        const scale = resolution ?? Math.min(1, (mobile ? 960 : 1280) / w, (mobile ? 540 : 720) / h);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d', {alpha: false});
        ctx.scale(c.width / w, c.height / h);
        const sky = ctx.createLinearGradient(0, 0, w, h);
        sky.addColorStop(0, color('#343044', '#3b3036'));
        sky.addColorStop(0.65, color('#725052', '#97684f'));
        sky.addColorStop(1, color('#c28b58', '#dba16b'));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        if (this.ready) {
            const fit = Math.max(w / this.art.naturalWidth, h / this.art.naturalHeight);
            const iw = this.art.naturalWidth * fit, ih = this.art.naturalHeight * fit;
            // Keep one camera projection in portrait too. Pasting corner crops
            // introduced duplicate skies, mismatched scale and visible cutout seams.
            // Frame the right citadel and its sun instead of the empty centre.
            const focusX = w < h ? 0.92 : 0.5;
            ctx.drawImage(this.art, (w - iw) * focusX, (h - ih) / 2, iw, ih);
        }

        if (!originalPalette) {
            ctx.globalCompositeOperation = 'soft-light';
            ctx.fillStyle = 'rgba(255,181,104,0.16)';
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = color('rgba(9,8,20,0.32)', 'rgba(25,16,13,0.12)');
        ctx.fillRect(0, 0, w, h);
        // Soft darkening keeps the sunset legible at the edges and the ball
        // readable through the whole playfield, without a hard UI-like panel.
        const shade = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
        shade.addColorStop(0, color('rgba(10,12,24,0.83)', 'rgba(14,17,25,0.62)'));
        shade.addColorStop(0.55, color('rgba(10,12,24,0.57)', 'rgba(23,20,28,0.38)'));
        shade.addColorStop(1, color('rgba(10,12,24,0.08)', 'rgba(29,20,17,0.06)'));
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
        this.waterfalls = this.ready && typeof ObstacleWaterfalls !== 'undefined' ? new ObstacleWaterfalls(c) : null;
        this.canvas = c;
        this.key = key;
        return c;
    }

    render(ctx, w, h, grid, time) {
        const source = this._bake(w, h, grid);
        const start = performance.now();
        const shaded = this.shader?.render(source, time, true);
        ctx.drawImage(shaded || source, 0, 0, w, h);
        if (shaded) {
            // Cross-canvas GPU readback can be expensive on hybrid devices.
            // Fall back for the session when measured copies stay too slow.
            const cost = performance.now() - start;
            this.shader.costMs = this.shader.costMs === undefined ? cost : this.shader.costMs * 0.9 + cost * 0.1;
            this.shader.samples = (this.shader.samples || 0) + 1;
            if (this.shader.samples > 30 && this.shader.costMs > 2 && !ObstacleSkyShader.allowSoftware) this.shader.ok = false;
        }
        // Motion belongs to the painted falls; independent gutter streaks
        // have no physical emitter and used to look like an overlay sticker.
        this.waterfalls?.render(ctx, w, h, time);
    }
}
