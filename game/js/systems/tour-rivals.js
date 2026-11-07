// The Tour's cast: eight rivals with a face, a voice and a reason to beat them.
// Data only, plus the portrait painter. tour.js reads window.PPRivals for the
// versus screen, the Tour map, result reactions and the in-match chatter
// (ai-opponent.js adds the `taunts` pools to the computer's own lines).
//
// Voice rules (same as the rest of the game's taunts): dry, a little rude, no
// emoji. Each rival has one clear manner so they are easy to tell apart.
(function () {
    'use strict';

    let uid = 0;
    // Shared frame: dark card, accent rim light behind the head, shoulders.
    function frame(accent, jacket, inner, extraBack = '') {
        const id = `pr${++uid}`;
        return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<defs>
<radialGradient id="${id}g" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset=".6" stop-color="${accent}" stop-opacity=".1"/><stop offset="1" stop-color="#04060e" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}j" x1="0" x2="1"><stop offset="0" stop-color="${jacket}"/><stop offset="1" stop-color="#0a0d18"/></linearGradient>
</defs>
<rect width="120" height="150" fill="#070a16"/>
<rect width="120" height="150" fill="url(#${id}g)"/>
${extraBack}
<path d="M6 150 Q10 110 60 104 Q110 110 114 150Z" fill="url(#${id}j)" stroke="${accent}" stroke-opacity=".6" stroke-width="1.4"/>
${inner}
</svg>`;
    }
    const eyes = (y, dx, r, col = '#10131f', white = '#fff') =>
        `<ellipse cx="${60 - dx}" cy="${y}" rx="${r * 1.25}" ry="${r * 1.3}" fill="${white}"/><ellipse cx="${60 + dx}" cy="${y}" rx="${r * 1.25}" ry="${r * 1.3}" fill="${white}"/>` +
        `<circle cx="${60 - dx + 0.8}" cy="${y + 0.4}" r="${r * 0.7}" fill="${col}"/><circle cx="${60 + dx + 0.8}" cy="${y + 0.4}" r="${r * 0.7}" fill="${col}"/>`;

    const ART = {
        pip: () => frame('#b8ff4a', '#f2c230', `
<rect x="52" y="92" width="16" height="18" rx="5" fill="#d9a77c"/>
<path d="M34 64 Q32 36 60 34 Q88 36 86 64 Q86 92 60 94 Q34 92 34 64Z" fill="#f1c9a0"/>
<path d="M32 52 L38 30 L46 42 L52 24 L60 40 L68 24 L74 42 L82 30 L88 52 Q60 40 32 52Z" fill="#9be34a"/>
<path d="M31 56 Q60 44 89 56 L89 64 Q60 52 31 64Z" fill="#e63a3a"/><path d="M31 56 Q60 44 89 56 L89 59 Q60 47 31 59Z" fill="#fff" opacity=".85"/>
<circle cx="60" cy="53" r="6" fill="#fff"/><circle cx="60" cy="53" r="4.2" fill="#ffd9a0"/>
${eyes(70, 9, 3.6)}
<path d="M46 80 Q60 92 74 80 Q60 85 46 80Z" fill="#7a2a2a"/><path d="M47 80 Q60 90 73 80 L73 82 Q60 92 47 82Z" fill="#fff"/><path d="M48 82 L72 82" stroke="#9aa6b8" stroke-width="1.4"/>
<path d="M44 64 L52 62 M76 64 L68 62" stroke="#7a4a20" stroke-width="2" stroke-linecap="round"/>
<path d="M26 150 L26 124 M94 150 L94 124" stroke="#fff" stroke-width="3" opacity=".7"/>`),

        vee: () => frame('#ff3a5c', '#8a1230', `
<path d="M78 40 Q112 52 104 104 Q96 70 74 62Z" fill="#0c0c14"/>
<rect x="52" y="92" width="16" height="18" rx="5" fill="#d8a37c"/>
<path d="M36 64 Q34 38 60 36 Q86 38 84 64 Q84 92 60 95 Q36 92 36 64Z" fill="#ecbd98"/>
<path d="M33 60 Q36 30 62 30 Q90 32 87 62 Q80 44 60 44 Q42 44 33 60Z" fill="#0c0c14"/>
<path d="M36 66 L84 66 L80 74 Q60 78 40 74Z" fill="#0a0a12" stroke="#ff3a5c" stroke-width="1.6"/>
<path d="M40 70 L58 70 M62 70 L80 70" stroke="#ff7a8c" stroke-width="2" stroke-linecap="round" opacity=".9"/>
<path d="M50 85 Q62 88 72 82" stroke="#6a2a2a" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M44 108 L60 124 L76 108" stroke="#ff3a5c" stroke-width="2" fill="none"/>`),

        nova: () => frame('#5ee7ff', '#3a2a8a', `
<circle cx="22" cy="40" r="1.6" fill="#fff"/><circle cx="100" cy="30" r="1.2" fill="#fff"/><circle cx="96" cy="70" r="1.6" fill="#aef"/><circle cx="16" cy="84" r="1.2" fill="#fff"/>
<rect x="52" y="92" width="16" height="18" rx="5" fill="#74cdbd"/>
<path d="M36 66 Q34 40 60 38 Q86 40 84 66 Q84 94 60 96 Q36 94 36 66Z" fill="#8fe0d0"/>
<path d="M30 56 Q24 30 44 26 Q40 14 62 18 Q84 12 82 28 Q100 32 90 56 Q92 40 76 36 Q60 28 44 38 Q30 40 30 56Z" fill="#6a4fe0"/>
<path d="M36 34 Q48 20 60 32 M60 28 Q74 14 86 34" stroke="#b9a6ff" stroke-width="3" fill="none" stroke-linecap="round"/>
<g fill="#ffd45c" stroke="#8a6410" stroke-width="1"><path d="M47 62 L50 68 L57 69 L52 74 L53 81 L47 77 L41 81 L42 74 L37 69 L44 68Z"/><path d="M73 62 L76 68 L83 69 L78 74 L79 81 L73 77 L67 81 L68 74 L63 69 L70 68Z"/></g>
<path d="M57 70 L63 70" stroke="#8a6410" stroke-width="2"/>
<path d="M46 86 Q60 100 74 86 Q60 92 46 86Z" fill="#12202a"/><path d="M50 88 Q60 96 70 88" stroke="#fff" stroke-width="1.6" fill="none"/>
<circle cx="86" cy="118" r="9" fill="#5ee7ff" opacity=".85"/><ellipse cx="86" cy="118" rx="14" ry="3.4" fill="none" stroke="#fff" stroke-width="1.4"/>`),

        brick: () => frame('#ff7620', '#d9591a', `
<rect x="48" y="90" width="24" height="20" rx="4" fill="#bd8052"/>
<path d="M30 62 Q30 38 60 36 Q90 38 90 62 L88 84 Q86 98 60 98 Q34 98 32 84Z" fill="#d99a6c"/>
<path d="M30 52 Q30 20 60 18 Q90 20 90 52 L90 50 Q60 38 30 50Z" fill="#ff7620"/><path d="M26 52 L94 52 L94 58 Q60 52 26 58Z" fill="#e0561a"/>
<path d="M58 14 L62 14 L64 40 L56 40Z" fill="#ff9a50"/><path d="M42 26 Q60 20 78 26" stroke="#ffd0a0" stroke-width="2" fill="none" opacity=".7"/>
<path d="M40 66 L54 62 M80 66 L66 62" stroke="#2a1608" stroke-width="3.4" stroke-linecap="round"/>
<ellipse cx="48" cy="69" rx="3.4" ry="2.6" fill="#fff"/><ellipse cx="72" cy="69" rx="3.4" ry="2.6" fill="#fff"/><circle cx="48.6" cy="69.2" r="1.7" fill="#1a1008"/><circle cx="72.6" cy="69.2" r="1.7" fill="#1a1008"/>
<path d="M76 56 L88 66" stroke="#8a4a3a" stroke-width="2"/>
<path d="M46 86 L74 86" stroke="#5a2a1a" stroke-width="3.4" stroke-linecap="round"/>
<path d="M34 112 L34 150 M86 112 L86 150" stroke="#ffe08a" stroke-width="7" opacity=".9"/><path d="M34 126 L86 126" stroke="#ffe08a" stroke-width="5" opacity=".6"/>`),

        juno: () => frame('#ffbe00', '#c98a00', `
<rect x="52" y="92" width="16" height="16" rx="5" fill="#d8a37c"/>
<path d="M36 72 Q36 92 60 94 Q84 92 84 72Z" fill="#f0c49c"/>
<path d="M28 70 Q26 30 60 28 Q94 30 92 70 Q92 80 82 82 L38 82 Q28 80 28 70Z" fill="#ffbe00" stroke="#7a5200" stroke-width="1.6"/>
<path d="M32 62 Q34 46 60 46 Q86 46 88 62 L88 70 Q60 76 32 70Z" fill="#0b0d16"/>
<path d="M36 58 Q60 50 84 58" stroke="#ff9a2a" stroke-width="3" fill="none" opacity=".85"/><path d="M40 64 Q60 60 80 64" stroke="#fff" stroke-width="1.4" fill="none" opacity=".5"/>
<path d="M44 34 L76 34 M60 28 L60 46" stroke="#fff" stroke-width="3" opacity=".6"/>
<path d="M50 86 Q62 92 72 84" stroke="#7a3a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M40 82 L46 94 M80 82 L74 94" stroke="#7a5200" stroke-width="2"/>
<g fill="#0b0d16"><rect x="14" y="124" width="12" height="12"/><rect x="38" y="124" width="12" height="12"/><rect x="62" y="124" width="12" height="12"/><rect x="86" y="124" width="12" height="12"/><rect x="26" y="136" width="12" height="12"/><rect x="50" y="136" width="12" height="12"/><rect x="74" y="136" width="12" height="12"/></g>`),

        mirage: () => frame('#d28bff', '#4a1f8a', `
<g opacity=".28" transform="translate(9 -2)"><path d="M36 66 Q34 38 60 36 Q86 38 84 66 Q84 94 60 96 Q36 94 36 66Z" fill="#d28bff"/></g>
<g opacity=".16" transform="translate(-12 3)"><path d="M36 66 Q34 38 60 36 Q86 38 84 66 Q84 94 60 96 Q36 94 36 66Z" fill="#7ad8ff"/></g>
<path d="M18 150 Q14 84 40 52 Q60 24 80 52 Q106 84 102 150Z" fill="#2a1058" stroke="#d28bff" stroke-opacity=".7" stroke-width="1.6"/>
<path d="M34 68 Q34 42 60 40 Q86 42 86 68 Q86 94 60 96 Q34 94 34 68Z" fill="#1a0a36"/>
<path d="M36 66 Q36 44 60 42 L60 94 Q36 92 36 66Z" fill="#e6e9f5"/><path d="M60 42 L60 94" stroke="#9a9fb8" stroke-width="1"/>
<path d="M42 62 Q48 56 54 62" stroke="#3a3a55" stroke-width="2" fill="none"/>
<ellipse cx="72" cy="64" rx="5.2" ry="3.6" fill="#fff"/><circle cx="72" cy="64" r="2.6" fill="#d28bff"/><circle cx="72" cy="64" r="9" fill="#d28bff" opacity=".25"/>
<path d="M66 82 Q76 86 82 80" stroke="#d28bff" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M50 104 L60 114 L70 104" stroke="#d28bff" stroke-width="1.6" fill="none" opacity=".8"/>`),

        atlas: () => frame('#7ab4ff', '#1c3a78', `
<rect x="50" y="92" width="20" height="18" rx="5" fill="#a87a56"/>
<path d="M34 62 Q32 36 60 34 Q88 36 86 62 Q86 82 80 94 Q60 112 40 94 Q34 82 34 62Z" fill="#b88a64"/>
<path d="M33 66 Q30 96 60 116 Q90 96 87 66 Q80 90 60 94 Q40 90 33 66Z" fill="#f4f1ea"/><path d="M48 90 Q60 100 72 90 Q60 94 48 90Z" fill="#cfc8bc"/>
<path d="M30 40 Q38 22 60 26 Q82 22 90 40" stroke="#ffd45c" stroke-width="3" fill="none" stroke-linecap="round"/>
<g fill="#ffd45c"><ellipse cx="38" cy="30" rx="5" ry="2.4" transform="rotate(-30 38 30)"/><ellipse cx="46" cy="25" rx="5" ry="2.4" transform="rotate(-12 46 25)"/><ellipse cx="82" cy="30" rx="5" ry="2.4" transform="rotate(30 82 30)"/><ellipse cx="74" cy="25" rx="5" ry="2.4" transform="rotate(12 74 25)"/></g>
<path d="M40 58 Q48 52 56 58 M64 58 Q72 52 80 58" stroke="#e8e3d8" stroke-width="3.6" fill="none" stroke-linecap="round"/>
<path d="M43 66 Q48 64 54 66 M66 66 Q72 64 77 66" stroke="#2a1a10" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<circle cx="30" cy="124" r="5" fill="#ffd45c"/><circle cx="90" cy="124" r="5" fill="#ffd45c"/><path d="M30 124 Q60 138 90 124" stroke="#ffd45c" stroke-width="2.4" fill="none"/>`),

        titan: () => frame('#ffd45c', '#121018', `
<path d="M4 150 Q8 100 26 90 L34 150Z" fill="#b01830"/><path d="M116 150 Q112 100 94 90 L86 150Z" fill="#b01830"/>
<rect x="50" y="92" width="20" height="18" rx="5" fill="#1a1620"/>
<path d="M32 62 Q30 34 60 32 Q90 34 88 62 Q88 90 60 104 Q32 90 32 62Z" fill="#e4b640" stroke="#7a5a10" stroke-width="1.6"/>
<path d="M36 40 L40 14 L50 32 L60 8 L70 32 L80 14 L84 40Z" fill="#ffd45c" stroke="#7a5a10" stroke-width="1.4"/>
<circle cx="60" cy="28" r="3" fill="#b01830"/>
<path d="M36 58 L54 66 L54 72 L36 66Z" fill="#0a0810"/><path d="M84 58 L66 66 L66 72 L84 66Z" fill="#0a0810"/>
<path d="M40 62 L52 67 M80 62 L68 67" stroke="#ffb020" stroke-width="2.6" stroke-linecap="round"/><circle cx="46" cy="64" r="8" fill="#ffb020" opacity=".25"/><circle cx="74" cy="64" r="8" fill="#ffb020" opacity=".25"/>
<path d="M60 70 L60 92" stroke="#7a5a10" stroke-width="2.4"/><path d="M48 90 Q60 96 72 90" stroke="#7a5a10" stroke-width="2" fill="none"/>
<path d="M36 112 L84 112" stroke="#ffd45c" stroke-width="3"/><path d="M60 112 L60 150" stroke="#ffd45c" stroke-width="2.4"/>`),
    };

    const R = {
        pip: {
            id: 'pip', name: 'Pip', title: 'The Rookie', accent: '#b8ff4a', home: 'Maple Street Sports Hall',
            bio: 'Club junior who has never lost a home game, because nobody else shows up.',
            meet: ['Oh! You\'re the new one? I\'ve been practising against a wall. It never complains. You will, though.',
                   'Please go easy on me. That\'s a joke. I trained for this. Slightly.'],
            rematch: ['Again? I\'ve been thinking about it. I still don\'t have a plan.'],
            afterLoss: ['I\'ve been practising since last time. The wall helped. The wall is smug about it.'],
            youWin: ['Okay. Okay okay okay. Fine. Good game. Please don\'t tell the club.', 'I want a rematch. Not today. Soon.'],
            youLose: ['I won! Does this count? Can I put it on the board?', 'Sorry! No I\'m not. Yes I am. A bit.'],
            taunts: {
                intro: ['Hi! Good luck! I mean it! Mostly!', 'The wall and I have a system. It involves you losing.', 'Don\'t mind me. I\'m just very, very consistent.'],
                ai_point: ['Oh! That counted! Wow!', 'I didn\'t even plan that. Don\'t tell anyone.', 'Point to me. Is that rude? It feels rude.', 'The wall taught me that. It\'s a good wall.'],
                player_point: ['Nice one! That\'s annoying, but nice.', 'Okay yes, that was good. I\'m writing that down.', 'Hey! I was ready for that! In theory!'],
                miss_any: ['I blinked. I do that.', 'Sorry, my brain was getting a snack.'],
                match_point_ai: ['One more point. I might cry. Don\'t look.'],
                match_point_player: ['You\'re one away. Be gentle with me. Or don\'t.'],
                end_win: ['I WON. Somebody witness this.', 'Good game! Great game! I\'m so smug right now.'],
                end_loss: ['That was fun! Rude, but fun. Rematch?', 'You\'re really good. I hate that. Teach me.'],
                rally_long: ['This is the longest rally of my life and I love it.'],
            },
        },
        vee: {
            id: 'vee', name: 'Vee', title: 'The Sniper', accent: '#ff3a5c', home: 'Maple Street Sports Hall',
            bio: 'Club champion. Hasn\'t smiled since the semi-finals, and that was a typo.',
            meet: ['You beat Pip. Good for you. He\'s the easy one, and I\'m the reason he\'s nervous.', 'Corners. That\'s the whole plan. Enjoy the cardio.'],
            rematch: ['Back. Fine. I\'ll aim somewhere new.'],
            afterLoss: ['Last time was a warm-up. I wasn\'t trying. Mostly.'],
            youWin: ['Hm. That was acceptable.', 'You found the gap. Rare. Don\'t get used to it.'],
            youLose: ['Clean. Expected.', 'Come back when you can read a corner.'],
            taunts: {
                intro: ['Corners. All of them. Go.', 'I don\'t miss. Adjust accordingly.', 'One shot. One corner. Your move.'],
                ai_point: ['Line. As drawn.', 'Gap. Taken.', 'You looked left. I used right.', 'That one had your name on it. Spelled correctly.'],
                player_point: ['Lucky.', 'Noted. It won\'t happen twice.', 'Fine. One.'],
                miss_any: ['Unscheduled. Won\'t repeat.', 'Wind.'],
                match_point_ai: ['One point. I\'ll make it quiet.'],
                match_point_player: ['You\'re close. Cute.'],
                end_win: ['As expected. Next.', 'Corner by corner. That\'s the game.'],
                end_loss: ['Hm. Impressive. Annoyingly.', 'You earned that. Don\'t tell anyone I said so.'],
                rally_long: ['Long rally. Boring. I preferred the corners.'],
            },
        },
        nova: {
            id: 'nova', name: 'Nova', title: 'The Wanderer', accent: '#5ee7ff', home: 'Ringworld Dock 7',
            bio: 'Flew in from a station nobody can find on a map. Talks to the ball. It answers.',
            meet: ['Regional now! Fun fact: I read the stars and they said you\'d lose. Fun fact two: I\'m lying.', 'Gravity is just a suggestion. Wanna see my suggestion?'],
            rematch: ['The universe brought you back. It has a sense of humour.'],
            afterLoss: ['I\'ve consulted three planets about last time. They all laughed.'],
            youWin: ['Ha! You bent the whole orbit! Respect, space cadet.', 'Okay, the stars were wrong. Stars lie. It\'s their thing.'],
            youLose: ['Called it! The cosmos told me! I\'ll thank it later.', 'Gravity wins. Gravity always wins. Rude.'],
            taunts: {
                intro: ['Welcome to my side of the galaxy! Please don\'t touch anything!', 'I fake left, mean right, and sometimes mean the moon.', 'Pay attention. No, not there. Wait, there. See? Already working.'],
                ai_point: ['The universe said yes!', 'That was physics. Rude physics.', 'Wormhole\'s on my side. It owes me money.', 'Plot twist: I did that on purpose.'],
                player_point: ['Whoa! You sneaky comet!', 'The stars did NOT mention that.', 'Fine. You get one star. Don\'t spend it.'],
                miss_any: ['A tiny asteroid hit my brain.', 'Gravity blinked.'],
                match_point_ai: ['One more and the cosmos is mine.'],
                match_point_player: ['You\'re one away. The stars are gossiping about it.'],
                end_win: ['Told you! The stars told me! I told you!', 'Back to space I go. Thanks for the snack.'],
                end_loss: ['You warped me! Teach me that trick!', 'Okay, fair. Even the sun sets. Dramatic exit now.'],
                rally_long: ['We\'re orbiting! This is basically astronomy!'],
            },
        },
        brick: {
            id: 'brick', name: 'Brick', title: 'The Foreman', accent: '#ff7620', home: 'Dockside Container Yard',
            bio: 'Runs the yard. Hits the ball like it owes him a pallet. Never apologised, ever.',
            meet: ['Rules are simple. I hit it. You chase it. Sound good? Doesn\'t matter.', 'Gloves off. I don\'t wear any. Stretch.'],
            rematch: ['You again. Good. I needed the workout.'],
            afterLoss: ['You got lucky. I\'ve fixed my back. No excuses now.'],
            youWin: ['...Fine. That was clean. Don\'t make me say it twice.', 'You\'re hired. As an opponent. Come back.'],
            youLose: ['Work harder. Hit the gym. Hit the ball. Same thing.', 'That\'s what a deadline feels like.'],
            taunts: {
                intro: ['Hard hat on. Mercy off.', 'I hit hard and I hit far. Stretch first.', 'This yard has three rules. You\'ll learn the other two.'],
                ai_point: ['Delivered.', 'Heavy. Like me.', 'That\'s called shipping.', 'Move your feet. Not your mouth.'],
                player_point: ['Lucky bounce. Doesn\'t count.', 'Huh. Fine. One.', 'Don\'t get comfortable on my floor.'],
                miss_any: ['Slippery floor.', 'Crane distracted me.'],
                match_point_ai: ['One more load. Then you\'re off site.'],
                match_point_player: ['You\'re one away? Make it count. I won\'t help.'],
                end_win: ['Clocked off. See you at six.', 'That\'s a day\'s work.'],
                end_loss: ['Hm. You\'ve got a decent arm. Don\'t tell anyone.', 'Take the rest of the day off. You earned it.'],
                rally_long: ['Now we\'re working.'],
            },
        },
        juno: {
            id: 'juno', name: 'Juno', title: 'The Streak', accent: '#ffbe00', home: 'Redline Wind Tunnel',
            bio: 'Test driver who got bored of the track and wants the tunnel. Talks as fast as she plays.',
            meet: ['National league! Everything\'s faster here, including how quickly I\'ll beat you. Ready? Ready. Too slow.', 'Blink and you\'ll miss it. Literally. Everyone does.'],
            rematch: ['Back for round two? Good. Round one was a warm-up lap.'],
            afterLoss: ['I\'ve re-tuned everything. Engine, nerves, snacks. You\'re toast.'],
            youWin: ['You kept up! Nobody keeps up! Do it again!', 'Okay okay okay, you\'re quick. Don\'t let it go to your head. Or do. Not a lot.'],
            youLose: ['Photo finish? No. Not even close. Sorry. No I\'m not.', 'Too slow! Next time bring a faster paddle.'],
            taunts: {
                intro: ['Green flag! Red flag for you!', 'Fasten your seatbelt. You\'ll need it. You\'ll also need a map.', 'The tunnel\'s mine. You\'re a very polite passenger.'],
                ai_point: ['Zoom! That\'s the sound of your point leaving.', 'Gone before you looked.', 'That\'s a sub-second return. Frame it.', 'Hit the apex. Hit the point.'],
                player_point: ['Okay! That was quick! For you!', 'Hey, who gave you rocket fuel?', 'Fine, fine. One lap to you.'],
                miss_any: ['Brake lines. Always the brake lines.', 'I\'m not slow, the ball\'s early.'],
                match_point_ai: ['Last lap! Smell that? That\'s victory. And burnt rubber.'],
                match_point_player: ['You\'re one away. The crowd\'s losing it. I\'m not.'],
                end_win: ['Chequered flag! Thanks for racing!', 'That\'s the fastest I\'ve ever won. New record. Again.'],
                end_loss: ['You passed me! On a straight! How!', 'I want a rematch. Right now. Actually yesterday.'],
                rally_long: ['This rally\'s so long I could get a coffee. I won\'t. Too slow.'],
            },
        },
        mirage: {
            id: 'mirage', name: 'Mirage', title: 'The Illusionist', accent: '#d28bff', home: 'The Salt Pan',
            bio: 'Nobody has seen the same Mirage twice. The ball may be real. That\'s the rumour.',
            meet: ['You\'re looking at me. Or at a me. Which one is playing? Wrong answer.', 'Welcome to the flat. Nothing here is where you left it.'],
            rematch: ['Did we play before? I don\'t recall. Neither do you, if you\'re smart.'],
            afterLoss: ['The last one wasn\'t me. This one is. Probably.'],
            youWin: ['Good. You saw through it. Don\'t ask me how.', 'A lovely defeat. I\'ll pretend it was a different me.'],
            youLose: ['Did that happen? Check your memory. Then check the scoreboard.', 'You lost. Or I did. Ask me again later.'],
            taunts: {
                intro: ['I never hit it where I\'m pointing. Call it a feature.', 'Look at the paddle. Then look away. Everyone fails here.', 'Two of me. One of me. Neither of me. Serve.'],
                ai_point: ['Was that real? It scored.', 'Gone. Like a rumour.', 'The ball was never where you thought. Don\'t take it personally.', 'A shimmer. A point. A moral.'],
                player_point: ['Interesting. A point appears.', 'You scored? How quaint.', 'That wasn\'t me. That was my echo.'],
                miss_any: ['A trick of the light. Mine.', 'I blinked. Or did I?'],
                match_point_ai: ['One point left. It may or may not exist.'],
                match_point_player: ['You\'re one away. It may not be there when you arrive.'],
                end_win: ['Was there a game? There was a winner. That\'s enough.', 'Gone before the applause.'],
                end_loss: ['You saw me. Interesting. Quiet about that.', 'Even mirages end at the horizon.'],
                rally_long: ['This rally is a mirage. It never ends, and it never began.'],
            },
        },
        atlas: {
            id: 'atlas', name: 'Atlas', title: 'The Immovable', accent: '#7ab4ff', home: 'Centre Court',
            bio: 'Five-time defending semi-finalist. Has returned every ball ever served to him. Allegedly.',
            meet: ['The final stage. Everyone says that, I think. I\'ve outlasted three coaches and two stadiums.', 'Hit it anywhere. I\'ll be there. Usually before it.'],
            rematch: ['You\'re persistent. I respect that. I\'ll respect it from here.'],
            afterLoss: ['Last time I was tired. Today I\'m patient. Different thing.'],
            youWin: ['You broke the wall. Well. Hm. There is a first time for everything.', 'Go. Take the final. I\'ll be here. I\'m always here.'],
            youLose: ['Patience, as predicted. Try again in a year.', 'You can\'t out-run a mountain. You can only outlast it.'],
            taunts: {
                intro: ['I\'ve outlasted bigger egos than yours.', 'No hurry. I have all day. I have all week.', 'Go ahead. Try something clever. I love clever. It runs out.'],
                ai_point: ['Everything comes back.', 'Nothing gets past me. Not ego, not spin.', 'That was patience, not power.', 'I\'d say I\'m sorry. I\'m not.'],
                player_point: ['A point. Noted. Archived.', 'You scored. Mountains lose pebbles. It\'s fine.', 'Clever. Won\'t work twice.'],
                miss_any: ['A rock slipped.', 'Even mountains yawn.'],
                match_point_ai: ['One more. Then the long silence.'],
                match_point_player: ['One away. Don\'t trip on the finish line.'],
                end_win: ['Everything returns. So will you.', 'Good effort. Try again in a year.'],
                end_loss: ['You\'ve moved a mountain. Mind the avalanche.', 'Go. Take the last stage. It\'s heavier than I was.'],
                rally_long: ['Finally. A rally worth my afternoon.'],
            },
        },
        titan: {
            id: 'titan', name: 'Titan', title: 'The Champion', accent: '#ffd45c', home: 'The Grand Final',
            bio: 'Undefeated, unsmiling and under a gold mask. Wins on points and on principle. Mostly on principle.',
            meet: ['So. You\'re the one who climbed here. Impressive. Irrelevant. Take your place.', 'No one reaches this court. You\'re a rumour I\'ll end personally.'],
            rematch: ['You\'re back. Good. Ending you once wasn\'t satisfying enough.'],
            afterLoss: ['I\'ve studied you. Every habit. Every flinch. Begin.'],
            youWin: ['...Impossible. And yet. The court is yours. Wear it carefully.', 'You are the champion. Mask off. Congratulations. Now go away.'],
            youLose: ['As written. Return when you are worthy. Or louder.', 'You were never in the book. I\'ll keep it that way.'],
            taunts: {
                intro: ['I have no rivals. Only spectators.', 'Kneel. I mean, serve. It\'s similar.', 'The crowd came for a coronation. Not yours.'],
                ai_point: ['Another for the book.', 'Regal. As always.', 'Observe: a champion at work.', 'Do try to keep up. The anthem ends soon.'],
                player_point: ['A point. Enjoy it. It\'s on loan.', 'Impressive. Don\'t hold your breath.', 'You scored. The crowd gasped. I did not.'],
                miss_any: ['An oversight. It will be corrected.', 'The ball offended me.'],
                match_point_ai: ['One more point and the crown is mine. Again.'],
                match_point_player: ['One away. The crown is heavy. Do you want it?'],
                end_win: ['Back to the throne. Next.', 'A tidy coronation. You may applaud.'],
                end_loss: ['The crown... is yours. Wear it more kindly than I did.', 'A new champion. I suppose the court needed one.'],
                rally_long: ['Hm. A worthy rally. Almost.'],
            },
        },
    };

    // Story beats shown on the versus screen at the first stage of each tier.
    const TIER_STORY = [
        'The local club night. Nobody famous plays here, which is exactly why the beginners win.',
        'The regional league. Stations and shipyards send their best, and the venues get stranger.',
        'The national finals. Everything is faster, brighter and a little less honest.',
        'The world final. One court, one champion, and a crowd that remembers every point.',
    ];

    window.PPRivals = {
        get: (id) => R[String(id).toLowerCase()] || null,
        portrait: (id) => (ART[String(id).toLowerCase()] ? ART[String(id).toLowerCase()]() : ''),
        story: (tier) => TIER_STORY[tier] || '',
        pick: (list) => (list && list.length ? list[Math.floor(Math.random() * list.length)] : ''),
        // Pools merged by ai-opponent.js for the rival being played.
        taunts: (id) => R[String(id).toLowerCase()]?.taunts || null,
    };
})();
