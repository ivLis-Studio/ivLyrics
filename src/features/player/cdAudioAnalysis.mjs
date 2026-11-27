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
import { DEFAULTS, clamp, finite, lerp, settingNumber, smoothstep } from "./cdVisualizerSettings.mjs";

const MAX_SEGMENTS = 20000;
const MAX_DURATION_SECONDS = 12 * 60 * 60;
export const ANALYSIS_CACHE_VERSION = 1;
const ANALYSIS_FIELDS = Object.freeze([
    "start", "end", "peak", "amplitudeStart", "amplitudeMax", "amplitudeEnd", "rise", "loudest"
]);
const PACKED_SEGMENT_SIZE = ANALYSIS_FIELDS.length + 12;
export const CACHE_RECORD_OVERHEAD = 256;
export const MAX_ANALYSIS_RECORD_BYTES = MAX_SEGMENTS * (PACKED_SEGMENT_SIZE + 2) * 8 + CACHE_RECORD_OVERHEAD;


export const trackIdFromUri = uri => (
    typeof uri === "string" ? /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri)?.[1] || null : null
);

// Amplitude conversion and smoothstep follow the MIT-licensed reference.
export const decibelsToAmplitude = decibels => (
    Number.isFinite(decibels) ? clamp(Math.pow(10, clamp(decibels, -160, 0) / 20), 0, 1) : 0
);

export function normalizeAnalysis(raw) {
    const data = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (Array.isArray(raw.segments) ? raw : raw.body) : null;
    if (!data || !Array.isArray(data.segments) || !data.segments.length || data.segments.length > MAX_SEGMENTS) return null;
    if (data.track?.duration != null && !Number.isFinite(data.track.duration)) return null;
    const declaredDuration = finite(data.track?.duration, 0);
    if (declaredDuration < 0 || declaredDuration > MAX_DURATION_SECONDS) return null;
    const segments = [];
    for (const rawSegment of data.segments) {
        if (!rawSegment || typeof rawSegment !== "object") continue;
        const start = finite(rawSegment.start, -1);
        const duration = finite(rawSegment.duration, -1);
        const peakTime = finite(rawSegment.loudness_max_time, -1);
        const pitches = rawSegment.pitches;
        if (start < 0 || duration <= 0 || start + duration > MAX_DURATION_SECONDS || peakTime < 0 || peakTime > duration
            || !Number.isFinite(rawSegment.loudness_start) || !Number.isFinite(rawSegment.loudness_max)
            || !(Array.isArray(pitches) || ArrayBuffer.isView(pitches)) || pitches.length !== 12
            || (segments.length && start <= segments[segments.length - 1].start)) continue;
        const normalizedPitches = new Float32Array(12);
        let valid = true;
        for (let index = 0; index < 12; index++) {
            if (!Number.isFinite(pitches[index])) { valid = false; break; }
            normalizedPitches[index] = clamp(pitches[index], 0, 1);
        }
        if (!valid) continue;
        segments.push({
            start, end: start + duration, peak: start + peakTime,
            amplitudeStart: decibelsToAmplitude(rawSegment.loudness_start),
            amplitudeMax: decibelsToAmplitude(rawSegment.loudness_max),
            amplitudeEnd: decibelsToAmplitude(finite(rawSegment.loudness_end, -160)),
            rise: rawSegment.loudness_max - rawSegment.loudness_start,
            loudest: rawSegment.loudness_max,
            pitches: normalizedPitches,
            pitchMean: normalizedPitches.reduce((sum, pitch) => sum + pitch, 0) / 12
        });
    }
    if (!segments.length) return null;
    for (let index = 0; index < segments.length - 1; index++) {
        const current = segments[index], next = segments[index + 1];
        // A corrupt overlapping segment must not extend over a later song section.
        current.end = Math.min(current.end, next.start);
        current.peak = Math.min(current.peak, current.end);
        if (Math.abs(current.end - next.start) < 0.001) current.amplitudeEnd = next.amplitudeStart;
    }
    return {
        segments,
        duration: Math.max(declaredDuration, segments[segments.length - 1].end),
        pulses: normalizePulses(data.beats, segments)
    };
}

export function findSegmentIndex(segments, position) {
    let low = 0, high = segments.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (segments[middle].start <= position) low = middle + 1;
        else high = middle;
    }
    return low - 1;
}

function strengthAt(segments, time) {
    const segment = segments[findSegmentIndex(segments, time)];
    return segment && time <= segment.end ? Math.sqrt(segment.amplitudeMax) : 0;
}

// Ripples and particles start only on analysed beats, or on loud segment
// attacks when a payload has no usable beat grid. Strength follows the real
// loudness at that moment, so silence and gaps never emit decorative events.
export function normalizePulses(beats, segments) {
    const times = [], strengths = [];
    let usableBeats = false;
    if (Array.isArray(beats) && beats.length <= MAX_SEGMENTS) {
        let last = -Infinity;
        for (const beat of beats) {
            const start = finite(beat?.start, -1);
            if (start < 0 || start > MAX_DURATION_SECONDS || start <= last) continue;
            last = start;
            usableBeats = true;
            const confidence = clamp(finite(beat.confidence, 0.5), 0, 1);
            const strength = strengthAt(segments, start + 0.05) * (0.55 + 0.45 * confidence);
            if (strength < 0.12) continue;
            times.push(start);
            strengths.push(Math.min(1, strength));
        }
    }
    if (!usableBeats) {
        for (const segment of segments) {
            if (!(segment.rise >= 6) || !(segment.loudest >= -28)) continue;
            const strength = Math.min(1, Math.sqrt(segment.amplitudeMax) * clamp(segment.rise / 15, 0.5, 1));
            if (strength < 0.12) continue;
            const last = times.length - 1;
            if (last >= 0 && segment.peak - times[last] < 0.18) {
                if (strength > strengths[last]) { times[last] = segment.peak; strengths[last] = strength; }
                continue;
            }
            times.push(segment.peak);
            strengths.push(strength);
        }
    }
    return times.length ? { times: Float64Array.from(times), strengths: Float32Array.from(strengths) } : null;
}

export function firstPulseAfter(times, time) {
    let low = 0, high = times?.length || 0;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (times[middle] <= time) low = middle + 1;
        else high = middle;
    }
    return low;
}

export function sampleLoudness(segment, position) {
    if (position < segment.start || position > segment.end) return 0;
    if (position < segment.peak && segment.peak > segment.start) {
        return lerp(segment.amplitudeStart, segment.amplitudeMax, (position - segment.start) / (segment.peak - segment.start));
    }
    return segment.end > segment.peak
        ? lerp(segment.amplitudeMax, segment.amplitudeEnd, (position - segment.peak) / (segment.end - segment.peak))
        : segment.amplitudeMax;
}

// Each bounded density and mirror mode has a fixed pitch-class layout.
const bandLayouts = [new Map(), new Map()];

function getBandLayout(count, mirror) {
    const layouts = bandLayouts[mirror ? 1 : 0];
    let layout = layouts.get(count);
    if (layout) return layout;

    const left = new Uint8Array(count);
    const right = new Uint8Array(count);
    const fractions = new Float64Array(count);
    const half = count / 2;
    for (let band = 0; band < count; band++) {
        const pitchPosition = mirror ? (Math.min(band, count - band) / half * 12) % 12 : (band / count) * 12;
        const pitchClass = Math.floor(pitchPosition);
        left[band] = pitchClass;
        right[band] = (pitchClass + 1) % 12;
        fractions[band] = smoothstep(pitchPosition - pitchClass);
    }
    layout = { left, right, fractions };
    layouts.set(count, layout);
    return layout;
}

// These are twelve pitch-class channels spread around a circle, not FFT bins.
// Interpolation uses only real adjacent segment values; there is no random,
// oscillator, timer-based, or fabricated fallback "audio" in the renderer.
// Mirroring lays the twelve channels from top to bottom on both sides.
export function sampleSpectrum(analysis, position, density = DEFAULTS.density, sensitivity = DEFAULTS.sensitivity, output, mirror = false) {
    const count = Math.round(settingNumber(density, DEFAULTS.density, 24, 128));
    const values = output?.length === count ? output : new Float32Array(count);
    if (!analysis?.segments?.length || !Number.isFinite(position) || position < 0) return values.fill(0);
    const index = findSegmentIndex(analysis.segments, position);
    if (index < 0) return values.fill(0);
    const segment = analysis.segments[index];
    const amplitude = sampleLoudness(segment, position);
    if (amplitude <= 0) return values.fill(0);
    const next = analysis.segments[index + 1];
    const blend = next && Math.abs(next.start - segment.end) < 0.001 && segment.end > segment.peak
        ? smoothstep((position - segment.peak) / (segment.end - segment.peak)) : 0;
    const mean = next ? lerp(segment.pitchMean, next.pitchMean, blend) : segment.pitchMean;
    const gain = settingNumber(sensitivity, DEFAULTS.sensitivity, 25, 200) / 100;
    const { left, right, fractions } = getBandLayout(count, mirror);
    for (let band = 0; band < count; band++) {
        const from = left[band], to = right[band];
        const leftPitch = next ? lerp(segment.pitches[from], next.pitches[from], blend) : segment.pitches[from];
        const rightPitch = next ? lerp(segment.pitches[to], next.pitches[to], blend) : segment.pitches[to];
        const pitch = lerp(leftPitch, rightPitch, fractions[band]) * 0.65 + mean * 0.35;
        // Perceptual compression keeps quiet, valid segments legible without
        // replacing missing analysis with decorative fake activity.
        values[band] = clamp(Math.sqrt(Math.max(0, amplitude * pitch)) * gain, 0, 1);
    }
    return values;
}

// Persist only the bounded rendering data, never the API response's extra
// metadata. Packed arrays also give the disk budget a predictable size.
export function packAnalysis(uri, data) {
    const segments = new Float64Array(data.segments.length * PACKED_SEGMENT_SIZE);
    data.segments.forEach((segment, index) => {
        const offset = index * PACKED_SEGMENT_SIZE;
        ANALYSIS_FIELDS.forEach((field, fieldIndex) => { segments[offset + fieldIndex] = segment[field]; });
        segments.set(segment.pitches, offset + ANALYSIS_FIELDS.length);
    });
    const pulses = data.pulses ? new Float64Array(data.pulses.times.length * 2) : null;
    if (pulses) data.pulses.times.forEach((time, index) => {
        pulses[index * 2] = time;
        pulses[index * 2 + 1] = data.pulses.strengths[index];
    });
    return { cacheVersion: ANALYSIS_CACHE_VERSION, uri, data: { duration: data.duration, segments, pulses } };
}

const packedArray = value => ArrayBuffer.isView(value)
    && Object.prototype.toString.call(value) === "[object Float64Array]";
export const analysisRecordBytes = record => CACHE_RECORD_OVERHEAD
    + record.data.segments.byteLength + (record.data.pulses?.byteLength || 0);

export function unpackAnalysis(record, uri) {
    const data = record?.data, packed = data?.segments, events = data?.pulses;
    if (record?.cacheVersion !== ANALYSIS_CACHE_VERSION || record.uri !== uri
        || !Number.isFinite(data?.duration) || data.duration <= 0 || data.duration > MAX_DURATION_SECONDS
        || !packedArray(packed) || !packed.length || packed.length % PACKED_SEGMENT_SIZE
        || packed.length > MAX_SEGMENTS * PACKED_SEGMENT_SIZE
        || (events !== null && (!packedArray(events) || !events.length || events.length % 2 || events.length > MAX_SEGMENTS * 2))) return null;
    const segments = [];
    for (let offset = 0; offset < packed.length; offset += PACKED_SEGMENT_SIZE) {
        for (let index = 0; index < PACKED_SEGMENT_SIZE; index++) {
            if (!Number.isFinite(packed[offset + index])) return null;
        }
        const [start, end, peak, amplitudeStart, amplitudeMax, amplitudeEnd, rise, loudest] = packed.subarray(offset, offset + 8);
        const previous = segments[segments.length - 1];
        if (start < 0 || end <= start || end > data.duration || peak < start || peak > end
            || (previous && (start <= previous.start || start < previous.end))
            || [amplitudeStart, amplitudeMax, amplitudeEnd].some(value => value < 0 || value > 1)) return null;
        const pitches = new Float32Array(12);
        for (let index = 0; index < 12; index++) {
            const value = packed[offset + ANALYSIS_FIELDS.length + index];
            if (value < 0 || value > 1) return null;
            pitches[index] = value;
        }
        segments.push({ start, end, peak, amplitudeStart, amplitudeMax, amplitudeEnd, rise, loudest,
            pitches, pitchMean: pitches.reduce((sum, pitch) => sum + pitch, 0) / 12 });
    }
    let pulses = null;
    if (events) {
        const times = new Float64Array(events.length / 2), strengths = new Float32Array(events.length / 2);
        for (let index = 0; index < times.length; index++) {
            const time = events[index * 2], strength = events[index * 2 + 1];
            if (!Number.isFinite(time) || time < 0 || time > data.duration || (index && time <= times[index - 1])
                || !Number.isFinite(strength) || strength <= 0 || strength > 1) return null;
            times[index] = time;
            strengths[index] = strength;
        }
        pulses = { times, strengths };
    }
    return { duration: data.duration, segments, pulses };
}
