/**
 * post-fx.js — WebGL post-processing for the 2D game canvas.
 *
 * The game keeps drawing with Canvas 2D. Each frame that canvas is uploaded as
 * a texture and run through a small shader pipeline before it reaches the
 * screen:
 *
 *   scene ─► bright-pass ¼ ─► blur ─┬─────────────► composite ─► screen
 *                    └► ⅛ ─► blur ──┘   (+ lens dirt texture, impact ripples,
 *                                          chromatic aberration, vignette,
 *                                          scanlines, film grain, grading)
 *
 * Because bloom provides the neon glow on the GPU, the game can turn down
 * Canvas 2D shadowBlur (its most expensive effect) — see PerfGovernor.
 *
 * If WebGL is unavailable, PostFX.create() returns null and the game shows the
 * 2D canvas directly, exactly as before.
 */
class PostFX {
    static create(sourceCanvas) {
        try {
            const fx = new PostFX(sourceCanvas);
            return fx.ok ? fx : null;
        } catch (err) {
            console.warn('[PostFX] Disabled:', err);
            return null;
        }
    }

    constructor(source) {
        this.ok = false;
        this.source = source;
        this.enabled = true;
        this.quality = 0;          // 0 high, 1 medium, 2 low (driven by PerfGovernor)
        this.time = 0;
        this.punchAmount = 0;
        this.ripples = [];         // { x, y (uv), age, strength }
        this.grade = { tint: [1, 1, 1], shadow: [0, 0, 0], highlight: [0, 0, 0], sat: 1.1, contrast: 1.04 };

        const canvas = document.createElement('canvas');
        canvas.id = 'fx';
        canvas.setAttribute('aria-hidden', 'true');
        source.insertAdjacentElement('afterend', canvas);
        this.canvas = canvas;

        const opts = { alpha: false, antialias: false, depth: false, stencil: false,
            premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
        const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
        if (!gl) { canvas.remove(); return; }
        this.gl = gl;

        canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.setActive(false);
            this.gl = null;
        });

        this._buildPrograms();
        this._buildQuad();
        this.sceneTex = this._texture();
        this.dirtTex = this._texture();
        this._uploadDirt();
        this.targets = [];
        this.width = 0;
        this.height = 0;
        this.ok = true;
        this.setActive(true);
        this.warmUp();
    }

    /**
     * Allocate the render targets and run the whole pipeline once, so buffer
     * allocation and the driver's deferred shader compilation happen now (in
     * idle time) rather than on the first frame of a match.
     */
    warmUp() {
        const W = Math.max(1, this.source.width), H = Math.max(1, this.source.height);
        this._resize(W, H);
        const wasQuality = this.quality;
        this.quality = 0;
        this.present(0);
        this.quality = wasQuality;
        this.gl.finish();
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /** Shockwave ripple at a canvas position (CSS px). strength ~0..1 */
    ripple(x, y, strength = 0.5) {
        if (!this.active || this.quality > 1) return;
        const w = this.source.clientWidth || 1, h = this.source.clientHeight || 1;
        if (this.ripples.length >= 6) this.ripples.shift();
        this.ripples.push({ x: x / w, y: 1 - y / h, age: 0, strength: Math.min(1.2, strength) });
    }

    /** Short chromatic/flash kick on impacts. amount ~0..1 */
    punch(amount = 0.5) {
        this.punchAmount = Math.min(1.5, Math.max(this.punchAmount, amount));
    }

    /** Colour grade towards a mode tint, e.g. [1.05, 0.95, 1.1]. */
    /** Colour grade: { tint, shadow, highlight (rgb arrays), sat, contrast }. */
    setGrade(grade) { this.grade = { ...this.grade, ...grade }; }

    // 0 high, 1 medium (single bloom level), 2 low (no bloom), 3 = off: the
    // canvas is shown directly, saving the per-frame upload and composite.
    setQuality(tier) {
        const q = Math.max(0, Math.min(3, tier | 0));
        if (q === 3) {
            if (this.active) this.setActive(false);
            this.quality = 2;
            return;
        }
        if (!this.active && this.gl) this.setActive(true);
        this.quality = q;
    }

    setActive(on) {
        this.active = !!on && !!this.gl;
        this.canvas.style.display = this.active ? '' : 'none';
        // The 2D canvas stays in the DOM for input and as the texture source;
        // it is only made transparent while the shader output covers it.
        this.source.classList.toggle('fx-source', this.active);
    }

    /** Run the pipeline on whatever the 2D canvas currently holds. */
    present(dt = 1 / 60) {
        const gl = this.gl;
        if (!this.active || !gl) return;
        this.time += dt;
        this.punchAmount *= Math.exp(-dt * 9);
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.age += dt;
            if (r.age > 1.1) this.ripples.splice(i, 1);
        }

        const W = this.source.width, H = this.source.height;
        if (W !== this.width || H !== this.height) this._resize(W, H);

        gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        const [qA, qB, eA, eB] = this.targets;
        const bloomOn = this.quality < 2;
        if (bloomOn) {
            this._pass(this.progBright, qA, { uTex: this.sceneTex }, { uTexel: [1 / W, 1 / H], uThreshold: 0.52 });
            this._blur(qA, qB);
            if (this.quality === 0) {
                this._pass(this.progCopy, eA, { uTex: qA.tex }, {});
                this._blur(eA, eB);
            }
        }

        const rip = this._rippleUniforms();
        this._pass(this.progComposite, null, {
            uScene: this.sceneTex,
            uBloomA: qA.tex,
            uBloomB: eA.tex,
            uDirt: this.dirtTex,
        }, {
            uRes: [W, H],
            uTime: this.time,
            uBloom: bloomOn ? 1.0 : 0.0,
            uBloomWide: this.quality === 0 ? 1.0 : 0.0,
            uPunch: this.punchAmount,
            uRip: rip,
            uTint: this.grade.tint,
            uShadow: this.grade.shadow,
            uHighlight: this.grade.highlight,
            uSat: this.grade.sat,
            uContrast: this.grade.contrast,
            uDetail: this.quality === 0 ? 1.0 : 0.5,
        });
    }

    // ── Pipeline internals ──────────────────────────────────────────────────

    _rippleUniforms() {
        const out = this._rip || (this._rip = new Float32Array(24));
        out.fill(0);
        for (let i = 0; i < this.ripples.length; i++) {
            const r = this.ripples[i];
            out[i * 4] = r.x; out[i * 4 + 1] = r.y; out[i * 4 + 2] = r.age; out[i * 4 + 3] = r.strength;
        }
        return out;
    }

    _blur(a, b) {
        this._pass(this.progBlur, b, { uTex: a.tex }, { uDir: [1 / a.w, 0] });
        this._pass(this.progBlur, a, { uTex: b.tex }, { uDir: [0, 1 / a.h] });
    }

    _resize(W, H) {
        const gl = this.gl;
        this.width = W; this.height = H;
        this.canvas.width = W; this.canvas.height = H;
        this.canvas.style.width = this.source.style.width || '100%';
        this.canvas.style.height = this.source.style.height || '100%';
        for (const t of this.targets) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
        const q = (d) => this._target(Math.max(1, Math.round(W / d)), Math.max(1, Math.round(H / d)));
        this.targets = [q(4), q(4), q(8), q(8)];
    }

    _texture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    _target(w, h) {
        const gl = this.gl;
        const tex = this._texture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fb, w, h };
    }

    _pass(prog, target, textures, uniforms) {
        const gl = this.gl;
        gl.useProgram(prog.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
        gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height);
        let unit = 0;
        for (const name in textures) {
            const loc = prog.u[name];
            if (loc == null) continue;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, textures[name]);
            gl.uniform1i(loc, unit++);
        }
        for (const name in uniforms) {
            const loc = prog.u[name];
            if (loc == null) continue;
            const v = uniforms[name];
            if (typeof v === 'number') gl.uniform1f(loc, v);
            else if (v.length === 2) gl.uniform2fv(loc, v);
            else if (v.length === 3) gl.uniform3fv(loc, v);
            else gl.uniform4fv(loc, v);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _buildQuad() {
        const gl = this.gl;
        this.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        // One oversized triangle covers the viewport.
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }

    _compile(fsSource) {
        const gl = this.gl;
        const vs = `
            attribute vec2 aPos;
            varying vec2 vUv;
            void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, 'precision mediump float;\nvarying vec2 vUv;\n' + fsSource));
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const info = gl.getActiveUniform(p, i);
            const name = info.name.replace(/\[0\]$/, '');
            u[name] = gl.getUniformLocation(p, info.name);
        }
        return { p, u };
    }

    _buildPrograms() {
        this.progCopy = this._compile(`
            uniform sampler2D uTex;
            void main() { gl_FragColor = texture2D(uTex, vUv); }`);

        // 4-tap box downsample + soft-knee threshold: only bright neon blooms.
        this.progBright = this._compile(`
            uniform sampler2D uTex;
            uniform vec2 uTexel;
            uniform float uThreshold;
            void main() {
                vec2 o = uTexel * 1.5;
                vec3 c = texture2D(uTex, vUv + vec2(-o.x, -o.y)).rgb
                       + texture2D(uTex, vUv + vec2( o.x, -o.y)).rgb
                       + texture2D(uTex, vUv + vec2(-o.x,  o.y)).rgb
                       + texture2D(uTex, vUv + vec2( o.x,  o.y)).rgb;
                c *= 0.25;
                float l = max(c.r, max(c.g, c.b));
                float k = smoothstep(uThreshold, uThreshold + 0.38, l);
                gl_FragColor = vec4(c * k, 1.0);
            }`);

        // 9-tap Gaussian using linear filtering (5 fetches).
        this.progBlur = this._compile(`
            uniform sampler2D uTex;
            uniform vec2 uDir;
            void main() {
                vec3 c = texture2D(uTex, vUv).rgb * 0.2270270270;
                c += texture2D(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
                c += texture2D(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
                c += texture2D(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
                c += texture2D(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
                gl_FragColor = vec4(c, 1.0);
            }`);

        this.progComposite = this._compile(`
            uniform sampler2D uScene, uBloomA, uBloomB, uDirt;
            uniform vec2 uRes;
            uniform float uTime, uBloom, uBloomWide, uPunch, uDetail;
            uniform vec4 uRip[6];
            uniform vec3 uTint, uShadow, uHighlight;
            uniform float uSat, uContrast;

            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

            void main() {
                vec2 uv = vUv;
                vec2 aspect = vec2(uRes.x / uRes.y, 1.0);

                // Impact shockwaves: a travelling ring that refracts the scene.
                vec2 off = vec2(0.0);
                float ringGlow = 0.0;
                for (int i = 0; i < 6; i++) {
                    vec4 r = uRip[i];
                    if (r.w > 0.0) {
                        vec2 d = (uv - r.xy) * aspect;
                        float dist = length(d) + 1e-4;
                        float radius = r.z * 0.85;
                        float band = exp(-pow((dist - radius) * 24.0, 2.0));
                        float fade = r.w * exp(-r.z * 3.2);
                        off += (d / dist) / aspect * band * fade * 0.014;
                        ringGlow += band * fade;
                    }
                }
                uv += off;

                // Chromatic aberration: subtle at the edges, kicked by impacts.
                vec2 cc = uv - 0.5;
                vec2 ca = cc * (0.002 * uDetail + uPunch * 0.007) + off * 0.5;
                vec3 col;
                col.r = texture2D(uScene, uv + ca).r;
                col.g = texture2D(uScene, uv).g;
                col.b = texture2D(uScene, uv - ca).b;

                // Bloom, with a lens-dirt texture catching the brightest glow.
                vec3 bloom = texture2D(uBloomA, uv).rgb * 0.9 + texture2D(uBloomB, uv).rgb * 1.25 * uBloomWide;
                vec3 dirt = texture2D(uDirt, vUv).rgb;
                col += uBloom * (bloom * 0.475 + bloom * dirt * 0.8);
                col += ringGlow * 0.08 * vec3(0.6, 0.9, 1.0);

                // Grade (per mode): saturation, contrast, split-tone (shadows
                // and highlights pushed towards different hues), overall tint.
                float lum = dot(col, vec3(0.299, 0.587, 0.114));
                col = mix(vec3(lum), col, uSat);
                col = (col - 0.5) * uContrast + 0.5;
                col += uShadow * (1.0 - smoothstep(0.0, 0.5, lum)) + uHighlight * smoothstep(0.45, 1.0, lum);
                col *= uTint;
                col += uPunch * 0.05;

                // Vignette.
                float v = smoothstep(1.25, 0.32, length(cc * vec2(aspect.x * 0.78, 1.0)));
                col *= mix(1.0, v, 0.55);

                // Fine scanlines and animated film grain give the image texture.
                col *= 1.0 - 0.035 * uDetail * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
                col += (hash(gl_FragCoord.xy + fract(uTime * 13.7) * 91.0) - 0.5) * 0.035 * uDetail;

                gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
            }`);
    }

    // Procedural lens-dirt texture: soft smudges and hexagonal bokeh. Only
    // visible where bloom lights it up, like real glass in front of a bright scene.
    _uploadDirt() {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 288;
        const g = c.getContext('2d');
        g.fillStyle = '#0a0a0a';
        g.fillRect(0, 0, c.width, c.height);
        let seed = 1337;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 70; i++) {
            const x = rnd() * c.width, y = rnd() * c.height, r = 6 + rnd() ** 2 * 60;
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            const a = 0.05 + rnd() * 0.16;
            grad.addColorStop(0, `rgba(255,255,255,${a})`);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grad;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        g.lineWidth = 1.2;
        for (let i = 0; i < 26; i++) {
            const x = rnd() * c.width, y = rnd() * c.height, r = 5 + rnd() * 16;
            g.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.08})`;
            g.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.1})`;
            g.beginPath();
            for (let k = 0; k < 6; k++) {
                const t = k / 6 * Math.PI * 2 + 0.3;
                g[k ? 'lineTo' : 'moveTo'](x + Math.cos(t) * r, y + Math.sin(t) * r);
            }
            g.closePath(); g.fill(); g.stroke();
        }
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.dirtTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }
}

window.PostFX = PostFX;
