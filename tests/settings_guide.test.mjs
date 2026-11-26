import { declarations, harness } from "./fixtures/settings-modal-harness.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import { getSettingsSelectionEntries } from "../src/features/settings/settingsChoiceControls.mjs";
import { createSettingsMenuMetadata } from "../src/features/settings/settingsMenuMetadata.mjs";
import {
  SETTINGS_GUIDE_MENUS, SETTINGS_GUIDE_SECTIONS, SETTINGS_GUIDE_SETTINGS, SETTINGS_GUIDE_VIEW_LABELS,
} from "../src/features/settings/settingsGuide.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// settingsGuide.mjs describes every settings row for search and the settings
// assistant. These tests render every menu with a translate function that
// returns the i18n key itself, then compare the rows with the guide. When one
// fails after a menu change, update the guide entry named in the message (see
// the maintenance checklist at the top of settingsGuide.mjs).

const mark = (key) => "\u27e6" + key + "\u27e7";
const i18nKeysIn = (text) => [...String(text ?? "").matchAll(/\u27e6([^\u27e7]+)\u27e7/g)].map((match) => match[1]);
const asList = (value) => value === undefined ? [] : [].concat(value);

// Controls drawn inside custom panels never reach the settings registry. The
// guide describes them as control "panel"; their rows carry data-setting-key.
const PANEL_SETTINGS = new Set([
  "overlay-trim-metadata", "prefer-sync-data-provider", "prefer-lyrics-type-over-provider-order", "ai-provider-retry-count",
]);
// Sections rendered by renderSettingsSectionShell inside provider panels.
const PANEL_SECTIONS = new Set([
  "lyrics-providers:lyrics-lookup", "lyrics-providers:lyrics-provider-list",
  "ai-providers:ai-tasks", "ai-providers:ai-translation", "ai-providers:ai-request", "ai-providers:ai-connections",
]);
// Menus that are not built from settings rows.
const NON_SETTINGS_MENUS = new Set(["assistant"]);

const h = harness({}, {}, { translate: mark });
const menuIds = Array.from(h.api.sidebarTabs, (tab) => tab.id);
const rows = menuIds.flatMap((tabId) => declarations(h, h.api.renderTabContent(tabId), tabId));
const guideByKey = new Map(SETTINGS_GUIDE_SETTINGS.map((entry) => [entry.key, entry]));

const controlByComponent = new Map([
  ["ConfigSlider", "toggle"], ["ConfigSliderRange", "range"], ["ConfigFontWeightSlider", "font-weight"],
  ["ConfigSelection", "select"], ["ConfigInstrumentalBreakIconPicker", "select"],
  ["ConfigColorPicker", "color"], ["ColorPresetSelector", "color"], ["ConfigFontSelector", "font"],
  ["ConfigHotkey", "hotkey"], ["ConfigKaraokeFillCurveEditor", "curve"],
  ["VideoHelperToggle", "helper"], ["LyricsHelperToggle", "helper"],
  ["ConfigButton", "action"], ["SettingsBackupButton", "action"], ["SettingsUpdateButton", "action"],
  ["ConfigInfo", null], ["ConfigWarning", null],
].map(([name, control]) => [h.controls[name], control]));
// Layer-matrix header toggles are declared without a type; the registry adds ConfigSlider.
const controlOf = (item) => item.type ? controlByComponent.get(item.type) : "toggle";

const settingRows = rows.filter((row) => controlOf(row.item) !== null);

test("every component used by a settings row has a guide control type", () => {
  const unknown = rows.filter((row) => controlOf(row.item) === undefined)
    .map((row) => `${row.tabId}:${row.item.key} (${row.item.type?.name || typeof row.item.type})`);
  assert.deepEqual(unknown, [], "add the component to controlByComponent and the guide's control list");
});

test("every settings row has a guide entry in the same menu and section", () => {
  const problems = [];
  for (const row of settingRows) {
    const entry = guideByKey.get(row.item.key);
    if (!entry) {
      problems.push(`missing guide entry: ${row.item.key} (${row.tabId} › ${row.sectionKey})`);
      continue;
    }
    if (entry.tab !== row.tabId) problems.push(`${row.item.key}: tab ${entry.tab}, menu renders it in ${row.tabId}`);
    if (entry.section !== row.sectionKey) problems.push(`${row.item.key}: section ${entry.section}, menu renders it in ${row.sectionKey}`);
    if (entry.control !== controlOf(row.item)) problems.push(`${row.item.key}: control ${entry.control}, row is ${controlOf(row.item)}`);
  }
  assert.deepEqual(problems, []);
});

test("guide entries match each row's labels, limits, options and default", () => {
  const problems = [];
  const differs = (key, field, expected, actual) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      problems.push(`${key}.${field}: guide ${JSON.stringify(expected)}, row ${JSON.stringify(actual)}`);
    }
  };
  for (const { item, column } of settingRows) {
    const entry = guideByKey.get(item.key);
    if (!entry) continue;
    differs(item.key, "label", asList(entry.label), i18nKeysIn(item.desc ?? item.name));
    differs(item.key, "info", asList(entry.info), i18nKeysIn(item.info));
    differs(item.key, "column", asList(entry.column), i18nKeysIn(column));
    if (entry.control === "range") {
      differs(item.key, "range", [entry.min, entry.max, entry.step], [item.min, item.max, item.step]);
    }
    if (entry.control === "font-weight") differs(item.key, "range", [100, 900, 100], [entry.min, entry.max, entry.step]);
    if (entry.control === "select" && entry.options !== "languages") {
      differs(item.key, "options", entry.options.map(String),
        getSettingsSelectionEntries(item.options).map(([value]) => value));
    }
    const hasDefault = item.key === h.SETTINGS_BACKGROUND_MODE_KEY || h.hasSettingDefault(item.key);
    differs(item.key, "default",
      entry.default === undefined ? undefined : String(entry.default),
      hasDefault ? String(h.getSettingDefaultValue(item.key)) : undefined);
    differs(item.key, "visibleWhen", Boolean(entry.visibleWhen), Boolean(item.when));
    differs(item.key, "searchable", entry.searchable === false, item.searchable === false);
  }
  assert.deepEqual(problems, []);
});

test("the guide has no entries for removed rows", () => {
  const declared = new Set(settingRows.map((row) => row.item.key));
  const leftovers = SETTINGS_GUIDE_SETTINGS
    .filter((entry) => !declared.has(entry.key) && !(entry.control === "panel" && PANEL_SETTINGS.has(entry.key)))
    .map((entry) => entry.key);
  assert.deepEqual(leftovers, []);
  const panels = SETTINGS_GUIDE_SETTINGS.filter((entry) => entry.control === "panel").map((entry) => entry.key);
  assert.deepEqual(panels.sort(), [...PANEL_SETTINGS].sort());
  for (const entry of SETTINGS_GUIDE_SETTINGS.filter((item) => item.control === "panel")) {
    assert.equal(entry.assistant, "show", `${entry.key}: panel controls are shown, not changed, by the assistant`);
  }
});

test("guide sections match the rendered sections and menus", () => {
  const rendered = [];
  const walk = (node, tab) => {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, tab));
    if (!node?.props) return;
    if (node.type === h.SettingsSection) {
      rendered.push({
        tab, key: node.props.sectionKey, view: node.props.view,
        title: i18nKeysIn(node.props.title), subtitle: i18nKeysIn(node.props.subtitle),
      });
    }
    walk(node.props.children, tab);
  };
  for (const tabId of menuIds) walk(h.api.renderTabContent(tabId), tabId);
  const guideSections = new Map(SETTINGS_GUIDE_SECTIONS.map((section) => [`${section.tab}:${section.key}`, section]));
  assert.equal(guideSections.size, SETTINGS_GUIDE_SECTIONS.length, "section keys repeat within a menu");
  for (const section of rendered) {
    const entry = guideSections.get(`${section.tab}:${section.key}`);
    assert.ok(entry, `missing guide section ${section.tab}:${section.key}`);
    assert.deepEqual([entry.title], section.title, `${section.key}: title key`);
    assert.deepEqual(asList(entry.subtitle), section.subtitle, `${section.key}: subtitle key`);
    assert.equal(entry.view, section.view, `${section.key}: view`);
  }
  const renderedIds = new Set(rendered.map((section) => `${section.tab}:${section.key}`));
  assert.deepEqual(
    [...guideSections.keys()].filter((id) => !renderedIds.has(id)).sort(),
    [...PANEL_SECTIONS].sort(),
  );
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    assert.ok(guideSections.has(`${entry.tab}:${entry.section}`), `${entry.key}: unknown section ${entry.tab}:${entry.section}`);
  }
  assert.deepEqual(SETTINGS_GUIDE_MENUS.map((menu) => menu.id), menuIds);
  for (const section of SETTINGS_GUIDE_SECTIONS) {
    assert.ok(menuIds.includes(section.tab) && !NON_SETTINGS_MENUS.has(section.tab), `${section.key}: unknown menu ${section.tab}`);
  }
  const { fullscreenViews } = createSettingsMenuMetadata("general", mark, mark);
  assert.deepEqual(
    Object.fromEntries(fullscreenViews.map(({ value, label }) => [value, i18nKeysIn(label)[0]])),
    { ...SETTINGS_GUIDE_VIEW_LABELS },
  );
});

test("guide entries are complete and their i18n keys exist in every base language", () => {
  const flatten = (value, prefix = "", result = new Set()) => {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) flatten(item, path, result);
      else result.add(path);
    }
    return result;
  };
  const languages = ["LangKo.js", "LangEn.js"].map((file) => [file, flatten(readLanguageTable(file))]);
  const controls = new Set(["toggle", "range", "font-weight", "select", "color", "font", "hotkey", "curve", "helper", "action", "panel"]);
  const problems = [];
  const check = (owner, keys) => {
    for (const key of keys) {
      for (const [file, table] of languages) if (!table.has(key)) problems.push(`${owner}: ${key} missing in ${file}`);
    }
  };
  assert.equal(guideByKey.size, SETTINGS_GUIDE_SETTINGS.length, "setting keys repeat");
  for (const menu of SETTINGS_GUIDE_MENUS) if (!menu.role?.trim()) problems.push(`menu ${menu.id}: role`);
  for (const section of SETTINGS_GUIDE_SECTIONS) {
    if (!section.role?.trim()) problems.push(`section ${section.key}: role`);
    check(`section ${section.key}`, [section.title, ...asList(section.subtitle), ...asList(section.searchKeys)]);
    if (section.view !== undefined && !SETTINGS_GUIDE_VIEW_LABELS[section.view]) problems.push(`section ${section.key}: view ${section.view}`);
  }
  check("view labels", Object.values(SETTINGS_GUIDE_VIEW_LABELS));
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    if (!entry.role?.trim()) problems.push(`${entry.key}: role`);
    if (!controls.has(entry.control)) problems.push(`${entry.key}: control ${entry.control}`);
    if (entry.assistant !== undefined && entry.assistant !== "show") problems.push(`${entry.key}: assistant ${entry.assistant}`);
    if (["hotkey", "curve", "helper", "action", "panel"].includes(entry.control) && entry.assistant !== "show") {
      problems.push(`${entry.key}: ${entry.control} rows are show-only for the assistant`);
    }
    if (entry.control === "range" && !(entry.min < entry.max && entry.step > 0)) problems.push(`${entry.key}: range`);
    if (entry.control === "select" && entry.options !== "languages" && !(Array.isArray(entry.options) && entry.options.length)) {
      problems.push(`${entry.key}: options`);
    }
    for (const dependency of String(entry.visibleWhen || "").replace(/"[^"]*"/g, "").match(/[a-z0-9]+(?:[-:][a-z0-9]+)+/g) || []) {
      if (!guideByKey.has(dependency)) problems.push(`${entry.key}: visibleWhen names unknown setting ${dependency}`);
    }
    check(entry.key, [...asList(entry.label), ...asList(entry.info), ...asList(entry.column)]);
  }
  assert.deepEqual(problems, []);
});
