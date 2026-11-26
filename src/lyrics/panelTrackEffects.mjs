import { readPronunciationSlots } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { createRuntimeEffects } from "../core/runtimeEffects.mjs";
import { normalizeGlobalSyncOffset } from "#ivlyrics/core/globalSyncOffset.mjs";
import { resolveStablePlayerItem } from "../core/PlaybackClock.js";
import { createPlaybackTrackResolver } from "../spicetify/playbackTrackResolver.mjs";
import { LOCAL_LYRICS_UPDATED_EVENT } from "./localLyricsStore.mjs";
import { resolveSharedPanelLyrics } from "./panelLyricPresentation.mjs";
import { createPanelTranslationLoader } from "./panelTranslationLoader.mjs";
import { createPanelLyricsLoader } from "./panelLyricsLoader.mjs";
import { createPanelTrackRequests } from "./panelTrackRequests.mjs";
import { LYRIC_PRESENTATION_OWNER_RELEASED, registerPanelLyricPresentationOwner } from "./lyricPresentationOwnership.mjs";
import { isLyricPresentationSetting } from "./lyricPresentationIdentity.mjs";
import { isLyricsProviderSelectionSetting, LYRICS_PROVIDER_SELECTION_CHANGED } from "./lyricsProviderRequests.mjs";

export function clearPanelTrackState(state) {
    Object.assign(state, { lyrics: [], currentIndex: 0, trackUri: null, provider: null, karaokeSource: null });
}

export function createPanelTrackEffects({
    react, host, getSpicetify, currentLyricsState, panelDebug,
    readPlaybackPosition, readPlaybackSnapshot, readCurrentTrackUri,
    readTrackSyncStore, readPseudoKaraoke, getTranslator, getAIManager, translationPreferences,
    getPanelLyricsService, publishPanelLyricsSnapshot, getPanelTrackId, getSavedPanelLocalLyrics,
    settings, presentation,
}) {
    const { useCallback, useMemo, useEffect } = react;
    const { getVisualSetting, isAutoInstrumentalBreakEnabled, DEFAULT_FONT_SCALE } = settings;
    const { sanitizePanelLyricsSupplements, applyPanelTranslationResults } = presentation;
    const playback = {
        getPlayerPlaybackSnapshot: readPlaybackSnapshot,
        resolveStablePlaybackTrack(candidate, snapshot) {
            if (snapshot?.uri === "") return null;
            const service = readPlaybackPosition();
            return typeof service?.resolveStablePlaybackTrack === 'function'
                ? service.resolveStablePlaybackTrack(candidate, snapshot)
                : resolveStablePlayerItem(getSpicetify().Player.data, snapshot, candidate);
        },
    };

    return function usePanelTrackEffects(initial, lyricsUpdates, playbackUpdates, settingUpdates) {
        const { setLyrics, setLyricsNotFound, setKaraokeSource } = lyricsUpdates;
        const {
            setTrackOffset, setGlobalOffset, setCurrentIndex, setVisualIndex,
            setActiveTrailingInterludeKey, setVisualTrailingInterludeKey, setIsPlaybackPaused, getPlaybackPaused,
        } = playbackUpdates;
        const {
            setIsEnabled, setFontScale, setPseudoKaraokeAdvanceMs, setAutoInstrumentalBreakEnabled,
            setInstrumentalBreakRevision, setTextEffectRevision, setMotionRevision,
        } = settingUpdates;

        const requests = useMemo(() => createPanelTrackRequests(initial.loadedUri, readCurrentTrackUri), []);
        const resetTimeline = useCallback(() => {
            setCurrentIndex(0);
            setVisualIndex(0);
            setActiveTrailingInterludeKey(null);
            setVisualTrailingInterludeKey(null);
        }, []);
        const showUnavailable = useCallback((notFound = true) => {
            setLyrics([]);
            setLyricsNotFound(notFound);
            setKaraokeSource(null);
            clearPanelTrackState(currentLyricsState);
        }, []);
        const showLyrics = useCallback(({ trackUri, provider, lyrics, karaokeSource, notFound = false }) => {
            setLyrics(lyrics);
            setLyricsNotFound(notFound);
            setKaraokeSource(karaokeSource);
            Object.assign(currentLyricsState, { trackUri, provider, lyrics, karaokeSource });
        }, []);

        const loadTrackOffset = useCallback(async (trackUri) => {
            const revision = requests.beginOffset();
            if (!trackUri) {
                setTrackOffset(0);
                return;
            }

            try {
                const lyricsService = getPanelLyricsService();
                const offset = lyricsService?.getTrackSyncOffset
                    ? await lyricsService.getTrackSyncOffset(trackUri)
                    : await readTrackSyncStore()?.getOffset?.(trackUri);
                if (requests.ownsOffset(revision, trackUri)) {
                    setTrackOffset(Number(offset) || 0);
                    panelDebug("[PanelLyrics] Track offset:", Number(offset) || 0);
                }
            } catch (error) {
                if (requests.ownsOffset(revision, trackUri)) {
                    setTrackOffset(0);
                }
                console.warn("[PanelLyrics] Failed to load track offset:", error);
            }
        }, [requests]);

        // Original lyrics render first. Supplements can complete after a track change.
        const loadTranslationAsync = useMemo(() => createPanelTranslationLoader({
            getPanelLyricsService,
            getTranslator,
            getVisualSetting,
            ...translationPreferences,
            wantsPronunciationSlots: (lines, source) =>
                !!readPronunciationSlots(host)?.isRequested?.(lines, source),
            isActiveLoad: requests.ownsLyrics, sanitizePanelLyricsSupplements, applyPanelTranslationResults,
            displayLyrics: (next, source) => {
                setLyrics(next);
                setKaraokeSource(source);
                currentLyricsState.lyrics = next;
                currentLyricsState.karaokeSource = source;
            },
            publishPanelLyricsSnapshot,
        }), [requests]);
        const loadLyricsFromExtension = useMemo(() => createPanelLyricsLoader({
            requests, readCurrentTrackUri, getPanelTrackId, getPanelLyricsService, getSavedPanelLocalLyrics, readPseudoKaraoke,
            resolveItem: () => playback.resolveStablePlaybackTrack(null, readPlaybackSnapshot()),
            getVisualSetting, sanitizePanelLyricsSupplements, loadTrackOffset, loadTranslation: loadTranslationAsync, panelDebug,
            setLoading: () => setLyricsNotFound(false), showUnavailable, showLyrics, publishPanelLyricsSnapshot, resetTimeline,
        }), [requests, loadTrackOffset, loadTranslationAsync, showUnavailable, showLyrics, resetTimeline]);

        useEffect(() => {
            const player = getSpicetify().Player;
            const playbackUri = readCurrentTrackUri();
            let mounted = true;
            let resolvedUri = requests.trackUri || playbackUri;
            let narrationActive = false;
            let pendingPageUri = null;
            const effects = createRuntimeEffects({
                scheduleTimer: setTimeout, cancelTimer: clearTimeout,
                onCleanupError: error => console.warn("[PanelLyrics] Failed to clean up track effects:", error),
            });

            if (initial.trackUri && initial.trackUri === playbackUri) {
                const { trackUri, provider, lyrics, karaokeSource } = initial;
                Object.assign(currentLyricsState, { trackUri, provider, lyrics, karaokeSource });
            }

            const resetPanelTrack = (lyricsNotFound = false) => {
                pendingPageUri = null;
                requests.reset();
                showUnavailable(lyricsNotFound);
                resetTimeline();
                setTrackOffset(0);
            };

            const acceptTrack = (item) => {
                if (requests.trackUri && item.uri !== requests.trackUri) resetPanelTrack();
                resolvedUri = item.uri;
                narrationActive = false;
                void loadLyricsFromExtension(false, item.uri, item);
            };
            const resolver = createPlaybackTrackResolver({
                getPlaybackPosition: () => playback,
                getCurrentUri: () => resolvedUri,
                isMounted: () => mounted,
                isNarrationActive: () => narrationActive,
                beginTransition: () => true,
                commitTrack: acceptTrack,
                recoverTrack: acceptTrack,
                commitNarration(_item, snapshot) {
                    resolvedUri = snapshot.uri;
                    narrationActive = true;
                    resetPanelTrack(true);
                },
                releaseUnresolved() {
                    if (requests.trackUri && requests.trackUri === readCurrentTrackUri()) return;
                    resolvedUri = null;
                    narrationActive = false;
                    resetPanelTrack(true);
                },
                now: () => Date.now(),
                scheduleTimer: (callback, delay) => setTimeout(callback, delay),
                cancelTimer: (timer) => clearTimeout(timer),
            });
            const handleSongChange = (event) => {
                const isNarration = readPlaybackSnapshot()?.djNarration === true;
                setIsPlaybackPaused(getPlaybackPaused());
                const currentUri = readCurrentTrackUri();
                // Spotify can repeat songchange or send an event before its
                // playback state changes. A current presentation still owns
                // its request and the per-track playback state.
                if (isNarration || !currentUri || (requests.trackUri && requests.trackUri !== currentUri)) {
                    resetPanelTrack(isNarration);
                }
                resolver.schedule(event?.data?.item || null, isNarration ? 0 : 300);
            };
            let settingsReloadTimer = null;
            let settingsReloadUri = null;
            const reloadCurrentTrack = () => {
                const uri = readCurrentTrackUri();
                if (!uri) return;
                settingsReloadUri = uri;
                // Stop older responses immediately. Presets dispatch one event
                // per setting, and provider policy changes notify in a microtask.
                requests.invalidateLyrics();
                if (settingsReloadTimer !== null) return;
                settingsReloadTimer = setTimeout(() => {
                    settingsReloadTimer = null;
                    const pendingUri = settingsReloadUri;
                    settingsReloadUri = null;
                    if (mounted && pendingUri && pendingUri === readCurrentTrackUri()) {
                        void loadLyricsFromExtension(true, pendingUri);
                    }
                }, 0);
            };

            // 설정 변경 리스너
            const handleSettingsChange = (event) => {
                if (event.detail?.name === 'panel-lyrics-enabled') {
                    setIsEnabled(event.detail.value);
                }
                if (event.detail?.name === 'panel-font-scale') {
                    setFontScale(parseInt(event.detail.value, 10) || DEFAULT_FONT_SCALE);
                }
                if (event.detail?.name === 'pseudo-karaoke-render-advance') {
                    setPseudoKaraokeAdvanceMs(Number(event.detail.value) || 0);
                }
                if (event.detail?.name === 'instrumental-break-auto-detect') {
                    setAutoInstrumentalBreakEnabled(isAutoInstrumentalBreakEnabled());
                    setActiveTrailingInterludeKey(null);
                    setVisualTrailingInterludeKey(null);
                }
                if (event.detail?.name === 'karaoke-text-effects' ||
                    event.detail?.name === 'sync-data-custom-speaker-colors-enabled') {
                    setTextEffectRevision((revision) => revision + 1);
                }
                if (event.detail?.name === 'reduce-motion') {
                    setMotionRevision((revision) => revision + 1);
                }
                if ((!getPanelLyricsService()?.refreshLyricsProviderSelection && isLyricsProviderSelectionSetting(event.detail?.name)) ||
                    isLyricPresentationSetting(event.detail?.name)) {
                    reloadCurrentTrack();
                }
                if (event.detail?.name === 'instrumental-break-icon' ||
                    event.detail?.name === 'instrumental-break-show-label' ||
                    event.detail?.name === 'instrumental-break-label-font-family' ||
                    event.detail?.name === 'instrumental-break-label-font-size' ||
                    event.detail?.name === 'instrumental-break-label-font-weight' ||
                    event.detail?.name === 'instrumental-break-label-opacity' ||
                    event.detail?.name === 'instrumental-break-label-outline-width' ||
                    event.detail?.name === 'instrumental-break-label-outline-color' ||
                    event.detail?.name === 'instrumental-break-auto-detect' ||
                    event.detail?.name === 'instrumental-break-animation-speed' ||
                    event.detail?.name === 'panel-lyrics-original-font' ||
                    event.detail?.name === 'panel-lyrics-original-size' ||
                    event.detail?.name === 'original-font-family' ||
                    event.detail?.name === 'original-font-size' ||
                    event.detail?.name === 'original-font-weight' ||
                    event.detail?.name === 'original-opacity' ||
                    event.detail?.name === 'original-letter-spacing') {
                    setInstrumentalBreakRevision((revision) => revision + 1);
                }
            };

            // 싱크 오프셋 변경 리스너
            const handleOffsetChange = (event) => {
                const currentUri = readCurrentTrackUri();
                if (event.detail?.trackUri === currentUri) {
                    requests.invalidateOffset();
                    setTrackOffset(event.detail.offset || 0);
                    panelDebug("[PanelLyrics] Offset changed:", event.detail.offset);
                }
            };

            // 곡 변경 리스너
            const handleGlobalOffsetChange = (event) => {
                const offset = normalizeGlobalSyncOffset(event.detail?.offset);
                setGlobalOffset(offset);
                panelDebug("[PanelLyrics] Global offset changed:", offset);
            };

            const handleSyncDataUpdated = (event) => {
                const currentUri = readCurrentTrackUri();
                const currentTrackId = currentUri?.split(':')[2];
                const detail = event.detail || {};
                if (!currentUri || (detail.trackUri && detail.trackUri !== currentUri) || (detail.trackId && detail.trackId !== currentTrackId)) {
                    return;
                }
                void loadLyricsFromExtension(true, currentUri);
            };

            const handleLocalLyricsUpdated = (event) => {
                const currentUri = readCurrentTrackUri();
                const detail = event.detail || {};
                if (!currentUri || (detail.trackUri && detail.trackUri !== currentUri)) {
                    return;
                }
                void loadLyricsFromExtension(true, currentUri);
            };

            const handlePlaybackChange = () => {
                setIsPlaybackPaused(getPlaybackPaused());
                if (narrationActive !== (readPlaybackSnapshot()?.djNarration === true)) {
                    resolver.schedule();
                }
            };

            const handlePresentationOwnerReleased = ({ detail }) => {
                const uri = readCurrentTrackUri();
                if (!uri || pendingPageUri !== uri || detail?.source !== "ivlyrics-page"
                    || (detail.trackUri && detail.trackUri !== uri)) return;
                pendingPageUri = null;
                reloadCurrentTrack();
            };

            const handleSharedLyricsUpdate = (event) => {
                const detail = event.detail || {};
                const currentUri = readCurrentTrackUri();
                const update = resolveSharedPanelLyrics({
                    detail, currentUri, currentLyrics: currentLyricsState,
                    readSetting: getVisualSetting, preferences: translationPreferences, sanitize: sanitizePanelLyricsSupplements,
                });
                if (!update) return;
                const { lyrics: nextLyrics, provider, timingUpgrade, hasSupplementModes } = update;

                if (requests.trackUri !== currentUri) {
                    resetPanelTrack();
                    void loadTrackOffset(currentUri);
                } else if (!timingUpgrade && detail.source !== 'now-playing-panel') {
                    requests.invalidateLyrics();
                }
                if (!timingUpgrade) {
                    pendingPageUri = detail.source === "ivlyrics-page" && detail.presentationComplete === false
                        ? currentUri : null;
                }
                if (detail.source === "ivlyrics-page" && hasSupplementModes && detail.presentationComplete === true
                    && settingsReloadUri === currentUri) {
                    settingsReloadUri = null;
                }
                requests.adopt(currentUri);
                resolvedUri = currentUri;
                narrationActive = false;
                showLyrics({
                    trackUri: currentUri, provider, lyrics: nextLyrics, karaokeSource: detail.karaokeSource || null,
                    notFound: nextLyrics.length === 0 && detail.presentationComplete === true,
                });
            };

            const dispose = () => {
                mounted = false;
                if (settingsReloadTimer !== null) clearTimeout(settingsReloadTimer);
                resolver.cancel();
                requests.invalidate();
                effects.dispose();
            };
            try {
                setIsPlaybackPaused(getPlaybackPaused());
                effects.listen(player, "songchange", handleSongChange);
                effects.listen(player, "onplaypause", handlePlaybackChange);
                effects.listen(host, "ivLyrics", handleSettingsChange);
                effects.listen(host, LYRICS_PROVIDER_SELECTION_CHANGED, reloadCurrentTrack);
                effects.listen(host, "ivLyrics:offset-changed", handleOffsetChange);
                effects.listen(host, "ivLyrics:global-offset-changed", handleGlobalOffsetChange);
                effects.listen(host, "ivLyrics:sync-data-updated", handleSyncDataUpdated);
                effects.listen(host, LOCAL_LYRICS_UPDATED_EVENT, handleLocalLyricsUpdated);
                effects.listen(host, "ivLyrics:shared-lyrics-updated", handleSharedLyricsUpdate);
                effects.listen(host, LYRIC_PRESENTATION_OWNER_RELEASED, handlePresentationOwnerReleased);
                effects.subscribe(handler => getAIManager()?.on?.("translation:style:changed", handler), reloadCurrentTrack);
                effects.add(registerPanelLyricPresentationOwner(host, readCurrentTrackUri));

                const currentUri = readCurrentTrackUri();
                if (currentUri && currentUri === requests.trackUri) void loadTrackOffset(currentUri);
                else resolver.schedule();
            } catch (error) {
                dispose();
                throw error;
            }
            return dispose;
        }, [loadLyricsFromExtension, loadTrackOffset, requests, resetTimeline, showLyrics, showUnavailable]);
    };
}
