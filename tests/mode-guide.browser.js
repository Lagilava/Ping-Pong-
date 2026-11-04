// First-run guide, mode-card responsiveness and viewport audit.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'game');
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const errors = [];
    try {
        const sizes = [
            { name: 'small-phone', width: 320, height: 568, mobile: true },
            { name: 'phone', width: 390, height: 844, mobile: true },
            { name: 'phone-landscape', width: 640, height: 360, mobile: true },
            { name: 'large-phone-landscape', width: 844, height: 390, mobile: true },
            { name: 'tablet', width: 768, height: 1024, mobile: true },
            { name: 'laptop', width: 1366, height: 768, mobile: false }
        ];
        for (const size of sizes.filter(s => !process.env.GUIDE_SIZES || process.env.GUIDE_SIZES.split(',').includes(s.name))) {
            const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
                isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1 });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'pingpong.local') return route.abort();
                const file = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'play.html';
                const target = path.resolve(root, file);
                if (!target.startsWith(root + path.sep)) return route.abort();
                try { await route.fulfill({ path: target }); }
                catch { await route.fulfill({ status: 404 }); }
            });
            await context.addInitScript(() => {
                window.__fullscreenRequests = 0;
                Element.prototype.requestFullscreen = () => {
                    window.__fullscreenRequests++;
                    return Promise.reject(new Error('Unavailable in test'));
                };
                localStorage.setItem('pp-controls-tutorial-v2-mobile-all', '1');
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(`${size.name}: ${error.message}`));
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw');
            await page.waitForFunction(() => window.game && window.ModeTutorial && window.openCustomiseOverlay);
            if (output) fs.mkdirSync(output, { recursive: true });
            for (const mode of ['classic', 'zombie', 'gravity', 'speed', 'obstacle']) {
                await page.locator(`.card[data-mode="${mode}"]`).click();
                await page.locator('#modal.on').waitFor();
                assert.ok(await page.locator('#modeTutorial').isHidden(), `${size.name} ${mode}: card tap must open setup first`);
                await page.locator('#btnGo').click();
                await page.locator('#modeTutorial').waitFor({ state: 'visible' });
                if (size.mobile) assert.equal(await page.evaluate(() => window.__fullscreenRequests), 0,
                    `${size.name} ${mode}: guide must appear before fullscreen`);
                assert.equal(await page.locator('.guide-pin').count(), 3);
                await page.waitForFunction(() => {
                    const img = document.querySelector('.guide-shot img');
                    return img?.complete && img.naturalWidth > 0;
                });
                const geometry = await page.evaluate(() => {
                    const card = document.querySelector('.mode-tutorial-card').getBoundingClientRect();
                    const image = document.querySelector('.guide-shot-frame').getBoundingClientRect();
                    const play = document.querySelector('.guide-accept').getBoundingClientRect();
                    return { card: card.toJSON(), image: image.toJSON(), play: play.toJSON(),
                        overflow: document.documentElement.scrollWidth > innerWidth + 2 };
                });
                assert.ok(!geometry.overflow && geometry.card.left >= 0 && geometry.card.right <= size.width + 1 &&
                    geometry.card.top >= 0 && geometry.card.bottom <= size.height + 1, `${size.name} ${mode}: guide overflow`);
                assert.ok(geometry.image.width > 100 && geometry.image.height > 60, `${size.name} ${mode}: screenshot unreadable`);
                assert.ok(geometry.play.width >= 44 && geometry.play.height >= 44, `${size.name} ${mode}: Play target too small ${JSON.stringify(geometry.play)}`);
                if (output && (size.name === 'large-phone-landscape' || (size.name === 'small-phone' && mode === 'classic')))
                    await page.screenshot({ path: path.join(output, `${size.name}-${mode}.png`), animations: 'disabled' });
                await page.locator('.guide-back').click();
                assert.equal(await page.evaluate(mode => window.ModeTutorial.hasViewed(mode), mode), false);
                await page.locator(`[data-mode-tutorial="${mode}"]`).first().click();
                await page.locator('.guide-accept').click();
                assert.equal(await page.evaluate(mode => window.ModeTutorial.hasViewed(mode), mode), true);
                await page.locator('#btnBack').click();
            }
            await page.evaluate(() => openCustomiseOverlay());
            await page.locator('#modeTutorial').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#modeTutorial').getAttribute('data-mode'), 'customise');
            if (output) await page.screenshot({ path: path.join(output, `${size.name}-custom.png`), animations: 'disabled' });
            await page.locator('.guide-accept').click();
            await page.locator('#customiseBackBtn').click();
            // Accepting a first-run guide launches the match, while Back did not.
            await page.evaluate(() => localStorage.removeItem('pp-guide-seen-v3-classic'));
            await page.locator('.card[data-mode="classic"]').click();
            await page.locator('#btnGo').click();
            await page.locator('.guide-accept').click();
            await page.waitForFunction(() => game.introActive || game.running);
            if (size.mobile) assert.equal(await page.evaluate(() => window.__fullscreenRequests), 1,
                `${size.name}: accepted guide enters fullscreen`);
            assert.equal(await page.evaluate(() => ModeTutorial.hasViewed('classic')), true);
            assert.ok(await page.locator('#modeTutorial').isHidden());
            console.log(`${size.name}: setup, quick guides and Custom passed`);
            await context.close();
        }
        assert.deepEqual(errors, [], errors.join('\n'));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
