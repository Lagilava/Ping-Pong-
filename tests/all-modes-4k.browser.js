// Serve game/ locally. Optional VISUAL_OUTPUT writes full-resolution previews.
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const display of [
            { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
            { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
            { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
        ]) {
            const displayName = display.isMobile ? 'mobile' : display.deviceScaleFactor === 2 ? 'retina' : '4k';
            if (process.env.DISPLAY_FILTER && process.env.DISPLAY_FILTER !== displayName) continue;
            const page = await browser.newPage(display);
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8080') + '/play.html?from_intro=1');
            await page.waitForFunction(() => window.game?.bgRenderer && window.PPResolution);
            assert.equal(await page.evaluate(() => game.zombieSprites.artReady), true, 'enlarged enemy atlas decodes all six silhouettes in each row');
            for (const mode of ['classic', 'speed', 'gravity', 'zombie', 'obstacle', 'customise']) {
                await page.evaluate(mode => {
                    PerfGovernor._locked = true; PerfGovernor._ultra = true; PerfGovernor._applyTier();
                    const g = game; g.setGameMode(mode); g.stop(); g.introActive = false; g.paused = false;
                    g.serveHold = 0; g.arenaReveal = null; g.arenaRevealZoom = 1; g.setupCanvas(); g.renderScene(1);
                }, mode);
                await page.waitForTimeout(1000);
                if (['speed','gravity','obstacle'].includes(mode)) await page.waitForFunction(mode => {
                    const g=game; g.bgRenderer._backgroundRenderCache.dirty=true; g.renderScene(1);
                    if(mode==='speed') return g.bgRenderer._speedArt?.generated;
                    if(mode==='gravity') {const s=window.GravityArt.status();return s.sceneReady && s.surfaceReady && s.wellFlowReady;}
                    return g.bgRenderer._obstacleSkyScene?.ready;
                }, mode, {timeout:60000});
                const result = await page.evaluate(() => {
                    const g = game; g.stop(); g.arenaReveal = null; g.arenaRevealZoom = 1;
                    g.renderScene(1);
                    const cache = g.bgRenderer._backgroundRenderCache, c = cache.canvas;
                    const samples = [];
                    for (let i = 0; i < 5; i++) {
                        cache.lastRenderMs = -Infinity;
                        const start = performance.now(); g.bgRenderer.render(); samples.push(performance.now() - start);
                    }
                    samples.sort((a,b) => a-b);
                    return { mode: g.gameMode, width: g.canvas.width, height: g.canvas.height,
                        cache: c ? [c.width,c.height] : null, medianBackgroundMs: samples[2],
                        mobile: PerfGovernor.isMobile, speedBase: g.bgRenderer._speedArt?.base?.width,
                        generated: g.bgRenderer._speedArt?.generated };
                });
                assert.ok(result.width * result.height <= 3840 * 2160 + 8000, 'gameplay surface stays within 4K budget');
                if (!display.isMobile) {
                    assert.equal(result.width, 3840); assert.equal(result.height,2160);
                    assert.deepEqual(result.cache, [3840,2160], mode + ' scenery retains full 4K pixels');
                    if (mode === 'speed') assert.equal(result.speedBase,3840, 'Speed does not downsample again internally');
                } else if (result.cache && ['speed','gravity','zombie'].includes(mode)) assert.ok(result.cache[0] <= 1024 && result.cache[1] <= 576, 'mobile retains a small scenery cache');
                if (process.env.VISUAL_OUTPUT && !display.isMobile && display.deviceScaleFactor === 1) {
                    fs.mkdirSync(process.env.VISUAL_OUTPUT, { recursive: true });
                    const data = await page.evaluate(() => {game.bgRenderer._backgroundRenderCache.dirty=true;game.renderScene(1);return game.canvas.toDataURL();});
                    fs.writeFileSync(path.join(process.env.VISUAL_OUTPUT, mode + '-4k.png'), Buffer.from(data.split(',')[1],'base64'));
                }
                console.log(result);
            }
            assert.deepEqual(errors, [], 'all modes render without browser exceptions');
            await page.close();
        }
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
