class NeonTrailParticle {
    constructor(x, y, color, size, life, vx, vy) {
        this.reset(x, y, color, size, life, vx, vy);
        // Pre-calculate values for better performance
        this.halfSize = size / 2;
    }

    reset(x, y, color, size, life, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;

        // Performance optimizations
        this.maxLife = life;
        this.life = life;
        this.size = size;
        this.halfSize = size / 2;
        this.alpha = 0.6; // Reduced initial alpha

        // Pre-calculate color
        this.r = parseInt(color.slice(1, 3), 16);
        this.g = parseInt(color.slice(3, 5), 16);
        this.b = parseInt(color.slice(5, 7), 16);

        return this;
    }

    update(dt) {
        // OPTIMIZED: Simplified physics
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Apply drag
        this.vx *= 0.95;
        this.vy *= 0.95;

        this.life -= dt;
        if (this.life <= 0) return false;

        // Linear fade
        this.alpha = 0.6 * (this.life / this.maxLife);
        this.size = this.size * (this.life / this.maxLife);
        this.halfSize = this.size / 2;

        return true;
    }

    render(ctx) {
        // OPTIMIZED: Skip rendering very small/transparent particles
        if (this.size < 0.5 || this.alpha < 0.05) return;

        // OPTIMIZED: Use fillRect for better performance than arc
        const originalAlpha = ctx.globalAlpha;
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;
        ctx.fillRect(
            this.x - this.halfSize,
            this.y - this.halfSize,
            this.size,
            this.size
        );
        ctx.globalAlpha = originalAlpha;
    }
}

// Ultra-optimized NeonParticle with maximum performance
class NeonParticle {
    constructor(x, y, color, size, life, vx, vy) {
        this.reset(x, y, color, size, life, vx, vy);
    }

    reset(x, y, color, size, life, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.baseSize = size;
        this.alpha = 1.0;

        // Pre-calculate drag factor (bitwise operations for slight optimization)
        this.dragFactor = 0.96 + (Math.random() * 0.03 | 0);

        // Pre-parse all color values once
        if (color.startsWith('hsl')) {
            this.isHSL = true;
            this.color = color;
        } else {
            this.isHSL = false;
            // Pre-calculate RGB values as integers
            if (color.startsWith('#')) {
                this.r = parseInt(color.slice(1, 3), 16);
                this.g = parseInt(color.slice(3, 5), 16);
                this.b = parseInt(color.slice(5, 7), 16);
            } else if (color.startsWith('rgb')) {
                const match = color.match(/\d+/g);
                this.r = parseInt(match[0]);
                this.g = parseInt(match[1]);
                this.b = parseInt(match[2]);
            }

            // Pre-calculate color string for faster rendering
            this.colorString = `rgb(${this.r},${this.g},${this.b})`;
        }

        return this;
    }

    update(dt) {
        // OPTIMIZED: Simplified physics with multiplication instead of division
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // OPTIMIZED: Use bitwise operations for drag (slightly faster)
        this.vx = (this.vx * this.dragFactor) | 0;
        this.vy = (this.vy * this.dragFactor) | 0;

        this.life -= dt;
        if (this.life <= 0) return false;

        // OPTIMIZED: Pre-calculate alpha and size ratio once
        this.lifeRatio = this.life / this.maxLife;

        // Use bitwise operations for size calculation (faster than multiplication/division)
        this.size = (this.baseSize * this.lifeRatio) | 0;

        // Skip particles that are too small to see
        if (this.size < 0.5) return false;

        return true;
    }

    render(ctx) {
        // OPTIMIZED: Skip rendering very small or transparent particles
        if (this.size < 0.5 || this.lifeRatio < 0.03) return;

        // OPTIMIZED: Use save/restore only when necessary
        const needsAlphaChange = this.lifeRatio < 1.0;
        if (needsAlphaChange) {
            ctx.save();
            ctx.globalAlpha = this.lifeRatio;
        }

        // OPTIMIZED: Use pre-calculated color string
        ctx.fillStyle = this.isHSL ? this.color : this.colorString;

        // OPTIMIZED: Always use rectangle for maximum performance
        // Adjust size to make small particles visible
        const renderSize = Math.max(1, this.size);
        ctx.fillRect(
            this.x - renderSize / 2,
            this.y - renderSize / 2,
            renderSize,
            renderSize
        );

        // OPTIMIZED: Simplified glow effect only for larger particles
        if (this.lifeRatio > 0.3 && this.size > 2) {
            ctx.globalAlpha = this.lifeRatio * 0.15;
            const glowSize = renderSize * 1.3;
            ctx.fillRect(
                this.x - glowSize / 2,
                this.y - glowSize / 2,
                glowSize,
                glowSize
            );
        }

        if (needsAlphaChange) {
            ctx.restore();
        }
    }
}

// queue for achievements unlocked before enhanced system is ready
window.pendingAchievementNotifications = window.pendingAchievementNotifications || [];
// Complete ProgressionSystem with non-disruptive achievement notifications
