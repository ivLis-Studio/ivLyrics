/**
 * Settings assistant: what the AI knows and may change
 * ====================================================
 *
 * Joins the static settings guide (settingsGuide.mjs) with the live settings
 * registry (settingsRegistry.mjs, read from the element trees the menus
 * render) in order to
 *   - describe every menu, section and setting to the AI, with names in the
 *     user's interface language (buildSettingsAssistantCatalog),
 *   - check each value the AI proposes against the row's real limits and
 *     options (normalizeSettingsAssistantValue, planSettingsAssistantChanges),
 *   - save accepted values through the row's own onChange: the same save path
 *     the menus, search and the changed-settings view use
 *     (applySettingsAssistantChanges).
 *
 * Maintenance (people and AI agents)
 *   - Do not describe settings here. Add or fix the entry in settingsGuide.mjs;
 *     the catalog, the checks and the rows shown in the chat follow from it.
 *   - Do not save values any other way. Values go through the registry entry's
 *     onChange, so previews, events and side effects match the menus exactly.
 *   - A new control type needs a guide `control` name, a branch in
 *     normalizeSettingsAssistantValue and an entry in
 *     SETTINGS_ASSISTANT_EDITABLE_CONTROLS. Until then mark its rows
 *     assistant: "show" in the guide; the AI then only points to them.
 */
import {
  SETTINGS_GUIDE_MENUS, SETTINGS_GUIDE_SECTIONS, SETTINGS_GUIDE_SETTINGS, SETTINGS_GUIDE_VIEW_LABELS,
} from "./settingsGuide.mjs";
import { SETTINGS_TAB_TRANSLATION_KEYS } from "./settingsMenuMetadata.mjs";
import { getSettingsSelectionEntries } from "./settingsChoiceControls.mjs";
import { commitSettingsControlValue, isSettingsControlDisabled } from "./settingsControlCommit.mjs";

// Controls the assistant may set by itself. Hotkeys, the karaoke curve, Helper
// toggles, action buttons and custom panels are only shown to the user.
export const SETTINGS_ASSISTANT_EDITABLE_CONTROLS = new Set(["toggle", "range", "font-weight", "select", "color", "font"]);

export const SETTINGS_GUIDE_ENTRY_BY_KEY = new Map(SETTINGS_GUIDE_SETTINGS.map((entry) => [entry.key, entry]));
// Section keys are unique across menus; the AI names sections by key alone.
export const SETTINGS_GUIDE_SECTION_BY_KEY = new Map(SETTINGS_GUIDE_SECTIONS.map((section) => [section.key, section]));

const FONT_NAME_MAX_LENGTH = 160;
const keyList = (value) => (value === undefined ? [] : [].concat(value)).filter(Boolean);
const plainText = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Text of one or more i18n keys joined the way the menus join them.
export function translateSettingsGuideText(translate, keys) {
  return keyList(keys).map((key) => {
    const value = plainText(translate(key));
    return value && value !== key ? value : "";
  }).filter(Boolean).join(" · ");
}

// Visible name of a setting row, with its layer-table column first.
export function getSettingsAssistantLabel(entry, translate) {
  if (!entry) return "";
  const labelKeys = keyList(entry.label);
  const keys = entry.column && !labelKeys.includes(entry.column) ? [entry.column, ...labelKeys] : labelKeys;
  return translateSettingsGuideText(translate, keys) || entry.key;
}

export const getSettingsMenuLabel = (tabId, translate) =>
  translateSettingsGuideText(translate, SETTINGS_TAB_TRANSLATION_KEYS[tabId]) || tabId;

// "Menu › Section" (plus the fullscreen view other than the basic one).
export function getSettingsAssistantLocation(tabId, sectionKey, translate) {
  const section = SETTINGS_GUIDE_SECTION_BY_KEY.get(sectionKey);
  const parts = [getSettingsMenuLabel(tabId, translate)];
  if (section?.view && section.view !== "basic") parts.push(translateSettingsGuideText(translate, SETTINGS_GUIDE_VIEW_LABELS[section.view]));
  if (section) parts.push(translateSettingsGuideText(translate, section.title));
  return parts.filter(Boolean).join(" › ");
}

export function isSettingsAssistantEditable(entry, registryEntry) {
  return Boolean(entry && registryEntry && entry.assistant !== "show"
    && SETTINGS_ASSISTANT_EDITABLE_CONTROLS.has(entry.control));
}

// Value formats are explained once in the prompt rules; each line only names
// the control and its limits.
const describeControl = (entry, registryEntry) => {
  const item = registryEntry?.item;
  switch (entry.control) {
    case "toggle": return "toggle";
    case "range": {
      const min = item?.min ?? entry.min, max = item?.max ?? entry.max, step = item?.step ?? entry.step;
      return `number ${min}..${max} step ${step}${entry.unit ? ` ${entry.unit}` : ""}`;
    }
    case "font-weight": return "weight";
    case "color": return "color";
    case "font": return "font";
    case "select": {
      const options = item ? getSettingsSelectionEntries(item.options) : [];
      if (options.length) {
        return "one of " + options.map(([value, label]) => {
          const text = plainText(label);
          return text && text !== value ? `${JSON.stringify(value)} (${text})` : JSON.stringify(value);
        }).join(", ");
      }
      return Array.isArray(entry.options) ? "one of " + entry.options.map((value) => JSON.stringify(value)).join(", ") : "select";
    }
    default: return entry.control;
  }
};

/**
 * Plain-text description of every menu, section and setting for the system
 * prompt. Names are in the interface language; roles are the guide's English
 * explanations. The text only changes with the interface language, so
 * providers that cache prompt prefixes can reuse it between messages.
 */
export function buildSettingsAssistantCatalog({ translate, registryByKey }) {
  const lines = ["MENUS (id \"name\": what it holds)"];
  for (const menu of SETTINGS_GUIDE_MENUS) {
    lines.push(`- ${menu.id} \"${getSettingsMenuLabel(menu.id, translate)}\": ${menu.role}`);
  }
  lines.push("", "FULLSCREEN VIEWS (switch at the top of the fullscreen menu): " + Object.entries(SETTINGS_GUIDE_VIEW_LABELS)
    .map(([view, key]) => `${view} \"${translateSettingsGuideText(translate, key)}\"`).join(", "));
  lines.push("", "SECTIONS AND SETTINGS");
  const settingsBySection = new Map();
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    const id = `${entry.tab}:${entry.section}`;
    if (!settingsBySection.has(id)) settingsBySection.set(id, []);
    settingsBySection.get(id).push(entry);
  }
  for (const menu of SETTINGS_GUIDE_MENUS) {
    for (const section of SETTINGS_GUIDE_SECTIONS.filter((candidate) => candidate.tab === menu.id)) {
      const view = section.view ? ` (view ${section.view})` : "";
      lines.push(`## section ${section.key} \"${translateSettingsGuideText(translate, section.title)}\" in menu ${section.tab}${view}: ${section.role}`);
      for (const entry of settingsBySection.get(`${section.tab}:${section.key}`) || []) {
        const registryEntry = registryByKey.get(entry.key);
        const parts = [`- ${entry.key} \"${getSettingsAssistantLabel(entry, translate)}\"`, describeControl(entry, registryEntry)];
        if (entry.default !== undefined) parts.push(`default ${JSON.stringify(entry.default)}`);
        if (entry.visibleWhen) parts.push(`shown when ${entry.visibleWhen}`);
        if (!isSettingsAssistantEditable(entry, registryEntry)) parts.push("SHOW-ONLY");
        lines.push(`${parts.join("; ")} — ${entry.role}`);
      }
    }
  }
  return lines.join("\n");
}

// Values that differ from the defaults, so relative requests ("bigger") start
// from what the user has now. Settings that are not listed are at default.
export function readChangedSettingsForAssistant({ registryByKey, isSettingChanged, readValue }) {
  const changed = {};
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    if (!registryByKey.has(entry.key) || !SETTINGS_ASSISTANT_EDITABLE_CONTROLS.has(entry.control)) continue;
    if (isSettingChanged(entry.key)) changed[entry.key] = readValue(entry.key);
  }
  return changed;
}

const decimals = (step) => {
  const text = String(step);
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
};

// Accepts numbers and text that starts with one ("48", "48px", "2.5s").
const parseNumber = (value) => {
  if (typeof value === "number") return value;
  const match = String(value ?? "").trim().match(/^[-+]?(?:\d+\.?\d*|\.\d+)/);
  return match ? Number(match[0]) : Number.NaN;
};

const normalizeNumber = (value, min, max, step) => {
  const requested = parseNumber(value);
  if (!Number.isFinite(requested)) return { ok: false, reason: "not-a-number" };
  const clamped = Math.min(max, Math.max(min, requested));
  const snapped = step > 0 ? min + Math.round((clamped - min) / step) * step : clamped;
  const next = Number(Math.min(max, Math.max(min, snapped)).toFixed(Math.min(6, decimals(step))));
  return { ok: true, value: next, adjusted: next !== requested };
};

/**
 * Converts a value the AI proposed into what the row's control would save, or
 * explains why it cannot. Numbers are clamped and snapped to the row's limits
 * (`adjusted` reports it); selects accept an option value or its visible label
 * and convert numeric options the way ConfigSelection does.
 */
export function normalizeSettingsAssistantValue(entry, item, value) {
  switch (entry.control) {
    case "toggle": {
      if (typeof value === "boolean") return { ok: true, value };
      const text = String(value ?? "").trim().toLowerCase();
      if (["true", "on", "1", "yes"].includes(text)) return { ok: true, value: true };
      if (["false", "off", "0", "no"].includes(text)) return { ok: true, value: false };
      return { ok: false, reason: "not-a-toggle" };
    }
    case "range":
      return normalizeNumber(value, Number(item?.min ?? entry.min), Number(item?.max ?? entry.max), Number(item?.step ?? entry.step));
    case "font-weight":
      return normalizeNumber(value, 100, 900, 100);
    case "select": {
      const options = getSettingsSelectionEntries(item?.options);
      const text = String(value ?? "").trim();
      const lower = text.toLocaleLowerCase();
      const match = options.find(([optionValue]) => optionValue === text)
        || options.find(([optionValue]) => optionValue.toLocaleLowerCase() === lower)
        || options.find(([, label]) => plainText(label).toLocaleLowerCase() === lower);
      if (!match) return { ok: false, reason: "unknown-option" };
      const [optionValue] = match;
      // ConfigSelection saves numeric option keys as integers.
      return { ok: true, value: optionValue !== "" && !Number.isNaN(Number(optionValue)) ? Number.parseInt(optionValue, 10) : optionValue };
    }
    case "color": {
      const text = String(value ?? "").trim().replace(/^#?/, "#").toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(text)) return { ok: true, value: text };
      if (/^#[0-9a-f]{3}$/.test(text)) return { ok: true, value: "#" + [...text.slice(1)].map((digit) => digit + digit).join("") };
      return { ok: false, reason: "not-a-color" };
    }
    case "font": {
      // Font names end up in CSS font-family lists; keep only name characters.
      const text = String(value ?? "").replace(/[;{}<>\\]/g, "").replace(/\s+/g, " ").trim();
      if (!text || text.length > FONT_NAME_MAX_LENGTH) return { ok: false, reason: "not-a-font" };
      return { ok: true, value: text };
    }
    default:
      return { ok: false, reason: "show-only" };
  }
}

/**
 * Checks the AI's proposed changes. Returns
 *   accepted: [{ key, value, previous, adjusted, unchanged }]
 *   rejected: [{ key, reason }]
 * Nothing is saved here.
 */
export function planSettingsAssistantChanges(changes, { registryByKey, readValue, valuesEqual }) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const change of changes || []) {
    const key = String(change?.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry = SETTINGS_GUIDE_ENTRY_BY_KEY.get(key);
    const registryEntry = registryByKey.get(key);
    if (!entry) {
      rejected.push({ key, reason: "unknown-setting" });
      continue;
    }
    if (!isSettingsAssistantEditable(entry, registryEntry)) {
      rejected.push({ key, reason: "show-only" });
      continue;
    }
    if (isSettingsControlDisabled(registryEntry.item.disabled)) {
      rejected.push({ key, reason: "disabled" });
      continue;
    }
    const result = normalizeSettingsAssistantValue(entry, registryEntry.item, change.value);
    if (!result.ok) {
      rejected.push({ key, reason: result.reason });
      continue;
    }
    const previous = readValue(key);
    accepted.push({
      key, value: result.value, previous, adjusted: Boolean(result.adjusted),
      unchanged: valuesEqual(previous, result.value),
    });
  }
  return { accepted, rejected };
}

/**
 * Saves accepted changes through each row's registry onChange (the menus' own
 * save handlers). Returns the changes that were saved and those that failed.
 */
export function applySettingsAssistantChanges(changes, { registryByKey, onSaveError }) {
  const applied = [];
  const failed = [];
  for (const change of changes) {
    if (change.unchanged) continue;
    const registryEntry = registryByKey.get(change.key);
    const saved = registryEntry
      && commitSettingsControlValue((value) => registryEntry.onChange(change.key, value), onSaveError, change.value);
    if (saved) applied.push(change);
    else failed.push({ key: change.key, reason: "save-failed" });
  }
  return { applied, failed };
}
