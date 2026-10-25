# Background scene compositing

Built-in Custom Match backgrounds and previews use the same world and palette as the corresponding mode. User tone controls are applied after the complete scene is lit. Imported image/code backgrounds retain their existing rendering path.

- `scene-compositor.js` repairs atlas mattes once during decoding/baking: it removes small detached islands, feathers actual alpha boundaries, and replaces saturated extraction fringe with nearby material colour. Animation tiles are isolated so adjacent frames cannot contaminate each other. Interior colour and emissive detail are preserved.
- Speed bakes silhouette shadow stamps, projects them onto the ground away from the sunset, and registers lamp bloom and ground pools to the same perspective geometry. Offscreen props are culled.
- Classic uses attached cloth meshes with travelling wind/fold shading, a bounded set of seated spectators with asynchronous articulated point reactions, and registered moving floor reflections. Cloth rows share their deformed edges so they cannot open cracks. Near banners occlude the beams. Pause/reduced motion holds the wind phase and suppresses random flashes.
- Zombie fingers articulate continuously using cached bone/palm materials and one 128×224 output per hand. Successive poses share their endpoints and remain animated when optional particles are disabled. Planted roots and foreground soil occlude the wrist. Two feathered mist layers move at distinct world-scaled depths; pendulum lanterns keep fixed chain anchors and their glow follows the flame. Cloth and grass deform at their attachment/root. Cemetery sprites are cleaned within their individual animation cells.
- Gravity uses a stable optical sky, latitude-dependent cloud advection on spherical UV maps under a fixed light, and separately occluded rings. Accretion material shears through seven shared soft shells at radius-dependent orbital rates around fixed event horizons; near starlight responds to the live well field. Warm material frames reuse fixed buffers and textures; reduced motion holds their phase. Obstacle retains more cloud/architecture detail and animates its actual waterfall silhouettes instead of unrelated gutter streaks.

All matte processing, texture creation, and material gradients are outside warm frame loops. Existing scene resolution/refresh budgets remain in force.

## Verification

Run the dependency-free regression tests with `node tests/<name>.test.js`. The scene-specific tests cover matte coverage, preservation of emissive interior detail, tile isolation, layering, asset fallback, and cache budgets.

`node tools/check-background-scenes.js /tmp/ping-pong-scenes` additionally uses `@napi-rs/canvas` (a development-only dependency) to decode the real assets and render all five worlds at 1280×720, 1920×1080, and 2560×1080. It verifies animation, warm texture reuse, and pixel agreement between a mode and Custom Match, and exports screenshots plus `verification.json`. These CPU Canvas checks do not substitute for browser/WebGL or hardware frame-rate testing.

`node tools/preview-gravity-motion.js /tmp/gravity-motion [older-gravity-art.js]` exports 100 frames at 20 fps and CPU timings. The optional old renderer produces a side-by-side motion comparison with fixed well centres. Encode those numbered PNGs at 20 fps using ffmpeg to review actual motion rather than still-frame differences.

`node tools/preview-arena-motion.js classic /tmp/classic-motion [before-js-directory]` and the corresponding `zombie` command export six-second, 20 fps landscape sequences using real background updates. A supplied baseline directory contains `classic-art.js` and `background-renderer.js` for side-by-side comparison. The Classic proof includes a scored point so crowd reactions can be reviewed.
