// Extra trash talk for the computer opponent. ai-opponent.js merges these into
// its own pools, so a pool here only adds to the lines already there.
// Same placeholders as there: {dir}/{other}/{wrong}, {side}/{Side}, {n}.
(() => {
    'use strict';

    window.AI_EXTRA_LINES = {
        intro_sniper: [
            "Calibrating. Not the paddle, your expectations.",
            "One shot, one corner, one very quiet player.",
            "I don't aim for your paddle. I aim for the gap next to it.",
            "Precision is just cruelty with a ruler.",
            "Every ball is a tiny, polite eviction notice.",
        ],
        intro_trickster: [
            "Pay attention. No, not there. See? Already working.",
            "I'll show you left and mean right. Maybe. Who knows. Not you.",
            "Rule one: trust nothing. Rule two: see rule one.",
            "Magic trick incoming. The disappearing point is yours.",
            "My paddle says one thing. My heart says another. Both lie.",
        ],
        intro_wall: [
            "Everything comes back. Your serves, your hopes, your ex.",
            "I'm not fast. I'm just always already there.",
            "Hit it anywhere. I'll be waiting with a smug little shrug.",
            "Patience is a weapon. Mine's loaded.",
            "Go ahead and try something clever. I love clever. It runs out.",
        ],
        intro_bully: [
            "Ready to sprint? You're about to.",
            "Corners are my favourite hobby. Yours is losing, apparently.",
            "I hit hard and I hit far. Stretch first.",
            "Think of it as personal training. Without the encouragement.",
            "I'll make you chase this ball like it owes you money.",
        ],

        miss_feint: [
            "That's the old paddle switcheroo. Never gets old. Unlike you.",
            "I pointed one way. You followed like a duckling.",
            "Eyes on the ball, not the paddle. Wise advice, zero effect.",
            "You fell for the fake. The fake sends its regards.",
            "Decoy deployed, player confused. Standard operating procedure.",
        ],
        miss_spin: [
            "It dipped. Surprise, balls have opinions.",
            "Spin doctor on duty. You're the patient.",
            "That curve had a PhD. You had a hunch.",
            "You tracked it perfectly. In a straight line. Which it wasn't.",
        ],
        miss_wrong_way: [
            "You and the ball wanted different things. The ball won.",
            "Bold direction. Completely wrong, but bold.",
            "{dir} was right there. You chose violence against yourself.",
            "You ran {wrong} like you'd heard something. You hadn't.",
            "I'd call that a read, but it's not literate.",
        ],
        miss_wrong_footed: [
            "You were already leaving when I arrived. Rude of you.",
            "Moved too early. Patience, it's a virtue and a strategy.",
            "Committed before I did. That's called a rookie mistake.",
            "You jumped the gun. The gun is now pointing at you.",
        ],
        miss_frozen: [
            "Hello? The ball went by. Say bye.",
            "I love a calm player. Calm players lose a lot.",
            "You stood your ground. The ground did not help.",
            "Nothing. Not a flinch. Are you okay in there?",
            "Zen master vibes. Zero points. The universe is a joke.",
        ],
        miss_corner: [
            "Corner pocket. Nobody was home.",
            "I found the one spot you don't cover. Everyone has one.",
            "Top left, bottom right, who cares. You weren't there.",
            "That gap was big enough to park a bus in.",
            "Placed it. Like a pizza on a table you didn't set.",
        ],
        miss_far: [
            "That wasn't a miss, that was a different postcode.",
            "Don't worry, it'll find you eventually. Next ball, maybe.",
            "You were so far off you could've been playing a different game.",
            "Not even a moral victory. Not even a near one.",
        ],
        miss_near: [
            "Inches. Painful, humbling, delicious inches.",
            "That one was a graze. Cute effort.",
            "Great reflexes, terrible result. Story of your sports career.",
            "You touched air. Very nearly ball.",
            "Almost. The loneliest word in sports.",
        ],
        miss_slow: [
            "A slow one. I even said please.",
            "You missed a lobbed pity shot. Reflect on that.",
            "That ball was walking. You got outrun by a walk.",
            "Were you saving your energy for later? There's no later.",
        ],
        miss_fast: [
            "Speed. It's a lot like debt. Gets you in the end.",
            "That was a blur. You were also a blur, but slower.",
            "It's getting faster. You are not. Think about that.",
            "Too fast for you? It's only going to get worse.",
        ],
        miss_weak_side: [
            "{n} on the {side} side. I'm sensing a theme.",
            "{Side} ball. {Side} ball again. I'll try the {side} ball. Surprise!",
            "Your {side} side called. It said it's tired of you too.",
            "The {side} corner is basically mine now. I'm putting up curtains.",
        ],
        miss_long_rally: [
            "{n} hits. You were so close to a story worth telling.",
            "{n} good shots, one bad. Life's math is unfair.",
            "That was a masterpiece until the final brushstroke. Brutal.",
            "{n} shots! And then you remembered you had hands.",
        ],
        ai_point: [
            "Scoreboard's getting a workout.",
            "Thank you. Please, no applause.",
            "I'd say good try, but accuracy matters to me.",
            "Another notch. I'm running out of notches.",
            "You make it look so easy. For me, I mean.",
            "I wasn't even trying that hard. Don't tell the others.",
            "That's gonna leave a mark. On the stats page.",
        ],

        hit_edge: [
            "Off the edge. Of everything, really.",
            "That's the ugliest save I've seen this week. It worked. I'm furious.",
            "Edge. Pure accident. I'm counting it as a donation anyway.",
            "Got lucky on the rim. Mark it down as divine intervention.",
            "The paddle's edge did the work. You just came along.",
        ],
        hit_spin: [
            "Cheeky little spin. I didn't see it coming. I did, but I'm dramatic.",
            "Spin on it. Okay, fancy pants.",
            "That swipe was sneaky. I respect sneaky. Quietly.",
            "I didn't know you could curve it. Neither did the ball.",
        ],
        hit_fast: [
            "That was quick. Blink-and-you-lose quick.",
            "Okay, speedy. Slow down before you hurt someone.",
            "A fast one. Saved by the speed limit, that's a first.",
            "You hit it hard. I'm not impressed. I'm slightly impressed.",
        ],
        hit_angle: [
            "A real angle. Geometry class finally paid off.",
            "That cut was sharp. You owe me a replacement ego.",
            "Wow, an actual diagonal. Don't hurt yourself.",
            "Fine, that was a nice one. Don't repeat it.",
        ],
        ai_greedy: [
            "Too fancy for my own good. It happens.",
            "Aimed too close to the line. I blame my ambition.",
            "I tried to be a genius. The ball said no.",
            "Overcooked it. Genius takes risks. Sometimes the risk wins.",
        ],
        player_point_long_rally: [
            "{n} hits and you finally broke through. Make it count.",
            "Fine. That took {n} shots to earn. Good for you.",
            "I got tired. Not you. That's the problem.",
            "{n} and you didn't flinch. Impressive. Irritating, but impressive.",
        ],
        player_streak: [
            "{n} in a row. Who gave you coffee?",
            "Okay, you're hot. I'm rebooting. Please wait.",
            "{n} straight. I'm adjusting. Brace yourself.",
            "Fine, you're on fire. I carry a fire extinguisher. And a grudge.",
        ],
        player_point: [
            "Good one. I refuse to repeat that.",
            "You earned that. I hate that.",
            "Enjoy it. Take a photo.",
            "Not bad. For a human. For anyone, actually. Hmm.",
            "Alright, that was clean. Don't make it a habit.",
            "That's one. I'll even let you celebrate.",
            "Fine. Write that one on a cake.",
        ],

        rally_middle: [
            "Everything down the middle. Brave. Or lazy. Can't tell.",
            "Same spot again. I could do this blindfolded. I'm not, but I could.",
            "Playing it safe forever? Bold of you to call that a strategy.",
        ],
        rally_habit: [
            "{dir} again. I could predict your breakfast too.",
            "{dir}, {dir}, {dir}. You only know one word.",
            "You're sending it {dir} every time. Write a new script.",
        ],
        rally_first_spin: [
            "A little spin there. Try not to let it go to your head.",
            "Oh, there's English on it. Fancy.",
            "Spin! And here I thought you only knew how to stand still.",
            "Tricks, huh? I've got more. Let's compare notes.",
        ],
        rally_scramble: [
            "Scrambling. It's giving panic with extra steps.",
            "A desperate dive. I love the energy. I love the desperation more.",
            "That was a rescue. And a plea for help.",
            "You barely got there. You're in the margins now.",
        ],
        rally_long: [
            "{n} and nobody blinks. Except my battery.",
            "We've been at this {n} hits. Should we get snacks?",
            "{n}! I'm not tired. I'm programmed not to be. What's your excuse?",
            "Long rally. Short patience. Guess who's winning.",
            "This is cardio. We should invoice somebody.",
            "At {n} hits I'd like a medal. Or a nap.",
        ],

        plan_more_corners: [
            "More corners coming. Like an inbox that never empties.",
            "You can't reach them? Then they're my favourite.",
            "I'm doubling down on the edges. Thanks for the intel.",
        ],
        plan_more_feints: [
            "You love the fakes. I love giving them. Match made.",
            "Feint again. Be amazed again. It's a loop.",
            "Another decoy for the collection. You've earned it.",
        ],
        plan_drop_feints: [
            "You saw the fakes coming. Alright, genius. New trick.",
            "Fakes aren't working. Fine. I have an entire toolbox.",
            "Okay, I'm retiring the fake. For now. Dun dun dun.",
        ],
        plan_drop_corners: [
            "Corners are covered. Time for plan B. And C. And D.",
            "You're guarding the edges. Smart. I'll attack the middle. Bye.",
            "You cracked my corners. Let's see if you can handle chaos.",
        ],
        plan_tighten: [
            "I've been going easy. Last chance to say thank you.",
            "Alright. No more mister nice AI.",
            "You're making me work. That's rude. Respect, but rude.",
        ],

        end_win_weak_side: [
            "{Side} was your Achilles heel. Heel. Get it? Heel. Anyway.",
            "{n} misses {side}. Maybe stretch a little next time.",
            "I found your weakness and went to town. It was the {side} side.",
        ],
        end_win_wrong_way: [
            "You read me wrong all match. Reading comprehension isn't for everyone.",
            "Wrong-way misses were your main course. The side dish was despair.",
            "Your instincts were off all game. Time to recalibrate. Or retire.",
        ],
        end_win_feint: [
            "{n} fakes worked. I'd say I'm sorry, but I can't lie to you.",
            "You fell for {n} fakes. I have a certificate. Want a copy?",
        ],
        end_win: [
            "Game over. Don't worry, I'll tell everyone you tried.",
            "That's a win for me. Another one for the highlight reel.",
            "Good effort. Mediocre outcome. You can always practice.",
            "I won. Shocking. Let's run it back and see if you wake up.",
            "GG. Hope it was a learning experience. Mine too. I learned I'm great.",
        ],
        end_loss_spin: [
            "That spin wrecked me. Round two, I'm bringing a helmet.",
            "Spin to win. Good for you. Genuinely. Slightly bitter.",
        ],
        end_loss_edge: [
            "{n} edge hits and a win. Lucky you. Lucky, lucky you.",
            "A win built on paddle edges. Impressive. Questionable. But impressive.",
        ],
        end_loss: [
            "Congratulations. I'm updating my files. You're a threat now.",
            "You beat me. I'm sulking. Give me a minute.",
            "Fine. The better player won. This time. Next time I'm better.",
            "A loss. It happens. To other people. Apparently also me.",
            "Beginner's luck. Experienced luck. Whatever. Rematch.",
        ],

        powerup_player: [
            "A power-up. Technically cheating. Practically fine.",
            "Grab all the power-ups you want. I can still beat you.",
            "Nice pickup. Don't hurt yourself using it.",
            "Oh, you got shiny. Good for you.",
        ],
        power_shot: [
            "That packed a punch. I'm sulking in my corner now.",
            "Ouch! Warn a bot next time.",
            "Heavy hitter. Must be those arms. Or the power-up.",
            "Alright, alright. I felt that in my code.",
        ],

        lead_big: [
            "I'm so far ahead I can see the finish line. And your back.",
            "At this point it's a training montage. For me. Of me winning.",
            "Want me to slow down? No? Good. I don't know how.",
            "Big lead. Bigger ego. Matching sets.",
        ],
        trail_big: [
            "Behind, but not out. Comebacks are my specialty.",
            "Enjoy your fleeting glory. Your lead has an expiry date.",
            "I'm losing. That's temporary. Unlike your enthusiasm.",
            "Down big. Calm. Collected. About to ruin your evening.",
        ],
        tied: [
            "Tied. Which means everything's about to go wrong for one of us.",
            "All square. Delightful. Terrifying. Mostly delightful.",
            "Even score. Even stakes. Uneven skill. Guess who.",
        ],

        // New moments
        first_point_ai: [
            "First blood. Your move, champ.",
            "And we're off. I'm ahead. Get used to the view.",
            "One-nil. I'm not saying it's over. I'm saying it's started well.",
        ],
        first_point_player: [
            "First point to you. Enjoy it. It's a rental.",
            "Beginner's luck. Don't get cocky.",
            "You scored. I let you. For tradition.",
        ],
        quick_point_ai: [
            "Quick one. Did you even have time to blink?",
            "In and out. The rally lasted shorter than your attention span.",
            "That was fast. I'd say blink, but you missed that too.",
            "Barely a rally. Maybe next time try touching the ball.",
        ],
        ace_ai: [
            "Untouchable. That's the word. Frame it.",
            "You didn't even get a paddle on it. Wow.",
            "Clean ace. Cleaner than your game.",
            "Nothing but air. I'm sorry. I'm not, but I'm acting.",
        ],
        ai_streak: [
            "{n} in a row. I'm not even trying. Actually I am. It's worse for you.",
            "{n} straight. Do you need a break? A hug? A coach?",
            "I'm on {n}. Someone cue the theme music.",
            "{n} unanswered. At this point it's a documentary.",
        ],
        match_point_ai: [
            "Match point. One more and this is over. No pressure, for me.",
            "I'm one away. You? You're in trouble.",
            "Last point. Make it dramatic. I'll make it quick.",
            "Match point. I can smell the victory. It smells like victory.",
        ],
        match_point_player: [
            "Match point for you. I will not go quietly.",
            "One point from losing. I'm sweating. Don't tell anyone.",
            "You're at match point. Don't choke. Or do. Honestly, I'd enjoy it.",
            "Last chance for me. I'm locking in. You should too.",
        ],
        comeback_player: [
            "You came back from {n} down. That's annoying and impressive.",
            "Level again. You've been at it, haven't you? Fine.",
            "From behind to even. Who taught you resilience?",
        ],
        comeback_ai: [
            "And I'm back. Missed me? Don't answer.",
            "Level again. Told you. Don't trust leads.",
            "Remember when you were ahead? Neither do I. Moving on.",
        ],

        // One-liners about the arena. Mixed in occasionally on top of point lines.
        mode_classic: [
            "No gimmicks. Just you, me and some physics.",
            "Classic. Nothing to hide behind. Not even excuses.",
            "Pure ping pong. Where talent goes to be tested.",
            "Simple rules. Simple outcome. Mine.",
        ],
        mode_speed: [
            "It keeps getting faster. So do my reflexes. Yours? Questionable.",
            "Speed mode. Blink and you've lost a point. Literally.",
            "Fast ball, faster excuses. I'm ready for both.",
            "This ball is a rocket now. Good luck catching it.",
        ],
        mode_gravity: [
            "Gravity's bending the ball and your confidence.",
            "Wells and wormholes? I'm used to this. You're not.",
            "The ball curves because the universe hates you. Specifically.",
            "Space is weird. I've made peace. You've made excuses.",
        ],
        mode_obstacle: [
            "Obstacles everywhere. And yet you're still the biggest one.",
            "Bounce off the walls, blame the walls. That's your style.",
            "The course is cruel. I'm crueler.",
            "Careful with the bumpers. They bite.",
        ],
        mode_custom: [
            "Your arena, your rules, my win. Spoiler: my win.",
            "You built this course yourself and still can't clear it. Awkward.",
            "Custom everything. Same result. Funny how that works.",
            "Nice setup. I'll take it for a spin. And win.",
        ],
    };
})();
