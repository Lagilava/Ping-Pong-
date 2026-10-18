# Zombie scenery budget

Zombie scenery uses a maximum 1024×576 texture on desktop or 768×432 on mobile, preserving aspect ratio. Only scenery is scaled; game entities and UI retain native resolution. Scenery refreshes at up to 30 Hz desktop / 24 Hz mobile, respecting slower performance governor tiers. Simulation and gameplay rendering keep their existing cadence.

Fixed sky, cemetery, edge lighting and readability shading are baked together on resize. Moving moonlight uses one quarter-resolution weighted mask for air and surfaces, followed by one screen blend. The redundant legacy dynamic-light overlay is skipped. Fog positions scale from arena coordinates into the scenery texture.

## Validation

A controlled Chromium software-canvas comparison at 1366×768 and touch 844×390 used 24 enemies across all four types, wave 8, and forced a scenery redraw each sample. After 10 warmup draws, the median of 20 full-scene renders changed:

| Viewport | Before | After |
| --- | ---: | ---: |
| Desktop | 40.5 ms | 18.7 ms |
| Mobile size | 15.8 ms | 9.2 ms |

These measure comparative rendering cost in the cloud, not device FPS. Ordinary play also reuses cached scenery between refreshes. Desktop/mobile browser checks covered all enemy animation frames, actual spitter release, missing-atlas fallback and browser errors. Regression tests cover texture limits, cache reuse/refresh, slower governor tiers, and visible moonbeam drift.
