/**
 * physics.cpp — Ping Pong ball physics, compiled to WebAssembly.
 *
 * Built with plain clang (no Emscripten, no libc): see build.sh / build.ps1.
 * The module exports its linear memory plus a handful of extern "C" functions.
 * JS writes ball state into a float slot inside that memory, calls a function,
 * and reads the result back — no allocations happen per frame.
 *
 * Ball state layout (float[BALL_STRIDE]):
 *   [0] pos_x      [1] pos_y
 *   [2] vel_x      [3] vel_y
 *   [4] spin       (rad/s-ish; +ve curves the ball clockwise on screen)
 *   [5] prev_x     [6] prev_y        (position before the last step, for interpolation)
 *   [7] speed      (cached |vel|)
 *   [8] radius     [9] max_speed     [10] min_speed
 *   [11] last_event (bit flags written by the last call, see EVT_*)
 *   [12] impact     (0..1 strength of the last paddle/wall impact, for juice)
 *
 * The model, in short:
 *   - Magnus force: spin pushes the ball sideways proportional to speed, so a
 *     brushed shot visibly curves. Spin decays exponentially.
 *   - Light quadratic drag, and min/max speed clamps.
 *   - Walls: restitution plus spin↔tangential-velocity exchange, so topspin
 *     "kicks" off the rails instead of reflecting like a mirror.
 *   - Paddles: swept test of the ball's path against the paddle face expanded
 *     by the radius (works with a moving paddle), so the ball never tunnels
 *     at high speed. Return angle depends on where it hit; paddle motion adds
 *     velocity ("english") and spin.
 */

#include <stdint.h>

#define EXPORT extern "C" __attribute__((visibility("default")))

enum {
    S_PX = 0, S_PY, S_VX, S_VY, S_SPIN, S_PREVX, S_PREVY, S_SPEED,
    S_R, S_MAX, S_MIN, S_EVENT, S_IMPACT,
    BALL_STRIDE = 16
};

enum {
    EVT_WALL_TOP    = 1,
    EVT_WALL_BOTTOM = 2,
    EVT_PADDLE      = 4,
    EVT_PADDLE_EDGE = 8,
};

// ─── Tunables ───────────────────────────────────────────────────────────────
static const float MAGNUS        = 0.030f;   // lateral accel = MAGNUS * spin * |v|
static const float SPIN_DECAY    = 0.90f;    // 1/s exponential decay rate
static const float SPIN_MAX      = 9.0f;
static const float DRAG          = 0.000045f;// quadratic drag coefficient
static const float WALL_REST     = 0.96f;    // normal restitution off the rails
static const float WALL_GRIP     = 0.22f;    // how much spin converts to tangential velocity
static const float PADDLE_ENGLISH= 0.28f;    // share of paddle velocity added to the ball
static const float PADDLE_BRUSH  = 0.0085f;  // spin gained per px/s of paddle motion
static const float SPIN_CARRY    = -0.35f;   // incoming spin is mostly reversed/killed on contact

// ─── Tiny libm (no libc available) ──────────────────────────────────────────
static inline float f_abs(float x) { return x < 0.0f ? -x : x; }
static inline float f_min(float a, float b) { return a < b ? a : b; }
static inline float f_max(float a, float b) { return a > b ? a : b; }
static inline float f_clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline float f_sqrt(float x) { return __builtin_sqrtf(x); }

// exp(x) for the small negative arguments we use (decay factors).
static float f_exp(float x) {
    if (x < -20.0f) return 0.0f;
    // exp(x) = 2^(x*log2e) = 2^i * 2^f
    float t = x * 1.44269504f;
    float fi = __builtin_floorf(t);
    float f = t - fi;
    int32_t i = (int32_t)fi;
    // 2^f on [0,1): minimax-ish polynomial
    float p = 1.0f + f * (0.69314718f + f * (0.24022650f + f * (0.05550411f + f * (0.00961813f + f * 0.00133336f))));
    union { float fl; int32_t in; } u;
    u.in = (i + 127) << 23;
    return p * u.fl;
}

// sin/cos for |x| <= ~pi/2 (deflection angles only).
static float f_sin(float x) {
    float x2 = x * x;
    return x * (1.0f - x2 * (1.0f / 6.0f - x2 * (1.0f / 120.0f - x2 * (1.0f / 5040.0f - x2 / 362880.0f))));
}
static float f_cos(float x) {
    float x2 = x * x;
    return 1.0f - x2 * (0.5f - x2 * (1.0f / 24.0f - x2 * (1.0f / 720.0f - x2 / 40320.0f)));
}

// ─── Memory exchange areas ──────────────────────────────────────────────────
static float g_ball[BALL_STRIDE * 8];          // up to 8 ball slots

EXPORT float* ball_slot(int index) { return g_ball + BALL_STRIDE * (index & 7); }

// ─── Core integration ───────────────────────────────────────────────────────
static void clamp_speed(float* s) {
    float vx = s[S_VX], vy = s[S_VY];
    float sp = f_sqrt(vx * vx + vy * vy);
    if (sp > s[S_MAX] && sp > 1e-6f) {
        float k = s[S_MAX] / sp; s[S_VX] *= k; s[S_VY] *= k; sp = s[S_MAX];
    } else if (sp < s[S_MIN] && sp > 1e-3f) {
        float k = s[S_MIN] / sp; s[S_VX] *= k; s[S_VY] *= k; sp = s[S_MIN];
    }
    // Never let the ball crawl almost vertically: keep a minimum horizontal share.
    float minVx = sp * 0.28f;
    if (f_abs(s[S_VX]) < minVx && sp > 1.0f) {
        float sign = s[S_VX] < 0.0f ? -1.0f : 1.0f;
        float vy2 = sp * sp - minVx * minVx;
        s[S_VX] = sign * minVx;
        s[S_VY] = (s[S_VY] < 0.0f ? -1.0f : 1.0f) * f_sqrt(vy2 > 0.0f ? vy2 : 0.0f);
    }
    s[S_SPEED] = sp;
}

static int wall_bounce(float* s, float h) {
    float r = s[S_R];
    int evt = 0;
    if (s[S_PY] - r < 0.0f && s[S_VY] < 0.0f) {
        s[S_PY] = r + (r - s[S_PY]);
        if (s[S_PY] > h - r) s[S_PY] = r;
        evt = EVT_WALL_TOP;
    } else if (s[S_PY] + r > h && s[S_VY] > 0.0f) {
        s[S_PY] = (h - r) - (s[S_PY] + r - h);
        if (s[S_PY] < r) s[S_PY] = h - r;
        evt = EVT_WALL_BOTTOM;
    }
    if (!evt) return 0;

    float vyIn = f_abs(s[S_VY]);
    s[S_VY] = (evt == EVT_WALL_TOP ? 1.0f : -1.0f) * vyIn * WALL_REST;

    // Spin/grip exchange: the contact point velocity is vx ± spin*r. Friction
    // pushes it towards zero, trading spin for horizontal speed and vice versa.
    float dir = (evt == EVT_WALL_TOP) ? -1.0f : 1.0f;
    float spinSurface = s[S_SPIN] * r * 6.0f * dir;   // px/s at the contact point
    float kick = spinSurface * WALL_GRIP;
    s[S_VX] += kick;
    s[S_SPIN] *= 0.55f;
    s[S_IMPACT] = f_clamp(vyIn / (s[S_MAX] > 1.0f ? s[S_MAX] : 1400.0f), 0.0f, 1.0f);
    return evt;
}

static int step_once(float* s, float dt, float h) {
    float vx = s[S_VX], vy = s[S_VY];
    float sp = f_sqrt(vx * vx + vy * vy);

    // Magnus: perpendicular to velocity, proportional to spin and speed.
    if (sp > 1e-3f && f_abs(s[S_SPIN]) > 1e-4f) {
        float inv = 1.0f / sp;
        float px = -vy * inv, py = vx * inv;
        float a = MAGNUS * s[S_SPIN] * sp;
        vx += px * a * dt;
        vy += py * a * dt;
    }
    s[S_SPIN] *= f_exp(-SPIN_DECAY * dt);

    // Quadratic drag.
    float drag = 1.0f / (1.0f + DRAG * sp * dt);
    vx *= drag; vy *= drag;

    s[S_VX] = vx; s[S_VY] = vy;
    s[S_PX] += vx * dt;
    s[S_PY] += vy * dt;
    return wall_bounce(s, h);
}

/**
 * Advance a ball by dt seconds. Internally sub-steps so the ball never moves
 * more than ~40% of its radius per step. Returns EVT_* flags for wall hits.
 */
EXPORT int ball_integrate(float* s, float dt, float canvas_h) {
    s[S_PREVX] = s[S_PX];
    s[S_PREVY] = s[S_PY];
    s[S_IMPACT] = 0.0f;
    if (!(dt > 0.0f)) { s[S_EVENT] = 0.0f; return 0; }

    float sp = f_sqrt(s[S_VX] * s[S_VX] + s[S_VY] * s[S_VY]);
    float r = s[S_R] > 1.0f ? s[S_R] : 1.0f;
    int n = (int)(sp * dt / (r * 0.4f)) + 1;
    if (n > 24) n = 24;
    float h = dt / (float)n;
    int evt = 0;
    for (int i = 0; i < n; ++i) evt |= step_once(s, h, canvas_h);
    s[S_SPIN] = f_clamp(s[S_SPIN], -SPIN_MAX, SPIN_MAX);
    clamp_speed(s);
    s[S_EVENT] = (float)evt;
    return evt;
}

/**
 * Swept ball-vs-paddle test and response.
 *
 * The paddle face is treated as a vertical segment at the paddle's inner edge,
 * expanded by the ball radius. We intersect the ball's path (prev → pos) with
 * that face, which works however fast the ball is moving. The paddle's own
 * motion this frame (paddle_prev_y → py) is accounted for by testing against
 * the swept vertical extent.
 *
 * @return 0 = no hit, 1 = face hit, 2 = edge (top/bottom cap) hit
 */
EXPORT int ball_paddle_collide(float* s,
                               float px, float py, float pw, float ph,
                               float paddle_vel_y,
                               int   is_left,
                               float speed_increase,
                               float max_angle,
                               float paddle_prev_y) {
    const float r = s[S_R];
    const float x0 = s[S_PREVX], y0 = s[S_PREVY];
    const float x1 = s[S_PX],    y1 = s[S_PY];
    const float vx = s[S_VX];

    // Only hit a paddle while travelling towards it.
    if (is_left ? (vx >= 0.0f) : (vx <= 0.0f)) return 0;

    const float face = is_left ? (px + pw + r) : (px - r);
    const float back = is_left ? (px - r) : (px + pw + r);

    // Where (0..1 along the path) did the ball cross the face plane?
    float t = -1.0f;
    if (is_left) {
        if (x0 >= face && x1 < face) t = (x0 - face) / (x0 - x1);
        else if (x1 < face && x1 > back) t = 1.0f;          // already overlapping
    } else {
        if (x0 <= face && x1 > face) t = (face - x0) / (x1 - x0);
        else if (x1 > face && x1 < back) t = 1.0f;
    }
    if (t < 0.0f) return 0;

    const float hitY = y0 + (y1 - y0) * t;
    const float top = f_min(py, paddle_prev_y) - r;
    const float bot = f_max(py, paddle_prev_y) + ph + r;
    if (hitY < top || hitY > bot) return 0;

    // Contact position relative to the paddle centre at impact time.
    const float padTopAtT = paddle_prev_y + (py - paddle_prev_y) * t;
    const float centre = padTopAtT + ph * 0.5f;
    float rel = (hitY - centre) / (ph * 0.5f + r);
    rel = f_clamp(rel, -1.0f, 1.0f);
    const int edge = f_abs(rel) > 0.92f;

    float speed = f_sqrt(s[S_VX] * s[S_VX] + s[S_VY] * s[S_VY]);
    const float inc = speed_increase > 0.0f ? speed_increase : 1.0f;
    const float maxA = max_angle > 0.0f ? max_angle : 0.9f;
    float newSpeed = f_min(s[S_MAX], speed * inc);

    // Ease the angle curve: a centre hit stays flat, edge hits bite harder.
    float shaped = rel * (0.55f + 0.45f * f_abs(rel));
    float ang = shaped * maxA;
    float dirX = is_left ? 1.0f : -1.0f;
    float nvx = dirX * f_cos(ang) * newSpeed;
    float nvy = f_sin(ang) * newSpeed;

    // English: some of the paddle's motion carries into the ball.
    nvy += paddle_vel_y * PADDLE_ENGLISH;

    // Spin: brushing the ball with a moving paddle adds spin; the incoming
    // spin is partly reversed by the contact.
    float spin = s[S_SPIN] * SPIN_CARRY + paddle_vel_y * PADDLE_BRUSH * (is_left ? 1.0f : -1.0f);
    s[S_SPIN] = f_clamp(spin, -SPIN_MAX, SPIN_MAX);

    s[S_VX] = nvx;
    s[S_VY] = nvy;

    // Place the ball on the face and carry the remaining travel on the new path.
    float remain = 1.0f - t;
    float travel = f_sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) * remain;
    float nsp = f_sqrt(nvx * nvx + nvy * nvy);
    s[S_PX] = face + (nsp > 1e-3f ? nvx / nsp * travel : 0.0f) + dirX * 0.5f;
    s[S_PY] = hitY + (nsp > 1e-3f ? nvy / nsp * travel : 0.0f);

    clamp_speed(s);
    s[S_IMPACT] = f_clamp(speed / (s[S_MAX] > 1.0f ? s[S_MAX] : 1400.0f), 0.0f, 1.0f);
    s[S_EVENT] = (float)(EVT_PADDLE | (edge ? EVT_PADDLE_EDGE : 0));
    return edge ? 2 : 1;
}

/**
 * Simulate forward until the ball reaches target_x and return its Y there.
 * Uses exactly the same integrator as the live ball (including spin and wall
 * kicks), so the AI reads curving shots correctly. Steps at 1/120 s.
 */
EXPORT float predict_ball_y(float bx, float by, float vx, float vy,
                            float spin, float r, float max_speed, float min_speed,
                            float canvas_h, float target_x, int max_steps) {
    float s[BALL_STRIDE] = {0};
    s[S_PX] = bx; s[S_PY] = by; s[S_VX] = vx; s[S_VY] = vy; s[S_SPIN] = spin;
    s[S_R] = r; s[S_MAX] = max_speed; s[S_MIN] = min_speed;
    const float dt = 1.0f / 120.0f;
    if (max_steps > 2400) max_steps = 2400;
    for (int i = 0; i < max_steps; ++i) {
        ball_integrate(s, dt, canvas_h);
        if ((s[S_VX] > 0.0f && s[S_PX] >= target_x) || (s[S_VX] < 0.0f && s[S_PX] <= target_x)) {
            // Interpolate back to the exact crossing.
            float dx = s[S_PX] - s[S_PREVX];
            float t = dx != 0.0f ? (target_x - s[S_PREVX]) / dx : 1.0f;
            return s[S_PREVY] + (s[S_PY] - s[S_PREVY]) * f_clamp(t, 0.0f, 1.0f);
        }
    }
    return s[S_PY];
}

/**
 * Pull the ball towards a gravity well. Smooth falloff inside pull radius,
 * with a force cap so the ball can't be flung unrealistically.
 */
EXPORT int gravity_well_apply(float* s, float well_x, float well_y,
                              float pull_radius_sq, float strength, float dt,
                              float min_distance_sq) {
    if (pull_radius_sq <= 0.0f || dt <= 0.0f) return 0;
    const float dx = well_x - s[S_PX];
    const float dy = well_y - s[S_PY];
    const float d2 = dx * dx + dy * dy;
    if (d2 >= pull_radius_sq || d2 <= min_distance_sq) return 0;

    const float inv = 1.0f / f_sqrt(d2);
    const float ratio = f_max(0.0f, 1.0f - d2 / pull_radius_sq);
    const float smooth = ratio * ratio;
    const float cap = f_max(420.0f, f_min(1600.0f, strength * 0.06f));
    const float a = f_min(strength * smooth, cap) * dt;
    s[S_VX] += dx * inv * a;
    s[S_VY] += dy * inv * a;

    // A well also imparts a little spin, so slingshots curve on exit.
    const float cross = (dx * s[S_VY] - dy * s[S_VX]) * inv;
    s[S_SPIN] = f_clamp(s[S_SPIN] + cross * 0.00004f * smooth, -SPIN_MAX, SPIN_MAX);

    float sp2 = s[S_VX] * s[S_VX] + s[S_VY] * s[S_VY];
    const float mx = s[S_MAX] > 0.0f ? s[S_MAX] : 1400.0f;
    if (sp2 > mx * mx) {
        float k = mx / f_sqrt(sp2); s[S_VX] *= k; s[S_VY] *= k; sp2 = mx * mx;
    }
    s[S_SPEED] = f_sqrt(sp2);
    return 1;
}

/**
 * Serve: place the ball at (cx, cy) and launch it at `angle` radians from the
 * horizontal towards `dir` (+1 right, -1 left).
 */
EXPORT void ball_reset(float* s, float cx, float cy, float base_speed,
                       float r, float max_speed, float min_speed,
                       float angle, float dir) {
    s[S_PX] = cx; s[S_PY] = cy; s[S_PREVX] = cx; s[S_PREVY] = cy;
    s[S_VX] = f_cos(angle) * base_speed * (dir < 0.0f ? -1.0f : 1.0f);
    s[S_VY] = f_sin(angle) * base_speed;
    s[S_SPIN] = 0.0f;
    s[S_SPEED] = base_speed;
    s[S_R] = r; s[S_MAX] = max_speed; s[S_MIN] = min_speed;
    s[S_EVENT] = 0.0f; s[S_IMPACT] = 0.0f;
}
