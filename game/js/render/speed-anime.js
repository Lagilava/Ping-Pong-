// Opt-in art experiment: play.html?speedAnime=1. No simulation state is changed.
(function () {
    'use strict';
    const ink = '#10152d', cream = '#fff4da';
    const enabled = window.PP_SPEED_ANIME_PREVIEW === true;
    function active() { return enabled && window.game?.gameMode === 'speed'; }
    function polygon(ctx, points) {
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 2) {
            if (i) ctx.lineTo(points[i], points[i + 1]);
            else ctx.moveTo(points[i], points[i + 1]);
        }
        ctx.closePath();
    }
    window.SpeedAnime = {
        active,
        paddle(ctx, p) {
            // Called in the existing paddle motion transform (centre origin).
            const w = p.w, h = p.h, left = -w / 2, top = -h / 2;
            const color = p.isAI ? '#ff718f' : '#80f1f4';
            ctx.save(); ctx.shadowBlur = 0;
            const bevel = Math.min(4, w * .25);
            ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
            polygon(ctx, [left + bevel, top, left + w, top, left + w, top + h - bevel,
                left + w - bevel, top + h, left, top + h, left, top + bevel]); ctx.fill(); ctx.stroke();
            ctx.fillStyle = p.isAI ? '#963b69' : '#267b9e';
            polygon(ctx, [left + 1, top + h * .63, left + w - 1, top + h * .47,
                left + w - 1, top + h - bevel - 1, left + w - bevel, top + h - 1, left + 1, top + h - 1]); ctx.fill();
            ctx.fillStyle = p.isAI ? '#ffd1dc' : '#e9ffff';
            polygon(ctx, [left + 2, top + bevel + 1, left + 4, top + 3,
                left + 4, top + h * .43, left + 2, top + h * .48]); ctx.fill();
            ctx.fillStyle = p.isAI ? '#c8507a' : '#369ab7';
            ctx.fillRect(left + w - 3, top + 2, 2, h * .43);
            ctx.strokeStyle = 'rgba(16,21,45,.65)'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const y = top + h * (.74 + i * .065);
                ctx.beginPath(); ctx.moveTo(left + 3, y + 2); ctx.lineTo(left + w - 3, y - 2); ctx.stroke();
            }
            ctx.restore();
        },
        ball(ctx, b, interp) {
            const x = b.prev.x + (b.pos.x - b.prev.x) * interp;
            const y = b.prev.y + (b.pos.y - b.prev.y) * interp;
            const r = b.r, velocity = Math.hypot(b.vel.x, b.vel.y);
            ctx.save(); ctx.shadowBlur = 0; ctx.translate(x, y);
            if (window.PPSettings?.get('particles') !== false && !window.PPSettings?.get('reduceMotion') && velocity > 250) {
                ctx.save(); ctx.rotate(Math.atan2(b.vel.y, b.vel.x));
                const tail = Math.min(90, velocity * .055);
                ctx.globalAlpha *= .75;
                ctx.fillStyle = '#246c9b';
                ctx.beginPath(); ctx.moveTo(-r * .3, -r * .7);
                ctx.quadraticCurveTo(-tail * .5, -r * .5, -tail, 0);
                ctx.quadraticCurveTo(-tail * .5, r * .5, -r * .3, r * .7); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#a2f4fa';
                polygon(ctx, [-r * .4, -r * .22, -tail * .84, 0, -r * .4, r * .22]); ctx.fill();
                ctx.strokeStyle = '#9cdeec'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-tail * .4, -r * 1.1); ctx.lineTo(-tail * .8, -r * 1.1);
                ctx.moveTo(-tail * .25, r * 1.15); ctx.lineTo(-tail * .55, r * 1.15); ctx.stroke();
                ctx.restore();
            }
            ctx.fillStyle = cream; ctx.strokeStyle = ink; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#efa866'; ctx.beginPath(); ctx.arc(0, 0, r * .85, .05, Math.PI * .93);
            ctx.quadraticCurveTo(r * .1, r * .24, r * .85, r * .04); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-r * .28, -r * .3, r * .28, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        },
        backdrop(ctx, g) {
            // Sparse ink framing leaves the centre and the ball readable.
            const w = g.width, h = g.height;
            ctx.save(); ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(19,24,54,.10)'; ctx.fillRect(0, 0, w, h);
            // Quiet corner accents replace the permanent scratch marks.
            ctx.strokeStyle = 'rgba(160,229,244,.23)'; ctx.lineWidth = 1;
            const inset = 8, length = Math.min(28, w * .045);
            ctx.beginPath();
            for (const x of [inset, w - inset]) for (const y of [h * .16, h * .84]) {
                const dx = x < w / 2 ? 1 : -1, dy = y < h / 2 ? 1 : -1;
                ctx.moveTo(x, y + dy * length); ctx.lineTo(x, y); ctx.lineTo(x + dx * length, y);
            }
            ctx.stroke();
            ctx.restore();
        },
        action(ctx, g) {
            const time = g.modeAbilities?.clock || 0;
            const stop = g.modeAbilities?.timeVisual || 0;
            const motion = !window.PPSettings?.get('reduceMotion');
            ctx.save(); ctx.shadowBlur = 0;
            if (motion && window.PPSettings?.get('particles') !== false && (stop > .02 || g.rallyCount > 3)) {
                const intensity = Math.max(stop, Math.min(.3, g.rallyCount / 40));
                ctx.fillStyle = stop > .1 ? '#bcefff' : '#ffdfc1';
                // Fixed count; lines stay in the outside quarter of the court.
                for (let i = 0; i < 16; i++) {
                    const angle = i * 2.399963;
                    const phase = (i * .137 + time * .22) % 1;
                    const x = g.width * .5, y = g.height * .5;
                    const dx = Math.cos(angle), dy = Math.sin(angle);
                    const edge = Math.min(g.width * .51 / Math.max(.001, Math.abs(dx)),
                        g.height * .51 / Math.max(.001, Math.abs(dy)));
                    const inner = edge * (.77 + phase * .16);
                    const thickness = i % 4 === 0 ? 1.5 : .65;
                    ctx.globalAlpha = intensity * Math.sin(phase * Math.PI) * .38;
                    polygon(ctx, [x + dx * inner, y + dy * inner,
                        x + dx * edge - dy * thickness, y + dy * edge + dx * thickness,
                        x + dx * edge + dy * thickness, y + dy * edge - dx * thickness]);
                    ctx.fill();
                }
            }
            const hit = g._speedAnimeImpact;
            const age = hit ? time - hit.at : 1;
            if (hit && age >= 0 && age < .22 && window.PPSettings?.flashEnabled?.() !== false) {
                const fade = 1 - age / .22;
                ctx.globalAlpha = fade;
                ctx.translate(hit.x, hit.y);
                ctx.rotate(g.hitFlashDirection < 0 ? Math.PI : 0);
                ctx.fillStyle = cream; ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < 16; i++) {
                    const a = i * Math.PI / 8;
                    const r = (i % 2 ? 7 : 19 + (i % 3) * 5) * (motion ? 1 + age * 2 : 1);
                    const x = Math.cos(a) * r, y = Math.sin(a) * r * .8;
                    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#ffb755';
                polygon(ctx, [-5, -13, 8, -4, 1, -1, 5, 12, -8, 1, -2, -2]); ctx.fill();
                if (motion && window.PPSettings?.get('particles') !== false) {
                    ctx.strokeStyle = '#a8f2ff'; ctx.lineWidth = 1.4;
                    for (let i = -1; i <= 1; i += 2) {
                        ctx.beginPath(); ctx.moveTo(12, i * 11);
                        ctx.lineTo(29 + age * 55, i * (18 + age * 40)); ctx.stroke();
                    }
                }
            }
            ctx.restore();
        }
    };
})();
