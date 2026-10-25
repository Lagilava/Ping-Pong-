const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const sandbox = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/scene-compositor.js'),'utf8'),sandbox);
const {cleanMatte} = sandbox.window.SceneCompositor;
function sample(w,h,paint,options) {
    const data=new Uint8ClampedArray(w*h*4);
    const pixel=(x,y,rgba)=>data.set(rgba,(y*w+x)*4);
    paint(pixel);
    const before=data.slice(); let output;
    const canvas={width:w,height:h,getContext:()=>({
        getImageData:()=>({width:w,height:h,data:data.slice()}),
        putImageData:image=>{output=image.data;}
    })};
    assert.equal(cleanMatte(canvas,options),canvas,'repair in place without changing source coordinates');
    return {before,output,pixel:(x,y)=>Array.from(output.slice((y*w+x)*4,(y*w+x)*4+4))};
}
const main=sample(24,24,p=>{
    for(let y=4;y<18;y++)for(let x=4;x<18;x++)p(x,y,[70,110,95,255]);
    for(let y=4;y<18;y++)p(4,y,[255,0,0,255]); // extraction fringe
    p(10,10,[255,20,30,255]); // real emissive detail inside the silhouette
    p(22,22,[0,0,255,255]); // disconnected key-colour noise
},{minIslandPixels:5});
assert.equal(main.pixel(22,22)[3],0,'remove disconnected atlas noise');
assert.deepEqual(main.pixel(10,10),[255,20,30,255],'preserve genuine emissive interior detail');
assert.deepEqual(main.pixel(12,12),[70,110,95,255],'interior material and exposure stay unchanged');
assert(main.pixel(4,10)[0]<150 && main.pixel(4,10)[1]>50,'despill colour from solid interior, without a black halo');
assert(main.pixel(4,10)[3]>0 && main.pixel(4,10)[3]<255,'feather coverage at the actual silhouette');
for(let p=3;p<main.output.length;p+=4)assert(main.output[p]<=main.before[p],'matte repair cannot bleed into transparent pixels');
const tiles=sample(16,8,p=>{for(let y=0;y<8;y++)for(let x=0;x<16;x++)p(x,y,x<8?[0,100,60,255]:[230,30,20,255]);},{columns:2,minIslandPixels:5});
assert.equal(tiles.pixel(7,4)[0],0,'animated atlas frames cannot borrow colour from their neighbour');
assert.equal(tiles.pixel(8,4)[1],30);
const empty=sample(8,8,()=>{},{});
assert(empty.output.every(v=>v===0),'empty or loading assets remain transparent');
console.log('Source-matte coverage, island removal, despill, emissive detail and animation-tile isolation passed.');
