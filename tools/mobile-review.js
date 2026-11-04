// Reproducible mobile screenshot audit. No web server or external network needed.
// node tools/mobile-review.js <output-dir> [before|after]
// BROWSER_PATH may select a locally installed Chromium browser.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'docs/mobile-review'));
const phase = process.argv[3] || 'after';
const original = new Map();
const changed = ['play.html', 'css/mobile.css', 'css/mobile-fit.css', 'js/app/bootstrap.js', 'js/menu/menu.js'];
if (phase === 'before') for (const file of changed) original.set(file,
    execFileSync('git', ['show', 'HEAD:game/' + file], { cwd: root }));

(async () => {
    fs.mkdirSync(path.join(output, phase), { recursive: true });
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const errors = [], captures = [], metrics = {};
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname !== 'pingpong.local') return route.abort();
            const file = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
            const target = path.resolve(root, 'game', file);
            if (!target.startsWith(path.join(root, 'game') + path.sep)) return route.abort();
            try {
                if (original.has(file)) return await route.fulfill({ body: original.get(file),
                    contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript' });
                await route.fulfill({ path: target });
            } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
        });
        await context.addInitScript(() => {
            // Count actual WebGL menu clears, rather than rAF callbacks.
            window.__menuClears = 0;
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (...args) {
                const ctx = getContext.apply(this, args);
                if (this.id === 'menuCanvas' && ctx?.clear && !ctx.__counted) {
                    const clear = ctx.clear;
                    ctx.clear = function (...values) { window.__menuClears++; return clear.apply(this, values); };
                    ctx.__counted = true;
                }
                return ctx;
            };
            window.__fullscreenRequests = 0;
            Element.prototype.requestFullscreen = () => {
                window.__fullscreenRequests++;
                return Promise.reject(new Error('Fullscreen intentionally unavailable in audit'));
            };
            localStorage.setItem('pp-controls-tutorial-v2-mobile-all', '1');
        });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        const shot = async name => {
            await page.waitForTimeout(380);
            await page.screenshot({ path: path.join(output, phase, name + '.png'), scale: 'css', animations: 'disabled' });
            captures.push(name);
        };
        const load = async (file = 'play.html?from_intro=1&nosw') => {
            await page.goto('http://pingpong.local/' + file);
            await page.waitForTimeout(900);
        };
        await load();
        await page.waitForFunction(() => window.game && window.ppOpenPanel && window.Forge?.UI);
        await shot('portrait-entry');
        if (phase === 'after') assert.equal(await page.locator('.pp-rotate-block').isVisible(), false,
            'portrait menus must be usable');
        // Before: expose the UI below the gate solely to audit its layout.
        // Preserve portrait-entry as the unmodified first-visit evidence.
        if (phase === 'before') await page.addStyleTag({ content: '.pp-rotate-block{display:none!important}' });
        for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(size);
            const orientation = size.width > size.height ? 'landscape' : 'portrait';
            await shot('menu-' + orientation);
            await page.evaluate(() => { window.__menuClears = 0; });
            await page.waitForTimeout(2000);
            metrics[orientation] = { menuClearsIn2s: await page.evaluate(() => window.__menuClears) };
            await page.locator('[data-open-panel="settings"]').first().click();
            if (phase === 'after') assert.equal(await page.evaluate(() => window.__fullscreenRequests), 0,
                'browsing must not request fullscreen');
            for (const tab of await page.locator('.ppset-tabs [data-tab]').evaluateAll(es => es.map(e => e.dataset.tab))) {
                await page.locator('.ppset-tabs [data-tab="' + tab + '"]').click();
                await shot('settings-' + tab + '-' + orientation);
            }
            await page.waitForTimeout(200);
            await page.evaluate(() => { window.__menuClears = 0; });
            await page.waitForTimeout(500);
            metrics[orientation].coveredMenuClearsIn500ms = await page.evaluate(() => window.__menuClears);
            if (phase === 'after') assert.equal(metrics[orientation].coveredMenuClearsIn500ms, 0,
                'opaque settings must suspend menu GPU rendering');
            await page.evaluate(() => ppCloseOpenPanel());
            await page.getByRole('button', { name: 'Achievements', exact: true }).click();
            await shot('achievements-' + orientation);
            await page.locator('.close-sidebar').click();
            await page.evaluate(() => ppOpenPanel('help'));
            await shot('help-' + orientation);
            await page.evaluate(() => ppCloseOpenPanel());
            for (const mode of ['classic', 'zombie', 'gravity', 'speed', 'obstacle']) {
                const card = page.locator('.card[data-mode="' + mode + '"]');
                if (phase === 'after') await card.tap(); else await card.click();
                await page.locator('#modal').waitFor({ state: 'visible' });
                await shot('setup-' + mode + '-' + orientation);
                await page.evaluate(m => ModeTutorial.open(m), mode);
                await shot('tutorial-' + mode + '-' + orientation);
                await page.evaluate(() => ModeTutorial.close());
                await page.locator('#btnBack').click();
                await page.waitForTimeout(350);
            }
            await page.locator('.card[data-mode="customise"]').click();
            await page.waitForTimeout(400);
            for (const tab of await page.locator('[data-custom-tab]').evaluateAll(es => es.map(e => e.dataset.customTab))) {
                await page.locator('[data-custom-tab="' + tab + '"]').click();
                await shot('custom-' + tab + '-' + orientation);
            }
            await page.locator('[data-custom-tab="arena"]').click();
            await page.locator('#forgeEditBtn').click();
            await shot('forge-' + orientation);
            await page.evaluate(() => Forge.UI.editor.close(false));
            await page.locator('#customiseBackBtn').click();
            await page.waitForTimeout(350);
        }
        await page.setViewportSize({ width: 844, height: 390 });
        await page.locator('.card[data-mode="classic"]').click();
        await page.locator('[data-mp="online"]').click();
        await shot('online-setup-landscape');
        await page.locator('#btnGo').click();
        await shot('online-lobby-landscape');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot('online-lobby-portrait');
        await load();
        await page.setViewportSize({ width: 844, height: 390 });
        for (const mode of ['classic', 'zombie', 'gravity', 'speed', 'obstacle', 'customise']) {
            if (mode === 'customise') {
                await page.locator('.card[data-mode="customise"]').click();
                await page.locator('#customStartMatchBtn').click();
            } else {
                await page.locator('.card[data-mode="' + mode + '"]').click();
                await page.locator('#btnGo').click();
            }
            await page.waitForFunction(() => window.game?.introActive || window.game?.running);
            await page.evaluate(() => { game.skipIntro(); });
            await page.waitForTimeout(700);
            const briefing = page.locator('.zombie-briefing.visible .zombie-briefing-start');
            if (await briefing.count()) {
                await shot('briefing-' + mode + '-landscape');
                await briefing.click();
                await page.waitForTimeout(300);
            }
            await shot('game-' + mode + '-landscape');
            await page.evaluate(() => game.setUserPaused(true));
            await shot('pause-' + mode + '-landscape');
            if (mode === 'classic') {
                await page.evaluate(() => game.handlePauseAction('quit', { dataset: { act: 'quit' } }));
                await shot('quit-confirm-landscape');
                await page.evaluate(() => game.handlePauseAction('cancel-confirm'));
                await page.setViewportSize({ width: 390, height: 844 });
                await shot('match-rotation-prompt');
                if (phase === 'after') assert.equal(await page.locator('.pp-rotate-block').isVisible(), true);
                await page.setViewportSize({ width: 844, height: 390 });
                assert.equal(await page.evaluate(() => game.userPaused), true, 'rotation keeps match paused');
            }
            await page.evaluate(() => game.returnToMenu());
            await page.waitForTimeout(500);
        }
        for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(size);
            await page.evaluate(() => PPResults.show({ mode: 'classic', title: 'You win', tone: 'win',
                left: { label: 'Player', score: 11 }, right: { label: 'Computer', score: 7 },
                lines: ['Best rally: 12 returns', 'Match time: 2:34'],
                actions: [{ label: 'Play again', primary: true }, { label: 'Main menu', back: true }] }));
            await shot('results-fixture-' + (size.width > size.height ? 'landscape' : 'portrait'));
            await page.evaluate(() => PPResults.hide());
        }
        for (const file of ['index.html', 'ball-studio.html']) for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(size);
            await load(file);
            await shot(file.replace('.html', '') + '-' + (size.width > size.height ? 'landscape' : 'portrait'));
        }
        assert.deepEqual(errors, [], 'mobile screens must not throw browser exceptions');
        fs.writeFileSync(path.join(output, phase + '.json'), JSON.stringify({ phase, captures, metrics, errors,
            notes: ['390x844 and 844x390 Chromium touch emulation at DPR 2.',
                'Before portrait-entry preserves the gate; other before portrait UI shots expose it for inspection.',
                'Results use a labeled UI fixture. Online lobby only; no live peer/network session.',
                'Menu clear counts are headless observations, not physical phone FPS.'] }, null, 2));
        console.log(JSON.stringify({ phase, screenshots: captures.length, metrics, errors }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
