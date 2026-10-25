const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let allocations=0,gradients=0,reduced=false;
const draws=[],transforms=[];
function context(){return new Proxy({globalAlpha:1,getTransform:()=>({a:1.5,b:0,c:0,d:1.5}),
    drawImage(...a){draws.push(a);},transform(...a){transforms.push(a);},
    createLinearGradient(){gradients++;return {addColorStop(){}};},createRadialGradient(){gradients++;return {addColorStop(){}};}
},{get:(o,k)=>k in o?o[k]:()=>{}});}
const sandbox=vm.createContext({Math,window:{game:{gameMode:'classic'},PPSettings:{get:()=>reduced}},PerfGovernor:{tier:0},
    document:{createElement(){allocations++;return {width:0,height:0,getContext:context};}}});
for(const f of ['arena-motion','classic-art'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/'+f+'.js'),'utf8'),sandbox);
const art=new sandbox.window.ClassicArt(),ctx=context(),state={dt:1/30,rally:0,score:0};art.draw(ctx,1280,720,state);
const banner=art.banner,base=art.base,warm=allocations,baked=gradients;
assert(banner.c.width<=110&&banner.c.height<=260,'shared cloth texture stays bounded');
assert(art.crowdActors.length>20&&art.crowdActors.length<=96,'bounded independent spectators');
const roots=JSON.stringify(art.crowdActors);
draws.length=transforms.length=0;art.draw(ctx,1280,720,state);const first=JSON.stringify(transforms);
assert.equal(draws.filter(d=>d[0]===banner.c).length,24,'cloth uses twelve coherent rows per banner');
assert(draws.findIndex(d=>d[0]===banner.c)>draws.findLastIndex(d=>d[0]===art.beam.c),'cloth occludes beams');
for(let i=0;i<120;i++)art.draw(ctx,1280,720,state);
assert.equal(allocations,warm);assert.equal(gradients,baked,'warm frames create no gradients');assert.equal(art.base,base);
transforms.length=0;art.draw(ctx,1280,720,state);assert.notEqual(JSON.stringify(transforms),first,'wind deforms the cloth internally');
state.score=1;art.draw(ctx,1280,720,state);for(let i=0;i<25;i++)art.draw(ctx,1280,720,state);
draws.length=0;art.draw(ctx,1280,720,state);
assert(draws.some(d=>d[0]===art.crowdAtlas&&d[1]>=1280),'spectators raise articulated arms after a point');
assert.equal(JSON.stringify(art.crowdActors),roots,'spectators keep their seat roots');
state.dt=0;transforms.length=0;art.draw(ctx,1280,720,state);const paused=JSON.stringify(transforms);
transforms.length=0;art.draw(ctx,1280,720,state);assert.equal(JSON.stringify(transforms),paused);
reduced=true;state.dt=1/30;transforms.length=0;art.draw(ctx,1280,720,state);assert.equal(JSON.stringify(transforms),paused,'reduced motion holds the wind phase');
for(const tier of [2,3,0]){sandbox.PerfGovernor.tier=tier;art.draw(ctx,1280,720,state);}
assert.equal(allocations,warm);assert.equal(gradients,baked);assert.equal(art.banner,banner);
console.log('Classic cloth deformation, seated crowd reactions, pause/reduced-motion and warm material budgets passed.');
