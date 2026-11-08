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
    // Fully written opening and result lines keep the most visible moments natural.
    // end_win and end_loss are from the rival's perspective.
    const bookends = {
     pip: {
      intro: "Hi! You're the new challenger, right? I've been practising my serious face. This isn't it.|I saved this paddle for a proper match. Please don't make me regret it immediately.|The wall says I'm ready. The wall doesn't actually talk, but it hasn't missed a return all week.|Good luck! I mean, not too much luck. Enough for a nice game.|I told everyone at the club I'd stay calm today. Please don't tell them how my hands look.|I've been looking forward to this. And dreading it. Mostly looking forward to it!",
      rematch: "You're back! I was hoping you'd ask. I even remembered to bring water this time.|Another match? Great! I've only replayed our last one in my head about a hundred times.|The wall and I have been working on something. I hope it works against someone who moves.|I kept your spot on the court open. Okay, nobody else booked it, but still.|I thought of a better opening line after you left. I've forgotten it again.|Hi again! I promise I've improved. The wall can provide a reference.",
      afterLoss: "You won last time, so I asked the club for advice. They mostly said 'move your feet'.|I've practised the shots you beat me with. I still don't like them, for the record.|Last time was rough. But I stayed late, and I think I'm ready to try again.|You were better last time. I'm hoping the gap got a little smaller.|I owe you a proper rematch. And I owe the wall an apology for hitting it so hard.|You got me before. This time I'll at least make you work for it!",
      end_win: "I won! Wait, really? That was such a good match. Can we tell the club it was close?|Oh wow, I did it. You had me worried the whole way through.|That's my point? That's the match? Sorry, I need a second to catch up.|You were brilliant. I'm going to enjoy this win for at least an hour.|I can't believe the practice worked. The wall is going to be unbearable about this.|Good game! I was trying so hard not to look nervous. How badly did I fail?",
      end_loss: "You got me. I really wanted that one, but your last shot was lovely.|Good game. I'll be disappointed for five minutes, then probably ask for a rematch.|I thought I had a chance there! You were just better when it counted.|All right. Back to practice. The wall's going to hear about you.|You earned that. Could you show me how you hit that last one sometime?|I lost, but I didn't freeze up. That's progress. You're still getting a rematch, though."
     },
     vee: {
      intro: "Pip says you're difficult to read. Good. I was getting bored.|You cover the middle. I'll see what you do about the corners.|Don't watch my paddle. Watch where the ball lands. If you have time.|I don't need a long warm-up. Serve.|Everyone has a side they protect a fraction too late. Let's find yours.|You've made it through the club. Now show me the shots that got you here.",
      rematch: "Back again? I've found a few angles we didn't use last time.|I remember your habits. Let's see which ones you've changed.|You've had time to prepare. So have I.|Good. A second match tells me more than the first.|I kept notes. You should be worried about how short they are.|You're still standing. I respect the persistence. Don't make me repeat that.",
      afterLoss: "You beat me by reading the corners. I won't give you the same pattern twice.|Last time I aimed where you were going. You've had time to change. So have I.|I reviewed the match. The result was clear. The next one won't be as simple.|You found the gap in my game. I've been working on it.|I don't make excuses for a loss. I make adjustments.|You earned that win. Now try it against the version of me who remembers it.",
      end_win: "That's the match. You covered more ground than most. Not quite enough.|You adjusted well. I found the last opening first.|I took the corners, but you made me earn them. Good game.|Your movement improved as we played. Mine held up when it mattered.|Clean finish. You were a better opponent than I expected.|I got the win. Next time, make me find a different way through.",
      end_loss: "You read the final shot. I have no argument with that.|That angle was excellent. Yes, I'm admitting it.|You found the space I thought I'd covered. Fair win.|I had a plan. You made me change it too late.|You earned this one. Don't expect the same openings next time.|Well played. I don't say that often, so don't make a ceremony of it."
     },
     nova: {
      intro: "Welcome to Dock Seven! If anything floats away, it's probably supposed to.|I checked the stars for a prediction. They were busy, so we'll have to play.|I travelled a very long way for this match. Please tell me you brought snacks.|The station's gravity is mostly reliable. I make no promises about my shots.|I've charted three possible outcomes. In one of them, we stop for lunch first.|You made it! I was afraid my directions would send you to the wrong moon.",
      rematch: "You're back in orbit! I kept our last match in the flight recorder.|The universe brought us together again. Or you pressed the rematch button. Both are exciting.|I've been experimenting since we last played. The safety officer has questions.|Another match? Excellent. I haven't even unpacked my paddle.|I told the crew about you. Half of them believe me.|I mapped our last match. There's a suspicious squiggle where you surprised me.",
      afterLoss: "You sent my last game into a new orbit. I've been studying the trajectory ever since.|I asked the station computer how to beat you. It suggested more practice. Rude, but fair.|That win of yours travelled fast. Even the crew in the next sector heard about it.|You got me last time. I've recalibrated my paddle and most of my confidence.|I've returned from a very important mission: figuring out how you landed that shot.|Your last victory was real. I checked the flight recorder twice. Let's try again.",
      end_win: "Touchdown! You made that journey much more interesting than the flight plan.|I got the win! The station's going to hear about this, probably in song.|What a match. You nearly knocked me out of orbit more than once.|Victory! I should thank gravity, although it was only helping some of the time.|That's the match! You can have a snack now. You've earned one.|I landed the last shot. Barely. Let's call that an expert manoeuvre.",
      end_loss: "You got me! That last shot belongs in a museum of impossible trajectories.|The stars were wrong about this one. Or I read them upside down. Either way, well played.|You win! I'm putting that match in the flight recorder for the crew to see.|I lost, but I learned something new about your orbit. Rematch someday?|That was brilliant. I think my paddle is still trying to work out where the ball went.|You sent me spinning. Fair and square. I hope we cross paths again."
     },
     brick: {
      intro: "You're on the yard court. Watch your footing, and don't expect me to slow down.|I finish my shift, I play a match. Today you're the match.|You look ready. Good. I don't like wasting court time.|There's no secret to my game. I hit hard, I move, and I keep doing both.|The yard crew's watching. Give them something better than another safety briefing.|You got this far, so you can handle a proper game. Let's get to work.",
      rematch: "Back for another shift? Good. I was just getting warmed up.|I remember you. You didn't make the last match easy.|The yard's open. You've already proved you belong on the court.|You're back. I had a feeling that wouldn't be our last game.|I've worked on a few things since we met. You'll notice.|I kept the court clear. Let's see what you've brought this time.",
      afterLoss: "You beat me last time. I went back to basics and put the hours in.|I don't blame the floor for that loss. I wasn't good enough. Today might be different.|The crew won't let me forget your win. Fair enough. Let's give them a rematch.|You got past me. I've been working on making that harder.|Last time you did the better work. I'm here to change that.|I watched the replay. You earned it. Now I know what I need to fix.",
      end_win: "That's the shift. You put in honest work out there.|I got the result, but you didn't make it cheap. Good game.|Job done. You've got a strong arm and a stubborn streak. I like both.|That's my win. You can come back to this yard whenever you're ready.|You made me work for every point. That's the kind of match I respect.|I held on. If you're still up for it, we can do this again sometime.",
      end_loss: "You beat me fair. I won't dress it up any other way.|That's good work. You found a way through and you stuck to it.|I lost. You earned it. The crew can stop looking so surprised.|Your last shot was solid. Couldn't get there in time.|You've got the result. Take the rest of the day off. You've earned it.|I don't like losing, but I respect how you played. Come back for a rematch."
     },
     juno: {
      intro: "You're here! Great! I nearly started without you. Not on purpose. Probably.|Welcome to the tunnel! It's loud, it's fast, and I promise I know where the brakes are.|I've warmed up, checked my gear and forgotten what I was going to say. Ready?|Everyone keeps telling me to slow down. Nobody here is going to say that, right?|I heard you were fast. That's either excellent news or a problem for me. Let's find out!|We're racing to the first point! Actually, the whole match. You know what I mean!",
      rematch: "You're back! I was still talking about our last match when you walked in!|Another round? Yes! I didn't even take my helmet off!|I've got a new line through the court. Want to see it? You don't have much choice!|I watched the replay at double speed. It still wasn't fast enough!|I've been waiting for this rematch! Not patiently, obviously!|You came back! My crew owes me a snack. They said you'd need more time!",
      afterLoss: "You beat me last time, so I retuned everything. Paddle, footwork, playlist. Especially the playlist.|I watched your winning shot six times. I still don't like it, but I know where it went!|That loss stung! For about a minute. Then I wanted the rematch!|You got past me fair and square. I've been working on not letting that happen again!|My crew says I should be calmer after losing. My crew is wrong. Ready?|You took the last race! I brought a better plan and an unreasonable amount of confidence!",
      end_win: "Chequered flag! You kept me moving the entire match. That was fantastic!|I won! Wait, give me a second. I need air before I celebrate properly!|That finish was wild! You nearly caught me, and I mean that as a compliment!|Yes! My crew saw that, right? Please tell me somebody recorded it!|You were quick! I was just quick enough at the end!|That's the match! Can we do it again after I find my water bottle?",
      end_loss: "You beat me! That last shot was ridiculous! I need to see it again!|Okay, you were faster when it mattered. I hate how impressive that was!|You got the flag! Give me a minute, then give me a rematch!|I lost? Wow. Great finish! Terrible result for me, but great finish!|You found another gear and I couldn't catch you. Nicely done!|That was amazing! I'm disappointed, obviously, but mostly I want to play again!"
     },
     mirage: {
      intro: "You found the court. That's harder than it looks in this light.|The salt reflects everything except intentions. Shall we begin?|You can follow my paddle, or you can follow the ball. Choose carefully.|I've heard about you. The horizon carries stories farther than you'd think.|Nothing on this court is hidden. That doesn't mean it's easy to see.|The light changes quickly here. Try not to mistake the reflection for the shot.",
      rematch: "We meet again. You look less certain of what you're seeing. That's sensible.|You returned. I wondered whether our last match would feel like a dream.|I remember your eyes following the wrong reflection. Perhaps you've learned.|The salt has changed since we last played. Or perhaps only we have.|Another match. This time, try looking where I'm not.|I kept the memory of our last game. It's sharper than most.",
      afterLoss: "You saw through me last time. I've had time to consider what I revealed.|That was no illusion. You beat me. I prefer an honest rematch.|I replayed your winning shot until even the reflection stopped lying.|You found the real opening before I could close it. I won't forget that.|Last time the horizon belonged to you. Let's see where it falls today.|I lost. There's no trick in saying it. The interesting part is what happens next.",
      end_win: "The last point was real. You can trust the scoreboard, if nothing else.|You followed me a long way through the reflections. Not quite far enough today.|It's over. The light will change, but the result will remain.|I take the match. You made it harder to disappear than I expected.|You nearly caught me. I rather enjoyed that.|The court is quiet again. Thank you for making it interesting.",
      end_loss: "You saw the real shot. I have nowhere to hide that result.|Well played. Even a mirage has to yield to a clear eye.|The match is yours. I won't pretend it happened to someone else.|You found me in the confusion. Not many do.|There was a moment I thought you'd follow the reflection. You didn't.|You've earned a clear victory. I hope you remember it as clearly as I will."
     },
     atlas: {
      intro: "Welcome to centre court. Take a breath; this match will still be here when you're ready.|I've seen many challengers reach this stage. Each one teaches me something.|You have the first serve. There's no need to rush it.|I prefer a long match to a quick promise. Let's see what you bring.|You've come a long way. I won't make the rest of it easy, but I'll make it worthwhile.|A good opponent changes how the court feels. Let's find out what kind you are.",
      rematch: "Welcome back. I remember your determination more than the score.|Another match? Good. I was hoping we'd continue the conversation with our paddles.|You look more settled than last time. That can make a difference.|I've kept practising. Age is no excuse to stand still.|We know each other's game a little better now. Patience will matter more.|You returned. That tells me more about you than the last result did.",
      afterLoss: "You broke through last time. I've thought carefully about where I stood and why.|I was beaten by a better player that day. I'd like to find out about today.|Your last win reminded me that patience must be paired with movement.|I haven't forgotten the shot that ended our match. I hope you've brought new ones.|You earned the result. I went home, rested, and returned to practice.|I lost, and the court remained standing. That's comforting. Shall we play again?",
      end_win: "You kept coming back. That is a quality worth carrying into your next match.|I outlasted you today, but you tested every part of my game.|A good match. The final point was mine; the effort belonged to both of us.|You made me move more than I expected. My knees may mention it tomorrow.|I've taken the win. Don't mistake that for a lack of respect.|You pushed patiently and played well. Today I had one more return in me.",
      end_loss: "You moved me when it mattered. You have earned your place in the final.|That was a fine match. I couldn't find an answer to your last shot.|You've beaten me with patience as well as skill. Carry both forward.|I gave you everything I had. Today, that wasn't enough. Well played.|The court is yours. Go on to the final, and don't be afraid of it.|I have outlasted many opponents. Today you outlasted me. That's worth remembering."
     },
     titan: {
      intro: "You have crossed every court to stand here. That deserves respect. The title must still be earned.|They told me a challenger was coming. I prefer to judge for myself. Take your place.|This crowd expects a coronation. Give them a final worth remembering instead.|You've beaten everyone in your path. I intend to make the last step the hardest.|The crown has weight. Before you ask for it, show me how you carry pressure.|Welcome to the final. I will give you my best, and I expect nothing less in return.",
      rematch: "You've returned to the final. Good. A title should be tested more than once.|I remember our last match. So does everyone in these stands.|Another final between us. Let's give the crowd a reason to stay quiet at the end.|You know what this court demands now. I expect you to bring more than you did before.|I wondered whether you'd return. I'm glad you answered by stepping onto the court.|We have unfinished business. Let us settle it with the paddle, not the crowd.",
      afterLoss: "You took the title from me. I won't diminish your victory by calling it luck.|I have watched the final again. You were the better player. I intend to close the distance.|The crown is yours to defend now. I know precisely how heavy that feels.|You beat the champion I was. Today you face the one who learned from it.|I never expected defeat to teach me so much. Thank you. Now let's play.|The crowd remembers your victory. So do I. Let us see what they remember tonight.",
      end_win: "The title remains mine. You made me defend it with everything I had.|I take the crown today. You have more than earned your place on this court.|That was a final worthy of the crowd. You have my respect.|I found the last point, but you forced me to find it. Remember that.|The championship is mine for now. I suspect we'll meet here again.|You challenged me as few have. The result is mine; the honour is shared.",
      end_loss: "The title is yours. You earned it point by point, and I will not pretend otherwise.|A new champion stands on this court. Wear the crown more lightly than I did.|I gave you my best. You found something better. Congratulations.|The crowd came to see a champion. Today, they saw you become one.|You took the final shot without hesitation. The title belongs to you.|I thought the crown made me champion. You reminded me that the play must come first."
     }
    };
    
    const cache = new Map();
    function pool(id, key) {
        id = String(id || '').toLowerCase();
        const profile = raw[id];
        if (!profile) return null;
        const bookend = bookends[id]?.[key] ? key : category(key);
        if (bookends[id]?.[bookend]) {
            const bookendKey = id + ':bookend:' + bookend;
            if (!cache.has(bookendKey)) cache.set(bookendKey, split(bookends[id][bookend]));
            return cache.get(bookendKey);
        }
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
