// Requires Playwright, Chromium and a local server serving game/.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer']
    });
    try {
        const page = await browser.newPage();
        page.on('pageerror', error => console.error('Browser error:', error.message));
        await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8080') + '/play.html?from_intro=1');
        await page.waitForFunction(() => window.game);
        const result = await page.evaluate(() => {
            const source = document.createElement('canvas');
            source.width = source.height = 100;
            const ctx = source.getContext('2d');
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 100, 100);
            ctx.fillStyle = '#40dfff'; ctx.fillRect(20, 10, 12, 80);
            ctx.fillStyle = '#ffaa00'; ctx.fillRect(60, 10, 12, 80);
            const water = new ObstacleWaterfalls(source);
            const output = document.createElement('canvas');
            output.width = output.height = 100;
            const out = output.getContext('2d');
            const sample = time => {
                out.clearRect(0, 0, 100, 100);
                water.render(out, 100, 100, time);
                return out.getImageData(0, 0, 100, 100).data;
            };
            const masks = water.regions.map(region => region.mask);
            const before = sample(0), after = sample(0.5);
            let error = 0, count = 0, outside = 0, changed = 0;
            for (let y = 11; y < 68; y++) {
                for (let x = 20; x < 32; x++) {
                    // 42 mask pixels/sec: the exact same water travels DOWN
                    // by 21px after half a second, without moving stonework.
                    error += Math.abs(before[(y * 100 + x) * 4 + 1] - after[((y + 21) * 100 + x) * 4 + 1]);
                    count++;
                }
            }
            for (let y = 0; y < 100; y++) {
                for (let x = 0; x < 100; x++) {
                    const p = (y * 100 + x) * 4;
                    if ((x < 20 || x >= 32 || y < 10 || y >= 90) && after[p + 3]) outside++;
                    if (Math.abs(before[p + 1] - after[p + 1]) > 5) changed++;
                }
            }
            return {regions: water.regions.length, directionError: error / count, outside, changed,
                reused: water.regions.every((region, i) => region.mask === masks[i])};
        });
        assert.equal(result.regions, 1);
        assert(result.directionError < 2 && result.changed > 50 && result.reused);
        assert.equal(result.outside, 0);
        console.log('Waterfalls flow down inside their silhouettes with reused caches and no GPU.', result);
        await page.emulateMedia({reducedMotion: 'reduce'});
        for (const viewport of [{width: 1366, height: 768}, {width: 390, height: 844}]) {
            await page.setViewportSize(viewport);
            // A reload must not capture reduced motion as a frozen clock.
            // Boot removes its entry hint from the URL; restore it to test
            // reloading the game rather than the separate title-screen gate.
            await page.evaluate(() => history.replaceState(null, '', location.pathname + '?from_intro=1'));
            await page.reload();
            await page.waitForFunction(() => window.game);
            await page.evaluate(() => {
                game.setGameMode('obstacle'); game.stop(); game.bgRenderer.render();
            });
            await page.waitForFunction(() => game.bgRenderer._obstacleSkyScene.ready);
            const ambient = await page.evaluate(() => {
                const renderer = game.bgRenderer, scene = renderer._obstacleSkyScene;
                const canvas = document.createElement('canvas');
                canvas.width = game.width; canvas.height = game.height;
                const ctx = canvas.getContext('2d');
                // Exercise the non-WebGL path that previously froze too.
                scene.shader.ok = false;
                const sample = () => {
                    scene.render(ctx, canvas.width, canvas.height, game.obstacleCourse.grid, renderer.time);
                    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                };
                const before = sample(), baked = scene.canvas;
                renderer.update(1);
                const after = sample();
                let changed = 0;
                for (let i = 0; i < before.length; i += 4) {
                    if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) +
                        Math.abs(before[i + 2] - after[i + 2]) > 5) changed++;
                }
                return {changed, reducedMotion: scene.reducedMotion.matches, cached: scene.canvas === baked};
            });
            assert(ambient.reducedMotion && ambient.changed > 100 && ambient.cached);
            console.log('Reduced-motion waterfall animation survives reload without WebGL.', viewport, ambient);
        }

    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
