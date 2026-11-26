/**
 * Settings assistant: prompt and reply format
 * ===========================================
 *
 * The system prompt holds the rules and the settings catalog
 * (settingsAssistantCatalog.mjs). It only changes with the interface language,
 * so providers that cache prompt prefixes can reuse it. The user prompt holds
 * what changes per message: current non-default values, the recent
 * conversation and the new message.
 *
 * The AI answers with one JSON object:
 *   {
 *     "reply":   text for the user, in the user's language,
 *     "changes": [{ "key": setting key, "value": new value }],
 *     "show":    [setting or section keys to show as rows or links]
 *   }
 * readSettingsAssistantReply accepts small deviations (a changes map, a
 * missing list) and returns null when nothing usable came back.
 *
 * Maintenance: when you add a field to the reply, update the JSON shape in
 * SETTINGS_ASSISTANT_RULES, readSettingsAssistantReply and the session that
 * consumes it (settingsAssistantSession.mjs).
 */

const MAX_REPLY_LENGTH = 4000;
const MAX_CHANGES = 24;
const MAX_SHOWN = 12;
const HISTORY_MESSAGES = 8;
const HISTORY_TEXT_LENGTH = 600;

const SETTINGS_ASSISTANT_RULES = [
  "You are the settings assistant inside ivLyrics, a lyrics extension for the Spotify desktop app (Spicetify). You help the user find, understand and change ivLyrics settings.",
  "",
  "Rules:",
  "- Use only the menus, sections, settings and values listed in the catalog below. Never invent keys or values.",
  "- Write \"reply\" in the language of the user's latest message. Use the interface language named in the request only when that language is unclear.",
  "- Keep replies short and friendly: one to three sentences. Call settings by their quoted names and say where they are (menu › section); do not show keys to the user.",
  "- Act on what the user wants. A request or a how-to question about a result (\"hide the controller\", \"how do I hide the controller in fullscreen?\") means: put the change in \"changes\" and say what you changed. Only questions about what a setting does or where it is are answered without changing anything. If a setting already has the wanted value, say so and show it.",
  "- When a request has an obvious reading, act on it instead of asking: \"make the lyrics bigger\" raises the original lyric size by a few steps. Ask one short question only when the possible readings lead to clearly different results, and show the candidate settings.",
  "- Values must follow the catalog: toggle true or false; number within its range and step; weight 100 to 900 in steps of 100; select one of the listed values (use the value, not its name); color \"#rrggbb\"; font a font family name or a comma-separated fallback list (Google Fonts load automatically).",
  "- If a setting is only shown when another setting has a certain value (\"shown when\"), change that setting too when needed and mention it.",
  "- Relative requests (bigger, a bit faster, darker) start from the current value. Current values that differ from the defaults are listed in the request; every other setting is at its default.",
  "- SHOW-ONLY settings (keyboard shortcuts, the karaoke fill curve, Helper app switches, buttons, provider tables and other panels, the interface language) cannot be changed by you: put them in \"show\" and tell the user they can change them in the row shown below your reply.",
  "- Every key in \"changes\" and \"show\" appears below your reply as its real setting row. In \"show\", list the specific settings the user should see; use a section key only for panels without listed settings (provider tables, presets, cloud sync, account) or when the answer is about a whole section.",
  "- Change only what the user asked for, plus required dependencies. If the user confirms an earlier suggestion (\"yes\", \"do it\"), apply it now.",
  "- If nothing in the catalog fits, say so briefly and show the closest settings.",
  "",
  "Answer with one JSON object and nothing else (no markdown):",
  "{\"reply\": \"...\", \"changes\": [{\"key\": \"...\", \"value\": ...}], \"show\": [\"...\"]}",
].join("\n");

const shorten = (text, length) => {
  const value = String(text ?? "").trim();
  return value.length > length ? value.slice(0, length - 1) + "…" : value;
};

// One line per earlier message. Assistant turns also record what happened to
// their changes, so follow-ups such as "undo that" or "a bit more" make sense.
function describeHistoryMessage(message) {
  if (message.role === "user") return `User: ${shorten(message.text, HISTORY_TEXT_LENGTH)}`;
  const notes = [];
  const changed = (message.changes || []).map((change) => `${change.key}=${JSON.stringify(change.value)}`);
  if (changed.length) notes.push((message.undone ? "changed, then undone by the user: " : "changed: ") + changed.join(", "));
  const rejected = (message.rejected || []).map((item) => `${item.key} (${item.reason})`);
  if (rejected.length) notes.push("not changed: " + rejected.join(", "));
  if (message.show?.length) notes.push("shown: " + message.show.join(", "));
  if (message.status === "error") notes.push("the request failed");
  if (message.status === "stopped") notes.push("stopped by the user");
  const text = shorten(message.text, HISTORY_TEXT_LENGTH);
  return `Assistant: ${text || "(no text)"}${notes.length ? ` [${notes.join("; ")}]` : ""}`;
}

/**
 * @param {{ catalog: string, language: { code: string, name: string },
 *   changedValues: Object, history: Object[], message: string }} input
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildSettingsAssistantPrompt({ catalog, language, changedValues, history, message }) {
  const recent = (history || []).filter((item) => item.role === "user" || item.role === "assistant").slice(-HISTORY_MESSAGES);
  const userPrompt = [
    `Interface language: ${language?.name || language?.code || "English"} (${language?.code || "en"})`,
    `Current values that differ from the defaults: ${JSON.stringify(changedValues || {})}`,
    recent.length ? "Conversation so far:\n" + recent.map(describeHistoryMessage).join("\n") : "Conversation so far: (none)",
    `New message from the user:\n${String(message ?? "").trim()}`,
  ].join("\n\n");
  return { systemPrompt: `${SETTINGS_ASSISTANT_RULES}\n\n${catalog}`, userPrompt };
}

const readKeys = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((item) => (typeof item === "string" ? item : item?.key))
  .filter((key) => typeof key === "string" && key.trim())
  .map((key) => key.trim());

/**
 * Normalizes the AI's JSON reply, or returns null when it holds nothing usable.
 * @returns {{ reply: string, changes: {key: string, value: any}[], show: string[] } | null}
 */
export function readSettingsAssistantReply(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const replyText = [raw.reply, raw.message, raw.text, raw.answer].find((value) => typeof value === "string") || "";
  let changes = [];
  if (Array.isArray(raw.changes)) {
    changes = raw.changes
      .filter((change) => change && typeof change === "object" && typeof change.key === "string" && "value" in change)
      .map((change) => ({ key: change.key.trim(), value: change.value }));
  } else if (raw.changes && typeof raw.changes === "object") {
    changes = Object.entries(raw.changes).map(([key, value]) => ({ key: key.trim(), value }));
  }
  const show = [...new Set(readKeys(raw.show))];
  const reply = shorten(replyText, MAX_REPLY_LENGTH);
  if (!reply && !changes.length && !show.length) return null;
  return { reply, changes: changes.filter((change) => change.key).slice(0, MAX_CHANGES), show: show.slice(0, MAX_SHOWN) };
}
