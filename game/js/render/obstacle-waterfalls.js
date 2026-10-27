// Extract small cyan waterfall regions once, then scroll a cached water texture
// inside their exact silhouettes. Shared by GPU and canvas scenery paths.
class ObstacleWaterfalls {
    constructor(source) {
        this.regions = [];
        const sample = document.createElement('canvas');
        const detail = window.PPResolution?.detail() || 1;
        const scale = Math.min(1, 640 * detail / source.width, 360 * detail / source.height);
        sample.width = Math.max(1, Math.round(source.width * scale));
        sample.height = Math.max(1, Math.round(source.height * scale));
        const ctx = sample.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(source, 0, 0, sample.width, sample.height);
        const {width, height} = sample;
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const water = new Uint8Array(width * height);
        for (let i = 0; i < water.length; i++) {
            const p = i * 4;
            const cyan = Math.min(pixels[p + 1] - pixels[p], pixels[p + 2] - pixels[p]);
            if (cyan > 9 && pixels[p + 1] > 30) water[i] = Math.min(255, (cyan - 9) * 9);
        }
        const seen = new Uint8Array(water.length);
        for (let start = 0; start < water.length; start++) {
            if (!water[start] || seen[start]) continue;
            const queue = [start];
            seen[start] = 1;
            let x0 = width, y0 = height, x1 = 0, y1 = 0;
            for (let head = 0; head < queue.length; head++) {
                const i = queue[head], x = i % width, y = Math.floor(i / width);
                x0 = Math.min(x0, x); y0 = Math.min(y0, y);
                x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy, next = ny * width + nx;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[next] || !water[next]) continue;
                        seen[next] = 1; queue.push(next);
                    }
                }
            }
            const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
            if (queue.length < 10 || rh < 6 || rh < rw * 0.65) continue;
            const mask = document.createElement('canvas');
            mask.width = rw; mask.height = rh;
            const mc = mask.getContext('2d');
            const image = mc.createImageData(rw, rh);
            for (const i of queue) {
                const p = ((Math.floor(i / width) - y0) * rw + (i % width) - x0) * 4;
                image.data[p] = image.data[p + 1] = image.data[p + 2] = 255;
                image.data[p + 3] = water[i];
            }
            mc.putImageData(image, 0, 0);
            const tile = document.createElement('canvas');
            tile.width = rw; tile.height = 96;
            const tc = tile.getContext('2d');
            // Several staggered ribbons form a continuous curtain rather
            // than horizontal scan lines. All gradients are created once.
            for (let x = 0; x < rw; x += 2) {
                const phase = Math.sin(x * 12.9898 + x0) * 43758.5453;
                const y = ((phase % 1 + 1) % 1) * tile.height;
                for (const offset of [-96, 0, 96]) {
                    const top = y + offset;
                    const streak = tc.createLinearGradient(0, top, 0, top + 36);
                    streak.addColorStop(0, 'rgba(80,190,255,0)');
                    streak.addColorStop(0.7, 'rgba(100,225,255,0.5)');
                    streak.addColorStop(0.92, 'rgba(200,250,255,0.85)');
                    streak.addColorStop(1, 'rgba(80,190,255,0)');
                    tc.fillStyle = streak;
                    tc.fillRect(x, top, 1.5, 36);
                }
            }
            const flow = document.createElement('canvas');
            flow.width = rw; flow.height = rh;
            this.regions.push({mask, tile, flow, ctx: flow.getContext('2d'),
                x: x0 / width, y: y0 / height, w: rw / width, h: rh / height,
                phase: x0 * 0.37});
        }
    }

    render(ctx, w, h, time) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.72;
        for (const region of this.regions) {
            const {ctx: flow, tile, mask} = region;
            flow.globalCompositeOperation = 'source-over';
            flow.clearRect(0, 0, mask.width, mask.height);
            // Canvas y grows down: positive offsets visibly fall, including
            // during WebGL fallback. The loop joins seamlessly every 96px.
            const offset = (time * 42 + region.phase) % tile.height;
            for (let y = offset - tile.height; y < mask.height; y += tile.height) flow.drawImage(tile, 0, y);
            flow.globalCompositeOperation = 'destination-in';
            flow.drawImage(mask, 0, 0);
            ctx.drawImage(region.flow, region.x * w, region.y * h, region.w * w, region.h * h);
        }
        ctx.restore();
    }
}
