// Computer opponent for every single-player mode except Zombie's boss attacks.
//
// Two halves:
//   * Play: tracks the ball with the same physics the ball uses, then places
//     returns on purpose. It picks where on its paddle to take the ball (that
//     sets the return angle), sometimes shows one angle and switches late
//     (a feint), sometimes swipes through contact for curve, and learns which
//     side you cover badly. Difficulty scales every one of those, and it eases
//     off when it is far ahead so matches stay winnable.
//   * Talk: watches what you actually did (where you were when you missed,
//     which way you moved, how you hit the ball) and calls it out in plain
//     trash talk. Lines never repeat until their pool runs dry.
(() => {
    'use strict';

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const MAX_ANGLE = Math.PI / 3.4;      // matches Game.checkPaddleCollision
    const ENGLISH = 0.28, BRUSH = 0.0085; // matches physics.cpp
    const SWIPE_T = 0.14;                 // seconds a swipe takes to cross contact

    // Indexed by difficulty 0 (Rookie) .. 4 (Insane).
    const SKILL = {
        reaction:        [0.5, 0.35, 0.2, 0.1, 0.05],
        maxSpeedMul:     [0.8, 0.95, 1.1, 1.3, 1.6],
        inaccuracy:      [0.25, 0.15, 0.08, 0.04, 0.01],
        predictionSteps: [30, 60, 100, 140, 200],
        // How often a return is placed on purpose rather than just blocked.
        aim:             [0.18, 0.38, 0.6, 0.78, 0.9],
        // Furthest point of the paddle face it will aim with (1 = the tip).
        reach:           [0.34, 0.48, 0.6, 0.7, 0.78],
        feint:           [0, 0.07, 0.14, 0.2, 0.26],
        spin:            [0.04, 0.1, 0.17, 0.24, 0.3],
        // How much it leans on what it has learned about you.
        read:            [0.1, 0.3, 0.55, 0.75, 0.9],
        // Seconds before contact when it settles on the final angle.
        commit:          [0.42, 0.37, 0.32, 0.27, 0.23],
    };

    const STYLES = [
        { id: 'sniper', feint: 0.6, place: 1.3, spin: 0.7, momentum: 1.0, risk: 1.0 },
        { id: 'trickster', feint: 1.7, place: 0.9, spin: 1.4, momentum: 0.9, risk: 1.1 },
        { id: 'wall', feint: 0.4, place: 0.85, spin: 0.6, momentum: 0.8, risk: 0.7 },
        { id: 'bully', feint: 0.9, place: 1.15, spin: 1.0, momentum: 1.6, risk: 1.2 },
    ];

    // ── Lines ────────────────────────────────────────────────────────────
    // {dir}/{other}/{wrong}: up/down, {side}: top/bottom or high/low,
    // {Side}: the same capitalised, {n}: a count.
    const LINES = {
        intro_sniper: [
            "I'll be aiming for the corners today.",
            "Every shot goes where you aren't. That's the plan.",
            "Hope you like running. I like angles.",
        ],
        intro_trickster: [
            "Watch my paddle. Then don't trust it.",
            "Hope you like spin. And fakes. Mostly fakes.",
            "I never hit it where I'm pointing.",
        ],
        intro_wall: [
            "I'm going to watch how you play. Then beat it.",
            "I don't miss. You'll see.",
            "Take your time. I'll be here. Returning everything.",
        ],
        intro_bully: [
            "I'm going to make you run.",
            "Keep up if you can.",
            "I hit it behind you. Every time.",
        ],

        // Your misses
        miss_feint: [
            "Looked like I was going {other}, didn't it?",
            "Fake {other}, hit {dir}. You bought it.",
            "Got you with the fake.",
            "You watched my paddle. Mistake.",
            "Never trust where my paddle is pointing.",
        ],
        miss_spin: [
            "It curved. You didn't.",
            "Watch the spin next time.",
            "That one bent and you just watched it.",
            "Spin. Look it up.",
        ],
        miss_wrong_way: [
            "You went {wrong}. The ball went {dir}.",
            "Wrong way. The ball was going {dir} the whole time.",
            "You guessed {wrong}. Bad guess.",
            "You ran right away from that one.",
            "You read that completely backwards.",
        ],
        miss_wrong_footed: [
            "I hit it behind you. You were already leaving.",
            "Caught you moving the wrong way.",
            "You committed early. I noticed.",
        ],
        miss_frozen: [
            "You just stood there.",
            "Not even a twitch. Were you watching?",
            "Statue mode. Interesting plan.",
            "Did you fall asleep?",
        ],
        miss_corner: [
            "You left the {side} wide open. So I used it.",
            "Corner. Where you weren't.",
            "Right into the gap you left.",
            "You were in the middle. The ball wasn't.",
        ],
        miss_far: [
            "Not even close. A whole paddle away.",
            "That missed by a mile.",
            "You weren't even in the same area.",
        ],
        miss_near: [
            "So close. Close doesn't count.",
            "Missed by a hair. Still a miss.",
            "Your paddle was right there. Right there!",
            "Almost had it. Almost.",
        ],
        miss_slow: [
            "That one was slow. Slow!",
            "I sent you a gift and you dropped it.",
            "You missed the easy one.",
            "That ball was barely moving.",
        ],
        miss_fast: [
            "Too quick for you? It only gets quicker.",
            "That was fast. You were not.",
            "You saw it. You just couldn't get there.",
        ],
        miss_weak_side: [
            "{Side} again. That's {n} now.",
            "Still can't reach the {side} ones, huh?",
            "{Side} balls are your problem. I'm using it.",
            "{n} misses {side}. I'm keeping count.",
        ],
        miss_long_rally: [
            "{n} hits and you blink at the end.",
            "Long rally, sad ending.",
            "All that work and you drop it.",
        ],
        ai_point: [
            "Point to me.",
            "Next.",
            "Too easy.",
            "I'll take that.",
            "Keep them coming.",
            "That's how it's done.",
        ],

        // My misses
        hit_edge: [
            "Off the tip of your paddle. That's luck.",
            "You hit that with the very edge. Don't pretend you meant it.",
            "Edge of the paddle. Lucky and you know it.",
        ],
        hit_spin: [
            "Nice curve. I hate it.",
            "Okay, that spin was nasty.",
            "Swiping at the last second? Cheap. Effective, but cheap.",
            "Where did you learn spin? Stop it.",
        ],
        hit_fast: [
            "Fine. That one was fast.",
            "Okay, that one had some heat on it.",
            "I blinked. I don't even blink.",
        ],
        hit_angle: [
            "Steep angle. Okay, I see you.",
            "That angle was rude.",
            "Sharp. I didn't think you had that.",
        ],
        ai_greedy: [
            "I went for the line and missed. My fault.",
            "Too greedy on that one. Won't happen again.",
            "I was showing off. Fair point.",
        ],
        player_point_long_rally: [
            "{n} hits. You finally won one.",
            "Took you {n} shots, but fine.",
        ],
        player_streak: [
            "{n} in a row? Okay, I'm paying attention now.",
            "Alright. No more playing nice.",
            "You're on a run. Enjoy it while it lasts.",
        ],
        player_point: [
            "Lucky.",
            "Don't get used to that.",
            "Fine. One for you.",
            "I let you have that one.",
            "Okay. That was decent.",
            "Enjoy it.",
        ],

        // While the rally is going
        rally_middle: [
            "{n} returns straight off the middle. I can read you.",
            "You keep hitting it flat. Try an angle sometime.",
            "Same shot again. And again.",
        ],
        rally_habit: [
            "You always send it {dir}. I've noticed.",
            "Another one {dir}. I'm already waiting there.",
            "You love going {dir}, don't you?",
        ],
        rally_first_spin: [
            "Ooh, spin. Look at you.",
            "Oh, you've got tricks now?",
        ],
        rally_scramble: [
            "Barely got that one.",
            "Lunging saves. Very dramatic.",
            "You're running a lot. I'm not.",
        ],
        rally_long: [
            "This rally won't end. I love it.",
            "{n} hits. Still going? Respect.",
            "One of us has to miss. Not me.",
            "Long rally. Somebody score already.",
            "{n} and counting. Getting tired yet?",
            "I can do this all day. Can you?",
        ],

        // Changing the game plan
        plan_more_corners: [
            "You can't handle the corners. More corners then.",
            "The angles are working. I'll keep them coming.",
        ],
        plan_more_feints: [
            "You fall for the fakes every time. Here's another.",
            "The fakes work on you. Noted.",
        ],
        plan_drop_feints: [
            "The fakes aren't working on you. Fine.",
            "Okay, you see through the fakes. New plan.",
        ],
        plan_drop_corners: [
            "You're covering the corners. Let's try something else.",
            "Fine, you can run. Let's see if you can think.",
        ],
        plan_tighten: [
            "Okay. I'm actually trying now.",
            "Playtime's over.",
        ],

        // Match end
        end_win_weak_side: [
            "{n} of your misses were {side}. Work on that.",
            "{n} misses {side}. That's the whole story.",
        ],
        end_win_wrong_way: [
            "Most of your misses were wrong-way guesses. Stop guessing.",
            "You kept guessing. I kept winning.",
        ],
        end_win_feint: [
            "You fell for {n} fakes. I counted.",
        ],
        end_win: [
            "Good game. For me.",
            "That's the match. Want a rematch? I'd win that too.",
            "Better luck next time.",
        ],
        end_loss_spin: [
            "Your spin won you that. Fine. Well played.",
        ],
        end_loss_edge: [
            "{n} points off the edge of your paddle. Lucky. But you won.",
        ],
        end_loss: [
            "You won. I'll remember this.",
            "Okay, you're good. Rematch. Now.",
            "Fine. Well played. This time.",
        ],

        powerup_player: [
            "Power-ups won't save you.",
            "Grab all the help you want.",
            "Needed a power-up? Thought so.",
        ],
        power_shot: [
            "Ow. Okay, that one hurt.",
            "Big swing. Did it feel good?",
        ],

        // Score-gap flavour for a quiet moment
        lead_big: [
            "Want a head start next time?",
            "The scoreboard says it all.",
            "You can still win. Mathematically.",
        ],
        trail_big: [
            "Enjoy the lead while it lasts.",
            "Leads disappear, you know.",
            "I'm just warming up.",
        ],
        tied: [
            "Dead even. Love it.",
            "Next point matters.",
            "Close game. Nerves of steel. Actual steel.",
        ],
    };

    class AIController {
        constructor(paddle, ball, canvasW, canvasH, diff = 2) {
            this.paddle = paddle;
            this.ball = ball;
            this.canvasW = canvasW;
            this.canvasH = canvasH;
            this.setDifficulty(diff);
            this.style = pick(STYLES);
            this.reset();
        }

        reset() {
            this.smoothing = 0.14;
            this.predictedY = this.paddle.pos.y + this.paddle.h / 2;
            this.idleTargetY = this.H * 0.5;
            this.nextTrackingUpdate = 0;
            this.simTimeMs = 0;
            this.targetPowerUp = null;
            this.gameState = { playerScore: 0, aiScore: 0, rallyCount: 0 };

            // Play
            this.aimRel = 0;          // smoothed paddle-face offset being aimed with
            this.flight = null;       // plan for the ball currently coming at us
            this.lastShot = null;     // what we did on our last hit
            this.lastLandings = [];
            this.planWeights = { feint: 1, place: 1, spin: 1 };
            this.planScore = { feint: 0, place: 0, spin: 0 };
            this.pointsSincePlanCheck = 0;

            // What we know about the player
            this.habits = {
                missTop: 0, missBottom: 0, wrongWay: 0, frozen: 0, fooledByFeint: 0,
                returnsUp: 0, returnsDown: 0, returnsFlat: 0,
                middleStreak: 0, sameDirStreak: 0, lastDir: 0,
                pointsFromSpin: 0, pointsFromEdge: 0, spinShown: false,
                recentReturnY: [],
            };
            this.lastPlayerHit = null;
            this.passSnapshot = null;
            this.aiPassSnapshot = null;
            this.playerVelHistory = [];
            this.consecutiveAIScores = 0;
            this.consecutivePlayerScores = 0;

            // Talk
            this.currentTaunt = '';
            this.tauntUntil = 0;
            this.lastLineAt = -1e9;
            this.bags = new Map();
            this.lastLines = [];
            this.pendingTauntToSpeak = null;
            this.voiceInitRequested = false;
            this.hasShownMatchEnd = false;
            this.introDone = false;
        }

        // Settings code assigns .game; the live game wins when there is one.
        get game() { return window.game || this._game || null; }
        set game(v) { this._game = v; }
        get H() { return this.game?.height || this.canvasH; }

        setDifficulty(d) {
            d = clamp(Math.round(d), 0, 4);
            this.difficulty = d;
            this.reaction = SKILL.reaction[d];
            this.maxSpeedMul = SKILL.maxSpeedMul[d];
            this.inaccuracy = SKILL.inaccuracy[d];
            this.predictionSteps = SKILL.predictionSteps[d];
        }

        isPvPMatch() {
            return !!(window.game && window.game.isMultiplayer);
        }

        // The Zombie boss drives this controller for movement only; it has its
        // own attacks and balance, so no placement tricks and no talking there.
        tacticsEnabled() {
            return this.game?.gameMode !== 'zombie';
        }

        suppressTauntsForPvP() {
            this.currentTaunt = '';
            this.pendingTauntToSpeak = null;
            if ('speechSynthesis' in window && window.speechSynthesis) window.speechSynthesis.cancel();
        }

        updateGameState(state) {
            if (!state) return;
            this.gameState.playerScore = state.playerScore || 0;
            this.gameState.aiScore = state.aiScore || 0;
            this.gameState.rallyCount = state.rallyCount || 0;
        }

        predict() {
            // Same C++ integrator as the live ball, so the AI reads spin and wall
            // kicks. predictionSteps (difficulty) limits how far ahead it can see.
            const faceX = this.paddle.pos.x - this.ball.r;
            return PhysicsCore.predictY(this.ball, faceX, this.predictionSteps * 2, this.H);
        }

        // ── Placement ───────────────────────────────────────────────────
        // How hard to play right now. Eases off with a big lead and digs in
        // when behind, so a match rarely turns into a blowout either way.
        intensity() {
            const lead = this.gameState.aiScore - this.gameState.playerScore;
            if (lead >= 6) return 0.45;
            if (lead >= 4) return 0.7;
            if (lead <= -3) return 1.15;
            return 1;
        }

        newFlight() {
            const d = this.difficulty;
            const k = this.intensity();
            const s = this.style;
            const w = this.planWeights;
            const f = { tactic: 'safe', committed: false, showRel: (Math.random() - 0.5) * 0.2, finalRel: 0, swipe: 0, decoySign: 0 };
            if (!this.tacticsEnabled()) { this.flight = f; return; }
            const r = Math.random();
            const feintP = SKILL.feint[d] * s.feint * w.feint * k;
            const aimP = SKILL.aim[d] * s.place * w.place * k;
            if (r < feintP) {
                f.tactic = 'feint';
                f.decoySign = Math.random() < 0.5 ? -1 : 1;
                f.showRel = f.decoySign * SKILL.reach[d] * 0.85;
                // The late switch moves the paddle through contact anyway.
                f.swipe = 1;
            } else if (r < feintP + aimP) {
                f.tactic = 'place';
                f.showRel = (Math.random() - 0.5) * 0.25;
            }
            if (f.tactic === 'place' && Math.random() < SKILL.spin[d] * s.spin * w.spin * k) f.swipe = 1;
            this.flight = f;
        }

        // Where a return taken at `rel` on our face, with the paddle moving at
        // `pvy`, crosses the player's paddle line, and how long it takes.
        simulateReturn(contactY, rel, pvy) {
            const g = this.game, b = this.ball;
            const speed = Math.hypot(b.vel.x, b.vel.y);
            const inc = g?.getPaddleSpeedIncrease ? g.getPaddleSpeedIncrease(false) : 1.08;
            const newSpeed = Math.min(b.maxSpeed || 1650, speed * inc);
            const ang = rel * (0.55 + 0.45 * Math.abs(rel)) * MAX_ANGLE;
            const vx = -Math.cos(ang) * newSpeed;
            const vy = Math.sin(ang) * newSpeed + pvy * ENGLISH;
            const spin = clamp((b.spin || 0) * -0.35 - pvy * BRUSH, -9, 9);
            const startX = this.paddle.pos.x - b.r - 1;
            const player = g.player;
            const targetX = player.pos.x + player.w + b.r;
            const y = PhysicsCore.predictY(
                { pos: { x: startX, y: contactY }, vel: { x: vx, y: vy }, spin, r: b.r, maxSpeed: b.maxSpeed, minSpeed: b.minSpeed },
                targetX, 2400, this.H);
            return { y, t: (startX - targetX) / Math.max(60, Math.abs(vx)) };
        }

        // Paddle speed at contact for a shot taken at `rel`. A feint sweeps
        // from the decoy angle to the real one over the commit window; a
        // swipe sweeps the last SWIPE_T seconds the opposite way to `rel`.
        // A swipe with the angle (dir = sign of rel) bends the ball further
        // out; against it, the ball leaves on one line and curls back.
        contactSpeed(rel, swipeV, dir) {
            const f = this.flight;
            const reachFace = this.paddle.h * 0.5 + this.ball.r;
            if (f?.tactic === 'feint') return -(rel - f.showRel) * reachFace / SKILL.commit[this.difficulty];
            if (!swipeV) return 0;
            const lead = Math.min(0.55, (swipeV * SWIPE_T) / reachFace);
            return dir * lead * reachFace / SWIPE_T;
        }

        chooseFinalRel(contactY, swipeV) {
            const g = this.game, f = this.flight, d = this.difficulty;
            const player = g.player;
            // Fast balls get a safer target: less of the paddle face to spare.
            const b = this.ball;
            const speedK = clamp(1.2 - Math.hypot(b.vel.x, b.vel.y) / (b.maxSpeed || 1650) * 0.4, 0.8, 1);
            const reach = SKILL.reach[d] * speedK * (f.tactic === 'safe' ? 0.3 : 1) * (0.85 + 0.15 * this.intensity());
            const pc = player.pos.y + player.h / 2;
            const pv = player.vel?.y || 0;
            const pMax = (player.maxSpeed || 850) * (g.getKeyboardPaddleSpeed?.() || 1);
            const read = SKILL.read[d];
            const h = this.habits;
            const missTotal = h.missTop + h.missBottom;
            const weak = missTotal >= 2 ? (h.missTop > h.missBottom * 1.5 ? -1 : h.missBottom > h.missTop * 1.5 ? 1 : 0) : 0;
            const lastLand = this.lastLandings[this.lastLandings.length - 1];

            let best = null;
            const n = 7;
            const dirs = swipeV && f.tactic !== 'feint' ? [-1, 1] : [1];
            for (let i = 0; i < n * dirs.length; i++) {
                const rel = -reach + (2 * reach * (i % n)) / (n - 1);
                if (f.tactic === 'feint' && Math.sign(rel) === f.decoySign) continue;
                const pvy = this.contactSpeed(rel, swipeV, dirs[Math.floor(i / n)]);
                const res = this.simulateReturn(contactY, rel, pvy);
                // Where the player will be once they've reacted, carrying momentum.
                const carry = pv * Math.min(0.18, res.t) * this.style.momentum;
                const p = pc + carry;
                const dist = Math.abs(res.y - p) - player.h * 0.45;
                const avail = Math.max(0.08, res.t - 0.18);
                let score = clamp(dist / (pMax * avail), -1, 2);
                const side = res.y < p ? -1 : 1;
                if (weak && side === weak) score += 0.25 * read;
                if (lastLand !== undefined && Math.abs(res.y - lastLand) < player.h) score -= 0.08;
                score -= Math.abs(rel) * 0.12 * (2 - this.style.risk);
                score += Math.random() * 0.12;
                if (!best || score > best.score) best = { rel, score, y: res.y, pvy, side, dist };
            }
            return best;
        }

        updatePlay(dt, ballMovingToAI) {
            const g = this.game, b = this.ball, p = this.paddle;
            const k = g?.getObjectScale?.() || 1;
            const reachFace = p.h * 0.5 + b.r;
            let wantRel = 0;

            if (ballMovingToAI && this.tacticsEnabled()) {
                if (!this.flight) this.newFlight();
                const f = this.flight;
                const faceX = p.pos.x - b.r;
                const T = b.vel.x > 1 ? (faceX - b.pos.x) / b.vel.x : 9;
                const commitT = SKILL.commit[this.difficulty];
                // Pick the shot a little before committing to it, so there is
                // time to get the paddle there; a feint keeps showing the decoy
                // until the commit point and then switches.
                if (!f.planned && T <= commitT + 0.2 && T > 0.02) {
                    f.planned = true;
                    const swipeV = f.swipe ? (380 + Math.random() * 160) * k : 0;
                    const best = this.chooseFinalRel(this.predictedY, swipeV);
                    if (best) {
                        f.finalRel = best.rel;
                        f.swipeV = f.swipe ? best.pvy : 0;
                        f.plannedY = best.y;
                        f.plannedSide = best.side;
                    }
                }
                if (f.planned && (f.tactic !== 'feint' || T <= commitT)) f.committed = true;
                if (!f.committed) wantRel = f.showRel;
                else if (f.tactic === 'feint') {
                    // Sweep from the decoy angle to the real one, arriving at contact.
                    const frac = clamp(T / commitT, 0, 1);
                    wantRel = f.finalRel + (f.showRel - f.finalRel) * frac;
                } else if (f.swipeV) {
                    // Wait a little off the contact point, then sweep through it.
                    const lead = (f.swipeV * SWIPE_T) / reachFace;
                    wantRel = f.finalRel + lead * clamp(T / SWIPE_T, 0, 1);
                } else {
                    wantRel = f.finalRel;
                }
            } else {
                this.flight = null;
            }

            // Turn the aim offset at the speed this skill level can manage,
            // and feed that motion straight to the paddle so aiming doesn't
            // lag behind the ball tracking.
            const turn = 1 - Math.exp(-dt / (0.03 + this.reaction * 0.12));
            const prevOffset = this.aimRel * reachFace;
            this.aimRel += (wantRel - this.aimRel) * turn;
            const feedForward = dt > 0 ? -(this.aimRel * reachFace - prevOffset) / dt : 0;

            const centreTarget = this.predictedY - this.aimRel * reachFace;
            const error = centreTarget - (p.pos.y + p.h / 2);
            const maxPaddleSpeed = (p.maxSpeed || 900) * this.maxSpeedMul;
            const desiredSpeed = clamp(error * 5.5 / k + feedForward, -maxPaddleSpeed, maxPaddleSpeed);
            const response = ballMovingToAI ? 0.22 : 0.14;
            p.vel.y += (desiredSpeed - p.vel.y) * response;
            if (Math.abs(feedForward) < 30 * k && Math.abs(error) < 6 * k) p.vel.y *= 0.72;
            return error;
        }

        update(dt, powerUps = []) {
            const g = this.game;
            if (!this.ball || !this.paddle) return;
            this.gameState.rallyCount = g?.rallyCount || 0;

            if (this.isPvPMatch()) {
                this.suppressTauntsForPvP();
                return;
            }

            // Reaction timing runs on game time so pauses, hit-stop and time warp
            // affect the AI exactly like everything else.
            this.simTimeMs += dt * 1000;
            const simNow = this.simTimeMs;
            if (!(this.nextTrackingUpdate <= simNow + 2000)) this.nextTrackingUpdate = simNow;
            const ballMovingToAI = this.ball.vel.x > 0;

            if (simNow >= this.nextTrackingUpdate) {
                let targetY = ballMovingToAI ? this.predict() : this.idleTargetY;
                if (this.targetPowerUp && Math.random() < 0.7) targetY = this.targetPowerUp.pos.y;
                const reactionBase = 65 + this.reaction * 260;
                this.nextTrackingUpdate = simNow + reactionBase * (ballMovingToAI ? 0.85 : 1.2);

                // Aim error is in pixels; on Obstacle mode's big arena the
                // paddles are smaller, so the AI aims proportionally tighter.
                const arenaK = g?.getObjectScale?.() || 1;
                const noise = (Math.random() - 0.5) * (8 + this.inaccuracy * 120) * (ballMovingToAI ? 0.7 : 1.0) * arenaK;
                const half = this.paddle.h * 0.5;
                const clampedTarget = clamp(targetY + noise, half, this.H - half);
                this.predictedY += (clampedTarget - this.predictedY) * (0.24 + this.smoothing * 0.8);

                if (!ballMovingToAI) this.updateIdleTarget();
            }

            this.updatePlay(dt, ballMovingToAI);
            if (this.tacticsEnabled()) this.watchPlayer();

            if (this.currentTaunt && Date.now() > this.tauntUntil) this.currentTaunt = '';
        }

        // While the ball is heading to the player, wait where they usually
        // send it back (the better the AI, the more it trusts that read).
        updateIdleTarget() {
            const ys = this.habits.recentReturnY;
            let target = this.H * (0.42 + Math.random() * 0.16);
            if (this.tacticsEnabled() && ys.length >= 3) {
                const mean = ys.reduce((a, v) => a + v, 0) / ys.length;
                const read = SKILL.read[this.difficulty] * 0.5;
                target = target * (1 - read) + mean * read;
            }
            if (Math.random() < 0.2 || !this._idleSet) { this.idleTargetY = target; this._idleSet = true; }
        }

        // Snapshot the moment the ball gets past either paddle, so the score
        // callbacks (which run after the ball has been reset) know what happened.
        watchPlayer() {
            const g = this.game, b = this.ball;
            const player = g?.player;
            if (!player) return;
            this.playerVelHistory.push(player.vel?.y || 0);
            if (this.playerVelHistory.length > 60) this.playerVelHistory.shift();

            if (b.vel.x < 0 && !this.passSnapshot && b.pos.x < player.pos.x - b.r * 0.5) {
                const centre = player.pos.y + player.h / 2;
                const hist = this.playerVelHistory;
                const avgAbs = hist.reduce((a, v) => a + Math.abs(v), 0) / Math.max(1, hist.length);
                const recentV = hist.slice(-24).reduce((a, v) => a + v, 0) / Math.max(1, Math.min(24, hist.length));
                const ballSide = b.pos.y < centre ? -1 : 1;
                this.passSnapshot = {
                    gap: Math.abs(b.pos.y - centre) - player.h / 2,
                    h: player.h,
                    r: b.r,
                    side: ballSide,
                    speed: Math.hypot(b.vel.x, b.vel.y),
                    maxSpeed: b.maxSpeed || 1650,
                    frozen: avgAbs < 35 * (g.getObjectScale?.() || 1),
                    wrongWay: Math.abs(recentV) > 160 && Math.sign(recentV) !== ballSide,
                    playerV: recentV,
                    rally: g.rallyCount || 0,
                    shot: this.lastShot,
                };
            }
            if (b.vel.x > 0 && !this.aiPassSnapshot && b.pos.x > this.paddle.pos.x + this.paddle.w + b.r * 0.5) {
                const centre = this.paddle.pos.y + this.paddle.h / 2;
                this.aiPassSnapshot = {
                    gap: Math.abs(b.pos.y - centre) - this.paddle.h / 2,
                    flight: this.flight,
                    rally: g.rallyCount || 0,
                    playerHit: this.lastPlayerHit,
                };
            }
        }

        // Called by Game.checkPaddleCollision on every paddle hit.
        onPaddleHit(isPlayer, info) {
            if (!this.tacticsEnabled()) return;
            this.passSnapshot = null;
            this.aiPassSnapshot = null;
            if (!isPlayer) {
                const f = this.flight;
                this.lastShot = f ? { tactic: f.tactic, swipe: !!f.swipeV, decoySign: f.decoySign, finalRel: f.finalRel, plannedSide: f.plannedSide } : null;
                if (f?.plannedY !== undefined) {
                    this.lastLandings.push(f.plannedY);
                    if (this.lastLandings.length > 3) this.lastLandings.shift();
                }
                this.flight = null;
                this.lastPlayerHit = null;
                return;
            }
            const h = this.habits;
            const g = this.game;
            const k = g?.getObjectScale?.() || 1;
            const rel = info.rel || 0;
            const pvy = Math.abs(info.pvy || 0);
            const vy = this.ball.vel.y, vx = Math.abs(this.ball.vel.x) || 1;
            const dir = Math.abs(vy) < vx * 0.18 ? 0 : (vy < 0 ? -1 : 1);
            const hit = {
                rel, edge: !!info.edge, spin: pvy > 430 * k,
                fast: Math.hypot(this.ball.vel.x, vy) > (this.ball.maxSpeed || 1650) * 0.72,
                steep: Math.abs(vy) > vx * 0.75,
                scramble: pvy > 640 * k && Math.abs(rel) > 0.6,
                dir,
            };
            this.lastPlayerHit = hit;
            this.lastShot = null;
            if (dir < 0) h.returnsUp++; else if (dir > 0) h.returnsDown++; else h.returnsFlat++;
            h.middleStreak = (Math.abs(rel) < 0.28 && !hit.spin) ? h.middleStreak + 1 : 0;
            h.sameDirStreak = (dir !== 0 && dir === h.lastDir) ? h.sameDirStreak + 1 : (dir !== 0 ? 1 : 0);
            h.lastDir = dir;
            // Where it will reach us, for the idle read.
            const reachY = this.predict();
            h.recentReturnY.push(reachY);
            if (h.recentReturnY.length > 6) h.recentReturnY.shift();

            this.rallyRemark(hit);
        }

        // ── Talk ────────────────────────────────────────────────────────
        canSpeak() {
            if (this.isPvPMatch() || !this.tacticsEnabled()) return false;
            return window.PPSettings?.get('taunts') !== false;
        }

        line(key, fill) {
            const pool = LINES[key];
            if (!pool || !pool.length) return null;
            let bag = this.bags.get(key);
            if (!bag || !bag.length) {
                bag = pool.slice().sort(() => Math.random() - 0.5);
                // Don't restart a pool with the line we just used.
                if (bag.length > 1 && this.lastLines.includes(bag[bag.length - 1])) bag.unshift(bag.pop());
                this.bags.set(key, bag);
            }
            let text = bag.pop();
            if (fill) text = text.replace(/\{(\w+)\}/g, (m, name) => (fill[name] !== undefined ? fill[name] : m));
            return text.charAt(0).toUpperCase() + text.slice(1);
        }

        // priority 3: match start/end, 2: point, 1: mid-rally remark.
        say(key, fill, priority = 2) {
            if (!this.canSpeak()) return false;
            const now = Date.now();
            const gap = priority >= 3 ? 0 : priority === 2 ? 4200 : 9000;
            if (now - this.lastLineAt < gap) return false;
            // Mid-rally remarks never cut off a line that's still on screen.
            if (priority === 1 && this.currentTaunt) return false;
            const text = this.line(key, fill);
            if (!text) return false;
            this.currentTaunt = text;
            this.tauntUntil = now + Math.min(5200, 2400 + text.length * 45);
            this.lastLineAt = now;
            this.lastLines.push(text);
            if (this.lastLines.length > 4) this.lastLines.shift();
            this.speakTaunt(text);
            return true;
        }

        // Kept for older callers.
        triggerTaunt(message) {
            if (!message || !this.canSpeak()) return;
            this.currentTaunt = String(message);
            this.tauntUntil = Date.now() + 3600;
            this.lastLineAt = Date.now();
            this.speakTaunt(this.currentTaunt);
        }

        speakTaunt(text) {
            if (!this.canSpeak()) return;
            if (!('speechSynthesis' in window) || !window.speechSynthesis) return;
            const audio = this.game?.audio;
            if (audio && (audio.voiceMuted || audio.enabled === false)) return;
            const volume = clamp((audio?.voiceVolume ?? 0.9) * (audio?.masterVolume ?? 1), 0, 1);
            if (volume <= 0) return;
            const synth = window.speechSynthesis;
            const speakNow = (line) => {
                try {
                    if (synth.paused) synth.resume();
                    synth.cancel();
                    const u = new SpeechSynthesisUtterance(line);
                    u.rate = 1.08;
                    u.pitch = 1.0;
                    u.volume = volume;
                    const voices = synth.getVoices();
                    if (voices && voices.length > 0) {
                        const v = voices.find(x => (x.name.includes('Zira') || x.name.includes('Google') || x.name.includes('Samantha')) && /^en/i.test(x.lang)) || voices[0];
                        u.voice = v;
                        if (v?.lang) u.lang = v.lang;
                    } else {
                        u.lang = 'en-US';
                    }
                    synth.speak(u);
                } catch (err) {
                    console.warn('Speech synthesis failed:', err);
                }
            };
            const voices = synth.getVoices();
            if ((!voices || voices.length === 0) && !this.voiceInitRequested) {
                this.voiceInitRequested = true;
                this.pendingTauntToSpeak = text;
                const flush = () => {
                    if (!this.pendingTauntToSpeak) return;
                    const pending = this.pendingTauntToSpeak;
                    this.pendingTauntToSpeak = null;
                    speakNow(pending);
                };
                synth.onvoiceschanged = flush;
                setTimeout(flush, 180);
                return;
            }
            speakNow(text);
        }

        getCurrentTaunt() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return null; }
            if (!this.currentTaunt) return null;
            if (Date.now() > this.tauntUntil) { this.currentTaunt = ''; return null; }
            return { text: this.currentTaunt, opacity: 1 };
        }

        rallyRemark(hit) {
            const h = this.habits;
            const rally = this.game?.rallyCount || 0;
            const milestone = [14, 30, 50, 80][this.rallyMilestone || 0];
            if (milestone && rally >= milestone) {
                this.rallyMilestone = (this.rallyMilestone || 0) + 1;
                if (this.say('rally_long', { n: rally }, 1)) return;
            }
            // Only some of the time, so it reads as a reaction, not a ticker.
            if (Math.random() > 0.45) return;
            if (hit.spin && !h.spinShown) { h.spinShown = true; this.say('rally_first_spin', null, 1); return; }
            if (hit.scramble) { this.say('rally_scramble', null, 1); return; }
            if (h.middleStreak >= 4) { if (this.say('rally_middle', { n: h.middleStreak }, 1)) h.middleStreak = 0; return; }
            if (h.sameDirStreak >= 4) {
                if (this.say('rally_habit', { dir: h.lastDir < 0 ? 'high' : 'low' }, 1)) h.sameDirStreak = 0;
                return;
            }
        }

        onAIScore() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            this.consecutiveAIScores++;
            this.consecutivePlayerScores = 0;
            const snap = this.passSnapshot;
            this.passSnapshot = null;
            this.flight = null;
            if (!this.tacticsEnabled()) return;
            const h = this.habits;
            const dirWord = (s) => (s < 0 ? 'up' : 'down');
            const sideWord = (s) => (s < 0 ? 'top' : 'bottom');
            const shot = snap?.shot;
            if (shot) this.creditPlan(shot, 1);

            if (!snap) { this.say('ai_point'); this.pointPlayed(); return; }
            if (snap.side < 0) h.missTop++; else h.missBottom++;
            if (snap.wrongWay) h.wrongWay++;
            if (snap.frozen) h.frozen++;
            const sideCount = snap.side < 0 ? h.missTop : h.missBottom;

            // Most specific explanation first.
            const opts = [];
            if (shot?.tactic === 'feint' && snap.gap > 0) {
                h.fooledByFeint++;
                opts.push(['miss_feint', { other: dirWord(shot.decoySign), dir: dirWord(-shot.decoySign) }]);
            }
            if (snap.wrongWay && snap.gap > snap.h * 0.15) {
                opts.push([shot?.tactic === 'place' && this.style.momentum > 1.2 ? 'miss_wrong_footed' : 'miss_wrong_way',
                    { wrong: dirWord(-snap.side), dir: dirWord(snap.side) }]);
            }
            if (shot?.swipe && snap.gap < snap.h * 0.8) opts.push(['miss_spin']);
            if (sideCount >= 3 && sideCount % 2 === 1) {
                const hl = snap.side < 0 ? 'high' : 'low';
                opts.push(['miss_weak_side', { side: hl, Side: hl === 'high' ? 'High' : 'Low', n: sideCount }]);
            }
            if (snap.frozen) opts.push(['miss_frozen']);
            if (snap.rally >= 12) opts.push(['miss_long_rally', { n: snap.rally }]);
            if (snap.speed < snap.maxSpeed * 0.42) opts.push(['miss_slow']);
            if (shot?.tactic === 'place' && snap.gap > snap.h * 0.3) opts.push(['miss_corner', { side: sideWord(snap.side) }]);
            if (snap.gap < snap.r * 1.6) opts.push(['miss_near']);
            else if (snap.gap > snap.h) opts.push(['miss_far']);
            if (snap.speed > snap.maxSpeed * 0.75) opts.push(['miss_fast']);

            // Usually the top reason, sometimes the second, so a repeated
            // situation doesn't always get the same kind of line.
            const choice = opts.length > 1 && Math.random() < 0.3 ? opts[1] : opts[0];
            if (choice) this.say(choice[0], choice[1]);
            else if (Math.random() < 0.5) this.say(this.scoreFlavourKey() || 'ai_point');
            this.pointPlayed();
        }

        onPlayerScore() {
            if (this.isPvPMatch()) { this.suppressTauntsForPvP(); return; }
            this.consecutivePlayerScores++;
            this.consecutiveAIScores = 0;
            const snap = this.aiPassSnapshot;
            this.aiPassSnapshot = null;
            this.passSnapshot = null;
            const lastFlight = this.flight || snap?.flight;
            this.flight = null;
            if (!this.tacticsEnabled()) return;
            const hit = snap?.playerHit || this.lastPlayerHit;
            const h = this.habits;
            if (lastFlight && lastFlight.tactic !== 'safe' && lastFlight.committed) this.creditPlan({ tactic: lastFlight.tactic, swipe: !!lastFlight.swipeV }, -1);

            const opts = [];
            if (this.consecutivePlayerScores >= 3) opts.push(['player_streak', { n: this.consecutivePlayerScores }]);
            if (lastFlight?.committed && Math.abs(lastFlight.finalRel) > SKILL.reach[this.difficulty] * 0.8 && snap && snap.gap < this.paddle.h * 0.35) opts.push(['ai_greedy']);
            if (hit?.spin) { h.pointsFromSpin++; opts.push(['hit_spin']); }
            if (hit?.edge) { h.pointsFromEdge++; opts.push(['hit_edge']); }
            if (hit?.fast) opts.push(['hit_fast']);
            if (hit?.steep) opts.push(['hit_angle']);
            const rally = snap?.rally || 0;
            if (rally >= 12) opts.push(['player_point_long_rally', { n: rally }]);
            const choice = opts.length > 1 && Math.random() < 0.3 ? opts[1] : opts[0];
            if (choice) this.say(choice[0], choice[1]);
            else if (Math.random() < 0.55) this.say(this.scoreFlavourKey() || 'player_point');
            this.pointPlayed();
        }

        scoreFlavourKey() {
            const diff = this.gameState.aiScore - this.gameState.playerScore;
            if (Math.random() < 0.5) return null;
            if (diff >= 5) return 'lead_big';
            if (diff <= -4) return 'trail_big';
            if (diff === 0 && this.gameState.aiScore >= 3) return 'tied';
            return null;
        }

        // ── Game plan ──────────────────────────────────────────────────
        creditPlan(shot, delta) {
            const key = shot.tactic === 'feint' ? 'feint' : shot.tactic === 'place' ? 'place' : null;
            if (key) this.planScore[key] += delta;
            if (shot.swipe) this.planScore.spin += delta;
        }

        pointPlayed() {
            this.rallyMilestone = 0;
            if (++this.pointsSincePlanCheck < 4) return;
            this.pointsSincePlanCheck = 0;
            const w = this.planWeights, s = this.planScore;
            let announce = null;
            if (s.feint >= 2 && w.feint < 1.8) { w.feint = Math.min(1.8, w.feint + 0.35); announce = 'plan_more_feints'; }
            else if (s.feint <= -2 && w.feint > 0.4) { w.feint = Math.max(0.4, w.feint - 0.35); announce = 'plan_drop_feints'; }
            if (s.place >= 2 && w.place < 1.5) { w.place = Math.min(1.5, w.place + 0.2); announce = announce || 'plan_more_corners'; }
            else if (s.place <= -2 && w.place > 0.6) { w.place = Math.max(0.6, w.place - 0.2); w.feint = Math.min(1.8, w.feint + 0.25); announce = announce || 'plan_drop_corners'; }
            if (s.spin >= 2) w.spin = Math.min(1.6, w.spin + 0.2);
            else if (s.spin <= -2) w.spin = Math.max(0.5, w.spin - 0.2);
            this.planScore = { feint: 0, place: 0, spin: 0 };
            const lead = this.gameState.aiScore - this.gameState.playerScore;
            if (!announce && lead <= -3 && this.consecutivePlayerScores >= 2) announce = 'plan_tighten';
            // Plan announcements wait for a quiet moment; they don't trample
            // the point line that was just said.
            if (announce) {
                this._pendingPlanLine = announce;
                clearTimeout(this._planTimer);
                this._planTimer = setTimeout(() => {
                    if (this._pendingPlanLine && !this.currentTaunt && this.game?.running) this.say(this._pendingPlanLine, null, 3);
                    this._pendingPlanLine = null;
                }, 5200);
            }
        }

        // ── Match events ───────────────────────────────────────────────
        onGameStart() {
            this.hasShownMatchEnd = false;
            if (this.introDone || !this.tacticsEnabled()) return;
            this.introDone = true;
            setTimeout(() => {
                if (this.game?.running && !this.game.introActive) this.say('intro_' + this.style.id, null, 3);
            }, 900);
        }

        onGameEnd(aiWon) {
            if (this.hasShownMatchEnd || !this.tacticsEnabled()) return;
            this.hasShownMatchEnd = true;
            clearTimeout(this._planTimer);
            const h = this.habits;
            let key = aiWon ? 'end_win' : 'end_loss', fill = null;
            if (aiWon) {
                const weakN = Math.max(h.missTop, h.missBottom);
                const total = h.missTop + h.missBottom;
                if (h.fooledByFeint >= 3) { key = 'end_win_feint'; fill = { n: h.fooledByFeint }; }
                else if (total >= 4 && weakN >= total * 0.7) { key = 'end_win_weak_side'; fill = { n: weakN, side: h.missTop > h.missBottom ? 'high' : 'low' }; }
                else if (h.wrongWay >= 3 && h.wrongWay >= total * 0.4) key = 'end_win_wrong_way';
            } else if (h.pointsFromSpin >= 3) key = 'end_loss_spin';
            else if (h.pointsFromEdge >= 3) { key = 'end_loss_edge'; fill = { n: h.pointsFromEdge }; }
            this.say(key, fill, 3);
        }

        // Back-compat alias used by older code paths.
        triggerMatchEnd(playerWon) { this.onGameEnd(!playerWon); }

        onPowerUpGrab() {
            if (this.ball?.lastHit === 'player' && Math.random() < 0.4) this.say('powerup_player', null, 1);
        }

        onPowerShot() {
            if (Math.random() < 0.6) this.say('power_shot', null, 1);
        }

        onRallyMilestone() { /* rally talk comes from rallyRemark on each hit */ }
    }

    AIController.LINES = LINES;
    window.AIController = AIController;
})();
