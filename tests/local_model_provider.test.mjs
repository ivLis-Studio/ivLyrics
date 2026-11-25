import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

const addonSource = readAiProviderFixture("Addon_AI_LocalModel.js");
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
const managerSource = bundleInitializer(new URL("../src/providers/ai/AIAddonManager.js", import.meta.url));
const MODEL_BASE = "https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/";
const LIGHT_URL = MODEL_BASE + "Hy-MT2-1.8B-Q4_K_M.gguf";
const MEDIUM_URL = MODEL_BASE + "Hy-MT2-1.8B-Q6_K.gguf";
// Local High is the default quality.
const MODEL_URL = MODEL_BASE + "Hy-MT2-1.8B-Q8_0.gguf";
const BLOCK_MARKER = "retain the exact same number of delimiters";

// Source text sits after the blank line that ends either prompt template.
const sourceOf = (prompt) => prompt.slice(prompt.lastIndexOf("\n\n") + 2);

// The addon with a fake wllama module, in-memory settings and controllable timers/clock.
const createHarness = ({ cached = true, cachedUrls = null, reply, gpuFails = false, gpu = true, settings = {}, react = null } = {}) => {
	const store = new Map(Object.entries(settings));
	const prompts = [];
	const loads = [];
	const downloads = [];
	const timers = new Map();
	let timerId = 0;
	let exits = 0;
	let now = 1_000_000;
	const models = [];
	const addModel = (url) => models.push({ url, validate: () => "valid", remove: async () => { models.splice(models.findIndex((model) => model.url === url), 1); } });
	for (const url of cachedUrls || (cached ? [MODEL_URL] : [])) addModel(url);
	const modelManager = {
		getModels: async () => models.slice(),
		async downloadModel({ url }, options) {
			downloads.push(url);
			options.progressCallback({ loaded: 500, total: 1000 });
			options.progressCallback({ loaded: 1000, total: 1000 });
			addModel(url);
		},
	};
	const defaultReply = (prompt) => {
		const lines = sourceOf(prompt).split("\n");
		return lines.map((line) => "KO:" + line).join("\n");
	};
	class FakeWllama {
		constructor(paths) {
			this.paths = paths;
			this.loaded = false;
			this.modelManager = modelManager;
		}
		isModelLoaded() { return this.loaded; }
		async loadModel(model, params) {
			loads.push({ url: model.url, gpuLayers: params.n_gpu_layers });
			if (gpuFails && params.n_gpu_layers > 0) throw new Error("webgpu adapter failure");
			this.loaded = true;
		}
		getChatTemplate() { return "{{ messages }}"; }
		async createChatCompletion({ messages, onData }) {
			const prompt = messages[0].content;
			prompts.push(prompt);
			await new Promise((resolve) => setImmediate(resolve));
			onData({ choices: [{ delta: { content: (reply || defaultReply)(prompt) } }] });
			onData({ choices: [{ delta: {}, finish_reason: "stop" }] });
		}
		async exit() { this.loaded = false; exits++; }
	}
	let addon;
	const window = {
		AIAddonManager: {
			register(value) { addon = value; },
			getAddonSetting: (_id, key, fallback) => (store.has(key) ? store.get(key) : fallback),
			setAddonSetting: (_id, key, value) => store.set(key, value),
		},
		__ivLyricsLocalModelImport: async () => ({ Wllama: FakeWllama }),
	};
	class FakeDate extends Date { static now() { return now; } }
	const context = vm.createContext({
		window,
		Spicetify: { React: react },
		navigator: gpu ? { gpu: { requestAdapter: async () => ({}) } } : {},
		AbortController, console: { log() {}, warn() {}, error() {} },
		setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; },
		clearTimeout: (id) => timers.delete(id),
		Date: FakeDate,
	});
	vm.runInContext(addonSource, context);
	return {
		addon, store, prompts, loads, downloads, timers, window,
		get exits() { return exits; },
		advance(ms) { now += ms; },
		fireTimers() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
	};
};

test("lyrics are translated on the device in blocks, keeping blanks, markers, vocal parts and repeats", async () => {
	const h = createHarness();
	const lines = [];
	const text = ["君の声", "", "[Instrumental]", "夜明け / まで", "君の声"].join("\n");
	const result = await h.addon.translateLyrics({ text, lang: "ko", onLine: (index, line) => lines.push([index, line]) });
	assert.deepEqual(Array.from(result.translation), ["KO:君の声", "", "[Instrumental]", "KO:夜明け / KO:まで", "KO:君の声"]);
	assert.equal(h.prompts.length, 1, "one block covers every unique line");
	assert.match(h.prompts[0], /into Korean\./);
	assert.ok(h.prompts[0].includes(BLOCK_MARKER));
	assert.deepEqual(sourceOf(h.prompts[0]).split("\n"), ["君の声", "夜明け", "まで"]);
	assert.deepEqual(lines.map(([index]) => index).sort(), [0, 1, 2, 3, 4]);
	assert.deepEqual(lines.find(([index]) => index === 3)[1], "KO:夜明け / KO:まで");
	assert.deepEqual(h.loads, [{ url: MODEL_URL, gpuLayers: 99999 }]);
});

test("a block that loses a line is translated again line by line", async () => {
	const h = createHarness({
		reply: (prompt) => (prompt.includes(BLOCK_MARKER) ? "merged line only" : "EN:" + sourceOf(prompt)),
	});
	const result = await h.addon.translateLyrics({ text: "一行目\n二行目\n三行目", lang: "en" });
	assert.deepEqual(Array.from(result.translation), ["EN:一行目", "EN:二行目", "EN:三行目"]);
	assert.equal(h.prompts.filter((prompt) => prompt.includes(BLOCK_MARKER)).length, 1);
	assert.equal(h.prompts.filter((prompt) => !prompt.includes(BLOCK_MARKER)).length, 3);
});

test("the provider only translates: pronunciation is refused and the manager keeps it out of other features", async () => {
	const h = createHarness();
	await assert.rejects(h.addon.translateLyrics({ text: "君の声", lang: "ko", wantSmartPhonetic: true }), /Pronunciation generation is not supported/);
	assert.equal(h.prompts.length, 0);

	const storage = new Map();
	const managerWindow = {};
	vm.runInNewContext(managerSource, {
		window: managerWindow,
		Spicetify: { LocalStorage: { get: (key) => storage.get(key) ?? null, set: (key, value) => storage.set(key, value) } },
		console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
	});
	const manager = managerWindow.AIAddonManager;
	await manager._initPromise;
	assert.equal(manager.register(h.addon), true);
	assert.equal(manager.isProviderEnabled("local-ai"), false, "off until the user turns it on");
	manager.setProviderEnabled(h.addon.id, true);
	const ids = (capability) => Array.from(manager.getEnabledProvidersFor(capability), (provider) => provider.id);
	assert.deepEqual(ids("translate"), ["local-ai"]);
	assert.equal(h.addon.name, "Local AI");
	assert.equal(manager.isProviderEnabled("local-ai"), true, "enabled only by this test");
	for (const capability of ["pronunciation", "metadata", "wordSupplements", "characterPronunciation", "lyricsStudy"]) {
		assert.deepEqual(ids(capability), [], capability);
	}
});

test("the provider name and descriptions never mention the model", () => {
	const h = createHarness();
	assert.equal(h.addon.name, "Local AI");
	assert.equal(Object.keys(h.addon.description).length, 22);
	const visible = JSON.stringify([h.addon.name, h.addon.description]);
	for (const hidden of ["Hy-MT", "HY-MT", "Tencent", "wllama", "1.8B", "GGUF", "gguf"]) {
		assert.equal(visible.includes(hidden), false, hidden);
	}
});

test("without a downloaded model a request fails at once with guidance and never downloads", async () => {
	const h = createHarness({ cached: false });
	await assert.rejects(h.addon.translateLyrics({ text: "君の声", lang: "ko" }), /not ready yet/);
	assert.deepEqual(h.downloads, []);
	assert.deepEqual(h.loads, []);
	assert.equal(h.prompts.length, 0);
});

test("a target language the model does not support fails so the next provider can translate", async () => {
	const h = createHarness();
	await assert.rejects(h.addon.translateLyrics({ text: "君の声", lang: "sv" }), /cannot translate into/);
	assert.equal(h.prompts.length, 0);
	for (const lang of ["zh-TW", "zh-CN", "pt", "ja"]) {
		const result = await h.addon.translateLyrics({ text: "Hello", lang });
		assert.equal(result.translation.length, 1);
	}
	assert.match(h.prompts[0], /into Traditional Chinese\./);
	assert.match(h.prompts[1], /into Chinese\./);
});

test("lyrics on screen are translated before prefetching for upcoming songs", async () => {
	const h = createHarness();
	const background = Array.from({ length: 24 }, (_, index) => "bg" + index).join("\n");
	const prefetch = h.addon.translateLyrics({ text: background, lang: "ko" });
	await new Promise((resolve) => setImmediate(resolve));
	const onScreen = h.addon.translateLyrics({ text: "fg0\nfg1", lang: "ko", onLine() {} });
	await Promise.all([prefetch, onScreen]);
	const order = h.prompts.map((prompt) => sourceOf(prompt).split("\n")[0]);
	assert.deepEqual(order, ["bg0", "fg0", "bg8", "bg16"]);
});

test("a WebGPU load failure retries on the CPU", async () => {
	const h = createHarness({ gpuFails: true });
	const result = await h.addon.translateLyrics({ text: "君の声", lang: "ko" });
	assert.deepEqual(Array.from(result.translation), ["KO:君の声"]);
	assert.deepEqual(h.loads.map((load) => load.gpuLayers), [99999, 0]);
	assert.equal(h.exits, 1, "the failed WebGPU engine is released");

	const cpu = createHarness({ settings: { device: "cpu" } });
	await cpu.addon.translateLyrics({ text: "君の声", lang: "ko" });
	assert.deepEqual(cpu.loads.map((load) => load.gpuLayers), [0]);
});

test("the model is released after the idle time and reloaded on the next request", async () => {
	const h = createHarness({ settings: { "idle-unload-minutes": 30 } });
	await h.addon.translateLyrics({ text: "君の声", lang: "ko" });
	assert.deepEqual([...h.timers.values()].map((timer) => timer.ms), [30 * 60_000]);
	h.fireTimers();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(h.exits, 1);
	await h.addon.translateLyrics({ text: "夜明け", lang: "ko" });
	assert.equal(h.loads.length, 2);

	const never = createHarness({ settings: { "idle-unload-minutes": 0 } });
	await never.addon.translateLyrics({ text: "君の声", lang: "ko" });
	assert.equal(never.timers.size, 0);

	// Unknown or retired choices fall back to the 10-minute default.
	for (const stored of [undefined, 2, 5, 15]) {
		const fallback = createHarness({ settings: stored === undefined ? {} : { "idle-unload-minutes": stored } });
		await fallback.addon.translateLyrics({ text: "君の声", lang: "ko" });
		assert.deepEqual([...fallback.timers.values()].map((timer) => timer.ms), [10 * 60_000], String(stored));
	}
});

test("a request that runs past its time budget stops instead of holding the engine", async () => {
	const h = createHarness({
		reply: (prompt) => {
			h.advance(60_000);
			return sourceOf(prompt).split("\n").map((line) => "KO:" + line).join("\n");
		},
	});
	const text = Array.from({ length: 24 }, (_, index) => "line" + index).join("\n");
	await assert.rejects(h.addon.translateLyrics({ text, lang: "ko" }), (error) => error.name === "TimeoutError");
	assert.equal(h.prompts.length, 2, "no block starts after the budget");
});

// Minimal hook runtime: enough to render the settings card and press its buttons.
const createReact = () => {
	const slots = [];
	let cursor = 0;
	return {
		reset() { cursor = 0; },
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
				slots[index] = { deps };
				effect();
			}
		},
	};
};

test("the settings card downloads the model with progress and asks twice before deleting it", async () => {
	const React = createReact();
	const h = createHarness({ cached: false, react: React });
	const Settings = h.addon.getSettingsUI();
	const settle = () => new Promise((resolve) => setImmediate(resolve));
	const render = () => { React.reset(); return Settings(); };
	const nodes = (tree) => (tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(nodes)] : []);
	const texts = (tree) => nodes(tree).flatMap((node) => node.children.filter((child) => typeof child === "string"));
	const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && node.children.includes(label));

	render();
	await settle();
	let tree = render();
	assert.ok(texts(tree).some((value) => value.startsWith("Not downloaded yet")));
	assert.equal(button(tree, "Test translation"), undefined);
	button(tree, "Download model (1.91GB)").props.onClick();
	await settle();
	await settle();
	assert.deepEqual(h.downloads, [MODEL_URL]);
	tree = render();
	assert.ok(texts(tree).includes("Downloaded · Loads into memory when it translates"));
	assert.ok(button(tree, "Test translation"));

	button(tree, "Delete model").props.onClick();
	tree = render();
	assert.ok(button(tree, "Click again to delete"), "the first press only asks for confirmation");
	button(tree, "Click again to delete").props.onClick();
	await settle();
	await settle();
	tree = render();
	assert.ok(texts(tree).some((value) => value.startsWith("Not downloaded yet")));
});

test("quality is dragged between Local Light, Medium and High, starts at High and never shows model names", async () => {
	const React = createReact();
	const h = createHarness({ cachedUrls: [LIGHT_URL], react: React });
	const Settings = h.addon.getSettingsUI();
	const settle = () => new Promise((resolve) => setImmediate(resolve));
	const render = () => { React.reset(); return Settings(); };
	const nodes = (tree) => (tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(nodes)] : []);
	const texts = (tree) => nodes(tree).flatMap((node) => node.children.filter((child) => typeof child === "string"));

	render();
	await settle();
	let tree = render();
	const slider = () => nodes(tree).find((node) => node.type === "input" && node.props.type === "range");
	assert.equal(slider().props.value, 2);
	assert.equal(slider().props["aria-valuetext"], "Local High");
	assert.ok(texts(tree).some((value) => value.startsWith("Not downloaded yet")), "Local High is not downloaded yet");
	assert.deepEqual(nodes(tree).filter((node) => node.props["data-tier"]).map((node) => node.props["data-tier"]), ["light", "medium", "high"]);
	assert.deepEqual(texts(tree).filter((value) => /^Local /.test(value)), ["Local Light", "Local Medium", "Local High"]);
	assert.ok(texts(tree).includes("1.13GB · Downloaded"));
	assert.ok(texts(tree).includes("1.91GB"));
	const visible = JSON.stringify(texts(tree));
	for (const hidden of ["Hy-MT2", "Q4_K_M", "Q6_K", "Q8_0", "GGUF", "gguf", "Tencent"]) {
		assert.equal(visible.includes(hidden), false, hidden);
	}

	slider().props.onChange({ target: { value: "0" } });
	assert.equal(h.store.get("quality"), "light");
	render();
	await settle();
	await settle();
	tree = render();
	assert.equal(slider().props.value, 0);
	assert.ok(texts(tree).includes("Downloaded · Loads into memory when it translates"));
	await h.addon.translateLyrics({ text: "君の声", lang: "ko" });
	assert.deepEqual(h.loads.map((load) => load.url), [LIGHT_URL]);

	nodes(tree).find((node) => node.props["data-tier"] === "medium").props.onClick();
	assert.equal(h.store.get("quality"), "medium");
	tree = render();
	await settle();
	tree = render();
	assert.ok(nodes(tree).some((node) => node.type === "button" && node.children.includes("Download model (1.47GB)")));
	await h.addon.translateLyrics({ text: "夜明け", lang: "ko" }).catch((error) => assert.match(error.message, /not ready yet/));
	assert.equal(h.loads.some((load) => load.url === MEDIUM_URL), false, "an undownloaded tier is never loaded");

	const options = nodes(tree).filter((node) => node.type === "option").map((node) => node.children.join(""));
	assert.deepEqual(options.slice(-4), ["After 10 min", "After 30 min", "After 1 hr", "Never"]);
});
