const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const context=vm.createContext({window:{},Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/core/game.js'),'utf8'),context);
const game=Object.create(context.window.Game.prototype);
const paddle=()=>({maxSpeed:850,h:100,pos:{y:200},vel:{y:0},clampTo(h){this.pos.y=Math.max(0,Math.min(h-this.h,this.pos.y));},update(){}});
function accelerate(hz){const p=paddle();for(let i=0;i<hz/10;i++)game.driveHumanPaddle(p,1,1/hz);return p.vel.y;}
for(const hz of [60,120,240])assert.ok(Math.abs(accelerate(hz)-850*(1-Math.exp(-4)))<1e-6,'same response over real time at '+hz+' Hz');
const p=paddle();p.vel.y=850;
game.driveHumanPaddle(p,-1,.02);
assert.ok(p.vel.y<0,'reverse direction within 20 ms');
p.vel.y=850;
for(let i=0;i<24;i++)game.driveHumanPaddle(p,0,1/120);
assert.equal(p.vel.y,0,'release stops without a lingering drift');
p.vel.y=0;game.driveHumanPaddle(p,.25,.1);
assert.ok(p.vel.y>0&&p.vel.y<=212.5,'retain analog stick precision');
const pointer=paddle();pointer.pointerTargetY=500;game.player=pointer;game.powerUpTimers={fastPaddle:0};
for(let i=0;i<120;i++){
 const before=pointer.pos.y+pointer.h/2;
 game.followPointerTarget(pointer,1/120);pointer.pos.y+=pointer.vel.y/120;
 assert.ok(pointer.pos.y+pointer.h/2<=500+1e-7,'pointer cannot overshoot');
 assert.ok(pointer.pos.y+pointer.h/2>=before,'approach remains monotonic');
}
assert.ok(Math.abs(pointer.pos.y+pointer.h/2-500)<.01);
game.followPointerTarget(pointer,0);assert.ok(Number.isFinite(pointer.vel.y),'zero dt never divides by zero');

// Exercise real local-control routing, including both players and opposite keys.
game.gameMode='classic';game.net=null;game.isMultiplayer=true;game.height=720;
game.player=paddle();game.aiPaddle=paddle();game.pointerControls={player:null,ai:null};
game.keys={w:true,s:true,arrowdown:true};game.powerUpTimers={fastPaddle:0};
game.updatePaddles(.001,.02);
assert.equal(game.player.vel.y,0,'opposite keyboard inputs cancel');
assert.ok(game.aiPaddle.pos.y>200,'player two still responds during impact slowdown');

// Use the actual physics step to confirm hit-stop slows the world, not input.
let worldDt,controls;
Object.assign(game,{paused:false,matchEnding:false,hitStop:.05,timeWarpFactor:1,serveHold:0,ball:{},
 updateSpeedBackground(){},updateGameState(){},updateGameObjects(){},
 updateBallPhysics(b,dt){worldDt=dt;},handleCollisions(){},checkScoringConditions(){},updateGameUI(){},
 updatePaddles(...args){controls=args;}});
game.physicsStep(.01);
assert.equal(worldDt,.0012);
assert.equal(controls[0],.0012);
assert.equal(controls[1],.01,'human control clock remains responsive');
game.timeWarpFactor=.5;game.physicsStep(.01);
assert.equal(controls[1],.005,'intentional time-warp powers keep their scale');
game.net={preStep:()=>true};game.timeWarpFactor=1;game.physicsStep(.01);
assert.equal(worldDt,.01,'online impacts cannot slow the shared simulation clock');
assert.equal(controls[0],controls[1],'online local/remote movement uses the same timestep');
console.log('Human input: timestep consistency, reversal, braking, analog precision, pointer tracking and hit-stop passed.');
