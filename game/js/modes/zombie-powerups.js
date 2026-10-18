// Generated collectible art, shared by the arena, rewards and active-effect HUD.
// Glow is baked into the art: live animation uses transforms and plain strokes.
(function () {
    'use strict';
    const TYPES = ['rage', 'shield', 'slow', 'life'];
    const COLORS = ['#ff8748', '#65dfff', '#7effb5', '#ff73b6'];
    const atlas = new Image();
    atlas.src = 'assets/images/powerups/zombie-powerups.webp';
    // Collectible feedback stays animated independently of scene motion settings.

    function icon(ctx, type, x, y, size) {
        const index = TYPES.indexOf(type === 'repair' ? 'life' : type);
        if (index < 0) return;
        if (atlas.complete && atlas.naturalWidth) {
            const cw = atlas.naturalWidth / 2, ch = atlas.naturalHeight / 2;
            ctx.drawImage(atlas, (index % 2) * cw, Math.floor(index / 2) * ch,
                cw, ch, x - size / 2, y - size / 2, size, size);
        } else {
            // Readable loading/error fallback, with a distinct life symbol.
            ctx.fillStyle = COLORS[index];
            ctx.font = `bold ${Math.round(size * 0.5)}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(['ϟ', '◇', '⌛', '♥'][index], x, y);
        }
    }

    function draw(ctx, pickup) {
        const age = Math.max(0, 12 - pickup.life);
        const enter = Math.min(1, age / 0.28);
        const scale = 1 - Math.pow(1 - enter, 3) + Math.sin(enter * Math.PI) * 0.12;
        const bob = Math.sin(pickup.pulse * 0.45) * Math.min(3, pickup.r * 0.1);
        const radius = pickup.r * 1.16;
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.scale(scale, scale);
        // Fade gently in the last two seconds instead of flashing the icon.
        ctx.globalAlpha = Math.min(1, Math.max(0, pickup.life / 2));
        ctx.fillStyle = '#07141be6';
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = pickup.color;
        ctx.globalAlpha *= 0.45;
        ctx.stroke();
        ctx.globalAlpha = Math.min(1, Math.max(0, pickup.life / 2));
        // The orbit doubles as a lifetime indicator; it never changes the hitbox.
        ctx.lineWidth = 2;
        ctx.beginPath();
        const start = -Math.PI / 2;
        ctx.arc(0, 0, radius, start, start + Math.PI * 2 * Math.max(0, pickup.life / 12));
        ctx.stroke();
        icon(ctx, pickup.type, 0, bob, pickup.r * 3.1);
        ctx.restore();
    }

    function burst(ctx, effect, player) {
        const t = Math.min(1, effect.age / 0.65);
        ctx.save();
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2 * (1 - t);
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.r * (1 + t * 2), 0, Math.PI * 2); ctx.stroke();
        if (player) {
            const ease = t * t * (3 - 2 * t);
            const x = effect.x + (player.pos.x + player.w / 2 - effect.x) * ease;
            const y = effect.y + (player.pos.y + player.h / 2 - effect.y) * ease - Math.sin(t * Math.PI) * 28;
            icon(ctx, effect.type, x, y, effect.r * 3 * (1 - t * 0.65));
        }
        ctx.restore();
    }

    function badge(type, text) {
        return `<span class="zombie-boost zombie-boost-${type}"><span class="zombie-powerup-art zombie-art-${type}" aria-hidden="true"></span><span>${text}</span></span>`;
    }
    window.ZombiePowerups = { draw, burst, badge, icon };
})();
