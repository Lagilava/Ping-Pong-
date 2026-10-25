// CPU Canvas visual checks. Requires @napi-rs/canvas; no game/runtime dependency.
// Usage: node tools/check-background-scenes.js /tmp/ping-pong-scenes
// Browser/WebGL playback remains covered by the existing browser tests.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const {createCanvas, Image, Path2D} = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '../game');
const out = path.resolve(process.argv[2] || '/tmp/ping-pong-scenes');
fs.mkdirSync(out, {recursive:true});
const modes = ['classic','zombie','gravity','speed','obstacle'];
function session(width,height,artSource) {
    let seed=73, pending=0, allocations=0;
    const errors=[];
    const math=Object.create(Math);
    math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const game={gameMode:'classic',width,height,customSettings:{},ball:null};
    const sandbox={console,Path2D,URL,btoa,performance,Math:math,
        ZOMBIE_PHALANX_GRADS:new Map(),ZOMBIE_PHALANX_SPRITES:new Map(),
        areParticleEffectsEnabled:()=>true,PerfGovernor:{isMobile:false,current:{bgFps:30}},
        window:{game,addEventListener(){},matchMedia:()=>({matches:false})},
        document:{baseURI:'file://'+root+'/',createElement(){allocations++;return createCanvas(1,1);}}};
    // Native Canvas needs an Image callback returning undefined; browser
    // onload handlers in the game may return promises for decoding.
    sandbox.Image=function(){
        const image=new Image();let loaded,failed;
        Object.defineProperty(image,'decode',{value:undefined});
        Object.defineProperty(image,'onload',{set(fn){loaded=fn;},get(){return ()=>{
            pending--;try{Promise.resolve(loaded?.()).catch(e=>errors.push(e));}catch(e){errors.push(e);}
        };}});
        Object.defineProperty(image,'onerror',{set(fn){failed=fn;},get(){return error=>{
            pending--;errors.push(error);failed?.(error);
        };}});
        Object.defineProperty(image,'src',{set(value){
            pending++;
            try{
                const p=value.startsWith('file://')?value.slice(7):value;
                Object.getOwnPropertyDescriptor(Image.prototype,'src').set.call(image,
                    p.startsWith('data:')?Buffer.from(p.split(',')[1],'base64'):fs.readFileSync(path.resolve(root,p)));
            }catch(error){pending--;errors.push(error);failed?.(error);}
        }});
        return image;
    };
    vm.createContext(sandbox);
    for(const f of ['scene-compositor','classic-art','speed-art','obstacle-waterfalls','obstacle-sky-scene','gravity-materials','gravity-art','background-renderer']) {
        vm.runInContext(fs.readFileSync(f==='gravity-art'&&artSource?artSource:path.join(root,'js/render',f+'.js'),'utf8'),sandbox);
    }
    sandbox.ClassicArt=sandbox.window.ClassicArt;sandbox.SpeedArt=sandbox.window.SpeedArt;
    vm.runInContext('globalThis.Renderer=BackgroundRenderer;',sandbox);
    return {sandbox,game,errors,seed(value){seed=value;},allocations:()=>allocations,
        async ready(){for(let i=0;pending&&i<300;i++)await new Promise(r=>setTimeout(r,10));
            assert.equal(pending,0,'all source atlases finish loading');assert.equal(errors.length,0,'source assets decode successfully: '+errors.map(e=>e.message).join('; '));}};
}
function pixels(c){return c.getContext('2d').getImageData(0,0,c.width,c.height).data;}
function differences(a,b){let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3)changed++;return changed;}
async function main(){
    const report=[];
    for(const [w,h] of [[1280,720],[1920,1080],[2560,1080]]) {
        const env=session(w,h);
        for(const mode of modes) {
            let reference;
            for(const custom of [false,true]) {
                env.seed(73+modes.indexOf(mode));env.game.gameMode=custom?'customise':mode;
                const c=createCanvas(w,h),ctx=c.getContext('2d'),r=new env.sandbox.Renderer(ctx,w,h);
                env.game.bgRenderer=r;r.setMode(mode);r.time=3;
                r._renderModeBackground(ctx,w,h);await env.ready();
                ctx.clearRect(0,0,w,h);r._renderModeBackground(ctx,w,h);r.renderEnhancedLighting(ctx,w,h);
                if(custom){assert.equal(differences(reference,pixels(c)),0,mode+' Custom preview and mode use identical world lighting');continue;}
                reference=pixels(c).slice();
                if(w===1280)fs.writeFileSync(path.join(out,mode+'.png'),c.toBuffer('image/png'));
                if(mode==='speed')assert(r._speedArt.generated,'decoded Speed art is used');
                if(mode==='gravity'){const status=env.sandbox.window.GravityArt.status();assert(status.sceneReady&&status.surfaceReady&&status.wellFlowReady,'decoded Gravity material paths are active');}
                r.time=4;ctx.clearRect(0,0,w,h);r._renderModeBackground(ctx,w,h);
                assert(differences(reference,pixels(c))>10,mode+' retains ambient animation');
                const before=env.allocations(),samples=[];
                for(let i=0;i<12;i++){
                    const start=performance.now();r.time+=1/30;r._renderModeBackground(ctx,w,h);samples.push(performance.now()-start);
                }
                const extra=env.allocations()-before;
                // Hand poses are lazy bounded textures. Other warm scenes must
                // not allocate more textures at all.
                if(mode!=='zombie')assert.equal(extra,0,mode+' warm frame reuses its textures');
                else assert(extra<=40,'whole-hand poses stay bounded');
                samples.sort((a,b)=>a-b);
                report.push({mode,width:w,height:h,medianCanvasMs:+samples[6].toFixed(2),extraWarmCanvases:extra,customWorldMatches:true});
            }
        }
    }
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={session};
