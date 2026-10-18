# Obstacle mode: sunset citadel

The arena now matches `assets/images/menu-art/obstacle.webp`: suspended basalt-and-bronze platforms, amber seams, violet sunset clouds and cyan energy waterfalls. The 1600×900 WebP backdrop (~188 KiB) was generated using the menu card as its reference. Bright architecture stays at the perimeter; a baked soft shade keeps the ball and real hazards readable. Portrait layouts add softly masked corner crops so the architecture survives narrow framing.

`ObstacleSkyScene` bakes the image, shading, bronze grid and court corners into one texture, capped at 1280×720 desktop / 960×540 mobile. Resize, grid changes and image readiness invalidate the cache. Failed art retains a procedural sunset. Collision geometry, route colours and controls are unchanged.

`ObstacleSkyShader` adds cyan shimmer, travelling amber seam glints and subtle drifting cloud light in one pass over the cached texture. `ObstacleWaterfalls` adds clearly downward-moving ribbons on both GPU and canvas paths. It extracts small cyan silhouettes once from the baked scenery (a maximum 640×360 sample), caches their masks and streak tiles, and only composites those small regions each redraw. Stonework and court markings stay fixed. It affects scenery only, uploads the texture only when it changes, and keeps all ambient movement (waterfalls, cloud light, falling glints) with reduced motion enabled. Software WebGL, unavailable/lost contexts and consistently expensive cross-canvas copies use the cached canvas scene. The scene stays on the existing background refresh cadence rather than the gameplay cadence.

## Coin-to-shield exchange

A pickup first increases the coin balance. If no coin shield is active, it immediately reserves one-goal protection, then spends one coin when its 0.58-second gold flight reaches the moving owner paddle. The HUD shows the reduction and the shield brightens with a baked cyan flare and expanding ring. Additional coins bank while the shield is active; the next pickup after it breaks buys a replacement. Protection is never delayed by cosmetic travel. Flights use normalized start positions, follow the current paddle, and are capped at 32; dropped cosmetics still settle their payments. Reset clears pending payments and effects.

Online hosts author rewards and payments, and send coin-flight events to guests. Guest effects never change the authoritative balance. The mobile coin HUD sits above the dice control.

Validation:

- `node tests/obstacle-sky-scene.test.js`: cache reuse, resolution limits, grid changes, async art readiness and missing-art fallback.
- `GAME_TEST_URL=http://127.0.0.1:8080 node tests/obstacle-sky-shader.browser.js`: actual GLSL compilation/rendering, visible animation, explicit shader pause, texture reuse and GPU context-loss fallback. Requires Playwright, Chromium and a server serving `game/`; `CHROMIUM_EXECUTABLE_PATH` selects another Chromium binary. Software GL is enabled only in this test.
- Browser checks at 1366×768, 844×390 and 390×844: texture reuse, mode switching, opening zoom and no page errors.
- Same Chromium software-canvas comparison, 1366×768 with six obstacles and forced background redraw: median full-scene render changed from 37.3 ms to 14.4 ms (30 measured draws after 20 warmups). This measures comparative cloud rendering cost, not physical-device FPS or hardware shader cost.

Additional checks: `node tests/obstacle-coin-shield.test.js` covers pickup/spend ordering, immediate protection, surplus coins, replacement shields, solo/local/online ownership, bounded effects and reset. `node tests/obstacle-waterfalls.browser.js` verifies downward displacement, exact silhouette clipping and mask reuse without WebGL. Desktop and landscape/portrait mobile browser checks verified real waterfall motion, ambient motion under reduced motion, coin flights, a visible 3→2 payment, shield flares, HUD bounds and reset, with no page errors. In the cloud software-canvas test, the small waterfall overlays alone had medians of 0.3 ms desktop and 0.1–0.2 ms mobile; these are comparative render costs, not device FPS.
