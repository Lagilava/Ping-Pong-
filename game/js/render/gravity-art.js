// Baked cosmic art with bounded parallax and sparse animated starlight.
// Gameplay wells, forces and Wormhole ownership stay in their existing modules.
(function () {
    const root = document.currentScript?.src
        ? new URL('../../assets/gravity/', document.currentScript.src).href : 'assets/gravity/';
    const assets = {started: false, scene: null, well: null, planets: null, materials: null, wellBands: null};
    const stars = Array.from({length: 72}, (_, i) => ({
        x: ((i * 0.61803398875 + .13) % 1), y: ((i * .41421356237 + .07) % 1),
        phase: i * 2.39, size: i % 9 === 0 ? 1.6 : .8, speed: .3 + (i % 3) * .4
    }));
    // Shade the transparent atlas once. The galaxy at upper left is the key
    // light: planets need an unlit hemisphere instead of a uniformly neon rim.
    function lightPlanets(image) {
        const c = document.createElement('canvas');
        const scale = Math.min(1, 1024 / image.naturalWidth);
        c.width = Math.round(image.naturalWidth * scale);
        c.height = Math.round(image.naturalHeight * scale);
        const ctx = c.getContext('2d');
        ctx.drawImage(image, 0, 0, c.width, c.height);
        window.SceneCompositor?.cleanMatte(c, {minIslandPixels: 40});
        ctx.globalCompositeOperation = 'source-atop';
        for (const [rx, ry, rw, rh, lx, ly] of [
            [.015, .03, .46, .92, .13, .15],
            [.472, .06, .528, .83, .57, .08]
        ]) {
            const x = rx * c.width, y = ry * c.height;
            const w = rw * c.width, h = rh * c.height;
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
            const shade = ctx.createRadialGradient(x + w * lx, y + h * ly, w * .06,
                x + w * lx, y + h * ly, w * 1.05);
            shade.addColorStop(0, 'rgba(8,12,32,0)');
            shade.addColorStop(.32, 'rgba(8,12,32,0.12)');
            shade.addColorStop(.66, 'rgba(5,8,25,0.58)');
            shade.addColorStop(1, 'rgba(3,6,20,0.92)');
            ctx.fillStyle = shade; ctx.fillRect(x, y, w, h);
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        return c;
    }
    function load() {
        if (assets.started || typeof Image === 'undefined') return;
        assets.started = true;
        for (const [key, name] of [['scene', 'gravity-scene-hd'], ['well', 'gravity-well'], ['planets', 'gravity-planets']]) {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => Promise.resolve(image.decode ? image.decode() : undefined).then(() => {
                assets[key] = key === 'planets' ? lightPlanets(image) : image;
                if (key === 'planets' && window.GravityMaterials) assets.materials = window.GravityMaterials.buildPlanets(image);
                if (key === 'well' && window.GravityMaterials) assets.wellBands = window.GravityMaterials.buildWell(image);
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
        const lean = 0; // distant sky is the stable reference for foreground motion
        ctx.save();
        // Uniform cover projection: portrait must not stretch circular galaxies
        // into vertical ribbons. Frame the luminous left nebula on tall screens.
        const fit = Math.max(w / assets.scene.naturalWidth, h / assets.scene.naturalHeight) * 1.03;
        const iw = assets.scene.naturalWidth * fit, ih = assets.scene.naturalHeight * fit;
        const focus = w < h ? .055 : .5;
        ctx.drawImage(assets.scene, (w - iw) * focus + lean * w * .009,
            (h - ih) * .5 + 0, iw, ih);
        if (assets.planets) {
            const atlas = assets.planets;
            const aw = atlas.naturalWidth || atlas.width, ah = atlas.naturalHeight || atlas.height;
            // Explicit rectangles keep the ring intact across the atlas midpoint.
            const rects = [[.015, .03, .46, .92], [.472, .06, .528, .83]];
            for (let i = 0; i < 2; i++) {
                const [rx, ry, rw, rh] = rects[i];
                const unit = Math.min(w, h);
                const side = unit * (i === 0 ? .34 : .40);
                const drift = 0; // surface/cloud motion replaces whole-planet bobbing
                const px = Math.max(side * .55, Math.min(w - side * .55,
                    w * (i === 0 ? .87 : .12) + Math.sin(drift * .13 + i * 2) * unit * .012));
                const py = h * (i === 0 ? .17 : .80) + Math.cos(drift * .17 + i) * unit * .01;
                if (assets.materials) {
                    window.GravityMaterials.drawPlanet(ctx, assets.materials, i, px, py, side, motion ? time : 0);
                } else {
                    ctx.save();ctx.translate(px,py);
                    const height = side * (rh * ah) / (rw * aw);
                    ctx.drawImage(atlas,rx*aw,ry*ah,rw*aw,rh*ah,-side/2,-height/2,side,height);
                    ctx.restore();
                }
            }
        }
        if (typeof areParticleEffectsEnabled !== 'function' || areParticleEffectsEnabled()) {
            ctx.fillStyle = '#b7dcff';
            for (let i=0;i<stars.length;i++) {
                const star=stars[i], depth=[.18,.75,2.4][i%3];
                ctx.globalAlpha = .18 + (Math.sin(time * .65 + star.phase) + 1) * .14;
                let x = ((star.x * w + (motion ? time * star.speed * 3 * depth : 0)) % w + w) % w;
                let y = ((star.y * h + (motion ? time * star.speed * .5 * depth : 0)) % h + h) % h;
                // Near starlight enters an actual well's field along a curved,
                // inward trajectory. Far stars remain the depth reference.
                if (motion && i%3===2) {
                    let target=null,pull=0;
                    for (const well of interaction?.activeWells || []) {
                        const distance=Math.hypot(x-well.x,y-well.y),reach=well.radius*3.2;
                        const amount=Math.max(0,1-distance/reach);
                        if(amount>pull){pull=amount;target=well;}
                    }
                    if(target && pull>.08){
                        const dx=x-target.x,dy=y-target.y,age=(time*.12+star.phase)%1;
                        const a=Math.atan2(dy,dx)+time*(.1+pull*.5);
                        const r=Math.max(target.radius*.55,Math.hypot(dx,dy)*(1-age*.65*pull));
                        x=target.x+Math.cos(a)*r;y=target.y+Math.sin(a)*r;
                        ctx.globalAlpha*=Math.sin(age*Math.PI);
                        ctx.strokeStyle='#94c8ff';ctx.lineWidth=.65;ctx.beginPath();
                        ctx.moveTo(target.x+Math.cos(a-.05)*r*1.015,target.y+Math.sin(a-.05)*r*1.015);
                        ctx.lineTo(x,y);ctx.stroke();
                    }
                }
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
    function drawWell(ctx, x, y, radius, time, excitement = 0, spin = 1, phase = 0) {
        load();
        if (!assets.well) return false;
        const motion = !window.PPSettings?.get('reduceMotion');
        if (assets.wellBands) {
            window.GravityMaterials.drawWell(ctx,assets.wellBands,x,y,radius,motion?time:0,excitement,spin,phase);
            return true;
        }
        // Loading/compatibility fallback; force/reach calculations stay unchanged.
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
        status: () => ({sceneReady: !!assets.scene, wellReady: !!assets.well, planetsReady: !!assets.planets, surfaceReady: !!assets.materials, wellFlowReady: !!assets.wellBands})};
})();

