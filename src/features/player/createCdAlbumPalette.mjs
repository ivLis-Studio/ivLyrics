import { TWO_PI, settingNumber, smoothstep } from "./cdVisualizerSettings.mjs";

export function createCdAlbumPalette(root) {
    // Pick representative pixels from populated colour buckets. Dark/neutral
    // backgrounds and JPEG speckles must not crowd out the artwork's colours;
    // a monochrome cover deliberately has no multicolour fallback palette.
    function extractAlbumPalette(pixels, maxColors = 6) {
        if (!pixels || !Number.isInteger(pixels.length) || !pixels.length || pixels.length % 4 || pixels.length > 64 * 64 * 4) return null;
        const buckets = new Map();
        let opaque = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
            const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2], alpha = pixels[offset + 3];
            if (![r, g, b, alpha].every(value => Number.isFinite(value) && value >= 0 && value <= 255) || alpha < 192) continue;
            opaque++;
            const high = Math.max(r, g, b), low = Math.min(r, g, b);
            if (high < 40 || high - low < 32 || (high - low) / high < 0.16) continue;
            const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
            const bucket = buckets.get(key);
            if (bucket) bucket.count++;
            else buckets.set(key, { r, g, b, count: 1, saturation: (high - low) / high });
        }
        const candidates = [...buckets.values()].filter(color => color.count >= Math.max(2, opaque * 0.003));
        candidates.forEach(color => { color.score = Math.sqrt(color.count) * (0.3 + color.saturation * 0.7); });
        const selected = [], limit = Math.round(settingNumber(maxColors, 6, 2, 8));
        while (selected.length < limit && candidates.length) {
            let best = -1, score = -1;
            for (let index = 0; index < candidates.length; index++) {
                const color = candidates[index];
                const distance = selected.length ? Math.min(...selected.map(other => Math.hypot(color.r - other.r, color.g - other.g, color.b - other.b))) : 255;
                if (distance < 60) continue;
                const distinctScore = color.score * Math.min(1, distance / 160);
                if (distinctScore > score) { best = index; score = distinctScore; }
            }
            if (best < 0) break;
            selected.push(candidates.splice(best, 1)[0]);
        }
        return selected.length >= 2 ? Object.freeze(selected.map(({ r, g, b }) =>
            `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`)) : null;
    }

    function normalizeArtworkUrl(value) {
        if (typeof value !== "string" || !value || value.length > 4096) return null;
        const spotifyImage = /^spotify:image:([a-f0-9]{40})$/i.exec(value);
        if (spotifyImage) return `https://i.scdn.co/image/${spotifyImage[1]}`;
        return /^https?:\/\/[^\s]+$/i.test(value) || /^blob:https?:\/\/[^\s]+$/i.test(value) ? value : null;
    }

    function detachedCanvas(host, width, height) {
        let canvas;
        if (typeof host?.OffscreenCanvas === "function") canvas = new host.OffscreenCanvas(width, height);
        else canvas = host?.document?.createElement?.("canvas");
        if (canvas) { canvas.width = width; canvas.height = height; }
        return canvas;
    }

    function createPaletteLoader(options = {}) {
        const host = options.root || root;
        const schedule = options.setTimeout || ((callback, ms) => host.setTimeout(callback, ms));
        const cancel = options.clearTimeout || (id => host.clearTimeout(id));
        const now = options.now || Date.now;
        const timeoutMs = settingNumber(options.timeoutMs, 3000, 50, 5000);
        const negativeTtlMs = settingNumber(options.negativeTtlMs, 60000, 1000, 10 * 60000);
        const capacity = Math.round(settingNumber(options.capacity, 12, 1, 32));
        const maxInflight = Math.round(settingNumber(options.maxInflight, 2, 1, 4));
        const makeImage = options.createImage || (() => new host.Image());
        const makeCanvas = options.createCanvas || ((width, height) => detachedCanvas(host, width, height));
        const cache = new Map(), jobs = new Map();
        let active = 0, waiting = null;

        function finish(job, palette = null, remember = true) {
            if (job.done) return;
            job.done = true;
            if (job.timer !== undefined) cancel(job.timer);
            if (job.image) {
                job.image.onload = job.image.onerror = null;
                if (!palette) {
                    try { job.image.src = ""; } catch (_) { /* Cancel a timed-out/unobserved image. */ }
                }
            }
            if (job.started) active--;
            if (waiting === job) waiting = null;
            jobs.delete(job.url);
            if (remember) {
                cache.delete(job.url);
                cache.set(job.url, { palette, expires: palette ? Infinity : now() + negativeTtlMs });
                while (cache.size > capacity) cache.delete(cache.keys().next().value);
            }
            for (const subscriber of [...job.subscribers]) subscriber(palette);
            if (waiting && active < maxInflight) {
                const next = waiting;
                waiting = null;
                start(next);
            }
        }

        function start(job) {
            if (job.done) return;
            job.started = true;
            active++;
            job.timer = schedule(() => finish(job), timeoutMs);
            try {
                const image = job.image = makeImage();
                image.crossOrigin = "anonymous";
                image.onload = () => {
                    if (job.done) return;
                    try {
                        if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) { finish(job); return; }
                        const canvas = makeCanvas(48, 48), context = canvas?.getContext?.("2d", { willReadFrequently: true });
                        if (!context) { finish(job); return; }
                        context.drawImage(image, 0, 0, 48, 48);
                        finish(job, extractAlbumPalette(context.getImageData(0, 0, 48, 48).data));
                    } catch (_) { finish(job); /* CORS/tainted canvases retain the real accent. */ }
                };
                image.onerror = () => finish(job);
                image.src = job.url;
            } catch (_) { finish(job); }
        }

        function load(value, signal) {
            const url = normalizeArtworkUrl(value);
            if (!url || signal?.aborted) return Promise.resolve(null);
            const cached = cache.get(url);
            if (cached && cached.expires > now()) {
                cache.delete(url); cache.set(url, cached);
                return Promise.resolve(cached.palette);
            }
            cache.delete(url);
            let job = jobs.get(url);
            const created = !job;
            if (!job) {
                job = { url, subscribers: new Set(), done: false, started: false };
                jobs.set(url, job);
            }
            const promise = new Promise(resolve => {
                const settle = palette => {
                    signal?.removeEventListener?.("abort", abort);
                    job.subscribers.delete(settle);
                    resolve(palette);
                };
                const abort = () => {
                    settle(null);
                    if (!job.subscribers.size) finish(job, null, false);
                };
                job.subscribers.add(settle);
                signal?.addEventListener?.("abort", abort, { once: true });
            });
            if (created) {
                if (active < maxInflight) start(job);
                else {
                    const displaced = waiting;
                    waiting = job;
                    if (displaced) finish(displaced, null, false);
                }
            }
            return promise;
        }
        load.getStats = () => ({ cached: cache.size, inflight: active, waiting: waiting ? 1 : 0 });
        return load;
    }

    const loadPalette = createPaletteLoader();

    function normalizedPalette(palette) {
        if (!Array.isArray(palette) || palette.length < 2 || palette.length > 8
            || !palette.every(color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) return null;
        const colors = [...new Set(palette.map(color => color.toLowerCase()))];
        return colors.length >= 2 ? colors : null;
    }

    // A mesh of circular Gaussian colour sources, not a directional gradient
    // or a hue wheel. Blend in linear light so adjacent artwork colours remain
    // bright. Only an annulus has ink; the centre and exterior stay transparent.
    function blendAlbumTexture(palette, resolution = 128) {
        const colors = normalizedPalette(palette);
        if (!colors) return null;
        const size = Math.round(settingNumber(resolution, 128, 32, 192));
        const sources = colors.map((color, index) => {
            const angle = index / colors.length * TWO_PI - Math.PI / 2;
            return { x: 0.5 + Math.cos(angle) * 0.42, y: 0.5 + Math.sin(angle) * 0.42,
                channels: [1, 3, 5].map(offset => Math.pow(parseInt(color.slice(offset, offset + 2), 16) / 255, 2.2)) };
        });
        const pixels = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size, v = (y + 0.5) / size, radius = Math.hypot(u - 0.5, v - 0.5);
            const alpha = smoothstep((radius - 0.36) / 0.02) * (1 - smoothstep((radius - 0.485) / 0.01));
            if (alpha <= 0) continue;
            let red = 0, green = 0, blue = 0, total = 0;
            for (const source of sources) {
                const weight = Math.exp(-((u - source.x) ** 2 + (v - source.y) ** 2) / (2 * 0.18 ** 2));
                red += source.channels[0] * weight;
                green += source.channels[1] * weight;
                blue += source.channels[2] * weight;
                total += weight;
            }
            const offset = (y * size + x) * 4;
            pixels[offset] = Math.pow(red / total, 1 / 2.2) * 255;
            pixels[offset + 1] = Math.pow(green / total, 1 / 2.2) * 255;
            pixels[offset + 2] = Math.pow(blue / total, 1 / 2.2) * 255;
            pixels[offset + 3] = alpha * 255;
        }
        return { width: size, height: size, data: pixels };
    }

    const albumPaintCache = new WeakMap();

    function prepareAlbumPaint(context, metrics, palette, environment = null) {
        if (!context || !palette) return null;
        let cache = albumPaintCache.get(context);
        const { width, height } = metrics;
        if (cache?.palette === palette && cache.width === width && cache.height === height) return cache.paint;
        if (!cache) { cache = { entries: new Map() }; albumPaintCache.set(context, cache); }
        const colors = normalizedPalette(palette);
        const key = colors && `${width}:${height}:${colors.join(":")}`;
        let paint = cache.entries.get(key) || null;
        if (key && !cache.entries.has(key) && width > 0 && height > 0) {
            try {
                if (typeof context.createPattern === "function") {
                    const texture = blendAlbumTexture(colors);
                    const canvas = environment?.createCanvas
                        ? environment.createCanvas(texture.width, texture.height)
                        : detachedCanvas(environment?.root || root, texture.width, texture.height);
                    const layer = canvas?.getContext?.("2d", { alpha: true });
                    if (layer) {
                        const image = layer.createImageData(texture.width, texture.height);
                        image.data.set(texture.data);
                        layer.putImageData(image, 0, 0);
                        paint = context.createPattern(canvas, "no-repeat");
                        if (typeof paint?.setTransform === "function") {
                            const size = Math.min(width, height);
                            paint.setTransform({ a: size / texture.width, b: 0, c: 0, d: size / texture.height,
                                e: (width - size) / 2, f: (height - size) / 2 });
                        } else paint = null;
                    }
                }
            } catch (_) { paint = null; }
            cache.entries.set(key, paint);
            while (cache.entries.size > 4) cache.entries.delete(cache.entries.keys().next().value);
        }
        Object.assign(cache, { palette, width, height, paint });
        return paint;
    }

    function releaseAlbumPaint(context) {
        if (context) albumPaintCache.delete(context);
    }

    return {
        extractAlbumPalette, normalizeArtworkUrl, createPaletteLoader, loadPalette,
        blendAlbumTexture, prepareAlbumPaint, releaseAlbumPaint,
    };
}
