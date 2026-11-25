/*
 * Analysis-driven CD visualizer. This is not a live audio capture or PCM FFT.
 * Loudness envelopes and pitch interpolation are adapted from
 * Konsl/spicetify-visualizer, commit 12cb2a9066690b4e023bccc9466ae784ebb62364
 * (src/loaders.ts, SpectrumVisualizer.tsx, NCSVisualizer.tsx, src/math.ts).
 * The radial renderer and lifecycle are specific to ivLyrics.
 *
 * MIT License
 * Copyright (c) 2026 Konsl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import {
    DEFAULTS, STYLES, COLOR_MODES, TWO_PI, finite, clamp, lerp, normalizeColor,
    normalizeSettings, resolveColor, settingNumber,
} from "./cdVisualizerSettings.mjs";
import {
    trackIdFromUri, normalizeAnalysis, normalizePulses, firstPulseAfter, decibelsToAmplitude,
    findSegmentIndex, sampleLoudness, sampleSpectrum,
} from "./cdAudioAnalysis.mjs";
import { createCdAnalysisLoader } from "./createCdAnalysisLoader.mjs";
import { createCdAlbumPalette } from "./createCdAlbumPalette.mjs";

export function createCdVisualizerApi(root) {
    const FRAME_INTERVAL_MS = 1000 / 30;
    // Beat-driven styles only animate for a short time after a real analysed
    // beat. Blocks quantize to LED-like levels with briefly held peak caps.
    const PULSE_SECONDS = 0.9;
    const PARTICLE_SECONDS = 1.1;
    const BLOCK_LEVELS = 5;
    const PEAK_HOLD_MS = 320;
    const PEAK_FALL_PER_SECOND = 0.9;
    const NO_DASH = [];
    const RAINBOW_HUES = Object.freeze([330, 20, 48, 140, 188, 228, 276, 330]);
    const createAnalysisLoader = (options) => createCdAnalysisLoader(root, options);
    const loadAnalysis = createAnalysisLoader();
    const {
        extractAlbumPalette, normalizeArtworkUrl, createPaletteLoader, loadPalette,
        blendAlbumTexture, prepareAlbumPaint, releaseAlbumPaint,
    } = createCdAlbumPalette(root);

    function getCanvasMetrics(width, height, devicePixelRatio = 1) {
        const cssWidth = clamp(finite(width, 0), 0, 2048);
        const cssHeight = clamp(finite(height, 0), 0, 2048);
        const dpr = clamp(finite(devicePixelRatio, 1), 1, 2);
        const pixelWidth = Math.max(1, Math.min(1536, Math.round(cssWidth * dpr)));
        const pixelHeight = Math.max(1, Math.min(1536, Math.round(cssHeight * dpr)));
        return {
            width: cssWidth, height: cssHeight, pixelWidth, pixelHeight,
            scaleX: cssWidth ? pixelWidth / cssWidth : 1,
            scaleY: cssHeight ? pixelHeight / cssHeight : 1
        };
    }

    function createRadialGeometry(density) {
        const count = Math.round(settingNumber(density, DEFAULTS.density, 24, 128));
        const directions = new Float32Array(count * 2);
        for (let index = 0; index < count; index++) {
            const angle = index / count * TWO_PI - Math.PI / 2;
            directions[index * 2] = Math.cos(angle);
            directions[index * 2 + 1] = Math.sin(angle);
        }
        return directions;
    }

    const rainbowColor = hue => `hsl(${hue}, 82%, 68%)`;
    const rainbowCache = typeof WeakMap === "function" ? new WeakMap() : null;

    // A conic hue wheel that starts at the top like the bands. Mirrored spectra
    // run top-to-bottom on both sides, so their colours mirror as well.
    function getRainbowPaint(context, cx, cy, mirror) {
        if (typeof context?.createConicGradient !== "function") return null;
        const key = `${cx}:${cy}:${mirror ? 1 : 0}`;
        const cached = rainbowCache?.get(context);
        if (cached?.key === key) return cached.gradient;
        let gradient;
        try { gradient = context.createConicGradient(-Math.PI / 2, cx, cy); } catch (_) { return null; }
        if (!gradient || typeof gradient.addColorStop !== "function") return null;
        if (mirror) {
            const last = RAINBOW_HUES.length - 2;
            for (let index = 0; index <= last; index++) {
                const offset = index / last / 2;
                gradient.addColorStop(offset, rainbowColor(RAINBOW_HUES[index]));
                gradient.addColorStop(1 - offset, rainbowColor(RAINBOW_HUES[index]));
            }
        } else {
            const last = RAINBOW_HUES.length - 1;
            for (let index = 0; index <= last; index++) gradient.addColorStop(index / last, rainbowColor(RAINBOW_HUES[index]));
        }
        rainbowCache?.set(context, { key, gradient });
        return gradient;
    }

    // A smooth closed contour through the band tips. The quadratic B-spline
    // stays inside the convex hull of its points, so it never overshoots.
    function traceContour(context, directions, count, cx, cy, radiusAt) {
        const curve = typeof context.quadraticCurveTo === "function";
        const lastRadius = radiusAt(count - 1), firstRadius = radiusAt(0);
        const px = cx + directions[(count - 1) * 2] * lastRadius, py = cy + directions[(count - 1) * 2 + 1] * lastRadius;
        let qx = cx + directions[0] * firstRadius, qy = cy + directions[1] * firstRadius;
        context.moveTo((px + qx) / 2, (py + qy) / 2);
        for (let index = 0; index < count; index++) {
            const next = (index + 1) % count, radius = radiusAt(next);
            const nx = cx + directions[next * 2] * radius, ny = cy + directions[next * 2 + 1] * radius;
            if (curve) context.quadraticCurveTo(qx, qy, (qx + nx) / 2, (qy + ny) / 2);
            else { context.lineTo(qx, qy); context.lineTo((qx + nx) / 2, (qy + ny) / 2); }
            qx = nx; qy = ny;
        }
        context.closePath();
    }

    // Radial erase ramps soften fills: glow fades outward, wave fades toward the
    // CD. The canvas holds only the visualizer, so this never touches the CD,
    // lyrics or page behind it. Ramps are cached per canvas size like the wheel.
    const GLOW_RAMP = Object.freeze([[0, "rgba(0, 0, 0, 0)"], [0.4, "rgba(0, 0, 0, 0.2)"], [1, "rgba(0, 0, 0, 0.75)"]]);
    const WAVE_RAMP = Object.freeze([[0, "rgba(0, 0, 0, 0.8)"], [1, "rgba(0, 0, 0, 0)"]]);
    // [outer contour scale, inner contour scale (0 = CD edge), stacked alpha]
    // equal to layers of 0.16, 0.2 and 0.28 painted over one another.
    const AURA_BANDS = Object.freeze([[1, 0.66, 0.16], [0.66, 0.36, 1 - 0.84 * 0.8], [0.36, 0, 1 - 0.84 * 0.8 * 0.72]]);
    const rampCache = typeof WeakMap === "function" ? new WeakMap() : null;

    function eraseRadially(context, cx, cy, inner, outer, stops, keepInside = 0) {
        if (typeof context.createRadialGradient !== "function" || !(outer > inner)) return;
        const key = `${cx}:${cy}:${inner}:${outer}`;
        let ramps = rampCache?.get(context);
        if (!ramps) { ramps = new Map(); rampCache?.set(context, ramps); }
        let ramp = ramps.get(stops)?.key === key ? ramps.get(stops).ramp : null;
        if (!ramp) {
            try { ramp = context.createRadialGradient(cx, cy, inner, cx, cy, outer); } catch (_) { return; }
            if (!ramp || typeof ramp.addColorStop !== "function") return;
            for (const [offset, colour] of stops) ramp.addColorStop(offset, colour);
            ramps.set(stops, { key, ramp });
        }
        context.globalCompositeOperation = "destination-out";
        context.globalAlpha = 1;
        context.fillStyle = ramp;
        context.beginPath();
        context.arc(cx, cy, outer + 2, 0, TWO_PI);
        if (keepInside > 0) {
            context.moveTo(cx + keepInside, cy);
            context.arc(cx, cy, keepInside, 0, TWO_PI, true);
        }
        context.fill("evenodd");
        context.globalCompositeOperation = "source-over";
    }

    let particleSpectrum = null;

    // extras carries the frame's real playback position, analysis (for beat
    // events) and held peaks. Without them every style degrades to its spectrum
    // or the static ring; nothing is synthesized.
    function drawSpectrum(context, metrics, values, settings = DEFAULTS, color = "#ffffff", geometry, extras = null) {
        const { width, height, scaleX = 1, scaleY = 1 } = metrics;
        if (!context || width <= 0 || height <= 0) return;
        const style = STYLES.includes(settings.style) ? settings.style : DEFAULTS.style;
        const size = Math.min(width, height), cx = width / 2, cy = height / 2;
        const lineWidth = Math.min(settings.thickness, size * 0.025);
        const baseRadius = size * 0.4, outerRadius = size * 0.48;
        const count = values?.length || settings.density;
        const dotRadius = Math.max(0.5, Math.min(lineWidth * 0.7, baseRadius * Math.PI / count * 0.6));
        const particleMax = Math.max(1.2, lineWidth * 1.5);
        const inkRadius = style === "dots" ? dotRadius
            : style === "particles" ? particleMax
            : style === "pulse" ? lineWidth * 0.8
            : style === "spikes" || style === "blocks" ? 0.5
            : lineWidth / 2;
        const extent = Math.max(0, outerRadius - baseRadius - inkRadius - 1);
        const paint = settings.colorMode === "rainbow" ? getRainbowPaint(context, cx, cy, settings.mirror) || color
            : settings.colorMode === "album" && settings.albumGradient && extras?.palette
                ? prepareAlbumPaint(context, metrics, extras.palette) || color : color;
        context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        context.clearRect(0, 0, width, height);
        context.setLineDash?.(NO_DASH);
        context.globalCompositeOperation = "source-over";
        context.strokeStyle = paint;
        context.fillStyle = paint;
        context.lineWidth = Math.max(0.5, lineWidth);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.globalAlpha = 0.2;
        context.beginPath();
        context.arc(cx, cy, baseRadius, 0, TWO_PI);
        context.stroke();
        context.globalAlpha = 0.9;
        if (!values?.length) { context.globalAlpha = 1; return; }
        const directions = geometry?.length === count * 2 ? geometry : createRadialGeometry(count);
        const level = index => clamp(finite(values[index], 0), 0, 1);
        const radiusAt = index => baseRadius + level(index) * extent;
        const gain = settingNumber(settings.sensitivity, DEFAULTS.sensitivity, 25, 200) / 100;
        const pulses = extras?.analysis?.pulses;
        const position = extras?.position;
        const timed = !!pulses?.times?.length && Number.isFinite(position);
        if (style === "line") {
            context.beginPath();
            for (let index = 0; index < count; index++) {
                const radius = radiusAt(index);
                const x = cx + directions[index * 2] * radius;
                const y = cy + directions[index * 2 + 1] * radius;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.closePath();
            context.stroke();
        } else if (style === "dots") {
            context.beginPath();
            for (let index = 0; index < count; index++) {
                const radius = radiusAt(index);
                const x = cx + directions[index * 2] * radius;
                const y = cy + directions[index * 2 + 1] * radius;
                context.moveTo(x + dotRadius, y);
                context.arc(x, y, dotRadius, 0, TWO_PI);
            }
            context.fill();
        } else if (style === "wave") {
            // Start where two neighbouring floor points meet the ring exactly.
            const floor = baseRadius / Math.cos(Math.PI / count);
            const span = Math.max(0, baseRadius + extent - floor);
            const contourRadius = index => floor + level(index) * span;
            context.beginPath();
            traceContour(context, directions, count, cx, cy, contourRadius);
            context.moveTo(cx + baseRadius, cy);
            context.arc(cx, cy, baseRadius, 0, TWO_PI, true);
            context.globalAlpha = 0.34;
            context.fill("evenodd");
            // Brightest at the crest, clear near the CD: the shape reads as liquid.
            eraseRadially(context, cx, cy, baseRadius, baseRadius + extent, WAVE_RAMP, baseRadius + lineWidth / 2);
            context.fillStyle = paint;
            context.beginPath();
            traceContour(context, directions, count, cx, cy, contourRadius);
            context.globalAlpha = 0.9;
            context.stroke();
        } else if (style === "aura") {
            // Three nested copies of the contour build a soft falloff that keeps
            // the spectrum's shape; a radial ramp then blends the steps away.
            // Each band is filled once between neighbouring contours (with the
            // stacked opacity precomputed), so no pixel is painted twice.
            const inner = size * 0.38;
            const floor = baseRadius / Math.cos(Math.PI / count);
            const span = Math.max(0, baseRadius + extent - floor);
            for (const [outerScale, innerScale, alpha] of AURA_BANDS) {
                context.beginPath();
                traceContour(context, directions, count, cx, cy, index => floor + level(index) * span * outerScale);
                if (innerScale > 0) traceContour(context, directions, count, cx, cy, index => floor + level(index) * span * innerScale);
                else {
                    context.moveTo(cx + inner, cy);
                    context.arc(cx, cy, inner, 0, TWO_PI, true);
                }
                context.globalAlpha = alpha;
                context.fill("evenodd");
            }
            eraseRadially(context, cx, cy, inner, outerRadius, GLOW_RAMP, inner);
            context.fillStyle = paint;
        } else if (style === "blocks") {
            const start = baseRadius + Math.max(1, lineWidth * 0.5 + 0.5);
            // The last lit block ends exactly at the shared outer limit.
            const pitch = Math.max(0, baseRadius + extent - start) / (BLOCK_LEVELS - 0.3);
            const blockLength = pitch * 0.7;
            const gap = pitch - blockLength;
            const levels = index => Math.round(level(index) * BLOCK_LEVELS);
            context.lineCap = "butt";
            context.lineWidth = Math.max(0.75, Math.min(lineWidth * 2.2 + 1, baseRadius * TWO_PI / count * 0.72));
            if (pitch > 0) context.setLineDash?.([blockLength, gap]);
            context.beginPath();
            for (let index = 0; index < count; index++) {
                const lit = levels(index);
                if (!lit || !(pitch > 0)) continue;
                const x = directions[index * 2], y = directions[index * 2 + 1];
                const end = start + lit * pitch - gap;
                context.moveTo(cx + x * start, cy + y * start);
                context.lineTo(cx + x * end, cy + y * end);
            }
            context.stroke();
            const peaks = extras?.peaks;
            if (peaks?.length === count) {
                let capped = 0;
                for (let index = 0; index < count; index++) {
                    const peak = Math.round(clamp(finite(peaks[index], 0), 0, 1) * BLOCK_LEVELS);
                    if (peak <= levels(index)) continue;
                    const x = directions[index * 2], y = directions[index * 2 + 1];
                    const from = start + (peak - 1) * pitch;
                    if (!capped++) context.beginPath();
                    context.moveTo(cx + x * from, cy + y * from);
                    context.lineTo(cx + x * (from + blockLength), cy + y * (from + blockLength));
                }
                if (capped) {
                    context.globalAlpha = 0.55;
                    context.stroke();
                }
            }
            context.setLineDash?.(NO_DASH);
            context.lineCap = "round";
        } else if (style === "spikes") {
            const halfWidth = Math.PI / count * Math.min(1, 0.55 + settings.thickness * 0.075);
            const cosine = Math.cos(halfWidth), sine = Math.sin(halfWidth);
            const footing = baseRadius + 0.5;
            context.beginPath();
            for (let index = 0; index < count; index++) {
                const value = level(index);
                if (value <= 0.002) continue;
                const x = directions[index * 2], y = directions[index * 2 + 1];
                const tip = baseRadius + value * extent;
                context.moveTo(cx + (x * cosine - y * sine) * footing, cy + (y * cosine + x * sine) * footing);
                context.lineTo(cx + x * tip, cy + y * tip);
                context.lineTo(cx + (x * cosine + y * sine) * footing, cy + (y * cosine - x * sine) * footing);
                context.closePath();
            }
            context.globalAlpha = 0.88;
            context.fill();
        } else if (style === "pulse") {
            // The ring breathes with the overall level; ripples mark real beats.
            let sum = 0;
            for (let index = 0; index < count; index++) sum += level(index);
            const energy = sum / count;
            context.globalAlpha = 0.3 + 0.6 * energy;
            context.lineWidth = Math.max(0.5, lineWidth * (1 + energy * 1.4));
            context.beginPath();
            context.arc(cx, cy, baseRadius + energy * extent * 0.18, 0, TWO_PI);
            context.stroke();
            if (timed) {
                for (let event = firstPulseAfter(pulses.times, position - PULSE_SECONDS); event < pulses.times.length; event++) {
                    const elapsed = position - pulses.times[event];
                    if (elapsed < 0) break;
                    const progress = elapsed / PULSE_SECONDS;
                    const alpha = 0.9 * Math.min(1, pulses.strengths[event] * gain) * Math.pow(1 - progress, 1.6);
                    if (alpha < 0.02) continue;
                    const eased = 1 - (1 - progress) * (1 - progress);
                    context.globalAlpha = alpha;
                    context.lineWidth = Math.max(0.5, lineWidth * (1.6 - progress));
                    context.beginPath();
                    context.arc(cx, cy, baseRadius + eased * extent, 0, TWO_PI);
                    context.stroke();
                }
            }
        } else if (style === "particles") {
            // Each beat bursts from the bands that were loud at that moment.
            if (timed) {
                if (particleSpectrum?.length !== count) particleSpectrum = new Float32Array(count);
                const stride = Math.max(1, Math.round(count / 28));
                const half = Math.floor(count / 2);
                for (let event = firstPulseAfter(pulses.times, position - PARTICLE_SECONDS); event < pulses.times.length; event++) {
                    const time = pulses.times[event], elapsed = position - time;
                    if (elapsed < 0) break;
                    const progress = elapsed / PARTICLE_SECONDS;
                    const alpha = Math.min(1, pulses.strengths[event] * gain * 1.3) * Math.pow(1 - progress, 0.9);
                    if (alpha < 0.02) continue;
                    const burst = sampleSpectrum(extras.analysis, time + 0.05, count, settings.sensitivity, particleSpectrum, settings.mirror);
                    const eased = 1 - Math.pow(1 - progress, 2.2);
                    let emitted = 0;
                    const emit = band => {
                        const value = burst[band];
                        if (!(value >= 0.2)) return;
                        const distance = baseRadius + lineWidth + eased * Math.max(0, extent - lineWidth) * (0.3 + 0.7 * Math.pow(value, 1.5));
                        const radius = Math.max(0.8, particleMax * (0.5 + 0.5 * value) * (1 - 0.4 * progress));
                        const x = cx + directions[band * 2] * distance, y = cy + directions[band * 2 + 1] * distance;
                        if (!emitted) context.beginPath();
                        context.moveTo(x + radius, y);
                        context.arc(x, y, radius, 0, TWO_PI);
                        emitted++;
                    };
                    if (settings.mirror) {
                        for (let band = event % stride; band <= half; band += stride) {
                            emit(band);
                            const twin = (count - band) % count;
                            if (twin !== band) emit(twin);
                        }
                    } else {
                        for (let band = event % stride; band < count; band += stride) emit(band);
                    }
                    if (emitted) {
                        context.globalAlpha = alpha;
                        context.fill();
                    }
                }
            }
        } else {
            context.lineWidth = Math.max(0.5, Math.min(lineWidth, baseRadius * TWO_PI / count * 0.65));
            context.beginPath();
            for (let index = 0; index < count; index++) {
                const x = directions[index * 2], y = directions[index * 2 + 1];
                const radius = radiusAt(index);
                context.moveTo(cx + x * baseRadius, cy + y * baseRadius);
                context.lineTo(cx + x * radius, cy + y * radius);
            }
            context.stroke();
        }
        context.globalAlpha = 1;
    }

    function readPlayback(trackUri, host = root) {
        const spicetify = host?.Spicetify;
        let snapshot = null;
        try {
            // ivLyricsPlaybackClock is a factory API, not a singleton clock.
            // Reuse the service's existing guarded clock; do not create a new
            // background poller for each CD/crossfade canvas.
            snapshot = host?.Utils?.getPlayerPlaybackSnapshot?.()
                || host?.__ivLyricsPlaybackProgressGuard?.getSnapshot?.()
                || host?.ivLyricsPlaybackClock?.getSnapshot?.() || null;
        } catch (_) { /* A public progress reading remains available below. */ }
        const item = snapshot?.item || spicetify?.Platform?.PlayerAPI?._state?.item || spicetify?.Player?.data?.item;
        const currentUri = snapshot?.uri || item?.uri;
        const metadata = item?.metadata || {};
        const ad = spicetify?.Player?.data?.isAd === true || item?.is_ad === true
            || metadata.is_ad === true || metadata.is_ad === "true";
        if ((currentUri && currentUri !== trackUri) || ad || snapshot?.djNarration === true) {
            return { matches: false, position: 0, playing: false };
        }
        let milliseconds = snapshot?.position;
        if (!Number.isFinite(milliseconds)) {
            try {
                milliseconds = host?.Utils?.getSafePlayerProgress?.() ?? spicetify?.Player?.getProgress?.();
            } catch (_) { milliseconds = Number.NaN; }
        }
        let playing = snapshot?.isPlaying;
        if (typeof playing !== "boolean") {
            try { playing = spicetify?.Player?.isPlaying?.(); } catch (_) { playing = false; }
        }
        return {
            matches: true,
            position: Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds / 1000 : null,
            playing: playing !== false
        };
    }

    // Standalone imperative renderer: no React updates, allocations of band
    // buffers, layout reads, or network requests occur inside the frame loop.
    function createRenderer(canvas, initialOptions = {}, environment = {}) {
        const host = environment.root || root;
        const document = environment.document || host?.document;
        const player = environment.player || host?.Spicetify?.Player;
        const requestFrame = environment.requestAnimationFrame || (callback => host.requestAnimationFrame(callback));
        const cancelFrame = environment.cancelAnimationFrame || (id => host.cancelAnimationFrame(id));
        const now = environment.now || (() => host?.performance?.now?.() ?? Date.now());
        const loader = environment.loadAnalysis || loadAnalysis;
        const paletteLoader = environment.loadPalette || loadPalette;
        const textureEnvironment = { root: host, createCanvas: environment.createCanvas };
        const Controller = host?.AbortController || root?.AbortController;
        const playback = environment.readPlayback || (uri => readPlayback(uri, host));
        let context;
        try { context = canvas?.getContext?.("2d", { alpha: true }); } catch (_) { context = null; }
        let options = {}, settings = normalizeSettings(), color = "#ffffff";
        let metrics = getCanvasMetrics(0, 0), status = null;
        let analysis = null, generation = 0, pending = null, attempted = false, destroyed = false;
        let palette = null, paletteGeneration = 0, palettePending = null, paletteAttempted = false, paletteAbort = null;
        let frame = null, lastFrameAt = -Infinity, lastPosition = null;
        let values = new Float32Array(settings.density), targets = new Float32Array(settings.density);
        let peaks = new Float32Array(settings.density), peakTimes = new Float64Array(settings.density);
        let geometry = createRadialGeometry(settings.density);
        const frameExtras = { analysis: null, position: null, peaks: null, palette: null };
        const removers = [];

        function report(nextStatus) {
            if (destroyed || status === nextStatus) return;
            status = nextStatus;
            canvas?.setAttribute?.("data-state", nextStatus);
            try { options.onStatusChange?.(nextStatus); } catch (_) { /* Consumer feedback cannot break playback. */ }
        }

        function measure() {
            const rect = canvas?.getBoundingClientRect?.() || { width: 0, height: 0 };
            metrics = getCanvasMetrics(rect.width, rect.height, host?.devicePixelRatio);
            if (canvas && canvas.width !== metrics.pixelWidth) canvas.width = metrics.pixelWidth;
            if (canvas && canvas.height !== metrics.pixelHeight) canvas.height = metrics.pixelHeight;
            preparePalette();
        }

        function preparePalette() {
            if (palette && settings.colorMode === "album" && settings.albumGradient) {
                prepareAlbumPaint(context, metrics, palette, textureEnvironment);
            }
        }

        function clearPalette() {
            paletteGeneration++;
            paletteAbort?.abort();
            paletteAbort = null;
            palettePending = null;
            paletteAttempted = false;
            palette = null;
            frameExtras.palette = null;
        }

        function requestPalette() {
            if (destroyed || palettePending || paletteAttempted || !context || !options.enabled
                || settings.colorMode !== "album" || !settings.albumGradient || !trackIdFromUri(options.trackUri)
                || !normalizeArtworkUrl(options.artworkUrl) || !playback(options.trackUri).matches) return;
            const token = ++paletteGeneration, uri = options.trackUri, artwork = options.artworkUrl;
            palettePending = token;
            paletteAttempted = true;
            paletteAbort = Controller ? new Controller() : null;
            const signal = paletteAbort?.signal;
            Promise.resolve().then(() => {
                if (destroyed || token !== paletteGeneration) return null;
                return paletteLoader(artwork, signal);
            }).catch(() => null).then(colors => {
                if (destroyed || token !== paletteGeneration) return;
                palettePending = null;
                paletteAbort = null;
                if (!options.enabled || options.trackUri !== uri || options.artworkUrl !== artwork
                    || settings.colorMode !== "album" || !settings.albumGradient) return;
                if (!playback(uri).matches) { paletteAttempted = false; return; }
                palette = colors;
                // Image reads, pixel blending and pattern allocation all happen
                // here (or on resize/update), never in an animation callback.
                preparePalette();
                synchronize();
            });
        }

        function stop() {
            if (frame !== null) cancelFrame(frame);
            frame = null;
        }

        function visible() { return document?.hidden !== true; }

        function canAnimate(state) {
            return !destroyed && context && options.enabled && options.playing && !options.reducedMotion
                && analysis && visible() && metrics.width > 0 && metrics.height > 0
                && state.matches && state.position !== null && state.playing;
        }

        function paint(timestamp = now(), reset = false) {
            if (destroyed || !context || !visible()) return false;
            if (!options.enabled) {
                context.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
                context.clearRect(0, 0, metrics.width, metrics.height);
                lastPosition = null;
                lastFrameAt = timestamp;
                return false;
            }
            const state = playback(options.trackUri);
            const active = canAnimate(state);
            if (active) {
                sampleSpectrum(analysis, state.position, settings.density, settings.sensitivity, targets, settings.mirror);
                const delta = clamp(timestamp - lastFrameAt, 0, 200);
                const jumped = lastPosition !== null && Math.abs(state.position - lastPosition) > 0.35;
                const snap = reset || jumped || lastPosition === null;
                for (let index = 0; index < values.length; index++) {
                    const tau = targets[index] > values[index] ? 45 : 140;
                    values[index] = snap ? targets[index] : lerp(values[index], targets[index], 1 - Math.exp(-delta / tau));
                    // Peak caps follow the drawn level, hold briefly, then fall.
                    if (snap || values[index] >= peaks[index]) {
                        peaks[index] = values[index];
                        peakTimes[index] = timestamp;
                    } else if (timestamp - peakTimes[index] > PEAK_HOLD_MS) {
                        peaks[index] = Math.max(values[index], peaks[index] - PEAK_FALL_PER_SECOND * delta / 1000);
                    }
                }
                lastPosition = state.position;
            } else {
                values.fill(0);
                peaks.fill(0);
                lastPosition = null;
            }
            frameExtras.analysis = active ? analysis : null;
            frameExtras.position = active ? state.position : null;
            frameExtras.peaks = active ? peaks : null;
            frameExtras.palette = state.matches ? palette : null;
            drawSpectrum(context, metrics, active ? values : null, settings, color, geometry, frameExtras);
            lastFrameAt = timestamp;
            return !!active;
        }

        function synchronize(reset = false) {
            stop();
            if (destroyed) return;
            const active = paint(now(), reset);
            if (active) frame = requestFrame(tick);
        }

        function tick(timestamp) {
            frame = null;
            if (destroyed) return;
            if (!canAnimate(playback(options.trackUri))) {
                // A player-state change can precede both its event and React
                // props. Do not freeze the outgoing song's last animated frame.
                paint(timestamp, true);
                return;
            }
            if (timestamp - lastFrameAt + 0.01 >= FRAME_INTERVAL_MS) {
                if (!paint(timestamp)) return;
            }
            frame = requestFrame(tick);
        }

        function requestAnalysis(retry = false) {
            if (destroyed || pending || analysis || !context || !options.enabled || !trackIdFromUri(options.trackUri)
                || (attempted && !retry) || !playback(options.trackUri).matches) return;
            const token = ++generation;
            const uri = options.trackUri;
            pending = token;
            attempted = true;
            report("loading");
            Promise.resolve().then(() => loader(uri)).catch(() => null).then(data => {
                if (destroyed || token !== generation) return;
                pending = null;
                if (!options.enabled || options.trackUri !== uri) return;
                if (!playback(uri).matches) {
                    attempted = false;
                    report("unavailable");
                    synchronize(true);
                    return;
                }
                analysis = data;
                report(data ? "ready" : "unavailable");
                synchronize(true);
            });
        }

        function update(nextOptions = {}) {
            if (destroyed) return;
            const previous = options;
            const previousSettings = settings;
            options = {
                trackUri: typeof nextOptions.trackUri === "string" ? nextOptions.trackUri : "",
                artworkUrl: typeof nextOptions.artworkUrl === "string" ? nextOptions.artworkUrl : "",
                accent: nextOptions.accent, enabled: nextOptions.enabled !== false,
                playing: nextOptions.playing === true, reducedMotion: nextOptions.reducedMotion === true,
                onStatusChange: nextOptions.onStatusChange
            };
            settings = normalizeSettings(nextOptions.settings);
            color = resolveColor(settings, options.accent);
            if (previous.trackUri !== options.trackUri || previous.artworkUrl !== options.artworkUrl
                || previous.enabled !== options.enabled || previousSettings.colorMode !== settings.colorMode
                || previousSettings.albumGradient !== settings.albumGradient) clearPalette();
            if (values.length !== settings.density) {
                values = new Float32Array(settings.density);
                targets = new Float32Array(settings.density);
                peaks = new Float32Array(settings.density);
                peakTimes = new Float64Array(settings.density);
                geometry = createRadialGeometry(settings.density);
            }
            if (previous.trackUri !== options.trackUri || previous.enabled !== options.enabled) {
                generation++;
                pending = null;
                analysis = null;
                attempted = false;
                values.fill(0);
                targets.fill(0);
                peaks.fill(0);
                lastPosition = null;
            }
            const validTrack = trackIdFromUri(options.trackUri);
            if (!options.enabled) report("disabled");
            else if (!context || !validTrack || !playback(options.trackUri).matches) report("unavailable");
            else if (analysis) report("ready");
            else if (!pending) requestAnalysis();
            requestPalette();
            preparePalette();
            synchronize(previous.trackUri !== options.trackUri);
        }

        function wake() {
            if (destroyed) return;
            if (!visible()) { stop(); lastPosition = null; return; }
            measure();
            if (options.enabled && !playback(options.trackUri).matches) {
                generation++;
                pending = null;
                analysis = null;
                attempted = false;
                clearPalette();
                report("unavailable");
            } else if (analysis) report("ready");
            else requestAnalysis(true);
            requestPalette();
            synchronize(true);
        }

        function listen(target, event, callback) {
            if (typeof target?.addEventListener !== "function") return;
            target.addEventListener(event, callback);
            removers.push(() => target.removeEventListener?.(event, callback));
        }

        listen(document, "visibilitychange", wake);
        listen(host, "pageshow", wake);
        listen(host, "focus", wake);
        listen(player, "songchange", wake);
        listen(player, "onplaypause", wake);
        listen(player, "onseek", () => synchronize(true));
        const Resize = environment.ResizeObserver || host?.ResizeObserver;
        let observer;
        if (Resize && canvas) {
            observer = new Resize(() => {
                if (destroyed) return;
                measure();
                synchronize();
            });
            observer.observe(canvas);
        } else listen(host, "resize", () => { measure(); synchronize(); });
        measure();
        update(initialOptions);

        return {
            update, redraw: wake,
            getStatus: () => status,
            getState: () => ({ status, trackUri: options.trackUri, hasAnalysis: !!analysis, framePending: frame !== null }),
            destroy() {
                if (destroyed) return;
                destroyed = true;
                generation++;
                clearPalette();
                pending = null;
                stop();
                observer?.disconnect?.();
                removers.forEach(remove => remove());
                analysis = null;
                frameExtras.analysis = null;
                releaseAlbumPaint(context);
                values.fill(0);
                targets.fill(0);
                peaks.fill(0);
            }
        };
    }

    function Visualizer(props = {}) {
        const react = root?.Spicetify?.React;
        if (!react) return null;
        const { useRef, useState, useEffect } = react;
        const canvasRef = useRef(null), rendererRef = useRef(null), latest = useRef(props);
        latest.current = props;
        const [status, setStatus] = useState(props.enabled === false ? "disabled" : "loading");
        const reportRef = useRef(null);
        if (!reportRef.current) reportRef.current = next => {
            setStatus(current => current === next ? current : next);
            latest.current.onStatusChange?.(next);
        };
        useEffect(() => {
            const renderer = createRenderer(canvasRef.current, { ...latest.current, onStatusChange: reportRef.current });
            rendererRef.current = renderer;
            return () => { rendererRef.current = null; renderer.destroy(); };
        }, []);
        const settings = normalizeSettings(props.settings);
        useEffect(() => {
            rendererRef.current?.update({ ...latest.current, onStatusChange: reportRef.current });
        }, [props.trackUri, props.artworkUrl, props.accent, props.enabled, props.playing, props.reducedMotion,
            settings.style, settings.colorMode, settings.customColor, settings.sensitivity, settings.density, settings.thickness,
            settings.mirror, settings.albumGradient]);
        return react.createElement("canvas", {
            ref: canvasRef,
            className: `ivlyrics-cd-visualizer${props.className ? ` ${props.className}` : ""}`,
            "aria-hidden": true, role: "presentation", "data-state": status,
            style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }
        });
    }

    return {
        Visualizer, DEFAULTS, STYLES, COLOR_MODES, PULSE_SECONDS, PARTICLE_SECONDS, BLOCK_LEVELS, RAINBOW_HUES,
        normalizeSettings, normalizeColor, resolveColor, trackIdFromUri, normalizeAnalysis, normalizePulses, firstPulseAfter,
        decibelsToAmplitude, findSegmentIndex, sampleLoudness, sampleSpectrum, createAnalysisLoader, loadAnalysis,
        extractAlbumPalette, normalizeArtworkUrl, createPaletteLoader, loadPalette, blendAlbumTexture, prepareAlbumPaint,
        getCanvasMetrics, createRadialGeometry, drawSpectrum, readPlayback, createRenderer
    };
}
