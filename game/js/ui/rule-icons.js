/**
 * Small painted badges for rule cards and reward pickers (Zombie and Obstacle
 * briefings, the wave reward choice). Each is a 48x48 SVG tile in the same
 * neon look as the mode scenes: a tinted glass tile with a lit illustration.
 * Elements with data-rule-icon="<id>" are filled once on load.
 */
(function () {
    let uid = 0;

    const TINTS = {
        zombie: ['#1f5a34', '#08170d', 'rgba(150,255,170,0.35)'],
        obstacle: ['#5a3410', '#160b03', 'rgba(255,200,120,0.35)'],
        reward: ['#2a2350', '#0b0a1c', 'rgba(190,170,255,0.35)'],
    };

    function tile(p, tint) {
        const [a, b, edge] = TINTS[tint];
        return `<radialGradient id="${p}t" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`
            + `</defs><rect x="1" y="1" width="46" height="46" rx="11" fill="url(#${p}t)" stroke="${edge}"/>`
            + `<path d="M6 8q18-6 36 0" stroke="rgba(255,255,255,0.08)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }

    // Ball with a soft glow, as drawn in the game.
    function ball(p) {
        return `<radialGradient id="${p}b" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset="0.6" stop-color="#fff2c4"/><stop offset="1" stop-color="#ffb84d"/></radialGradient>`
            + `<radialGradient id="${p}bg"><stop offset="0" stop-color="rgba(255,220,140,0.7)"/><stop offset="1" stop-color="rgba(255,220,140,0)"/></radialGradient>`;
    }
    function ballUse(p, x, y, r) {
        return `<circle cx="${x}" cy="${y}" r="${r * 2.1}" fill="url(#${p}bg)"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${p}b)"/>`;
    }

    function zombieHead(cx, cy, s, skin, dark, boss) {
        const k = (v) => (v * s).toFixed(2);
        const X = (v) => (cx + v * s).toFixed(2), Y = (v) => (cy + v * s).toFixed(2);
        return `<path d="M${X(-10)} ${Y(2)}C${X(-11)} ${Y(-9)} ${X(-5)} ${Y(-13)} ${X(1)} ${Y(-12.5)}C${X(8)} ${Y(-12)} ${X(11)} ${Y(-6)} ${X(10)} ${Y(3)}C${X(9.5)} ${Y(9)} ${X(6)} ${Y(12)} ${X(0)} ${Y(12)}C${X(-6)} ${Y(12)} ${X(-9.5)} ${Y(8)} ${X(-10)} ${Y(2)}Z" fill="${skin}" stroke="${dark}" stroke-width="${k(1.2)}"/>`
            // Shading on the jaw side.
            + `<path d="M${X(4)} ${Y(-11)}C${X(10)} ${Y(-7)} ${X(11)} ${Y(4)} ${X(5)} ${Y(11)}C${X(9)} ${Y(4)} ${X(8)} ${Y(-5)} ${X(4)} ${Y(-11)}Z" fill="rgba(0,0,0,0.22)"/>`
            // Eyes: one glowing, one stitched shut (boss: both glow red).
            + `<circle cx="${X(-4)}" cy="${Y(-2)}" r="${k(2.6)}" fill="${boss ? '#ff3b30' : '#f4ffd8'}"/>`
            + `<circle cx="${X(-4)}" cy="${Y(-2)}" r="${k(1.1)}" fill="${boss ? '#ffe3a0' : '#c3141e'}"/>`
            + (boss
                ? `<circle cx="${X(4.5)}" cy="${Y(-2)}" r="${k(2.6)}" fill="#ff3b30"/><circle cx="${X(4.5)}" cy="${Y(-2)}" r="${k(1.1)}" fill="#ffe3a0"/>`
                : `<path d="M${X(2.5)} ${Y(-4)}l${k(4)} ${k(4)}M${X(6.5)} ${Y(-4)}l${k(-4)} ${k(4)}" stroke="${dark}" stroke-width="${k(1.3)}" stroke-linecap="round"/>`)
            // Jagged mouth and a forehead stitch.
            + `<path d="M${X(-5)} ${Y(6)}l${k(2)} ${k(-1.6)} ${k(2)} ${k(1.6)} ${k(2)} ${k(-1.6)} ${k(2)} ${k(1.6)} ${k(2)} ${k(-1.6)}" fill="none" stroke="${dark}" stroke-width="${k(1.3)}" stroke-linejoin="round"/>`
            + `<path d="M${X(-3)} ${Y(-9)}h${k(6)}M${X(-1.5)} ${Y(-10.5)}v${k(3)}M${X(1.5)} ${Y(-10.5)}v${k(3)}" stroke="${dark}" stroke-width="${k(0.9)}" stroke-linecap="round"/>`;
    }

    function heartDefs(p, c1, c2) {
        return `<linearGradient id="${p}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    }
    function heart(p, cx, cy, s) {
        const X = (v) => (cx + v * s).toFixed(2), Y = (v) => (cy + v * s).toFixed(2);
        return `<path d="M${X(0)} ${Y(10)}C${X(-14)} ${Y(1)} ${X(-12)} ${Y(-10)} ${X(-5.5)} ${Y(-10)}C${X(-2.5)} ${Y(-10)} ${X(-0.8)} ${Y(-8)} ${X(0)} ${Y(-6)}C${X(0.8)} ${Y(-8)} ${X(2.5)} ${Y(-10)} ${X(5.5)} ${Y(-10)}C${X(12)} ${Y(-10)} ${X(14)} ${Y(1)} ${X(0)} ${Y(10)}Z" fill="url(#${p}h)" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/>`
            + `<ellipse cx="${X(-5)}" cy="${Y(-5)}" rx="${(2.6 * s).toFixed(2)}" ry="${(1.6 * s).toFixed(2)}" transform="rotate(-35 ${X(-5)} ${Y(-5)})" fill="rgba(255,255,255,0.55)"/>`;
    }

    function paddle(cx, cy, s, rot) {
        return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">`
            + `<path d="M-1.6 5h3.2l.6 9h-4.4z" fill="#5a2e17"/><path d="M-.3 6h.6v7h-.6z" fill="rgba(255,200,150,0.4)"/>`
            + `<ellipse cx="0" cy="-2" rx="7.5" ry="8.2" fill="#7c0717"/><ellipse cx="0" cy="-2.3" rx="6.6" ry="7.3" fill="#e0213c"/>`
            + `<ellipse cx="-2.4" cy="-5" rx="1.8" ry="2.8" transform="rotate(-25 -2.4 -5)" fill="rgba(255,255,255,0.3)"/></g>`;
    }

    const ICONS = {
        // ── Zombie rules ────────────────────────────────────────────────
        'zombie-wave': (p) => `<defs>${ball(p)}${tile(p, 'zombie')}`
            + zombieHead(20, 28, 1, '#8fcf6e', '#1c3a17')
            + `<path d="M44 4 34 14" stroke="rgba(255,230,160,0.45)" stroke-width="5" stroke-linecap="round"/>`
            + `<path d="M28 18l-3-3M31 22l2 3M27 21l-4 0" stroke="#fff2b0" stroke-width="1.4" stroke-linecap="round"/>`
            + ballUse(p, 34, 14, 4.5),
        'zombie-lives': (p) => `<defs>${heartDefs(p, '#ff7a96', '#b5102f')}${tile(p, 'zombie')}`
            + heart(p, 22, 24, 1.15)
            + `<rect x="29" y="29" width="15" height="13" rx="4" fill="#0b1a10" stroke="#9fffab" stroke-width="1"/>`
            + `<text x="36.5" y="39.3" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="700" font-size="10" fill="#9fffab">5</text>`,
        'zombie-pull': (p) => `<defs><linearGradient id="${p}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4a26"/><stop offset="1" stop-color="#4a2a14"/></linearGradient>${tile(p, 'zombie')}`
            + `<path d="M8 9h4v31H8zM13 12h4v26h-4z" fill="url(#${p}w)" stroke="#2a1608" stroke-width="0.8"/>`
            + `<path d="M6 17h13M6 31h13" stroke="#3a2010" stroke-width="2"/>`
            + `<path d="M19.5 7v34" stroke="#52ffa0" stroke-width="1.6" stroke-dasharray="3 2.5"/>`
            + `<path d="M24 16q-4 8 0 16M28 13q-6 11 0 22M32 10q-8 14 0 28" fill="none" stroke="#5ff0ff" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`
            + zombieHead(37, 24, 0.62, '#8fcf6e', '#1c3a17'),
        'zombie-reward': (p) => `<defs><radialGradient id="${p}o" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff6d0"/><stop offset="0.45" stop-color="#ffcc4d"/><stop offset="1" stop-color="#b8560f"/></radialGradient><radialGradient id="${p}og"><stop offset="0" stop-color="rgba(255,200,80,0.65)"/><stop offset="1" stop-color="rgba(255,200,80,0)"/></radialGradient>${tile(p, 'zombie')}`
            + `<circle cx="24" cy="25" r="18" fill="url(#${p}og)"/><circle cx="24" cy="25" r="10" fill="url(#${p}o)" stroke="#fff0b0" stroke-width="0.8"/>`
            + `<path d="M24 19.5l1.6 3.6 3.9.4-2.9 2.6.8 3.8-3.4-2-3.4 2 .8-3.8-2.9-2.6 3.9-.4z" fill="#fff"/>`
            + `<path d="M10 11l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1zM38 8l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM39 36l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#fff2b0"/>`,
        'zombie-boss': (p) => `<defs><linearGradient id="${p}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#c98a12"/></linearGradient>${tile(p, 'zombie')}`
            + zombieHead(24, 29, 1.05, '#6aa452', '#13280f', true)
            + `<path d="M13 15 15 5l5 5 4-7 4 7 5-5 2 10z" fill="url(#${p}c)" stroke="#7a4c06" stroke-width="0.9" stroke-linejoin="round"/>`
            + `<circle cx="24" cy="11" r="1.6" fill="#ff3b5c"/><circle cx="17.5" cy="12" r="1.1" fill="#5ff0ff"/><circle cx="30.5" cy="12" r="1.1" fill="#5ff0ff"/>`,

        // ── Obstacle rules ──────────────────────────────────────────────
        'obstacle-score': (p) => `<defs>${ball(p)}${tile(p, 'obstacle')}`
            + `<path d="M40 7v34" stroke="#ff5c7a" stroke-width="2" stroke-dasharray="3 2.5"/>`
            + `<path d="M38 7h4M38 41h4" stroke="#ff5c7a" stroke-width="2"/>`
            + `<path d="M15 30Q24 18 33 21" fill="none" stroke="rgba(255,230,160,0.5)" stroke-width="3" stroke-linecap="round"/>`
            + paddle(13, 31, 1, -35) + ballUse(p, 34, 21, 4),
        'obstacle-checkpoints': (p) => `<defs>${tile(p, 'obstacle')}`
            + `<path d="M11 36Q16 22 24 26T38 13" fill="none" stroke="rgba(255,220,160,0.55)" stroke-width="1.4" stroke-dasharray="2 2.4"/>`
            + `<circle cx="11" cy="36" r="5.5" fill="#123a22" stroke="#52ff9a" stroke-width="1.6"/><path d="M8.6 36l1.7 1.8 3.2-3.6" fill="none" stroke="#52ff9a" stroke-width="1.6" stroke-linecap="round"/>`
            + `<circle cx="24" cy="26" r="5.5" fill="#123a22" stroke="#52ff9a" stroke-width="1.6"/><path d="M21.6 26l1.7 1.8 3.2-3.6" fill="none" stroke="#52ff9a" stroke-width="1.6" stroke-linecap="round"/>`
            + `<circle cx="38" cy="13" r="8.5" fill="rgba(255,200,90,0.18)"/><circle cx="38" cy="13" r="5.5" fill="#3a2508" stroke="#ffc46b" stroke-width="1.8"/>`
            + `<text x="38" y="16.4" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="700" font-size="9" fill="#ffe2a8">3</text>`,
        'obstacle-coins': (p) => `<defs><linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff3ff"/><stop offset="1" stop-color="#1580a8"/></linearGradient><radialGradient id="${p}g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.55" stop-color="#ffc533"/><stop offset="1" stop-color="#b9750a"/></radialGradient>${tile(p, 'obstacle')}`
            + `<path d="M29 8l11 4.5v8.5c0 7.5-4.6 11.6-11 14.5-6.4-2.9-11-7-11-14.5v-8.5z" fill="url(#${p}s)" stroke="#d8fbff" stroke-width="1"/>`
            + `<path d="M29 11.5v20.5c4.4-2.4 7.6-5.6 7.6-11v-6.3z" fill="rgba(255,255,255,0.18)"/>`
            + `<circle cx="17" cy="31" r="9.5" fill="url(#${p}g)" stroke="#7a4a04" stroke-width="1"/><circle cx="17" cy="31" r="6.3" fill="none" stroke="#a8670a" stroke-width="1.2"/>`
            + `<path d="M17 27.2l1.1 2.4 2.6.3-2 1.8.6 2.6-2.3-1.4-2.3 1.4.6-2.6-2-1.8 2.6-.3z" fill="#8a5606"/>`
            + `<ellipse cx="13.5" cy="26.5" rx="2.6" ry="1.4" transform="rotate(-35 13.5 26.5)" fill="rgba(255,255,255,0.6)"/>`,
        'obstacle-boost': (p) => `<defs>${ball(p)}${tile(p, 'obstacle')}`
            + `<path d="M6 38l8-11h28l-8 11z" fill="#0c2a36" stroke="#5ff0ff" stroke-width="1.4" stroke-linejoin="round"/>`
            + `<path d="M15 35.5l3.5-6M21 35.5l3.5-6M27 35.5l3.5-6" stroke="#ff9c3a" stroke-width="2.2" stroke-linecap="round"/>`
            + `<path d="M12 23q10-14 22-15" fill="none" stroke="rgba(255,230,160,0.5)" stroke-width="3" stroke-linecap="round"/>`
            + ballUse(p, 35, 9, 4),
        'obstacle-dice': (p) => `<defs>${tile(p, 'obstacle')}`
            + `<path d="M8 19l11-5 11 5-11 5z" fill="#fffaf0"/><path d="M8 19v12l11 6V24z" fill="#e6dccb"/><path d="M30 19v12l-11 6V24z" fill="#cfc2ad"/>`
            + `<circle cx="19" cy="19" r="1.4" fill="#c3141e"/>`
            + `<circle cx="11.5" cy="24.5" r="1.2" fill="#1b1b2a"/><circle cx="15.5" cy="31.5" r="1.2" fill="#1b1b2a"/>`
            + `<circle cx="22.5" cy="26.5" r="1.1" fill="#1b1b2a"/><circle cx="26.5" cy="24.5" r="1.1" fill="#1b1b2a"/><circle cx="22.5" cy="32" r="1.1" fill="#1b1b2a"/><circle cx="26.5" cy="30" r="1.1" fill="#1b1b2a"/>`
            + `<g transform="translate(33 11) rotate(20)"><rect x="-6" y="-6" width="12" height="12" rx="2.6" fill="#ffc46b" stroke="#7a4a04" stroke-width="0.8"/>`
            + `<circle cx="-2.6" cy="-2.6" r="1.1" fill="#3a1f02"/><circle cx="2.6" cy="2.6" r="1.1" fill="#3a1f02"/><circle cx="2.6" cy="-2.6" r="1.1" fill="#3a1f02"/><circle cx="-2.6" cy="2.6" r="1.1" fill="#3a1f02"/></g>`
            + `<path d="M38 26l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#fff2b0"/>`,

        // ── Wave rewards ────────────────────────────────────────────────
        'reward-rage': (p) => `<defs><linearGradient id="${p}f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d1f"/><stop offset="0.55" stop-color="#ff9a1f"/><stop offset="1" stop-color="#ffe066"/></linearGradient>${ball(p)}${tile(p, 'reward')}`
            + `<path d="M24 43c-9 0-14-6-13-14 1-6 5-8 5-14 4 3 5 7 5 10 2-5 6-9 6-17 6 5 10 12 9 21 0 2 2-1 2-4 3 4 4 7 3 11-1 4-7 7-17 7z" fill="url(#${p}f)"/>`
            + `<path d="M24 41c-5 0-8-3-7-8 .6-3 2.6-4 3-7 2 2 3 4 3 6 1.4-2.6 3.6-4.6 4-8 3 3 5 7 4 11-.6 4-3 6-7 6z" fill="#ffe680" opacity="0.8"/>`
            + ballUse(p, 24, 33, 4.5),
        'reward-shield': (p) => `<defs><linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8af6ff"/><stop offset="1" stop-color="#1b6fb0"/></linearGradient><radialGradient id="${p}g"><stop offset="0" stop-color="rgba(95,240,255,0.5)"/><stop offset="1" stop-color="rgba(95,240,255,0)"/></radialGradient>${tile(p, 'reward')}`
            + `<circle cx="24" cy="24" r="19" fill="url(#${p}g)"/>`
            + `<path d="M24 7l13 5v10c0 9-5.6 14-13 17-7.4-3-13-8-13-17V12z" fill="url(#${p}s)" stroke="#e0fdff" stroke-width="1.2"/>`
            + `<path d="M24 10.5v25c5.4-2.8 9.6-6.8 9.6-13.5v-7.6z" fill="rgba(255,255,255,0.18)"/>`
            + `<path d="M18 23l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
        'reward-slow': (p) => `<defs><linearGradient id="${p}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(160,220,255,0.35)"/><stop offset="1" stop-color="rgba(160,220,255,0.12)"/></linearGradient>${tile(p, 'reward')}`
            + `<path d="M14 7h20M14 41h20" stroke="#c9a46a" stroke-width="3" stroke-linecap="round"/>`
            + `<path d="M16 8c0 9 6 11 6 16s-6 7-6 16h16c0-9-6-11-6-16s6-7 6-16z" fill="url(#${p}g)" stroke="#bfe6ff" stroke-width="1.2"/>`
            + `<path d="M19 13h10c-1 3-3 5-5 6-2-1-4-3-5-6zM18.5 39c.5-4 3-6 5.5-7 2.5 1 5 3 5.5 7z" fill="#7fd8ff"/>`
            + `<path d="M24 20v10" stroke="#7fd8ff" stroke-width="1" stroke-dasharray="1 1.6"/>`
            + `<path d="M38 13v8M34.5 15l7 4M41.5 15l-7 4" stroke="#e0f6ff" stroke-width="1.2" stroke-linecap="round"/>`,
        'reward-repair': (p) => `<defs>${heartDefs(p, '#ff7a96', '#b5102f')}${tile(p, 'reward')}`
            + heart(p, 24, 25, 1.25)
            + `<g transform="rotate(-30 24 25)"><rect x="14" y="21.5" width="20" height="7" rx="3.5" fill="#f6e6cc" stroke="#b89a70" stroke-width="0.7"/>`
            + `<rect x="21" y="21.5" width="6" height="7" fill="#e6d0ac"/><circle cx="22.5" cy="23.6" r=".5" fill="#a88a60"/><circle cx="25.5" cy="23.6" r=".5" fill="#a88a60"/><circle cx="22.5" cy="26.4" r=".5" fill="#a88a60"/><circle cx="25.5" cy="26.4" r=".5" fill="#a88a60"/></g>`,
    };

    function svg(id) {
        const make = ICONS[id];
        if (!make) return '';
        const p = `ri${++uid}`;
        return `<svg class="pp-rule-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${make(p)}</svg>`;
    }

    function fill(root) {
        (root || document).querySelectorAll('[data-rule-icon]').forEach((el) => {
            if (el.dataset.ruleIconDone) return;
            const markup = svg(el.dataset.ruleIcon);
            if (!markup) return;
            el.innerHTML = markup;
            el.dataset.ruleIconDone = '1';
        });
    }

    window.PPRuleIcons = { svg, fill };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill());
    else fill();
})();
