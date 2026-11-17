// Personal records: dated top-10 lists kept in this browser (`pp-records-v1`).
//
//   rally       longest rally, any mode            (hits, higher is better)
//   margin      biggest win in a points match      (points)
//   zombieWave  furthest Zombie wave reached       (wave)
//   zombieScore best Zombie score                  (score)
//   dailyScore  best Daily Match score             (score)
//   tourFast    fastest clear of each Tour stage   (seconds, lower is better; one per stage)
//
// Only solo matches write here (vs Computer, Zombie, Custom, Tour, Daily):
// local two-player and online matches never do. Nothing here runs per frame;
// records are written once when a match ends, and `rallyNote` is read once
// when a point ends.
(function () {
    'use strict';

    const KEY = 'pp-records-v1';
    const TOP = 10;
    const CATS = {
        rally: { label: 'Longest rally', unit: (v) => `${v} hits` },
        margin: { label: 'Biggest win', unit: (v) => `by ${v} points` },
        zombieWave: { label: 'Zombie wave', unit: (v) => `wave ${v}` },
        zombieScore: { label: 'Zombie score', unit: (v) => `${Number(v).toLocaleString('en-US')}` },
        dailyScore: { label: 'Daily Match score', unit: (v) => `${Number(v).toLocaleString('en-US')}` },
    };
    const MODE_NAMES = { classic: 'Classic', gravity: 'Gravity', speed: 'Speed', obstacle: 'Obstacle', zombie: 'Zombie', customise: 'Custom' };
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    let data = null;
    const blank = () => ({ v: 1, seeded: false, lists: { rally: [], margin: [], zombieWave: [], zombieScore: [], dailyScore: [] }, tourFast: {}, modeBest: {} });

    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const posNum = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

    function load() {
        data = blank();
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* storage blocked or corrupt */ }
        if (!raw || typeof raw !== 'object') return data;
        data.seeded = !!raw.seeded;
        Object.keys(CATS).forEach((cat) => {
            const list = raw.lists && Array.isArray(raw.lists[cat]) ? raw.lists[cat] : [];
            data.lists[cat] = list
                .filter((e) => e && typeof e === 'object' && posNum(e.v) > 0)
                .map((e) => ({ v: posNum(e.v), d: typeof e.d === 'string' ? e.d.slice(0, 10) : '', m: typeof e.m === 'string' ? e.m.slice(0, 12) : '', n: typeof e.n === 'string' ? e.n.slice(0, 24) : '' }))
                .sort((a, b) => b.v - a.v)
                .slice(0, TOP);
        });
        if (raw.modeBest && typeof raw.modeBest === 'object') {
            Object.keys(raw.modeBest).forEach((m) => { if (MODE_NAMES[m] && posNum(raw.modeBest[m]) > 0) data.modeBest[m] = posNum(raw.modeBest[m]); });
        }
        if (raw.tourFast && typeof raw.tourFast === 'object') {
            Object.keys(raw.tourFast).forEach((id) => {
                const e = raw.tourFast[id];
                if (/^\d{1,2}$/.test(id) && e && posNum(e.v) > 0) data.tourFast[id] = { v: posNum(e.v), d: typeof e.d === 'string' ? e.d.slice(0, 10) : '' };
            });
        }
        return data;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ }
    }

    // Records that existed before this module (per-mode bests in the profile)
    // become the first entries, so nobody starts from an empty board.
    function seed() {
        if (data.seeded) return;
        const P = window.PPProfile;
        const stats = P?.getStats?.();
        if (!stats) return; // profile not ready yet; try again next time
        (stats.modes || []).forEach((m) => {
            if (posNum(m.bestRally) > 0) { data.lists.rally.push({ v: posNum(m.bestRally), d: '', m: m.id, n: '' }); data.modeBest[m.id] = posNum(m.bestRally); }
            if (posNum(m.bestMargin) > 0 && m.id !== 'zombie') data.lists.margin.push({ v: posNum(m.bestMargin), d: '', m: m.id, n: '' });
        });
        if (posNum(stats.zombieBest) > 0) data.lists.zombieScore.push({ v: posNum(stats.zombieBest), d: '', m: 'zombie', n: '' });
        ['rally', 'margin'].forEach((cat) => { data.lists[cat].sort((a, b) => b.v - a.v); data.lists[cat].length = Math.min(data.lists[cat].length, TOP); });
        data.seeded = true;
        save();
    }
    function ensure() { if (!data) load(); seed(); return data; }

    function best(cat) { const l = ensure().lists[cat]; return l && l.length ? l[0].v : 0; }

    // Insert a value. Ties keep the older entry ahead. Returns where it landed
    // (0 when it did not make the list) and whether it beat a previous best.
    function add(cat, v, extra) {
        ensure();
        v = posNum(v);
        if (!CATS[cat] || v <= 0) return { rank: 0, record: false, was: 0 };
        const list = data.lists[cat];
        const was = list.length ? list[0].v : 0;
        let at = list.findIndex((e) => e.v < v);
        if (at < 0) at = list.length;
        if (at >= TOP) return { rank: 0, record: false, was };
        list.splice(at, 0, { v, d: today(), m: (extra && extra.m) || '', n: (extra && extra.n) || '' });
        if (list.length > TOP) list.length = TOP;
        save();
        return { rank: at + 1, record: at === 0 && was > 0, was };
    }

    function addFast(stageId, seconds, extra) {
        ensure();
        const id = String(stageId);
        seconds = posNum(seconds);
        if (!/^\d{1,2}$/.test(id) || seconds < 3) return { record: false, was: 0 };
        const prev = data.tourFast[id];
        if (prev && prev.v <= seconds) return { record: false, was: prev.v };
        data.tourFast[id] = { v: seconds, d: today(), n: (extra && extra.n) || '' };
        save();
        return { record: !!prev, was: prev ? prev.v : 0 };
    }

    // ── Match tracking ───────────────────────────────────────────────────
    // Seconds of real play in the current match, ticked once a second like the
    // profile's time-played counter (never per frame).
    let playSeconds = 0;
    setInterval(() => {
        const g = window.game;
        if (!g) return;
        const playing = g.running && !g.paused && !g.userPaused && !g.introActive && !g.matchEnding &&
            document.visibilityState === 'visible' && (g.isInMatch ? g.isInMatch() : true);
        if (playing) playSeconds += 1;
    }, 1000);

    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    // Called once when a solo match ends. info: { mode, won, rally, margin,
    // zombie: { wave, score }, tourStage, rival }. Returns the records broken
    // that the profile's own "New record" lines do not already cover.
    function recordMatch(info) {
        if (!info || !info.mode) return [];
        ensure();
        const out = [];
        const note = (label, value) => out.push({ id: label, label, value });
        const mode = info.mode;
        // Rally and margin are announced by the profile; recorded here for the board.
        add('rally', info.rally, { m: mode });
        if (posNum(info.rally) > (data.modeBest[mode] || 0)) { data.modeBest[mode] = posNum(info.rally); save(); }
        if (info.won && mode !== 'zombie') add('margin', info.margin, { m: mode });
        if (mode === 'zombie' && info.zombie) {
            // Wave 1 is where every run starts; only runs that got somewhere are listed.
            const w = info.zombie.wave >= 2 ? add('zombieWave', info.zombie.wave, { m: 'zombie' }) : { record: false };
            if (w.record) note('Zombie wave', `wave ${info.zombie.wave}`);
            const s = add('zombieScore', info.zombie.score, { m: 'zombie' });
            if (s.record) note('Zombie score', String(info.zombie.score));
        }
        if (info.tourStage && info.won) {
            const f = addFast(info.tourStage, playSeconds, { n: info.rival });
            if (f.record) out.push({ id: 'fast', label: `Fastest stage ${info.tourStage} clear`, value: fmtTime(playSeconds) });
        }
        playSeconds = 0;
        return out;
    }

    // ── In-match: a rally that beats the mode's best (read when a point ends) ──
    // The baseline is the profile's best for the mode when the match began, the
    // same number the result card's "New record" line compares against.
    let baseline = 0, noted = 0;
    function matchStarted(mode) {
        // Seeding must happen before the profile folds this match in, which is why it is here.
        ensure();
        playSeconds = 0; noted = 0;
        baseline = data.modeBest[mode] || 0;
    }
    function rallyNote(rally) {
        if (baseline < 5 || rally <= baseline || rally <= noted) return null; // a first record needs something to beat
        noted = rally;
        return `${rally} hits, your longest in this mode`;
    }

    function reset() {
        data = blank();
        baseline = 0;
        data.seeded = true; // a reset board stays empty
        save();
    }

    // ── Settings > Profile: the lists ────────────────────────────────────
    function when(e) { return e.d || 'earlier'; }
    function listHtml(cat) {
        const l = ensure().lists[cat];
        const def = CATS[cat];
        if (!l.length) return `<p class="ppset-help ppset-rec-empty">None yet</p>`;
        const row = (e, i) => `<li><span class="ppset-rec-rank">${i + 1}</span><b>${esc(def.unit(e.v))}</b><span class="ppset-rec-meta">${esc([MODE_NAMES[e.m] || '', e.n, when(e)].filter(Boolean).join(' · '))}</span></li>`;
        const top = l.slice(0, 3).map(row).join('');
        const more = l.slice(3).map((e, i) => row(e, i + 3)).join('');
        return `<ol class="ppset-rec-list">${top}</ol>${more ? `<details class="ppset-rec-more"><summary>Show ${l.length - 3} more</summary><ol class="ppset-rec-list" start="4">${more}</ol></details>` : ''}`;
    }
    function html() {
        ensure();
        const fast = Object.keys(data.tourFast).sort((a, b) => a - b);
        const dailyBest = window.PPDaily?.bestStreak?.() || 0;
        const card = (title, body) => `<section class="ppset-rec"><h4>${esc(title)}</h4>${body}</section>`;
        return `<div class="ppset-label ppset-pf-title">Records</div>
            <div class="ppset-recs">
                ${card('Longest rally', listHtml('rally'))}
                ${card('Biggest win', listHtml('margin'))}
                ${card('Zombie wave', listHtml('zombieWave'))}
                ${card('Zombie score', listHtml('zombieScore'))}
                ${card('Daily Match score', listHtml('dailyScore'))}
                ${card('Fastest Tour clears', fast.length ? `<ol class="ppset-rec-list">${fast.map((id) => `<li><span class="ppset-rec-rank">${id}</span><b>${fmtTime(data.tourFast[id].v)}</b><span class="ppset-rec-meta">Stage ${id}${data.tourFast[id].n ? ' · ' + esc(data.tourFast[id].n) : ''}${data.tourFast[id].d ? ' · ' + esc(data.tourFast[id].d) : ''}</span></li>`).join('')}</ol>` : '<p class="ppset-help ppset-rec-empty">None yet</p>')}
                ${card('Longest Daily streak', `<p class="ppset-rec-big">${dailyBest ? `${dailyBest} day${dailyBest === 1 ? '' : 's'}` : 'None yet'}</p>`)}
            </div>
            <p class="ppset-help ppset-pf-note">Records come from solo matches (Computer, Zombie, Custom, Tour, Daily). Local two-player and online matches are not counted.</p>
            <p class="ppset-rec-foot"><button type="button" class="ppset-rec-reset" data-rec-reset>Reset records</button></p>`;
    }

    window.PPRecords = {
        recordMatch, add, addFast, best, matchStarted, rallyNote, reset, html, ensure, CATS,
        top: (cat) => ensure().lists[cat].map((e) => ({ ...e })),
        fastest: (id) => (ensure().tourFast[String(id)] || null),
        reload: () => { data = null; load(); },
    };
})();
