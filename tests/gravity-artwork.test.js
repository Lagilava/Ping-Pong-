const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function main() {
    const images = [], positions = [], rotations = [], backdropDraws = [];
    let invalidations = 0, blits = 0, dots = 0, bakes = 0, shades = 0;
    const ctx = {save(){},restore(){},translate(x,y){positions.push([x,y]);},rotate(a){rotations.push(a);},beginPath(){},arc(){},stroke(){},
        drawImage(...args){blits++; if(args[0]===images[0])backdropDraws.push(args);}, fillRect(){dots++;}, globalAlpha: 1};
    const sandbox = {URL, Promise, window: {game: {bgRenderer: {_invalidateBackgroundRenderCache(){invalidations++;}}}},
        Image: class {constructor(){images.push(this);}},
        document: {createElement() { bakes++; return {width:0,height:0,getContext:()=>new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>{shades++;return {addColorStop(){}};}:()=>{}})}; }, currentScript: {src:'https://example.com/Ping-Pong-/game/js/render/gravity-art.js'}},
        areParticleEffectsEnabled: () => true};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/gravity-art.js'),'utf8'),sandbox);
    const art = sandbox.window.GravityArt;
    assert.equal(art.drawBackground(ctx,1024,576,0),false);
    assert.equal(art.drawWell(ctx,100,100,90,0),false);
    assert.equal(images.length,3);
    assert.equal(images[0].src,'https://example.com/Ping-Pong-/game/assets/gravity/gravity-scene-hd.webp');
    images[0].naturalWidth=1920; images[0].naturalHeight=1080;
    images[2].naturalWidth=1774; images[2].naturalHeight=887;
    images[0].onload(); images[1].onload(); images[2].onload();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(invalidations,3);
    assert.equal(art.status().sceneReady,true);
    assert.equal(bakes,1,'shade the transparent planet atlas once after decoding');
    assert.equal(shades,2,'each planet has directional illumination');
    blits=dots=0;
    for(let i=0;i<120;i++) {
        assert.equal(art.drawBackground(ctx,1024,576,i/60),true);
        for(let j=0;j<5;j++) assert.equal(art.drawWell(ctx,j*100,100,90,i/60,1),true);
    }
    for(const draw of backdropDraws){
        assert(draw.slice(1).every(Number.isFinite),'backdrop projection stays finite');
        assert(Math.abs(draw[3]/draw[4]-1920/1080)<1e-9,'preserve the optical aspect ratio');
    }
    assert.equal(blits,120*8,'one backdrop, two planets and one image draw per well');
    assert.equal(dots,120*88,'72 stars plus eight simple cross sparkles have a fixed budget');
    assert.equal(images.length,3,'warm frames do not create new images');
    assert.equal(bakes,1,'warm frames reuse the lit planet atlas');
    assert.equal(shades,2,'warm frames never rebuild lighting gradients');
    positions.length=rotations.length=0;
    art.drawBackground(ctx,1920,1080,0);
    const atStart=JSON.stringify(positions), angleStart=JSON.stringify(rotations);
    positions.length=rotations.length=0;
    art.drawBackground(ctx,1920,1080,10);
    assert.notEqual(JSON.stringify(positions),atStart,'planets drift independently over time');
    assert.notEqual(JSON.stringify(rotations),angleStart,'planets rotate');
    sandbox.areParticleEffectsEnabled=()=>false;
    dots=0; art.drawBackground(ctx,1024,576,2);
    assert.equal(dots,0,'particle preference removes moving stars');
    console.log('Gravity generated artwork loading and animated draw budgets passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});

