# Mobile QA Checklist

Date: 2026-03-15
Scope: ping_pong.html, ping_pong_intro.html, paddles_preview.html, loop.html, flamethrower.html, zombie-hand.html

## Devices and Viewports
- Phone portrait: 360x800, 390x844, 412x915
- Phone landscape: 800x360, 844x390, 915x412
- Small phone portrait: 320x568
- Tablet portrait/landscape: 768x1024 and 1024x768
- High-DPI check: devicePixelRatio >= 2

## Main Game (ping_pong.html)
- Intro redirects correctly and transitions to game.
- Canvas fills visible viewport with no clipped bottom area after browser chrome appears/disappears.
- Rotate portrait <-> landscape while in match: paddles and ball remain in-play and do not reset score.
- Touch control in single-player: dragging anywhere controls left paddle smoothly.
- Touch control in PvP: left half controls P1 and right half controls P2 independently.
- HUD remains visible and clickable above safe area insets.
- Buttons are tap-friendly in portrait and short landscape.
- Speed challenge targets stay inside bounds after resize/orientation change.

## Intro (ping_pong_intro.html)
- Intro canvas fills viewport in portrait and landscape.
- No letterboxing or black strip when URL bar collapses/expands.
- Audio unlock flow still starts intro after first interaction.
- Transition to main game preserves the selected viewport dimensions.

## Menu and Overlay
- Start menu card remains fully reachable on small-height landscape.
- Menu can scroll vertically when content exceeds viewport height.
- PvP selector and Back button remain tappable near bottom safe area.

## Standalone Pages
- paddles_preview.html scales full-height correctly on mobile and orientation change.
- loop.html remains centered and sharp (no blur from stale DPR) after rotate.
- flamethrower.html touch aiming and firing works in portrait/landscape.
- zombie-hand.html scene fills viewport and remains crisp after rotate.

## Regression Notes
- Existing lint warnings unrelated to this pass may still appear (inline style and CSS ordering rules in legacy blocks).
- If physics feel different after rotate, capture viewport size before/after and compare paddle/ball scale logs.
