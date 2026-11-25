import assert from "node:assert/strict";
import test from "node:test";
import { createSpeakerColors } from "#ivlyrics/lyrics/speakerColors.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { createVisualSettingsActions } from "#ivlyrics/core/visualSettingsActions.mjs";
import { createSettingsMultiVocalColors } from "#ivlyrics/features/settings/settingsMultiVocalColors.mjs";

test("speaker colors resolve live settings, saved colors and legacy custom roles", () => {
    let visual;
    const key = "multi-vocal-speaker-color-duet-1";
    const creatorSetting = "sync-data-custom-speaker-colors-enabled";
    const stored = new Map([
        ["ivLyrics:visual:" + key, "#dea"],
        ["ivLyrics:visual:" + creatorSetting, "false"],
    ]);
    const colors = createSpeakerColors({
        getVisualSettings: () => visual,
        getStorage: () => ({ getItem: name => stored.get(name) ?? null }),
    });

    assert.deepEqual(colors.getPresentation("duet_custom", "#ff0"), {
        speaker: "DUET CUSTOM",
        effectiveSpeaker: "DUET 1",
        speakerClass: "duet-1",
        creatorColor: "",
        color: "#ddeeaa",
    });
    visual = { [creatorSetting]: true, [key]: "#bb22ff" };
    assert.equal(colors.getPresentation("CUSTOM", "#ff0", "DUET 1").color, "#ffff00");
    assert.equal(colors.getPresentation("DUET 1", "#ff0").color, "#bb22ff");
    const contract = colors[Symbol.for("ivLyrics.speakerColors.classNameContract")];
    assert.equal(contract.getClassName("CUSTOM", "DUET 1"), "duet-1");
});

test("setting and resetting colors keeps the live CSS updated when persistence fails", () => {
    const visual = {};
    const css = new Map();
    const calls = [];
    const key = "multi-vocal-speaker-color-female-1";
    const colors = createSpeakerColors({
        getVisualSettings: () => visual,
        getStorageManager: () => ({
            saveConfig(name, value) {
                calls.push([name, value]);
                throw new Error("Persistence unavailable");
            },
            removeItem(name) {
                calls.push(name);
                throw new Error("Persistence unavailable");
            },
        }),
        getDefaultTarget: () => ({ style: { setProperty: (name, value) => css.set(name, value) } }),
    });
    const cssKey = colors.getCssVariableName("FEMALE 1");

    assert.equal(colors.setTextColor("FEMALE 1", "#a1b"), "#aa11bb");
    assert.equal(visual[key], "#aa11bb");
    assert.equal(css.get(cssKey), "#aa11bb");
    assert.deepEqual(calls[0], [key, "#aa11bb"]);

    colors.resetToDefaults();
    assert.equal(visual[key], "#ffb8c7");
    assert.equal(css.get(cssKey), "#ffb8c7");
    assert.ok(calls.includes("ivLyrics:visual:" + key));
});

test("speaker settings share persisted colors and recover a failed write or palette reset", (context) => {
    context.mock.method(console, "error", () => {});
    const leadKey = "multi-vocal-speaker-color-male-1";
    const duetKey = "multi-vocal-speaker-color-duet-1";
    const storageKey = key => `ivLyrics:visual:${key}`;
    const visual = { [leadKey]: "#aabbcc", [duetKey]: "#112233" };
    const stored = new Map(Object.entries(visual).map(([key, value]) => [storageKey(key), value]));
    let failSet = false, failRemove = false;
    const localStorage = {
        getItem: key => stored.get(key) ?? null,
        setItem(key, value) {
            if (failSet && key === storageKey(leadKey)) throw new Error("write failed");
            stored.set(key, value);
        },
        removeItem(key) {
            if (failRemove && key === storageKey(duetKey)) throw new Error("reset failed");
            stored.delete(key);
        },
    };
    const storage = createSettingsStorage({ localStorage });
    const events = [], errors = [], css = new Map();
    const speakerColors = createSpeakerColors({
        getVisualSettings: () => visual,
        getStorage: () => localStorage,
        getDefaultTarget: () => ({ style: { setProperty: (name, value) => css.set(name, value) } }),
    });
    const actions = createVisualSettingsActions({
        getVisualSettings: () => visual,
        persistConfig: storage.saveConfig,
        updateLyrics() {},
        publishConfigChange: (...args) => events.push(args),
    });
    const field = Symbol("color control");
    const { ConfigMultiVocalColorSettings, getMultiVocalRegistryItems } = createSettingsMultiVocalColors({
        react: {
            createElement(type, props, ...children) { return { type, props, children }; },
        },
        ConfigColorControl: field,
        translate: key => key,
        readSpeakerColors: () => speakerColors,
        readVisualSettings: () => visual,
        saveVisualSetting: actions.saveVisualSetting,
        resetVisualSettings: values => actions.saveVisualSettings(values, () => storage.resetConfigs(Object.keys(values))),
        applyColorChange: actions.refreshAndPublishSetting,
        useSettingsConfigRevision() {},
        onSaveError: error => errors.push(error.message),
    });
    const find = (node, predicate) => typeof node === "object" && (predicate(node) ? node : node.children.map(child => find(child, predicate)).find(Boolean));
    const lead = () => find(ConfigMultiVocalColorSettings(), node => node.type === field && node.props.label === "MALE 1").props;
    const reset = () => find(ConfigMultiVocalColorSettings(), node => node.type === "button").props.onClick();
    const registry = getMultiVocalRegistryItems().find(({ item }) => item.key === leadKey);

    assert.equal(registry.onChange(leadKey, "#246"), true);
    assert.equal(lead().value, "#224466");
    assert.equal(stored.get(storageKey(leadKey)), "#224466");
    assert.equal(css.get(speakerColors.getCssVariableName("MALE 1")), "#224466");
    assert.deepEqual(events, [[leadKey, "#224466"]]);
    failSet = true;
    lead().onCommit("#035");
    assert.equal(lead().value, "#224466");
    assert.throws(() => registry.onChange(leadKey, "#035"), /write failed/);

    failSet = false;
    failRemove = true;
    reset();
    assert.deepEqual(errors, ["write failed", "reset failed"]);
    assert.equal(stored.get(storageKey(leadKey)), "#224466", "restore the first deleted override");
    assert.equal(stored.get(storageKey(duetKey)), "#112233");
    assert.equal(lead().value, "#224466");
    assert.equal(events.length, 1);

    failRemove = false;
    reset();
    assert.equal(stored.has(storageKey(leadKey)), false);
    assert.equal(stored.has(storageKey(duetKey)), false);
    assert.equal(lead().value, "#a8ccff");
    assert.equal(css.get(speakerColors.getCssVariableName("DUET 1")), "#e4d8ff");
    assert.deepEqual(events.at(-1), ["multi-vocal-speaker-color-reset", "default"]);
});
