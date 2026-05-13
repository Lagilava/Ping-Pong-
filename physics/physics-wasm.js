/**
 * physics-wasm.js — WebAssembly Physics Bridge for Ping Pong
 *
 * How it works
 * ────────────
 * 1. Loads the Emscripten-generated physics.js (which instantiates physics.wasm).
 * 2. Allocates a shared Float32Array on the wasm heap — one 11-float "state slot"
 *    is reused every frame, so there are zero per-frame heap allocations.
 * 3. Patches Ball.prototype.integrate and Ball.prototype.reset to call wasm
 *    instead of the JS implementations, while keeping the same JS object shape
 *    (pos, vel, spin, prev, r, etc.) so nothing else in the game needs to change.
 * 4. Exposes window.WasmPhysics.predictBallY() for the AI controller.
 * 5. Falls back silently to the original JS methods if wasm fails to load.
 *
 * Add to ping_pong.html:
 *   <script src="physics/physics-wasm.js" defer></script>
 *   (place it AFTER the closing </script> block that defines class Ball)
 *
 * Ball state array layout mirrored in C++ (float[11]):
 *   [0] pos_x   [1] pos_y
 *   [2] vel_x   [3] vel_y
 *   [4] spin
 *   [5] prev_x  [6] prev_y
 *   [7] speed_cache
 *   [8] r       [9] maxSpeed  [10] minSpeed
 */

(function installWasmPhysics() {
    'use strict';

    const WASM_STATE_FLOATS = 11;   // number of floats in the state array
    const FLOAT_BYTES       = 4;
    const isFileProtocol    = window.location.protocol === 'file:';
    const bridgeScriptUrl   = document.currentScript?.src || new URL('physics-wasm.js', document.baseURI).href;
    const physicsBaseUrl    = new URL('.', bridgeScriptUrl);

    function physicsAssetUrl(path) {
        return new URL(path, physicsBaseUrl).href;
    }

    // ── Lazy init: wait until the page is ready ─────────────────────────────
    window.WasmPhysics = {
        ready: false,
        reason: null,
    };

    async function loadPhysicsModuleFactory() {
        try {
            const namespace = await import(physicsAssetUrl('physics.js'));
            const importedFactory = namespace?.default || namespace?.PhysicsModule;
            if (typeof importedFactory === 'function') {
                return importedFactory;
            }
        } catch (_) {
            // Fall through to classic-script loading below.
        }

        if (typeof window.PhysicsModule === 'function') {
            return window.PhysicsModule;
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = physicsAssetUrl('physics.js');
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
            document.head.appendChild(script);
        });

        if (typeof window.PhysicsModule !== 'function') {
            throw new TypeError('PhysicsModule factory not found after loading physics.js');
        }

        return window.PhysicsModule;
    }

    async function init() {
        if (isFileProtocol) {
            window.WasmPhysics.ready = false;
            window.WasmPhysics.reason = '[WasmPhysics] file:// detected; physics.wasm disabled. Serve over http:// for WASM acceleration.';
            console.info(window.WasmPhysics.reason);
            return;
        }

        let module;
        try {
            const PhysicsModuleFactory = await loadPhysicsModuleFactory();
            module = await PhysicsModuleFactory({
                locateFile(path) {
                    return physicsAssetUrl(path);
                },
            });
        } catch (err) {
            console.warn('[WasmPhysics] Failed to load physics.wasm — using JS fallback.', err);
            return;
        }

        // ── Wrap C functions ────────────────────────────────────────────────
        const _integrate = module.cwrap('ball_integrate', 'number', ['number', 'number', 'number']);
        const _collide   = module.cwrap('ball_paddle_collide', 'number',
                                        ['number','number','number','number','number','number','number','number','number','number']);
        let _gravityWellApply = null;
        try {
            _gravityWellApply = module.cwrap('gravity_well_apply', 'number',
                                        ['number','number','number','number','number','number','number']);
        } catch (_) {
            _gravityWellApply = null;
        }
        const hasGravityWellWasm = typeof _gravityWellApply === 'function';
        const _predict   = module.cwrap('predict_ball_y', 'number',
                                        ['number','number','number','number','number','number',
                                         'number','number','number','number','number']);
        const _reset     = module.cwrap('ball_reset', null,
                                        ['number','number','number','number',
                                         'number','number','number',
                                         'number','number','number']);
        let _updateFireTongues = null;
        try {
            _updateFireTongues = module.cwrap('update_fire_tongues', 'number', ['number', 'number', 'number']);
        } catch (_) {
            _updateFireTongues = null;
        }

        // ── Allocate a reusable state buffer on the wasm heap ───────────────
        const statePtr = module._malloc(WASM_STATE_FLOATS * FLOAT_BYTES);
        if (!statePtr) {
            console.error('[WasmPhysics] malloc failed — using JS fallback.');
            return;
        }
        const TONGUE_STRIDE = 12;
        let tonguePtr = 0;
        let tongueCapacityFloats = 0;
        // NOTE: Do NOT cache module.HEAPF32 — wasm memory can grow (ALLOW_MEMORY_GROWTH=1)
        // which replaces the underlying ArrayBuffer, detaching any previously captured view.
        // Always read module.HEAPF32 fresh on every access.

        // ── Helper: write JS Ball state → wasm heap ─────────────────────────
        function writeState(ball) {
            const heap = module.HEAPF32;          // fresh reference each call
            const base  = statePtr >> 2;           // byte offset → float32 index
            heap[base + 0]  = ball.pos.x;
            heap[base + 1]  = ball.pos.y;
            heap[base + 2]  = ball.vel.x;
            heap[base + 3]  = ball.vel.y;
            heap[base + 4]  = ball.spin;
            heap[base + 5]  = ball.prev.x;
            heap[base + 6]  = ball.prev.y;
            heap[base + 7]  = ball._speed;
            heap[base + 8]  = ball.r;
            heap[base + 9]  = ball.maxSpeed;
            heap[base + 10] = ball.minSpeed;
        }

        // ── Helper: read wasm heap → JS Ball state ──────────────────────────
        function readState(ball) {
            const heap = module.HEAPF32;          // fresh reference each call
            const base  = statePtr >> 2;
            ball.pos.x   = heap[base + 0];
            ball.pos.y   = heap[base + 1];
            ball.vel.x   = heap[base + 2];
            ball.vel.y   = heap[base + 3];
            ball.spin    = heap[base + 4];
            ball.prev.x  = heap[base + 5];
            ball.prev.y  = heap[base + 6];
            ball._speed  = heap[base + 7];
        }

        // ── Patch Ball instances at game start ──────────────────────────────
        //
        // Because Ball is defined inside a closed IIFE, we can't reach its
        // prototype directly.  Instead, we intercept window.game once it
        // exists and patch the ball INSTANCE's own methods (which take
        // precedence over prototype methods).
        //
        function patchBall(ball) {
            if (ball.__wasmPatched) return;
            ball.__wasmPatched = true;

            const originalIntegrate = ball.integrate.bind(ball);
            const originalReset     = ball.reset.bind(ball);

            /**
             * Wasm-backed integrate — drops in for Ball.prototype.integrate.
             * Keeps full parity: particles, trail, and special-mode trail are
             * still handled by the original JS method (non-physics work).
             *
             * Only the physics core (Magnus, air drag, wall bounce, speed clamp)
             * is offloaded to C++.
             */
            ball.integrate = function wasmIntegrate(dt) {
                // Strategy: run C++ physics first (captures correct prev, advances
                // pos/vel/spin).  Then let the original JS method run at full dt so
                // that particles, trail, speed-clamping display, and all mode-specific
                // visual effects update normally with correct timing.  Finally,
                // overwrite the physics state (pos/vel/spin/prev/_speed) with the
                // authoritative C++ result — the two integrations start from the same
                // snapshot so the difference is only float precision noise.

                // 1. Snapshot current (pre-integrate) state into wasm memory
                writeState(this);
                const canvasH = window.game?.height ?? 600;

                // 2. C++ physics step (modifies wasm memory; does NOT touch this.*)
                _integrate(statePtr, dt, canvasH);

                // 3. Full original JS integrate — updates particles, trail, etc.
                //    areParticleEffectsEnabled is in the game IIFE closure so it
                //    is always reachable from the bound originalIntegrate call.
                originalIntegrate.call(this, dt);

                // 4. Authoritative physics override from C++ result
                readState(this);
            };

            /**
             * Wasm-backed reset — reinitialises ball state via C++.
             */
            ball.reset = function wasmReset(center, speed) {
                const baseSpeed = speed ?? this.baseSpeed;
                const angle     = (Math.random() * Math.PI * 0.6) - Math.PI * 0.3;
                const dir       = Math.random() > 0.5 ? 1 : -1;
                const yMul      = (Math.random() * 0.4) - 0.2;

                this.trailCount  = 0;
                this.particles   = [];
                this.spin        = 0;
                this.lastHit     = null;

                const base = statePtr >> 2;
                _reset(statePtr,
                       center.x, center.y,
                       baseSpeed,
                       this.r, this.maxSpeed, this.minSpeed,
                       angle, dir, yMul);
                readState(this);
            };

            console.info('[WasmPhysics] Ball instance patched — physics running in WebAssembly.');
        }

        // ── Public API ──────────────────────────────────────────────────────

        /**
         * WasmPhysics.predictBallY(ball, targetX, maxSteps)
         *
         * Drop-in replacement for the JS-level prediction used in AIController.
         * Runs entirely in C++ — significantly faster for large maxSteps values.
         *
         * @param {Object} ball      The game's Ball instance
         * @param {number} targetX   The X-coordinate to predict arrival at
         * @param {number} maxSteps  Maximum simulation steps (default 200)
         * @returns {number}         Predicted Y position of the ball
         */
        function predictBallY(ball, targetX, maxSteps = 200) {
            return _predict(
                ball.pos.x, ball.pos.y,
                ball.vel.x, ball.vel.y,
                ball.spin,  ball.r,
                ball.maxSpeed, ball.minSpeed,
                window.game?.height ?? 600,
                targetX,
                maxSteps
            );
        }

        /**
         * WasmPhysics.resolvePaddleCollision(ball, paddle, isLeft)
         *
         * Tests and resolves a ball-paddle collision via C++.
         * Returns true if a collision occurred.
         *
         * @param {Object}  ball    The game's Ball instance
         * @param {Object}  paddle  A Paddle instance
         * @param {boolean} isLeft  true = player paddle, false = AI paddle
         * @returns {boolean}
         */
        function resolvePaddleCollision(ball, paddle, isLeft, speedIncrease = 1, maxAngle = Math.PI / 3.5, randomYOffset = 0) {
            writeState(ball);
            const hit = _collide(
                statePtr,
                paddle.pos.x, paddle.pos.y, paddle.w, paddle.h,
                paddle.vel.y,
                isLeft ? 1 : 0,
                speedIncrease,
                maxAngle,
                randomYOffset
            );
            if (hit) readState(ball);
            return !!hit;
        }

        function applyGravityWell(ball, wellX, wellY, pullRadiusSq, strength, dt, minDistanceSq) {
            if (!ball?.pos || !ball?.vel || pullRadiusSq <= 0 || dt <= 0) {
                return false;
            }

            if (!hasGravityWellWasm) {
                const dx = wellX - ball.pos.x;
                const dy = wellY - ball.pos.y;
                const distSq = dx * dx + dy * dy;

                if (distSq >= pullRadiusSq || distSq <= minDistanceSq) {
                    return false;
                }

                const invDist = 1 / Math.sqrt(distSq);
                const pullRatio = Math.max(0, 1 - (distSq / pullRadiusSq));
                const smooth = pullRatio * pullRatio;
                const forceCap = Math.max(420, Math.min(1600, strength * 0.06));
                const force = Math.min(strength * smooth, forceCap);
                const accel = force * dt;

                ball.vel.x += dx * invDist * accel;
                ball.vel.y += dy * invDist * accel;

                let speedSq = ball.vel.x * ball.vel.x + ball.vel.y * ball.vel.y;
                const maxSpeed = ball.maxSpeed || 1400;
                const maxSpeedSq = maxSpeed * maxSpeed;
                if (speedSq > maxSpeedSq && speedSq > 1e-10) {
                    const scale = maxSpeed / Math.sqrt(speedSq);
                    ball.vel.x *= scale;
                    ball.vel.y *= scale;
                    speedSq = maxSpeedSq;
                }

                ball._speed = Math.sqrt(speedSq);
                return true;
            }

            writeState(ball);
            const affected = _gravityWellApply(
                statePtr,
                wellX, wellY,
                pullRadiusSq,
                strength,
                dt,
                minDistanceSq
            );
            if (affected) readState(ball);
            return !!affected;
        }

        function updateFireTongues(tongues, count, dt) {
            if (!_updateFireTongues || !tongues || count <= 0) {
                return count > 0 ? count : 0;
            }

            const neededFloats = count * TONGUE_STRIDE;
            if (neededFloats > tongueCapacityFloats) {
                if (tonguePtr) module._free(tonguePtr);
                tonguePtr = module._malloc(neededFloats * FLOAT_BYTES);
                if (!tonguePtr) {
                    tongueCapacityFloats = 0;
                    return count;
                }
                tongueCapacityFloats = neededFloats;
            }

            const base = tonguePtr >> 2;
            module.HEAPF32.set(tongues.subarray(0, neededFloats), base);
            const alive = _updateFireTongues(tonguePtr, count, dt) | 0;
            const aliveFloats = Math.max(0, alive * TONGUE_STRIDE);
            if (aliveFloats > 0) {
                tongues.set(module.HEAPF32.subarray(base, base + aliveFloats), 0);
            }
            return alive;
        }

        // ── Poll for window.game to patch the ball instance ─────────────────
        const pollInterval = setInterval(() => {
            const ball = window.game?.ball;
            if (ball) {
                clearInterval(pollInterval);
                patchBall(ball);

                // Also patch balls array (multi-ball power-up)
                if (Array.isArray(window.game.balls)) {
                    window.game.balls.forEach(patchBall);
                }
            }
        }, 100);

        // Re-patch whenever the game resets and creates a new ball
        window.addEventListener('gameReset', () => {
            const ball = window.game?.ball;
            if (ball) patchBall(ball);
        });

        // ── Expose API globally ─────────────────────────────────────────────
        window.WasmPhysics = {
            ready:                   true,
            predictBallY,
            resolvePaddleCollision,
            applyGravityWell,
            updateFireTongues,
            features: {
                gravityWellWasm:     hasGravityWellWasm,
            },
            _module:                 module,  // raw Emscripten module (advanced use)
        };

        console.info('[WasmPhysics] Ready. physics.wasm loaded successfully.');
    }

    // Kick off — defer until after the game scripts are parsed
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
