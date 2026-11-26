import {
  SETTINGS_GUIDE_MENUS, SETTINGS_GUIDE_SECTIONS, SETTINGS_GUIDE_SETTINGS, SETTINGS_GUIDE_VIEW_LABELS,
} from "./settingsGuide.mjs";
import { SETTINGS_TAB_TRANSLATION_KEYS } from "./settingsMenuMetadata.mjs";
import { SETTINGS_BACKGROUND_PRESETS } from "./settingsBackgroundPresets.mjs";

// Cross-menu search entries, built from settingsGuide.mjs.
//
// Only the open menu is mounted, so search needs a list of every menu,
// section and setting that does not depend on the DOM. The guide already
// describes all of them with the i18n keys the menus render, which keeps this
// list identical to the real menus: a row added to or removed from the guide
// appears in or disappears from search, and tests/settings_guide.test.mjs keeps
// the guide in step with the menus. Do not add hand-written entries here;
// describe the row in the guide instead.
//
// Entry fields (read by prepareSearchCatalog in settingsSearchIndex.mjs):
//   section/sectionKey  Menu label and menu id (the navigation tab).
//   settingKey          Row or section anchor; null for the menu itself.
//   name/desc           Text in the current interface language.
//   i18nKeys            Keys whose translations in every language also match.
//                       tabs.* and sections.* keys only add context.
//   keywords            Extra direct search words (guide aliases).
//   isTabResult         The entry is a whole menu.
// Rows inside a layer table (guide entries with `column`) keep their own
// entry; the search index merges their words into the table column's result.

const plainText = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const keyList = (value) => (value === undefined ? [] : [].concat(value)).filter(Boolean);

export function buildSettingsSearchCatalog({ translate }) {
  const text = (keys) => keyList(keys).map((key) => plainText(translate(key))).filter(Boolean).join(" · ");
  const menuLabelKey = (tabId) => SETTINGS_TAB_TRANSLATION_KEYS[tabId];
  const menuLabel = (tabId) => text(menuLabelKey(tabId)) || tabId;
  const sectionsById = new Map(SETTINGS_GUIDE_SECTIONS.map((section) => [`${section.tab}:${section.key}`, section]));
  // The fullscreen view a section belongs to also finds it ("LP", "CD", "TV
  // mode"). Basic is the default view and too generic to search for.
  const viewKeys = (section) => (section?.view && section.view !== "basic" ? [SETTINGS_GUIDE_VIEW_LABELS[section.view]] : []);

  const menus = SETTINGS_GUIDE_MENUS.filter((menu) => menuLabelKey(menu.id)).map((menu) => ({
    section: menuLabel(menu.id),
    sectionKey: menu.id,
    settingKey: null,
    name: menuLabel(menu.id),
    desc: "",
    i18nKeys: [menuLabelKey(menu.id)],
    isTabResult: true,
  }));

  const sections = SETTINGS_GUIDE_SECTIONS.map((section) => ({
    section: menuLabel(section.tab),
    sectionKey: section.tab,
    settingKey: section.key,
    name: text(section.title),
    desc: text(section.subtitle),
    i18nKeys: [menuLabelKey(section.tab), section.title, ...keyList(section.subtitle),
      ...keyList(section.searchKeys), ...viewKeys(section)],
  }));

  const settings = SETTINGS_GUIDE_SETTINGS.filter((entry) => entry.searchable !== false).map((entry) => {
    const labelKeys = keyList(entry.label);
    const nameKeys = entry.column && !labelKeys.includes(entry.column) ? [entry.column, ...labelKeys] : labelKeys;
    return {
      section: menuLabel(entry.tab),
      sectionKey: entry.tab,
      settingKey: entry.key,
      name: text(nameKeys),
      desc: text(entry.info),
      i18nKeys: [menuLabelKey(entry.tab), ...nameKeys, ...keyList(entry.info),
        ...viewKeys(sectionsById.get(`${entry.tab}:${entry.section}`))],
      keywords: keyList(entry.aliases),
    };
  });

  // Each background mode card in Appearance has its own anchor (the mode id),
  // so searching for a mode jumps to its card. "none" has no anchor.
  const backgroundModes = SETTINGS_BACKGROUND_PRESETS.filter((preset) => preset.id !== "none").map((preset) => ({
    section: menuLabel("appearance"),
    sectionKey: "appearance",
    settingKey: preset.id,
    name: text(preset.labelKey) || preset.fallbackLabel,
    desc: text(preset.descriptionKey) || preset.fallbackDescription,
    i18nKeys: [menuLabelKey("appearance"), "sections.visualEffects", preset.labelKey, preset.descriptionKey],
  }));

  return [...menus, ...sections, ...settings, ...backgroundModes];
}
