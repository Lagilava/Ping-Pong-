const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    try {
        const page = await browser.newPage();
        await page.setContent('<canvas id="source" width="320" height="180"></canvas>');
        await page.addScriptTag({ path: path.join(__dirname, '../game/js/render/post-fx.js') });
        const results = await page.evaluate(() => {
            const source = document.getElementById('source'), ctx = source.getContext('2d');
            const fx = PostFX.create(source);
            if (!fx) throw new Error('WebGL required for pixel equivalence');
            const pass = fx._pass;
            const results = [];
            for (const [width, height] of [[320, 180], [640, 360], [200, 300]]) {
                source.width = width; source.height = height;
                const gradient = ctx.createLinearGradient(0, 0, width, height);
                gradient.addColorStop(0, '#ff00aa'); gradient.addColorStop(1, '#00ffcc');
                ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = '#ffffff'; ctx.fillRect(30, 20, 18, 60);
                for (const quality of [0, 1, 2]) {
                    fx.setQuality(quality);
                    fx._pass = pass;
                    fx.present(0);
                    const optimized = new Uint8Array(width * height * 4);
                    fx.gl.readPixels(0, 0, width, height, fx.gl.RGBA, fx.gl.UNSIGNED_BYTE, optimized);
                    // Replay the former per-pass vertex setup at the same time.
                    fx._pass = function (...args) {
                        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
                        this.gl.enableVertexAttribArray(0);
                        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
                        return pass.apply(this, args);
                    };
                    fx.present(0);
                    const reference = new Uint8Array(optimized.length);
                    fx.gl.readPixels(0, 0, width, height, fx.gl.RGBA, fx.gl.UNSIGNED_BYTE, reference);
                    results.push({ width, height, quality,
                        identical: optimized.every((value, i) => value === reference[i]),
                        nonEmpty: optimized.some((value, i) => i % 4 !== 3 && value > 0),
                        error: fx.gl.getError() });
                }
            }
            return results;
        });
        for (const result of results) {
            assert(result.identical && result.nonEmpty && result.error === 0, JSON.stringify(result));
        }
        console.log('PostFX pixels identical to former pipeline at all 3 qualities across 3 canvas sizes.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
