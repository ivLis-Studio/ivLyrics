import assert from "node:assert/strict";
import test from "node:test";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import {
  buildUsageGuideCatalog, listUsageGuideUiNames, USAGE_GUIDE_MAX_CHARS, USAGE_GUIDE_TOPICS,
} from "../src/features/settings/usageGuide.mjs";
import { SETTINGS_GUIDE_ENTRY_BY_KEY, SETTINGS_GUIDE_SECTION_BY_KEY } from "../src/features/settings/settingsAssistantCatalog.mjs";
import { createSettingsAssistantSession } from "../src/features/settings/settingsAssistantSession.mjs";

// usageGuide.mjs is what the settings assistant knows about features outside
// the settings rows. These tests keep its UI names, settings and links real.

const lookup = (table, key) => key.split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), table);
const languages = ["LangKo.js", "LangEn.js"].map((file) => [file, readLanguageTable(file)]);
const translatorFor = (table) => (key) => {
  const value = lookup(table, key);
  return typeof value === "string" ? value : "";
};

test("every usage topic has an id, a title, a way in and steps", () => {
  assert.ok(USAGE_GUIDE_TOPICS.length > 0);
  const ids = new Set();
  for (const topic of USAGE_GUIDE_TOPICS) {
    assert.match(topic.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${topic.id} is not kebab-case`);
    assert.ok(!ids.has(topic.id), `${topic.id} is listed twice`);
    ids.add(topic.id);
    assert.ok(String(topic.title || "").trim(), `${topic.id} has no title`);
    assert.ok([].concat(topic.access || []).length > 0, `${topic.id} has no access path`);
    assert.ok([].concat(topic.steps || []).length > 0, `${topic.id} has no steps`);
  }
});

test("every UI name in the usage guide exists in the Korean and English language files", () => {
  for (const topic of USAGE_GUIDE_TOPICS) {
    for (const { key, fallback } of listUsageGuideUiNames(topic)) {
      if (fallback !== undefined) continue;
      for (const [file, table] of languages) {
        const value = lookup(table, key);
        assert.ok(typeof value === "string" && value.trim(), `${topic.id}: [[${key}]] is missing in ${file}`);
      }
    }
  }
});

test("related settings and topics point to entries that exist", () => {
  const ids = new Set(USAGE_GUIDE_TOPICS.map((topic) => topic.id));
  for (const topic of USAGE_GUIDE_TOPICS) {
    for (const key of [].concat(topic.settings || [])) {
      assert.ok(SETTINGS_GUIDE_ENTRY_BY_KEY.has(key) || SETTINGS_GUIDE_SECTION_BY_KEY.has(key),
        `${topic.id}: setting ${key} is not in settingsGuide.mjs`);
    }
    for (const id of [].concat(topic.related || [])) {
      assert.ok(ids.has(id) && id !== topic.id, `${topic.id}: related topic ${id} does not exist`);
    }
  }
});

test("the rendered guide uses the interface language and stays within its size budget", () => {
  for (const [file, table] of languages) {
    const catalog = buildUsageGuideCatalog({ translate: translatorFor(table) });
    assert.doesNotMatch(catalog, /\[\[|\]\]/, `${file}: an unrendered UI name is left in the guide`);
    assert.ok(catalog.length <= USAGE_GUIDE_MAX_CHARS, `${file}: the guide has ${catalog.length} characters (limit ${USAGE_GUIDE_MAX_CHARS})`);
    for (const topic of USAGE_GUIDE_TOPICS) assert.ok(catalog.includes(`## how-to ${topic.id}: `), `${file}: ${topic.id} is not rendered`);
  }
  const [, korean] = languages[0];
  const sample = listUsageGuideUiNames(USAGE_GUIDE_TOPICS[0]).find((name) => name.fallback === undefined);
  if (sample) assert.ok(buildUsageGuideCatalog({ translate: translatorFor(korean) }).includes(`"${lookup(korean, sample.key).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}"`));
});

test("the settings assistant sends the usage guide after the settings catalog", async () => {
  const [, english] = languages[1];
  const requests = [];
  const session = createSettingsAssistantSession({ createId: (() => { let id = 0; return () => `m${++id}`; })() });
  const sent = await session.send("How do I add synced lyrics to a song?", {
    readRegistry: () => [],
    readValue: () => undefined,
    isSettingChanged: () => false,
    valuesEqual: (first, second) => String(first) === String(second),
    translate: translatorFor(english),
    readLanguage: () => ({ code: "en", name: "English" }),
    request: async (prompt) => {
      requests.push(prompt);
      return { reply: "1. Open the lyrics page.", show: [] };
    },
    onSaveError: (error) => { throw error; },
  });
  assert.equal(sent, true);
  const { systemPrompt } = requests[0];
  const settingsAt = systemPrompt.indexOf("SECTIONS AND SETTINGS");
  // The rules mention the guide by name too; find the guide's own header.
  const guideAt = systemPrompt.indexOf("\nHOW-TO GUIDE (");
  assert.ok(settingsAt >= 0 && guideAt > settingsAt, "the guide follows the settings catalog");
  assert.match(systemPrompt, /answered from the HOW-TO GUIDE/);
  for (const topic of USAGE_GUIDE_TOPICS) assert.ok(systemPrompt.includes(`## how-to ${topic.id}: `), topic.id);
  assert.equal(session.getState().messages.at(-1).text, "1. Open the lyrics page.");
});

