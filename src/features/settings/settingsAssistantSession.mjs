/**
 * Settings assistant: conversation
 * ================================
 *
 * Keeps the chat of the settings assistant for as long as Spotify runs, so it
 * survives switching menus and closing/reopening the settings window. Each
 * message goes to the user's AI provider; the reply's changes are checked and
 * saved by settingsAssistantCatalog.mjs through the settings registry.
 *
 * How-to guide (usageGuide.mjs): the system prompt carries the settings
 * catalog and the guide's index, one line per topic. Each message also
 * carries the full text of the topics selectUsageGuideTopics() picks for it.
 * When the AI needs a topic that was not sent, it answers with only
 * "guide": [topic ids]; send() then repeats the request once with those
 * topics and keeps the second answer. It never asks a third time.
 *
 * The settings window rebuilds its handlers on every render, so callers pass a
 * fresh `runtime` with each send/undo:
 *   readRegistry()        settings registry entries for every menu (buildSettingsRegistry)
 *   readValue(key)        current stored value (the background mode included)
 *   isSettingChanged(key) whether the value differs from the default
 *   valuesEqual(a, b)     the settings window's value comparison
 *   translate(key)        I18n.t
 *   readLanguage()        { code, name } of the interface language
 *   request(prompt, signal)  AIAddonManager.generateSettingsAssistant
 *   onSaveError(error)    the settings window's save error report
 *
 * Messages
 *   { id, role: "user", text }
 *   { id, role: "assistant", status, text, changes, rejected, show, guide, undone }
 *     status   "done" | "invalid" (unreadable reply) | "error" | "stopped"
 *     changes  [{ key, value, previous, adjusted }] saved by this reply
 *     rejected [{ key, reason }] proposed but not saved
 *     show     setting or section keys the reply points to
 *     guide    how-to topic ids the answering request carried, asked-for
 *              topics first; the next message carries up to two of them
 *              again for follow-ups ("and then?")
 */
import { buildSettingsAssistantPrompt, readSettingsAssistantReply } from "./settingsAssistantPrompt.mjs";
import {
  applySettingsAssistantChanges, buildSettingsAssistantCatalog, planSettingsAssistantChanges, readChangedSettingsForAssistant,
} from "./settingsAssistantCatalog.mjs";
import {
  buildUsageGuideIndex, renderUsageGuideTopics, selectUsageGuideTopics, USAGE_GUIDE_TOPIC_BY_ID, USAGE_GUIDE_TOPICS_PER_MESSAGE,
} from "./usageGuide.mjs";

const toRegistryMap = (registry) => new Map(Array.from(registry || [], (entry) => [entry.key, entry]));
const stopped = () => Object.assign(new Error("Stopped"), { name: "AbortError" });

export function createSettingsAssistantSession({ createId } = {}) {
  let sequence = 0;
  const makeId = createId || (() => `assistant-${Date.now().toString(36)}-${++sequence}`);
  let state = Object.freeze({ messages: Object.freeze([]), pending: false });
  let controller = null;
  const listeners = new Set();

  const setState = (next) => {
    state = Object.freeze({ ...state, ...next, messages: Object.freeze([...(next.messages ?? state.messages)]) });
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error("[ivLyrics] settings assistant listener failed", error);
      }
    }
  };

  const readContext = (runtime) => {
    const registryByKey = toRegistryMap(runtime.readRegistry());
    return {
      registryByKey,
      catalog: [
        buildSettingsAssistantCatalog({ translate: runtime.translate, registryByKey }),
        buildUsageGuideIndex({ translate: runtime.translate }),
      ].join("\n\n"),
      changedValues: readChangedSettingsForAssistant({
        registryByKey, isSettingChanged: runtime.isSettingChanged, readValue: runtime.readValue,
      }),
    };
  };

  async function send(text, runtime) {
    const question = String(text ?? "").trim();
    if (!question || state.pending) return false;
    const history = state.messages;
    const userMessage = { id: makeId(), role: "user", text: question };
    const ownController = typeof AbortController === "function" ? new AbortController() : null;
    controller = ownController;
    setState({ messages: [...history, userMessage], pending: true });

    let reply;
    try {
      const context = readContext(runtime);
      const language = runtime.readLanguage();
      const ask = async (topicIds, guideRequested) => {
        const prompt = buildSettingsAssistantPrompt({
          catalog: context.catalog, language, changedValues: context.changedValues, history, message: question,
          guideTopics: renderUsageGuideTopics(topicIds, { translate: runtime.translate }), guideRequested,
        });
        const raw = await runtime.request(prompt, ownController?.signal);
        if (ownController?.signal.aborted) throw stopped();
        return readSettingsAssistantReply(raw);
      };
      let topics = selectUsageGuideTopics({ message: question, history, translate: runtime.translate });
      let parsed = await ask(topics, false);
      const requested = (parsed?.guide || [])
        .filter((id) => USAGE_GUIDE_TOPIC_BY_ID.has(id) && !topics.includes(id))
        .slice(0, USAGE_GUIDE_TOPICS_PER_MESSAGE);
      if (requested.length) {
        // Once only: the second request tells the AI to answer now.
        topics = [...requested, ...topics];
        parsed = await ask(topics, true);
      }
      if (!parsed || (!parsed.reply && !parsed.changes.length && !parsed.show.length)) {
        reply = { status: "invalid" };
      } else {
        // Values may have changed while the AI was answering; check and save
        // against the registry as it is now.
        const registryByKey = toRegistryMap(runtime.readRegistry());
        const plan = planSettingsAssistantChanges(parsed.changes, {
          registryByKey, readValue: runtime.readValue, valuesEqual: runtime.valuesEqual,
        });
        const { applied, failed } = applySettingsAssistantChanges(plan.accepted, { registryByKey, onSaveError: runtime.onSaveError });
        reply = {
          status: "done",
          text: parsed.reply,
          changes: applied.map(({ key, value, previous, adjusted }) => ({ key, value, previous, adjusted })),
          rejected: [...plan.rejected, ...failed],
          // Rows for settings the AI set to their current value are still useful.
          show: [...new Set([...plan.accepted.filter((change) => change.unchanged).map((change) => change.key), ...parsed.show])],
          guide: topics,
        };
      }
    } catch (error) {
      const stopped = ownController?.signal.aborted || error?.name === "AbortError";
      reply = stopped ? { status: "stopped" } : { status: "error", text: String(error?.message || error || "") };
    } finally {
      if (controller === ownController) controller = null;
    }

    // A new chat started while this one was waiting; its answer is dropped.
    if (!state.messages.some((message) => message.id === userMessage.id)) return false;
    setState({
      messages: [...state.messages, {
        id: makeId(), role: "assistant", text: "", changes: [], rejected: [], show: [], guide: [], undone: false, ...reply,
      }],
      pending: false,
    });
    return true;
  }

  // Restores the values a reply changed, through the same save handlers.
  function undo(messageId, runtime) {
    const message = state.messages.find((candidate) => candidate.id === messageId);
    if (!message || message.undone || !message.changes?.length) return false;
    const registryByKey = toRegistryMap(runtime.readRegistry());
    const reverts = [...message.changes].reverse().map(({ key, previous }) => ({ key, value: previous }));
    const { applied } = applySettingsAssistantChanges(reverts, { registryByKey, onSaveError: runtime.onSaveError });
    if (!applied.length) return false;
    setState({ messages: state.messages.map((candidate) => (candidate.id === messageId ? { ...candidate, undone: true } : candidate)) });
    return true;
  }

  function cancel() {
    controller?.abort();
  }

  function clear() {
    cancel();
    controller = null;
    setState({ messages: [], pending: false });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send, undo, cancel, clear,
  };
}
