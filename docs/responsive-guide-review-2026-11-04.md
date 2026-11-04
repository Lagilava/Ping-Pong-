# Responsive and first-match guide review — 2026-11-04

## Scope

The first-visit guide opens over setup for Classic, Zombie, Gravity, Speed and Obstacle, and over the Custom workshop for Custom matches. It has three selectable, animated examples, a visible objective and focused step text. Closing it returns to setup; later visits open setup directly. The Tutorial button replays it. The separate first-match touch-controls hold remains in place after the intro.

The animation uses CSS transforms on a few small elements and stops when the dialog is hidden. Reduced-motion preferences show a static scene. The menu's WebGL loop pauses while the guide covers it.

## Viewport checks

Browser automation exercised the six guides and replay at 320×568, 390×844, 640×360, 768×1024, 1024×768, 1024×600, 1366×768, 1920×1080 and 2560×1080. It checked scene visibility, navigation target sizes, dialog bounds, page overflow and first-visit persistence. It also checked that the animation changes position at 320×568.

At the same nine sizes, a second browser pass checked menu, Classic setup, settings, Custom workshop, reachable Custom start and match canvas. The earlier mobile review contains all settings tabs, six mode screens, gameplay, pause, online lobby, Forge and results at phone orientations. Screenshots are in the downloadable review bundle.

## Mobile rendering changes

- Automatic phone/tablet canvas tiers use 1× or 1.25× CSS resolution, with the explicit Ultra setting retaining 2×. Decorative scenery is capped at 768×432 pixels for most modes and 1024×576 for Gravity. The ball, paddles and HUD keep their normal draw path.
- Automatic mobile scenery runs at 20–30 updates per second depending on tier. Ability button labels and rings update at 30 Hz; touch steering and the thumb pad still update every display frame.
- The thumb-pad rectangle is reused until settings or viewport dimensions change. The responsive browser check verifies reuse and invalidation.

These are pixel-work and update-budget reductions, not measured real-device frame-rate claims. Playwright ran in installed Chrome on a desktop host. Real iOS Safari, Android hardware, browser zoom, and a networked peer match remain device-level checks before claiming universal compatibility.

## Code review and verification

All 30 `*.test.js` scripts passed. `mode-guide.browser.js` and `responsive-layout.browser.js` passed their viewport flows. The offline asset manifest check and `git diff --check` passed. The render-resolution test confirms the new mobile scenery ceiling for every mode and unchanged desktop high-quality resolution. The menu-frame test confirms the covered guide suspends GPU menu work.
