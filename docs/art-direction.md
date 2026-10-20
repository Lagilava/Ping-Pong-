# Art direction: Neon Broadcast

Audit finding: the key art, mode scenes and court backgrounds had strong identities, but the chrome around them did not. `ui-refresh.css` had forced every panel to system sans on flat navy, the HUD used Arial and a stock iOS-blue taunt bubble, Zombie used Georgia and mono one-offs, and accent colours changed from screen to screen.

One skeleton for every surface (`game/css/art-direction.css`, canvas twin `game/js/core/art-direction.js`):
- Type: Orbitron for titles, labels, numerals. Rajdhani for copy (15px minimum, weight 500+).
- Colour: each mode owns an accent plus a partner, set on `body.<mode>-mode` and `[data-mode]`. Player stays cyan and the AI magenta everywhere.
- Shape: the plate (sharp top-left and bottom-right corners, rounded others, hairline accent border, accent rule on the top edge). Used by panels, buttons, cards, toasts, taunts, ability pill and in-match notices.
- Motion: one ease, 180 ms feedback, 320 ms panel rise, off with reduced motion.
- Cost: static CSS, plus one extra path fill on two small canvas chips. No new per-frame blur or full-screen layers.

Mode accents: Classic #ff3a5c, Zombie #6ddc4f, Gravity #8f9bff, Speed #ffbe00, Obstacle #ff9a3c, Custom #00ffc8.
