# Speed mode artwork

Generated with OpenAI ImageGen for this game on 24 October 2026.

- `speed-scene.webp`: synthwave highway environment plate, 1672 x 941, 174468 bytes.
- `speed-props.webp`: transparent palms/lamp/sign/car atlas, 1254 x 1254, 291770 bytes.

WebP encoding uses quality 88. Keep alpha on the prop atlas. The original
generated PNGs are preserved in the conversation. No external CDN is needed.

`game/js/render/speed-art.js` decodes both images once per page and crops the
atlas into textures with a maximum dimension of 384 pixels. Coordinates follow
the actual illustrated layout, not an assumed equal grid. The road horizon is
at 48% height; road projection is widened to match the environment plate.

The environment and overlay caches are limited to 1024 x 576 on desktop and
768 x 432 on mobile. Scenery updates at up to 30 Hz / 24 Hz independently of
ball and paddle rendering. Slower quality settings and static backgrounds are
respected. Lane/grid geometry, traffic and roadside perspective are animated;
lighting, road detail and city/mountain detail are baked into the images.

If either image fails, retain the procedural scene without repeatedly fetching
assets. Custom Match continues using its existing procedural palette.

Validation: `node tests/speed-artwork.test.js`, plus the existing Zombie scenery
budget/cache checks. These check loading/fallback, animation state, texture
reuse and allocation/draw limits; they are not browser FPS measurements.
