# Definitive Optimization Plan for Ping Pong

## Goal

Make the game run smoother without changing gameplay flow, without automatically lowering particle effects based on device performance, and without introducing regressions.

## Non-Negotiables

- Do not reduce particle counts dynamically based on FPS, render time, device class, or viewport size.
- Do not slow the ball, paddles, timers, AI decision cadence, or match pacing.
- Do not simplify art direction as a fallback path.
- Keep `window.PingPongPerf` as a diagnostics source only, not a visual quality controller.

## Current Hotspots Confirmed in Code

### 1. Adaptive visual degradation that must be removed

- `ping_pong.html` currently reduces fog, orbs, swarm rendering, ground detail, and zombie hand count from live performance data in the zombie background render path.
- Relevant area: `renderZombie()` in `ping_pong.html` around the `window.PingPongPerf` checks and `lowPerf` / `veryLowPerf` branches.

### 2. Per-frame particle sort in the main particle system

- `ParticleSystem.render()` sorts `this.active` every frame before drawing.
- This is expensive and unnecessary for gameplay correctness.

### 3. Ball trail maintenance still shifts arrays every frame when full

- `Ball.integrate()` shifts `trailPoints` contents forward once the trail buffer is full.
- That creates avoidable per-frame memory writes in a core hot path.

### 4. Gravity and zombie rendering still build many gradients and path effects every frame

- `GravityWell.render()` creates multiple radial and linear gradients every frame for each well.
- `BackgroundRenderer.renderZombie()` recreates gradients, radial glows, and decorative geometry every frame even for mostly static layers.

### 5. Collision and attraction code still uses expensive scalar math in JS hot paths

- `updateBallPhysics()` and `updateAdditionalBalls()` use `Math.hypot`, `Math.atan2`, `Math.cos`, and `Math.sin` for magnet attraction.
- `checkPaddleCollision()` allocates a new `Vec2` for the collision normal.

### 6. Some visual systems still use callback-heavy iteration in render paths

- There are remaining `forEach()` calls in hot render/update sections, especially for particles and decorative objects.
- Several of these are small individually but additive across one frame.

## Definitive Plan

## Phase 1: Remove all adaptive quality behavior

This is mandatory first, because the current code still violates the requirement.

### Changes

- Delete all `lowPerf` / `veryLowPerf` branches from `renderZombie()`.
- Always render the full intended fog, orb, swarm, terrain detail, crack detail, and hand layers.
- Keep `recordPerfSample()` and `window.PingPongPerf`, but restrict them to measurement, debug UI, and verification.

### Acceptance criteria

- Visual output no longer changes when FPS drops.
- Two runs on different devices produce the same effect density for the same mode.

## Phase 2: Replace dynamic work with cached rendering, not reduced rendering

This is the core strategy for keeping the same look while improving smoothness.

### Changes

- Split each heavy background into `static`, `semi-static`, and `dynamic` layers.
- Pre-render static zombie scenery to an offscreen canvas on mode init and on resize only.
- Pre-render static gravity well art components that do not depend on current pulse or excitement.
- Convert repeated glows, fog blobs, orb halos, ember glows, and similar soft shapes into reusable sprite canvases or atlases.
- Reuse those sprites via `drawImage()` instead of rebuilding gradients and arc fills every frame.
- Cache size-dependent gradients keyed by width, height, and mode instead of recreating them every frame.

### Specific targets

- Zombie mode sky, moon glow base, horizon tint, terrain silhouette, graves, crack field, and sorted hand base layers.
- Gravity wells: halo base, photon ring base, core glow base, event horizon shell, accretion disk glow plates.
- Fire and lava background particles that currently create per-particle gradients in render loops.

### Acceptance criteria

- Same number of visible effects as before.
- Frame captures remain visually equivalent aside from sub-pixel differences.
- Render time drops primarily because canvas construction work moved out of the frame loop.

## Phase 3: Eliminate avoidable per-frame allocations and array churn

This is the safest deterministic performance work because it does not alter game rules or visual density.

### Changes

- Remove the per-frame `this.active.sort(...)` from `ParticleSystem.render()`.
- If a stable draw order is needed, assign particles to visual buckets at spawn time instead of sorting each frame.
- Replace the ball trail shift logic with a ring buffer over the existing `Float32Array`.
- Replace `Array.forEach()` in hot render/update paths with indexed `for` loops where it avoids callback overhead and hidden allocations.
- Replace `clear()` methods that use callback iteration with indexed release loops.
- Reuse preallocated temporary vectors and scalar locals instead of creating `new Vec2(...)` inside collision paths.

### Specific targets

- `ParticleSystem.render()` and `ParticleSystem.clear()`.
- `Ball.integrate()` trail maintenance.
- `checkPaddleCollision()` normal computation.
- `GravityWell.update()` particle update loop.
- Remaining particle render/update sections in backgrounds that still use `forEach()`.

### Acceptance criteria

- No per-frame sorts in the main particle path.
- No trail-array shifting once the ball has been active for a few seconds.
- Heap allocation rate during gameplay is materially lower.

## Phase 4: Reduce scalar math cost in hot gameplay loops without changing behavior

The goal here is not to change physics, only to compute the same result more cheaply.

### Changes

- Rewrite magnet attraction code to use normalized vector math from `dx`, `dy`, and inverse distance instead of `atan2` + `cos` + `sin`.
- Use squared-distance comparisons before square roots everywhere practical.
- Replace `Math.hypot()` in repeated collision proximity checks with manual squared-distance checks where exact distance is not needed.
- Reuse computed ball speed within each update step instead of recalculating vector length multiple times in the same frame.

### Specific targets

- `updateBallPhysics()`.
- `updateAdditionalBalls()`.
- `checkPaddleCollision()`.
- Any obstacle or power-up checks that still compute full distance unnecessarily.

### Acceptance criteria

- Ball control, spin response, magnet behavior, and paddle collisions feel identical.
- Replays and live play show no new collision jitter or tunneling.

## Phase 5: Push more deterministic simulation into existing WASM hooks

This should only happen after the low-risk JS cleanup above, because it has more regression risk.

### Changes

- Extend the current physics bridge to cover paddle collision resolution, not just ball integration and prediction.
- Move repeated magnet-force math for the main ball and additional balls into WASM if profiling still shows it as a hotspot.
- Keep JS as the source of orchestration and effects, but move pure numeric loops to WASM where they are already structurally isolated.

### Why later

- The project already has a good additive fallback model in `physics/physics-wasm.js`.
- This is powerful, but it is not the first thing to touch if the requirement includes “no bugs”.

### Acceptance criteria

- JS and WASM paths stay behaviorally matched.
- Fallback still works with no runtime errors when WASM is unavailable.

## Phase 6: Tight validation pass focused on regressions, not just FPS

Optimization work here must be validated as a game-quality task, not a benchmark-only task.

### Required test matrix

- Classic, speed, zombie, gravity, and obstacle modes.
- Single-player and multiplayer.
- Match start, scoring, match end, replay, and resize/orientation changes.
- Power-ups, additional balls, shield, lasers, ghost ball, magnet paddle, and gravity wells.
- Long rally test with particles intentionally left enabled.

### Required metrics

- Average `renderMs`, `physicsMs`, and `frameMs` from `window.PingPongPerf`.
- Heap allocation pattern during a 2 to 3 minute active match.
- Count of active particles, additional balls, power-ups, and gravity wells during stress scenes.

### Bug gates

- No missed paddle collisions.
- No duplicated scoring.
- No broken resize state.
- No background desync after replay or mode switch.
- No WASM-only behavior divergence.

## Implementation Order

1. Remove zombie adaptive quality branches.
2. Add offscreen caching for static and semi-static background layers.
3. Remove per-frame particle sort and convert trail shifting to a ring buffer.
4. Replace hot-path trig and distance helpers with cheaper deterministic math.
5. Expand WASM coverage only if profiling still shows physics as a top bottleneck.
6. Run a full regression and performance verification pass.

## What Not To Do

- Do not reduce particle counts based on FPS.
- Do not lower DPR below the current fixed clamp just to mask slowness.
- Do not skip full effect layers conditionally in the frame loop.
- Do not change ball speed curves or paddle responsiveness in the name of optimization.
- Do not introduce background or physics work onto timers that can desync from the main loop.

## Expected Outcome

If implemented in this order, the game should keep the same flow and nearly identical visual presentation while reducing frame spikes from:

- per-frame sorting
- repeated gradient and canvas construction
- hot-path vector allocations
- unnecessary trig and full-distance math
- redundant JS-side simulation work already suitable for caching or WASM

The result should be a smoother game because the renderer and physics paths are cheaper, not because the game is drawing less.