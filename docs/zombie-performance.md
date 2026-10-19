# Zombie scenery budget

Zombie scenery uses a maximum 1024x576 texture on desktop or 768x432 on mobile, preserving aspect ratio. Only scenery is scaled; gameplay entities and UI retain native resolution. Background motion refreshes at up to 30 Hz desktop / 24 Hz mobile, respecting slower governor tiers.

The depth-separated sky, scenery, animated accents and atmospheric grade are flattened into one opaque cache at 6 fps, rather than recomposited through full-screen plates on every background refresh. Hands keep their existing faster cadence. Ground haze is baked; twelve live translucent fog circles and their textures/simulation have been removed. Moving moonlight rays remain removed.

Accents share one aligned 1024x1280 transparent WebP atlas (348 KiB transferred, 5 MiB decoded). Fourteen visible accents use cropped image draws only when the scene cache advances. Ordinary cycles use 6 fps, the raven 3 fps, and the bell 2 fps with a long rest. Loading is lazy; failure leaves procedural scenery and the static bell available. The scene cache adds at most 2.25 MiB decoded on desktop and is released on cleanup.

Zombie gameplay uses direct Canvas output. Its scenery already contains lighting and grading, so this avoids the full-resolution Canvas-to-WebGL upload, bloom and composite on every frame. Undead Pull uses its existing Canvas visual fallback. Live shadow blur is disabled in this mode, preventing the governor from increasing Canvas blur when WebGL is off. Enemy image scaling uses bilinear filtering. Switching modes restores governor-controlled effects and high-quality filtering; tier changes cannot re-enable zombie post-processing.

## Validation

A controlled local Chromium comparison at 1366x768 used 24 animated enemies across all four types at wave 8, an identical seeded setup, the menu closed, and a forced background refresh each frame. Frame delivery was measured over 119 frames after warmup, before pixel readbacks could change Canvas rendering behavior.

| Metric | Before | After |
| --- | ---: | ---: |
| Mean frame interval | 31.1 ms | 16.7 ms |
| Effective throughput | 32.2 fps | 60.0 fps |
| 95th-percentile frame interval | 116.5 ms | 17.7 ms |
| Median JS render submission | 1.9 ms | 1.3 ms |

These are comparative browser measurements, not a guarantee for every device. The test forces more background refreshes than ordinary play. A separate synchronized draw/readback check measured 62.4 ms to 38.1 ms median; those numbers include readback overhead and are not gameplay frame times.

Browser checks verified effects restore when switching modes, governor changes keep zombie effects off, and missing-atlas fallback renders at 768x432. Thirteen regression scripts pass, including a 120-frame test proving twelve scene recompositions, one cache allocation, immediate resize rebuild and cleanup. Existing checks cover scenery resolution limits, slower governor tiers, atlas crop bounds, fixed sprite anchors, animation advancement and gameplay behavior.
