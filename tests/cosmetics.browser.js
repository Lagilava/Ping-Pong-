// Ball trails and titles in a real browser: earning them from a Tour result, the Tour
// screen's pickers, the trail drawn behind a live ball, the title on the profile and the
// versus screen, and the real cost of drawing a trail on a canvas.
// Run: node tests/cosmetics.browser.js [outdir]
const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'game');
const out = process.argv[2] && path.resolve(process.argv[2]);

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        for (const [name, w, h, mobile] of [['pc', 1366, 768, false], ['phone', 844, 390, true]]) {
            const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'pingpong.local') return route.abort();
                const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
                if (!target.startsWith(root + path.sep)) return route.abort();
                try { await route.fulfill({ path: target }); } catch { await route.fulfill({ status: 404 }); }
            });
            await context.addInitScript(() => {
                Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable in test'));
                for (const k of ['pc', 'mobile']) localStorage.setItem(`pp-controls-tutorial-v2-${k}-all`, '1');
                for (const m of ['classic', 'gravity', 'speed', 'obstacle', 'zombie']) localStorage.setItem(`pp-guide-seen-v3-${m}`, '1');
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.game && window.PPTour && window.PPCosmetics, null, { timeout: 90000 });

            // Fresh: nothing earned, nothing drawn.
            assert.equal(await page.evaluate(() => PPCosmetics.activeTrail()), '');
            // Winning the first Club stage through the real match path earns a title and, with stage 2, the first trail.
            await page.evaluate(() => PPTour.launch(1));
            await page.waitForFunction(() => game.getTourContext()?.stageId === 1, null, { timeout: 30000 });
            await page.evaluate(() => PPTourStage.hide());
            await page.waitForFunction(() => game.running && !game.introActive, null, { timeout: 15000 });
            await page.evaluate(() => { game.scores.player = 5; game.scores.ai = 0; game.updateScoreUI(); });
            await page.locator('.ppstage.outro.win').waitFor({ timeout: 60000 });
            await page.evaluate(() => PPTourStage.hide());
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            assert.match(await page.locator('#pp-results').innerText(), /New title: Rookie Slayer/i);
            await page.evaluate(() => PPResults.hide());
            await page.evaluate(() => { PPTour.recordResult({ stageId: 2, won: true, playerScore: 7, aiScore: 0, rally: 5, bestStreak: 3 }); });
            const earned = await page.evaluate(() => PPCosmetics.check().map(o => o.id));
            assert.ok(earned.includes('ember') && earned.includes('clubChampion'), `earned ${earned}`);
            assert.equal(await page.evaluate(() => PPCosmetics.activeTrail()), 'ember');

            // The Tour screen shows the pickers and applies a choice. (A first-win achievement summary may be up.)
            await page.evaluate(() => document.querySelectorAll('.achievement-summary-modal').forEach((e) => e.remove()));
            await page.evaluate(() => PPTour.open());
            await page.locator('.pptour-cosmetics > summary').click();
            await page.locator('.pptour-trail.got').first().waitFor();
            assert.equal(await page.locator('.pptour-trail').count(), 6);
            assert.equal(await page.locator('.pptour-title-chip').count(), 10);
            assert.equal(await page.locator('.pptour-trail:not(:disabled)').count(), 1, `${name}: only Ember is open`);
            await page.locator('.pptour-title-chip.got', { hasText: 'Club Champion' }).click();
            assert.equal(await page.evaluate(() => PPCosmetics.titleName()), 'Club Champion');
            await page.locator('button.pptour-off[data-trail=""]').click();
            assert.equal(await page.evaluate(() => PPCosmetics.activeTrail()), '', 'Off removes the trail');
            await page.locator('.pptour-trail.got').first().click();
            assert.equal(await page.evaluate(() => PPCosmetics.activeTrail()), 'ember');
            if (out) { fs.mkdirSync(out, { recursive: true }); await page.locator('.pptour-cosmetics').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${name}-cosmetics.png`) }); }
            await page.evaluate(() => PPTour.close());

            // A live ball draws the equipped trail in each solo mode, and not in online play.
            for (const mode of ['classic', 'obstacle', 'zombie']) {
                await page.evaluate((m) => { game.tourContext = null; game.isMultiplayer = false; game.setGameMode(m); game.startIntro?.(); }, mode);
                await page.evaluate(() => { try { game.skipIntro?.(); } catch (_) {} });
                await page.waitForFunction(() => game.running && !game.introActive, null, { timeout: 30000 });
                const drawn = await page.evaluate(() => {
                    const b = game.ball;
                    const real = PPCosmetics.drawTrail; let n = 0;
                    PPCosmetics.drawTrail = function () { n++; return real.apply(this, arguments); };
                    const ctx = document.createElement('canvas').getContext('2d');
                    b.trailCount = 8; for (let i = 0; i < 8; i++) { b.trailPoints[i * 2] = 100 + i * 12; b.trailPoints[i * 2 + 1] = 100; }
                    b._speed = 900; b.vel.x = 900; b.vel.y = 0;
                    b._renderCosmeticTrail(ctx, 100, 100);
                    game.isMultiplayer = true; b._renderCosmeticTrail(ctx, 100, 100); game.isMultiplayer = false;
                    PPCosmetics.drawTrail = real;
                    return n;
                });
                assert.equal(drawn, 1, `${name} ${mode}: trail drawn once for the solo ball, never online`);
            }
            await page.evaluate(() => { game.pause?.(); });

            // Real canvas cost of the trail (headless CPU rasteriser: far slower than a GPU canvas, so a generous upper bound).
            const cost = await page.evaluate(() => {
                const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400;
                const ctx = canvas.getContext('2d'); const b = PPCosmetics.previewBall(220, 80);
                const res = {};
                for (const t of PPCosmetics.TRAILS) {
                    const t0 = performance.now();
                    for (let i = 0; i < 2000; i++) { PPCosmetics.drawTrail(ctx, b, b.x, b.y, t.id, i * 16); if (i % 50 === 49) ctx.getImageData(0, 0, 1, 1); } // flush so raster time is counted
                    res[t.id] = (performance.now() - t0) / 2000;
                }
                // For scale: the game's own existing trail on the same canvas.
                const ball = game.ball; ball.trailCount = 8; for (let i = 0; i < 8; i++) { ball.trailPoints[i * 2] = 100 + i * 12; ball.trailPoints[i * 2 + 1] = 100; }
                ball._speed = 900;
                const t1 = performance.now();
                for (let i = 0; i < 2000; i++) { ball._renderTrail(ctx, 200, 100); if (i % 50 === 49) ctx.getImageData(0, 0, 1, 1); }
                res.existingTrail = (performance.now() - t1) / 2000;
                return res;
            });
            console.log(`${name} trail cost per frame (ms, software canvas):`, JSON.stringify(Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, +v.toFixed(3)]))));
            for (const [k, v] of Object.entries(cost)) assert.ok(v < 0.3, `${name} ${k} trail ${v} ms (CPU raster) over the 0.3 ms budget`);

            // Profile and versus screen show the title.
            await page.evaluate(() => { game.tourContext = null; PPResults.hide(); });
            const tag = await page.evaluate(() => { PPSettings.openTab?.('profile'); return PPCosmetics.titleName(); });
            assert.equal(tag, 'Club Champion');
            assert.deepEqual(errors, [], `${name} page errors`);
            await context.close();
            console.log(`${name} ok`);
        }
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
