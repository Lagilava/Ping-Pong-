# Gravity hybrid artwork

Generated with OpenAI ImageGen on 24 October 2026.

- gravity-scene.webp: 1280 x 720 opaque cosmic background; 136350 bytes.
- gravity-well.webp: 512 x 512 transparent vortex sprite; 77570 bytes.

The assets are decoded once. Background animation uses one image with a small
parallax offset and 36 simple stars. Each gameplay well uses one rotating image
and a thin activity ring when excited. Existing well forces, movement and warp
ownership remain in their original modules. Failed images use procedural fallbacks.
The fallback wells composite into bounded 384 x 384 caches at up to 30 Hz.

Gravity disables the full-screen WebGL post-process and live Canvas shadows,
and caps gameplay backing resolution at CSS pixel size. This avoids the scene
upload/bloom/composite cost while preserving baked art detail. Background cache
resolution and cadence remain bounded separately from gameplay.

Wormhole input accepts an early press up to 350 ms before entering well range,
spends cooldown only on activation, and cancels pending presses on a new serve.
Keyboard, touch and gamepad input use the same request path.
