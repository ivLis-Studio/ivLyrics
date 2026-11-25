export function createPageLyricsGenerationHandlers({
  page, readLyricsAddonManager, readPronunciationFirst, translate,
}) {
  function updateGenerationRequestLoading(kind, details) {
    page.generationStatus.updateRequest(kind, details);
  }

  function handleWordSyncLoading(detail = {}) {
    page.generationStatus.reportTrackRequest("word-sync", detail, page.currentTrackUri, () =>
      readLyricsAddonManager()?.isProviderEnabled?.("lrcred") !== false
    );
  }

  function clearWordSyncLoading() {
    page.generationStatus.clearTrackRequests("word-sync");
  }

  function handlePronunciationSyncStatus(event) {
    page.generationStatus.reportTrackRequest("pronunciation-sync", event?.detail || {}, page.currentTrackUri);
  }

  function clearPronunciationSyncLoading() {
    page.generationStatus.clearTrackRequests("pronunciation-sync");
  }

  function restorePronunciationSyncLoading() {
    if (!page._isComponentMounted) return;
    const statuses = readPronunciationFirst()?.getStatuses?.(page.currentTrackUri) || [];
    statuses.forEach(status => page.handlePronunciationSyncStatus({ detail: status }));
  }

  function handleMotionDirectionStatus(event) {
    page.generationStatus.reportMotionStatus(event?.detail?.phase);
  }

  function handlePronunciationFirstUpdate(event) {
    const trackUri = event?.detail?.trackUri;
    if (trackUri && trackUri !== page.state.uri) return;
    page.forceUpdate?.();
  }

  function restoreWordSyncLoading() {
    if (!page._isComponentMounted) return;
    const statuses = readLyricsAddonManager()?.getAddon?.("lrcred")?.getWordSyncStatuses?.(page.currentTrackUri) || [];
    statuses.forEach(status => page.handleWordSyncLoading(status));
  }

  function startLyricsLoading() {
    return page.generationStatus.startLyricsRequest();
  }

  function handleLyricsProviderAttempt(detail = {}) {
    if (!page.generationStatus.hasRequests("lyrics")) return;

    const requestUri = String(detail.uri || "");
    if (requestUri && requestUri !== page.currentTrackUri) return;

    const providerName = String(detail.providerName || detail.providerId || "").trim();
    if (!providerName) return;

    const loadingDescription = String(
      translate("syncCreator.loadingLyrics") || "가사를 불러오는 중..."
    ).replace(/\s*[.…]+$/u, "");
    const lyricsType = String(detail.lyricsType || "").trim();
    const lyricsTypeLabel = lyricsType
      ? String(
        translate(`settings.lyricsProviders.types.${lyricsType}`) || lyricsType
      ).trim()
      : "";
    page.updateGenerationRequestLoading("lyrics", {
      label: providerName,
      description: lyricsTypeLabel
        ? `${lyricsTypeLabel} · ${loadingDescription}`
        : `${loadingDescription}: ${providerName}`,
    });
  }

  function clearLyricsLoading(token = null, options = {}) {
    page.generationStatus.clearRequest("lyrics", token, options);
  }

  function startPhoneticLoading() {
    return page.generationStatus.startRequest("pronunciation");
  }

  function clearPhoneticLoading(token = null, options = {}) {
    page.generationStatus.clearRequest("pronunciation", token, options);
  }

  function startTranslationLoading() {
    return page.generationStatus.startRequest("translation");
  }

  function clearTranslationLoading(token = null, options = {}) {
    page.generationStatus.clearRequest("translation", token, options);
  }

  function startCulturalAnnotationsLoading(details = {}) {
    return page.generationStatus.startRequest("cultural-annotations", details);
  }

  function clearCulturalAnnotationsLoading(token = null, options = {}) {
    page.generationStatus.clearRequest("cultural-annotations", token, options);
  }

  function startWordSupplementsLoading() {
    return page.generationStatus.startRequest("word-supplements");
  }

  function clearWordSupplementsLoading(token = null, options = {}) {
    page.generationStatus.clearRequest("word-supplements", token, options);
  }

  return {
    updateGenerationRequestLoading,
    handleWordSyncLoading,
    clearWordSyncLoading,
    handlePronunciationSyncStatus,
    clearPronunciationSyncLoading,
    restorePronunciationSyncLoading,
    handleMotionDirectionStatus,
    handlePronunciationFirstUpdate,
    restoreWordSyncLoading,
    startLyricsLoading,
    handleLyricsProviderAttempt,
    clearLyricsLoading,
    startPhoneticLoading,
    clearPhoneticLoading,
    startTranslationLoading,
    clearTranslationLoading,
    startCulturalAnnotationsLoading,
    clearCulturalAnnotationsLoading,
    startWordSupplementsLoading,
    clearWordSupplementsLoading,
  };
}
