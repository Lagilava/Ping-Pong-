const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    input: 'pingpong_comic_v2_chapter2.html',
    output: path.join('exports', 'pingpong_comic_v2_chapter2.comic.pdf'),
    width: 1600,
    scale: 2,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === '--input' && next) {
      args.input = next;
      i += 1;
    } else if (current === '--output' && next) {
      args.output = next;
      i += 1;
    } else if (current === '--width' && next) {
      args.width = Number(next) || args.width;
      i += 1;
    } else if (current === '--scale' && next) {
      args.scale = Number(next) || args.scale;
      i += 1;
    }
  }

  return args;
}

function buildPrintHtml(imageDataUrl, sheetCount, scaledImageHeight) {
  const sheets = Array.from({ length: sheetCount }, (_, index) => {
    const offset = index * 11 * 96;
    return `
      <section class="sheet">
        <div class="art" style="transform: translateY(-${offset}px);"></div>
      </section>`;
  }).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: Letter portrait; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: sans-serif;
    }
    :root {
      --comic-image: url("${imageDataUrl}");
      --sheet-width: 8.5in;
      --sheet-height: 11in;
    }
    .sheet {
      width: var(--sheet-width);
      height: var(--sheet-height);
      overflow: hidden;
      position: relative;
      page-break-after: always;
      break-after: page;
      background: #000;
    }
    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .art {
      width: 100%;
      height: ${scaledImageHeight}px;
      background-image: var(--comic-image);
      background-repeat: no-repeat;
      background-position: top left;
      background-size: 100% 100%;
    }
  </style>
</head>
<body>
${sheets}
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(process.cwd(), args.input);
  const outputPath = path.resolve(process.cwd(), args.output);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: args.width, height: 1600, deviceScaleFactor: args.scale });
    await page.evaluateOnNewDocument(() => {
      const raf = () => 0;
      window.requestAnimationFrame = raf;
      window.cancelAnimationFrame = raf;
    });

    await page.goto(pathToFileURL(inputPath).href, { waitUntil: 'load' });
    await page.emulateMediaType('screen');
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await delay(500);
    await page.evaluate(() => {
      const nav = document.querySelector('.nav');
      if (nav) nav.style.display = 'none';
    });
    await delay(100);

    const screenshotWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const screenshotHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const screenshotBase64 = await page.screenshot({ fullPage: true, type: 'png', encoding: 'base64' });
    const screenshotPath = path.join(outputDir, path.basename(outputPath, path.extname(outputPath)) + '.full.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, 'base64'));

    const pageWidthCss = 8.5 * 96;
    const pageHeightCss = 11 * 96;
    const scale = pageWidthCss / screenshotWidth;
    const scaledImageHeight = Math.ceil(screenshotHeight * scale);
    const sheetCount = Math.max(1, Math.ceil(scaledImageHeight / pageHeightCss));
    const imageDataUrl = `data:image/png;base64,${screenshotBase64}`;
    const printHtml = buildPrintHtml(imageDataUrl, sheetCount, scaledImageHeight);

    await page.setContent(printHtml, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: true,
    });

    console.log(`Wrote ${outputPath}`);
    console.log(`Wrote ${screenshotPath}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});