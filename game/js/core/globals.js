window.game = null;
window.PP_RUNTIME_SETTINGS = window.PP_RUNTIME_SETTINGS || { disableParticles: false };
// ctx -> (geometry key -> CanvasGradient), for the zombie hand phalanx renderer.
const ZOMBIE_PHALANX_GRADS = new WeakMap();
// geometry key -> baked phalanx sprite, shared across contexts.
const ZOMBIE_PHALANX_SPRITES = new Map();
window.__ppLastMatchAchievements = window.__ppLastMatchAchievements || [];
window.__ppLastMatchAchievementIndex = window.__ppLastMatchAchievementIndex || 0;
window.__ppMenuRecentAchievements = window.__ppMenuRecentAchievements || [];
window.__ppMenuRecentAchievementIndex = window.__ppMenuRecentAchievementIndex || 0;
window.__ppMenuLastNonEmptyAchievements = window.__ppMenuLastNonEmptyAchievements || [];
window.__ppMenuLastNonEmptyAchievementIndex = window.__ppMenuLastNonEmptyAchievementIndex || 0;
window.__ppMenuDisplayAchievements = window.__ppMenuDisplayAchievements || [];
window.__ppMenuDisplayAchievementIndex = window.__ppMenuDisplayAchievementIndex || 0;
window.__ppSnapshotClearEvents = window.__ppSnapshotClearEvents || [];
// Debug trace for the menu achievements panel. Silent unless PP_DEBUG is set,
// so it no longer logs (and keeps every payload in memory) during normal play.
window.__ppTraceMenuAchievements = function (stage, extra = {}) {
    if (!window.PP_DEBUG) return null;
    const payload = {
        stage,
        overlayClasses: Array.from(document.getElementById('overlay')?.classList || []),
        windowLastMatch: Array.isArray(window.__ppLastMatchAchievements) ? window.__ppLastMatchAchievements.slice() : [],
        windowMenuRecent: Array.isArray(window.__ppMenuRecentAchievements) ? window.__ppMenuRecentAchievements.slice() : [],
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
        // bgFps: how often animated backgrounds are redrawn (0 = every frame).
        // scale: canvas resolution multiplier (capped at devicePixelRatio).
        // Pixel fill is the real cost of this game, so scale is the big lever;
        // bloom hides the difference between 1.25x and 1.5x.
        { name: 'high',   glow: 1.0,  glowFx: 0.35, particles: 1.0,  scale: 1.25, fx: 0, bgFps: 0 },
        { name: 'medium', glow: 0.5,  glowFx: 0.12, particles: 0.65, scale: 1.0,  fx: 1, bgFps: 60 },
        { name: 'low',    glow: 0.15, glowFx: 0.0,  particles: 0.4,  scale: 0.9,  fx: 1, bgFps: 30 },
        { name: 'potato', glow: 0.0,  glowFx: 0.0,  particles: 0.25, scale: 0.75, fx: 3, bgFps: 24 },
    ],
    tier: 0,
    fxActive: false,
    refreshMs: 1000 / 60,
    _samples: [],
    _fast: [],
    _cooldown: 0,
    _locked: false,           // set when the player picks a tier by hand
    _listeners: [],

    get current() { return this.TIERS[this.tier]; },
    get glowScale() { return this.fxActive ? this.current.glowFx : this.current.glow; },
    get particleScale() { return this.current.particles; },
    get tierName() { return this.current.name; },
    /** Canvas backing-store scale: never above the screen's own pixel ratio. */
    get renderScale() { return Math.min(window.devicePixelRatio || 1, this.current.scale); },
    get fps() { return Math.round(1000 / this.refreshMs); },

    onChange(fn) { this._listeners.push(fn); },

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

        if (this._locked) return;
        const s = this._samples;
        s.push(dtMs);
        if (s.length < 60) return;
        const sorted = s.slice().sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        s.length = 0;

        if (this._cooldown > 0) { this._cooldown--; return; }

        const budget = this.refreshMs;
        if ((median > budget * 1.3 || p90 > budget * 2.2) && this.tier < this.TIERS.length - 1) {
            this.tier++;
            this._cooldown = 2;
            this._applyTier();
        } else if (median < budget * 1.08 && p90 < budget * 1.35 && this.tier > 0) {
            // Climb back slowly: only after several clean windows.
            this._clean = (this._clean || 0) + 1;
            if (this._clean >= 4) {
                this._clean = 0;
                this.tier--;
                this._cooldown = 3;
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

//Vector class
