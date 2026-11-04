# Mobile review — 4 November 2026

The phone menu previously required landscape before players could browse settings or choose a mode. The revised menu works upright, shows six arenas in a two-column grid, and opens match setup with one tap. Starting a match remains a separate action.

## Changes

- Portrait rotation prompt now applies during matches. Existing orientation pause behavior remains in place.
- Fullscreen/landscape requests occur on Start match or the explicit fullscreen button, rather than every tap.
- Portrait phones get a scrollable two-column arena grid. Landscape retains the swipeable strip. Arena descriptions use clearer system text; panels use solid reading surfaces and retain their mode artwork and colors.
- Menu, settings, achievement and tutorial close controls have at least 44px touch targets. Mobile focus outlines remain visible.
- Mobile menu scenery renders at approximately 30 FPS. The ball, touch input and match simulation retain their existing cadence. Quality adaptation uses the mobile scenery target, preventing the cap from being mistaken for poor performance.
- Menu scene updates stop while Custom, settings/help or results cover it. Mobile tiles and reading panels avoid stacked backdrop blur.

## Evidence and validation

The screenshot package includes matched before/after captures at 390×844 and 844×390, DPR 2. It covers the menu, all seven settings tabs (including profile), achievements, help, five arena setups and tutorials, five Custom sections, Forge, online lobby, all six gameplay/pause screens, first-run briefings, quit confirmation, rotation prompt, results, intro and Ball Studio. Additional menu captures cover 320×568 and 640×360.

Before `portrait-entry` preserves the original blocking prompt. Other before portrait screenshots temporarily hide that prompt for layout inspection. Results use a labeled UI fixture. Online captures cover the lobby, not a live two-player connection. Screenshots show initial screen content; long panels retain scrolling.

| Controlled menu measurement | Before | After |
| --- | ---: | ---: |
| Frames rendered in two seconds, landscape, Low quality | 113 | 61 |
| Frames rendered in one second with settings open | 57 | 0 |

Low quality disables bloom, giving one counted WebGL clear per menu frame. Measurements use the same viewport and quality setting, sequentially in headless Chrome. This shows less menu render work, not a physical-phone FPS or battery-life guarantee. Uncontrolled counts in the full capture manifests include adaptive quality and multipass bloom; do not compare those as frame rates.

Validation completed:

- All 30 Node unit-test scripts passed; offline asset list is current; `git diff --check` passed.
- Before and after screen sweeps completed with no application browser exceptions.
- Touch-emulated browser checks confirmed portrait browsing, one-tap setup, no fullscreen request during browsing, and preserved match pause on rotation.
- Scheduler tests exercised 60/90/120Hz timestamps with jitter, covered panels and background tabs.
- Narrow-phone and landscape checks found no document horizontal overflow.

## Code review

Reviewed the final diff for CSS specificity, small-screen scrolling, desktop isolation, fullscreen gestures, rotation state and menu frame timing. Fixed a near-deadline timestamp rounding issue that could otherwise render consecutive scenery frames. Two existing test fixtures were stale: the laser gamepad mock used `trigger` instead of `request`, and the dice test expected a period instead of the current ellipsis. Only their fixtures/assertions changed.

Physical Android/iOS testing remains necessary for Safari safe areas, native fullscreen support, thermals and sustained gameplay performance. No live online match was verified.

## Reproduce

```powershell
node tools/mobile-review.js docs/mobile-review before
node tools/mobile-review.js docs/mobile-review after
node tests/mobile-flow.test.js
```

`before` reads the current Git HEAD versions of the changed files; run it before committing, or use a checkout at the baseline commit `b032b835cd84ddc08da134042a080b3425eeae13`. `BROWSER_PATH` selects an installed Chromium executable. The audit serves local files through browser routing and blocks external requests. Generated screenshots are excluded from Git.
