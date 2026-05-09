/* background-wasm.js — main-thread bridge for worker-backed background simulation */

(function installBackgroundWasmBridge() {
    'use strict';

    const isFileProtocol = window.location.protocol === 'file:';
    let worker = null;
    let ready = false;
    let disabledReason = null;
    let idCounter = 1;
    const pending = new Map();

    function ensureWorker() {
        if (disabledReason) {
            throw new Error(disabledReason);
        }
        if (worker) return worker;

        try {
            // Use a classic worker so we can reliably load UMD-style wasm glue.
            worker = new Worker('./physics/background-worker.js');
        } catch (error) {
            disabledReason = '[BackgroundWasm] Worker bridge unavailable; JS background renderer fallback active.';
            ready = false;
            throw error;
        }
        worker.onmessage = (event) => {
            const msg = event.data || {};
            const request = pending.get(msg.id);
            if (!request) return;
            pending.delete(msg.id);

            if (msg.type === 'error') {
                request.reject(new Error(msg.error || 'background worker error'));
                return;
            }

            request.resolve(msg);
        };
        worker.onerror = (error) => {
            console.warn('[BackgroundWasm] Worker error, disabling WASM background sim.', error);
            ready = false;
            disabledReason = '[BackgroundWasm] Worker runtime error; JS background renderer fallback active.';
        };

        ready = true;
        return worker;
    }

    function post(type, payload = {}, transfer = []) {
        ensureWorker();
        const id = idCounter++;

        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage({ id, type, ...payload }, transfer);
        });
    }

    const BackgroundWasmSim = {
        isReady() {
            return ready;
        },

        getStatus() {
            return {
                ready,
                disabledReason,
                protocol: window.location.protocol
            };
        },

        async initSpeedRain(buffer, count) {
            await post('initSpeedRain', { buffer, count }, [buffer]);
        },

        async stepSpeedRain({ dt, time, width, height, roadY, slant, speedMul }) {
            const msg = await post('stepSpeedRain', { dt, time, width, height, roadY, slant, speedMul });
            return {
                particles: new Float32Array(msg.buffer),
                splashes: new Float32Array(msg.splashBuffer),
                splashCount: msg.splashCount,
            };
        },

        async initGravityStars(buffer, count) {
            await post('initGravityStars', { buffer, count }, [buffer]);
        },

        async stepGravityStars(dt) {
            const msg = await post('stepGravityStars', { dt });
            return new Float32Array(msg.buffer);
        },

        async stepIntroCurves(time) {
            const msg = await post('stepIntroCurves', { time });
            return new Float32Array(msg.buffer);
        },
    };

    // Boot worker early to avoid first-frame hitch.
    if (isFileProtocol) {
        disabledReason = '[BackgroundWasm] file:// detected; worker-backed WASM disabled. Serve over http:// for WASM acceleration.';
        console.info(disabledReason);
    } else {
        try {
            ensureWorker();
        } catch (error) {
            console.warn('[BackgroundWasm] Failed to initialize worker bridge. JS background renderer fallback active.', error);
        }
    }

    window.BackgroundWasmSim = BackgroundWasmSim;
})();
