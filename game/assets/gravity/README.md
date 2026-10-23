# Gravity hybrid artwork

Generated with OpenAI ImageGen on 24 October 2026.

- gravity-scene-hd.webp: native 1672 x 941 background, quality 94 WebP, 559048 bytes.
- gravity-planets.webp: 1774 x 887 transparent two-planet atlas, 425480 bytes.
- gravity-well.webp: 512 x 512 transparent vortex sprite, 77570 bytes.

The HD plate contains no fixed planets. Two separately drawn planets drift and
rotate; 72 stars move at different speeds and twinkle, with eight cross sparkles.
The backdrop, planets and well use three shared image requests per page. No
new textures or gradients are created while drawing warm animation frames.

Gravity scenery caps: High/Ultra 1920 x 1080, Medium 1536 x 864,
Low/mobile 1024 x 576, never larger than the logical viewport. Scenery still
updates at up to 30 Hz desktop / 24 Hz mobile independently of gameplay.
The quality governor reduces the resolution budget when frame times worsen.

The full-screen post-process and live Canvas shadows remain disabled for
Gravity. Existing well forces and the buffered Wormhole input are unchanged.
The old gravity-scene.webp remains available in history/checkout but is no
longer requested. Failed new images retain the bounded procedural fallback.
