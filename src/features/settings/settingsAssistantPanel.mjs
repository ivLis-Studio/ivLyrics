/**
 * Settings assistant: chat panel
 * ==============================
 *
 * The "AI Assistant" menu of the settings window. The user describes what
 * they want; the AI (the user's own provider with the "Settings assistant"
 * capability) answers in the user's language, changes the matching settings
 * and the panel shows those settings as the real setting rows.
 *
 * Rows in the chat are the menus' own rows: registry entries rendered with the
 * settings window's OptionList and saved through the entry's onChange, exactly
 * like the changed-settings view (settingsChangedView.mjs). Keep it that way:
 *   - Never draw a custom control for the chat. If a setting cannot appear as
 *     a row, describe it in settingsGuide.mjs (control "panel", assistant
 *     "show") and give its menu row a data-setting-key; the chat then shows a
 *     card that opens it in its menu.
 *   - New settings need no change here. Add them to the menu and to
 *     settingsGuide.mjs (tests/settings_guide.test.mjs lists what is missing).
 *
 * Data flow: settingsAssistantSession.mjs (conversation, request, apply/undo)
 * → settingsAssistantCatalog.mjs (guide + registry, value checks)
 * → settingsAssistantPrompt.mjs (prompt text, reply format).
 */
import {
  getSettingsAssistantLabel, getSettingsAssistantLocation, getSettingsMenuLabel,
  SETTINGS_GUIDE_ENTRY_BY_KEY, SETTINGS_GUIDE_SECTION_BY_KEY, translateSettingsGuideText,
} from "./settingsAssistantCatalog.mjs";
import { SETTINGS_BACKGROUND_MODE_KEY } from "./settingsDefaults.mjs";

// Suggestions shown before the first message, as i18n keys.
const SETTINGS_ASSISTANT_EXAMPLES = Object.freeze([
  "settingsUi.assistant.examples.autoHide",
  "settingsUi.assistant.examples.fontSize",
  "settingsUi.assistant.examples.translation",
  "settingsUi.assistant.examples.performance",
]);
const MAX_ROWS_PER_REPLY = 10;
// A section the AI points to is shown as its rows when it is this small;
// larger sections (layer tables, provider panels) get a card that opens them.
const MAX_SECTION_ROWS = 6;
const INPUT_MAX_HEIGHT = 160;

// Replies are plain text; drop Markdown emphasis some models add anyway.
const cleanReplyText = (text) => String(text || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").trim();

export function createSettingsAssistantPanel({
  react, session, translate, getSettingsText, SettingsUiIcon, SettingsOutlineIcon, OptionList,
  getCurrentSettingsBackgroundMode,
}) {
  const { useEffect, useMemo, useRef, useState } = react;
  const text = (key, fallback) => getSettingsText(`settingsUi.assistant.${key}`, fallback);

  const useSessionState = () => {
    const [snapshot, setSnapshot] = useState(session.getState);
    useEffect(() => {
      setSnapshot(session.getState());
      return session.subscribe(setSnapshot);
    }, []);
    return snapshot;
  };

  const labelOf = (key) => {
    const entry = SETTINGS_GUIDE_ENTRY_BY_KEY.get(key);
    if (entry) return getSettingsAssistantLabel(entry, translate);
    const section = SETTINGS_GUIDE_SECTION_BY_KEY.get(key);
    return section ? translateSettingsGuideText(translate, section.title) || key : key;
  };

  // A setting or section that has no registry row (custom panels, provider
  // tables, sections): a card that opens it in its menu.
  const describeLink = (key) => {
    const entry = SETTINGS_GUIDE_ENTRY_BY_KEY.get(key);
    if (entry) {
      return {
        key, tabId: entry.tab, title: getSettingsAssistantLabel(entry, translate),
        desc: translateSettingsGuideText(translate, entry.info),
        location: getSettingsAssistantLocation(entry.tab, entry.section, translate),
      };
    }
    const section = SETTINGS_GUIDE_SECTION_BY_KEY.get(key);
    if (!section) return null;
    return {
      key, tabId: section.tab, title: translateSettingsGuideText(translate, section.title) || key,
      desc: translateSettingsGuideText(translate, section.subtitle),
      location: getSettingsMenuLabel(section.tab, translate),
    };
  };

  // Setting keys stay as they are; a small section becomes its own rows.
  const expandShownKey = (key, registryByKey) => {
    if (registryByKey.has(key)) return [key];
    const section = SETTINGS_GUIDE_SECTION_BY_KEY.get(key);
    if (!section) return [key];
    const rows = [];
    for (const entry of registryByKey.values()) {
      if (entry.tabId === section.tab && entry.sectionKey === section.key) rows.push(entry.key);
    }
    return rows.length && rows.length <= MAX_SECTION_ROWS ? rows : [key];
  };

  const renderReplyRows = (message, registryByKey, navigateToDestination) => {
    const keys = [...new Set([
      ...message.changes.map((change) => change.key),
      ...message.show.flatMap((key) => expandShownKey(key, registryByKey)),
    ])].slice(0, MAX_ROWS_PER_REPLY);
    const rows = [];
    const links = [];
    for (const key of keys) {
      const entry = registryByKey.get(key);
      if (entry) rows.push(entry);
      else {
        const link = describeLink(key);
        if (link) links.push(link);
      }
    }
    return [
      rows.length ? react.createElement(OptionList, {
        key: "rows",
        items: rows.map((entry) => ({
          ...entry.item,
          defaultValue: entry.key === SETTINGS_BACKGROUND_MODE_KEY ? getCurrentSettingsBackgroundMode() : entry.item.defaultValue,
          // The user asked about this row, so show it even when its menu hides it.
          when: undefined,
          onChange: (_name, value, event) => entry.onChange(entry.key, value, event),
          jump: {
            label: getSettingsAssistantLocation(entry.tabId, entry.sectionKey, translate),
            onClick: () => navigateToDestination(entry.tabId, entry.key),
          },
        })),
      }) : null,
      ...links.map((link) => react.createElement(
        "div",
        { key: `link-${link.key}`, className: "settings-assistant-link" },
        react.createElement(
          "div",
          { className: "settings-assistant-link-text" },
          react.createElement("span", { className: "settings-assistant-link-location" }, link.location),
          react.createElement("b", null, link.title),
          link.desc ? react.createElement("span", null, link.desc) : null
        ),
        react.createElement(
          "button",
          { type: "button", className: "btn btn-sm", onClick: () => navigateToDestination(link.tabId, link.key) },
          react.createElement("span", null, text("openInSettings", "Open in settings")),
          react.createElement(SettingsUiIcon, { name: "right", size: 13 })
        )
      )),
    ];
  };

  const renderAssistantMessage = (message, { registryByKey, runtime, navigateToDestination }) => {
    let body;
    if (message.status === "error") body = text("error", "The AI request failed: {message}").replace("{message}", message.text || "-");
    else if (message.status === "invalid") body = text("invalidResponse", "The AI's answer could not be read. Please try again.");
    else if (message.status === "stopped") body = text("stopped", "Stopped.");
    else body = cleanReplyText(message.text);
    const adjusted = message.changes.filter((change) => change.adjusted).map((change) => labelOf(change.key));
    const rejected = message.rejected.map((item) => labelOf(item.key));
    return react.createElement(
      "div",
      { key: message.id, className: `settings-assistant-msg is-assistant is-${message.status}` },
      react.createElement(
        "span",
        { className: "settings-assistant-avatar", "aria-hidden": "true" },
        react.createElement(SettingsOutlineIcon, { name: "assistant", size: 15 })
      ),
      react.createElement(
        "div",
        { className: "settings-assistant-body" },
        react.createElement("span", { className: "settings-visually-hidden" }, text("name", "Assistant")),
        body ? react.createElement("p", { className: "settings-assistant-text" }, body) : null,
        message.changes.length ? react.createElement(
          "div",
          { className: "settings-assistant-changes" },
          message.undone
            ? react.createElement("span", { className: "settings-pill" },
              react.createElement(SettingsUiIcon, { name: "reset", size: 12 }), text("undone", "Changes undone"))
            : react.createElement("span", { className: "settings-pill is-ok" },
              react.createElement(SettingsUiIcon, { name: "check", size: 12 }),
              text("changedCount", "{count} settings changed").replace("{count}", String(message.changes.length))),
          message.undone ? null : react.createElement(
            "button",
            { type: "button", className: "btn btn-sm", onClick: () => session.undo(message.id, runtime) },
            react.createElement(SettingsUiIcon, { name: "reset", size: 14 }),
            react.createElement("span", null, text("undo", "Undo"))
          )
        ) : null,
        adjusted.length ? react.createElement("p", { className: "settings-assistant-note" },
          text("adjusted", "Adjusted to the allowed range: {settings}").replace("{settings}", adjusted.join(", "))) : null,
        rejected.length ? react.createElement("p", { className: "settings-assistant-note is-warning" },
          text("skipped", "Could not change: {settings}").replace("{settings}", rejected.join(", "))) : null,
        ...renderReplyRows(message, registryByKey, navigateToDestination)
      )
    );
  };

  const SettingsAssistantPanel = ({ runtime, navigateToDestination }) => {
    const { messages, pending } = useSessionState();
    const [draft, setDraft] = useState("");
    const endRef = useRef(null);
    const inputRef = useRef(null);
    const scrolledRef = useRef(false);
    const providerReady = runtime.hasProvider();
    // Fresh rows (current values and handlers) whenever the conversation changes.
    const registryByKey = useMemo(
      () => new Map(messages.some((message) => message.role === "assistant")
        ? Array.from(runtime.readRegistry(), (entry) => [entry.key, entry])
        : []),
      [messages]
    );

    useEffect(() => {
      endRef.current?.scrollIntoView?.({ block: "end", behavior: scrolledRef.current ? "smooth" : "auto" });
      scrolledRef.current = true;
    }, [messages.length, pending]);

    const resizeInput = (element) => {
      if (!element?.style) return;
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, INPUT_MAX_HEIGHT)}px`;
      // Scroll only once the text is taller than the field can grow.
      element.style.overflowY = element.scrollHeight > INPUT_MAX_HEIGHT ? "auto" : "hidden";
    };

    const submit = (value = draft) => {
      const question = String(value ?? "").trim();
      if (!question || pending || !providerReady) return;
      setDraft("");
      if (inputRef.current) {
        inputRef.current.value = "";
        resizeInput(inputRef.current);
      }
      session.send(question, runtime);
    };

    const renderEmptyState = () => react.createElement(
      "div",
      { className: "settings-assistant-empty" },
      react.createElement(
        "span",
        { className: "settings-empty-icon", "aria-hidden": "true" },
        react.createElement(SettingsOutlineIcon, { name: "assistant", size: 22 })
      ),
      react.createElement("p", null, text("intro", "Tell me what you want to change.")),
      react.createElement("div", { className: "settings-assistant-examples-title" }, text("examplesTitle", "Try asking")),
      react.createElement(
        "div",
        { className: "settings-assistant-examples" },
        ...SETTINGS_ASSISTANT_EXAMPLES.map((key) => {
          const example = getSettingsText(key, "");
          return example ? react.createElement(
            "button",
            {
              key, type: "button", className: "settings-assistant-example",
              disabled: !providerReady,
              onClick: () => submit(example),
            },
            example
          ) : null;
        })
      )
    );

    const renderProviderNotice = () => react.createElement(
      "div",
      { className: "settings-assistant-notice", role: "status" },
      react.createElement(SettingsUiIcon, { name: "info", size: 18 }),
      react.createElement(
        "div",
        { className: "settings-assistant-notice-text" },
        react.createElement("b", null, text("noProviderTitle", "No AI provider is ready")),
        react.createElement("span", null, text("noProviderDesc", "Enable an AI provider and its Settings assistant capability."))
      ),
      react.createElement(
        "button",
        { type: "button", className: "btn btn-sm", onClick: () => navigateToDestination("ai-providers", "ai-tasks") },
        react.createElement("span", null, text("openProviders", "Open AI Providers")),
        react.createElement(SettingsUiIcon, { name: "right", size: 13 })
      )
    );

    const context = { registryByKey, runtime, navigateToDestination };
    return react.createElement(
      "div",
      { className: "tab-content active settings-assistant", "data-tab-id": "assistant" },
      providerReady ? null : renderProviderNotice(),
      react.createElement(
        "div",
        {
          className: "settings-assistant-thread",
          role: "log",
          "aria-live": "polite",
          "aria-busy": pending ? "true" : undefined,
        },
        messages.length ? null : renderEmptyState(),
        ...messages.map((message) => (message.role === "user"
          ? react.createElement(
            "div",
            { key: message.id, className: "settings-assistant-msg is-user" },
            react.createElement("span", { className: "settings-visually-hidden" }, text("you", "You")),
            react.createElement("p", { className: "settings-assistant-bubble" }, message.text)
          )
          : renderAssistantMessage(message, context))),
        pending ? react.createElement(
          "div",
          { className: "settings-assistant-msg is-assistant is-pending" },
          react.createElement(
            "span",
            { className: "settings-assistant-avatar", "aria-hidden": "true" },
            react.createElement(SettingsOutlineIcon, { name: "assistant", size: 15 })
          ),
          react.createElement(
            "div",
            { className: "settings-assistant-body" },
            react.createElement(
              "p",
              { className: "settings-assistant-text settings-assistant-thinking" },
              react.createElement("span", { className: "settings-assistant-dots", "aria-hidden": "true" },
                react.createElement("i"), react.createElement("i"), react.createElement("i")),
              text("thinking", "Looking through the settings…")
            )
          )
        ) : null,
        react.createElement("div", { ref: endRef, className: "settings-assistant-end", "aria-hidden": "true" })
      ),
      react.createElement(
        "form",
        {
          className: "settings-assistant-composer",
          onSubmit: (event) => {
            event.preventDefault();
            submit();
          },
        },
        react.createElement(
          "div",
          { className: "settings-assistant-field" },
          react.createElement("textarea", {
            ref: inputRef,
            className: "settings-assistant-input",
            rows: 1,
            value: draft,
            placeholder: text("placeholder", "Ask anything about settings"),
            "aria-label": text("placeholder", "Ask anything about settings"),
            disabled: !providerReady,
            onChange: (event) => {
              setDraft(event.target.value);
              resizeInput(event.target);
            },
            onKeyDown: (event) => {
              // Enter sends; Shift+Enter adds a line. Enter that finishes an
              // IME composition (Korean, Japanese, Chinese) does not send.
              const composing = event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229;
              if (event.key === "Enter" && !event.shiftKey && !composing) {
                event.preventDefault();
                submit();
              }
            },
          }),
          pending
            ? react.createElement(
              "button",
              {
                type: "button", className: "btn settings-assistant-send",
                title: text("stop", "Stop"), "aria-label": text("stop", "Stop"),
                onClick: () => session.cancel(),
              },
              react.createElement(SettingsUiIcon, { name: "stop", size: 15 })
            )
            : react.createElement(
              "button",
              {
                type: "submit", className: "btn btn-primary settings-assistant-send",
                title: text("send", "Send"), "aria-label": text("send", "Send"),
                disabled: !providerReady || !draft.trim(),
              },
              react.createElement(SettingsUiIcon, { name: "send", size: 15 })
            )
        ),
        react.createElement(
          "div",
          { className: "settings-assistant-foot" },
          react.createElement("span", null, text("providerNote", "")),
          react.createElement(
            "button",
            {
              type: "button", className: "btn btn-sm",
              disabled: !messages.length && !pending,
              onClick: () => {
                session.clear();
                inputRef.current?.focus?.();
              },
            },
            react.createElement(SettingsUiIcon, { name: "plus", size: 14 }),
            react.createElement("span", null, text("newChat", "New chat"))
          )
        )
      )
    );
  };

  return SettingsAssistantPanel;
}
