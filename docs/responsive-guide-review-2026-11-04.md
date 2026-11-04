# Responsive and tutorial review — 2026-11-04

## Player flow

Classic, Zombie, Gravity, Speed, Obstacle and Custom each open a three-step guide during first setup. The guide uses screenshots captured from the running game, with numbered markers on controls and device-specific callouts. Custom uses separate screenshots for its arena, appearance and power-up/start screens. Back returns to setup; the Tutorial button replays the guide. Its seen key was advanced so players who saw the earlier animated version receive the screenshot guide once.

During code review, the Speed guide's old save-challenge instructions were removed because the current game does not load that feature. It now teaches the live Overcharge window, Sonic Return and cooldown. Screenshot capture waits for and dismisses first-run mode briefings before recording the court.

The older decorative animation was removed. The 16 JPEG screenshots total about 1.2 MB and are included in offline caching. After the screenshot guide, the duplicate first-match controls card is skipped. A direct match path that bypasses setup still has that card. The menu's WebGL renderer pauses while a guide covers it.

The main menu has a dedicated Settings action by the title. The duplicate Settings icon beside Achievements and a hidden legacy Menu toggle were removed. The actual in-match Menu/pause control remains available.

## Viewports and verification

Browser automation checks all six guides and replay at 320×568, 390×844, 640×360, 768×1024, 1024×768, 1024×600, 1366×768, 1920×1080 and 2560×1080. It checks image loading, active markers, navigation target sizes, dialog bounds, page overflow and first-visit persistence.

The responsive browser pass checks the menu Settings action, setup, settings, Custom workshop, reachable Custom start and match canvas at the same sizes. It confirms the old toggle and duplicate Settings icon are gone, and that no second controls card interrupts a match after the guide. The earlier mobile screenshot review covers settings tabs, all mode screens, gameplay, pause, online lobby, Forge and results at phone orientations.

All 30 `*.test.js` scripts, both browser suites, offline asset validation and whitespace validation passed. Rendering budget tests confirm the mobile scenery ceiling for every mode and unchanged desktop high-quality resolution. These are desktop-hosted Chrome tests; real Safari/Android hardware and a live networked peer match remain outside this pass.
