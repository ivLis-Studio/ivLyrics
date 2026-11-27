import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { mapVideoTimeWithSkipSegments as mapSelectorVideoTime, getVideoSkipSegmentAtTime as getSelectorVideoSkipSegment } from "./communityVideoTimeline.mjs";
import { readFirstLyricTime as readSelectorFirstLyricTime } from "./videoSyncRuntimeState.mjs";
import { getPlaybackPositionService } from "../../core/playbackPositionService.mjs";
import { readVideoTrackPlayback } from "./videoBackgroundPlayback.mjs";
import { getLyricsStartTimeSeconds, resolveVideoSyncState } from "./videoBackgroundTiming.mjs";
import { VIDEO_SYNC_SEEK_THRESHOLD_SECONDS } from "./videoDriftCorrection.mjs";
import { watchYouTubeIframeApi } from "./youTubeIframeApi.mjs";

const EMPTY_SKIP_SEGMENTS = Object.freeze([]);

export function startPreviewHelperVideoDownload({
  videoId, videoHelper, toast, translate, onReady, onUnavailable, onError,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout,
}) {
  let active = true;
  let abortDownload;
  let showingProgress = false;
  const startedAt = now();
  const showProgress = (key, percent, values) => {
    showingProgress = true;
    toast.progress(translate(key, values), percent);
  };
  const preparing = schedule(() => {
    if (active) showProgress("videoBackground.preparing", 0);
  }, 1500);
  const finish = () => {
    if (!active) return false;
    active = false;
    cancel(preparing);
    if (showingProgress) toast.dismissProgress();
    return true;
  };
  const fail = (message) => {
    if (!finish()) return;
    onError?.(message);
    toast.error(translate("videoBackground.helperError"));
  };

  async function request() {
    try {
      const available = await videoHelper?.isHelperAvailable();
      if (!active) return;
      if (!available) {
        finish();
        onUnavailable?.();
        toast.error(translate("videoBackground.helperNotConnected"));
        return;
      }

      abortDownload = videoHelper.requestVideo(videoId, {
        onProgress(progress) {
          if (!active) return;
          cancel(preparing);
          if (progress.status === "downloading") {
            const percent = Math.round(progress.percent || 0);
            showProgress("videoBackground.downloading", percent, { percent });
          } else if (progress.status === "checking") {
            showProgress("videoBackground.checking", 0);
          }
        },
        onComplete(url) {
          if (!finish()) return;
          onReady(url);
          if (now() - startedAt > 1500) toast.success(translate("videoBackground.downloadComplete"));
        },
        onError: fail,
      });
    } catch (error) {
      fail(error);
    }
  }

  void request();
  return () => {
    if (finish()) abortDownload?.();
  };
}

export function createCommunityVideoPreviews({
  host: window, document = window.document ?? globalThis.document, react, config: CONFIG,
  i18n: I18n, spicetify: Spicetify, toast: Toast, videoHelper: VideoHelperService,
}) {
  function createYouTubePreview(api, container, { idPrefix, videoId, height, autoplay, start, events }) {
    const playerId = `${idPrefix}-${videoId}-${Date.now()}`;
    const playerDiv = document.createElement("div");
    playerDiv.id = playerId;
    container.innerHTML = "";
    container.appendChild(playerDiv);

    return new api.Player(playerId, {
      videoId,
      width: "100%",
      height,
      playerVars: {
        autoplay,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        // Spotify is playing the song; a preview is only a picture.
        mute: 1,
        playsinline: 1,
        ...(start === undefined ? {} : { start }),
        origin: window.location.origin,
      },
      events,
    });
  }

  function destroyYouTubePreview(playerRef) {
    if (!playerRef.current) return;
    try {
      playerRef.current.destroy();
    } catch {}
    playerRef.current = null;
  }

  function usePreviewMedia(videoId, logTag) {
    const { useEffect, useLayoutEffect, useMemo, useState } = react;
    const [useHelper, setUseHelper] = useState(() => [true, "true"].includes(CONFIG?.visual?.["video-helper-enabled"]));
    const source = useMemo(() => ({ videoId, useHelper }), [videoId, useHelper]);
    const [download, setDownload] = useState(null);

    useEffect(() => {
      const handleHelperChange = (event) => setUseHelper(event.detail?.enabled === true);
      window.addEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
      return () => window.removeEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
    }, []);

    useLayoutEffect(() => {
      if (!useHelper || !videoId) return;
      return startPreviewHelperVideoDownload({
        videoId, videoHelper: VideoHelperService, toast: Toast,
        translate: (...args) => I18n.t(...args), onReady: url => setDownload({ source, url }),
        onUnavailable: logTag ? () => console.warn(`[${logTag}] Helper not available`) : undefined,
        onError: logTag ? error => console.error(`[${logTag}] Helper error:`, error) : undefined,
      });
    }, [source, logTag]);

    return { useHelper, source, helperVideoUrl: download?.source === source ? download.url : null };
  }

  const SyncedVideoPreview = ({ trackUri, videoId, startTime, skipSegments = EMPTY_SKIP_SEGMENTS, isAutoGenerated = false }) => {
    const { useState, useEffect, useRef } = react;
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const videoRef = useRef(null); // HTML5 video for helper mode
    const { useHelper, source, helperVideoUrl } = usePreviewMedia(videoId, "SyncedVideoPreview");
    const [readySource, setReadySource] = useState(null);
    const [failedSource, setFailedSource] = useState(null);
    const isReady = readySource === source;
    const setIsReady = () => setReadySource(source);

    const player = Spicetify.Player;
    const videoInfo = { captionStartTime: startTime, skipSegments, isAutoGenerated };
    const readPreviewFrame = () => {
      const snapshot = getPlaybackPositionService(window)?.getPlayerPlaybackSnapshot?.();
      const playback = readVideoTrackPlayback(player, trackUri, snapshot);
      if (!playback) return null;
      const { targetVideoTime, shouldHoldAtStart } = resolveVideoSyncState({
        spotifyTime: playback.position / 1000,
        lyricsStartTime: getLyricsStartTimeSeconds(readSelectorFirstLyricTime(window, trackUri)),
        videoInfo,
        mapVideoTime: mapSelectorVideoTime,
      });
      return { time: targetVideoTime, playing: playback.isPlaying && !shouldHoldAtStart };
    };

    const watchSync = (sync) => {
      let active = true;
      const tick = () => { if (active) sync(); };
      const seek = () => { if (active) sync(true); };
      const interval = setInterval(tick, 500);
      player.addEventListener("onplaypause", tick);
      player.addEventListener("songchange", tick);
      player.addEventListener("onseek", seek);
      return () => {
        active = false;
        clearInterval(interval);
        player.removeEventListener("onplaypause", tick);
        player.removeEventListener("songchange", tick);
        player.removeEventListener("onseek", seek);
      };
    };

    // 헬퍼 모드: video 요소 설정
    useEffect(() => {
      if (!useHelper || !helperVideoUrl || !videoRef.current) return;

      const video = videoRef.current;
      video.src = helperVideoUrl;
      video.muted = true;

      const handleCanPlay = () => {
        const frame = readPreviewFrame();
        if (frame && video.duration > 0) video.currentTime = Math.min(frame.time, video.duration);
        setIsReady();
        if (frame?.playing) video.play().catch(() => {});
      };

      video.addEventListener('canplay', handleCanPlay, { once: true });
      video.load();

      return () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
    }, [useHelper, helperVideoUrl, trackUri, startTime, skipSegments, isAutoGenerated]);

    // 헬퍼 모드: 동기화
    useEffect(() => {
      if (!useHelper || !videoRef.current || !isReady) return;

      const video = videoRef.current;

      const syncToSpotify = (forceSeek = false) => {
        const frame = readPreviewFrame();
        if (frame && (forceSeek || Math.abs(video.currentTime - frame.time) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS)) {
          video.currentTime = Math.min(frame.time, video.duration || Infinity);
        }
        if (frame?.playing) {
          if (video.paused) video.play().catch(() => {});
        } else if (!video.paused) video.pause();
      };

      syncToSpotify();
      return watchSync(syncToSpotify);
    }, [useHelper, isReady, trackUri, startTime, skipSegments, isAutoGenerated]);

    // 일반 모드: YouTube IFrame
    useEffect(() => {
      if (useHelper) return;
      if (!videoId || !containerRef.current) return;

      let isMounted = true;
      let initialSyncTimer = null;
      setFailedSource(null);
      const handlePlayerError = (error) => {
        if (!isMounted) return;
        setFailedSource(source);
        console.error("[SyncedVideoPreview] Player error:", error);
      };

      let lastSeekAt = -Infinity;
      let hasSynced = false;
      const syncToSpotify = (forceSeek = false) => {
        const preview = playerRef.current;
        if (!isMounted || typeof preview?.seekTo !== "function" || typeof preview?.getPlayerState !== "function") return;
        try {
          const frame = readPreviewFrame();
          const state = preview.getPlayerState();
          const playingOrBuffering = state === 1 || state === 3;
          if (!frame) {
            hasSynced = false;
            if (playingOrBuffering) preview.pauseVideo();
            return;
          }
          const time = preview.getCurrentTime?.();
          const now = Date.now();
          const needsCorrection = state !== 3 && Number.isFinite(time)
            && Math.abs(time - frame.time) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS
            && now - lastSeekAt >= 1500;
          if (forceSeek || !hasSynced || needsCorrection) {
            // Seeking can emit PLAYING or CUED before the iframe reports its
            // new time. Give it time to settle before correcting drift again.
            lastSeekAt = now;
            hasSynced = true;
            preview.seekTo(frame.time, true);
          }
          if (frame.playing) {
            if (!playingOrBuffering) preview.playVideo();
          } else if (playingOrBuffering) preview.pauseVideo();
        } catch (error) {
          console.error("[SyncedVideoPreview] Sync error:", error);
        }
      };

      // YouTube IFrame API 로드 확인
      const initPlayer = (api) => {
        if (!isMounted || !containerRef.current) return;

        playerRef.current = createYouTubePreview(api, containerRef.current, {
          idPrefix: "preview-player", videoId, height: 200, autoplay: 0,
          events: {
            onReady: () => {
              if (!isMounted) return;
              writeRuntimeDebug(window, "[SyncedVideoPreview] Player ready");
              setFailedSource(null);
              setIsReady();

              // 초기 동기화
              clearTimeout(initialSyncTimer);
              initialSyncTimer = setTimeout(() => {
                if (isMounted) syncToSpotify();
              }, 500);
            },
            onStateChange: (event) => {
              if (!isMounted) return;
              // 버퍼링이 끝나고 재생 준비되면 동기화
              if (
                event.data === api.PlayerState?.PLAYING ||
                event.data === api.PlayerState?.CUED
              ) {
                syncToSpotify();
              }
            },
            onError: (event) => handlePlayerError(event.data),
          },
        });
      };

      const stopWaitingForApi = watchYouTubeIframeApi({
        host: window, document, onReady: initPlayer, onError: handlePlayerError,
      });

      const stopSync = watchSync(syncToSpotify);
      return () => {
        isMounted = false;
        stopWaitingForApi();
        clearTimeout(initialSyncTimer);
        stopSync();
        destroyYouTubePreview(playerRef);
      };
    }, [useHelper, videoId, trackUri, startTime, skipSegments, isAutoGenerated]);

    return react.createElement(
      "div",
      {
        className: "community-video-embed synced-preview",
      },
      // 헬퍼 모드: video 태그
      useHelper && react.createElement("video", {
        ref: videoRef,
        style: { width: "100%", height: "200px", background: "#000", objectFit: "contain" },
        muted: true,
        playsInline: true,
      }),
      // 일반 모드: YouTube 컨테이너
      !useHelper && react.createElement("div", {
        ref: containerRef,
        style: { width: "100%", height: "200px", background: "#000" },
      }),
      (failedSource === source || !isReady) &&
      react.createElement(
        "div",
        {
          className: "preview-loading",
        },
        I18n.t(failedSource === source ? "videoBackground.error" : "communityVideo.loading")
      )
    );
  };

  // 시간 입력 시 iframe 리로드 방지를 위한 단순 미리보기 컴포넌트
  // 헬퍼 모드 지원
  const SimpleVideoPreview = ({ videoId, startTime, skipSegments = EMPTY_SKIP_SEGMENTS }) => {
    const { useEffect, useLayoutEffect, useRef } = react;
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const videoRef = useRef(null);
    const { useHelper, helperVideoUrl } = usePreviewMedia(videoId);
    const startTimeRef = useRef(startTime);
    useLayoutEffect(() => { startTimeRef.current = startTime; }, [startTime]);

    // 헬퍼 모드: video 시간 설정
    useEffect(() => {
      if (!useHelper || !videoRef.current || !helperVideoUrl) return;
      const video = videoRef.current;
      video.muted = true;
      video.currentTime = startTime;
      video.play().catch(() => { });
    }, [useHelper, helperVideoUrl, startTime]);

    // 헬퍼 미리보기에서 등록한 비음악 구간을 즉시 건너뜁니다.
    useEffect(() => {
      if (!useHelper || !videoRef.current || !helperVideoUrl || !skipSegments?.length) return;
      const video = videoRef.current;
      const handleTimeUpdate = () => {
        const segment = getSelectorVideoSkipSegment(video.currentTime, skipSegments, startTime);
        if (segment) video.currentTime = segment.end;
      };
      video.addEventListener("timeupdate", handleTimeUpdate);
      return () => video.removeEventListener("timeupdate", handleTimeUpdate);
    }, [useHelper, helperVideoUrl, startTime, skipSegments]);

    // 일반 모드: YouTube
    useEffect(() => {
      if (useHelper) return;
      if (!videoId || !containerRef.current) return;

      let isMounted = true;
      const initPlayer = (api) => {
        if (!isMounted || !containerRef.current) return;

        playerRef.current = createYouTubePreview(api, containerRef.current, {
          idPrefix: "simple-preview", videoId, height: "180", autoplay: 1,
          start: Math.floor(startTime),
          events: {
            onReady: () => {
              if (isMounted && playerRef.current) {
                playerRef.current.seekTo(startTimeRef.current, true);
                playerRef.current.playVideo();
              }
            },
          },
        });
      };

      const stopWaitingForApi = watchYouTubeIframeApi({
        host: window, document, onReady: initPlayer,
        onError: (error) => console.warn("[SimpleVideoPreview] Could not initialize YouTube:", error),
      });

      return () => {
        isMounted = false;
        stopWaitingForApi();
        destroyYouTubePreview(playerRef);
      };
    }, [useHelper, videoId]);

    useEffect(() => {
      if (useHelper) return;
      if (playerRef.current && typeof playerRef.current.seekTo === "function") {
        playerRef.current.seekTo(startTime, true);
        playerRef.current.playVideo();
      }
    }, [useHelper, startTime]);

    // YouTube 미리보기에서도 여러 비음악 구간을 순서대로 건너뜁니다.
    useEffect(() => {
      if (useHelper || !skipSegments?.length) return;
      const intervalId = setInterval(() => {
        if (
          !playerRef.current ||
          typeof playerRef.current.getCurrentTime !== "function" ||
          typeof playerRef.current.seekTo !== "function"
        ) return;
        const segment = getSelectorVideoSkipSegment(
          playerRef.current.getCurrentTime(),
          skipSegments,
          startTime
        );
        if (segment) playerRef.current.seekTo(segment.end, true);
      }, 250);
      return () => clearInterval(intervalId);
    }, [useHelper, startTime, skipSegments]);

    return react.createElement(
      "div",
      {
        className: "community-video-embed submit-preview",
        style: { position: "relative" },
      },
      // 헬퍼 모드: video 태그
      useHelper && react.createElement("video", {
        ref: videoRef,
        src: helperVideoUrl,
        style: { width: "100%", height: "180px", background: "#000", objectFit: "contain" },
        muted: true,
        playsInline: true,
        autoPlay: true,
      }),
      // 일반 모드: YouTube 컨테이너
      !useHelper && react.createElement("div", {
        ref: containerRef,
        style: { width: "100%", height: "180px", background: "#000" },
      }),
      react.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: "default",
        },
      })
    );
  };

  return {
    SyncedVideoPreview, SimpleVideoPreview,
  };
}
