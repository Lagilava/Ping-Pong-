// Forge (Custom) object checks. Requires Playwright, Chromium and a local
// server serving game/ (GAME_TEST_URL, default http://127.0.0.1:8080).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const open = async (browser, items) => {
    const page = await browser.newPage({viewport: {width: 1280, height: 720}});
    page.errors = [];
    page.on('pageerror', error => page.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('pp-first-launch-shown-v1', '1');
        localStorage.setItem('pp-controls-tutorial-v1-pc', '1');
    });
    await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8080') + '/play.html?from_intro=1');
    await page.waitForFunction(() => window.game);
    await page.waitForTimeout(1000);
    await page.evaluate(items => {
        game.setGameMode('customise');
        game.customSettings.forge = {
            rules: {scoreToWin: 11, ballSpeed: 1, hitSpeedup: 'normal', paddleSize: 1, gravity: 0},
            map: {name: 'test', source: '', items},
        };
        document.getElementById('overlay')?.classList.add('hidden');
        game.applyCustomiseSettings(false);
        game.startIntro?.();
    }, items);
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => game.running && !game.introActive, null, {timeout: 30000});
    await page.evaluate(() => {
        game.paused = true;
        // Fire the ball from (x, y) at (vx, vy) and step the match; paddles stay parked.
        window.fire = (x, y, vx, vy, steps) => {
            game.paused = false;
            game.obstacleArcade?.pads.forEach(pad => { pad.cooldown = 0; });
            const ball = game.ball;
            ball.pos.x = x * game.width; ball.pos.y = y * game.height;
            ball.vel.x = vx; ball.vel.y = vy;
            ball.prev?.set(ball.pos.x, ball.pos.y);
            const trace = [];
            for (let i = 0; i < steps; i++) {
                game.player.pos.y = game.aiPaddle.pos.y = 5;
                game.serveHold = 0; game.pendingServe = null;
                game.physicsStep(game.dt, true);
                trace.push([ball.pos.x, ball.pos.y, ball.vel.x, ball.vel.y]);
            }
            game.paused = true;
            return trace;
        };
    });
    return page;
};

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer']
    });
    try {
        // Spinner: at every blade angle the ball must leave the face it hit,
        // moving away from it (a wrong normal drove it into the blade).
        let page = await open(browser, [{t: 'spinner', x: 0.5, y: 0.5, s: 0.3, rot: 0}]);
        const bad = await page.evaluate(() => {
            const blade = game.obstacles[0], ball = game.ball, wrong = [];
            for (const rot of [0, 0.4, 1, 2, 3.5, 5]) for (const face of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
                blade.rotation = rot; blade.rotationSpeed = 0;
                blade.react.spin = blade.react.ox = blade.react.oy = blade.moveVX = blade.moveVY = 0;
                const c = Math.cos(rot), s = Math.sin(rot);
                const dist = (face[0] ? blade.w / 2 : blade.h / 2) + ball.r - 2;
                const nx = c * face[0] - s * face[1], ny = s * face[0] + c * face[1];
                ball.pos.x = blade.cx + c * face[0] * dist - s * face[1] * dist;
                ball.pos.y = blade.cy + s * face[0] * dist + c * face[1] * dist;
                ball.vel.x = -nx * 500; ball.vel.y = -ny * 500;
                if (!blade.checkCollision(ball)) continue;
                const away = ball.vel.x * nx + ball.vel.y * ny;
                const gap = (ball.pos.x - blade.cx) * nx + (ball.pos.y - blade.cy) * ny;
                if (away <= 0 || gap < dist) wrong.push({rot, face});
            }
            return wrong;
        });
        assert.deepEqual(bad, [], 'spinner reflects off every face at every angle');
        await page.close();

        // Pads launch the way their arrow points, from either side.
        for (const rot of [0, 1]) {
            page = await open(browser, [{t: 'pad', x: 0.5, y: 0.5, s: 1, rot}]);
            const fast = await page.evaluate(() => fire(0.4, 0.5, 600, 0, 100));
            assert.ok(Math.max(...fast.map(r => Math.hypot(r[2], r[3]))) > 660, 'pad speeds the ball up');
            const back = await page.evaluate(() => fire(0.6, 0.5, -600, 0, 100));
            const end = back[back.length - 1];
            assert.equal(Math.sign(end[2]), rot ? -1 : 1, `pad rot=${rot} launches along its arrow`);
            await page.close();
        }

        // Horizontal gates slide inside the court, clear of both paddles.
        page = await open(browser, [
            {t: 'gate', x: 0.1, y: 0.5, s: 0.16, rot: 1},
            {t: 'gate', x: 0.9, y: 0.9, s: 0.3, rot: 1},
        ]);
        const span = await page.evaluate(() => {
            const W = game.width, extent = game.obstacles.map(() => [1e9, -1e9]);
            game.paused = false;
            for (let i = 0; i < 900; i++) {
                game.player.pos.y = game.aiPaddle.pos.y = 5;
                game.physicsStep(game.dt, true);
                game.obstacles.forEach((o, k) => { extent[k][0] = Math.min(extent[k][0], o.pos.x); extent[k][1] = Math.max(extent[k][1], o.pos.x + o.w); });
            }
            game.paused = true;
            return extent.map(([a, b]) => a >= W * 0.07 - 1 && b <= W * 0.93 + 1);
        });
        assert.deepEqual(span, [true, true], 'horizontal gates stay between the paddles');
        await page.close();

        console.log('forge-objects: ok');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
