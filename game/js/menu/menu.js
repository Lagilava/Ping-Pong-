(function initializeMenu3D() {
    if (typeof THREE === 'undefined') {
        console.error('Three.js not loaded. Unable to initialize 3D menu.');
        return;
    }

    // ─────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────
    let scene, camera, renderer;
    let raycaster, mouse;

    // Storm state
    let seaUniforms = null;
    let skyUniforms = null;
    let menuBloom = null;
    let cloudMeshes = [];
    let rainPoints = null;
    let rainVelocities = null;
    let flashLight = null;
    let boltLines = [];
    let lightningTimer = 3.8;
    let lightningDuration = 0;
    let lightningActive = false;
    let activeBolts = [];
    let ambLight = null;

    // ─────────────────────────────────────────────────────────────────
    // OCEAN VERTEX SHADER  (Gerstner waves)
    // ─────────────────────────────────────────────────────────────────
    const SEA_VS = `
        uniform float uTime;
        varying vec3  vWorldPos;
        varying vec3  vNormal;
        varying float vFoam;
        varying float vDepth;

        vec3 gerstner(vec3 p, vec2 d, float amp, float wl, float spd, float steep, float t) {
            float k  = 6.28318 / wl;
            float c  = sqrt(9.8 / k);
            float ph = k * (dot(d, p.xz) - c * t * spd);
            float qa = steep * amp;
            return vec3(d.x * qa * cos(ph), amp * sin(ph), d.y * qa * cos(ph));
        }

        vec3 gerstnerN(vec3 p, vec2 d, float amp, float wl, float spd, float steep, float t) {
            float k  = 6.28318 / wl;
            float c  = sqrt(9.8 / k);
            float ph = k * (dot(d, p.xz) - c * t * spd);
            float wa = k * amp;
            return vec3(-d.x * wa * cos(ph), 1.0 - steep * wa * sin(ph), -d.y * wa * cos(ph));
        }

        void main() {
            vec3 p = position;
            float t = uTime;

            vec3 disp = vec3(0.0);
            vec3 norm = vec3(0.0, 1.0, 0.0);

            // Low rain ripples for a wet arena floor, not open-water waves.
            disp += gerstner(p, normalize(vec2( 1.0,  0.3)), 0.055, 8.8, 0.55, 0.18, t);
            disp += gerstner(p, normalize(vec2(-0.4,  1.0)), 0.040, 5.4, 0.70, 0.16, t);
            disp += gerstner(p, normalize(vec2( 0.7, -0.5)), 0.024, 2.6, 1.05, 0.12, t);
            disp += gerstner(p, normalize(vec2(-0.8, -0.2)), 0.014, 1.4, 1.40, 0.08, t);

            norm += gerstnerN(p, normalize(vec2( 1.0,  0.3)), 0.055, 8.8, 0.55, 0.18, t);
            norm += gerstnerN(p, normalize(vec2(-0.4,  1.0)), 0.040, 5.4, 0.70, 0.16, t);
            norm += gerstnerN(p, normalize(vec2( 0.7, -0.5)), 0.024, 2.6, 1.05, 0.12, t);

            p += disp;
            vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
            vNormal   = normalize(normalMatrix * normalize(norm));
            vFoam     = clamp((disp.y - 0.032) * 7.5, 0.0, 1.0);
            vDepth    = disp.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
    `;

    // ─────────────────────────────────────────────────────────────────
    // OCEAN FRAGMENT SHADER
    // ─────────────────────────────────────────────────────────────────
    const SEA_FS = `
        uniform sampler2D uSurface;
        uniform float uTime;
        uniform vec3  uCamPos;
        uniform float uLightningFlash;
        uniform vec3  uLightningPos;
        varying vec3  vWorldPos;
        varying vec3  vNormal;
        varying float vFoam;
        varying float vDepth;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        float fbm2(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
            return v;
        }

        void main() {
            vec3 N = normalize(vNormal);
            vec3 V = normalize(uCamPos - vWorldPos);
            vec3 L = normalize(vec3(0.25, 0.85, 0.4));

            // ── Base ocean colour (storm-dark) ──────────────────────
            vec3 deep    = vec3(0.004, 0.010, 0.019);
            vec3 mid     = vec3(0.012, 0.045, 0.070);
            vec3 crest   = vec3(0.030, 0.095, 0.140);
            vec3 base    = mix(deep, mid, clamp(vWorldPos.z * -0.018 + 0.46, 0.0, 1.0));
            base         = mix(base, crest, clamp(vDepth * 3.5 + 0.08, 0.0, 1.0));

            // ── Specular highlight ──────────────────────────────────
            vec3  R   = reflect(-L, N);
            float sp  = pow(max(dot(R, V), 0.0), 380.0) * 0.95;
            float sp2 = pow(max(dot(R, V), 0.0),  52.0) * 0.16;
            vec3  specCol = vec3(0.65, 0.85, 1.0) * (sp + sp2);

            // ── Fresnel sky reflection ──────────────────────────────
            float fr     = pow(1.0 - max(dot(N, V), 0.0), 5.5);
            vec3  skyRefl = vec3(0.045, 0.075, 0.16) * fr;

            // ── Lightning ripple on surface ─────────────────────────
            float lDist   = length(vWorldPos.xz - uLightningPos.xz);
            float lRipple = exp(-lDist * 0.065) * uLightningFlash;
            float lRing   = smoothstep(1.5, 0.0, abs(lDist - (10.0 + uTime * 7.0))) * uLightningFlash;
            vec3  lColor  = vec3(0.75, 0.92, 1.0);

            // ── Foam ────────────────────────────────────────────────
            float fNoise = noise(vWorldPos.xz * 1.15 + uTime * 0.28)
                         * noise(vWorldPos.xz * 0.5  + uTime * 0.16);
            float foam   = smoothstep(0.42, 0.96, vFoam * (0.45 + fNoise * 0.22));
            vec3  foamC  = vec3(0.32, 0.56, 0.72) * (0.36 + uLightningFlash * 0.42);

            // ── Sub-surface scatter hint ────────────────────────────
            float sss = pow(max(dot(V, -L), 0.0), 4.0) * (0.35 + vDepth * 0.35);
            vec3  sssC = vec3(0.05, 0.28, 0.45) * sss;

            // ── Phosphorescence streaks ─────────────────────────────
            float ph = pow(max(0.0, sin(vWorldPos.x * 1.2 + vWorldPos.z * 0.8  + uTime * 0.55)), 18.0)
                     + pow(max(0.0, sin(vWorldPos.x * 0.75 - vWorldPos.z * 1.3 - uTime * 0.45 )), 18.0);
            vec3  phC = vec3(0.02, 0.32, 0.48) * ph * 0.075;

            float courtX = 1.0 - smoothstep(0.035, 0.095, abs(abs(vWorldPos.x) - 6.2));
            float courtZ = 1.0 - smoothstep(0.035, 0.095, abs(abs(vWorldPos.z + 2.4) - 3.0));
            float centerLine = 1.0 - smoothstep(0.025, 0.075, abs(vWorldPos.x));
            float gridX = 1.0 - smoothstep(0.012, 0.040, abs(fract((vWorldPos.x + 8.0) / 2.0) - 0.5));
            float gridZ = 1.0 - smoothstep(0.012, 0.040, abs(fract((vWorldPos.z + 8.0) / 2.0) - 0.5));
            float courtMask = smoothstep(7.2, 5.6, abs(vWorldPos.x)) * smoothstep(1.7, -5.5, vWorldPos.z) * smoothstep(-8.0, -5.8, vWorldPos.z);
            vec3 lineCol = vec3(0.18, 0.92, 1.0);

            // ── Rain surface pocking ────────────────────────────────
            float rn   = noise(vWorldPos.xz * 6.5 + uTime * 4.2)
                       * noise(vWorldPos.xz * 2.8 + uTime * 2.2);
            float rain = smoothstep(0.48, 0.92, rn) * 0.12;

            // ── Gloss / Wet look ───────────────────────────────────
            float gloss = pow(max(dot(N, V), 0.0), 0.12);
            
            // ── FBM colour variation ────────────────────────────────
            float fbmV = fbm2(vWorldPos.xz * 0.22 + uTime * 0.08);
            base += vec3(0.0, 0.022, 0.055) * fbmV;

            // ── Court surface texture (carbon weave + wear) ─────────
            vec2 suv = (vWorldPos.xz - vec2(0.0, -2.4)) / vec2(13.2, 6.4) + 0.5;
            vec3 surf = texture2D(uSurface, suv * vec2(9.0, 4.5)).rgb;
            float wear = texture2D(uSurface, suv * 0.7 + 0.31).a;
            base += vec3(0.045, 0.100, 0.150) * surf * (0.55 + wear * 0.7);
            base += vec3(0.020, 0.070, 0.115) * smoothstep(6.0, 0.0, length((vWorldPos.xz - vec2(0.0, -2.4)) * vec2(0.6, 1.0)));

            // ── Compose ─────────────────────────────────────────────
            vec3 col = base + skyRefl + sssC;
            col += specCol * (1.0 + uLightningFlash * 1.5);
            col += lColor * (lRipple * 0.85 + lRing * 0.5);
            col += phC;
            col += lineCol * courtMask * (max(courtX, courtZ) * 0.34 + centerLine * 0.22);
            col += lineCol * courtMask * max(gridX, gridZ) * 0.030;
            col += vec3(0.08, 0.18, 0.35) * rain;
            col  = mix(col, foamC, foam * 0.18);
            col += lColor * uLightningFlash * foam * 0.22;
            col *= gloss;
            col += specCol * surf.g * 0.35;
            // This shader writes display values directly (no tone mapping), so
            // lift the storm-dark palette enough for the court to read.
            col *= 1.25;

            // ── Vignette ────────────────────────────────────────────
            float vign = 1.0 - clamp(length(vWorldPos.xz) * 0.022, 0.0, 0.65);
            col *= vign + 0.35;

            gl_FragColor = vec4(col, 0.98);
        }
    `;

    // ─────────────────────────────────────────────────────────────────
    // SKY DOME SHADERS: painted backdrop + aurora ribbons + twinkling stars
    // ─────────────────────────────────────────────────────────────────
    const SKY_VS = `
        varying vec2 vUv;
        varying vec3 vDir;
        void main() {
            vUv = uv;
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const SKY_FS = `
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uFlash;
        varying vec2 vUv;
        varying vec3 vDir;

        float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n2(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
            float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
            float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
            float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
            vec3 col = texture2D(uMap, vUv).rgb;
            vec3 d = normalize(vDir);
            float up = clamp(d.y, -0.2, 1.0);

            // Aurora: a few drifting ribbons high in the sky.
            float az = atan(d.z, d.x);
            float aur = 0.0;
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float wave = sin(az * (2.0 + fi) + uTime * (0.07 + fi * 0.03) + n2(vec2(az * 2.0, uTime * 0.05 + fi)) * 2.5);
                float h = 0.38 + fi * 0.09 + wave * 0.06;
                aur += exp(-pow((up - h) * 16.0, 2.0)) * (0.55 + 0.45 * n2(vec2(az * 6.0 + fi * 3.0, uTime * 0.2)));
            }
            vec3 aurCol = mix(vec3(0.05, 0.75, 0.85), vec3(0.45, 0.25, 0.95), smoothstep(0.35, 0.6, up));
            col += aurCol * aur * 0.16 * smoothstep(0.05, 0.3, up);

            // Stars: hashed cells on the sphere, twinkling, fading near the horizon.
            vec3 sp = d * 220.0;
            vec3 cell = floor(sp);
            float h = hash3(cell);
            float star = step(0.9972, h) * smoothstep(0.55, 0.0, length(fract(sp) - 0.5));
            star *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
            col += vec3(0.75, 0.88, 1.0) * star * smoothstep(0.0, 0.25, up) * 1.4;

            // Lightning lights the whole sky briefly.
            col += vec3(0.35, 0.45, 0.7) * uFlash * 0.35 * smoothstep(-0.1, 0.6, up);
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    // Keep the court framed on any screen shape: wide screens just see more of
    // the scene; on narrower-than-16:9 (4:3, 16:10, portrait) the vertical FOV
    // widens so the horizontal view stays the same as on 16:9.
    function fitMenuCamera() {
        if (!menuCam) return;
        const aspect = Math.max(0.3, innerWidth / Math.max(1, innerHeight));
        const base = MENU_CONFIG.camera.fov;
        let fov = base;
        if (aspect < 16 / 9) {
            const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * (16 / 9) / aspect);
            fov = Math.min(100, THREE.MathUtils.radToDeg(halfH * 2));
        }
        menuCam.fov = fov;
        menuCam.aspect = aspect;
        menuCam.updateProjectionMatrix();
    }

    function createSoftDotTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    // Procedural court surface: RGB = carbon-fibre weave with a gloss channel
    // in G, A = large-scale wear/scuffs. Tiled across the table in SEA_FS.
    function createCourtSurfaceTexture(renderer) {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const img = g.createImageData(size, size);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const cellSize = 16;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
                const lx = (x % cellSize) / cellSize, ly = (y % cellSize) / cellSize;
                const horizontal = (cx + cy) % 2 === 0;
                const along = horizontal ? lx : ly;
                const across = horizontal ? ly : lx;
                // Each tow is a rounded bundle of fibres: bright crown, dark edges.
                const crown = Math.sin(across * Math.PI);
                const fibre = 0.5 + 0.5 * Math.sin((along * 9 + across * 1.5) * Math.PI * 2);
                const v = 0.35 + crown * 0.45 + fibre * 0.12;
                const i = (y * size + x) * 4;
                img.data[i] = v * 255;
                img.data[i + 1] = Math.pow(crown, 3) * 255;   // gloss
                img.data[i + 2] = v * 230;
                img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        // Wear map in alpha: soft scuffs.
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 40; i++) {
            const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 50;
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(0,0,0,${0.15 + rnd() * 0.3})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return tex;
    }

    // ─────────────────────────────────────────────────────────────────
    // CLOUD SHADERS
    // ─────────────────────────────────────────────────────────────────
    const CLOUD_VS = `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `;
    const CLOUD_FS = `
        uniform float uTime;
        uniform float uFlash;
        uniform float uLayer;
        uniform float uOffX;
        varying vec2 vUv;

        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float n(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x),
                       mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 6; i++) { v += a * n(p); p *= 2.08; a *= 0.48; }
            return v;
        }

        void main() {
            vec2 uv  = vUv - 0.5;
            float d  = length(uv) * 2.05;
            float spd = 0.013 + uLayer * 0.005;
            vec2 p   = vUv * (2.8 + uLayer * 0.65)
                     + vec2(uTime * spd + uOffX, uTime * (spd * 0.65));

            float cloud = fbm(p);
            float cloud2 = fbm(p * 1.5 + uTime * 0.02);
            cloud = mix(cloud, cloud2, 0.35);
            cloud = smoothstep(0.30 + uLayer * 0.04, 0.72, cloud);

            // Multi-step radial falloff for "wispy" look
            float edge  = 1.0 - smoothstep(0.22, 0.52, d);
            float edge2 = 1.0 - smoothstep(0.15, 0.55, d);
            cloud *= (edge * 0.7 + edge2 * 0.3);

            // Lit dark-cloud colour (more indigo/stormy)
            vec3 deepSky = vec3(0.015, 0.018, 0.035);
            vec3 cloudCol = mix(vec3(0.045, 0.055, 0.09), vec3(0.18, 0.22, 0.32), cloud);
            
            // Inner glow tint from lightning (with falloff)
            vec3 flashCol = vec3(0.65, 0.82, 1.00) * uFlash * cloud * 1.15;
            
            // Diffuse light bleed on non-cloud sky (volumetric-like)
            vec3 bleedCol = vec3(0.22, 0.32, 0.65) * uFlash * (1.0 - cloud) * 0.35 * edge2;
            
            // Final composition
            vec3 base = mix(deepSky, cloudCol, cloud);
            base += flashCol + bleedCol;
            
            // Slight violet-grey rim
            base += vec3(0.08, 0.12, 0.22) * (1.0 - cloud) * edge * 0.45;

            gl_FragColor = vec4(base, cloud * 0.96);
        }
    `;

    // ─────────────────────────────────────────────────────────────────
    // MENU CONFIG
    // ─────────────────────────────────────────────────────────────────
    const MENU_CONFIG = {
        modes: [
            { id: 'classic', name: 'CLASSIC', desc: 'Traditional fast-paced duel', col: 0xff3a5c, hex: '#ff3a5c', icon: 'classic' },
            { id: 'zombie', name: 'ZOMBIE', desc: 'Survive the undead horde', col: 0x6ddc4f, hex: '#6ddc4f', icon: 'zombie' },
            { id: 'gravity', name: 'GRAVITY', desc: 'Zero-gravity chaos arena', col: 0x3d9eff, hex: '#3d9eff', icon: 'gravity' },
            { id: 'speed', name: 'SPEED', desc: 'Extreme velocity battles', col: 0xffbe00, hex: '#ffbe00', icon: 'speed' },
            { id: 'obstacle', name: 'OBSTACLE', desc: 'Navigate deadly hazards', col: 0xff7620, hex: '#ff7620', icon: 'obstacle' },
            { id: 'customise', name: 'CUSTOM', desc: 'Build your own rules', col: 0x00ffc8, hex: '#00ffc8', icon: 'custom' },
        ],
        // Lower-end devices (as classified by PerfGovernor) start at 1x.
        renderer: { pixelRatio: Math.min(devicePixelRatio, (window.PerfGovernor?.tier || 0) >= 1 ? 1 : 1.5), exposure: 1.28 },
        camera: { fov: 58, pos: [0, 5.2, 12], near: 0.1, far: 200 },
    };

    let menuRenderer, menuScene, menuCam, menuParticles;
    let menuSelected = null, menuIsMP = false, menuActiveIdx = null;

    // ─────────────────────────────────────────────────────────────────
    // SVG ICONS
    // ─────────────────────────────────────────────────────────────────
    function svgIcon(id) {
        const s = {
            classic: `<circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="5.5"/><line x1="28" y1="50" x2="72" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="50" r="9" fill="currentColor"/>`,
            zombie: `<path d="M50 16 L74 30 L74 58 L50 72 L26 58 L26 30Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="39" cy="42" r="4" fill="currentColor"/><circle cx="61" cy="42" r="4" fill="currentColor"/><path d="M38 58 Q50 64 62 58" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
            gravity: `<circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="14 8"/><circle cx="68" cy="32" r="5" fill="currentColor"/><circle cx="32" cy="68" r="5" fill="currentColor"/><line x1="50" y1="24" x2="50" y2="12" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>`,
            speed: `<path d="M56 14 L28 52 L48 52 L44 86 L72 44 L52 44Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><line x1="18" y1="36" x2="30" y2="36" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><line x1="14" y1="50" x2="26" y2="50" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><line x1="18" y1="64" x2="30" y2="64" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>`,
            obstacle: `<rect x="20" y="20" width="60" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="5"/><line x1="34" y1="34" x2="66" y2="66" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="66" y1="34" x2="34" y2="66" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
            custom: `<circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 22 v56 M22 50 h56 M33 33 l34 34 M67 33 l-34 34" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="50" cy="50" r="7" fill="currentColor"/>`,
        };
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${s[id]}</svg>`;
    }

    // ─────────────────────────────────────────────────────────────────
    // CARD BUILDER
    // ─────────────────────────────────────────────────────────────────
    function buildMenuCards() {
        const row = document.getElementById('cardRow');
        if (!row) return;
        row.onpointerleave = () => { menuActiveIdx = null; updateMenuCards(); };
        row.innerHTML = '';
        MENU_CONFIG.modes.forEach((m, i) => {
            const el = document.createElement('div');
            el.className = 'card';
            el.style.cssText = `--c:${m.hex};--cg:${m.hex}CC;--wash:${hexToRgba(m.hex, 0.65)};--wash2:${hexToRgba(m.hex, 0.25)};--accent:${hexToRgba(m.hex, 0.4)}`;
            el.innerHTML = `
                <div class="card-badge">▶ START</div>
                <div class="card-icon" style="color:${m.hex}">${svgIcon(m.icon)}</div>
                <div class="card-name">${m.name}</div>
                <div class="card-desc">${m.desc}</div>`;
            el.addEventListener('pointerenter', () => { menuActiveIdx = i; scrollMenuCards(0); }, false);
            el.addEventListener('click', () => {
                menuSelected = m.id;
                if (m.id === 'customise') {
                    const fn = window.openCustomiseOverlay;
                    if (typeof fn === 'function') { fn(); return; }
                    document.querySelector('#hud .mode-btn[data-mode="customise"]')?.click();
                    return;
                }
                openMenuModal(m.name, m.hex);
            }, false);
            row.appendChild(el);
        });
        updateMenuCards();
    }

    function hexToRgba(hex, alpha = 1) {
        let n = String(hex).replace('#', '').trim();
        if (n.length === 3) n = n.split('').map(c => c + c).join('');
        const v = parseInt(n, 16);
        return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
    }

    function updateMenuCards() {
        const ch = document.getElementById('cardRow')?.children || [];
        for (let i = 0; i < ch.length; i++) ch[i].classList.toggle('active', i === menuActiveIdx);
    }

    let menuOffset = 0, menuLastWheelTime = 0;
    function scrollMenuCards(dir) {
        const row = document.getElementById('cardRow');
        const cw = (row?.children[0]?.offsetWidth || 200) + parseInt(getComputedStyle(row).gap || '10');
        const cur = menuActiveIdx !== null ? menuActiveIdx : Math.max(0, Math.min(MENU_CONFIG.modes.length - 1, Math.round(menuOffset / cw)));
        const nxt = Math.max(0, Math.min(MENU_CONFIG.modes.length - 1, cur + dir));
        if (row) {
            const vis = Math.floor(row.parentElement.offsetWidth / cw) || 3;
            const maxOff = Math.max(0, (MENU_CONFIG.modes.length - vis) * cw);
            const tgt = Math.max(0, Math.min(maxOff, (nxt - Math.floor(vis / 2)) * cw));
            menuOffset = tgt;
            row.style.transform = `translateX(${-menuOffset}px)`;
            row.style.transition = 'transform .38s cubic-bezier(.23,1,.32,1)';
        }
        if (menuActiveIdx !== null) menuActiveIdx = nxt;
        updateMenuCards();
    }

    function openMenuModal(name, color = '#00c8ff') {
        const m = document.getElementById('modal');
        if (!m) return;
        document.getElementById('mTitle').textContent = 'START ' + name.toUpperCase();
        m.style.setProperty('--modal-primary', color);
        m.style.setProperty('--modal-primary-soft', hexToRgba(color, 0.12));
        m.style.setProperty('--modal-primary-strong', hexToRgba(color, 0.65));
        m.style.setProperty('--modal-primary-glow', hexToRgba(color, 0.45));
        m.style.setProperty('--modal-title-shadow', hexToRgba(color, 0.65));
        m.querySelectorAll('.opt').forEach(opt => {
            opt.style.setProperty('--modal-primary', color);
            opt.style.setProperty('--modal-primary-soft', hexToRgba(color, 0.12));
            opt.style.setProperty('--modal-primary-glow', hexToRgba(color, 0.45));
        });
        m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('on'));
    }

    function closeMenuModal() {
        const m = document.getElementById('modal');
        if (!m) return;
        m.classList.remove('on');
        setTimeout(() => m.style.display = 'none', 320);
    }

    // ─────────────────────────────────────────────────────────────────
    // TEXTURE HELPERS  (ball, paddle — unchanged from original)
    // ─────────────────────────────────────────────────────────────────


    function createPaddleTexture(primaryColor, secondaryColor) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        const baseGrad = ctx.createRadialGradient(256, 256, 80, 256, 256, 280);
        baseGrad.addColorStop(0, primaryColor);
        baseGrad.addColorStop(0.45, secondaryColor);
        baseGrad.addColorStop(1, '#07161f');
        ctx.fillStyle = baseGrad; ctx.fillRect(0, 0, 512, 512);
        const padGrad = ctx.createLinearGradient(100, 100, 412, 412);
        padGrad.addColorStop(0, primaryColor);
        padGrad.addColorStop(1, secondaryColor);
        ctx.save();
        ctx.shadowColor = primaryColor; ctx.shadowBlur = 24;
        ctx.fillStyle = padGrad;
        ctx.beginPath();
        ctx.moveTo(128, 120); ctx.lineTo(384, 120);
        ctx.quadraticCurveTo(420, 120, 420, 160);
        ctx.lineTo(420, 352);
        ctx.quadraticCurveTo(420, 392, 384, 392);
        ctx.lineTo(128, 392);
        ctx.quadraticCurveTo(92, 392, 92, 352);
        ctx.lineTo(92, 160);
        ctx.quadraticCurveTo(92, 120, 128, 120);
        ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        ctx.fillRect(220, 180, 60, 160);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    function createBallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        const gradient = ctx.createRadialGradient(112, 114, 0, 128, 128, 84);
        gradient.addColorStop(0, 'rgba(255,255,255,0.98)');
        gradient.addColorStop(0.4, 'rgba(235,245,255,0.88)');
        gradient.addColorStop(0.78, 'rgba(210,230,255,0.55)');
        gradient.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.fill();
        const glow = ctx.createRadialGradient(128, 128, 55, 128, 128, 110);
        glow.addColorStop(0, 'rgba(160,220,255,0.35)');
        glow.addColorStop(0.5, 'rgba(120,190,255,0.17)');
        glow.addColorStop(1, 'rgba(64,140,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(128, 128, 80, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        ctx.beginPath(); ctx.arc(104, 104, 14, 0, Math.PI * 2); ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    function createMenuBackdropTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0.0, '#020611');
        sky.addColorStop(0.35, '#071426');
        sky.addColorStop(0.62, '#0a2132');
        sky.addColorStop(0.84, '#07111d');
        sky.addColorStop(1.0, '#010408');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const topGlow = ctx.createRadialGradient(512, 180, 0, 512, 180, 460);
        topGlow.addColorStop(0, 'rgba(80, 150, 255, 0.22)');
        topGlow.addColorStop(0.45, 'rgba(40, 90, 175, 0.12)');
        topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const horizon = ctx.createRadialGradient(512, 650, 0, 512, 650, 420);
        horizon.addColorStop(0, 'rgba(92, 188, 255, 0.18)');
        horizon.addColorStop(0.32, 'rgba(58, 123, 198, 0.12)');
        horizon.addColorStop(0.62, 'rgba(18, 39, 62, 0.08)');
        horizon.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = horizon;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 8; i++) {
            const y = 170 + i * 84;
            const alpha = 0.09 - i * 0.008;
            const band = ctx.createLinearGradient(0, y - 22, 0, y + 22);
            band.addColorStop(0, `rgba(255,255,255,0)`);
            band.addColorStop(0.45, `rgba(255,255,255,${Math.max(0, alpha)})`);
            band.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = band;
            ctx.fillRect(0, y - 22, canvas.width, 44);
        }
        ctx.restore();

        const cloudBlobs = [
            [180, 210, 160, 0.10],
            [360, 170, 240, 0.13],
            [680, 160, 220, 0.11],
            [860, 230, 180, 0.09],
            [220, 360, 210, 0.08],
            [760, 360, 260, 0.09],
        ];
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        cloudBlobs.forEach(([x, y, radius, alpha]) => {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, `rgba(150, 200, 255, ${alpha})`);
            glow.addColorStop(0.55, `rgba(80, 130, 200, ${alpha * 0.55})`);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    // ─────────────────────────────────────────────────────────────────
    // LIGHTNING BOLT BUILDER
    // ─────────────────────────────────────────────────────────────────
    function makeBolt(scene, x, z, spread, fromY, toY) {
        const pts = [];
        const segs = 14;
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const jx = (i > 0 && i < segs) ? (Math.random() - 0.5) * spread : 0;
            const jz = (i > 0 && i < segs) ? (Math.random() - 0.5) * spread * 0.4 : 0;
            pts.push(new THREE.Vector3(x + jx, fromY + (toY - fromY) * t, z + jz));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: 0xc8e8ff, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        return { line, mat };
    }

    function makeBranchBolt(scene, x, y0, z, spread) {
        const pts = [];
        const segs = 8;
        const angle = Math.random() * Math.PI * 2;
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            pts.push(new THREE.Vector3(
                x + Math.cos(angle) * t * spread + (Math.random() - 0.5) * spread * 0.4,
                y0 - t * (6 + Math.random() * 4),
                z + Math.sin(angle) * t * spread * 0.5 + (Math.random() - 0.5) * spread * 0.3
            ));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: 0x88ccff, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        return { line, mat };
    }

    // ─────────────────────────────────────────────────────────────────
    // MAIN THREEJS INIT
    // ─────────────────────────────────────────────────────────────────
    function initMenuThreeJS() {
        const canvas = document.getElementById('menuCanvas');
        if (!canvas || typeof THREE === 'undefined') return;

        try {
            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();
            let lastMouseMove = 0;

            menuScene = new THREE.Scene();
            const backdropTexture = createMenuBackdropTexture();
            skyUniforms = {
                uMap: { value: backdropTexture },
                uTime: { value: 0 },
                uFlash: { value: 0 },
            };
            const backdropDome = new THREE.Mesh(
                new THREE.SphereGeometry(140, 48, 24),
                new THREE.ShaderMaterial({
                    uniforms: skyUniforms,
                    vertexShader: SKY_VS,
                    fragmentShader: SKY_FS,
                    side: THREE.BackSide,
                    depthWrite: false,
                    toneMapped: false,
                })
            );
            backdropDome.renderOrder = -100;
            menuScene.add(backdropDome);
            menuScene.background = new THREE.Color(0x050b14);
            menuScene.fog = new THREE.FogExp2(0x071420, 0.014);

            menuCam = new THREE.PerspectiveCamera(
                MENU_CONFIG.camera.fov,
                innerWidth / innerHeight,
                MENU_CONFIG.camera.near,
                MENU_CONFIG.camera.far
            );
            menuCam.position.set(...MENU_CONFIG.camera.pos);
            fitMenuCamera();
            menuCam.lookAt(0, 0, 0);
            menuCam.userData.cinematicOrbit = {
                center: new THREE.Vector3(0, 0.65, -0.8),
                radius: 12.8,
                height: 4.7,
                angleOffset: -0.18
            };

            menuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
            menuRenderer.setPixelRatio(MENU_CONFIG.renderer.pixelRatio);
            menuRenderer.setSize(innerWidth, innerHeight);
            // Use ACES Filmic tonemapping for richer highlights
            menuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            menuRenderer.toneMappingExposure = MENU_CONFIG.renderer.exposure;
            // Physically based rendering and correct color encoding for realism
            menuRenderer.outputEncoding = THREE.sRGBEncoding;
            menuRenderer.physicallyCorrectLights = true;
            // Enable soft shadows
            // Phones / very low-end devices skip shadow maps from the start.
            menuRenderer.shadowMap.enabled = (window.PerfGovernor?.tier || 0) < 2;
            menuRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
            menuRenderer.setClearColor(0x050b14, 1);
            try {
                if ((window.PerfGovernor?.tier || 0) < 3) menuBloom = new MenuBloom(menuRenderer, menuScene, menuCam);
            } catch (err) {
                console.warn('[Menu] Bloom unavailable, rendering directly.', err);
                menuBloom = null;
            }

            scene = menuScene;
            camera = menuCam;
            renderer = menuRenderer;


            // ── LIGHTING ─────────────────────────────────────────────
            // Ambient + hemisphere for ground/sky bounce
            ambLight = new THREE.AmbientLight(0x07101a, 1.25);
            menuScene.add(ambLight);
            const hemiLight = new THREE.HemisphereLight(0x88b8ff, 0x0b1220, 0.36);
            menuScene.add(hemiLight);

            // Main directional "moon" key light (casts soft shadows)
            const moonLight = new THREE.DirectionalLight(0x5f8fcf, 0.95);
            moonLight.position.set(10, 30, -15);
            moonLight.castShadow = true;
            moonLight.shadow.mapSize.set(1024, 1024);
            moonLight.shadow.camera.near = 1;
            moonLight.shadow.camera.far = 120;
            moonLight.shadow.bias = -0.0006;
            menuScene.add(moonLight);

            // Key rim light (cool blue-white, simulates lightning ambient)
            const rimLight = new THREE.DirectionalLight(0x66d8ff, 0.62);
            rimLight.position.set(-15, 12, 8);
            rimLight.castShadow = false;
            menuScene.add(rimLight);

            // Flash light — fires on lightning strikes (short, high-decay)
            flashLight = new THREE.PointLight(0xb0d4ff, 0, 220, 2.0);
            flashLight.position.set(0, 38, -16);
            // No shadows from the flash: a point-light shadow re-renders the scene
            // six times per frame, which costs far more than it adds.
            flashLight.castShadow = false;
            menuScene.add(flashLight);

            // Ball / ring lights (dynamic, added per-ring)
            const ringLights = [];

            // ── STORM OCEAN ──────────────────────────────────────────
            seaUniforms = {
                uSurface: { value: createCourtSurfaceTexture(menuRenderer) },
                uTime: { value: 0 },
                uCamPos: { value: menuCam.position.clone() },
                uLightningFlash: { value: 0 },
                uLightningPos: { value: new THREE.Vector3(0, 28, -12) }
            };

            const seaGeo = new THREE.PlaneGeometry(13.2, 6.4, 96, 64);
            const seaMat = new THREE.ShaderMaterial({
                uniforms: seaUniforms,
                vertexShader: SEA_VS,
                fragmentShader: SEA_FS,
                transparent: true
            });
            // SEA_VS displaces along local Y and reads waves from local XZ, so the
            // plane must be laid flat in its own geometry (rotating the mesh
            // instead leaves the shader's normals pointing sideways = black court).
            seaGeo.rotateX(-Math.PI / 2);
            const seaMesh = new THREE.Mesh(seaGeo, seaMat);
            seaMesh.position.set(0, -1.05, -2.4);
            menuScene.add(seaMesh);

            const arenaFloorY = -0.93;
            const arena = new THREE.Group();
            arena.position.z = -2.4;
            const courtGlowMat = new THREE.MeshBasicMaterial({
                color: 0x2eeeff,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const railMat = new THREE.MeshStandardMaterial({
                color: 0x0a2030,
                emissive: 0x06384a,
                emissiveIntensity: 0.45,
                metalness: 0.45,
                roughness: 0.32
            });
            const postMat = new THREE.MeshStandardMaterial({
                color: 0x0b121d,
                emissive: 0x00a6c8,
                emissiveIntensity: 0.85,
                metalness: 0.5,
                roughness: 0.2
            });

            function addFloorBar(x, z, w, d, mat = courtGlowMat) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.032, d), mat);
                bar.position.set(x, arenaFloorY + 0.035, z);
                bar.renderOrder = 4;
                arena.add(bar);
                return bar;
            }

            addFloorBar(0, 3.0, 12.4, 0.045);
            addFloorBar(0, -3.0, 12.4, 0.045);
            addFloorBar(-6.2, 0, 0.045, 6.0);
            addFloorBar(6.2, 0, 0.045, 6.0);
            addFloorBar(0, 0, 0.04, 6.0);
            addFloorBar(0, 0, 12.4, 0.018, new THREE.MeshBasicMaterial({
                color: 0x89f6ff,
                transparent: true,
                opacity: 0.16,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));

            [
                [-6.55, 0, 0.12, 0.55, 6.6],
                [6.55, 0, 0.12, 0.55, 6.6],
                [0, 3.35, 13.2, 0.50, 0.12],
                [0, -3.35, 13.2, 0.50, 0.12]
            ].forEach(([x, z, w, h, d]) => {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), railMat);
                rail.position.set(x, arenaFloorY + h * 0.5, z);
                arena.add(rail);
            });

            const netMat = new THREE.MeshBasicMaterial({
                color: 0x66f7ff,
                transparent: true,
                opacity: 0.13,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const net = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.58, 8, 2), netMat);
            net.position.set(0, arenaFloorY + 0.54, 0);
            net.rotation.y = Math.PI / 2;
            arena.add(net);
            [-2.85, 2.85].forEach((z) => {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), postMat);
                post.position.set(0, arenaFloorY + 0.42, z);
                arena.add(post);
            });

            const arenaLight = new THREE.PointLight(0x41eaff, 3.8, 16, 1.75);
            arenaLight.position.set(0, arenaFloorY + 2.4, 0.2);
            arenaLight.castShadow = true;
            arenaLight.shadow.mapSize.set(1024, 1024);
            arenaLight.shadow.bias = -0.001;
            arena.add(arenaLight);
            menuScene.add(arena);

            // ── STORM CLOUDS ─────────────────────────────────────────
            const cloudCfg = [
                { w: 95, h: 68, y: 19, z: -30, rx: -0.09, offX: 0.0 },
                { w: 75, h: 54, y: 24, z: -19, rx: -0.13, offX: 0.22 },
                { w: 120, h: 85, y: 15, z: -44, rx: -0.06, offX: -0.15 },
                { w: 85, h: 60, y: 21, z: -26, rx: -0.10, offX: 0.38 },
            ];
            cloudMeshes = [];
            cloudCfg.forEach((cfg, i) => {
                const cGeo = new THREE.PlaneGeometry(cfg.w, cfg.h);
                const cMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uFlash: { value: 0 },
                        uLayer: { value: i * 0.33 },
                        uOffX: { value: cfg.offX }
                    },
                    vertexShader: CLOUD_VS,
                    fragmentShader: CLOUD_FS,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.NormalBlending
                });
                const c = new THREE.Mesh(cGeo, cMat);
                c.position.set((i - 1.5) * 12, cfg.y, cfg.z);
                c.rotation.x = cfg.rx;
                c.renderOrder = -8 + i;
                c.userData.cMat = cMat;
                menuScene.add(c);
                cloudMeshes.push(c);
            });

            // ── RAIN ─────────────────────────────────────────────────
            const rainCount = 1800;
            const rPos = new Float32Array(rainCount * 3);
            rainVelocities = new Float32Array(rainCount);
            for (let i = 0; i < rainCount; i++) {
                rPos[i * 3] = (Math.random() - 0.5) * 110;
                rPos[i * 3 + 1] = Math.random() * 27 - 1.2;
                rPos[i * 3 + 2] = (Math.random() - 0.5) * 100;
                rainVelocities[i] = 0.28 + Math.random() * 0.22;
            }
            const rainGeo = new THREE.BufferGeometry();
            rainGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
            // Soft round sprite so points render as droplets/motes, not squares.
            const softDot = createSoftDotTexture();
            const rainMat = new THREE.PointsMaterial({
                map: softDot,
                color: 0x8abde6, size: 0.05, transparent: true, opacity: 0.22,
                blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
            });
            rainPoints = new THREE.Points(rainGeo, rainMat);
            menuScene.add(rainPoints);

            // ── MIST / SPRAY PARTICLES ─────────────────────────────────
            const sprayCount = 360;
            const sPos = new Float32Array(sprayCount * 3);
            for (let i = 0; i < sprayCount; i++) {
                sPos[i * 3] = (Math.random() - 0.5) * 80;
                sPos[i * 3 + 1] = -0.95 + Math.random() * 0.55;
                sPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
            }
            const sprayGeo = new THREE.BufferGeometry();
            sprayGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
            const sprayMat = new THREE.PointsMaterial({
                map: softDot,
                color: 0x7ab0d6, size: 0.5, transparent: true, opacity: 0.08,
                blending: THREE.NormalBlending, depthWrite: false, sizeAttenuation: true
            });
            const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
            menuScene.add(sprayPoints);

            // ── LIGHTNING BOLTS ───────────────────────────────────────
            boltLines = [];
            for (let i = 0; i < 8; i++) {
                const bx = (Math.random() - 0.5) * 80;
                const bz = (Math.random() - 0.5) * 45 - 15;
                const spread = 3.5 + Math.random() * 4;
                boltLines.push(makeBolt(menuScene, bx, bz, spread, 30, -0.8 + Math.random() * 1.8));
                if (Math.random() > 0.35) {
                    const branchY = 10 + Math.random() * 15;
                    boltLines.push(makeBranchBolt(menuScene, bx + (Math.random() - 0.5) * 3, branchY, bz, 3 + Math.random() * 3));
                }
            }

            // ── BALL ─────────────────────────────────────────────────
            const ballTexture = createBallTexture();
            const ballMat = new THREE.MeshStandardMaterial({
                map: ballTexture, color: 0xffffff,
                emissive: 0x1a3080, emissiveIntensity: 0.45,
                roughness: 0.18, metalness: 0.05
            });
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 24), ballMat);
            ball.position.set(0, 1.1, -2.5);
            ball.userData.phase = Math.random() * Math.PI * 2;
            ball.userData.speedPhase = Math.random() * Math.PI * 2;
            ball.userData.wobblePhase = Math.random() * Math.PI * 2;
            menuScene.add(ball);

            // Ball halo
            const ballHalo = new THREE.Mesh(
                new THREE.SphereGeometry(0.65, 32, 24),
                new THREE.MeshStandardMaterial({
                    color: 0x0055ff, emissive: 0x0033ff, emissiveIntensity: 0.8,
                    transparent: true, opacity: 0.15, side: THREE.BackSide, depthWrite: false,
                    roughness: 1.0, metalness: 0.0
                })
            );
            menuScene.add(ballHalo);

            // Ball point light
            const ballLight = new THREE.PointLight(0x3366ff, 8, 18);
            ballLight.castShadow = true;
            ballLight.shadow.mapSize.set(1024, 1024);
            menuScene.add(ballLight);

            // ── PADDLES ───────────────────────────────────────────────
            const leftPaddleTexture = createPaddleTexture('#1a8cff', '#5fb2ff');
            const leftPaddleMat = new THREE.MeshStandardMaterial({
                map: leftPaddleTexture, color: 0xffffff,
                emissive: 0x1a6cff, emissiveIntensity: 0.32,
                roughness: 0.28, metalness: 0.06
            });
            const leftPaddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.8, 0.12), leftPaddleMat);
            leftPaddle.position.set(-6, 0.1, -2.5);
            leftPaddle.rotation.y = 0.06;
            leftPaddle.userData = { targetY: 0, phase: Math.random() * Math.PI * 2, swingPhase: Math.random() * Math.PI * 2 };
            menuScene.add(leftPaddle);

            const rightPaddleTexture = createPaddleTexture('#ff0044', '#ff78a2');
            const rightPaddleMat = new THREE.MeshStandardMaterial({
                map: rightPaddleTexture, color: 0xffffff,
                emissive: 0x2a081a, emissiveIntensity: 0.18,
                roughness: 0.32, metalness: 0.04
            });
            const rightPaddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.8, 0.12), rightPaddleMat);
            rightPaddle.position.set(6, 0.1, -2.5);
            rightPaddle.rotation.y = -0.06;
            rightPaddle.userData = { targetY: 0, phase: Math.random() * Math.PI * 2, swingPhase: Math.random() * Math.PI * 2 };
            menuScene.add(rightPaddle);

            // ── TRAIL PARTICLES ───────────────────────────────────────
            const trailParticles = [];
            for (let i = 0; i < 30; i++) {
                const p = new THREE.Mesh(
                    new THREE.SphereGeometry(0.04, 8, 8),
                    new THREE.MeshBasicMaterial({
                        color: 0x00ddff, transparent: true, opacity: 0.4,
                        blending: THREE.AdditiveBlending, depthWrite: false
                    })
                );
                p.userData.life = 0;
                p.userData.maxLife = 0.8;
                menuScene.add(p);
                trailParticles.push(p);
            }
            let trailIndex = 0;

            // ── BALL HALO GLOW RINGS ──────────────────────────────────
            const ringGroup = new THREE.Group();
            for (let i = 0; i < 2; i++) {
                const hue = 0.55 + i * 0.1;
                const ringMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(hue, 0.82, 0.55),
                    emissive: new THREE.Color().setHSL(hue, 1, 0.62),
                    emissiveIntensity: 0.52,
                    metalness: 0.2,
                    roughness: 0.28,
                    transparent: true,
                    opacity: 0.34,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    depthTest: true
                });
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(0.72 + i * 0.25, 0.022, 16, 120),
                    ringMat
                );
                ring.renderOrder = 30 + i;
                ring.rotation.x = Math.PI / 2 + i * Math.PI / 3;
                ring.userData = {
                    index: i,
                    originalColor: new THREE.Color().setHSL(hue, 0.82, 0.55),
                    glitchTime: 0,
                    glitchDuration: 0,
                    glitchSeed: Math.random() * Math.PI * 2,
                    mat: ringMat
                };
                const rl = new THREE.PointLight(new THREE.Color().setHSL(hue, 1, 0.62), 2.2, 12, 1.4);
                rl.position.set(0, 0.55, 0.18);
                ring.add(rl);
                ringLights.push(rl);
                ringGroup.add(ring);
            }
            ringGroup.position.set(0, 1.1, -2.5);
            menuScene.add(ringGroup);

            // ── AMBIENT PARTICLES ─────────────────────────────────────
            const particleCount = 320;
            const pPositions = new Float32Array(particleCount * 3);
            const pColors = new Float32Array(particleCount * 3);
            for (let i = 0; i < particleCount; i++) {
                const r = 4 + Math.random() * 8;
                const th = Math.random() * Math.PI * 2;
                const ph = Math.random() * Math.PI;
                pPositions[i * 3] = r * Math.sin(ph) * Math.cos(th);
                pPositions[i * 3 + 1] = r * Math.cos(ph) * (Math.random() * 0.5 + 0.5);
                pPositions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
                const col = new THREE.Color().setHSL(0.55 + Math.random() * 0.15, 0.7, 0.3);
                pColors[i * 3] = col.r; pColors[i * 3 + 1] = col.g; pColors[i * 3 + 2] = col.b;
            }
            const pGeo = new THREE.BufferGeometry();
            pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
            pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
            menuParticles = new THREE.Points(pGeo, new THREE.PointsMaterial({
                map: softDot,
                size: 0.06, vertexColors: true, transparent: true, opacity: 0.18,
                blending: THREE.AdditiveBlending, sizeAttenuation: true, depthWrite: false
            }));
            menuScene.add(menuParticles);

            // ── PHYSICS HELPERS ───────────────────────────────────────
            const floorY = -0.95;
            const ballRadius = 0.38;
            const paddleHalfH = 0.9;
            const paddleRadius = 0.45;
            const minBPDist = ballRadius + paddleRadius + 0.08;
            const minPPDist = paddleRadius * 2 + 0.18;

            function keepAboveFloor(obj, minY) {
                if (obj.position.y < minY) obj.position.y = minY;
            }
            function separateActors(a, b, minDist) {
                const dx = a.position.x - b.position.x;
                const dy = a.position.y - b.position.y;
                const dz = a.position.z - b.position.z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d <= 0 || d >= minDist) return;
                const ov = minDist - d;
                const nx = dx / d, ny = dy / d, nz = dz / d;
                a.position.x += nx * ov * 0.55; a.position.y += ny * ov * 0.55; a.position.z += nz * ov * 0.55;
                b.position.x -= nx * ov * 0.45; b.position.y -= ny * ov * 0.45; b.position.z -= nz * ov * 0.45;
            }

            const ballHome = new THREE.Vector3(0, 1.1, -2.5);
            const ballTarget = new THREE.Vector3();
            const leftTarget = new THREE.Vector3();
            const rightTarget = new THREE.Vector3();

            // ── ANIMATION LOOP ────────────────────────────────────────
            const clock = new THREE.Clock();

            const menuOverlayEl = document.getElementById('overlay');

            // Hold the menu at 60 fps on any device: if it averages below ~55
            // fps, step down resolution, then bloom, then shadows (one step
            // per ~1.5 s of measurement, never back up during the session).
            let menuFrameSum = 0, menuFrameCount = 0, menuQualityStep = 0;
            function adaptMenuQuality(delta) {
                if (!(delta > 0) || delta > 0.25) return;
                menuFrameSum += delta;
                menuFrameCount++;
                if (menuFrameCount < 90) return;
                const avg = menuFrameSum / menuFrameCount;
                menuFrameSum = 0;
                menuFrameCount = 0;
                if (avg <= 1 / 55 || menuQualityStep >= 3) return;
                menuQualityStep++;
                if (menuQualityStep === 1 && menuRenderer.getPixelRatio() > 1) {
                    MENU_CONFIG.renderer.pixelRatio = 1;
                    menuRenderer.setPixelRatio(1);
                    menuBloom?.setSize(innerWidth, innerHeight);
                } else if (menuQualityStep <= 2 && menuBloom) {
                    menuQualityStep = 2;
                    menuBloom = null;
                } else {
                    menuQualityStep = 3;
                    menuRenderer.shadowMap.enabled = false;
                }
            }
            function animateMenu() {
                requestAnimationFrame(animateMenu);
                // The menu scene is only visible behind the overlay; skip all work
                // (including the GPU render) while a match is being played.
                if (document.hidden || !menuOverlayEl || menuOverlayEl.classList.contains('hidden')) {
                    clock.getDelta();
                    return;
                }
                const delta = clock.getDelta();
                adaptMenuQuality(delta);
                const time = clock.getElapsedTime();

                // ── Sea uniforms ─────────────────────────────────────
                seaUniforms.uTime.value = time;
                seaUniforms.uCamPos.value.copy(menuCam.position);

                // ── Clouds ───────────────────────────────────────────
                cloudMeshes.forEach((c) => {
                    if (c.userData.cMat) {
                        c.userData.cMat.uniforms.uTime.value = time;
                        // gentle lateral drift
                        c.position.x += Math.sin(time * 0.07 + c.userData.cMat.uniforms.uLayer.value) * 0.0015;
                    }
                });

                // ── Rain ─────────────────────────────────────────────
                const rpa = rainPoints.geometry.attributes.position;
                for (let i = 0; i < rainPoints.geometry.attributes.position.count; i++) {
                    rpa.array[i * 3 + 1] -= rainVelocities[i];
                    rpa.array[i * 3] += 0.035; // increased wind drift
                    if (rpa.array[i * 3 + 1] < -1.35) {
                        rpa.array[i * 3 + 1] = 25;
                        rpa.array[i * 3] = (Math.random() - 0.5) * 110;
                        rpa.array[i * 3 + 2] = (Math.random() - 0.5) * 100;
                    }
                }
                rpa.needsUpdate = true;

                // ── Lightning system ──────────────────────────────────
                lightningTimer -= delta;
                if (lightningTimer <= 0) {
                    lightningTimer = 4.2 + Math.random() * 5.8;
                    lightningDuration = 0.07 + Math.random() * 0.18;
                    lightningActive = true;

                    // Pick random bolt cluster
                    const shuffled = [...boltLines].sort(() => Math.random() - 0.5);
                    activeBolts = shuffled.slice(0, 1 + Math.floor(Math.random() * 3));

                    // Randomise flash position
                    const lx = (Math.random() - 0.5) * 80;
                    const lz = -12 + Math.random() * 12;
                    seaUniforms.uLightningPos.value.set(lx, 32, lz);
                    flashLight.position.set(lx, 42, lz);
                }

                if (lightningActive) {
                    lightningDuration -= delta;
                    const flicker = Math.abs(Math.sin(time * 95 + Math.random() * 0.5));
                    const rawIntensity = Math.max(0, lightningDuration / 0.25);
                    const intensity = rawIntensity * (0.55 + flicker * 0.45);

                    flashLight.intensity = intensity * 120;
                    seaUniforms.uLightningFlash.value = intensity * 0.48;
                    menuRenderer.toneMappingExposure = MENU_CONFIG.renderer.exposure + intensity * 0.55;
                    ambLight.intensity = 1.55 + intensity * 1.4;
                    menuScene.fog.density = 0.018 + intensity * 0.004;

                    cloudMeshes.forEach(c => {
                        if (c.userData.cMat) c.userData.cMat.uniforms.uFlash.value = intensity;
                    });
                    activeBolts.forEach(b => {
                        b.mat.opacity = intensity * (0.65 + flicker * 0.35);
                    });

                    if (lightningDuration <= 0) {
                        lightningActive = false;
                        flashLight.intensity = 0;
                        seaUniforms.uLightningFlash.value = 0;
                        menuRenderer.toneMappingExposure = MENU_CONFIG.renderer.exposure;
                        ambLight.intensity = 1.55;
                        menuScene.fog.density = 0.018;
                        cloudMeshes.forEach(c => {
                            if (c.userData.cMat) c.userData.cMat.uniforms.uFlash.value = 0;
                        });
                        boltLines.forEach(b => { b.mat.opacity = 0; });
                    }
                }

                const sceneGlitch = lightningActive ? seaUniforms.uLightningFlash.value * 0.55 : 0;

                // ── Ball ─────────────────────────────────────────────
                const drift = Math.sin(time * 0.47 + ball.userData.wobblePhase);
                const vPulse = Math.cos(time * 1.78 + ball.userData.speedPhase) * 0.22;
                ballTarget.set(
                    Math.sin(time * 0.88 + ball.userData.phase) * 2.8 + Math.sin(time * 1.93 + ball.userData.phase * 0.7) * 0.55,
                    ballHome.y + vPulse + drift * 0.35,
                    ballHome.z + Math.cos(time * 0.63 + ball.userData.phase) * 0.75
                );
                ball.position.x += (ballTarget.x - ball.position.x) * 0.085;
                ball.position.y += (ballTarget.y - ball.position.y) * 0.08;
                ball.position.z += (ballTarget.z - ball.position.z) * 0.07;
                keepAboveFloor(ball, floorY + ballRadius + 0.02);

                ball.rotation.x += delta * 1.5 + Math.sin(time * 1.7) * 0.001;
                ball.rotation.y += delta * 2.2 + Math.cos(time * 1.4) * 0.0015;
                ball.rotation.z = Math.sin(time * 0.8) * 0.28;
                ball.scale.setScalar(1 + Math.sin(time * 3.4) * 0.03 + Math.cos(time * 1.2) * 0.02);
                ballMat.emissiveIntensity = 0.5 + Math.sin(time * 3.1 + ball.userData.phase) * 0.2
                    + Math.abs(ball.position.y - ballHome.y) * 0.06
                    + sceneGlitch * 0.3;

                // Ball halo
                ballHalo.position.copy(ball.position);
                ballHalo.scale.setScalar(1 + Math.sin(time * 2.5) * 0.2);
                ballHalo.material.opacity = 0.18 + Math.sin(time * 1.8) * 0.10;

                // Ball light
                ballLight.position.copy(ball.position);
                ballLight.intensity = 7 + Math.sin(time * 2.2) * 1.5
                    + (lightningActive ? seaUniforms.uLightningFlash.value * 5 : 0);

                // ── Rings ─────────────────────────────────────────────
                ringGroup.position.copy(ball.position);
                ringGroup.rotation.x += delta * 0.3 + Math.sin(time * 0.5) * 0.001;
                ringGroup.rotation.y += delta * 0.5 + Math.cos(time * 0.6) * 0.0015;
                ringGroup.rotation.z += delta * 0.25;

                ringGroup.children.forEach((ring, i) => {
                    const ud = ring.userData;
                    // Procedural glitch trigger
                    if (time > ud.glitchTime) {
                        if (Math.random() > 0.992) {
                            ud.glitchDuration = 0.08 + Math.random() * 0.22;
                            ud.glitchTime = time + ud.glitchDuration + 1.5 + Math.random() * 3.5;
                        }
                    }
                    const inGlitch = time < ud.glitchTime && time > (ud.glitchTime - ud.glitchDuration);
                    const pulse = Math.sin(time * (1.8 + i * 0.45) + ud.glitchSeed) * 0.5 + 0.5;

                    if (inGlitch) {
                        const burst = Math.sin(time * 11 + ud.glitchSeed) * 0.5 + 0.5;
                        ring.scale.setScalar(1 + Math.sin(time * 110 + ud.glitchSeed) * 0.1 + sceneGlitch * 0.18);
                        ring.position.x = Math.sin(time * 58 + ud.glitchSeed) * (0.06 + sceneGlitch * 0.09);
                        ring.position.y = Math.cos(time * 51 + ud.glitchSeed) * (0.05 + sceneGlitch * 0.08);
                        ud.mat.emissiveIntensity = 0.65 + burst * 0.45 + sceneGlitch * 0.25;
                        ud.mat.color.copy(ud.originalColor).lerp(new THREE.Color(0xffffff), burst * 0.22);
                        if (ringLights[i]) {
                            ringLights[i].intensity = 2.4 + burst * 1.8 + sceneGlitch * 2.2;
                            ringLights[i].color.lerp(new THREE.Color(0xffffff), 0.22 + burst * 0.18);
                        }
                        ring.rotation.z += Math.sin(time * (90 + i * 8) + ud.glitchSeed) * (0.12 + sceneGlitch * 0.08);
                    } else {
                        ring.scale.lerp(new THREE.Vector3().setScalar(1 + Math.sin(time * (1.5 + i * 0.3)) * 0.1), 0.12);
                        ring.position.lerp(new THREE.Vector3(0, 0, 0), 0.15);
                        ud.mat.color.lerp(ud.originalColor, 0.15);
                        ud.mat.emissiveIntensity = 0.45 + Math.sin(time * (2.2 + i * 0.35) + ud.glitchSeed) * 0.12 + sceneGlitch * 0.2;
                        ud.mat.opacity = THREE.MathUtils.lerp(ud.mat.opacity, 0.32 + Math.sin(time * (1.4 + i * 0.2)) * 0.035, 0.15);
                        if (ringLights[i]) {
                            ringLights[i].intensity = 2.1 + Math.sin(time * (2.4 + i * 0.5) + ud.glitchSeed) * 0.6 + sceneGlitch * 1.5;
                            ringLights[i].distance = 12 + sceneGlitch * 4;
                            ringLights[i].color.lerp(new THREE.Color().setHSL(0.55 + i * 0.1, 1, 0.62), 0.15);
                        }
                    }
                });

                // ── Left Paddle ───────────────────────────────────────
                leftTarget.set(
                    -6.2 + Math.sin(time * 0.68 + 0.4) * 0.45,
                    THREE.MathUtils.clamp(ball.position.y * 0.72 + Math.sin(time * 1.35) * 0.34, -2.15, 2.15),
                    -2.5 + Math.sin(time * 0.54 + 0.9) * 0.18
                );
                leftPaddle.position.x += (leftTarget.x - leftPaddle.position.x) * 0.06;
                leftPaddle.position.y += (leftTarget.y - leftPaddle.position.y) * 0.16;
                leftPaddle.position.z += (leftTarget.z - leftPaddle.position.z) * 0.04;
                leftPaddle.rotation.z = THREE.MathUtils.clamp(
                    (ball.position.y - leftPaddle.position.y) * 0.045
                    + Math.sin(time * 1.18) * 0.08
                    + Math.sin(time * 2.2 + leftPaddle.userData.swingPhase) * 0.04,
                    -0.42, 0.42
                );
                leftPaddle.rotation.x = Math.sin(time * 0.92) * 0.05 + Math.cos(time * 1.7 + leftPaddle.userData.swingPhase) * 0.03;
                leftPaddle.rotation.y = 0.06 + Math.sin(time * 0.62) * 0.07 + Math.cos(time * 2.8 + leftPaddle.userData.swingPhase) * 0.025;
                leftPaddle.position.y += Math.sin(time * 2.45 + leftPaddle.userData.swingPhase) * 0.02;
                leftPaddle.scale.setScalar(1 + Math.sin(time * 2.05) * 0.025);
                leftPaddleMat.emissiveIntensity = 0.5 + Math.abs(Math.sin(time * 2.3 + leftPaddle.userData.phase)) * 0.28 + sceneGlitch * 0.1;

                // ── Right Paddle ──────────────────────────────────────
                rightTarget.set(
                    6.2 + Math.cos(time * 0.72 + 1.2) * 0.45,
                    THREE.MathUtils.clamp(ball.position.y * 0.64 + Math.cos(time * 1.5 + rightPaddle.userData.phase) * 0.3, -2.05, 2.05),
                    -2.5 + Math.cos(time * 0.58 + 0.4) * 0.18
                );
                rightPaddle.position.x += (rightTarget.x - rightPaddle.position.x) * 0.06;
                rightPaddle.position.y += (rightTarget.y - rightPaddle.position.y) * 0.16;
                rightPaddle.position.z += (rightTarget.z - rightPaddle.position.z) * 0.04;
                rightPaddle.rotation.z = THREE.MathUtils.clamp(
                    -(ball.position.y - rightPaddle.position.y) * 0.045
                    + Math.cos(time * 1.12) * 0.08
                    + Math.sin(time * 2.6 + rightPaddle.userData.swingPhase) * 0.04,
                    -0.42, 0.42
                );
                rightPaddle.rotation.x = -Math.sin(time * 0.88) * 0.05 + Math.cos(time * 1.9 + rightPaddle.userData.swingPhase) * 0.03;
                rightPaddle.rotation.y = -0.06 - Math.cos(time * 0.66) * 0.07 + Math.sin(time * 2.3 + rightPaddle.userData.swingPhase) * 0.02;
                rightPaddle.position.y += Math.cos(time * 2.55 + rightPaddle.userData.swingPhase) * 0.02;
                rightPaddle.scale.setScalar(1 + Math.cos(time * 2.15) * 0.025);
                rightPaddleMat.emissiveIntensity = 0.5 + Math.abs(Math.cos(time * 2.6 + rightPaddle.userData.phase)) * 0.28 + sceneGlitch * 0.1;

                keepAboveFloor(leftPaddle, floorY + paddleHalfH + 0.02);
                keepAboveFloor(rightPaddle, floorY + paddleHalfH + 0.02);
                separateActors(ball, leftPaddle, minBPDist);
                separateActors(ball, rightPaddle, minBPDist);
                separateActors(leftPaddle, rightPaddle, minPPDist);

                // ── Trail particles ───────────────────────────────────
                const trail = trailParticles[trailIndex];
                trail.position.copy(ball.position);
                trail.userData.life = trail.userData.maxLife;
                trail.material.opacity = 0.22;
                trail.scale.setScalar(1);
                trailIndex = (trailIndex + 1) % trailParticles.length;
                trailParticles.forEach(p => {
                    if (p.userData.life > 0) {
                        p.userData.life = Math.max(0, p.userData.life - delta * 1.6);
                        const lr = p.userData.life / p.userData.maxLife;
                        p.material.opacity = Math.max(0, lr * (0.7 + sceneGlitch * 0.18));
                        p.scale.setScalar(0.25 + lr * 0.75);
                    }
                });

                // ── Ambient particles ─────────────────────────────────
                if (menuParticles) {
                    menuParticles.rotation.y += delta * 0.16;
                    menuParticles.rotation.x = Math.sin(time * 0.18) * 0.06;
                    menuParticles.position.y = Math.sin(time * 0.2) * 0.5;
                    menuParticles.material.opacity = 0.16 + sceneGlitch * 0.08;
                }

                // ── Cinematic camera orbit ────────────────────────────
                const orbit = menuCam.userData.cinematicOrbit;
                const orbitAngle = time * 0.12 + orbit.angleOffset;
                const orbitRad = orbit.radius + Math.sin(time * 0.23) * 0.55 + (lightningActive ? seaUniforms.uLightningFlash.value * 0.1 : 0);
                const orbitH = orbit.height + Math.sin(time * 0.17) * 0.22 + sceneGlitch * 0.12;
                menuCam.position.x += (orbit.center.x + Math.cos(orbitAngle) * orbitRad - menuCam.position.x) * 0.018;
                menuCam.position.y += (orbit.center.y + orbitH - menuCam.position.y) * 0.018;
                menuCam.position.z += (orbit.center.z + Math.sin(orbitAngle) * orbitRad - menuCam.position.z) * 0.018;

                const lookTarget = new THREE.Vector3(
                    ball.position.x * 0.12 + Math.sin(time * 0.08) * 0.22 + mouse.x * 0.18,
                    ball.position.y * 0.14 + 0.35 + Math.cos(time * 0.1) * 0.12 + mouse.y * 0.08,
                    ball.position.z * 0.10
                );
                lookTarget.x += Math.sin(time * 2.2) * sceneGlitch * 0.04;
                lookTarget.y += Math.cos(time * 1.9) * sceneGlitch * 0.03;
                menuCam.lookAt(lookTarget);

                skyUniforms.uTime.value = time;
                skyUniforms.uFlash.value = lightningActive ? seaUniforms.uLightningFlash.value : 0;
                if (menuBloom) menuBloom.render(delta);
                else menuRenderer.render(menuScene, menuCam);
            }

            animateMenu();

            // Resize handler
            window.addEventListener('resize', () => {
                fitMenuCamera();
                menuRenderer.setPixelRatio(MENU_CONFIG.renderer.pixelRatio);
                menuBloom?.setSize(innerWidth, innerHeight);
                menuRenderer.setSize(innerWidth, innerHeight);
            }, false);

            // Mouse tracking
            window.addEventListener('mousemove', (event) => {
                const now = performance.now();
                if (now - lastMouseMove > 16) {
                    mouse.x = (event.clientX / innerWidth - 0.5) * 2;
                    mouse.y = (event.clientY / innerHeight - 0.5) * 2;
                    lastMouseMove = now;
                }
            }, false);

            // Card scroll
            const cardRowEl = document.getElementById('cards-hud');
            if (cardRowEl) {
                cardRowEl.addEventListener('wheel', (e) => {
                    const now = performance.now();
                    if (now - menuLastWheelTime > 100) {
                        e.preventDefault();
                        scrollMenuCards(e.deltaY > 0 ? 1 : -1);
                        menuLastWheelTime = now;
                    }
                }, { passive: false });
                cardRowEl.addEventListener('touchstart', (e) => {
                    cardRowEl.dataset.touchX0 = String(e.touches[0].clientX);
                }, { passive: true });
                cardRowEl.addEventListener('touchend', (e) => {
                    const x0 = Number(cardRowEl.dataset.touchX0 || 0);
                    const dx = x0 - e.changedTouches[0].clientX;
                    if (Math.abs(dx) > 30) scrollMenuCards(dx > 0 ? 1 : -1);
                }, { passive: true });
            }

            document.getElementById('btnL')?.addEventListener('click', () => scrollMenuCards(-1), false);
            document.getElementById('btnR')?.addEventListener('click', () => scrollMenuCards(1), false);

            // Modal option selector
            const optEls = document.querySelectorAll('.opt');
            optEls.forEach(o => {
                o.addEventListener('click', function () {
                    optEls.forEach(x => x.classList.remove('sel'));
                    this.classList.add('sel');
                    menuIsMP = this.dataset.mp === 'true';
                }, false);
            });

            document.getElementById('btnBack')?.addEventListener('click', closeMenuModal, false);
            document.getElementById('btnGo')?.addEventListener('click', () => {
                if (window.game && menuSelected) {
                    closeMenuModal();
                    const overlay = document.getElementById('overlay');
                    if (overlay) { overlay.classList.remove('visible'); overlay.classList.add('hidden'); }
                    document.body.classList.remove('has-overlay');
                    if (menuSelected === 'customise') {
                        window.game.setGameMode?.('customise');
                    } else {
                        window.game.isMultiplayer = menuIsMP;
                        window.game.setGameMode?.(menuSelected);
                    }
                    if (typeof window.game.startIntro === 'function') window.game.startIntro();
                    if (typeof window.game.startMatchMusic === 'function') window.game.startMatchMusic();
                }
            }, false);

        } catch (err) {
            console.error('Menu Three.js init failed:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // CUSTOMISE OVERLAY
    // ─────────────────────────────────────────────────────────────────
    function showCustomiseRedirect() {
        const customiseButton = document.querySelector('#hud .mode-btn[data-mode="customise"]');
        if (customiseButton) {
            document.querySelectorAll('#hud .mode-btn').forEach(b => b.classList.remove('active'));
            customiseButton.classList.add('active');
        }

        const customiseOverlay = document.getElementById('customiseOverlay');
        const customisePanel = document.getElementById('customisePanel');
        const customStartMatchBtn = document.getElementById('customStartMatchBtn');
        const openBallStudioBtn = document.getElementById('openBallStudioBtn');
        const pvpModal = document.querySelector('.pvp-selector-modal');
        const customBackgroundMode = document.getElementById('customBackgroundMode');
        const customBgBrightness = document.getElementById('customBgBrightness');
        const customBgSaturation = document.getElementById('customBgSaturation');
        const customBgContrast = document.getElementById('customBgContrast');
        const customPaddleStyle = document.getElementById('customPaddleStyle');
        const customLeftPaddleColor = document.getElementById('customLeftPaddleColor');
        const customRightPaddleColor = document.getElementById('customRightPaddleColor');
        const customBgTintA = document.getElementById('customBgTintA');
        const customBgTintB = document.getElementById('customBgTintB');
        const customPowerupsGrid = document.getElementById('customPowerupsGrid');

        const drawFallbackPreviews = () => {
            const game = window.game;
            const customSettings = game?.customSettings || {};
            const backgroundMap = {
                classic: 'assets/images/customise-previews/classic.png',
                zombie: 'assets/images/customise-previews/zombie.png',
                gravity: 'assets/images/customise-previews/gravity.png',
                speed: 'assets/images/customise-previews/speed.png',
                obstacle: 'assets/images/customise-previews/obstacle.png'
            };
            const previewStyle = customSettings.paddleStyle || 'classic';
            const resolveAsset = (p) => (typeof window.resolveAssetUrl === 'function' ? window.resolveAssetUrl(p) : p);

            const drawPaddle = (canvas, color, label) => {
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const width = canvas.width = Math.max(260, Math.floor(canvas.clientWidth || 260));
                const height = canvas.height = Math.max(130, Math.floor(canvas.clientHeight || 130));
                ctx.clearRect(0, 0, width, height);
                const bg = ctx.createLinearGradient(0, 0, 0, height);
                bg.addColorStop(0, 'rgba(6,14,26,0.98)');
                bg.addColorStop(1, 'rgba(2,8,18,1)');
                ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
                const paddleH = Math.max(88, Math.round(height * 0.78));
                const paddleW = Math.max(12, Math.round(paddleH * 0.18));
                const previewPaddle = new Paddle(0, 0, paddleW, paddleH, color, false);
                previewPaddle.w = paddleW; previewPaddle.h = paddleH;
                previewPaddle.pos.x = Math.round((width - paddleW) / 2);
                previewPaddle.pos.y = Math.round((height - paddleH) / 2);
                previewPaddle.isAI = false;
                previewPaddle.applyCustomPaddleVisualState?.(previewStyle, color);
                ctx.save();
                ctx.translate(previewPaddle.pos.x + previewPaddle.w / 2, previewPaddle.pos.y + previewPaddle.h / 2);
                if (previewStyle === 'classic') previewPaddle.renderPlayer(ctx, performance.now() * 0.001, 0, 0.5, 0.8, 0);
                else previewPaddle.renderStyledPaddle(ctx, performance.now() * 0.001, 0, 0.5, 0.8, 0, previewStyle);
                ctx.restore();
                ctx.fillStyle = 'rgba(255,255,255,0.82)';
                ctx.font = 'bold 18px Audiowide,Arial,sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, width / 2, height - 16);
            };

            const drawBackground = (canvas) => {
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const width = canvas.width = Math.max(620, Math.floor(canvas.clientWidth || 620));
                const height = canvas.height = Math.max(130, Math.floor(canvas.clientHeight || 130));
                const previewMode = customSettings.backgroundMode || 'classic';
                const previewSource = resolveAsset(backgroundMap[previewMode] || backgroundMap.classic);
                ctx.clearRect(0, 0, width, height);
                const img = new Image();
                img.decoding = 'async';
                img.onload = () => {
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    const tint = ctx.createLinearGradient(0, 0, width, height);
                    tint.addColorStop(0, `${customSettings.backgroundTintA || '#0f6eff'}2e`);
                    tint.addColorStop(1, `${customSettings.backgroundTintB || '#00142f'}28`);
                    ctx.fillStyle = tint; ctx.fillRect(0, 0, width, height);
                };
                img.onerror = () => {
                    const sky = ctx.createLinearGradient(0, 0, 0, height);
                    sky.addColorStop(0, '#041129'); sky.addColorStop(0.5, '#061d44'); sky.addColorStop(1, '#020711');
                    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
                };
                img.src = previewSource;
            };

            const bgMode = customSettings.backgroundMode || 'classic';
            const bgImage = document.getElementById('customLiveBackgroundImage');
            if (bgImage) {
                bgImage.src = resolveAsset(backgroundMap[bgMode] || backgroundMap.classic);
                bgImage.style.filter = `brightness(${customSettings.backgroundBrightness ?? 1}) saturate(${customSettings.backgroundSaturation ?? 1}) contrast(${customSettings.backgroundContrast ?? 1})`;
            }
            drawPaddle(document.getElementById('customPreviewLeftPaddle'), (window.game?.customSettings?.leftPaddleColor || '#00ffd6'), 'LEFT');
            drawPaddle(document.getElementById('customPreviewRightPaddle'), (window.game?.customSettings?.rightPaddleColor || '#ff0044'), 'RIGHT');
            const bgCanvas = document.getElementById('customLiveBackgroundCanvas');
            if (bgCanvas) drawBackground(bgCanvas);
        };

        if (customiseOverlay) { customiseOverlay.classList.add('active'); customiseOverlay.removeAttribute('aria-hidden'); }
        if (customisePanel) customisePanel.classList.add('active');
        if (pvpModal) pvpModal.classList.add('hidden');

        const overlay = document.getElementById('overlay');
        if (overlay) { overlay.classList.remove('hidden'); overlay.classList.add('visible'); }

        if (window.game) {
            const manualSync = () => {
                const game = window.game;
                if (!game || !game.customSettings) return;
                const next = game.customSettings;
                next.backgroundMode = customBackgroundMode?.value || next.backgroundMode || 'classic';
                next.backgroundBrightness = Number(customBgBrightness?.value || next.backgroundBrightness || 1);
                next.backgroundSaturation = Number(customBgSaturation?.value || next.backgroundSaturation || 1);
                next.backgroundContrast = Number(customBgContrast?.value || next.backgroundContrast || 1);
                next.paddleStyle = customPaddleStyle?.value || next.paddleStyle || 'classic';
                next.leftPaddleColor = customLeftPaddleColor?.value || next.leftPaddleColor || '#00ffd6';
                next.rightPaddleColor = customRightPaddleColor?.value || next.rightPaddleColor || '#ff0044';
                next.backgroundTintA = customBgTintA?.value || next.backgroundTintA || '#0f6eff';
                next.backgroundTintB = customBgTintB?.value || next.backgroundTintB || '#00142f';
                if (customPowerupsGrid) {
                    const checked = Array.from(customPowerupsGrid.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
                    if (typeof game.getDefaultCustomPowerUps === 'function') {
                        const allowed = new Set(game.getDefaultCustomPowerUps());
                        next.enabledPowerUps = checked.filter(t => allowed.has(t));
                    } else {
                        next.enabledPowerUps = checked;
                    }
                }
                if (typeof game.saveCustomSettings === 'function') game.saveCustomSettings();
            };

            if (window.game.customSettings) window.game.customSettings.previewModeActive = true;
            if (typeof window.__ppApplyCustomSettingsToControls === 'function') window.__ppApplyCustomSettingsToControls();
            if (typeof window.__ppSyncCustomSettingsFromControls === 'function') window.__ppSyncCustomSettingsFromControls();
            else manualSync();
            if (typeof window.game.applyCustomiseSettings === 'function') window.game.applyCustomiseSettings(true);
            if (typeof window.__ppRefreshCustomPreviewNow === 'function') window.__ppRefreshCustomPreviewNow();
            else if (typeof window.__ppRefreshCustomPreview === 'function') window.__ppRefreshCustomPreview();
            else drawFallbackPreviews();
            if (typeof window.__ppRefreshCustomBallPreview === 'function') window.__ppRefreshCustomBallPreview();
            if (typeof window.game.preloadCustomPreviewBackgrounds === 'function') window.game.preloadCustomPreviewBackgrounds();
            if (typeof window.game.preloadCustomMatchAudio === 'function') window.game.preloadCustomMatchAudio();

            const controls = [
                customBackgroundMode, customBgBrightness, customBgSaturation, customBgContrast,
                customPaddleStyle, customLeftPaddleColor, customRightPaddleColor, customBgTintA, customBgTintB
            ];
            const syncAndRefresh = () => {
                if (typeof window.__ppSyncCustomSettingsFromControls === 'function') window.__ppSyncCustomSettingsFromControls();
                else { manualSync(); window.game?.applyCustomiseSettings?.(true); }
                if (typeof window.__ppRefreshCustomPreviewNow === 'function') window.__ppRefreshCustomPreviewNow();
                else if (typeof window.__ppRefreshCustomPreview === 'function') window.__ppRefreshCustomPreview();
                else drawFallbackPreviews();
                if (typeof window.__ppRefreshCustomBallPreview === 'function') window.__ppRefreshCustomBallPreview();
            };
            controls.forEach(ctrl => {
                if (!ctrl || ctrl.dataset.ppCustomiseOverlayBound === '1') return;
                ctrl.addEventListener('input', syncAndRefresh);
                ctrl.addEventListener('change', syncAndRefresh);
                ctrl.dataset.ppCustomiseOverlayBound = '1';
            });
            if (customPowerupsGrid) {
                customPowerupsGrid.querySelectorAll('input[type="checkbox"]').forEach(inp => {
                    if (inp.dataset.ppCustomiseOverlayBound === '1') return;
                    inp.addEventListener('change', syncAndRefresh);
                    inp.dataset.ppCustomiseOverlayBound = '1';
                });
            }

            if (customStartMatchBtn && customStartMatchBtn.dataset.ppCustomStartBound !== '1') {
                customStartMatchBtn.addEventListener('click', async (event) => {
                    event.preventDefault(); event.stopPropagation();
                    const launch = window.__ppStartCustomMatchCore || window.__ppStartCustomMatch;
                    if (typeof launch === 'function') { try { await launch(event); } catch (e) { console.error('[Customise] start failed:', e); } return; }
                    const game = window.game;
                    if (!game) return;
                    if (typeof window.__ppSyncCustomSettingsFromControls === 'function') window.__ppSyncCustomSettingsFromControls();
                    game.customSettings.previewModeActive = false;
                    game.isMultiplayer = true;
                    if (typeof game.setGameMode === 'function') game.setGameMode('customise');
                });
                customStartMatchBtn.dataset.ppCustomStartBound = '1';
            }

            if (openBallStudioBtn && openBallStudioBtn.dataset.ppBallStudioBound !== '1') {
                openBallStudioBtn.addEventListener('click', () => {
                    try { sessionStorage.setItem('pp-return-to-menu', '1'); sessionStorage.setItem('pp-skip-intro', '1'); } catch (e) { }
                    window.location.assign('ball-studio.html?from_customise=1');
                });
                openBallStudioBtn.dataset.ppBallStudioBound = '1';
            }
        }
    }

    window.openCustomiseOverlay = showCustomiseRedirect;

    // ─────────────────────────────────────────────────────────────────
    // EVENT HANDLERS
    // ─────────────────────────────────────────────────────────────────
    function setupEventHandlers() {
        const customiseOverlayBackBtn = document.getElementById('customiseBackBtn');
        const overlay = document.getElementById('overlay');
        const customiseOverlay = document.getElementById('customiseOverlay');

        if (customiseOverlayBackBtn) {
            customiseOverlayBackBtn.addEventListener('click', () => {
                if (typeof window.__ppShowModeSelection === 'function') { window.__ppShowModeSelection(); return; }
                if (customiseOverlay) { customiseOverlay.classList.remove('active'); customiseOverlay.setAttribute('aria-hidden', 'true'); }
                if (overlay) { overlay.classList.remove('hidden'); overlay.classList.add('visible'); }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────
    function initMenuSystem() {
        buildMenuCards();
        initMenuThreeJS();
    }

    document.addEventListener('DOMContentLoaded', () => {
        initMenuSystem();
        setupEventHandlers();
        const overlay = document.getElementById('overlay');
        if (overlay) { overlay.classList.remove('hidden'); overlay.classList.add('visible'); }
    });

})();
