const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let allocations=0;const noop=()=>{};
const sandbox=vm.createContext({window:{},document:{createElement(){allocations++;const c={};c.getContext=()=>new Proxy({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:p=>{c.pixels=p.data;}
},{get:(o,k)=>k in o?o[k]:noop});return c;}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/arena-motion.js'),'utf8'),sandbox);
const motion=sandbox.window.ArenaMotion;
function mesh(time,root){let matrix=[1,0,0,1,0,0],stack=[],rows=[];const point=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
    const transform=(a,b,c,d,e,f)=>{const m=matrix;matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
    const ctx={globalAlpha:1,save(){stack.push(matrix.slice());},restore(){matrix=stack.pop();},translate(x,y){transform(1,0,0,1,x,y);},transform,
        drawImage(){rows.push({top:point(0,0),bottom:point(0,20)});}};
    motion.fabric(ctx,{width:40,height:120},{w:40,h:120},10,20,time,6,6,root);assert.equal(stack.length,0);return rows;}
const a=mesh(0,'top'),b=mesh(2,'top');assert.deepEqual(a[0].top,b[0].top,'cloth attachments cannot drift');
assert(Math.abs(a[5].bottom[0]-b[5].bottom[0])>1,'free hems move through the wind');
for(let i=0;i<5;i++)for(let k=0;k<2;k++)assert(Math.abs(b[i].bottom[k]-b[i+1].top[k])<1e-9,'deformed rows must meet without tears');
assert.deepEqual(mesh(0,'bottom')[5].bottom,mesh(1,'bottom')[5].bottom,'grass roots stay planted');
const fog=motion.fog();for(let x=0;x<512;x++){assert(fog.pixels[x*4+3]<=1);assert(fog.pixels[((95*512+x)*4)+3]<=1);}
const atlas=motion.crowdAtlas(),warm=allocations,draws=[];
const ctx={globalAlpha:1,save:noop,restore:noop,drawImage:(...a)=>draws.push(a)};
const actors=[{x:80,y:40,scale:1,phase:0,delay:0}];motion.drawCrowd(ctx,atlas,actors,.1,-Infinity);const rest=draws[0];draws.length=0;
motion.drawCrowd(ctx,atlas,actors,.9,0);assert(draws[0][1]>=1280,'point reactions select articulated cheer poses');assert.deepEqual(draws[0].slice(5),rest.slice(5),'seat position remains fixed');
for(let i=0;i<120;i++)motion.drawFog(ctx,fog,1280,720,i/30);
assert.equal(allocations,warm,'warm fog and crowd motion reuse textures');
console.log('Anchored cloth, coherent mesh edges, rooted grass, feathered fog and articulated crowd roots passed.');
