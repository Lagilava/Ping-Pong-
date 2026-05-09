# C++ / WebAssembly Integration — Ping Pong

## What was scaffolded

```
physics/
  physics.cpp        ← C++ physics engine (ball integration, paddle collision, AI prediction)
  build.ps1          ← Emscripten compile script  →  physics.js + physics.wasm
  physics-wasm.js    ← JS bridge: loads wasm, patches the game at runtime
```

`ping_pong.html` and `game-enhancements.js` were updated with minimal, backward-compatible hooks.

---

## Quick-start

### 1. Install Emscripten (one-time)
```powershell
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
.\emsdk install latest
.\emsdk activate latest
.\emsdk_env.ps1          # activates emcc in this shell session
```

### 2. Compile the C++ module
```powershell
cd c:\Users\emi\Desktop\101\PingPong\physics
.\build.ps1
```
This produces `physics/physics.js` and `physics/physics.wasm`.

### 3. Serve the game over HTTP
WebAssembly requires a server (`file://` won't work for wasm).
```powershell
cd c:\Users\emi\Desktop\101\PingPong
python -m http.server 8080
# then open: http://localhost:8080/ping_pong.html
```

### 4. Verify
Open DevTools console — you should see:
```
[WasmPhysics] Ready. physics.wasm loaded successfully.
[WasmPhysics] Ball instance patched — physics running in WebAssembly.
```
The AI's `predict()` now logs a richer simulation (spin, drag, wall bounces) instead of linear extrapolation.

---

## What the C++ module does

| Function | Description |
|---|---|
| `ball_integrate(state, dt, canvasH)` | Physics step: Magnus effect, quadratic air drag, speed clamping, wall bounces |
| `ball_paddle_collide(state, px, py, pw, ph, padVelY, isLeft)` | AABB collision + deflection angle + spin transfer |
| `predict_ball_y(bx, by, vx, vy, spin, r, …, targetX, steps)` | Full trajectory simulation used by AI controller |
| `ball_reset(state, cx, cy, speed, …)` | Reinitialise ball state for new round |

---

## Fallback behaviour
`physics-wasm.js` is **purely additive**. If the `.wasm` file is missing or fails to load:
- Original JS `Ball.integrate()` / `Ball.reset()` / `AIController.predict()` remain in effect.
- No errors are thrown — a `console.warn` is emitted and the game runs as before.

---

## Next steps to go deeper

1. **Move paddle collision detection** into C++ — replace the per-frame `if` checks in `ping_pong.html`.
2. **Rewrite `AIController` in C++** — compile the full personality/difficulty system to wasm; expose `ai_update(dt)` returning `paddle_vel_y`.
3. **Sub-step physics** — call `ball_integrate` 4× per frame at `dt/4` for higher-fidelity tunnelling prevention at very high ball speeds.
