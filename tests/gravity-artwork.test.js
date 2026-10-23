const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function main() {
    const images = [];
    let invalidations = 0, blits = 0, dots = 0;
    const ctx = {save(){},restore(){},translate(){},rotate(){},beginPath(){},arc(){},stroke(){},
        drawImage(){blits++;}, fillRect(){dots++;}, globalAlpha: 1};
    const sandbox = {URL, Promise, window: {game: {bgRenderer: {_invalidateBackgroundRenderCache(){invalidations++;}}}},
        Image: class {constructor(){images.push(this);}},
        document: {currentScript: {src:'https://example.com/Ping-Pong-/game/js/render/gravity-art.js'}},
        areParticleEffectsEnabled: () => true};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/render/gravity-art.js'),'utf8'),sandbox);
    const art = sandbox.window.GravityArt;
    assert.equal(art.drawBackground(ctx,1024,576,0),false);
    assert.equal(art.drawWell(ctx,100,100,90,0),false);
    assert.equal(images.length,2);
    assert.equal(images[0].src,'https://example.com/Ping-Pong-/game/assets/gravity/gravity-scene.webp');
    images[0].onload(); images[1].onload();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(invalidations,2);
    assert.equal(art.status().sceneReady,true);
    blits=dots=0;
    for(let i=0;i<120;i++) {
        assert.equal(art.drawBackground(ctx,1024,576,i/60),true);
        for(let j=0;j<5;j++) assert.equal(art.drawWell(ctx,j*100,100,90,i/60,1),true);
    }
    assert.equal(blits,120*6,'one backdrop and one image draw per well');
    assert.equal(dots,120*36,'star work has a fixed budget');
    assert.equal(images.length,2,'warm frames do not create new images');
    sandbox.areParticleEffectsEnabled=()=>false;
    dots=0; art.drawBackground(ctx,1024,576,2);
    assert.equal(dots,0,'particle preference removes moving stars');
    console.log('Gravity generated artwork loading and animated draw budgets passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
