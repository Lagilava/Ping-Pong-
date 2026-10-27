// Generated 2D materials and mode medallions for the existing 3D menu arena.
// Installed once. No texture uploads, canvas painting or new lights per frame.
(function () {
    'use strict';
    const api = {ready: Promise.resolve()};
    function install({renderer, arena, railMat, postMat, netMat, seaUniforms}) {
        const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        const load = (name, {repeat = [1, 1], color = true} = {}) => new Promise(resolve => {
            const texture = new THREE.TextureLoader().load(`assets/images/menu-textures/${name}.webp?v=20261027-4k-1`, tex => {
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
                railMat.emissiveIntensity = 0.08;
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
                postMat.emissiveIntensity = 0.12;
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
    function installEquipment({renderer, scene, ballMat, leftPaddleMat, rightPaddleMat, skyUniforms, seaUniforms}) {
        const tasks = [
            ['ball-shell', ballMat], ['paddle-cyan', leftPaddleMat],
            ['paddle-magenta', rightPaddleMat], ['court-inlay', null], ['stadium-360', null]
        ].map(([name, material]) => new Promise(resolve => {
            new THREE.TextureLoader().load(`assets/images/menu-textures/${name}.webp?v=20261027-4k-1`, tex => {
                tex.name = `menu-${name}`;
                tex.encoding = material || name === 'stadium-360' ? THREE.sRGBEncoding : THREE.LinearEncoding;
                tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
                tex.wrapS = name === 'stadium-360' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                if (material) {
                    material.map = tex;
                    material.bumpMap = tex;
                    // Mask glow with albedo: dark rubber stays dark during animation.
                    material.emissiveMap = tex;
                    material.emissive.setHex(0xffffff);
                    material.onBeforeCompile = shader => {
                        // Retain some lit curvature without letting the strong arena lights
                        // flatten the generated albedo into a solid white/cyan surface.
                        if (name === 'ball-shell') {
                            // Broad shell bands survive the ball's ~30px menu footprint;
                            // the generated ceramic dimples remain the fine surface layer.
                            shader.fragmentShader = shader.fragmentShader.replace(
                                '#include <map_fragment>',
                                '#include <map_fragment>\nfloat shellBand = 1.0 - smoothstep(0.045, 0.065, abs(vUv.y - 0.5 + sin(vUv.x * 12.56637) * 0.09));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.35, 0.48), shellBand * 0.92);');
                        }
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <tonemapping_fragment>',
                            'gl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb * 0.65, 0.18);\n#include <tonemapping_fragment>');
                    };
                    material.customProgramCacheKey = () => `menu-lit-albedo-v3-${name}`;
                    if (name.startsWith('paddle-')) {
                        // Crop to a narrow rubber strip instead of squeezing a square
                        // atlas cell onto the tall paddle face.
                        tex.repeat.set(0.28, 1);
                        tex.offset.set(0.35, 0);
                    }
                    material.bumpScale = name === 'ball-shell' ? 0.006 : 0.012;
                    material.roughness = name === 'ball-shell' ? 0.36 : 0.65;
                    material.needsUpdate = true;
                } else if (name === 'stadium-360') {
                    // Prefilter the same stadium into a reflection environment once.
                    // This gives ceramic and metal plausible light/reflection response.
                    if (scene && THREE.PMREMGenerator && (window.PerfGovernor?.tier || 0) < 2) {
                        const pmrem = new THREE.PMREMGenerator(renderer);
                        try {
                            api.environmentTarget = pmrem.fromEquirectangular(tex);
                            scene.environment = api.environmentTarget.texture;
                            scene.traverse(object => {
                                if (object.material?.isMeshStandardMaterial) {
                                    object.material.envMapIntensity = 0.45;
                                    object.material.needsUpdate = true;
                                }
                            });
                        } catch (error) {
                            console.warn('[Menu] Stadium reflections unavailable.', error);
                        } finally {
                            pmrem.dispose();
                        }
                    }
                    // Defocus the distant image once. Wrap the source horizontally
                    // while drawing so the panorama seam stays continuous.
                    const canvas = document.createElement('canvas');
                    canvas.width = tex.image.width;
                    canvas.height = tex.image.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx && 'filter' in ctx) {
                        ctx.filter = 'blur(2px)';
                        for (const x of [-canvas.width, 0, canvas.width]) {
                            ctx.drawImage(tex.image, x, 0);
                        }
                        const blurred = new THREE.CanvasTexture(canvas);
                        blurred.name = 'menu-stadium-360-defocused';
                        blurred.encoding = tex.encoding;
                        blurred.wrapS = THREE.RepeatWrapping;
                        blurred.wrapT = THREE.ClampToEdgeWrapping;
                        skyUniforms.uMap.value = blurred;
                        tex.dispose();
                    } else {
                        skyUniforms.uMap.value = tex;
                    }
                    skyUniforms.uBackdropGrade.value = 0.55;
                } else {
                    seaUniforms.uCourtArt.value = tex;
                    seaUniforms.uCourtArtReady.value = 1;
                }
                resolve();
            }, undefined, () => resolve());
        }));
        api.ready = Promise.all([api.ready, ...tasks]);
        return api.ready;
    }
    api.installEquipment = installEquipment;
    api.install = install;
    window.MenuSurfaceArt = api;
})();
