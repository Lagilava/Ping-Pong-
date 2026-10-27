# 4K artwork and rendering

All 32 shipped raster images under `game/assets` were locally enlarged on
27 October 2026. Full-screen Speed, Gravity and Obstacle plates are at least
3840 × 2160. Other sprite atlases, menu art, material textures, HUD art and
Custom Match preview images were doubled. `4k-assets.json` records every
original and delivered size.

The process uses Lanczos resampling and mild RGB sharpening. Transparent
images are resized with premultiplied alpha to avoid dark cutout fringes.
These are enlarged versions of the original artwork, not AI-restored detail.
Classic and Zombie scenery are procedural and now bake at the chosen display
resolution; their illustrated accents and sprites use the enlarged atlases.

`PPResolution` gives every mode the same desktop scenery limits: High/Ultra
3840 × 2160, Medium 2560 × 1440, Low 1280 × 720. Logical 1920 × 1080 viewports
at 2× device density can therefore draw full 4K scenery. The gameplay backing
surface also has an 8,294,400-pixel ceiling. Mobile retains its smaller caches.
Auto can reduce quality if the device cannot sustain its target frame rate.
Use Display → Visual quality → High or Ultra to keep the 4K scenery budget.

Speed's prop textures, Gravity's surface maps, Classic's crowd atlas and
Zombie's articulated hand buffers scale with quality. Atlas source rectangles
use source dimensions; enlarged enemy sprites retain their original logical
anchors and destination sizes. No collision geometry was enlarged.

Validation:

- `node tests/render-resolution.test.js`
- `node tests/asset-url.test.js`
- `node tests/all-modes-4k.browser.js` with `game/` served on localhost:8080
  and Playwright installed. `GAME_TEST_URL` changes the origin;
  `VISUAL_OUTPUT` saves native 4K scene captures.
- Existing artwork, material, cache, animation and quality tests.

Browser checks cover native 4K, a 1080p viewport at 2× pixel density, and a
mobile viewport. Software-rendered timing samples are diagnostic only; they
are not hardware GPU frame-rate guarantees.
