// One physical-pixel budget for all scenery, including high-DPI screens.
// Lower quality presets and mobile retain smaller textures and caches.
(function () {
    const governor = () => typeof PerfGovernor !== 'undefined' ? PerfGovernor : null;
    function maxWidth() {
        const g = governor(), tier = g?.current;
        if (g?.isMobile) return 1024;
        if (/low|potato/.test(tier?.name || '') || (tier?.bgFps > 0 && tier.bgFps <= 30)) return 1280;
        if (/medium/.test(tier?.name || '') || (tier?.bgFps > 0 && tier.bgFps <= 45)) return 2560;
        return 3840;
    }
    function scale(w, h, mobileW = 1024, mobileH = 576) {
        const g = governor();
        if (g?.isMobile) return Math.min(1, mobileW / w, mobileH / h);
        const density = g?.renderScale ?? Math.min(window.devicePixelRatio || 1, 2);
        const cap = maxWidth();
        return Math.min(density, cap / w, (cap * 9 / 16) / h);
    }
    function detail() { return governor()?.isMobile ? 1 : maxWidth() >= 3840 ? 2 : maxWidth() >= 2560 ? 1.5 : 1; }
    window.PPResolution = { scale, maxWidth, detail,
        spriteLimit: () => governor()?.isMobile ? 384 : Math.round(768 * detail()) };
})();
