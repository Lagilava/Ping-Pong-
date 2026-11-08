// Service worker: lets the installed game (Home Screen app, Play Store TWA)
// start and play without a connection, without ever serving stale code.
//
// - Code and pages (HTML, JS, CSS, JSON, WASM): network first, cache as a
//   fallback. Online players always get the latest push to main.
// - Art and fonts: served from cache, refreshed in the background.
// - Music (assets/audio) and any Range request: never touched, the browser
//   streams them as before. Online play and other sites are never touched.
// - Installed copies ask for the whole game to be cached up front (see
//   js/app/pwa.js and offline-assets.json) so every mode works offline.
'use strict';

const VERSION = 'pp-sw-v2';
const CODE_CACHE = VERSION + '-code';
const ART_CACHE = VERSION + '-art';
const SHELL = ['./', 'index.html', 'play.html', 'manifest.webmanifest',
    'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];
const CODE_RE = /\.(?:html?|js|mjs|css|json|webmanifest|wasm)$/i;
const SKIP_RE = /\/assets\/audio\//i;

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CODE_CACHE)
        .then((cache) => cache.addAll(SHELL))
        .catch(() => { /* first visit offline or a shell file missing: runtime caching still works */ })
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys
            .filter((key) => key.startsWith('pp-sw-') && !key.startsWith(VERSION + '-'))
            .map((key) => caches.delete(key))))
        .then(() => self.clients.claim()));
});

function isCode(url, request) {
    return request.mode === 'navigate' || CODE_RE.test(url.pathname) || url.pathname.endsWith('/');
}

// One copy per file: a new ?v= cache-buster replaces the old one instead of
// piling up beside it.
async function store(cache, request, response) {
    try {
        await cache.delete(request, { ignoreSearch: true });
        await cache.put(request, response);
    } catch (e) { /* storage full or private mode: the game still runs online */ }
}

async function networkFirst(request) {
    const cache = await caches.open(CODE_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') store(cache, request, response.clone());
        return response;
    } catch (err) {
        // Script tags carry ?v= cache-busters that change between pushes:
        // offline, any cached copy of the same file beats no game at all.
        const hit = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
        if (hit) return hit;
        if (request.mode === 'navigate') {
            const page = await cache.match('play.html', { ignoreSearch: true });
            if (page) return page;
        }
        throw err;
    }
}

async function staleWhileRevalidate(event) {
    const { request } = event;
    const cache = await caches.open(ART_CACHE);
    const hit = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    const refresh = fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') store(cache, request, response.clone());
        return response;
    });
    if (hit) {
        event.waitUntil(refresh.catch(() => { }));
        return hit;
    }
    return refresh;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || request.headers.has('range')) return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (!url.href.startsWith(self.registration.scope)) return;
    if (SKIP_RE.test(url.pathname) || url.pathname.endsWith('/sw.js')) return;
    event.respondWith(isCode(url, request) ? networkFirst(request) : staleWhileRevalidate(event));
});

// The page sends {type: 'pp-cache-all', urls: [...]} once it is running as an
// installed app. Files already cached are skipped, so this is cheap after the
// first time; a failed file is retried on the next launch.
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'pp-cache-all' || !Array.isArray(data.urls)) return;
    event.waitUntil((async () => {
        const code = await caches.open(CODE_CACHE);
        const art = await caches.open(ART_CACHE);
        let cached = 0, failed = 0;
        for (const raw of data.urls) {
            let url;
            try { url = new URL(raw, self.registration.scope); } catch (e) { continue; }
            if (url.origin !== self.location.origin || SKIP_RE.test(url.pathname)) continue;
            const cache = CODE_RE.test(url.pathname) ? code : art;
            if (await cache.match(url.href, { ignoreSearch: true })) continue;
            try {
                const response = await fetch(url.href, { cache: 'no-cache' });
                if (response.ok) { await cache.put(url.href, response); cached++; } else failed++;
            } catch (e) { failed++; }
        }
        if (event.source) event.source.postMessage({ type: 'pp-cache-all-done', cached, failed });
    })());
});
