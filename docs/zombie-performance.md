# Zombie scenery budget

Zombie scenery uses a maximum 1024×576 texture on desktop or 768×432 on mobile, preserving aspect ratio. Only scenery is scaled; game entities and UI retain native resolution. Scenery refreshes at up to 30 Hz desktop / 24 Hz mobile, respecting slower performance governor tiers. Simulation and gameplay rendering keep their existing cadence.

Fixed sky, cemetery, moonlight wash, lantern spill, edge lighting and readability shading are baked together on resize. Moving rays and their masks, intermediate canvases and screen blend have been removed. Fog positions scale from arena coordinates into the scenery texture.

The cemetery accents share one 1024x1280 transparent WebP atlas (about 348 KiB transferred, 5 MiB decoded). Ten rows contain eight aligned frames each. Fourteen visible accents use cropped image draws; ordinary cycles use 6 fps with a ping-pong loop, the raven 3 fps, and the bell 2 fps followed by a long rest. Lanterns retain amber highlights; other material uses a muted green-blue moonlight grade. Small distant figures, grass, cloth and a raven sit below the central ball lane. No per-frame filters, gradients or sprite textures are created. Loading is lazy; failed downloads leave the procedural scenery and original static bell available.

## Validation

A controlled Chromium software-canvas comparison at 1366×768 and touch 844×390 used 24 enemies across all four types, wave 8, and forced a scenery redraw each sample. After 10 warmup draws, the median of 20 full-scene renders changed:

| Viewport | Before | After |
| --- | ---: | ---: |
| Desktop | 40.5 ms | 18.7 ms |
| Mobile size | 15.8 ms | 9.2 ms |

These historical measurements predate the sprite accents and ray removal; they are not current device FPS. Ordinary play reuses cached scenery between refreshes. Regression tests cover texture limits, cache reuse, slower governor tiers, atlas crop bounds, fixed sprite anchors, animation advancement, missing-atlas fallback and removal of moving ray methods.
