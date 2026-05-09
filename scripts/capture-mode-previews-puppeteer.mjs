import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, '../assets/customise-previews');
const logFile = path.resolve(__dirname, 'capture-mode-previews-puppeteer.log');
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  writeFileSync(logFile, `${line}\n`, { flag: 'a' });
}

async function captureScreenshots() {
  let browser;
  let server;
  try {
    writeFileSync(logFile, '');
    log('[1/6] Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--allow-file-access-from-files',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    page.on('console', (msg) => log(`[page:${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => log(`[pageerror] ${err?.message || err}`));
    page.on('requestfailed', (req) => log(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText || 'unknown'}`));

    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      window.PP_SKIP_MATCH_INTRO = true;
    });

    const htmlPath = path.resolve(__dirname, '../ping_pong.html');
    const port = 4173;
    const httpUrl = `http://127.0.0.1:${port}/ping_pong.html?from_intro=1`;
    const fileUrl = `${pathToFileURL(htmlPath).href}?from_intro=1`;
    const modes = ['classic', 'zombie', 'gravity', 'speed', 'obstacle'];

    log(`[2/6] Attempting HTTP first: ${httpUrl}`);

    const tryUrls = [httpUrl, fileUrl];
    let loadedUrl = null;

    for (const url of tryUrls) {
      try {
        if (url.startsWith('http://')) {
          server = spawn('npx', ['http-server', '-p', String(port), '-c-1'], {
            cwd: path.resolve(__dirname, '..'),
            shell: true,
            stdio: 'ignore'
          });

          await page.waitForFunction(async (target) => {
            try {
              const response = await fetch(target, { method: 'HEAD' });
              return response.ok;
            } catch {
              return false;
            }
          }, { timeout: 20000 }, url);
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        loadedUrl = url;
        break;
      } catch (error) {
        log(`[load-failed] ${url} :: ${error?.message || error}`);
      }
    }

    if (!loadedUrl) {
      throw new Error('Unable to load ping_pong.html via HTTP or file URL');
    }

    log(`[3/6] Loaded target: ${loadedUrl}`);
    log('[3/6] Waiting for Game constructor...');
    await page.waitForFunction(() => typeof Game === 'function' || typeof window.Game === 'function', { timeout: 60000 });
    const gameBindingState = await page.evaluate(() => ({
      hasGameBinding: typeof Game === 'function',
      hasWindowGame: typeof window.Game === 'function',
      hasGameObject: !!window.game,
    }));
    log(`[3/6] Game binding state: ${JSON.stringify(gameBindingState)}`);
    log('[3/6] Waiting for window.game and bgRenderer...');
    await page.waitForFunction(() => window.game && window.game.bgRenderer, { timeout: 60000 });

    await page.evaluate(() => {
      const canvas = document.getElementById('c');
      if (!canvas) throw new Error('Canvas #c not found');
      canvas.width = 1280;
      canvas.height = 720;
      canvas.style.width = '1280px';
      canvas.style.height = '720px';
    });

    log('[3/6] Capturing backgrounds from isolated renderer...');

    await page.evaluate(() => {
      if (window.game && typeof window.game.stop === 'function') {
        window.game.stop();
      }
    });

    const rendererReady = await page.evaluate(() => {
      document.body.innerHTML = '';

      const canvas = document.createElement('canvas');
      canvas.id = 'capture-background-canvas';
      canvas.width = 1280;
      canvas.height = 720;
      canvas.style.width = '1280px';
      canvas.style.height = '720px';
      canvas.style.position = 'fixed';
      canvas.style.left = '0';
      canvas.style.top = '0';
      document.body.appendChild(canvas);

      const ctx = canvas.getContext('2d', { alpha: false });
      const RendererClass = window.game?.bgRenderer?.constructor || window.BackgroundRenderer;
      if (!RendererClass) {
        throw new Error('BackgroundRenderer class is unavailable');
      }

      const renderer = new RendererClass(ctx, 1280, 720);
      window.__captureBackgroundRenderer = renderer;
      return !!renderer;
    });

    if (!rendererReady) {
      throw new Error('Failed to create isolated BackgroundRenderer');
    }

    log('[4/6] Capturing modes...');

    for (const mode of modes) {
      log(`  -> Switching to mode: ${mode}`);

      await page.evaluate(async (selectedMode) => {
        const renderer = window.__captureBackgroundRenderer;
        if (!renderer) throw new Error('Capture renderer missing');

        const canvas = renderer.ctx?.canvas || document.getElementById('capture-background-canvas');
        if (!canvas) throw new Error('Capture canvas missing');

        if (typeof renderer.setMode === 'function') {
          renderer.setMode(selectedMode);
        } else {
          renderer.mode = selectedMode;
        }

        if (typeof renderer.resize === 'function') {
          renderer.resize(1280, 720);
        }

        if (typeof renderer.update === 'function') {
          for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
          }
        }

        if (typeof renderer.render === 'function') {
          renderer.render();
        } else {
          throw new Error(`Renderer for ${selectedMode} cannot render`);
        }
          return canvas.toDataURL('image/png');
      }, mode);

      await new Promise((resolve) => setTimeout(resolve, 800));

      const screenshotPath = path.join(outDir, `${mode}.png`);
        const pngDataUrl = await page.evaluate(() => {
          const canvas = document.getElementById('capture-background-canvas');
          if (!canvas) throw new Error('Capture canvas missing for export');
          return canvas.toDataURL('image/png');
        });

        const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
        writeFileSync(screenshotPath, Buffer.from(base64, 'base64'));
      const size = statSync(screenshotPath).size;
      log(`     Saved: ${mode}.png (${size} bytes)`);
    }

    log('[5/6] All screenshots captured successfully!');
    log(`Output directory: ${outDir}`);

  } catch (error) {
    log(`FATAL ERROR: ${error?.stack || error?.message || error}`);
    process.exit(1);
  } finally {
    if (server) {
      server.kill();
    }
    if (browser) {
      await browser.close();
    }
  }
}

captureScreenshots();
