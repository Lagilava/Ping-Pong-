// The Daily Match: one seeded solo match per calendar day, the same for every
// player on that date. The date is hashed into a seed that picks the mode,
// rival, rule twist and bonus goal; the weekday sets the skill. No server is
// involved. Progress (best score per day, streak, freezes) is stored in this
// browser under `pp-daily-v1`.
//
// The match runs through the same `game.tourContext` path as a Tour stage, so
// the player's saved settings are never changed. daily.js builds a stage-shaped
// object (`stage()`), and PPTour / PPTourStage branch on `stage.daily`.
(function () {
    'use strict';

    const KEY = 'pp-daily-v1';
    const DAY_MS = 86400000;
    const KEEP_DAYS = 60;
    const CALENDAR_DAYS = 30;

    const MODES = ['classic', 'gravity', 'speed', 'obstacle'];
    const MODE_NAMES = { classic: 'Classic', gravity: 'Gravity', speed: 'Speed', obstacle: 'Obstacle' };
    const SKILLS = ['Rookie', 'Easy', 'Normal', 'Hard', 'Insane'];
    // Same keys as the Tour's twists (game.js reads tourContext.twist).
    const TWISTS = [null, 'powerUps', 'noPowerUps', 'winBy2'];
    const TWIST_TEXT = { powerUps: 'Power-ups always on', noPowerUps: 'No power-ups', winBy2: 'Win by 2 points' };
    const STYLE_TEXT = {
        wall: 'Returns everything and waits for a mistake',
        sniper: 'Aims for the corners',
        trickster: 'Fakes one way and spins the other',
        bully: 'Hits hard and keeps the pressure on',
    };
    // Owned here, never derived from Tour data: changing the Tour must not change
    // which rival a past or future date gets. Append only; never reorder.
    const CAST = [['Pip', 'wall'], ['Vee', 'sniper'], ['Nova', 'trickster'], ['Brick', 'bully'], ['Juno', 'sniper'], ['Mirage', 'trickster'], ['Atlas', 'wall'], ['Titan', 'bully']];

    const SCORE = { win: 1000, perMargin: 100, perRallyHit: 20, bonusGoal: 300 };

    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    // ── Dates ────────────────────────────────────────────────────────────
    let nowFn = () => new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    // The player's local calendar date, so a Daily belongs to the day they see.
    function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    function todayKey() { return dateKey(nowFn()); }
    // Day count from a YYYY-MM-DD key; UTC maths, so daylight saving never skews a gap.
    function dayNum(key) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
        return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : NaN;
    }
    function keyFromDayNum(n) {
        const d = new Date(n * DAY_MS);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    function weekday(key) { return (((dayNum(key) + 4) % 7) + 7) % 7; } // 0 = Sunday (1970-01-01 was a Thursday)
    function prettyDate(key) {
        const n = dayNum(key);
        if (!Number.isFinite(n)) return '';
        const d = new Date(n * DAY_MS);
        return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    }

    // ── Seeded setup ─────────────────────────────────────────────────────
    function hash(str) { // FNV-1a
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function rng(seed) { // mulberry32
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // Monday and Tuesday Easy, Wednesday to Friday Normal, the weekend Hard.
    function levelFor(key) { const w = weekday(key); return w === 0 || w === 6 ? 3 : (w === 1 || w === 2) ? 1 : 2; }

    const goalText = {
        margin: (n) => `Win by ${n} or more points`,
        streak: (n) => `Score ${n} points in a row`,
        rally: (n) => `Hit a ${n}-ball rally`,
    };
    const BONUS_GOALS = [
        { type: 'margin', n: 3 }, { type: 'streak', n: 3 }, { type: 'rally', n: 10 }, { type: 'margin', n: 4 }, { type: 'rally', n: 12 },
    ];

    // Pure: the setup for a date key. Same key, same setup, on every device.
    function setupFor(key) {
        const rand = rng(hash(`pp-daily|${key}`));
        const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
        const mode = pick(MODES);
        const [rival, style] = pick(CAST);
        const twist = pick(TWISTS);
        const level = levelFor(key);
        const base = pick(BONUS_GOALS);
        const goal = { type: base.type, n: base.n, text: goalText[base.type](base.n) };
        const points = level >= 3 ? 11 : 7;
        return { date: key, mode, rival, style, twist, level, points, goal };
    }

    let stageCache = null;
    // The match being played keeps its own date: a match that starts before
    // midnight and ends after it still belongs to the day it began on.
    let pinned = null;
    // The Tour-stage-shaped object for today (cached per date), or the pinned match.
    function stage() {
        if (pinned) return pinned;
        const key = todayKey();
        if (stageCache && stageCache.date === key) return stageCache;
        const s = setupFor(key);
        stageCache = {
            id: 'daily', daily: true, date: key, tier: 1, rival: s.rival, style: s.style, mode: s.mode,
            level: s.level, points: s.points, twist: s.twist, goals: [s.goal],
        };
        return stageCache;
    }

    // ── Score ────────────────────────────────────────────────────────────
    // A loss posts no score, but a finished attempt still keeps the streak.
    function scoreOf(info, goalHit) {
        if (!info.won) return { total: 0, parts: [] };
        const margin = Math.max(0, (info.playerScore || 0) - (info.aiScore || 0));
        const rally = Math.max(0, info.rally || 0);
        const parts = [
            ['Win', SCORE.win],
            [`Margin ${margin}`, margin * SCORE.perMargin],
            [`Rally ${rally}`, rally * SCORE.perRallyHit],
        ];
        if (goalHit) parts.push(['Bonus goal', SCORE.bonusGoal]);
        return { total: parts.reduce((n, p) => n + p[1], 0), parts };
    }

    // ── Save data ────────────────────────────────────────────────────────
    let data = null;
    function blank() { return { v: 1, days: {}, streak: 0, bestStreak: 0, lastDay: '', freezes: 0 }; }

    function load() {
        data = blank();
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* storage blocked or corrupt */ }
        if (!raw || typeof raw !== 'object') return data;
        const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
        if (raw.days && typeof raw.days === 'object') {
            Object.keys(raw.days).forEach((k) => {
                const r = raw.days[k];
                if (!Number.isFinite(dayNum(k)) || !r || typeof r !== 'object') return;
                data.days[k] = { attempts: Math.max(1, num(r.attempts)), won: num(r.won), best: num(r.best), rally: num(r.rally) };
            });
        }
        data.lastDay = Number.isFinite(dayNum(raw.lastDay)) ? raw.lastDay : '';
        data.streak = data.lastDay ? Math.max(1, num(raw.streak)) : 0;
        data.bestStreak = Math.max(data.streak, num(raw.bestStreak));
        data.freezes = Math.min(1, num(raw.freezes));
        return data;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ }
    }
    function ensure() { if (!data) load(); return data; }

    function prune() {
        const keys = Object.keys(data.days).sort();
        while (keys.length > KEEP_DAYS) delete data.days[keys.shift()];
    }

    // Move the streak to `key` after a finished attempt. A missed single day is
    // covered by a freeze when one is held; a longer gap starts again at 1.
    function advance(d, key) {
        const out = { usedFreeze: false, gotFreeze: false };
        if (!d.lastDay) d.streak = 1;
        else {
            const gap = dayNum(key) - dayNum(d.lastDay);
            if (gap <= 0) return out; // same day again, or the clock moved back
            if (gap === 1) d.streak += 1;
            else if (gap === 2 && d.freezes > 0) { d.freezes -= 1; d.streak += 1; out.usedFreeze = true; }
            else d.streak = 1;
        }
        d.lastDay = key;
        d.bestStreak = Math.max(d.bestStreak, d.streak);
        if (d.streak % 7 === 0 && d.freezes < 1) { d.freezes = 1; out.gotFreeze = true; }
        return out;
    }

    // The streak as the player should see it today (it lapses if they missed days).
    function liveStreak(d, key) {
        if (!d.lastDay) return 0;
        const gap = dayNum(key) - dayNum(d.lastDay);
        if (gap <= 1) return d.streak;
        return gap === 2 && d.freezes > 0 ? d.streak : 0;
    }

    function today() { return ensure().days[todayKey()] || null; }
    function doneToday() { return !!today(); }
    function streak() { return liveStreak(ensure(), todayKey()); }

    // info: { stageId: 'daily', won, playerScore, aiScore, rally, bestStreak }
    function recordResult(info) {
        load(); // read again: another tab may have saved since this one loaded
        const st = stage();
        const key = st.date;
        const goalHit = !!info.won && !!window.PPTour?.goalMet?.(st.goals[0], info);
        const sc = scoreOf(info, goalHit);
        const prev = data.days[key] || { attempts: 0, won: 0, best: 0, rally: 0 };
        const best = Math.max(prev.best, sc.total);
        data.days[key] = {
            attempts: prev.attempts + 1, won: prev.won + (info.won ? 1 : 0), best,
            rally: Math.max(prev.rally, info.rally || 0),
        };
        const rec = sc.total > 0 ? window.PPRecords?.add?.('dailyScore', sc.total, { m: st.mode, n: st.rival }) : null;
        const wasDone = prev.attempts > 0;
        const streakBefore = liveStreak(data, key);
        const adv = advance(data, key);
        prune();
        save();
        updateMenuButton();
        return {
            stage: st, won: !!info.won, earned: 0, goals: [goalHit], daily: true,
            score: sc.total, parts: sc.parts, best, newBest: sc.total > prev.best && sc.total > 0,
            firstToday: !wasDone, record: !!rec?.record, streak: data.streak, streakBefore, bestStreak: data.bestStreak,
            usedFreeze: adv.usedFreeze, gotFreeze: adv.gotFreeze, freezes: data.freezes,
            opened: [], newPaddles: [],
        };
    }

    function reset() {
        data = blank();
        save();
        updateMenuButton();
        if (root) render();
    }

    // ── Starting the match ───────────────────────────────────────────────
    function play() {
        pinned = null;
        const st = stage();
        pinned = st;
        const trigger = document.getElementById('menuDailyBtn');
        return window.PPTour?.startStage?.(st, isOpen() ? root.querySelector('.ppdaily-play') : trigger) || false;
    }

    // ── Result card ──────────────────────────────────────────────────────
    const fmt = (n) => Number(n).toLocaleString('en-US');
    function resultCard(result, xpLine) {
        const lines = [];
        if (result.won) {
            lines.push(`Score ${fmt(result.score)}${result.newBest && !result.firstToday ? '  (new best for today)' : ''}`);
            lines.push(result.parts.map(([label, pts]) => `${label} +${fmt(pts)}`).join('  ·  '));
            lines.push(`${result.goals[0] ? '✓' : '✗'} Bonus goal: ${result.stage.goals[0].text}`);
            if (!result.newBest || result.firstToday) lines.push(`Best today: ${fmt(result.best)}`);
        } else {
            lines.push(`${result.stage.rival} wins this one. A score is posted on a win.`);
            if (result.best > 0) lines.push(`Best today: ${fmt(result.best)}`);
        }
        if (result.record) lines.push(`New Daily record: ${fmt(result.score)}`);
        lines.push(`Daily streak: ${result.streak} day${result.streak === 1 ? '' : 's'}${result.streak === result.bestStreak && result.streak > 1 ? ' (your best)' : ''}`);
        if (result.usedFreeze) lines.push('A streak freeze covered yesterday.');
        if (result.gotFreeze) lines.push('Seven days in a row: you earned a streak freeze.');
        if (xpLine) lines.push(xpLine);
        const actions = [
            { label: result.won ? 'Play again for a better score' : 'Try again', primary: true, onClick: () => play() },
            { label: 'Daily Match', onClick: () => { window.PPResults?.hide(); open(); } },
            { label: 'Main menu', back: true, onClick: () => window.PPResults?.hide() },
        ];
        return {
            kicker: `Daily Match · ${prettyDate(result.stage.date)}`,
            title: result.won ? 'You win!' : `${result.stage.rival} wins`,
            tone: result.won ? 'win' : 'loss', lines, actions,
        };
    }

    // ── Daily screen ─────────────────────────────────────────────────────
    let root = null;
    let lastFocus = null;

    function calendarHtml() {
        const key = todayKey(), end = dayNum(key);
        let cells = '';
        for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
            const k = keyFromDayNum(end - i);
            const r = data.days[k];
            const state = r ? (r.won ? 'won' : 'lost') : (i === 0 ? 'open' : 'none');
            const label = `${prettyDate(k)}: ${r ? (r.won ? `won, best ${fmt(r.best)}` : 'played') : 'not played'}`;
            cells += `<li class="ppdaily-day ${state}${i === 0 ? ' today' : ''}" title="${esc(label)}" aria-label="${esc(label)}"><span>${Number(k.slice(8))}</span></li>`;
        }
        return cells;
    }

    function render() {
        if (!root) return;
        ensure();
        const st = stage();
        const rival = window.PPRivals?.get?.(st.rival);
        const rec = today();
        const s = streak();
        const accent = rival?.accent || '#5ee7ff';
        root.style.setProperty('--a', accent);
        const twist = st.twist ? TWIST_TEXT[st.twist] : 'No rule twist';
        const facts = [
            ['Mode', MODE_NAMES[st.mode] || st.mode],
            ['Skill', SKILLS[st.level]],
            ['First to', `${st.points} points`],
            ['Twist', twist],
        ];
        root.querySelector('.ppdaily-date').textContent = prettyDate(st.date);
        root.querySelector('.ppdaily-main').innerHTML = `
            <div class="ppdaily-rival">
                <div class="ppdaily-face" aria-hidden="true">${window.PPRivals?.portrait(rival?.id || st.rival) || ''}</div>
                <div class="ppdaily-who">
                    <span class="ppdaily-over">Today&rsquo;s opponent</span>
                    <h3>${esc(st.rival)}</h3>
                    <p>${esc(rival?.title || '')}</p>
                    <p class="ppdaily-style">${esc(STYLE_TEXT[st.style] || '')}</p>
                </div>
            </div>
            <div class="ppdaily-match">
                <div class="ppdaily-modeart"><span class="pp-mode-thumb" data-mode-thumb="${esc(st.mode)}" aria-hidden="true"></span></div>
                <dl class="ppdaily-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
                <p class="ppdaily-goal"><span>Bonus goal</span> ${esc(st.goals[0].text)} <b>+${SCORE.bonusGoal}</b></p>
                <p class="ppdaily-best">${rec ? (rec.best > 0 ? `Best today <b>${fmt(rec.best)}</b>` : 'Played today, no win yet') : 'Not played yet today'}</p>
                <button type="button" class="ppdaily-play"><span>${rec ? 'Play again' : 'Play today’s match'}</span><b aria-hidden="true">&rarr;</b></button>
            </div>`;
        root.querySelector('.ppdaily-side').innerHTML = `
            <div class="ppdaily-streak" role="img" aria-label="Daily streak: ${s} day${s === 1 ? '' : 's'}">
                <b>${s}</b><span>day streak</span>
            </div>
            <p class="ppdaily-meta">Best streak <b>${data.bestStreak}</b> &middot; Freeze ${data.freezes > 0 ? '<b class="on">ready</b>' : 'earned at 7 days'}</p>
            <h4>Last ${CALENDAR_DAYS} days</h4>
            <ol class="ppdaily-cal">${calendarHtml()}</ol>
            <p class="ppdaily-note">Everyone gets the same match on the same date. Finishing any attempt keeps your streak; a win posts a score.</p>`;
        root.querySelector('.ppdaily-reset').textContent = 'Reset Daily progress';
        delete root.querySelector('.ppdaily-reset').dataset.armed;
        window.ModeArt?.thumbs?.(root);
    }

    function build() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'ppDaily';
        root.className = 'ppdaily';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'ppdailyTitle');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="ppdaily-box">
                <header class="ppdaily-head">
                    <div><p class="ppdaily-kicker">Daily challenge</p><h2 id="ppdailyTitle">Daily Match</h2></div>
                    <p class="ppdaily-date"></p>
                    <button type="button" class="ppdaily-close" aria-label="Close the Daily Match">&times;</button>
                </header>
                <div class="ppdaily-body"><section class="ppdaily-main"></section><aside class="ppdaily-side"></aside></div>
                <footer class="ppdaily-foot"><button type="button" class="ppdaily-reset">Reset Daily progress</button></footer>
            </div>`;
        document.body.appendChild(root);
        root.addEventListener('click', (e) => {
            if (e.target === root || e.target.closest('.ppdaily-close')) { close(); return; }
            const rs = e.target.closest('.ppdaily-reset');
            if (rs) {
                if (rs.dataset.armed) { delete rs.dataset.armed; reset(); return; }
                rs.dataset.armed = '1'; rs.textContent = 'Tap again to erase streak and scores';
                setTimeout(() => { if (rs.isConnected && rs.dataset.armed) { delete rs.dataset.armed; rs.textContent = 'Reset Daily progress'; } }, 4000);
                return;
            }
            if (e.target.closest('.ppdaily-play')) play();
        });
        window.addEventListener('keydown', (e) => {
            if (!isOpen()) return;
            if (document.querySelector('#modeTutorial:not([hidden])')) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
            if (e.key === 'Tab') {
                const items = [...root.querySelectorAll('button:not(:disabled)')].filter((el) => el.getClientRects().length);
                if (!items.length) return;
                const first = items[0], last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
                return;
            }
            if (!['Enter', ' '].includes(e.key)) e.stopPropagation();
        }, true);
        return root;
    }

    // ── Gamepad: d-pad or left stick moves focus, A (on release) presses, B closes.
    let padRaf = 0, padPrev = null, padDir = '', padRepeat = 0;
    function padMove(dir) {
        const items = [...root.querySelectorAll('button:not(:disabled)')].filter((el) => el.getClientRects().length);
        if (!items.length) return;
        const cur = root.contains(document.activeElement) && items.includes(document.activeElement) ? document.activeElement : null;
        if (!cur) { (items.find((el) => el.classList.contains('ppdaily-play')) || items[0]).focus(); return; }
        const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = null, bestScore = Infinity;
        for (const el of items) {
            if (el === cur) continue;
            const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
            const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
            if (along < 4) continue;
            const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
            const score = along + across * 2.2;
            if (score < bestScore) { bestScore = score; best = el; }
        }
        if (best) best.focus();
    }
    function padPoll() {
        padRaf = 0;
        if (!isOpen()) return;
        const pad = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
        if (!pad) return;
        padRaf = requestAnimationFrame(padPoll);
        if (document.querySelector('#modeTutorial:not([hidden])')) return;
        const b = (i) => !!pad.buttons[i]?.pressed;
        const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
        const dir = (b(14) || x < -0.55) ? 'left' : (b(15) || x > 0.55) ? 'right' : (b(12) || y < -0.55) ? 'up' : (b(13) || y > 0.55) ? 'down' : '';
        const now = performance.now();
        if (dir && (dir !== padDir || now >= padRepeat)) { padMove(dir); padRepeat = now + (dir !== padDir ? 360 : 170); }
        padDir = dir;
        const cur = { a: b(0), b: b(1) };
        if (!padPrev) { padPrev = cur; return; } // the first frame only records buttons already held
        if (padPrev.a && !cur.a && root.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
        if (!padPrev.b && cur.b) close();
        padPrev = cur;
    }
    function startPad() {
        if (padRaf || !isOpen()) return;
        padPrev = null; padDir = ''; padRaf = requestAnimationFrame(padPoll);
    }
    window.addEventListener('gamepadconnected', () => { if (isOpen()) startPad(); });

    function isOpen() { return !!root?.classList.contains('open'); }

    function open() {
        pinned = null;
        if (window.PPTour?.isOpen?.()) window.PPTour.close(true);
        build();
        render();
        lastFocus = document.activeElement;
        root.classList.add('open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pp-tour-open');
        startPad();
        requestAnimationFrame(() => root.querySelector('.ppdaily-play')?.focus({ preventScroll: true }));
    }

    function close(silent) {
        if (!root || !isOpen()) return;
        root.classList.remove('open');
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pp-tour-open');
        if (!silent && lastFocus && document.contains(lastFocus) && lastFocus !== document.body) {
            try { lastFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        }
    }

    // ── Menu button ──────────────────────────────────────────────────────
    function updateMenuButton() {
        const btn = document.getElementById('menuDailyBtn');
        if (!btn) return;
        ensure();
        const label = document.getElementById('menuDailyState');
        const s = streak(), done = doneToday();
        if (label) label.textContent = done ? `✓ ${s}` : (s > 0 ? `${s} →` : 'NEW');
        btn.classList.toggle('done', done);
        btn.setAttribute('aria-label', `Open the Daily Match: ${done ? 'played today' : 'not played yet today'}, ${s} day streak`);
    }
    function bindMenu() {
        updateMenuButton();
        document.getElementById('menuDailyBtn')?.addEventListener('click', open);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindMenu);
    else bindMenu();
    window.addEventListener('pp-returned-to-menu', () => { pinned = null; stageCache = null; updateMenuButton(); if (isOpen()) render(); });
    // A page left open past midnight shows the new day when it is next looked at.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateMenuButton(); if (isOpen()) render(); } });

    window.PPDaily = {
        setupFor, stage, todayKey, recordResult, resultCard, scoreOf, advance, liveStreak,
        streak, bestStreak: () => ensure().bestStreak, doneToday, today, open, close, isOpen, play, reset, updateMenuButton,
        SCORE, MODES, dayNum, weekday, dateKey,
        reload: () => { data = null; load(); },
        // Tests only: replace the clock.
        _setNow: (fn, keepMatch) => { nowFn = typeof fn === 'function' ? fn : () => new Date(); stageCache = null; if (!keepMatch) pinned = null; },
    };
})();
