// Forge (Custom) object checks: spinners, pads and gates, then the gadgets
// (deflectors, laser gates, crystals, portals) with their share codes, the
// AI's read of the path, the online snapshot and the editor. Requires
// Playwright, Chromium and a local server serving game/ (GAME_TEST_URL,
// default http://127.0.0.1:8080).
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
        window.fire = (x, y, vx, vy, steps, until) => {
            game.paused = false;
            game.obstacleArcade?.pads.forEach(pad => { pad.cooldown = 0; });
            const ball = game.ball;
            ball.pos.x = x * game.width; ball.pos.y = y * game.height;
            ball.vel.x = vx; ball.vel.y = vy; ball.spin = 0;
            ball.prev?.set(ball.pos.x, ball.pos.y);
            ball._forgePortalLock = -1;
            const trace = [];
            for (let i = 0; i < steps; i++) {
                game.player.pos.y = game.aiPaddle.pos.y = 5;
                game.serveHold = 0; game.pendingServe = null;
                game.physicsStep(game.dt, true);
                trace.push([ball.pos.x / game.width, ball.pos.y / game.height, ball.vel.x, ball.vel.y]);
                if (until && until(ball)) break;
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

        // Deflectors turn the ball through about a right angle, each way.
        for (const [rot, sign] of [[0, 1], [1, -1]]) {
            const page = await open(browser, [{t: 'deflector', x: 0.5, y: 0.5, s: 0.2, rot}]);
            const trace = await page.evaluate(() => fire(0.42, 0.5, 700, 0, 60));
            const end = trace[trace.length - 1];
            assert.ok(Math.abs(end[3]) > Math.abs(end[2]) * 2, `deflector rot=${rot} turns the ball (vx ${end[2].toFixed(0)}, vy ${end[3].toFixed(0)})`);
            assert.equal(Math.sign(end[3]), sign, `deflector rot=${rot} sends the ball the way its slant points`);
            assert.deepEqual(page.errors, []);
            await page.close();
        }

        // Laser gates block while lit and let the ball through while off.
        {
            const page = await open(browser, [{t: 'laser', x: 0.5, y: 0.5, s: 0.3, rot: 0}]);
            const lit = await page.evaluate(() => {
                const fg = game.forgeGadgets, l = fg.lasers[0];
                fg.time = -l.offset + 0.5; // early in the lit phase
                return fire(0.4, 0.5, 900, 0, 50);
            });
            assert.ok(lit[lit.length - 1][2] < 0, 'lit beam bounces the ball back');
            const off = await page.evaluate(() => {
                const fg = game.forgeGadgets, l = fg.lasers[0];
                fg.time = -l.offset + 3.0; // off phase
                return fire(0.4, 0.5, 900, 0, 50);
            });
            assert.ok(off[off.length - 1][2] > 0 && off[off.length - 1][0] > 0.52, 'dark beam lets the ball through');
            // A very fast ball can't tunnel through a lit beam.
            const fast = await page.evaluate(() => {
                const fg = game.forgeGadgets, l = fg.lasers[0];
                fg.time = -l.offset + 0.5;
                game.ball.maxSpeed = 4000;
                return fire(0.45, 0.5, 3600, 300, 20);
            });
            assert.ok(fast.every(r => r[0] < 0.5), 'fast ball stays on its side of a lit beam');
            // Posts stay solid while the beam is off.
            const post = await page.evaluate(() => {
                const fg = game.forgeGadgets, l = fg.lasers[0];
                fg.time = -l.offset + 3.0;
                return fire(0.4, l.y1 / game.height, 900, 0, 60);
            });
            assert.ok(post[post.length - 1][2] < 0, 'laser posts are always solid');
            assert.deepEqual(page.errors, []);
            await page.close();
        }

        // Crystals crack on two hits, shatter on the third, then grow back.
        {
            const page = await open(browser, [{t: 'crystal', x: 0.5, y: 0.5, s: 1, rot: 0}]);
            const hp = await page.evaluate(() => {
                const c = game.forgeGadgets.crystals[0], out = [];
                for (let i = 0; i < 3; i++) {
                    fire(0.45, 0.5, 800, 0, 40);
                    out.push(c.hp);
                    game.forgeGadgets.update(0.3);
                }
                return out;
            });
            assert.deepEqual(hp, [2, 1, 0], 'crystal loses one hit point per hit');
            const through = await page.evaluate(() => fire(0.45, 0.5, 800, 0, 40));
            assert.ok(through[through.length - 1][0] > 0.52, 'a shattered crystal lets the ball through');
            const back = await page.evaluate(() => {
                game.ball.pos.x = 50; game.ball.pos.y = 50;
                for (let i = 0; i < 120; i++) game.forgeGadgets.update(0.1);
                return game.forgeGadgets.crystals[0].hp;
            });
            assert.equal(back, 3, 'crystal grows back');
            // Star power smashes it in one go.
            const star = await page.evaluate(() => {
                const ar = game.obstacleArcade;
                if (!ar) return 'no-arcade';
                ar.starTime = 5; ar.starOwner = 'player';
                fire(0.45, 0.5, 800, 0, 40);
                ar.starTime = 0;
                return game.forgeGadgets.crystals[0].hp;
            });
            if (star !== 'no-arcade') assert.equal(star, 0, 'star power shatters a crystal');
            assert.deepEqual(page.errors, []);
            await page.close();
        }

        // Portals: in one, out of its partner, same velocity; a lone portal is idle.
        {
            const page = await open(browser, [
                {t: 'portal', x: 0.3, y: 0.3, s: 1, rot: 0},
                {t: 'portal', x: 0.7, y: 0.7, s: 1, rot: 0},
                {t: 'portal', x: 0.5, y: 0.85, s: 1, rot: 0},
            ]);
            const res = await page.evaluate(() => {
                let warped = null;
                const trace = fire(0.22, 0.3, 700, 0, 40, b => {
                    if (b.pos.x > game.width * 0.6) { warped = [b.pos.x / game.width, b.pos.y / game.height, b.vel.x, b.vel.y]; return true; }
                    return false;
                });
                return {warped, pairs: game.forgeGadgets.portals.map(p => p.pair)};
            });
            assert.deepEqual(res.pairs, [0, 0, -1], 'portals pair in order; the odd one waits');
            assert.ok(res.warped, 'ball comes out of the partner portal');
            assert.ok(Math.abs(res.warped[1] - 0.7) < 0.05 && Math.abs(res.warped[2] - 700) < 5 && Math.abs(res.warped[3]) < 5, 'exit keeps speed and heading');
            // It does not bounce straight back in: it carries on out of the exit.
            const after = await page.evaluate(() => fire(0.22, 0.3, 700, 0, 120, b => b.pos.x > game.width * 0.8));
            const last = after[after.length - 1];
            assert.ok(last[0] > 0.8 && Math.abs(last[1] - 0.7) < 0.05, 'ball leaves the exit portal');
            const lone = await page.evaluate(() => fire(0.45, 0.85, 700, 0, 40));
            assert.ok(lone[lone.length - 1][0] > 0.52 && Math.abs(lone[lone.length - 1][1] - 0.85) < 0.02, 'unpaired portal does nothing');
            // The AI follows the ball through the portal pair.
            const ai = await page.evaluate(() => {
                const ball = game.ball, W = game.width, H = game.height;
                ball.pos.x = W * 0.22; ball.pos.y = H * 0.3; ball.vel.x = 700; ball.vel.y = 120; ball.spin = 0; ball._forgePortalLock = -1;
                ball.prev.set(ball.pos.x, ball.pos.y);
                const faceX = game.aiPaddle.pos.x - ball.r;
                const predicted = game.forgeGadgets.predictY(ball, faceX, 400, H);
                const naive = PhysicsCore.predictY(ball, faceX, 400, H);
                const trace = fire(0.22, 0.3, 700, 120, 400, b => b.pos.x >= faceX);
                return {predicted, naive, actual: trace[trace.length - 1][1] * H, H};
            });
            assert.ok(Math.abs(ai.predicted - ai.actual) < ai.H * 0.04, `AI reads the portal (predicted ${ai.predicted.toFixed(0)}, actual ${ai.actual.toFixed(0)}, naive ${ai.naive.toFixed(0)})`);
            assert.deepEqual(page.errors, []);
            await page.close();
        }

        // Share codes carry gadgets; old codes still load; caps hold.
        {
            const page = await open(browser, []);
            const res = await page.evaluate(() => {
                const S = Forge.Store;
                const items = [
                    {t: 'deflector', x: 0.4, y: 0.4, s: 0.2, rot: 1}, {t: 'laser', x: 0.5, y: 0.5, s: 0.3, rot: 1},
                    {t: 'crystal', x: 0.6, y: 0.6, s: 1, rot: 0}, {t: 'portal', x: 0.3, y: 0.3, s: 1, rot: 0},
                    ...Array.from({length: 6}, (_, i) => ({t: 'portal', x: 0.2 + i * 0.05, y: 0.8, s: 1, rot: 0})),
                ];
                const code = S.encode({name: 'gadgets', items: S.sanitizeItems(items)}, {scoreToWin: 7});
                const back = S.decode(code);
                // A code from before gadgets existed (walls, pads, coins only).
                const old = 'PPF1:' + btoa(JSON.stringify({n: 'old', r: {scoreToWin: 11}, i: [['wall', 0.2, 0.3, 0.2, 0], ['pad', 0.3, 0.5, 1, 1], ['coin', 0.4, 0.5, 1, 0]]}));
                return {back, old: S.decode(old)};
            });
            assert.deepEqual(res.back.items.map(i => i.t), ['deflector', 'laser', 'crystal', 'portal', 'portal', 'portal', 'portal'], 'gadgets survive a share code; portals capped at 4');
            assert.equal(res.back.items[0].rot, 1, 'deflector slant survives');
            assert.deepEqual(res.old.items.map(i => i.t), ['wall', 'pad', 'coin'], 'old share codes still load');
            assert.equal(res.old.items[1].rot, 1);
            await page.close();
        }

        // Online: the guest takes crystal health and the laser clock from the host.
        {
            const page = await open(browser, [{t: 'crystal', x: 0.5, y: 0.5, s: 1, rot: 0}, {t: 'laser', x: 0.3, y: 0.5, s: 0.3, rot: 0}]);
            const res = await page.evaluate(() => {
                const fg = game.forgeGadgets;
                const before = fg.snapshot();
                fg.applySnapshot({t: 12.5, c: '1'}, 0.05);
                const mid = {time: fg.time, hp: fg.crystals[0].hp};
                fg.applySnapshot({t: 12.6, c: '0'}, 0.05);
                return {before, mid, broken: fg.crystals[0].hp, shards: fg.shards.length};
            });
            assert.deepEqual(res.before.c, '3');
            assert.ok(Math.abs(res.mid.time - 12.55) < 0.01 && res.mid.hp === 1, 'guest syncs clock and health');
            assert.ok(res.broken === 0 && res.shards > 0, 'guest shows the shatter');
            await page.close();
        }

        // Editor: letter keys pick gadgets, Mirror places linked portal
        // pairs, R flips a deflector and its twin, caps hold, and the arena
        // plays after Done.
        {
            const page = await open(browser, []);
            await page.evaluate(() => { game.paused = true; Forge.UI.editor.open(Forge.Store.getForge(game).map); });
            await page.waitForTimeout(300);
            const box = await page.locator('.forge-canvas').boundingBox();
            const at = (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
            await page.keyboard.press('p');
            await at(0.25, 0.25);
            await at(0.25, 0.75);
            await at(0.4, 0.5); // a fifth and sixth portal would break the cap
            await page.keyboard.press('d');
            await at(0.35, 0.4);
            await page.keyboard.press('r');
            await page.keyboard.press('l');
            await at(0.3, 0.9);
            const ed = await page.evaluate(() => {
                const e = Forge.UI.editor;
                return {
                    tool: e.tool,
                    items: e.items.map(i => [i.t, i.rot]),
                    hint: (e.selected = e.items[0], e.draw(0), document.querySelector('.forge-object-hint').textContent),
                };
            });
            assert.equal(ed.tool, 'laser');
            assert.deepEqual(ed.items.filter(i => i[0] === 'portal').length, 4, 'portal cap is 4');
            const defl = ed.items.filter(i => i[0] === 'deflector').map(i => i[1]);
            assert.deepEqual(defl.sort(), [0, 1], 'R flips the deflector and its mirror twin stays opposite');
            assert.match(ed.hint, /pair/, 'portal panel says which pair it is in');
            await page.evaluate(() => Forge.UI.editor.close(true));
            const live = await page.evaluate(() => {
                game.applyCustomiseSettings(false);
                const fg = game.forgeGadgets;
                return {portals: fg.portals.map(p => p.pair), deflectors: fg.deflectors.length, lasers: fg.lasers.length};
            });
            assert.deepEqual(live.portals, [0, 0, 1, 1]);
            assert.equal(live.deflectors, 2);
            assert.equal(live.lasers, 2);
            // A laser by the edge is shortened so both posts stay on court.
            const posts = await page.evaluate(() => game.forgeGadgets.lasers.every(l => l.y1 - l.pr >= 0 && l.y2 + l.pr <= game.height));
            assert.ok(posts, 'laser posts stay on the court');
            assert.deepEqual(page.errors, []);
            await page.close();
        }

        console.log('forge-objects: ok');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
