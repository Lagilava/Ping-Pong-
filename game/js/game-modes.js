// PING PONG ULTIMATE v14.0 — STABILITY + UX OVERHAUL
// Fixes: speed threshold units, memory leaks, hit detection, game loop restoration,
//        replay triggering logic, frame interpolation, and UI polish.
(() => {
    'use strict';
    if (window.ppReplayV14) return;

    // ─── STATE ────────────────────────────────────────────────────────────────
    let game = null;
    let offscreen = null;
    let offscreenCtx = null;

    // Circular frame buffer (pre-allocated to avoid GC churn)
    // 6 s at 24 fps. Frames are stored downscaled (REPLAY_WIDTH) because each
    // one is a GPU bitmap: full-resolution frames would cost gigabytes of VRAM.
    // Phones keep a smaller, lower-rate buffer (less GPU memory and copy work).
    const IS_MOBILE = !!window.PerfGovernor?.isMobile;
    const BUFFER_SIZE = IS_MOBILE ? 100 : 144;
    const REPLAY_WIDTH = IS_MOBILE ? 420 : 640;
    const frameBuffer = new Array(BUFFER_SIZE).fill(null);
    const frameTimestamps = new Float64Array(BUFFER_SIZE);
    const frameMetaBuffer = new Array(BUFFER_SIZE).fill(null);
    let bufferHead = 0;       // write pointer (oldest frame)
    let bufferCount = 0;      // how many valid frames are in the buffer
    let bufferWriteIdx = 0;   // next slot to write into

    // Snapshot taken at trigger time (we copy from circular buffer into a flat array)
    let snapshotFrames = [];
    let snapshotTimestamps = [];
    let snapshotFrameMeta = [];
    let snapshotMarkers = [];

    let isReplaying = false;
    let isEndingReplay = false;
    let isReplayPending = false;
    let pendingReplayTimeout = null;
    let recordingActive = false;
    let lastRecordTimestamp = 0;

    // Playback state
    let replayIndex = 0;          // fractional frame index
    let replaySpeed = 1.0;
    let isPaused = false;
    let isScrubbingReplay = false;
    let replayRaf = null;
    let lastReplayTimestamp = 0;
    let replayPlaybackFPS = 30;
    let replayPlaybackStartTimestamp = 0;
    let replayEndHoldStart = 0;
    let hasRenderedReplayFrame = false;
    let replayTelemetryVisible = true;
    let replayLoopMode = false;
    let replaySessionId = 0;
    let activeReplaySessionId = 0;
    let replayPrevRunning = true;
    let replayCanvas = null;
    let replayCtx = null;
    let replayUI = null;

    // Rally tracking — driven by actual collision events, not proximity
    let rallyHits = 0;
    let maxBallSpeedPxPerSec = 0;  // pixels/second (consistent unit)
    let rallyStartTime = 0;
    let lastScoreTotal = 0;
    let consecutiveReplays = 0;
    let lastReplayTime = 0;
    let lastReplayEndTime = 0;
    let timelineMarkers = [];

    // Collision hook cleanup
    let collisionHookCleanup = null;
    let replayVelocityTickerActive = false;

    const CANVAS_HIDDEN_CLASS = 'pp-replay-live-hidden';

    // ─── CONFIG ───────────────────────────────────────────────────────────────
    const CFG = {
        record: {
            targetFPS: IS_MOBILE ? 18 : 24,
            // minReplayDuration is enforced in frames, not ms, for accuracy
        },
        playback: {
            normalSpeed: 1.0,
            slowMoSpeed: 0.4,
            minDurationMs: 2500,
            endHoldMs: 500,
            minFPS: 12,
            maxFPS: 60,
            trailFrames: 18,
            telemetryFadeMs: 7000,
        },
        trigger: {
            minRallyHits: 6,
            // FIX: threshold is now pixels/second, not pixels/frame.
            // A fast ball at 60fps might be 12 px/frame = 720 px/s.
            // A "fast" shot is realistically 400–900 px/s on a typical canvas.
            minBallSpeedPxPerSec: 1000, // floor; see getFastShotThreshold()
            minTimeSinceLastReplayMs: 25000,
            maxConsecutiveReplays: 2,
            minFramesForReplay: 72,    // ~3s at 24fps
        },
        timing: {
            replayDelay: 400,
            restartRecordingDelay: 500,
            introDurationMs: 1300,
            infoFadeDelayMs: 4000,
        },
    };

    // ─── CAPABILITY DETECTION ─────────────────────────────────────────────────
    const HAS_OFFSCREEN = typeof OffscreenCanvas !== 'undefined';
    const HAS_IMAGE_BITMAP = typeof ImageBitmap !== 'undefined';
    const SUPPORTS_TRANSFER_TO_BITMAP =
        HAS_OFFSCREEN &&
        HAS_IMAGE_BITMAP &&
        typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function';

    const isImageBitmap = f => HAS_IMAGE_BITMAP && f instanceof ImageBitmap;
    const isHTMLImage   = f => typeof HTMLImageElement !== 'undefined' && f instanceof HTMLImageElement;
    const isHTMLCanvas  = f => typeof HTMLCanvasElement !== 'undefined' && f instanceof HTMLCanvasElement;
    const canDraw = f => !!f && (isImageBitmap(f) || isHTMLImage(f) || isHTMLCanvas(f));

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const safeNumber = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
    const getScoreTotal = () => (game?.scores?.player ?? 0) + (game?.scores?.ai ?? 0);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));

    const getBallSpeedPxPerSec = () => {
        const vx = safeNumber(game?.ball?.vel?.x);
        const vy = safeNumber(game?.ball?.vel?.y);
        return Math.sqrt(vx * vx + vy * vy); // ball velocity is already px/s
    };

    const createFrameMeta = (timestamp) => {
        const ball = game?.ball;
        const canvas = game?.canvas;
        // Game-space size (CSS px): ball positions are in these units.
        const width = safeNumber(game?.width, safeNumber(canvas?.width, 800));
        const height = safeNumber(game?.height, safeNumber(canvas?.height, 600));
        return {
            t: timestamp,
            width,
            height,
            ball: ball?.pos ? {
                x: safeNumber(ball.pos.x, width / 2),
                y: safeNumber(ball.pos.y, height / 2),
                r: safeNumber(ball.r, 8),
                speed: getBallSpeedPxPerSec(),
            } : null,
            score: {
                player: safeNumber(game?.scores?.player),
                ai: safeNumber(game?.scores?.ai),
            },
            hits: rallyHits,
            peakSpeed: maxBallSpeedPxPerSec,
            mode: game?.gameMode || 'classic',
        };
    };

    const addTimelineMarker = (type, label, timestamp = performance.now(), extra = {}) => {
        timelineMarkers.push({
            type,
            label,
            timestamp,
            hits: rallyHits,
            speed: maxBallSpeedPxPerSec,
            ...extra,
        });
        if (timelineMarkers.length > 96) timelineMarkers.splice(0, timelineMarkers.length - 96);
    };

    // ─── FRAME CLEANUP ────────────────────────────────────────────────────────
    const releaseFrame = (frame) => {
        if (!frame) return;
        try {
            if (isImageBitmap(frame)) {
                frame.close();
            } else if (isHTMLImage(frame) && frame._objectUrl) {
                URL.revokeObjectURL(frame._objectUrl);
                frame._objectUrl = null;
            }
        } catch (e) { /* ignore */ }
    };

    // ─── CIRCULAR BUFFER ──────────────────────────────────────────────────────
    const bufferPush = (frame, timestamp, meta = null) => {
        // If slot already has a frame, release it before overwriting
        if (frameBuffer[bufferWriteIdx]) {
            releaseFrame(frameBuffer[bufferWriteIdx]);
        }
        frameBuffer[bufferWriteIdx] = frame;
        frameTimestamps[bufferWriteIdx] = timestamp;
        frameMetaBuffer[bufferWriteIdx] = meta;

        bufferWriteIdx = (bufferWriteIdx + 1) % BUFFER_SIZE;
        if (bufferCount < BUFFER_SIZE) {
            bufferCount++;
            bufferHead = 0; // buffer hasn't wrapped yet
        } else {
            // buffer is full; head advances with write pointer
            bufferHead = bufferWriteIdx;
        }
    };

    const bufferSnapshot = () => {
        // Copy all valid frames from the circular buffer into flat arrays
        snapshotFrames = [];
        snapshotTimestamps = [];
        snapshotFrameMeta = [];
        const count = bufferCount;
        for (let i = 0; i < count; i++) {
            const idx = (bufferHead + i) % BUFFER_SIZE;
            const frame = frameBuffer[idx];
            if (canDraw(frame)) {
                snapshotFrames.push(frame);
                snapshotTimestamps.push(frameTimestamps[idx]);
                snapshotFrameMeta.push(frameMetaBuffer[idx] || null);
            }
        }
        const start = snapshotTimestamps[0] || 0;
        const end = snapshotTimestamps[snapshotTimestamps.length - 1] || start;
        const span = Math.max(1, end - start);
        snapshotMarkers = timelineMarkers
            .filter(marker => marker.timestamp >= start && marker.timestamp <= end + 350)
            .map(marker => ({
                ...marker,
                pct: clamp(((marker.timestamp - start) / span) * 100, 0, 100),
            }));
    };

    const bufferClear = () => {
        for (let i = 0; i < BUFFER_SIZE; i++) {
            releaseFrame(frameBuffer[i]);
            frameBuffer[i] = null;
            frameTimestamps[i] = 0;
            frameMetaBuffer[i] = null;
        }
        bufferHead = 0;
        bufferCount = 0;
        bufferWriteIdx = 0;
    };

    const snapshotClear = () => {
        // Don't release snapshot frames — they're the same objects as the buffer.
        // The buffer clear handles release.
        snapshotFrames = [];
        snapshotTimestamps = [];
        snapshotFrameMeta = [];
        snapshotMarkers = [];
    };

    const cancelPendingReplay = () => {
        if (pendingReplayTimeout) {
            clearTimeout(pendingReplayTimeout);
            pendingReplayTimeout = null;
        }
        isReplayPending = false;
    };

    const stopReplayLoop = () => {
        if (replayRaf) {
            cancelAnimationFrame(replayRaf);
            replayRaf = null;
        }
        lastReplayTimestamp = 0;
    };

    const disposeReplaySurface = () => {
        if (replayCanvas) {
            try { replayCanvas.remove(); } catch (e) { /* ignore */ }
        }
        replayCanvas = null;
        replayCtx = null;
    };

    const syncReplayVisualState = () => {
        if (!replayUI) return;
        updateProgressUI(replayIndex);
    };

    // ─── MEASURED PLAYBACK FPS ────────────────────────────────────────────────
    const getMeasuredFPS = () => {
        const n = snapshotTimestamps.length;
        if (n < 2) return CFG.record.targetFPS;
        const span = snapshotTimestamps[n - 1] - snapshotTimestamps[0];
        if (!Number.isFinite(span) || span <= 0) return CFG.record.targetFPS;
        const measured = ((n - 1) * 1000) / span;
        return Math.max(CFG.playback.minFPS, Math.min(CFG.playback.maxFPS, measured));
    };

    const getPlaybackFPS = () => {
        const measured = getMeasuredFPS();
        const n = snapshotFrames.length;
        if (n < 2) return measured;
        // Don't play so fast that the replay is shorter than minDurationMs
        const maxByDuration = Math.max(CFG.playback.minFPS, ((n - 1) * 1000) / Math.max(500, CFG.playback.minDurationMs));
        return Math.max(CFG.playback.minFPS, Math.min(measured, maxByDuration));
    };

    // ─── SPEED CONVERSION (for display only) ─────────────────────────────────
    // FIX: operates on px/s not px/frame, so the result is meaningful regardless of FPS
    const pxPerSecToMPH = (pxPerSec, pxPerMeter = 25) => {
        return Number(((pxPerSec / pxPerMeter) * 2.23694).toFixed(1));
    };

    // ─── OFFSCREEN CANVAS INIT ────────────────────────────────────────────────
    const initOffscreen = () => {
        if (offscreen || !game?.canvas) return false;
        try {
            const w = Math.min(REPLAY_WIDTH, game.canvas.width);
            const h = Math.max(1, Math.round(w * game.canvas.height / Math.max(1, game.canvas.width)));
            offscreen = HAS_OFFSCREEN ? new OffscreenCanvas(w, h) : document.createElement('canvas');
            offscreen.width = w;
            offscreen.height = h;
            offscreenCtx = offscreen.getContext('2d', { alpha: false, willReadFrequently: false });
            return true;
        } catch (e) {
            console.warn('[Replay] Offscreen canvas init failed:', e);
            return false;
        }
    };

    // ─── FRAME CAPTURE ────────────────────────────────────────────────────────
    const captureOneFrame = async () => {
        if (!offscreen) return null;

        // Best path: zero-copy GPU transfer
        if (SUPPORTS_TRANSFER_TO_BITMAP) {
            return offscreen.transferToImageBitmap();
        }

        // Fallback: blob → HTMLImageElement
        const blobFn = offscreen.convertToBlob || offscreen.toBlob;
        if (typeof blobFn === 'function') {
            let blob;
            if (offscreen.convertToBlob) {
                blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
            } else {
                blob = await new Promise((res, rej) =>
                    offscreen.toBlob(b => b ? res(b) : rej(new Error('toBlob empty')), 'image/jpeg', 0.9)
                );
            }
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img._objectUrl = url;
            img.src = url;
            if (typeof img.decode === 'function') await img.decode();
            else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            return img;
        }

        // Last resort: data URL
        if (typeof offscreen.toDataURL === 'function') {
            const img = new Image();
            img.src = offscreen.toDataURL('image/jpeg', 0.9);
            if (typeof img.decode === 'function') await img.decode();
            return img;
        }

        return null;
    };

    // ─── RECORDING LOOP ───────────────────────────────────────────────────────
    const recordFrame = async (timestamp) => {
        if (!recordingActive) return;

        const interval = 1000 / CFG.record.targetFPS;
        if (timestamp - lastRecordTimestamp < interval) {
            requestAnimationFrame(recordFrame);
            return;
        }
        lastRecordTimestamp = timestamp;

        try {
            if (!game?.canvas || !offscreenCtx || isReplaying) {
                requestAnimationFrame(recordFrame);
                return;
            }
            offscreenCtx.drawImage(game.canvas, 0, 0, offscreen.width, offscreen.height);
            const meta = createFrameMeta(timestamp);
            const frame = await captureOneFrame();
            if (frame) bufferPush(frame, timestamp, meta);
        } catch (e) {
            console.warn('[Replay] Capture error:', e);
        }

        requestAnimationFrame(recordFrame);
    };

    const startRecording = () => {
        if (recordingActive || !game || isReplaying) return;
        if (!initOffscreen()) return;
        bufferClear();
        lastRecordTimestamp = 0;
        recordingActive = true;
        requestAnimationFrame(recordFrame);
    };

    const stopRecording = () => {
        recordingActive = false;
    };

    // ─── COLLISION / RALLY TRACKING ───────────────────────────────────────────
    // FIX: hook into the game's actual collision system instead of polling proximity.
    // We try three common patterns; fall back to proximity only if nothing else works.
    const installCollisionHook = () => {
        if (!game) return;

        if (typeof collisionHookCleanup === 'function') {
            try { collisionHookCleanup(); } catch (e) { /* ignore */ }
            collisionHookCleanup = null;
        }

        // Preferred: the game's own paddle-impact callback (fires once per real
        // paddle hit; obstacle and wall bounces don't count as rally hits).
        if (typeof game.onPaddleImpact === 'function') {
            const prev = game.onPaddleImpact;
            game.onPaddleImpact = function (...args) {
                recordHit();
                return prev.apply(this, args);
            };
            collisionHookCleanup = () => { if (game) game.onPaddleImpact = prev; };
            return;
        }

        // Pattern A: game emits events
        if (typeof game.on === 'function' || typeof game.addEventListener === 'function') {
            const addFn = (game.on || game.addEventListener).bind(game);
            const onHit = () => recordHit();
            addFn('hit', onHit);
            addFn('paddle_hit', onHit);
            addFn('collision', onHit);
            collisionHookCleanup = () => {
                const removeFn = (game.off || game.removeEventListener)?.bind(game);
                if (removeFn) {
                    removeFn('hit', onHit);
                    removeFn('paddle_hit', onHit);
                    removeFn('collision', onHit);
                }
            };
            return;
        }

        // Pattern B: game has an onHit / onCollision callback slot
        if ('onHit' in game || 'onCollision' in game || 'onPaddleHit' in game) {
            const key = 'onHit' in game ? 'onHit' : 'onCollision' in game ? 'onCollision' : 'onPaddleHit';
            const prev = game[key];
            game[key] = (...args) => {
                recordHit();
                if (typeof prev === 'function') prev.apply(game, args);
            };
            collisionHookCleanup = () => { game[key] = prev; };
            return;
        }

        // Pattern C: monkey-patch ball.vel setter to detect direction reversal (x sign flip)
        // This is the most universal approach and doesn't require any game API.
        if (game.ball?.vel && typeof game.ball.vel === 'object') {
            let lastVx = 0;
            replayVelocityTickerActive = true;
            const trackVelocity = () => {
                if (!replayVelocityTickerActive || !game?.ball?.vel) return;
                if (isReplaying) {
                    requestAnimationFrame(trackVelocity);
                    return;
                }
                const vx = game.ball.vel.x ?? 0;
                const vy = game.ball.vel.y ?? 0;
                const speed = Math.sqrt(vx * vx + vy * vy);

                // Ball velocity is already in px/s (dt-based integration).
                const pxPerSec = speed;
                if (pxPerSec > maxBallSpeedPxPerSec) maxBallSpeedPxPerSec = pxPerSec;

                // Hit detected when x-velocity reverses sign
                if (lastVx !== 0 && Math.sign(vx) !== Math.sign(lastVx)) {
                    recordHit();
                }
                lastVx = vx;
                requestAnimationFrame(trackVelocity);
            };
            requestAnimationFrame(trackVelocity);
            collisionHookCleanup = () => { replayVelocityTickerActive = false; };
            return;
        }

        // Ultimate fallback: no-op (rally count stays 0, speed-only trigger still works)
        console.warn('[Replay] Could not hook into collision system. Rally hit count will be 0.');
    };

    const recordHit = () => {
        if (isReplaying || !game || game.paused) return;
        if (!rallyStartTime) rallyStartTime = Date.now();
        // Also update speed here in case the event-based path is used
        if (game.ball?.vel) {
            const vx = game.ball.vel.x ?? 0;
            const vy = game.ball.vel.y ?? 0;
            const speed = Math.sqrt(vx * vx + vy * vy); // already px/s
            if (speed > maxBallSpeedPxPerSec) maxBallSpeedPxPerSec = speed;
        }
        rallyHits++;
        addTimelineMarker('hit', `Hit ${rallyHits}`, performance.now(), {
            speed: maxBallSpeedPxPerSec,
        });
    };

    const resetRallyTracking = () => {
        rallyHits = 0;
        maxBallSpeedPxPerSec = 0;
        rallyStartTime = Date.now();
        timelineMarkers = [];
    };

    // ─── TRIGGER LOGIC ────────────────────────────────────────────────────────
    const getFastShotThreshold = () => {
        const cap = Number(game?.ball?.maxSpeed);
        return Number.isFinite(cap) && cap > 0
            ? Math.max(CFG.trigger.minBallSpeedPxPerSec, cap * 0.82)
            : CFG.trigger.minBallSpeedPxPerSec;
    };

    const shouldTriggerReplay = () => {
        if (game?.gameMode === 'zombie') return false;
        if (isReplayPending || isReplaying || isEndingReplay) return false;
        if (consecutiveReplays >= CFG.trigger.maxConsecutiveReplays) return false;
        if (Date.now() - lastReplayTime < CFG.trigger.minTimeSinceLastReplayMs) return false;
        if (bufferCount < CFG.trigger.minFramesForReplay) return false;

        // "Fast" is relative to the ball's cap (it scales with screen size), so
        // an ordinary serve never qualifies on its own.
        const fastPx = getFastShotThreshold();
        const goodRally  = rallyHits >= CFG.trigger.minRallyHits;
        const fastShot   = rallyHits >= 2 && maxBallSpeedPxPerSec >= fastPx;
        const decentRally = rallyHits >= 4 && maxBallSpeedPxPerSec >= fastPx * 0.8;

        return goodRally || fastShot || decentRally;
    };

    // ─── GAME LOOP RESTORATION ────────────────────────────────────────────────
    // FIX: we record a "resume" function, not a "start" function, to avoid
    // accidentally reinitialising the game.
    let resumeGameLoop = null;

    const captureResumeHook = () => {
        if (!game) return;
        // Prefer a dedicated resume/unpause method
        if (typeof game.resume === 'function') {
            resumeGameLoop = () => game.resume();
        } else if (typeof game.unpause === 'function') {
            resumeGameLoop = () => game.unpause();
        } else if (typeof game.step === 'function') {
            // step-based loop: restart the RAF chain
            resumeGameLoop = () => { game.paused = false; requestAnimationFrame(() => game.step()); };
        } else if (typeof game.loop === 'function') {
            resumeGameLoop = () => { game.paused = false; game.running = true; game.loop(); };
        } else if (typeof game.start === 'function') {
            // Only use start() as a last resort and try to guard against re-init
            resumeGameLoop = () => {
                game.paused = false;
                game.running = true;
                // If start() checks game.running, it will re-enter the loop without re-init
                game.start();
            };
        } else {
            resumeGameLoop = () => {
                game.paused = false;
                game.running = true;
            };
        }
    };

    const pauseGameLoop = () => {
        if (!game) return;
        game.paused = true;
        game.running = false;
        if (typeof game.stop === 'function') {
            game.stop();
        } else if (typeof game.rafId === 'number') {
            cancelAnimationFrame(game.rafId);
            game.rafId = null;
        } else if (typeof game.animFrame === 'number') {
            cancelAnimationFrame(game.animFrame);
            game.animFrame = null;
        }
    };

    const setReplayFlags = (active) => {
        if (!game) return;
        game.replayActive = active;
        game.isReplay = active;
        document.body.classList.toggle('pp-replaying', !!active);
        if (game.replay) { game.replay.active = active; game.replay.isPlaying = active; }
    };

    const setLiveCanvasVisible = (visible) => {
        const c = game?.canvas;
        if (!c?.classList) return;
        c.classList.toggle(CANVAS_HIDDEN_CLASS, !visible);
        c.style.visibility = visible ? '' : 'hidden';
        // The shader output canvas is what's actually on screen.
        const fx = game?.postFx?.canvas;
        if (fx) fx.style.visibility = visible ? '' : 'hidden';
    };

    const ensureGameLoopRunning = () => {
        if (!game) return;
        game.paused = false;
        game.running = true;

        const hasRaf = typeof game.rafId === 'number' || typeof game.animFrame === 'number';
        if (hasRaf) return;

        if (typeof game.start === 'function') {
            game.start();
            return;
        }
        if (typeof game.step === 'function') {
            game.rafId = requestAnimationFrame(() => game.step());
            return;
        }
        if (typeof game.loop === 'function') {
            game.loop();
        }
    };

    // ─── SERVE NEW BALL ───────────────────────────────────────────────────────
    const serveNewBall = () => {
        if (!game) return;
        try {
            if (typeof game.serve === 'function') { game.serve(); return; }
            if (typeof game.resetBall === 'function') { game.resetBall(); return; }
            if (typeof game.newBall === 'function') { game.newBall(); return; }
            // Manual fallback
            const W = game.canvas?.width ?? 800;
            const H = game.canvas?.height ?? 600;
            const dirX = Math.random() > 0.5 ? 1 : -1;
            const speed = 7;
            if (game.ball?.pos?.set) game.ball.pos.set(W / 2, H / 2);
            if (game.ball?.vel?.set) game.ball.vel.set(speed * dirX, (Math.random() - 0.5) * 4);
        } catch (e) {
            console.warn('[Replay] serveNewBall failed:', e);
        }
    };

    // ─── REPLAY DRAW ──────────────────────────────────────────────────────────
    const getReplayMeta = (fracIndex) => {
        const total = snapshotFrameMeta.length;
        if (!total) return null;
        const idx = clamp(Math.floor(fracIndex), 0, total - 1);
        const nextIdx = clamp(idx + 1, 0, total - 1);
        const a = snapshotFrameMeta[idx];
        const b = snapshotFrameMeta[nextIdx];
        if (!a && !b) return null;
        if (!a) return b;
        if (!b || !a.ball || !b.ball) return a;
        const frac = clamp(fracIndex - idx, 0, 1);
        return {
            ...a,
            ball: {
                x: a.ball.x + (b.ball.x - a.ball.x) * frac,
                y: a.ball.y + (b.ball.y - a.ball.y) * frac,
                r: a.ball.r + (b.ball.r - a.ball.r) * frac,
                speed: a.ball.speed + (b.ball.speed - a.ball.speed) * frac,
            },
            hits: frac < 0.5 ? a.hits : b.hits,
            score: frac < 0.5 ? a.score : b.score,
            peakSpeed: Math.max(a.peakSpeed || 0, b.peakSpeed || 0),
        };
    };

    const scaleMetaPoint = (meta, point) => {
        const sx = replayCanvas.width / Math.max(1, meta.width || replayCanvas.width);
        const sy = replayCanvas.height / Math.max(1, meta.height || replayCanvas.height);
        return { x: point.x * sx, y: point.y * sy, r: point.r * Math.min(sx, sy) };
    };

    const drawPanelPath = (ctx, x, y, w, h, r) => {
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, w, h, r);
            return;
        }
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    };

    const drawReplayTacticalOverlay = (fracIndex) => {
        if (!replayTelemetryVisible || !replayCtx || !replayCanvas) return;
        const meta = getReplayMeta(fracIndex);
        if (!meta?.ball) return;

        const idx = clamp(Math.floor(fracIndex), 0, snapshotFrameMeta.length - 1);
        const trailStart = Math.max(0, idx - CFG.playback.trailFrames);
        replayCtx.save();
        replayCtx.lineCap = 'round';
        replayCtx.lineJoin = 'round';

        for (let i = trailStart; i <= idx; i++) {
            const m = snapshotFrameMeta[i];
            if (!m?.ball) continue;
            const p = scaleMetaPoint(m, m.ball);
            const age = (i - trailStart) / Math.max(1, idx - trailStart);
            const speedPct = clamp((m.ball.speed || 0) / Math.max(1, getFastShotThreshold() * 1.2), 0, 1);
            replayCtx.globalAlpha = 0.08 + age * 0.45;
            replayCtx.fillStyle = speedPct > 0.7 ? '#ffb347' : speedPct > 0.45 ? '#00eeff' : '#ffffff';
            replayCtx.beginPath();
            replayCtx.arc(p.x, p.y, Math.max(2, p.r * (0.45 + age * 0.35)), 0, Math.PI * 2);
            replayCtx.fill();
        }

        const ball = scaleMetaPoint(meta, meta.ball);
        replayCtx.globalAlpha = 1;
        replayCtx.strokeStyle = '#00eeff';
        replayCtx.lineWidth = 2;
        replayCtx.shadowColor = '#00eeff';
        replayCtx.shadowBlur = 14;
        replayCtx.beginPath();
        replayCtx.arc(ball.x, ball.y, Math.max(8, ball.r + 6), 0, Math.PI * 2);
        replayCtx.stroke();

        // Panel is laid out in CSS pixels: the replay canvas is upscaled to
        // the screen, so on phones canvas-pixel sizes would balloon.
        const cssW = replayCanvas.clientWidth || replayCanvas.width;
        const k = replayCanvas.width / Math.max(1, cssW);
        const compact = (replayCanvas.clientHeight || 999) < 520;
        if (compact) { replayCtx.restore(); return; }   // stats strip shows the same numbers
        replayCtx.setTransform(k, 0, 0, k, 0, 0);
        const panelX = 18;
        const panelY = 76;
        const panelW = 190;
        const panelH = 78;
        replayCtx.shadowBlur = 0;
        replayCtx.fillStyle = 'rgba(5, 10, 16, 0.68)';
        replayCtx.strokeStyle = 'rgba(0, 238, 255, 0.35)';
        replayCtx.lineWidth = 1;
        replayCtx.beginPath();
        drawPanelPath(replayCtx, panelX, panelY, panelW, panelH, 8);
        replayCtx.fill();
        replayCtx.stroke();

        replayCtx.fillStyle = 'rgba(255,255,255,0.62)';
        replayCtx.font = '600 11px "Barlow Condensed", sans-serif';
        replayCtx.fillText('SHOT TELEMETRY', panelX + 14, panelY + 20);
        replayCtx.fillStyle = '#ffffff';
        replayCtx.font = '900 24px "Barlow Condensed", sans-serif';
        replayCtx.fillText(`${pxPerSecToMPH(meta.ball.speed || 0)} MPH`, panelX + 14, panelY + 47);
        replayCtx.fillStyle = 'rgba(255,255,255,0.7)';
        replayCtx.font = '700 13px "Barlow Condensed", sans-serif';
        replayCtx.fillText(`${meta.hits || 0} hits  |  ${meta.score?.player ?? 0}-${meta.score?.ai ?? 0}`, panelX + 14, panelY + 66);

        replayCtx.restore();
    };

    const drawReplayFrame = (fracIndex) => {
        if (!replayCtx || !snapshotFrames.length) return false;
        const idx  = Math.max(0, Math.min(snapshotFrames.length - 1, Math.floor(fracIndex)));
        const frac = fracIndex - idx;
        let drew = false;

        try {
            replayCtx.clearRect(0, 0, replayCanvas.width, replayCanvas.height);
            replayCtx.imageSmoothingEnabled = true;
            replayCtx.imageSmoothingQuality = 'high';

            const frameA = snapshotFrames[idx];
            const frameB = snapshotFrames[Math.min(idx + 1, snapshotFrames.length - 1)];

            if (frac > 0 && canDraw(frameA) && canDraw(frameB)) {
                // Cross-blend adjacent frames for smoother motion (frame interpolation)
                // This is especially noticeable in slow-mo
                replayCtx.save();
                replayCtx.globalAlpha = 1 - frac;
                replayCtx.drawImage(frameA, 0, 0, replayCanvas.width, replayCanvas.height);
                replayCtx.globalAlpha = frac;
                replayCtx.drawImage(frameB, 0, 0, replayCanvas.width, replayCanvas.height);
                replayCtx.restore();
                drew = true;
            } else if (canDraw(frameA)) {
                replayCtx.drawImage(frameA, 0, 0, replayCanvas.width, replayCanvas.height);
                drew = true;
            }

            if (drew) drawReplayTacticalOverlay(fracIndex);

            if (isPaused && drew) {
                // Removed dark overlay per request - only keeping text-based pause indicator
                // Use a more modern glow effect for the text
                replayCtx.save();
                replayCtx.font = 'bold 72px "Barlow Condensed", sans-serif';
                replayCtx.textAlign = 'center';
                replayCtx.textBaseline = 'middle';
                
                // Outer glow
                replayCtx.shadowColor = '#00eeff';
                replayCtx.shadowBlur = 30;
                replayCtx.fillStyle = '#fff';
                replayCtx.fillText('P A U S E D', replayCanvas.width / 2, replayCanvas.height / 2);
                
                // Inner text
                replayCtx.shadowBlur = 0;
                replayCtx.fillStyle = '#fff';
                replayCtx.fillText('P A U S E D', replayCanvas.width / 2, replayCanvas.height / 2);
                replayCtx.restore();
            }

            updateProgressUI(idx);
        } catch (e) {
            console.warn('[Replay] drawReplayFrame error:', e);
        }
        return drew;
    };

    const updateProgressUI = (idx) => {
        const total = snapshotFrames.length;
        const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
        const progressFill = document.getElementById('pp-progress-fill');
        if (progressFill) progressFill.style.width = `${pct}%`;

        const fps = replayPlaybackFPS;
        const currentSec = total > 1 ? idx / fps : 0;
        const totalSec   = total > 1 ? (total - 1) / fps : 0;
        const elCurrent = document.getElementById('pp-time-current');
        const elTotal   = document.getElementById('pp-time-total');
        if (elCurrent) elCurrent.textContent = fmtTime(currentSec);
        if (elTotal)   elTotal.textContent   = fmtTime(totalSec);

        const elSpeed = document.getElementById('pp-speed');
        if (elSpeed) {
            elSpeed.textContent = isPaused ? 'PAUSED'
                : replaySpeed < CFG.playback.normalSpeed ? `${replaySpeed}×  SLO-MO`
                : `${replaySpeed}×`;
        }

        const elState = document.getElementById('pp-state');
        if (elState) {
            if (isEndingReplay)        { elState.dataset.state = 'ending';    elState.textContent = 'Returning'; }
            else if (isScrubbingReplay){ elState.dataset.state = 'scrubbing'; elState.textContent = 'Scrubbing'; }
            else if (isPaused)         { elState.dataset.state = 'paused';    elState.textContent = 'Paused'; }
            else if (replaySpeed < 1)  { elState.dataset.state = 'slowmo';   elState.textContent = 'Slo-Mo'; }
            else                       { elState.dataset.state = 'playing';   elState.textContent = 'Playing'; }
        }

        // Play/pause button icon
        const playBtn = document.getElementById('pp-btn-playpause');
        if (playBtn) {
            const playIcon  = playBtn.querySelector('.pp-icon-play');
            const pauseIcon = playBtn.querySelector('.pp-icon-pause');
            if (playIcon)  playIcon.style.display  = isPaused ? '' : 'none';
            if (pauseIcon) pauseIcon.style.display  = isPaused ? 'none' : '';
            playBtn.setAttribute('aria-pressed', String(!isPaused));
        }

        const slowBtn = document.getElementById('pp-btn-slowmo');
        if (slowBtn) slowBtn.setAttribute('aria-pressed', String(replaySpeed < 1));

        const telemetryBtn = document.getElementById('pp-btn-telemetry');
        if (telemetryBtn) telemetryBtn.setAttribute('aria-pressed', String(replayTelemetryVisible));

        const loopBtn = document.getElementById('pp-btn-loop');
        if (loopBtn) loopBtn.setAttribute('aria-pressed', String(replayLoopMode));
    };

    // ─── REPLAY LOOP ──────────────────────────────────────────────────────────
    const ensureLoop = () => {
        if (!isReplaying || isPaused || replayRaf) return;
        lastReplayTimestamp = 0; // reset to prevent time-jump after unpause
        replayRaf = requestAnimationFrame(replayLoop);
    };

    const replayLoop = (timestamp) => {
        if (activeReplaySessionId !== replaySessionId) { replayRaf = null; return; }
        if (!isReplaying || !replayCtx || snapshotFrames.length < 10) { endReplay(); return; }

        if (!timestamp) timestamp = performance.now();
        if (!lastReplayTimestamp) lastReplayTimestamp = timestamp;
        // Clamp delta to 200ms to handle tab-switching / system sleep
        const delta = Math.min(200, timestamp - lastReplayTimestamp);
        lastReplayTimestamp = timestamp;

        const drew = drawReplayFrame(replayIndex);
        hasRenderedReplayFrame = hasRenderedReplayFrame || drew;

        // Give capture fallbacks a short warmup window
        if (!hasRenderedReplayFrame) {
            if (timestamp - replayPlaybackStartTimestamp > 1500) { endReplay(); return; }
            replayRaf = requestAnimationFrame(replayLoop);
            return;
        }

        if (!isPaused) {
            const frameDuration = 1000 / (replayPlaybackFPS || CFG.record.targetFPS);
            replayIndex += (delta / frameDuration) * replaySpeed;

            if (replayIndex >= snapshotFrames.length - 1) {
                replayIndex = snapshotFrames.length - 1;
                drawReplayFrame(replayIndex);

                const elapsed = timestamp - replayPlaybackStartTimestamp;
                if (elapsed < CFG.playback.minDurationMs) {
                    replayEndHoldStart = 0;
                    replayRaf = requestAnimationFrame(replayLoop);
                    return;
                }

                if (!replayEndHoldStart) replayEndHoldStart = timestamp;
                if (timestamp - replayEndHoldStart >= CFG.playback.endHoldMs) {
                    if (replayLoopMode) {
                        replayIndex = 0;
                        replayEndHoldStart = 0;
                        replayPlaybackStartTimestamp = timestamp;
                        syncReplayVisualState();
                        replayRaf = requestAnimationFrame(replayLoop);
                        return;
                    }
                    endReplay();
                    return;
                }
            } else {
                replayEndHoldStart = 0;
            }
        }

        replayRaf = requestAnimationFrame(replayLoop);
    };

    // ─── INTRO ANIMATION ─────────────────────────────────────────────────────
    const playIntro = () => new Promise(resolve => {
        const el = document.createElement('div');
        el.innerHTML = `
        <style>
            .pp-intro {
                position:fixed;inset:0;z-index:1000000;
                background:#000;display:flex;flex-direction:column;
                justify-content:center;align-items:center;
                overflow:hidden;pointer-events:none;
            }
            @keyframes pp-intro-bg {
                0% { background: #000; }
                100% { background: transparent; }
            }
            @keyframes pp-line-grow {
                0% { width: 0; opacity: 0; }
                20% { width: 0; opacity: 1; }
                100% { width: 100%; opacity: 1; }
            }
            @keyframes pp-text-glitch {
                0% { transform: translate(0); opacity: 0; filter: blur(10px); }
                10% { transform: translate(-2px, 2px); opacity: 1; filter: blur(0); }
                20% { transform: translate(2px, -2px); }
                30% { transform: translate(-2px, 2px); }
                40% { transform: translate(0); }
                100% { transform: translate(0); opacity: 1; }
            }
            .pp-intro-overlay {
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                justify-content: center; align-items: center;
                background: #000;
                animation: pp-intro-bg 0.5s ease-out 1.2s forwards;
            }
            .pp-intro-line {
                width: 0; height: 2px;
                background: linear-gradient(90deg, transparent, #00eeff, #ff2d55, #00eeff, transparent);
                animation: pp-line-grow 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                margin: 20px 0;
            }
            .pp-intro-word {
                font-family: 'Barlow Condensed', 'Impact', sans-serif;
                font-size: clamp(60px, 12vw, 120px);
                font-weight: 900;
                letter-spacing: 12px;
                color: #fff;
                text-transform: uppercase;
                opacity: 0;
                animation: pp-text-glitch 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
                text-shadow: 3px 3px 0px #ff2d55, -3px -3px 0px #00eeff;
            }
            .pp-intro-sub {
                font-family: 'Barlow Condensed', sans-serif;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 8px;
                color: rgba(255,255,255,0.7);
                text-transform: uppercase;
                opacity: 0;
                animation: pp-fadein 0.4s ease-out 0.8s forwards;
            }
        </style>
        <div class="pp-intro">
            <div class="pp-intro-overlay">
                <div class="pp-intro-word">REPLAY</div>
                <div class="pp-intro-line"></div>
                <div class="pp-intro-sub">ANALYZING CLIP</div>
            </div>
        </div>`;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity 0.4s ease-out';
            el.style.opacity = '0';
            setTimeout(() => { el.remove(); resolve(); }, 400);
        }, 1600);
    });

    // ─── REPLAY UI ────────────────────────────────────────────────────────────
    const buildReplayUI = () => {
        if (replayUI) replayUI.remove();
        const mphSpeed   = pxPerSecToMPH(maxBallSpeedPxPerSec);
        const replayReason = rallyHits >= CFG.trigger.minRallyHits
            ? 'RALLY CLIP'
            : maxBallSpeedPxPerSec >= getFastShotThreshold()
                ? 'FAST SHOT'
                : 'MOMENTUM CLIP';
        const rallyDuration = Math.max(0, (Date.now() - rallyStartTime) / 1000).toFixed(1);
        const clipDuration = snapshotFrames.length > 1
            ? ((snapshotFrames.length - 1) / Math.max(1, replayPlaybackFPS)).toFixed(1)
            : '0.0';
        const markerHtml = snapshotMarkers.map(marker => `
            <div class="pp-marker pp-marker-${escapeHtml(marker.type)}"
                 style="left:${marker.pct.toFixed(2)}%"
                 title="${escapeHtml(marker.label)}"></div>
        `).join('');

        replayUI = document.createElement('div');
        replayUI.innerHTML = `
<style>

canvas.${CANVAS_HIDDEN_CLASS} { visibility:hidden !important; }

.pp-overlay {
    position:fixed;inset:0;z-index:100002;
    display:none;opacity:0;
    transition:opacity 0.5s ease;
    font-family:'Barlow Condensed',sans-serif;
    --pp-panel: rgba(7, 12, 20, 0.88);
    --pp-line: rgba(255,255,255,0.12);
}
.pp-overlay.active { display:block;opacity:1; }

/* ── Header ── */
.pp-header {
    position:absolute;top:0;left:0;right:0;
    padding:10px 18px;
    display:flex;align-items:center;justify-content:space-between;
    background:linear-gradient(180deg,rgba(0,0,0,0.75) 0%,transparent 100%);
    z-index:10;
}
.pp-brand {
    display:flex;align-items:center;gap:10px;
}
.pp-brand-badge {
    width:32px;height:32px;border-radius:7px;
    background:linear-gradient(135deg,#ff2d55,#00eeff);
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:900;font-size:16px;letter-spacing:-0.5px;
}
.pp-brand-label {
    font-size:22px;font-weight:800;letter-spacing:1px;
    color:#fff;line-height:1;
}
.pp-brand-sub {
    font-size:11px;font-weight:600;letter-spacing:0.6px;
    color:rgba(220,245,255,0.7);text-transform:uppercase;
}
.pp-meta { display:flex;align-items:center;gap:8px; }

.pp-state {
    font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;
    padding:4px 11px;border-radius:99px;
    background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.2);
    color:#9ff;
    transition:color 0.2s,border-color 0.2s;
}
.pp-state[data-state="paused"]   { color:#ffd27a;border-color:rgba(255,210,122,0.4); }
.pp-state[data-state="scrubbing"]{ color:#ff9db8;border-color:rgba(255,157,184,0.4); }
.pp-state[data-state="slowmo"]   { color:#b8ff90;border-color:rgba(184,255,144,0.4); }
.pp-state[data-state="ending"]   { color:#90d8ff;border-color:rgba(144,216,255,0.4); }

.pp-speed-badge {
    font-size:16px;font-weight:800;letter-spacing:0.5px;
    color:#00eeff;padding:4px 12px;
    border-radius:99px;background:rgba(0,0,0,0.5);
    border:1px solid rgba(0,238,255,0.25);
}

/* ── Reason pill ── */
.pp-reason {
    position:absolute;top:62px;left:50%;
    transform:translateX(-50%) translateY(-8px);
    background:linear-gradient(100deg,#ff2d55,#00eeff);
    color:#fff;padding:7px 20px;border-radius:99px;
    font-size:15px;font-weight:800;letter-spacing:0.5px;
    box-shadow:0 4px 18px rgba(255,45,85,0.35);
    opacity:0;z-index:10;
    animation:pp-slidedown 0.4s cubic-bezier(0.2,1,0.3,1) 0.2s forwards;
}
@keyframes pp-slidedown {
    to { opacity:1;transform:translateX(-50%) translateY(0); }
}

/* ── Stats panel ── */
.pp-stats {
    position:absolute;top:62px;right:18px;
    display:flex;flex-direction:column;gap:8px;
    background:var(--pp-panel);border-radius:12px;
    border:1px solid var(--pp-line);
    padding:12px 14px;backdrop-filter:blur(8px);
    opacity:0;animation:pp-fadein 0.4s ease 0.35s forwards;z-index:10;
}
@keyframes pp-fadein { to{opacity:1;} }
.pp-stat { display:flex;flex-direction:column;align-items:center;min-width:76px; }
.pp-stat-label {
    font-size:10px;font-weight:700;letter-spacing:0.7px;
    text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:2px;
}
.pp-stat-value { font-size:22px;font-weight:900;color:#00eeff;line-height:1; }

/* ── Canvas ── */
.pp-canvas-wrap {
    position:absolute;inset:0;
    display:flex;justify-content:center;align-items:center;
    overflow:hidden;z-index:1;
}

/* ── Progress bar ── */
.pp-bottom-ui {
    position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));
    transform:translateX(-50%);
    width:min(760px,92vw);
    z-index:10;
    display:flex;flex-direction:column;align-items:stretch;gap:8px;
    pointer-events:none;
}
.pp-bottom-ui > * { pointer-events:auto; }
.pp-progress-wrap {
    position:relative;width:100%;
    opacity:0;
    animation:pp-fadein 0.4s ease 0.7s forwards;
    cursor:pointer;user-select:none;
    padding:8px 0 2px;
}
.pp-progress-track {
    height:8px;border-radius:999px;
    background:rgba(255,255,255,0.12);
    position:relative;
    transition:height 0.15s;
}
.pp-progress-wrap:hover .pp-progress-track,
.pp-progress-wrap.scrubbing .pp-progress-track { height:10px; }
.pp-progress-fill {
    height:100%;width:0%;border-radius:999px;
    background:linear-gradient(90deg,#ff2d55,#ffb347 52%,#00eeff);
    position:relative;transition:width 0.08s linear;
}
.pp-progress-thumb {
    position:absolute;right:-6px;top:50%;transform:translateY(-50%);
    width:12px;height:12px;border-radius:50%;background:#fff;
    box-shadow:0 0 0 3px rgba(255,45,85,0.4);
    opacity:0;transition:opacity 0.15s;
}
.pp-marker {
    position:absolute;top:50%;transform:translate(-50%,-50%);
    width:4px;height:14px;border-radius:99px;
    background:#fff;box-shadow:0 0 8px rgba(255,255,255,0.6);
    pointer-events:auto;
}
.pp-marker-hit { background:#00eeff; }
.pp-marker-score { width:7px;height:18px;background:#ffb347;box-shadow:0 0 12px rgba(255,179,71,0.75); }
.pp-progress-wrap:hover .pp-progress-thumb,
.pp-progress-wrap.scrubbing .pp-progress-thumb { opacity:1; }
.pp-times {
    display:flex;justify-content:space-between;
    margin-top:7px;font-size:11px;font-weight:600;
    color:rgba(255,255,255,0.55);
}

/* ── Controls ── */
.pp-controls {
    position:relative;align-self:center;
    transform:translateY(4px);
    display:flex;align-items:center;gap:8px;
    max-width:100%;flex-wrap:wrap;justify-content:center;
    padding:10px 18px;
    background:rgba(8,12,18,0.88);
    border-radius:16px;backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.1);
    box-shadow:0 12px 32px rgba(0,0,0,0.4);
    opacity:0;
    animation:pp-slideup 0.4s cubic-bezier(0.2,1,0.3,1) 0.55s forwards;
}
@keyframes pp-slideup {
    from { opacity:0;transform:translateY(16px); }
    to   { opacity:1;transform:translateY(0); }
}
/* The settings panels (game-enhancements.js) also style ".pp-btn" (flex:1,
   min-width:120px, padding); undo that here so replay buttons keep their size. */
.pp-overlay button.pp-btn {
    box-sizing:border-box;padding:0;margin:0;letter-spacing:0;
    flex:0 0 auto;min-width:0;overflow:visible;
}
.pp-overlay button.pp-btn::before { display:none; }
.pp-overlay button.pp-btn-skip { padding:0 14px; }
.pp-btn {
    width:42px;height:42px;border-radius:10px;
    background:rgba(255,255,255,0.07);
    border:1px solid rgba(255,255,255,0.15);
    color:#fff !important;font-size:0;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:background 0.18s,transform 0.12s,box-shadow 0.18s;
    position:relative;
}
.pp-overlay .pp-btn svg,
.pp-overlay .pp-btn svg path {
    display:block !important;
    width:22px;height:22px;
    min-width:22px;min-height:22px;
    fill:currentColor !important;
    stroke:currentColor !important;
    color:currentColor !important;
    opacity:1 !important;
    pointer-events:none;
}
.pp-btn:hover { background:rgba(255,45,85,0.75);transform:scale(1.08); }
.pp-btn:active { transform:scale(0.96); }
.pp-btn[aria-pressed="true"] {
    background:linear-gradient(135deg,#ff2d55,#00aeff);
    border-color:rgba(255,255,255,0.35);
    box-shadow:0 0 14px rgba(255,45,85,0.4);
}
.pp-btn:focus-visible { outline:2px solid #00eeff;outline-offset:2px; }

.pp-btn-skip {
    width:auto;padding:0 14px;gap:7px;border-radius:99px;
    font-family:'Barlow Condensed',sans-serif;
    font-size:13px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;
    background:linear-gradient(120deg,rgba(255,45,85,0.22),rgba(0,238,255,0.14));
}
.pp-btn-skip svg { width:18px;height:18px; }

.pp-tooltip {
    position:absolute;bottom:calc(100% + 7px);left:50%;
    transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:#fff;
    padding:4px 9px;border-radius:5px;
    font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;
    white-space:nowrap;pointer-events:none;
    opacity:0;transition:opacity 0.15s;
}
.pp-btn:hover .pp-tooltip { opacity:1; }

/* ── Keyboard hint ── */
.pp-hint {
    position:relative;text-align:center;
    font-size:11px;font-weight:600;letter-spacing:0.3px;color:rgba(255,255,255,0.4);
    white-space:nowrap;opacity:0;
    animation:pp-fadein 0.4s ease 0.75s forwards;
}
@media (max-width:768px) {
    .pp-hint { display:none; }
    .pp-bottom-ui { width:94vw;bottom:max(10px,env(safe-area-inset-bottom));gap:10px; }
    .pp-stats { flex-direction:row;top:108px;right:10px;padding:8px; }
    .pp-btn { width:38px;height:38px; }
    .pp-controls { padding:8px 10px;gap:6px; }
    .pp-btn-skip { padding:0 10px; }
}
/* Phones / short screens: one compact control row, no keyboard hints,
   stats folded into a slim strip under the header. */
@media (max-height:520px), (hover:none) and (pointer:coarse) {
    .pp-hint, .pp-tooltip { display:none !important; }
    .pp-header { padding:max(6px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 6px max(12px,env(safe-area-inset-left)); }
    .pp-brand-badge { width:26px;height:26px;font-size:13px; }
    .pp-brand-label { font-size:17px; }
    .pp-brand-sub { display:none; }
    .pp-reason { top:8px;padding:4px 14px;font-size:13px; }
    .pp-stats { top:44px;right:max(10px,env(safe-area-inset-right));flex-direction:row;gap:12px;padding:6px 10px;border-radius:10px; }
    .pp-stat { min-width:0; }
    .pp-stat-label { font-size:9px; }
    .pp-stat-value { font-size:16px; }
    .pp-stat-value span { font-size:9px !important; }
    .pp-bottom-ui { width:min(620px,94vw);bottom:max(8px,env(safe-area-inset-bottom));gap:4px; }
    .pp-progress-wrap { padding:10px 0 0; }
    .pp-times { margin-top:4px; }
    .pp-controls { padding:6px 10px;gap:8px;flex-wrap:nowrap;border-radius:14px; }
    .pp-overlay #pp-btn-prev, .pp-overlay #pp-btn-next, .pp-overlay #pp-btn-telemetry, .pp-overlay #pp-btn-loop { display:none; }
    .pp-btn { width:44px;height:44px; }
    .pp-btn-skip { width:auto;padding:0 16px; }
    .pp-btn:hover { transform:none; }
}
@media (max-width:520px) {
    .pp-header { padding:8px 10px; }
    .pp-brand-label { font-size:18px; }
    .pp-brand-sub { display:none; }
    .pp-speed-badge { font-size:13px;padding:4px 9px; }
    .pp-state { font-size:11px;padding:4px 8px; }
    .pp-btn { width:36px;height:36px;border-radius:9px; }
    .pp-overlay .pp-btn svg,
    .pp-overlay .pp-btn svg path { width:20px;height:20px;min-width:20px;min-height:20px; }
    .pp-btn-skip { width:36px;padding:0;border-radius:9px; }
    .pp-btn-skip span { display:none; }
    .pp-stats { left:10px;right:10px;justify-content:space-between; }
    .pp-stat { min-width:0; }
    .pp-stat-value { font-size:18px; }
}
</style>

<div class="pp-overlay" id="pp-overlay" data-state="idle">
    <div class="pp-canvas-wrap" id="pp-canvas-wrap"></div>

    <div class="pp-header">
        <div class="pp-brand">
            <div class="pp-brand-badge">R</div>
            <div>
                <div class="pp-brand-label">INSTANT REPLAY</div>
                <div class="pp-brand-sub">Reviewing the last rally</div>
            </div>
        </div>
        <div class="pp-meta">
            <div class="pp-state" id="pp-state" data-state="playing">Playing</div>
            <div class="pp-speed-badge" id="pp-speed">1.0×</div>
        </div>
    </div>

    <div class="pp-reason">${replayReason}</div>

    <div class="pp-stats">
        <div class="pp-stat">
            <div class="pp-stat-label">HITS</div>
            <div class="pp-stat-value">${rallyHits}</div>
        </div>
        <div class="pp-stat">
            <div class="pp-stat-label">PEAK</div>
            <div class="pp-stat-value">${mphSpeed} <span style="font-size:12px;opacity:.6">MPH</span></div>
        </div>
        <div class="pp-stat">
            <div class="pp-stat-label">RALLY</div>
            <div class="pp-stat-value">${rallyDuration}s</div>
        </div>
        <div class="pp-stat">
            <div class="pp-stat-label">CLIP</div>
            <div class="pp-stat-value">${clipDuration}s</div>
        </div>
    </div>

    <div class="pp-bottom-ui">
    <div class="pp-progress-wrap" id="pp-progress-wrap">
        <div class="pp-progress-track">
            <div class="pp-progress-fill" id="pp-progress-fill">
                <div class="pp-progress-thumb"></div>
            </div>
            ${markerHtml}
        </div>
        <div class="pp-times">
            <span id="pp-time-current">0:00</span>
            <span id="pp-time-total">0:00</span>
        </div>
    </div>

    <div class="pp-hint">Space play/pause | S slow-mo | T telemetry | L loop | arrows frame | R restart | Esc live</div>

    <div class="pp-controls" id="pp-controls">
        <!-- Prev frame -->
        <button class="pp-btn" id="pp-btn-prev" aria-label="Previous frame">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            <div class="pp-tooltip">Prev frame</div>
        </button>
        <!-- Restart -->
        <button class="pp-btn" id="pp-btn-restart" aria-label="Restart replay">
            <svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>
            <div class="pp-tooltip">Restart (R)</div>
        </button>
        <!-- Play/Pause -->
        <button class="pp-btn" id="pp-btn-playpause" aria-label="Play or pause" aria-pressed="true">
            <svg class="pp-icon-play" viewBox="0 0 24 24" style="display:none"><path d="M8 5v14l11-7z"/></svg>
            <svg class="pp-icon-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            <div class="pp-tooltip">Play/Pause (Space)</div>
        </button>
        <!-- Slow-mo -->
        <button class="pp-btn" id="pp-btn-slowmo" aria-label="Toggle slow motion" aria-pressed="false">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23L13 11.5z"/></svg>
            <div class="pp-tooltip">Slow-mo (S)</div>
        </button>
        <!-- Telemetry -->
        <button class="pp-btn" id="pp-btn-telemetry" aria-label="Toggle replay telemetry" aria-pressed="true">
            <svg viewBox="0 0 24 24"><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8zm0-2.2a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z"/></svg>
            <div class="pp-tooltip">Telemetry (T)</div>
        </button>
        <!-- Loop -->
        <button class="pp-btn" id="pp-btn-loop" aria-label="Loop replay" aria-pressed="false">
            <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H7a5 5 0 00-5 5v2h2v-2a3 3 0 013-3zm10 10H7v-3l-4 4 4 4v-3h10a5 5 0 005-5v-2h-2v2a3 3 0 01-3 3z"/></svg>
            <div class="pp-tooltip">Loop (L)</div>
        </button>
        <!-- Next frame -->
        <button class="pp-btn" id="pp-btn-next" aria-label="Next frame">
            <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1zm7-6h2v12h-2z"/></svg>
            <div class="pp-tooltip">Next frame (→)</div>
        </button>
        <!-- Skip / Return live -->
        <button class="pp-btn pp-btn-skip" id="pp-btn-skip" aria-label="Return to live match">
            <svg viewBox="0 0 24 24"><polygon points="6,18 6,6 12,12"/><polygon points="13,18 13,6 19,12"/></svg>
            <span>Return Live</span>
            <div class="pp-tooltip">Skip (Esc)</div>
        </button>
    </div>
    </div>
</div>`;

        document.body.appendChild(replayUI);

        // Activate overlay
        setTimeout(() => {
            const ov = document.getElementById('pp-overlay');
            if (ov) ov.classList.add('active');
        }, 16);

        // Button events
        replayUI.addEventListener('click', e => {
            const btn = e.target.closest('.pp-btn');
            if (!btn) return;
            const id = btn.id;
            if (id === 'pp-btn-prev')      ppAPI.prevFrame();
            else if (id === 'pp-btn-restart')  ppAPI.restartReplay();
            else if (id === 'pp-btn-playpause') ppAPI.togglePause();
            else if (id === 'pp-btn-slowmo')    ppAPI.toggleSlowMo();
            else if (id === 'pp-btn-telemetry') ppAPI.toggleTelemetry();
            else if (id === 'pp-btn-loop')      ppAPI.toggleLoop();
            else if (id === 'pp-btn-next')      ppAPI.stepFrame();
            else if (id === 'pp-btn-skip')      ppAPI.endReplay();
        });

        // Scrub bar
        const progressWrap = document.getElementById('pp-progress-wrap');
        if (progressWrap) {
            let isScrubbing = false;
            let wasPaused = false;
            let scrubPct = 0;

            const getPct = ev => {
                const r = progressWrap.getBoundingClientRect();
                return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            };
            const seekTo = pct => {
                scrubPct = pct;
                replayIndex = Math.floor(pct * (snapshotFrames.length - 1));
                replayIndex = Math.max(0, Math.min(snapshotFrames.length - 1, replayIndex));
                drawReplayFrame(replayIndex);
            };

            progressWrap.addEventListener('pointerdown', ev => {
                ev.preventDefault();
                progressWrap.setPointerCapture(ev.pointerId);
                isScrubbing = true;
                isScrubbingReplay = true;
                wasPaused = isPaused;
                isPaused = true;
                progressWrap.classList.add('scrubbing');
                if (replayRaf) { cancelAnimationFrame(replayRaf); replayRaf = null; }
                seekTo(getPct(ev));
            });
            progressWrap.addEventListener('pointermove', ev => {
                if (isScrubbing) seekTo(getPct(ev));
            });
            const endScrub = ev => {
                if (!isScrubbing) return;
                isScrubbing = false;
                if (ev?.pointerId !== undefined && progressWrap.hasPointerCapture?.(ev.pointerId)) {
                    progressWrap.releasePointerCapture(ev.pointerId);
                }
                progressWrap.classList.remove('scrubbing');
                isScrubbingReplay = false;
                isPaused = wasPaused;
                if (ev) seekTo(getPct(ev));
                else seekTo(scrubPct);
                ensureLoop();
            };
            progressWrap.addEventListener('pointerup', endScrub);
            progressWrap.addEventListener('pointercancel', endScrub);
        }

        // Auto-fade stats/reason
        setTimeout(() => {
            replayUI?.querySelectorAll('.pp-stats,.pp-reason').forEach(el => {
                el.style.transition = 'opacity 0.5s ease';
                el.style.opacity = '0';
            });
        }, CFG.timing.infoFadeDelayMs);
    };

    const clearReplayUI = (immediate = false) => new Promise(resolve => {
        if (!replayUI) { resolve(); return; }
        const ov = document.getElementById('pp-overlay');
        if (!ov || immediate) {
            try { replayUI.remove(); } catch(e) {}
            replayUI = null;
            disposeReplaySurface();
            resolve();
            return;
        }
        ov.style.transition = 'opacity 0.28s ease-out';
        ov.style.opacity = '0';
        setTimeout(() => {
            try { replayUI?.remove(); } catch(e) {}
            replayUI = null;
            disposeReplaySurface();
            resolve();
        }, 300);
    });

    // ─── OUTRO ────────────────────────────────────────────────────────────────
    const playOutro = () => new Promise(resolve => {
        const el = document.createElement('div');
        el.innerHTML = `
        <style>
            .pp-outro { 
                position:fixed;inset:0;z-index:1000000;
                background:rgba(0,0,0,0.85);
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                backdrop-filter:blur(10px);
                font-family:'Barlow Condensed',sans-serif;
                overflow:hidden;
            }
            @keyframes pp-outro-slide {
                0% { transform: scale(1.1); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes pp-outro-pulse {
                0% { box-shadow: 0 0 0 0 rgba(0,238,255,0.4); }
                70% { box-shadow: 0 0 0 20px rgba(0,238,255,0); }
                100% { box-shadow: 0 0 0 0 rgba(0,238,255,0); }
            }
            .pp-outro-card {
                background: linear-gradient(135deg, #070c14 0%, #0d1a2f 100%);
                border: 2px solid #00eeff;
                padding: 40px 60px;
                border-radius: 20px;
                text-align: center;
                animation: pp-outro-slide 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                position: relative;
            }
            .pp-outro-title { 
                font-size: 24px; font-weight: 800; letter-spacing: 4px; 
                color: #fff; text-transform: uppercase; margin-bottom: 30px;
                text-shadow: 0 0 10px rgba(0,238,255,0.5);
            }
            .pp-outro-circle {
                width: 100px; height: 100px; border-radius: 50%;
                border: 4px solid #00eeff; margin: 0 auto 30px;
                display: flex; align-items: center; justify-content: center;
                font-size: 52px; font-weight: 900; color: #00eeff;
                animation: pp-outro-pulse 1.5s infinite;
            }
            .pp-outro-label {
                font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.6);
                text-transform: uppercase; letter-spacing: 2px;
            }
            @keyframes pp-line-progress {
                0% { width: 0; }
                100% { width: 100%; }
            }
            .pp-outro-line-container {
                width: 100%; height: 4px; background: rgba(255,255,255,0.1);
                border-radius:2px; margin-top:20px; overflow:hidden;
            }
            .pp-outro-line-bar {
                height: 100%; width: 0;
                background: linear-gradient(90deg, #00eeff, #ff2d55);
            }
        </style>
        <div class="pp-outro">
            <div class="pp-outro-card">
                <div class="pp-outro-title">Match Resuming</div>
                <div class="pp-outro-circle" id="pp-outro-circle">3</div>
                <div class="pp-outro-label" id="pp-outro-label">Preparing Arena</div>
                <div class="pp-outro-line-container">
                    <div class="pp-outro-line-bar" id="pp-outro-line-bar"></div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(el);

        const circle = el.querySelector('#pp-outro-circle');
        const label = el.querySelector('#pp-outro-label');
        const bar = el.querySelector('#pp-outro-line-bar');
        const duration = 2400; // slightly longer for more impact
        const labels = ["Preparing Arena", "Syncing PhysX", "Live in 1"];
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const remaining = Math.max(0, 1 - t);
            const seconds = Math.ceil(remaining * 3);
            
            if (circle) circle.textContent = seconds === 0 ? "GO" : seconds;
            if (label) label.textContent = labels[Math.min(labels.length - 1, Math.floor(t * 3))];
            if (bar) bar.style.width = (t * 100) + "%";

            if (t < 1) requestAnimationFrame(tick);
            else {
                setTimeout(() => {
                    el.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.9)';
                    setTimeout(() => { el.remove(); resolve(); }, 300);
                }, 400);
            }
        };
        requestAnimationFrame(tick);
    });

    // ─── START REPLAY ─────────────────────────────────────────────────────────
    const playReturnOverlay = () => new Promise(resolve => {
        const el = document.createElement('div');
        el.innerHTML = `
        <style>
            .pp-return {
                position:fixed;inset:0;z-index:1000000;
                background:#000;display:flex;flex-direction:column;
                justify-content:center;align-items:center;
                overflow:hidden;pointer-events:none;
                font-family:'Barlow Condensed','Impact',sans-serif;
            }
            @keyframes pp-return-bg {
                0% { background: #000; }
                100% { background: transparent; }
            }
            @keyframes pp-return-line-grow {
                0% { width: 0; opacity: 0; }
                20% { width: 0; opacity: 1; }
                100% { width: min(560px, 78vw); opacity: 1; }
            }
            @keyframes pp-return-text-in {
                0% { transform: translateY(12px); opacity: 0; filter: blur(10px); }
                100% { transform: translateY(0); opacity: 1; filter: blur(0); }
            }
            .pp-return-overlay {
                position:absolute;inset:0;
                display:flex;flex-direction:column;
                justify-content:center;align-items:center;
                background:#000;
                animation:pp-return-bg 0.45s ease-out 0.95s forwards;
            }
            .pp-return-word {
                font-size:clamp(60px,12vw,120px);
                font-weight:900;
                letter-spacing:0.08em;
                color:#fff;
                text-transform:uppercase;
                opacity:0;
                animation:pp-return-text-in 0.42s cubic-bezier(0.16,1,0.3,1) 0.18s forwards;
                text-shadow:2px 2px 0 #ff2d55,-2px -2px 0 #00eeff;
            }
            .pp-return-line {
                width:0;height:2px;
                background:linear-gradient(90deg,transparent,#00eeff,#ff2d55,#00eeff,transparent);
                animation:pp-return-line-grow 0.55s cubic-bezier(0.16,1,0.3,1) forwards;
                margin:18px 0;
            }
            .pp-return-sub {
                font-size:14px;
                font-weight:700;
                letter-spacing:0.5em;
                color:rgba(255,255,255,0.7);
                text-transform:uppercase;
                opacity:0;
                animation:pp-fadein 0.35s ease-out 0.62s forwards;
            }
            @media (max-width:520px) {
                .pp-return-word { font-size:clamp(46px,16vw,72px);letter-spacing:0.06em; }
                .pp-return-sub { font-size:12px;letter-spacing:0.32em; }
            }
        </style>
        <div class="pp-return">
            <div class="pp-return-overlay">
                <div class="pp-return-word">LIVE</div>
                <div class="pp-return-line"></div>
                <div class="pp-return-sub">MATCH RESUMING</div>
            </div>
        </div>`;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity 0.32s ease-out';
            el.style.opacity = '0';
            setTimeout(() => { el.remove(); resolve(); }, 340);
        }, 1150);
    });

    const startReplay = async (force = false) => {
        if (isReplaying || isEndingReplay) return;
        if (!force && bufferCount < CFG.trigger.minFramesForReplay) return;

        // Take snapshot of buffer before we modify anything
        bufferSnapshot();
        if (snapshotFrames.length < 30) return;

        cancelPendingReplay();
        stopReplayLoop();

        // Increment session before anything async so stale loops self-terminate
        replaySessionId += 1;
        activeReplaySessionId = replaySessionId;

        // Capture live loop state for this replay instance (not install-time).
        replayPrevRunning = !!game?.running;

        // Capture resume hook before pausing the game loop
        captureResumeHook();

        stopRecording();
        pauseGameLoop();
        setReplayFlags(true);
        setLiveCanvasVisible(false);

        isReplaying = true;
        isEndingReplay = false;
        isPaused = false;
        isScrubbingReplay = false;
        replayLoopMode = false;
        replayIndex = 0;
        replaySpeed = CFG.playback.normalSpeed;
        lastReplayTimestamp = 0;
        replayPlaybackFPS = getPlaybackFPS();
        replayPlaybackStartTimestamp = performance.now();
        replayEndHoldStart = 0;
        hasRenderedReplayFrame = false;

        try {
            await clearReplayUI(true);
            await playIntro();

            if (activeReplaySessionId !== replaySessionId || !isReplaying) return;

            buildReplayUI();

            await new Promise(r => setTimeout(r, 50));

            const container = document.getElementById('pp-canvas-wrap');
            if (!container || !game?.canvas) { endReplay(); return; }

            replayCanvas = document.createElement('canvas');
            replayCanvas.width  = game.canvas.width;
            replayCanvas.height = game.canvas.height;
            replayCanvas.style.cssText = 'width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.35s ease;';
            container.innerHTML = '';
            container.appendChild(replayCanvas);

            replayCtx = replayCanvas.getContext('2d');
            if (!replayCtx) throw new Error('2D context unavailable');

            // Validate we have at least one drawable frame
            const firstOk = snapshotFrames.findIndex(canDraw);
            if (firstOk < 0 || !drawReplayFrame(firstOk)) throw new Error('No drawable frames');

            replayIndex = firstOk;
            hasRenderedReplayFrame = true;
            replayPlaybackStartTimestamp = performance.now();

            requestAnimationFrame(() => { if (replayCanvas) replayCanvas.style.opacity = '1'; });
            ensureLoop();

            consecutiveReplays++;
            lastReplayTime = Date.now();
            syncReplayVisualState();

        } catch (err) {
            console.error('[Replay] startReplay failed:', err);
            endReplay();
        }
    };

    // ─── END REPLAY ───────────────────────────────────────────────────────────
    const smoothResumeGame = async () => {
        if (isEndingReplay) return;
        isEndingReplay = true;
        activeReplaySessionId = 0; // invalidate all replay loops

        stopReplayLoop();
        cancelPendingReplay();

        try {
            await playReturnOverlay();
        } catch(e) { /* non-fatal */ }

        // Resume game
        requestAnimationFrame(() => {
            try {
                if (game.countdown !== undefined) game.countdown = 0;
                if (game.gameState !== undefined) game.gameState = 'playing';
                if (game.state !== undefined && game.state !== 'playing') game.state = 'playing';
                serveNewBall();
            } catch(e) { console.warn('[Replay] serveNewBall post-replay:', e); }
        });

        await clearReplayUI();

        // FIX: use the carefully captured resume function, not start()
        isReplaying = false;
        game.paused = false;
        game.running = true;
        setReplayFlags(false);
        setLiveCanvasVisible(true);

        try {
            if (typeof resumeGameLoop === 'function') resumeGameLoop();
        } catch(e) {
            console.warn('[Replay] resumeGameLoop error:', e);
        }

        // Safety net for engines where resume/unpause doesn't re-arm RAF.
        ensureGameLoopRunning();

        // Restart recording
        snapshotClear();
        bufferClear();
        lastRecordTimestamp = 0;
        setTimeout(startRecording, CFG.timing.restartRecordingDelay);

        // Reset tracking for next rally
        resetRallyTracking();
        lastReplayEndTime = Date.now();
        isEndingReplay = false;
    };

    const endReplay = () => {
        if (!isReplaying && !isReplayPending && !isEndingReplay) return;
        cancelPendingReplay();
        smoothResumeGame();
    };

    // ─── OPT-IN REPLAY (phones) ───────────────────────────────────────────────
    // A small chip under the scoreboard for a few seconds. Recording is paused
    // while it's up so the highlight stays in the buffer; ignoring it costs
    // nothing and the match never stops unless the player asks.
    let offerEl = null;
    let offerTimer = null;
    const OFFER_MS = 4500;

    const dismissReplayOffer = (resumeRecording = true) => {
        clearTimeout(offerTimer);
        offerTimer = null;
        if (offerEl) {
            const el = offerEl;
            offerEl = null;
            el.classList.remove('on');
            setTimeout(() => el.remove(), 250);
            if (resumeRecording) {
                resetRallyTracking();
                lastRecordTimestamp = 0;
                startRecording();
            }
        }
    };

    const offerReplay = () => {
        if (offerEl || isReplaying || isEndingReplay) return;
        lastReplayTime = Date.now();   // same spacing as auto replays, watched or not
        stopRecording();
        offerEl = document.createElement('button');
        offerEl.type = 'button';
        offerEl.className = 'pp-replay-offer';
        offerEl.innerHTML = '<span aria-hidden="true">&#9654;</span> REPLAY <i></i>';
        offerEl.style.setProperty('--pp-offer-ms', OFFER_MS + 'ms');
        offerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissReplayOffer(false);
            startReplay(true);
        });
        document.body.appendChild(offerEl);
        requestAnimationFrame(() => offerEl?.classList.add('on'));
        offerTimer = setTimeout(() => dismissReplayOffer(true), OFFER_MS);
    };

    // Leaving the match (pause menu, quit) drops the offer.
    const offerWatch = () => {
        if (offerEl && (!game || game.paused || !game.running)) dismissReplayOffer(true);
        requestAnimationFrame(offerWatch);
    };
    requestAnimationFrame(offerWatch);

    // ─── SCORE + RALLY POLLING ────────────────────────────────────────────────
    const pollForScoreAndRally = () => {
        if (!game) { requestAnimationFrame(pollForScoreAndRally); return; }

        if (!isReplaying && !isEndingReplay && !game.paused && game.running && !game.introActive) {
            const total = getScoreTotal();

            if (total < lastScoreTotal) {
                // Match was reset
                lastScoreTotal = total;
                consecutiveReplays = 0;
                resetRallyTracking();
            }

            if (total > lastScoreTotal) {
                addTimelineMarker('score', 'Point', performance.now(), {
                    score: { player: game.scores?.player ?? 0, ai: game.scores?.ai ?? 0 },
                });
                lastScoreTotal = total;
                if (shouldTriggerReplay() && IS_MOBILE) {
                    // Phones: never take the screen away mid-match. Freeze the
                    // clip and offer it; play carries on underneath.
                    offerReplay();
                } else if (shouldTriggerReplay()) {
                    isReplayPending = true;
                    if (pendingReplayTimeout) clearTimeout(pendingReplayTimeout);
                    pendingReplayTimeout = setTimeout(() => {
                        pendingReplayTimeout = null;
                        startReplay();
                    }, CFG.timing.replayDelay);
                } else {
                    // Cool down between replays
                    if (Date.now() - lastReplayTime > CFG.trigger.minTimeSinceLastReplayMs * 2) {
                        consecutiveReplays = 0;
                    }
                    resetRallyTracking();
                }
            }
        }

        requestAnimationFrame(pollForScoreAndRally);
    };

    // ─── KEYBOARD ────────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (!isReplaying) return;
        const map = {
            ' ': () => ppAPI.togglePause(),
            'Spacebar': () => ppAPI.togglePause(),
            's': () => ppAPI.toggleSlowMo(),
            'S': () => ppAPI.toggleSlowMo(),
            't': () => ppAPI.toggleTelemetry(),
            'T': () => ppAPI.toggleTelemetry(),
            'l': () => ppAPI.toggleLoop(),
            'L': () => ppAPI.toggleLoop(),
            'ArrowRight': () => ppAPI.stepFrame(),
            'ArrowLeft': () => ppAPI.prevFrame(),
            'b': () => ppAPI.prevFrame(),
            'B': () => ppAPI.prevFrame(),
            'f': () => ppAPI.stepFrame(),
            'F': () => ppAPI.stepFrame(),
            'r': () => ppAPI.restartReplay(),
            'R': () => ppAPI.restartReplay(),
            'Escape': () => ppAPI.endReplay(),
        };
        const fn = map[e.key];
        if (fn) { e.preventDefault(); fn(); }
    });

    // ─── PUBLIC API ───────────────────────────────────────────────────────────
    const ppAPI = {
        endReplay,
        replayNow() {
            if (isReplaying || isEndingReplay || isReplayPending) return false;
            if (bufferCount < 30) return false;
            startReplay(true);
            return true;
        },
        togglePause() {
            if (!isReplaying) return;
            isPaused = !isPaused;
            isScrubbingReplay = false;
            replayEndHoldStart = 0;
            if (isPaused) stopReplayLoop();
            drawReplayFrame(replayIndex); // immediate feedback
            if (!isPaused) ensureLoop();
        },
        toggleSlowMo() {
            if (!isReplaying) return;
            replaySpeed = replaySpeed >= CFG.playback.normalSpeed
                ? CFG.playback.slowMoSpeed
                : CFG.playback.normalSpeed;
            isPaused = false;
            replayEndHoldStart = 0;
            ensureLoop();
        },
        toggleTelemetry() {
            if (!isReplaying) return;
            replayTelemetryVisible = !replayTelemetryVisible;
            drawReplayFrame(replayIndex);
            syncReplayVisualState();
        },
        toggleLoop() {
            if (!isReplaying) return;
            replayLoopMode = !replayLoopMode;
            replayEndHoldStart = 0;
            syncReplayVisualState();
            if (!isPaused) ensureLoop();
        },
        stepFrame() {
            if (!isReplaying) return;
            isPaused = true;
            stopReplayLoop();
            replayIndex = Math.min(snapshotFrames.length - 1, Math.floor(replayIndex) + 1);
            replayEndHoldStart = 0;
            drawReplayFrame(replayIndex);
        },
        prevFrame() {
            if (!isReplaying) return;
            isPaused = true;
            stopReplayLoop();
            replayIndex = Math.max(0, Math.floor(replayIndex) - 1);
            replayEndHoldStart = 0;
            drawReplayFrame(replayIndex);
        },
        restartReplay() {
            if (!isReplaying) return;
            replayIndex = 0;
            isPaused = false;
            replaySpeed = CFG.playback.normalSpeed;
            replayEndHoldStart = 0;
            replayPlaybackStartTimestamp = performance.now();
            drawReplayFrame(0);
            ensureLoop();
        },
        debug() {
            console.table({
                bufferCount,
                snapshotFrames: snapshotFrames.length,
                snapshotMarkers: snapshotMarkers.length,
                isReplaying,
                rallyHits,
                maxSpeedMPH: pxPerSecToMPH(maxBallSpeedPxPerSec),
                replaySpeed,
                replayTelemetryVisible,
                replayLoopMode,
                replayIndex: replayIndex.toFixed(2),
                playbackFPS: replayPlaybackFPS,
                consecutiveReplays,
                lastReplayAgo: `${((Date.now() - lastReplayTime) / 1000).toFixed(0)}s`,
            });
        },
    };

    window.ppReplayV14 = ppAPI;

    // ─── INSTALL ──────────────────────────────────────────────────────────────
    const install = (g) => {
        game = g;
        replayPrevRunning = !!g.running;
        lastScoreTotal = getScoreTotal();
        resetRallyTracking();
        installCollisionHook();
        startRecording();
        pollForScoreAndRally();
    };

    // Auto-find the game object
    const findGame = setInterval(() => {
        if (window.game?.canvas && window.game?.ball?.pos) {
            clearInterval(findGame);
            install(window.game);
        }
    }, 100);

    // ─── HELPERS ─────────────────────────────────────────────────────────────
    const fmtTime = s => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };
})();
