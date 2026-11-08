// Individually written, event-specific Tour dialogue. Result keys use the
// rival's perspective: end_win is a rival victory; end_loss is a player victory.
(function () {
'use strict';
const split = s => s.split('|').map(s => s.trim()).filter(Boolean);
const voices = {
pip:{
intro:"Hi! I'm Pip. I practised saying that without sounding nervous. How did I do?|You're the new challenger? Great! The wall's been my opponent all week and it never talks back.|I saved my best paddle for today. It's also my only paddle, so no pressure.|Good luck! I mean, don't have all the luck. Leave some for me.|I told the club I'd make them proud. Nobody said I had to look calm doing it.|You made it! I was hoping someone would turn up before I finished warming up.",
rematch:"You're back! I brought water this time and everything.|I've thought about our last match a lot. Maybe too much.|Want to play again? The wall was getting tired of my stories about you.|I kept practising after you left. Want to see what I've learned?|I remembered your serve. I hope that's helpful rather than terrifying.|I'm glad you came back. The club's more fun with someone to play.",
afterLoss:"You beat me last time. I asked the wall for advice, but it's being very quiet.|I practised the shot you got me with. I'm still not sure how you did it.|I was upset after our last match. Then I started counting the things I could learn.|You won fair and square. I'm hoping I can make it closer this time.|My notebook has a whole page about our last game. Some of it is even useful.|I'm still a little scared of your backhand. That's why I want another go.",
end_win:"I won? I actually won! Sorry, I need a second.|That was my last point? Oh wow. You were brilliant, by the way.|I did it! I'm telling the club. Carefully. I don't want to sound too smug.|Good game! My hands can stop shaking now. They probably won't.|I got lucky on a couple of those. I'm still proud of the rest.|You made me run more than the wall ever did. Thank you. I think.",
end_loss:"You got me. That last shot was really good, which is annoying.|I wanted that win. But I also want to know how you played that corner.|Okay. I'm disappointed. Give me a minute and I'll probably ask for a rematch.|You were better today. I'll see if I can change that with practice.|The wall and I have work to do. It's going to be a long evening.|Good game. Could you show me that last shot sometime? After I've recovered.",
ai_point:"Oh! That actually worked!|I aimed there! Honestly!|I got there in time!|Point to me? I should act normal.|Yes! Sorry. Not that sorry.|The wall taught me that one.|I didn't think you'd miss it!|My hands stopped shaking for a second.",
player_point:"That was really good. Unfortunately.|I left the whole side open, didn't I?|I thought I had that!|You're much harder to read than a wall.|Okay, that one's going in my notebook.|You made that look easy.|Where did it go? Oh. Behind me.|I should've moved sooner.",
match_point_ai:"One more? Oh dear.|Match point for me? Breathe, Pip.|My knees picked a terrible time to wobble.|I can win this on the next shot.|Please let me remember how to serve.|Just one more. I can do one more.",
match_point_player:"You're one away. No panic.|I need to save this one.|Please let me get the next return.|Well, now I'm properly nervous.|One mistake and that's it.|Okay, feet first. Then paddle.",
rally_long:"We're still going!|This is longer than practice!|My arm's tired but I'm not stopping.|You keep getting it back!|The wall never made me run this much.|I don't want this rally to end.",
lead_big:"I'm ahead by that much?|Is the scoreboard working?|This is going better than practice.|I've never had a lead like this.|Don't look at the score, Pip. Too late.",
trail_big:"That's a lot to catch up.|One point at a time, Pip.|You've got quite a lead.|I haven't given up yet.|I need to stop giving you that side.",
powerup_player:"You got the power-up!|What does that one do?|I was hoping to reach that first.|You've got a trick now?|Oh, that's on your side.",
power_shot:"That ball is moving!|That was a very big hit.|Was that supposed to be so fast?|I felt that from here.|Please don't hit me with it.",
rally_first_spin:"Oh, you can make it curve?|That ball changed direction!|You put spin on it!|I wasn't ready for the bend.|How did you make it turn?",
neutral:"I'm trying not to overthink this.|Okay, eyes on the ball.|My coach would have notes.|This is more fun than drills.|Let's see what happens next.|I'm still figuring you out."
},
vee:{
intro:"Pip said you'd come through. He also said I should be nicer. Let's play.|I'm Vee. The corners are mine until you prove you can cover them.|You made it past Pip. He's better than he thinks. So am I.|I won't tell you where I'm aiming. You'd probably move there.|You want the club title? Start by making me leave the middle.|I've watched your shots. There are gaps. I intend to use them.",
rematch:"Back. I wondered how long it would take.|I've seen your game once. The second look is usually more useful.|You changed your footing. Good. I was getting used to the old version.|I remember your favourite angle. I hope you have another.|You came back. Fine. I'll put the ball somewhere new.|I kept the court. You brought yourself. Let's get on with it.",
afterLoss:"You found the corner I couldn't cover. I spent the week fixing that.|You beat me. No asterisk, no excuse. Now serve.|I watched our last point until I knew exactly when I moved wrong.|I don't enjoy losing. I do enjoy having something specific to fix.|You read my placement last time. I'll have to be less predictable.|Your win was clean. Don't expect the same opening again.",
end_win:"You covered the first corner. The second one was open. Good match.|I got the last line. You made me work for it.|You adjusted faster than most. It wasn't quite fast enough.|That's mine. Your footwork improved as the match went on.|I won. Pip will ask whether I was polite. Don't answer him.|You made me change my plan. I don't often have to do that.",
end_loss:"You found the gap. I thought I'd closed it.|Well played. Don't make me say it again in front of Pip.|I lost the line on that last shot. You deserved the point.|You read me. That's irritating. It's also impressive.|I had the angle. You had a better one.|You earned the win. I'll be here when you're ready again.",
ai_point:"You left the corner open.|You committed too soon.|I found the line.|Your first step gave it away.|That gap was enough.|You guarded the wrong side.|I saw you shift early.|Clean placement.",
player_point:"You found the gap.|Well placed. I was late.|I read it wrong.|That angle was yours.|You made me reach.|I didn't cover the line.|You saw the opening first.|I gave you too much room.",
match_point_ai:"One shot to finish.|Match point. Stay precise.|I only need the next opening.|One more corner.|This can end on my serve.|No wasted movement now.",
match_point_player:"Your match point.|You still have to place it.|I'm not giving you the line.|One mistake and you have it.|Make me hit the last shot.|Close. Not finished.",
rally_long:"Still looking for the gap.|You're covering the court better.|Neither of us is committing.|A long rally exposes habits.|You haven't given me much room.|Wait for the opening.",
lead_big:"I've built a useful lead.|You're leaving the same spaces.|I'm ahead. Not finished.|Those corners are adding up.|There's room to be patient now.",
trail_big:"You've opened a gap.|I've given away too much.|You're controlling the lines.|I need a different angle.|That lead won't close itself.",
powerup_player:"You took the pickup. Adjusting.|That changes your reach.|I'll account for the power-up.|You were first to it.|An advantage. Use it.",
power_shot:"There's more pace on that.|Power changes the timing.|That shot came through hard.|A faster ball. Fine.|You hit that with intent.",
rally_first_spin:"I saw the spin.|You're bending the return.|That ball broke late.|A deliberate curve.|Good wrist work.",
neutral:"Watch the spacing.|There's another angle.|Stay sharp.|Let's change the pattern.|I can wait for an opening.|Keep your feet moving."
},
nova:{
intro:"I'm Nova. The ball says you're good. It also wants a holiday, so make of that what you will.|Welcome to Dock Seven! Ignore the warning lights. They're for the coffee machine.|I travelled from a station that's not on your map. It wasn't on mine either, for a while.|I asked the stars about this match. They said to stop asking and serve.|Gravity works differently here. Don't worry; it surprises me too.|You came all this way! I hope your navigator is better than mine.",
rematch:"You're back! The ball missed you. It told me so on the way in.|I mapped our last game. The interesting bit looks like a spiral and a sandwich.|My crew still doesn't believe you made that shot. Shall we demonstrate?|Another orbit around this court? Excellent.|I saved your place at the dock. Not the parking spot, though.|You've returned! I was halfway through explaining you to a planet.",
afterLoss:"You beat me last time. The station computer said 'the other player'. Very helpful.|The ball remembers your winning shot. It brings it up whenever I miss.|I studied your trajectory and only got lost twice. I'm ready now.|Your win made the ship's log. Between a meteor shower and lunch.|I flew back for this rematch. Also because I left my bag here.|You sent my defence into orbit. I'd like to bring it back down.",
end_win:"I won! Ball, did you see that? Of course you did. You were there.|Touchdown! You made that a bumpier flight than I planned.|The stars were no help, so I'm taking the credit.|I got the last point. The ball says you're welcome back whenever.|My crew will hear about this for weeks. I'll mention you were excellent, eventually.|What a match! I'd offer a ride home, but I still haven't found my ship.",
end_loss:"You won! Ball, you could have warned me. It says you were too quick.|That last shot was beautiful. I'm filing it under 'how?'|You bent my whole plan out of shape. I like that.|The stars were wrong. Or I read the chart upside down. Congratulations!|I lost the match and found a new favourite opponent. Reasonable trade.|You've got the win. Teach me that shot before you leave.",
ai_point:"There it goes, right through your orbit.|The ball took the scenic route.|The gap appeared and I borrowed it.|Point for the person with the questionable map.|I may have bent that trajectory.|The ball says that was intentional.|Gravity owes me one.|Plot twist: it landed in.",
player_point:"You sent that into a new orbit.|Whoa, I didn't chart that.|You found the gap in my universe.|That came out of nowhere.|I was watching the wrong moon.|The ball didn't warn me!|Did you just bend that?|My navigation was slightly off.",
match_point_ai:"One more and we touch down.|My next point ends the mission.|We're one bounce from landing.|Match point! Hold the course.|I can see the finish from orbit.|Ball, please cooperate once more.",
match_point_player:"You could land this in one.|I'm one point from re-entry.|Your next shot could end my expedition.|Emergency course correction!|That's your match point, isn't it?|Ball, we need a miracle.",
rally_long:"This ball has its own orbit now.|We might need to refuel mid-rally.|It's gone around enough times to name it.|Are we still on the same point?|This is longer than my last flight.|We could open a space station here.",
lead_big:"There's some space between us now.|My flight plan is working suspiciously well.|The scoreboard has drifted my way.|I'm ahead! Even the computer agrees.|A whole asteroid belt of a lead.",
trail_big:"I've drifted a long way behind.|That gap is bigger than my fuel budget.|I need a shorter route back.|My navigation says we're in trouble.|You've pulled ahead. Time to improvise.",
powerup_player:"You picked up the shiny thing!|That gadget is on your ship now.|You got to the power-up first.|I was going to investigate that!|You've acquired mysterious equipment.",
power_shot:"That shot has thrusters!|Someone put an engine on the ball.|That's an energetic comet.|Did the ball accelerate?|My instruments say: fast.",
rally_first_spin:"An orbit within an orbit!|You put a curve on the ball!|That trajectory changed its mind.|The ball is spiralling!|No wormhole required.",
neutral:"This is excellent field research.|The ball and I are discussing it.|My ship can wait.|I love an unexpected trajectory.|Don't ask me for the equations.|I should send a postcard."
},
brick:{
intro:"I'm Brick. I run the yard, I play after shift, and I don't like standing around. Serve.|The crew says you've got quick feet. They'll get a better view when I make you use them.|You want this court? You can have it when the match is done.|Watch the containers. They don't move for anyone. Neither do I, unless the ball makes me.|I hit hard. That's not a warning; it's so you don't waste time guessing.|The yard's loud, the floor's rough, and I'm ready. You?",
rematch:"You again. Good. I needed someone who hits back.|The crew remembers you. Don't let that go to your head.|Back for another shift? I kept the court clear.|I haven't fixed the floor since last time. You'll have to deal with me instead.|I remember how hard you made me work. Let's see if you've kept it up.|You're early. That's unusual around here. Let's play.",
afterLoss:"You beat me last time. The crew won't shut up about it. Fair enough.|I went back to basics after that loss. Footwork first, excuses never.|You got through me. I've been working on making the job harder.|I watched the last point. I was slow. You weren't.|That win was yours. I'm not leaving you the same gap again.|I've carried that loss around long enough. Let's put it to use.",
end_win:"Shift's over. You made me work for the last point.|I got the result. You kept swinging, and I respect that.|Good match. The crew can stop pretending they were only watching the cranes.|I held my ground today. Come back when you want another go.|That's mine. You hit harder than you look, for what that's worth.|No easy points from you. That's the sort of opponent I want in my yard.",
end_loss:"You beat me. No excuses; you did the better work.|That last shot was solid. I wasn't getting there.|The crew saw it, so I'll hear about it all week. Good game.|You earned the win. Don't make me congratulate you twice.|I put everything behind that return and you still got it past me.|Take the result. You've earned a rest. I need to get back to work.",
ai_point:"You left a hole. I filled it.|That one landed heavy.|I got there first.|You couldn't get across in time.|Straight through the gap.|That's delivered.|Move your feet, not your mouth.|Good solid hit.",
player_point:"You got past me there.|Good hit. I was late.|I left that side open.|That had some weight behind it.|You earned that point.|Didn't get my feet set.|You've got an arm on you.|That's my mistake.",
match_point_ai:"One more and I'm clocking off.|Last point to finish the job.|I've got match point.|One clean hit ends this.|Time to close the shift.|One more load.",
match_point_player:"You're one from finishing.|I need to keep this in play.|You've got match point. Earn it.|One mistake and I'm done.|Not clocking off just yet.|I'll make you hit it again.",
rally_long:"Now this is work.|Neither of us is quitting.|My crew would call this overtime.|That's a lot of returns.|Keep lifting that ball back.|You're still standing. Good.",
lead_big:"I've built a decent lead.|Those points are stacking up.|You've got ground to make up.|I'm ahead. Still work left.|This shift's going my way.",
trail_big:"I'm behind. That's my problem to fix.|You've put me in a hole.|I need to shift this score.|Too many missed returns.|You've made a mess of my game.",
powerup_player:"You got the equipment first.|That's your power-up.|You've picked up an extra tool.|I saw you grab that.|Use the gear properly.",
power_shot:"That's got some force.|Heavy shot coming through.|Someone put weight behind that.|That ball's carrying a load.|A proper hard hit.",
rally_first_spin:"You've put a turn on it.|That ball's curving late.|There's spin on that shot.|I saw the twist.|That's a tricky bit of spin.",
neutral:"Back to work.|Keep your feet under you.|The crew's watching.|No shortcuts here.|Let's see the next one.|Long shifts teach patience."
},
juno:{
intro:"I'm Juno! You're here! Great! I was going to explain the tunnel, but you've probably noticed it's loud!|They told me to wait for the signal. That was the signal, right? No? Sorry. I'm Juno.|You're the challenger? Excellent! The last test driver wouldn't play me after the third match.|This tunnel was built to measure speed. Today we're giving it something interesting to measure!|I heard you were fast. I hope that's true, because my crew's taking bets!|I had a whole introduction planned, but we're wasting time standing here. Ready?",
rematch:"You're back! I told my crew you wouldn't stay away! They owe me lunch!|Another match! Yes! I kept my helmet on just in case!|I watched our replay at double speed. We looked fantastic!|You came back! I've got a new route across the court and absolutely no patience!|I've been waiting! Not quietly, but nobody expected that!|My crew still argues about our last match. Let's give them another one!",
afterLoss:"You beat me last time! I watched your last shot twelve times. I'm only annoyed about eleven of them!|I retuned my footwork, my paddle and my playlist. One of those has to help!|That loss hurt! Then I got excited about trying again. It was a confusing minute!|You passed me at the finish! I've been practising that exact corner ever since!|My crew says I should take this calmly. My crew has never met me, apparently!|You won fair and square. This time I'm looking where the ball is going!",
end_win:"Chequered flag! You nearly caught me! That was incredible!|I won! Give me a second, I need to breathe before I start bragging!|Yes! Please tell me someone recorded that finish!|That's mine! You were quick enough to scare me. Don't tell my crew!|What a race! Match! Whatever! That was brilliant!|I got there first! Can we do it again after I find my water bottle?",
end_loss:"You passed me! At the finish! That's infuriating! Do it again!|You win! I hate the result and love the match!|That last shot was ridiculous! Show me the replay immediately!|You found another gear! I was chasing you all the way to the flag!|You were quicker when it counted. Rematch after water? Immediately after water!|I lost! My crew's going to be unbearable! Great game, though!",
ai_point:"There! Gone before you looked!|I found the inside line!|Did you see that pass?|That point was quick!|You left just enough room!|My crew's going to replay that!|I found another gear!|Clean pass! Yes!",
player_point:"Whoa! You got past me!|Where did that come from?|You took the corner clean!|I was too slow to that one!|That shot had serious pace!|I took the wrong line!|You were quick! Annoyingly quick!|My crew definitely saw that!",
match_point_ai:"Last lap! One point to go!|I can finish this right now!|Match point! Don't stall!|The flag's right there!|One more clean hit!|Come on, Juno, keep it together!",
match_point_player:"Your match point? Already?!|One more from you and I'm done!|I need this return!|Defend first, panic later!|You're right at the finish!|I can still make the turn!",
rally_long:"How are we still going?!|This rally needs a pit stop!|Neither of us has brakes!|The ball's going to need new tyres!|I don't want this to end!|Is anyone else out of breath?!",
lead_big:"Look at that gap!|I'm pulling away!|The scoreboard's moving fast!|I've got a lead! Keep it, Juno!|I found some breathing room!",
trail_big:"That's a big gap! I can close it!|You've pulled away from me!|I need a comeback lap!|I'm behind? Okay, more focus!|You've got me chasing now!",
powerup_player:"You got the upgrade! Hey!|Power-up on your side!|You reached the pickup first!|You've got new equipment now!|That's an interesting advantage!",
power_shot:"That ball found another gear!|Power shot! Look at it go!|That's some acceleration!|Who put an engine in that thing?!|That shot is flying!",
rally_first_spin:"That ball's drifting!|You made it take the bend!|That's some spin!|Whoa, it changed direction!|Your shot cornered beautifully!",
neutral:"This beats testing alone!|I should have brought water!|Can you hear the tunnel? I love that sound!|My crew thinks I talk too much!|Eyes up, Juno!|I hope someone's recording this!"
},
mirage:{
intro:"I'm Mirage. If you see two of me, aim at the one holding the paddle. It won't help, but aim there.|Welcome to the salt. The horizon is level; your eyes may disagree.|You followed the path here. Are you certain it was the path you meant to take?|I've heard you're difficult to fool. I'd like to meet the person who told me that.|The light makes doubles of everything. Only one of us needs to score.|Watch my paddle if you like. I won't be sending the ball where it points.",
rematch:"You returned. I wondered which version of you would find the way.|We played before. I remember your face when the ball went elsewhere.|The salt has changed. Or perhaps you have.|Last time you watched my hand. What will you watch today?|I kept one memory from our match. It wasn't the score.|You look more certain this time. That can be useful. Or expensive.",
afterLoss:"You saw through me last time. I shouldn't have shown you so much.|I lost. There's no trick in saying it. The trick is deciding what comes next.|That final shot was real. I checked the reflection to be sure.|You found the opening I thought I'd hidden. I admire the inconvenience.|I considered how you beat me. The horizon offered no advice.|You trusted your eyes at precisely the right moment. Interesting.",
end_win:"The scoreboard will confirm it. I know better than to ask you to trust me.|You followed the right image eventually. By then, the match had moved on.|I take the win. You made the reflections less useful than I'd hoped.|That's the last point. The echo might keep playing for a while.|You nearly found me. Next time, perhaps, you will.|It's over. You can stop watching my hands now.",
end_loss:"You looked past the reflection. Not many people do.|The win is yours. I won't pretend it happened to someone else.|You found the real opening. I felt it disappear before the ball arrived.|You saw me clearly. I can't decide whether I like that.|No illusion in the result. Well played.|I expected you to follow the shadow. You made me follow the ball instead.",
ai_point:"You followed the reflection.|I moved one way. The ball didn't.|The opening was behind your attention.|You reached for the wrong image.|That point was real, at least.|Your eyes arrived late.|A small, useful deception.|Look again. Too late.",
player_point:"You found the real gap.|You didn't follow the feint.|I gave you a clear view.|You saw through that one.|The reflection didn't fool you.|I was the one deceived.|Well observed.|You trusted your feet.",
match_point_ai:"One point and the image settles.|The end is almost visible.|One more shot remains for me.|Match point. Don't look away.|The horizon is close now.|Which image will you follow?",
match_point_player:"You can end this with one.|Your next point could make me disappear.|The finish is close enough to touch.|I'm one mistake from the end.|You have the final image in reach.|Let's see what you believe.",
rally_long:"The same ball, returning in different shapes.|We keep meeting in the middle.|Neither reflection wants to fade.|This rally outlived its shadow.|The horizon keeps moving away.|Are we still on the first image?",
lead_big:"There's distance between us now.|My reflection looks comfortable.|The scoreboard is unusually clear.|I've drawn you away from the point.|You have a long way back.",
trail_big:"Your lead is real. For now.|You've seen more than I intended.|I have ground to recover.|The picture is less flattering here.|You've drawn me out of hiding.",
powerup_player:"You've taken the power-up.|A new trick in your hands.|The pickup chose you.|Something changed on your side.|I saw you claim it.",
power_shot:"That shot carries unusual force.|A sudden burst through the haze.|The ball moves with intent.|Power casts its own shadow.|That was no illusion.",
rally_first_spin:"The ball refuses the straight line.|A subtle turn of the paddle.|Spin. An honest deception.|The path bends at the last moment.|You've given it a curve.",
neutral:"Look again.|The horizon is unreliable.|The salt remembers little.|Not everything is a trick.|The light is changing.|A pause can be revealing."
},
atlas:{
intro:"I'm Atlas. I've played on this court under three roofs. The first two didn't outlast me.|You made the world stage. Take a breath. I'll still be here when you're ready.|People say I return everything. That's generous. I only return the balls I can reach.|I prefer a long match. My knees have a different preference, but they don't get a vote.|You've come a long way. I'd like to see what you do when the easy points stop.|Take your time with the serve. I have nowhere more important to be.",
rematch:"Welcome back. I remember your persistence more clearly than the score.|We meet again. I've had time to rest; I hope you used yours well.|You've changed your stance. An old opponent notices these things.|Another match? Good. I thought the young had lost patience.|I kept practising. Returning is easier when one doesn't stand still between matches.|You came back. That tells me quite a lot about you.",
afterLoss:"You got past me last time. I considered where I stood and why.|I lost to a better player that day. I'd like to learn whether that's still true.|Your last shot moved me. My knees remember it even more clearly than I do.|I thought patience alone would be enough. You taught me to move sooner as well.|You earned that victory. I went home, rested, and returned to the court.|I've lost before. The trick is making sure the loss teaches you something.",
end_win:"I had one more return in me. You made me find it.|You kept coming back. That's a quality worth taking into your next match.|The last point was mine. The afternoon belonged to both of us.|A fine match. My knees will complain, but they've been doing that for years.|The result is mine, but you have my respect and a place on this court.|You made an old player work for it. I appreciate the exercise, mostly.",
end_loss:"You moved me when it mattered. You've earned your place in the final.|I had an answer for almost every shot. Almost. You earned that finish.|You waited for your moment and took it. Keep that patience in the final.|I gave you what I had. Today, that wasn't enough. Well played.|Go on to the final. Don't let the size of the court change your game.|I've outlasted many opponents. Today you outlasted me. I'll remember it.",
ai_point:"You ran out of room.|I waited for that opening.|Everything came back until it didn't.|Your angle gave me time.|That return asked one more question.|Patience has its uses.|I had time to see it.|You made the opening yourself.",
player_point:"You moved me out of position.|That one got past me.|You found a patient opening.|I couldn't reach that corner.|You earned the space.|Even I leave a gap sometimes.|My feet weren't quite there.|Good judgment.",
match_point_ai:"One more return could do it.|I have match point.|The last point is within reach.|I can finish without rushing.|One good shot remains.|I have time to place it.",
match_point_player:"You have match point.|I'll make you play that last ball.|One mistake and it's yours.|I've held on this long.|You'll have to get past me once.|This is where patience matters.",
rally_long:"Now this is worth the afternoon.|Neither of us is in a hurry to miss.|A rally with some history to it.|I've had shorter train journeys.|Keep returning. I'm still here.|My knees may write a complaint.",
lead_big:"I've built room to breathe.|The lead took time to earn.|You've ground to make up.|I'm ahead, not finished.|The scoreboard has moved my way.",
trail_big:"You've built a strong lead.|I have work to do.|I've been further behind. Not often.|Time to win one back.|You have me moving more than I'd like.",
powerup_player:"You reached the power-up first.|That advantage is yours.|You've collected the pickup.|I'll watch what you do with that.|An extra tool for your game.",
power_shot:"That shot has weight behind it.|A powerful return.|The ball has gained some pace.|A strong hit deserves a steady answer.|There's force in that shot.",
rally_first_spin:"You put a turn on the ball.|A well-judged curve.|The ball is breaking late.|There's spin on your return.|Clever wrist work.",
neutral:"The match takes the time it takes.|My knees have opinions about this.|A good return buys time to think.|The crowd can wait.|Settle your feet.|There's still plenty to learn."
},
titan:{
intro:"I'm Titan. You've beaten everyone beneath this crown. Don't expect me to lower my head for you.|The crowd came for a coronation. I was told you had other plans.|You've climbed a long way. Now show me you can play with the title in reach.|I've defended this court against players who thought the name would frighten me. What have you brought?|The mask stays on. If you want to know what I'm thinking, watch the ball.|You earned the right to challenge me. You have not earned the crown. Not yet.",
rematch:"You returned. Good. A champion should not have to ask for a worthy challenger.|I remember our final. I expect you've studied it as closely as I have.|The crowd knows your name now. Don't let it play the match for you.|Another meeting on this court. I won't mistake familiarity for weakness.|You came back. I had hoped you would, though I won't tell the crowd that.|We have more to settle. Take your place.",
afterLoss:"You took the title from me. I won't insult you by calling it luck.|I watched our last final without the mask. It was harder to hide my mistakes from myself.|You were the better player that day. Today I intend to make that a harder claim.|The crown suits you. I would like it back.|Defeat taught me more than the celebrations ever did. I intend to use the lesson.|You broke my reign. I have spent the time since learning how you did it.",
end_win:"The title remains mine. You forced me to defend every part of my game.|The crowd came for a champion. You made certain they saw a final as well.|I keep the crown today. You have my respect, whether you wanted it or not.|You made me afraid to miss. I haven't felt that in some time.|The last point was mine. You earned the right to challenge for it again.|I won. The mask makes it hard to tell, but I enjoyed that more than I should admit.",
end_loss:"The crown is yours. You took it from my best, and I have no excuse.|A new champion. Wear it more lightly than I did.|I thought I knew what pressure felt like. Then you served for the title.|You beat me without asking the crowd for permission. Good.|The mask comes off. Congratulations. You earned the face beneath it.|I held this court as long as I could. It's yours now. Play on your own terms.",
ai_point:"You hesitated. I didn't.|That opening belonged to me.|Another point in my defence.|I saw where you'd move.|The title won't take itself.|You should guard that side.|I won't waste an opening.|The crowd expected no less.",
player_point:"You found the weakness.|I was late to that shot.|That point was yours.|You struck without hesitation.|You forced the opening.|You have my attention.|A champion can be challenged.|I will answer that.",
match_point_ai:"One point from retaining the title.|The crown is within reach.|Match point. I intend to finish.|One last shot can decide it.|This is where I close the final.|I will not waste this chance.",
match_point_player:"One point from my title.|You stand at match point.|I have to defend this ball.|You could take the crown now.|You'll have to earn the last shot.|I have not surrendered it.",
rally_long:"A final worthy of the name.|Neither of us will yield.|The crowd has gone quiet.|Each return asks more of us.|This is why they filled the stands.|At last, a worthy exchange.",
lead_big:"The title is closer, not secure.|I've taken control of the court.|The score favours me.|You have a long climb back.|I've built a commanding lead.",
trail_big:"You have me behind.|The title is under threat.|I've given away too much.|I must change this match.|You earned that lead. Defend it.",
powerup_player:"You've claimed the power-up.|That advantage is yours.|You reached the pickup first.|You've gained another weapon.|I saw you take it.",
power_shot:"That shot carries force.|A powerful strike.|The ball has gained speed.|You put your strength behind that.|The final has grown louder.",
rally_first_spin:"A subtle turn of the paddle.|You put spin on that.|The ball changed its path.|A clever curve.|You've added deception to the return.",
neutral:"The crowd can wait for the result.|Pressure reveals the player.|I expect your best.|The title is not decided yet.|The mask makes it difficult to hear them.|Neither of us came to surrender."
}
};
const direct = new Set(['intro','rematch','afterLoss','end_win','end_loss','ai_point','player_point','match_point_ai','match_point_player','rally_long','lead_big','trail_big','powerup_player','power_shot','rally_first_spin']);
const categories = {
 first_point_ai:'ai_point', ace_ai:'ai_point', quick_point_ai:'ai_point', ai_streak:'ai_point', comeback_ai:'ai_point', miss_any:'ai_point',
 first_point_player:'player_point', player_streak:'player_point', comeback_player:'player_point', ai_greedy:'player_point'
};
function category(key) {
 if (direct.has(key)) return key;
 if (categories[key]) return categories[key];
 if (key.startsWith('intro')) return 'intro';
 if (key.startsWith('end_win')) return 'end_win';
 if (key.startsWith('end_loss')) return 'end_loss';
 if (key.startsWith('miss_')) return 'ai_point';
 if (key.startsWith('hit_') || key.startsWith('player_point_')) return 'player_point';
 return null;
}
const cache = new Map();
function pool(id, key) {
 id = String(id || '').toLowerCase();
 const voice = voices[id];
 if (!voice) return null;
 const kind = category(key) || 'neutral';
 const cacheKey = id + ':' + kind;
 if (!cache.has(cacheKey)) cache.set(cacheKey, split(voice[kind]));
 return cache.get(cacheKey);
}
window.PPTourDialogue = { pool, category, ids: Object.keys(voices) };
})();
