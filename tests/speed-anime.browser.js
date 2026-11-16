const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    try {
        const root = path.resolve(__dirname, '../game');
        for (const mobile of [false, true]) {
            const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
                deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'pingpong.local') return route.abort();
                const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
                if (!target.startsWith(root + path.sep)) return route.abort();
                try { await route.fulfill({ path: target }); } catch { await route.fulfill({ status: 404 }); }
            });
            await page.goto('http://pingpong.local/play.html?from_intro=1&nosw&speedAnime=1');
            await page.waitForFunction(() => window.game?.bgRenderer && window.SpeedAnime);
            await page.evaluate(() => {
                game.setGameMode('speed'); game.stop(); game.introActive = false;
                game.arenaReveal = null; game.arenaRevealZoom = 1; game.serveHold = 0;
                game.modeAbilities.clock = 2;
            });
            await page.waitForFunction(() => {
                game.bgRenderer._backgroundRenderCache.dirty = true; game.renderScene(1);
                return game.bgRenderer._speedArt?.generated;
            });
            for (const ability of [false, true]) {
                const result = await page.evaluate(ability => {
                    const g = game;
                    g.rallyCount = 12; g.ball.pos.set(g.width * .43, g.height * .52);
                    g.ball.prev.set(g.ball.pos.x, g.ball.pos.y); g.ball.vel.set(1100, -120);
                    g.player.pos.y = g.height * .46; g.aiPaddle.pos.y = g.height * .33;
                    g.modeAbilities.timeVisual = ability ? .85 : 0;
                    g._speedAnimeImpact = { x: g.player.pos.x + g.player.w + 12, y: g.player.pos.y + g.player.h * .5, at: 1.94 };
                    g.screenShake = 0; g.cameraKick = { x: 0, y: 0, vx: 0, vy: 0 };
                    const initialMatrix = g.ctx.getTransform();
                    const before = JSON.stringify({ p: g.ball.pos, v: g.ball.vel, scores: g.scores, cooldown: g.modeAbilities.sides.player.cooldown });
                    const times = [];
                    for (let i = 0; i < 20; i++) {
                        const start = performance.now(); g.renderScene(1); times.push(performance.now() - start);
                    }
                    const after = JSON.stringify({ p: g.ball.pos, v: g.ball.vel, scores: g.scores, cooldown: g.modeAbilities.sides.player.cooldown });
                    const matrix = g.ctx.getTransform();
                    return { before, after, active: SpeedAnime.active(), matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], initialMatrix: [initialMatrix.a, initialMatrix.b, initialMatrix.c, initialMatrix.d, initialMatrix.e, initialMatrix.f], alpha: g.ctx.globalAlpha,
                        state: ['a', 'b', 'c', 'd', 'e', 'f'].every(k => Math.abs(matrix[k] - initialMatrix[k]) < .0001) && g.ctx.globalAlpha === 1,
                        median: times.sort((a, b) => a - b)[10], image: g.canvas.toDataURL('image/png') };
                }, ability);
                assert.equal(result.before, result.after, 'rendering cannot change gameplay');
                assert(result.active && result.state, 'preview active without Canvas state leaks: ' + JSON.stringify({ ...result, image: undefined }));
                const output = path.resolve(__dirname, '../docs/speed-anime-preview');
                fs.mkdirSync(output, { recursive: true });
                fs.writeFileSync(path.join(output, `${mobile ? 'mobile' : 'desktop'}${ability ? '-time-stop' : ''}.png`), Buffer.from(result.image.split(',')[1], 'base64'));
                console.log({ mobile, ability, medianRenderMs: result.median });
            }
            await page.evaluate(() => game.setGameMode('classic'));
            assert.equal(await page.evaluate(() => SpeedAnime.active()), false, 'other modes unchanged');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Anime preview rendering, mode isolation and simulation invariants passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
