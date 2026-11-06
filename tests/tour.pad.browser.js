// Gamepad in the Tour: Y opens it from the menu, the d-pad moves focus, A presses, B closes.
// Run: node tests/tour.pad.browser.js
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'game');
const { chromium } = require('playwright');
const assert = require('assert');
(async()=>{
  const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const ctx = await b.newContext({viewport:{width:1366,height:768}});
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'pingpong.local') return route.abort();
    const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    if (!target.startsWith(root + path.sep)) return route.abort();
    try { await route.fulfill({ path: target }); } catch { await route.fulfill({ status: 404 }); }
  });
  await ctx.addInitScript(()=>{
    localStorage.setItem('pp-tour-v1', JSON.stringify({v:1,stages:{1:{goals:[true,true],stars:3},2:{goals:[false,false],stars:1}},completed:false}));
    for (const k of ['pc','mobile']) localStorage.setItem(`pp-controls-tutorial-v2-${k}-all`,'1'); for (const m of ['classic','gravity','speed','obstacle']) localStorage.setItem(`pp-guide-seen-v3-${m}`,'1');
    window.__btn = {}; window.__ax=[0,0];
    navigator.getGamepads = () => [{ connected:true, axes:window.__ax, buttons:Array.from({length:17},(_,i)=>({pressed:!!window.__btn[i]})) }];
  });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://pingpong.local/play.html?from_intro=1&nosw',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.PPTour&&window.game,null,{timeout:120000});
  await p.evaluate(()=>window.dispatchEvent(new Event('gamepadconnected')));
  await p.waitForTimeout(800);
  const press = async (i)=>{ await p.evaluate((i)=>{__btn[i]=true;},i); await p.waitForTimeout(150); await p.evaluate((i)=>{__btn[i]=false;},i); await p.waitForTimeout(150); };
  await press(3);
  await p.waitForFunction(()=>PPTour.isOpen(),null,{timeout:5000});
  await p.waitForTimeout(600);
  const f = () => p.evaluate(()=>document.activeElement.dataset.play||document.activeElement.className);
  const first = await f(); console.log('focus', first);
  await press(15); const second = await f(); console.log('right', second); assert.notEqual(first, second);
  await press(13); const third = await f(); console.log('down', third); assert.notEqual(second, third);
  await press(14); await press(12);
  console.log('after left/up', await f());
  await press(1); await p.waitForFunction(()=>!PPTour.isOpen(),null,{timeout:3000});
  // A launches the focused stage
  await press(3); await p.waitForFunction(()=>PPTour.isOpen()); await p.waitForTimeout(600);
  await press(0);
  await p.waitForFunction(()=>game.getTourContext()?.stageId>0,null,{timeout:30000});
  console.log('launched stage', await p.evaluate(()=>game.getTourContext().stageId));
  assert.deepEqual(errs,[]); await b.close(); console.log('pad ok');
})().catch(e=>{console.error(e);process.exit(1)});
