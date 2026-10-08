# Physics engine (C++ → WebAssembly)

| File | What it is |
|---|---|
| `physics.cpp` | Ball physics: integration, spin, walls, swept paddle collisions, AI prediction, gravity wells. |
| `build.ps1` / `build.sh` | Compile `physics.cpp` with clang and embed it in the game. |
| `background_sim.cpp` | Particle simulation for some animated backgrounds (rain, stars). Built with Emscripten; output is `game/js/physics/background-sim.*`. |

## Building

`physics.cpp` needs no Emscripten — plain clang with the `wasm32` target and
`wasm-ld` (LLVM 14 or newer):

- **Windows:** `winget install LLVM.LLVM`, then run `physics\build.ps1`
- **macOS / Linux:** install LLVM/clang + lld, then run `physics/build.sh`

The script writes `physics/physics.wasm` (ignored by git) and
`game/js/physics/physics-binary.js`, which embeds that wasm as base64. The
embedded copy is what the game loads, so it starts instantly and also works
from `file://`.

## How the game uses it

[`game/js/physics/physics-core.js`](../game/js/physics/physics-core.js)
instantiates the module and exposes `window.PhysicsCore`:

| Call | Used by |
|---|---|
| `integrate(ball, dt, height)` | `Ball.integrate` every physics step (240 Hz) |
| `collidePaddle(ball, paddle, isLeft, speedIncrease, maxAngle, dt)` | `Game.checkPaddleCollision` |
| `predictY(ball, targetX, steps, height)` | the AI controller |
| `gravityWell(...)` | gravity wells in Gravity mode |
| `reset(ball, x, y, speed, angle, dir)` | serving |

Ball state moves through a 16-float slot in wasm memory (layout documented at
the top of `physics.cpp`), so no memory is allocated per frame.

`physics-core.js` also contains a JavaScript port of the same model. It runs
only if WebAssembly can't load, and must be kept in step with `physics.cpp`
when the tunables change. The game logs which backend is active, and **F2**
shows it in-game.

## Tuning

The constants at the top of `physics.cpp` control the feel:

| Constant | Effect |
|---|---|
| `MAGNUS` | How strongly spin curves the ball |
| `SPIN_DECAY` | How fast spin wears off (per second) |
| `PADDLE_BRUSH` | Spin gained from a moving paddle |
| `PADDLE_ENGLISH` | Share of paddle velocity carried into the ball |
| `WALL_GRIP` | How much spin converts to forward speed off the rails |
| `WALL_REST` | Bounciness of the rails |
| `DRAG` | Air drag |

Per-hit speed-up per mode is in `Game.getPaddleSpeedIncrease`
(`game/js/core/game.js`).
