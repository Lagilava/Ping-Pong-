// Baked cosmic art with bounded parallax and sparse animated starlight.
// Gameplay wells, forces and Wormhole ownership stay in their existing modules.
(function () {
    const root = document.currentScript?.src
        ? new URL('../../assets/gravity/', document.currentScript.src).href : 'assets/gravity/';
    const assets = {started: false, scene: null, well: null, planets: null};
    const stars = Array.from({length: 72}, (_, i) => ({
        x: ((i * 0.61803398875 + .13) % 1), y: ((i * .41421356237 + .07) % 1),
        phase: i * 2.39, size: i % 9 === 0 ? 1.6 : .8, speed: .3 + (i % 3) * .4
    }));
    function load() {
        if (assets.started || typeof Image === 'undefined') return;
        assets.started = true;
        for (const [key, name] of [['scene', 'gravity-scene-hd'], ['well', 'gravity-well'], ['planets', 'gravity-planets']]) {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => Promise.resolve(image.decode ? image.decode() : undefined).then(() => {
                assets[key] = image;
                window.game?.bgRenderer?._invalidateBackgroundRenderCache?.();
            }).catch(() => {});
            image.onerror = () => {}; // keep the bounded procedural fallback
            image.src = root + name + '.webp';
        }
    }
    function drawBackground(ctx, w, h, time, interaction) {
        load();
        if (!assets.scene) return false;
        const motion = !window.PPSettings?.get('reduceMotion');
        const lean = motion ? Math.sin(time * .065) : 0;
        ctx.save();
        ctx.drawImage(assets.scene, -w * .015 + lean * w * .009,
            -h * .015 + (motion ? Math.cos(time * .05) * h * .006 : 0), w * 1.03, h * 1.03);
        if (assets.planets) {
            const atlas = assets.planets;
            // Explicit rectangles keep the ring intact across the atlas midpoint.
            const rects = [[.015, .03, .46, .92], [.472, .06, .528, .83]];
            for (let i = 0; i < 2; i++) {
                const [rx, ry, rw, rh] = rects[i];
                const unit = Math.min(w, h);
                const side = unit * (i === 0 ? .34 : .40);
                const drift = motion ? time : 0;
                const px = w * (i === 0 ? .87 : .12) + Math.sin(drift * .13 + i * 2) * unit * .012;
                const py = h * (i === 0 ? .17 : .80) + Math.cos(drift * .17 + i) * unit * .01;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate((i === 0 ? 1 : -1) * drift * .025);
                const height = side * (rh * atlas.naturalHeight) / (rw * atlas.naturalWidth);
                ctx.drawImage(atlas, rx * atlas.naturalWidth, ry * atlas.naturalHeight,
                    rw * atlas.naturalWidth, rh * atlas.naturalHeight,
                    -side / 2, -height / 2, side, height);
                ctx.restore();
            }
        }
        if (typeof areParticleEffectsEnabled !== 'function' || areParticleEffectsEnabled()) {
            ctx.fillStyle = '#b7dcff';
            for (const star of stars) {
                ctx.globalAlpha = .18 + (Math.sin(time * .65 + star.phase) + 1) * .14;
                const x = ((star.x * w + (motion ? time * star.speed * 2 : 0)) % w + w) % w;
                const y = ((star.y * h + (motion ? time * star.speed * .4 : 0)) % h + h) % h;
                ctx.fillRect(x, y, star.size, star.size);
                if (star.size > 1.3) {
                    ctx.globalAlpha *= .45;
                    ctx.fillRect(x - 2, y + .4, 5, .7);
                    ctx.fillRect(x + .4, y - 2, .7, 5);
                }
            }
        }
        ctx.restore();
        return true;
    }
    function drawWell(ctx, x, y, radius, time, excitement = 0) {
        load();
        if (!assets.well) return false;
        const motion = !window.PPSettings?.get('reduceMotion');
        // Compact decorative disk; force/reach calculations remain unchanged.
        const size = radius * 3.3 * (1 + excitement * .035);
        ctx.save();
        ctx.translate(x, y);
        if (motion) ctx.rotate(time * .16);
        ctx.drawImage(assets.well, -size / 2, -size / 2, size, size);
        if (excitement > .6) {
            ctx.globalAlpha *= (excitement - .6) * 1.4;
            ctx.strokeStyle = '#b9dfff';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, 0, radius * 1.05, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        return true;
    }
    window.GravityArt = {drawBackground, drawWell,
        status: () => ({sceneReady: !!assets.scene, wellReady: !!assets.well, planetsReady: !!assets.planets})};
})();
