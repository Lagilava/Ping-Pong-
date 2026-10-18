# Obstacle mode: sunset citadel

The arena now matches `assets/images/menu-art/obstacle.webp`: suspended basalt-and-bronze platforms, amber seams, violet sunset clouds and cyan energy waterfalls. The 1600×900 WebP backdrop (~188 KiB) was generated using the menu card as its reference. Bright architecture stays at the perimeter; a baked soft shade keeps the ball and real hazards readable. Portrait layouts add softly masked corner crops so the architecture survives narrow framing.

`ObstacleSkyScene` bakes the image, shading, bronze grid and court corners into one texture, capped at 1280×720 desktop / 960×540 mobile. Resize, grid changes and image readiness invalidate the cache. Failed art retains a procedural sunset. Collision geometry, route colours, coin rewards and controls are unchanged.

`ObstacleSkyShader` adds cyan waterfall flow, travelling amber seam glints and subtle drifting cloud light in one pass over the cached texture. It affects scenery only, uploads the texture only when it changes, and respects reduced motion. Software WebGL, unavailable/lost contexts and consistently expensive cross-canvas copies use the cached canvas scene. The scene stays on the existing background refresh cadence rather than the gameplay cadence.

Validation:

- `node tests/obstacle-sky-scene.test.js`: cache reuse, resolution limits, grid changes, async art readiness and missing-art fallback.
- `GAME_TEST_URL=http://127.0.0.1:8080 node tests/obstacle-sky-shader.browser.js`: actual GLSL compilation/rendering, visible animation, reduced motion, texture reuse and GPU context-loss fallback. Requires Playwright, Chromium and a server serving `game/`; `CHROMIUM_EXECUTABLE_PATH` selects another Chromium binary. Software GL is enabled only in this test.
- Browser checks at 1366×768, 844×390 and 390×844: texture reuse, mode switching, opening zoom and no page errors.
- Same Chromium software-canvas comparison, 1366×768 with six obstacles and forced background redraw: median full-scene render changed from 37.3 ms to 14.4 ms (30 measured draws after 20 warmups). This measures comparative cloud rendering cost, not physical-device FPS or hardware shader cost.
