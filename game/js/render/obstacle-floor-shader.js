/**
 * obstacle-floor-shader.js — GLSL floor for Obstacle mode.
 *
 * Replaces the canvas-drawn court floor (base gradient, court glow, grid,
 * node dots, sweep column, centre dashes, border and the gameplay visibility
 * pass) — three full-screen fills and ~85 path/fill calls per background
 * redraw — with one shader pass and one drawImage. Rails, obstacles and the
 * ball ring stay on canvas, drawn over the result.
 *
 * Two programs keep the per-frame cost low:
 *   - STATIC bakes everything that does not move (hex plating, grids, nodes,
 *     dashes, border, brackets, glows, side mask, centre lift, dither) into a
 *     texture. It reruns only when the size, grid or view changes (and so
 *     every frame only during the opening camera move).
 *   - LIVE runs each redraw: one texel fetch plus the animated terms (gliding
 *     sweep, comet pulses along the grid, ball light, rolling hex wave and
 *     a drifting interference field), mostly cheap ALU.
 *
 * Each BackgroundRenderer owns one instance (the Forge preview renderer gets
 * its own, so the two never fight over canvas size). If WebGL is missing,
 * software-only, or the context is lost, `ok` is false and the canvas floor
 * is drawn instead.
 */
class ObstacleFloorShader {
    constructor() {
        this.ok = false;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 2;
        this.canvas.height = 2;
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.ok = false;
        });
        this.canvas.addEventListener('webglcontextrestored', () => this._init());
        this._init();
    }

    _init() {
        this.ok = false;
        this.staticKey = '';
        const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
        let gl = null;
        let webgl2 = false;
        try {
            gl = this.canvas.getContext('webgl2', opts);
            webgl2 = !!gl;
            if (!gl) gl = this.canvas.getContext('webgl', opts);
        } catch (_) {
            gl = null;
        }
        if (!gl) return;
        this.gl = gl;

        // On a software rasteriser the shader runs on the CPU and costs more
        // than the canvas floor it replaces, so keep the canvas floor there.
        if (!ObstacleFloorShader.allowSoftware && ObstacleFloorShader.isSoftware(gl)) return;

        const vs = webgl2
            ? '#version 300 es\nin vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
            : 'attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
        const head = webgl2
            ? '#version 300 es\nprecision highp float;\nout vec4 fragColor;\n#define TEX texture\n'
            : 'precision highp float;\n#define fragColor gl_FragColor\n#define TEX texture2D\n';
        const common = head + ObstacleFloorShader.COMMON;

        this.progStatic = this._program(vs, common + ObstacleFloorShader.STATIC);
        this.progLive = this._program(vs, common + ObstacleFloorShader.LIVE);
        if (!this.progStatic || !this.progLive) return;

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const names = ['uRes', 'uView', 'uWorld', 'uGrid', 'uCells', 'uTime', 'uBall', 'uLook', 'uStatic'];
        const locs = (prog) => {
            const u = {};
            for (const n of names) u[n] = gl.getUniformLocation(prog, n);
            return u;
        };
        this.uStatic = locs(this.progStatic);
        this.uLive = locs(this.progLive);

        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.fbo = gl.createFramebuffer();
        this.texW = 0;
        this.texH = 0;

        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        this.ok = true;
    }

    static isSoftware(gl) {
        try {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
            return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
        } catch (_) {
            return false;
        }
    }

    _program(vsSrc, fsSrc) {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.warn('[ObstacleFloorShader]', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        };
        const v = compile(gl.VERTEX_SHADER, vsSrc);
        const f = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn('[ObstacleFloorShader]', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    _setUniforms(u, pw, ph, s) {
        const gl = this.gl;
        gl.uniform2f(u.uRes, pw, ph);
        gl.uniform4f(u.uView, s.view.x, s.view.y, s.view.w, s.view.h);
        gl.uniform2f(u.uWorld, s.width, s.height);
        gl.uniform4f(u.uGrid, s.grid.left, s.grid.top, s.grid.right, s.grid.bottom);
        gl.uniform4f(u.uCells, s.grid.cellW, s.grid.cellH, s.grid.cols, s.grid.rows);
        gl.uniform2f(u.uTime, s.time, s.phase);
        gl.uniform4f(u.uBall, s.ball.x, s.ball.y, s.ball.energy, s.ball.on);
        gl.uniform4f(u.uLook, s.centerLift, s.edgeDim, s.objectScale, 0);
    }

    /**
     * Renders the floor for the world rect `s.view` ({x, y, w, h} in CSS px)
     * at `pw` x `ph` pixels and returns the canvas, ready for drawImage in
     * the same task. Returns null when the shader is unavailable.
     */
    render(pw, ph, s) {
        if (!this.ok || this.gl.isContextLost()) return null;
        const gl = this.gl;
        pw = Math.max(1, pw | 0);
        ph = Math.max(1, ph | 0);
        if (this.canvas.width !== pw || this.canvas.height !== ph) {
            this.canvas.width = pw;
            this.canvas.height = ph;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        if (this.texW !== pw || this.texH !== ph) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            this.texW = pw;
            this.texH = ph;
            this.staticKey = '';
        }

        const g = s.grid, v = s.view;
        const key = `${pw}|${ph}|${v.x}|${v.y}|${v.w}|${v.h}|${s.width}|${s.height}|${g.left}|${g.top}|${g.right}|${g.bottom}|${g.cols}|${g.rows}|${s.objectScale}|${s.centerLift}|${s.edgeDim}`;
        gl.viewport(0, 0, pw, ph);
        if (key !== this.staticKey) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
            // Unbind the texture while it is the render target.
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.useProgram(this.progStatic);
            this._setUniforms(this.uStatic, pw, ph, s);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            this.staticKey = key;
        }

        gl.useProgram(this.progLive);
        this._setUniforms(this.uLive, pw, ph, s);
        gl.uniform1i(this.uLive.uStatic, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return this.canvas;
    }
}

ObstacleFloorShader.allowSoftware = false;

// All lengths are in world (CSS) px; uView maps the GL pixel grid onto the
// visible world rect, which also covers Obstacle mode's opening zoom.
ObstacleFloorShader.COMMON = `
uniform vec2 uRes;
uniform vec4 uView;   // x, y, w, h of the visible world rect
uniform vec2 uWorld;  // world width, height
uniform vec4 uGrid;   // left, top, right, bottom
uniform vec4 uCells;  // cellW, cellH, cols, rows
uniform vec2 uTime;   // seconds, course phase
uniform vec4 uBall;   // x, y, field energy, present
uniform vec4 uLook;   // centre lift, edge dim, object scale
uniform sampler2D uStatic;

const float HEX = 26.0;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Box-filtered coverage of a line of half width hw at distance d, for a
// pixel px world units wide: exact anti-aliasing for thin straight lines.
float lineCov(float d, float hw, float px) {
    return clamp(min(d + 0.5 * px, hw) - max(d - 0.5 * px, -hw), 0.0, px) / px;
}

// Distance from coordinate x to the nearest of n lines spaced s apart from o.
float gridDist(float x, float o, float s, float n) {
    float k = clamp(floor((x - o) / s + 0.5), 0.0, n - 1.0);
    return abs(x - (o + k * s));
}

// The visibility pass as a factor: final = base * keep + lift, where
// keep = (1 - side dim) * (1 - centre lift). The live layer's additions
// skip it: they sit inside the court, where it is close to neutral.
vec2 visibility(vec2 p) {
    float sx = p.x / uWorld.x;
    float edge = sx < 0.5 ? sx : 1.0 - sx;
    float dim = edge < 0.22 ? mix(uLook.y, 0.10, edge / 0.22) : mix(0.10, 0.0, clamp((edge - 0.22) / 0.20, 0.0, 1.0));
    float rd = length(p - vec2(uWorld.x * 0.5, uWorld.y * 0.52)) / (min(uWorld.x, uWorld.y) * 0.52);
    float lift = rd < 0.45 ? mix(uLook.x, uLook.x * 0.35, rd / 0.45) : mix(uLook.x * 0.35, 0.0, clamp((rd - 0.45) / 0.55, 0.0, 1.0));
    return vec2((1.0 - dim) * (1.0 - lift), lift);
}

vec2 worldPos(out float px) {
    vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    px = uView.z / uRes.x;
    return uView.xy + frag / uRes * uView.zw;
}
`;

// Static layer: RGB = finished floor colour, A = how much the rolling hex
// wave may light this pixel (hex cells picked to glow, and their edges),
// with the side dimming already applied.
ObstacleFloorShader.STATIC = `
void main() {
    float px;
    vec2 p = worldPos(px);
    float left = uGrid.x, top = uGrid.y, right = uGrid.z, bottom = uGrid.w;
    float cw = uCells.x, ch = uCells.y, cols = uCells.z, rows = uCells.w;

    // Base: the same navy ramp the canvas floor used (#061320 -> #071827 -> #030812).
    float v = clamp(p.y / uWorld.y, 0.0, 1.0);
    vec3 col = v < 0.52
        ? mix(vec3(0.024, 0.075, 0.125), vec3(0.027, 0.094, 0.153), v / 0.52)
        : mix(vec3(0.027, 0.094, 0.153), vec3(0.012, 0.031, 0.071), (v - 0.52) / 0.48);

    vec2 c = vec2(clamp(p.x, left, right), clamp(p.y, top, bottom));
    float outside = length(p - c);
    float inCourt = 1.0 - smoothstep(0.0, px, outside);

    // Outer plating: hex panels, each with its own tone. Fades in away from
    // the court edge.
    const vec2 hr = vec2(1.0, 1.7320508);
    vec2 hp = p / HEX;
    vec2 ha = mod(hp, hr) - hr * 0.5;
    vec2 hb = mod(hp - hr * 0.5, hr) - hr * 0.5;
    vec2 hg = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 hq = abs(hg);
    float he = max(dot(hq, vec2(0.5, 0.8660254)), hq.x);
    float hexLine = smoothstep(0.5 - 1.5 * px / HEX, 0.5, he);
    float cellRnd = hash12(floor((hp - hg) * 2.0 + 0.5));
    float plateFade = smoothstep(4.0, 90.0, outside);
    col += vec3(0.16, 0.50, 0.66) * hexLine * 0.075 * plateFade;
    col += vec3(0.02, 0.10, 0.14) * cellRnd * 0.25 * plateFade;
    float litMask = step(0.62, cellRnd) * plateFade * max(hexLine, 0.5 * (1.0 - smoothstep(0.25, 0.5, he)));

    // Court: cyan-blue-amber glow across, matching the two sides' colours.
    float u = clamp((p.x - left) / max(1.0, right - left), 0.0, 1.0);
    vec3 glowA = vec3(0.0, 1.0, 0.84) * 0.02;
    vec3 glowB = vec3(0.31, 0.82, 1.0) * 0.07;
    vec3 glowC = vec3(1.0, 0.82, 0.40) * 0.02;
    col += (u < 0.5 ? mix(glowA, glowB, u * 2.0) : mix(glowB, glowC, u * 2.0 - 1.0)) * inCourt;

    // Soft halo hugging the court edge from outside.
    col += vec3(0.0, 0.55, 0.65) * 0.05 * exp(-outside / 22.0) * (1.0 - inCourt);

    // Grid lines with a soft glow.
    float inSpan = step(left - 1.0, p.x) * step(p.x, right + 1.0) * step(top - 1.0, p.y) * step(p.y, bottom + 1.0);
    float dx = gridDist(p.x, left, cw, cols);
    float dy = gridDist(p.y, top, ch, rows);
    float gridA = max(lineCov(dx, 0.5, px), lineCov(dy, 0.5, px)) * inSpan;
    float gridHalo = (exp(-dx / 3.0) + exp(-dy / 3.0)) * 0.5 * inSpan;
    vec3 lineCol = vec3(0.455, 0.92, 1.0);
    col += lineCol * (gridA * 0.14 + gridHalo * 0.018);

    // Fine sub-grid (quarter cells) for a machined, technical floor.
    vec2 sub = abs(fract((p - vec2(left, top)) / vec2(cw, ch) * 4.0 + 0.5) - 0.5) * vec2(cw, ch) * 0.25;
    col += lineCol * max(lineCov(sub.x, 0.5, px), lineCov(sub.y, 0.5, px)) * 0.028 * inCourt;

    // Node dots at the intersections.
    float nd = length(vec2(dx, dy));
    col += vec3(0.70, 0.98, 1.0) * lineCov(nd, 1.15, px) * 0.22 * inSpan;
    col += vec3(0.30, 0.95, 1.0) * exp(-nd / 4.5) * 0.045 * inSpan;

    // Dashed centre line [10, 14] from the court's top to bottom.
    float mx = uWorld.x * 0.5;
    float inRows = step(top, p.y) * step(p.y, bottom);
    float dashOn = step(mod(p.y - top, 24.0), 10.0) * inRows;
    col += vec3(0.0, 1.0, 0.84) * (lineCov(abs(p.x - mx), 1.0, px) * dashOn * 0.34 + exp(-abs(p.x - mx) / 5.0) * 0.03 * inRows);

    // Court border, and corner brackets just outside it like a targeting frame.
    vec2 hs = vec2(right - left, bottom - top) * 0.5;
    vec2 bq = abs(p - vec2(left + right, top + bottom) * 0.5) - hs;
    col += vec3(1.0) * lineCov(abs(max(bq.x, bq.y)), 1.0, px) * 0.08;
    vec2 cq = bq - 7.0;
    const float arm = 26.0;
    float bracket = max(
        lineCov(abs(cq.x), 1.0, px) * step(-arm, cq.y) * step(cq.y, 1.0),
        lineCov(abs(cq.y), 1.0, px) * step(-arm, cq.x) * step(cq.x, 1.0));
    col += vec3(0.0, 1.0, 0.84) * bracket * 0.45;

    // Visibility pass, then dither so the dark ramps don't band.
    vec2 vis = visibility(p);
    col = col * vis.x + vis.y;
    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(col, litMask * vis.x);
}
`;

// Live layer: the static texel plus everything that moves.
ObstacleFloorShader.LIVE = `
void main() {
    float px;
    vec2 p = worldPos(px);
    vec4 base = TEX(uStatic, gl_FragCoord.xy / uRes);
    float t = uTime.x;
    float left = uGrid.x, top = uGrid.y, right = uGrid.z, bottom = uGrid.w;
    float cw = uCells.x, ch = uCells.y, cols = uCells.z, rows = uCells.w;
    float inCourt = step(left, p.x) * step(p.x, right) * step(top, p.y) * step(p.y, bottom);
    vec3 add = vec3(0.0);

    // Rolling wave that lights the chosen hex cells outside the court.
    if (base.a > 0.0) {
        float wave = sin(dot(p / HEX, vec2(0.21, 0.13)) - t * 0.9) * 0.5 + 0.5;
        add += vec3(0.05, 0.75, 0.78) * smoothstep(0.80, 1.0, wave) * base.a * 0.11;
    }

    if (inCourt > 0.0) {
        float u = (p.x - left) / max(1.0, right - left);

        // Slow interference field drifting over the court, tinted per side.
        float field = sin(p.x * 0.011 + t * 0.35) + sin(p.y * 0.016 - t * 0.27) + sin((p.x - p.y) * 0.0075 + t * 0.21);
        vec3 fieldCol = mix(vec3(0.0, 0.95, 0.85), vec3(1.0, 0.78, 0.35), smoothstep(0.35, 0.65, u));
        add += fieldCol * (field * field) * 0.0045;

        // Gliding scan band (the old sweep column, without the stepping).
        float sweepX = left + mod(uTime.y * 1.4 * cw, max(1.0, cols * cw)) - 0.5 * cw;
        float sx = (p.x - sweepX) / (cw * 0.42);
        add += vec3(0.0, 1.0, 0.84) * 0.045 * exp(-sx * sx);

        // Ball light: the floor and nearby grid brighten under the ball,
        // more with field energy.
        float ballGlow = 0.0;
        if (uBall.w > 0.5) {
            float reach = 150.0 * max(0.6, uLook.z * 1.4);
            ballGlow = exp(-length(p - uBall.xy) / reach) * (0.35 + 0.65 * clamp(uBall.z, 0.0, 1.0));
            add += vec3(0.30, 0.95, 1.0) * 0.06 * ballGlow;
        }

        // Comet pulses riding the grid lines; only pixels near a line pay.
        float dx = gridDist(p.x, left, cw, cols);
        float dy = gridDist(p.y, top, ch, rows);
        if (min(dx, dy) < 4.0) {
            float gx = lineCov(dx, 0.5, px);
            float gy = lineCov(dy, 0.5, px);
            float colIdx = floor((p.x - left) / cw + 0.5);
            float rowIdx = floor((p.y - top) / ch + 0.5);
            // Golden-ratio sequences give each line its own offset and an
            // on/off pick per pass, far cheaper than hashing per pixel.
            float rv = fract(p.y / (bottom - top) * 0.55 - t * 0.16 + fract(colIdx * 0.618034 + 0.31));
            float rh = fract(p.x / (right - left) * 0.55 - t * 0.11 + fract(rowIdx * 0.618034 + 0.77));
            rv *= rv; rv *= rv; rv *= rv; // ^8
            rh *= rh; rh *= rh; rh *= rh;
            float pv = rv * step(0.45, fract((colIdx + floor(t * 0.16 + 0.37) * 5.0) * 0.618034));
            float ph = rh * step(0.45, fract((rowIdx + floor(t * 0.11 + 0.71) * 3.0) * 0.618034 + 0.5));
            vec3 lineCol = vec3(0.455, 0.92, 1.0);
            add += vec3(0.25, 1.0, 0.88) * max(gx * pv, gy * ph) * 0.42;
            add += lineCol * (max(gx, gy) * 0.12 + (exp(-dx / 3.0) + exp(-dy / 3.0)) * 0.015) * ballGlow;
        }
    }

    fragColor = vec4(base.rgb + add, 1.0);
}
`;

if (typeof window !== 'undefined') window.ObstacleFloorShader = ObstacleFloorShader;
