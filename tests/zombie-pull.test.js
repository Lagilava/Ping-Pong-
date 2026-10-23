const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = {Math,window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/modes/zombie-pull.js'),'utf8'),context);
const Z = context.window.ZombiePull;
let score=0;
const game = {width:1280,height:720,keys:{' ':true},player:{pos:{x:30,y:300},w:20,h:120},
    zombieState:{waveStarted:true,kills:0,totalKills:0},
    isZombieWaveMode:()=>true,getZombieBarricadeX:()=>60,addZombieScore:n=>score+=n,
    renderZombieEnemy(){}};
const pull = new Z(game);
for(let i=0;i<180;i++)pull.update(1/60);
assert.equal(pull.active,true,'full energy sustains three seconds');
assert.ok(pull.energy>0 && pull.energy<0.11);
const tank={x:500,y:360,radius:20,vx:0,vy:0,typeKey:'tank',type:{score:100}};
assert.equal(pull.affect(tank,0.1),true,'larger band captures distant tank');
assert.ok(tank.vx < -130,'tank receives stronger pull');
const outside={...tank,x:900,pullAmt:0};
assert.equal(pull.affect(outside,0.1),false,'reach remains bounded');
const energy=pull.energy;
pull.devour(tank);
assert.equal(score,100,'devour awards full kill score');
assert.ok(pull.energy>energy,'devour returns energy');
pull.devour(tank);
assert.equal(score,100,'a devour cannot score twice');
for(let n=0;n<30;n++)pull.devour({...tank,dead:false});
assert.ok(pull.rings.length<=6 && pull.eaten.length<=8,'bursts and swallowed sprites stay bounded');
let depth=0,curves=0;
const ctx = new Proxy({globalAlpha:1},{get(o,k){if(k in o)return o[k]; return (...args)=>{
    for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),k);
    if(k==='save')depth++;if(k==='restore')depth--;
    if(k==='quadraticCurveTo')curves++;
    if(k==='createRadialGradient')return {addColorStop(){}};
};},set(o,k,v){o[k]=v;return true;}});
pull.renderField(ctx);
curves=0;
pull.renderTethers(ctx,Array.from({length:100},(_,n)=>({...tank,dead:false,x:200+n,pullAmt:1})));
assert.ok(curves<=36,'horde tethers have fixed visual budget');
const seeds=JSON.stringify(pull.motes);
pull.renderPaddle(ctx);pull.renderPaddle(ctx);
assert.equal(JSON.stringify(pull.motes),seeds,'rendering does not advance motes with frame rate');
assert.equal(depth,0,'canvas state restored');
game.keys[' ']=false;pull.update(0.1);
assert.equal(pull.active,false);
for(let n=0;n<120;n++)pull.update(1/60);
assert.equal(pull.energy,1,'energy recovers while idle');
assert.equal(pull.rings.length,0);assert.equal(pull.eaten.length,0);
console.log('Zombie pull strength, energy, scoring, lifecycle and visual budgets passed.');
