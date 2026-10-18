# Zombie enemy animation art

`game/assets/images/enemies/zombie-atlas.webp` is generated, transparent,
cel-shaded artwork. The production atlas uses the game's dark teal / neon
arcade style. The unused realistic concept sheets are not shipped.

The 1536 × 1024 atlas has four rows, in this order:

| Row | Enemy | Existing behavior reflected in the art |
| --- | --- | --- |
| 1 | Shambler | Crooked, ragged, slow marching enemy; one hit point |
| 2 | Runner | Lean red silhouette, forward sprint; fast ball chaser; one hit point |
| 3 | Tank | Broad blue-grey armored silhouette; slow march; four hit points |
| 4 | Spitter | Olive body, luminous throat; keeps range and spits acid; one hit point |

Each row has four locomotion poses and two anticipation/action poses. These
are sprite poses, not additional attack mechanics. The Spitter inflates near
its existing attack timer and opens its mouth for 0.22 seconds when the actual
projectile is emitted. Speed, health, collisions, attack timing and scores are
still defined in the existing game catalog and update code.

`ZombieSprites.artReady` resolves to a boolean. On successful loading, the
renderer identifies each connected silhouette, preserves its antialiased edge,
and aligns its feet in a reusable frame. This accommodates generated claws
that cross a nominal grid cell without importing a neighbor or cutting off a
limb. Processing yields between rows. Per enemy, ordinary rendering uses one
sprite draw and a ground shadow, plus live health/acid indicators; damage uses
a prepared light-colored sprite. The atlas is shared between instances.
Procedural rendering remains available while loading or if the asset fails.

Keep replacement artwork transparent, with six separate full-body silhouettes
per row, and retain the row order and right-facing orientation. The original
image generation outputs remain outside the checkout; only the compressed
436 KB production atlas is required by the game.
