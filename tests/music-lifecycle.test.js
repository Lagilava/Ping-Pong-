const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = { location: { href: 'https://example.test/' } };
const context = vm.createContext({ window, URL, console, document: { getElementById: () => null } });
const source = fs.readFileSync(path.join(__dirname, '../game/js/audio/audio-enhancements.js'), 'utf8');
// Load the engine without its automatic page integration or audio hardware.
vm.runInContext(source.slice(0, source.indexOf('\nfunction enhanceGameAudio()')) + '\nwindow.Engine = EnhancedAudioEngine;', context);
function track() {
    return {
        src: '', paused: true, currentTime: 0, starts: [],
        pause() { this.paused = true; },
        load() {},
        removeAttribute() { this.src = ''; },
        async play() { this.paused = false; this.starts.push(this.src); }
    };
}
// The outgoing player must be stopped before reset reaches object replacement,
// including when audio enhancements have not loaded yet.
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/core/game.js'), 'utf8'), context);
for (const enhanced of [false, true]) {
    const outgoing = track();
    outgoing.src = 'previous.mp3';
    outgoing.paused = false;
    let stoppedEngine = false;
    let stoppedCustom = false;
    const boundary = new Error('rest of match reset');
    const game = {
        intro: { bgMusic: outgoing },
        audio: enhanced ? { stopMusic() { stoppedEngine = true; } } : {},
        stopCustomHtmlTrack() { stoppedCustom = true; },
        _matchMusicKickAt: Date.now(),
        stop() { throw boundary; }
    };
    assert.throws(() => window.Game.prototype.resetMatch.call(game), e => e === boundary);
    assert.equal(outgoing.paused, true);
    assert.equal(outgoing.src, '');
    assert.equal(game._matchMusicKickAt, 0);
    assert.equal(stoppedEngine, enhanced);
    assert.equal(stoppedCustom, true);
}
(async () => {
    const engine = Object.create(window.Engine.prototype);
    Object.assign(engine, {
        _musicPlayQueue: Promise.resolve(), lastMusicState: {}, enabled: true,
        musicMuted: false, stopAllGravityWellSounds() {}, syncMusicVisualizerRouting() {},
        getEffectiveMusicVolume: v => v, getEffectiveMusicPlaybackRate: () => 1
    });
    const old = track();
    window.game = { intro: { bgMusic: old } };
    engine.playMusic('old', { src: 'old.mp3' });
    engine.stopMusic();
    const next = track();
    window.game.intro = { bgMusic: next };
    engine.playMusic('new', { src: 'new.mp3' });
    await engine._musicPlayQueue;
    assert.deepEqual(old.starts, []);
    assert.deepEqual(next.starts, ['new.mp3'], 'stale queued music must not start on the replacement Intro');
    assert.equal(old.paused, true);
    engine.stopMusic();
    assert.equal(next.paused, true);
    engine.playMusic('cancelled', { src: 'cancelled.mp3' });
    engine.stopMusic();
    await engine._musicPlayQueue;
    assert.deepEqual(next.starts, ['new.mp3'], 'stop must cancel pending playback without a replacement');
    console.log('Music lifecycle behavior passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
