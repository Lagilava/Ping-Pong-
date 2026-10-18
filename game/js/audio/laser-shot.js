// One sound design for the base and enhanced engines. Cached noise, short
// bounded voices, and explicit disconnection keep rapid fire inexpensive.
(function () {
    const noiseCache = new WeakMap();
    function noise(ctx) {
        if (noiseCache.has(ctx)) return noiseCache.get(ctx);
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.22), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let smooth = 0;
        for (let i = 0; i < data.length; i++) {
            smooth = smooth * 0.45 + (Math.random() * 2 - 1) * 0.55;
            data[i] = smooth;
        }
        noiseCache.set(ctx, buffer);
        return buffer;
    }
    function play(ctx, output, volume = 0.5, onVoiceEnd) {
        if (!ctx || !output || volume <= 0) return [];
        const now = ctx.currentTime;
        const voices = [];
        const bus = ctx.createGain();
        bus.gain.value = Math.min(1, volume) * 0.62;
        bus.connect(output);
        let remaining = 4;
        function voice(source, level, duration, filter) {
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(level, now + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            if (filter) { source.connect(filter); filter.connect(gain); }
            else source.connect(gain);
            gain.connect(bus);
            source._finished = false;
            source._startTime = Date.now();
            source.onended = () => {
                source._finished = true;
                source.disconnect();
                filter?.disconnect();
                gain.disconnect();
                if (--remaining === 0) bus.disconnect();
                onVoiceEnd?.(source);
            };
            source.start(now);
            source.stop(now + duration + 0.015);
            voices.push(source);
        }
        // Low impact gives the shot weight without a piercing arcade chirp.
        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(155, now);
        thump.frequency.exponentialRampToValueAtTime(46, now + 0.16);
        voice(thump, 0.95, 0.2);
        // Detuned plasma layers tear down in pitch with a resonant metallic tail.
        for (let i = 0; i < 2; i++) {
            const osc = ctx.createOscillator();
            osc.type = i ? 'triangle' : 'sawtooth';
            osc.frequency.setValueAtTime(i ? 790 : 840, now);
            osc.frequency.exponentialRampToValueAtTime(i ? 105 : 93, now + 0.24);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 1.4;
            filter.frequency.setValueAtTime(2600, now);
            filter.frequency.exponentialRampToValueAtTime(320, now + 0.24);
            voice(osc, i ? 0.35 : 0.42, 0.28, filter);
        }
        const crack = ctx.createBufferSource();
        crack.buffer = noise(ctx);
        const grit = ctx.createBiquadFilter();
        grit.type = 'bandpass';
        grit.Q.value = 0.8;
        grit.frequency.setValueAtTime(2200, now);
        grit.frequency.exponentialRampToValueAtTime(420, now + 0.14);
        voice(crack, 0.48, 0.18, grit);
        return voices;
    }
    window.PPLaserAudio = { play };
})();
