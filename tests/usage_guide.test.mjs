import assert from "node:assert/strict";
import test from "node:test";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import {
  buildUsageGuideCatalog, buildUsageGuideIndex, listUsageGuideUiNames, readUsageGuideSearchTerms, selectUsageGuideTopics,
  USAGE_GUIDE_MAX_CHARS, USAGE_GUIDE_TOPICS, USAGE_GUIDE_TOPICS_PER_MESSAGE,
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
const [, korean] = languages[0];
const [, english] = languages[1];

// Typical questions and the topic each must bring along, in both interfaces.
// When you add a topic or change its questions, add how users ask for it here.
const TOPIC_CHOICES = [
  ["가사에 싱크를 등록하고 싶은데 어떻게 해?", "sync-creator"],
  ["영상은 내가 수동으로 등록 못해?", "video-submit"],
  ["How do I add synced lyrics to a song?", "sync-creator"],
  ["Can I add a background video myself?", "video-submit"],
  ["노래방 싱크 만드는 법 알려줘", "sync-creator"],
  ["유튜브 영상 배경으로 직접 넣고 싶어", "video-submit"],
  ["Can I upload my own music video?", "video-submit"],
  ["번역 어떻게 켜?", "translation-pronunciation"],
  ["API 키 어디에 넣어?", "ai-provider-setup"],
  ["ivLyrics 지우고 싶어", "uninstall-ivlyrics"],
  ["렉이 너무 심해요", "performance"],
  ["Why is ivLyrics so slow?", "performance"],
  ["LRC 파일 넣을 수 있어?", "local-file-lyrics"],
  ["모션 가사 어떻게 봐?", "motion-lyrics"],
  ["가사가 너무 늦게 나와요", "lyrics-sync-offset"],
  ["번역 틀린 줄 하나만 고치고 싶어", "lyrics-cache-editor"],
  ["게임 화면 위에 가사 보이게", "overlay"],
  ["OBS에 가사 띄우는 법", "lyrics-helper"],
  ["설정 다른 컴퓨터로 옮기기", "backup-restore"],
  ["제출한 싱크 언제 승인돼?", "sync-creator-submit"],
  ["작업하던 싱크 날아갔어", "sync-creator-backup"],
  ["발음을 노래방처럼 따라 부르고 싶어", "pronunciation-first"],
  ["How can I change fullscreen to the whole monitor?", "fullscreen-display"],
  ["TV mode", "fullscreen-views"],
  ["How do I report a bug?", "troubleshooting"],
  ["어시스턴트가 응답을 안 해", "settings-assistant"],
  ["가사로 일본어 공부", "learning-mode"],
  ["디스코드 계정 연결", "discord-login"],
];

function guideRuntime(translate, request) {
  return {
    readRegistry: () => [],
    readValue: () => undefined,
    isSettingChanged: () => false,
    valuesEqual: (first, second) => String(first) === String(second),
    translate,
    readLanguage: () => ({ code: "en", name: "English" }),
    request,
    onSaveError: (error) => { throw error; },
  };
}

const newSession = () => {
  let id = 0;
  return createSettingsAssistantSession({ createId: () => `m${++id}` });
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
    const index = buildUsageGuideIndex({ translate: translatorFor(table) }).split("\n");
    assert.match(index[0], /^HOW-TO GUIDE INDEX \(/);
    assert.deepEqual(index.slice(1).map((line) => line.slice(2, line.indexOf(": "))), USAGE_GUIDE_TOPICS.map((topic) => topic.id),
      `${file}: the index has one line per topic`);
  }
  const sample = listUsageGuideUiNames(USAGE_GUIDE_TOPICS[0]).find((name) => name.fallback === undefined);
  if (sample) assert.ok(buildUsageGuideCatalog({ translate: translatorFor(korean) }).includes(`"${lookup(korean, sample.key).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}"`));
});

test("typical questions bring their topic in the Korean and English interfaces", () => {
  for (const [file, table] of languages) {
    const translate = translatorFor(table);
    for (const [question, id] of TOPIC_CHOICES) {
      const chosen = selectUsageGuideTopics({ message: question, translate });
      assert.ok(chosen.includes(id), `${file}: "${question}" brought ${chosen.join(", ") || "no topic"} instead of ${id}`);
      assert.ok(chosen.length <= USAGE_GUIDE_TOPICS_PER_MESSAGE);
    }
  }
});

test("search terms split scripts, keep Korean nouns without particles and skip question words", () => {
  const terms = readUsageGuideSearchTerms("ivLyrics가 렉이 심해요. How do I add videos?");
  for (const term of ["ivlyric", "렉", "심해", "add", "video"]) assert.ok(terms.has(term), term);
  for (const term of ["ivlyrics가", "해요", "how", "do"]) assert.ok(!terms.has(term), term);
  assert.deepEqual([...readUsageGuideSearchTerms("어떻게 해?")], []);
});

test("follow-up messages keep the topics of the previous answer", () => {
  const translate = translatorFor(korean);
  const history = [
    { role: "user", text: "싱크 등록 어떻게 해?" },
    { role: "assistant", text: "1. ...", guide: ["sync-creator-record", "sync-creator-submit", "sync-creator"] },
  ];
  const chosen = selectUsageGuideTopics({ message: "그 다음은?", history, translate });
  assert.ok(chosen.includes("sync-creator-record") && chosen.includes("sync-creator-submit"), chosen.join(", "));
  assert.ok(chosen.length <= USAGE_GUIDE_TOPICS_PER_MESSAGE + 2);
});

test("the settings assistant sends the guide index, and the full text of the topics that fit the message", async () => {
  const requests = [];
  const session = newSession();
  const sent = await session.send("How do I add synced lyrics to a song?", guideRuntime(translatorFor(english), async (prompt) => {
    requests.push(prompt);
    return { reply: "1. Open the lyrics page.", show: [] };
  }));
  assert.equal(sent, true);
  assert.equal(requests.length, 1);
  const { systemPrompt, userPrompt, cacheSystemPrompt } = requests[0];
  const settingsAt = systemPrompt.indexOf("SECTIONS AND SETTINGS");
  // The rules mention the index by name too; find the index's own header.
  const indexAt = systemPrompt.indexOf("\nHOW-TO GUIDE INDEX (");
  assert.ok(settingsAt >= 0 && indexAt > settingsAt, "the index follows the settings catalog");
  const index = systemPrompt.slice(indexAt);
  for (const topic of USAGE_GUIDE_TOPICS) assert.ok(index.includes(`\n- ${topic.id}: `), topic.id);
  assert.doesNotMatch(systemPrompt, /## how-to /, "topic text stays out of the system prompt");
  assert.match(systemPrompt, /"guide": \["topic-id"\]/, "the rules explain how to ask for a topic");
  assert.equal(cacheSystemPrompt, true);
  assert.match(userPrompt, /HOW-TO TOPICS \(full text/);
  assert.ok(userPrompt.includes("## how-to sync-creator: "));
  assert.match(userPrompt, /New message from the user:\nHow do I add synced lyrics to a song\?$/);
  const answer = session.getState().messages.at(-1);
  assert.equal(answer.text, "1. Open the lyrics page.");
  assert.deepEqual([...answer.guide], selectUsageGuideTopics({ message: "How do I add synced lyrics to a song?", translate: translatorFor(english) }));
});

test("a reply that asks for topics is sent once more with them", async () => {
  const translate = translatorFor(english);
  const question = "Can I add a background video myself?";
  const first = selectUsageGuideTopics({ message: question, translate });
  const [wanted, another] = USAGE_GUIDE_TOPICS.map((topic) => topic.id).filter((id) => !first.includes(id));
  const requests = [];
  const answers = [{ reply: "", guide: [wanted, "no-such-topic"] }, { reply: "1. Open the video menu.", show: [] }];
  const session = newSession();
  await session.send(question, guideRuntime(translate, async (prompt) => {
    requests.push(prompt);
    return answers[requests.length - 1];
  }));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].systemPrompt, requests[0].systemPrompt, "the cached part stays the same");
  assert.match(requests[1].userPrompt, /HOW-TO TOPICS \(the topics you asked for/);
  assert.ok(requests[1].userPrompt.includes(`## how-to ${wanted}: `));
  for (const id of first) assert.ok(requests[1].userPrompt.includes(`## how-to ${id}: `), `${id} is sent again`);
  const answer = session.getState().messages.at(-1);
  assert.equal(answer.status, "done");
  assert.equal(answer.text, "1. Open the video menu.");
  assert.deepEqual([...answer.guide], [wanted, ...first]);

  // Topics already sent or unknown are not sent again, and the AI is never
  // asked a third time; an answer without text is unreadable.
  for (const replies of [[{ guide: [first[0], "no-such-topic"] }], [{ guide: [wanted] }, { guide: [another] }]]) {
    const calls = [];
    const retry = newSession();
    await retry.send(question, guideRuntime(translate, async (prompt) => {
      calls.push(prompt);
      return replies[calls.length - 1];
    }));
    assert.equal(calls.length, replies.length);
    assert.equal(retry.getState().messages.at(-1).status, "invalid");
  }
});

