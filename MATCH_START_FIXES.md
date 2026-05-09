# Match Start/Restart Fixes - Complete Summary

## Problems Identified

### Problem 1: Ball Velocity Too Low on Second Match
**Root Cause:** In `resetMatch()`, `ball.reset()` was called BEFORE `initializeGameMode()`, so the ball was reset with the default `baseSpeed=560` instead of the mode-specific speed (e.g., 860 for classic).

**Sequence (BEFORE FIX):**
```
resetMatch():
  1. ball.reset(this.center)  ← Uses baseSpeed=560 (default)
  2. initializeGameMode()     ← Sets baseSpeed=860 (too late!)
```

**Result:** Ball starts moving at ~560 pixels/sec instead of ~860, making it feel sluggish on second match.

---

### Problem 2: AI Had Stale State
**Root Cause:** `resetMatch()` did not recreate the AI, so state from the previous match persisted:
- `targetPowerUp` pointing to old power-ups
- `performance` metric carrying over
- `tauntCooldown` timer at wrong value
- Other accumulated state

**Result:** AI behavior inconsistent between first and second match.

---

### Problem 3: Paddles Not Reset to Center
**Root Cause:** `resetMatch()` did not reset paddle positions or velocities.

**Result:** Paddles could be at wrong positions when second match starts.

---

### Problem 4: Same Issue in `handleResize()`
**Root Cause:** Window resize code also had ball.reset() before initializeGameMode().

---

## Fixes Implemented

### Fix 1: Order of Operations in `resetMatch()`
**Changed:**
```javascript
// OLD (WRONG ORDER):
this.ball.reset(this.center);         // ❌ Uses baseSpeed=560
// ... other code ...
this.initializeGameMode();             // ❌ Sets baseSpeed=860 too late!

// NEW (CORRECT ORDER):
this.initializeGameMode();             // ✅ Sets baseSpeed=860 FIRST
this.ball.reset(this.center);          // ✅ Ball uses baseSpeed=860
```

**Location:** Line ~14046 in `resetMatch()`

---

### Fix 2: Reset Paddles in `resetMatch()`
**Added:**
```javascript
// Reset paddles to center position with zero velocity
if (this.player) {
    this.player.pos.y = this.height / 2 - this.player.h / 2;
    this.player.vel.y = 0;
    this.player.resetSize();
}
if (this.aiPaddle) {
    this.aiPaddle.pos.y = this.height / 2 - this.aiPaddle.h / 2;
    this.aiPaddle.vel.y = 0;
    this.aiPaddle.resetSize();
}
```

**Location:** Line ~14078 in `resetMatch()`

---

### Fix 3: Recreate AI in `resetMatch()`
**Added:**
```javascript
// Recreate AI to ensure clean state for second match
if (this.gameMode === 'zombie') {
    if (this.player && this.aiPaddle && this.ball) {
        this.ai = new ZombieBoss(this.aiPaddle, this.ball, this);
    } else {
        this.ai = new AIController(...);
    }
} else {
    const aiSpeed = Math.max(1.5, Math.min(4, this.height * 0.003));
    this.ai = new AIController(
        this.aiPaddle,
        this.ball,
        this.width,
        this.height,
        aiSpeed
    );
}
```

**Location:** Line ~14089 in `resetMatch()`

**Why:** Creates a brand new AI instance with:
- Fresh `targetPowerUp = null`
- Fresh `performance = 0.5`
- Fresh `lastTauntTime = 0`
- All other state reset to initial values

---

### Fix 4: Same Fix in `handleResize()` 
**Applied same "fix order" logic:**

```javascript
// OLD:
this.ball.reset(this.center);
this.initializeGameMode();

// NEW:
this.initializeGameMode();
this.ball.reset(this.center);
```

**Location:** Line ~13316 in `handleResize()`

---

## Complete Match Lifecycle (Now Correct)

### First Match
```
1. Game constructor
   - setupCanvas() → this.center created
   - createGameObjects() → ball.reset() with baseSpeed=560 (initial)
   - initializeGameMode() → ball.baseSpeed = 860 (sets for future resets)
   
2. startIntro() → Intro plays

3. Intro ends → Game loop starts → Ball has velocity from reset
   
4. Match plays → Someone scores 11 → Match ends
```

### Second Match (resetMatch called)
```
1. resetMatch()
   - stop() cancels animation frames
   - Reset all state variables
   
2. initializeGameMode() ← CALLED FIRST NOW
   - ball.baseSpeed = 860 ✓
   
3. ball.reset(this.center) ← Uses correct baseSpeed now
   - Ball gets velocity ≈ 860 ✓
   
4. Paddles reset to center
   - player.pos.y = center
   - aiPaddle.pos.y = center
   - Both velocities = 0 ✓
   
5. AI recreated ← FRESH STATE
   - New AIController or ZombieBoss
   - All state initialized fresh ✓
   
6. New Intro created and started

7. Intro ends → Game loop starts → Ball has correct velocity ✓

8. Match plays with IDENTICAL starting conditions as first match ✓
```

---

## Expected Behavior

✅ First match: Ball starts with velocity ~860, game plays normally

✅ Second match: Ball starts with SAME velocity ~860, not slower

✅ Second match: AI responds immediately with correct behavior, no stale state

✅ Paddles start centered both times

✅ Multiple matches in sequence work consistently

---

## Technical Details

### Ball Speed Configuration (from modeSpeeds)
- Classic: 860 base speed
- Zombie: 860 base speed
- Gravity: 860 base speed
- Obstacle: 860 base speed
- Speed: 900 base speed (drug mode)

### AI Fresh State Properties Reset
- `targetPowerUp = null`
- `performance = 0.5`
- `lastTauntTime = 0`
- `memory = []`
- `gameState = { playerScore: 0, aiScore: 0, rallyCount: 0 }`
- All personality traits recalculated

---

## Files Modified
- `ping_pong.html`
  - `resetMatch()` method: 3 key fixes
  - `handleResize()` method: 1 fix (order of operations)
