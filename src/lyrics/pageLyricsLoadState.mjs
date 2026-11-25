import { hasLyricsRows } from "./selectPlaybackLyrics.mjs";
import { emptyPageTranslationFields } from "./pageLyricsTranslationState.mjs";

export const emptyLyricsState = {
  karaoke: null,
  karaokeSource: null,
  karaokeGranularity: null,
  synced: null,
  unsynced: null,
  currentLyrics: null,
  syncType: null,
  syncPoints: null,
  syncTypeBreakdown: null,
  syncDataApplied: false,
  cacheVersion: null,
  lrcred: null,
};

export const createInitialLyricsContainerState = ({ lockedMode, fullscreenPresentation }) => ({
  fullscreenFocusedLyricsActive: false,
  ...emptyLyricsState,
  ...emptyPageTranslationFields,
  uri: "",
  provider: "",
  trackLyricsProviderOverride: null,
  trackBackgroundOverride: null,
  contributors: null,
  colors: {
    background: "",
    inactive: "",
  },
  colorsUri: "",
  dynamicColors: null,
  tempo: "0.25s",
  explicitMode: -1,
  lockedMode,
  mode: -1,
  isLoading: false,
  showMarketplace: false,
  versionIndex: 0,
  versionIndex2: 0,
  isFullscreen: false,
  fullscreenPresentation,
  fullscreenLyricsHidden: false,
  isFloatingMenuOpen: false,
  isFloatingMenuClosing: false,
  isCached: false,
  language: null,
  isPhoneticLoading: false,
  isTranslationLoading: false,
  isCulturalAnnotationsLoading: false,
  generationPills: {
    lyrics: { phase: "idle", revision: 0 },
    translation: { phase: "idle", revision: 0 },
    pronunciation: { phase: "idle", revision: 0 },
    "cultural-annotations": { phase: "idle", revision: 0 },
    "video-background": { phase: "idle", revision: 0 },
    "motion-direction": { phase: "idle", revision: 0 },
  },
  currentLyricIndex: 0,
  // Keep the previous fullscreen layout while loading, without retaining
  // outgoing lyric arrays under the next track's identity.
  lyricsStatus: "idle",
  lyricsTransitionSeq: 0,
  lyricsDisplayUri: null,
  lyricsLoadingHasLyrics: false,
  videoInfo: null,
  // 메타데이터 번역
  translatedMetadata: null,
  isLyricsEditModalOpen: false,
  isLyricsEditLoading: false,
  isLyricsEditSaving: false,
  lyricsEditOriginalLines: [],
  lyricsEditPronunciationText: "",
  lyricsEditPronunciationSlots: [],
  lyricsEditTranslationText: "",
  lyricsEditHasPronunciationCache: false,
  lyricsEditHasTranslationCache: false,
  lyricsEditError: "",
  isPlaybackPaused: true,
  lyricsRequestSeq: 0,
  isSyncCreatorActive: false,
  showLineCounter: false,
  markedLines: new Set(),
});

export function hasLyricsLayout(lyricsState) {
  return hasLyricsRows(lyricsState)
    || (lyricsState?.isLoading === true && lyricsState?.lyricsLoadingHasLyrics === true);
}
export function buildLyricsLoadingState({ info, requestSeq, transitionSeq, lyricsLoadingHasLyrics }) {
  return {
    ...emptyLyricsState,
    ...emptyPageTranslationFields,
    currentLyrics: [],
    lyricsDisplayUri: info?.uri || null,
    lyricsLoadingHasLyrics,
    uri: info?.uri || "",
    lyricsRequestSeq: requestSeq || 0,
    provider: "",
    contributors: null,
    language: null,
    translatedMetadata: null,
    trackLyricsProviderOverride: null,
    trackBackgroundOverride: null,
    isLoading: true,
    lyricsStatus: "loading",
    lyricsTransitionSeq: transitionSeq,
    isCached: false,
    error: null,
    artist: info?.artist || "",
    title: info?.title || "",
    coverUrl: info?.image || "",
    currentLyricIndex: 0,
  };
}

