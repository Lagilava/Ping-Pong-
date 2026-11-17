// Records in a real browser: the in-match "Best rally yet" note, the result
// card's New record lines, the Records section in Settings > Profile, solo-only
// writing, and reload. Run: node tests/records.browser.js [outdir]
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
                for (const m of ['classic', 'gravity', 'speed', 'obstacle', 'zombie']) localStorage.setItem(`pp-guide-seen-v3-${m}`, '1');
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.game && window.PPRecords && window.PPProfile && window.PPTour, null, { timeout: 90000 });

            // Existing profile bests seed the board once.
            await page.evaluate(() => { PPProfile.recordMatch({ mode: 'classic', won: true, pointsFor: 5, pointsAgainst: 3, rally: 8 }); PPRecords.reload(); });
            assert.equal(await page.evaluate(() => PPRecords.best('rally')), 8, `${name} seeded from the profile`);

            // A Tour stage 1 match (Classic): a rally beating the mode's best is announced when the point ends.
            await page.evaluate(() => PPTour.launch(1));
            await page.waitForFunction(() => game.getTourContext()?.stageId === 1, null, { timeout: 30000 });
            await page.locator('.ppstage.versus').waitFor({ timeout: 10000 });
            await page.evaluate(() => PPTourStage.hide());
            await page.waitForFunction(() => game.running && !game.introActive, null, { timeout: 15000 });
            const note = await page.evaluate(() => {
                game.notifications.length = 0;
                game.rallyCount = 7; game.resetRally();
                const none = game.notifications.length;
                game.rallyCount = 11; game.maxRally = 11; game.resetRally();
                const first = game.notifications.map((n) => n.title + ': ' + n.message);
                game.rallyCount = 11; game.resetRally();
                return { none, first, again: game.notifications.length };
            });
            assert.equal(note.none, 0, `${name} no note below the best`);
            assert.deepEqual(note.first, ['Best rally yet: 11 hits, your longest in this mode']);
            assert.equal(note.again, 1, `${name} the same rally is not announced twice`);

            // Win it; the board and the card follow.
            await page.evaluate(() => { game.maxRally = 11; game.tourBestStreak = 3; game.scores.player = 5; game.scores.ai = 1; game.updateScoreUI(); });
            await page.locator('.ppstage.outro.win').waitFor({ timeout: 60000 });
            await page.evaluate(() => PPTourStage.hide());
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            const card = await page.locator('#pp-results').innerText();
            assert.match(card, /New record: Longest rally 11 hits/i, `${name} result card names the record`);
            const rec = await page.evaluate(() => ({ rally: PPRecords.top('rally')[0], margin: PPRecords.top('margin')[0], fast: PPRecords.fastest(1) }));
            assert.equal(rec.rally.v, 11); assert.equal(rec.rally.m, 'classic'); assert.equal(rec.margin.v, 4);
            await page.evaluate(() => PPResults.hide());
            const dismiss = page.locator('.achievement-summary-modal.show .summary-continue');
            if (await dismiss.count()) await dismiss.click();

            // Two-player and online matches write nothing.
            const before = await page.evaluate(() => JSON.stringify(PPRecords.top('rally')));
            await page.evaluate(() => { PPTour.clear(); game.isMultiplayer = true; game.net = null; game.maxRally = 77; game.running = true; game.matchEnding = false; game.finishMatch(true, {}); });
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            await page.evaluate(() => PPResults.hide());
            assert.equal(await page.evaluate(() => JSON.stringify(PPRecords.top('rally'))), before, `${name} local two-player does not write records`);
            await page.evaluate(() => { game.isMultiplayer = false; game.matchEnding = false; });

            // Zombie: wave and score records.
            await page.evaluate(() => { PPResults.hide(); game.setGameMode('zombie'); });
            await page.evaluate(() => { game.zombieState.wave = 4; game.zombieState.maxWave = 8; game.scores.player = 650; game.running = true; game.matchEnding = false; game.finishZombieMode(false); });
            await page.locator('#pp-results .ppres-box').waitFor({ timeout: 60000 });
            const z = await page.evaluate(() => ({ wave: PPRecords.best('zombieWave'), score: PPRecords.best('zombieScore') }));
            assert.deepEqual(z, { wave: 4, score: 650 }, `${name} zombie records`);
            await page.evaluate(() => { PPResults.hide(); });
            const dismiss2 = page.locator('.achievement-summary-modal.show .summary-continue');
            if (await dismiss2.count()) await dismiss2.click();

            // Settings > Profile shows the lists; reset needs two taps.
            await page.evaluate(() => { document.getElementById('overlay')?.classList.remove('hidden'); document.getElementById('overlay')?.classList.add('visible'); });
            await page.locator('[data-open-panel="settings"]').first().click();
            await page.locator('[data-tab="profile"]').click();
            await page.locator('.ppset-recs').waitFor();
            const txt = await page.locator('.ppset-recs').innerText();
            assert.match(txt, /Longest rally/i); assert.match(txt, /11 hits/); assert.match(txt, /wave 4/); assert.match(txt, /Zombie score/i);
            if (out) { fs.mkdirSync(out, { recursive: true }); await page.locator('.ppset-recs').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${name}-records.png`) }); }
            await page.locator('[data-rec-reset]').click();
            assert.equal(await page.evaluate(() => PPRecords.best('rally')), 11, `${name} one tap does not erase`);
            await page.locator('[data-rec-reset]').click();
            assert.equal(await page.evaluate(() => PPRecords.best('rally')), 0);

            // Reload keeps what is there.
            await page.evaluate(() => { PPRecords.add('rally', 21, { m: 'speed' }); });
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw', { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.PPRecords, null, { timeout: 90000 });
            assert.equal(await page.evaluate(() => PPRecords.best('rally')), 21);
            assert.deepEqual(errors, [], `${name} page errors`);
            await context.close();
            console.log(`${name} ok`);
        }
    } finally {
        await browser.close();
    }
    console.log('records.browser.js passed');
})().catch((e) => { console.error(e); process.exit(1); });
