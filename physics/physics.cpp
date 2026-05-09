/**
 * physics.cpp — Ping Pong WebAssembly Physics Engine
 *
 * Compile with Emscripten:
 *   run build.ps1  (or see build instructions inside build.ps1)
 *
 * Ball state array layout (float[11], stored on wasm heap):
 *   [0] pos_x       [1] pos_y
 *   [2] vel_x       [3] vel_y
 *   [4] spin
 *   [5] prev_x      [6] prev_y
 *   [7] speed_cache
 *   [8] r (radius)  [9] maxSpeed  [10] minSpeed
 *
 * All functions are exported via extern "C" so Emscripten can wrap them.
 */

#include <cmath>
#include <algorithm>

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
static inline float clamp(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float fsqrt(float x) {
    return std::sqrt(x);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
extern "C" {

/**
 * ball_integrate
 *
 * Advances ball state by `dt` seconds.
 * Applies: Magnus (spin) effect, quadratic air resistance, velocity clamping,
 * and top/bottom wall bounces.
 *
 * @param s         Pointer to float[11] ball state array (modified in-place)
 * @param dt        Delta time in seconds (e.g. 0.016 for 60 fps)
 * @param canvas_h  Canvas height in pixels
 * @return          0 = no wall hit, 1 = top wall, 2 = bottom wall
 */
int ball_integrate(float* s, float dt, float canvas_h) {
    // Save previous position for interpolated rendering
    s[5] = s[0];
    s[6] = s[1];

    float vx       = s[2];
    float vy       = s[3];
    float spin     = s[4];
    float r        = s[8];
    float maxSpeed = s[9];
    float minSpeed = s[10];

    // --- Magnus effect (spin deflects trajectory) ---
    float speed = fsqrt(vx * vx + vy * vy);
    if (std::fabs(spin) > 0.01f && speed > 1e-6f) {
        float inv  = 1.0f / speed;
        float nx   = vx * inv;
        float ny   = vy * inv;
        // Left-perpendicular of velocity direction
        float px   = -ny;
        float py   =  nx;
        float mag  = spin * r * 0.0005f;
        vx        += px * mag * dt;
        vy        += py * mag * dt;

        // Spin decays faster at higher speeds (surface drag)
        float decay = 0.98f - speed * 0.00001f;
        s[4] *= std::max(0.8f, decay);
    }

    // --- Quadratic air resistance ---
    float speedRatio = speed / maxSpeed;
    float airResist  = 1.0f - (0.0001f + speedRatio * 0.0003f) * dt;
    vx *= airResist;
    vy *= airResist;

    // --- Integrate position ---
    s[0] += vx * dt;
    s[1] += vy * dt;
    s[2]  = vx;
    s[3]  = vy;

    // --- Clamp speed ---
    speed = fsqrt(vx * vx + vy * vy);
    if (speed > maxSpeed && speed > 1e-10f) {
        float scale = maxSpeed / speed;
        s[2] *= scale;
        s[3] *= scale;
        speed  = maxSpeed;
    } else if (speed < minSpeed && speed > 0.001f) {
        float scale = minSpeed / speed;
        s[2] *= scale;
        s[3] *= scale;
        speed  = minSpeed;
    }
    s[7] = speed;

    // --- Wall bounces (top / bottom) ---
    int result = 0;
    if (s[1] - r < 0.0f) {
        s[1] = r;
        s[3] = std::fabs(s[3]);
        result = 1;
    } else if (s[1] + r > canvas_h) {
        s[1] = canvas_h - r;
        s[3] = -std::fabs(s[3]);
        result = 2;
    }

    return result;
}

/**
 * gravity_well_apply
 *
 * Applies a single gravity well force to the ball state in-place.
 * The JS side still owns sound/UI state changes, but the force calculation
 * and speed clamp live here so the physics step is authoritative in C++.
 */
int gravity_well_apply(float* s,
                       float well_x, float well_y,
                       float pull_radius_sq,
                       float strength,
                       float dt,
                       float min_distance_sq) {
    if (!s || pull_radius_sq <= 0.0f || dt <= 0.0f) {
        return 0;
    }

    const float bx = s[0];
    const float by = s[1];
    const float dx = well_x - bx;
    const float dy = well_y - by;
    const float distSq = dx * dx + dy * dy;

    if (distSq >= pull_radius_sq || distSq <= min_distance_sq) {
        return 0;
    }

    const float invDist = 1.0f / fsqrt(distSq);
    const float pullRatio = std::max(0.0f, 1.0f - (distSq / pull_radius_sq));
    const float smooth = pullRatio * pullRatio;
    const float forceCap = std::max(420.0f, std::min(1600.0f, strength * 0.06f));
    const float force = std::min(strength * smooth, forceCap);
    const float accel = force * dt;

    s[2] += dx * invDist * accel;
    s[3] += dy * invDist * accel;

    float speedSq = s[2] * s[2] + s[3] * s[3];
    const float maxSpeed = s[9] > 0.0f ? s[9] : 1400.0f;
    const float maxSpeedSq = maxSpeed * maxSpeed;
    if (speedSq > maxSpeedSq && speedSq > 1e-10f) {
        const float scale = maxSpeed / fsqrt(speedSq);
        s[2] *= scale;
        s[3] *= scale;
        speedSq = maxSpeedSq;
    }

    s[7] = fsqrt(speedSq);
    return 1;
}

/**
 * ball_paddle_collide
 *
 * Tests and resolves a ball-vs-paddle collision.
 * Deflection angle is proportional to hit position on the paddle face,
 * and the paddle's vertical velocity transfers partial spin to the ball.
 *
 * @param s             Ball state array (modified in-place on hit)
 * @param px, py        Paddle top-left corner
 * @param pw, ph        Paddle width / height
 * @param paddle_vel_y  Paddle vertical velocity (pixels/s) — for spin transfer
 * @param is_left       1 = player paddle (left side), 0 = AI paddle (right side)
 * @return              1 if collision resolved, 0 otherwise
 */
int ball_paddle_collide(float* s,
                        float px, float py, float pw, float ph,
                        float paddle_vel_y,
                        int is_left,
                        float speed_increase,
                        float max_angle,
                        float random_y_offset) {
    float bx = s[0];
    float by = s[1];
    float r  = s[8];

    // Broad-phase: vertical overlap required
    if (by + r <= py || by - r >= py + ph) return 0;

    float speed = s[7];
    if (speed < 1e-6f) speed = fsqrt(s[2]*s[2] + s[3]*s[3]);
    const float appliedSpeedIncrease = speed_increase > 0.0f ? speed_increase : 1.0f;
    const float appliedMaxAngle = max_angle > 0.0f ? max_angle : 0.8975979f;

    // Relative hit position on paddle face: -1 (top edge) to +1 (bottom edge)
    float centerPaddle = py + ph * 0.5f;
    float relHit       = clamp((by - centerPaddle) / (ph * 0.5f), -1.0f, 1.0f);
    float deflect      = relHit * appliedMaxAngle;
    float cosD         = std::cos(deflect);
    float sinD         = std::sin(deflect);
    float newSpeed     = std::min(s[9], speed * appliedSpeedIncrease);
    const float spinKick = paddle_vel_y * 0.0008f;

    if (is_left) {
        float edge = px + pw;
        if (s[0] - r < edge && s[0] > px) {
            s[0] = edge + r;
            s[2] =  cosD * newSpeed;   // always moving right after left paddle
            s[3] =  sinD * newSpeed + random_y_offset;
            s[4] += spinKick;
            s[7] = fsqrt(s[2] * s[2] + s[3] * s[3]);
            return 1;
        }
    } else {
        float edge = px;
        if (s[0] + r > edge && s[0] < px + pw) {
            s[0] = edge - r;
            s[2] = -cosD * newSpeed;   // always moving left after right paddle
            s[3] =  sinD * newSpeed + random_y_offset;
            s[4] += spinKick;
            s[7] = fsqrt(s[2] * s[2] + s[3] * s[3]);
            return 1;
        }
    }

    return 0;
}

/**
 * predict_ball_y
 *
 * Simulates ball trajectory forward in time (up to max_steps × 1/60 s)
 * until the ball reaches target_x, then returns predicted Y.
 * Used by the AI controller for smarter paddle positioning.
 *
 * @param bx, by            Current ball position
 * @param vx, vy            Current ball velocity (px/s)
 * @param spin              Current spin value
 * @param r                 Ball radius
 * @param max_speed         Ball max speed
 * @param min_speed         Ball min speed
 * @param canvas_h          Canvas height
 * @param target_x          X-coordinate to predict Y at (AI paddle face)
 * @param max_steps         Simulation step limit (avoids infinite loops)
 * @return                  Predicted Y when ball reaches target_x
 */
float predict_ball_y(float bx, float by,
                     float vx, float vy,
                     float spin, float r,
                     float max_speed, float min_speed,
                     float canvas_h,
                     float target_x,
                     int   max_steps) {
    const float dt = 1.0f / 60.0f;

    for (int i = 0; i < max_steps; ++i) {
        // Magnus
        float speed = fsqrt(vx * vx + vy * vy);
        if (std::fabs(spin) > 0.01f && speed > 1e-6f) {
            float inv = 1.0f / speed;
            float nx  = vx * inv;
            float ny  = vy * inv;
            vx += (-ny) * spin * r * 0.0005f * dt;
            vy += ( nx) * spin * r * 0.0005f * dt;
            float decay = 0.98f - speed * 0.00001f;
            spin *= std::max(0.8f, decay);
        }

        // Air resistance
        float sr = speed / max_speed;
        float ar = 1.0f - (0.0001f + sr * 0.0003f) * dt;
        vx *= ar;
        vy *= ar;

        bx += vx * dt;
        by += vy * dt;

        // Wall bounces
        if (by - r < 0.0f)         { by = r;              vy =  std::fabs(vy); }
        else if (by + r > canvas_h){ by = canvas_h - r;   vy = -std::fabs(vy); }

        // Check arrival at target_x
        if ((vx > 0.0f && bx >= target_x) ||
            (vx < 0.0f && bx <= target_x)) {
            return by;
        }
    }

    return by; // Ball never reached target within budget — return current Y
}

/**
 * update_fire_tongues
 *
 * Updates ZombieBoss fiery-rod tongue particles and compacts alive entries
 * in-place to remove dead particles without an additional JS filter pass.
 *
 * Tongue layout (float[stride], stride=12):
 *   [0]  pos_x
 *   [1]  pos_y
 *   [2]  vel_x
 *   [3]  vel_y
 *   [4]  life
 *   [5]  maxLife
 *   [6]  phase
 *   [7]  swaySpeed
 *   [8]  height
 *   [9]  width
 *   [10] swayAmount
 *   [11] colorIndex
 *
 * @param tongues  Pointer to packed tongue data
 * @param count    Number of active tongues packed into the array
 * @param dt       Delta time in seconds
 * @return         Number of alive tongues after update/compaction
 */
int update_fire_tongues(float* tongues, int count, float dt) {
    const int stride = 12;
    int out = 0;

    for (int i = 0; i < count; ++i) {
        const int inBase = i * stride;

        const float x = tongues[inBase + 0] + tongues[inBase + 2] * dt;
        const float y = tongues[inBase + 1] + tongues[inBase + 3] * dt;
        const float life = tongues[inBase + 4] - dt;
        const float phase = tongues[inBase + 6] + tongues[inBase + 7] * 8.0f;

        if (life <= 0.0f) {
            continue;
        }

        const int outBase = out * stride;
        tongues[outBase + 0] = x;
        tongues[outBase + 1] = y;
        tongues[outBase + 2] = tongues[inBase + 2];
        tongues[outBase + 3] = tongues[inBase + 3];
        tongues[outBase + 4] = life;
        tongues[outBase + 5] = tongues[inBase + 5];
        tongues[outBase + 6] = phase;
        tongues[outBase + 7] = tongues[inBase + 7];
        tongues[outBase + 8] = tongues[inBase + 8];
        tongues[outBase + 9] = tongues[inBase + 9];
        tongues[outBase + 10] = tongues[inBase + 10];
        tongues[outBase + 11] = tongues[inBase + 11];
        out++;
    }

    return out;
}

/**
 * ball_reset
 *
 * Resets ball state to centre of canvas with a randomized launch angle.
 * Random values (angle, direction, y-mul) must be generated in JS with
 * Math.random() and passed in — this keeps the C++ pure and testable.
 *
 * @param s             Ball state array (overwritten)
 * @param cx, cy        Launch origin (canvas centre)
 * @param base_speed    Initial speed
 * @param r             Ball radius
 * @param max_speed     Ball maximum speed
 * @param min_speed     Ball minimum speed
 * @param rand_angle    Random angle in [-0.3π, 0.3π]
 * @param rand_dir      +1.0 or -1.0 (direction)
 * @param rand_y_mul    Random Y-velocity multiplier in [-0.2, 0.2]
 */
void ball_reset(float* s,
                float cx, float cy,
                float base_speed,
                float r, float max_speed, float min_speed,
                float rand_angle, float rand_dir, float rand_y_mul) {
    s[0] = cx;          // pos_x
    s[1] = cy;          // pos_y
    s[5] = cx;          // prev_x
    s[6] = cy;          // prev_y
    s[2] = std::cos(rand_angle) * base_speed * rand_dir;
    s[3] = std::sin(rand_angle) * base_speed * rand_y_mul;
    s[4] = 0.0f;        // spin
    s[7] = base_speed;  // speed cache
    s[8] = r;
    s[9] = max_speed;
    s[10]= min_speed;
}

} // extern "C"
