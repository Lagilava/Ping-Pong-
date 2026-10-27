# Speed mode artwork

Generated with OpenAI ImageGen for this game on 24 October 2026.

- `speed-scene.webp`: synthwave highway environment plate, 3840 x 2162.
- `speed-props.webp`: transparent palms/lamp/sign/car atlas, 2508 x 2508.

Locally enlarged on 27 October 2026 using Lanczos resampling with premultiplied
alpha and mild color sharpening, encoded as quality 93 WebP. This preserves
the artwork without AI detail reconstruction. Keep alpha on the prop atlas. The original
generated PNGs are preserved in the conversation. No external CDN is needed.

`game/js/render/speed-art.js` decodes both images once per page and crops the
atlas into textures up to 1536 pixels on High/Ultra (384 on mobile). Coordinates follow
the actual illustrated layout, not an assumed equal grid. The road horizon is
at 48% height; road projection is widened to match the environment plate.

The environment and overlay caches support 3840 x 2160 on High/Ultra,
2560 x 1440 on Medium, 1280 x 720 on Low and 768 x 432 on mobile. High-DPI
viewports use physical pixels within these limits. Scenery updates at up to 30 Hz / 24 Hz independently of
ball and paddle rendering. Slower quality settings and static backgrounds are
respected. Lane/grid geometry, traffic and roadside perspective are animated;
lighting, road detail and city/mountain detail are baked into the images.

If either image fails, retain the procedural scene without repeatedly fetching
assets. Custom Match reuses the same decoded artwork and resolution settings.

Validation: `node tests/speed-artwork.test.js`, plus the existing Zombie scenery
budget/cache checks. These check loading/fallback, animation state, texture
reuse and allocation/draw limits; they are not browser FPS measurements.
