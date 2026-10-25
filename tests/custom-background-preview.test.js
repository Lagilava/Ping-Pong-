const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game/js/menu/menu.js'),'utf8');
const start=source.indexOf('        const drawLiveCustomBackground = () => {');
const end=source.indexOf('        window.__ppDrawCustomLiveBackground =',start);
let frames=0;
const ctx={fillRect(){}};
const canvas={width:620,height:350,style:{display:'none'},parentElement:{clientWidth:620,clientHeight:350},getContext:()=>ctx};
const image={style:{display:'block'}};
const sandbox=vm.createContext({window:{devicePixelRatio:1,game:{customSettings:{backgroundMode:'gravity'},getCustomBackgroundToneFilter:()=>''},
    CustomBackgrounds:{drawSelection(){frames++;}}},document:{getElementById:id=>id==='customLiveBackgroundCanvas'?canvas:image}});
vm.runInContext(source.slice(start,end)+'\nglobalThis.draw=drawLiveCustomBackground;',sandbox);
sandbox.draw();
assert.equal(canvas.style.display,'block','a decoded thumbnail cannot leave the live canvas hidden');
assert.equal(image.style.display,'none');assert.equal(frames,1);
// Exercise the real late-thumbnail callback after the studio takes ownership.
const gameSource=fs.readFileSync(path.join(__dirname,'../game/js/core/game.js'),'utf8');
const a=gameSource.indexOf('            const renderStaticCustomBackgroundPreview = () => {');
const b=gameSource.indexOf('            this._customPreviewRefreshCallback =',a);
sandbox.window.__ppDrawCustomLiveBackground=sandbox.draw;
vm.runInContext(gameSource.slice(a,b)+'\nglobalThis.late=renderStaticCustomBackgroundPreview;',sandbox);
sandbox.late();
assert.equal(frames,2,'late thumbnail readiness delegates to the same live scene');
assert.equal(canvas.style.display,'block');assert.equal(image.style.display,'none');
console.log('Custom studio canvas visibility and late-thumbnail handoff passed.');
