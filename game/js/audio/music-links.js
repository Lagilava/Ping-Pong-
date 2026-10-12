// Provider embeds stay visible so the listener can start playback and use the
// provider's own controls. Streaming pages are never treated as audio files.
(function () {
    function parse(value) {
        let url;
        try { url = new URL(String(value || '').trim()); } catch (_) { return null; }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
        const path = url.pathname.split('/').filter(Boolean);
        if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
            const id = host === 'youtu.be' ? path[0] : (path[0] === 'watch' ? url.searchParams.get('v') : (['shorts', 'embed', 'live'].includes(path[0]) ? path[1] : null));
            if (!/^[\w-]{11}$/.test(id || '')) return null;
            return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0` };
        }
        if (host === 'open.spotify.com') {
            const offset = path[0]?.startsWith('intl-') ? 1 : 0;
            const type = path[offset], id = path[offset + 1];
            if (!['track', 'album', 'playlist', 'episode', 'show'].includes(type) || !/^[A-Za-z0-9]{22}$/.test(id || '')) return null;
            return { provider: 'Spotify', src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator` };
        }
        if (host === 'soundcloud.com' && path.length >= 2) {
            return { provider: 'SoundCloud', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=true` };
        }
        if (host === 'music.apple.com' && path.length >= 2) {
            const country = path[0];
            if (!/^[a-z]{2}$/.test(country)) return null;
            const embedded = new URL(url.toString());
            embedded.hostname = 'embed.music.apple.com';
            embedded.search = '';
            return { provider: 'Apple Music', src: embedded.toString() };
        }
        return null;
    }

    function stop() { document.getElementById('ppCustomTrackDock')?.remove(); }
    function play(value) {
        const link = parse(value);
        if (!link) return false;
        const existing = document.getElementById('ppCustomTrackDock');
        if (existing?.dataset.source === value) return true;
        stop();
        const dock = document.createElement('aside');
        dock.id = 'ppCustomTrackDock';
        dock.className = 'pp-music-dock';
        dock.dataset.source = value;
        dock.setAttribute('aria-label', `${link.provider} match music`);
        const header = document.createElement('div');
        header.className = 'pp-music-dock-head';
        const title = document.createElement('span');
        title.textContent = `${link.provider} · Match music`;
        const hide = document.createElement('button');
        hide.type = 'button';
        hide.textContent = 'Hide';
        hide.setAttribute('aria-label', 'Minimize music player');
        hide.addEventListener('click', () => {
            const collapsed = dock.classList.toggle('collapsed');
            hide.textContent = collapsed ? 'Show' : 'Hide';
            hide.setAttribute('aria-label', collapsed ? 'Show music player' : 'Minimize music player');
        });
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Stop';
        close.addEventListener('click', stop);
        header.append(title, hide, close);
        const frame = document.createElement('iframe');
        frame.src = link.src;
        frame.title = `${link.provider} music player`;
        frame.allow = 'autoplay; encrypted-media; clipboard-write';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.loading = 'eager';
        dock.append(header, frame);
        document.body.appendChild(dock);
        return true;
    }
    window.PPMusicLinks = { parse, play, stop };
})();
