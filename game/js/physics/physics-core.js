/**
 * physics-core.js — bridge to the C++ ball physics (physics/physics.cpp).
 *
 * The WebAssembly module is embedded as base64 (physics-binary.js) so it loads
 * instantly and also works from file://. If WebAssembly is unavailable, a JS
 * port of the same model runs instead so the game always plays the same way.
 *
 * window.PhysicsCore
 *   .backend                         'wasm' | 'js'
 *   .integrate(ball, dt, height)     -> event flags (EVT_*)
 *   .collidePaddle(ball, paddle, isLeft, speedIncrease, maxAngle, dt) -> 0 | 1 face | 2 edge
 *   .predictY(ball, targetX, maxSteps, height)
 *   .gravityWell(ball, wx, wy, pullRadiusSq, strength, dt, minDistSq) -> bool
 *   .reset(ball, cx, cy, speed, angle, dir)
 */
(function installPhysicsCore() {
    'use strict';

    const STRIDE = 16;
    const S = { PX: 0, PY: 1, VX: 2, VY: 3, SPIN: 4, PREVX: 5, PREVY: 6, SPEED: 7, R: 8, MAX: 9, MIN: 10, EVENT: 11, IMPACT: 12 };
    const EVT = { WALL_TOP: 1, WALL_BOTTOM: 2, PADDLE: 4, PADDLE_EDGE: 8 };

    // ── Backend: WebAssembly ────────────────────────────────────────────────
    function createWasmBackend() {
        const b64 = window.PP_PHYSICS_WASM_B64;
        if (!b64 || typeof WebAssembly !== 'object') return null;
        try {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
            const ex = instance.exports;
            const ptr = ex.ball_slot(0);
            let view = new Float32Array(ex.memory.buffer, ptr, STRIDE);
            const state = () => {
                if (view.buffer !== ex.memory.buffer) view = new Float32Array(ex.memory.buffer, ptr, STRIDE);
                return view;
            };
            return {
                name: 'wasm',
                state,
                integrate: (dt, h) => ex.ball_integrate(ptr, dt, h),
                collide: (px, py, pw, ph, pvy, isLeft, inc, maxA, prevY) =>
                    ex.ball_paddle_collide(ptr, px, py, pw, ph, pvy, isLeft, inc, maxA, prevY),
                predict: (...a) => ex.predict_ball_y(...a),
                gravity: (wx, wy, r2, str, dt, min2) => ex.gravity_well_apply(ptr, wx, wy, r2, str, dt, min2),
                reset: (cx, cy, sp, r, mx, mn, ang, dir) => ex.ball_reset(ptr, cx, cy, sp, r, mx, mn, ang, dir),
            };
        } catch (err) {
            console.warn('[Physics] WebAssembly physics failed to load, using the JS port.', err);
            return null;
        }
    }

    // ── Backend: JS port of physics.cpp (kept in sync by hand) ──────────────
    function createJsBackend() {
        const MAGNUS = 0.030, SPIN_DECAY = 0.90, SPIN_MAX = 9.0, DRAG = 0.000045;
        const WALL_REST = 0.96, WALL_GRIP = 0.22, ENGLISH = 0.28, BRUSH = 0.0085, SPIN_CARRY = -0.35;
        const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
        const buf = new Float32Array(STRIDE);

        function clampSpeed(s) {
            let sp = Math.hypot(s[S.VX], s[S.VY]);
            if (sp > s[S.MAX] && sp > 1e-6) { const k = s[S.MAX] / sp; s[S.VX] *= k; s[S.VY] *= k; sp = s[S.MAX]; }
            else if (sp < s[S.MIN] && sp > 1e-3) { const k = s[S.MIN] / sp; s[S.VX] *= k; s[S.VY] *= k; sp = s[S.MIN]; }
            const minVx = sp * 0.28;
            if (Math.abs(s[S.VX]) < minVx && sp > 1) {
                const vy2 = sp * sp - minVx * minVx;
                s[S.VX] = (s[S.VX] < 0 ? -1 : 1) * minVx;
                s[S.VY] = (s[S.VY] < 0 ? -1 : 1) * Math.sqrt(Math.max(0, vy2));
            }
            s[S.SPEED] = sp;
        }
        function wallBounce(s, h) {
            const r = s[S.R];
            let evt = 0;
            if (s[S.PY] - r < 0 && s[S.VY] < 0) {
                s[S.PY] = r + (r - s[S.PY]); if (s[S.PY] > h - r) s[S.PY] = r; evt = EVT.WALL_TOP;
            } else if (s[S.PY] + r > h && s[S.VY] > 0) {
                s[S.PY] = (h - r) - (s[S.PY] + r - h); if (s[S.PY] < r) s[S.PY] = h - r; evt = EVT.WALL_BOTTOM;
            }
            if (!evt) return 0;
            const vyIn = Math.abs(s[S.VY]);
            s[S.VY] = (evt === EVT.WALL_TOP ? 1 : -1) * vyIn * WALL_REST;
            const dir = evt === EVT.WALL_TOP ? -1 : 1;
            s[S.VX] += s[S.SPIN] * r * 6 * dir * WALL_GRIP;
            s[S.SPIN] *= 0.55;
            s[S.IMPACT] = clamp(vyIn / (s[S.MAX] > 1 ? s[S.MAX] : 1400), 0, 1);
            return evt;
        }
        function stepOnce(s, dt, h) {
            let vx = s[S.VX], vy = s[S.VY];
            const sp = Math.hypot(vx, vy);
            if (sp > 1e-3 && Math.abs(s[S.SPIN]) > 1e-4) {
                const a = MAGNUS * s[S.SPIN] * sp * dt;
                const nx = vx / sp, ny = vy / sp;
                vx -= ny * a;
                vy += nx * a;
            }
            s[S.SPIN] *= Math.exp(-SPIN_DECAY * dt);
            const drag = 1 / (1 + DRAG * sp * dt);
            vx *= drag; vy *= drag;
            s[S.VX] = vx; s[S.VY] = vy;
            s[S.PX] += vx * dt; s[S.PY] += vy * dt;
            return wallBounce(s, h);
        }
        function integrate(s, dt, h) {
            s[S.PREVX] = s[S.PX]; s[S.PREVY] = s[S.PY]; s[S.IMPACT] = 0;
            if (!(dt > 0)) { s[S.EVENT] = 0; return 0; }
            const sp = Math.hypot(s[S.VX], s[S.VY]);
            const r = Math.max(1, s[S.R]);
            const n = Math.min(24, Math.floor(sp * dt / (r * 0.4)) + 1);
            let evt = 0;
            for (let i = 0; i < n; i++) evt |= stepOnce(s, dt / n, h);
            s[S.SPIN] = clamp(s[S.SPIN], -SPIN_MAX, SPIN_MAX);
            clampSpeed(s);
            s[S.EVENT] = evt;
            return evt;
        }
        function collide(s, px, py, pw, ph, pvy, isLeft, inc, maxA, prevY) {
            const r = s[S.R], x0 = s[S.PREVX], y0 = s[S.PREVY], x1 = s[S.PX], y1 = s[S.PY];
            if (isLeft ? s[S.VX] >= 0 : s[S.VX] <= 0) return 0;
            const face = isLeft ? px + pw + r : px - r;
            const back = isLeft ? px - r : px + pw + r;
            let t = -1;
            if (isLeft) {
                if (x0 >= face && x1 < face) t = (x0 - face) / (x0 - x1);
                else if (x1 < face && x1 > back) t = 1;
            } else {
                if (x0 <= face && x1 > face) t = (face - x0) / (x1 - x0);
                else if (x1 > face && x1 < back) t = 1;
            }
            if (t < 0) return 0;
            const hitY = y0 + (y1 - y0) * t;
            if (hitY < Math.min(py, prevY) - r || hitY > Math.max(py, prevY) + ph + r) return 0;
            const centre = prevY + (py - prevY) * t + ph * 0.5;
            const rel = clamp((hitY - centre) / (ph * 0.5 + r), -1, 1);
            const edge = Math.abs(rel) > 0.92;
            const speed = Math.hypot(s[S.VX], s[S.VY]);
            const newSpeed = Math.min(s[S.MAX], speed * (inc > 0 ? inc : 1));
            const ang = rel * (0.55 + 0.45 * Math.abs(rel)) * (maxA > 0 ? maxA : 0.9);
            const dirX = isLeft ? 1 : -1;
            const nvx = dirX * Math.cos(ang) * newSpeed;
            const nvy = Math.sin(ang) * newSpeed + pvy * ENGLISH;
            s[S.SPIN] = clamp(s[S.SPIN] * SPIN_CARRY + pvy * BRUSH * (isLeft ? 1 : -1), -SPIN_MAX, SPIN_MAX);
            s[S.VX] = nvx; s[S.VY] = nvy;
            const travel = Math.hypot(x1 - x0, y1 - y0) * (1 - t);
            const nsp = Math.hypot(nvx, nvy);
            s[S.PX] = face + (nsp > 1e-3 ? nvx / nsp * travel : 0) + dirX * 0.5;
            s[S.PY] = hitY + (nsp > 1e-3 ? nvy / nsp * travel : 0);
            clampSpeed(s);
            s[S.IMPACT] = clamp(speed / (s[S.MAX] > 1 ? s[S.MAX] : 1400), 0, 1);
            s[S.EVENT] = EVT.PADDLE | (edge ? EVT.PADDLE_EDGE : 0);
            return edge ? 2 : 1;
        }
        const scratch = new Float32Array(STRIDE);
        function predict(bx, by, vx, vy, spin, r, mx, mn, h, tx, steps) {
            const s = scratch; s.fill(0);
            s[S.PX] = bx; s[S.PY] = by; s[S.VX] = vx; s[S.VY] = vy; s[S.SPIN] = spin; s[S.R] = r; s[S.MAX] = mx; s[S.MIN] = mn;
            steps = Math.min(steps, 2400);
            for (let i = 0; i < steps; i++) {
                integrate(s, 1 / 120, h);
                if ((s[S.VX] > 0 && s[S.PX] >= tx) || (s[S.VX] < 0 && s[S.PX] <= tx)) {
                    const dx = s[S.PX] - s[S.PREVX];
                    const t = dx !== 0 ? (tx - s[S.PREVX]) / dx : 1;
                    return s[S.PREVY] + (s[S.PY] - s[S.PREVY]) * clamp(t, 0, 1);
                }
            }
            return s[S.PY];
        }
        function gravity(s, wx, wy, r2, strength, dt, min2) {
            if (r2 <= 0 || dt <= 0) return 0;
            const dx = wx - s[S.PX], dy = wy - s[S.PY], d2 = dx * dx + dy * dy;
            if (d2 >= r2 || d2 <= min2) return 0;
            const inv = 1 / Math.sqrt(d2);
            const smooth = Math.max(0, 1 - d2 / r2) ** 2;
            const a = Math.min(strength * smooth, Math.max(420, Math.min(1600, strength * 0.06))) * dt;
            s[S.VX] += dx * inv * a; s[S.VY] += dy * inv * a;
            s[S.SPIN] = clamp(s[S.SPIN] + (dx * s[S.VY] - dy * s[S.VX]) * inv * 0.00004 * smooth, -SPIN_MAX, SPIN_MAX);
            let sp2 = s[S.VX] * s[S.VX] + s[S.VY] * s[S.VY];
            const mx = s[S.MAX] > 0 ? s[S.MAX] : 1400;
            if (sp2 > mx * mx) { const k = mx / Math.sqrt(sp2); s[S.VX] *= k; s[S.VY] *= k; sp2 = mx * mx; }
            s[S.SPEED] = Math.sqrt(sp2);
            return 1;
        }
        function reset(s, cx, cy, sp, r, mx, mn, ang, dir) {
            s[S.PX] = s[S.PREVX] = cx; s[S.PY] = s[S.PREVY] = cy;
            s[S.VX] = Math.cos(ang) * sp * (dir < 0 ? -1 : 1); s[S.VY] = Math.sin(ang) * sp;
            s[S.SPIN] = 0; s[S.SPEED] = sp; s[S.R] = r; s[S.MAX] = mx; s[S.MIN] = mn; s[S.EVENT] = 0; s[S.IMPACT] = 0;
        }
        return {
            name: 'js',
            state: () => buf,
            integrate: (dt, h) => integrate(buf, dt, h),
            collide: (...a) => collide(buf, ...a),
            predict,
            gravity: (...a) => gravity(buf, ...a),
            reset: (...a) => reset(buf, ...a),
        };
    }

    const backend = createWasmBackend() || createJsBackend();

    // ── Ball <-> state slot marshalling ─────────────────────────────────────
    function load(ball) {
        const s = backend.state();
        s[S.PX] = ball.pos.x; s[S.PY] = ball.pos.y;
        s[S.VX] = ball.vel.x; s[S.VY] = ball.vel.y;
        s[S.SPIN] = ball.spin || 0;
        s[S.PREVX] = ball.prev.x; s[S.PREVY] = ball.prev.y;
        s[S.SPEED] = ball._speed || 0;
        s[S.R] = ball.r; s[S.MAX] = ball.maxSpeed; s[S.MIN] = ball.minSpeed;
        s[S.EVENT] = 0; s[S.IMPACT] = 0;
        return s;
    }
    function store(ball, s) {
        ball.pos.x = s[S.PX]; ball.pos.y = s[S.PY];
        ball.vel.x = s[S.VX]; ball.vel.y = s[S.VY];
        ball.spin = s[S.SPIN];
        ball.prev.x = s[S.PREVX]; ball.prev.y = s[S.PREVY];
        ball._speed = s[S.SPEED];
        ball.lastImpact = s[S.IMPACT];
    }

    const PhysicsCore = {
        backend: backend.name,
        EVT,

        integrate(ball, dt, height) {
            load(ball);
            const evt = backend.integrate(dt, height);
            store(ball, backend.state());
            return evt;
        },

        collidePaddle(ball, paddle, isLeft, speedIncrease, maxAngle, dt) {
            load(ball);
            const pvy = paddle.vel?.y || 0;
            const prevY = paddle.pos.y - pvy * (dt || 0);
            const hit = backend.collide(paddle.pos.x, paddle.pos.y, paddle.w, paddle.h, pvy,
                isLeft ? 1 : 0, speedIncrease, maxAngle, prevY);
            if (hit) store(ball, backend.state());
            return hit;
        },

        predictY(ball, targetX, maxSteps, height) {
            return backend.predict(ball.pos.x, ball.pos.y, ball.vel.x, ball.vel.y, ball.spin || 0,
                ball.r, ball.maxSpeed, ball.minSpeed, height, targetX, maxSteps | 0);
        },

        gravityWell(ball, wx, wy, pullRadiusSq, strength, dt, minDistSq) {
            load(ball);
            const hit = backend.gravity(wx, wy, pullRadiusSq, strength, dt, minDistSq);
            if (hit) store(ball, backend.state());
            return !!hit;
        },

        reset(ball, cx, cy, speed, angle, dir) {
            backend.reset(cx, cy, speed, ball.r, ball.maxSpeed, ball.minSpeed, angle, dir);
            store(ball, backend.state());
        },
    };

    window.PhysicsCore = PhysicsCore;
    console.info(`[Physics] Ball physics running on ${backend.name === 'wasm' ? 'C++ / WebAssembly' : 'JS fallback'}.`);
})();
