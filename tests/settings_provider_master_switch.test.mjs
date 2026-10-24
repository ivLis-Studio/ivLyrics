import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("../SettingsStyles.js", import.meta.url), "utf8");
const section = (start, end) => {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from);
	assert.ok(from >= 0 && to > from);
	return source.slice(from, to);
};

// Mirror tests/settings_component_identity.test.mjs: real render functions with
// hook state kept between renders. The fake AIAddonManager exposes only the
// provider-level flag, so the row cell can only be the master switch.
const createHarness = (masterFlags) => {
	const slots = [];
	let cursor = 0;
	const useState = (initial) => {
		const index = cursor++;
		if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
		return [slots[index], (next) => {
			slots[index] = typeof next === "function" ? next(slots[index]) : next;
		}];
	};
	const useMemo = (factory, deps) => {
		const index = cursor++;
		const previous = slots[index];
		if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
			slots[index] = { value: factory(), deps };
		}
		return slots[index].value;
	};
	const react = {
		createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
		Fragment: Symbol("Fragment"),
		useState,
		useMemo,
		useCallback: (callback, deps) => useMemo(() => callback, deps),
		useRef: (current) => useMemo(() => ({ current }), []),
		useEffect: () => { cursor++; },
		useLayoutEffect: () => { cursor++; },
	};
	const writes = [];
	const context = vm.createContext({
		react, ...react,
		CONFIG: { visual: { "line-spacing": 8 } },
		APP_NAME: "ivLyrics",
		I18n: { t: (key) => key },
		Utils: { currentVersion: "test" },
		window: {
			AIAddonManager: {
				isCapabilityEnabled: (id, capability) => masterFlags[`${id}:${capability}`] !== false,
				setCapabilityEnabled: (id, capability, enabled) => {
					masterFlags[`${id}:${capability}`] = enabled;
					writes.push([id, capability, enabled]);
				},
			},
		},
		document: { getElementById: () => null },
		localStorage: { getItem: () => null },
		Spicetify: { LocalStorage: { get: () => null } },
		OptionList: () => null,
		ConfigSelection: () => null,
		ConfigSlider: () => null,
		ConfigSliderRange: () => null,
		ConfigButton: () => null,
		OverlaySettings: () => null,
		SettingsOutlineIcon: () => null,
		ProviderSupportIconChip: () => null,
	});
	vm.runInContext(settingsStyles, context);
	vm.runInContext(`${section("const getEffectiveReducedMotionPreference =", "function openConfig(")}
		${section("const AddonSettingsCard =", "// 가사 제공자 설정 탭 컴포넌트")}
		globalThis.AddonSettingsCard = AddonSettingsCard;`, context);
	return {
		writes,
		render(props = {}) {
			cursor = 0;
			return context.AddonSettingsCard(props);
		},
	};
};

const elements = (node) => {
	if (Array.isArray(node)) return node.flatMap(elements);
	if (!node || typeof node !== "object" || !("type" in node)) return [];
	return [node, ...elements(node.props.children)];
};

const perEndpointAddon = {
	id: "chatgpt",
	name: "ChatGPT",
	description: "ChatGPT",
	supports: { translate: true, metadata: true },
	perEndpointCapabilities: true,
};

const rowProps = {
	addon: perEndpointAddon,
	isEnabled: true,
	isExpanded: false,
	capabilityColumns: ["metadata"],
	owners: {},
};

const capButton = (tree, capability) => elements(tree).find((element) =>
	element.type === "button"
	&& String(element.props.className || "").includes("settings-cap-toggle")
	&& String(element.props["aria-label"] || "").includes(`supports.${capability}`));

test("a per-endpoint provider's row cell is a button that writes the provider-level flag", () => {
	const harness = createHarness({});
	const button = capButton(harness.render(rowProps), "metadata");
	assert.equal(button.props.type, "button");
	assert.equal(button.props["aria-pressed"], true);

	button.props.onClick();
	// The row toggles the master flag stored by AIAddonManager, not endpoint chips.
	assert.deepEqual(harness.writes, [["chatgpt", "metadata", false]]);
	assert.equal(capButton(harness.render(rowProps), "metadata").props["aria-pressed"], false);
});

test("the row cell shows the saved master flag instead of assuming on for per-endpoint add-ons", () => {
	const harness = createHarness({ "chatgpt:metadata": false });
	const button = capButton(harness.render(rowProps), "metadata");
	assert.equal(button.props["aria-pressed"], false);
	assert.equal(String(button.props.className).includes("is-on"), false);
	assert.deepEqual(harness.writes, []);
});
