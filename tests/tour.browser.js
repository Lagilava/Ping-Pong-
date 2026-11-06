// End to end: play Tour stages in a real browser. Checks the menu button, the
// per-match overrides (skill, points, AI style, twists), saved settings staying
// untouched, the result card, stars on reload, and that a normal match started
// afterwards is not affected by the Tour. Run: node tests/tour.browser.js [outdir]
const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'game');
const out = process.argv[2] && path.resolve(process.argv[2]);

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || undefined,
        args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
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
                for (const m of ['gravity', 'speed', 'obstacle']) localStorage.setItem(`pp-guide-seen-v3-${m}`, '1');
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.game && window.PPTour && window.ModeTutorial, null, { timeout: 90000 });

            // Menu button and Tour screen.
            assert.equal(await page.locator('#menuTourBtn').count(), 1, `${name} Tour button missing`);
            await page.locator('#menuTourBtn').click();
            await page.locator('#ppTour.open').waitFor();
            assert.equal(await page.locator('.pptour-card').count(), 8);
            assert.equal(await page.locator('.pptour-play:not(:disabled)').count(), 1, `${name} only stage 1 is open on a new save`);
            if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, `${name}-tour.png`) }); }
            await page.keyboard.press('Escape');
            await page.locator('#ppTour.open').waitFor({ state: 'detached' }).catch(() => {});
            assert.equal(await page.evaluate(() => PPTour.isOpen()), false, `${name} Esc closes the Tour`);

            // Saved settings that the Tour must not touch.
            await page.evaluate(() => { PPSettings.set('aiLevel', 3); PPSettings.set('pointsToWin', 15); PPSettings.set('powerUps', false); });

            // Stage 1: Pip, Classic, Rookie, first to 5, "wall" style.
            await page.locator('#menuTourBtn').click();
            await page.locator('#ppTour.open .pptour-play:not(:disabled)').click();
            // The first Classic match shows its how-to-play guide over the Tour; accepting starts the stage.
            await page.locator('#modeTutorial:not([hidden]) [data-guide-accept]').click();
            await page.waitForFunction(() => window.game.running || window.game.introActive, null, { timeout: 30000 });
            assert.equal(await page.evaluate(() => PPTour.isOpen()), false, `${name} Tour closes once the stage starts`);
            const s1 = await page.evaluate(() => ({
                lvl: game.getAILevel(), max: game.maxScore, style: game.ai?.style?.id, mode: game.gameMode,
                saved: [PPSettings.get('aiLevel'), PPSettings.get('pointsToWin'), PPSettings.get('powerUps')],
            }));
            assert.equal(s1.mode, 'classic');
            assert.equal(s1.lvl, 0, 'Rookie');
            assert.equal(s1.max, 5);
            assert.equal(s1.style, 'wall', 'rival style is forced');
            assert.deepEqual(s1.saved, [3, 15, false], 'saved settings are untouched');

            // Win it 5-0 with a long rally: 3 stars and the stage 2 unlock.
            await page.evaluate(() => { game.maxRally = 12; game.scores.player = 5; game.scores.ai = 0; game.updateScoreUI(); });
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            const card = await page.locator('#pp-results').innerText();
            assert.match(card, /TOUR/i); assert.match(card, /Stage 1 cleared/i); assert.match(card, /Next: stage 2/i); assert.match(card, /Pip/i, 'rival named on the card');
            if (out) await page.screenshot({ path: path.join(out, `${name}-result.png`) });
            assert.equal(await page.evaluate(() => PPTour.starsOf(1)), 3);

            // Next stage button starts stage 2 (Vee, sniper, power-ups forced on despite the setting).
            // Winning can unlock achievements; their summary sits over the card until dismissed.
            const dismiss = page.locator('.achievement-summary-modal.show .summary-continue');
            if (await dismiss.count()) await dismiss.click();
            await page.locator('#pp-results .ppres-btn', { hasText: 'Next: stage 2' }).click();
            await page.waitForFunction(() => game.getTourContext()?.stageId === 2, null, { timeout: 30000 });
            const s2 = await page.evaluate(() => ({ lvl: game.getAILevel(), max: game.maxScore, style: game.ai?.style?.id, twist: game.getTourContext().twist }));
            assert.deepEqual(s2, { lvl: 1, max: 7, style: 'sniper', twist: 'powerUps' });
            const spawn = () => page.evaluate(() => {
                const rand = Math.random; Math.random = () => 0;
                game.running = true; game.paused = false; game.powerUps.length = 0;
                for (let i = 0; i < 5; i++) game.spawnPowerUp();
                Math.random = rand;
                const n = game.powerUps.length; game.powerUps.length = 0; return n;
            });
            assert.ok(await spawn() > 0, 'stage 2 forces power-ups on even though the setting is off');

            // A lost stage records nothing and offers Try again.
            await page.evaluate(() => { game.scores.player = 1; game.scores.ai = 7; game.updateScoreUI(); });
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            assert.match(await page.locator('#pp-results').innerText(), /Try again/i);
            assert.equal(await page.evaluate(() => PPTour.starsOf(2)), 0);

            // Quit to the menu and start a normal Classic match: the Tour must not leak in.
            await page.evaluate(() => PPResults.hide());
            await page.evaluate(() => {
                document.getElementById('overlay').classList.remove('hidden');
                document.getElementById('overlay').classList.add('visible');
            });
            await page.evaluate(() => { game.isMultiplayer = false; PPTour.clear(); game.setGameMode('classic'); });
            const plain = await page.evaluate(() => ({ lvl: game.getAILevel(), max: game.maxScore, ctx: !!game.getTourContext() }));
            assert.deepEqual(plain, { lvl: 3, max: 15, ctx: false });
            assert.equal(await spawn(), 0, 'outside the Tour the power-ups setting is respected');

            // Reload keeps the stars.
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.PPTour && window.game, null, { timeout: 90000 });
            assert.equal(await page.evaluate(() => PPTour.starsOf(1)), 3);
            assert.match(await page.locator('#menuTourStars').innerText(), /^3\/24/);

            // Every Tour mode starts and ends cleanly; stage 8 needs a two point lead.
            await page.evaluate(() => { for (let i = 1; i <= 7; i++) PPTour.recordResult({ stageId: i, won: true, playerScore: 11, aiScore: 0, rally: 99 }); });
            for (const id of [3, 4, 5, 6, 7, 8]) {
                await page.evaluate((n) => PPTour.launch(n), id);
                await page.waitForFunction((n) => game.getTourContext()?.stageId === n, id, { timeout: 30000 });
                const info = await page.evaluate(() => ({ mode: game.gameMode, ai: !!game.ai, max: game.maxScore, lvl: game.getAILevel(), style: game.ai?.style?.id }));
                const st = await page.evaluate((n) => PPTour.byId(n), id);
                assert.equal(info.mode, st.mode); assert.equal(info.max, st.points); assert.equal(info.lvl, st.level);
                assert.equal(info.style, st.style, `stage ${id} style`);
                assert.equal(await page.evaluate(() => PPTour.venueFor(game)), ({ 3: 'dock', 4: 'yard', 5: 'tunnel', 6: 'mirage', 7: 'final', 8: 'final' })[id], `stage ${id} venue`);
                if (id === 8) {
                    const res = await page.evaluate(() => { game.scores.player = 11; game.scores.ai = 10; game.updateScoreUI(); return game.matchEnding; });
                    assert.equal(res, false, 'win by 2: 11-10 keeps playing');
                    await page.evaluate(() => { game.scores.player = 12; game.scores.ai = 10; game.updateScoreUI(); });
                    await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
                    assert.match(await page.locator('#pp-results').innerText(), /Tour is complete/i);
                    assert.match(await page.locator('#pp-results').innerText(), /New paddle unlocked: Magma Demon/i);
                    await page.evaluate(() => PPResults.hide());
                }
                if (id === 7) {
                    await page.evaluate(() => PPSettings.set('powerUps', true));
                    assert.equal(await spawn(), 0, 'no power-ups on the no power-up stage even with the setting on');
                }
            }
            // Pause summary shows the stage and goals; reset erases stars and rewards.
            const ps = await page.evaluate(() => PPTour.pauseSummary(game));
            assert.match(ps, /Tour/); assert.match(ps, /First to 11/);
            const rs = await page.evaluate(() => { PPTour.resetProgress(); return { stars: PPTour.totalStars(), locked: PPTour.paddleLocked('tourMagmaDemon') }; });
            assert.equal(rs.stars, 0); assert.equal(rs.locked, true);
            await page.evaluate(() => { for (let i = 1; i <= 8; i++) PPTour.recordResult({ stageId: i, won: true, playerScore: 11, aiScore: 0, rally: 99 }); });
            // Paddle rewards: all four earned after the full Tour, all four locked on a fresh save.
            const rw = await page.evaluate(() => {
                const ids = ['tourSunbeam', 'tourVoltage', 'tourAfterglow', 'tourChampion', 'tourMagmaDemon'];
                const earned = ids.map((i) => PPTour.paddleLocked(i));
                PPTour.equip('tourChampion');
                const eq = PPSettings.getPaddle('classic', 'left');
                localStorage.removeItem('pp-tour-v1'); PPTour.reload();
                const fresh = ids.map((i) => PPTour.paddleLocked(i));
                PPSettings.setPaddle('classic', 'left', 'tourVoltage');
                game.setGameMode('classic'); game.applyPaddleDesigns();
                return { earned, eq, fresh, style: game.player.paddleStyle, classicFree: PPTour.paddleLocked('classic') };
            });
            assert.deepEqual(rw.earned, [false, false, false, false, false]);
            assert.equal(rw.eq, 'tourChampion');
            assert.deepEqual(rw.fresh, [true, true, true, true, true]);
            assert.equal(rw.style, 'classic', 'a locked reward falls back to Classic in a match');
            assert.equal(rw.classicFree, false);
            await page.evaluate(() => ['classic','zombie','gravity','speed','obstacle','customise'].forEach((m) => PPSettings.setPaddle(m, 'left', 'classic')));
            assert.deepEqual(errors, [], `${name} page errors`);
            await context.close();
            console.log(`${name} ok`);
        }
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
