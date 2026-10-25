// Source-matte repair and reusable physical light stamps. All pixel reads and
// gradient work happen during asset decoding/baking, never in a warm frame.
(function () {
    'use strict';
    function cleanMatte(canvas, {columns = 1, rows = 1, minIslandPixels = 12} = {}) {
        const ctx = canvas.getContext('2d');
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const {data, width: w, height: h} = image;
        const source = new Uint8ClampedArray(data);
        const seen = new Uint8Array(w * h), queue = new Uint32Array(w * h);
        for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
            const x0 = Math.round(tx * w / columns), x1 = Math.round((tx + 1) * w / columns);
            const y0 = Math.round(ty * h / rows), y1 = Math.round((ty + 1) * h / rows);
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const start = y * w + x;
                if (seen[start] || data[start * 4 + 3] < 12) continue;
                let head = 0, tail = 1; queue[0] = start; seen[start] = 1;
                while (head < tail) {
                    const i = queue[head++], px = i % w, py = (i / w) | 0;
                    // Eight-connected components preserve fine fronds/chains.
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        const nx = px + dx, ny = py + dy, next = ny * w + nx;
                        if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1 || seen[next] || data[next * 4 + 3] < 12) continue;
                        seen[next] = 1; queue[tail++] = next;
                    }
                }
                if (tail < minIslandPixels) for (let n = 0; n < tail; n++) data[queue[n] * 4 + 3] = source[queue[n] * 4 + 3] = 0;
            }
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const p = (y * w + x) * 4, a = source[p + 3];
                if (a < 12) { data[p + 3] = 0; continue; }
                let coverage = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= x0 && nx < x1 && ny >= y0 && ny < y1) coverage += source[(ny * w + nx) * 4 + 3] / 255;
                }
                if (coverage >= 8.8) continue;
                // One-pixel coverage feather; retain interior texture and alpha.
                data[p + 3] = Math.round(a * (0.58 + 0.42 * Math.min(1, coverage / 7)));
                const max = Math.max(source[p], source[p + 1], source[p + 2]);
                const min = Math.min(source[p], source[p + 1], source[p + 2]);
                if (max - min < 120 || min > 28) continue;
                // The delivered mattes contain pure red/blue/cyan key-colour
                // contamination. Borrow colour from the nearest solid interior,
                // rather than darkening every edge (which makes a black halo).
                let donor = -1, best = -Infinity;
                for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
                    const q = (ny * w + nx) * 4;
                    if (source[q + 3] < 245) continue;
                    const qmin = Math.min(source[q], source[q + 1], source[q + 2]);
                    const qmax = Math.max(source[q], source[q + 1], source[q + 2]);
                    const score = qmin * 2 - (qmax - qmin) - (dx * dx + dy * dy) * 6;
                    if (score > best) { best = score; donor = q; }
                }
                if (donor >= 0) for (let k = 0; k < 3; k++) data[p + k] = Math.round(source[p + k] * .18 + source[donor + k] * .82);
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }
    function shadow(source) {
        const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
        const x = c.getContext('2d'); x.drawImage(source, 0, 0);
        x.globalCompositeOperation = 'source-in'; x.fillStyle = '#02030b'; x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'destination-in';
        const fade = x.createLinearGradient(0, 0, 0, c.height);
        fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(.65, 'rgba(255,255,255,.45)'); fade.addColorStop(1, 'white');
        x.fillStyle = fade; x.fillRect(0, 0, c.width, c.height);
        return c;
    }
    window.SceneCompositor = {cleanMatte, shadow};
})();
