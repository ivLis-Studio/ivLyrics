import { normalizeIvLyricsTrackBackgroundOverride, shouldFetchTrackBackgroundColors } from "./backgroundModes.mjs";

import { getTrackPreferenceWriter } from "../core/trackPreferenceWriter.mjs";
import { REQUIRE_TRACK_OVERRIDE_COMMIT } from "../core/trackOverrideStore.mjs";

export function createPageTrackPreferences({
  page, readPlayerItem, isTrackCurrent, providerStore, backgroundStore, lyricsCache, translationCache, clearLyricsSnapshot,
  readActivePreferences, onBackgroundChanged, translate, toast,
}) {
  const controller = { selectProvider, selectBackground, applyProvider, applyBackground };
  const readRecipient = readActivePreferences || (() => controller);

  function readEditableTrackUri(expectedUri) {
    const playerUri = readPlayerItem()?.uri;
    const uri = page.state.uri || page.currentTrackUri || playerUri;
    if (!uri || (expectedUri !== undefined && expectedUri !== uri)) return null;
    return (!playerUri || playerUri === uri) && isTrackCurrent(uri) ? uri : null;
  }

  async function selectProvider(providerId, expectedUri) {
    const trackUri = readEditableTrackUri(expectedUri);
    if (!trackUri) {
      toast.error(translate("notifications.noTrackPlaying"));
      return;
    }

    try {
      const normalizedProviderId = providerId || null;
      const writeProvider = getTrackPreferenceWriter(providerStore);
      await writeProvider(
        trackUri,
        () => normalizedProviderId
          ? providerStore.setProvider(trackUri, normalizedProviderId, REQUIRE_TRACK_OVERRIDE_COMMIT)
          : providerStore.clearProvider(trackUri, REQUIRE_TRACK_OVERRIDE_COMMIT),
        (saved) => {
          clearLyricsSnapshot(trackUri);
          delete lyricsCache[trackUri];
          translationCache.clearByUri(trackUri);
          readRecipient()?.applyProvider(trackUri, normalizedProviderId);
          if (saved) toast.success(translate("notifications.lyricsProviderSaved"));
        },
      );
    } catch (error) {
      console.error("[ivLyrics] Failed to save lyrics provider override:", error);
      toast.error(translate("notifications.lyricsProviderSaveFailed"));
    }
  }

  function applyProvider(trackUri, providerId) {
    if (page._dmResults) delete page._dmResults[trackUri];
    const item = readPlayerItem();
    if (item?.uri !== trackUri || !isTrackCurrent(trackUri)) return;

    page.trackLyricsProviderOverride = providerId;
    page.lastProcessedUri = null;
    page.lastProcessedMode = null;
    const requestSeq = page.beginLyricsLoadRequest();
    const isActiveSelection = () => isTrackCurrent(trackUri)
      && page.isCurrentLyricsState({ uri: trackUri, lyricsRequestSeq: requestSeq });
    page.setState(
      () => isActiveSelection() ? { trackLyricsProviderOverride: providerId, isLoading: true } : null,
      () => {
        if (isActiveSelection()) page.fetchLyrics(item, page.state.explicitMode);
      },
    );
  }

  async function selectBackground(mode, expectedUri) {
    const trackUri = readEditableTrackUri(expectedUri);
    if (!trackUri) {
      toast.error(translate("notifications.noTrackPlaying"));
      return;
    }

    try {
      const normalizedOverride = mode
        ? normalizeIvLyricsTrackBackgroundOverride({ mode })
        : null;

      const writeBackground = getTrackPreferenceWriter(backgroundStore);
      await writeBackground(
        trackUri,
        () => normalizedOverride
          ? backgroundStore.setOverride(trackUri, normalizedOverride, REQUIRE_TRACK_OVERRIDE_COMMIT)
          : backgroundStore.clearOverride(trackUri, REQUIRE_TRACK_OVERRIDE_COMMIT),
        (saved) => {
          const effectiveMode = readRecipient()?.applyBackground(trackUri, normalizedOverride)
            ?? page.getEffectiveBackgroundMode(normalizedOverride);
          onBackgroundChanged({ trackUri, override: normalizedOverride, effectiveMode });
          if (saved) toast.success(translate("messages.saved"));
        },
      );
    } catch (error) {
      console.error("[ivLyrics] Failed to save track background override:", error);
      toast.error(translate("messages.error"));
    }
  }

  function applyBackground(trackUri, override) {
    const effectiveMode = page.getEffectiveBackgroundMode(override);
    if (isTrackCurrent(trackUri)) {
      page._trackBackgroundPreferenceRevision = (page._trackBackgroundPreferenceRevision ?? 0) + 1;
      page.trackBackgroundOverride = override;
      if (shouldFetchTrackBackgroundColors(effectiveMode)) page.fetchColors(trackUri);
      page.setState(() => isTrackCurrent(trackUri) ? { trackBackgroundOverride: override } : null);
    }
    return effectiveMode;
  }

  return controller;
}
