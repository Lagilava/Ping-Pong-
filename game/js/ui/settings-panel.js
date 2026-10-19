// Settings panel: tabs for Gameplay, Paddles, Controls, Display, Audio and
// Accessibility. Every row writes straight to PPSettings (or the audio
// engine for volumes) and takes effect immediately; nothing needs an
// Apply button. Opened from the pause menu, the match setup dialog and the
// Custom screen through window.ppOpenPanel('settings' | 'audio').
(function () {
    'use strict';

    const S = () => window.PPSettings;
    const audio = () => window.game?.audio || null;

    const TABS = [
        { id: 'profile', label: 'Profile' },
        { id: 'gameplay', label: 'Gameplay' },
        { id: 'paddles', label: 'Paddles' },
        { id: 'controls', label: 'Controls' },
        { id: 'display', label: 'Display' },
        { id: 'audio', label: 'Audio' },
        { id: 'access', label: 'Accessibility' },
    ];

    // Row definitions. type: seg (one of several), toggle, slider, keys,
    // actions, volume, note.
    const ROWS = {
        profile: [
            { type: 'profile' },
        ],
        gameplay: [
            { type: 'seg', key: 'aiLevel', label: 'Computer skill', help: 'Applies immediately in versus modes. Zombie difficulty increases with each wave.',
                options: [[0, 'Rookie'], [1, 'Easy'], [2, 'Normal'], [3, 'Hard'], [4, 'Insane']] },
            { type: 'seg', key: 'pointsToWin', label: 'Points to win', help: 'Next match: Classic, Gravity, Speed and Obstacle. Custom uses arena rules; Zombie uses waves.',
                options: [[5, '5'], [7, '7'], [11, '11'], [15, '15'], [21, '21']] },
            { type: 'toggle', key: 'powerUps', label: 'Power-ups on the court', help: 'Classic, Gravity, Speed and Obstacle. Pick Custom power-ups on the Custom screen.' },
            { type: 'seg', key: 'replays', label: 'Instant replays', help: 'Auto plays great points back. Offer shows a Replay button for a few seconds instead.',
                options: [['auto', 'Auto'], ['offer', 'Offer'], ['off', 'Off']] },
            { type: 'toggle', key: 'taunts', label: 'AI trash talk', help: 'Speech bubbles from the computer opponent.' },
            { type: 'toggle', key: 'autoPause', label: 'Pause when I switch away', help: 'Pauses the match when you change tab or window.' },
        ],
        paddles: [
            { type: 'paddles' },
        ],
        controls: [
            { type: 'slider', key: 'paddleSpeed', label: 'Paddle speed', help: 'Keyboard and gamepad. Mouse and touch follow your pointer.', min: 60, max: 150, step: 5, unit: '%' },
            { type: 'keys', label: 'Keys', help: 'Click a key, then press the new one. Esc cancels.' },
            { type: 'toggle', key: 'padRumble', label: 'Controller vibration', help: 'Gamepads rumble on hits and goals.' },
            { type: 'toggle', key: 'phoneVibrate', label: 'Phone vibration', help: 'Phones buzz when a point is scored.' },
            { type: 'note', html: '<p><b>Mouse</b><br>Hold and drag on your half of the court.</p><p><b>Touch</b><br>Slide to move. In local 1v1, stay on your half. Use the round ability button; tap with a second finger to fire a laser.</p><p><b>Gamepad</b><br>Left stick moves · A fires · Start pauses.</p>' },
        ],
        display: [
            { type: 'toggle', key: 'noir', label: 'Noir theme', help: 'Black-and-white film styling with grain and flicker. Reduce motion disables the flicker.' },
            { type: 'slider', key: 'shake', label: 'Screen shake', help: 'How hard the camera kicks on big hits and goals.', min: 0, max: 150, step: 10, unit: '%' },
            { type: 'toggle', key: 'flash', label: 'Impact flash', help: 'A white flash on goals and heavy hits.' },
            { type: 'toggle', key: 'particles', label: 'Particle effects', help: 'Sparks, trails and debris.' },
            { type: 'seg', key: 'hudSize', label: 'Scoreboard size', help: 'The score bar at the top of a match.',
                options: [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']] },
            { type: 'toggle', key: 'showFps', label: 'FPS counter', help: 'A small frame-rate readout in the corner.' },
            { type: 'actions', label: 'More', buttons: [
                { id: 'perf', text: 'Performance readout (F2)', run: () => window.game?.togglePerfOverlay?.() },
                { id: 'fullscreen', text: 'Fullscreen', run: () => window.game?.toggleFullscreen?.() },
            ] },
        ],
        audio: [
            { type: 'volume', id: 'master', label: 'Master' },
            { type: 'volume', id: 'music', label: 'Music' },
            { type: 'volume', id: 'sfx', label: 'Sound effects' },
            { type: 'volume', id: 'voice', label: 'Announcer and AI voice' },
            { type: 'audioToggle', id: 'sound', label: 'Sound', help: 'All game audio on or off.' },
            { type: 'audioToggle', id: 'musicOn', label: 'Music', help: 'Match and menu music.' },
            { type: 'audioToggle', id: 'voiceOn', label: 'Voice lines', help: 'Announcer calls and AI voice.' },
            { type: 'toggle', key: 'muteInBackground', label: 'Mute in the background', help: 'Silences the game while its tab is hidden.' },
        ],
        access: [
            { type: 'toggle', key: 'reduceMotion', label: 'Reduce motion', help: 'Turns off screen shake, flashes and panel animations.' },
            { type: 'toggle', key: 'ballOutline', label: 'High-visibility ball', help: 'A bold yellow ring around every ball.' },
            { type: 'seg', key: 'uiScale', label: 'Menu text size', help: 'Pause menu, settings and other panels.',
                options: [[90, 'S'], [100, 'M'], [115, 'L'], [130, 'XL']] },
        ],
    };

    const BIND_ROWS = [
        { side: 'Player 1 (left)', actions: [['p1Up', 'Up'], ['p1Down', 'Down'], ['p1Fire', 'Laser']] },
        { side: 'Player 2 (right, local 1v1)', actions: [['p2Up', 'Up'], ['p2Down', 'Down'], ['p2Fire', 'Laser']] },
    ];

    // ── Paddles tab: a design per mode for each side ────────────────
    const PADDLE_MODES = [
        ['classic', 'Classic'], ['zombie', 'Zombie'], ['gravity', 'Gravity'],
        ['speed', 'Speed'], ['obstacle', 'Obstacle'], ['customise', 'Custom'],
    ];
    let paddleMode = 'classic';
    let paddleRaf = 0;
    const paddlePreviews = new Map(); // canvas -> { pd, key }
    const designs = () => window.PaddleDesigns?.LIST || [{ id: 'classic', name: 'Classic', blurb: '' }];

    function paddleCards(side) {
        return designs().map((d) => `<button type="button" class="ppset-pcard" data-pside="${side}" data-design="${d.id}" aria-pressed="false">
            <canvas aria-hidden="true"></canvas><span class="ppset-pname">${esc(d.name)}</span><span class="ppset-pblurb">${esc(d.blurb)}</span></button>`).join('');
    }

    function renderPaddles() {
        return `<div class="ppset-paddles">
            <p class="ppset-help ppset-pintro">Pick a paddle design for each mode. Changes show straight away, even mid-match.</p>
            <div class="ppset-pmodes" role="radiogroup" aria-label="Mode">${PADDLE_MODES.map(([id, label]) =>
                `<button type="button" role="radio" data-pmode="${id}" aria-checked="false">${label}</button>`).join('')}</div>
            <div class="ppset-pside"><div class="ppset-label">Your paddle</div>
                <div class="ppset-pgrid">${paddleCards('left')}</div></div>
            <div class="ppset-pside" data-pright><div class="ppset-label">Opponent's paddle</div>
                <div class="ppset-help">The computer, or player 2 in local 1v1. Online, your friend's paddle shows the design they picked.</div>
                <div class="ppset-pgrid">${paddleCards('right')}</div></div>
            <div class="ppset-note" data-pzombie hidden>In Zombie mode your opponent is the zombie boss, which keeps its own look.</div>
        </div>`;
    }

    function syncPaddles() {
        if (!root) return;
        root.querySelectorAll('[data-pmode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pmode === paddleMode)));
        root.querySelectorAll('.ppset-pcard').forEach((b) => {
            b.setAttribute('aria-pressed', String(S().getPaddle?.(paddleMode, b.dataset.pside) === b.dataset.design));
        });
        const zombie = paddleMode === 'zombie';
        const right = root.querySelector('[data-pright]');
        if (right) right.hidden = zombie;
        const note = root.querySelector('[data-pzombie]');
        if (note) note.hidden = !zombie;
    }

    function previewColor(side) {
        const game = window.game;
        if (paddleMode === 'customise' && game?.customSettings) {
            return side === 'left' ? (game.customSettings.leftPaddleColor || '#00ffd6') : (game.customSettings.rightPaddleColor || '#ff0044');
        }
        const css = getComputedStyle(document.documentElement).getPropertyValue(side === 'left' ? '--player-color' : '--ai-color').trim();
        return css || (side === 'left' ? '#00ffd6' : '#ff0044');
    }

    function drawPaddlePreviews() {
        paddleRaf = 0;
        if (!root || activeTab !== 'paddles' || !root.getClientRects().length || typeof Paddle !== 'function') return;
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        root.querySelectorAll('.ppset-pcard canvas').forEach((canvas) => {
            const card = canvas.parentElement;
            if (card.closest('[hidden]')) return;
            const side = card.dataset.pside, design = card.dataset.design;
            const cssW = canvas.clientWidth || 90, cssH = canvas.clientHeight || 120;
            if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
                canvas.width = Math.round(cssW * dpr);
                canvas.height = Math.round(cssH * dpr);
            }
            const color = previewColor(side);
            const asAI = side === 'right' && paddleMode !== 'customise';
            const ph = Math.round(cssH * 0.7), pw = Math.max(8, Math.round(ph * 0.14));
            const key = `${design}|${color}|${ph}|${asAI}`;
            let entry = paddlePreviews.get(canvas);
            if (!entry || entry.key !== key) {
                const pd = new Paddle(0, 0, pw, ph, color, asAI);
                pd.applyCustomPaddleVisualState?.(design, color);
                pd.isAI = asAI;
                entry = { pd, key };
                paddlePreviews.set(canvas, entry);
            }
            const pd = entry.pd;
            pd.pos.x = (cssW - pw) / 2;
            pd.pos.y = (cssH - ph) / 2;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            pd.render(ctx);
        });
        paddleRaf = requestAnimationFrame(drawPaddlePreviews);
    }

    function startPaddlePreviews() {
        if (!paddleRaf) paddleRaf = requestAnimationFrame(drawPaddlePreviews);
    }


    // ── Profile tab: name, level and lifetime stats ─────────────────
    const fmtTime = (sec) => {
        const m = Math.floor(sec / 60);
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60);
        return `${h} h ${m % 60} min`;
    };
    const tile = (label, value, sub) => `<div class="ppset-stat"><span class="ppset-stat-v">${esc(value)}</span><span class="ppset-stat-l">${esc(label)}</span>${sub ? `<span class="ppset-stat-s">${esc(sub)}</span>` : ''}</div>`;

    function renderProfile() {
        const host = root?.querySelector('.ppset-profile');
        const P = window.PPProfile;
        if (!host || !P) return;
        const st = P.getStats();
        const name = st.name || 'Player';
        const pct = st.requiredXP > 0 ? Math.min(100, Math.round((st.xp / st.requiredXP) * 100)) : 0;
        const since = new Date(st.since).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        host.innerHTML = `
            <div class="ppset-pf-head">
                <div class="ppset-avatar" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || 'P')}</div>
                <div class="ppset-pf-id">
                    <label class="ppset-pf-name"><span class="ppset-help">Name</span>
                        <input type="text" maxlength="16" value="${esc(st.name)}" placeholder="Player" data-pf-name autocomplete="off" spellcheck="false"></label>
                    <div class="ppset-pf-level"><b>Level ${st.level}</b><span>${st.xp} / ${st.requiredXP} XP</span></div>
                    <div class="ppset-pf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress to next level"><i style="width:${pct}%"></i></div>
                </div>
            </div>
            <div class="ppset-stats">
                ${tile('Matches played', st.played)}
                ${tile('Wins', st.won, `${st.winRate}% win rate`)}
                ${tile('Losses', st.lost)}
                ${tile('Win streak', st.winStreak, `Best ${st.bestStreak}`)}
                ${tile('Points scored', st.pointsFor, `${st.pointsAgainst} conceded`)}
                ${tile('Longest rally', st.bestRally ? `${st.bestRally} hits` : 'None yet')}
                ${tile('Time played', fmtTime(st.seconds))}
                ${tile('Achievements', `${st.achievements} / ${st.achievementsTotal}`)}
                ${tile('Zombie best score', st.zombieBest || 'None yet', st.zombieWaves ? `${st.zombieWaves} waves cleared` : '')}
            </div>
            <div class="ppset-label ppset-pf-title">By mode</div>
            <table class="ppset-modes-table">
                <thead><tr><th scope="col">Mode</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Win rate</th><th scope="col">Time</th></tr></thead>
                <tbody>${st.modes.map((m) => `<tr><th scope="row"><span class="pp-mode-thumb" data-mode-thumb="${esc(m.id)}" aria-hidden="true"></span>${esc(m.label)}</th><td>${m.played}</td><td>${m.won}</td><td>${m.played ? Math.round((m.won / m.played) * 100) + '%' : '-'}</td><td>${m.seconds ? fmtTime(m.seconds) : '-'}</td></tr>`).join('')}</tbody>
            </table>
            <p class="ppset-help ppset-pf-note">Profile since ${esc(since)}. Matches from before profiles existed count in the totals above but not by mode. Local two-player matches are not counted. Stats are stored in this browser.</p>`;
        window.ModeArt?.thumbs(host);
    }

    let root = null;
    let activeTab = 'gameplay';
    let capture = null; // { action, button }

    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

    function rowShell(row, control) {
        return `<div class="ppset-row" data-row="${esc(row.key || row.id || row.type)}">
            <div class="ppset-text"><div class="ppset-label">${esc(row.label)}</div>${row.help ? `<div class="ppset-help">${esc(row.help)}</div>` : ''}</div>
            <div class="ppset-control">${control}</div>
        </div>`;
    }

    function renderRow(row) {
        const v = row.key ? S().get(row.key) : null;
        switch (row.type) {
            case 'seg':
                return rowShell(row, `<div class="ppset-seg" role="radiogroup" aria-label="${esc(row.label)}">${row.options.map(([val, text]) =>
                    `<button type="button" role="radio" data-key="${row.key}" data-val="${esc(val)}" aria-checked="${String(v) === String(val)}">${esc(text)}</button>`).join('')}</div>`);
            case 'toggle':
                return rowShell(row, `<button type="button" class="ppset-switch" role="switch" data-key="${row.key}" aria-checked="${!!v}" aria-label="${esc(row.label)}"><i></i></button>`);
            case 'slider':
                return rowShell(row, `<div class="ppset-range"><input type="range" data-key="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}" value="${v}" aria-label="${esc(row.label)}"><output>${v}${row.unit || ''}</output></div>`);
            case 'volume':
                return rowShell(row, `<div class="ppset-range"><input type="range" data-vol="${row.id}" min="0" max="100" step="1" value="0" aria-label="${esc(row.label)} volume"><output>0%</output></div>`);
            case 'audioToggle':
                return rowShell(row, `<button type="button" class="ppset-switch" role="switch" data-audio="${row.id}" aria-checked="false" aria-label="${esc(row.label)}"><i></i></button>`);
            case 'actions':
                return rowShell(row, `<div class="ppset-actions">${row.buttons.map((b) => `<button type="button" class="ppset-btn" data-action="${b.id}">${esc(b.text)}</button>`).join('')}</div>`);
            case 'note':
                return `<div class="ppset-note">${row.html}</div>`;
            case 'paddles':
                return renderPaddles();
            case 'profile':
                return '<div class="ppset-profile"></div>';
            case 'keys':
                return `<div class="ppset-row ppset-keys-row"><div class="ppset-text"><div class="ppset-label">${esc(row.label)}</div><div class="ppset-help">${esc(row.help)}</div></div>
                    <div class="ppset-keys">${BIND_ROWS.map((g) => `<div class="ppset-keygroup"><div class="ppset-keyside">${esc(g.side)}</div>${g.actions.map(([a, t]) =>
                        `<label class="ppset-keyitem"><span>${t}</span><button type="button" class="ppset-key" data-bind="${a}">${esc(S().keyLabel(S().get('bindings')[a]))}</button></label>`).join('')}</div>`).join('')}
                    <button type="button" class="ppset-btn ppset-keyreset" data-action="resetKeys">Default keys</button></div></div>`;
            default:
                return '';
        }
    }

    function build() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'pp-settings';
        root.className = 'pp-overlay-panel ppset';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'ppset-title');
        root.innerHTML = `
            <div class="ppset-box">
                <header class="ppset-head">
                    <div>
                        <div class="ppset-kicker">Options</div>
                        <h2 id="ppset-title">Settings</h2>
                    </div>
                    <button type="button" class="ppset-close" data-action="close" aria-label="Close settings">&times;</button>
                </header>
                <nav class="ppset-tabs" role="tablist">${TABS.map((t) =>
                    `<button type="button" role="tab" data-tab="${t.id}" aria-selected="false">${t.label}</button>`).join('')}</nav>
                <div class="ppset-body">${TABS.map((t) =>
                    `<section class="ppset-page" role="tabpanel" data-page="${t.id}" hidden>${ROWS[t.id].map(renderRow).join('')}</section>`).join('')}</div>
                <footer class="ppset-foot">
                    <button type="button" class="ppset-btn ghost" data-action="reset">Reset all</button>
                    <span class="ppset-saved" aria-live="polite">Changes save automatically</span>
                    <button type="button" class="ppset-btn primary" data-action="close">Done</button>
                </footer>
            </div>`;
        window.ModeArt?.decorate(root.querySelector('.ppset-head'), 'settings');
        document.body.appendChild(root);
        bind();
        selectTab(activeTab);
        return root;
    }

    function flashSaved() {
        const el = root?.querySelector('.ppset-saved');
        if (!el) return;
        el.textContent = 'Saved';
        el.classList.add('on');
        clearTimeout(flashSaved.t);
        flashSaved.t = setTimeout(() => { el.classList.remove('on'); el.textContent = 'Changes save automatically'; }, 1200);
    }

    function selectTab(id) {
        activeTab = id;
        root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
        root.querySelectorAll('[data-page]').forEach((p) => { p.hidden = p.dataset.page !== id; });
        if (id === 'audio') syncAudio();
        if (id === 'profile') renderProfile();
        if (id === 'paddles') { syncPaddles(); startPaddlePreviews(); }
        root.querySelector('.ppset-body').scrollTop = 0;
    }

    function parseVal(key, raw) {
        const def = S().DEFAULTS[key];
        return typeof def === 'number' ? Number(raw) : raw;
    }

    function syncFromStore() {
        if (!root) return;
        root.querySelectorAll('.ppset-seg button').forEach((b) => {
            b.setAttribute('aria-checked', String(String(S().get(b.dataset.key)) === b.dataset.val));
        });
        root.querySelectorAll('.ppset-switch[data-key]').forEach((b) => b.setAttribute('aria-checked', String(!!S().get(b.dataset.key))));
        root.querySelectorAll('input[type=range][data-key]').forEach((inp) => {
            const row = ROWS.controls.concat(ROWS.display).find((r) => r.key === inp.dataset.key);
            inp.value = S().get(inp.dataset.key);
            inp.nextElementSibling.textContent = inp.value + (row?.unit || '');
            paintRange(inp);
        });
        root.querySelectorAll('.ppset-key').forEach((b) => { b.textContent = S().keyLabel(S().get('bindings')[b.dataset.bind]); });
        syncPaddles();
    }

    function paintRange(inp) {
        const pct = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
        inp.style.setProperty('--fill', pct + '%');
    }

    function syncAudio() {
        const a = audio();
        if (!root) return;
        const vols = {
            master: a?.getVolumePercent ? a.getVolumePercent() : Math.round((a?.masterVolume ?? 0.8) * 100),
            music: a?.getMusicVolumePercent ? a.getMusicVolumePercent() : 100,
            sfx: a?.getSfxVolumePercent ? a.getSfxVolumePercent() : 100,
            voice: a?.getVoiceVolumePercent ? a.getVoiceVolumePercent() : 100,
        };
        root.querySelectorAll('input[data-vol]').forEach((inp) => {
            inp.value = vols[inp.dataset.vol];
            inp.nextElementSibling.textContent = inp.value + '%';
            paintRange(inp);
        });
        const states = { sound: !!a?.enabled, musicOn: !a?.musicMuted, voiceOn: !a?.voiceMuted };
        root.querySelectorAll('[data-audio]').forEach((b) => b.setAttribute('aria-checked', String(states[b.dataset.audio])));
    }

    function setVolume(id, pct) {
        const a = audio();
        if (!a) return;
        const v = pct / 100;
        if (id === 'master') (a.setVolume || a.setMasterVolume)?.call(a, v);
        if (id === 'music') a.setMusicVolume?.(v);
        if (id === 'sfx') a.setSfxVolume?.(v);
        if (id === 'voice') a.setVoiceVolume?.(v);
    }

    function toggleAudio(id) {
        const a = audio();
        if (!a) return;
        if (id === 'sound') {
            if (a.setSoundOn) a.setSoundOn(!a.enabled).catch(() => {});
            else if (a.enabled) a.disable?.();
            else Promise.resolve(a.enable?.()).catch(() => {});
        }
        if (id === 'musicOn') (a.setMusicMuteState ? a.setMusicMuteState(!a.musicMuted) : a.toggleMusicMute?.());
        if (id === 'voiceOn') a.setVoiceMute?.(!a.voiceMuted);
        setTimeout(syncAudio, 60);
        flashSaved();
    }

    function startCapture(button) {
        stopCapture();
        capture = { action: button.dataset.bind, button };
        button.classList.add('listening');
        button.textContent = 'Press a key';
    }

    function stopCapture() {
        if (!capture) return;
        capture.button.classList.remove('listening');
        capture = null;
        syncFromStore();
    }

    function onKeyCapture(e) {
        if (!capture) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const k = e.key.toLowerCase();
        if (k === 'escape') { stopCapture(); return; }
        if (['f2', 'tab', 'shift', 'control', 'alt', 'meta'].includes(k)) return;
        S().setBinding(capture.action, k);
        stopCapture();
        flashSaved();
    }

    function bind() {
        root.addEventListener('click', (e) => {
            if (e.target === root) { close(); return; }
            const tab = e.target.closest('[data-tab]');
            if (tab) { selectTab(tab.dataset.tab); return; }
            const seg = e.target.closest('.ppset-seg button');
            if (seg) { S().set(seg.dataset.key, parseVal(seg.dataset.key, seg.dataset.val)); flashSaved(); return; }
            const sw = e.target.closest('.ppset-switch[data-key]');
            if (sw) { S().set(sw.dataset.key, !S().get(sw.dataset.key)); flashSaved(); return; }
            const asw = e.target.closest('[data-audio]');
            if (asw) { toggleAudio(asw.dataset.audio); return; }
            const pmode = e.target.closest('[data-pmode]');
            if (pmode) { paddleMode = pmode.dataset.pmode; syncPaddles(); return; }
            const pcard = e.target.closest('.ppset-pcard');
            if (pcard) { S().setPaddle?.(paddleMode, pcard.dataset.pside, pcard.dataset.design); flashSaved(); return; }
            const key = e.target.closest('.ppset-key');
            if (key) { startCapture(key); return; }
            const act = e.target.closest('[data-action]');
            if (!act) return;
            const id = act.dataset.action;
            if (id === 'close') close();
            else if (id === 'reset') {
                if (act.dataset.armed) { S().reset(); act.textContent = 'Reset all'; delete act.dataset.armed; flashSaved(); }
                else { act.dataset.armed = '1'; act.textContent = 'Tap again to reset'; setTimeout(() => { if (act.dataset.armed) { delete act.dataset.armed; act.textContent = 'Reset all'; } }, 2500); }
            } else if (id === 'resetKeys') {
                Object.entries(S().DEFAULT_BINDINGS).forEach(([a, k]) => S().setBinding(a, k));
                flashSaved();
            } else {
                for (const tabRows of Object.values(ROWS)) {
                    for (const r of tabRows) (r.buttons || []).forEach((b) => { if (b.id === id) b.run(); });
                }
            }
        });
        root.addEventListener('input', (e) => {
            const inp = e.target;
            if (inp.dataset.key) {
                const row = ROWS.controls.concat(ROWS.display).find((r) => r.key === inp.dataset.key);
                inp.nextElementSibling.textContent = inp.value + (row?.unit || '');
                paintRange(inp);
                S().set(inp.dataset.key, Number(inp.value));
            } else if (inp.dataset.vol) {
                inp.nextElementSibling.textContent = inp.value + '%';
                paintRange(inp);
                setVolume(inp.dataset.vol, Number(inp.value));
            }
        });
        root.addEventListener('change', (e) => {
            if (e.target.matches('input[type=range]')) flashSaved();
            if (e.target.matches('[data-pf-name]')) { window.PPProfile?.setName(e.target.value); renderProfile(); flashSaved(); }
        });
        // Arrow keys move between tabs when a tab has focus.
        root.querySelector('.ppset-tabs').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = TABS.findIndex((t) => t.id === activeTab);
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
            selectTab(next);
            root.querySelector(`[data-tab="${next}"]`).focus();
            e.preventDefault();
        });
        window.addEventListener('keydown', onKeyCapture, true);
        S().on(() => syncFromStore());
    }

    function close() {
        stopCapture();
        if (typeof window.ppCloseOpenPanel === 'function') window.ppCloseOpenPanel();
        else root.style.display = 'none';
    }

    // Called by the panel manager whenever the panel is shown.
    function onOpen(tab) {
        build();
        // The Paddles tab opens on the mode being played (or last picked).
        const mode = window.game?.gameMode;
        if (mode && PADDLE_MODES.some(([id]) => id === mode) && (window.game.isInMatch?.() || tab === 'paddles')) paddleMode = mode;
        if (tab) selectTab(tab);
        else selectTab(activeTab);
        syncFromStore();
        syncAudio();
        if (activeTab === 'paddles') startPaddlePreviews();
        requestAnimationFrame(() => root.querySelector(`[data-tab="${activeTab}"]`)?.focus({ preventScroll: true }));
    }

    window.PPSettingsPanel = { build, onOpen, isCapturing: () => !!capture };
})();

// Page-wide effects of display, accessibility and audio settings.
(function () {
    'use strict';
    const S = window.PPSettings;
    if (!S) return;

    function apply() {
        const body = document.body;
        if (!body) return;
        body.classList.toggle('pp-hud-small', S.get('hudSize') === 'small');
        body.classList.toggle('pp-hud-large', S.get('hudSize') === 'large');
        body.classList.toggle('pp-reduce-motion', !!S.get('reduceMotion'));
        body.classList.toggle('pp-noir', !!S.get('noir'));
        window.game?.refreshPausedFrame?.();
        document.documentElement.style.setProperty('--pp-ui-zoom', String((Number(S.get('uiScale')) || 100) / 100));
    }

    // Settings > Audio > Mute in the background.
    document.addEventListener('visibilitychange', () => {
        const ctx = window.game?.audio?.ctx;
        if (!ctx || !S.get('muteInBackground')) return;
        if (document.hidden && ctx.state === 'running') { ctx.suspend().catch(() => {}); ctx.__ppBgSuspended = true; }
        else if (!document.hidden && ctx.__ppBgSuspended) { ctx.__ppBgSuspended = false; ctx.resume().catch(() => {}); }
        document.querySelectorAll('audio').forEach((el) => {
            if (document.hidden && !el.paused) { el.pause(); el.__ppBgPaused = true; }
            else if (!document.hidden && el.__ppBgPaused) { el.__ppBgPaused = false; el.play().catch(() => {}); }
        });
    });

    S.on(apply);
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply);
})();

// Any button with data-open-panel="settings|audio|help" opens that panel
// (match setup dialog, Custom screen).
document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-open-panel]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    window.ppOpenPanel?.(btn.dataset.openPanel);
});

