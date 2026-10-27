/**
 * Generated key art for menu cards and opponent-selection panels only.
 * The original SVG scenes remain beneath the WebP art as offline/load fallbacks.
 * CSS backgrounds are decorative and never enter the gameplay renderer.
 * window.ModeArt.url(id) returns a ready-to-use url("data:...") value.
 */
(function () {
    const VB = 'viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice"';

    // Seeded scatter for stars and windows, so every load looks the same.
    function rng(seed) {
        let s = seed >>> 0;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }
    function stars(seed, n, maxY, color) {
        const r = rng(seed);
        let out = '';
        for (let i = 0; i < n; i++) {
            const big = r() < 0.12;
            out += `<circle cx="${(r() * 200).toFixed(1)}" cy="${(r() * maxY).toFixed(1)}" r="${big ? 0.9 : 0.45}" fill="${color}" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
        }
        return out;
    }

    const scenes = {
        // A lit arena: spotlights over a table seen from the stands.
        classic: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0614"/><stop offset="1" stop-color="#05030a"/></linearGradient>
                <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc2d2" stop-opacity=".5"/><stop offset=".7" stop-color="#ff3a5c" stop-opacity=".08"/><stop offset="1" stop-color="#ff3a5c" stop-opacity="0"/></linearGradient>
                <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0f24"/><stop offset="1" stop-color="#1c0613"/></linearGradient>
                <radialGradient id="ballg"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe0e8" stop-opacity=".8"/><stop offset="1" stop-color="#ff3a5c" stop-opacity="0"/></radialGradient>
                <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3a5c" stop-opacity="0"/><stop offset="1" stop-color="#ffd6e0" stop-opacity=".9"/></linearGradient>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            ${[18, 62, 138, 182].map(x => `<circle cx="${x}" cy="8" r="2.6" fill="#ffe6ee"/><circle cx="${x}" cy="8" r="6" fill="#ff8aa4" opacity=".25"/>`).join('')}
            <path d="M16 8 L20 8 L96 140 L40 140Z" fill="url(#beam)"/>
            <path d="M180 8 L184 8 L160 140 L104 140Z" fill="url(#beam)"/>
            <g fill="#12040c">${Array.from({ length: 22 }, (_, i) => `<circle cx="${i * 9.5 + 2}" cy="${70 + (i % 3) * 2}" r="5"/><rect x="${i * 9.5 - 3}" y="${72 + (i % 3) * 2}" width="10" height="14" rx="3"/>`).join('')}</g>
            <path d="M44 92 L156 92 L190 132 L10 132Z" fill="url(#table)" stroke="#ff3a5c" stroke-width="1.6"/>
            <line x1="100" y1="92" x2="100" y2="132" stroke="#ffd6e0" stroke-width="1.1" stroke-dasharray="3 3" opacity=".8"/>
            <path d="M27 112 L173 112" stroke="#ff3a5c" stroke-width=".7" opacity=".55"/>
            <rect x="96" y="86" width="8" height="12" fill="#ff3a5c" opacity=".25"/>
            <rect x="22" y="96" width="5" height="22" rx="2" fill="#ffd6e0"/><rect x="21" y="95" width="7" height="24" rx="3" fill="none" stroke="#ff3a5c" stroke-width="1.4"/>
            <rect x="172" y="100" width="5" height="22" rx="2" fill="#ffd6e0"/><rect x="171" y="99" width="7" height="24" rx="3" fill="none" stroke="#ff3a5c" stroke-width="1.4"/>
            <path d="M40 104 Q90 70 132 96" fill="none" stroke="url(#trail)" stroke-width="3" stroke-linecap="round"/>
            <circle cx="133" cy="97" r="9" fill="url(#ballg)"/><circle cx="133" cy="97" r="3" fill="#fff"/>`,

        // Graveyard under a green moon, a hand breaking out of the soil.
        zombie: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03110a"/><stop offset=".7" stop-color="#0b2414"/><stop offset="1" stop-color="#050b06"/></linearGradient>
                <radialGradient id="moon" cx=".45" cy=".4"><stop offset="0" stop-color="#f4ffd8"/><stop offset=".7" stop-color="#c9f0a0"/><stop offset="1" stop-color="#8fd06a"/></radialGradient>
                <radialGradient id="halo"><stop offset="0" stop-color="#9dff7a" stop-opacity=".35"/><stop offset="1" stop-color="#6ddc4f" stop-opacity="0"/></radialGradient>
                <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ddc4f" stop-opacity="0"/><stop offset=".6" stop-color="#6ddc4f" stop-opacity=".22"/><stop offset="1" stop-color="#6ddc4f" stop-opacity="0"/></linearGradient>
                <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c3a30"/><stop offset="1" stop-color="#121a14"/></linearGradient>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            ${stars(17, 40, 70, '#d8ffd0')}
            <circle cx="132" cy="38" r="42" fill="url(#halo)"/>
            <circle cx="132" cy="38" r="21" fill="url(#moon)"/>
            <circle cx="125" cy="33" r="3.5" fill="#a9d888" opacity=".6"/><circle cx="139" cy="44" r="5" fill="#a9d888" opacity=".5"/><circle cx="136" cy="28" r="2" fill="#a9d888" opacity=".6"/>
            <path d="M80 34 Q100 28 120 36 Q104 38 92 40Z" fill="#0b1c10" opacity=".9"/>
            <path d="M150 52 Q170 46 196 54 Q172 57 160 58Z" fill="#0b1c10" opacity=".8"/>
            <g fill="#040a05">
                <path d="M30 140 L33 70 Q34 60 30 50 L36 58 L38 44 L41 60 Q46 52 52 50 L43 66 L42 140Z"/>
                <path d="M33 70 Q20 62 12 64 L14 60 Q24 58 34 64Z"/>
                <path d="M42 84 Q56 74 66 76 L64 80 Q54 80 43 90Z"/>
            </g>
            <path d="M0 112 Q50 100 100 108 Q150 116 200 104 L200 140 L0 140Z" fill="#081409"/>
            <g>
                <path d="M62 112 L62 92 Q62 82 72 82 Q82 82 82 92 L82 112Z" fill="url(#stone)" stroke="#6ddc4f" stroke-opacity=".35" stroke-width=".8"/>
                <path d="M70 89 h4 v-4 h3 v4 h4 v3 h-4 v8 h-3 v-8 h-4Z" fill="#0a120c" opacity=".7" transform="translate(-2 0)"/>
                <path d="M146 116 L146 96 Q146 88 155 88 Q164 88 164 96 L164 116Z" fill="url(#stone)" stroke="#6ddc4f" stroke-opacity=".3" stroke-width=".8" transform="rotate(6 155 110)"/>
                <path d="M176 118 L176 104 Q176 98 183 98 Q190 98 190 104 L190 118Z" fill="url(#stone)" opacity=".85"/>
            </g>
            <g fill="#0a1a0c" stroke="#6ddc4f" stroke-opacity=".5" stroke-width=".7">
                <path d="M104 122 L106 96 Q104 90 100 86 Q98 82 101 82 L105 88 L104 78 Q104 75 106 76 L108 86 L109 74 Q110 71 112 73 L112 86 L114 76 Q116 74 117 77 L116 90 L119 84 Q121 83 121 86 L118 96 L116 122Z"/>
            </g>
            <path d="M96 124 Q110 116 126 124Z" fill="#0d1f0f"/>
            <rect x="0" y="100" width="200" height="32" fill="url(#fog)"/>
            <circle cx="22" cy="118" r="1.4" fill="#b6ff7a"/><circle cx="28" cy="118" r="1.4" fill="#b6ff7a"/>
            <circle cx="186" cy="126" r="1.2" fill="#b6ff7a" opacity=".8"/><circle cx="191" cy="126" r="1.2" fill="#b6ff7a" opacity=".8"/>`,

        // The ball warps into a black hole and out of a smaller one up the court.
        gravity: () => `
            <defs>
                <radialGradient id="bg" cx=".6" cy=".45" r=".9"><stop offset="0" stop-color="#0b1a3a"/><stop offset=".6" stop-color="#050a1c"/><stop offset="1" stop-color="#02040c"/></radialGradient>
                <radialGradient id="neb" cx=".5" cy=".5"><stop offset="0" stop-color="#7a3dff" stop-opacity=".35"/><stop offset="1" stop-color="#3d9eff" stop-opacity="0"/></radialGradient>
                <linearGradient id="disc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d9eff" stop-opacity="0"/><stop offset=".25" stop-color="#7cc8ff"/><stop offset=".5" stop-color="#fff2c8"/><stop offset=".75" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></linearGradient>
                <radialGradient id="lens"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#9fd4ff" stop-opacity=".55"/><stop offset=".75" stop-color="#3d9eff" stop-opacity=".15"/><stop offset="1" stop-color="#3d9eff" stop-opacity="0"/></radialGradient>
                <radialGradient id="ballg"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#bfe4ff" stop-opacity=".7"/><stop offset="1" stop-color="#3d9eff" stop-opacity="0"/></radialGradient>
                <radialGradient id="planet" cx=".35" cy=".35"><stop offset="0" stop-color="#7fd0ff"/><stop offset="1" stop-color="#123a7a"/></radialGradient>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            <ellipse cx="50" cy="40" rx="70" ry="34" fill="url(#neb)"/>
            ${stars(5, 70, 140, '#e2f0ff')}
            <circle cx="122" cy="70" r="46" fill="url(#lens)"/>
            <ellipse cx="122" cy="70" rx="50" ry="10" fill="none" stroke="url(#disc)" stroke-width="5" transform="rotate(-14 122 70)" opacity=".55"/>
            <path d="M84 72 A38 22 -14 0 1 160 56" fill="none" stroke="url(#disc)" stroke-width="3" transform="rotate(-6 122 70)" opacity=".8"/>
            <circle cx="122" cy="70" r="15" fill="#000"/>
            <circle cx="122" cy="70" r="15.5" fill="none" stroke="#cfe9ff" stroke-width="1" opacity=".8"/>
            <path d="M72 70 A50 10 -14 0 0 172 64" fill="none" stroke="url(#disc)" stroke-width="4.5" transform="rotate(-14 122 70)"/>
            <path d="M6 126 Q60 124 92 92 Q100 84 108 78" fill="none" stroke="#9fd4ff" stroke-width="1.4" stroke-dasharray="2 4" opacity=".85"/>
            <circle cx="40" cy="34" r="13" fill="url(#lens)"/>
            <ellipse cx="40" cy="34" rx="13" ry="3" fill="none" stroke="url(#disc)" stroke-width="2" transform="rotate(10 40 34)"/>
            <circle cx="40" cy="34" r="5" fill="#000" stroke="#cfe9ff" stroke-width=".6"/>
            <path d="M48 30 Q70 18 92 22" fill="none" stroke="#9fd4ff" stroke-width="1.4" stroke-dasharray="2 4" opacity=".85"/>
            <g fill="none" stroke="#9fd4ff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
                <path d="M54 22 l3 3 -3 3"/><path d="M60 19 l3 3 -3 3"/>
            </g>
            <circle cx="94" cy="22" r="8" fill="url(#ballg)"/><circle cx="94" cy="22" r="2.8" fill="#fff"/>
            <circle cx="176" cy="118" r="9" fill="url(#planet)"/>
            <ellipse cx="176" cy="118" rx="15" ry="3.5" fill="none" stroke="#9fd4ff" stroke-width=".8" opacity=".7" transform="rotate(-12 176 118)"/>`,

        // The new Speed scene in miniature: sun, mountains, road, palms.
        speed: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05030f"/><stop offset=".45" stop-color="#1c0838"/><stop offset=".62" stop-color="#7a1c5a"/><stop offset=".64" stop-color="#2a0838"/><stop offset="1" stop-color="#05010d"/></linearGradient>
                <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe98a"/><stop offset=".45" stop-color="#ffa94a"/><stop offset=".8" stop-color="#ff5d6c"/><stop offset="1" stop-color="#e0287f"/></linearGradient>
                <radialGradient id="halo"><stop offset="0" stop-color="#ff5aa0" stop-opacity=".4"/><stop offset="1" stop-color="#ff5aa0" stop-opacity="0"/></radialGradient>
                <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0c40"/><stop offset="1" stop-color="#0a0418"/></linearGradient>
                <clipPath id="sky"><rect width="200" height="88"/></clipPath>
                <clipPath id="disc"><circle cx="100" cy="76" r="30"/></clipPath>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            ${stars(9, 36, 60, '#fff')}
            <circle cx="100" cy="74" r="44" fill="url(#halo)"/>
            <g clip-path="url(#sky)">
                <circle cx="100" cy="76" r="30" fill="url(#sun)"/>
                <g clip-path="url(#disc)">${[62, 68, 73.5, 78.5, 83].map((y, i) => `<rect x="60" y="${y}" width="80" height="${1 + i * 0.7}" fill="#5e1356"/>`).join('')}</g>
            </g>
            <path d="M0 88 L0 70 L14 62 L26 70 L40 56 L56 72 L70 66 L84 82 L96 88Z" fill="#2c0d4c" stroke="#ff6fc8" stroke-width=".9"/>
            <path d="M104 88 L118 76 L130 80 L146 60 L162 72 L176 58 L190 66 L200 62 L200 88Z" fill="#2c0d4c" stroke="#ff6fc8" stroke-width=".9"/>
            <path d="M0 88 L0 80 L18 74 L34 82 L50 76 L70 88Z M130 88 L150 78 L168 84 L184 74 L200 80 L200 88Z" fill="#120428" stroke="#46e0ff" stroke-width=".8"/>
            <rect x="0" y="87.5" width="200" height="1.4" fill="#ffb0d0"/>
            <path d="M97 88 L103 88 L170 140 L30 140Z" fill="url(#road)"/>
            <path d="M97 88 L30 140" stroke="#46e0ff" stroke-width="1.4"/><path d="M103 88 L170 140" stroke="#ff4fb0" stroke-width="1.4"/>
            ${[[91, 1.2], [96, 1.8], [104, 2.8], [117, 4.4], [136, 7]].map(([y, w]) => `<rect x="${100 - w / 2}" y="${y}" width="${w}" height="${(w * 1.3).toFixed(1)}" fill="#ffd68c"/>`).join('')}
            <g stroke="#ff4fb0" stroke-width=".6" opacity=".55">${[94, 102, 114, 132].map(y => `<line x1="0" y1="${y}" x2="200" y2="${y}"/>`).join('')}</g>
            <g fill="#2a0d3e" stroke="#ff7cc4" stroke-width=".7">
                <path d="M22 140 Q20 116 26 98 L28 98 Q24 118 26 140Z"/>
                <path d="M27 98 Q14 92 6 100 Q16 94 27 99 Q20 88 10 88 Q22 86 28 97 Q30 86 40 84 Q32 90 29 97 Q40 92 48 98 Q38 94 29 99Z"/>
                <path d="M176 140 Q178 120 172 106 L174 106 Q180 120 180 140Z"/>
                <path d="M173 106 Q162 100 154 106 Q164 102 173 107 Q168 96 160 96 Q170 94 175 105 Q178 96 188 94 Q180 100 176 105 Q186 100 194 106 Q184 102 175 107Z"/>
            </g>`,

        // A slice of the course: ? block, coins, gates and a boost pad.
        obstacle: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0b04"/><stop offset="1" stop-color="#060302"/></linearGradient>
                <linearGradient id="block" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc04a"/><stop offset="1" stop-color="#e2600e"/></linearGradient>
                <radialGradient id="coin" cx=".4" cy=".35"><stop offset="0" stop-color="#fff2a8"/><stop offset=".6" stop-color="#ffc21a"/><stop offset="1" stop-color="#c77a00"/></radialGradient>
                <linearGradient id="gate" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a2a10"/><stop offset=".5" stop-color="#ff9a4a"/><stop offset="1" stop-color="#5a2a10"/></linearGradient>
                <radialGradient id="glow"><stop offset="0" stop-color="#ff7620" stop-opacity=".45"/><stop offset="1" stop-color="#ff7620" stop-opacity="0"/></radialGradient>
                <radialGradient id="ballg"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#ffe2c4" stop-opacity=".7"/><stop offset="1" stop-color="#ff7620" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            <g stroke="#ff7620" stroke-width=".6" opacity=".28">
                ${[60, 70, 82, 98, 120].map(y => `<line x1="0" y1="${y}" x2="200" y2="${y}"/>`).join('')}
                ${[-120, -70, -30, 0, 30, 70, 120].map(d => `<line x1="${100 + d * 0.25}" y1="52" x2="${100 + d * 1.6}" y2="140"/>`).join('')}
            </g>
            <rect x="0" y="0" width="200" height="54" fill="#0c0502"/>
            ${stars(23, 26, 50, '#ffd9b0')}
            <circle cx="100" cy="30" r="36" fill="url(#glow)"/>
            <g transform="translate(84 14)">
                <rect width="32" height="32" rx="5" fill="url(#block)" stroke="#fff0c8" stroke-width="1.2"/>
                <circle cx="4.5" cy="4.5" r="1.4" fill="#7a3006"/><circle cx="27.5" cy="4.5" r="1.4" fill="#7a3006"/><circle cx="4.5" cy="27.5" r="1.4" fill="#7a3006"/><circle cx="27.5" cy="27.5" r="1.4" fill="#7a3006"/>
                <text x="16" y="24.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="21" fill="#fff6dc" stroke="#7a3006" stroke-width="1">?</text>
            </g>
            <rect x="30" y="62" width="9" height="44" rx="3" fill="url(#gate)" stroke="#ffb070" stroke-width=".8"/>
            <rect x="160" y="70" width="9" height="40" rx="3" fill="url(#gate)" stroke="#ffb070" stroke-width=".8"/>
            ${[[62, 74, 8], [80, 70, 3.5], [126, 72, 8], [144, 78, 6]].map(([x, y, rx]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="8" fill="url(#coin)" stroke="#8a4e00" stroke-width=".8"/>${rx > 5 ? `<rect x="${x - 1}" y="${y - 4.5}" width="2" height="9" rx="1" fill="#fff6c4" opacity=".85"/>` : ''}`).join('')}
            <path d="M66 112 L134 112 L148 132 L52 132Z" fill="#3a1a06" stroke="#ff7620" stroke-width="1"/>
            <g fill="none" stroke="#ffd25a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
                <path d="M82 116 L90 122 L82 128"/><path d="M96 116 L104 122 L96 128"/><path d="M110 116 L118 122 L110 128"/>
            </g>
            <path d="M14 94 Q50 120 80 96 Q104 78 132 100 Q150 114 186 100" fill="none" stroke="#ffd2a8" stroke-width="1.3" stroke-dasharray="2 4" opacity=".8"/>
            <circle cx="186" cy="100" r="8" fill="url(#ballg)"/><circle cx="186" cy="100" r="3" fill="#fff"/>`,

        // A blueprint bench: arena sketch, sliders and a wrench.
        custom: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03231f"/><stop offset="1" stop-color="#020b0c"/></linearGradient>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 L0 0 0 10" fill="none" stroke="#00ffc8" stroke-width=".35" opacity=".28"/></pattern>
                <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9fff6"/><stop offset=".5" stop-color="#7fb8ad"/><stop offset="1" stop-color="#2f5a52"/></linearGradient>
                <radialGradient id="glow"><stop offset="0" stop-color="#00ffc8" stop-opacity=".3"/><stop offset="1" stop-color="#00ffc8" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="200" height="140" fill="url(#bg)"/>
            <rect width="200" height="140" fill="url(#grid)"/>
            <circle cx="96" cy="64" r="60" fill="url(#glow)"/>
            <g fill="none" stroke="#7affdf" stroke-width="1.1">
                <rect x="38" y="30" width="116" height="66" rx="4"/>
                <line x1="96" y1="30" x2="96" y2="96" stroke-dasharray="3 3" opacity=".7"/>
                <circle cx="96" cy="63" r="12" opacity=".7"/>
                <rect x="44" y="52" width="5" height="22" rx="2"/><rect x="143" y="48" width="5" height="22" rx="2"/>
                <rect x="70" y="38" width="14" height="14" stroke-dasharray="2 2"/>
                <path d="M112 76 l10 0 l0 12 l-10 0Z" stroke-dasharray="2 2"/>
                <circle cx="124" cy="44" r="6" stroke-dasharray="2 2"/>
            </g>
            <g stroke="#7affdf" stroke-width=".6" opacity=".8">
                <line x1="38" y1="24" x2="154" y2="24"/><line x1="38" y1="21" x2="38" y2="27"/><line x1="154" y1="21" x2="154" y2="27"/>
                <line x1="160" y1="30" x2="160" y2="96"/><line x1="157" y1="30" x2="163" y2="30"/><line x1="157" y1="96" x2="163" y2="96"/>
            </g>
            <text x="96" y="20" text-anchor="middle" font-family="monospace" font-size="6" fill="#7affdf" opacity=".85">ARENA 16:9</text>
            <g stroke="#00ffc8" stroke-width="2" stroke-linecap="round">
                <line x1="20" y1="110" x2="84" y2="110" opacity=".5"/><line x1="20" y1="122" x2="84" y2="122" opacity=".5"/><line x1="20" y1="134" x2="84" y2="134" opacity=".5"/>
            </g>
            <g fill="#04201b" stroke="#00ffc8" stroke-width="1.8"><circle cx="40" cy="110" r="3.6"/><circle cx="66" cy="122" r="3.6"/><circle cx="50" cy="134" r="3.6"/></g>
            <g transform="rotate(-38 150 118)">
                <rect x="118" y="114" width="52" height="8" rx="4" fill="url(#metal)"/>
                <path d="M170 118 m-2 -9 a11 11 0 1 1 0 18 l0 -5 a5 5 0 0 0 0 -8Z" fill="url(#metal)"/>
                <circle cx="124" cy="118" r="2" fill="#0a2a24"/>
            </g>
            <g transform="translate(182 30) rotate(30)">
                <rect x="-3" y="0" width="6" height="40" fill="#ffd25a"/><path d="M-3 40 L0 48 L3 40Z" fill="#f4e2c0"/><rect x="-3" y="-4" width="6" height="5" fill="#ff7cc4"/>
            </g>`,
    };


    // Wide banners for panel headers (400x120). The detail sits on the right
    // half; the left fades out under the title.
    const BVB = 'viewBox="0 0 400 120" preserveAspectRatio="xMaxYMid slice"';
    function bstars(seed, n, color) {
        const r = rng(seed);
        let out = '';
        for (let i = 0; i < n; i++) out += `<circle cx="${(120 + r() * 280).toFixed(1)}" cy="${(r() * 120).toFixed(1)}" r="${r() < 0.15 ? 1 : 0.5}" fill="${color}" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`;
        return out;
    }
    const banners = {
        // Mixing console: faders, knobs and a glowing level meter.
        settings: () => {
            const faders = [62, 40, 78, 52, 30, 68].map((y, i) => {
                const x = 230 + i * 22;
                return `<rect x="${x - 1.5}" y="22" width="3" height="76" rx="1.5" fill="#06222a"/>
                    <rect x="${x - 1.5}" y="${y}" width="3" height="${98 - y}" rx="1.5" fill="url(#lvl)"/>
                    <rect x="${x - 7}" y="${y - 4}" width="14" height="8" rx="2" fill="url(#cap)" stroke="#7af7ff" stroke-width=".6"/>
                    <line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}" stroke="#0a3a44" stroke-width="1"/>`;
            }).join('');
            const knobs = [0, 1, 2].map((i) => {
                const cx = 372, cy = 26 + i * 34, a = [-40, 50, 130][i] * Math.PI / 180;
                return `<circle cx="${cx}" cy="${cy}" r="12" fill="url(#cap)" stroke="#7af7ff" stroke-width=".8"/>
                    <circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#00ffd6" stroke-width="1.6" stroke-dasharray="${(i + 2) * 9} 100" transform="rotate(130 ${cx} ${cy})" opacity=".85"/>
                    <line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * 8).toFixed(1)}" y2="${(cy + Math.sin(a) * 8).toFixed(1)}" stroke="#eaffff" stroke-width="2" stroke-linecap="round"/>`;
            }).join('');
            const teeth = Array.from({ length: 10 }, (_, i) => `<rect x="-5" y="-40" width="10" height="12" rx="2" transform="rotate(${i * 36})"/>`).join('');
            return `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03141c"/><stop offset="1" stop-color="#061d2a"/></linearGradient>
                <linearGradient id="lvl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#00ffd6"/><stop offset=".7" stop-color="#3aa8ff"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>
                <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c4a58"/><stop offset="1" stop-color="#0c1c24"/></linearGradient>
                <radialGradient id="glow" cx=".75" cy=".5" r=".6"><stop offset="0" stop-color="#00ffd6" stop-opacity=".22"/><stop offset="1" stop-color="#00ffd6" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="400" height="120" fill="url(#bg)"/>
            <rect width="400" height="120" fill="url(#glow)"/>
            <g stroke="#0f3a48" stroke-width=".5">${Array.from({ length: 12 }, (_, i) => `<line x1="${130 + i * 24}" y1="0" x2="${130 + i * 24}" y2="120"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<line x1="130" y1="${i * 24}" x2="400" y2="${i * 24}"/>`).join('')}</g>
            <g transform="translate(176 62)" fill="#0c3340" stroke="#1d6878" stroke-width="1" opacity=".9">${teeth}<circle r="32"/><circle r="12" fill="#03141c"/></g>
            <g transform="translate(176 62) rotate(18)" fill="none" stroke="#00ffd6" stroke-width=".8" opacity=".5"><circle r="22" stroke-dasharray="4 4"/></g>
            <rect x="214" y="12" width="140" height="98" rx="8" fill="#041820" stroke="#1d6878" stroke-width="1"/>
            ${faders}${knobs}
            <g fill="#00ffd6" opacity=".7">${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${230 + i * 22}" cy="16" r="1.4" opacity="${i % 2 ? 1 : 0.45}"/>`).join('')}</g>`;
        },
        // Top-down court diagram: paddles, a dashed rally line and play arrows.
        guide: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#04101e"/><stop offset="1" stop-color="#0a1a34"/></linearGradient>
                <linearGradient id="court" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c3a5c"/><stop offset="1" stop-color="#072640"/></linearGradient>
                <radialGradient id="ball" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ffb84a"/></radialGradient>
            </defs>
            <rect width="400" height="120" fill="url(#bg)"/>
            <g stroke="#1b3e66" stroke-width=".5" opacity=".7">${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 20}" y1="0" x2="${i * 20}" y2="120"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${i * 20 + 10}" x2="400" y2="${i * 20 + 10}"/>`).join('')}</g>
            <g transform="translate(284 60) skewX(-14)">
                <rect x="-86" y="-44" width="172" height="88" rx="4" fill="url(#court)" stroke="#9fe4ff" stroke-width="1.6"/>
                <line x1="0" y1="-44" x2="0" y2="44" stroke="#9fe4ff" stroke-width="1" stroke-dasharray="4 3"/>
                <line x1="-86" y1="0" x2="86" y2="0" stroke="#9fe4ff" stroke-width=".5" opacity=".5"/>
                <rect x="-78" y="-22" width="5" height="26" rx="2.5" fill="#00ffd6"/>
                <rect x="73" y="2" width="5" height="26" rx="2.5" fill="#ff3fa4"/>
                <path d="M-70 -6 Q-30 -40 10 -14 T68 14" fill="none" stroke="#ffe08a" stroke-width="1.4" stroke-dasharray="3 3"/>
                <circle cx="10" cy="-14" r="4.5" fill="url(#ball)"/>
                <g fill="none" stroke="#ffe08a" stroke-width="1.2" opacity=".8"><path d="M50 -30 l10 -4 l-4 10"/><path d="M-60 26 l-8 6 l10 2"/></g>
            </g>
            <g font-family="monospace" font-size="7" fill="#9fe4ff" opacity=".8"><text x="196" y="18">P1</text><text x="352" y="112">P2</text></g>
            <g fill="none" stroke="#6ad8ff" stroke-width="1" opacity=".55">
                <circle cx="164" cy="34" r="9"/><path d="M160 34 h8 M164 30 v8"/>
                <rect x="150" y="70" width="28" height="18" rx="3"/><path d="M156 76 h4 M168 76 h4 M156 82 h16"/>
            </g>`,
        // Trophy on a plinth with rays, stars and laurels.
        trophies: () => `
            <defs>
                <radialGradient id="bg" cx=".78" cy=".55" r=".75"><stop offset="0" stop-color="#3a2408"/><stop offset=".55" stop-color="#140c18"/><stop offset="1" stop-color="#07060e"/></radialGradient>
                <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".45" stop-color="#ffc23a"/><stop offset="1" stop-color="#a8640c"/></linearGradient>
                <linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd25a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd25a" stop-opacity="0"/></linearGradient>
            </defs>
            <rect width="400" height="120" fill="url(#bg)"/>
            <g fill="url(#ray)">${[-60, -36, -12, 12, 36, 60].map((a) => `<path d="M312 84 L${(312 + Math.sin(a * Math.PI / 180) * 160 - 8).toFixed(1)} ${(84 - Math.cos(a * Math.PI / 180) * 160).toFixed(1)} L${(312 + Math.sin(a * Math.PI / 180) * 160 + 8).toFixed(1)} ${(84 - Math.cos(a * Math.PI / 180) * 160).toFixed(1)}Z"/>`).join('')}</g>
            ${bstars(41, 40, '#ffe7a0')}
            <g fill="url(#gold)">
                <path d="M290 26 h44 v10 q0 30 -22 34 q-22 -4 -22 -34Z"/>
                <path d="M290 30 q-14 0 -14 12 q0 12 16 16 l2 -5 q-11 -3 -11 -11 q0 -6 8 -6Z"/>
                <path d="M334 30 q14 0 14 12 q0 12 -16 16 l-2 -5 q11 -3 11 -11 q0 -6 -8 -6Z"/>
                <rect x="307" y="70" width="10" height="10"/>
                <path d="M296 80 h32 l4 10 h-40Z"/>
            </g>
            <rect x="284" y="90" width="56" height="14" rx="2" fill="#2a1a0a" stroke="#a8640c" stroke-width="1"/>
            <path d="M298 32 q2 22 12 30" fill="none" stroke="#fff8d8" stroke-width="2" stroke-linecap="round" opacity=".6"/>
            <path d="M312 40 l3 6 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1Z" fill="#fff6c8" opacity=".9"/>
            <g fill="none" stroke="#ffc23a" stroke-width="2" stroke-linecap="round" opacity=".8">
                <path d="M266 96 q-16 -24 -6 -56"/><path d="M358 96 q16 -24 6 -56"/>
            </g>
            <g fill="#ffc23a" opacity=".8">${[0, 1, 2, 3, 4].map((i) => {
                const t = i / 4, y = 92 - t * 50;
                return `<ellipse cx="${(262 - Math.sin(t * 3) * 6).toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="2.5" transform="rotate(-40 ${(262 - Math.sin(t * 3) * 6).toFixed(1)} ${y.toFixed(1)})"/><ellipse cx="${(362 + Math.sin(t * 3) * 6).toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="2.5" transform="rotate(40 ${(362 + Math.sin(t * 3) * 6).toFixed(1)} ${y.toFixed(1)})"/>`;
            }).join('')}</g>
            <g fill="#ffe08a">${[[220, 30, 4], [236, 82, 3], [384, 20, 3], [200, 60, 2.5]].map(([x, y, r]) => `<path d="M${x} ${y - r * 2} L${x + r * .5} ${y - r * .5} L${x + r * 2} ${y} L${x + r * .5} ${y + r * .5} L${x} ${y + r * 2} L${x - r * .5} ${y + r * .5} L${x - r * 2} ${y} L${x - r * .5} ${y - r * .5}Z"/>`).join('')}</g>`,
        // Wireframe globe with a laptop and a phone linked across it.
        online: () => `
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050a1e"/><stop offset="1" stop-color="#0c0a2a"/></linearGradient>
                <radialGradient id="globe" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#1c4a8a"/><stop offset="1" stop-color="#081634"/></radialGradient>
                <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00ffd6"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>
                <clipPath id="gc"><circle cx="300" cy="66" r="46"/></clipPath>
            </defs>
            <rect width="400" height="120" fill="url(#bg)"/>
            ${bstars(77, 60, '#cfe4ff')}
            <circle cx="300" cy="66" r="52" fill="#3aa8ff" opacity=".08"/>
            <circle cx="300" cy="66" r="46" fill="url(#globe)" stroke="#5ab8ff" stroke-width="1"/>
            <g clip-path="url(#gc)" fill="none" stroke="#5ab8ff" stroke-width=".6" opacity=".7">
                ${[-30, -15, 0, 15, 30].map((d) => `<ellipse cx="300" cy="66" rx="${(46 * Math.cos(d * Math.PI / 180)).toFixed(1)}" ry="46" transform="rotate(-18 300 66) translate(${(d * 0.9).toFixed(1)} 0)"/>`).join('')}
                ${[-30, -15, 0, 15, 30].map((y) => `<line x1="250" y1="${66 + y}" x2="350" y2="${66 + y}"/>`).join('')}
                <path d="M270 44 q12 -6 20 2 q6 8 -4 14 q-10 2 -16 -6Z M308 74 q14 -4 18 6 q-2 12 -14 10 q-8 -6 -4 -16Z" fill="#2c7acc" opacity=".55"/>
            </g>
            <path d="M206 92 Q300 -14 380 70" fill="none" stroke="url(#beam)" stroke-width="1.8" stroke-dasharray="5 3"/>
            <g fill="#ffe08a"><circle cx="252" cy="44" r="2.2"/><circle cx="336" cy="30" r="2.2"/></g>
            <g transform="translate(182 82)">
                <rect x="0" y="0" width="42" height="26" rx="2" fill="#0c1430" stroke="#00ffd6" stroke-width="1.2"/>
                <rect x="3" y="3" width="36" height="20" fill="#062a30"/>
                <line x1="20" y1="6" x2="20" y2="20" stroke="#00ffd6" stroke-width=".5" stroke-dasharray="2 2"/>
                <rect x="6" y="9" width="2" height="7" fill="#00ffd6"/><rect x="34" y="7" width="2" height="7" fill="#ff3fa4"/><circle cx="24" cy="13" r="1.4" fill="#fff"/>
                <path d="M-5 26 h52 l-4 5 h-44Z" fill="#1a2448" stroke="#00ffd6" stroke-width=".8"/>
            </g>
            <g transform="translate(374 56) rotate(10)">
                <rect x="0" y="0" width="18" height="32" rx="3" fill="#160c2a" stroke="#ff3fa4" stroke-width="1.2"/>
                <rect x="2" y="4" width="14" height="23" fill="#2a0a26"/>
                <rect x="4" y="8" width="7" height="2" fill="#00ffd6"/><rect x="7" y="21" width="7" height="2" fill="#ff3fa4"/><circle cx="9" cy="15" r="1.3" fill="#fff"/>
            </g>
            <g fill="none" stroke="#00ffd6" stroke-width="1" stroke-linecap="round" opacity=".7"><path d="M196 74 a8 8 0 0 1 16 0"/><path d="M191 70 a13 13 0 0 1 26 0"/></g>`,
    };

    // Vertical focus when a card crops a scene to a wider panel.
    const focus = { classic: '38%', zombie: '45%', gravity: '46%', speed: '44%', obstacle: '48%', custom: '48%' };
    const artBase = new URL('assets/images/menu-art/', document.baseURI);

    const cache = {};
    window.ModeArt = {
        focus(id) { return focus[id === 'customise' ? 'custom' : id] || '50%'; },
        url(id) {
            const key = id === 'customise' ? 'custom' : id;
            if (!scenes[key]) return '';
            if (!cache[key]) {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${VB}>${scenes[key]()}</svg>`;
                cache[key] = `url("${new URL(key + '.webp?v=20261027-4k-1', artBase).href}"), url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;
            }
            return cache[key];
        },
        banner(id) {
            if (!banners[id]) return '';
            const key = 'b:' + id;
            if (!cache[key]) {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${BVB}>${banners[id]()}</svg>`;
                cache[key] = `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;
            }
            return cache[key];
        },
        // Header art: prepends a faded banner layer to el (once).
        decorate(el, id) {
            if (!el || el.querySelector(':scope > .ui-art')) return;
            const img = this.banner(id) || this.url(id);
            if (!img) return;
            const art = document.createElement('div');
            art.className = 'ui-art' + (banners[id] ? '' : ' is-scene');
            art.setAttribute('aria-hidden', 'true');
            art.style.backgroundImage = img;
            el.classList.add('has-ui-art');
            el.prepend(art);
        },
        // Fills every [data-mode-thumb] under root with its mode scene.
        thumbs(root) {
            root?.querySelectorAll('[data-mode-thumb]').forEach((t) => {
                const id = t.getAttribute('data-mode-thumb');
                t.style.backgroundImage = this.url(id);
                t.style.backgroundPosition = `center ${this.focus(id)}`;
            });
        },
    };
})();

