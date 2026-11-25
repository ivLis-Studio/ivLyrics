import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import { getOrderedAddonCapabilities } from "#ivlyrics/features/settings/settingsProviderCapabilities.mjs";
import { isEndpointCapabilityEnabled, toggleEndpointCapability } from "#ivlyrics/providers/ai/openAiConnections.mjs";
import { getFirstLanguageAIProviderHintKey, getFirstLanguageAIProviderHintState } from "../src/app/modal/firstLanguageProviderHints.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
const managerSource = bundleInitializer(new URL("../src/providers/ai/AIAddonManager.js", import.meta.url));
const chatgptSource = readAiProviderFixture("Addon_AI_ChatGPT.js");
const PREFIX = "ivLyrics:ai:";

const section = (source, start, end) => {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from);
	assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
	return source.slice(from, to);
};

// The complete manager with invented addons and in-memory storage.
const loadManager = async ({ stored = {}, i18n = null } = {}) => {
	const storage = new Map(Object.entries(stored));
	const window = { ...(i18n ? { I18n: { t: i18n } } : {}) };
	vm.runInNewContext(managerSource, {
		window,
		AbortController,
		Spicetify: { LocalStorage: { get: (key) => storage.get(key) ?? null, set: (key, value) => storage.set(key, value) } },
		console: { log() {}, warn() {}, error() {} },
		setTimeout, clearTimeout,
	});
	const manager = window.AIAddonManager;
	await manager._initPromise;
	return { manager, storage };
};

const fixture = (id, supports, calls) => ({
	id, name: id, author: "fixture", version: "1.0", description: "fixture", supports,
	getSettingsUI() {},
	async translateLyrics(params) {
		calls.push([id, params.wantSmartPhonetic ? "pronunciation" : "translate"]);
		return params.wantSmartPhonetic ? { phonetic: ["heh-loh"] } : { translation: ["hi"] };
	},
});

const registerFixtures = (manager, calls) => {
	const addons = [
		fixture("keyless-translate", { translate: true, pronunciation: false, metadata: true }, calls),
		fixture("ai-model", { translate: true, pronunciation: true, metadata: true }, calls),
		fixture("legacy-ai", { translate: true, metadata: true }, calls),
	];
	for (const addon of addons) {
		assert.equal(manager.register(addon), true);
		manager.setProviderEnabled(addon.id, true);
	}
	manager.setProviderOrder(addons.map((addon) => addon.id));
	return addons;
};

const ids = (providers) => Array.from(providers, (provider) => provider.id);
const request = { trackId: "track", artist: "Artist", title: "Song", text: "hello", lang: "en", sourceLang: "en" };

test("pronunciation and translation route to their own enabled providers", async () => {
	const { manager } = await loadManager();
	const calls = [];
	registerFixtures(manager, calls);

	assert.deepEqual(ids(manager.getEnabledProvidersFor("translate")), ["keyless-translate", "ai-model", "legacy-ai"]);
	assert.deepEqual(ids(manager.getEnabledProvidersFor("pronunciation")), ["ai-model", "legacy-ai"]);

	const pronunciation = await manager.translateLyrics({ ...request, wantSmartPhonetic: true });
	assert.deepEqual(Array.from(pronunciation.phonetic), ["heh-loh"]);
	const translation = await manager.translateLyrics({ ...request, wantSmartPhonetic: false });
	assert.deepEqual(Array.from(translation.translation), ["hi"]);
	assert.deepEqual(calls, [["ai-model", "pronunciation"], ["keyless-translate", "translate"]]);

	// Turning pronunciation off for one provider leaves its translation untouched.
	manager.setCapabilityEnabled("ai-model", "pronunciation", false);
	assert.deepEqual(ids(manager.getEnabledProvidersFor("pronunciation")), ["legacy-ai"]);
	assert.deepEqual(ids(manager.getEnabledProvidersFor("translate")), ["keyless-translate", "ai-model", "legacy-ai"]);
});

test("addons written before the split keep pronunciation only when they can translate", async () => {
	const { manager } = await loadManager();
	const calls = [];
	const [keyless, current, legacy] = registerFixtures(manager, calls);
	assert.equal(keyless.supports.pronunciation, false);
	assert.equal(current.supports.pronunciation, true);
	assert.equal(legacy.supports.pronunciation, true);

	const metadataOnly = {
		id: "metadata-only", name: "m", author: "fixture", version: "1.0", description: "fixture",
		supports: { metadata: true }, getSettingsUI() {}, async translateMetadata() { return {}; },
	};
	assert.equal(manager.register(metadataOnly), true);
	assert.equal(metadataOnly.supports.pronunciation, undefined);
});

test("a saved translate opt-out still covers pronunciation until each is set on its own", async () => {
	const { manager, storage } = await loadManager({
		stored: { [`${PREFIX}addon:ai-model:capability:translate`]: "false" },
	});
	registerFixtures(manager, []);
	assert.equal(manager.isCapabilityEnabled("ai-model", "translate"), false);
	assert.equal(manager.isCapabilityEnabled("ai-model", "pronunciation"), false);
	assert.deepEqual(ids(manager.getEnabledProvidersFor("pronunciation")), ["legacy-ai"]);

	// Re-enabling translation must not silently re-enable pronunciation.
	manager.setCapabilityEnabled("ai-model", "translate", true);
	assert.equal(storage.get(`${PREFIX}addon:ai-model:capability:pronunciation`), "false");
	assert.equal(manager.isCapabilityEnabled("ai-model", "translate"), true);
	assert.equal(manager.isCapabilityEnabled("ai-model", "pronunciation"), false);

	manager.setCapabilityEnabled("ai-model", "pronunciation", true);
	assert.equal(manager.isCapabilityEnabled("ai-model", "pronunciation"), true);

	// Without a saved choice both start on, and turning translation off keeps pronunciation.
	manager.setCapabilityEnabled("legacy-ai", "translate", false);
	assert.equal(manager.isCapabilityEnabled("legacy-ai", "translate"), false);
	assert.equal(manager.isCapabilityEnabled("legacy-ai", "pronunciation"), true);
});

test("a pronunciation request with only translation services explains what to turn on", async () => {
	const { manager } = await loadManager();
	const calls = [];
	registerFixtures(manager, calls);
	manager.setProviderEnabled("ai-model", false);
	manager.setProviderEnabled("legacy-ai", false);
	await assert.rejects(manager.translateLyrics({ ...request, wantSmartPhonetic: true }), /can generate pronunciation/);
	assert.deepEqual(calls, []);

	// Provider messages resolve from settings.aiProviders in the language files.
	const localized = await loadManager({
		i18n: (key) => ({
			"settings.aiProviders.noPronunciationProviders": "발음 제공자 없음",
			"settings.aiProviders.noEnabledProviders": "제공자 없음",
		})[key] || "",
	});
	await assert.rejects(localized.manager.translateLyrics({ ...request, wantSmartPhonetic: true }), /^Error: 발음 제공자 없음$/);
	await assert.rejects(localized.manager.translateLyrics({ ...request, wantSmartPhonetic: false }), /^Error: 제공자 없음$/);
});

// OpenAI-compatible endpoints gate capabilities per connection.
const chatgptHarness = (settingsValues) => {
	const settings = new Map(Object.entries({
		"api-keys": "primary-key", "base-url": "https://primary.test/v1", model: "primary-model",
		"fallback-providers": [], "extra-endpoints": [], ...settingsValues,
	}));
	const requests = [];
	let addon;
	const window = {
		AIAddonManager: {
			register(value) { addon = value; },
			getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
			setAddonSetting: (_id, key, value) => settings.set(key, value),
			isCapabilityEnabled: () => true,
			getProviderRequestAttempts: () => 1,
		},
		async ivLyricsFetch(url, options) {
			requests.push(url);
			return new Response(JSON.stringify({ choices: [{ message: { content: "line" }, finish_reason: "stop" }] }));
		},
	};
	vm.runInNewContext(chatgptSource.replace("    registerAddon();",
		"    window.hooks = { getRequestTargets };\n    registerAddon();"),
	{ window, URL, URLSearchParams, TextDecoder, setTimeout, clearTimeout, console });
	return { addon, hooks: { ...window.hooks, toggleEndpointCapability, isEndpointCapabilityEnabled }, requests, settings };
};

const connection = (id, capabilities) => ({
	id, name: id, baseUrl: `https://${id}.test/v1`, apiKeys: `${id}-key`, model: `${id}-model`, enabled: true, capabilities,
});
const labels = (targets) => Array.from(targets, (target) => target.label);

test("OpenAI-compatible endpoints keep a saved translate opt-out for pronunciation and route each request by its chip", async () => {
	const h = chatgptHarness({
		"primary-capabilities": { translate: false },
		"fallback-providers": [connection("speaker", { translate: false, pronunciation: true }), connection("writer", { pronunciation: false })],
	});
	assert.equal(h.addon.supports.pronunciation, true);
	assert.deepEqual(labels(h.hooks.getRequestTargets("pronunciation")), ["speaker"]);
	assert.deepEqual(labels(h.hooks.getRequestTargets("translate")), ["writer"]);

	await h.addon.translateLyrics({ text: "hello", wantSmartPhonetic: true, phoneticPrompt: "fixture" });
	await h.addon.translateLyrics({ text: "hello", wantSmartPhonetic: false, translationPrompt: "fixture" });
	assert.deepEqual(h.requests, ["https://speaker.test/v1/chat/completions", "https://writer.test/v1/chat/completions"]);
});

test("toggling an endpoint's translation pins the pronunciation it inherited", () => {
	const { hooks } = chatgptHarness({});
	const offBoth = hooks.toggleEndpointCapability({}, "translate");
	assert.deepEqual({ ...offBoth }, { pronunciation: true, translate: false });
	const legacyOff = hooks.toggleEndpointCapability({ translate: false }, "translate");
	assert.deepEqual({ ...legacyOff }, { translate: true, pronunciation: false });
	const explicit = hooks.toggleEndpointCapability({ translate: true, pronunciation: false }, "pronunciation");
	assert.deepEqual({ ...explicit }, { translate: true, pronunciation: true });
	assert.equal(hooks.isEndpointCapabilityEnabled({ translate: false }, "pronunciation"), false);
	assert.equal(hooks.isEndpointCapabilityEnabled({ translate: false, pronunciation: true }, "pronunciation"), true);
	assert.equal(hooks.isEndpointCapabilityEnabled(undefined, "pronunciation"), true);
});

test("provider cards list pronunciation before translation and omit it for translation-only services", () => {
	assert.deepEqual(Array.from(getOrderedAddonCapabilities({
		translate: true, pronunciation: true, metadata: true, tmi: true, researchWebSearch: true,
		lyricsStudy: true, characterPronunciation: true, culturalAnnotations: true, wordSupplements: true, customFeature: true,
	})), [
		"pronunciation", "translate", "metadata", "tmi", "researchWebSearch",
		"lyricsStudy", "characterPronunciation", "culturalAnnotations", "wordSupplements", "customFeature",
	]);
	assert.deepEqual(Array.from(getOrderedAddonCapabilities({
		translate: true, pronunciation: false, metadata: true, tmi: false, wordSupplements: true,
	})), ["translate", "metadata", "wordSupplements"]);
	assert.match(readFileSync(new URL("../src/features/settings/settingsProviderCapabilities.mjs", import.meta.url), "utf8"), /settings\.aiProviders\.supports\.pronunciation/);
});

test("the first-language hint checks translation and pronunciation separately", () => {
	const hintFor = (providers) => {
		const state = getFirstLanguageAIProviderHintState({
			getEnabledProviders: () => providers,
			getEnabledProvidersFor: capability => providers.filter(provider => provider.on.includes(capability)),
		});
		return [getFirstLanguageAIProviderHintKey(state, false), getFirstLanguageAIProviderHintKey(state, true)];
	};
	const bing = { id: "bing-translate", supports: { translate: true, pronunciation: false }, on: ["translate"] };
	const google = { id: "google-translate", supports: { translate: true, pronunciation: false }, on: ["translate"] };
	const gemini = (on) => ({ id: "gemini", supports: { translate: true, pronunciation: true }, on });

	// Default install: Bing and Google only.
	assert.deepEqual(hintFor([bing, google]), ["firstLanguagePrompt.aiProviderHint", "firstLanguagePrompt.pronunciationAiProviderHint"]);
	// An AI provider that can pronounce but has the chip turned off.
	assert.deepEqual(hintFor([bing, gemini(["translate"])]), [null, "settings.aiProviders.noPronunciationProviders"]);
	// Pronunciation is covered, while translation is still keyless-only.
	assert.deepEqual(hintFor([google, gemini(["pronunciation"])]), ["firstLanguagePrompt.aiProviderHint", "firstLanguagePrompt.aiProviderHint"]);
	// Everything covered by an AI provider.
	assert.deepEqual(hintFor([bing, gemini(["translate", "pronunciation"])]), [null, null]);
});
