/**
 * menu-bloom.js — post-processing for the Three.js menu scene.
 *
 * Renders the scene into an off-screen target, extracts the bright neon parts,
 * blurs them at half and quarter resolution, and composites everything back
 * with vignette, a touch of chromatic aberration and film grain.
 * Everything stays inside the menu's existing WebGL context.
 */
class MenuBloom {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.time = 0;
        this.strength = 0.5;

        const isWebGL2 = renderer.capabilities.isWebGL2;
        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            encoding: THREE.sRGBEncoding,   // 8-bit storage without banding in darks
        };
        const msaa = isWebGL2 && !window.PerfGovernor?.isMobile;
        this.sceneRT = msaa && THREE.WebGLMultisampleRenderTarget
            ? new THREE.WebGLMultisampleRenderTarget(1, 1, rtOpts)
            : new THREE.WebGLRenderTarget(1, 1, rtOpts);
        if (this.sceneRT.samples !== undefined) this.sceneRT.samples = 4;
        const small = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false };
        this.half = [new THREE.WebGLRenderTarget(1, 1, small), new THREE.WebGLRenderTarget(1, 1, small)];
        this.quarter = [new THREE.WebGLRenderTarget(1, 1, small), new THREE.WebGLRenderTarget(1, 1, small)];

        this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quadScene = new THREE.Scene();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        this.quad.frustumCulled = false;
        this.quadScene.add(this.quad);

        const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
        const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
            vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
        });

        this.brightMat = mat(`
            uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
            void main() {
                vec3 c = texture2D(tDiffuse, vUv).rgb;
                float l = max(c.r, max(c.g, c.b));
                gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, l), 1.0);
            }`, { tDiffuse: { value: null }, uThreshold: { value: 0.42 } });

        this.blurMat = mat(`
            uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
            void main() {
                vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
                c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
                c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
                c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
                c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
                gl_FragColor = vec4(c, 1.0);
            }`, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });

        this.copyMat = mat(`
            uniform sampler2D tDiffuse; varying vec2 vUv;
            void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`, { tDiffuse: { value: null } });

        this.compositeMat = mat(`
            uniform sampler2D tScene, tBloomA, tBloomB;
            uniform float uTime, uStrength, uAspect;
            varying vec2 vUv;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
                vec2 cc = vUv - 0.5;
                vec2 ca = cc * 0.0035;
                vec3 col = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
                vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.85 + texture2D(tBloomB, vUv).rgb * 1.2;
                col += bloom * uStrength;
                float v = smoothstep(1.2, 0.3, length(cc * vec2(uAspect * 0.8, 1.0)));
                col *= mix(1.0, v, 0.5);
                col += (hash(gl_FragCoord.xy + fract(uTime * 7.3) * 113.0) - 0.5) * 0.03;
                gl_FragColor = vec4(col, 1.0);
            }`, {
            tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
            uTime: { value: 0 }, uStrength: { value: 1 }, uAspect: { value: 1 },
        });

        this.setSize(window.innerWidth, window.innerHeight);
    }

    setSize(w, h) {
        const pr = this.renderer.getPixelRatio();
        const W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
        this.sceneRT.setSize(W, H);
        this.half.forEach(rt => rt.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1)));
        this.quarter.forEach(rt => rt.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2)));
        this.compositeMat.uniforms.uAspect.value = w / Math.max(1, h);
    }

    _pass(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.quadScene, this.quadCam);
    }

    _blur(rts) {
        const [a, b] = rts;
        this.blurMat.uniforms.tDiffuse.value = a.texture;
        this.blurMat.uniforms.uDir.value.set(1 / a.width, 0);
        this._pass(this.blurMat, b);
        this.blurMat.uniforms.tDiffuse.value = b.texture;
        this.blurMat.uniforms.uDir.value.set(0, 1 / a.height);
        this._pass(this.blurMat, a);
    }

    render(dt) {
        const r = this.renderer;
        this.time += dt;

        r.setRenderTarget(this.sceneRT);
        r.render(this.scene, this.camera);

        this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
        this._pass(this.brightMat, this.half[0]);
        this._blur(this.half);
        this.copyMat.uniforms.tDiffuse.value = this.half[0].texture;
        this._pass(this.copyMat, this.quarter[0]);
        this._blur(this.quarter);

        const u = this.compositeMat.uniforms;
        u.tScene.value = this.sceneRT.texture;
        u.tBloomA.value = this.half[0].texture;
        u.tBloomB.value = this.quarter[0].texture;
        u.uTime.value = this.time;
        u.uStrength.value = this.strength;
        this._pass(this.compositeMat, null);
    }
}

window.MenuBloom = MenuBloom;
