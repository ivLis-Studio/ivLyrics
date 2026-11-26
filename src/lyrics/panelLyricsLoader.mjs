import { getPanelSupplementVisibility } from "./panelLyricPresentation.mjs";
import { loadLyricsForPresentation } from "./loadLyricsForPresentation.mjs";
import { selectPlaybackLyrics } from "./selectPlaybackLyrics.mjs";
import { readLyricPlaybackPreferences } from "./lyricPresentationIdentity.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

const SERVICE_WAIT_INTERVAL_MS = 300;
const SERVICE_WAIT_ATTEMPTS = 20;

async function readPanelSource({ service, track, isLocalTrack, getSavedPanelLocalLyrics, readPseudoKaraoke, ownsRequest, signal }) {
    const readRevision = () => service.getLyricsRequestRevision?.(track.uri);
    while (ownsRequest()) {
        const revision = readRevision();
        const isSourceCurrent = () => revision === readRevision();
        try {
            const [providerOverride, languageOverride] = await Promise.all([
                isLocalTrack ? null : service.getTrackLyricsProviderOverride?.(track.uri),
                service.getTrackLanguageOverride?.(track.uri),
            ]);
            if (!ownsRequest()) return null;
            if (!isSourceCurrent()) continue;

            const trackInfo = { ...track, languageOverride: languageOverride || null };
            const override = providerOverride || null;
            let result = isLocalTrack ? getSavedPanelLocalLyrics(track.uri) : null;
            if (!result) {
                const lookup = await loadLyricsForPresentation(service, trackInfo, 1, override, { signal });
                if (!ownsRequest()) return null;
                if (!lookup || lookup.revision !== revision) continue;
                result = lookup.result;
            }
            if (isLocalTrack && result) {
                const pseudoKaraoke = readPseudoKaraoke();
                if (pseudoKaraoke?.applyToResult) result = await pseudoKaraoke.applyToResult(result, trackInfo);
            }
            if (!ownsRequest()) return null;
            if (isSourceCurrent()) return { trackInfo, result, override, isSourceCurrent };
        } catch (error) {
            if (!ownsRequest()) return null;
            if (isSourceCurrent()) throw error;
        }
    }
    return null;
}

function completeLineEnds(lines, duration) {
    return lines.map((line, index) => {
        if (line.endTime) return line;
        const next = lines[index + 1];
        if (next) return { ...line, endTime: next.startTime };
        return duration > line.startTime ? { ...line, endTime: duration } : line;
    });
}

export function createPanelLyricsLoader({
    requests, readCurrentTrackUri, resolveItem, getPanelTrackId, getPanelLyricsService, getSavedPanelLocalLyrics, readPseudoKaraoke,
    getVisualSetting, sanitizePanelLyricsSupplements, loadTrackOffset, loadTranslation, panelDebug,
    setLoading, showUnavailable, showLyrics, publishPanelLyricsSnapshot, resetTimeline,
}) {
    return async function loadLyrics(forceReload = false, requestedTrackUri = null, resolvedItem = null) {
        const item = resolvedItem || resolveItem();
        const trackUri = item?.uri;
        if (!trackUri || trackUri !== readCurrentTrackUri()) return;
        if (requestedTrackUri && requestedTrackUri !== trackUri) return;
        const request = requests.beginLyrics(trackUri, forceReload);
        if (!request) return;
        const { revision: loadRevision, signal } = request;
        const ownsRequest = () => requests.ownsLyrics(loadRevision, trackUri);

        try {
            if (!ownsRequest()) return;
            setLoading();
            const trackId = getPanelTrackId(trackUri);
            const track = {
                uri: trackUri, trackId,
                title: item.name || item.metadata?.title || "",
                artist: item.artists?.map(artist => artist.name).join(", ") || item.metadata?.artist_name || "",
                album: item.album?.name || item.metadata?.album_title || "",
                duration: item.duration?.milliseconds || Number(item.metadata?.duration || 0),
            };
            panelDebug("[PanelLyrics] Loading lyrics for:", track.title);
            // An offset read has its own ownership and can finish after supplements.
            void loadTrackOffset(trackUri);
            let service = getPanelLyricsService();
            for (let attempt = 0; !service && attempt < SERVICE_WAIT_ATTEMPTS; attempt++) {
                await new Promise(resolve => setTimeout(resolve, SERVICE_WAIT_INTERVAL_MS));
                if (!ownsRequest()) return;
                service = getPanelLyricsService();
            }
            if (!service) throw new Error("LyricsService Extension not loaded");

            let loaded;
            do {
                loaded = await readPanelSource({
                    service, track, isLocalTrack: !trackId, getSavedPanelLocalLyrics, readPseudoKaraoke, ownsRequest, signal,
                });
                if (!loaded || !ownsRequest()) return;
            } while (!loaded.isSourceCurrent());
            const { trackInfo, override, isSourceCurrent } = loaded;
            if (!loaded.result || loaded.result.error) {
                panelDebug("[PanelLyrics] No lyrics found:", loaded.result?.error);
                showUnavailable();
                return;
            }

            const result = retainLrcRedWordTiming(loaded.result, service.getLyricsSnapshot?.(trackUri)?.rawResult);
            const playbackPreferences = readLyricPlaybackPreferences(getVisualSetting, trackInfo.languageOverride);
            const { lyrics, lyricsType } = selectPlaybackLyrics(result, playbackPreferences.karaokeEnabled);
            if (!lyrics.length) {
                showUnavailable();
                return;
            }
            const karaokeSource = lyricsType === "karaoke" ? result.karaokeSource || null : null;
            const displayLyrics = sanitizePanelLyricsSupplements(
                completeLineEnds(lyrics, trackInfo.duration),
                getPanelSupplementVisibility(null, null, false),
            );
            const provider = result.provider || null;
            showLyrics({ trackUri, provider, lyrics: displayLyrics, karaokeSource });
            publishPanelLyricsSnapshot({
                trackUri, trackInfo, rawResult: result, displayLyrics, provider, karaokeSource, lyricsType,
                trackLyricsProviderOverride: override, playbackPreferences,
                displayMode1: null, displayMode2: null,
                translationSourceText: null, phoneticLines: null, translationLines: null,
                presentationComplete: false,
            });
            resetTimeline();
            void loadTranslation(trackInfo, displayLyrics, result, loadRevision, lyricsType, karaokeSource, isSourceCurrent);
        } catch (error) {
            if (!ownsRequest()) return;
            console.error("[PanelLyrics] Failed to load lyrics:", error);
            showUnavailable();
        } finally {
            requests.endLyrics(loadRevision);
        }
    };
}
