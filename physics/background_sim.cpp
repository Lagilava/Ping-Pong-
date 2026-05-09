/**
 * background_sim.cpp — WebAssembly background simulation helpers
 *
 * Data layouts (Float32Array views):
 *
 * Speed rain particle (stride 8):
 *   [0] x
 *   [1] y
 *   [2] speed
 *   [3] maxYf
 *   [4] slantVar
 *   [5] wobbleFreq
 *   [6] wobblePhase
 *   [7] length
 *
 * Gravity stars (stride 2):
 *   [0] twinklePhase
 *   [1] twinkleSpeed
 */

#include <cmath>
#include <cstdint>

static inline float clampf(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float fracf(float v) {
    return v - std::floor(v);
}

extern "C" {

void update_speed_rain(float* particles,
                       int count,
                       float dt,
                       float time,
                       float width,
                       float height,
                       float roadY,
                       float slant,
                       float speedMul,
                       float* splashXY,
                       int* splashCount,
                       int splashCapacity) {
    const int stride = 8;
    const float slantPx = slant * 220.0f * speedMul;
    int outCount = 0;

    for (int i = 0; i < count; i++) {
        const int base = i * stride;

        float x = particles[base + 0];
        float y = particles[base + 1];
        const float speed = particles[base + 2];
        const float maxYf = particles[base + 3];
        const float slantVar = particles[base + 4];
        const float wobbleFreq = particles[base + 5];
        const float wobblePhase = particles[base + 6];
        const float length = particles[base + 7];

        const float spd = speed * speedMul;
        y += spd * dt;

        x += slantPx * slantVar * dt + std::sin(time * wobbleFreq + wobblePhase) * 0.5f;

        if (x > width + 40.0f) {
            x -= width + 80.0f;
        } else if (x < -40.0f) {
            x += width + 80.0f;
        }

        const float maxY = maxYf * height;
        if (y > maxY) {
            if (y < roadY + 30.0f && outCount < splashCapacity) {
                splashXY[outCount * 2 + 0] = x;
                splashXY[outCount * 2 + 1] = roadY + fracf(std::sin(time * 7.37f + i * 11.91f) * 43758.5453f) * 6.0f;
                outCount++;
            }

            // Deterministic respawn values to avoid per-frame JS random calls.
            const float r1 = fracf(std::sin((i + 1) * 12.9898f + time * 0.91f) * 43758.5453f);
            const float r2 = fracf(std::sin((i + 1) * 78.2330f + time * 0.63f) * 12345.6789f);
            y = -length - r1 * 200.0f;
            x = r2 * width;
        }

        particles[base + 0] = x;
        particles[base + 1] = y;
    }

    *splashCount = outCount;
}

void update_gravity_stars(float* stars, int count, float dt) {
    const int stride = 2;
    for (int i = 0; i < count; i++) {
        const int base = i * stride;
        float phase = stars[base + 0];
        const float speed = stars[base + 1];
        phase += dt * speed;
        if (phase > 10000.0f) phase -= 10000.0f;
        stars[base + 0] = phase;
    }
}

void update_intro_curves(float time, float* out3) {
    // Mirrors classic preview timing values but keeps this logic off the main thread.
    out3[0] = time;
    out3[1] = std::sin(time * 0.22f);
    out3[2] = std::sin(time * 0.22f) * 1.2f;
}

}
