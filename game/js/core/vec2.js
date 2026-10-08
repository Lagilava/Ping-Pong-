class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    // Core operations - added safety for division by zero
    copy() { return new Vec2(this.x, this.y); }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    div(s) {
        // FIXED: Added safety check for division by zero
        if (Math.abs(s) < 1e-10) {
            throw new Error("Vec2.div(): Division by zero or near-zero");
        }
        this.x /= s;
        this.y /= s;
        return this;
    }

    // Length operations
    len() { return Math.hypot(this.x, this.y); }

    lenSq() { return this.x * this.x + this.y * this.y; }

    normalize() {
        // FIXED: Proper handling of zero vector
        const l = this.len();
        if (l < 1e-10) {
            // Option 1: Return zero vector (mathematically correct)
            this.x = this.y = 0;
            // Option 2: Return unit vector in X direction (if preferred)
            // this.x = 1; this.y = 0;
            return this;
        }
        this.x /= l;
        this.y /= l;
        return this;
    }

    // Dot & Cross products
    dot(v) { return this.x * v.x + this.y * v.y; }

    cross(v) { return this.x * v.y - this.y * v.x; }

    // Distance & Angle
    distance(v) { return Math.hypot(this.x - v.x, this.y - v.y); }

    angle() { return Math.atan2(this.y, this.x); }

    // Rotation
    rotate(angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x; this.y = y;
        return this;
    }

    // Interpolation
    lerp(v, t) {
        // FIXED: Clamp t to [0, 1] for predictable behavior
        t = Math.max(0, Math.min(1, t));
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    // Physics operations
    reflect(normal) {
        // FIXED: Ensure normal is normalized
        const normalizedNormal = normal.copy().normalize();
        const dot = this.dot(normalizedNormal);
        this.x -= 2 * dot * normalizedNormal.x;
        this.y -= 2 * dot * normalizedNormal.y;
        return this;
    }

    // Perpendicular vectors
    perp() { return new Vec2(-this.y, this.x); }           // Left perpendicular (+90°)
    perpRight() { return new Vec2(this.y, -this.x); }      // Right perpendicular (-90°)
    perpendicular() { return this.perp(); }                // Alias

    // Rotate 90° in-place
    rotate90CCW() {
        const t = this.x;
        this.x = -this.y;
        this.y = t;
        return this;
    }

    rotate90CW() {
        const t = this.x;
        this.x = this.y;
        this.y = -t;
        return this;
    }

    // Clamp operations
    clampLength(max) {
        const l = this.len();
        if (l > max && l > 1e-10) {
            this.mul(max / l);
        }
        return this;
    }

    clampLengthMin(min) {
        const l = this.len();
        if (l < min && l > 1e-10) {
            this.mul(min / l);
        }
        return this;
    }

    // Angle between two vectors
    angleBetween(v) {
        // FIXED: Added safety for zero vectors
        const lenA = this.len();
        const lenB = v.len();

        if (lenA < 1e-10 || lenB < 1e-10) {
            return 0; // Can't compute angle with zero vector
        }

        const dot = this.dot(v);
        const cos = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
        return Math.acos(cos);
    }

    // Projection
    projectOnto(v) {
        // FIXED: Added safety for zero vector
        const lenSq = v.lenSq();
        if (lenSq < 1e-10) {
            this.x = this.y = 0; // Projection onto zero vector is zero
            return this;
        }

        const scale = this.dot(v) / lenSq;
        this.x = v.x * scale;
        this.y = v.y * scale;
        return this;
    }

    // Static helpers
    static fromAngle(angle) {
        return new Vec2(Math.cos(angle), Math.sin(angle));
    }

    static random() {
        const a = Math.random() * Math.PI * 2;
        return new Vec2(Math.cos(a), Math.sin(a));
    }

    static randomInRange(minLen = 0, maxLen = 1) {
        const a = Math.random() * Math.PI * 2;
        const len = Math.random() * (maxLen - minLen) + minLen;
        return new Vec2(Math.cos(a) * len, Math.sin(a) * len);
    }

    // Utility methods
    equals(v, epsilon = 1e-10) {
        return Math.abs(this.x - v.x) < epsilon &&
            Math.abs(this.y - v.y) < epsilon;
    }

    toString(precision = 3) {
        return `(${this.x.toFixed(precision)}, ${this.y.toFixed(precision)})`;
    }

    isZero(epsilon = 1e-10) {
        return this.lenSq() < epsilon * epsilon;
    }
}

// ===================================================================
// BACKGROUND RENDERER
// ===================================================================
