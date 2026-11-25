import { isPronunciationDisplayMode } from "./translationPresentation.mjs";
import { getLyricRegenerationKey } from "./pageLyricRegeneration.mjs";

export function renderLyricsPageToolbar({
  react, Toolbar, state, visual, actions, modeKeys, mode, lastModeBeforeLoading, isModeAvailable,
  isFullscreenMarketplace, isSyncCreatorActive, getContentTopOffset, canToggleFullscreen,
  pronunciation: {
    pronunciationFirstApi, displayMode1, displayMode2, friendlyLanguage, originalLanguage,
    showTranslationButton, canRegenerateTranslation, regenerationRequests, wordSupplementsLoading,
  },
  track: { currentTrackUri, renderTrackUri, currentTrackInfo, isLocalTrack, hasLyrics },
  sync: { canAdjustTrackSync, quickSyncControlsEnabled },
  video: { effectiveBackgroundMode, shouldUseVideoBackground, defaultCommunityVideoStartTime, getIvLyricsTrackBackgroundMode },
}) {
  // Until the new track loads, keep the previous mode in the menu.
  const toolbarMode = mode !== -1 ? mode : state.isLoading ? lastModeBeforeLoading ?? -1 : -1;
  return !isFullscreenMarketplace && !isSyncCreatorActive && react.createElement(Toolbar, {
    actions,
    isFullscreen: state.isFullscreen,
    isMenuOpen: state.isFullscreen && state.isFloatingMenuOpen,
    isMenuClosing: state.isFullscreen && state.isFloatingMenuClosing,
    contentTopOffset: getContentTopOffset(),
    modeKey: modeKeys[toolbarMode] || null,
    lockedModeKey: modeKeys[state.lockedMode] || null,
    lockInEffect: isModeAvailable(state.lockedMode),
    hasKaraoke: !!state.karaoke,
    karaokeEnabled: !!visual["karaoke-mode-enabled"],
    hasSynced: !!state.synced,
    hasUnsynced: !!state.unsynced,
    showConvert: !!showTranslationButton,
    // Pronunciation-first belongs to synced pronunciation (Settings > Karaoke mode).
    showPronunciationFirst: !!pronunciationFirstApi?.isSyncedEnabled?.()
      && (isPronunciationDisplayMode(displayMode1) || isPronunciationDisplayMode(displayMode2)),
    pronunciationFirst: !!pronunciationFirstApi?.isEnabled?.(),
    friendlyLanguage: friendlyLanguage || null,
    detectedLanguage: originalLanguage || null,
    canRegenerate: !!canRegenerateTranslation,
    isRegenerating: !!(
      state.isTranslationLoading ||
      state.isPhoneticLoading ||
      state.isCulturalAnnotationsLoading
    ),
    isPronunciationRegenerating: !!(state.isPhoneticLoading || regenerationRequests?.has(getLyricRegenerationKey(state.uri, "phonetic"))),
    isTranslationRegenerating: !!(state.isTranslationLoading || regenerationRequests?.has(getLyricRegenerationKey(state.uri, "translation"))),
    isCulturalAnnotationsRegenerating: !!(state.isCulturalAnnotationsLoading || regenerationRequests?.has(getLyricRegenerationKey(state.uri, "cultural-annotations"))),
    isWordSupplementsRegenerating: !!(wordSupplementsLoading || regenerationRequests?.has(getLyricRegenerationKey(state.uri, "word-supplements"))),
    hasLyrics,
    isLyricsLoading: !!state.isLoading,
    isLyricsEditBusy: !!(state.isLyricsEditLoading || state.isLyricsEditSaving),
    syncTrackUri: renderTrackUri,
    canAdjustTrackSync,
    quickSyncEnabled: quickSyncControlsEnabled,
    trackUri: currentTrackUri,
    trackTitle: state.title || currentTrackInfo?.title || "",
    trackArtist: state.artist || currentTrackInfo?.artist || "",
    isLocalTrack,
    currentProvider: state.provider,
    providerOverride: state.trackLyricsProviderOverride || null,
    backgroundOverride: getIvLyricsTrackBackgroundMode(state.trackBackgroundOverride) || null,
    effectiveBackground: effectiveBackgroundMode,
    videoEnabled: shouldUseVideoBackground,
    videoInfo: state.videoInfo,
    videoStartTime: defaultCommunityVideoStartTime,
    lyrics: state.currentLyrics || null,
    showMarketplace: !!state.showMarketplace,
    canToggleFullscreen: canToggleFullscreen(),
  });
}
