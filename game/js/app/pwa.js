// Registers the service worker (sw.js) so the game can be installed as an app
// (Home Screen, Play Store via a Trusted Web Activity) and start offline.
// Installed copies also cache every mode's art and code once, after the page
// has loaded and gone idle, so a later offline launch has the whole game.
// Plain browser tabs only cache what they actually load.
(function registerPingPongServiceWorker() {
    'use strict';
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    if (/[?&]nosw\b/.test(location.search)) return;

    const LIST = 'offline-assets.json';
    const DONE_KEY = 'pp-offline-cache-v1';

    function isInstalled() {
        try {
            return navigator.standalone === true
                || document.referrer.startsWith('android-app://')
                || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
        } catch (e) { return false; }
    }

    function cacheWholeGame(registration) {
        if (!isInstalled()) return;
        const saveData = navigator.connection && navigator.connection.saveData;
        if (saveData) return;
        let done = null;
        try { done = localStorage.getItem(DONE_KEY); } catch (e) { /* ignore */ }
        fetch(LIST, { cache: 'no-cache' })
            .then((r) => (r.ok ? r.json() : null))
            .then((list) => {
                if (!list || !Array.isArray(list.files)) return;
                // Rerun only when the asset list changed (a new push) or the
                // last run had failures.
                if (done && done === list.hash) return;
                const worker = registration.active || navigator.serviceWorker.controller;
                if (!worker) return;
                navigator.serviceWorker.addEventListener('message', function onDone(event) {
                    if (!event.data || event.data.type !== 'pp-cache-all-done') return;
                    navigator.serviceWorker.removeEventListener('message', onDone);
                    if (!event.data.failed) {
                        try { localStorage.setItem(DONE_KEY, list.hash); } catch (e) { /* ignore */ }
                    }
                });
                worker.postMessage({ type: 'pp-cache-all', urls: list.files });
            })
            .catch(() => { /* offline right now: try next launch */ });
    }

    function start() {
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .then(() => navigator.serviceWorker.ready)
            .then((registration) => {
                const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 4000));
                setTimeout(() => idle(() => cacheWholeGame(registration), { timeout: 10000 }), 6000);
            })
            .catch(() => { /* unsupported or blocked: the game runs the same without it */ });
    }

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
})();
