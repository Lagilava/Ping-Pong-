/* Art direction: "Neon Broadcast". One palette per mode, one plate shape, one
   type pair (Orbitron labels and numerals, Rajdhani copy). The CSS twin is
   css/art-direction.css; keep the two accent tables in sync. */
(function () {
    const MODES = {
        classic:   { accent: '#ff3a5c', accent2: '#4de3ff' },
        zombie:    { accent: '#6ddc4f', accent2: '#d6f28a' },
        gravity:   { accent: '#8f9bff', accent2: '#3d9eff' },
        speed:     { accent: '#ffbe00', accent2: '#ff3fa4' },
        obstacle:  { accent: '#ff9a3c', accent2: '#ffd477' },
        customise: { accent: '#00ffc8', accent2: '#7aa8ff' }
    };
    const PPArt = {
        MODES,
        DISPLAY: "Orbitron, 'Audiowide', sans-serif",
        BODY: "Rajdhani, 'Segoe UI', sans-serif",
        palette(mode) { return MODES[mode] || MODES.classic; },
        // Signature plate: sharp top-left and bottom-right, rounded other two.
        // Draws fill, hairline border and a short accent rule on the top edge.
        plate(ctx, x, y, w, h, accent, fill) {
            const s = Math.min(4, h / 6), r = Math.min(14, h / 3);
            ctx.beginPath();
            ctx.moveTo(x + s, y);
            ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - s); ctx.lineTo(x + w - s, y + h);
            ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + s); ctx.closePath();
            ctx.fillStyle = fill || 'rgba(6, 11, 24, 0.86)';
            ctx.fill();
            ctx.strokeStyle = accent; ctx.globalAlpha *= 0.7; ctx.lineWidth = 1; ctx.stroke();
            ctx.globalAlpha /= 0.7;
            ctx.fillStyle = accent; ctx.fillRect(x + s + 4, y, Math.min(38, w * 0.22), 2);
        }
    };
    window.PPArt = PPArt;
})();
