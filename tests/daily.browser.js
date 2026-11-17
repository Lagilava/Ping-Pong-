// End to end: the Daily Match in a real browser. Menu button, Daily screen,
// versus intro, per-match overrides (skill, points, AI style, twist) with the
// saved settings untouched, win and loss outros, result card, streak across
// days, reload, and phone layout. Run: node tests/daily.browser.js [outdir]
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
                for (const m of ['classic', 'gravity', 'speed', 'obstacle']) localStorage.setItem(`pp-guide-seen-v3-${m}`, '1');
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            const boot = async (day) => {
                await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForFunction(() => window.game && window.PPTour && window.PPDaily && window.ModeTutorial, null, { timeout: 90000 });
                await page.evaluate((d) => { const [y, m, dd] = d.split('-').map(Number); PPDaily._setNow(() => new Date(y, m - 1, dd, 12)); PPDaily.updateMenuButton(); }, day);
            };
            await boot('2026-11-17'); // a Tuesday: Easy
            const today = await page.evaluate(() => JSON.parse(JSON.stringify(PPDaily.stage())));

            // Menu button and the Daily screen.
            assert.equal(await page.locator('#menuDailyBtn').count(), 1, `${name} Daily button missing`);
            assert.match(await page.locator('#menuDailyState').innerText(), /NEW/);
            await page.locator('#menuDailyBtn').click();
            await page.locator('#ppDaily.open').waitFor();
            const screen = await page.locator('#ppDaily').innerText();
            assert.match(screen, new RegExp(today.rival, 'i')); assert.match(screen, /Play today/i); assert.match(screen, /0\s*day streak/i);
            assert.equal(await page.locator('.ppdaily-day').count(), 30);
            const fits = await page.evaluate(() => { const b = document.querySelector('.ppdaily-box').getBoundingClientRect(); return b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; });
            assert.ok(fits, `${name} Daily screen fits the viewport`);
            if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, `${name}-daily-screen.png`) }); }
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => PPDaily.isOpen()), false, `${name} Esc closes Daily`);

            // Saved settings that the Daily must not touch.
            await page.evaluate(() => { PPSettings.set('aiLevel', 4); PPSettings.set('pointsToWin', 21); PPSettings.set('powerUps', false); });
            await page.locator('#menuDailyBtn').click();
            await page.locator('#ppDaily.open .ppdaily-play').click();
            await page.waitForFunction(() => game.running || game.introActive, null, { timeout: 30000 });
            assert.equal(await page.evaluate(() => PPDaily.isOpen()), false, `${name} Daily closes once the match starts`);
            await page.locator('.ppstage.versus').waitFor({ timeout: 10000 });
            const vs = await page.locator('.ppstage.versus').innerText();
            assert.match(vs, /DAILY MATCH/i); assert.match(vs, new RegExp(today.rival, 'i')); assert.match(vs, /Start match/i); assert.doesNotMatch(vs, /Stage \d of 8/i);
            assert.equal(await page.evaluate(() => game.running), false, `${name} no play behind the versus screen`);
            await page.waitForTimeout(1600);
            if (out) await page.screenshot({ path: path.join(out, `${name}-daily-versus.png`) });
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => game.running && !game.introActive && !document.querySelector('.ppstage.versus:not(.leaving)'), null, { timeout: 15000 });
            const m1 = await page.evaluate(() => ({
                lvl: game.getAILevel(), max: game.maxScore, style: game.ai?.style?.id, mode: game.gameMode, ctx: game.getTourContext()?.stageId,
                saved: [PPSettings.get('aiLevel'), PPSettings.get('pointsToWin'), PPSettings.get('powerUps')],
            }));
            assert.equal(m1.ctx, 'daily'); assert.equal(m1.mode, today.mode); assert.equal(m1.lvl, today.level);
            assert.equal(m1.max, today.points); assert.equal(m1.style, today.style, 'rival style is forced');
            assert.deepEqual(m1.saved, [4, 21, false], 'saved settings are untouched');
            const pause = await page.evaluate(() => PPTour.pauseSummary(game));
            assert.match(pause, /Daily Match/); assert.match(pause, new RegExp(`First to ${today.points}`));

            // Lose first: a finished loss keeps the streak and posts no score.
            await page.evaluate((max) => { game.scores.player = 1; game.scores.ai = max; game.updateScoreUI(); }, today.points);
            await page.locator('.ppstage.outro.loss').waitFor({ timeout: 60000 });
            assert.match(await page.locator('.ppstage.outro').innerText(), /Daily Match/i);
            if (out) await page.screenshot({ path: path.join(out, `${name}-daily-outro-loss.png`) });
            await page.evaluate(() => PPTourStage.hide());
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            let card = await page.locator('#pp-results').innerText();
            assert.match(card, /DAILY MATCH/i); assert.match(card, /streak: 1 day/i); assert.match(card, /Try again/i);
            assert.equal(await page.evaluate(() => PPDaily.today().won), 0);
            assert.equal(await page.evaluate(() => PPTour.totalStars()), 0, 'no Tour stars from a Daily');
            const dismiss = page.locator('.achievement-summary-modal.show .summary-continue');
            if (await dismiss.count()) await dismiss.click();

            // Try again, then win with a big margin and the bonus goal's conditions.
            await page.locator('#pp-results .ppres-btn', { hasText: 'Try again' }).click();
            await page.waitForFunction(() => game.getTourContext()?.stageId === 'daily', null, { timeout: 30000 });
            await page.locator('.ppstage.versus').waitFor({ timeout: 10000 });
            await page.evaluate(() => PPTourStage.hide());
            await page.waitForFunction(() => game.running && !game.introActive, null, { timeout: 15000 });
            await page.evaluate((max) => { game.tourBestStreak = 5; game.maxRally = 14; game.scores.player = max; game.scores.ai = 0; game.updateScoreUI(); }, today.points);
            await page.locator('.ppstage.outro.win').waitFor({ timeout: 60000 });
            const outro = await page.locator('.ppstage.outro').innerText();
            assert.match(outro, /Daily match won/i); assert.match(outro, /Daily streak: 1 day/i);
            assert.doesNotMatch(outro, /stage cleared/i);
            if (out) await page.screenshot({ path: path.join(out, `${name}-daily-outro-win.png`) });
            await page.waitForTimeout(1300);
            await page.locator('.ppstage-go').click();
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            card = await page.locator('#pp-results').innerText();
            assert.match(card, /Score [\d,]+/); assert.match(card, /Bonus goal/); assert.match(card, /Play again for a better score/i);
            if (out) await page.screenshot({ path: path.join(out, `${name}-daily-result.png`) });
            const rec = await page.evaluate(() => ({ t: PPDaily.today(), streak: PPDaily.streak() }));
            assert.equal(rec.t.attempts, 2); assert.equal(rec.t.won, 1); assert.ok(rec.t.best >= 1000 + 100 * today.points); assert.equal(rec.streak, 1);
            await page.evaluate(() => PPResults.hide());
            await page.evaluate(() => {
                document.getElementById('overlay').classList.remove('hidden');
                document.getElementById('overlay').classList.add('visible');
            });
            assert.match(await page.locator('#menuDailyState').innerText(), /✓ 1/, `${name} menu button shows done and the streak`);

            // A normal match afterwards is not affected.
            await page.evaluate(() => { game.isMultiplayer = false; PPTour.clear(); game.setGameMode('classic'); });
            const plain = await page.evaluate(() => ({ lvl: game.getAILevel(), max: game.maxScore, ctx: !!game.getTourContext() }));
            assert.deepEqual(plain, { lvl: 4, max: 21, ctx: false });

            // Reload keeps the streak; the next day extends it; a gap resets it.
            await boot('2026-11-17');
            assert.equal(await page.evaluate(() => PPDaily.streak()), 1);
            await boot('2026-11-18');
            assert.equal(await page.evaluate(() => [PPDaily.streak(), PPDaily.doneToday()].join()), '1,false');
            assert.match(await page.locator('#menuDailyState').innerText(), /1/);
            await page.evaluate(() => PPDaily.recordResult({ stageId: 'daily', won: true, playerScore: 7, aiScore: 3, rally: 4 }));
            assert.equal(await page.evaluate(() => PPDaily.streak()), 2);
            await boot('2026-11-25');
            assert.equal(await page.evaluate(() => PPDaily.streak()), 0, 'a missed week lapses the streak');
            await page.locator('#menuDailyBtn').click();
            await page.locator('#ppDaily.open').waitFor();
            assert.match(await page.locator('.ppdaily-meta').innerText(), /Best streak\s*2/);
            // Reset needs two taps.
            await page.locator('.ppdaily-reset').click();
            assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pp-daily-v1')).days).length > 0), true);
            await page.locator('.ppdaily-reset').click();
            assert.equal(await page.evaluate(() => PPDaily.reload() || Object.keys(JSON.parse(localStorage.getItem('pp-daily-v1')).days).length), 0);

            // Every mode the Daily can pick starts and ends cleanly.
            await page.keyboard.press('Escape');
            for (const day of ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07', '2026-02-08', '2026-02-09', '2026-02-10']) {
                await page.evaluate((d) => { const [y, m, dd] = d.split('-').map(Number); PPDaily._setNow(() => new Date(y, m - 1, dd, 12)); }, day);
                const st = await page.evaluate(() => JSON.parse(JSON.stringify(PPDaily.stage())));
                await page.evaluate(() => PPDaily.play());
                await page.waitForFunction(() => game.getTourContext()?.stageId === 'daily', null, { timeout: 30000 });
                await page.locator('.ppstage.versus').waitFor({ timeout: 10000 });
                await page.evaluate(() => PPTourStage.hide());
                await page.waitForFunction(() => game.running && !game.introActive, null, { timeout: 15000 });
                const info = await page.evaluate(() => ({ mode: game.gameMode, max: game.maxScore, lvl: game.getAILevel(), style: game.ai?.style?.id }));
                assert.deepEqual(info, { mode: st.mode, max: st.points, lvl: st.level, style: st.style }, `${day} ${st.mode}`);
                await page.evaluate((max) => { game.scores.player = max; game.scores.ai = 0; game.updateScoreUI(); }, st.points);
                await page.locator('.ppstage.outro').waitFor({ timeout: 60000 });
                await page.evaluate(() => PPTourStage.hide());
                await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
                await page.evaluate(() => PPResults.hide());
                const d2 = page.locator('.achievement-summary-modal.show .summary-continue');
                if (await d2.count()) await d2.click();
            }
            assert.deepEqual(errors, [], `${name} page errors`);
            await context.close();
            console.log(`${name} ok`);
        }
    } finally {
        await browser.close();
    }
    console.log('daily.browser.js passed');
})().catch((e) => { console.error(e); process.exit(1); });
