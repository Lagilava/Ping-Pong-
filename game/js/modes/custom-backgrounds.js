// Custom backgrounds for Custom matches and the Forge editor.
//
// Players can import an image, or paste code written by them or by an AI
// assistant (Claude, ChatGPT, Codex...). Two code formats are accepted, both
// described in the import dialog:
//   - Canvas 2D JavaScript: function draw(ctx, w, h, t, game) { ... }
//   - GLSL fragment shader, Shadertoy style: void mainImage(out vec4, in vec2)
//
// Pasted code never runs with the page's privileges. It runs in a Web Worker
// started inside a sandboxed iframe (allow-scripts only, so an opaque origin
// with no access to this page, its storage or cookies) whose Content
// Security Policy blocks all network access. The worker draws on an
// OffscreenCanvas and hands finished frames back as ImageBitmaps, which the
// game draws like any image. A watchdog drops code that stops answering.
(function () {
    'use strict';

    const STORE_KEY = 'pp-custom-backgrounds-v1';
    const MAX_ENTRIES = 12;
    const MAX_CODE = 64 * 1024;
    const IMAGE_MAX_W = 1920;
    const IMAGE_MAX_H = 1080;

    const BUILT_INS = [
        { id: 'classic', name: 'Classic', image: 'assets/images/customise-previews/classic.png?v=20261026-arena-motion-5' },
        { id: 'zombie', name: 'Zombie', image: 'assets/images/customise-previews/zombie.png?v=20261026-arena-motion-5' },
        { id: 'gravity', name: 'Gravity', image: 'assets/images/customise-previews/gravity.png?v=20261026-gravity-flow-4' },
        { id: 'speed', name: 'Speed', image: 'assets/images/customise-previews/speed.png?v=20261026-scene-depth-3' },
        { id: 'obstacle', name: 'Obstacle', image: 'assets/images/customise-previews/obstacle.png?v=20261026-scene-depth-3' },
    ];

    const EXAMPLE_CANVAS = `// Neon horizon: a Canvas 2D background for Ping Pong.
function draw(ctx, w, h, t, game) {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#07021a');
  sky.addColorStop(0.55, '#2a0a3d');
  sky.addColorStop(1, '#05010f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun that pulses when the ball is hit
  const pulse = Math.max(0, 1 - game.hit * 2);
  const sunR = h * (0.16 + pulse * 0.02);
  const sun = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.62);
  sun.addColorStop(0, '#ffd23f');
  sun.addColorStop(1, '#ff2d95');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.55, sunR, Math.PI, 0);
  ctx.fill();

  // Scrolling grid floor, faster when the ball is fast
  ctx.strokeStyle = 'rgba(0, 255, 214, 0.35)';
  ctx.lineWidth = 1;
  const horizon = h * 0.58;
  const scroll = (t * (0.3 + game.speed)) % 1;
  for (let i = 0; i < 14; i++) {
    const k = (i + scroll) / 14;
    const y = horizon + (h - horizon) * k * k;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * w * 0.02, horizon);
    ctx.lineTo(w / 2 + i * w * 0.16, h);
    ctx.stroke();
  }
}`;

    const EXAMPLE_SHADER = `// Aurora: a GLSL (Shadertoy-style) background for Ping Pong.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime * 0.25;
  float band = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.55 + 0.12 * sin(uv.x * (3.0 + fi) + t * (1.0 + fi * 0.3) + fi);
    band += 0.006 / abs(uv.y - y) * (0.6 + 0.4 * sin(t + fi));
  }
  vec3 col = vec3(0.01, 0.02, 0.06) + band * mix(vec3(0.0, 1.0, 0.8), vec3(0.7, 0.2, 1.0), uv.x);
  // Glow around the ball, brighter right after a hit
  float d = distance(uv * vec2(iResolution.x / iResolution.y, 1.0), iBall * vec2(iResolution.x / iResolution.y, 1.0));
  col += vec3(0.2, 0.6, 1.0) * 0.02 / (d + 0.08) * (0.3 + exp(-iHit * 4.0));
  fragColor = vec4(min(col, 1.0) * 0.55, 1.0);
}`;

    const AI_PROMPT = `Write a background for my Ping Pong game. Reply with one code block and nothing else.

Use ONE of these two formats:

FORMAT A - Canvas 2D JavaScript
Define: function draw(ctx, w, h, t, game) { ... }
- It is called every frame and must paint the whole w x h canvas (ctx is a CanvasRenderingContext2D on an OffscreenCanvas).
- t = seconds since start.
- game = { ballX, ballY (0..1 across the court, y down), speed (0..1), hit (seconds since the last paddle hit), goal (seconds since the last goal), scoreLeft, scoreRight }.
- Optional: function setup(ctx, w, h) { ... } runs once at start and again when the size changes.
- Plain JavaScript only: no DOM, no document/window, no images, no fetch, no imports.

FORMAT B - GLSL fragment shader (Shadertoy style)
Define: void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }
- Uniforms you can use: iResolution (vec3, pixels), iTime (float, seconds), iBall (vec2 0..1, y up), iSpeed (0..1), iHit and iGoal (seconds since last hit / goal), iScore (vec2 left, right), iMouse (vec4, the ball position in pixels).
- No textures or iChannel inputs. Do not declare the uniforms yourself.

Rules for both: keep it dark enough that a bright ball and neon paddles stay easy to see, avoid big flashing, and keep it smooth at 60 fps at 1920x1080.

The background I want: `;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const resolve = (p) => (typeof window.resolveAssetUrl === 'function' ? window.resolveAssetUrl(p) : p);

    // ── Library ────────────────────────────────────────────────────────
    // Parsed once and kept until the next save: a match looks its background
    // up every frame, and images make the stored JSON large.
    let libraryCache = null;
    // Backgrounds lent by an online host for one match. Never saved.
    const sessionEntries = new Map();
    const Library = {
        list() {
            if (libraryCache) return libraryCache.slice();
            try {
                const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
                libraryCache = Array.isArray(raw) ? raw.filter((e) => e && e.id && (e.kind === 'image' || e.kind === 'canvas' || e.kind === 'shader')) : [];
            } catch (_) { libraryCache = []; }
            return libraryCache.slice();
        },
        get(id) { return sessionEntries.get(id) || this.list().find((e) => e.id === id) || null; },
        save(list) {
            libraryCache = null;
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
                return true;
            } catch (_) { return false; }
        },
        add(entry) {
            const list = this.list();
            if (list.length >= MAX_ENTRIES) return { ok: false, reason: `You can keep ${MAX_ENTRIES} backgrounds. Delete one first.` };
            list.unshift(entry);
            if (!this.save(list)) return { ok: false, reason: 'Not enough browser storage left. Delete a background or use a smaller image.' };
            return { ok: true };
        },
        update(id, patch) {
            const list = this.list();
            const i = list.findIndex((e) => e.id === id);
            if (i < 0) return;
            list[i] = { ...list[i], ...patch };
            this.save(list);
        },
        remove(id) { this.save(this.list().filter((e) => e.id !== id)); },
    };

    const newId = () => 'bg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    function detectKind(code) {
        if (/\bvoid\s+mainImage\s*\(/.test(code)) return 'shader';
        if (/\bfunction\s+draw\s*\(|\bdraw\s*=\s*(\(|function)/.test(code)) return 'canvas';
        return null;
    }

    // Images are scaled to fit 1920x1080 and stored as JPEG (or PNG when
    // they have transparency, which is then flattened onto black anyway).
    function readImageFile(file) {
        return new Promise((resolveP, reject) => {
            if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose a PNG, JPG, WebP or GIF image.')); return; }
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const k = Math.min(1, IMAGE_MAX_W / img.naturalWidth, IMAGE_MAX_H / img.naturalHeight);
                const w = Math.max(1, Math.round(img.naturalWidth * k));
                const h = Math.max(1, Math.round(img.naturalHeight * k));
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h);
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                resolveP({ data: c.toDataURL('image/jpeg', 0.9), thumb: thumbFrom(c), w, h });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
            img.src = url;
        });
    }

    function thumbFrom(source) {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 180;
        drawCover(c.getContext('2d'), source, 320, 180);
        return c.toDataURL('image/jpeg', 0.8);
    }

    function drawCover(ctx, src, w, h) {
        const sw = src.naturalWidth || src.videoWidth || src.width;
        const sh = src.naturalHeight || src.videoHeight || src.height;
        if (!sw || !sh) return;
        const k = Math.max(w / sw, h / sh);
        const dw = sw * k, dh = sh * k;
        ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    // ── Sandboxed code host ────────────────────────────────────────────
    // The worker source. USER_SOURCE and KIND are filled in per run.
    const WORKER_SOURCE = String.raw`
'use strict';
let canvas = null, ctx = null, gl = null, prog = null, uni = null, user = null, W = 0, H = 0, started = 0;
const KIND = __KIND__;
const SRC = __SRC__;
function fail(where, err) {
    postMessage({ type: 'error', message: where + ': ' + (err && err.message ? err.message : String(err)) });
}
function compileCanvas() {
    let factory;
    try { factory = new Function('"use strict";\n' + SRC + '\n;return { draw: typeof draw === "function" ? draw : null, setup: typeof setup === "function" ? setup : null };'); }
    catch (e) { fail('Your code has a syntax error', e); return false; }
    try { user = factory(); } catch (e) { fail('Your code crashed while loading', e); return false; }
    if (!user.draw) { postMessage({ type: 'error', message: 'No draw function found. Define function draw(ctx, w, h, t, game) { ... }' }); return false; }
    ctx = canvas.getContext('2d');
    if (!ctx) { fail('Setup', 'Canvas 2D is not available'); return false; }
    return true;
}
function compileShader() {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) { postMessage({ type: 'error', message: 'This browser cannot run shader backgrounds (WebGL 2 in workers is missing). Try the Canvas 2D format.' }); return false; }
    const vs = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
    const fs = '#version 300 es\nprecision highp float;\nuniform vec3 iResolution;uniform float iTime;uniform vec2 iBall;uniform float iSpeed;uniform float iHit;uniform float iGoal;uniform vec2 iScore;uniform vec4 iMouse;uniform int iFrame;\nout vec4 ppOut;\n#line 1\n' + SRC + '\nvoid main(){vec4 c=vec4(0.0);mainImage(c,gl_FragCoord.xy);ppOut=vec4(c.rgb,1.0);}';
    const make = (type, text) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, text);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s) || 'compile failed'); }
        return s;
    };
    try {
        prog = gl.createProgram();
        gl.attachShader(prog, make(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    } catch (e) { fail('Shader error', e); return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uni = {};
    ['iResolution', 'iTime', 'iBall', 'iSpeed', 'iHit', 'iGoal', 'iScore', 'iMouse', 'iFrame'].forEach((n) => { uni[n] = gl.getUniformLocation(prog, n); });
    return true;
}
let frame = 0;
onmessage = (e) => {
    const m = e.data;
    if (m.type !== 'frame') return;
    const w = Math.max(1, m.w | 0), h = Math.max(1, m.h | 0);
    if (!canvas) {
        canvas = new OffscreenCanvas(w, h);
        W = w; H = h;
        started = m.t;
        if (!(KIND === 'shader' ? compileShader() : compileCanvas())) return;
        if (user && user.setup) { try { user.setup(ctx, W, H); } catch (err) { fail('setup() crashed', err); return; } }
    } else if (w !== W || h !== H) {
        canvas.width = W = w; canvas.height = H = h;
        if (user && user.setup) { try { user.setup(ctx, W, H); } catch (err) { fail('setup() crashed', err); return; } }
    }
    const t = m.t - started;
    const g = m.game;
    const t0 = performance.now();
    try {
        if (KIND === 'shader') {
            gl.viewport(0, 0, W, H);
            gl.uniform3f(uni.iResolution, W, H, 1);
            gl.uniform1f(uni.iTime, t);
            gl.uniform2f(uni.iBall, g.ballX, 1 - g.ballY);
            gl.uniform1f(uni.iSpeed, g.speed);
            gl.uniform1f(uni.iHit, g.hit);
            gl.uniform1f(uni.iGoal, g.goal);
            gl.uniform2f(uni.iScore, g.scoreLeft, g.scoreRight);
            gl.uniform4f(uni.iMouse, g.ballX * W, (1 - g.ballY) * H, 0, 0);
            gl.uniform1i(uni.iFrame, frame);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        } else {
            ctx.save();
            user.draw(ctx, W, H, t, g);
            ctx.restore();
        }
    } catch (err) { fail('draw() crashed', err); return; }
    frame++;
    const bitmap = canvas.transferToImageBitmap();
    postMessage({ type: 'frame', bitmap, ms: performance.now() - t0 }, [bitmap]);
};
`;

    const FRAME_SOURCE = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
</head><body><script>
let worker = null;
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'start') {
    if (worker) worker.terminate();
    try {
      const url = URL.createObjectURL(new Blob([m.source], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch (err) { parent.postMessage({ type: 'error', message: 'Could not start the sandbox: ' + err.message }, '*'); return; }
    worker.onmessage = (ev) => parent.postMessage(ev.data, '*', ev.data && ev.data.bitmap ? [ev.data.bitmap] : []);
    worker.onerror = (ev) => { ev.preventDefault(); parent.postMessage({ type: 'error', message: ev.message || 'Your code failed to load' }, '*'); };
    parent.postMessage({ type: 'ready' }, '*');
  } else if (worker) {
    worker.postMessage(m);
  }
});
parent.postMessage({ type: 'boot' }, '*');
<\/script></body></html>`;

    class CodeHost {
        constructor(entry) {
            this.entry = entry;
            this.bitmap = null;
            this.error = '';
            this.pending = false;
            this.pendingAt = 0;
            this.frameMs = 0;
            this.dead = false;
            this.listeners = new Set();
            this.iframe = document.createElement('iframe');
            this.iframe.setAttribute('sandbox', 'allow-scripts');
            this.iframe.setAttribute('aria-hidden', 'true');
            this.iframe.tabIndex = -1;
            this.iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none;';
            this.onMessage = this.onMessage.bind(this);
            window.addEventListener('message', this.onMessage);
            this.iframe.srcdoc = FRAME_SOURCE;
            document.body.appendChild(this.iframe);
            this.ready = false;
        }
        onMessage(e) {
            if (e.source !== this.iframe.contentWindow || this.dead) return;
            const m = e.data;
            if (!m || typeof m !== 'object') return;
            if (m.type === 'boot') {
                // Function replacements: pasted code may contain "$&" and similar.
                const source = WORKER_SOURCE.replace('__KIND__', () => JSON.stringify(this.entry.kind)).replace('__SRC__', () => JSON.stringify(this.entry.data));
                this.iframe.contentWindow.postMessage({ type: 'start', source }, '*');
            } else if (m.type === 'ready') {
                this.ready = true;
            } else if (m.type === 'frame' && m.bitmap) {
                if (this.bitmap) this.bitmap.close?.();
                this.bitmap = m.bitmap;
                this.frameMs = this.frameMs ? this.frameMs * 0.9 + m.ms * 0.1 : m.ms;
                this.pending = false;
                this.error = '';
                this.emit('frame');
            } else if (m.type === 'error') {
                this.error = String(m.message || 'Unknown error').slice(0, 400);
                this.pending = false;
                this.emit('error');
            }
        }
        on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
        emit(type) { this.listeners.forEach((fn) => { try { fn(type, this); } catch (_) { } }); }
        request(w, h, game) {
            if (this.dead || !this.ready || this.error) return;
            const now = performance.now();
            if (this.pending) {
                // Watchdog: code that stops answering is shut down.
                if (now - this.pendingAt > 2000) {
                    this.error = 'Your code stopped responding (it may have an endless loop), so it was stopped.';
                    this.destroyFrame();
                    this.emit('error');
                }
                return;
            }
            this.pending = true;
            this.pendingAt = now;
            this.iframe.contentWindow.postMessage({ type: 'frame', w, h, t: now / 1000, game }, '*');
        }
        destroyFrame() {
            this.dead = true;
            window.removeEventListener('message', this.onMessage);
            this.iframe.remove();
        }
        destroy() {
            this.destroyFrame();
            if (this.bitmap) this.bitmap.close?.();
            this.bitmap = null;
            this.listeners.clear();
        }
    }

    // ── Runtime state shared by match, editor and previews ─────────────
    const images = new Map();   // src -> HTMLImageElement
    let host = null;            // the single running CodeHost

    function getImage(src) {
        let img = images.get(src);
        if (!img) {
            img = new Image();
            img.decoding = 'async';
            img.onload = () => window.dispatchEvent(new Event('pp-background-image-loaded'));
            img.src = src;
            images.set(src, img);
        }
        return img.complete && img.naturalWidth ? img : null;
    }

    function getHost(entry) {
        if (host && host.entry.id === entry.id && host.entry.data === entry.data && !host.dead) return host;
        host?.destroy();
        host = new CodeHost(entry);
        return host;
    }

    function stopCode() {
        host?.destroy();
        host = null;
    }

    function gameState(game) {
        const W = game?.width || 1, H = game?.height || 1;
        const ball = game?.ball;
        const now = performance.now();
        const maxSpeed = ball?.maxSpeed || 1600;
        return {
            ballX: ball ? clamp(ball.pos.x / W, 0, 1) : 0.5 + Math.sin(now / 1400) * 0.3,
            ballY: ball ? clamp(ball.pos.y / H, 0, 1) : 0.5 + Math.cos(now / 1100) * 0.25,
            speed: ball && game?.running ? clamp(Math.hypot(ball.vel.x, ball.vel.y) / maxSpeed, 0, 1) : 0.35,
            hit: game?._lastHitAt ? (now - game._lastHitAt) / 1000 : (now / 1000) % 2,
            goal: game?._lastGoalAt ? (now - game._lastGoalAt) / 1000 : 99,
            scoreLeft: game?.scores?.player || 0,
            scoreRight: game?.scores?.ai || 0,
        };
    }

    // Resolve a Custom background mode value: a built-in id or "custom:<id>".
    function resolveSelection(mode) {
        if (typeof mode === 'string' && mode.startsWith('custom:')) {
            const entry = Library.get(mode.slice(7));
            if (entry) return { kind: entry.kind, entry };
        }
        const b = BUILT_INS.find((x) => x.id === mode) || BUILT_INS[0];
        return { kind: 'builtin', builtin: b };
    }

    // Built-in worlds in previews are drawn by a second BackgroundRenderer,
    // the same code that draws them in a match, so the Forge and the Custom
    // screen show exactly what will be played on (not a still picture). It
    // renders at the match's size, at most 30 times a second, and only while
    // a preview asks for frames.
    const builtinLive = { canvas: null, ctx: null, renderer: null, mode: '', last: 0 };

    function builtinFrame(mode) {
        if (typeof BackgroundRenderer !== 'function') return null;
        const game = window.game;
        // Bound the preview as a pair, preserving the match camera aspect.
        const gameW = game?.width || 1280, gameH = game?.height || 720;
        const scale = Math.min(1, 1280 / gameW, 720 / gameH);
        const W = Math.max(1, Math.round(gameW * scale));
        const H = Math.max(1, Math.round(gameH * scale));
        const live = builtinLive;
        try {
            if (!live.renderer) {
                live.canvas = document.createElement('canvas');
                live.ctx = live.canvas.getContext('2d', { alpha: false });
                live.canvas.width = W; live.canvas.height = H;
                live.renderer = new BackgroundRenderer(live.ctx, W, H);
                // The WASM particle sim is shared with the match renderer.
                live.renderer._bgSimEnabled = false;
                live.renderer._bgSim = null;
                live.mode = '';
            }
            const r = live.renderer;
            if (live.canvas.width !== W || live.canvas.height !== H) {
                live.canvas.width = W; live.canvas.height = H;
                r.resize(W, H);
                live.last = 0;
            }
            if (live.mode !== mode) {
                r.setMode(mode);
                live.mode = mode;
                live.last = 0;
            }
            const now = performance.now();
            if (!live.last || now - live.last >= 1000 / 30) {
                r.update(live.last ? Math.min(0.1, (now - live.last) / 1000) : 1 / 30);
                const c = live.ctx;
                c.save();
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.fillStyle = '#000';
                c.fillRect(0, 0, W, H);
                r._renderModeBackground(c, W, H);
                r.renderEnhancedLighting(c, W, H);
                // Speed's synthwave scenery owns its light; the old storm pass
                // belongs to the retired rainy-city background.
                c.restore();
                live.last = now;
            }
            return live.canvas;
        } catch (err) {
            console.warn('[CustomBackgrounds] live preview failed, using the picture', err);
            live.renderer = null;
            return null;
        }
    }

    // Draw the background for a selection into ctx at w x h. Returns a status
    // string: 'ok', 'loading' or the code's error message.
    function drawSelection(ctx, w, h, mode, opts = {}) {
        const sel = resolveSelection(mode);
        const filter = opts.filter || '';
        if (filter) { ctx.save(); ctx.filter = filter; }
        let status = 'ok';
        const liveBuiltin = sel.kind === 'builtin' && opts.preview ? builtinFrame(sel.builtin.id) : null;
        if (liveBuiltin) {
            drawCover(ctx, liveBuiltin, w, h);
        } else if (sel.kind === 'builtin' || sel.kind === 'image') {
            const img = getImage(sel.kind === 'image' ? sel.entry.data : resolve(sel.builtin.image));
            if (img) drawCover(ctx, img, w, h);
            else { ctx.fillStyle = '#06101f'; ctx.fillRect(0, 0, w, h); status = 'loading'; }
        } else if (opts.static) {
            const img = sel.entry.thumb ? getImage(sel.entry.thumb) : null;
            if (img) drawCover(ctx, img, w, h);
            else { ctx.fillStyle = '#06101f'; ctx.fillRect(0, 0, w, h); status = 'loading'; }
        } else {
            const h2 = getHost(sel.entry);
            h2.request(Math.round(opts.renderW || w), Math.round(opts.renderH || h), gameState(opts.game || window.game));
            if (h2.bitmap) ctx.drawImage(h2.bitmap, 0, 0, w, h);
            else { ctx.fillStyle = '#06101f'; ctx.fillRect(0, 0, w, h); }
            status = h2.error || (h2.bitmap ? 'ok' : 'loading');
        }
        if (filter) ctx.restore();
        return status;
    }

    // In a Custom match with an imported background, the game calls this
    // instead of drawing a built-in world. Returns true when it drew.
    function drawMatchBackground(ctx, w, h, game) {
        const mode = game?.customSettings?.backgroundMode;
        if (typeof mode !== 'string' || !mode.startsWith('custom:')) return false;
        const sel = resolveSelection(mode);
        if (sel.kind === 'builtin') return false;
        // Render code at the canvas's real pixel size so it stays sharp.
        const status = drawSelection(ctx, w, h, mode, {
            filter: game.getCustomBackgroundToneFilter?.() || '', game,
            renderW: ctx.canvas?.width || w, renderH: ctx.canvas?.height || h,
        });
        if (status !== 'ok' && status !== 'loading' && !game._ppBgErrorShown) {
            game._ppBgErrorShown = true;
            game.showNotification?.('Background stopped', 'Your code background hit an error', '#ff5c7a');
        }
        return true;
    }

    // ── Picker / import dialog ─────────────────────────────────────────
    let dialog = null;
    let previewRaf = 0;
    let onPick = null;
    let currentMode = 'classic';
    let codeTestHost = null;

    function buildDialog() {
        if (dialog) return dialog;
        dialog = document.createElement('div');
        dialog.className = 'ppbg';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ppbg-title');
        dialog.innerHTML = `
            <div class="ppbg-box">
                <header class="ppbg-head">
                    <div><div class="ppbg-kicker">Custom &amp; Forge</div><h2 id="ppbg-title">Backgrounds</h2></div>
                    <button type="button" class="ppbg-close" data-act="close" aria-label="Close">&times;</button>
                </header>
                <nav class="ppbg-tabs" role="tablist">
                    <button type="button" role="tab" data-tab="choose" aria-selected="true">Choose</button>
                    <button type="button" role="tab" data-tab="image" aria-selected="false">Import image</button>
                    <button type="button" role="tab" data-tab="code" aria-selected="false">Paste code</button>
                </nav>
                <div class="ppbg-body">
                    <section data-page="choose">
                        <div class="ppbg-grid" id="ppbgGrid"></div>
                    </section>
                    <section data-page="image" hidden>
                        <label class="ppbg-drop" id="ppbgDrop">
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="ppbgFile">
                            <strong>Drop an image here or click to choose</strong>
                            <span>PNG, JPG, WebP or GIF. Large images are scaled to 1920&times;1080. Wide (16:9) pictures fit the court best.</span>
                        </label>
                        <p class="ppbg-msg" id="ppbgImageMsg" role="status"></p>
                    </section>
                    <section data-page="code" hidden>
                        <div class="ppbg-code">
                            <div class="ppbg-code-left">
                                <label class="ppbg-field"><span>Name</span><input id="ppbgCodeName" maxlength="32" placeholder="My background"></label>
                                <label class="ppbg-field ppbg-grow"><span>Code</span>
                                    <textarea id="ppbgCode" spellcheck="false" placeholder="Paste a draw(ctx, w, h, t, game) function or a Shadertoy-style mainImage shader"></textarea>
                                </label>
                                <div class="ppbg-row">
                                    <button type="button" class="ppbg-btn" data-act="example-canvas">Canvas example</button>
                                    <button type="button" class="ppbg-btn" data-act="example-shader">Shader example</button>
                                    <span class="ppbg-spacer"></span>
                                    <button type="button" class="ppbg-btn" data-act="test">Run preview</button>
                                    <button type="button" class="ppbg-btn primary" data-act="save-code">Save background</button>
                                </div>
                                <p class="ppbg-msg" id="ppbgCodeMsg" role="status"></p>
                            </div>
                            <div class="ppbg-code-right">
                                <canvas id="ppbgCodePreview" width="480" height="270" aria-label="Code preview"></canvas>
                                <div class="ppbg-spec">
                                    <h3>What you can paste</h3>
                                    <p><b>Canvas 2D JavaScript.</b> A function <code>draw(ctx, w, h, t, game)</code> that paints the whole canvas every frame. <code>t</code> is seconds; <code>game</code> has <code>ballX</code>, <code>ballY</code> (0 to 1), <code>speed</code> (0 to 1), <code>hit</code> and <code>goal</code> (seconds since the last hit or goal), <code>scoreLeft</code>, <code>scoreRight</code>. Optional <code>setup(ctx, w, h)</code>.</p>
                                    <p><b>GLSL shader (Shadertoy style).</b> A function <code>void mainImage(out vec4 fragColor, in vec2 fragCoord)</code>. Uniforms: <code>iResolution</code>, <code>iTime</code>, <code>iBall</code>, <code>iSpeed</code>, <code>iHit</code>, <code>iGoal</code>, <code>iScore</code>, <code>iMouse</code> (the ball). No textures.</p>
                                    <p>No page access, images, network or imports: the code runs in a locked sandbox. Keep it dark so the ball stays easy to see.</p>
                                    <button type="button" class="ppbg-btn" data-act="copy-prompt">Copy a prompt for Claude, ChatGPT or Codex</button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) { closePicker(); return; }
            const tab = e.target.closest('[data-tab]');
            if (tab) { showTab(tab.dataset.tab); return; }
            const card = e.target.closest('[data-pick]');
            const del = e.target.closest('[data-del]');
            if (del) {
                e.stopPropagation();
                if (del.dataset.armed) {
                    Library.remove(del.dataset.del);
                    if (currentMode === 'custom:' + del.dataset.del) pick('classic');
                    renderGrid();
                } else {
                    del.dataset.armed = '1';
                    del.textContent = 'Delete?';
                    setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.innerHTML = '&times;'; } }, 2500);
                }
                return;
            }
            if (card) { pick(card.dataset.pick); return; }
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') closePicker();
            if (act === 'example-canvas') { codeArea().value = EXAMPLE_CANVAS; nameInput().value ||= 'Neon horizon'; testCode(); }
            if (act === 'example-shader') { codeArea().value = EXAMPLE_SHADER; nameInput().value ||= 'Aurora'; testCode(); }
            if (act === 'test') testCode();
            if (act === 'save-code') saveCode();
            if (act === 'copy-prompt') copyPrompt(e.target.closest('button'));
        });
        dialog.addEventListener('keydown', (e) => {
            if (e.target === codeArea() && e.key === 'Tab') {
                // Tab indents inside the code box.
                e.preventDefault();
                const ta = codeArea();
                const s = ta.selectionStart;
                ta.setRangeText('  ', s, ta.selectionEnd, 'end');
            }
            e.stopPropagation();
        });
        const file = dialog.querySelector('#ppbgFile');
        file.addEventListener('change', () => importFile(file.files?.[0]));
        const drop = dialog.querySelector('#ppbgDrop');
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); importFile(e.dataTransfer?.files?.[0]); });
        return dialog;
    }

    const codeArea = () => dialog.querySelector('#ppbgCode');
    const nameInput = () => dialog.querySelector('#ppbgCodeName');

    function showTab(id) {
        dialog.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
        dialog.querySelectorAll('[data-page]').forEach((p) => { p.hidden = p.dataset.page !== id; });
        if (id !== 'code') stopTest();
        if (id === 'choose') renderGrid();
    }

    function renderGrid() {
        const grid = dialog.querySelector('#ppbgGrid');
        const card = (value, name, thumb, badge, deletable) => `
            <button type="button" class="ppbg-card${value === currentMode ? ' sel' : ''}" data-pick="${esc(value)}" aria-pressed="${value === currentMode}">
                <span class="ppbg-thumb" style="background-image:url('${esc(thumb)}')"></span>
                <span class="ppbg-name">${esc(name)}</span>
                ${badge ? `<span class="ppbg-badge">${badge}</span>` : ''}
                ${deletable ? `<span class="ppbg-del" data-del="${esc(deletable)}" role="button" aria-label="Delete ${esc(name)}">&times;</span>` : ''}
            </button>`;
        const lib = Library.list();
        grid.innerHTML =
            `<h3 class="ppbg-group">Built-in worlds</h3>` +
            BUILT_INS.map((b) => card(b.id, b.name, resolve(b.image), '', '')).join('') +
            `<h3 class="ppbg-group">Your backgrounds</h3>` +
            (lib.length ? lib.map((e) => card('custom:' + e.id, e.name, e.thumb || '', e.kind === 'image' ? 'Image' : e.kind === 'shader' ? 'Shader' : 'Code', e.id)).join('')
                : `<p class="ppbg-empty">Nothing here yet. Use <b>Import image</b> or <b>Paste code</b> above.</p>`);
    }

    function pick(value) {
        currentMode = value;
        renderGrid();
        onPick?.(value);
    }

    async function importFile(file) {
        const msg = dialog.querySelector('#ppbgImageMsg');
        msg.className = 'ppbg-msg';
        msg.textContent = 'Reading image...';
        try {
            const out = await readImageFile(file);
            const name = (file.name || 'Image').replace(/\.[a-z0-9]+$/i, '').slice(0, 32) || 'Image';
            const entry = { id: newId(), kind: 'image', name, data: out.data, thumb: out.thumb };
            const res = Library.add(entry);
            if (!res.ok) throw new Error(res.reason);
            msg.className = 'ppbg-msg ok';
            msg.textContent = `Added "${name}" and selected it.`;
            pick('custom:' + entry.id);
            showTab('choose');
        } catch (err) {
            msg.className = 'ppbg-msg err';
            msg.textContent = err.message;
        }
    }

    function stopTest() {
        cancelAnimationFrame(previewRaf);
        previewRaf = 0;
        codeTestHost?.destroy();
        codeTestHost = null;
    }

    function validateCode() {
        const code = codeArea().value;
        if (!code.trim()) return { err: 'Paste some code first, or try one of the examples.' };
        if (code.length > MAX_CODE) return { err: 'That code is too long (64 KB max).' };
        const kind = detectKind(code);
        if (!kind) return { err: 'Could not find draw(ctx, w, h, t, game) or mainImage(...). See "What you can paste".' };
        return { code, kind };
    }

    // Runs the pasted code in its own sandbox and resolves once it has drawn
    // a frame (or failed), so Save only keeps code that works.
    function testCode() {
        const msg = dialog.querySelector('#ppbgCodeMsg');
        const v = validateCode();
        stopTest();
        if (v.err) { msg.className = 'ppbg-msg err'; msg.textContent = v.err; return Promise.resolve(false); }
        msg.className = 'ppbg-msg';
        msg.textContent = `Running ${v.kind === 'shader' ? 'shader' : 'Canvas 2D'} code...`;
        const canvas = dialog.querySelector('#ppbgCodePreview');
        const ctx = canvas.getContext('2d');
        codeTestHost = new CodeHost({ id: 'test', kind: v.kind, data: v.code });
        const myHost = codeTestHost;
        return new Promise((done) => {
            let settled = false;
            const settle = (ok) => { if (!settled) { settled = true; done(ok); } };
            myHost.on((type, h) => {
                if (type === 'error') { msg.className = 'ppbg-msg err'; msg.textContent = h.error; settle(false); }
                if (type === 'frame' && !settled) { msg.className = 'ppbg-msg ok'; msg.textContent = 'Looks good. It runs in the sandbox.'; settle(true); }
            });
            const loop = () => {
                if (myHost !== codeTestHost) return;
                myHost.request(canvas.width, canvas.height, gameState(null));
                if (myHost.bitmap) ctx.drawImage(myHost.bitmap, 0, 0, canvas.width, canvas.height);
                if (myHost.frameMs > 12 && settled) {
                    msg.className = 'ppbg-msg warn';
                    msg.textContent = `Runs, but it is heavy on this device (${myHost.frameMs.toFixed(0)} ms per preview frame). It may lower your frame rate in a match.`;
                }
                previewRaf = requestAnimationFrame(loop);
            };
            loop();
            setTimeout(() => settle(false), 4000);
        });
    }

    async function saveCode() {
        const msg = dialog.querySelector('#ppbgCodeMsg');
        const v = validateCode();
        if (v.err) { msg.className = 'ppbg-msg err'; msg.textContent = v.err; return; }
        const ok = await testCode();
        if (!ok) {
            if (!msg.classList.contains('err')) { msg.className = 'ppbg-msg err'; msg.textContent = 'The code did not draw a frame. Check it and try again.'; }
            return;
        }
        const canvas = dialog.querySelector('#ppbgCodePreview');
        const name = nameInput().value.trim().slice(0, 32) || (v.kind === 'shader' ? 'My shader' : 'My background');
        const entry = { id: newId(), kind: v.kind, name, data: v.code, thumb: thumbFrom(canvas) };
        const res = Library.add(entry);
        if (!res.ok) { msg.className = 'ppbg-msg err'; msg.textContent = res.reason; return; }
        msg.className = 'ppbg-msg ok';
        msg.textContent = `Saved "${name}" and selected it.`;
        stopTest();
        pick('custom:' + entry.id);
        showTab('choose');
    }

    async function copyPrompt(btn) {
        try {
            await navigator.clipboard.writeText(AI_PROMPT);
            btn.textContent = 'Prompt copied: add your idea at the end';
        } catch (_) {
            codeArea().value = AI_PROMPT;
            btn.textContent = 'Prompt placed in the code box: copy it from there';
        }
        setTimeout(() => { btn.textContent = 'Copy a prompt for Claude, ChatGPT or Codex'; }, 3500);
    }

    // Escape closes the dialog wherever focus is (the Forge editor and the
    // game also listen for Escape, so this runs first, in the capture phase).
    function onWindowKey(e) {
        if (e.key !== 'Escape' || !dialog?.classList.contains('open')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closePicker();
    }

    function openPicker(opts = {}) {
        buildDialog();
        window.addEventListener('keydown', onWindowKey, true);
        currentMode = opts.current || 'classic';
        onPick = opts.onPick || null;
        dialog.classList.add('open');
        showTab(opts.tab || 'choose');
        requestAnimationFrame(() => dialog.querySelector('[data-tab][aria-selected="true"]')?.focus());
    }

    function closePicker() {
        if (!dialog) return;
        window.removeEventListener('keydown', onWindowKey, true);
        stopTest();
        dialog.classList.remove('open');
        onPick = null;
    }

    // Built-in worlds plus the player's imported backgrounds, for <select>s.
    function optionsHtml(selected) {
        const lib = Library.list();
        const opt = (v, label) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`;
        return `<optgroup label="Built-in worlds">${BUILT_INS.map((b) => opt(b.id, b.name)).join('')}</optgroup>` +
            (lib.length ? `<optgroup label="Your backgrounds">${lib.map((e) => opt('custom:' + e.id, e.name)).join('')}</optgroup>` : '');
    }

    window.CustomBackgrounds = {
        Library, BUILT_INS, AI_PROMPT, EXAMPLE_CANVAS, EXAMPLE_SHADER,
        detectKind, resolveSelection, drawSelection, drawMatchBackground, stopCode,
        openPicker, closePicker, optionsHtml,
        // Online: the guest borrows the host's imported background for the match.
        setSessionEntry(entry) {
            if (!entry || !entry.id || !['image', 'canvas', 'shader'].includes(entry.kind) || typeof entry.data !== 'string') return false;
            sessionEntries.set(entry.id, { id: entry.id, kind: entry.kind, name: String(entry.name || 'Host background').slice(0, 40), data: entry.data, thumb: typeof entry.thumb === 'string' ? entry.thumb : '' });
            return true;
        },
        clearSessionEntries() { sessionEntries.clear(); },
        isImported: (mode) => typeof mode === 'string' && mode.startsWith('custom:') && !!Library.get(mode.slice(7)),
        nameOf: (mode) => { const s = resolveSelection(mode); return s.entry ? s.entry.name : s.builtin.name; },
    };

    // Custom screen: list imported backgrounds in the preset menu and add a
    // button that opens the picker.
    function enhanceCustomScreen() {
        const select = document.getElementById('customBackgroundMode');
        if (!select || select.dataset.ppBg) return;
        select.dataset.ppBg = '1';
        const current = window.game?.customSettings?.backgroundMode || select.value || 'classic';
        const valid = !current.startsWith('custom:') || Library.get(current.slice(7));
        select.innerHTML = optionsHtml(valid ? current : 'classic');
        const label = document.querySelector('label[for="customBackgroundMode"]');
        if (label) label.textContent = 'Background';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'customise-bg-import-btn';
        btn.textContent = 'Import image or code...';
        btn.addEventListener('click', () => {
            if (window.Forge?.UI?.openBackgroundPicker) window.Forge.UI.openBackgroundPicker();
        });
        select.insertAdjacentElement('afterend', btn);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceCustomScreen);
    else enhanceCustomScreen();
})();
