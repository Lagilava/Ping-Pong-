# Ping Pong — Neon Edition

A browser ping pong game with five arenas that each play differently, a ball
physics engine written in C++ and compiled to WebAssembly, GPU shader
post-processing, and a level/XP/achievement system.

![Main menu](docs/screenshots/menu.jpg)

## Play it (testers start here)

**Online, no install:** https://lagilava.github.io/Ping-Pong-/ (works on PC and phone;
updates a minute or two after each push to `main`).

**Windows:** double-click **`Play Ping Pong.bat`**.

That's it — nothing to install. The batch file starts a tiny local web server
using PowerShell (built into Windows) and opens the game in Chrome or Edge.
Keep the small console window open while you play; close it to stop.

- **Esc** pauses · **W / S**, or hold the mouse button / touch and drag, moves the left paddle · **↑ / ↓** moves
  the right paddle in local 1v1 · **Space** fires the laser power-up
- **Main menu:** **← / →** (or a gamepad's d-pad / left stick) choose a mode,
  **Enter** (**A**) selects it, **Esc** (**B**) backs out of the opponent picker.
  The mode you played last says *Play again* and is where the selection starts.
- **Gamepad:** left stick or d-pad moves (analog), **A** fires the laser / skips
  intros, **Start** pauses; a second pad controls the right paddle in local 1v1.
  Controllers rumble on hits and goals.
- **Phones / tablets:** play in landscape (the match pauses if you turn the
  phone upright; Android goes fullscreen and locks landscape when a match
  starts). Drag anywhere on your half to move your paddle (it follows your
  finger's movement, so your finger never covers the ball); tap with a second
  finger to fire the laser. Instant replays never interrupt a match on mobile:
  after a great point a **▶ REPLAY** chip shows for a few seconds, so tap it
  only if you want to watch.
- **F2** shows a performance readout: FPS, detected display refresh rate,
  quality tier, render scale, shaders and physics backend.

- Intros always play, and **Esc** closes them: on the boot screen, during the
  boot cinematic (any key works there too) and during a match intro (or use
  the **Skip intro** button). After the first match, match intros are short.
- Your progress (XP, achievements) is saved in the browser on this PC.

In local Speed, Gravity and Obstacle matches, **Space** activates the arena
ability (P2: **Enter**; gamepad: **A**; mouse: right-click; touch: second finger).
Speed's Overcharge opens a short slow-motion parry window near the paddle and
fires a Sonic Return on contact. Gravity's Wormhole swallows the ball as it passes a
black hole and fires it out of another black hole, aimed at the
opponent's goal; each warp makes the point worth +1 (up to 3). In Obstacle, roll the Lucky Dice: 6 Star power,
5 shooting balls, 4 pulls the ball to your paddle, 3 big paddle, 2 no luck,
1 fast ball. The on-court label shows when each ability is ready and when the
ball is in range. Online
matches currently use the standard mode rules without these active abilities.

### Let testers anywhere play it (PC + mobile)

Double-click **`Share Online (PC + Mobile).bat`** on the Windows PC that has the
game. After a few seconds it shows a public link like
`https://some-random-words.trycloudflare.com/` (also copied to the clipboard)
and opens a page with a QR code for phones. Send that link to anyone, in any
country: they open it in Chrome, Edge, Safari or Firefox on a PC or phone and
play, with nothing to install. You can play on your own PC at the same time.

- Each tester plays their own game in their own browser; their progress is
  saved on their device.
- It uses a free Cloudflare quick tunnel, so there's no account to make and no
  router or firewall setup. The first run downloads Cloudflare's
  `cloudflared.exe` (about 60 MB) into `tools\bin`.
- Only the `game/` folder is shared, read-only. The link is random, changes on
  every run, and stops working as soon as you close the window.
- The game is about 50 MB, mostly music that streams as it plays, and it's sent
  from your PC, so your upload speed decides how fast testers' first load is.
- The QR code image comes from api.qrserver.com.

**Other systems:** serve the `game/` folder with any static web server, e.g.
`python -m http.server 8080 --directory game`, then open
<http://127.0.0.1:8080/>.

### Play online with a friend

Pick **Online** in the opponent dialog (or **🌐 Play Online** on the Custom
screen). One player chooses **Host** and gets a five-letter room code plus an
invite link; the other chooses **Join** and types the code or opens the link.
The host picks any mode (Classic, Zombie, Gravity, Speed, Obstacle or Custom)
and starts the match. On a phone, **Copy invite link** opens the share sheet.

- It is peer to peer over WebRTC: the two browsers talk directly, and PeerJS's
  free public broker is only used to find each other. There's no game server
  to run.
- The host plays the left paddle, the guest the right; either can pause, and
  both press **Play again** for a rematch. **Change mode** takes both players
  back to the room to pick another mode. The lobby shows the ping and the
  series score.
- Online Zombie is a straight duel in the graveyard arena (the waves are a
  single-player thing); Speed plays as it does locally.
- If the connection drops, the match freezes and both sides try to reconnect
  for 45 seconds. Reloading the page puts you straight back in: a guest rejoins
  the running match with the score intact, a host reopens the room on the same
  code. If the guest leaves, the host's room stays open on the same code.
- A third player who tries the code is told the room is full.
- Local 1v1 on one keyboard still works in every mode.
- Some strict school, office or mobile networks block peer-to-peer
  connections; the lobby says so and suggests another network (a phone
  hotspot often works).

### Settings

**Settings** opens from the pause menu, the match setup dialog and the Custom
screen, and saves as you change it. Tabs: Gameplay (computer skill, points to
win, power-ups, replays, AI trash talk, auto-pause), Paddles (a paddle
design for each mode, for your paddle and your opponent's), Controls (paddle
speed, key rebinding for both players, vibration), Display (screen
shake, impact flash, particles, scoreboard size, FPS counter), Audio, and
Accessibility (reduce motion, high-visibility ball, menu text size, Noir
mode: the whole game as a black-and-white film with grain, flicker and
scanlines).

Paddle designs: Classic, Satelliten, World Shield, AI Rebel and Prizma. In
online matches each side shows the design its own player picked; the Zombie
boss keeps its own look: a horned magma demon whose jaws slide out and prise
open as it charges its fire breath.

### Custom backgrounds

The **Forge** and the Custom screen's background preview draw the selected
background live, exactly as the match will, and the Forge's
**Background** button picks a built-in world or imports an image or code.
Imported backgrounds also appear in the Custom screen's background menu. Code
runs in a locked sandbox (no page access, storage or network). Two formats are
accepted, and the import dialog has a ready-made prompt to paste into Claude,
ChatGPT or Codex:

- **Canvas 2D JavaScript:** `function draw(ctx, w, h, t, game) { ... }`, called
  every frame. `game` has `ballX`, `ballY`, `speed`, `hit`, `goal`,
  `scoreLeft`, `scoreRight`. Optional `setup(ctx, w, h)`.
- **GLSL shader, Shadertoy style:** `void mainImage(out vec4 fragColor, in vec2
  fragCoord)` with `iResolution`, `iTime`, `iBall`, `iSpeed`, `iHit`, `iGoal`,
  `iScore`, `iMouse`. No textures.

### Getting 120 FPS on a laptop

The game runs at your display's refresh rate and adapts its quality to hold it.

1. Set the laptop screen to its highest refresh rate (Windows: *Settings → System
   → Display → Advanced display → Choose a refresh rate*).
2. Plug the laptop in — on battery, Windows and the GPU often cap frame rates.
3. Launch with `Play Ping Pong.bat`: it starts the browser with the dedicated
   GPU preferred (`--force-high-performance-gpu`) and GPU rasterisation on.
4. Press **F2** in a match to check the frame rate and quality tier.

On a 60 Hz screen you can run `"Play Ping Pong.bat" uncapped` from a command
prompt to unlock frame rates above 60 (expect some screen tearing).

## Five arenas, one engine

| Mode | What changes |
|---|---|
| **Classic** | The straight duel: fast, clean, no gimmicks. |
| **Zombie** | Hold the line for ten waves: smash every zombie or knock out the boss to clear a wave. Five lives for the run; the ball getting past you or a zombie reaching your barricade costs one. Wave 10 is the boss fight. |
| **Gravity** | Black holes bend the ball. Use the Wormhole as it passes one and it warps out of another black hole, faster, aimed at their goal. Each warp makes the point worth +1 (up to 3). |
| **Speed** | The ball keeps accelerating; reaction challenges interrupt the rally. |
| **Obstacle** | Moving gates and nodes carve up the court, with a Rocket League and Mario twist: boost pads launch the ball, ? blocks pay out coins, Turbo or Star power, coins arm a one-goal shield, the Lucky Dice rolls a random power, and goals explode in confetti. |

Plus **Custom** (local 1v1 with your own paddles, background, music and
power-ups, played on an arena you build in the **Forge**: place walls, bumpers,
spinners, moving gates, black holes, boost pads, ? blocks and coins, set the
rules (score to win, ball speed, rally speed-up, paddle size, arena gravity),
save maps and share them as codes), **Ball Studio** (a ball skin editor), local
1v1 for any mode, and a persistent level / XP / achievement system.

In Custom Match, paste a YouTube, Spotify, SoundCloud, or Apple Music URL in
the music field and choose **Play link**. The provider's player remains
available during the match; use its controls if the browser blocks autoplay.
Direct audio URLs and local audio files also work. The Forge editor has an
object inspector, duplicate/delete controls, and undo/redo.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/classic.jpg" alt="Classic mode" /><br/><sub><b>Classic</b></sub></td>
<td width="50%"><img src="docs/screenshots/gravity.jpg" alt="Gravity mode" /><br/><sub><b>Gravity</b></sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/zombie.jpg" alt="Zombie mode" /><br/><sub><b>Zombie</b></sub></td>
<td width="50%"><img src="docs/screenshots/obstacle.jpg" alt="Obstacle mode" /><br/><sub><b>Obstacle</b></sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/pause.jpg" alt="Pause menu" /><br/><sub><b>Pause menu</b>: resume, restart, settings, audio, help, quit</sub></td>
<td width="50%"></td>
</tr>
</table>

## How it plays: the physics

Ball physics live in [`physics/physics.cpp`](physics/physics.cpp), compiled to a
3.5 KB WebAssembly module that's embedded in the game (so it also loads from
`file://`). A JavaScript port of the same model takes over only if WebAssembly
is unavailable.

- **Spin you can see.** Moving the paddle as you hit brushes spin onto the ball
  (Magnus effect), so it curves in flight. Spin decays over time and kicks the
  ball forward off the side rails.
- **English.** Some of the paddle's motion carries into the return.
- **Aim by contact point.** Centre hits stay flat; edge hits angle sharply.
- **No tunnelling.** Paddle collisions are swept along the ball's path, so even
  the fastest balls can't pass through a paddle between frames.
- **Rallies build gradually** instead of jumping to max speed.
- **Impact feel:** hit-stop, paddle recoil and squash, ball squash/stretch,
  trauma-style screen shake with a directional camera kick, and shader
  shockwaves, all scaled by how hard the ball was hit.
- **Readable spin:** arcs orbit the ball at the speed and in the direction of
  its spin, so you can see a curving shot coming.
- **Sound you can feel:** layered impacts (transient click, pitched body, low
  thump on hard hits) that get louder and brighter with speed, panned to where
  they happen; the two paddles are pitched differently: ping… pong.
- **Rallies build:** a live rally counter grows and warms in colour, with a
  callout every 5 hits; returning the ball off the very tip of the paddle
  earns a **CLUTCH!** slow-mo beat. The ball's trail heats up with speed.
- **Living paddles:** on top of each paddle's design, a light band sweeps
  along it, the striking face lights up and the corner brackets tighten as
  the ball comes in, outlines trail it at speed and a ring snaps out on
  contact (plain strokes, ~0.05 ms per paddle; bloom adds the glow).
- **Every point lands:** goals get a shockwave, flash and camera punch, then a
  short telegraphed serve (countdown ring + direction chevrons) towards the
  player who conceded.
- **Mouse/touch control has real momentum**, so mouse players can put spin
  and english on the ball too, and paddles are interpolated between physics
  steps so they stay smooth on 144/165 Hz screens.
- The AI predicts the ball with the exact same C++ integrator, so it reads
  curving shots; difficulty limits how far ahead it can see.
- **The AI plays shots on purpose** ([`game/js/ai/ai-opponent.js`](game/js/ai/ai-opponent.js)):
  it picks where on its paddle to take the ball to aim away from you,
  fakes one angle and sweeps to the other, swipes for curve, and learns
  which side you miss on. Each match it has a style (corners, tricks,
  wall or bully) and it changes plan when a tactic stops working. It eases
  off with a big lead. Its trash talk reacts to what you actually did:
  moving the wrong way, freezing, falling for a fake, edge hits, spin.

## Graphics

- **Game:** the playfield is drawn with Canvas 2D, then run through a WebGL
  post-process ([`game/js/render/post-fx.js`](game/js/render/post-fx.js)):
  two-level bloom, a procedural lens-dirt texture lit by the bloom, impact
  shockwave ripples, chromatic punch on hard hits, per-mode colour grading,
  vignette, scanlines and film grain.
- **Menu:** a Three.js scene with a storm-sea court shader, a procedural carbon
  weave court texture, an animated aurora and starfield sky shader, and its own
  bloom pass ([`game/js/menu/menu-bloom.js`](game/js/menu/menu-bloom.js)).
- **Adaptive quality:** `PerfGovernor` learns the display refresh rate and,
  if frames are missed, steps down glow, particles, render resolution,
  background animation rate and post-fx quality (the lowest tier turns the
  shader pass off) — then steps back up when there's headroom. At the top
  tier animated backgrounds redraw every frame, so nothing judders at 120 Hz.

## Project layout

```
Play Ping Pong.bat        Double-click to play (Windows)
Share Online (PC + Mobile).bat   Public link + QR code so remote testers can play
game/                     Everything the browser loads
  index.html                Intro / boot screen
  play.html                 Menu + game
  ball-studio.html          Ball Studio skin editor
  css/                      Stylesheets (incl. locally bundled fonts)
  js/
    core/                   Game class, globals + quality governor, vectors, boot
    entities/               Ball, paddles, power-ups, gravity wells
    modes/                  Zombie boss, obstacle course + arcade layer
    render/                 Background renderer, WebGL post-processing
    menu/                   Three.js menu + menu bloom
    physics/                WebAssembly physics bridge (+ background simulation worker)
    audio/  fx/  systems/  ui/  app/
    vendor/                 three.js r128, anime.js (no CDN needed)
  assets/                   audio/, fonts/, images/
physics/                  C++ source for the physics engine + build scripts
tools/serve.ps1           Zero-dependency local web server used by the .bat files
tools/share.ps1           Cloudflare quick tunnel for "Share Online"
docs/screenshots/         Images for this README
```

## Rebuilding the physics engine

Only needed if you change `physics/physics.cpp`. You need clang with the
WebAssembly target (LLVM 14+; on Windows `winget install LLVM.LLVM`):

```
physics\build.ps1        (Windows)
physics/build.sh         (macOS / Linux)
```

This regenerates `game/js/physics/physics-binary.js`. See
[`physics/README.md`](physics/README.md) for details.
