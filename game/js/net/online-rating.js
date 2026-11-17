// Casual rating for Quick match.
//
// An Elo-style number kept in this browser. It is "casual" on purpose: online
// matches are peer to peer and the host runs the game, so a host could claim a
// result that did not happen and no server exists to check. The rating exists
// to pair similar players and to give a sense of progress, not as proof. It is
// never shown as a ranking against other people.
//
// Only Quick match games are rated. A result counts only when it is plausible
// (the winner reached the target score, the loser did not, enough time
// passed). Quitting a match in progress counts as a loss for the quitter.
(function () {
    'use strict';

    const KEY = 'pp-online-rating-v1';
    const START = 1000, FLOOR = 100, CEIL = 3000;
    const PROVISIONAL_GAMES = 10;
    const MIN_SECONDS = 20;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const blank = () => ({ v: 1, rating: START, games: 0, wins: 0, losses: 0, streak: 0, best: START, recent: [] });
    let data = null;

    function load() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* ignore */ }
        data = blank();
        if (raw && typeof raw === 'object') {
            const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
            data.rating = clamp(Math.round(n(raw.rating, START)), FLOOR, CEIL);
            data.games = Math.max(0, Math.round(n(raw.games, 0)));
            data.wins = Math.max(0, Math.round(n(raw.wins, 0)));
            data.losses = Math.max(0, Math.round(n(raw.losses, 0)));
            data.streak = Math.round(n(raw.streak, 0));
            data.best = Math.max(data.rating, Math.round(n(raw.best, START)));
            data.recent = Array.isArray(raw.recent) ? raw.recent.slice(-20).filter((r) => r && Number.isFinite(Number(r.after))) : [];
        }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ } }
    function ensure() { if (!data) load(); return data; }

    function expected(mine, theirs) { return 1 / (1 + Math.pow(10, (theirs - mine) / 400)); }

    // Is this finished match believable? `target` is the score needed to win.
    function plausible(myScore, theirScore, target, seconds) {
        if (![myScore, theirScore, target].every(Number.isFinite)) return false;
        const hi = Math.max(myScore, theirScore), lo = Math.min(myScore, theirScore);
        return hi === target && lo >= 0 && lo < target && seconds >= MIN_SECONDS;
    }

    // Record one rated result. `opp` is the other player's rating as they
    // reported it (untrusted, so clamped). Returns what changed.
    function record(won, opp, opts = {}) {
        const d = ensure();
        const theirs = clamp(Math.round(Number.isFinite(Number(opp)) ? Number(opp) : START), FLOOR, CEIL);
        const k = d.games < PROVISIONAL_GAMES ? 40 : 24;
        const before = d.rating;
        const delta = Math.round(k * ((won ? 1 : 0) - expected(before, theirs)));
        d.rating = clamp(before + delta, FLOOR, CEIL);
        d.games++;
        if (won) { d.wins++; d.streak = d.streak > 0 ? d.streak + 1 : 1; } else { d.losses++; d.streak = d.streak < 0 ? d.streak - 1 : -1; }
        d.best = Math.max(d.best, d.rating);
        d.recent.push({ won: !!won, opp: theirs, before, after: d.rating, forfeit: !!opts.forfeit, at: Date.now() });
        if (d.recent.length > 20) d.recent.shift();
        save();
        return { before, after: d.rating, delta: d.rating - before, provisional: d.games <= PROVISIONAL_GAMES };
    }

    // How far apart two players may be to be paired, widening while waiting.
    function band(waitedMs) {
        const s = Math.max(0, waitedMs) / 1000;
        return s < 10 ? 200 : s < 20 ? 400 : s < 40 ? 800 : Infinity;
    }

    function get() { const d = ensure(); return { rating: d.rating, games: d.games, wins: d.wins, losses: d.losses, streak: d.streak, best: d.best, provisional: d.games < PROVISIONAL_GAMES }; }
    function reset() { data = blank(); save(); }

    window.PPRating = { get, record, plausible, expected, band, reset, START, MIN_SECONDS };
})();
