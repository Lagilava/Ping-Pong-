// Run against game/ served locally. Uses the game's actual Canvas effects.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8080') + '/play.html?from_intro=1');
        await page.waitForFunction(() => window.ModeAbilities && window.GravityWormhole);
        for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }]) {
            await page.setViewportSize(viewport);
            const result = await page.evaluate(({ width, height }) => {
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const g = { width, height, gameMode: 'speed',
                    player: { pos: { x: 25, y: height / 2 - 45 }, w: 14, h: 90 },
                    ball: { r: 8, pos: { x: 100, y: height / 2 }, vel: { x: -900, y: 50 } } };
                const ability = new window.ModeAbilities(g), s = ability.side('player');
                Object.assign(s, { active: .2, sonic: .3, burst: .25, burstX: 40, burstY: height / 2 });
                s.trail = Array.from({ length: 24 }, (_, i) => ({ x: 40 + i * 8, y: height / 2 + Math.sin(i / 8) * 40 }));
                const from = { pos: { x: width * .28, y: height * .4 }, radius: 35, active: true };
                const to = { pos: { x: width * .65, y: height * .6 }, radius: 40, active: true };
                const gravity = new window.GravityWormhole({ ...g, gameMode: 'gravity', gravityWells: [from, to] });
                const checks = [];
                for (const mode of ['speed', 'gravity']) for (const motion of [true, false]) {
                    const frames = [];
                    for (const clock of [1, 1.17]) {
                        ctx.clearRect(0, 0, width, height);
                        ability.clock = gravity.clock = clock;
                        if (mode === 'speed') {
                            ability.renderSpeedField(ctx, 'player', s, motion);
                            if (motion) ability.renderSonicTrail(ctx, s);
                            ability.renderBurst(ctx, s, '#8cf4ff', .38, motion);
                        } else {
                            gravity.renderWarp(ctx, { from, to, spin: -1, t: .24, side: 'player' }, motion);
                            gravity.renderFlash(ctx, { x: to.pos.x, y: to.pos.y, r: 40, dx: -1, dy: .1, t: .32 }, motion);
                        }
                        const matrix = ctx.getTransform();
                        if (!matrix.isIdentity || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over') throw Error('Canvas state leaked');
                        frames.push(new Uint8Array(ctx.getImageData(0, 0, width, height).data));
                    }
                    let changed = 0, visible = 0;
                    for (let i = 0; i < frames[0].length; i++) {
                        if (frames[0][i] !== frames[1][i]) changed++;
                        if (i % 4 === 3 && frames[0][i]) visible++;
                    }
                    checks.push({ mode, motion, changed, visible });
                }
                return checks;
            }, viewport);
            for (const check of result) {
                assert.ok(check.visible > 100, 'effect stays visible on desktop and mobile');
                if (check.motion) assert.ok(check.changed > 100, 'effect animates with game time');
                else assert.equal(check.changed, 0, 'reduced motion has no ambient movement');
            }
            console.log('Ability VFX passed:', viewport, result);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
