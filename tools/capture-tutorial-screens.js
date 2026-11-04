// Capture genuine game and Custom UI frames for the in-game visual guides.
// node tools/capture-tutorial-screens.js
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'game');
const output = path.join(root, 'assets', 'images', 'tutorial');
const modes = (process.env.CAPTURE_MODES || 'classic,zombie,gravity,speed,obstacle').split(',');

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
        for (const device of [
            { name: 'touch', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
            { name: 'desktop', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
        ].filter(d => !process.env.CAPTURE_DEVICE || d.name === process.env.CAPTURE_DEVICE)) {
            const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'pingpong.local') return route.abort();
                const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
                if (!target.startsWith(root + path.sep)) return route.abort();
                try { await route.fulfill({ path: target }); } catch { await route.fulfill({ status: 404 }); }
            });
            await context.addInitScript(() => {
                Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable while capturing'));
                for (const mode of ['classic', 'zombie', 'gravity', 'speed', 'obstacle', 'customise'])
                    localStorage.setItem(`pp-guide-seen-v3-${mode}`, '1');
                localStorage.setItem('pp-controls-tutorial-v2-mobile-all', '1');
                localStorage.setItem('pp-controls-tutorial-v2-pc-all', '1');
                localStorage.setItem('pp-first-launch-shown-v1', '1');
                for (const mode of ['zombie', 'gravity', 'speed', 'obstacle'])
                    localStorage.setItem(`pp-touch-ability-hint-v1-${mode}`, '1');
            });
            const page = await context.newPage();
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw');
            await page.waitForFunction(() => window.game && window.openCustomiseOverlay && window.PPDeviceControls);
            await page.evaluate(() => PPSettings.set('taunts', false));
            // Transient achievement toast is unrelated to the control being taught.
            await page.addStyleTag({ content: '.pp-ach-stack { display: none !important; }' });
            for (const mode of modes) {
                await page.locator(`.card[data-mode="${mode}"]`).click();
                await page.locator('#btnGo').click();
                await page.waitForFunction(() => game.introActive || game.running);
                await page.evaluate(() => game.skipIntro());
                await page.waitForTimeout(650);
                for (const id of ['zombieBriefing', 'obstacleBriefing']) {
                    const briefing = page.locator(`#${id}.visible .zombie-briefing-start`);
                    if (await briefing.count()) await briefing.click();
                }
                await page.waitForTimeout(350);
                const controls = page.locator('#ppControlsTutorial:not([hidden]) [data-ct-close]');
                if (await controls.count()) await controls.click();
                const welcome = page.locator('#firstLaunchOverlay button');
                if (await welcome.count()) await welcome.click();
                await page.waitForTimeout(550);
                for (const id of ['zombieBriefing', 'obstacleBriefing']) {
                    const briefing = page.locator(`#${id}.visible .zombie-briefing-start`);
                    if (await briefing.count()) await briefing.click();
                }
                if (mode === 'zombie') await page.waitForTimeout(850);
                if (await page.locator('#ppControlsTutorial:not([hidden])').count())
                    throw new Error(`Controls tutorial still covers ${mode}`);
                const visibleBriefings = await page.locator('.zombie-briefing.visible').evaluateAll(els => els.map(el => el.id));
                if (visibleBriefings.length)
                    throw new Error(`Mode briefing still covers ${mode}: ${visibleBriefings.join(', ')}`);
                await page.screenshot({ path: path.join(output, `${mode}-${device.name}.jpg`),
                    type: 'jpeg', quality: 78 });
                await page.evaluate(() => game.returnToMenu());
                await page.waitForTimeout(250);
                console.log(`${device.name}: ${mode}`);
            }
            if (!process.env.CAPTURE_MODES) {
                await page.evaluate(() => openCustomiseOverlay());
                for (const tab of ['arena']) {
                    await page.locator(`[data-custom-tab="${tab}"]`).click();
                    await page.waitForTimeout(200);
                    await page.screenshot({ path: path.join(output, `custom-${tab}-${device.name}.jpg`),
                        type: 'jpeg', quality: 78 });
                    console.log(`${device.name}: custom ${tab}`);
                }
            }
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
