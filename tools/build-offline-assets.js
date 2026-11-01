#!/usr/bin/env node
// Writes game/offline-assets.json: every file the installed app caches up
// front so all modes play offline (see game/sw.js and game/js/app/pwa.js).
// Music is left out on purpose (about 42 MB); it streams as before.
//
//   node tools/build-offline-assets.js          rewrite the list
//   node tools/build-offline-assets.js --check  exit 1 if it is out of date
//
// Run it after adding, renaming or deleting files under game/ (editing a
// file does not change the list).
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const GAME = path.join(__dirname, '..', 'game');
const OUT = path.join(GAME, 'offline-assets.json');
const SKIP_DIRS = new Set(['assets/audio']);
const SKIP_FILES = new Set(['sw.js', 'offline-assets.json']);
const SKIP_EXT = new Set(['.md', '.txt', '.map']);

function walk(dir, rel, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const r = rel ? rel + '/' + entry.name : entry.name;
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) { if (!SKIP_DIRS.has(r)) walk(path.join(dir, entry.name), r, out); continue; }
        if (SKIP_FILES.has(r) || SKIP_EXT.has(path.extname(entry.name).toLowerCase())) continue;
        out.push(r);
    }
    return out;
}

function build() {
    const files = walk(GAME, '', []);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for (const f of files) {
        bytes += fs.statSync(path.join(GAME, f)).size;
        hash.update(f).update('\0');
    }
    // The hash covers names only, so editing a file never makes the list
    // stale; edited files reach installed copies through the service worker's
    // network-first / refresh-in-background rules.
    const list = { hash: hash.digest('hex').slice(0, 16), files: files.map(encodeURI) };
    return { text: JSON.stringify(list, null, 1) + '\n', bytes };
}

const { text: next, bytes } = build();
if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== next) {
        console.error('game/offline-assets.json is out of date: run node tools/build-offline-assets.js');
        process.exit(1);
    }
    console.log('game/offline-assets.json is up to date.');
} else {
    fs.writeFileSync(OUT, next);
    const list = JSON.parse(next);
    console.log(`Wrote game/offline-assets.json: ${list.files.length} files, ${(bytes / 1048576).toFixed(1)} MB.`);
}
