import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsPresetsStore } from "../src/features/settings/settingsPresetsStore.mjs";
import { createSettingsStorage } from "../src/core/createSettingsStorage.mjs";
import { createSettingsEventChannel, createVisualSettingsActions } from "../src/core/visualSettingsActions.mjs";
import { createI18n } from "../src/i18n/createI18n.mjs";
import { createSettingsSaveEffects, publishAppliedSettingsPreset } from "../src/features/settings/settingsSaveEffects.mjs";

test("preset storage normalizes old records and excludes API keys when saving or applying", () => {
  const older = { id: "legacy", name: "  Old  ", createdAt: "2025-01-01", settings: { "font-size": 20, "gemini-api-key": "test" } };
  const newer = { name: "New", updatedAt: "2026-01-01", settings: { language: "ko", "gemini-api-key-romaji": "test" } };
  const calls = [];
  let serialized = JSON.stringify([older, {}, newer]);
  const store = createSettingsPresetsStore({
    readItem: () => serialized,
    writeItem: (key, value) => {
      assert.equal(key, "ivLyrics:settings-presets");
      serialized = value;
    },
    applyVisualSettings: (values) => calls.push(["batch", values]),
    onApplied: (entries) => calls.push(["applied", entries]),
    randomUUID: () => "generated",
  });
  const expected = [
    { id: "preset-generated", name: "New", createdAt: "2026-01-01", updatedAt: "2026-01-01", settings: { language: "ko" } },
    { id: "legacy", name: "Old", createdAt: "2025-01-01", updatedAt: "2025-01-01", settings: { "font-size": 20 } },
  ];
  assert.deepEqual(store.loadSettingsPresets(), expected);
  assert.deepEqual(store.saveSettingsPresets([older, {}, newer]), expected);
  assert.deepEqual(JSON.parse(serialized), expected);
  store.applySettingsPresetValues({ ...newer.settings, ...older.settings, "": 1 });
  assert.deepEqual(calls, [
    ["batch", { language: "ko", "font-size": 20 }],
    ["applied", [["language", "ko"], ["font-size", 20]]],
  ]);
});

test("captured nested settings are independent and omit credentials and runtime values", () => {
  const accent = { normal: ["blue"] };
  const store = createSettingsPresetsStore({
    readVisualSettings: () => ({ accent, "gemini-api-key": "test", absent: undefined, update() {} }),
  });
  const saved = store.captureSettingsPresetValues();
  accent.normal.push("green");
  assert.deepEqual(saved, { accent: { normal: ["blue"] } });
});

test("language changes share the committed setting and unsupported preset languages leave it intact", () => {
  const visual = { language: "ko", "font-size": 24 };
  const writes = [];
  const languageChanges = [];
  const events = [];
  let storedLanguage = "ko";
  const i18n = createI18n({
    languages: new Map([["ko", { label: "한국어" }], ["en", { label: "English" }]]),
    languageNames: {},
    readLanguage: () => storedLanguage,
    writeLanguage: value => writes.push(["i18n", value]),
    onLanguageChanged: language => languageChanges.push([language, visual["font-size"], storedLanguage]),
    debug: () => {},
  });
  i18n.initSync();
  const persist = (values) => {
    writes.push(["settings", { ...values }]);
    if (values.language) storedLanguage = values.language;
  };
  const actions = createVisualSettingsActions({
    getVisualSettings: () => visual,
    persistConfig: (name, value) => persist({ [name]: value }),
    persistConfigBatch: persist,
  });
  const setInterfaceLanguage = (language, options) => i18n.setLanguage(language, options);
  const store = createSettingsPresetsStore({
    readVisualSettings: () => visual,
    isInterfaceLanguageAvailable: value => ["ko", "en"].includes(value),
    applyVisualSettings: actions.saveVisualSettings,
    onApplied: entries => publishAppliedSettingsPreset(entries, {
      setInterfaceLanguage,
      publishConfigChange: (name, value) => events.push([name, value, i18n.getCurrentLanguage()]),
      refreshLyrics() {},
      publishEvent() {},
    }),
  });
  const { changeInterfaceLanguage } = createSettingsSaveEffects({
    visualSettingsActions: actions, setInterfaceLanguage, reopenLanguageSettings() {},
  });

  store.applySettingsPresetValues({ language: "en", "font-size": 32 });
  store.applySettingsPresetValues({ language: "retired-language", "font-size": 36 });
  assert.equal(visual.language, "en");
  assert.equal(i18n.t("label"), "English");
  changeInterfaceLanguage("language", "ko");

  assert.deepEqual(writes, [
    ["settings", { language: "en", "font-size": 32 }],
    ["settings", { "font-size": 36 }],
    ["settings", { language: "ko" }],
  ]);
  assert.deepEqual(languageChanges, [["ko", 24, "ko"], ["en", 32, "en"], ["ko", 36, "ko"]]);
  assert.deepEqual(events, [["language", "en", "en"], ["font-size", 32, "en"], ["font-size", 36, "en"]]);
});

test("preset events observe the complete visual configuration and a failed write changes no setting", async () => {
  const startingVisual = { "gradient-background": true, "video-background": false, "panel-font-scale": 100 };
  const visual = { ...startingVisual };
  const keyFor = name => `ivLyrics:visual:${name}`;
  const savedValues = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [keyFor(name), String(value)]));
  const persisted = new Map(Object.entries(savedValues(startingVisual)));
  let denyWrites = true;
  const storage = createSettingsStorage({
    localStorage: {
      getItem: key => persisted.get(key) ?? null,
      setItem(key, value) {
        if (denyWrites && key === keyFor("panel-font-scale")) throw new Error("storage full");
        persisted.set(key, value);
      },
    },
  });
  const host = new EventTarget();
  const channel = createSettingsEventChannel(host, (type, detail) => new CustomEvent(type, { detail }));
  const observations = [];
  channel.subscribeSettingsConfig(event => observations.push([event.detail.name, { ...visual }, Object.fromEntries(persisted)]));
  const actions = createVisualSettingsActions({
    getVisualSettings: () => visual,
    persistConfigBatch: values => storage.saveConfigs(values),
  });
  const store = createSettingsPresetsStore({
    readVisualSettings: () => visual,
    applyVisualSettings: actions.saveVisualSettings,
    onApplied: entries => {
      for (const [name, value] of entries) channel.publishSettingsConfigChange(name, value);
    },
  });
  const preset = { "gradient-background": false, "video-background": true, "panel-font-scale": 115, "optional-setting": null };
  assert.throws(() => store.applySettingsPresetValues(preset), /storage full/);
  await Promise.resolve();
  assert.deepEqual(observations, []);
  assert.deepEqual(visual, startingVisual);
  assert.deepEqual(Object.fromEntries(persisted), savedValues(startingVisual));

  denyWrites = false;
  store.applySettingsPresetValues({ ...preset, ["__proto__"]: { unwanted: true } });
  assert.deepEqual(observations, Object.keys(preset).map(name => [name, preset, savedValues(preset)]));
  assert.deepEqual(visual, preset);

  observations.length = 0;
  // A partial update still repairs a missing stored key, without asking the
  // playback and provider listeners to re-apply an identical live value.
  persisted.delete(keyFor("video-background"));
  const updated = { ...preset, "panel-font-scale": 125 };
  store.applySettingsPresetValues(updated);
  assert.deepEqual(Object.fromEntries(persisted), savedValues(updated));
  assert.deepEqual(observations, [["panel-font-scale", updated, savedValues(updated)]]);
});
