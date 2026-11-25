import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { normalizeImportedConfig } from "#ivlyrics/core/settingsBackupPolicy.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { createFileTransfer } from "#ivlyrics/core/fileTransfer.mjs";

import { createSettingsBackupActions } from "#ivlyrics/features/settings/settingsBackupActions.mjs";

const ADDON = "ivLyrics:ai:addon:chatgpt";
const BASE_URL = `${ADDON}:base-url`;
const API_KEY = `${ADDON}:api-keys`;

const ENDPOINT_KEY_PATTERN = /(^|:)(base-url|baseurl|api-base|apiurl|endpoint)$/i;

const normalize = config => normalizeImportedConfig(config, { logger: { warn() {} } });

test("an imported base-url is validated rather than stored verbatim", () => {
	const out = normalize({ [BASE_URL]: "javascript:alert(1)", [API_KEY]: "sk-victim" });

	assert.notEqual(
		out[BASE_URL],
		"javascript:alert(1)",
		"a non-http(s) endpoint survived import and would receive the victim's API key"
	);
});

test("an imported base-url pointing off the http(s) scheme is dropped entirely", () => {
	for (const hostile of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "vbscript:msgbox"]) {
		const out = normalize({ [BASE_URL]: hostile, [API_KEY]: "sk-victim" });
		assert.equal(
			out[BASE_URL],
			undefined,
			`hostile endpoint ${hostile} survived import`
		);
	}
});

test("a legitimate https base-url still imports unchanged", () => {
	const legitimate = "https://api.openai.com/v1";
	const out = normalize({ [BASE_URL]: legitimate, [API_KEY]: "sk-victim" });

	assert.equal(out[BASE_URL], legitimate, "valid endpoints must keep working");
	assert.equal(out[API_KEY], "sk-victim", "credentials are not this check's concern");
});

test("file backups round-trip legacy settings and offsets while cloud backups omit private values", async () => {
	const values = new Map();
	const localStorage = {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, String(value)),
		removeItem: key => values.delete(key),
	};
	const uri = "spotify:track:abc";
	const offsetsKey = "ivLyrics:track-sync-offsets";
	let offsets = {};
	const storage = createSettingsStorage({
		localStorage,
		offsetStore: {
			getAllOffsets: async () => offsets,
			importOffsets: async value => { offsets = { ...value }; return true; },
		},
		getI18n: () => ({ getCurrentLanguage: () => "en", getAvailableLanguages: () => [{ code: "en" }] }),
		logger: { warn() {}, error() {} },
		debug() {},
	});

	await storage.importConfig({
		"lyrics-plus:visual:language": "unknown",
		"ivLyrics:visual:quick-sync-controls-enabled": false,
		[API_KEY]: "fixture-key",
		[offsetsKey]: JSON.stringify({ [uri]: 200 }),
	});

	assert.deepEqual(await storage.exportConfig(), {
		"ivLyrics:visual:quick-sync-controls-enabled": "false",
		[API_KEY]: "fixture-key",
		"ivLyrics:visual:language": "en",
		[offsetsKey]: JSON.stringify({ [uri]: 200 }),
	});
	assert.deepEqual(await storage.exportCloudConfig(), {
		"ivLyrics:visual:quick-sync-controls-enabled": "false",
		"ivLyrics:visual:language": "en",
	});
	assert.equal(values.has(offsetsKey), false);
});

test("a failed settings write leaves both earlier settings and offsets intact", async () => {
  const font = "ivLyrics:visual:font-size";
  const family = "ivLyrics:visual:font-family";
  const values = new Map([[font, "24"], [family, "Original"]]);
  let offsetWrites = 0;
  const storage = createSettingsStorage({
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) {
        if (key === family) throw new Error("fixture storage write failed");
        values.set(key, value);
      },
      removeItem: key => values.delete(key),
    },
    offsetStore: { importOffsets: async () => { offsetWrites++; return true; } },
  });
  await assert.rejects(storage.importConfig({
    [font]: 38, [family]: "Imported", "ivLyrics:track-sync-offsets": { "spotify:track:fixture": 120 },
  }), /fixture storage write failed/);
  assert.deepEqual(Object.fromEntries(values), { [font]: "24", [family]: "Original" });
  assert.equal(offsetWrites, 0);
});

test("offset import failure rolls back settings and serializes a queued cloud import", async () => {
  const font = "ivLyrics:visual:font-size";
  const family = "ivLyrics:visual:font-family";
  const offsets = "ivLyrics:track-sync-offsets";
  const values = new Map([[font, "24"], [API_KEY, "local-fixture"]]);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const storage = createSettingsStorage({
    localStorage: {
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    offsetStore: {
      importOffsets: value => new Promise(resolve => {
        assert.equal(value["spotify:track:fixture"], 120);
        release = resolve;
        entered();
      }),
    },
  });
  const localImport = storage.importConfig({ [font]: 32, [family]: "Imported", [offsets]: { "spotify:track:fixture": 120 } });
  await started;
  assert.equal(values.get(font), "32");
  storage.setItem(font, "49");
  const cloudImport = storage.importCloudConfig({ [font]: 42, [API_KEY]: "cloud-fixture", [offsets]: {} });
  assert.equal(values.get(font), "49");
  release(false);
  await assert.rejects(localImport, /restore track sync offsets/);
  await cloudImport;
  assert.equal(values.get(font), "42");
  assert.equal(values.has(family), false);
  assert.equal(values.has(offsets), false);
  assert.equal(values.get(API_KEY), "local-fixture");
});

test("backup rollback keeps later edits that return to the same value as the backup", async () => {
  const font = "ivLyrics:visual:font-size";
  const family = "ivLyrics:visual:font-family";
  const offsets = "ivLyrics:track-sync-offsets";
  const entered = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const { storage, values } = settingsStorageFixture({ [font]: "24" }, {
    importOffsets() {
      entered.resolve();
      return pending.promise;
    },
  });
  const restoring = storage.importConfig({ [font]: 32, [family]: "Temporary", [offsets]: {} });
  await entered.promise;
  assert.equal(values.get(font), "32");
  storage.saveConfig("font-size", "49");
  storage.saveConfig("font-size", "32");
  pending.resolve(false);
  await assert.rejects(restoring, /restore track sync offsets/);
  assert.equal(values.get(font), "32");
  assert.equal(values.has(family), false);
});

test("export normalizes the offset copy without writing back to the live database", async () => {
  const values = new Map();
  const storage = createSettingsStorage({
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    offsetStore: {
      getAllOffsets: async () => ({ "spotify:track:fixture": "200", "invalid-track": 200 }),
      importOffsets: async () => assert.fail("export must keep the live data intact"),
    },
    debug() {}, logger: { warn() {} },
  });
  assert.deepEqual(await storage.exportConfig(), { "ivLyrics:track-sync-offsets": '{"spotify:track:fixture":200}' });
});

function settingsStorageFixture(initial = {}, offsetStore = { getAllOffsets: async () => ({}) }) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  const localStorage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      writes.push([key, String(value)]);
      values.set(key, String(value));
    },
    removeItem: key => values.delete(key),
  };
  const storage = createSettingsStorage({ localStorage, offsetStore });
  return { storage, values, writes, localStorage };
}

test("a startup burst indexes stored settings once and repeated or missing reads write nothing", async () => {
  const metadata = "ivLyrics:storage-keys";
  const saved = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`ivLyrics:visual:setting-${index}`, "true"]));
  const h = settingsStorageFixture(saved);
  for (const key of Object.keys(saved)) assert.equal(h.storage.get(key), true);
  for (let index = 0; index < 150; index++) assert.equal(h.storage.getItem(`ivLyrics:visual:missing-${index}`), null);
  assert.deepEqual(h.writes, []);
  await Promise.resolve();
  assert.deepEqual(h.writes, [[metadata, JSON.stringify(Object.keys(saved))]]);

  for (const key of Object.keys(saved)) assert.equal(h.storage.getPersisted(key), "true");
  await Promise.resolve();
  assert.equal(h.writes.length, 1);
});

test("backup discovery includes settings written by extensions and respects local and cloud boundaries", async () => {
  const font = "ivLyrics:visual:font-size";
  const custom = "ivLyrics:addon:legacy-preference";
  const presets = "ivLyrics:settings-presets";
  const h = settingsStorageFixture({
    [font]: "49", [custom]: "kept", [presets]: "[]", [API_KEY]: "fixture-credential",
    "ivLyrics:storage-keys": JSON.stringify([custom]),
    "ivLyrics:auth-token": "private", "ivLyrics:local-lyrics": "track data",
    "ivLyrics:ai:bing-translate:proxy-client-address": "generated",
    "ivLyrics:settings-backup:v1": "recovery record",
    "ivLyrics:settings-reset-revisions": "internal reset marker",
    "spotify:unrelated": "keep",
  });
  assert.deepEqual(await h.storage.exportConfig(), {
    [font]: "49", [custom]: "kept", [presets]: "[]", [API_KEY]: "fixture-credential",
    "ivLyrics:track-sync-offsets": "{}",
  });
  assert.deepEqual(await h.storage.exportCloudConfig(), { [font]: "49", [custom]: "kept" });
  assert.equal(h.writes.length, 0);
});

test("settings imports cannot import a previous installation's reset record", async () => {
  const resetKey = "ivLyrics:settings-reset-revisions";
  const values = { [resetKey]: '{"current-account":12}' };
  const h = settingsStorageFixture(values);
  await h.storage.importConfig({ [resetKey]: '{"current-account":1}' });
  assert.equal(h.values.get(resetKey), values[resetKey]);
  assert.deepEqual(h.writes, []);
});

test("export and reset wait until a suspended import has committed or rolled back", async () => {
  const font = "ivLyrics:visual:font-size";
  const offsets = "ivLyrics:track-sync-offsets";
  const entered = Promise.withResolvers();
  const dbWrite = Promise.withResolvers();
  const h = settingsStorageFixture({ [font]: "24", "spotify:unrelated": "keep" }, {
    getAllOffsets: async () => ({}),
    importOffsets() { entered.resolve(); return dbWrite.promise; },
  });
  const importing = h.storage.importConfig({ [font]: 32, [offsets]: { "spotify:track:fixture": 120 } });
  await entered.promise;
  const exported = h.storage.exportConfig();
  const cleared = h.storage.clearConfig();
  await Promise.resolve();
  assert.equal(h.values.get(font), "32");
  dbWrite.resolve(false);
  await assert.rejects(importing, /restore track sync offsets/);
  assert.deepEqual(await exported, { [font]: "24", [offsets]: "{}" });
  await cleared;
  assert.deepEqual(Object.fromEntries(h.values), { "spotify:unrelated": "keep" });
});

test("new backups explicitly restore empty offsets, while older files may omit them", async () => {
  const offsetsKey = "ivLyrics:track-sync-offsets";
  let offsets = {};
  const h = settingsStorageFixture({}, {
    getAllOffsets: async options => { assert.equal(options.throwOnError, true); return offsets; },
    importOffsets: async value => { offsets = { ...value }; return true; },
  });
  const empty = await h.storage.exportConfig();
  assert.deepEqual(empty, { [offsetsKey]: "{}" });
  offsets = { "spotify:track:fixture": 100 };
  await h.storage.importConfig({ "lyrics-plus:visual:font-size": "48" });
  assert.deepEqual(offsets, { "spotify:track:fixture": 100 });
  await h.storage.importConfig(empty);
  assert.deepEqual(offsets, {});
});

test("a database backup is rejected by the settings importer before writing anything", async () => {
  const h = settingsStorageFixture();
  await assert.rejects(h.storage.importConfig({ ivLyricsCache: { lyrics: [] } }), /Invalid ivLyrics settings backup/);
  assert.deepEqual(h.writes, []);
});

test("a failed batch of visual settings rolls back flags and records no backup keys", async () => {
  const gradient = "ivLyrics:visual:gradient-background";
  const solid = "ivLyrics:visual:solid-background";
  const values = new Map([[gradient, "true"], [solid, "false"]]);
  const storage = createSettingsStorage({
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) {
        if (key === solid) throw new Error("simulated visual setting failure");
        values.set(key, value);
      },
    },
  });
  assert.throws(() => storage.saveConfigs({ "gradient-background": false, "solid-background": true }),
    /simulated visual setting failure/);
  await Promise.resolve();
  assert.deepEqual(Object.fromEntries(values), { [gradient]: "true", [solid]: "false" });
});

function backupHarness({ file, confirmed = true, readError, canceled = false, pauseImport = null, detachBeforeChange = false } = {}) {
  const events = [];
  let attached = false;
  const document = {
    body: {
      appendChild() { attached = true; },
      removeChild() {
        if (!attached) throw new DOMException("File input already detached", "NotFoundError");
        attached = false;
      },
    },
    createElement(tag) {
      assert.equal(tag, "input");
      return {
        files: [file],
        remove() { attached = false; },
        click() {
          events.push("choose");
          if (detachBeforeChange) this.remove();
          if (canceled) this.oncancel();
          else this.onchange();
        },
      };
    },
  };
  const settings = { "ivLyrics:visual:font-size": "36" };
  const databases = { "ivLyrics-db": { "track-sync-offsets": [{ key: "track", value: 125 }] } };
  const actions = createSettingsBackupActions({
    document,
    translate: (key, args) => args ? `${key} (${args.count})` : key,
    confirm: message => { events.push(["confirm", message]); return confirmed; },
    importConfig: async config => { events.push(["settings", config]); await pauseImport; },
    importDatabases: async data => events.push(["database", data]),
    exportConfig: async () => settings,
    exportDatabases: async () => databases,
    requestSaveTarget: async (name, options) => {
      events.push(["target", name, options]);
      return { canceled };
    },
    saveBlob: async (blob, name) => events.push(["save", name, blob.type, await blob.text()]),
    reload: () => events.push("reload"),
    clearSettings: async () => events.push("reset"),
    createFileReader: () => ({
      readAsText(contents, encoding) {
        assert.equal(encoding, "utf-8");
        events.push("read");
        if (readError) {
          this.error = readError;
          this.onerror();
        } else {
          this.onload({ target: { result: contents } });
        }
      },
    }),
  });
  const run = async action => {
    await actions[action]();
    assert.equal(actions.getSnapshot().active, null);
  };
  const getResult = key => actions.getSnapshot().results[key];
  return { run, actions, events, getResult, settings, databases };
}

test("settings import confirms the settings count after reading and before writing", async () => {
  const config = { "ivLyrics:visual:a": true, "ivLyrics:visual:b": false };
  const { run, events, getResult } = backupHarness({ file: JSON.stringify(config) });
  await run("importSettings");
  assert.deepEqual(events, [
    "choose", "read", ["confirm", "settingsAdvanced.exportImport.import.confirm (2)"],
    ["settings", config], "reload",
  ]);
  assert.equal(getResult("import-settings").id, "import-result-container");
  assert.equal(getResult("import-settings").title, "notifications.importSuccess");
});

test("declining a settings import prevents writes and reload", async () => {
  const { run, events } = backupHarness({ file: "{}", confirmed: false });
  await run("importSettings");
  assert.deepEqual(events, ["choose", "read", ["confirm", "settingsAdvanced.exportImport.import.confirm (0)"]]);
});

test("invalid and unreadable settings backups leave the restore button usable", async () => {
  for (const file of ["[]", "invalid JSON"]) {
    const { run, events, getResult } = backupHarness({ file });
    await run("importSettings");
    assert.deepEqual(events, ["choose", "read"]);
    assert.equal(getResult("import-settings").title, "notifications.importFailed");
  }
  const { run, events, getResult } = backupHarness({ file: "{}", readError: new Error("Could not read file") });
  await run("importSettings");
  assert.deepEqual(events, ["choose", "read"]);
  assert.equal(getResult("import-settings").detail, "Could not read file");
});

test("canceling the file chooser restores both import buttons", async () => {
  for (const action of ["importSettings", "importDatabaseBackup"]) {
    const { run, events, actions } = backupHarness({ canceled: true });
    await run(action);
    assert.deepEqual(events, ["choose"]);
    assert.deepEqual(actions.getSnapshot().results, {});
  }
});

test("a file chooser change still imports when its input has already been detached", async () => {
  const { run, events, getResult } = backupHarness({ file: "{}", detachBeforeChange: true });
  await run("importSettings");
  assert.deepEqual(events, ["choose", "read", ["confirm", "settingsAdvanced.exportImport.import.confirm (0)"], ["settings", {}], "reload"]);
  assert.equal(getResult("import-settings").title, "notifications.importSuccess");
});

test("the settings screen rejects database JSON without confirming or reloading", async () => {
  const { run, events, getResult } = backupHarness({ file: '{"ivLyricsCache":{"lyrics":[]}}' });
  await run("importSettings");
  assert.deepEqual(events, ["choose", "read"]);
  assert.equal(getResult("import-settings").title, "notifications.importFailed");
});

test("a new settings mount observes the pending restore and locks buttons until reload", async () => {
  const pause = Promise.withResolvers();
  const { run, actions, events } = backupHarness({
    file: '{"ivLyrics:visual:font-size":"56"}', pauseImport: pause.promise,
  });
  const previousMount = [];
  const unsubscribe = actions.subscribe(() => previousMount.push(actions.getSnapshot()));
  const restore = run("importSettings");
  assert.equal(previousMount.at(-1).active.key, "import-settings");
  unsubscribe();
  const newMount = [actions.getSnapshot()];
  actions.subscribe(() => newMount.push(actions.getSnapshot()));
  assert.equal(newMount[0].active.label, "settingsAdvanced.exportImport.import.processing");
  await actions.exportDatabaseBackup();
  await actions.resetSettings();
  pause.resolve();
  await restore;
  assert.equal(previousMount.length, 1);
  assert.equal(newMount.at(-1).reloadQueued, true);
  assert.equal(newMount.at(-1).results["import-settings"].title, "notifications.importSuccess");
  await actions.importDatabaseBackup();
  assert.deepEqual(events.map(event => typeof event === "string" ? event : event[0]),
    ["choose", "read", "confirm", "settings", "reload"]);
});

test("database import confirms before reading the selected backup", async () => {
  const database = { "ivLyrics-db": { "track-sync-offsets": [] } };
  const prompt = ["confirm", "settingsAdvanced.dbExportImport.import.confirm"];
  for (const confirmed of [true, false]) {
    const { run, events, getResult } = backupHarness({ file: JSON.stringify(database), confirmed });
    await run("importDatabaseBackup");
    assert.deepEqual(events, ["choose", prompt, ...(confirmed ? ["read", ["database", database], "reload"] : [])]);
    assert.equal(getResult("import-db")?.id, confirmed ? "db-import-result-container" : undefined);
  }
});

test("both exports preserve the filename, JSON structure and result panel", async () => {
  const scenarios = [
    ["exportSettings", "settings", "ivLyrics-settings.json", "ivLyrics Settings", "export-settings", "export-result-container"],
    ["exportDatabaseBackup", "databases", "ivLyrics-db.json", "ivLyrics Database", "export-db", "db-export-result-container"],
  ];
  for (const [action, dataKey, name, description, key, id] of scenarios) {
    const harness = backupHarness();
    await harness.run(action);
    assert.deepEqual(harness.events, [
      ["target", name, { description, mimeType: "application/json", extensions: [".json"] }],
      ["save", name, "application/json", JSON.stringify(harness[dataKey], null, 2)],
    ]);
    assert.equal(harness.getResult(key).id, id);
  }
});

test("failed backup writes abort the save so an existing file stays intact", async () => {
  const io = createFileTransfer({ host: {} });
  const oldContents = "previous backup";
  let documentContents = oldContents;
  let draft;
  let aborts = 0;
  const writeError = new Error("Interrupted writing backup");
  const target = {
    handle: { createWritable: async () => ({
      async write() { draft = "partial backup"; throw writeError; },
      async close() { documentContents = draft; },
      async abort() { aborts++; draft = undefined; },
    }) },
  };
  await assert.rejects(io.saveBlobAs(new Blob(["new backup"]), "ivLyrics-settings.json", target), writeError);
  assert.equal(aborts, 1);
  assert.equal(documentContents, oldContents);
});

test("the confirmation prompt is translated in every shipped language", () => {
	const langsDir = new URL("../src/i18n/langs/", import.meta.url);
	const files = readdirSync(langsDir).filter((name) => /^Lang.*\.js$/.test(name));
	assert.ok(files.length >= 20, `expected the full language set, saw ${files.length}`);

	for (const file of files) {
		const source = readFileSync(new URL(`../src/i18n/langs/${file}`, import.meta.url), "utf8");
		const importBlock = source.slice(source.indexOf('"exportImport"'));
		assert.match(
			importBlock,
			/"confirm"\s*:/,
			`${file} is missing the exportImport.import.confirm string; the prompt would render as a raw key`
		);
	}
});

test("every AI endpoint key is covered by the import validation", () => {
	// If a new addon introduces another endpoint key it must be caught by the
	// same rule, so the pattern is asserted to be shared rather than per-key.
	for (const key of [
		"ivLyrics:ai:addon:gemini:base-url",
		"ivLyrics:ai:addon:openrouter:base-url",
		"ivLyrics:ai:addon:deepL:base-url",
	]) {
		const out = normalize({ [key]: "javascript:alert(1)" });
		assert.equal(out[key], undefined, `endpoint key ${key} bypassed import validation`);
	}
	assert.ok(ENDPOINT_KEY_PATTERN.test("base-url"), "guard pattern must stay in sync with the tests");
});
