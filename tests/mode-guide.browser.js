// Browser flow and viewport audit for the first-visit animated guides.
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
            { name: 'tablet', width: 768, height: 1024, mobile: true },
            { name: 'tablet-landscape', width: 1024, height: 768, mobile: true },
            { name: 'small-laptop', width: 1024, height: 600, mobile: false },
            { name: 'laptop', width: 1366, height: 768, mobile: false },
            { name: 'desktop', width: 1920, height: 1080, mobile: false },
            { name: 'ultrawide', width: 2560, height: 1080, mobile: false },
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
                Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable in test'));
                localStorage.setItem('pp-controls-tutorial-v2-mobile-all', '1');
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(`${size.name}: ${error.message}`));
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw');
            await page.waitForFunction(() => window.game && window.ModeTutorial && window.openCustomiseOverlay);
            if (output) fs.mkdirSync(output, { recursive: true });
            for (const mode of ['classic', 'zombie', 'gravity', 'speed', 'obstacle', 'customise']) {
                if (mode === 'customise') await page.evaluate(() => openCustomiseOverlay());
                else await page.locator(`.card[data-mode="${mode}"]`).click();
                await page.locator('#modeTutorial').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#modeTutorial').getAttribute('data-mode'), mode);
                for (let step = 0; step < 3; step++) {
                    assert.equal(await page.locator('#modeTutorial').getAttribute('data-step'), String(step));
                    const geometry = await page.evaluate(() => {
                        const stage = document.querySelector('.guide-demo-scene').getBoundingClientRect();
                        const next = document.querySelector('[data-guide-next]').getBoundingClientRect();
                        const dialog = document.querySelector('.mode-tutorial-card').getBoundingClientRect();
                        return { stage: stage.toJSON(), next: next.toJSON(), dialog: dialog.toJSON(),
                            overflow: document.documentElement.scrollWidth > innerWidth + 2 };
                    });
                    assert.ok(geometry.stage.width > 100 && geometry.stage.height >= 70, `${size.name} ${mode} scene hidden`);
                    assert.ok(geometry.next.width >= 44 && geometry.next.height >= 40, `${size.name} ${mode} next target`);
                    assert.ok(!geometry.overflow && geometry.dialog.left >= 0 && geometry.dialog.right <= size.width + 1 &&
                        geometry.dialog.top >= 0 && geometry.dialog.bottom <= size.height + 1, `${size.name} ${mode} overflow`);
                    if (size.name === 'small-phone' && step === 0) {
                        const animated = mode === 'customise' ? '.guide-workshop-cursor' : '.guide-ball';
                        const before = await page.locator(animated).evaluate(el => getComputedStyle(el).transform);
                        await page.waitForTimeout(240);
                        const after = await page.locator(animated).evaluate(el => getComputedStyle(el).transform);
                        assert.notEqual(after, before, `${mode} scene does not animate`);
                    }
                    if (output && (step === 0 || size.name === 'small-phone')) await page.screenshot({ path: path.join(output, `${size.name}-${mode}-${step + 1}.png`),
                        animations: 'disabled' });
                    if (step < 2) await page.locator('[data-guide-next]').click();
                }
                await page.locator('[data-close-tutorial]').last().click();
                if (mode === 'customise') await page.locator('#customiseBackBtn').click();
                else await page.locator('#btnBack').click();
                // Second setup should be ready immediately, with replay available.
                if (mode === 'customise') await page.evaluate(() => openCustomiseOverlay());
                else await page.locator(`.card[data-mode="${mode}"]`).click();
                assert.ok(await page.locator('#modeTutorial').isHidden(), `${size.name} ${mode} repeated guide`);
                const replay = page.locator(`[data-mode-tutorial="${mode}"]`).first();
                await replay.click();
                assert.ok(await page.locator('#modeTutorial').isVisible());
                await page.locator('.mode-tutorial-close').click();
                if (mode === 'customise') await page.locator('#customiseBackBtn').click();
                else await page.locator('#btnBack').click();
            }
            console.log(`${size.name}: all six guides and replay passed`);
            await context.close();
        }
        assert.deepEqual(errors, [], errors.join('\n'));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
