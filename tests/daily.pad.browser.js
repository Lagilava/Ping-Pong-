// Gamepad in the Daily Match: X opens it from the menu, A starts, B closes.
// Run: node tests/tour.pad.browser.js
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'game');
const { chromium } = require('playwright');
const assert = require('assert');
(async()=>{
  const b = await chromium.launch({executablePath: process.env.BROWSER_PATH || undefined, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
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
  await p.waitForFunction(()=>window.PPDaily&&window.PPTour&&window.game,null,{timeout:120000});
  await p.evaluate(()=>window.dispatchEvent(new Event('gamepadconnected')));
  await p.waitForTimeout(800);
  const press = async (i)=>{ await p.evaluate((i)=>{__btn[i]=true;},i); await p.waitForTimeout(150); await p.evaluate((i)=>{__btn[i]=false;},i); await p.waitForTimeout(150); };
  await press(2);
  await p.waitForFunction(()=>PPDaily.isOpen(),null,{timeout:5000});
  assert.equal(await p.evaluate(()=>document.activeElement.className), 'ppdaily-play', 'Play is focused');
  await press(1); await p.waitForFunction(()=>!PPDaily.isOpen(),null,{timeout:3000});
  // Y still opens the Tour, X the Daily.
  await press(3); await p.waitForFunction(()=>PPTour.isOpen()); await press(1); await p.waitForFunction(()=>!PPTour.isOpen());
  await press(2); await p.waitForFunction(()=>PPDaily.isOpen()); await p.waitForTimeout(500);
  await press(0);
  await p.waitForFunction(()=>game.getTourContext()?.stageId==='daily',null,{timeout:30000});
  assert.equal(await p.evaluate(()=>PPDaily.isOpen()), false);
  assert.deepEqual(errs,[]); await b.close(); console.log('daily pad ok');
})().catch(e=>{console.error(e);process.exit(1)});
