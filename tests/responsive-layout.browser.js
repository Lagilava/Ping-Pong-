// Representative viewport audit of the main interactive surfaces.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'game');
const output = process.argv[2] && path.resolve(process.argv[2]);
const sizes = [
    ['phone-320', 320, 568, true], ['phone-390', 390, 844, true],
    ['phone-landscape', 640, 360, true], ['tablet', 768, 1024, true],
    ['tablet-landscape', 1024, 768, true], ['small-laptop', 1024, 600, false],
    ['laptop', 1366, 768, false], ['desktop', 1920, 1080, false],
    ['ultrawide', 2560, 1080, false],
];

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
        for (const [name, width, height, mobile] of sizes.filter(s => !process.env.RESPONSIVE_SIZES ||
            process.env.RESPONSIVE_SIZES.split(',').includes(s[0]))) {
            const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile,
                hasTouch: mobile, deviceScaleFactor: 1 });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'pingpong.local') return route.abort();
                const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
                if (!target.startsWith(root + path.sep)) return route.abort();
                try { await route.fulfill({ path: target }); } catch { await route.fulfill({ status: 404 }); }
            });
            await context.addInitScript(() => {
                Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable in test'));
                localStorage.setItem('pp-controls-tutorial-v2-mobile-all', '1');
            });
            const page = await context.newPage();
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw');
            await page.waitForFunction(() => window.game && window.ModeTutorial && window.ppOpenPanel);
            const check = async (selector, label) => {
                const rect = await page.locator(selector).first().boundingBox();
                assert.ok(rect && rect.width > 100 && rect.height > 30, `${name} ${label} missing`);
                assert.ok(rect.x >= -2 && rect.y >= -2 && rect.x + rect.width <= width + 2 &&
                    rect.y + rect.height <= height + 2, `${name} ${label} clipped: ${JSON.stringify(rect)}`);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false,
                    `${name} ${label} document overflow`);
                if (output) {
                    fs.mkdirSync(output, { recursive: true });
                    await page.screenshot({ path: path.join(output, `${name}-${label}.png`), animations: 'disabled' });
                }
            };
            await check('#overlay', 'menu');
            assert.equal(await page.locator('#menuToggleBtn').count(), 0, `${name} legacy menu toggle`);
            assert.equal(await page.locator('#menuProgressPanel [data-open-panel="settings"]').count(), 0,
                `${name} duplicate settings icon`);
            const pass = await page.locator('#menuProgressPanel').boundingBox();
            assert.ok(pass && pass.x >= 0 && pass.y >= 0 && pass.x + pass.width <= width + 2,
                `${name} player progress outside screen`);
            for (const selector of ['[data-open-panel="profile"]', '[data-open-achievements]']) {
                const button = await page.locator(`#menuProgressPanel ${selector}`).boundingBox();
                assert.ok(button && button.x >= pass.x && button.y >= pass.y &&
                    button.x + button.width <= pass.x + pass.width + 1 &&
                    button.y + button.height <= pass.y + pass.height + 1,
                `${name} player action outside progress card`);
                if (mobile) assert.ok(button.width >= 44 && button.height >= 44,
                    `${name} player action too small`);
            }
            await page.locator('#menuProgressPanel [data-open-panel="profile"]').click();
            await page.locator('#pp-settings').waitFor({ state: 'visible' });
            await page.evaluate(() => ppCloseOpenPanel());
            await page.locator('#menuProgressPanel [data-open-achievements]').click();
            await page.locator('.achievement-sidebar.visible').waitFor();
            await page.locator('.achievement-sidebar .close-sidebar').click();
            await page.locator('.main-menu-settings').click();
            await page.locator('#pp-settings').waitFor({ state: 'visible' });
            await check('#pp-settings .ppset-box', 'menu-settings');
            await page.evaluate(() => ppCloseOpenPanel());
            await page.locator('.card[data-mode="classic"]').click();
            await page.locator('#modeTutorial').waitFor({ state: 'visible' });
            await page.evaluate(() => ModeTutorial.close());
            await check('#modal .modal-box', 'setup');
            await page.evaluate(() => ppOpenPanel('settings'));
            await page.locator('#pp-settings').waitFor({ state: 'visible' });
            await check('#pp-settings .ppset-box', 'settings');
            await page.evaluate(() => ppCloseOpenPanel());
            await page.locator('#btnBack').click();
            await page.evaluate(() => openCustomiseOverlay());
            await page.locator('#modeTutorial').waitFor({ state: 'visible' });
            await page.evaluate(() => ModeTutorial.close());
            await check('#customiseOverlay', 'custom');
            await page.locator('#customStartMatchBtn').scrollIntoViewIfNeeded();
            assert.ok(await page.locator('#customStartMatchBtn').isVisible(), `${name} custom start unreachable`);
            await page.locator('#customiseBackBtn').click();
            await page.locator('.card[data-mode="classic"]').click();
            await page.locator('#btnGo').click();
            await page.waitForFunction(() => document.body.classList.contains('pp-in-match'));
            await check('#c', 'match');
            await page.evaluate(() => game.skipIntro());
            await page.waitForTimeout(150);
            assert.equal(await page.locator('#ppControlsTutorial:not([hidden])').count(), 0,
                `${name} duplicate controls tutorial after screenshot guide`);
            if (!mobile || width > height) {
                await page.evaluate(() => document.getElementById('cyber-menu-btn').click());
                assert.equal(await page.evaluate(() => game.userPaused &&
                    document.getElementById('pauseMenu').classList.contains('open')), true,
                `${name} in-match Menu did not pause`);
                await page.evaluate(() => game.setUserPaused(false));
            }
            if (mobile) {
                const budget = await page.evaluate(() => {
                    const first = PPTouchPad.padRect();
                    const reused = first === PPTouchPad.padRect();
                    const old = PPSettings.get('touchLayout');
                    PPSettings.set('touchLayout', { pad: { x: .8, y: .7, h: .4 }, ab: null });
                    const invalidated = first !== PPTouchPad.padRect();
                    PPSettings.set('touchLayout', old);
                    return { reused, invalidated, scale: PerfGovernor.renderScale, bgFps: PerfGovernor.current.bgFps };
                });
                assert.ok(budget.reused && budget.invalidated, `${name} touch layout cache`);
                assert.ok(budget.scale <= 1.25 && budget.bgFps <= 30, `${name} mobile render budget`);
            }
            console.log(`${name}: menu, setup, settings, Custom, match passed`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
