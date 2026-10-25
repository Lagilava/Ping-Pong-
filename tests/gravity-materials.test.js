const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let allocations=0,uploads=0;
function context(canvas){return {
    drawImage(){},save(){},restore(){},translate(){},rotate(){},beginPath(){},arc(){},fill(){},fillRect(){},moveTo(){},lineTo(){},stroke(){},
    createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
    getImageData(x,y,w,h){const image=this.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=(y*w+x)*4;image.data[p]=70+(x%37)*2;image.data[p+1]=90+(y%29)*3;image.data[p+2]=130+(x%43)*2;image.data[p+3]=255;
    }return image;},putImageData(image){uploads++;canvas.pixels=image.data.slice();}
};}
const sandbox=vm.createContext({window:{},areParticleEffectsEnabled:()=>false,document:{createElement(){allocations++;const c={};c.getContext=()=>c.ctx||(c.ctx=context(c));return c;}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/gravity-materials.js'),'utf8'),sandbox);
const materials=sandbox.window.GravityMaterials,maps=materials.buildPlanets({}),bands=materials.buildWell({});
assert.equal(bands.length,7,'shared shells have a fixed texture budget');
const ctx=context({});
materials.drawPlanet(ctx,maps,0,100,100,150,0);
const first=maps.blue.output.pixels.slice(),shade=Array.from(maps.blue.shade);
materials.drawPlanet(ctx,maps,0,100,100,150,1);
const second=maps.blue.output.pixels;let changed=0;
for(let p=0;p<first.length;p+=4){assert.equal(first[p+3],second[p+3],'surface motion cannot move the silhouette');if(first[p]!==second[p]||first[p+1]!==second[p+1]||first[p+2]!==second[p+2])changed++;}
assert(changed>3000,'cloud material visibly advects inside the fixed sphere');
assert.deepEqual(Array.from(maps.blue.shade),shade,'terminator stays fixed while the surface rotates');
const warm=allocations,before=uploads;
materials.drawPlanet(ctx,maps,0,100,100,150,1.001);
assert.equal(uploads,before,'sub-frame requests reuse the material frame');
for(let i=0;i<80;i++){materials.drawPlanet(ctx,maps,0,100,100,150,2+i/60);materials.drawPlanet(ctx,maps,1,100,100,150,2+i/60);}
assert.equal(allocations,warm,'warm material animation never allocates textures');
const angles=[],cores=[];ctx.rotate=a=>angles.push(a);ctx.arc=(x,y,r)=>cores.push([x,y,r]);
materials.drawWell(ctx,bands,100,100,80,0,0,1,.5);const start=angles.slice();angles.length=0;
materials.drawWell(ctx,bands,100,100,80,1,0,1,.5);
const rates=angles.map((a,i)=>a-start[i]);
assert.equal(rates.length,7);assert(rates[6]>rates[0]*2,'inner gas orbits faster than outer material');
assert.deepEqual(cores[0],cores[1],'event horizon cannot rotate or breathe with the texture');
assert.equal(allocations,warm,'all wells share the same seven shell textures');
console.log('Gravity cloud advection, fixed illumination/silhouette, differential flow and warm texture budgets passed.');
