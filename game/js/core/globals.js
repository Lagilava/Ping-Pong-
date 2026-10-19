window.game = null;
window.PP_RUNTIME_SETTINGS = window.PP_RUNTIME_SETTINGS || { disableParticles: false };
// ctx -> (geometry key -> CanvasGradient), for the zombie hand phalanx renderer.
const ZOMBIE_PHALANX_GRADS = new WeakMap();
// geometry key -> baked phalanx sprite, shared across contexts.
const ZOMBIE_PHALANX_SPRITES = new Map();
// Debug trace for the menu achievements panel. Silent unless PP_DEBUG is set,
// so it no longer logs (and keeps every payload in memory) during normal play.
window.__ppTraceMenuAchievements = function (stage, extra = {}) {
    if (!window.PP_DEBUG) return null;
    const payload = {
        stage,
        overlayClasses: Array.from(document.getElementById('overlay')?.classList || []),
        ...extra
    };
    console.log('[MenuTrace]', payload);
    return payload;
};
function areParticleEffectsEnabled() {
    return !window.PP_RUNTIME_SETTINGS?.disableParticles;
}

// ===================================================================
// ADAPTIVE QUALITY
// Keeps the game at the display's refresh rate (120 Hz laptops included).
//
// The governor learns the refresh interval from the fastest frames it sees,
// then compares the median frame time against it. Missing vsync drops a tier;
// sustained headroom climbs back. Each tier trades:
//   - Canvas 2D glow (shadowBlur, by far the most expensive 2D effect). When
//     the WebGL post-process is running, bloom supplies the glow instead, so
//     shadowBlur is scaled right down even at the top tier.
//   - particle counts
//   - render resolution (canvas backing-store scale)
//   - post-process quality
// ===================================================================
const PerfGovernor = {
    TIERS: [
        // bgFps: how often animated backgrounds are redrawn. Gameplay stays
        // on every requestAnimationFrame, including high-refresh displays.
        // scale: canvas resolution multiplier (capped at devicePixelRatio).
        // Pixel fill is the real cost of this game, so scale is the big lever;
        // bloom hides the difference between 1.25x and 1.5x.
        { name: 'high',   glow: 1.0,  glowFx: 0.35, particles: 1.0,  scale: 1.25, fx: 0, bgFps: 60 },
        { name: 'medium', glow: 0.5,  glowFx: 0.12, particles: 0.65, scale: 1.0,  fx: 1, bgFps: 45 },
        { name: 'low',    glow: 0.15, glowFx: 0.0,  particles: 0.4,  scale: 0.9,  fx: 1, bgFps: 30 },
        { name: 'potato', glow: 0.0,  glowFx: 0.0,  particles: 0.25, scale: 0.75, fx: 3, bgFps: 24 },
    ],
    // Phones/tablets get their own ladder: canvas glow (shadowBlur) is far too
    // expensive on mobile GPUs, render at CSS resolution or below, and only the
    // top mobile tier runs the (single-level) bloom pass.
    MOBILE_TIERS: [
        // Phone screens are 2-3x DPR; below ~1.25x the court lines and HUD
        // text go visibly soft, so even the bottom tier stays at 1x.
        { name: 'mobile-high', glow: 0, glowFx: 0, particles: 0.5,  scale: 1.5,  fx: 1, bgFps: 30 },
        { name: 'mobile',      glow: 0, glowFx: 0, particles: 0.35, scale: 1.25, fx: 3, bgFps: 30 },
        { name: 'mobile-low',  glow: 0, glowFx: 0, particles: 0.2,  scale: 1.0,  fx: 3, bgFps: 20 },
    ],
    isMobile: false,
    tier: 0,
    // Never go below this frame rate. Above it we still try to match the
    // display (e.g. 120 Hz), but only by trimming the top tier, never by
    // dropping below 'medium' while 60+ fps is being met.
    MIN_FPS: 60,
    fxActive: false,
    refreshMs: 1000 / 60,
    _samples: [],
    _fast: [],
    _cooldown: 0,
    _locked: false,           // set when the player picks a tier by hand
    _listeners: [],

    get current() { return this.TIERS[this.tier]; },
    get glowScale() {
        // Zombie lighting is baked into sprites/scenery. Do not replace its
        // disabled post-processing with expensive live Canvas shadow layers.
        if (window.game?.gameMode === 'zombie') return 0;
        return this.fxActive ? this.current.glowFx : this.current.glow;
    },
    get particleScale() { return this.current.particles; },
    get tierName() { return this.current.name; },
    /** Canvas backing-store scale: never above the screen's own pixel ratio. */
    get renderScale() { return Math.min(window.devicePixelRatio || 1, this.current.scale); },
    get fps() { return Math.round(1000 / this.refreshMs); },

    onChange(fn) { this._listeners.push(fn); },

    /**
     * Starting tier from what the device tells us, so phones and low-end
     * laptops don't spend their first seconds stuttering. The governor then
     * climbs back up if there's headroom.
     */
    initForDevice() {
        const nav = typeof navigator !== 'undefined' ? navigator : {};
        const ua = nav.userAgent || '';
        const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
        const smallScreen = Math.min(screen?.width || 9999, screen?.height || 9999) < 820;
        const cores = nav.hardwareConcurrency || 8;
        const memory = nav.deviceMemory || 8;          // Chrome/Edge only; GB, rounded
        this.isMobile = !!(nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && smallScreen));
        if (this.isMobile) {
            this.TIERS = this.MOBILE_TIERS;
            // Mid tier to start; strong phones climb to the bloom tier.
            this.tier = (cores <= 4 || memory <= 3) ? 2 : 1;
            this.deviceClass = 'mobile';
            document.documentElement?.classList.add('pp-mobile');
        } else {
            let start = 0;
            if (cores <= 4 || memory <= 4) start = 1;
            if (cores <= 2 || memory <= 2) start = 3;
            this.tier = start;
            this.deviceClass = start === 0 ? 'desktop' : 'low-end';
        }
        this._applyTier();
    },

    setTier(i, lock = true) {
        const next = Math.max(0, Math.min(this.TIERS.length - 1, i));
        this._locked = lock;
        if (next === this.tier) return;
        this.tier = next;
        this._applyTier();
    },

    _applyTier() {
        // DOM glow (box/text-shadow on HUD) is shed below the top tier.
        document.body?.classList.toggle('pp-lowfx', this.tier > 0);
        for (const fn of this._listeners) {
            try { fn(this.current, this.tier); } catch (e) { console.warn(e); }
        }
    },

    /** Called once per rendered frame with the frame's duration in ms. */
    sample(dtMs) {
        if (!(dtMs > 0) || dtMs > 250) return;          // ignore tab-out stalls

        // Learn the vsync interval: the 10th-percentile of recent frame times.
        const f = this._fast;
        f.push(dtMs);
        if (f.length >= 120) {
            const sorted = f.slice().sort((a, b) => a - b);
            const p10 = sorted[Math.floor(sorted.length * 0.1)];
            // Snap to common refresh rates so jitter can't skew the target.
            const rates = [240, 165, 144, 120, 90, 75, 60, 50, 30];
            const hz = rates.reduce((best, r) => Math.abs(1000 / r - p10) < Math.abs(1000 / best - p10) ? r : best, 60);
            this.refreshMs = 1000 / hz;
            f.length = 0;
        }

        this._clock = (this._clock || 0) + dtMs;
        if (this._locked) return;
        const s = this._samples;
        s.push(dtMs);
        if (s.length < 45) return;
        const sorted = s.slice().sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        s.length = 0;

        if (this._cooldown > 0) { this._cooldown--; return; }

        const budget = this.refreshMs;
        const floorMs = 1000 / this.MIN_FPS;
        const last = this.TIERS.length - 1;
        const missingVsync = median > budget * 1.3 || p90 > budget * 2.2;
        const belowFloor = median > floorMs * 1.08;     // under ~55 fps
        // Under 60 fps always sheds quality (even if the learned refresh rate
        // is itself low, e.g. a weak machine that only ever reaches 45 fps);
        // missing a faster display's vsync only trims the top tier.
        if (this.tier < last && (belowFloor || (missingVsync && this.tier < 1))) {
            // Way below 60 (under ~27 fps): skip a tier to recover quickly.
            const step = median > floorMs * 2.2 ? 2 : 1;
            if (belowFloor) {
                // Remember that this tier can't hold 60 fps, so we don't keep
                // climbing back into it (which shows up as periodic hitches).
                // The memory expires after a minute in case conditions improve.
                // A retry that fails doubles the wait (1, 2, 4, 8 minutes).
                const retried = this._clock - (this._lastClimbAt || -1e9) < 10000;
                this._retryDelay = retried ? Math.min(480000, (this._retryDelay || 60000) * 2) : (this._retryDelay || 60000);
                this._bestAllowed = Math.max(this._bestAllowed || 0, this.tier + 1);
                this._bestAllowedUntil = this._clock + this._retryDelay;
            }
            this.tier = Math.min(last, this.tier + step);
            this._cooldown = 0;
            this._clean = 0;
            this._applyTier();
        } else if (median < budget * 1.08 && p90 < budget * 1.35 && this.tier > 0) {
            if (this._bestAllowed && this._clock > this._bestAllowedUntil) this._bestAllowed = 0;
            if (this.tier - 1 < (this._bestAllowed || 0)) return;
            // Climb back slowly: only after several clean windows.
            this._clean = (this._clean || 0) + 1;
            if (this._clean >= 4) {
                this._clean = 0;
                this.tier--;
                // Re-check straight away so a tier that can't hold up is
                // abandoned within a second or two.
                this._cooldown = 0;
                this._lastClimbAt = this._clock;
                this._applyTier();
            }
        } else {
            this._clean = 0;
        }
    },

    // Shadow the shadowBlur accessor on this specific context instance so every
    // glow draw call is scaled by the current tier without touching call sites.
    attach(ctx) {
        if (!ctx || ctx.__ppGlowGoverned) return;
        const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
        if (!desc || !desc.set) return;
        const gov = this;
        Object.defineProperty(ctx, 'shadowBlur', {
            get() { return desc.get.call(this); },
            set(v) { desc.set.call(this, v > 0 ? v * gov.glowScale : v); },
            configurable: true,
        });
        ctx.__ppGlowGoverned = true;
    },
};
window.PerfGovernor = PerfGovernor;

// Canvas 2D draws a shadowed shape under any blend other than source-over by
// compositing through a layer the size of the whole canvas, which makes one
// small glowing dot cost as much as a full-screen pass. drawShadowUnderBlend()
// produces the same picture with small buffers: the shadow is rendered alone
// into a scratch canvas aligned to the device-pixel grid and composited with
// the current blend, then the shape itself is drawn with the blend and no
// shadow (the order the spec defines: shadow first, then shape).
//   bounds: user-space box {x0, y0, x1, y1} that contains the shape (strokes
//           included); draw(c) issues the path and its fill/stroke on c.
const _shadowScratch = { canvas: null, ctx: null };
function drawShadowUnderBlend(ctx, bounds, draw) {
    const blur = ctx.shadowBlur;
    const op = ctx.globalCompositeOperation;
    if (op === 'source-over' || !(blur > 0)) { draw(ctx); return; }

    const m = ctx.getTransform();
    const xs = [bounds.x0, bounds.x1], ys = [bounds.y0, bounds.y1];
    let dx0 = Infinity, dy0 = Infinity, dx1 = -Infinity, dy1 = -Infinity;
    for (const x of xs) for (const y of ys) {
        const px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
        if (px < dx0) dx0 = px; if (px > dx1) dx1 = px;
        if (py < dy0) dy0 = py; if (py > dy1) dy1 = py;
    }
    const offX = ctx.shadowOffsetX, offY = ctx.shadowOffsetY;
    const pad = Math.ceil(blur * 1.5) + 3;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const bx0 = Math.max(0, Math.floor(Math.min(dx0, dx0 + offX)) - pad);
    const by0 = Math.max(0, Math.floor(Math.min(dy0, dy0 + offY)) - pad);
    const bx1 = Math.min(cw, Math.ceil(Math.max(dx1, dx1 + offX)) + pad);
    const by1 = Math.min(ch, Math.ceil(Math.max(dy1, dy1 + offY)) + pad);
    const bw = bx1 - bx0, bh = by1 - by0;

    if (bw > 0 && bh > 0) {
        if (!_shadowScratch.canvas) {
            _shadowScratch.canvas = document.createElement('canvas');
            _shadowScratch.ctx = _shadowScratch.canvas.getContext('2d');
        }
        const sc = _shadowScratch.canvas;
        if (sc.width < bw || sc.height < bh) {
            sc.width = Math.max(sc.width, bw);
            sc.height = Math.max(sc.height, bh);
        }
        const s = _shadowScratch.ctx;
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.globalCompositeOperation = 'source-over';
        s.globalAlpha = 1;
        s.shadowColor = 'rgba(0,0,0,0)';
        s.clearRect(0, 0, bw, bh);
        s.globalAlpha = ctx.globalAlpha;
        s.fillStyle = ctx.fillStyle;
        s.strokeStyle = ctx.strokeStyle;
        s.lineWidth = ctx.lineWidth;
        s.lineCap = ctx.lineCap;
        s.lineJoin = ctx.lineJoin;
        s.miterLimit = ctx.miterLimit;
        s.setLineDash(ctx.getLineDash());
        s.lineDashOffset = ctx.lineDashOffset;
        // Keep the shape itself off the scratch canvas: shift it left by `far`
        // device pixels and offset only its shadow back into place.
        const far = bw + Math.abs(dx1 - dx0) + pad * 2;
        s.shadowColor = ctx.shadowColor;
        s.shadowBlur = blur;
        s.shadowOffsetX = far + offX;
        s.shadowOffsetY = offY;
        s.setTransform(m.a, m.b, m.c, m.d, m.e - bx0 - far, m.f - by0);
        draw(s);
        s.shadowColor = 'rgba(0,0,0,0)';

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.drawImage(sc, 0, 0, bw, bh, bx0, by0, bw, bh);
        ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    draw(ctx);
    ctx.restore();
}
window.drawShadowUnderBlend = drawShadowUnderBlend;
PerfGovernor.initForDevice();
