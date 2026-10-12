// Small, seeded surface maps shared by the approved objects and menu hardware.
// These are baked once; none of the textures change physics or paddle skins.
(function () {
    'use strict';
    const maps = new Map();
    const patterns = new WeakMap();
    const TAU = Math.PI * 2;

    function canvas(kind) {
        if (maps.has(kind)) return maps.get(kind);
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        let seed = 137;
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        if (kind === 'metal' || kind === 'alloy' || kind === 'grip') {
            for (let y = 0; y < 128; y++) {
                g.fillStyle = y % 3 ? `rgba(0,8,16,${0.08 + random() * 0.17})` : `rgba(225,245,255,${0.08 + random() * 0.18})`;
                g.fillRect(0, y, 128, 1);
            }
            for (let i = 0; i < 36; i++) {
                g.fillStyle = i % 3 ? 'rgba(0,6,12,0.24)' : 'rgba(235,250,255,0.3)';
                g.fillRect(random() * 128, random() * 128, 3 + random() * 25, 0.6);
            }
            if (kind === 'metal') {
                g.strokeStyle = 'rgba(0,6,12,0.35)';
                g.lineWidth = 2;
                g.strokeRect(8, 8, 112, 112);
                g.strokeStyle = 'rgba(225,245,255,0.2)';
                g.lineWidth = 1;
                g.strokeRect(10, 10, 108, 108);
                for (const x of [15, 113]) for (const y of [15, 113]) {
                    g.fillStyle = 'rgba(0,6,12,0.55)';
                    g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
                }
            } else if (kind === 'alloy') {
                for (let r = 14; r < 63; r += 4) {
                    g.strokeStyle = r % 8 ? 'rgba(0,12,22,0.28)' : 'rgba(225,245,255,0.28)';
                    g.lineWidth = 0.8;
                    g.beginPath(); g.arc(64, 64, r, 0, TAU); g.stroke();
                }
            } else {
                g.lineWidth = 2;
                for (let y = -16; y < 144; y += 16) for (let x = -16; x < 144; x += 16) {
                    g.strokeStyle = 'rgba(0,0,0,0.5)';
                    g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 8); g.stroke();
                    g.strokeStyle = 'rgba(200,225,240,0.2)';
                    g.beginPath(); g.moveTo(x + 1, y + 10); g.lineTo(x + 9, y + 2); g.stroke();
                }
            }
        } else if (kind === 'skin' || kind === 'cloth' || kind === 'carapace') {
            for (let i = 0; i < 210; i++) {
                const x = random() * 128, y = random() * 128, r = 0.5 + random() * 5;
                g.fillStyle = i % 4 ? 'rgba(5,9,4,0.35)' : 'rgba(213,219,179,0.24)';
                g.beginPath(); g.ellipse(x, y, r, r * (0.3 + random()), random() * TAU, 0, TAU); g.fill();
            }
            g.lineWidth = 0.7;
            if (kind === 'cloth') {
                for (let i = 0; i < 128; i += 3) {
                    g.strokeStyle = i % 2 ? 'rgba(198,208,170,0.23)' : 'rgba(0,0,0,0.35)';
                    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
                }
            } else {
                g.strokeStyle = 'rgba(8,12,5,0.42)';
                for (let i = 0; i < 14; i++) {
                    const x = random() * 128, y = random() * 128;
                    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y + 7); g.lineTo(x + 3, y + 14); g.lineTo(x + 10, y + 22); g.stroke();
                }
                if (kind === 'carapace') {
                    g.lineWidth = 2;
                    for (let y = 24; y < 120; y += 24) {
                        g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 7); g.lineTo(128, y); g.stroke();
                    }
                }
            }
        } else if (kind === 'well') {
            // Transparent middle: the event horizon stays black and readable.
            g.lineCap = 'round';
            for (let i = 0; i < 180; i++) {
                const a = random() * TAU, r = 39 + random() * 21;
                g.strokeStyle = i % 3 ? `rgba(118,174,255,${0.1 + random() * 0.3})` : 'rgba(185,126,255,0.42)';
                g.lineWidth = 0.4 + random() * 1.3;
                g.beginPath(); g.arc(64, 64, r, a, a + 0.08 + random() * 0.65); g.stroke();
            }
            const mask = g.createRadialGradient(64, 64, 35, 64, 64, 63);
            mask.addColorStop(0, 'transparent'); mask.addColorStop(0.24, '#fff');
            mask.addColorStop(0.7, '#fff'); mask.addColorStop(1, 'transparent');
            g.globalCompositeOperation = 'destination-in';
            g.fillStyle = mask; g.fillRect(0, 0, 128, 128);
        } else if (kind === 'pull') {
            for (let i = 0; i < 64; i++) {
                const x = random() * 128, y = random() * 128;
                g.strokeStyle = i % 4 ? 'rgba(150,255,109,0.22)' : 'rgba(185,139,255,0.28)';
                g.lineWidth = 0.5 + random();
                g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10, y - 8, x + 18, y + 8, x + 30, y); g.stroke();
            }
        }
        maps.set(kind, c);
        return c;
    }

    // clip() uses the caller's existing body path, so detail never leaks onto
    // backgrounds, neighboring sprites, outlines, eyes or labels.
    function paint(ctx, kind, x, y, w, h, opacity = 0.65) {
        if (!(w > 0 && h > 0)) return;
        ctx.save();
        ctx.clip();
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= opacity;
        ctx.drawImage(canvas(kind), x, y, w, h);
        ctx.restore();
    }

    function well(ctx, x, y, radius, time, intensity = 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(window.PPSettings?.get('reduceMotion') ? 0 : time * 0.16);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha *= 0.65 * intensity;
        ctx.drawImage(canvas('well'), -radius * 1.65, -radius * 1.65, radius * 3.3, radius * 3.3);
        ctx.restore();
    }

    function flow(ctx, x, y, w, h, time, opacity) {
        if (!(w > 0 && h > 0)) return;
        let pattern = patterns.get(ctx);
        if (!pattern) {
            pattern = ctx.createPattern(canvas('pull'), 'repeat');
            if (!pattern) return;
            patterns.set(ctx, pattern);
        }
        const phase = window.PPSettings?.get('reduceMotion') ? 0 : (time * 65) % 192;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha *= opacity;
        ctx.shadowBlur = 0;
        ctx.translate(x - phase, y);
        ctx.scale(1.5, 1);
        ctx.fillStyle = pattern;
        ctx.fillRect(phase / 1.5, 0, w / 1.5, h);
        ctx.restore();
    }

    window.SurfaceTextures = { canvas, paint, well, flow };
})();
