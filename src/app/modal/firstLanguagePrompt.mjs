import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { createFluentModalHost } from "./fluentModalHost.mjs";
import { getFirstLanguageAIProviderHintKey, getFirstLanguageAIProviderHintState } from "./firstLanguageProviderHints.mjs";

export function createFirstLanguagePrompt({ appName, browser, document, getUiLanguage, translate, applyModes }) {
  const storagePrefix = `${appName}:first-language-prompted:v1:`;
  const firstLanguagePromptPromises = new Map();

  function readFirstLanguagePromptStorage(key) {
    try {
      const persisted = readSettingsPersistence(browser)?.getItem?.(key);
      if (persisted !== undefined && persisted !== null) return persisted;
    } catch {}
    try {
      const persisted = browser.Spicetify?.LocalStorage?.get?.(key);
      if (persisted !== undefined && persisted !== null) return persisted;
    } catch {}
    try {
      return browser.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeFirstLanguagePromptStorage(key, value) {
    try {
      readSettingsPersistence(browser)?.setItem?.(key, value);
    } catch {}
    try {
      browser.Spicetify?.LocalStorage?.set?.(key, value);
    } catch {}
    try {
      browser.localStorage.setItem(key, value);
    } catch {}
  }

  function normalizeFirstLanguagePromptCode(language) {
    const normalized = String(language || "")
      .trim()
      .replaceAll("_", "-")
      .toLowerCase();
    if (["", "auto", "default", "unknown", "und"].includes(normalized)) return "";
    if (normalized === "jp") return "ja";
    if (normalized === "kr") return "ko";
    if (["cn", "zh", "zh-hans", "zh-cn", "zh-sg"].includes(normalized)) return "zh-hans";
    if (["tw", "hk", "zh-hant", "zh-tw", "zh-hk"].includes(normalized)) return "zh-hant";
    return normalized.split("-")[0];
  }

  function firstLanguagePromptDisplayName(language) {
    try {
      const uiLanguage = getUiLanguage() || "en";
      return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(language) || language;
    } catch {
      return language;
    }
  }

  function hasExplicitFirstLanguageModes(modeKey) {
    const firstKey = `${appName}:visual:translation-mode:${modeKey}`;
    const secondKey = `${appName}:visual:translation-mode-2:${modeKey}`;
    return readFirstLanguagePromptStorage(firstKey) !== null
      || readFirstLanguagePromptStorage(secondKey) !== null;
  }

  function createFirstLanguageIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", name === "close" ? "m6 6 12 12M6 18 18 6"
      : name === "pronunciation" ? "m4 9 4 0 5-4v14l-5-4H4V9Zm12-2c3 3 3 7 0 10m-1-7c1 1 1 3 0 4"
      : "M3 5h12M9 3v2c0 5-2 8-6 11m1-7c2 3 5 5 8 6m2 5 4-12 4 12m-6-4h4");
    svg.appendChild(path);
    return svg;
  }

  function resolveFirstLanguagePromptMountNode() {
    const lyricsSurface = document.querySelector(
      ".lyrics-lyricsContainer-LyricsContainer"
    );
    return lyricsSurface?.closest("#lyrics-fullscreen-container, .Root__main-view")
      ?? document.querySelector(".Root__main-view")
      ?? document.body;
  }

  function openFirstLanguagePrompt({ sourceLang, modeKey }) {
    const normalizedSource = normalizeFirstLanguagePromptCode(sourceLang);
    if (!normalizedSource) return null;

    const pending = firstLanguagePromptPromises.get(normalizedSource);
    if (pending) return pending;

    const promptedKey = `${storagePrefix}${normalizedSource}`;
    if (readFirstLanguagePromptStorage(promptedKey) === "1") return null;
    if (hasExplicitFirstLanguageModes(modeKey)) return null;

    // Mark on presentation, including Escape/backdrop/close, so it never nags on every track.
    writeFirstLanguagePromptStorage(promptedKey, "1");

    const promise = new Promise((resolve) => {
      let settled = false;
      const finish = (choice = "dismissed") => {
        if (settled) return;
        settled = true;
        firstLanguagePromptPromises.delete(normalizedSource);
        resolve(choice);
      };

      const host = createFluentModalHost({
        overlayId: "ivLyrics-first-language-overlay",
        overlayClassName: "ivlyrics-first-language-overlay",
        shellClassName: "ivlyrics-first-language-shell",
        mountNode: resolveFirstLanguagePromptMountNode(),
        modal: false,
        closeOnBackdrop: false,
        trapFocus: false,
        autoFocus: false,
        onBeforeClose: () => finish(),
      });

      const languageName = firstLanguagePromptDisplayName(normalizedSource);
      const titleId = "ivLyrics-first-language-title";
      const descriptionId = "ivLyrics-first-language-description";
      host.shell.setAttribute("aria-labelledby", titleId);
      host.shell.setAttribute("aria-describedby", descriptionId);
      host.shell.setAttribute("aria-live", "polite");

      const header = document.createElement("div");
      header.className = "ivlyrics-first-language-header";
      const buildFirstLanguageHeader = () => {
        const title = document.createElement("h2");
        title.id = titleId;
        title.className = "ivlyrics-first-language-title";
        title.textContent = translate("firstLanguagePrompt.title", { language: languageName });
        const description = document.createElement("p");
        description.id = descriptionId;
        description.className = "ivlyrics-first-language-description";
        description.textContent = translate("firstLanguagePrompt.description");
        const close = document.createElement("button");
        close.type = "button";
        close.className = "ivlyrics-first-language-close";
        close.setAttribute("aria-label", translate("buttons.close"));
        close.appendChild(createFirstLanguageIcon("close"));
        close.addEventListener("click", () => host.closeModal());
        header.append(title, description, close);
      };
      buildFirstLanguageHeader();

      const body = document.createElement("div");
      body.className = "ivlyrics-first-language-body";
      const draft = {
        pronunciation: false,
        translation: false,
      };
      const providerHintState = getFirstLanguageAIProviderHintState(getRuntimeService("AIAddonManager", browser));
      const providerHintId = "ivLyrics-first-language-provider-hint";
      let providerHint = null;
      let providerHintText = null;
      const action = document.createElement("button");
      action.type = "button";
      action.className = "ivlyrics-first-language-action";

      const updateProviderHint = () => {
        if (!providerHint || !providerHintText) return;
        // Only show a hint when the selected task needs a provider, keeping the default card quiet.
        const hintKey = draft.pronunciation && providerHintState.missingPronunciation
          ? getFirstLanguageAIProviderHintKey(providerHintState, true)
          : draft.translation && providerHintState.missingTranslation ? "translator.noProviderConfigured" : null;
        providerHint.hidden = !hintKey;
        if (hintKey) providerHintText.textContent = translate(hintKey);
        host.shell.setAttribute("aria-describedby", hintKey ? `${descriptionId} ${providerHintId}` : descriptionId);
      };

      const updateAction = () => {
        const hasSelection = draft.pronunciation || draft.translation;
        action.classList.toggle("has-selection", hasSelection);
        action.textContent = translate(
          hasSelection ? "firstLanguagePrompt.apply" : "firstLanguagePrompt.notNow"
        );
        updateProviderHint();
      };

      const createToggleRow = ({ key, label }) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "ivlyrics-first-language-toggle-row";
        row.setAttribute("role", "switch");
        row.setAttribute("aria-checked", "false");

        const rowIcon = document.createElement("span");
        rowIcon.className = "ivlyrics-first-language-row-icon";
        rowIcon.setAttribute("aria-hidden", "true");
        rowIcon.appendChild(createFirstLanguageIcon(key));
        const rowLabel = document.createElement("span");
        rowLabel.className = "ivlyrics-first-language-row-label";
        rowLabel.textContent = label;
        const switchTrack = document.createElement("span");
        switchTrack.className = "ivlyrics-first-language-switch";
        switchTrack.setAttribute("aria-hidden", "true");
        const switchKnob = document.createElement("span");
        switchKnob.className = "ivlyrics-first-language-switch-knob";
        switchTrack.appendChild(switchKnob);
        row.append(rowIcon, rowLabel, switchTrack);

        row.addEventListener("click", () => {
          draft[key] = !draft[key];
          row.setAttribute("aria-checked", draft[key] ? "true" : "false");
          switchTrack.classList.toggle("is-on", draft[key]);
          updateAction();
        });
        return row;
      };

      body.append(
        createToggleRow({
          key: "translation",
          label: translate("firstLanguagePrompt.translation"),
        }),
        createToggleRow({
          key: "pronunciation",
          label: translate("firstLanguagePrompt.pronunciation"),
        })
      );

      if (providerHintState.missingTranslation || providerHintState.missingPronunciation) {
        providerHint = document.createElement("div");
        providerHint.id = providerHintId;
        providerHint.className = "ivlyrics-first-language-provider-hint";
        providerHint.setAttribute("role", "note");
        providerHintText = document.createElement("span");
        providerHint.append(providerHintText);
        body.appendChild(providerHint);
        updateProviderHint();
      }

      action.addEventListener("click", () => {
        if (draft.pronunciation || draft.translation) {
          const pronunciationMode = draft.pronunciation ? "gemini_romaji" : "none";
          const translationMode = draft.translation ? "gemini_ko" : "none";
          applyModes(modeKey, pronunciationMode, translationMode);
          finish("configured");
        }
        host.closeModal();
      });
      updateAction();
      host.shell.append(header, body, action);
    });

    firstLanguagePromptPromises.set(normalizedSource, promise);
    return promise;
  }

  return {
    maybePrompt({ sourceLang, targetLang, modeKey }) {
      const source = normalizeFirstLanguagePromptCode(sourceLang);
      const target = normalizeFirstLanguagePromptCode(targetLang);
      if (!source || (target && source === target)) return null;
      return openFirstLanguagePrompt({ sourceLang: source, modeKey });
    },
  };
}
