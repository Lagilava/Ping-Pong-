// Generated 2D materials and mode medallions for the existing 3D menu arena.
// Installed once. No texture uploads, canvas painting or new lights per frame.
(function () {
    'use strict';
    const api = {ready: Promise.resolve()};
    function install({renderer, arena, railMat, postMat, netMat, seaUniforms}) {
        const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        const load = (name, {repeat = [1, 1], color = true} = {}) => new Promise(resolve => {
            const texture = new THREE.TextureLoader().load(`assets/images/menu-textures/${name}.webp`, tex => {
                tex.name = `menu-${name}`;
                tex.encoding = color ? THREE.sRGBEncoding : THREE.LinearEncoding;
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(...repeat);
                tex.anisotropy = anisotropy;
                resolve(tex);
            }, undefined, () => { texture.dispose(); resolve(null); });
        });
        api.ready = Promise.all([
            load('carbon', {color: false}).then(tex => {
                if (!tex) return;
                seaUniforms.uArtSurface.value = tex;
                seaUniforms.uArtSurfaceReady.value = 1;
            }),
            load('gunmetal', {repeat: [3, 1]}).then(tex => {
                if (!tex) return;
                railMat.map = railMat.bumpMap = tex;
                railMat.color.setHex(0x819aa3);
                railMat.bumpScale = 0.018;
                railMat.roughness = 0.56;
                railMat.needsUpdate = true;
            }),
            load('brass', {repeat: [1, 2]}).then(tex => {
                if (!tex) return;
                postMat.map = postMat.bumpMap = tex;
                postMat.color.setHex(0xb7ac86);
                postMat.bumpScale = 0.012;
                postMat.roughness = 0.42;
                postMat.emissiveIntensity = 0.45;
                postMat.needsUpdate = true;
            }),
            load('mesh', {repeat: [9, 1]}).then(tex => {
                if (!tex) return;
                netMat.map = tex;
                netMat.color.setHex(0xc4ffff);
                netMat.opacity = 0.28;
                netMat.needsUpdate = true;
            }),
            load('mode-decals').then(tex => {
                if (!tex) return;
                // A single atlas and one batched mesh for all six mode badges.
                // A little inset avoids neighboring cells bleeding through mipmaps.
                tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearFilter;
                tex.needsUpdate = true;
                const positions = [], uv = [], indices = [];
                for (let i = 0; i < 6; i++) {
                    const x = -5 + i * 2, y = -0.68, z = 3.417, half = 0.215;
                    const u0 = (i % 3) / 3 + 0.002, u1 = (i % 3 + 1) / 3 - 0.002;
                    const v0 = 1 - (Math.floor(i / 3) + 1) / 2 + 0.002, v1 = 1 - Math.floor(i / 3) / 2 - 0.002;
                    positions.push(x-half,y-half,z, x+half,y-half,z, x+half,y+half,z, x-half,y+half,z);
                    uv.push(u0,v0, u1,v0, u1,v1, u0,v1);
                    const n = i * 4; indices.push(n,n+1,n+2,n,n+2,n+3);
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                geometry.setIndex(indices);
                const material = new THREE.MeshBasicMaterial({map: tex, transparent: true,
                    opacity: 0.9, alphaTest: 0.03, depthWrite: false, toneMapped: false});
                const badges = new THREE.Mesh(geometry, material);
                badges.name = 'menu-mode-medallions';
                badges.renderOrder = 5;
                arena.add(badges);
            })
        ]);
        return api.ready;
    }
    api.install = install;
    window.MenuSurfaceArt = api;
})();
