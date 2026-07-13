// 2.5D perspective renderer.
//
// The 2D simulation stays authoritative: this module only *reads* game state
// (paddles, ball, obstacles) each frame and mirrors it onto a WebGL scene. Nothing
// here feeds back into physics, so every mode keeps its existing behaviour and the
// 2D canvas remains a working fallback.
//
// Coordinate mapping — game space is (x: 0..W left-to-right, y: 0..H top-to-bottom).
// World space puts the table on the XZ plane with +Y up:
//     worldX = x - W/2        worldZ = y - H/2        worldY = height above table
// so the camera can sit behind the player's end and look down the table.

import * as THREE from './vendor/three/three.module.min.js';

const WALL_H = 26;
const BALL_LIFT = 14; // keep the ball visibly above the surface

export class Renderer3D {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.enabled = false;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            powerPreference: 'high-performance',
        });
        // Cap at 1: on a HiDPI display a ratio of 2 quadruples fragment work for a scene
        // that is already crisp, and this renderer is fill-bound, not geometry-bound.
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(width, height, false);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05070f);
        this.scene.fog = new THREE.Fog(0x05070f, height * 2.2, height * 6.5);

        this.camera = new THREE.PerspectiveCamera(52, width / height, 1, 6000);
        this._placeCamera();

        this._buildLights();
        this._buildTable();

        this.paddleMeshes = new Map();   // paddle object -> mesh
        this.obstacleMeshes = new Map(); // obstacle object -> mesh
        this._buildBall();
        this._buildTrail();

        this._buildParticles();
        this._buildStarfield();
        this._buildEnvironment();
        this._buildFlash();

        this._mode = null;
        this._pools = new Map();
        this._sprites = new Map();
        this._colorCache = new Map();
        this._shake = { x: 0, y: 0 };
    }

    // The 2D path draws every particle as its own arc/gradient/save-restore. Here they
    // are one additive point cloud: a single draw call regardless of count, which is
    // the whole reason particles were expensive before and are nearly free now.
    _buildParticles() {
        const MAX = 2400;
        this._partMax = MAX;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
        this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 9,
            map: Renderer3D._glowTexture(),
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true,
        }));
        this.particles.frustumCulled = false;
        this.scene.add(this.particles);
    }

    _buildStarfield() {
        const N = 600;
        const pos = new Float32Array(N * 3);
        const R = Math.max(this.width, this.height);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * R * 4;
            pos[i * 3 + 1] = Math.random() * R * 1.4 + 60;
            pos[i * 3 + 2] = (Math.random() - 0.5) * R * 4;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.starfield = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 3, color: 0x9fd8ff, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.scene.add(this.starfield);
    }

    // The table used to float in a black void. Give it an arena: a grid floor below, a
    // ring of neon pillars on the horizon, and a glow band where they meet. All of it is
    // static geometry — a handful of draw calls, no per-frame cost — and the fog fades it
    // out so it reads as depth rather than clutter.
    _buildEnvironment() {
        const W = this.width, H = this.height;
        const env = new THREE.Group();
        this.environment = env;

        const FLOOR_Y = -150;

        // Grid floor stretching out under and past the table.
        const grid = new THREE.GridHelper(Math.max(W, H) * 7, 60, 0x00ffd6, 0x123a52);
        grid.position.y = FLOOR_Y;
        grid.material.transparent = true;
        grid.material.opacity = 0.28;
        grid.material.depthWrite = false;
        env.add(grid);

        // Legs, so the table stands on the floor instead of hovering.
        const legMat = new THREE.MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.6, metalness: 0.4 });
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(26, -FLOOR_Y, 26), legMat);
                leg.position.set(sx * (W / 2 - 40), FLOOR_Y / 2, sz * (H / 2 - 40));
                env.add(leg);
            }
        }

        // Ring of pillars on the horizon. Alternating cyan/magenta to match the palette.
        const RING = Math.max(W, H) * 1.9;
        const COUNT = 28;
        const cyan = new THREE.MeshStandardMaterial({
            color: 0x073b45, emissive: 0x00ffd6, emissiveIntensity: 0.55, roughness: 0.5,
        });
        const magenta = new THREE.MeshStandardMaterial({
            color: 0x3d0733, emissive: 0xff00c8, emissiveIntensity: 0.55, roughness: 0.5,
        });
        this._pillarMats = [cyan, magenta];
        const pillarGeo = new THREE.BoxGeometry(1, 1, 1);
        for (let i = 0; i < COUNT; i++) {
            const a = (i / COUNT) * Math.PI * 2;
            // Skip the wedge directly behind the camera; nothing there is ever seen.
            const h = 220 + ((i * 137) % 420);
            const p = new THREE.Mesh(pillarGeo, i % 2 ? magenta : cyan);
            p.scale.set(46, h, 46);
            p.position.set(Math.sin(a) * RING, FLOOR_Y + h / 2, Math.cos(a) * RING);
            p.rotation.y = a;
            env.add(p);
        }

        // Horizon glow band sitting behind the pillars.
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(RING * 1.35, RING * 1.35, 260, 40, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0x1b2f6b, side: THREE.BackSide, transparent: true,
                opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        band.position.y = FLOOR_Y + 130;
        env.add(band);

        this.scene.add(env);
    }

    _buildFlash() {
        this.flashMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0,
                depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        // Attach to the camera so it always covers the view. Sit just past the near
        // plane and scale the quad to fill the frustum at that distance.
        const d = 2;
        const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * d;
        this.flashMesh.position.z = -d;
        this.flashMesh.scale.set((h * this.camera.aspect) / 2, h / 2, 1);
        this.flashMesh.frustumCulled = false;
        this.flashMesh.visible = false;
        this.camera.add(this.flashMesh);
        this.scene.add(this.camera);
    }

    // Mesh pool keyed by name: reuse meshes across frames and just hide the surplus,
    // rather than adding/removing scene children as entities come and go.
    _pool(name, count, build) {
        let pool = this._pools.get(name);
        if (!pool) {
            pool = [];
            this._pools.set(name, pool);
        }
        while (pool.length < count) {
            const m = build();
            this.scene.add(m);
            pool.push(m);
        }
        for (let i = count; i < pool.length; i++) pool[i].visible = false;
        for (let i = 0; i < count; i++) pool[i].visible = true;
        return pool;
    }

    // Entity overlay: rather than approximating each entity with primitives, we run the
    // game's own 2D render(ctx) code into a transparent playfield-sized canvas and lay
    // that over the table. The art is then identical to 2D by construction, and it picks
    // up the perspective for free. One texture upload covers every entity.
    _ensureOverlay() {
        if (this.overlay) return;
        // Same GPU-upload cost problem as the backdrop, but this layer carries live
        // gameplay motion so it can't be throttled in time — only in resolution. It is
        // still a soft alpha layer (glows, icons), so a moderate downscale is invisible.
        this._ovScale = 0.6;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(this.width * this._ovScale));
        canvas.height = Math.max(1, Math.round(this.height * this._ovScale));
        this._ovCanvas = canvas;
        this._ovCtx = canvas.getContext('2d');

        this._ovTex = new THREE.CanvasTexture(canvas);
        this._ovTex.colorSpace = THREE.SRGBColorSpace;

        this.overlay = new THREE.Mesh(
            new THREE.PlaneGeometry(this.width, this.height),
            new THREE.MeshBasicMaterial({
                map: this._ovTex, transparent: true, depthWrite: false,
                blending: THREE.NormalBlending,
            }),
        );
        this.overlay.rotation.x = -Math.PI / 2;
        this.overlay.position.y = 1.2; // just above the backdrop surface
        this.scene.add(this.overlay);
    }

    _syncOverlay(game) {
        this._ensureOverlay();

        const wells = game.gameMode === 'gravity' ? (game.gravityWells || []) : [];
        const ups = game.powerUps || [];
        const hasZombies = game.gameMode === 'zombie';
        const hasContent = wells.length > 0 || ups.length > 0 || hasZombies;

        // Skip the clear + redraw + GPU upload entirely when there is nothing to show
        // (e.g. classic/speed with no power-up spawned yet) — a blank frame costs the
        // same texImage2D upload as a full one otherwise. Only pay for the one frame
        // that clears leftover content when the last entity disappears.
        if (!hasContent && !this._ovHadContent) return;
        this._ovHadContent = hasContent;

        const ctx = this._ovCtx;
        const s = this._ovScale;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        // Same order the 2D renderer uses, minus paddles and the ball, which stay as
        // real 3D objects so they keep height and cast/read depth.
        try {
            if (wells.length) {
                const t = performance.now() * 0.001;
                for (const w of wells) w.render(ctx, t);
            }
            for (const pu of ups) pu.render(ctx);
            if (hasZombies) game.renderZombieModeEntities?.(ctx);
        } catch (err) {
            if (!this._overlayWarned) {
                console.warn('[3D] entity overlay failed, continuing without it:', err);
                this._overlayWarned = true;
            }
        }
        this._ovTex.needsUpdate = true;
    }

    // Paddles keep their exact 2D artwork (styles, lasers, glow) as a texture, but sit on
    // an extruded body so they read as objects standing on the table rather than decals.
    _paddleSprite(paddle, key) {
        const PAD = 80; // room for glow / lasers that overflow the paddle rect
        const w = Math.ceil(paddle.w + PAD * 2);
        const h = Math.ceil(paddle.h + PAD * 2);

        let s = this._sprites.get(key);
        if (!s || s.w !== w || s.h !== h) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            s = { canvas, ctx: canvas.getContext('2d'), tex: new THREE.CanvasTexture(canvas), w, h };
            s.tex.colorSpace = THREE.SRGBColorSpace;
            this._sprites.set(key, s);
        }

        const ctx = s.ctx;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        // Shift the paddle's world position into the sprite's local space.
        ctx.translate(PAD - paddle.pos.x, PAD - paddle.pos.y);
        try { paddle.render(ctx); } catch { /* keep the frame alive */ }
        ctx.restore();
        s.tex.needsUpdate = true;
        return s;
    }




    _syncExtraBalls(game) {
        const balls = (game.additionalBalls || []).filter(Boolean);
        const ms = this._pool('xball', balls.length, () => new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            new THREE.MeshStandardMaterial({
                color: 0xffffff, emissive: 0xa0d8ff, emissiveIntensity: 1.2, roughness: 0.3,
            }),
        ));
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            ms[i].scale.setScalar(b.r || 10);
            ms[i].position.set(this._wx(b.pos.x), BALL_LIFT, this._wz(b.pos.y));
        }
    }

    // Particle colours arrive as CSS strings. Parsing one per particle per frame (up to
    // 2400) is far more expensive than drawing them, so memoise the parse.
    _rgb(color) {
        const key = color || '#ffffff';
        let rgb = this._colorCache.get(key);
        if (!rgb) {
            const c = new THREE.Color();
            try { c.set(key); } catch { c.set('#ffffff'); }
            rgb = [c.r, c.g, c.b];
            if (this._colorCache.size > 256) this._colorCache.clear();
            this._colorCache.set(key, rgb);
        }
        return rgb;
    }

    // Mirror the 2D particle system into the point cloud.
    _syncParticles(game) {
        const sys = game.particles || game.particleSystem;
        const active = sys?.active;
        const pos = this.particles.geometry.attributes.position;
        const col = this.particles.geometry.attributes.color;
        if (!active || !active.length) {
            this.particles.geometry.setDrawRange(0, 0);
            return;
        }
        const n = Math.min(active.length, this._partMax);
        for (let i = 0; i < n; i++) {
            const p = active[i];
            const px = p.pos?.x ?? p.x ?? 0;
            const py = p.pos?.y ?? p.y ?? 0;
            pos.array[i * 3] = this._wx(px);
            pos.array[i * 3 + 1] = BALL_LIFT;
            pos.array[i * 3 + 2] = this._wz(py);

            // Fade via colour, since PointsMaterial has no per-point alpha.
            const life = p.life !== undefined && p.maxLife ? Math.max(0, p.life / p.maxLife) : 1;
            const rgb = this._rgb(p.color);
            col.array[i * 3] = rgb[0] * life;
            col.array[i * 3 + 1] = rgb[1] * life;
            col.array[i * 3 + 2] = rgb[2] * life;
        }
        this.particles.geometry.setDrawRange(0, n);
        pos.needsUpdate = true;
        col.needsUpdate = true;
    }

    // Reuse the game's own 2D BackgroundRenderer rather than reimplementing each mode's
    // art in 3D: drive a private instance into an offscreen canvas and hand that to
    // three as a texture. The zombie hand, synthwave sun etc. come across verbatim, and
    // they stay in sync with whatever the 2D path does.
    _ensureBackdrop(game) {
        if (this._backdropFailed) return;
        if (!this._bgTex) {
            const RendererClass = game.bgRenderer?.constructor;
            if (!RendererClass) return;
            try {
                // Uploading a full-resolution canvas to the GPU every frame (texImage2D
                // on a ~1300x700 image) is by far the most expensive thing this renderer
                // does — measured at costing ~24ms/frame, invisible to JS profiling
                // because the readback happens inside the browser's GPU command
                // submission. The backdrop is a soft, out-of-focus layer sitting under
                // real 3D geometry, so a quarter of the pixels is not visible as a
                // quality loss but cuts the upload cost ~4x. BackgroundRenderer takes its
                // width/height as explicit constructor params (self-contained coordinate
                // space), so this only changes its internal resolution, not game state.
                const SCALE = 0.5;
                const bw = Math.max(1, Math.round(this.width * SCALE));
                const bh = Math.max(1, Math.round(this.height * SCALE));
                const canvas = document.createElement('canvas');
                canvas.width = bw;
                canvas.height = bh;
                const ctx = canvas.getContext('2d', { alpha: false });
                this._bgCanvas = canvas;
                this._bgRenderer = new RendererClass(ctx, bw, bh);

                this._bgTex = new THREE.CanvasTexture(canvas);
                this._bgTex.colorSpace = THREE.SRGBColorSpace;
                // Default flipY maps texture v=0 to the image's bottom row, which lines
                // the canvas up with game y=H at world z=+H/2 — i.e. the 2D layout.
                this.surface.material.map = this._bgTex;
                this.surface.material.color.set(0xffffff);
                this.surface.material.needsUpdate = true;
            } catch (err) {
                console.warn('[3D] backdrop unavailable, falling back to flat colour:', err);
                this._backdropFailed = true;
                this._bgTex = null;
            }
        }
    }

    _syncMode(game, dt) {
        this._ensureBackdrop(game);

        const mode = game.gameMode;
        if (mode !== this._mode) {
            this._mode = mode;
            this._bgRenderer?.setMode?.(mode);

            // Fog/star tint still tracks the mode so the table sits in the scene.
            const palettes = {
                classic: { fog: 0x05070f, stars: 0.55, a: 0x00ffd6, b: 0xff00c8 },
                zombie: { fog: 0x0a0f07, stars: 0.25, a: 0x8fd94a, b: 0xff5a2b },
                gravity: { fog: 0x0a0518, stars: 0.9, a: 0xb388ff, b: 0x4de2ff },
                speed: { fog: 0x1a0524, stars: 0.7, a: 0xff00c8, b: 0xffc400 },
                obstacle: { fog: 0x07121a, stars: 0.45, a: 0x00ffd6, b: 0xff3d81 },
            };
            const p = palettes[mode] || palettes.classic;
            this.scene.fog.color.setHex(p.fog);
            this.scene.background.setHex(p.fog);
            this.starfield.material.opacity = p.stars;
            // Tint the arena so the surroundings belong to the mode you are playing.
            this._pillarMats?.[0].emissive.setHex(p.a);
            this._pillarMats?.[1].emissive.setHex(p.b);
        }

        if (this._bgRenderer && this._bgTex) {
            // The backdrop is slow ambient motion (sun/stars/fog drift), so redrawing and
            // re-uploading it on every single frame buys nothing visible. Update at ~20Hz
            // instead of ~60Hz — a further ~3x cut on top of the resolution drop above,
            // for a layer where nobody can tell the difference.
            this._bgAccum = (this._bgAccum || 0) + dt;
            if (this._bgAccum >= 1 / 20) {
                this._bgAccum = 0;
                this._bgRenderer.update(dt);
                this._bgRenderer.render();
                this._bgTex.needsUpdate = true;
            }
        }
    }

    // Shockwave: a ring lying flat on the table. The 2D path advances and expires the
    // shockwave inside its render(), which we skip, so we must step it here too or it
    // would freeze at its initial radius and never clear.
    _syncShockwave(game, dt) {
        const s = game.shockwave;
        if (!s) {
            if (this.shockRing) this.shockRing.visible = false;
            return;
        }

        const speedFactor = 1 - (s.radius / s.maxRadius);
        s.radius += (s.initialSpeed || 950) * speedFactor * dt;
        s.alpha = 1 - (s.radius / s.maxRadius);
        // The expansion asymptotes at maxRadius, so alpha approaches 0 without reaching
        // it. Retire it once it is invisible, or the shockwave never clears.
        if (s.alpha <= 0.01) {
            game.shockwave = null;
            if (this.shockRing) this.shockRing.visible = false;
            return;
        }
        if (!this.shockRing) {
            this.shockRing = new THREE.Mesh(
                new THREE.RingGeometry(0.86, 1, 64),
                new THREE.MeshBasicMaterial({
                    color: 0x00ffff, transparent: true, opacity: 0.45,
                    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
                }),
            );
            this.shockRing.rotation.x = -Math.PI / 2;
            this.scene.add(this.shockRing);
        }
        this.shockRing.visible = true;
        this.shockRing.position.set(this._wx(s.x), 3, this._wz(s.y));
        this.shockRing.scale.setScalar(Math.max(1, s.radius || 1));
        this.shockRing.material.opacity = Math.max(0, (s.alpha ?? 1) * 0.45);
    }

    // Camera sits above and slightly behind the table, angled down it. Pull back far
    // enough that the full width fits the frustum at this FOV, so nothing clips at
    // wide aspect ratios, and keep the tilt shallow so play stays readable.
    _placeCamera() {
        const W = this.width, H = this.height;
        const vFov = THREE.MathUtils.degToRad(this.camera.fov);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);

        // Distance needed to fit the table's width and depth, whichever is tighter.
        const distForWidth = (W / 2) / Math.tan(hFov / 2);
        const distForDepth = (H / 2) / Math.tan(vFov / 2);
        // Tilting the camera foreshortens the table's depth, so the distance that fits
        // it must be measured along the view direction — splitting it into Y and Z with
        // an extra scale factor (as an earlier version did) pulls the camera too close
        // and clips the walls.
        const pitch = THREE.MathUtils.degToRad(52); // above the horizon
        const depthOnScreen = H * Math.sin(pitch) + WALL_H * Math.cos(pitch);
        const distForDepthTilted = (depthOnScreen / 2) / Math.tan(vFov / 2);
        const dist = Math.max(distForWidth, distForDepthTilted) * 1.15; // margin

        this.camTarget = new THREE.Vector3(0, 0, 0);
        this.camBase = new THREE.Vector3(
            0,
            Math.sin(pitch) * dist,
            Math.cos(pitch) * dist,
        );
        this.camera.position.copy(this.camBase);
        this.camera.lookAt(this.camTarget);
    }

    _buildLights() {
        this.scene.add(new THREE.AmbientLight(0x404a6b, 1.6));

        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(-this.width * 0.4, this.height * 1.2, this.height * 0.5);
        this.scene.add(key);

        // Neon rim lights, matching the game's cyan/magenta palette.
        const cyan = new THREE.PointLight(0x00ffd6, 1.4, this.height * 2.4, 2);
        cyan.position.set(-this.width * 0.42, 120, 0);
        this.scene.add(cyan);

        const magenta = new THREE.PointLight(0xff00c8, 1.4, this.height * 2.4, 2);
        magenta.position.set(this.width * 0.42, 120, 0);
        this.scene.add(magenta);
    }

    _buildTable() {
        const W = this.width, H = this.height;

        const table = new THREE.Mesh(
            new THREE.BoxGeometry(W, 12, H),
            new THREE.MeshStandardMaterial({ color: 0x0d2233, roughness: 0.55, metalness: 0.35 }),
        );
        table.position.y = -6;
        this.scene.add(table);

        // The mode backdrop goes HERE, on the play surface — not on a skybox behind the
        // table. In 2D the background is drawn in playfield coordinates (0..W, 0..H), so
        // the play plane *is* the backdrop. Putting it behind the table instead means the
        // table occludes exactly the part that matters (the zombie hands rise at ground
        // level). Unlit material, so the art keeps its authored colours.
        this.surface = new THREE.Mesh(
            new THREE.PlaneGeometry(W, H),
            new THREE.MeshBasicMaterial({ color: 0x0d2233 }),
        );
        this.surface.rotation.x = -Math.PI / 2;
        this.surface.position.y = 0.4;
        this.scene.add(this.surface);

        // Centre line, drawn as a thin emissive strip rather than a texture.
        const line = new THREE.Mesh(
            new THREE.BoxGeometry(W, 1, 3),
            new THREE.MeshBasicMaterial({ color: 0x00ffd6, transparent: true, opacity: 0.25 }),
        );
        line.position.set(0, 0.9, 0);
        this.scene.add(line);

        // Side walls (top/bottom in 2D space) — these are what the ball bounces off.
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x0a3d4a, emissive: 0x00ffd6, emissiveIntensity: 0.35,
            roughness: 0.4, metalness: 0.6,
        });
        for (const sign of [-1, 1]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, 8), wallMat);
            wall.position.set(0, WALL_H / 2, sign * (H / 2));
            this.scene.add(wall);
        }
    }

    _buildBall() {
        this.ballMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 24, 16),
            new THREE.MeshStandardMaterial({
                color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 1.6,
                roughness: 0.25, metalness: 0.1,
            }),
        );
        this.scene.add(this.ballMesh);

        // Cheap bloom stand-in: an additive billboard that tracks the ball. On the GPU
        // this costs essentially nothing, versus shadowBlur on the 2D path.
        this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: Renderer3D._glowTexture(),
            color: 0xfff3b0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
        }));
        this.scene.add(this.ballGlow);

        // Ball shadow on the table, so height reads clearly.
        this.ballShadow = new THREE.Mesh(
            new THREE.CircleGeometry(1, 20),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
        );
        this.ballShadow.rotation.x = -Math.PI / 2;
        this.scene.add(this.ballShadow);
    }

    _buildTrail() {
        const MAX = 48;
        this._trailMax = MAX;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
        this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x8ff6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
        }));
        this.trail.frustumCulled = false;
        this.scene.add(this.trail);
    }

    static _glowTexture() {
        if (Renderer3D.__glowTex) return Renderer3D.__glowTex;
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,240,170,0.55)');
        grad.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(c);
        Renderer3D.__glowTex = tex;
        return tex;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
        this._placeCamera();

        // The entity overlay is sized to the old viewport too.
        this._ovTex?.dispose();
        this._ovTex = null;
        if (this.overlay) {
            this.scene.remove(this.overlay);
            this.overlay.geometry.dispose();
            this.overlay = null;
        }

        // The backdrop renderer is sized to the old viewport; drop it so the next frame
        // rebuilds it (and its cached layers) at the new size.
        this._bgTex?.dispose();
        this._bgTex = null;
        this._bgRenderer = null;
        this._bgCanvas = null;
        this.scene.background = new THREE.Color(0x05070f);
        this._mode = null;
        this._bgAccum = 0;
        this._ovHadContent = false;
    }

    // --- game space -> world space -------------------------------------------------
    _wx(x) { return x - this.width / 2; }
    _wz(y) { return y - this.height / 2; }

    _syncPaddle(paddle, key) {
        if (!paddle) return;
        const HEIGHT = 26;
        let rig = this.paddleMeshes.get(paddle);
        if (!rig) {
            // Extruded body for physical presence...
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }),
            );
            // ...with the paddle's real 2D artwork laid on its top face.
            const face = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
            );
            face.rotation.x = -Math.PI / 2;
            rig = { body, face };
            this.scene.add(body, face);
            this.paddleMeshes.set(paddle, rig);
        }

        const cx = paddle.pos.x + paddle.w / 2;
        const cy = paddle.pos.y + paddle.h / 2;
        const col = paddle.color || paddle.primaryColor || '#00ffd6';
        const rgb = this._rgb(col);

        rig.body.scale.set(Math.max(1, paddle.w), HEIGHT, Math.max(1, paddle.h));
        rig.body.position.set(this._wx(cx), HEIGHT / 2, this._wz(cy));
        rig.body.material.color.setRGB(rgb[0] * 0.55, rgb[1] * 0.55, rgb[2] * 0.55);
        rig.body.material.emissive.setRGB(rgb[0] * 0.35, rgb[1] * 0.35, rgb[2] * 0.35);

        const s = this._paddleSprite(paddle, key);
        rig.face.material.map = s.tex;
        rig.face.material.needsUpdate = true;
        rig.face.scale.set(s.w, s.h, 1);
        rig.face.position.set(this._wx(cx), HEIGHT + 0.6, this._wz(cy));
    }

    _syncObstacles(game) {
        const list = game.obstacles || game.obstacleManager?.obstacles || [];
        const seen = new Set();
        for (const ob of list) {
            if (!ob || ob.active === false) continue;
            seen.add(ob);
            let mesh = this.obstacleMeshes.get(ob);
            if (!mesh) {
                mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(1, 1, 1),
                    new THREE.MeshStandardMaterial({
                        color: 0xff3d81, emissive: 0xff0066, emissiveIntensity: 0.5,
                        roughness: 0.35, metalness: 0.5,
                    }),
                );
                this.scene.add(mesh);
                this.obstacleMeshes.set(ob, mesh);
            }
            mesh.visible = true;
            mesh.scale.set(Math.max(1, ob.w), 34, Math.max(1, ob.h));
            mesh.position.set(this._wx(ob.pos.x + ob.w / 2), 17, this._wz(ob.pos.y + ob.h / 2));
            mesh.rotation.y = -(ob.rotation || 0);
        }
        // Hide meshes whose obstacle is gone, rather than rebuilding the scene.
        for (const [ob, mesh] of this.obstacleMeshes) {
            if (!seen.has(ob)) mesh.visible = false;
        }
    }

    _syncBall(game) {
        const ball = game.ball;
        if (!ball) return;
        const r = ball.r || 10;
        const x = this._wx(ball.pos.x);
        const z = this._wz(ball.pos.y);

        this.ballMesh.scale.setScalar(r);
        this.ballMesh.position.set(x, BALL_LIFT, z);

        this.ballGlow.position.set(x, BALL_LIFT, z);
        this.ballGlow.scale.setScalar(r * 7);

        this.ballShadow.position.set(x, 0.7, z);
        this.ballShadow.scale.setScalar(r * 1.15);

        // Mirror the existing 2D trail buffer, so trails stay consistent with the sim.
        const pos = this.trail.geometry.attributes.position;
        const n = Math.min(ball.trailCount | 0, this._trailMax);
        for (let i = 0; i < n; i++) {
            pos.array[i * 3] = this._wx(ball.trailPoints[i * 2]);
            pos.array[i * 3 + 1] = BALL_LIFT;
            pos.array[i * 3 + 2] = this._wz(ball.trailPoints[i * 2 + 1]);
        }
        this.trail.geometry.setDrawRange(0, n);
        pos.needsUpdate = true;
    }

    render(game) {
        if (!this.enabled) return;

        const dt = game.lastDt || game.dt || (1 / 60);

        this._syncPaddle(game.player, 'player');
        this._syncPaddle(game.aiPaddle, 'ai');
        this._syncBall(game);
        this._syncObstacles(game);
        // Gravity wells, power-ups and the zombie entities are drawn with the game's own
        // 2D code into the overlay, so they look exactly as they do in 2D.
        this._syncOverlay(game);
        this._syncExtraBalls(game);

        // Screen shake becomes a camera offset — far cheaper than translating a canvas,
        // and it reads better because the perspective shifts with it.
        let sx = 0, sy = 0;
        const s = game.screenShake;
        if (s) {
            const mag = typeof s === 'object' ? Math.min(Math.hypot(s.x, s.y), 25) : Math.min(s, 25);
            sx = (Math.random() - 0.5) * mag;
            sy = (Math.random() - 0.5) * mag;
        }
        this.camera.position.set(this.camBase.x + sx, this.camBase.y + sy, this.camBase.z);
        this.camera.lookAt(this.camTarget);

        this._syncParticles(game);
        this._syncShockwave(game, dt);
        this._syncMode(game, dt);

        // Screen flash, as a fullscreen additive overlay quad.
        const flash = game.screenFlash || 0;
        this.flashMesh.visible = flash > 0.001;
        this.flashMesh.material.opacity = Math.min(flash * 0.5, 0.5);

        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.renderer.dispose();
    }
}

export default Renderer3D;
