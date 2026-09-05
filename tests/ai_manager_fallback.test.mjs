import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const revision = process.env.IVLYRICS_REFACTOR_TEST_REVISION;
const baseline = revision ? execFileSync("git", ["show", `${revision}:AIAddonManager.js`], {
	cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}) : null;
const normalize = value => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "function" ? "[callback]" : item));
const requests = [
	{ method: "translateMetadata", type: "metadata", builder: "buildMetadataTranslationPrompt", prompt: "metadataPrompt" },
	{ method: "generateLyricsStudy", type: "lyricsStudy", builder: "buildLyricsStudyPrompt", prompt: "lyricsStudyPrompt" },
	{ method: "generateCulturalAnnotations", type: "culturalAnnotations", builder: "buildCulturalAnnotationsPrompt", prompt: "culturalAnnotationsPrompt" },
];

// Run the complete manager with invented, independently registered addons. No
// provider modules, page CONFIG/Utils, credentials, real storage or fetch exist.
const run = async (script, request, scenario) => {
	const trace = [];
	const storage = new Map();
	const timers = new Map();
	let timerId = 0;
	const record = (name, ...values) => trace.push([name, ...normalize(values)]);
	const window = {
		AddonDebug: {
			isEnabled: () => true,
			...Object.fromEntries(["log", "error", "time", "timeEnd"].map(name => [name, (...values) => record(`debug:${name}`, ...values)])),
		},
		__ivLyricsDebugLog: (...values) => record("debug", ...values),
	};
	vm.runInNewContext(script, {
		window,
		Spicetify: { LocalStorage: { get: key => storage.get(key), set: (key, value) => storage.set(key, value) } },
		console: Object.fromEntries(["log", "warn", "error"].map(name => [name, (...values) => record(name, ...values)])),
		setTimeout(callback, milliseconds) { timers.set(++timerId, callback); record("timer:start", timerId, milliseconds); return timerId; },
		clearTimeout(id) { timers.delete(id); record("timer:clear", id); },
	});
	const manager = window.AIAddonManager;
	await manager._initPromise;
	const callbacks = [];
	const params = {
		title: "Fixture song", artist: "Fixture artist", lang: "ko", targetLang: "ko", sourceLang: "en",
		lines: [{ lineIndex: 0, text: "fixture light" }], extensionData: { preserved: true },
		onProviderLoading(value) {
			record("loading", value);
			callbacks.push(value.providerId);
			if (scenario.loadingFailure && callbacks.length === 1) throw new Error("fixture loading failure");
		},
	};
	const ids = ["user.custom/첫째", "community.plugin:second", "third.custom"];
	const callIds = [];
	const values = [];
	for (const [index, behavior] of scenario.behaviors.entries()) {
		const addon = {
			id: ids[index], name: `Fixture ${index}`, author: "fixture", version: "1.0", description: "fixture",
			supports: { [request.type]: true }, getSettingsUI() {},
		};
		if (behavior !== "missing") addon[request.method] = async function (received) {
			assert.equal(this, addon, "manager must preserve a custom addon's method receiver");
			assert.equal(received.extensionData, params.extensionData);
			assert.equal(received.onProviderLoading, params.onProviderLoading);
			assert.ok(received[request.prompt], "each attempt must receive its generated prompt");
			record("provider", this.id, received);
			callIds.push(this.id);
			if (behavior === "fail") throw new Error(`fixture failure ${this.id}`);
			const result = request.type === "culturalAnnotations" && behavior !== "invalid"
				? { annotations: [
					{ lineIndex: 0, expression: "light", note: " First sentence. Second sentence." },
					{ lineIndex: 0, expression: "absent", note: "must be filtered" },
					{ lineIndex: 0, expression: "light", note: "duplicate" },
				] } : { customResult: this.id };
			values.push(result);
			return result;
		};
		assert.equal(manager.register(addon), true);
		assert.equal(manager.getAddon(addon.id), addon, "registration must retain the user object");
		manager.setProviderEnabled(addon.id, true);
	}
	manager.setProviderOrder(ids);
	if (scenario.selected !== undefined) params.provider = ids[scenario.selected];
	let promptCalls = 0;
	const builder = manager[request.builder];
	manager[request.builder] = function (value) {
		assert.equal(this, manager, "overridden manager methods retain their receiver");
		record("prompt", request.builder, value);
		if (scenario.promptFailure && ++promptCalls === 1) throw new Error("fixture prompt failure");
		return builder.call(this, value);
	};
	const events = [];
	for (const name of ["start", "success", "error"]) manager.on(`ai:request:${name}`, value => {
		events.push([name, normalize(value)]);
		record(`event:${name}`, value);
	});
	trace.length = 0;
	let result;
	try {
		const value = await manager[request.method](params);
		if (request.type !== "culturalAnnotations") assert.equal(value, values.at(-1), "successful custom result must be returned untouched");
		result = { value: normalize(value) };
	} catch (error) { result = { error: error.name, message: error.message }; }
	assert.equal(timers.size, 0, "every completed provider attempt must clear its deadline");
	return { trace, events, callIds, callbacks, result };
};

for (const request of requests) {
	test(`${request.type}: arbitrary addon IDs preserve fallback order, method binding and request events`, async () => {
		for (const behaviors of [
			["success", "success"], ["fail", "success"], ["missing", "success"],
			["fail", "fail"], ["missing"], [],
		]) {
			const scenario = { behaviors };
			const actual = await run(source, request, scenario);
			if (baseline) assert.deepEqual(actual, await run(baseline, request, scenario));
			const expectedSuccessIndex = behaviors.indexOf("success");
			const successful = expectedSuccessIndex >= 0;
			assert.deepEqual(actual.events.map(([name]) => name), behaviors.length ? ["start", successful ? "success" : "error"] : []);
			assert.equal(actual.callIds.length, successful ? behaviors.slice(0, expectedSuccessIndex + 1).filter(value => value !== "missing").length
				: behaviors.filter(value => value !== "missing").length);
			if (successful) {
				assert.ok(actual.result.value);
				assert.equal(actual.events.at(-1)[1].provider, actual.callIds.at(-1));
			} else {
				assert.equal(actual.result.error, "Error");
				assert.match(actual.result.message, behaviors.includes("fail") ? /fixture failure community\.plugin:second/
					: behaviors.length ? /All AI providers failed/ : /No AI providers enabled/);
			}
		}
	});

	test(`${request.type}: prompt failures stay inside the per-provider fallback boundary`, async () => {
		const scenario = { behaviors: ["success", "success"], promptFailure: true };
		const actual = await run(source, request, scenario);
		if (baseline) assert.deepEqual(actual, await run(baseline, request, scenario));
		assert.deepEqual(actual.callIds, ["community.plugin:second"]);
		assert.deepEqual(actual.events.map(([name]) => name), ["start", "success"]);
		assert.ok(actual.trace.find(([name, , message]) => name === "warn" && message === "fixture prompt failure"));
	});
}

test("cultural annotations preserve loading callbacks, normalization failures and explicit provider selection", async () => {
	const request = requests[2];
	for (const scenario of [
		{ behaviors: ["success", "success"], loadingFailure: true },
		{ behaviors: ["invalid", "success"] },
		{ behaviors: ["success", "success"], selected: 1 },
	]) {
		const actual = await run(source, request, scenario);
		if (baseline) assert.deepEqual(actual, await run(baseline, request, scenario));
		assert.equal(actual.events.at(-1)[1].provider, "community.plugin:second");
		assert.equal(actual.callbacks.at(-1), "community.plugin:second");
		assert.deepEqual(actual.result.value, { annotations: [{ lineIndex: 0, expression: "light", note: "First sentence." }], provider: "community.plugin:second" });
		if (scenario.selected !== undefined) assert.deepEqual(actual.callIds, ["community.plugin:second"]);
	}
});
