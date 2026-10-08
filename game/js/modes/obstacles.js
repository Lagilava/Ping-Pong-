class ObstacleFragment {
    constructor(x, y, baseColor, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.baseColor = baseColor;
        this.life = 0.6 + Math.random() * 0.4;
        this.maxLife = this.life;
        this.rotation = Math.random() * Math.PI * 2;
        this.angularVel = (Math.random() - 0.5) * 12;
        this.size = 4 + Math.random() * 8;
        this.sides = 4 + Math.floor(Math.random() * 4); // 4-7 sided polygon
    }

    update(dt) {
        const game = window.game || { width: 0, height: 0 };

        // apply gravity and drag
        this.vy += 180 * dt; // gravity
        this.vx *= Math.pow(0.94, dt * 60); // air drag
        this.vy *= Math.pow(0.96, dt * 60); // vertical drag for smooth settling

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // basic world bounds collision
        const radius = Math.max(2, this.size * 0.45);
        if (game.width > 0) {
            if (this.x - radius < 0) {
                this.x = radius;
                this.vx = Math.abs(this.vx) * 0.55;
                this.vy *= 0.95;
            } else if (this.x + radius > game.width) {
                this.x = game.width - radius;
                this.vx = -Math.abs(this.vx) * 0.55;
                this.vy *= 0.95;
            }
        }

        if (game.height > 0) {
            if (this.y + radius > game.height) {
                this.y = game.height - radius;
                this.vy = -Math.abs(this.vy) * 0.42;
                this.vx *= 0.78;

                // settle to the floor after small bounce
                if (Math.abs(this.vy) < 12) {
                    this.vy = 0;
                    this.vx *= 0.88;
                }
            } else if (this.y - radius < 0) {
                this.y = radius;
                this.vy = Math.abs(this.vy) * 0.55;
            }
        }

        // angular damping
        this.angularVel *= Math.pow(0.92, dt * 60);
        this.rotation += this.angularVel * dt;

        this.life -= dt;
        return this.life > 0;
    }

    render(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        ctx.fillStyle = this.baseColor;
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            const angle = (i / this.sides) * Math.PI * 2;
            const sx = Math.cos(angle) * this.size;
            const sy = Math.sin(angle) * this.size;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

// Fragment pooling system for reduced GC pressure
class FragmentPool {
    constructor(initialSize = 256) {
        this.pool = [];
        this.active = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new ObstacleFragment(0, 0, '#fff', 0, 0));
        }
    }

    get(x, y, color, vx, vy) {
        let frag;
        if (this.pool.length > 0) {
            frag = this.pool.pop();
            frag.x = x;
            frag.y = y;
            frag.vx = vx;
            frag.vy = vy;
            frag.baseColor = color;
            frag.life = 0.6 + Math.random() * 0.4;
            frag.maxLife = frag.life;
            frag.rotation = Math.random() * Math.PI * 2;
            frag.angularVel = (Math.random() - 0.5) * 12;
            frag.size = 4 + Math.random() * 8;
            frag.sides = 4 + Math.floor(Math.random() * 4);
        } else {
            frag = new ObstacleFragment(x, y, color, vx, vy);
        }
        this.active.push(frag);
        return frag;
    }

    updateAll(dt) {
        let writeIdx = 0;
        for (let i = 0; i < this.active.length; i++) {
            if (this.active[i].update(dt)) {
                this.active[writeIdx++] = this.active[i];
            } else {
                this.pool.push(this.active[i]); // Return to pool
            }
        }
        this.active.length = writeIdx;
    }

    renderAll(ctx, enabled) {
        if (!enabled) return;
        this.active.forEach(f => f.render(ctx));
    }

    clear() {
        this.pool.push(...this.active);
        this.active.length = 0;
    }
}

// Global fragment pool (shared across all obstacles)
window.globalFragmentPool = new FragmentPool(512);

// ===================================================================
// OBSTACLE GROUP SYSTEM – coordinated multi-obstacle behavior
// ===================================================================
class ObstacleGroup {
    constructor(leader, groupId) {
        this.id = groupId;
        this.leader = leader;
        this.members = [leader];
        this.groupPattern = this.chooseGroupPattern();
        this.groupCenter = { x: leader.pos.x + leader.w / 2, y: leader.pos.y + leader.h / 2 };
        this.groupPhase = Math.random() * Math.PI * 2;
        this.groupSpeed = 0.8 + Math.random() * 0.6;
        this.formationSpread = 120 + Math.random() * 80;
        this.groupTimer = 0;
        this.groupDuration = 10 + Math.random() * 15;
        this.splitTimer = 0;
    }

    chooseGroupPattern() {
        const patterns = ['diamond_formation', 'wedge_attack', 'spiral_dance', 'synchronized_wave', 'coordinated_avoidance'];
        return patterns[Math.floor(Math.random() * patterns.length)];
    }

    addMember(obstacle) {
        if (!this.members.includes(obstacle)) {
            this.members.push(obstacle);
            obstacle.groupId = this.id;
        }
    }

    removeMember(obstacle) {
        const idx = this.members.indexOf(obstacle);
        if (idx >= 0) {
            this.members.splice(idx, 1);
            obstacle.groupId = null;
        }
    }

    update(dt, game) {
        const arena = game?.bgRenderer?._obstacleArenaState || null;
        if (arena) {
            this.groupSpeed = Math.max(0.45, 0.58 + arena.energy * 0.7 + Math.abs(arena.spin) * 0.08);
            this.formationSpread = Math.max(72, 90 + arena.spread * 0.16 + arena.energy * 42);
        }

        this.groupPhase += dt * this.groupSpeed;
        this.groupTimer += dt;
        this.splitTimer += dt;

        // Update group center (average of members)
        if (this.members.length > 0) {
            let sumX = 0, sumY = 0;
            for (const m of this.members) {
                sumX += m.pos.x + m.w / 2;
                sumY += m.pos.y + m.h / 2;
            }
            this.groupCenter.x = sumX / this.members.length;
            this.groupCenter.y = sumY / this.members.length;
        }

        // Split if group gets too large or timer expires
        if (this.splitTimer > 8 || this.members.length > 6) {
            this.splitTimer = 0;
            this.members = [this.members[0]]; // Keep only leader
        }

        // Pattern-specific behavior
        for (let i = 0; i < this.members.length; i++) {
            const member = this.members[i];
            const posInFormation = i;

            switch (this.groupPattern) {
                case 'diamond_formation': {
                    const angle = (Math.PI * 2 / Math.max(3, this.members.length)) * posInFormation + this.groupPhase;
                    const offsetX = Math.cos(angle) * this.formationSpread * 0.8;
                    const offsetY = Math.sin(angle) * this.formationSpread * 0.6;
                    member.groupTargetX = this.groupCenter.x + offsetX;
                    member.groupTargetY = this.groupCenter.y + offsetY;
                    break;
                }
                case 'wedge_attack': {
                    const offset = posInFormation - this.members.length / 2;
                    member.groupTargetX = this.groupCenter.x + offset * 40;
                    member.groupTargetY = this.groupCenter.y - posInFormation * 50;
                    break;
                }
                case 'spiral_dance': {
                    const radiusGrow = (this.formationSpread * (posInFormation + 1)) / Math.max(1, this.members.length);
                    const spiralAngle = this.groupPhase + (posInFormation / this.members.length) * Math.PI * 4;
                    member.groupTargetX = this.groupCenter.x + Math.cos(spiralAngle) * radiusGrow;
                    member.groupTargetY = this.groupCenter.y + Math.sin(spiralAngle) * radiusGrow;
                    break;
                }
                case 'synchronized_wave': {
                    const waveOffset = Math.sin(this.groupPhase + posInFormation * 0.6) * this.formationSpread * 0.5;
                    member.groupTargetX = this.groupCenter.x + (posInFormation - this.members.length / 2) * 50;
                    member.groupTargetY = this.groupCenter.y + waveOffset;
                    break;
                }
                case 'coordinated_avoidance': {
                    const angle = (Math.PI * 2 / Math.max(2, this.members.length)) * posInFormation;
                    const distFromCenter = 80 + Math.sin(this.groupPhase + posInFormation) * 40;
                    member.groupTargetX = this.groupCenter.x + Math.cos(angle) * distFromCenter;
                    member.groupTargetY = this.groupCenter.y + Math.sin(angle) * distFromCenter;
                    break;
                }
            }
        }
    }
}

class ObstacleCourse {
    constructor(game) {
        this.game = game;
        this.grid = null;
        this.patternIndex = -1;
        this.scoreStamp = -1;
        this.phase = 0;
        this.obstacles = [];
        this.courseLines = [];
        this.courseRoute = null;
        this.courseRouteIndex = 0;
        this.courseRouteTimer = 0;
        this.courseRouteClears = 0;
        this.courseRouteFlash = 0;
        this.courseRouteCombo = 0;
        this.patternName = 'Slalom Gates';
        this.difficultyMultiplier = 1;
        this.difficultyTier = 0;
        this.courseSeed = 1;
        this.random = this.createRng(this.courseSeed);
    }

    rebuild(force = false) {
        const game = this.game;
        if (!game) return [];

        const totalScore = (game.scores?.player || 0) + (game.scores?.ai || 0);
        const rally = Math.max(0, game.rallyCount || 0);
        const courseBand = Math.floor(totalScore / 4);
        const nextPattern = courseBand % 6;
        const needsGrid = !this.grid ||
            this.grid.width !== game.width ||
            this.grid.height !== game.height;

        if (!force && !needsGrid && nextPattern === this.patternIndex && courseBand === this.scoreStamp) {
            return this.obstacles;
        }

        this.patternIndex = nextPattern;
        this.scoreStamp = courseBand;
        this.grid = this.createGrid(game.width, game.height);
        this.phase = 0;
        this.courseSeed = ((game.width * 31) ^ (game.height * 17) ^ (courseBand * 97) ^ ((rally + 1) * 131)) >>> 0;
        this.random = this.createRng(this.courseSeed);
        this.courseLines = [];
        this.courseRoute = null;
        this.courseRouteIndex = 0;
        this.courseRouteTimer = 0;
        this.courseRouteFlash = 0;
        this.courseRouteCombo = 0;

        Obstacle.groups = [];

        switch (this.patternIndex) {
            case 1:
                this.patternName = 'Circuit Shutters';
                this.obstacles = this.buildCircuitShutters();
                break;
            case 2:
                this.patternName = 'Relay Rotors';
                this.obstacles = this.buildRelayRotors();
                break;
            case 3:
                this.patternName = 'Repulsor Field';
                this.obstacles = this.buildRepulsorField();
                break;
            case 4:
                this.patternName = 'Switchback Maze';
                this.obstacles = this.buildSwitchbackMaze();
                break;
            case 5:
                this.patternName = 'Endurance Run';
                this.obstacles = this.buildEnduranceRun();
                break;
            default:
                this.patternName = 'Slalom Gates';
                this.obstacles = this.buildSlalomGates();
                break;
        }

        game.obstacles = this.obstacles;
        return this.obstacles;
    }

    createRng(seed) {
        let state = seed >>> 0;
        if (!state) state = 0x9e3779b9;
        return () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
    }

    randRange(min, max) {
        return min + (max - min) * (this.random ? this.random() : Math.random());
    }

    point(col, row, offsetX = 0, offsetY = 0) {
        const p = this.node(col, row);
        return { x: p.x + offsetX, y: p.y + offsetY };
    }

    addCourseLine(points, options = {}) {
        const clean = Array.isArray(points)
            ? points
                .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
                .map(point => ({ x: point.x, y: point.y }))
            : [];
        if (clean.length < 2) return null;

        const line = {
            points: clean,
            color: options.color || '#00ffd6',
            width: options.width || 2,
            alpha: options.alpha ?? 0.14,
            dash: Array.isArray(options.dash) ? options.dash : [12, 10],
            nodeAlpha: options.nodeAlpha ?? 0.22,
            pulse: options.pulse ?? 0,
        };

        this.courseLines.push(line);
        return line;
    }

    setCourseRoute(name, points, options = {}) {
        const clean = Array.isArray(points)
            ? points
                .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
                .map(point => ({ x: point.x, y: point.y }))
            : [];
        if (!clean.length) return null;

        this.courseRoute = {
            name: name || this.patternName,
            points: clean,
            color: options.color || '#ffffff',
            checkpointRadius: options.checkpointRadius || 28,
            bonus: options.bonus || 2,
            timeout: options.timeout || 4.5,
            checkpointValue: options.checkpointValue ?? 0,
            label: options.label || 'Route',
        };
        this.courseRouteIndex = 0;
        this.courseRouteTimer = 0;
        this.courseRouteFlash = 0;
        this.courseRouteCombo = 0;
        return this.courseRoute;
    }

    getCourseStatusText() {
        if (!this.courseRoute) return this.patternName;
        const total = this.courseRoute.points.length;
        const next = Math.min(this.courseRouteIndex + 1, total);
        const clears = this.courseRouteClears;
        return `${this.patternName} - ${next}/${total} ${this.courseRoute.label} - ${clears} clears`;
    }

    updateCourseRoute(dt) {
        const route = this.courseRoute;
        const ball = this.game?.ball;
        if (!route || !ball || !route.points.length) return;

        if (this.courseRouteIndex > 0) this.courseRouteTimer += dt;
        this.courseRouteFlash = Math.max(0, this.courseRouteFlash - dt * 1.4);

        if (this.courseRouteIndex > 0 && this.courseRouteTimer > route.timeout) {
            this.resetCourseRoute('timeout');
            return;
        }

        const index = Math.min(this.courseRouteIndex, route.points.length - 1);
        const target = route.points[index];
        const dx = target.x - ball.pos.x;
        const dy = target.y - ball.pos.y;
        const dist = Math.hypot(dx, dy);
        const approach = ball.vel.x * dx + ball.vel.y * dy;
        const radius = route.checkpointRadius + Math.min(18, ball.r * 0.6);

        if (dist <= radius && approach > -1200) {
            this.courseRouteIndex += 1;
            this.courseRouteTimer = 0;
            this.courseRouteFlash = 1;
            this.courseRouteCombo += 1;

            const checkpointValue = Number(route.checkpointValue) || 0;
            if (checkpointValue > 0) {
                this.game.scores.player += checkpointValue;
                this.game.progression?.recordPoint?.('player', checkpointValue);
            }

            const speed = Math.hypot(ball.vel.x, ball.vel.y) || ball.baseSpeed || 600;
            const directionX = Math.sign(ball.vel.x) || 1;
            const flowBoost = Math.min(ball.maxSpeed || speed * 1.2, speed * 1.025);
            ball.vel.x = directionX * Math.max(Math.abs(ball.vel.x), flowBoost * 0.72);
            ball.vel.y += (target.y - ball.pos.y) * 0.025;
            this.game.screenShake = Math.max(this.game.screenShake || 0, 1.25);
            this.game.showNotification(route.name, `Checkpoint ${this.courseRouteIndex}/${route.points.length}`, route.color);

            if (this.courseRouteIndex >= route.points.length) {
                this.courseRouteClears += 1;
                this.game.scores.player += route.bonus;
                this.game.progression?.recordPoint?.('player', route.bonus);
                this.game.showNotification(`${route.name} cleared`, `+${route.bonus} course points`, '#ffd166');
                this.courseRouteIndex = 0;
                this.courseRouteTimer = 0;
                this.courseRouteCombo = 0;
            }

            this.game.updateScoreUI();
        }
    }

    resetCourseRoute(reason = 'reset') {
        if (!this.courseRoute) return;
        if (reason === 'timeout' && this.courseRouteIndex > 0) {
            this.game?.showNotification?.(this.courseRoute.name, 'Route reset - keep the ball moving', '#ff8c66');
        }
        this.courseRouteIndex = 0;
        this.courseRouteTimer = 0;
        this.courseRouteCombo = 0;
    }

    buildRepulsorField() {
        const g = this.grid;
        const obstacles = [];
        const repulsorR = Math.max(20, Math.min(35, Math.min(g.cellW, g.cellH) * 0.3));

        this.addCourseLine([
            this.point(Math.floor(g.cols / 2), 1),
            this.point(Math.floor(g.cols / 2) - 1, Math.floor(g.rows / 2) - 1),
            this.point(Math.floor(g.cols / 2), Math.floor(g.rows / 2)),
            this.point(Math.floor(g.cols / 2) + 1, Math.floor(g.rows / 2) + 1),
            this.point(Math.floor(g.cols / 2), g.rows - 2),
        ], {
            color: '#ff6e6e',
            width: 2.4,
            alpha: 0.16,
            dash: [7, 9],
            pulse: 2.1,
        });

        // Central repulsor - big and scary
        obstacles.push(this.makeNode('Prime Repulsor', Math.floor(g.cols / 2), Math.floor(g.rows / 2), repulsorR * 1.5, {
            forcedType: 'repulsor',
            railColor: '#ff6e6e'
        }));

        // Orbital repulsors
        [1, g.rows - 2].forEach((row, i) => {
            [2, g.cols - 3].forEach((col, j) => {
                const path = [
                    this.point(col, row),
                    this.point(col, Math.floor(g.rows / 2)),
                    this.point(col === 2 ? 3 : g.cols - 4, row)
                ];
                obstacles.push(this.makeNode(`Repulsor ${i}-${j}`, col, row, repulsorR, {
                    forcedType: 'repulsor',
                    path: path,
                    pathSpeed: 0.15 + i * 0.05 + this.difficultyMultiplier * 0.01,
                    railColor: '#ff9b4a'
                }));
            });
        });

        this.setCourseRoute('Repulsor Field', [
            this.point(1, Math.floor(g.rows / 2)),
            this.point(Math.floor(g.cols / 2), 1),
            this.point(Math.floor(g.cols / 2), Math.floor(g.rows / 2)),
            this.point(Math.floor(g.cols / 2), g.rows - 2),
            this.point(g.cols - 2, Math.floor(g.rows / 2)),
        ], {
            color: '#ff6e6e',
            checkpointRadius: 30,
            bonus: 3,
            timeout: 4.0,
            label: 'Checkpoints',
        });

        return obstacles;
    }

    createGrid(width, height) {
        const sidePad = Math.min(Math.max(72, width * 0.13), width * 0.24);
        const topPad = Math.min(Math.max(52, height * 0.12), height * 0.22);
        const bottomPad = Math.min(Math.max(48, height * 0.10), height * 0.18);
        const left = sidePad;
        const right = Math.max(left + width * 0.42, width - sidePad);
        const top = topPad;
        const bottom = Math.max(top + height * 0.42, height - bottomPad);
        const cols = width < 760 ? 6 : (width < 1180 ? 8 : 9);
        const rows = height < 520 ? 5 : (height < 760 ? 6 : 7);
        const cellW = (right - left) / (cols - 1);
        const cellH = (bottom - top) / (rows - 1);
        return { width, height, left, right, top, bottom, cols, rows, cellW, cellH };
    }

    node(col, row) {
        const g = this.grid;
        const safeCol = Number.isFinite(col) ? col : Math.floor((g.cols - 1) / 2);
        const safeRow = Number.isFinite(row) ? row : Math.floor((g.rows - 1) / 2);
        return {
            x: g.left + g.cellW * Math.max(0, Math.min(g.cols - 1, safeCol)),
            y: g.top + g.cellH * Math.max(0, Math.min(g.rows - 1, safeRow)),
        };
    }

    makeGate(name, col, row, width, height, motion) {
        const p = this.node(col, row);
        return new Obstacle(p.x - width / 2, p.y - height / 2, width, height, 'gate', {
            name,
            motion,
            railColor: '#00ffd6',
        });
    }

    makeNode(name, col, row, radius, options = {}) {
        const p = this.node(col, row);
        return new Obstacle(p.x - radius, p.y - radius, radius * 2, radius * 2, options.forcedType || 'node', {
            name,
            railColor: options.railColor || '#7df9ff',
            path: options.path,
            pathSpeed: options.pathSpeed,
            rotationSpeed: options.rotationSpeed
        });
    }

    makeRotor(name, path, width, height, speed, phase, rotationSpeed) {
        const p = path[0];
        return new Obstacle(p.x - width / 2, p.y - height / 2, width, height, 'rotor', {
            name,
            path,
            pathSpeed: speed,
            pathPhase: phase,
            rotationSpeed,
            railColor: '#ffd166',
        });
    }

    makeSpinner(name, path, width, height, speed, phase, rotationSpeed) {
        const p = path[0];
        return new Obstacle(p.x - width / 2, p.y - height / 2, width, height, 'spinner', {
            name,
            path,
            pathSpeed: speed,
            pathPhase: phase,
            rotationSpeed,
            railColor: '#ffd166',
        });
    }

    makeWall(name, x, y, width, height, options = {}) {
        return new Obstacle(x - width / 2, y - height / 2, width, height, 'wall', {
            name,
            motion: options.motion,
            railColor: options.railColor || '#ff8c66',
        });
    }

    buildSlalomGates() {
        const g = this.grid;
        const gateW = Math.max(16, Math.min(24, g.cellW * 0.18));
        const gateH = Math.max(66, Math.min(128, g.cellH * (1.02 + this.difficultyTier * 0.04)));
        const nodeR = Math.max(10, Math.min(16, Math.min(g.cellW, g.cellH) * 0.11));
        const mid = Math.floor((g.rows - 1) / 2);
        const gateCount = g.cols < 7 ? 3 : 4;
        const cols = [];
        for (let i = 0; i < gateCount; i++) {
            const col = Math.round(1 + ((i + 1) / (gateCount + 1)) * (g.cols - 2));
            if (col > 0 && col < g.cols - 1 && !cols.includes(col)) cols.push(col);
        }
        const routePoints = [
            this.point(1, mid),
            ...cols.map((col, i) => this.point(col, i % 2 === 0 ? 1 : g.rows - 2)),
            this.point(g.cols - 2, mid),
        ];

        this.addCourseLine(routePoints, {
            color: '#00ffd6',
            width: 2,
            alpha: 0.16,
            dash: [8, 12],
            pulse: 2.4,
        });

        const obstacles = cols.map((col, i) => {
            const minY = this.node(col, 1).y - gateH / 2;
            const maxY = this.node(col, g.rows - 2).y - gateH / 2;
            return this.makeGate(`Slalom ${i + 1}`, col, 1 + (i % 2), gateW, gateH, {
                axis: 'y',
                min: minY,
                max: maxY,
                speed: 0.3 + i * 0.04 + this.difficultyMultiplier * 0.02,
                phase: i * 0.29 + this.randRange(0, 0.2),
            });
        });
        obstacles.push(this.makeNode('Entry Node', 1, mid, nodeR, { forcedType: 'bumper' }));
        obstacles.push(this.makeNode('Exit Node', g.cols - 2, mid, nodeR, { forcedType: 'bumper' }));
        if (this.difficultyTier >= 2) {
            obstacles.push(this.makeNode('Pulse Pivot', Math.floor(g.cols / 2), mid, nodeR * 1.1, {
                forcedType: 'repulsor',
                path: [this.point(Math.floor(g.cols / 2), 1), this.point(Math.floor(g.cols / 2), g.rows - 2)],
                pathSpeed: 0.1 + this.difficultyTier * 0.02,
                railColor: '#ff6e6e',
            }));
        }

        this.setCourseRoute('Slalom Gates', routePoints, {
            color: '#00ffd6',
            checkpointRadius: 26,
            bonus: 2,
            timeout: 4.8,
            label: 'Gate Run',
        });
        return obstacles;
    }

    buildCircuitShutters() {
        const g = this.grid;
        const gateW = Math.max(86, Math.min(164, g.cellW * (1.18 + this.difficultyTier * 0.06)));
        const gateH = Math.max(14, Math.min(22, g.cellH * 0.18));
        const rows = [1, Math.floor(g.rows * 0.5), g.rows - 2].filter((v, i, arr) => v > 0 && v < g.rows - 1 && arr.indexOf(v) === i);
        const obstacles = [];
        const midCol = Math.floor((g.cols - 1) / 2);

        this.addCourseLine([
            this.point(1, 1),
            this.point(midCol - 1, 1),
            this.point(midCol, Math.floor(g.rows * 0.5)),
            this.point(midCol + 1, g.rows - 2),
            this.point(g.cols - 2, g.rows - 2),
        ], {
            color: '#ffd166',
            width: 2.2,
            alpha: 0.15,
            dash: [10, 14],
            pulse: 1.8,
        });

        rows.forEach((row, i) => {
            const leftStart = this.node(2, row).x - gateW / 2;
            const leftEnd = this.node(3, row).x - gateW / 2;
            const rightStart = this.node(g.cols - 3, row).x - gateW / 2;
            const rightEnd = this.node(g.cols - 4, row).x - gateW / 2;
            obstacles.push(this.makeGate(`Left Shutter ${i + 1}`, 2, row, gateW, gateH, {
                axis: 'x',
                min: Math.min(leftStart, leftEnd),
                max: Math.max(leftStart, leftEnd),
                speed: 0.28 + i * 0.04 + this.difficultyMultiplier * 0.02,
                phase: i * 0.25,
            }));
            obstacles.push(this.makeGate(`Right Shutter ${i + 1}`, g.cols - 3, row, gateW, gateH, {
                axis: 'x',
                min: Math.min(rightStart, rightEnd),
                max: Math.max(rightStart, rightEnd),
                speed: 0.28 + i * 0.04 + this.difficultyMultiplier * 0.02,
                phase: 0.5 + i * 0.25,
            }));
        });

        const nodeR = Math.max(9, Math.min(14, Math.min(g.cellW, g.cellH) * 0.11));
        obstacles.push(this.makeNode('Center Relay', midCol, Math.floor((g.rows - 1) / 2), nodeR, {
            forcedType: 'magnet',
            railColor: '#f5bfff',
        }));
        obstacles.push(this.makeSpinner('Circuit Spinner', [this.point(3, 1), this.point(g.cols - 4, 1), this.point(g.cols - 4, g.rows - 2), this.point(3, g.rows - 2)], gateW * 0.78, gateH * 1.1, 0.14 + this.difficultyTier * 0.01, 0.2, 1.45));

        this.setCourseRoute('Circuit Shutters', [
            this.point(1, 1),
            this.point(2, 1),
            this.point(midCol, Math.floor(g.rows * 0.5)),
            this.point(g.cols - 3, g.rows - 2),
            this.point(g.cols - 2, g.rows - 2),
        ], {
            color: '#ffd166',
            checkpointRadius: 28,
            bonus: 2,
            timeout: 4.4,
            label: 'Shutter Line',
        });
        return obstacles;
    }

    buildRelayRotors() {
        const g = this.grid;
        const rotorW = Math.max(58, Math.min(104, g.cellW * (0.72 + this.difficultyTier * 0.04)));
        const rotorH = Math.max(12, Math.min(18, g.cellH * 0.16));
        const obstacles = [];
        const rowA = 1;
        const rowB = g.rows - 2;
        const mid = Math.floor((g.rows - 1) / 2);
        const pathA = [this.point(2, rowA), this.point(g.cols - 3, rowA), this.point(g.cols - 3, mid), this.point(2, mid)];
        const pathB = [this.point(g.cols - 3, rowB), this.point(2, rowB), this.point(2, mid), this.point(g.cols - 3, mid)];
        const pathC = [this.point(3, mid), this.point(g.cols - 4, mid)];

        this.addCourseLine([
            this.point(1, rowA),
            this.point(2, rowA),
            this.point(g.cols - 3, rowA),
            this.point(g.cols - 3, mid),
            this.point(2, mid),
            this.point(2, rowB),
            this.point(g.cols - 2, rowB),
        ], {
            color: '#ffd166',
            width: 2.2,
            alpha: 0.14,
            dash: [9, 13],
            pulse: 1.6,
        });

        obstacles.push(this.makeRotor('Relay Rotor A', pathA, rotorW, rotorH, 0.12 + this.difficultyTier * 0.01, 0.00, 1.25));
        obstacles.push(this.makeRotor('Relay Rotor B', pathB, rotorW, rotorH, 0.12 + this.difficultyTier * 0.01, 0.35, -1.15));
        obstacles.push(this.makeSpinner('Relay Spinner C', pathC, rotorW * 0.9, rotorH, 0.18 + this.difficultyTier * 0.01, 0.20, 1.55));

        const nodeR = Math.max(9, Math.min(13, Math.min(g.cellW, g.cellH) * 0.10));
        obstacles.push(this.makeNode('Top Transfer', Math.floor((g.cols - 1) / 2), rowA, nodeR, { forcedType: 'bumper' }));
        obstacles.push(this.makeNode('Bottom Transfer', Math.floor((g.cols - 1) / 2), rowB, nodeR, { forcedType: 'bumper' }));
        obstacles.push(this.makeNode('Center Magnet', Math.floor(g.cols / 2), mid, nodeR * 1.1, {
            forcedType: 'magnet',
            railColor: '#f5bfff',
        }));

        this.setCourseRoute('Relay Rotors', [
            this.point(1, rowA),
            this.point(2, rowA),
            this.point(g.cols - 3, rowA),
            this.point(g.cols - 3, mid),
            this.point(2, mid),
            this.point(g.cols - 2, rowB),
        ], {
            color: '#ffd166',
            checkpointRadius: 28,
            bonus: 3,
            timeout: 5.0,
            label: 'Rotor Chain',
        });
        return obstacles;
    }

    buildSwitchbackMaze() {
        const g = this.grid;
        const obstacles = [];
        const wallW = Math.max(18, Math.min(30, g.cellW * 0.26));
        const wallH = Math.max(110, Math.min(190, g.cellH * (1.55 + this.difficultyTier * 0.08)));
        const mid = Math.floor((g.rows - 1) / 2);
        const nodeR = Math.max(9, Math.min(14, Math.min(g.cellW, g.cellH) * 0.1));

        this.addCourseLine([
            this.point(1, mid),
            this.point(2, 1),
            this.point(3, mid),
            this.point(4, g.rows - 2),
            this.point(g.cols - 3, 1),
            this.point(g.cols - 2, mid),
        ], {
            color: '#ff8c66',
            width: 2.2,
            alpha: 0.16,
            dash: [8, 11],
            pulse: 1.7,
        });

        obstacles.push(this.makeWall('Maze Wall A', g.left + g.cellW * 1.55, g.top + g.cellH * 1.15, wallW, wallH, { railColor: '#ff8c66' }));
        obstacles.push(this.makeWall('Maze Wall B', g.right - g.cellW * 1.55, g.bottom - g.cellH * 1.15, wallW, wallH, { railColor: '#ff8c66' }));
        obstacles.push(this.makeWall('Maze Wall C', g.left + g.cellW * 3.0, g.bottom - g.cellH * 1.05, wallW, wallH * 0.78, { railColor: '#ff9d73' }));
        obstacles.push(this.makeWall('Maze Wall D', g.right - g.cellW * 3.0, g.top + g.cellH * 1.05, wallW, wallH * 0.78, { railColor: '#ff9d73' }));
        obstacles.push(this.makeSpinner('Maze Spinner A', [this.point(2, mid), this.point(4, 1), this.point(3, mid)], wallW * 1.2, Math.max(12, wallW * 0.42), 0.16, 0.1, 1.4));
        obstacles.push(this.makeSpinner('Maze Spinner B', [this.point(g.cols - 4, 1), this.point(g.cols - 2, mid), this.point(g.cols - 3, mid)], wallW * 1.2, Math.max(12, wallW * 0.42), 0.16, 0.55, -1.35));
        obstacles.push(this.makeNode('Maze Exit', g.cols - 2, mid, nodeR, { forcedType: 'bumper', railColor: '#7df9ff' }));

        this.setCourseRoute('Switchback Maze', [
            this.point(1, mid),
            this.point(2, 1),
            this.point(3, mid),
            this.point(4, g.rows - 2),
            this.point(g.cols - 3, 1),
            this.point(g.cols - 2, mid),
        ], {
            color: '#ff8c66',
            checkpointRadius: 30,
            bonus: 3,
            timeout: 5.2,
            label: 'Maze Flow',
        });
        return obstacles;
    }

    buildEnduranceRun() {
        const g = this.grid;
        const obstacles = [];
        const gateW = Math.max(16, Math.min(24, g.cellW * 0.18));
        const gateH = Math.max(72, Math.min(132, g.cellH * (1.08 + this.difficultyTier * 0.03)));
        const nodeR = Math.max(9, Math.min(14, Math.min(g.cellW, g.cellH) * 0.1));
        const mid = Math.floor((g.rows - 1) / 2);
        const repulsorR = Math.max(18, Math.min(32, Math.min(g.cellW, g.cellH) * 0.26));

        this.addCourseLine([
            this.point(1, mid),
            this.point(2, 1),
            this.point(3, mid - 1),
            this.point(4, g.rows - 2),
            this.point(g.cols - 4, 1),
            this.point(g.cols - 2, mid),
        ], {
            color: '#fff5c7',
            width: 2.4,
            alpha: 0.17,
            dash: [6, 8],
            pulse: 2.0,
        });

        obstacles.push(this.makeGate('Endurance Gate A', 2, 1, gateW, gateH, {
            axis: 'y',
            min: this.node(2, 1).y - gateH / 2,
            max: this.node(2, g.rows - 2).y - gateH / 2,
            speed: 0.38 + this.difficultyTier * 0.03,
            phase: 0.18,
        }));

        obstacles.push(this.makeGate('Endurance Gate B', g.cols - 3, g.rows - 2, gateW, gateH, {
            axis: 'y',
            min: this.node(g.cols - 3, 1).y - gateH / 2,
            max: this.node(g.cols - 3, g.rows - 2).y - gateH / 2,
            speed: 0.4 + this.difficultyTier * 0.03,
            phase: 0.58,
        }));

        obstacles.push(this.makeRotor('Endurance Rotor', [this.point(3, mid), this.point(g.cols - 4, mid)], gateW * 1.5, Math.max(12, gateH * 0.45), 0.16, 0.12, 1.6));
        obstacles.push(this.makeNode('Endurance Core', Math.floor(g.cols / 2), mid, repulsorR, { forcedType: 'repulsor', railColor: '#ff6e6e' }));
        obstacles.push(this.makeWall('Endurance Brace', g.left + g.cellW * 1.45, g.top + g.cellH * 1.25, Math.max(18, g.cellW * 0.24), Math.max(98, g.cellH * 1.35), { railColor: '#ff9d73' }));
        obstacles.push(this.makeWall('Endurance Brace B', g.right - g.cellW * 1.45, g.bottom - g.cellH * 1.25, Math.max(18, g.cellW * 0.24), Math.max(98, g.cellH * 1.35), { railColor: '#ff9d73' }));
        obstacles.push(this.makeNode('Endurance Finish', g.cols - 2, mid, nodeR, { forcedType: 'bumper', railColor: '#7df9ff' }));

        this.setCourseRoute('Endurance Run', [
            this.point(1, mid),
            this.point(2, 1),
            this.point(3, mid - 1),
            this.point(4, g.rows - 2),
            this.point(g.cols - 4, 1),
            this.point(g.cols - 2, mid),
        ], {
            color: '#fff5c7',
            checkpointRadius: 28,
            bonus: 4,
            timeout: 5.0,
            label: 'Endurance',
        });
        return obstacles;
    }

    update(dt) {
        this.rebuild(false);
        this.phase += dt;
        const rally = Math.max(0, this.game?.rallyCount || 0);
        this.difficultyTier = Math.min(6, Math.floor(rally / 4));
        this.difficultyMultiplier = Math.min(2.05, 1 + this.difficultyTier * 0.11 + rally * 0.01);
        for (const obstacle of this.obstacles) {
            obstacle.courseSpeedMultiplier = this.difficultyMultiplier;
            obstacle.update(dt);
        }
        this.updateCourseRoute(dt);
    }

    renderRails(ctx) {
        const g = this.grid;
        if (!g) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < this.courseLines.length; i++) {
            const line = this.courseLines[i];
            if (!line?.points?.length) continue;

            const pulse = line.pulse ? 0.88 + Math.sin(this.phase * line.pulse + i * 0.45) * 0.12 : 1;
            ctx.save();
            ctx.strokeStyle = line.color || '#00ffd6';
            ctx.globalAlpha = (line.alpha ?? 0.14) * pulse;
            ctx.lineWidth = line.width || 2;
            ctx.setLineDash(line.dash || []);
            ctx.shadowBlur = (line.width || 2) * 2.4;
            ctx.shadowColor = line.color || '#00ffd6';
            ctx.beginPath();
            ctx.moveTo(line.points[0].x, line.points[0].y);
            for (let j = 1; j < line.points.length; j++) {
                ctx.lineTo(line.points[j].x, line.points[j].y);
            }
            ctx.stroke();

            if ((line.nodeAlpha ?? 0) > 0) {
                ctx.shadowBlur = 0;
                ctx.setLineDash([]);
                ctx.globalAlpha = line.nodeAlpha * pulse;
                for (const point of line.points) {
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
                    ctx.fillStyle = line.color || '#00ffd6';
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        if (this.courseRoute?.points?.length) {
            const route = this.courseRoute;
            const activeIndex = Math.min(this.courseRouteIndex, route.points.length - 1);

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.globalAlpha = 0.07 + this.courseRouteFlash * 0.08;
            ctx.strokeStyle = route.color || '#ffffff';
            ctx.lineWidth = Math.max(24, (route.checkpointRadius || 28) * 1.65);
            ctx.shadowBlur = 26;
            ctx.shadowColor = route.color || '#ffffff';
            ctx.beginPath();
            ctx.moveTo(route.points[0].x, route.points[0].y);
            for (let i = 1; i < route.points.length; i++) {
                ctx.lineTo(route.points[i].x, route.points[i].y);
            }
            ctx.stroke();

            ctx.globalAlpha = 0.22 + this.courseRouteFlash * 0.24;
            ctx.strokeStyle = route.color || '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(route.points[0].x, route.points[0].y);
            for (let i = 1; i < route.points.length; i++) {
                ctx.lineTo(route.points[i].x, route.points[i].y);
            }
            ctx.stroke();

            if (activeIndex > 0) {
                ctx.globalAlpha = 0.45 + this.courseRouteFlash * 0.28;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(route.points[0].x, route.points[0].y);
                for (let i = 1; i <= activeIndex; i++) {
                    ctx.lineTo(route.points[i].x, route.points[i].y);
                }
                ctx.stroke();
            }

            for (let i = 0; i < route.points.length; i++) {
                const point = route.points[i];
                const isActive = i === activeIndex;
                const isCleared = i < activeIndex;
                ctx.beginPath();
                ctx.fillStyle = isActive ? route.color : (isCleared ? 'rgba(255, 255, 255, 0.36)' : 'rgba(255,255,255,0.18)');
                ctx.strokeStyle = route.color;
                ctx.lineWidth = isActive ? 3 : (isCleared ? 2 : 1.5);
                ctx.shadowBlur = isActive ? 24 : (isCleared ? 14 : 8);
                ctx.shadowColor = route.color;
                ctx.arc(point.x, point.y, (route.checkpointRadius || 28) * (isActive ? 0.82 : 0.56), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        for (const obstacle of this.obstacles) {
            if (!obstacle?.active) continue;
            const color = obstacle.activeRailColor || obstacle.railColor || '#00ffd6';
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.12 + obstacle.hitFlash * 0.08 + (obstacle.dangerLevel || 0) * 0.12;
            ctx.lineWidth = 2 + (obstacle.dangerLevel || 0) * 1.2;

            if (obstacle.motion?.axis === 'y') {
                const x = obstacle.originalPos.x + obstacle.w / 2;
                ctx.beginPath();
                ctx.moveTo(x, obstacle.motion.min + obstacle.h / 2);
                ctx.lineTo(x, obstacle.motion.max + obstacle.h / 2);
                ctx.stroke();
            } else if (obstacle.motion?.axis === 'x') {
                const y = obstacle.originalPos.y + obstacle.h / 2;
                ctx.beginPath();
                ctx.moveTo(obstacle.motion.min + obstacle.w / 2, y);
                ctx.lineTo(obstacle.motion.max + obstacle.w / 2, y);
                ctx.stroke();
            } else if (Array.isArray(obstacle.path) && obstacle.path.length > 1) {
                ctx.beginPath();
                ctx.moveTo(obstacle.path[0].x, obstacle.path[0].y);
                for (let i = 1; i < obstacle.path.length; i++) ctx.lineTo(obstacle.path[i].x, obstacle.path[i].y);
                if (obstacle.path.length > 2) ctx.lineTo(obstacle.path[0].x, obstacle.path[0].y);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

class Obstacle {
    static groups = [];

    constructor(x, y, w, h, forcedType = null, options = {}) {
        this.pos = new Vec2(x, y);
        this.w = w;
        this.h = h;
        this.active = true;

        const types = ['gate', 'gate', 'node', 'rotor'];
        this.obstacleType = forcedType || types[Math.floor(Math.random() * types.length)];
        this.name = options.name || this.obstacleType;

        // Visual state
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.rotation = this.obstacleType === 'rotor' ? Math.random() * Math.PI * 2 : 0;
        this.rotationSpeed = Number.isFinite(options.rotationSpeed)
            ? options.rotationSpeed
            : ((0.7 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1));
        this.glowIntensity = 0;   // 0-1, spikes on hit
        this.hitFlash = 0;   // bright flash on collision
        this.hitRipples = [];  // short-lived ripple rings after hit

        // Legacy damage fields are retained for compatibility, but course
        // obstacles do not break or randomly respawn.
        this.damageLevel = 0;
        this.maxDamage = Infinity;
        this.respawnDelay = 0;
        this.respawnTimer = 0;
        this.originalPos = new Vec2(x, y);
        this.groupTargetX = x;
        this.groupTargetY = y;
        this.motion = options.motion || null;
        this.path = Array.isArray(options.path) ? options.path : null;
        this.pathSpeed = Number.isFinite(options.pathSpeed) ? options.pathSpeed : 0;
        this.pathPhase = Number.isFinite(options.pathPhase) ? options.pathPhase : 0;
        this.pathProgress = this.pathPhase;
        this.railColor = options.railColor || '#00ffd6';
        this.activeRailColor = this.railColor;
        this.courseSpeedMultiplier = 1;
        this.dangerLevel = 0;

        // Colour per type
        const palette = {
            gate: { primary: '#d9fff8', glow: '#00ffd6', accent: '#7df9ff' },
            node: { primary: '#f8fbff', glow: '#00d4ff', accent: '#c9fff7' },
            rotor: { primary: '#ffe8a3', glow: '#ffd166', accent: '#fff5c7' },
            bumper: { primary: '#f4fbff', glow: '#7df9ff', accent: '#c9fff7' },
            wall: { primary: '#fff0de', glow: '#ff8c66', accent: '#ffd0b8' },
            spinner: { primary: '#fff0b6', glow: '#ffd166', accent: '#fff5c7' },
            magnet: { primary: '#ffe2ff', glow: '#f5bfff', accent: '#ffd8ff' },
            repulsor: { primary: '#ffe5e5', glow: '#ff6e6e', accent: '#ffd0c4' },
        };
        const col = palette[this.obstacleType] || palette.gate;
        this.colorPrimary = col.primary;
        this.colorGlow = col.glow;
        this.colorAccent = col.accent;

        // Particles spawned on hit
        this.hitParticles = [];

        this.driftVel = new Vec2(0, 0);
        this.floatPhase = Math.random() * Math.PI * 2;
        this.floatSpeed = 0;
        this.floatRange = 0;
        this.floatOffset = 0;

        // Magnet pull state
        this.magnetRadius = Math.max(w, h) * 2.6;
        this.magnetStrength = 180 + Math.random() * 100;
    }

    // Effective centre of this obstacle (accounts for float)
    get cx() { return this.pos.x + this.w / 2; }
    get cy() { return this.pos.y + this.h / 2 + this.floatOffset; }

    _blendHexColor(from, to, amount) {
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const parse = (hex) => {
            const value = String(hex || '#ffffff').replace('#', '');
            const normalized = value.length === 3
                ? value.split('').map(ch => ch + ch).join('')
                : value.padEnd(6, 'f').slice(0, 6);
            return {
                r: parseInt(normalized.slice(0, 2), 16),
                g: parseInt(normalized.slice(2, 4), 16),
                b: parseInt(normalized.slice(4, 6), 16),
            };
        };
        const a = parse(from);
        const b = parse(to);
        const t = clamp(amount, 0, 1);
        const c = (start, end) => Math.round(start + (end - start) * t).toString(16).padStart(2, '0');
        return `#${c(a.r, b.r)}${c(a.g, b.g)}${c(a.b, b.b)}`;
    }

    update(dt) {
        this._updateParticles(dt);

        this.pulsePhase += dt * 2.2;
        this.glowIntensity = Math.max(0, this.glowIntensity - dt * 3);
        this.hitFlash = Math.max(0, this.hitFlash - dt * 6);

        const speedMultiplier = Math.max(1, this.courseSpeedMultiplier || 1);
        const speedDanger = Math.max(0, Math.min(1, (speedMultiplier - 1) / 0.85));
        let reversalDanger = 0;

        if (this.motion) {
            const t = (this.pulsePhase * this.motion.speed * speedMultiplier + this.motion.phase * Math.PI * 2) % (Math.PI * 2);
            const eased = 0.5 + Math.sin(t) * 0.5;
            const next = this.motion.min + (this.motion.max - this.motion.min) * eased;
            if (this.motion.axis === 'x') this.pos.x = next;
            if (this.motion.axis === 'y') this.pos.y = next;
            reversalDanger = Math.max(0, (Math.abs(Math.sin(t)) - 0.78) / 0.22);
        }

        if (this.path?.length > 1) {
            this.pathProgress = (this.pathProgress + this.pathSpeed * speedMultiplier * dt) % 1;
            const segmentCount = this.path.length > 2 ? this.path.length : this.path.length - 1;
            const scaled = this.pathProgress * segmentCount;
            const idx = Math.floor(scaled) % segmentCount;
            const nextIdx = this.path.length > 2 ? (idx + 1) % this.path.length : Math.min(this.path.length - 1, idx + 1);
            const localT = scaled - Math.floor(scaled);
            const a = this.path[idx];
            const b = this.path[nextIdx];
            if (a && b) {
                this.pos.x = a.x + (b.x - a.x) * localT - this.w / 2;
                this.pos.y = a.y + (b.y - a.y) * localT - this.h / 2;
            }
            reversalDanger = Math.max(reversalDanger, Math.max(0, 1 - Math.min(localT, 1 - localT) / 0.14));
        }

        if (this.obstacleType === 'rotor') {
            this.rotation += this.rotationSpeed * speedMultiplier * dt * (1 + this.hitFlash * 0.4);
        }

        const targetDanger = Math.max(speedDanger, reversalDanger * 0.9);
        this.dangerLevel = Math.max(0, Math.min(1, (this.dangerLevel || 0) * 0.82 + targetDanger * 0.18));
        this.activeRailColor = this._blendHexColor(this.railColor || '#00ffd6', '#ff4a2f', this.dangerLevel);
        this.colorGlow = this.activeRailColor;

        // Fade hit-ripples
        this.hitRipples = this.hitRipples.filter(r => {
            r.radius += dt * 220;
            r.alpha = Math.max(0, 1 - r.radius / r.maxRadius);
            return r.alpha > 0;
        });
    }

    // -- Collision ---------------------------------------------------
    checkCollision(ball) {
        if (!this.active) return false;

        if (this.obstacleType === 'repulsor') {
            const dx = ball.pos.x - this.cx;
            const dy = ball.pos.y - this.cy;
            const dist = Math.hypot(dx, dy);
            const r = Math.min(this.w, this.h) / 2;
            if (dist < r + ball.r + 20) {
                const force = (1 - dist / (r + ball.r + 40)) * 600;
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);
                ball.vel.x += nx * force * 0.1;
                ball.vel.y += ny * force * 0.1;
            }
        }

        if (this.obstacleType === 'node' || this.obstacleType === 'bumper' || this.obstacleType === 'repulsor') {
            return this._checkBumperCollision(ball);
        }

        if (this.obstacleType === 'rotor' || this.obstacleType === 'spinner') {
            return this._checkSpinnerCollision(ball);
        }

        return this._checkAABBCollision(ball);
    }

    _checkBumperCollision(ball) {
        const radius = Math.min(this.w, this.h) / 2;
        const cx = this.cx;
        const cy = this.cy;
        const dx = ball.pos.x - cx;
        const dy = ball.pos.y - cy;
        const dist = Math.hypot(dx, dy);
        const minD = ball.r + radius;

        if (dist >= minD) return false;

        // Push out
        const nx = dist < 0.001 ? 1 : dx / dist;
        const ny = dist < 0.001 ? 0 : dy / dist;
        ball.pos.x = cx + nx * (minD + 1);
        ball.pos.y = cy + ny * (minD + 1);

        // Reflect + speed boost
        const speed = Math.hypot(ball.vel.x, ball.vel.y);
        const boost = this.obstacleType === 'node' ? 1.035 : 1.05;
        const newSpd = Math.min(ball.maxSpeed, speed * boost);
        ball.vel.x = nx * newSpd;
        ball.vel.y = ny * newSpd;
        ball.spin += nx * 0.05;

        this._onHit(ball, cx + nx * radius, cy + ny * radius);
        return true;
    }

    _checkSpinnerCollision(ball) {
        // Spinner is a thin rotating rod - treat as a rotated rectangle
        // Approximate: transform ball into spinner local space
        const cx = this.cx;
        const cy = this.cy;
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const dx = ball.pos.x - cx;
        const dy = ball.pos.y - cy;
        const lx = cos * dx - sin * dy;
        const ly = sin * dx + cos * dy;
        const halfW = this.w / 2 + ball.r;
        const halfH = this.h / 2 + ball.r;

        if (Math.abs(lx) > halfW || Math.abs(ly) > halfH) return false;

        // Reflect in local space, add spinner angular velocity to ball
        const overlapX = halfW - Math.abs(lx);
        const overlapY = halfH - Math.abs(ly);
        let nx = 0, ny = 0;
        if (overlapX < overlapY) { nx = lx > 0 ? 1 : -1; } else { ny = ly > 0 ? 1 : -1; }

        // Back to world space
        const wnx = cos * nx + sin * ny * -1;   // rotate normal back
        const wny = -sin * nx + cos * ny;
        const dot = ball.vel.x * wnx + ball.vel.y * wny;
        ball.vel.x -= 2 * dot * wnx;
        ball.vel.y -= 2 * dot * wny;

        // Add angular kick
        const preSpeed = Math.hypot(ball.vel.x, ball.vel.y) || ball.baseSpeed || 600;
        const angularKick = this.rotationSpeed * 42;
        ball.vel.x -= wny * angularKick;
        ball.vel.y += wnx * angularKick;

        const postSpeed = Math.hypot(ball.vel.x, ball.vel.y) || preSpeed;
        const cappedSpeed = Math.min(ball.maxSpeed, preSpeed * 1.035);
        if (postSpeed > cappedSpeed) {
            const scale = cappedSpeed / postSpeed;
            ball.vel.x *= scale;
            ball.vel.y *= scale;
        }

        // Push out
        const push = overlapX < overlapY ? overlapX : overlapY;
        ball.pos.x += wnx * (push + 1);
        ball.pos.y += wny * (push + 1);

        this._onHit(ball, ball.pos.x, ball.pos.y);
        return true;
    }

    _checkAABBCollision(ball) {
        const bx = this.pos.x;
        const by = this.pos.y + this.floatOffset;
        const cx = Math.max(bx, Math.min(ball.pos.x, bx + this.w));
        const cy = Math.max(by, Math.min(ball.pos.y, by + this.h));
        const dx = ball.pos.x - cx;
        const dy = ball.pos.y - cy;

        if (dx * dx + dy * dy > ball.r * ball.r) return false;

        let nx;
        let ny;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) {
            nx = dx / dist;
            ny = dy / dist;
            ball.pos.x = cx + nx * (ball.r + 1);
            ball.pos.y = cy + ny * (ball.r + 1);
        } else {
            const leftOverlap = Math.abs(ball.pos.x - bx);
            const rightOverlap = Math.abs((bx + this.w) - ball.pos.x);
            const topOverlap = Math.abs(ball.pos.y - by);
            const bottomOverlap = Math.abs((by + this.h) - ball.pos.y);
            const minOverlap = Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap);
            if (minOverlap === leftOverlap) {
                nx = -1; ny = 0; ball.pos.x = bx - ball.r - 1;
            } else if (minOverlap === rightOverlap) {
                nx = 1; ny = 0; ball.pos.x = bx + this.w + ball.r + 1;
            } else if (minOverlap === topOverlap) {
                nx = 0; ny = -1; ball.pos.y = by - ball.r - 1;
            } else {
                nx = 0; ny = 1; ball.pos.y = by + this.h + ball.r + 1;
            }
        }

        const dot = ball.vel.x * nx + ball.vel.y * ny;
        if (dot < 0) {
            ball.vel.x -= 2 * dot * nx;
            ball.vel.y -= 2 * dot * ny;
        }

        const speed = Math.hypot(ball.vel.x, ball.vel.y);
        const newSpd = Math.min(ball.maxSpeed, speed * 1.015);
        const s = newSpd / Math.max(0.001, speed);
        ball.vel.x *= s;
        ball.vel.y *= s;

        this._onHit(ball, cx, cy);
        return true;
    }

    _onHit(ball, hitX, hitY) {
        this.glowIntensity = 1;
        this.hitFlash = 1;
        this.damageLevel = 0;

        this.hitRipples.push({
            x: hitX, y: hitY,
            radius: ball.r,
            maxRadius: 42 + Math.random() * 18,
            alpha: 1,
            color: this.colorPrimary,
        });

        if (this.hitRipples.length > 3) this.hitRipples.splice(0, this.hitRipples.length - 3);
    }

    _updateParticles(dt) {
        this.hitParticles = this.hitParticles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt;   // gravity
            p.vx *= Math.pow(0.92, dt * 60);
            p.vy *= Math.pow(0.96, dt * 60);
            p.life -= dt;
            return p.life > 0;
        });
    }

    _respawn() {
        const game = window.game;
        if (!game) return;
        this.active = true;
        this.damageLevel = 0;
        this.glowIntensity = 0;
        this.hitFlash = 0;
        this.hitParticles = [];
        this.hitRipples = [];

        // Find a safe spot away from paddles
        const pad = 80;
        const minX = pad;
        const maxX = game.width - pad - this.w;
        const minY = pad;
        const maxY = game.height - pad - this.h;

        for (let tries = 0; tries < 20; tries++) {
            const nx = minX + Math.random() * (maxX - minX);
            const ny = minY + Math.random() * (maxY - minY);
            const okPlayer = Math.hypot(nx - game.player.pos.x, ny - game.player.pos.y) > 110;
            const okAI = Math.hypot(nx - game.aiPaddle.pos.x, ny - game.aiPaddle.pos.y) > 110;
            if (okPlayer && okAI) { this.pos.set(nx, ny); break; }
        }
        this.originalPos.set(this.pos.x, this.pos.y);
        this.groupTargetX = this.pos.x;
        this.groupTargetY = this.pos.y;
        this.driftVel.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    }

    // -- Rendering ---------------------------------------------------
    render(ctx) {
        // Dead particles / ripples still render even when inactive
        this._renderRipples(ctx);
        this._renderParticles(ctx);
        if (!this.active) return;

        switch (this.obstacleType) {
            case 'gate': this._renderGate(ctx); break;
            case 'node': this._renderNode(ctx); break;
            case 'rotor': this._renderRotor(ctx); break;
            case 'repulsor': this._renderRepulsor(ctx); break;
            case 'bumper': this._renderBumper(ctx); break;
            case 'wall': this._renderWall(ctx); break;
            case 'spinner': this._renderSpinner(ctx); break;
            case 'magnet': this._renderMagnet(ctx); break;
        }
    }

    _renderRepulsor(ctx) {
        const cx = this.cx;
        const cy = this.cy;
        const r = Math.min(this.w, this.h) / 2;
        const glow = this.hitFlash;
        const pulse = 1 + Math.sin(this.pulsePhase * 4) * 0.1;
        const activeColor = this.activeRailColor || this.colorGlow;

        ctx.save();
        ctx.translate(cx, cy);

        // Repulsion rings
        for (let i = 0; i < 3; i++) {
            const ringT = (this.pulsePhase * 0.5 + i / 3) % 1;
            const ringR = r * (1 + ringT * 1.5);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = activeColor;
            ctx.globalAlpha = (1 - ringT) * 0.4;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Core
        ctx.shadowBlur = 10 + glow * 20;
        ctx.shadowColor = activeColor;
        ctx.fillStyle = glow > 0.1 ? '#ffffff' : 'rgba(255, 50, 50, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Crosshair symbol
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0);
        ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6);
        ctx.stroke();

        ctx.restore();
    }

    _renderGate(ctx) {
        const x = this.pos.x;
        const y = this.pos.y;
        const glow = this.hitFlash;
        const activeColor = this.activeRailColor || this.colorGlow;
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.shadowBlur = (glow > 0.05 || this.dangerLevel > 0.2) ? 6 + glow * 10 + this.dangerLevel * 8 : 0;
        ctx.shadowColor = activeColor;
        ctx.fillStyle = glow > 0.15 ? '#f8ffff' : 'rgba(9, 34, 48, 0.92)';
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2 + this.dangerLevel * 1.1;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, this.w, this.h, Math.min(6, this.h * 0.35, this.w * 0.35));
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(x, y, this.w, this.h);
            ctx.strokeRect(x, y, this.w, this.h);
        }
        ctx.globalAlpha = 0.45 + glow * 0.35;
        ctx.fillStyle = this.colorAccent;
        if (this.h >= this.w) {
            ctx.fillRect(x + this.w * 0.35, y + 4, Math.max(2, this.w * 0.3), this.h - 8);
        } else {
            ctx.fillRect(x + 4, y + this.h * 0.35, this.w - 8, Math.max(2, this.h * 0.3));
        }
        ctx.restore();
    }

    _renderNode(ctx) {
        const r = Math.min(this.w, this.h) / 2;
        const glow = this.hitFlash;
        const activeColor = this.activeRailColor || this.colorGlow;
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.shadowBlur = (glow > 0.05 || this.dangerLevel > 0.2) ? 6 + glow * 8 + this.dangerLevel * 7 : 0;
        ctx.shadowColor = activeColor;
        ctx.fillStyle = glow > 0.15 ? '#ffffff' : 'rgba(12, 42, 58, 0.95)';
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2 + this.dangerLevel;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 0.6 + glow * 0.25;
        ctx.strokeStyle = this.colorAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _renderRotor(ctx) {
        const glow = this.hitFlash;
        const len = this.w / 2;
        const activeColor = this.activeRailColor || this.colorGlow;
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.rotate(this.rotation);
        ctx.shadowBlur = (glow > 0.05 || this.dangerLevel > 0.2) ? 6 + glow * 10 + this.dangerLevel * 8 : 0;
        ctx.shadowColor = activeColor;
        ctx.fillStyle = glow > 0.15 ? '#ffffff' : 'rgba(52, 39, 12, 0.95)';
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2 + this.dangerLevel * 1.1;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-len, -this.h / 2, this.w, this.h, this.h / 2);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(-len, -this.h / 2, this.w, this.h);
            ctx.strokeRect(-len, -this.h / 2, this.w, this.h);
        }
        ctx.fillStyle = this.colorAccent;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.arc(0, 0, this.h * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _renderRipples(ctx) {
        for (const r of this.hitRipples) {
            ctx.save();
            ctx.globalAlpha = r.alpha * 0.7;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 12;
            ctx.shadowColor = r.color;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    _renderParticles(ctx) {
        for (const p of this.hitParticles) {
            const a = p.life / p.maxLife;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _renderBumper(ctx) {
        const cx = this.cx;
        const cy = this.cy;
        const radius = Math.min(this.w, this.h) / 2;
        const pulse = 0.85 + Math.sin(this.pulsePhase * 1.8) * 0.15;
        const glow = this.glowIntensity;
        const dmgPct = this.damageLevel / this.maxDamage;

        ctx.save();

        // Outer glow halo
        const halo = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 2.4);
        halo.addColorStop(0, `${this.colorGlow}55`);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.globalAlpha = 0.4 + glow * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Body gradient
        const body = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius * pulse);
        body.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#fefefe');
        body.addColorStop(0.45, this.colorAccent);
        body.addColorStop(1, `${this.colorGlow}dd`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = body;
        ctx.shadowBlur = 18 + glow * 24;
        ctx.shadowColor = this.colorGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Subtle ping-pong seam
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = 'rgba(5, 30, 55, 0.35)';
        ctx.lineWidth = Math.max(1.5, radius * 0.12);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.72, Math.PI * 0.2, Math.PI * 1.15);
        ctx.stroke();

        // Damage cracks (rings)
        if (dmgPct > 0) {
            ctx.globalAlpha = dmgPct * 0.7;
            ctx.strokeStyle = 'rgba(255,78,205,0.78)';
            ctx.lineWidth = 2;
            for (let i = 0; i < Math.ceil(dmgPct * 3); i++) {
                const crackAngle = (i / 3) * Math.PI * 2 + this.pulsePhase;
                ctx.beginPath();
                ctx.arc(cx, cy, radius * (0.55 + i * 0.18), crackAngle, crackAngle + 0.9);
                ctx.stroke();
            }
        }

        // Inner ring
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = this.colorAccent;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        // Centre dot
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _renderWall(ctx) {
        const x = this.pos.x;
        const y = this.pos.y + this.floatOffset;
        const w = this.w;
        const h = this.h;
        const glow = this.glowIntensity;
        const dmgPct = this.damageLevel / this.maxDamage;

        ctx.save();

        // Shadow / glow backdrop
        ctx.fillStyle = `${this.colorGlow}28`;
        ctx.shadowBlur = 20 + glow * 30;
        ctx.shadowColor = this.colorGlow;
        ctx.fillRect(x - 6, y - 6, w + 12, h + 12);

        // Body
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#f8fbff');
        grad.addColorStop(0.48, this.colorPrimary);
        grad.addColorStop(1, this.colorGlow);
        ctx.fillStyle = grad;
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 14 + glow * 20;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, Math.min(h * 0.35, 10));
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, h);
        }

        // Paddle edge tape
        ctx.globalAlpha = 0.35 + dmgPct * 0.12;
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fillRect(x + 3, y + 3, w - 6, Math.max(3, h * 0.12));
        ctx.fillStyle = 'rgba(255,78,205,0.34)';
        ctx.fillRect(x + 3, y + h - Math.max(4, h * 0.14) - 3, w - 6, Math.max(3, h * 0.12));

        // Border
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.colorAccent;
        ctx.lineWidth = 2;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x + 1, y + 1, w - 2, h - 2, Math.min(h * 0.32, 8));
            ctx.stroke();
        } else {
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        }

        // Damage cracks
        if (dmgPct > 0) {
            ctx.globalAlpha = dmgPct * 0.8;
            ctx.strokeStyle = 'rgba(255,211,74,0.92)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < Math.ceil(dmgPct * 4); i++) {
                const cx2 = x + (i + 0.5) * (w / 4);
                ctx.beginPath();
                ctx.moveTo(cx2, y + 2);
                ctx.lineTo(cx2 + (Math.random() - 0.5) * 8, y + h * 0.5);
                ctx.lineTo(cx2 + (Math.random() - 0.5) * 12, y + h - 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    _renderSpinner(ctx) {
        const cx = this.cx;
        const cy = this.cy;
        const len = this.w / 2;
        const glow = this.glowIntensity;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);

        // Glow trail
        ctx.shadowBlur = 16 + glow * 28;
        ctx.shadowColor = this.colorGlow;

        // Rod body
        const rodGrad = ctx.createLinearGradient(-len, 0, len, 0);
        rodGrad.addColorStop(0, `${this.colorGlow}aa`);
        rodGrad.addColorStop(0.5, this.hitFlash > 0 ? '#ffffff' : this.colorPrimary);
        rodGrad.addColorStop(1, `${this.colorGlow}aa`);
        ctx.fillStyle = rodGrad;
        ctx.beginPath();
        ctx.roundRect(-len, -this.h / 2, len * 2, this.h, this.h / 2);
        ctx.fill();

        // End caps (bright)
        for (const ex of [-len, len]) {
            const cap = ctx.createRadialGradient(ex, 0, 0, ex, 0, this.h);
            cap.addColorStop(0, '#ffffff');
            cap.addColorStop(1, this.colorPrimary);
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(ex, 0, this.h * 0.75, 0, Math.PI * 2);
            ctx.fill();
        }

        // Centre hub
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.h * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _renderMagnet(ctx) {
        const cx = this.cx;
        const cy = this.cy;
        const r = Math.min(this.w, this.h) / 2;
        const pulse = 0.88 + Math.sin(this.pulsePhase * 1.4) * 0.12;
        const glow = this.glowIntensity;

        ctx.save();

        // Attraction field rings (animated, outward)
        const ringPhase = (this.pulsePhase * 0.35) % 1;
        for (let i = 0; i < 3; i++) {
            const t = ((ringPhase + i / 3) % 1);
            const rr = r + t * this.magnetRadius * 0.5;
            const alpha = (1 - t) * 0.25;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.colorPrimary;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Body
        const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * pulse);
        body.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#fffde7');
        body.addColorStop(0.46, this.colorPrimary);
        body.addColorStop(1, this.colorGlow);
        ctx.globalAlpha = 1;
        ctx.fillStyle = body;
        ctx.shadowBlur = 18 + glow * 24;
        ctx.shadowColor = this.colorGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Target ring core
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = 'rgba(5, 20, 42, 0.8)';
        ctx.lineWidth = Math.max(2, r * 0.13);
        ctx.lineCap = 'round';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = this.colorAccent;
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.11, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // Stubs kept for compatibility with game loop calls
    updateColors() { }
    buildDetailCache() { }
    generateSurfaceDetails() { }

    // Propagate core lighting to nearby obstacles so they feel connected
    propagateCoreLighting() {
        const game = window.game;
        if (!game || !Array.isArray(game.obstacles)) return;
        const cx = this.cx, cy = this.cy;
        const radius = Math.max(this.w, this.h) * 2.6;
        for (const obs of game.obstacles) {
            if (!obs || obs === this || !obs.active) continue;
            const d = Math.hypot(obs.cx - cx, obs.cy - cy);
            if (d < radius) {
                const influence = 1 - d / radius;
                obs.glowIntensity = Math.min(1, (obs.glowIntensity || 0) + influence * 0.035);
            }
        }
    }

    // Render a subtle background-connected silhouette and halo for this obstacle
    renderBackground(ctx) {
        if (this.obstacleType === 'gate' || this.obstacleType === 'node' || this.obstacleType === 'rotor') return;
        if (!this.active && (this.hitRipples?.length === 0 && this.glowIntensity <= 0)) return;
        const cx = this.cx, cy = this.cy;
        const maxDim = Math.max(this.w, this.h);

        // Soft halo to tie the obstacle into the background layer
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.10 + Math.min(0.9, this.glowIntensity) * 0.45;
        ctx.shadowBlur = 28 + Math.min(1, this.glowIntensity) * 72;
        ctx.shadowColor = this.colorGlow || this.colorPrimary || '#00ffd6';
        ctx.fillStyle = this.colorGlow || this.colorPrimary || '#00ffd6';
        ctx.beginPath();
        ctx.arc(cx, cy, maxDim * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Slight silhouette to give weight inside the court
        if (this.active) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.06 + Math.min(0.9, this.glowIntensity) * 0.18;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            if (this.obstacleType === 'bumper' || this.obstacleType === 'spinner') {
                ctx.arc(cx, cy, Math.max(this.w, this.h) * 0.6, 0, Math.PI * 2);
            } else {
                ctx.rect(this.pos.x + 2, this.pos.y + this.floatOffset + 2, this.w - 4, this.h - 4);
            }
            ctx.fill();
            ctx.restore();
        }

        // Neon strip — lights up when the ball passes nearby or through the obstacle
        try {
            const game = window.game;
            const ball = game?.ball;
            let neonFactor = Math.min(1, this.glowIntensity * 1.2);
            if (ball) {
                const bx = ball.pos.x, by = ball.pos.y;
                const insideX = bx > this.pos.x && bx < this.pos.x + this.w;
                const insideY = by > this.pos.y && by < this.pos.y + this.h;
                if (insideX && insideY) {
                    neonFactor = Math.max(neonFactor, 1);
                } else {
                    const dx = bx - cx, dy = by - cy;
                    const dist = Math.hypot(dx, dy);
                    const range = Math.max(this.w, this.h) * 2.2;
                    const proximity = Math.max(0, 1 - dist / range);
                    neonFactor = Math.max(neonFactor, proximity * 0.9);
                }
            }

            if (neonFactor > 0.02) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const neonCol = this.colorPrimary || this.colorGlow || '#00ffd6';
                // strong glow
                ctx.shadowBlur = 28 + neonFactor * 72;
                ctx.shadowColor = neonCol;
                ctx.globalAlpha = 0.12 + neonFactor * 0.7;

                // Draw a thin neon band across obstacle center
                const bandH = Math.max(6, Math.min(24, Math.round(maxDim * 0.18)));
                const bandY = cy - bandH / 2;

                if (this.obstacleType === 'spinner' || this.obstacleType === 'bumper') {
                    // circular neon ring
                    ctx.beginPath();
                    ctx.lineWidth = Math.max(3, Math.round(maxDim * 0.14));
                    ctx.strokeStyle = neonCol;
                    ctx.arc(cx, cy, Math.max(this.w, this.h) * 0.55, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    // rectangular neon strip
                    const pad = 6;
                    const nx = this.pos.x - pad;
                    const nw = this.w + pad * 2;
                    ctx.fillStyle = neonCol;
                    ctx.fillRect(nx, bandY - 1, nw, bandH + 2);
                }
                ctx.restore();
            }
        } catch (e) {
            console.warn('Neon render error', e);
        }
    }
    updateGroupMembership() { }
    renderGlobalEffects(ctx, enabled) {
        if (enabled) window.globalFragmentPool?.renderAll(ctx, true);
    }
    checkCollision(ball) {
        // guard: only hit active obstacles
        if (!this.active) return false;

        if (this.obstacleType === 'repulsor') {
            const dx = ball.pos.x - this.cx;
            const dy = ball.pos.y - this.cy;
            const dist = Math.hypot(dx, dy);
            const r = Math.min(this.w, this.h) / 2;
            if (dist < r + ball.r + 20) {
                const force = (1 - dist / (r + ball.r + 40)) * 600;
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);
                ball.vel.x += nx * force * 0.1;
                ball.vel.y += ny * force * 0.1;
            }
        }

        if (this.obstacleType === 'node' || this.obstacleType === 'bumper' || this.obstacleType === 'repulsor') {
            return this._checkBumperCollision(ball);
        }

        if (this.obstacleType === 'rotor' || this.obstacleType === 'spinner') {
            return this._checkSpinnerCollision(ball);
        }

        return this._checkAABBCollision(ball);
    }
}
