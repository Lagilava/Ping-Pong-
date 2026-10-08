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
window.__ppMenuTrace = window.__ppMenuTrace || [];
window.__ppTraceMenuAchievements = window.__ppTraceMenuAchievements || function (stage, extra = {}) {
    const payload = {
        stage,
        at: new Date().toISOString(),
        overlayClasses: Array.from(document.getElementById('overlay')?.classList || []),
        menuVisible: document.getElementById('menuRecentAchievements')?.style.display || null,
        menuExists: !!document.getElementById('menuAchievementsList'),
        progressionRecent: window.game?.progression?.getRecentlyUnlockedAchievements?.() || [],
        progressionLastMatch: window.game?.progression?.getLastMatchUnlockedAchievements?.() || [],
        windowLastMatch: Array.isArray(window.__ppLastMatchAchievements) ? window.__ppLastMatchAchievements.slice() : [],
        windowMenuRecent: Array.isArray(window.__ppMenuRecentAchievements) ? window.__ppMenuRecentAchievements.slice() : [],
        windowLastMatchIndex: window.__ppLastMatchAchievementIndex,
        windowMenuIndex: window.__ppMenuRecentAchievementIndex,
        ...extra
    };
    window.__ppMenuTrace.push(payload);
    console.log('[MenuTrace]', payload);
    return payload;
};
function areParticleEffectsEnabled() {
    return !window.PP_RUNTIME_SETTINGS?.disableParticles;
}

// ===================================================================
// ADAPTIVE QUALITY
// Glow (ctx.shadowBlur) is the dominant per-frame cost: it forces a CPU-side
// blur of every shape drawn with it. Rather than gate ~130 call sites, we
// shadow the shadowBlur accessor on the game context and scale every write
// by the current tier. Tier 1 is the authored look; lower tiers shed glow
// first, then particles, when frames run long.
// ===================================================================
const PerfGovernor = {
    TIERS: [
        { name: 'high', glow: 1.0, particles: 1.0 },
        { name: 'medium', glow: 0.5, particles: 0.6 },
        { name: 'low', glow: 0.0, particles: 0.35 },
    ],
    tier: 0,
    _samples: [],
    _cooldown: 0,
    _locked: false, // set true if the player picks a tier by hand

    get glowScale() { return this.TIERS[this.tier].glow; },
    get particleScale() { return this.TIERS[this.tier].particles; },
    get tierName() { return this.TIERS[this.tier].name; },

    setTier(i) {
        this.tier = Math.max(0, Math.min(this.TIERS.length - 1, i));
        this._locked = true;
        this._applyTier();
    },

    // DOM glow is the most expensive UI effect, so shed it below the top tier.
    _applyTier() {
        document.body?.classList.toggle('pp-lowfx', this.tier > 0);
    },

    // Called once per rendered frame with the frame's duration in ms.
    sample(dtMs) {
        if (this._locked || !(dtMs > 0) || dtMs > 500) return; // ignore tab-out stalls
        const s = this._samples;
        s.push(dtMs);
        if (s.length < 45) return;

        const sorted = [...s].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        s.length = 0;

        if (this._cooldown > 0) { this._cooldown--; return; }

        // Hysteresis: drop a tier well past 60fps budget, only climb back when
        // there is real headroom, so the tier cannot oscillate frame to frame.
        if (median > 22 && this.tier < this.TIERS.length - 1) {
            this.tier++;
            this._cooldown = 2;
            this._applyTier();
        } else if (median < 13 && this.tier > 0) {
            this.tier--;
            this._cooldown = 2;
            this._applyTier();
        }
    },

    // Shadow the accessor on this specific context instance.
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
