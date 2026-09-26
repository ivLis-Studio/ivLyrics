import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const addonSource = readFileSync(new URL("../Addon_AI_ChatGPT.js", import.meta.url), "utf8");

const PREFIX = "ivLyrics:ai:";

// Full manager + ChatGPT addon in one VM context. Legacy per-provider
// capability keys are pre-seeded the way setCapabilityEnabled() stores them.
const loadHarness = ({ legacyMetadataCapability } = {}) => {
	const storage = new Map();
	storage.set(`${PREFIX}addon:chatgpt:api-keys`, JSON.stringify(["sk-test"]));
	storage.set(`${PREFIX}addon:chatgpt:model`, "gpt-4o-mini");
	if (legacyMetadataCapability !== undefined) {
		storage.set(`${PREFIX}addon:chatgpt:capability:metadata`, String(legacyMetadataCapability));
	}
	const fetchCalls = [];
	const window = {
		ivLyricsFetch: async (url, options) => {
			fetchCalls.push({ url, options });
			return {
				status: 200,
				ok: true,
				json: async () => ({
					choices: [{
						message: {
							content: JSON.stringify({
								translatedTitle: "T",
								translatedArtist: "A",
							}),
						},
						finish_reason: "stop",
					}],
				}),
			};
		},
	};
	const context = vm.createContext({
		window,
		Spicetify: {
			LocalStorage: {
				get: (key) => storage.get(key) ?? null,
				set: (key, value) => { storage.set(key, value); },
			},
		},
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	vm.runInContext(managerSource, context);
	vm.runInContext(addonSource, context);
	return { window, storage, fetchCalls };
};

const ready = async (options) => {
	const harness = loadHarness(options);
	const manager = harness.window.AIAddonManager;
	await manager._initPromise;
	await manager.setProviderEnabled("chatgpt", true);
	await manager.setProviderOrder(["chatgpt"]);
	return { ...harness, manager };
};

const metadataParams = { title: "Song", artist: "Artist", lang: "en" };

test("legacy disabled metadata capability seeds primary-capabilities and blocks the AI fetch", async () => {
	const { manager, storage, fetchCalls } = await ready({ legacyMetadataCapability: false });

	// The manager bypass keeps chatgpt in the metadata provider list...
	const providers = Array.from(manager.getEnabledProvidersFor("metadata"), (provider) => String(provider.id));
	assert.deepEqual(providers, ["chatgpt"]);

	// ...but the seeded endpoint capabilities must refuse the request
	// before any network call (reviewer's repro).
	await assert.rejects(
		() => manager.translateMetadata(metadataParams),
		/capability enabled|All AI providers failed/
	);
	assert.equal(fetchCalls.length, 0);

	const seeded = JSON.parse(storage.get(`${PREFIX}addon:chatgpt:primary-capabilities`));
	assert.equal(seeded.metadata, false);
	// A capability without a legacy key defaults to enabled (wordSupplements
	// is new and must stay on).
	assert.equal(seeded.wordSupplements, true);
});

test("missing legacy keys seed every capability enabled and the request goes through", async () => {
	const { manager, storage, fetchCalls } = await ready();

	const result = await manager.translateMetadata(metadataParams);
	assert.equal(fetchCalls.length, 1);
	assert.equal(result.translated.title, "T");

	const seeded = JSON.parse(storage.get(`${PREFIX}addon:chatgpt:primary-capabilities`));
	assert.equal(seeded.metadata, true);
	assert.equal(seeded.translate, true);
	assert.equal(seeded.wordSupplements, true);
});
