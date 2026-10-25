const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let now = 0;
const canvasContext = {save() {}, restore() {}, setTransform() {}, clearRect() {}};
const context = vm.createContext({
    window: {}, performance: {now: () => now},
    PerfGovernor: {isMobile: false, current: {bgFps: 60}},
    document: {createElement: () => ({getContext: () => canvasContext})}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/render/background-renderer.js'), 'utf8') + '\nglobalThis.Renderer = BackgroundRenderer;', context);
const renderer = Object.create(context.Renderer.prototype);
renderer.mode = 'zombie';
renderer._backgroundRenderCache = {lastRenderMs: -Infinity};
const rendered = [];
renderer._renderModeBackground = (ctx, w, h) => rendered.push([w, h]);
const output = {imageSmoothingEnabled: true, drawImage() {}};
// Even a 4K display must not allocate 4K scenery intermediates.
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.deepEqual(rendered, [[1024, 576]]);
const firstCanvas = renderer._backgroundRenderCache.canvas;
now = 16;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(rendered.length, 1, 'reuse scenery while gameplay renders the next frame');
now = 34;
renderer._renderCachedBackground(output, 3840, 2160, false);
assert.equal(rendered.length, 2, 'moving moonlight must keep refreshing');
assert.equal(renderer._backgroundRenderCache.canvas, firstCanvas);
context.PerfGovernor.isMobile = true;
now = 35;
renderer._renderCachedBackground(output, 844, 390, false);
assert.ok(rendered.at(-1)[0] <= 768 && rendered.at(-1)[1] <= 432);
assert.ok(renderer._getBackgroundFrameMs() >= 1000 / 24);
context.PerfGovernor.current.bgFps = 15;
assert.equal(renderer._getBackgroundFrameMs(), 1000 / 15, 'respect a slower governor tier');
console.log('Zombie scenery budget and moving-cache refresh passed.');

// Continuous articulation reuses shaded parts and one small frame per hand.
let allocations=0,gradients=0;
const ctx=()=>new Proxy({globalAlpha:1,
    createLinearGradient(){gradients++;return {addColorStop(){}};},
    createRadialGradient(){gradients++;return {addColorStop(){}};}
},{get:(o,k)=>k in o?o[k]:()=>{}});
context.ZOMBIE_PHALANX_SPRITES=new Map();context.ZOMBIE_PHALANX_GRADS=new Map();
context.document.createElement=()=>{allocations++;const canvas={};canvas.getContext=()=>canvas.ctx||(canvas.ctx=ctx());return canvas;};
const hand={poseSeq:0,poseBlend:0,poseOffset:0,twitch:1,splayAmp:.1};
const other={...hand,poseOffset:3};renderer.zombieHands=[hand,other];renderer.time=0;
const a=renderer._getZombieHandSprite(hand),b=renderer._getZombieHandSprite(other);
assert.notEqual(a,b,'hands own separate small output buffers');
assert.equal(a.width*a.height*4,114688);
assert(allocations<=24,'four shared palm/material maps, shared bones and two outputs stay bounded');
const warm=allocations,baked=gradients;
for(let f=0;f<160;f++){
    renderer.time=f/60;hand.poseSeq=(f/16|0)%10;hand.poseBlend=(f%16)/16;
    renderer._getZombieHandSprite(hand);renderer._getZombieHandSprite(other);
}
assert.equal(allocations,warm,'new joint angles never allocate pose textures');
assert.equal(gradients,baked,'warm joints use cached material, not live shading paths');
const end=renderer._getZombieHandPose({...hand,poseSeq:0,poseBlend:1});
const start=renderer._getZombieHandPose({...hand,poseSeq:1,poseBlend:0});
assert.deepEqual(end.fingers,start.fingers,'successive articulated poses meet continuously');
let blits=0;renderer._getZombieHandState=()=>({x:10,y:20,rot:3,scale:.5,emerge:.6});
renderer._renderZombieHand({save(){},restore(){},translate(){},rotate(){},drawImage(){blits++;}},hand,3840,2160,1944);
assert.equal(blits,1,'the scene receives one composited hand image');
renderer._cleanupZombieCache();assert.equal(renderer._zombieHandParts,null);assert.equal(hand._artFrame,null);
console.log('Zombie continuous articulation, shared bone materials, bounded outputs and cleanup passed.');

const probe={...hand,poseSeq:0,poseBlend:.99,poseDuration:1,poseStep:3};
renderer.time=renderer.gridOffset=renderer.scanlineOffset=renderer.modePhase=0;
renderer.width=1280;renderer.height=720;renderer.mode='zombie';renderer.zombieHands=[probe];
context.areParticleEffectsEnabled=()=>false;renderer.update(.02);
assert.equal(probe.poseSeq,1,'the next pose starts at the endpoint, never skips a joint state');
assert(probe.poseBlend>0&&probe.poseBlend<.02,'carry sub-frame progress through the pose boundary');
console.log('Zombie articulation remains continuous with particle effects disabled.');
