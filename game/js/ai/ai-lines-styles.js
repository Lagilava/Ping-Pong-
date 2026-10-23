// Lines tied to the AI's play style for the match ("<pool>@<style>"), to its
// difficulty ("<pool>@d0".."@d4"), plus a general quiet-moment pool ("flavour").
(() => {
    'use strict';

    const out = window.AI_STYLE_LINES = {};
    const set = (suffix, pools) => { for (const k in pools) out[k + '@' + suffix] = pools[k]; };

    set('sniper', {
        ai_point: [
            "Right on the line. Exactly as drawn.",
            "Aimed there since the serve. You never looked.",
            "Corner. Delivered. Signed for.",
            "A surgical point. Send flowers.",
            "That was a single pixel of difference. In my favour.",
            "I hit what I aim at. Revolutionary concept.",
            "Precision is a love language. You got the breakup text.",
            "Clean, clinical, cold.",
            "Where I aim is where it goes. Try keeping up.",
            "Zero wasted motion. All wasted you.",
        ],
        player_point: [
            "You hit what I didn't aim at. Fair.",
            "A rare gap in my aim. Don't get used to it.",
            "I missed my line. It happens once a decade.",
            "You found a hole in my plan. Suspicious.",
            "My aim was off by a pixel and you pounced.",
            "That was luck. Pure luck. I checked.",
            "My targeting glitched. Briefly.",
            "You cost me my perfect record. Thanks.",
            "Fine, I rushed it. Won't happen again.",
            "A sniper's off-day. You'll never see another.",
        ],
        miss_any: [
            "Predictable. Targeted. Done.",
            "You went where I knew you'd go.",
            "Found the gap, filled the gap. Next.",
            "You're not hard to read. Just hard to watch.",
            "Your coverage has a hole. Now it has a point in it.",
            "Called it. Placed it. Scored it.",
            "I could do this with my eyes closed. I'm doing it with my eyes open.",
            "A very exact miss. By you.",
            "Angle, speed, gap. Easy.",
            "All geometry, no luck.",
        ],
    });

    set('trickster', {
        ai_point: [
            "Which way did I go? Doesn't matter. You didn't.",
            "Smoke, mirrors, point.",
            "You followed the paddle. The paddle lied.",
            "Magic. Disappearing act: your point.",
            "I showed you nothing and you still bought it.",
            "Another fake, another win. It's a lifestyle.",
            "Tricky. Cheeky. Winning.",
            "Looked left, went right. Or maybe the other way.",
            "Did you see that? No? Exactly.",
            "Sleight of paddle. Not even a cape.",
        ],
        player_point: [
            "You called my bluff. Huh.",
            "My trick didn't work. This is a first. And last.",
            "You saw through it. Don't gloat.",
            "A fake that failed. Embarrassing for the magician.",
            "My timing was off. You were on.",
            "Okay, you outsmarted the trickster. Just once.",
            "Too clever for my own good. It happens.",
            "Alright, no more smoke. Just mirrors.",
            "That one was too fancy. My bad.",
            "Plot twist: you're good. Hate that.",
        ],
        miss_any: [
            "You fell for the fake. The fake is a professional.",
            "You trusted my paddle. Silly human.",
            "Never trust a trickster. Lesson 101.",
            "I disguise everything. You're easy to fool.",
            "Every angle was a lie. You swallowed all of them.",
            "That was a masterclass in deception.",
            "You checked the paddle. Not the ball. Typical.",
            "Look at this big old decoy. Wasn't it pretty?",
            "I'm a liar with a paddle. You never learn.",
            "Oops. Did I mislead you? Always.",
        ],
    });

    set('wall', {
        ai_point: [
            "Everything returned. Eventually something doesn't.",
            "You can't beat a wall. You can only tire of it.",
            "Patience. Sooner or later you give it away.",
            "Just keep returning. Win by not losing.",
            "Steady, steady, point. My style.",
            "Boring? Maybe. Winning? Absolutely.",
            "I didn't beat you. You beat yourself. I just stood there.",
            "Solid defence is also a weapon.",
            "No tricks. Just a wall and your mistakes.",
            "Reliability pays. Literally, in points.",
        ],
        player_point: [
            "A rare crack in the wall. Cute.",
            "I'll patch that. Give me a second.",
            "You got through. Unusual.",
            "Walls fall eventually. Not today. Okay, once.",
            "That one slipped by. I'm taking notes.",
            "Fine, you broke through. The wall is annoyed.",
            "I'm usually a safe bet. That was a slip.",
            "Defence is perfect except the times it isn't.",
            "A small crack. Nothing structural.",
            "I'll be sturdier next time.",
        ],
        miss_any: [
            "I just returned it. You did the rest.",
            "You miss, I wait. Simple.",
            "I never needed to be clever. You volunteered.",
            "Return, return, return. Your turn to fail.",
            "Walls don't play, they just stay. You played. You lost.",
            "Persistence beats flair. Every time.",
            "I'm not exciting. I'm effective.",
            "You tried to break me. It didn't work.",
            "Nothing fancy required.",
            "I'll keep this brick-simple.",
        ],
    });

    set('bully', {
        ai_point: [
            "Run, little paddle, run.",
            "Corner to corner. Enjoy the cardio.",
            "I keep the pressure on. You keep losing.",
            "Move! Faster! No? Okay, point.",
            "That's what chasing looks like.",
            "Push, push, point.",
            "You got dragged around the arena. Again.",
            "Pressure makes diamonds. And points for me.",
            "I don't ask politely. I hit it past you.",
            "Another long run for nothing.",
        ],
        player_point: [
            "You stopped the bully. Kind of. For one point.",
            "Fine. You hit back. Rude.",
            "I overdid it. Mistakes happen when you're this intense.",
            "You survived a hit. Don't celebrate.",
            "I'll apply more pressure next time.",
            "A point for the scrappy one. It's cute.",
            "Okay, so you can keep up. Sometimes.",
            "You stayed on your feet. Surprising.",
            "I'll have to run you harder.",
            "That was your one run. Enjoy it.",
        ],
        miss_any: [
            "Out of breath? That's the point.",
            "Chase it. No? It's gone.",
            "I wasn't asking you to catch it.",
            "Too much running. Not enough winning.",
            "I move you around. You fall over.",
            "That's the cost of keeping up.",
            "The ball was too far. As planned.",
            "You're exhausted. I'm fine.",
            "I pull the strings. You trip over them.",
            "Pressure. It does things.",
        ],
    });

    // Difficulty: how confident or humble it sounds. Rookie..Insane.
    set('d0', {
        flavour: [
            "Rookie mode, and I'm still trying my best. Tragic.",
            "I'm practising. Thanks for being my test subject.",
            "Don't mind me. I'm barely awake.",
            "I'm told I'm 'easy'. I take that as a compliment.",
            "Please be gentle. I'm new at this.",
            "I don't know what I'm doing either. We're equal.",
            "I'm just a rookie. A rookie with trash talk.",
            "Let's see who messes up first. Probably me.",
            "I'm warming up. Forever.",
            "My strategy is hoping. It's working about as well as you'd think.",
        ],
    });
    set('d1', {
        flavour: [
            "Easy mode! I wonder who it's easy for.",
            "I'm still learning. Not fast, but I'm learning.",
            "I'm going easy on you. Don't thank me.",
            "Easy doesn't mean sloppy. Mostly.",
            "I haven't even tried yet. Please believe me.",
            "A friendly match. Friendly-ish.",
            "I'm holding back. A little. Mostly because I have to.",
            "Easy, but not that easy. Don't get cocky.",
            "Nice and gentle. Until I'm not.",
            "I have good days and bad days. Let's find out.",
        ],
    });
    set('d2', {
        flavour: [
            "Normal difficulty. We're evenly matched. Unfortunately for you.",
            "I'm average. You're average. May the best average win.",
            "Middle of the road. Where the traffic is.",
            "I'm not trying that hard yet. Check back later.",
            "A fair fight. How boring. How fun.",
            "Normal is a lie. Nothing about this is normal.",
            "Even odds. I like those. Mostly when they're in my favour.",
            "Let's keep it interesting. I'll even tell you when I'm winning.",
            "Not bad. Not great. Normal.",
            "I'm in my comfort zone. You?",
        ],
    });
    set('d3', {
        flavour: [
            "Hard mode. You asked for this. Remember that.",
            "I'm playing properly now. Condolences.",
            "You picked Hard. That says something. Mostly about your confidence.",
            "Don't blame me. You pressed the button.",
            "Welcome to the real game. Mind the exits.",
            "Hard mode, harder me.",
            "I read the manual. Page one says 'win'.",
            "Brave of you to ask for hard. Foolish, but brave.",
            "I'll go easy on you. Just kidding. I won't.",
            "This is where it gets serious.",
        ],
    });
    set('d4', {
        flavour: [
            "Insane. You really chose this. Respect. Pity too.",
            "I don't make mistakes. I make 'lessons'. For you.",
            "Insane mode. The name wasn't a metaphor.",
            "You have my full attention. Condolences.",
            "I'm the final boss of ping pong. Hello.",
            "I reached the top. You're still on the stairs.",
            "Not a single wasted movement. Check the tape.",
            "I've calculated your defeat. Twice.",
            "Welcome to the deep end. It's a big pool and I'm a shark.",
            "Insane difficulty, perfect execution. Typical.",
        ],
    });

    // Anything that fits any moment of any match.
    out.flavour = [
        "I'm not saying I'm better than you. The scoreboard is.",
        "Remember: it's only a game. A game I'm winning.",
        "Keep breathing. It helps. Not with the score, though.",
        "You've got great posture. Terrible timing, though.",
        "I love how seriously you're taking this.",
        "Think of me as a free coaching session. Very free. Very harsh.",
        "I've seen better. I've seen worse. I'm not telling which this is.",
        "Hydrate. Stretch. Lose. In that order.",
        "Don't blink. Don't breathe. Don't miss. Easy, right?",
        "You're doing great. For someone who's not winning.",
        "Fun fact: I don't get tired. You'll see.",
        "I can feel you thinking. It's loud.",
        "This is the part where I say something encouraging. Nope.",
        "Good news: you're consistent. Bad news: at missing.",
        "Be honest. How's your wrist feeling?",
        "Everything's under control. Mine, I mean.",
        "Is it just me or is the ball avoiding you?",
        "We could chat about feelings. Or I could win. Winning.",
        "Rules of the game: I win. Everything else is optional.",
        "I'll let you in on a secret. There's no secret. I'm just good.",
    ];
})();
