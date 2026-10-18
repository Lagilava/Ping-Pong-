// Requires Playwright, Chromium and a local server serving game/.
// Software GL is enabled only to validate shaders in headless environments.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    try {
        const page = await browser.newPage({viewport: {width: 1280, height: 720}, reducedMotion: 'reduce'});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8080') + '/play.html?from_intro=1');
        await page.waitForFunction(() => window.game);
        await page.evaluate(() => {
            ObstacleSkyShader.allowSoftware = true;
            game.setGameMode('obstacle');
            game.stop();
            game.bgRenderer.render();
        });
        await page.waitForFunction(() => game.bgRenderer._obstacleSkyScene.ready);
        const result = await page.evaluate(() => {
            const renderer = game.bgRenderer, scene = renderer._obstacleSkyScene;
            scene.render(game.ctx, game.width, game.height, game.obstacleCourse.grid, 0);
            const shader = scene.shader, source = scene.canvas;
            const canvas = document.createElement('canvas');
            canvas.width = source.width; canvas.height = source.height;
            const ctx = canvas.getContext('2d');
            const sample = (time, motion) => {
                ctx.drawImage(shader.render(source, time, motion), 0, 0);
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            };
            scene.render(ctx, canvas.width, canvas.height, game.obstacleCourse.grid, 1);
            const ambientBefore = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            scene.render(ctx, canvas.width, canvas.height, game.obstacleCourse.grid, 4);
            const ambientAfter = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let ambientChanged = 0;
            for (let i = 0; i < ambientBefore.length; i += 4) {
                if (Math.abs(ambientBefore[i + 1] - ambientAfter[i + 1]) > 2) ambientChanged++;
            }
            const before = sample(1, true), after = sample(4, true);
            const paused = sample(1, false), pausedLater = sample(4, false);
            let changed = 0, stationary = 0;
            for (let i = 0; i < before.length; i += 4) {
                if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) +
                    Math.abs(before[i + 2] - after[i + 2]) > 2) changed++;
                if (paused[i] !== pausedLater[i] || paused[i + 1] !== pausedLater[i + 1] ||
                    paused[i + 2] !== pausedLater[i + 2]) stationary++;
            }
            return {ok: shader.ok, changed, stationary, ambientChanged, reducedMotion: scene.reducedMotion.matches,
                error: shader.gl.getError(), reused: shader.source === source};
        });
        assert(result.ok && result.changed > 100 && result.stationary === 0 && result.error === 0 && result.reused);
        assert(result.reducedMotion && result.ambientChanged > 100, 'reduced motion must retain gentle scenery animation');
        const lost = await page.evaluate(() => {
            const scene = game.bgRenderer._obstacleSkyScene;
            scene.shader.gl.getExtension('WEBGL_lose_context').loseContext();
            return scene.shader.render(scene.canvas, 1, true) === null;
        });
        assert(lost);
        await page.waitForFunction(() => !game.bgRenderer._obstacleSkyScene.shader.ok);
        const fallback = await page.evaluate(() => {
            game.bgRenderer.renderObstacle(game.ctx, game.width, game.height);
            return !game.bgRenderer._obstacleSkyScene.shader.ok;
        });
        assert(fallback);
        assert.deepEqual(errors, []);
        console.log('Obstacle shader animation, explicit pause, texture reuse and context-loss fallback passed.', result);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
