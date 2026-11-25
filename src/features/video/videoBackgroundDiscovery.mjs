import { readSavedVideoSelection } from "./savedVideoSelection.mjs";
import { selectedVideoStore as defaultSelectedVideoStore } from "./selectedVideoStore.mjs";
import { VideoMatch } from "./VideoMatch.js";
import { getYouTubeVideoCandidates } from "./videoMatchSession.mjs";
import { describeVideoTrack } from "./videoTrackMetadata.mjs";

export function createVideoBackgroundDiscovery({
    readPlayerItem, readVisualSettings, readSpotifyData, readSyncDataService, readApiTracker,
    extractTrackId, getRandomCommunityVideo, resolveHiddenCommunityVideo, selectedVideoStore = defaultSelectedVideoStore,
    readLyricsCache, matchSession, makeVideoLookupRequest, fetchVideoLookup, translate, notifyWarning, debug,
}) {
    const { isRejectedVideoForTrack, rejectVideoForTrack, describeVideoForMatch, pickVideoForTrack } = matchSession;
    const videoTimingHintedTracks = new Set();
    const randomVideoEnabled = () => readVisualSettings()?.["community-video-random"] === true;
    const describeTrack = (trackUri, trackId) => describeVideoTrack({
        trackUri, trackId, spotifyData: readSpotifyData(trackUri), playerItem: readPlayerItem(),
    });

    function beginLookup({
        trackUri, externalVideoInfo, readPrefetchedVideo, isCurrent = () => true,
        setVideoInfo, reportVideoBackgroundStatus, showVideoBackgroundError,
    }) {
        if (!trackUri || externalVideoInfo?.suppressVideoBackground === true) {
            setVideoInfo(null);
            reportVideoBackgroundStatus("idle");
            return undefined;
        }

        const useRandomCommunityVideo = randomVideoEnabled();
        if (!useRandomCommunityVideo && externalVideoInfo?.youtubeVideoId) {
            setVideoInfo(externalVideoInfo, "chosen");
            return undefined;
        }

        const trackId = extractTrackId(trackUri);
        setVideoInfo(null);
        reportVideoBackgroundStatus("loading", {
            label: translate("settings.videoBackground.label") || translate("videoBackground.loading"),
            description: translate("videoBackground.loadingMessage"),
        });

        const controller = new AbortController();
        const { signal } = controller;
        const wanted = () => !signal.aborted && isCurrent() && randomVideoEnabled() === useRandomCommunityVideo;
        const readRevision = () => readLyricsCache()?.getRevision?.(trackId) ?? 0;
        const cacheRevision = readRevision();
        const autoCurrent = () => wanted() && readRevision() === cacheRevision;
        let tracker;
        let logId;

        function finishLog(data, status, error) {
            if (logId == null) return;
            const loggedRequest = logId;
            logId = null;
            tracker?.logResponse?.(loggedRequest, data, status, error);
        }

        function cancelLog() {
            if (logId != null) tracker?.cancelRequest?.(logId);
            logId = null;
        }

        async function selectRandomVideo() {
            try {
                const randomVideo = await getRandomCommunityVideo(trackUri, { signal });
                if (!wanted()) return;
                if (randomVideo?.youtubeVideoId) {
                    debug(`[VideoBackground] Using random community video: ${randomVideo.youtubeVideoId}`);
                    setVideoInfo(randomVideo, "chosen");
                    return;
                }
            } catch (error) {
                if (!wanted()) return;
                console.warn("[VideoBackground] Failed to select a random community video:", error);
            }
            setVideoInfo(null);
            reportVideoBackgroundStatus("idle");
        }

        function showFailure(message) {
            setVideoInfo(null);
            showVideoBackgroundError(message);
        }

        async function loadVideoInfo() {
            try {
                if (!wanted()) return;
                if (trackId && useRandomCommunityVideo) {
                    await selectRandomVideo();
                    return;
                }

                // A stored user choice takes precedence over automatic results.
                try {
                    const saved = await readSavedVideoSelection({
                        store: selectedVideoStore, trackUri, signal, isCurrent: wanted, resolveHiddenCommunityVideo,
                        shouldHideDisliked: () => readVisualSettings()?.["community-video-hide-disliked"] !== false,
                        reportError: (...args) => console.error(...args),
                    });
                    if (!wanted()) return;
                    if (saved?.suppressVideoBackground) {
                        reportVideoBackgroundStatus("idle");
                        return;
                    }
                    if (saved?.youtubeVideoId) {
                        debug(`[VideoBackground] Using saved selected video: ${saved.youtubeVideoId}`);
                        setVideoInfo(saved, "chosen");
                        return;
                    }
                } catch (error) {
                    if (!wanted()) return;
                    console.error("[VideoBackground] Failed to load saved video:", error);
                }

                if (!trackId) {
                    showFailure(translate("videoBackground.localTrackNeedsVideo") || "로컬 곡은 영상 버튼에서 YouTube URL을 직접 지정하세요.");
                    return;
                }
                if (!autoCurrent()) return;

                const trackMetadata = describeTrack(trackUri, trackId);
                const trackFacts = { ...trackMetadata, isrc: "" };
                const isUsableAutoVideo = (info, origin) => {
                    if (!info?.youtubeVideoId || isRejectedVideoForTrack(trackUri, info.youtubeVideoId)) return false;
                    const assessment = VideoMatch.assess(trackFacts, describeVideoForMatch(info));
                    if (assessment.verdict !== "mismatch") return true;
                    console.warn(`[VideoBackground] Skipping ${origin} video ${info.youtubeVideoId}: it does not match this song`, assessment.reasons);
                    return false;
                };

                const prefetched = readPrefetchedVideo?.(trackUri);
                if (isUsableAutoVideo(prefetched, "prefetched")) {
                    debug(`[VideoBackground] Using prefetched video info for trackId: ${trackId}`);
                    setVideoInfo(prefetched, "auto");
                    return;
                }

                let trackIsrc = await readSyncDataService()?.resolveTrackIsrc?.(trackId, trackMetadata);
                if (!autoCurrent()) return;
                if (!trackIsrc) {
                    trackIsrc = await readSyncDataService()?.getTrackIsrc?.(trackId, trackMetadata);
                    if (!autoCurrent()) return;
                }
                if (!trackIsrc) {
                    showFailure("이 곡의 ISRC를 확인할 수 없어 영상 배경을 불러올 수 없습니다.");
                    return;
                }
                trackFacts.isrc = trackIsrc;

                try {
                    const cached = await readLyricsCache()?.getYouTube(trackId, trackIsrc);
                    if (!autoCurrent()) return;
                    if (isUsableAutoVideo(cached, "cached")) {
                        debug(`[VideoBackground] Using cached YouTube info for ISRC: ${trackIsrc}`);
                        readApiTracker()?.logCacheHit?.("youtube", `youtube:${trackId}`, {
                            videoId: cached.youtubeVideoId,
                            hasCaption: cached.captionStartTime != null,
                        });
                        setVideoInfo(cached, "auto");
                        return;
                    }
                } catch (error) {
                    if (!autoCurrent()) return;
                    console.warn("[VideoBackground] Cache check failed:", error);
                }

                const { url, headers } = makeVideoLookupRequest({ trackIsrc, trackId, spotifyData: trackMetadata });
                tracker = readApiTracker();
                logId = tracker?.logRequest?.("youtube", url, { trackId });
                const { data, isDecoy } = await fetchVideoLookup(url, { headers, signal, cacheRevision });
                if (!autoCurrent()) return;
                const candidates = !isDecoy && data?.success
                    ? getYouTubeVideoCandidates(data.data, data.communityVideos)
                    : [];
                if (candidates.length === 0) {
                    finishLog(null, "error", "Video not found");
                    showFailure(translate("videoBackground.notFound"));
                    return;
                }

                // The server cannot change the already resolved recording identity.
                const responseIsrc = readSyncDataService()?.normalizeSyncDataIsrc?.(data.data?.isrc) || "";
                if (responseIsrc && responseIsrc !== trackIsrc) {
                    console.warn(`[VideoBackground] Video response ISRC ${responseIsrc} differs from requested ${trackIsrc}`);
                }
                const picked = pickVideoForTrack(trackFacts, candidates, trackUri);
                if (!picked) {
                    console.warn(`[VideoBackground] No server video matches this song (${trackIsrc})`);
                    finishLog(null, "error", "No matching video");
                    showFailure(translate("videoBackground.noMatch"));
                    return;
                }
                if (data.data?.youtubeVideoId && picked.video !== data.data) {
                    console.warn(`[VideoBackground] Skipping server video ${data.data.youtubeVideoId}; using ${picked.video.youtubeVideoId}`);
                }
                finishLog({
                    videoId: picked.video.youtubeVideoId,
                    hasCaption: picked.video.captionStartTime != null,
                }, "success");
                readLyricsCache()?.setYouTube(trackId, picked.video, { isrc: trackIsrc, canWrite: autoCurrent }).catch(() => {});
                setVideoInfo(picked.video, "auto");
            } catch (error) {
                if (!autoCurrent()) return;
                finishLog(null, "error", error?.message);
                console.error("[VideoBackground] Failed to load video info:", error);
                showFailure(translate("videoBackground.error"));
            } finally {
                cancelLog();
            }
        }

        void loadVideoInfo();
        return () => {
            if (signal.aborted) return;
            controller.abort();
            cancelLog();
        };
    }

    // A loaded automatic match can be checked again using its actual duration.
    function checkLoadedMatch({
        isPlayerReady, videoInfo, sourceKind, useHelper, videoRef, playerRef,
        trackUri, getLiveVideoSyncInfo, setVideoLoadRevision, isCurrent = () => true,
    }) {
        if (!isPlayerReady || !videoInfo?.youtubeVideoId || sourceKind !== "auto") return undefined;

        let cancelled = false;
        let retryTimer = null;
        let attempts = 0;
        const checkLoadedVideo = () => {
            if (cancelled || !isCurrent()) return;
            let durationSeconds = 0;
            try {
                durationSeconds = Number(useHelper ? videoRef.current?.duration : playerRef.current?.getDuration?.()) || 0;
            } catch (e) { }
            if (!(durationSeconds > 0)) {
                if (++attempts < 20) retryTimer = setTimeout(checkLoadedVideo, 500);
                return;
            }
            const trackFacts = { ...describeTrack(trackUri), isrc: "" };
            const assessment = VideoMatch.assess(trackFacts, describeVideoForMatch(videoInfo, durationSeconds));
            if (assessment.verdict === "mismatch") {
                console.warn(`[VideoBackground] Video ${videoInfo.youtubeVideoId} does not match this song`, assessment.reasons);
                rejectVideoForTrack(trackUri, videoInfo.youtubeVideoId);
                setVideoLoadRevision((revision) => revision + 1);
                return;
            }
            // Without a known start point the video's timeline is only a guess.
            const timing = VideoMatch.getTimingConfidence(getLiveVideoSyncInfo(videoInfo, trackUri), durationSeconds, trackFacts.durationMs);
            if (timing === "guess" && !videoTimingHintedTracks.has(trackUri)) {
                videoTimingHintedTracks.add(trackUri);
                notifyWarning(translate("videoBackground.timingGuess"), 6000);
            }
        };

        checkLoadedVideo();
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }

    return { beginLookup, checkLoadedMatch };
}
