import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const addonSource = readFileSync(new URL("../Addon_AI_ChatGPT.js", import.meta.url), "utf8");

const PREFIX = "ivLyrics:ai:";

// Full manager + ChatGPT addon in one VM context. The provider-level
// capability flags (addon:chatgpt:capability:*) act as the master switch;
// the addon's primary-capabilities store holds the endpoint-own flags.
const loadHarness = () => {
	const storage = new Map();
	storage.set(`${PREFIX}addon:chatgpt:api-keys`, JSON.stringify(["sk-test"]));
	storage.set(`${PREFIX}addon:chatgpt:model`, "gpt-4o-mini");
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
	vm.runInContext(addonSource.replace(
		"    registerAddon();",
		"    window.hooks = { getRequestTargets, getPrimaryCapabilities };\n    registerAddon();"
	), context);
	return { window, storage, fetchCalls };
};

const ready = async () => {
	const harness = loadHarness();
	const manager = harness.window.AIAddonManager;
	await manager._initPromise;
	await manager.setProviderEnabled("chatgpt", true);
	await manager.setProviderOrder(["chatgpt"]);
	return { ...harness, manager, hooks: harness.window.hooks };
};

const setEndpointCaps = (storage, capabilities) =>
	storage.set(`${PREFIX}addon:chatgpt:primary-capabilities`, JSON.stringify(capabilities));

test("the provider-level master switch filters a per-endpoint provider", async () => {
	const { manager, hooks } = await ready();

	// Master on by default: the per-endpoint provider serves metadata.
	assert.deepEqual(Array.from(manager.getEnabledProvidersFor("metadata"), provider => provider.id), ["chatgpt"]);
	assert.equal(hooks.getRequestTargets("metadata").length, 1);

	// Master off: the provider is no longer selected and no endpoint is offered.
	await manager.setCapabilityEnabled("chatgpt", "metadata", false);
	assert.deepEqual(Array.from(manager.getEnabledProvidersFor("metadata"), provider => provider.id), []);
	assert.equal(hooks.getRequestTargets("metadata").length, 0);

	// Other capabilities stay served.
	assert.equal(hooks.getRequestTargets("translate").length, 1);
});

test("effective capability is master AND endpoint-own", async () => {
	const { manager, hooks, storage } = await ready();

	// Endpoint off + master on -> blocked.
	setEndpointCaps(storage, { metadata: false });
	assert.equal(hooks.getRequestTargets("metadata").length, 0);
	assert.equal(hooks.getRequestTargets("translate").length, 1);

	// Endpoint on + master off -> blocked.
	setEndpointCaps(storage, { metadata: true });
	await manager.setCapabilityEnabled("chatgpt", "metadata", false);
	assert.equal(hooks.getRequestTargets("metadata").length, 0);

	// Both on -> served.
	await manager.setCapabilityEnabled("chatgpt", "metadata", true);
	assert.equal(hooks.getRequestTargets("metadata").length, 1);
});

test("master toggles persist while the endpoint-own flag stays preserved", async () => {
	const { manager, hooks, storage } = await ready();
	const capsKey = `${PREFIX}addon:chatgpt:primary-capabilities`;

	setEndpointCaps(storage, { metadata: true, translate: true });

	await manager.setCapabilityEnabled("chatgpt", "metadata", false);
	// Master flag is saved, endpoint-own flags are untouched (blocked but saved).
	assert.equal(manager.isCapabilityEnabled("chatgpt", "metadata"), false);
	assert.deepEqual(JSON.parse(storage.get(capsKey)), { metadata: true, translate: true });

	// Turning the master back on restores service without rewriting endpoint flags.
	await manager.setCapabilityEnabled("chatgpt", "metadata", true);
	assert.equal(hooks.getRequestTargets("metadata").length, 1);
	assert.deepEqual(JSON.parse(storage.get(capsKey)), { metadata: true, translate: true });
});

test("endpoint pronunciation still inherits translate inside the effective check", async () => {
	const { manager, hooks, storage } = await ready();

	setEndpointCaps(storage, { translate: false });
	assert.equal(hooks.getRequestTargets("pronunciation").length, 0);
	assert.equal(manager.isCapabilityEnabled("chatgpt", "pronunciation"), true);
	assert.equal(hooks.getRequestTargets("metadata").length, 1);
});

// Render harness mirroring tests/openai_primary_presentation.test.mjs: the
// detail UI chips must show the blocked-but-saved state while staying clickable.
function uiHarness(masterOff = new Set()) {
	const settings = new Map(Object.entries({
		"api-keys": "primary-key", "base-url": "https://primary.test/v1", model: "primary-model",
		"primary-capabilities": { metadata: true }, "fallback-providers": [], "extra-endpoints": [],
	}));
	const states = new WeakMap();
	let current, cursor = 0, addon;
	const React = {
		createElement: (type, props, ...children) => ({
			type, props: props || {}, children: children.flat(Infinity).filter(child => child !== false && child != null),
		}),
		useState(initial) {
			const index = cursor++;
			if (!(index in current)) current[index] = typeof initial === "function" ? initial() : initial;
			const state = current;
			return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
		},
		useCallback: callback => callback,
		useEffect() {},
	};
	const window = {
		I18n: { t: (key, fallback) => fallback },
		AIAddonManager: {
			register(value) { addon = value; },
			getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
			setAddonSetting(_id, key, value) { settings.set(key, value); },
			isCapabilityEnabled: (_id, capability) => !masterOff.has(capability),
			getProviderRequestAttempts: () => 1,
		},
	};
	vm.runInNewContext(addonSource, { window, Spicetify: { React }, console, setTimeout, clearTimeout, TextDecoder });
	const render = (Component, props = {}) => {
		if (!states.has(Component)) states.set(Component, []);
		current = states.get(Component);
		cursor = 0;
		return Component(props);
	};
	return { addon, settings, render };
}

function findNodes(node, predicate) {
	if (!node || typeof node !== "object") return [];
	return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findNodes(child, predicate))];
}

test("detail chips render blocked-but-saved as struck through yet stay clickable", () => {
	const h = uiHarness(new Set(["metadata"]));
	const root = h.render(h.addon.getSettingsUI());
	const controls = findNodes(root, node => node.type?.name === "CapabilityControls")[0];
	const chips = findNodes(h.render(controls.type, controls.props), node => node.type === "button");

	const metadata = chips.find(chip => chip.children[0] === "Metadata");
	assert.ok(metadata.props.className.includes("is-blocked"));
	assert.equal(metadata.props.title, "Blocked by provider master");
	assert.equal(metadata.props["aria-pressed"], true);

	// Not blocked: no strike, no hint.
	const translate = chips.find(chip => chip.children[0] === "Translation");
	assert.ok(!translate.props.className.includes("is-blocked"));
	assert.equal(translate.props.title, undefined);

	// The blocked chip is still a button wired to the endpoint toggle.
	metadata.props.onClick();
	assert.equal(h.settings.get("primary-capabilities").metadata, false);
});
