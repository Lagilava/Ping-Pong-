# Gravity hybrid artwork

Generated with OpenAI ImageGen on 24 October 2026.

- gravity-scene-hd.webp: 3840 x 2162 background (originally 1672 x 941).
- gravity-planets.webp: 3548 x 1774 transparent two-planet atlas.
- gravity-well.webp: 1024 x 1024 transparent vortex sprite.

Locally enlarged on 27 October 2026 using Lanczos resampling with premultiplied
alpha and mild color sharpening. This preserves the artwork; it does not
reconstruct missing detail with AI. All asset dimensions are in docs/4k-assets.json.

The HD plate contains no fixed planets. Cloud material moves inside two fixed
planet silhouettes; 72 stars move at different speeds and twinkle, with eight cross sparkles.
The backdrop, planets and well use three shared image requests per page. No
new textures or gradients are created while drawing warm animation frames.

Gravity scenery caps: High/Ultra 3840 x 2160, Medium 2560 x 1440,
Low 1280 x 720, mobile 1024 x 576. High-DPI viewports can supersample up to
these physical-pixel limits. Planet/cloud and well maps also scale with quality. Scenery still
updates at up to 30 Hz desktop / 24 Hz mobile independently of gameplay.
The quality governor reduces the resolution budget when frame times worsen.

The full-screen post-process and live Canvas shadows remain disabled for
Gravity. Existing well forces and the buffered Wormhole input are unchanged.
The old gravity-scene.webp remains available in history/checkout but is no
longer requested. Failed new images retain the bounded procedural fallback.
