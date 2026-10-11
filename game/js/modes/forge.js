// Forge: a Halo Forge-style builder for Custom matches.
//
// Players place walls, bumpers, spinners, moving gates, black holes, boost
// pads, ? blocks and coins on the court, set the match rules, save maps,
// and share them as copy-paste codes. Map coordinates are stored as
// fractions of the court (x of width, y and sizes of height) so a map plays
// the same on any screen.
(function () {
    const MAP_STORE_KEY = 'pp-forge-maps-v1';
    const SHARE_PREFIX = 'PPF1:';
    const MAX_ITEMS = 32;
    const BUILD_MIN_X = 0.09;   // keep the paddles' lanes clear
    const BUILD_MAX_X = 0.91;

    const TOOLS = [
        { id: 'wall', label: 'Wall', key: '1', hint: 'Solid block. R turns it.' },
        { id: 'bumper', label: 'Bumper', key: '2', hint: 'Round, bouncy.' },
        { id: 'spinner', label: 'Spinner', key: '3', hint: 'Rotating bar.' },
        { id: 'gate', label: 'Moving gate', key: '4', hint: 'Slides up and down.' },
        { id: 'well', label: 'Black hole', key: '5', hint: 'Bends the ball. Bigger pulls harder.' },
        { id: 'pad', label: 'Boost pad', key: '6', hint: 'Launches the ball. R flips it.' },
        { id: 'block', label: '? Block', key: '7', hint: 'Coins, Turbo or Star.' },
        { id: 'coin', label: 'Coin', key: '8', hint: '10 coins = 1 point.' },
        { id: 'erase', label: 'Eraser', key: '9', hint: 'Click an item to remove it.' },
    ];

    const DEFAULT_SIZE = { wall: 0.22, bumper: 0.05, spinner: 0.2, gate: 0.16, well: 0.06, pad: 1, block: 1, coin: 1 };
    const SIZE_RANGE = { wall: [0.08, 0.6], bumper: [0.03, 0.1], spinner: [0.1, 0.34], gate: [0.08, 0.3], well: [0.04, 0.1] };

    const RULE_OPTIONS = {
        scoreToWin: [[5, 'First to 5'], [7, 'First to 7'], [11, 'First to 11'], [15, 'First to 15'], [21, 'First to 21']],
        ballSpeed: [[0.85, 'Chill'], [1, 'Normal'], [1.2, 'Fast'], [1.45, 'Insane']],
        hitSpeedup: [['steady', 'Steady'], ['normal', 'Builds up'], ['wild', 'Wild']],
        paddleSize: [[0.75, 'Small'], [1, 'Normal'], [1.3, 'Large']],
        gravity: [[0, 'Off'], [1, 'Low'], [2, 'Heavy']],
    };

    const DEFAULT_RULES = { scoreToWin: 11, ballSpeed: 1, hitSpeedup: 'normal', paddleSize: 1, gravity: 0 };

    const item = (t, x, y, extra = {}) => ({ t, x, y, s: DEFAULT_SIZE[t] ?? 1, rot: 0, ...extra });
    const mirrorPair = (t, x, y, extra = {}) => [item(t, x, y, extra), item(t, 1 - x, y, { ...extra, rot: t === 'pad' ? (extra.rot ? 0 : 1) : (extra.rot || 0) })];

    const PRESETS = [
        { id: 'preset:open', name: 'Open Court', items: [] },
        {
            id: 'preset:pinball', name: 'Pinball', items: [
                item('bumper', 0.5, 0.3, { s: 0.06 }), item('bumper', 0.42, 0.55, { s: 0.05 }), item('bumper', 0.58, 0.55, { s: 0.05 }),
                item('bumper', 0.5, 0.78, { s: 0.045 }),
                ...mirrorPair('pad', 0.27, 0.5), ...mirrorPair('coin', 0.36, 0.25), ...mirrorPair('coin', 0.36, 0.75),
                ...mirrorPair('coin', 0.42, 0.18), ...mirrorPair('coin', 0.42, 0.82),
            ]
        },
        {
            id: 'preset:fortress', name: 'Fortress', items: [
                ...mirrorPair('wall', 0.2, 0.22, { s: 0.2 }), ...mirrorPair('wall', 0.2, 0.78, { s: 0.2 }),
                item('gate', 0.5, 0.5, { s: 0.18 }), ...mirrorPair('block', 0.35, 0.5),
                ...mirrorPair('coin', 0.3, 0.1), ...mirrorPair('coin', 0.3, 0.9),
            ]
        },
        {
            id: 'preset:blackhole', name: 'Black Hole', items: [
                item('well', 0.5, 0.5, { s: 0.07 }), ...mirrorPair('spinner', 0.32, 0.25, { s: 0.16 }), ...mirrorPair('spinner', 0.32, 0.75, { s: 0.16 }),
                item('coin', 0.5, 0.2), item('coin', 0.5, 0.8), ...mirrorPair('coin', 0.4, 0.32), ...mirrorPair('coin', 0.4, 0.68),
            ]
        },
        {
            id: 'preset:mushroom', name: 'Mushroom Kingdom', items: [
                item('block', 0.44, 0.24), item('block', 0.5, 0.24), item('block', 0.56, 0.24),
                ...mirrorPair('pad', 0.3, 0.72), ...mirrorPair('wall', 0.38, 0.5, { s: 0.12, rot: 1 }),
                ...[0.36, 0.43, 0.5, 0.57, 0.64].map((x, i) => item('coin', x, 0.66 - Math.sin(i / 4 * Math.PI) * 0.08)),
            ]
        },
    ];

    const clone = (v) => JSON.parse(JSON.stringify(v));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // ── Store ──────────────────────────────────────────────────────────
    const Store = {
        defaultForge() {
            return { rules: { ...DEFAULT_RULES }, map: { name: 'Open Court', source: 'preset:open', items: [] } };
        },
        sanitizeItems(items) {
            if (!Array.isArray(items)) return [];
            const ok = new Set(TOOLS.map(t => t.id).filter(id => id !== 'erase'));
            return items.filter(i => i && ok.has(i.t) && Number.isFinite(i.x) && Number.isFinite(i.y)).slice(0, MAX_ITEMS).map(i => {
                const range = SIZE_RANGE[i.t];
                return {
                    t: i.t,
                    x: clamp(+i.x, BUILD_MIN_X, BUILD_MAX_X),
                    y: clamp(+i.y, 0.04, 0.96),
                    s: range ? clamp(Number(i.s) || DEFAULT_SIZE[i.t], range[0], range[1]) : 1,
                    rot: i.rot ? 1 : 0,
                };
            });
        },
        sanitizeRules(rules) {
            const out = { ...DEFAULT_RULES };
            if (!rules || typeof rules !== 'object') return out;
            for (const key of Object.keys(RULE_OPTIONS)) {
                const allowed = RULE_OPTIONS[key].map(o => o[0]);
                if (allowed.includes(rules[key])) out[key] = rules[key];
            }
            return out;
        },
        getForge(game) {
            const cs = game.customSettings;
            const f = cs.forge && typeof cs.forge === 'object' ? cs.forge : {};
            cs.forge = {
                rules: this.sanitizeRules(f.rules),
                map: {
                    name: typeof f.map?.name === 'string' ? f.map.name.slice(0, 32) : 'Open Court',
                    source: typeof f.map?.source === 'string' ? f.map.source : '',
                    items: this.sanitizeItems(f.map?.items),
                },
            };
            return cs.forge;
        },
        loadMaps() {
            try {
                const raw = JSON.parse(localStorage.getItem(MAP_STORE_KEY) || '[]');
                return Array.isArray(raw) ? raw.filter(m => m && typeof m.name === 'string').map(m => ({ name: m.name.slice(0, 32), items: this.sanitizeItems(m.items) })) : [];
            } catch (_) {
                return [];
            }
        },
        saveMaps(maps) {
            try { localStorage.setItem(MAP_STORE_KEY, JSON.stringify(maps.slice(0, 40))); } catch (_) { /* ignore */ }
        },
        encode(map, rules) {
            const payload = { n: map.name, r: rules, i: map.items.map(i => [i.t, +i.x.toFixed(3), +i.y.toFixed(3), +i.s.toFixed(3), i.rot]) };
            return SHARE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        },
        decode(code) {
            const text = String(code || '').trim();
            if (!text.startsWith(SHARE_PREFIX)) return null;
            try {
                const p = JSON.parse(decodeURIComponent(escape(atob(text.slice(SHARE_PREFIX.length)))));
                const items = this.sanitizeItems((p.i || []).map(a => Array.isArray(a) ? { t: a[0], x: a[1], y: a[2], s: a[3], rot: a[4] } : null));
                return { name: typeof p.n === 'string' ? p.n.slice(0, 32) : 'Shared map', items, rules: this.sanitizeRules(p.r) };
            } catch (_) {
                return null;
            }
        },
    };

    // ── Shared drawing (editor and panel preview) ──────────────────────
    function drawItem(ctx, it, W, H, opts = {}) {
        const x = it.x * W, y = it.y * H;
        const u = H / 720;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = opts.alpha ?? 1;
        switch (it.t) {
            case 'wall':
            case 'gate': {
                const len = it.s * H, th = Math.max(6, 0.026 * H);
                const vertical = !it.rot;
                const w = vertical ? th : len, h = vertical ? len : th;
                if (it.t === 'gate') {
                    ctx.strokeStyle = 'rgba(0,255,214,0.35)';
                    ctx.setLineDash([6 * u, 6 * u]);
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    if (vertical) { ctx.moveTo(0, -len / 2 - 0.12 * H); ctx.lineTo(0, len / 2 + 0.12 * H); } else { ctx.moveTo(-len / 2 - 0.12 * H, 0); ctx.lineTo(len / 2 + 0.12 * H, 0); }
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.fillStyle = it.t === 'gate' ? '#7df9ff' : '#ff8c66';
                ctx.beginPath();
                ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);
                ctx.fill();
                ctx.strokeStyle = it.t === 'gate' ? '#00ffd6' : '#ffd0b8';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            }
            case 'bumper': {
                const r = it.s * H;
                ctx.fillStyle = '#7df9ff';
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#e8ffff';
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'spinner': {
                const len = it.s * H, th = Math.max(6, 0.024 * H);
                ctx.rotate((opts.time || 0) * 1.6);
                ctx.fillStyle = '#ffd166';
                ctx.beginPath();
                ctx.roundRect(-len / 2, -th / 2, len, th, th / 2);
                ctx.fill();
                ctx.fillStyle = '#fff5c7';
                ctx.beginPath();
                ctx.arc(0, 0, th * 0.7, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'well': {
                // Matches the in-game event horizon (about 0.15 of court height).
                const r = 0.15 * H * (it.s / 0.06) * 0.6;
                const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
                g.addColorStop(0, '#000000');
                g.addColorStop(0.45, 'rgba(120, 60, 255, 0.55)');
                g.addColorStop(1, 'rgba(120, 60, 255, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#b48cff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'pad': {
                const w = 0.1 * H, h = 0.042 * H, dir = it.rot ? -1 : 1;
                ctx.fillStyle = 'rgba(40,18,4,0.95)';
                ctx.strokeStyle = '#ff9a2e';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
                ctx.fill();
                ctx.stroke();
                ctx.lineWidth = 2.5;
                for (let i = -1; i <= 1; i++) {
                    const cx = i * w * 0.22;
                    ctx.beginPath();
                    ctx.moveTo(cx - h * 0.18 * dir, -h * 0.3);
                    ctx.lineTo(cx + h * 0.14 * dir, 0);
                    ctx.lineTo(cx - h * 0.18 * dir, h * 0.3);
                    ctx.stroke();
                }
                break;
            }
            case 'block': {
                const s = 0.06 * H;
                ctx.fillStyle = '#ffb627';
                ctx.strokeStyle = '#7a3a00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.14);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#fff4d0';
                ctx.font = `900 ${Math.round(s * 0.62)}px Arial Black, Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', 0, s * 0.04);
                break;
            }
            case 'coin': {
                const r = 0.018 * H;
                ctx.fillStyle = '#ffd23f';
                ctx.strokeStyle = '#8a5200';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            }
        }
        if (opts.selected) {
            const b = itemBounds(it, W, H);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(b.x0 - x - 4, b.y0 - y - 4, b.x1 - b.x0 + 8, b.y1 - b.y0 + 8);
        }
        ctx.restore();
    }

    function itemBounds(it, W, H) {
        const x = it.x * W, y = it.y * H;
        let hw, hh;
        switch (it.t) {
            case 'wall':
            case 'gate': {
                const len = it.s * H, th = Math.max(6, 0.026 * H);
                const vertical = !it.rot;
                hw = (vertical ? th : len) / 2; hh = (vertical ? len : th) / 2;
                break;
            }
            case 'spinner': hw = hh = it.s * H / 2; break;
            case 'bumper': hw = hh = it.s * H; break;
            case 'well': hw = hh = 0.15 * H * (it.s / 0.06) * 0.6; break;
            case 'pad': hw = 0.05 * H; hh = 0.021 * H; break;
            case 'block': hw = hh = 0.03 * H; break;
            default: hw = hh = 0.02 * H;
        }
        hw = Math.max(hw, 10); hh = Math.max(hh, 10);
        return { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
    }

    function drawCourt(ctx, W, H) {
        ctx.fillStyle = '#06101f';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) { ctx.beginPath(); ctx.moveTo(i * W / 16, 0); ctx.lineTo(i * W / 16, H); ctx.stroke(); }
        for (let i = 1; i < 9; i++) { ctx.beginPath(); ctx.moveTo(0, i * H / 9); ctx.lineTo(W, i * H / 9); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(0, 0, W * BUILD_MIN_X, H);
        ctx.fillRect(W * BUILD_MAX_X, 0, W * (1 - BUILD_MAX_X), H);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#00ffd6';
        ctx.fillRect(W * 0.03, H * 0.41, Math.max(4, W * 0.012), H * 0.18);
        ctx.fillStyle = '#ff3a5c';
        ctx.fillRect(W * 0.97 - Math.max(4, W * 0.012), H * 0.41, Math.max(4, W * 0.012), H * 0.18);
    }

    function drawMap(canvas, items, opts = {}) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        drawCourt(ctx, W, H);
        for (const it of items) drawItem(ctx, it, W, H, { time: opts.time, selected: it === opts.selected });
    }

    // ── Runtime: turn a map + rules into a playable arena ──────────────
    function buildArena(game) {
        const forge = Store.getForge(game);
        const W = game.width, H = game.height;
        const obstacles = [];
        const wells = [];
        const arcadeItems = { pads: [], blocks: [], coins: [] };
        for (const it of forge.map.items) {
            const x = it.x * W, y = it.y * H;
            if (it.t === 'wall') {
                const len = it.s * H, th = Math.max(10, 0.026 * H);
                const vertical = !it.rot;
                const w = vertical ? th : len, h = vertical ? len : th;
                obstacles.push(new Obstacle(x - w / 2, y - h / 2, w, h, 'wall', { name: 'Forge wall', railColor: '#ff8c66' }));
            } else if (it.t === 'gate') {
                const len = it.s * H, th = Math.max(10, 0.026 * H);
                const vertical = !it.rot;
                const w = vertical ? th : len, h = vertical ? len : th;
                const travel = 0.12 * H;
                const motion = vertical
                    ? { axis: 'y', min: clamp(y - h / 2 - travel, 0, H - h), max: clamp(y - h / 2 + travel, 0, H - h), speed: 0.55, phase: obstacles.length * 0.17 }
                    : { axis: 'x', min: x - w / 2 - travel, max: x - w / 2 + travel, speed: 0.55, phase: obstacles.length * 0.17 };
                obstacles.push(new Obstacle(x - w / 2, y - h / 2, w, h, 'gate', { name: 'Forge gate', motion, railColor: '#00ffd6' }));
            } else if (it.t === 'bumper') {
                const r = it.s * H;
                obstacles.push(new Obstacle(x - r, y - r, r * 2, r * 2, 'bumper', { name: 'Forge bumper', railColor: '#7df9ff' }));
            } else if (it.t === 'spinner') {
                const len = it.s * H, th = Math.max(10, 0.024 * H);
                obstacles.push(new Obstacle(x - len / 2, y - th / 2, len, th, 'rotor', { name: 'Forge spinner', rotationSpeed: (obstacles.length % 2 ? -1 : 1) * 1.6, railColor: '#ffd166' }));
            } else if (it.t === 'well') {
                if (typeof GravityWell === 'function') {
                    const well = new GravityWell(x, y, 3600 + it.s * 12000);
                    well.pin?.();
                    wells.push(well);
                }
            } else if (it.t === 'pad') {
                arcadeItems.pads.push({ x, y, dir: it.rot ? -1 : 1, cooldown: 0, flash: 0 });
            } else if (it.t === 'block') {
                arcadeItems.blocks.push({ x, y, used: false, refill: 0, bump: 0, popIn: 1 });
            } else if (it.t === 'coin') {
                arcadeItems.coins.push({ x, y, homeX: x, homeY: y, phase: arcadeItems.coins.length * 0.5, alive: true });
            }
        }
        return { forge, obstacles, wells, arcadeItems };
    }

    function getRuleSpeedIncrease(game) {
        const mode = Store.getForge(game).rules.hitSpeedup;
        if (mode === 'steady') return 1.068;
        if (mode === 'wild') return 1.13;
        return 1.085;
    }

    function getGravityAccel(game) {
        const level = Store.getForge(game).rules.gravity;
        return level ? (level === 2 ? 900 : 450) * (game.height / 720) : 0;
    }

    // ── Editor ─────────────────────────────────────────────────────────
    class ForgeEditor {
        constructor(ui) {
            this.ui = ui;
            this.el = null;
            this.items = [];
            this.tool = 'wall';
            this.mirror = true;
            this.snap = true;
            this.selected = null;
            this.drag = null;
            this.history = [];
            this.raf = 0;
            this.onKey = this.onKey.bind(this);
        }

        build() {
            if (this.el) return;
            const el = document.createElement('div');
            el.className = 'forge-editor';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-label', 'Forge arena editor');
            el.innerHTML = `
                <div class="forge-editor-top">
                    <div class="forge-editor-title"><span class="forge-kicker">Forge</span><input class="forge-name" maxlength="32" aria-label="Map name"></div>
                    <div class="forge-editor-actions">
                        <button type="button" data-act="mirror" class="forge-toggle" aria-pressed="true">Mirror</button>
                        <button type="button" data-act="snap" class="forge-toggle" aria-pressed="true">Snap</button>
                        <button type="button" data-act="smaller" title="Smaller (-)">&minus;</button>
                        <button type="button" data-act="bigger" title="Bigger (+)">+</button>
                        <button type="button" data-act="turn" title="Turn (R)">Turn</button>
                        <button type="button" data-act="undo">Undo</button>
                        <button type="button" data-act="clear">Clear</button>
                        <button type="button" data-act="save">Save map</button>
                        <button type="button" data-act="done" class="forge-primary">Done</button>
                    </div>
                </div>
                <div class="forge-editor-body">
                    <div class="forge-palette">${TOOLS.map(t => `<button type="button" class="forge-tool" data-tool="${t.id}" title="${t.hint} (${t.key})"><canvas width="44" height="44"></canvas><span>${t.label}</span></button>`).join('')}</div>
                    <div class="forge-stage"><canvas class="forge-canvas"></canvas></div>
                </div>
                <div class="forge-editor-hint"><span class="forge-count"></span> Click to place &middot; drag to move &middot; scroll or +/- to resize &middot; R turns walls and pads &middot; right-click or Delete removes &middot; Ctrl+Z undo</div>`;
            document.body.appendChild(el);
            this.el = el;
            this.canvas = el.querySelector('.forge-canvas');
            this.nameInput = el.querySelector('.forge-name');
            this.countEl = el.querySelector('.forge-count');
            el.querySelectorAll('.forge-tool').forEach(btn => {
                const c = btn.querySelector('canvas');
                const t = btn.dataset.tool;
                const ctx = c.getContext('2d');
                if (t === 'erase') {
                    ctx.strokeStyle = '#ff6e6e';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(12, 12); ctx.lineTo(32, 32); ctx.moveTo(32, 12); ctx.lineTo(12, 32);
                    ctx.stroke();
                } else {
                    const demo = { t, x: 0.5, y: 0.5, s: { wall: 0.6, gate: 0.5, spinner: 0.7, bumper: 0.18, well: 0.16 }[t] || 1, rot: 0 };
                    const fixed = { pad: 360, block: 560, coin: 900 }[t];
                    if (fixed) {
                        drawItem(ctx, { ...demo, x: 22 / fixed, y: 22 / fixed }, fixed, fixed, {});
                    } else {
                        drawItem(ctx, demo, 44, 44, {});
                    }
                }
                btn.addEventListener('click', () => this.setTool(t));
            });
            el.querySelector('.forge-editor-actions').addEventListener('click', (e) => {
                const act = e.target.closest('button')?.dataset.act;
                if (!act) return;
                if (act === 'mirror') { this.mirror = !this.mirror; e.target.setAttribute('aria-pressed', String(this.mirror)); }
                if (act === 'snap') { this.snap = !this.snap; e.target.setAttribute('aria-pressed', String(this.snap)); }
                if (act === 'undo') this.undo();
                if (act === 'smaller' && this.selected) { this.pushHistory(); this.resize(this.selected, -1); }
                if (act === 'bigger' && this.selected) { this.pushHistory(); this.resize(this.selected, 1); }
                if (act === 'turn') this.rotate(this.selected);
                if (act === 'clear') { this.pushHistory(); this.items = []; this.selected = null; }
                if (act === 'save') this.ui.saveMapFromEditor(this.items, this.nameInput.value);
                if (act === 'done') this.close(true);
            });
            const cv = this.canvas;
            cv.addEventListener('pointerdown', (e) => this.onDown(e));
            cv.addEventListener('pointermove', (e) => this.onMove(e));
            cv.addEventListener('pointerup', () => { this.drag = null; });
            cv.addEventListener('pointercancel', () => { this.drag = null; });
            cv.addEventListener('contextmenu', (e) => e.preventDefault());
            cv.addEventListener('wheel', (e) => {
                const it = this.hit(e) || this.selected;
                if (!it) return;
                e.preventDefault();
                this.resize(it, e.deltaY < 0 ? 1 : -1);
            }, { passive: false });
            window.addEventListener('resize', () => this.layout());
        }

        open(map) {
            this.build();
            this.items = clone(map.items);
            this.nameInput.value = map.name || 'My arena';
            this.history = [];
            this.selected = null;
            this.el.classList.add('visible');
            this.setTool(this.tool);
            this.layout();
            window.addEventListener('keydown', this.onKey, true);
            const loop = (t) => {
                this.draw(t / 1000);
                this.raf = requestAnimationFrame(loop);
            };
            this.raf = requestAnimationFrame(loop);
        }

        close(apply) {
            cancelAnimationFrame(this.raf);
            window.removeEventListener('keydown', this.onKey, true);
            this.el.classList.remove('visible');
            if (apply) this.ui.applyEditorMap(this.items, this.nameInput.value);
        }

        layout() {
            if (!this.el?.classList.contains('visible')) return;
            const stage = this.el.querySelector('.forge-stage');
            const r = stage.getBoundingClientRect();
            const w = Math.max(200, Math.min(r.width, r.height * 16 / 9));
            const h = w * 9 / 16;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            this.canvas.style.width = `${w}px`;
            this.canvas.style.height = `${h}px`;
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
        }

        setTool(t) {
            this.tool = t;
            this.el.querySelectorAll('.forge-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
        }

        toNorm(e) {
            const r = this.canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }

        hit(e) {
            const p = this.toNorm(e);
            const W = this.canvas.width, H = this.canvas.height;
            for (let i = this.items.length - 1; i >= 0; i--) {
                const b = itemBounds(this.items[i], W, H);
                if (p.x * W >= b.x0 - 4 && p.x * W <= b.x1 + 4 && p.y * H >= b.y0 - 4 && p.y * H <= b.y1 + 4) return this.items[i];
            }
            return null;
        }

        snapPos(p) {
            let x = clamp(p.x, BUILD_MIN_X, BUILD_MAX_X), y = clamp(p.y, 0.04, 0.96);
            if (this.snap) {
                x = Math.round(x * 32) / 32;
                y = Math.round(y * 18) / 18;
            }
            return { x: clamp(x, BUILD_MIN_X, BUILD_MAX_X), y: clamp(y, 0.04, 0.96) };
        }

        mirrorOf(it) {
            if (!this.mirror) return null;
            return this.items.find(o => o !== it && o.t === it.t && Math.abs(o.x - (1 - it.x)) < 0.012 && Math.abs(o.y - it.y) < 0.012) || null;
        }

        pushHistory() {
            this.history.push(clone(this.items));
            if (this.history.length > 60) this.history.shift();
        }

        undo() {
            const prev = this.history.pop();
            if (prev) { this.items = prev; this.selected = null; }
        }

        remove(it) {
            if (!it) return;
            this.pushHistory();
            const twin = this.mirrorOf(it);
            this.items = this.items.filter(o => o !== it && o !== twin);
            if (this.selected === it || this.selected === twin) this.selected = null;
        }

        resize(it, dir) {
            const range = SIZE_RANGE[it.t];
            if (!range) return;
            const twin = this.mirrorOf(it);
            it.s = clamp(it.s * (dir > 0 ? 1.1 : 1 / 1.1), range[0], range[1]);
            if (twin) twin.s = it.s;
        }

        rotate(it) {
            if (!it || !['wall', 'gate', 'pad'].includes(it.t)) return;
            this.pushHistory();
            const twin = this.mirrorOf(it);
            it.rot = it.rot ? 0 : 1;
            if (twin) twin.rot = it.t === 'pad' ? (it.rot ? 0 : 1) : it.rot;
        }

        onDown(e) {
            e.preventDefault();
            const target = this.hit(e);
            if (e.button === 2 || this.tool === 'erase') {
                this.remove(target);
                return;
            }
            if (target) {
                this.selected = target;
                const p = this.toNorm(e);
                this.pushHistory();
                this.drag = { it: target, twin: this.mirrorOf(target), dx: target.x - p.x, dy: target.y - p.y };
                this.canvas.setPointerCapture?.(e.pointerId);
                return;
            }
            const p = this.snapPos(this.toNorm(e));
            const room = this.mirror && Math.abs(p.x - 0.5) > 0.01 ? 2 : 1;
            if (this.items.length + room > MAX_ITEMS) {
                this.ui.toast(`Arena is full (${MAX_ITEMS} items)`);
                return;
            }
            this.pushHistory();
            const it = item(this.tool, p.x, p.y);
            this.items.push(it);
            if (room === 2) this.items.push(item(this.tool, 1 - p.x, p.y, { rot: this.tool === 'pad' ? 1 : 0 }));
            this.selected = it;
            this.drag = { it, twin: room === 2 ? this.items[this.items.length - 1] : null, dx: 0, dy: 0 };
        }

        onMove(e) {
            if (!this.drag) {
                this.canvas.style.cursor = this.hit(e) ? (this.tool === 'erase' ? 'not-allowed' : 'grab') : 'crosshair';
                return;
            }
            const raw = this.toNorm(e);
            const p = this.snapPos({ x: raw.x + this.drag.dx, y: raw.y + this.drag.dy });
            this.drag.it.x = p.x;
            this.drag.it.y = p.y;
            if (this.drag.twin) {
                this.drag.twin.x = 1 - p.x;
                this.drag.twin.y = p.y;
            }
        }

        onKey(e) {
            if (e.target === this.nameInput) {
                if (e.key === 'Enter') this.nameInput.blur();
                return;
            }
            const key = e.key;
            const tool = TOOLS.find(t => t.key === key);
            if (tool) { this.setTool(tool.id); e.preventDefault(); return; }
            if (key === 'Escape') { this.close(true); e.preventDefault(); e.stopPropagation(); return; }
            if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z') { this.undo(); e.preventDefault(); return; }
            if (!this.selected) return;
            if (key === 'Delete' || key === 'Backspace') { this.remove(this.selected); e.preventDefault(); }
            else if (key === 'r' || key === 'R') { this.rotate(this.selected); e.preventDefault(); }
            else if (key === '+' || key === '=') { this.resize(this.selected, 1); e.preventDefault(); }
            else if (key === '-' || key === '_') { this.resize(this.selected, -1); e.preventDefault(); }
            e.stopPropagation();
        }

        draw(time) {
            drawMap(this.canvas, this.items, { time, selected: this.selected });
            const ctx = this.canvas.getContext('2d');
            if (this.mirror) {
                ctx.fillStyle = 'rgba(0, 255, 214, 0.5)';
                ctx.font = `${Math.round(this.canvas.height * 0.028)}px Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('MIRROR ON', this.canvas.width / 2, this.canvas.height * 0.04);
            }
            const text = `${this.items.length}/${MAX_ITEMS} items.`;
            if (this.countEl.textContent !== text) this.countEl.textContent = text;
        }
    }

    // ── Customise-panel UI ─────────────────────────────────────────────
    const UI = {
        game: null,
        editor: null,
        init(game) {
            if (this.game || !document.getElementById('customForge')) return;
            this.game = game;
            this.editor = new ForgeEditor(this);
            this.preview = document.getElementById('forgeArenaPreview');
            this.mapSelect = document.getElementById('forgeMapSelect');
            for (const key of Object.keys(RULE_OPTIONS)) {
                const sel = document.getElementById(`forgeRule-${key}`);
                if (!sel) continue;
                sel.innerHTML = RULE_OPTIONS[key].map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
                sel.addEventListener('change', () => {
                    const forge = Store.getForge(this.game);
                    const raw = sel.value;
                    forge.rules[key] = typeof RULE_OPTIONS[key][0][0] === 'number' ? Number(raw) : raw;
                    this.persist();
                });
            }
            this.mapSelect.addEventListener('change', () => this.selectMap(this.mapSelect.value));
            document.getElementById('forgeEditBtn')?.addEventListener('click', () => this.editor.open(Store.getForge(this.game).map));
            document.getElementById('forgeShareBtn')?.addEventListener('click', () => this.share());
            document.getElementById('forgeImportBtn')?.addEventListener('click', () => this.importCode());
            document.getElementById('forgeDeleteBtn')?.addEventListener('click', () => this.deleteMap());
            document.getElementById('customResetDefaultsBtn')?.addEventListener('click', () => setTimeout(() => this.refresh(), 0));
            this.refresh();
        },
        persist() {
            this.game.saveCustomSettings?.();
            this.refresh();
        },
        refresh() {
            const forge = Store.getForge(this.game);
            for (const key of Object.keys(RULE_OPTIONS)) {
                const sel = document.getElementById(`forgeRule-${key}`);
                if (sel) sel.value = String(forge.rules[key]);
            }
            const maps = Store.loadMaps();
            const opt = (value, label) => `<option value="${value}">${label.replace(/[<>&"]/g, '')}</option>`;
            let html = `<optgroup label="Presets">${PRESETS.map(p => opt(p.id, p.name)).join('')}</optgroup>`;
            if (maps.length) html += `<optgroup label="Your maps">${maps.map((m, i) => opt(`saved:${i}`, m.name)).join('')}</optgroup>`;
            const known = forge.map.source && (forge.map.source.startsWith('preset:') || maps.some((m, i) => `saved:${i}` === forge.map.source && m.name === forge.map.name));
            if (!known) html = opt('current', `${forge.map.name} (unsaved)`) + html;
            this.mapSelect.innerHTML = html;
            this.mapSelect.value = known ? forge.map.source : 'current';
            const del = document.getElementById('forgeDeleteBtn');
            if (del) del.disabled = !String(this.mapSelect.value).startsWith('saved:');
            this.drawPreview();
        },
        drawPreview() {
            if (!this.preview) return;
            drawMap(this.preview, Store.getForge(this.game).map.items, {});
            const count = Store.getForge(this.game).map.items.length;
            const label = document.getElementById('forgeArenaCount');
            if (label) label.textContent = count ? `${count} item${count === 1 ? '' : 's'}` : 'Empty court';
        },
        selectMap(value) {
            const forge = Store.getForge(this.game);
            if (value.startsWith('preset:')) {
                const p = PRESETS.find(x => x.id === value);
                if (p) forge.map = { name: p.name, source: p.id, items: Store.sanitizeItems(clone(p.items)) };
            } else if (value.startsWith('saved:')) {
                const m = Store.loadMaps()[Number(value.slice(6))];
                if (m) forge.map = { name: m.name, source: value, items: m.items };
            }
            this.persist();
        },
        applyEditorMap(items, name) {
            const forge = Store.getForge(this.game);
            const cleanName = (name || '').trim().slice(0, 32) || 'My arena';
            const changed = JSON.stringify(Store.sanitizeItems(items)) !== JSON.stringify(forge.map.items) || cleanName !== forge.map.name;
            forge.map = { name: cleanName, source: changed ? '' : forge.map.source, items: Store.sanitizeItems(items) };
            this.persist();
        },
        saveMapFromEditor(items, name) {
            const cleanName = (name || '').trim().slice(0, 32) || 'My arena';
            const maps = Store.loadMaps();
            const idx = maps.findIndex(m => m.name === cleanName);
            const entry = { name: cleanName, items: Store.sanitizeItems(items) };
            if (idx >= 0) maps[idx] = entry; else maps.push(entry);
            Store.saveMaps(maps);
            const forge = Store.getForge(this.game);
            forge.map = { name: cleanName, source: `saved:${idx >= 0 ? idx : maps.length - 1}`, items: entry.items };
            this.persist();
            this.toast(`Saved "${cleanName}"`);
        },
        deleteMap() {
            const value = String(this.mapSelect.value);
            if (!value.startsWith('saved:')) return;
            const maps = Store.loadMaps();
            const i = Number(value.slice(6));
            const removed = maps.splice(i, 1)[0];
            Store.saveMaps(maps);
            const forge = Store.getForge(this.game);
            forge.map.source = '';
            this.persist();
            if (removed) this.toast(`Deleted "${removed.name}"`);
        },
        async share() {
            const forge = Store.getForge(this.game);
            const code = Store.encode(forge.map, forge.rules);
            const input = document.getElementById('forgeImportInput');
            try {
                await navigator.clipboard.writeText(code);
                this.toast('Share code copied: send it to a friend');
            } catch (_) {
                if (input) { input.value = code; input.select(); }
                this.toast('Copy the code from the box');
            }
        },
        importCode() {
            const input = document.getElementById('forgeImportInput');
            const decoded = Store.decode(input?.value);
            if (!decoded) {
                this.toast('That is not a Forge share code');
                return;
            }
            const forge = Store.getForge(this.game);
            forge.map = { name: decoded.name, source: '', items: decoded.items };
            forge.rules = decoded.rules;
            if (input) input.value = '';
            this.persist();
            this.toast(`Loaded "${decoded.name}"`);
        },
        toast(text) {
            let el = document.getElementById('forgeToast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'forgeToast';
                el.className = 'forge-toast';
                document.body.appendChild(el);
            }
            el.textContent = text;
            el.classList.add('visible');
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
        },
    };

    window.Forge = { Store, UI, buildArena, getRuleSpeedIncrease, getGravityAccel, PRESETS, RULE_OPTIONS };

    const boot = () => { if (window.game) UI.init(window.game); };
    window.addEventListener('pp-game-ready', boot);
    if (document.readyState !== 'loading') setTimeout(boot, 0); else document.addEventListener('DOMContentLoaded', boot);
})();
