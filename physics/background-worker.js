/* background-worker.js — runs background simulation in a worker thread */

let modulePromise = null;
let module = null;
let api = null;

const state = {
    speedRain: null,
    gravityStars: null,
};

async function ensureModule() {
    if (!modulePromise) {
        modulePromise = Promise.resolve()
            .then(async () => {
                // Prefer classic worker loading path for UMD-style emscripten output.
                if (typeof importScripts === 'function') {
                    importScripts('./background-sim.js');
                    if (typeof self.BackgroundSimModule === 'function') {
                        return self.BackgroundSimModule;
                    }
                }

                const m = await import('./background-sim.js');
                if (typeof m.default === 'function') return m.default;
                if (typeof m.BackgroundSimModule === 'function') return m.BackgroundSimModule;
                if (typeof m === 'function') return m;
                throw new Error('BackgroundSimModule factory not found');
            })
            .then((factory) => factory())
            .then((mod) => {
                module = mod;
                api = {
                    updateSpeedRain: module.cwrap(
                        'update_speed_rain',
                        null,
                        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']
                    ),
                    updateGravityStars: module.cwrap(
                        'update_gravity_stars',
                        null,
                        ['number', 'number', 'number']
                    ),
                    updateIntroCurves: module.cwrap(
                        'update_intro_curves',
                        null,
                        ['number', 'number']
                    ),
                };
                return module;
            });
    }
    return modulePromise;
}

function allocFloatArray(floatCount) {
    const ptr = module._malloc(floatCount * 4);
    return { ptr, floatCount };
}

function writeFloatArray(ptr, data) {
    module.HEAPF32.set(data, ptr >> 2);
}

function readFloatArray(ptr, floatCount) {
    const start = ptr >> 2;
    return module.HEAPF32.slice(start, start + floatCount);
}

self.onmessage = async (event) => {
    const msg = event.data || {};
    const id = msg.id;

    try {
        await ensureModule();

        if (msg.type === 'initSpeedRain') {
            const data = new Float32Array(msg.buffer);
            if (state.speedRain) module._free(state.speedRain.ptr);
            state.speedRain = allocFloatArray(data.length);
            state.speedRain.count = msg.count;
            writeFloatArray(state.speedRain.ptr, data);

            self.postMessage({ id, type: 'ok' });
            return;
        }

        if (msg.type === 'stepSpeedRain') {
            if (!state.speedRain) {
                self.postMessage({ id, type: 'error', error: 'speed rain state not initialized' });
                return;
            }

            const splashCapacity = 32;
            const splashPtr = module._malloc(splashCapacity * 2 * 4);
            const splashCountPtr = module._malloc(4);

            api.updateSpeedRain(
                state.speedRain.ptr,
                state.speedRain.count,
                msg.dt,
                msg.time,
                msg.width,
                msg.height,
                msg.roadY,
                msg.slant,
                msg.speedMul,
                splashPtr,
                splashCountPtr,
                splashCapacity
            );

            const splashCount = module.HEAP32[splashCountPtr >> 2];
            const out = readFloatArray(state.speedRain.ptr, state.speedRain.floatCount);
            const splashes = readFloatArray(splashPtr, splashCount * 2);

            module._free(splashPtr);
            module._free(splashCountPtr);

            self.postMessage(
                {
                    id,
                    type: 'speedRainResult',
                    buffer: out.buffer,
                    splashBuffer: splashes.buffer,
                    splashCount,
                },
                [out.buffer, splashes.buffer]
            );
            return;
        }

        if (msg.type === 'initGravityStars') {
            const data = new Float32Array(msg.buffer);
            if (state.gravityStars) module._free(state.gravityStars.ptr);
            state.gravityStars = allocFloatArray(data.length);
            state.gravityStars.count = msg.count;
            writeFloatArray(state.gravityStars.ptr, data);

            self.postMessage({ id, type: 'ok' });
            return;
        }

        if (msg.type === 'stepGravityStars') {
            if (!state.gravityStars) {
                self.postMessage({ id, type: 'error', error: 'gravity star state not initialized' });
                return;
            }

            api.updateGravityStars(state.gravityStars.ptr, state.gravityStars.count, msg.dt);
            const out = readFloatArray(state.gravityStars.ptr, state.gravityStars.floatCount);
            self.postMessage({ id, type: 'gravityStarsResult', buffer: out.buffer }, [out.buffer]);
            return;
        }

        if (msg.type === 'stepIntroCurves') {
            const outPtr = module._malloc(3 * 4);
            api.updateIntroCurves(msg.time, outPtr);
            const out = readFloatArray(outPtr, 3);
            module._free(outPtr);
            self.postMessage({ id, type: 'introCurvesResult', buffer: out.buffer }, [out.buffer]);
            return;
        }

        self.postMessage({ id, type: 'error', error: `unknown message type: ${msg.type}` });
    } catch (error) {
        self.postMessage({ id, type: 'error', error: error?.message || String(error) });
    }
};
