// Player profile: a name plus lifetime stats shown in Settings > Profile.
// Matches are recorded from Game.finishMatch. Time played is counted while a
// match is actually running (not in the intro, paused or on a menu).
(function () {
    'use strict';

    const KEY = 'pp-profile-v1';
    const MODES = [
        ['classic', 'Classic'], ['zombie', 'Zombie'], ['gravity', 'Gravity'],
        ['speed', 'Speed'], ['obstacle', 'Obstacle'], ['customise', 'Custom'],
    ];
    const blankMode = () => ({ played: 0, won: 0, pointsFor: 0, pointsAgainst: 0, seconds: 0, bestRally: 0 });

    let data = null;
    let dirty = false;

    function load() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* ignore */ }
        data = {
            name: '', since: Date.now(), seeded: false, bestStreak: 0,
            legacy: { played: 0, won: 0, pointsFor: 0, pointsAgainst: 0 },
            modes: {},
        };
        if (stored && typeof stored === 'object') {
            data.name = String(stored.name || '').slice(0, 16);
            data.since = Number(stored.since) || data.since;
            data.seeded = !!stored.seeded;
            data.bestStreak = Number(stored.bestStreak) || 0;
            Object.assign(data.legacy, stored.legacy || {});
            Object.assign(data.modes, stored.modes || {});
        }
        MODES.forEach(([id]) => { data.modes[id] = Object.assign(blankMode(), data.modes[id]); });
    }

    function save() {
        dirty = false;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ }
    }

    // Matches played before profiles existed live only in the progression
    // totals; copy them once so the profile does not start from zero.
    function seedFromProgression() {
        const p = window.game?.progression;
        if (!p) return false;
        if (!data.seeded) {
            data.legacy = {
                played: p.gamesPlayed || 0, won: p.gamesWon || 0,
                pointsFor: p.totalPointsScored || 0, pointsAgainst: p.totalPointsConceded || 0,
            };
            data.bestStreak = Math.max(data.bestStreak, p.winStreak || 0);
            data.seeded = true;
            save();
        }
        return true;
    }

    function recordMatch(info) {
        if (!data) load();
        const m = data.modes[info.mode];
        if (!m) return;
        m.played += 1;
        if (info.won) m.won += 1;
        m.pointsFor += Math.max(0, info.pointsFor || 0);
        m.pointsAgainst += Math.max(0, info.pointsAgainst || 0);
        m.bestRally = Math.max(m.bestRally, info.rally || 0);
        const streak = window.game?.progression?.winStreak || 0;
        data.bestStreak = Math.max(data.bestStreak, streak);
        save();
    }

    function tick() {
        const g = window.game;
        if (!g || !data) return;
        const playing = g.running && !g.paused && !g.userPaused && !g.introActive && !g.matchEnding &&
            document.visibilityState === 'visible' && g.isInMatch?.();
        const m = playing && data.modes[g.gameMode];
        if (!m) return;
        m.seconds += 1;
        dirty = true;
    }

    function getName() { if (!data) load(); return data.name; }
    function setName(name) {
        if (!data) load();
        data.name = String(name || '').trim().slice(0, 16);
        save();
        window.dispatchEvent(new CustomEvent('pp-profile-changed'));
    }

    function getStats() {
        if (!data) load();
        const p = window.game?.progression;
        const sum = (k) => MODES.reduce((a, [id]) => a + data.modes[id][k], 0);
        const played = data.legacy.played + sum('played');
        const won = data.legacy.won + sum('won');
        let zombieBest = 0;
        try { zombieBest = Number(localStorage.getItem('pp-zombie-best-v1')) || 0; } catch (_) { /* ignore */ }
        const ach = p?.achievements ? Object.values(p.achievements) : [];
        return {
            name: data.name,
            since: data.since,
            level: p?.level || 1,
            xp: p?.xp || 0,
            requiredXP: p?.requiredXP || 100,
            played, won, lost: Math.max(0, played - won),
            winRate: played ? Math.round((won / played) * 100) : 0,
            pointsFor: data.legacy.pointsFor + sum('pointsFor'),
            pointsAgainst: data.legacy.pointsAgainst + sum('pointsAgainst'),
            winStreak: p?.winStreak || 0,
            bestStreak: Math.max(data.bestStreak, p?.winStreak || 0),
            bestRally: MODES.reduce((a, [id]) => Math.max(a, data.modes[id].bestRally), 0),
            seconds: sum('seconds'),
            zombieBest,
            zombieWaves: p?.zombieWavesCleared || 0,
            achievements: ach.filter((a) => a.unlocked).length,
            achievementsTotal: ach.length,
            modes: MODES.map(([id, label]) => ({ id, label, ...data.modes[id] })),
        };
    }

    load();
    // Wait for the Game (and its progression) before seeding.
    let tries = 0;
    const seedTimer = setInterval(() => {
        if (seedFromProgression() || ++tries > 50) clearInterval(seedTimer);
    }, 200);
    setInterval(tick, 1000);
    setInterval(() => { if (dirty) save(); }, 15000);
    window.addEventListener('pagehide', () => { if (dirty) save(); });

    window.PPProfile = { MODES, recordMatch, getStats, getName, setName };
})();
