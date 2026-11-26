import {
  buildCacheEditorText, captureEditorPronunciationSlots, createCacheEditorReader, normalizeCacheEditorLines,
} from "./lyricsCacheEditorRecords.mjs";

export function createLyricsCacheEditor({
  page, readActivePage = () => page,
  resolveModeSpecificLyrics, buildTranslationLineRequests, getLegacyNonSectionLyricsText,
  getTranslationResultCacheHash, getTranslationCacheId, readSourceLanguage = () => undefined,
  getCache, getLyricsService, getTranslator, getPronunciationSlots, clearMemoryCacheByUri,
  translate, notifyError, notifySuccess,
}) {
  let currentEdit = null;
  const isPageTrackCurrent = (candidate, uri, state = candidate?.state) => candidate?._isComponentMounted
    && state?.uri === uri && candidate.isCurrentLyricsUri?.(uri) !== false && candidate.isPlaybackUriCurrent(uri);
  const isActiveEdit = (edit, state) => currentEdit === edit && isPageTrackCurrent(page, edit.trackUri, state);
  const updateEdit = (edit, patch, staleCachePatch = patch) => page.setState(state => {
    if (!isActiveEdit(edit, state)) return null;
    return edit.isCacheCurrent() ? patch : staleCachePatch;
  });
  const readCachedResult = createCacheEditorReader({
    buildTranslationLineRequests, getLegacyNonSectionLyricsText, getTranslationResultCacheHash, getPronunciationSlots,
  });

  function getEditingBaseLyrics() {
    const currentMode = page.getCurrentMode();
    return (
      resolveModeSpecificLyrics(page.state, currentMode) ??
      (page.resolveLyricsForMode(page.state, currentMode) || [])
    );
  }

  function getEditableCacheSourceLines() {
    return buildTranslationLineRequests(getEditingBaseLyrics())
      .map((request) => request.text);
  }

  function closeLyricsEditModal({ force = false } = {}) {
    if (currentEdit?.saving && !force) return;
    if (!currentEdit && !page.state.isLyricsEditModalOpen) return;
    currentEdit = null;

    page.setState(() => page._isComponentMounted && !currentEdit ? {
      isLyricsEditModalOpen: false,
      isLyricsEditLoading: false,
      isLyricsEditSaving: false,
      lyricsEditError: "",
    } : null);
  }

  async function openLyricsEditModal() {
    if (currentEdit?.saving) return;
    const trackUri = page.state.uri;
    if (trackUri && !isPageTrackCurrent(page, trackUri)) return;
    const baseLyrics = getEditingBaseLyrics();
    const sourceRequests = buildTranslationLineRequests(baseLyrics);
    const sourceLines = sourceRequests.map((request) => request.text);
    const sourceText = sourceLines.join("\n");
    const trackId = getTranslationCacheId(trackUri);

    if (!trackId || sourceLines.length === 0) {
      notifyError(translate("notifications.noLyricsLoaded"));
      return;
    }

    const cache = getCache();
    const cacheRevision = cache.getTranslationRevision(trackId);
    const isCacheCurrent = () => cache.getTranslationRevision(trackId) === cacheRevision;
    const edit = {
      trackUri, trackId, sourceLines, sourceLanguage: readSourceLanguage(baseLyrics),
      cache, isCacheCurrent,
      targetLanguage: page.getTranslationTargetLanguage(),
      provider: page.state.provider || null,
      pronunciationSourceHash: getTranslationResultCacheHash(sourceText, true),
      translationSourceHash: getTranslationResultCacheHash(sourceText, false),
      baseline: null,
      saving: false,
    };
    currentEdit = edit;

    updateEdit(edit, {
      isLyricsEditModalOpen: true,
      isLyricsEditLoading: true,
      isLyricsEditSaving: false,
      lyricsEditOriginalLines: sourceLines,
      lyricsEditPronunciationText: "",
      lyricsEditPronunciationSlots: [],
      lyricsEditTranslationText: "",
      lyricsEditHasPronunciationCache: false,
      lyricsEditHasTranslationCache: false,
      lyricsEditError: "",
    });

    const loadFailed = { isLyricsEditLoading: false, lyricsEditError: translate("lyricsCacheEditor.loadFailed") };
    try {
      const canRead = () => isActiveEdit(edit) && isCacheCurrent();
      const read = (isPhonetic, sourceHash) => readCachedResult({
        trackId, targetLanguage: edit.targetLanguage, provider: edit.provider,
        baseLyrics, sourceRequests, isPhonetic, sourceHash, sourceLanguage: edit.sourceLanguage, cache, canRead,
      });
      const [phonetic, translation] = await Promise.all([
        read(true, edit.pronunciationSourceHash), read(false, edit.translationSourceHash),
      ]);
      if (!isActiveEdit(edit)) return;
      if (!isCacheCurrent()) throw new Error("Lyric cache was cleared during the read");
      const phoneticText = buildCacheEditorText(phonetic.lines, sourceLines.length);
      const translationText = buildCacheEditorText(translation.lines, sourceLines.length);
      edit.baseline = {
        phoneticText, translationText,
        slots: captureEditorPronunciationSlots(getPronunciationSlots(), phoneticText.split("\n"), phonetic.slots),
      };
      updateEdit(edit, {
        isLyricsEditLoading: false,
        lyricsEditPronunciationText: phoneticText,
        lyricsEditPronunciationSlots: phonetic.slots,
        lyricsEditTranslationText: translationText,
        lyricsEditHasPronunciationCache: phonetic.lines.length > 0,
        lyricsEditHasTranslationCache: translation.lines.length > 0,
      }, loadFailed);
    } catch {
      if (!isActiveEdit(edit)) return;
      const emptyText = buildCacheEditorText([], sourceLines.length);
      edit.baseline = { phoneticText: emptyText, translationText: emptyText, slots: null };
      updateEdit(edit, loadFailed);
    }
  }

  function invalidateSharedLyricsPresentation(trackUri, recipient = page) {
    if (!trackUri) return;
    const service = getLyricsService();
    const snapshot = service?.getLyricsSnapshot?.(trackUri);
    if (snapshot) {
      recipient?._invalidatedSharedPresentationSnapshots?.add(snapshot);
    }
    recipient?._sharedPresentationKeys?.delete(trackUri);
    service?.clearLyricsPresentationSnapshot?.(trackUri);
  }

  async function saveLyricsEditModal() {
    const edit = currentEdit;
    if (!edit?.baseline || edit.saving || !isActiveEdit(edit)) return;
    const { trackUri, trackId, provider, targetLanguage, baseline } = edit;
    const expectedLineCount = edit.sourceLines.length;
    const pronunciationLines = normalizeCacheEditorLines(
      page.state.lyricsEditPronunciationText,
      expectedLineCount
    );
    const translationLines = normalizeCacheEditorLines(
      page.state.lyricsEditTranslationText,
      expectedLineCount
    );

    if (!pronunciationLines || !translationLines) {
      updateEdit(edit, {
        lyricsEditError: translate("lyricsCacheEditor.lineOverflow"),
      });
      return;
    }

    const slots = captureEditorPronunciationSlots(getPronunciationSlots(), pronunciationLines, page.state.lyricsEditPronunciationSlots);
    const entries = [];
    if (pronunciationLines.join("\n") !== baseline.phoneticText || JSON.stringify(slots) !== JSON.stringify(baseline.slots)) {
      entries.push({
        isPhonetic: true, sourceHash: edit.pronunciationSourceHash,
        data: { phonetic: pronunciationLines, ...(slots && { slots }), userEdited: true },
      });
    }
    if (translationLines.join("\n") !== baseline.translationText) {
      entries.push({
        isPhonetic: false, sourceHash: edit.translationSourceHash,
        data: { translation: translationLines, userEdited: true },
      });
    }
    if (!entries.length) {
      closeLyricsEditModal();
      return;
    }
    edit.saving = true;
    updateEdit(edit, { isLyricsEditSaving: true, lyricsEditError: "" });
    const translator = getTranslator();
    try {
      if (!edit.isCacheCurrent()) throw new Error("Lyric cache was cleared during the edit");
      translator?.clearMemoryCache?.(trackId);
      const saved = await edit.cache.setTranslations(trackId, targetLanguage, provider, entries, edit.isCacheCurrent);
      if (!saved || !edit.isCacheCurrent()) throw new Error("Lyric edits were not committed");
    } catch {
      edit.saving = false;
      if (isActiveEdit(edit)) updateEdit(edit, { isLyricsEditSaving: false, lyricsEditError: translate("lyricsCacheEditor.saveFailed") });
      return;
    }
    edit.saving = false;
    translator?.clearMemoryCache?.(trackId);
    clearMemoryCacheByUri(trackUri);
    const recipient = readActivePage();
    recipient?.clearTranslationRequestsForCacheRemoval?.(trackUri);
    invalidateSharedLyricsPresentation(trackUri, recipient);
    const showFeedback = isActiveEdit(edit);
    if (showFeedback) closeLyricsEditModal({ force: true });
    if (isPageTrackCurrent(recipient, trackUri)) {
      recipient.lastProcessedMode = null;
      recipient.lyricsSource(recipient.state, recipient.getCurrentMode());
    }
    if (showFeedback) notifySuccess(translate("lyricsCacheEditor.saved"));
  }

  return {
    getEditingBaseLyrics, getEditableCacheSourceLines,
    open: openLyricsEditModal, close: closeLyricsEditModal, save: saveLyricsEditModal,
    invalidatePresentation: invalidateSharedLyricsPresentation,
    cancelPending() { currentEdit = null; },
  };
}
