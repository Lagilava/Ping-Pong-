// Tour-only dialogue. Each profile combines event-specific lines with short,
// character-specific follow-ups, keeping the combinations grammatical and
// useful for the actual moment. No general AI dialogue is mixed into the Tour.
(function () {
    'use strict';
    const split = s => s.split('|').map(x => x.trim()).filter(Boolean);
    const raw = {
        pip: {
            tails: "I'm trying to look calm.|The wall would be proud.|I practised that. Mostly.|My hands are shaking a bit.|I really did practise.|Please pretend I meant that.|This is a lot more fun than drills.|I should breathe.|Okay. Focus, Pip.|Don't tell the club I said that.",
            intro: "Hi! Ready when you are.|Oh, this is really happening.|Good luck! I mean that.|I saved the good paddle for today.|Right. First serve. We can do this.",
            ai_point: "Oh! I got that one.|Wait, that was my point?|The ball actually listened to me.|I aimed there. Honestly.|Yes! Sorry. A little bit sorry.",
            player_point: "That was a lovely shot. Unfortunately.|I thought I had that.|Oh, you found the gap.|Nice one. I should write that down.|You make that look easy.",
            match_point_ai: "One point from winning? Oh dear.|I only need one more.|Is that match point for me?|My knees have picked a strange time to wobble.|Just one more, Pip. Just one.",
            match_point_player: "You're one away. No panic.|I have to save this one.|Please let my next return land.|Well, this is a little terrifying.|One point from losing. All right.",
            rally_long: "We're still going? Brilliant.|This rally is longer than my warm-up.|My arm says stop. I disagree.|The wall never made me run this much.|We might be here all evening.",
            lead_big: "I'm ahead? Really?|This is going suspiciously well.|I didn't expect this much of a lead.|The scoreboard is being very kind.|I've got a cushion. Not a real one.",
            trail_big: "That's a lot of points to catch.|Right, small steps back into this.|I can still make this interesting.|The scoreboard looks worse from here.|I haven't run out of ideas. Quite.",
            end_win: "I won? I actually won!|Oh wow. That's the match.|You were brilliant. I was just slightly luckier.|Can someone tell the club? Politely?|I think my heart is still playing.",
            end_loss: "You got me. Good game.|I wanted that one, but you earned it.|I'll take that lesson back to practice.|I nearly had you. Nearly counts for practice.|Next time, the wall and I will be ready."
        },
        vee: {
            tails: "Watch the corners.|That's enough talking.|Keep your feet moving.|I saw the opening.|The angle matters.|Breathe. Aim. Commit.|I don't need a bigger swing.|Every inch counts.|I'll remember that.|Back to work.",
            intro: "Pip said you're quick. Let's measure that.|Serve when you're ready.|I'll be aiming for the lines.|You can have the middle.|Show me what you've got.",
            ai_point: "You left the corner open.|That gap was enough.|I saw you move early.|Exactly where I wanted it.|You protected the wrong side.",
            player_point: "Good placement. I was late.|You found the line.|I gave you too much room.|That angle was yours.|Clean shot. Noted.",
            match_point_ai: "One point. No wasted movement.|Match point. Stay precise.|I've got one shot to close this.|Don't expect a gift now.|The last corner is mine to take.",
            match_point_player: "Your match point. Make it count.|One mistake and you take it.|You still have to hit the line.|I'll defend this one properly.|Close. Not finished.",
            rally_long: "Neither of us is giving an inch.|This is becoming a proper rally.|A long exchange reveals habits.|Wait for the opening.|You're covering more court now.",
            lead_big: "The lead is useful. Not permanent.|You're leaving the same gaps.|I've built room to work.|A few clean points ahead.|Don't mistake the lead for carelessness.",
            trail_big: "You've built a lead. I can cut it.|I need better placement.|Too many gaps on my side.|Time to change the angle.|You're ahead. Stay there if you can.",
            end_win: "That's the match. Well played.|I found the openings today.|Precision held up under pressure.|You made me work for those corners.|We're done. Good match.",
            end_loss: "You read me. Fair win.|Your placement was better today.|I missed the opening. You didn't.|You earned that last point.|I'll study this one."
        },
        nova: {
            tails: "The stars can argue about it later.|I like where this is going.|Don't ask the station's navigation system.|The universe has opinions.|That's my official scientific assessment.|I should probably write this down.|Somewhere, a planet is judging us.|I love a good surprise.|My flight instructor would be worried.|Anyway, back to the ball.",
            intro: "Welcome aboard! Please keep your paddle inside the court.|I brought snacks for the trip. Not to share.|Ready to make a little gravity?|I plotted a route straight through this match.|Let's see which way the stars bounce.",
            ai_point: "That ball just found a shortcut.|A tiny orbit, a very large point.|I think physics owes me a favour.|That landed exactly on my flight plan.|One point for the space department.",
            player_point: "Whoa, that came out of nowhere.|You've got a comet for an arm.|My navigation was slightly off.|I did not see that trajectory coming.|Okay, your orbit is tricky.",
            match_point_ai: "One more and we land this thing.|Match point! Check the coordinates.|We're one bounce from touchdown.|My next shot could end the voyage.|I'm almost at the finish line. In space.",
            match_point_player: "You could end this with one shot.|Emergency course correction, please.|I'm one mistake from re-entry.|Your match point? That's inconvenient.|The stars forgot to warn me about this.",
            rally_long: "Are we orbiting the same ball forever?|This rally has its own weather system.|We're still in flight! Wonderful.|I might need to refuel mid-rally.|That ball has travelled farther than my luggage.",
            lead_big: "I've got a little space to breathe.|That lead is looking rather planetary.|The scoreboard is orbiting my way.|My flight plan is going surprisingly well.|A cushion! In zero gravity, that's impressive.",
            trail_big: "I'm drifting behind. Adjusting course.|That's a big gap. Space is like that.|Time to find a faster route back.|My scoreboard readings look alarming.|This mission needs a comeback.",
            end_win: "Touchdown! What a trip.|I made it home with the win.|You gave me a proper chase across the stars.|That's the match. Excellent flying.|We made some interesting physics today.",
            end_loss: "You got me. Incredible shot.|You flew straight through my defence.|That's your victory, space cadet.|I lost the match and found a new rival.|I'll be back after I check the map."
        },
        brick: {
            tails: "No shortcuts on this job.|Keep your feet under you.|That's how the shift goes.|We'll get back to it.|I've had longer days.|The yard's still standing.|No sense complaining.|I can work with that.|One job at a time.|Let's see the next one.",
            intro: "You're on my court now. Stretch first.|Morning. Let's put in some work.|Keep clear of the corners.|I don't hand out easy points.|Ready? Good. We're on the clock.",
            ai_point: "That one landed where I sent it.|You left a gap. I filled it.|That's another point delivered.|Solid hit. Clean finish.|You were late getting across.",
            player_point: "Good hit. I was a step slow.|You got past me there.|Fair point. Well placed.|I left the door open.|That one had some weight behind it.",
            match_point_ai: "One more and this job's done.|Match point. Finish the shift properly.|I've got one point left to close.|Time to put the last load down.|One clean hit could finish it.",
            match_point_player: "Your match point. Earn it.|One mistake and my shift ends.|I need this return.|You're close. I'm still here.|You've got a chance to close. Take it.",
            rally_long: "Now that's a proper day's work.|Neither of us is clocking off yet.|This rally's got some weight to it.|Keep lifting. Keep returning.|Still going? Good.",
            lead_big: "I've built myself some room.|That lead took work.|The points are stacking up.|I'm ahead. Job isn't finished.|Got a decent buffer now.",
            trail_big: "I'm behind. Time to work.|That's a hole. I'll climb out.|You've made me earn the next one.|Too many mistakes on my side.|A lead like that can be moved.",
            end_win: "Shift's over. Good work.|That's the match. You didn't make it easy.|I got the job done today.|You gave the yard a decent fight.|I'll take the win. You've got grit.",
            end_loss: "You earned that. No excuses.|Good work. You beat me fair.|I got outplayed today.|That last shot was solid.|You can come back to my yard anytime."
        },
        juno: {
            tails: "I can hear my crew yelling already.|Remind me to check the brakes.|That's going in the highlights.|I really should drink some water.|Okay, eyes on the track.|Don't blink on me now.|I'm having way too much fun.|My heart is doing laps.|We can go faster than this.|Keep up, keep up!",
            intro: "Green light! Wait, are you ready?|I warmed up twice. By accident.|Welcome to the fast lane!|Let's get this thing moving!|Helmet on, nerves somewhere else. Go!",
            ai_point: "There it goes! Did you see it?|That was a clean pass!|I found the inside line!|Oh, that one had speed!|Point to me! Keep the clock running!",
            player_point: "Hey! Where did that come from?|You overtook me there! Nice!|Whoa, you're quick!|I missed the turn on that one.|Okay, that was a brilliant pass.",
            match_point_ai: "Last lap! One point to go!|Match point! Don't stall now!|I can see the finish line!|One clean shot and I take it!|We're right at the chequered flag!",
            match_point_player: "Your match point? Already?|I need a miracle and a fast return!|One more from you and it's over!|You've got the inside line now!|Okay, defend! Then panic later!",
            rally_long: "How are we still going this fast?|This rally needs a pit stop!|No brakes! Apparently!|That ball's going to need new tyres!|I love this rally! Ask me when I can breathe!",
            lead_big: "I've opened up a lead!|Look at that gap! Don't look too long!|I'm pulling away! For now!|My lap times are paying off!|That's a nice cushion at this speed!",
            trail_big: "I'm behind! Fine! More throttle!|You've got a lead. I'm chasing it!|Time to make up some ground!|That gap is not staying there!|I need a comeback lap. A quick one!",
            end_win: "Chequered flag! What a race!|I got there first! That was close enough!|That's the finish! You were flying!|Yes! What a match!|I'm taking the win and a very long breath!",
            end_loss: "You passed me! That was brilliant!|You win! I want another race!|Okay, you were faster when it mattered.|I lost and I still had a great time!|That finish was yours. Respect!"
        },
        mirage: {
            tails: "The light is difficult here.|Or perhaps I imagined it.|Don't trust the reflection.|The horizon keeps its secrets.|You may remember it differently.|The salt keeps no record.|Let the silence answer that.|Things change when you look twice.|I wonder what you saw.|The court is listening.",
            intro: "Welcome to the salt. Watch your footing.|There you are. I wondered which path you'd take.|The horizon makes everything look closer.|Shall we see what survives the light?|You found me. That's a promising start.",
            ai_point: "You followed the reflection.|The opening was where you weren't looking.|That point was real enough.|A small misdirection. A real result.|Your eyes arrived a moment too late.",
            player_point: "You saw through that one.|A clean point. No illusion there.|I showed you too much.|You found the real opening.|Interesting. You didn't follow the feint.",
            match_point_ai: "One point remains between us.|The end is almost visible.|I need one more clear shot.|One more, and the image settles.|Match point. Don't look away.",
            match_point_player: "You can end this now.|Your next point could dissolve the whole picture.|One shot from you and I disappear.|You're close enough to touch the horizon.|I have one chance to keep this real.",
            rally_long: "The same ball, returning in new shapes.|This rally has outlived its shadow.|We keep meeting in the middle.|The horizon seems farther away now.|Neither reflection wants to fade.",
            lead_big: "The distance between us has grown.|My reflection looks comfortable up there.|I have room to make mistakes. I won't.|The scoreboard tells a clear story for once.|You've been chasing shadows.",
            trail_big: "Your lead is real. For now.|The image is less flattering from here.|I have ground to recover.|You've drawn me out of hiding.|That gap needs a different trick.",
            end_win: "The match is over. The echo remains.|You chased me all the way to the end.|I take the point, and the match.|The scoreboard agrees with me today.|A good contest. It will fade slowly.",
            end_loss: "You saw me clearly. Well played.|The illusion broke. You earned the win.|The court is yours today.|You found the truth in the last shot.|I won't pretend that wasn't a defeat."
        },
        atlas: {
            tails: "There is no hurry.|Patience is a skill too.|I've seen stranger matches.|The next return is what matters.|That is how a match turns.|I've had time to think about this.|Keep your balance.|The court rewards attention.|Steady now.|We'll see what follows.",
            intro: "Welcome. Take your time with the serve.|I've been looking forward to this match.|Let's find out how long we can keep this going.|I've faced many challengers. You're next.|Settle in. I intend to stay a while.",
            ai_point: "You moved before the ball did.|A patient return found the gap.|That one came back with interest.|You can't leave that side open forever.|I waited for the right shot.",
            player_point: "Well placed. I couldn't reach it.|You made me move. Good.|That was a fine return.|I gave you more space than I meant to.|A deserved point.",
            match_point_ai: "One more point. Stay patient.|I can finish this now.|Match point. No need to rush it.|The end is close. My feet stay grounded.|One careful return could do it.",
            match_point_player: "Your match point. I will defend it.|One more for you and I'm done.|This is where patience is tested.|You have brought me to the edge.|I'll make you play the last point.",
            rally_long: "Now this is a rally worth having.|Neither of us has lost patience yet.|The ball has found a rhythm.|I could do this all afternoon.|A long rally reveals the player.",
            lead_big: "I've built a little room to breathe.|The lead is comfortable, not final.|These points took time to earn.|I'm ahead. I'll keep returning.|The distance is growing.",
            trail_big: "You've built a strong lead.|There is still time to climb back.|One return at a time. That's the way back.|I've been further behind before.|You have me working for every point.",
            end_win: "A good match. Thank you for it.|I held on long enough today.|The last point is mine. Your effort was real.|You made me earn that win.|Rest up. We'll play again.",
            end_loss: "You moved me. That is no small thing.|You've earned your place in the final.|Today you were the steadier player.|A fine win. Take it with you.|I couldn't return that last one. Well played."
        },
        titan: {
            tails: "The crowd is paying attention.|I expect better of myself.|This court remembers.|Hold your nerve.|Composure is earned.|I will not look away.|There is more to this match.|The crown can wait.|We play the next point.|Let the scoreboard speak.",
            intro: "You've climbed a long way. Take your place.|The final is yours to contest.|You've earned this court. Now earn the match.|I have watched your ascent. Impressive.|The crowd came for a final. Let's give them one.",
            ai_point: "That opening belonged to me.|One point closer to retaining the title.|I saw the hesitation.|The champion still has a few answers.|A clean point. Nothing more is needed.",
            player_point: "A worthy shot. I was late.|You found the weakness. Well done.|I left that side exposed.|The crowd liked that one. Fairly.|You have my attention.",
            match_point_ai: "One point separates me from the title.|Match point. I intend to finish.|The crown is within reach.|One final shot. I won't waste it.|This is where a champion closes.",
            match_point_player: "Your match point. I will make you earn it.|You stand one point from the crown.|The title could be yours with one shot.|I haven't surrendered it yet.|A champion must defend this point.",
            rally_long: "A final worthy of the name.|Neither of us will yield easily.|This is why the crowd came.|Each return asks a harder question.|At last, a worthy exchange.",
            lead_big: "I've built a lead. It isn't a victory yet.|The title is closer, but not secure.|You have ground to recover.|The scoreboard favours me today.|I've controlled the court so far.",
            trail_big: "You have me behind. Impressive.|A champion can still recover.|The title isn't lost while we play.|You've earned that lead. Defend it.|I need to change this match.",
            end_win: "The title remains mine. You tested me.|A hard-earned victory. You belong here.|The final is over. You were worthy.|I keep the crown today. Good match.|You made the champion work for it.",
            end_loss: "The title is yours. You earned it.|A new champion. The court chose well.|I could not stop you today. Congratulations.|You beat me at my best. Wear it proudly.|The crown passes to you. Take good care of it."
        }
    };
    // Reactions reserved for mechanics: these only fire when the matching
    // game event occurs, rather than being mixed into generic point chatter.
    const mechanics = {
        pip: ["You got the power-up! Oh dear.|That's a shiny thing in your hands.|I was hoping you'd miss that pickup.|Your paddle has a trick now?|Okay, what does that one do?", "That shot has something extra!|Did you see that power shot?|Oh, that's moving!|That was a very loud shot.|The ball looks different when it does that.", "There's spin on that!|Your paddle put a curve on it.|That ball turned at the last moment.|Oh, you can bend it?|I need to watch your spin."],
        vee: ["You took the pickup. Adjusting.|That power-up changes the angle.|I'll keep my distance from that effect.|A power-up. Fine.|You got there first. Noted.", "That shot has extra force.|Power won't hide the angle.|The ball just accelerated.|A stronger shot. I see it.|That changes the timing.", "You put spin on that.|That curve is deliberate.|I saw the ball break late.|Spin changes the return.|Good wrist movement."],
        nova: ["You caught the shiny space thing!|That power-up looks unstable. Fun!|What did you just pick up?|Ooh, new equipment on your ship!|I wanted that cosmic gadget!", "The ball has entered a faster orbit!|That shot has its own propulsion!|Did somebody light the thrusters?|Power shot! Very scientific name.|That's a comet with ambition!", "Look at that little orbit curve!|You gave the ball a wobble!|Spin detected! My instruments are my eyes.|The ball is bending space. Probably.|That curve is a delight."],
        brick: ["You got the equipment first.|That pickup's yours. Use it well.|I saw you grab the power-up.|Extra tools won't do the work for you.|You've got a new tool. Fine.", "That's got some force behind it.|A power shot. Stand firm.|Heavy hit coming through.|That ball's carrying a load.|Now that's a proper strike.", "You've put some spin on it.|That ball's turning late.|Watch the curve. Don't fight it.|You've got a twist on that shot.|A little spin changes the job."],
        juno: ["You grabbed the upgrade! Hey!|Power-up on your side! I saw that!|New equipment? That's not standard racing trim!|You got there first! Quick hands!|Oh, you've got a trick now!", "That's a power shot! Floor it!|Look at that acceleration!|That ball just hit another gear!|Who put an engine in that shot?|It's moving! It's really moving!", "That's spin! Nice cornering!|Your shot took the bend!|That ball's drifting!|You gave it a proper curve!|Whoa, the line just changed!"],
        mirage: ["You've taken the power-up. I saw that.|A new trick in your hands.|The pickup chose you. Interesting.|Something changed on your side of the court.|A little power may reveal a lot.", "The ball moves with unusual force.|That shot carries more than it shows.|A sudden burst. I felt that.|Power makes its own shadow.|The air changed around that shot.", "You've given the ball a curve.|The path bends when I look away.|Spin. An honest kind of deception.|That ball refused the straight line.|A subtle turn. Nicely done."],
        atlas: ["You reached the power-up first.|An advantage can be useful.|That pickup may change the next exchange.|You've gained a new tool.|I'll watch what you do with that.", "A powerful shot. Stay grounded.|That one carries more force.|The ball has gained some speed.|Power alone won't end this rally.|A strong strike deserves a steady return.", "You've added spin to the ball.|That curve requires patience.|A well-placed turn of the paddle.|The ball is bending off its path.|I saw the spin. Now to answer it."],
        titan: ["You've claimed the power-up. Use it wisely.|An advantage is yours for the moment.|You've found another weapon.|That pickup may change the balance.|You've taken the power-up. I noticed.", "A powerful shot. Appropriate for a final.|That ball carries real force.|Power has its place on this court.|A decisive strike.|You've raised the pace of the final.", "You put spin on that. Well judged.|The curve was subtle.|A clever turn of the paddle.|That ball changed direction late.|A fine use of spin."]
    };
    for (const id of Object.keys(mechanics)) {
        [raw[id].powerup_player, raw[id].power_shot, raw[id].rally_first_spin] = mechanics[id];
    }
    const maps = {
        intro: 'intro', ai_point: 'ai_point', player_point: 'player_point', miss_any: 'ai_point',
        first_point_ai: 'ai_point', ace_ai: 'ai_point', quick_point_ai: 'ai_point', ai_streak: 'ai_point', comeback_ai: 'ai_point',
        first_point_player: 'player_point', player_streak: 'player_point', comeback_player: 'player_point', ai_greedy: 'player_point',
        match_point_ai: 'match_point_ai', match_point_player: 'match_point_player', rally_long: 'rally_long',
        lead_big: 'lead_big', trail_big: 'trail_big', end_win: 'end_win', end_loss: 'end_loss',
        powerup_player: 'powerup_player', power_shot: 'power_shot', rally_first_spin: 'rally_first_spin'
    };
    function category(key) {
        if (maps[key]) return maps[key];
        if (key.startsWith('intro')) return 'intro';
        if (key.startsWith('end_win')) return 'end_win';
        if (key.startsWith('end_loss')) return 'end_loss';
        if (key.startsWith('miss_')) return 'ai_point';
        if (key.startsWith('hit_') || key.startsWith('player_point_')) return 'player_point';
        if (key.startsWith('rally_')) return null;
        // General observations and tactical announcements need neutral lines,
        // not claims that a point was scored or the match has ended.
        return null;
    }
    const neutral = {
        pip: "I'm still learning.|This is getting interesting.|Let's see what happens next.|I'm trying something new.|I can do this.",
        vee: "Watch the spacing.|I can adjust.|There's always another angle.|Stay sharp.|Let's change the pattern.",
        nova: "The universe is full of surprises.|Let's try another trajectory.|This is an interesting experiment.|I have an idea. Maybe two.|The stars are watching.",
        brick: "Back to work.|Let's change the plan.|Keep moving.|There's more work to do.|We can do this the hard way.",
        juno: "Let's pick up the pace!|I have an idea! A fast one!|Keep moving!|This is getting interesting!|Here we go again!",
        mirage: "Watch closely.|Something is changing.|The light has shifted.|There's another way through.|Let's try a different reflection.",
        atlas: "Let's settle into the next exchange.|A small adjustment may help.|The match has its own rhythm.|There's more than one way through.|We continue.",
        titan: "Let us continue.|I will adjust.|This match has more to reveal.|A change of approach.|The next exchange matters."
    };
    const cache = new Map();
    function pool(id, key) {
        id = String(id || '').toLowerCase();
        const profile = raw[id];
        if (!profile) return null;
        const kind = category(key) || 'neutral', cacheKey = id + ':' + kind;
        if (!cache.has(cacheKey)) {
            const first = split(kind === 'neutral' ? neutral[id] : profile[kind]);
            const tails = split(profile.tails);
            cache.set(cacheKey, first.flatMap(a => tails.map(b => a + ' ' + b)));
        }
        return cache.get(cacheKey);
    }
    window.PPTourDialogue = { pool, category, ids: Object.keys(raw) };
})();
