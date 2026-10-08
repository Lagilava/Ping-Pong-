(function () {
    // Phones/tablets are tagged (html.pp-mobile) by js/core/device.js.
    const params = new URLSearchParams(location.search);
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isReload = navEntry && navEntry.type === 'reload';

    if (isReload) {
        try {
            sessionStorage.removeItem('pp-skip-intro');
            sessionStorage.removeItem('pp-return-to-menu');
        } catch (e) {
            // ignore storage failures
        }
    }

    const skipIntroFlag = (() => {
        try {
            if (params.has('return_to_menu')) {
                sessionStorage.setItem('pp-return-to-menu', '1');
                sessionStorage.setItem('pp-skip-intro', '1');
            }
            if (params.has('open_customise')) {
                window.PP_OPEN_CUSTOMISE = true;
            }
            return sessionStorage.getItem('pp-skip-intro') === '1';
        } catch (e) {
            return params.has('return_to_menu');
        }
    })();

    if (!params.has('from_intro') && !skipIntroFlag) {
        window.location.replace('index.html');
        return;
    }

    if (params.has('return_to_menu')) {
        window.PP_RETURN_TO_MENU = true;
    }
    if (skipIntroFlag) {
        window.PP_SKIP_MATCH_INTRO = true;
        try {
            sessionStorage.removeItem('pp-skip-intro');
        } catch (e) {
            // ignore storage failures
        }
    }

    if (location.search) {
        history.replaceState(null, '', location.pathname);
    }
})();

window.__ppStartCustomMatch = async function (event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (typeof window.__ppStartCustomMatchCore === 'function') {
        return window.__ppStartCustomMatchCore(event);
    }

    const game = window.game;
    if (!game) return;

    if (typeof window.__ppSyncCustomSettingsFromControls === 'function') {
        window.__ppSyncCustomSettingsFromControls();
    }

    if (game.customSettings) {
        game.customSettings.previewModeActive = false;
    }
    game.isMultiplayer = true;

    if (typeof game.prepareCustomMatchResources === 'function') {
        await game.prepareCustomMatchResources();
    }

    if (typeof game.setGameMode === 'function') {
        game.setGameMode('customise');
    }

    if (typeof game.applyCustomiseSettings === 'function') {
        game.applyCustomiseSettings();
    }

    if (typeof window.__ppRefreshCustomPreviewNow === 'function') {
        window.__ppRefreshCustomPreviewNow();
    } else if (typeof window.__ppRefreshCustomPreview === 'function') {
        window.__ppRefreshCustomPreview();
    }
    if (typeof window.__ppRefreshCustomBallPreview === 'function') {
        window.__ppRefreshCustomBallPreview();
    }

    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    const customiseOverlay = document.getElementById('customiseOverlay');
    if (customiseOverlay) {
        customiseOverlay.classList.remove('active');
        customiseOverlay.setAttribute('aria-hidden', 'true');
    }

    const customisePanel = document.getElementById('customisePanel');
    if (customisePanel) {
        customisePanel.classList.remove('active');
    }
};
(function () {
    const isAbsoluteUrl = (value) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);

    const encodePathSegments = (assetPath) => assetPath
        .split('/')
        .map((segment) => {
            if (!segment || segment === '.' || segment === '..') return segment;
            try {
                return encodeURIComponent(decodeURIComponent(segment));
            } catch (e) {
                return encodeURIComponent(segment);
            }
        })
        .join('/');

    window.resolveAssetUrl = function resolveAssetUrl(assetPath) {
        if (!assetPath || isAbsoluteUrl(assetPath) || assetPath.startsWith('data:') || assetPath.startsWith('blob:')) {
            return assetPath;
        }
        const encodedPath = encodePathSegments(assetPath);
        return new URL(encodedPath, window.location.href).toString();
    };

    window.applyResolvedAssetUrls = function applyResolvedAssetUrls(root = document) {
        root.querySelectorAll('[data-asset-src]').forEach((element) => {
            const assetPath = element.getAttribute('data-asset-src');
            const resolvedUrl = window.resolveAssetUrl(assetPath);
            if (resolvedUrl) {
                element.setAttribute('src', resolvedUrl);
            }
        });
    };
})();
