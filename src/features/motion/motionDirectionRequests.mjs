import { compose } from "./motionComposition.mjs";
import { critiqueNotes, critiquePlan } from "./motionCritique.mjs";
import { modelSignature } from "./motionLyricModel.mjs";
import { motionDirector } from "./MotionLyricsDirector.mjs";
import { clamp, hashString, round } from "./motionMath.mjs";
import { runWithAbortSignal } from "../../core/abortableOperation.mjs";

/**
 * The colours of an album cover for the AI ({ colors: [{ hex, share }],
 * light: its mean brightness }), largest share first; null when the image
 * cannot be read. Read once per cover.
 */
export function createCoverColorSampler({ canSample, createImage, createElement }) {
	const coverColors = new Map();
	return (url) => {
		let source = String(url || "").trim();
		if (source.startsWith("spotify:image:")) source = "https://i.scdn.co/image/" + source.slice("spotify:image:".length);
		if (!/^(https?:|data:|blob:)/.test(source) || !canSample()) return Promise.resolve(null);
		if (coverColors.has(source)) return coverColors.get(source);
		const reading = new Promise((resolve) => {
			const image = createImage();
			image.crossOrigin = "anonymous";
			image.onerror = () => resolve(null);
			image.onload = () => {
				try {
					const size = 24;
					const canvas = createElement("canvas");
					canvas.width = size;
					canvas.height = size;
					const context = canvas.getContext("2d", { willReadFrequently: true });
					context.drawImage(image, 0, 0, size, size);
					const pixels = context.getImageData(0, 0, size, size).data;
					// Colours in buckets of 3 bits a channel, then near buckets merged.
					const buckets = new Map();
					let light = 0;
					for (let index = 0; index < pixels.length; index += 4) {
						const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
						light += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
						const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
						const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
						bucket.count += 1;
						bucket.r += r;
						bucket.g += g;
						bucket.b += b;
						buckets.set(key, bucket);
					}
					const total = size * size;
					const merged = [];
					for (const bucket of [...buckets.values()].sort((left, right) => right.count - left.count)) {
						const colour = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count];
						const near = merged.find((entry) => Math.hypot(entry.rgb[0] - colour[0], entry.rgb[1] - colour[1], entry.rgb[2] - colour[2]) < 48);
						if (near) near.count += bucket.count;
						else merged.push({ rgb: colour, count: bucket.count });
					}
					const hex = (rgb) => "#" + rgb.map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("");
					const colors = merged.filter((entry) => entry.count / total >= 0.03).slice(0, 5).map((entry) => ({ hex: hex(entry.rgb), share: round(entry.count / total, 2) }));
					resolve(colors.length ? { colors, light: round(light / total, 2) } : null);
				} catch {
					// A cover from another origin cannot be read.
					resolve(null);
				}
			};
			image.src = source;
		});
		coverColors.set(source, reading);
		if (coverColors.size > 24) coverColors.delete(coverColors.keys().next().value);
		return reading;
	};
}

/**
 * The built-in direction for a song: of a few takes (seeds from seed), the
 * one a viewer would find least wrong with (critiquePlan), composed on a
 * nominal screen so the pick does not change with the window.
 */
const LOCAL_TAKES = 3;
export const bestLocalDirection = (model, options, composeOptions = {}) => {
	const director = motionDirector;
	if (!director || !model?.length) return null;
	const seed = (Number(options.seed) >>> 0) || 1;
	let best = null;
	for (let take = 0; take < LOCAL_TAKES; take += 1) {
		const takeSeed = take ? (seed ^ Math.imul(0x9E3779B1, take)) >>> 0 : seed;
		const direction = director.localDirection(model, { ...options, seed: takeSeed });
		let score = 0;
		try {
			score = critiquePlan(compose(model, direction, { width: 1440, height: 900, ...composeOptions, seed: takeSeed }), { step: 150 }).score;
		} catch {
			score = 0;
		}
		if (!best || score > best.score) best = { direction, score, seed: takeSeed };
		// A take nothing is wrong with is as good as it gets.
		if (score >= 97) break;
	}
	return best;
};

/**
 * The AI direction for a song: { status: "ready", raw } from the cache or a
 * provider, { status: "off" } without a motion-capable provider, or
 * { status: "failed", error }.
 *
 * judge(raw) composes and watches a direction (critiquePlan). A direction
 * that scores under REVISE_BELOW goes back to the AI once with what was
 * wrong with it; revised then resolves with the revision when it scored
 * better (null otherwise), and the better of the two is cached. retake > 0
 * asks for a new edit (not from the cache) and caches that one instead.
 * cover: the album cover's colours ({ colors: [{ hex, share }], light }).
 */
const REVISE_BELOW = 85;
const directionOff = () => ({ status: "off" });

function observeMotionRequest(entry, signal) {
	if (!signal) {
		entry.keepAlive = true;
		return entry.request;
	}

	entry.subscribers++;
	let active = true;
	const done = () => {
		if (!active) return;
		active = false;
		signal.removeEventListener("abort", release);
		entry.subscribers--;
	};
	const release = () => {
		done();
		if (!entry.keepAlive && entry.subscribers === 0) entry.cancel();
	};
	signal.addEventListener("abort", release, { once: true });
	return runWithAbortSignal(signal, () => entry.request).then(result => {
		if (signal.aborted) return directionOff();
		if (!result.revised) {
			done();
			return result;
		}
		const revised = runWithAbortSignal(signal, () => result.revised)
			.catch(() => null).finally(done);
		return { ...result, revised };
	}, () => {
		done();
		return directionOff();
	});
}

export function createMotionDirectionRequester({ readLyricsCache, readAiManager, getTrackCacheId }) {
	const directionRequests = new Map();

	return ({ trackUri, model, title = "", artist = "", tempo = null, songLang = "", energy = null, cover = null, judge = null, retake = 0, signal }) => {
		const director = motionDirector;
		if (!director || !trackUri || !model?.length || signal?.aborted) return Promise.resolve(directionOff());
		const sourceHash = hashString(modelSignature(model)).toString(36) + "-v" + director.VERSION;
		const take = Math.max(0, Math.floor(Number(retake) || 0));
		const trackId = getTrackCacheId(trackUri) || String(trackUri).split(":").pop() || String(trackUri);
		const key = JSON.stringify([trackId, sourceHash]);
		const cache = readLyricsCache();
		const revision = cache?.getRevision?.(trackId);
		// Keep the request through critique so a second view can join it and a
		// newer take owns the same cache slot before the old revision finishes.
		const existing = directionRequests.get(key);
		if (existing && existing.cache === cache && existing.revision === revision && (!take || existing.take === take)) {
			return observeMotionRequest(existing, signal);
		}
		existing?.cancel();
		const controller = new AbortController();
		const entry = { cache, revision, take, request: null, subscribers: 0, keepAlive: false, cancel };
		function release() {
			if (directionRequests.get(key) === entry) directionRequests.delete(key);
		}
		function cancel() {
			release();
			controller.abort();
		}
		const isCurrent = () => !controller.signal.aborted && directionRequests.get(key) === entry
			&& readLyricsCache() === cache && cache?.getRevision?.(trackId) === revision;
		entry.request = runWithAbortSignal(controller.signal, async () => {
			if (!isCurrent()) return { status: "off" };
			const manager = readAiManager();
			const providers = manager?.getEnabledProvidersFor?.("motionDirection") || [];
			const asking = typeof manager?.generateMotionDirection === "function" && providers.length > 0;
			const params = {
				title,
				artist,
				// The lines with what the song says about them (energy, choruses, repeats, held words) and the cuts its structure suggests.
				lines: director.promptLines(model, { energy }),
				cuts: director.promptShots?.(model) || [],
				vocabulary: director.vocabulary(),
				tempo: tempo || director.tempoOf(model),
				language: songLang,
				cover,
				retake: take,
				signal: controller.signal,
			};
			const save = async (raw, verdict, judged) => {
				try {
					if (!isCurrent()) return;
					await cache?.setMotionDirection?.(trackId, sourceHash, { raw, version: director.VERSION, judged, score: verdict?.score ?? null }, isCurrent);
				} catch {
					// Not cached: the next play asks again.
				}
			};
			const watch = (raw) => {
				try {
					return typeof judge === "function" ? judge(raw) : null;
				} catch (error) {
					console.warn("[ivLyrics motion] Could not judge the direction:", error);
					return null;
				}
			};
			// The AI looks at what went wrong and directs again; the better of the two stays.
			const revise = async (raw, verdict) => {
				if (!isCurrent()) return null;
				try {
					const next = await runWithAbortSignal(controller.signal, () =>
						manager.generateMotionDirection({ ...params, revision: { direction: raw, notes: critiqueNotes(verdict), score: verdict.score } }));
					if (!isCurrent()) return null;
					const second = director.normalizeDirection(next, model, {}).coverage >= 0.5 ? watch(next) : null;
					const better = !!second && second.score > verdict.score;
					console.info("[ivLyrics motion] AI direction revised:", verdict.score, "->", second ? second.score : "unusable");
					await save(better ? next : raw, better ? second : verdict, true);
					return better && isCurrent() ? next : null;
				} catch (error) {
					if (!isCurrent()) return null;
					console.warn("[ivLyrics motion] AI revision failed:", error);
					await save(raw, verdict, true);
					return null;
				}
			};
			const needsRevision = (verdict) => asking && !!verdict && verdict.score < REVISE_BELOW && critiqueNotes(verdict).length > 0;
			if (!take) {
				try {
					const cached = await cache?.getMotionDirection?.(trackId, sourceHash, { signal: controller.signal });
					if (!isCurrent()) return { status: "off" };
					if (cached?.raw) {
						// A direction cached before it was judged (the revision never finished) is judged now.
						const verdict = cached.judged === true ? null : watch(cached.raw);
						return { status: "ready", raw: cached.raw, cached: true, revised: needsRevision(verdict) ? revise(cached.raw, verdict) : null };
					}
				} catch {
					// A cache miss only means asking the AI.
				}
			}
			if (!asking || !isCurrent()) return { status: "off" };
			const raw = await manager.generateMotionDirection(params);
			if (!isCurrent()) return { status: "off" };
			const checked = director.normalizeDirection(raw, model, {});
			if (checked.coverage < 0.5) throw new Error("The AI direction covered too few lines");
			const verdict = watch(raw);
			const revising = needsRevision(verdict);
			if (verdict) console.info("[ivLyrics motion] AI direction scored", verdict.score, revising ? "(sending it back with " + critiqueNotes(verdict).length + " notes)" : "", verdict.stats);
			await save(raw, verdict, !revising);
			if (!isCurrent()) return directionOff();
			return { status: "ready", raw, score: verdict?.score ?? null, revised: revising ? revise(raw, verdict) : null };
		}).catch(error => isCurrent()
			? { status: "failed", error: String(error?.message || error) }
			: { status: "off" });
		directionRequests.set(key, entry);
		entry.request.then(({ revised }) => {
			if (revised) revised.then(release, release);
			else release();
		});
		return observeMotionRequest(entry, signal);
	};
}
