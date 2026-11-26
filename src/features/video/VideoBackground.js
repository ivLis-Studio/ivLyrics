import { createRuntimeTrackIdentity as createBackgroundTrackIdentity } from "#ivlyrics/core/trackIdentity.mjs";
import { getPlaybackPositionService } from "#ivlyrics/core/playbackPositionService.mjs";

import { readActiveCommunityVideo as readVideoBackgroundActive } from "#ivlyrics/features/video/videoSyncRuntimeState.mjs";
import {
    publishVideoBackground, updateVideoBackgroundReadiness, clearVideoBackground,
} from "#ivlyrics/features/video/activeVideoBackground.mjs";
import {
    createVideoDriftState,
    resetVideoDriftState,
} from "./videoDriftCorrection.mjs";

import { createVideoBackgroundSync } from "#ivlyrics/features/video/videoBackgroundTiming.mjs";
import { isVideoTrackCurrent, readVideoTrackPlayback, watchVideoBackgroundPlayback } from "#ivlyrics/features/video/videoBackgroundPlayback.mjs";
import { createYouTubeBackgroundTimeline } from "#ivlyrics/features/video/youTubeBackgroundTimeline.mjs";
import { startHelperBackgroundDownload } from "#ivlyrics/features/video/helperBackgroundDownload.mjs";
import { startHelperBackgroundVideo } from "#ivlyrics/features/video/helperBackgroundVideo.mjs";
import { startYouTubeBackgroundPlayer } from "#ivlyrics/features/video/youTubeBackgroundPlayer.mjs";
import { preloadYouTubeIframeApi } from "#ivlyrics/features/video/youTubeIframeApi.mjs";
import { renderVideoBackground } from "#ivlyrics/features/video/videoBackgroundView.mjs";

import { createVideoBackgroundDiscovery } from "#ivlyrics/features/video/videoBackgroundDiscovery.mjs";
import { createVideoBackgroundDiagnostics } from "#ivlyrics/features/video/videoBackgroundDiagnostics.mjs";
import { useVideoBackgroundFallbackArt } from "#ivlyrics/features/video/videoBackgroundFallbackArt.mjs";
import { watchVideoBackgroundTrackOffset } from "#ivlyrics/features/video/videoBackgroundTrackOffset.mjs";
import { watchVideoBackgroundRefresh } from "#ivlyrics/features/video/videoBackgroundRefresh.mjs";
import { LYRICS_CACHE_INVALIDATED_EVENT } from "#ivlyrics/lyrics/createLyricsCache.mjs";

export function createVideoBackground({
    host: window, document = window.document ?? globalThis.document, react, config: CONFIG, i18n: I18n, spicetify: Spicetify, utils: Utils, toast: Toast,
    readLyricsCache, videoHelper: VideoHelperService, matchSession, makeVideoLookupRequest,
    readRoutePrefetchedVideo, readSpotifyData, readSyncDataService, readApiTracker, readGlobalSyncOffset, isYouTubeAdPlaying, fetchVideoLookup,
}) {
    const VIDEO_BACKGROUND_DEBUG = false;
    const videoBackgroundDebug = (...args) => {
        if (VIDEO_BACKGROUND_DEBUG) console.log(...args);
    };

    const { beginLookup, checkLoadedMatch } = createVideoBackgroundDiscovery({
        readPlayerItem: () => Spicetify.Player?.data?.item,
        readVisualSettings: () => CONFIG?.visual,
        readSpotifyData, readSyncDataService, readApiTracker,
        extractTrackId: uri => Utils.extractTrackId(uri),
        getRandomCommunityVideo: (uri, options) => Utils.getRandomCommunityVideo(uri, options),
        resolveHiddenCommunityVideo: (...args) => Utils.resolveHiddenCommunityVideo?.(...args),
        readLyricsCache, matchSession, makeVideoLookupRequest, fetchVideoLookup,
        translate: (...args) => I18n.t(...args),
        notifyWarning: (...args) => Toast.warning(...args),
        debug: videoBackgroundDebug,
    });
    const { useVideoBackgroundDiagnosticsState, useVideoBackgroundDiagnostics } =
        createVideoBackgroundDiagnostics({ react, host: window, document });

    const notifyChange = trackUri => {
        window.dispatchEvent(new CustomEvent("ivLyrics:communityVideoChanged", { detail: { trackUri } }));
    };
    const backgroundTrackIdentity = createBackgroundTrackIdentity(window);

    const readPlaybackSnapshot = () => getPlaybackPositionService(window)?.getPlayerPlaybackSnapshot?.();
    const { getLiveVideoSyncInfo, computeVideoSyncState } = createVideoBackgroundSync({
        readVisualSettings: () => CONFIG?.visual,
        readGlobalSyncOffset,
        readActiveVideo: () => typeof window !== "undefined" ? readVideoBackgroundActive(window) : null,
    });

    const { syncYouTubePlayerTimeline, settleYouTubeHoldPrime } =
        createYouTubeBackgroundTimeline({ isYouTubeAdPlaying });

    const VideoBackground = ({ trackUri, firstLyricTime, brightness, blurAmount, coverMode, videoScale, fallbackBackground, fallbackSolidColor, fallbackGradientStyle, externalVideoInfo,
        readPrefetchedVideo = readRoutePrefetchedVideo,
        onLoadingChange }) => {
        const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = react;
        const spotifyPlayer = Spicetify.Player;
        const [videoLoadRevision, setVideoLoadRevision] = useState(0);
        const lookup = useMemo(() => ({ trackUri, externalVideoInfo, readPrefetchedVideo }),
            [trackUri, externalVideoInfo, readPrefetchedVideo, videoLoadRevision]);
        const committedLookup = useRef(lookup);
        const lookupFailed = useRef(false);
        useLayoutEffect(() => {
            committedLookup.current = lookup;
            lookupFailed.current = false;
            return () => { committedLookup.current = null; };
        }, [lookup]);
        const isLookupCurrent = useCallback(() => committedLookup.current === lookup
            && (!trackUri || isVideoTrackCurrent(spotifyPlayer, trackUri, readPlaybackSnapshot())), [lookup, spotifyPlayer, trackUri]);
        const [videoSource, setVideoSource] = useState(null);
        const currentSelection = videoSource?.lookup === lookup ? videoSource : null;
        const videoInfo = currentSelection?.info || null;
        const setVideoInfo = useCallback((info, kind) => {
            if (isLookupCurrent()) setVideoSource(info ? { lookup, info, kind } : null);
        }, [lookup, isLookupCurrent]);

        const diagnostics = useVideoBackgroundDiagnosticsState();
        const { stats, showStats, setHelperStatus } = diagnostics;

        const [isVisible, setIsVisible] = useState(() => document?.visibilityState === "visible");
        useEffect(() => {
            const update = () => setIsVisible(document.visibilityState === "visible");
            document.addEventListener("visibilitychange", update);
            update();
            return () => document.removeEventListener("visibilitychange", update);
        }, []);
        // The selected video's captionStartTime is the single local video anchor;
        // do not apply a second relative nudge on top of the atomic #126 store.
        const [trackOffset, setTrackOffset] = useState(null);
        const trackOffsetMs = trackOffset?.trackUri === trackUri ? trackOffset?.offset ?? 0 : 0;
        // 헬퍼 모드 관련 상태
        const [useHelper, setUseHelper] = useState(() => [true, "true"].includes(CONFIG?.visual?.["video-helper-enabled"]));
        const playbackSource = useMemo(() => ({ lookup, videoInfo, useHelper }), [lookup, videoInfo, useHelper]);
        const committedSource = useRef(playbackSource);
        useLayoutEffect(() => {
            committedSource.current = playbackSource;
            return () => { committedSource.current = null; };
        }, [playbackSource]);
        const isPlaybackSourceCurrent = useCallback(() => committedSource.current === playbackSource, [playbackSource]);
        const [playingSource, setPlayingSource] = useState(null);
        const onPlayingChange = useCallback(playing => {
            if (isPlaybackSourceCurrent()) setPlayingSource(playing ? playbackSource : null);
        }, [isPlaybackSourceCurrent, playbackSource]);
        const isPlaying = playingSource === playbackSource;
        const [readySource, setReadySource] = useState(null);
        const isPlayerReady = readySource === playbackSource;
        const setIsPlayerReady = useCallback(ready => {
            if (isPlaybackSourceCurrent()) setReadySource(ready ? playbackSource : null);
        }, [playbackSource, isPlaybackSourceCurrent]);
        const [helperVideo, setHelperVideo] = useState(null);
        const helperVideoUrl = helperVideo?.source === playbackSource ? helperVideo.url : null;
        const setHelperVideoUrl = useCallback(url => {
            if (isPlaybackSourceCurrent()) setHelperVideo(url ? { source: playbackSource, url } : null);
        }, [playbackSource, isPlaybackSourceCurrent]);
        const containerRef = useRef(null);
        const playerRef = useRef(null); // Use ref to hold player instance for reliable cleanup
        const activeVideoOwnerRef = useRef({});
        const videoRef = useRef(null); // HTML5 video element for helper mode
        const firstLyricTimeRef = useRef(firstLyricTime);
        const trackOffsetMsRef = useRef(trackOffsetMs);
        const lastCaptionDisableRef = useRef(0);
        const youtubeHoldStateRef = useRef({
            isHolding: false,
            primePending: false,
        });
        const videoDriftStateRef = useRef(null);
        const getVideoDriftState = useCallback(() => {
            if (!videoDriftStateRef.current) videoDriftStateRef.current = createVideoDriftState();
            return videoDriftStateRef.current;
        }, []);
        const readFrame = useCallback(() => {
            if (!videoInfo || !isPlaybackSourceCurrent()) return null;
            const playback = readVideoTrackPlayback(spotifyPlayer, trackUri, readPlaybackSnapshot());
            if (!playback) return null;
            return {
                isPlaying: playback.isPlaying,
                syncState: computeVideoSyncState({
                    spotifyProgressMs: playback.position,
                    firstLyricTime: firstLyricTimeRef.current,
                    trackOffsetMs: trackOffsetMsRef.current,
                    videoInfo, trackUri,
                }),
            };
        }, [spotifyPlayer, trackUri, videoInfo, isPlaybackSourceCurrent]);
        const albumArtUrl = backgroundTrackIdentity.getTrackArtwork(spotifyPlayer?.data?.item);

        const previousFallbackUrl = useVideoBackgroundFallbackArt(react, trackUri, albumArtUrl);

        useLayoutEffect(() => {
            firstLyricTimeRef.current = firstLyricTime;
        }, [firstLyricTime]);

        useLayoutEffect(() => {
            trackOffsetMsRef.current = trackOffsetMs;
        }, [trackOffsetMs]);

        // 헬퍼 모드 설정 확인
        useEffect(() => {
            const helperEnabled = CONFIG?.visual?.["video-helper-enabled"] === true || CONFIG?.visual?.["video-helper-enabled"] === "true";
            setUseHelper(helperEnabled);

            // 설정 변경 이벤트 리스너
            const handleHelperChange = (e) => {
                setUseHelper(e.detail?.enabled === true);
            };
            window.addEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
            return () => window.removeEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
        }, []);

        useEffect(() => watchVideoBackgroundRefresh({
            host: window, player: spotifyPlayer, trackUri,
            readPlaybackSnapshot,
            // A healthy fixed video follows the replay through its playback clock.
            shouldRefreshOnReplay: () => CONFIG?.visual?.["community-video-random"] === true || lookupFailed.current,
            readActiveVideo: () => readVideoBackgroundActive(window),
            refresh: () => {
                const active = committedLookup.current;
                if (active && active.trackUri === trackUri) setVideoLoadRevision(revision => revision + 1);
            },
        }), [spotifyPlayer, trackUri]);

        useEffect(() => {
            const trackId = Utils.extractTrackId(trackUri);
            if (!trackId || currentSelection?.kind === "chosen" || externalVideoInfo?.youtubeVideoId
                || externalVideoInfo?.suppressVideoBackground === true) return undefined;
            const refreshAfterClear = event => {
                if (CONFIG?.visual?.["community-video-random"] === true) return;
                if (event.detail?.trackId === null || event.detail?.trackId === trackId) {
                    setVideoLoadRevision(revision => revision + 1);
                }
            };
            window.addEventListener(LYRICS_CACHE_INVALIDATED_EVENT, refreshAfterClear);
            return () => window.removeEventListener(LYRICS_CACHE_INVALIDATED_EVENT, refreshAfterClear);
        }, [trackUri, currentSelection?.kind, externalVideoInfo]);

        useLayoutEffect(() => {
            resetVideoDriftState(videoDriftStateRef.current);
        }, [playbackSource]);

        useEffect(() => {
            publishVideoBackground({
                host: window, owner: activeVideoOwnerRef.current, trackUri, videoInfo, isPlayerReady, notifyChange,
            });
        }, [trackUri, videoInfo]);

        useEffect(() => {
            updateVideoBackgroundReadiness({
                host: window, owner: activeVideoOwnerRef.current, trackUri, videoInfo, isPlayerReady, notifyChange,
                readDuration: () => useHelper ? videoRef.current?.duration : playerRef.current?.getDuration?.(),
            });
        }, [trackUri, videoInfo, isPlayerReady, useHelper]);

        useEffect(() => () => {
            clearVideoBackground({ host: window, owner: activeVideoOwnerRef.current, trackUri, notifyChange });
        }, []);

        const loadingListener = useRef(onLoadingChange);
        useLayoutEffect(() => { loadingListener.current = onLoadingChange; }, [onLoadingChange]);
        const publishLoadingStatus = useCallback((phase, details = {}) => {
            if (typeof loadingListener.current !== "function") return;
            loadingListener.current({
                phase,
                trackUri,
                ...details,
            });
        }, [trackUri]);
        const reportVideoBackgroundStatus = useCallback((...args) => {
            if (isLookupCurrent()) publishLoadingStatus(...args);
        }, [isLookupCurrent, publishLoadingStatus]);

        const showVideoBackgroundError = useCallback((message) => {
            if (!isLookupCurrent()) return;
            lookupFailed.current = true;
            Toast.error(message);
            reportVideoBackgroundStatus("error");
        }, [isLookupCurrent, reportVideoBackgroundStatus]);
        const reportPlaybackStatus = useCallback((...args) => {
            if (isPlaybackSourceCurrent()) reportVideoBackgroundStatus(...args);
        }, [isPlaybackSourceCurrent, reportVideoBackgroundStatus]);
        const showPlaybackError = useCallback(message => {
            if (isPlaybackSourceCurrent()) showVideoBackgroundError(message);
        }, [isPlaybackSourceCurrent, showVideoBackgroundError]);

        // Clear the pill when this background instance is removed or its track changes.
        useEffect(() => {
            return () => publishLoadingStatus("idle");
        }, [publishLoadingStatus]);

        // Load YouTube IFrame API (헬퍼 모드가 아닐 때만)
        useEffect(() => {
            if (useHelper) return;
            preloadYouTubeIframeApi(window, document);
        }, [useHelper]);

        useEffect(() => beginLookup({
            ...lookup, isCurrent: isLookupCurrent,
            setVideoInfo, reportVideoBackgroundStatus, showVideoBackgroundError,
        }), [lookup, isLookupCurrent, setVideoInfo, reportVideoBackgroundStatus, showVideoBackgroundError]);

        useEffect(() => checkLoadedMatch({
            isPlayerReady, videoInfo, sourceKind: currentSelection?.kind, useHelper, videoRef, playerRef,
            trackUri, getLiveVideoSyncInfo, setVideoLoadRevision, isCurrent: isPlaybackSourceCurrent,
        }), [isPlayerReady, videoInfo, currentSelection?.kind, useHelper, trackUri, isPlaybackSourceCurrent]);

        useEffect(() => watchVideoBackgroundTrackOffset({
            host: window, trackUri, readOffset: Utils?.getTrackSyncOffset?.bind(Utils),
            publish: offset => setTrackOffset({ trackUri, offset }),
        }), [trackUri]);

        // 헬퍼 모드: 비디오 다운로드 요청
        useEffect(() => {
            if (!useHelper || !videoInfo || !videoInfo.youtubeVideoId) return;

            return startHelperBackgroundDownload({
                videoId: videoInfo.youtubeVideoId, videoHelper: VideoHelperService,
                translate: (...args) => I18n.t(...args),
                setHelperVideoUrl, setIsPlayerReady, setHelperStatus,
                reportVideoBackgroundStatus: reportPlaybackStatus, showVideoBackgroundError: showPlaybackError,
                isCurrent: isPlaybackSourceCurrent, debug: videoBackgroundDebug,
            });
        }, [useHelper, videoInfo, reportPlaybackStatus, showPlaybackError]);

        // 헬퍼 모드: HTML5 video 재생 및 동기화
        useEffect(() => {
            if (!useHelper || !helperVideoUrl || !videoRef.current) return;

            videoBackgroundDebug(`[VideoBackground] Loading helper video from: ${helperVideoUrl}`);
            reportPlaybackStatus("loading", {
                label: I18n.t("settings.videoBackground.label") || I18n.t("videoBackground.loading"),
                description: I18n.t("videoBackground.loadingMessage"),
            });

            return startHelperBackgroundVideo({
                video: videoRef.current, url: helperVideoUrl, readFrame,
                setIsPlayerReady, reportVideoBackgroundStatus: reportPlaybackStatus,
                isCurrent: isPlaybackSourceCurrent,
                showError: () => showPlaybackError(I18n.t("videoBackground.helperError")),
                debug: videoBackgroundDebug,
            });
        }, [useHelper, helperVideoUrl, readFrame, reportPlaybackStatus, showPlaybackError]);


        useVideoBackgroundDiagnostics({
            ...diagnostics, useHelper, videoInfo, videoRef, playerRef, isPlayerReady, isVisible,
        });

        // 일반 모드 (YouTube IFrame): Initialize Player when videoInfo is available
        useEffect(() => {
            if (useHelper) return; // 헬퍼 모드면 스킵
            if (!videoInfo || !videoInfo.youtubeVideoId || !containerRef.current) return;

            reportPlaybackStatus("loading", {
                label: I18n.t("settings.videoBackground.label") || I18n.t("videoBackground.loading"),
                description: I18n.t("videoBackground.loadingMessage"),
            });

            return startYouTubeBackgroundPlayer({
                host: window, document, videoId: videoInfo.youtubeVideoId,
                containerRef, playerRef, youtubeHoldStateRef,
                setIsPlayerReady, reportVideoBackgroundStatus: reportPlaybackStatus, settleYouTubeHoldPrime,
                isCurrent: isPlaybackSourceCurrent,
                showError: () => showPlaybackError(I18n.t("videoBackground.error")),
            });
        }, [useHelper, videoInfo, reportPlaybackStatus, showPlaybackError]);

        useEffect(() => {
            if (!isPlayerReady || !videoInfo) return;
            return watchVideoBackgroundPlayback({
                host: window, spotifyPlayer,
                source: { trackUri, videoId: videoInfo.youtubeVideoId, useHelper, isVisible, isCurrent: isPlaybackSourceCurrent },
                readFrame, readPlayer: () => useHelper ? videoRef.current : playerRef.current, onPlayingChange,
                timing: { getVideoDriftState, holdState: youtubeHoldStateRef.current, lastCaptionDisableRef, syncYouTubePlayerTimeline },
            });
        }, [spotifyPlayer, trackUri, useHelper, isVisible, isPlayerReady, videoInfo, firstLyricTime, trackOffsetMs,
            isPlaybackSourceCurrent, readFrame, getVideoDriftState, onPlayingChange]);

        return renderVideoBackground({
            react, brightness, blurAmount, coverMode, videoScale, fallbackBackground, fallbackSolidColor, fallbackGradientStyle,
            albumArtUrl, previousFallbackUrl, isPlayerReady, isPlaying, videoRef, containerRef, useHelper, showStats, stats,
        });
    };

    return {
        VideoBackground,
    };
}
