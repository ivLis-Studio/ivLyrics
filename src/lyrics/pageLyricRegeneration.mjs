import { getLyricDisplayModes, getLyricLanguageMode } from "./lyricPresentationIdentity.mjs";

const REGENERATION_TARGETS = new Set(["phonetic", "translation", "cultural-annotations", "word-supplements"]);

export function getLyricRegenerationKey(uri, target) {
  return `${uri}\0${target}`;
}

export function getPageRegenerationTargets(visual, readLanguage) {
  const provider = visual["translate:translated-lyrics-source"];
  const [mode1, mode2] = provider && provider !== "none"
    ? getLyricDisplayModes(visual, getLyricLanguageMode(readLanguage()))
    : [null, null];
  return {
    provider,
    mode1,
    mode2,
    needPhonetic: mode1 === "gemini_romaji" || mode2 === "gemini_romaji",
    needTranslation: mode1 === "gemini_ko" || mode2 === "gemini_ko",
    isGeminiMode: !provider || provider === "none" ? false : mode1?.startsWith("gemini") || mode2?.startsWith("gemini"),
  };
}

export function createPageRegenerationMenu({ page, openChoiceModal, getChoiceItems, readWordSupplements }) {
  const getOptions = () => ({
    targets: page.getRegenerationTargets(),
    includeCulturalAnnotations: page.isCulturalAnnotationsEnabled(),
    includeWordSupplements: !!readWordSupplements(),
  });

  function open() {
    const lyrics = page.state;
    const { uri } = lyrics;
    const options = getOptions();
    const { targets, includeCulturalAnnotations, includeWordSupplements } = options;
    const onSelect = target => {
      if (page.isCurrentLyricsState(lyrics)) return page.runRegenerateTranslationChoice(target, uri);
    };
    if (includeCulturalAnnotations || includeWordSupplements || (targets.needPhonetic && targets.needTranslation)) {
      openChoiceModal({ ...options, onSelect });
      return;
    }
    onSelect(targets.needPhonetic ? "phonetic" : targets.needTranslation ? "translation" : "all");
  }

  return { open, getChoices: () => getChoiceItems(getOptions()) };
}

export async function runPageLyricRegeneration(page, target, uri = page.state.uri) {
  if (!uri || !page._isComponentMounted || uri !== page.state.uri
      || !page.isCurrentLyricsState(page.state) || !page.isPlaybackUriCurrent(uri)) return;
  const kinds = target === "all" ? ["phonetic", "translation"] : [target];
  if (kinds.some(kind => !REGENERATION_TARGETS.has(kind))) return;
  const requests = page._regenerationRequests ||= new Map();
  const keys = kinds.map(kind => getLyricRegenerationKey(uri, kind));
  // Protect API/cache work as well as the UI from repeated or overlapping clicks.
  if (keys.some(key => requests.has(key))) return;
  const request = {};
  keys.forEach(key => requests.set(key, request));
  page.forceUpdate();
  try {
    if (target === "cultural-annotations") return await page.regenerateCulturalAnnotations();
    if (target === "word-supplements") return await page.regenerateWordSupplements();
    return await page.regenerateTranslation(target);
  } finally {
    keys.forEach(key => { if (requests.get(key) === request) requests.delete(key); });
    if (page._isComponentMounted) page.forceUpdate();
  }
}

export async function regeneratePageWordSupplements(page, {
  playbackUri, extractTrackId, getLyricsService, getPrefetcher, getSupplements, toast, translate,
}) {
  const uri = page.state.uri || playbackUri();
  const trackId = extractTrackId(uri) || uri;
  if (!uri || !trackId) {
    toast.error(translate("notifications.noTrackPlaying"));
    return;
  }
  if (!page.state.currentLyrics || page.state.currentLyrics.length === 0) {
    toast.error(translate("notifications.noLyricsLoaded"));
    return;
  }
  // Word details only exist for karaoke lines; without them there is
  // nothing to resend a request for.
  const karaokeLines = Array.isArray(page.state.karaoke) && page.state.karaoke.length > 0
    ? page.state.karaoke
    : null;
  if (!karaokeLines) {
    toast.error(translate("notifications.noLyricsLoaded"));
    return;
  }
  const prefetch = getPrefetcher();
  const supplements = getSupplements();
  if (typeof prefetch !== "function" || !supplements) {
    toast.error(
      `${translate("notifications.wordDetailsRegenerateFailed") || "Word details regeneration failed"}: Word details unavailable.`
    );
    return;
  }

  toast.show(
    translate("notifications.regeneratingWordDetails") || "Regenerating word details...",
    false,
    2000
  );

  try {
    // Stop outstanding requests from restoring entries during deletion.
    supplements.clearCaches?.();
    const cacheCleared = await getLyricsService()?.clearWordSupplementsCache?.(trackId);
    if (cacheCleared === false) {
      throw new Error("Failed to clear word details cache.");
    }
    // Invalidate after the persistent clear so refetching lines cannot
    // re-read stale entries back into memory.
    supplements.invalidate?.();
    if (!page.isCurrentLyricsUri(uri)) return;

    // Explicitly refetch instead of relying on mounted lines' invalidation
    // effect: this guarantees a fresh AI request (which also drives the
    // generation status pill) even when no karaoke line is mounted yet.
    // force bypasses the prefetch toggle; the track id is explicit so
    // cache keys match the render path.
    let sourceLang = "auto";
    try {
      sourceLang = getLyricsService()?.detectLanguage?.(karaokeLines) || "auto";
    } catch { /* fall through to auto */ }
    const refetched = await prefetch(karaokeLines, { sourceLang, trackId, force: true });
    if (!page.isCurrentLyricsUri(uri)) return;
    if (!refetched) {
      throw new Error("No word details available for this track.");
    }
    toast.success(
      translate("notifications.wordDetailsRegenerated") || "Word details regenerated."
    );
  } catch (error) {
    if (page.isCurrentLyricsUri(uri)) {
      toast.error(
        `${translate("notifications.wordDetailsRegenerateFailed") || "Word details regeneration failed"}: ${error.message}`
      );
    }
  }
}
