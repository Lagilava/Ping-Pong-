const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game/js/render/background-renderer.js'),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(source+'\nglobalThis.Renderer=BackgroundRenderer;',context);
const renderer=Object.create(context.Renderer.prototype);
assert.equal(renderer._drawZombieMoonRays,undefined,'retire ray generation');
assert.equal(renderer._renderZombieMoonlight,undefined,'retire per-frame light masks');
renderer._cemeteryAtlas={width:1024,height:1280};
const records=[];
const ctx={save(){},restore(){},drawImage(...args){records.push(args);}};
function at(t){renderer.time=t;records.length=0;renderer._drawCemeteryAccents(ctx,1280,720);return records.map(a=>a.slice());}
const first=at(0),second=at(.5);
assert.equal(first.length,12,'bounded foreground accent count');
records.length=0;
renderer._drawCemeteryAccents(ctx,1280,720,true);
assert.equal(records.length,2,'two distant figures render behind scenery');
assert.ok(first.some((a,i)=>a[1]!==second[i][1]),'sprite animation advances');
for(let t=0;t<20;t+=.13) for(const a of at(t)) {
  assert.ok(a[1]>=0 && a[1]+a[3]<=1024 && a[2]>=0 && a[2]+a[4]<=1280,'source rectangle stays inside atlas');
}
first.forEach((a,i)=>assert.deepEqual(a.slice(5),second[i].slice(5),'fixed destination anchors'));
renderer._cemeteryAtlas={width:2048,height:2560};
const enlarged=at(0);
first.forEach((a,i)=>{
  assert.deepEqual(enlarged[i].slice(1,5),a.slice(1,5).map(v=>v*2),'enlarged atlas doubles only source coordinates');
  assert.deepEqual(enlarged[i].slice(5),a.slice(5),'enlarged art keeps its original scene anchors');
});
renderer._cemeteryAtlas=null;
records.length=0;renderer._drawCemeteryAccents(ctx,1280,720);
assert.equal(records.length,0,'missing asset gracefully leaves cached scenery');
console.log('Cemetery accents animate within atlas bounds; moving moonlight work removed.');
