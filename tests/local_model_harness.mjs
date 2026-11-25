import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
// Shared fakes for the Local AI provider tests. They follow wllama 3.8.1: the
// cache writes a download's file first and its metadata only after the last
// byte, getModels() skips files without metadata, and a chat completion stops
// with an AbortError when its abortSignal fires.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";

const addonSource = readAiProviderFixture("Addon_AI_LocalModel.js");

export const MODEL_BASE = "https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/";
export const TIERS = {
	light: { url: MODEL_BASE + "Hy-MT2-1.8B-Q4_K_M.gguf", size: 1133080448 },
	medium: { url: MODEL_BASE + "Hy-MT2-1.8B-Q6_K.gguf", size: 1474785120 },
	high: { url: MODEL_BASE + "Hy-MT2-1.8B-Q8_0.gguf", size: 1908528192 },
};
export const ENGINE_URL = "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js";

// Source text sits after the blank line that ends either prompt template.
export const sourceOf = (prompt) => prompt.slice(prompt.lastIndexOf("\n\n") + 2);
export const firstLineOf = (prompt) => sourceOf(prompt).split("\n")[0];
export const song = (name, lines = 24) => Array.from({ length: lines }, (_, index) => name + index).join("\n");
export const settle = async (rounds = 3) => {
	for (let round = 0; round < rounds; round++) await new Promise((resolve) => setImmediate(resolve));
};
export const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
	return { promise, resolve, reject };
};

// wllama keeps a download as <sha1 of its URL>_<file name>.
export const cacheNameOf = (url) => createHash("sha1").update(url).digest("hex") + "_" + url.split("/").pop();
const sizeOf = (url) => Object.values(TIERS).find((tier) => tier.url === url)?.size ?? 1000;

// Text a person can read must never name the model, its files or where they come from.
const INTERNALS = ["://", "huggingface", "jsdelivr", "wllama", "hy-mt", "tencent", "gguf", "q4_k_m", "q6_k", "q8_0", ".wasm", "resolve/main"];
export const assertNoInternals = (value, label = "visible text") => {
	const text = String(value);
	assert.deepEqual(INTERNALS.filter((needle) => text.toLowerCase().includes(needle)), [], label + " leaks internals: " + text);
	assert.doesNotMatch(text, /[0-9a-f]{40}/, label + " leaks a cache file name: " + text);
};

class FakeCache {
	constructor() {
		this.files = new Map();
	}
	put(url, size, complete = true) {
		this.files.set(cacheNameOf(url), { size, metadata: complete ? { originalURL: url, originalSize: size, etag: "" } : null });
	}
	has(url) {
		return this.files.has(cacheNameOf(url));
	}
	async list() {
		return [...this.files].map(([name, file]) => ({
			name, size: file.size, metadata: file.metadata || { originalSize: file.size, originalURL: "", etag: "" },
		}));
	}
	async getNameFromURL(url) {
		return cacheNameOf(url);
	}
	async delete(nameOrURL) {
		const alias = cacheNameOf(nameOrURL);
		await this.deleteMany((entry) => entry.name === nameOrURL || entry.name === alias);
	}
	async deleteMany(predicate) {
		for (const entry of await this.list()) if (predicate(entry)) this.files.delete(entry.name);
	}
}

class FakeModelManager {
	constructor(cache, download) {
		this.cacheManager = cache;
		this.download = download;
	}
	async getModels({ includeInvalid = false } = {}) {
		const models = [];
		for (const entry of await this.cacheManager.list()) {
			const url = entry.metadata.originalURL;
			if (!url) continue;
			const model = {
				url,
				size: entry.metadata.originalSize,
				validate: () => (entry.metadata.originalSize === entry.size ? "valid" : "invalid"),
				remove: () => this.cacheManager.delete(url),
			};
			if (includeInvalid || model.validate() === "valid") models.push(model);
		}
		return models;
	}
	downloadModel(source, options) {
		return this.download(source, options, this.cacheManager);
	}
}

export const instantDownload = async ({ url }, options, cache) => {
	const size = sizeOf(url);
	options.progressCallback?.({ loaded: size, total: size });
	cache.put(url, size);
};

// A download the test drives: like wllama it has written part of the file when
// the test finishes it, fails it, or the person cancels it.
export const controlledDownload = () => {
	const calls = [];
	const download = ({ url }, options, cache) => new Promise((resolve, reject) => {
		const size = sizeOf(url);
		const call = {
			url,
			signal: options.signal,
			progress(fraction) {
				const loaded = Math.floor(size * fraction);
				cache.put(url, loaded, false);
				options.progressCallback?.({ loaded, total: size });
			},
			finish() {
				cache.put(url, size);
				options.progressCallback?.({ loaded: size, total: size });
				resolve();
			},
			fail: reject,
		};
		options.signal?.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")), { once: true });
		calls.push(call);
		call.progress(0.105);
	});
	return { calls, download };
};

// A download that has written part of the file when it fails.
export const failingDownload = (makeError, written = 0.4) => async ({ url }, options, cache) => {
	cache.put(url, Math.floor(sizeOf(url) * written), false);
	options.progressCallback?.({ loaded: Math.floor(sizeOf(url) * written), total: sizeOf(url) });
	throw makeError(url);
};

// Minimal hook runtime: enough to render the settings card and press its buttons.
const createReact = () => {
	const slots = [];
	let cursor = 0;
	return {
		reset() { cursor = 0; },
		unmount() { for (const slot of slots) slot?.cleanup?.(); slots.length = 0; },
		createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== false && child != null) }),
		useState(initial) {
			const index = cursor++;
			if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
			return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
		},
		useEffect(effect, deps) {
			const index = cursor++;
			const previous = slots[index];
			if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
				previous?.cleanup?.();
				slots[index] = { deps, cleanup: effect() };
			}
		},
	};
};

const nodes = (tree) => (tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(nodes)] : []);
export const texts = (tree) => nodes(tree).flatMap((node) => node.children.filter((child) => typeof child === "string"));
export const button = (tree, prefix) => nodes(tree).find((node) => node.type === "button"
	&& node.children.some((child) => typeof child === "string" && child.startsWith(prefix)));

/**
 * The provider with fake wllama, settings, player and clock.
 * cached: finished qualities; partial: { quality: fraction } left by interrupted downloads.
 * hold: completions wait for releaseAll() so a test can act while a block runs.
 * playing: the translation cache id of the song Spotify is playing.
 */
export function createHarness({
	cached = ["high"], partial = {}, settings = {}, gpu = true, load = null, reply = null, inference = null, hold = false,
	importGate = null, importModule = null, download = instantDownload, playing = null, config = null, uiLanguage = null,
	completion = null, exit = null,
} = {}) {
	const store = new Map(Object.entries(settings));
	const cache = new FakeCache();
	for (const tier of cached) cache.put(TIERS[tier].url, TIERS[tier].size);
	for (const [tier, fraction] of Object.entries(partial)) cache.put(TIERS[tier].url, Math.floor(TIERS[tier].size * fraction), false);
	const modelManager = new FakeModelManager(cache, download);
	const calls = [];
	const loads = [];
	const running = [];
	const debug = [];
	const timers = new Map();
	let holding = hold;
	let exits = 0;
	let now = 1_000_000;
	let timerId = 0;
	const defaultReply = (prompt) => sourceOf(prompt).split("\n").map((line) => "KO:" + line).join("\n");

	class FakeWllama {
		constructor() {
			this.loaded = false;
			this.modelManager = modelManager;
			this.cacheManager = cache;
		}
		isModelLoaded() { return this.loaded; }
		async loadModel(model, params) {
			loads.push({ url: model.url, gpuLayers: params.n_gpu_layers });
			if (load) await load(model, params);
			this.loaded = true;
		}
		getChatTemplate() { return "{{ messages }}"; }
		async createChatCompletion(options) {
			const { messages, onData, abortSignal } = options;
			const call = { prompt: messages[0].content, signal: abortSignal };
			calls.push(call);
			await new Promise((resolve, reject) => {
				const entry = { call };
				const leave = () => { const index = running.indexOf(entry); if (index >= 0) running.splice(index, 1); };
				entry.release = () => { leave(); resolve(); };
				abortSignal?.addEventListener("abort", () => { leave(); reject(new DOMException("Operation aborted", "AbortError")); }, { once: true });
				if (holding) running.push(entry);
				else setImmediate(entry.release);
			});
			if (inference) await inference(call);
			if (completion) return completion({ ...call, onData, options });
			onData({ choices: [{ delta: { content: (reply || defaultReply)(call.prompt) } }] });
			onData({ choices: [{ delta: {}, finish_reason: "stop" }] });
		}
		async exit() { this.loaded = false; exits++; await exit?.(); }
	}

	const React = createReact();
	const player = { data: null };
	const play = (trackId) => { player.data = trackId ? { item: { uri: "spotify:track:" + trackId } } : null; };
	play(playing);
	let addon;
	const window = {
		AIAddonManager: {
			register(value) { addon = value; },
			getAddonSetting: (_id, key, fallback) => (store.has(key) ? store.get(key) : fallback),
			setAddonSetting: (_id, key, value) => store.set(key, value),
		},
		__ivLyricsLocalModelImport: importModule || (async () => {
			if (importGate) await importGate;
			return { Wllama: FakeWllama };
		}),
		__ivLyricsDebugLog: (...values) => debug.push(values.map((value) => String(value?.message ?? value)).join(" ")),
		ivLyricsTrackIdentity: { getTranslationCacheId: (uri) => String(uri).split(":").pop() },
	};
	if (config) window.CONFIG = { visual: config };
	if (uiLanguage) window.I18n = { getCurrentLanguage: () => uiLanguage, t: () => "" };
	class FakeDate extends Date { static now() { return now; } }
	vm.runInContext(addonSource, vm.createContext({
		window,
		Spicetify: { React, Player: player },
		navigator: gpu ? { gpu: { requestAdapter: async () => ({}) } } : {},
		AbortController,
		console: { log() {}, warn() {}, error() {} },
		setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; },
		clearTimeout: (id) => timers.delete(id),
		Date: FakeDate,
	}));
	let Settings = null;
	return {
		addon, store, cache, calls, loads, running, debug, timers, window, play,
		unmount() { React.unmount(); },
		get prompts() { return calls.map((call) => call.prompt); },
		get exits() { return exits; },
		advance(ms) { now += ms; },
		releaseAll() {
			holding = false;
			for (const entry of running.slice()) entry.release();
		},
		async until(predicate, what = "the expected state") {
			for (let round = 0; round < 50 && !predicate(); round++) await settle(1);
			assert.ok(predicate(), what + " was never reached");
		},
		render() {
			Settings ||= addon.getSettingsUI();
			React.reset();
			return Settings();
		},
	};
}
