const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'game');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_PATH || undefined, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
 try {
  for (const device of [
   {name:'desktop', viewport:{width:1366,height:768}, touch:false},
   {name:'phone', viewport:{width:844,height:390}, touch:true, isMobile:true, hasTouch:true},
   {name:'tablet', viewport:{width:1024,height:768}, touch:true, hasTouch:true, userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'}
  ]) {
   const {name,touch,...options}=device;
   const context=await browser.newContext(options);
   await context.route('**/*', async route => {const url=new URL(route.request().url()); if(url.hostname!=='pingpong.local') return route.abort(); const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,'')); if(!target.startsWith(root+path.sep))return route.abort(); try { await route.fulfill({path:target}); } catch {await route.fulfill({status:404});}});
   await context.addInitScript(({tablet})=>{ if(tablet) Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true}); Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Unavailable')); for(const k of ['pc','mobile']) localStorage.setItem(`pp-controls-tutorial-v2-${k}-all`,'1'); for(const m of ['classic','customise']) localStorage.setItem(`pp-guide-seen-v3-${m}`,'1'); },{tablet:name==='tablet'});
   const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://pingpong.local/play.html?from_intro=1&nosw',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.game && window.PPDevice && window.PPOnline,null,{timeout:90000});
   assert.equal(await page.evaluate(()=>PPDevice.touch),touch,`${name} classification`);
   await page.locator('#cardRow .card[data-mode="classic"]').click({timeout:30000});
   const modal=page.locator('#modal'); await modal.waitFor({state:'visible',timeout:10000});
   assert.equal(await page.locator('#modal [data-mp="true"]').isVisible(),!touch,`${name} local option`);
   assert.equal(await page.locator('#modal [data-mp="online"]').isVisible(),true,`${name} online option`);
   await page.evaluate(()=>{document.querySelector('#modal [data-mp="true"]').click()});
   if(touch) assert.notEqual(await page.locator('#modal .opt.sel').getAttribute('data-mp'),'true',`${name} programmatic click blocked`);
   await page.evaluate(()=>window.openCustomiseOverlay());
   await page.locator('#customiseOverlay.active').waitFor({timeout:10000});
   assert.equal(await page.locator('#customStartMatchBtn').isVisible(),!touch,`${name} custom local`);
   assert.equal(await page.locator('.customise-online-btn').isVisible(),true,`${name} custom online`);
   if(touch){const before=await page.evaluate(()=>({running:game.running,intro:game.introActive}));await page.evaluate(async()=>{ await window.__ppStartCustomMatch(); if (window.__ppStartCustomMatchCore) await window.__ppStartCustomMatchCore(); });const after=await page.evaluate(()=>({running:game.running,intro:game.introActive}));assert.deepEqual(after,before,`${name} direct custom start blocked`);assert.match(await page.locator('#customModeNotice').innerText(),/online/i);}
   await page.locator('.customise-online-btn').click();
   await page.locator('#pp-online.open').waitFor({timeout:10000});
   assert.match(await page.locator('#pponTitle').innerText(), /play online/i, `${name} online lobby`);
   assert.deepEqual(errors,[],`${name} errors`);console.log(`${name} ok`);await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
