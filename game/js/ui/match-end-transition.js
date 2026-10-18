// One captured frame, reused throughout the CRT sign-off. No live scene renders.
(function () {
    'use strict';
    let active = null;
    function cancel() { active?.finish(false); }

    function play(game, options = {}) {
        cancel();
        const duration = Math.max(650, Math.min(2400, options.duration ?? 1100));
        const source = game.canvas;
        const frozen = document.createElement('canvas');
        const scale = Math.min(1, 1280 / source.width, 720 / source.height);
        frozen.width = Math.max(1, Math.round(source.width * scale));
        frozen.height = Math.max(1, Math.round(source.height * scale));
        const snapshot = frozen.getContext('2d');
        let frame = source;
        if (game.postFx?.active) {
            // WebGL's drawing buffer is not preserved between browser frames.
            // Present and copy synchronously so the snapshot includes the grade.
            try { game.postFx.present(0); frame = game.postFx.canvas; } catch (_) { frame = source; }
        }
        try { snapshot.drawImage(frame, 0, 0, frozen.width, frozen.height); }
        catch (_) { snapshot.drawImage(source, 0, 0, frozen.width, frozen.height); }
        const overlay = document.createElement('canvas');
        overlay.id = 'pp-match-end-transition';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;min-height:0;z-index:100050;pointer-events:auto;border:0;border-radius:0;background:#020407';
        // The output and frozen texture are bounded independently of screen DPR.
        overlay.width = Math.min(1280, window.innerWidth);
        overlay.height = Math.max(1, Math.round(window.innerHeight * overlay.width / window.innerWidth));
        const ctx = overlay.getContext('2d', {alpha: false});
        const rect = source.getBoundingClientRect();
        const ratio = overlay.width / window.innerWidth;
        const dest = {x: rect.left * ratio, y: rect.top * ratio, w: rect.width * ratio, h: rect.height * ratio};
        document.body.appendChild(overlay);
        let raf = 0, timer = 0, ended = false;
        return new Promise(resolve => {
            const state = {finish(completed) {
                if (ended) return;
                ended = true;
                cancelAnimationFrame(raf); clearTimeout(timer);
                overlay.remove();
                if (active === state) active = null;
                resolve(completed);
            }};
            active = state;
            const start = performance.now();
            function draw(now) {
                if (ended) return;
                const t = Math.min(1, (now - start) / duration);
                const glitch = Math.max(0, Math.min(1, (t - 0.35) / 0.45));
                const collapse = Math.max(0, (t - 0.82) / 0.18);
                const shrink = Math.max(0.002, 1 - collapse * collapse);
                ctx.globalAlpha = 1; ctx.fillStyle = '#020407'; ctx.fillRect(0, 0, overlay.width, overlay.height);
                ctx.save();
                ctx.translate(dest.x + dest.w / 2, dest.y + dest.h / 2);
                ctx.scale(1, shrink);
                ctx.globalAlpha = 1;
                ctx.drawImage(frozen, -dest.w / 2, -dest.h / 2, dest.w, dest.h);
                if (glitch > 0) {
                    // A few moving strips sell tracking loss without flashing
                    // the whole screen or allocating textures every frame.
                    for (let i = 0; i < 7; i++) {
                        const sy = ((i * 0.137 + t * 0.21) % 1) * frozen.height;
                        const sh = Math.min(4 + i % 3 * 4, frozen.height - sy);
                        const shift = Math.sin(t * 48 + i * 3) * glitch * 14;
                        ctx.drawImage(frozen, 0, sy, frozen.width, sh,
                            -dest.w / 2 + shift, -dest.h / 2 + sy / frozen.height * dest.h,
                            dest.w, sh / frozen.height * dest.h);
                    }
                    ctx.fillStyle = `rgba(2,8,15,${0.16 * glitch})`;
                    for (let y = -dest.h / 2; y < dest.h / 2; y += 4) ctx.fillRect(-dest.w / 2, y, dest.w, 1);
                    ctx.fillStyle = `rgba(125,214,224,${0.12 * glitch})`;
                    ctx.fillRect(-dest.w / 2, -dest.h / 2 + (t * 1.3 % 1) * dest.h, dest.w, 2);
                }
                ctx.restore();
                if (t >= 1) state.finish(true);
                else raf = requestAnimationFrame(draw);
            }
            draw(start);
            // Results still appear if a hidden tab suspends animation frames.
            timer = setTimeout(() => state.finish(true), duration + 150);
        });
    }
    window.MatchEndTransition = {play, cancel};
})();
