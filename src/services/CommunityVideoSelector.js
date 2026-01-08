/**
 * 커뮤니티 영상 선택기 컴포넌트
 * 사용자들이 추천한 YouTube 영상 목록을 보여주고 투표할 수 있게 합니다.
 */

// 커스텀 확인 다이얼로그 컴포넌트
const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return react.createElement(
    "div",
    {
      className: "confirm-dialog-overlay",
      onClick: onCancel,
    },
    react.createElement(
      "div",
      {
        className: "confirm-dialog",
        onClick: (e) => e.stopPropagation(),
      },
      react.createElement(
        "div",
        {
          className: "confirm-dialog-title",
        },
        title || I18n.t("communityVideo.delete")
      ),
      react.createElement(
        "div",
        {
          className: "confirm-dialog-message",
        },
        message
      ),
      react.createElement(
        "div",
        {
          className: "confirm-dialog-buttons",
        },
        react.createElement(
          "button",
          {
            className: "confirm-dialog-btn cancel",
            onClick: onCancel,
          },
          I18n.t("cancel")
        ),
        react.createElement(
          "button",
          {
            className: "confirm-dialog-btn confirm",
            onClick: onConfirm,
          },
          I18n.t("communityVideo.delete")
        )
      )
    )
  );
};

// 현재 음악 재생 시간에 맞춰 동기화된 YouTube 미리보기 컴포넌트
// startTime: 영상에서 첫 가사가 시작되는 시간 (초)
// VideoBackground와 동일한 로직: offset = captionStartTime - lyricsStartTime
// 헬퍼 모드 지원: CONFIG.visual["video-helper-enabled"]가 true면 로컬 비디오 사용
const SyncedVideoPreview = ({ videoId, startTime }) => {
  const { useState, useEffect, useRef } = react;
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const videoRef = useRef(null); // HTML5 video for helper mode
  const syncIntervalRef = useRef(null);
  const abortRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [useHelper, setUseHelper] = useState(false);
  const [helperVideoUrl, setHelperVideoUrl] = useState(null);

  // 헬퍼 모드 확인
  useEffect(() => {
    const helperEnabled = CONFIG?.visual?.["video-helper-enabled"] === true || CONFIG?.visual?.["video-helper-enabled"] === "true";
    setUseHelper(helperEnabled);
    
    const handleHelperChange = (e) => {
      setUseHelper(e.detail?.enabled === true);
      setHelperVideoUrl(null);
      setIsReady(false);
    };
    window.addEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
    return () => window.removeEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
  }, []);

  // 헬퍼 모드: 비디오 다운로드
  useEffect(() => {
    if (!useHelper || !videoId) return;

    setIsReady(false);
    setHelperVideoUrl(null);

    // 1.5초 이내 응답 시 toast 숨기기 위한 변수
    const requestStartTime = Date.now();
    let preparingToastTimeout = setTimeout(() => {
      Toast.progress(I18n.t("videoBackground.preparing"), 0);
    }, 1500);

    const requestVideo = async () => {
      if (typeof VideoHelperService === "undefined") return;

      const isAvailable = await VideoHelperService.isHelperAvailable();
      if (!isAvailable) {
        clearTimeout(preparingToastTimeout);
        console.warn("[SyncedVideoPreview] Helper not available");
        Toast.error(I18n.t("videoBackground.helperNotConnected"));
        return;
      }

      abortRef.current = VideoHelperService.requestVideo(videoId, {
        onProgress: (progress) => {
          clearTimeout(preparingToastTimeout);
          const percent = Math.round(progress.percent || 0);
          if (progress.status === "downloading") {
            Toast.progress(I18n.t("videoBackground.downloading", { percent }), percent);
          } else if (progress.status === "checking") {
            Toast.progress(I18n.t("videoBackground.checking"), 0);
          }
        },
        onComplete: (url) => {
          clearTimeout(preparingToastTimeout);
          Toast.dismissProgress();
          setHelperVideoUrl(url);
          // 1.5초 이내로 완료되면 완료 toast도 숨김
          const elapsed = Date.now() - requestStartTime;
          if (elapsed > 1500) {
            Toast.success(I18n.t("videoBackground.downloadComplete"));
          }
        },
        onError: (message) => {
          clearTimeout(preparingToastTimeout);
          Toast.dismissProgress();
          console.error("[SyncedVideoPreview] Helper error:", message);
          Toast.error(I18n.t("videoBackground.helperError"));
        },
      });
    };

    requestVideo();

    return () => {
      clearTimeout(preparingToastTimeout);
      Toast.dismissProgress(); // 컴포넌트 언마운트 시 progress toast 닫기
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }
    };
  }, [useHelper, videoId]);

  // 헬퍼 모드: video 요소 설정
  useEffect(() => {
    if (!useHelper || !helperVideoUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.src = helperVideoUrl;
    video.muted = true;

    const handleCanPlay = () => {
      // 영상이 준비되면 즉시 현재 Spotify 위치로 동기화
      const spotifyPositionSec = Spicetify.Player.getProgress() / 1000;
      const lyricsStartTimeSec = (window.ivLyrics_firstLyricTime || 0) / 1000;
      const captionStartTime = startTime || 0;
      const offset = captionStartTime - lyricsStartTimeSec;
      const videoTime = Math.max(0, spotifyPositionSec + offset);
      
      if (videoTime >= 0 && video.duration > 0) {
        video.currentTime = Math.min(videoTime, video.duration);
      }
      
      setIsReady(true);
      if (Spicetify.Player.isPlaying()) {
        video.play().catch(() => { });
      }
    };

    video.addEventListener('canplay', handleCanPlay);
    video.load();

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [useHelper, helperVideoUrl, startTime]);

  // 헬퍼 모드: 동기화
  useEffect(() => {
    if (!useHelper || !videoRef.current || !isReady) return;

    const video = videoRef.current;

    const syncToSpotify = () => {
      const spotifyPositionSec = Spicetify.Player.getProgress() / 1000;
      const lyricsStartTimeSec = (window.ivLyrics_firstLyricTime || 0) / 1000;
      const captionStartTime = startTime || 0;
      const offset = captionStartTime - lyricsStartTimeSec;
      const videoTime = Math.max(0, spotifyPositionSec + offset);

      if (Math.abs(video.currentTime - videoTime) > 0.5) {
        video.currentTime = videoTime;
      }

      if (Spicetify.Player.isPlaying()) {
        if (video.paused) video.play().catch(() => { });
      } else {
        if (!video.paused) video.pause();
      }
    };

    syncIntervalRef.current = setInterval(syncToSpotify, 2000);
    syncToSpotify();

    const handlePlayPause = () => syncToSpotify();
    Spicetify.Player.addEventListener("onplaypause", handlePlayPause);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      Spicetify.Player.removeEventListener("onplaypause", handlePlayPause);
    };
  }, [useHelper, isReady, startTime]);

  // 일반 모드: YouTube IFrame
  useEffect(() => {
    if (useHelper) return;
    if (!videoId || !containerRef.current) return;

    let isMounted = true;

    // Spotify 재생 위치에 맞춰 동기화
    // VideoBackground와 동일한 로직 사용:
    // offset = captionStartTime - lyricsStartTime
    // targetVideoTime = spotifyTime + offset
    const syncToSpotify = () => {
      if (!playerRef.current) return;

      try {
        // player가 준비되었는지 확인
        if (typeof playerRef.current.seekTo !== "function") return;
        if (typeof playerRef.current.getPlayerState !== "function") return;

        const spotifyPositionSec = Spicetify.Player.getProgress() / 1000; // ms -> 초

        // 첫 가사 시작 시간 가져오기 (index.js에서 전역으로 노출됨)
        const lyricsStartTimeSec =
          (window.ivLyrics_firstLyricTime || 0) / 1000; // ms -> 초

        // offset 계산: 영상의 첫 가사 시간 - Spotify의 첫 가사 시간
        const captionStartTime = startTime || 0;
        const offset = captionStartTime - lyricsStartTimeSec;

        // 최종 영상 시간 계산
        const videoTime = Math.max(0, spotifyPositionSec + offset);

        playerRef.current.seekTo(videoTime, true);

        // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
        const playerState = playerRef.current.getPlayerState();

        if (Spicetify.Player.isPlaying()) {
          if (playerState !== 1 && playerState !== 3) {
            // not playing and not buffering
            playerRef.current.playVideo();
          }
        } else {
          if (playerState === 1) {
            // playing
            playerRef.current.pauseVideo();
          }
        }
      } catch (e) {
        console.error("[SyncedVideoPreview] Sync error:", e);
      }
    };

    // YouTube IFrame API 로드 확인
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      if (!isMounted || !containerRef.current) return;

      // 고유 ID 생성
      const playerId = `preview-player-${videoId}-${Date.now()}`;
      const playerDiv = document.createElement("div");
      playerDiv.id = playerId;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(playerDiv);

      playerRef.current = new window.YT.Player(playerId, {
        videoId: videoId,
        width: "100%",
        height: 200,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          mute: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            console.log("[SyncedVideoPreview] Player ready");
            setIsReady(true);

            // 초기 동기화
            setTimeout(() => {
              if (isMounted) syncToSpotify();
            }, 500);
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            // 버퍼링이 끝나고 재생 준비되면 동기화
            if (
              event.data === window.YT.PlayerState.PLAYING ||
              event.data === window.YT.PlayerState.CUED
            ) {
              syncToSpotify();
            }
          },
          onError: (event) => {
            console.error("[SyncedVideoPreview] Player error:", event.data);
          },
        },
      });
    };

    initPlayer();

    // 주기적 동기화 (2초마다)
    syncIntervalRef.current = setInterval(() => {
      if (isMounted) syncToSpotify();
    }, 2000);

    // Spotify 재생/일시정지 이벤트 리스너
    const handlePlayPause = () => {
      if (!isMounted) return;
      syncToSpotify();
    };

    Spicetify.Player.addEventListener("onplaypause", handlePlayPause);

    return () => {
      isMounted = false;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      Spicetify.Player.removeEventListener("onplaypause", handlePlayPause);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) { }
        playerRef.current = null;
      }
    };
  }, [useHelper, videoId, startTime]);

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
    !isReady &&
    react.createElement(
      "div",
      {
        className: "preview-loading",
      },
      I18n.t("communityVideo.loading")
    )
  );
};

// 시간 입력 시 iframe 리로드 방지를 위한 단순 미리보기 컴포넌트
// 헬퍼 모드 지원
const SimpleVideoPreview = ({ videoId, startTime }) => {
  const { useState, useEffect, useRef } = react;
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const abortRef = useRef(null);
  const [useHelper, setUseHelper] = useState(false);
  const [helperVideoUrl, setHelperVideoUrl] = useState(null);

  // 헬퍼 모드 확인
  useEffect(() => {
    const helperEnabled = CONFIG?.visual?.["video-helper-enabled"] === true || CONFIG?.visual?.["video-helper-enabled"] === "true";
    setUseHelper(helperEnabled);
    
    const handleHelperChange = (e) => {
      setUseHelper(e.detail?.enabled === true);
      setHelperVideoUrl(null);
    };
    window.addEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
    return () => window.removeEventListener("ivLyrics:videoHelperChanged", handleHelperChange);
  }, []);

  // 헬퍼 모드: 비디오 다운로드
  useEffect(() => {
    if (!useHelper || !videoId) return;

    setHelperVideoUrl(null);

    // 1.5초 이내 응답 시 toast 숨기기 위한 변수
    const requestStartTime = Date.now();
    let preparingToastTimeout = setTimeout(() => {
      Toast.progress(I18n.t("videoBackground.preparing"), 0);
    }, 1500);

    const requestVideo = async () => {
      if (typeof VideoHelperService === "undefined") return;

      const isAvailable = await VideoHelperService.isHelperAvailable();
      if (!isAvailable) {
        clearTimeout(preparingToastTimeout);
        Toast.error(I18n.t("videoBackground.helperNotConnected"));
        return;
      }

      abortRef.current = VideoHelperService.requestVideo(videoId, {
        onProgress: (progress) => {
          clearTimeout(preparingToastTimeout);
          const percent = Math.round(progress.percent || 0);
          if (progress.status === "downloading") {
            Toast.progress(I18n.t("videoBackground.downloading", { percent }), percent);
          } else if (progress.status === "checking") {
            Toast.progress(I18n.t("videoBackground.checking"), 0);
          }
        },
        onComplete: (url) => {
          clearTimeout(preparingToastTimeout);
          Toast.dismissProgress();
          setHelperVideoUrl(url);
          // 1.5초 이내로 완료되면 완료 toast도 숨김
          const elapsed = Date.now() - requestStartTime;
          if (elapsed > 1500) {
            Toast.success(I18n.t("videoBackground.downloadComplete"));
          }
        },
        onError: () => {
          clearTimeout(preparingToastTimeout);
          Toast.dismissProgress();
          Toast.error(I18n.t("videoBackground.helperError"));
        },
      });
    };

    requestVideo();

    return () => {
      clearTimeout(preparingToastTimeout);
      Toast.dismissProgress(); // 컴포넌트 언마운트 시 progress toast 닫기
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }
    };
  }, [useHelper, videoId]);

  // 헬퍼 모드: video 시간 설정
  useEffect(() => {
    if (!useHelper || !videoRef.current || !helperVideoUrl) return;
    const video = videoRef.current;
    video.currentTime = startTime;
    video.play().catch(() => { });
  }, [useHelper, helperVideoUrl, startTime]);

  // 일반 모드: YouTube
  useEffect(() => {
    if (useHelper) return;
    if (!videoId || !containerRef.current) return;

    let isMounted = true;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      if (!isMounted) return;

      // 고유 ID 생성
      const playerId = `simple-preview-${videoId}-${Date.now()}`;
      const playerDiv = document.createElement("div");
      playerDiv.id = playerId;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(playerDiv);

      playerRef.current = new window.YT.Player(playerId, {
        videoId: videoId,
        width: "100%",
        height: "180",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          mute: 0,
          playsinline: 1,
          start: Math.floor(startTime),
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (isMounted && playerRef.current) {
              playerRef.current.seekTo(startTime, true);
              playerRef.current.playVideo();
            }
          },
        },
      });
    };

    initPlayer();

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) { }
        playerRef.current = null;
      }
    };
  }, [useHelper, videoId]);

  useEffect(() => {
    if (useHelper) return;
    if (playerRef.current && typeof playerRef.current.seekTo === "function") {
      playerRef.current.seekTo(startTime, true);
      playerRef.current.playVideo();
    }
  }, [useHelper, startTime]);

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
      muted: false,
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

const CommunityVideoSelector = ({
  trackUri,
  currentVideoId,
  onVideoSelect,
  onClose,
}) => {
  const { useState, useEffect, useCallback, useRef } = react;

  const [videos, setVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitStartTime, setSubmitStartTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [votingId, setVotingId] = useState(null);
  const [previewVideoId, setPreviewVideoId] = useState(null); // 목록에서 미리보기 중인 영상
  const [previewStartTime, setPreviewStartTime] = useState(0);
  const [submitVideoTitle, setSubmitVideoTitle] = useState("");
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const [formPreviewVideoId, setFormPreviewVideoId] = useState(null); // 폼에서 미리보기 중인 영상
  const [deletingId, setDeletingId] = useState(null); // 삭제 중인 영상 ID
  const [deleteConfirmId, setDeleteConfirmId] = useState(null); // 삭제 확인 다이얼로그용
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState(""); // 삭제할 영상 제목
  const titleFetchTimeout = useRef(null);

  // 현재 사용자 해시 ID
  const currentUserHash = Utils.getCurrentUserHash();

  // 영상 목록 로드 (skipCache: 등록/삭제 후 캐시 우회)
  const loadVideos = useCallback(
    async (skipCache = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await Utils.getCommunityVideos(trackUri, skipCache);
        if (data && data.videos) {
          setVideos(data.videos);
        } else {
          setVideos([]);
        }
      } catch (e) {
        setError(I18n.t("communityVideo.loadError"));
      }

      setIsLoading(false);
    },
    [trackUri]
  );

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // URL 변경 시 YouTube 제목 자동 가져오기
  useEffect(() => {
    if (titleFetchTimeout.current) {
      clearTimeout(titleFetchTimeout.current);
    }

    const videoId = Utils.extractYouTubeVideoId(submitUrl);
    if (!videoId) {
      setSubmitVideoTitle("");
      setFormPreviewVideoId(null);
      return;
    }

    // 디바운스: 500ms 후에 제목 가져오기
    titleFetchTimeout.current = setTimeout(async () => {
      setIsLoadingTitle(true);
      try {
        const title = await Utils.getYouTubeVideoTitle(videoId);
        setSubmitVideoTitle(title || "");
        setFormPreviewVideoId(videoId); // 폼 미리보기용 상태 사용
      } catch (e) {
        console.error("Failed to fetch YouTube title:", e);
        setSubmitVideoTitle("");
      }
      setIsLoadingTitle(false);
    }, 500);

    return () => {
      if (titleFetchTimeout.current) {
        clearTimeout(titleFetchTimeout.current);
      }
    };
  }, [submitUrl]);

  // 투표 처리
  const handleVote = async (videoEntryId, currentVote, newVote) => {
    setVotingId(videoEntryId);

    // 같은 버튼을 다시 누르면 투표 취소
    const voteType = currentVote === newVote ? 0 : newVote;

    try {
      const result = await Utils.voteCommunityVideo(videoEntryId, voteType);
      if (result) {
        // 투표 결과로 목록 업데이트
        setVideos((prev) =>
          prev
            .map((v) => {
              if (v.id === videoEntryId) {
                return {
                  ...v,
                  likes: result.data.likes,
                  dislikes: result.data.dislikes,
                  score: result.data.score,
                  userVote: voteType === 0 ? null : voteType,
                };
              }
              return v;
            })
            .sort((a, b) => b.score - a.score)
        );
      }
    } catch (e) {
      console.error("Vote failed:", e);
    }

    setVotingId(null);
  };

  // 영상 등록 처리
  const handleSubmit = async () => {
    const videoId = Utils.extractYouTubeVideoId(submitUrl);
    if (!videoId) {
      Toast.error(I18n.t("communityVideo.invalidUrl"));
      return;
    }

    setIsSubmitting(true);

    try {
      // YouTube 영상 유효성 검사 (실제로 존재하고 재생 가능한지 확인)
      const validation = await Utils.validateYouTubeVideo(videoId);

      if (!validation.valid) {
        // 에러 유형에 따른 메시지
        let errorMsg;
        switch (validation.error) {
          case "notFound":
            errorMsg = I18n.t("communityVideo.videoNotFound");
            break;
          case "private":
            errorMsg = I18n.t("communityVideo.videoPrivate");
            break;
          case "invalidFormat":
            errorMsg = I18n.t("communityVideo.invalidUrl");
            break;
          default:
            errorMsg = I18n.t("communityVideo.validationError");
        }
        Toast.error(errorMsg);
        setIsSubmitting(false);
        return;
      }

      // 유효성 검사에서 가져온 제목 사용
      const videoTitle = validation.title || submitVideoTitle || videoId;

      const result = await Utils.submitCommunityVideo(
        trackUri,
        videoId,
        videoTitle,
        parseFloat(submitStartTime) || 0
      );

      if (result) {
        Toast.success(
          result.data.action === "updated"
            ? I18n.t("communityVideo.updated")
            : I18n.t("communityVideo.submitted")
        );
        setShowSubmitForm(false);
        setSubmitUrl("");
        setSubmitStartTime(0);
        setSubmitVideoTitle("");
        setFormPreviewVideoId(null);
        // 캐시를 우회하여 새 데이터 가져오기
        loadVideos(true);
      }
    } catch (e) {
      Toast.error(I18n.t("communityVideo.submitError"));
    }

    setIsSubmitting(false);
  };

  // 영상 적용 처리 (모달 닫지 않음)
  const handleApply = (video) => {
    if (onVideoSelect) {
      onVideoSelect({
        youtubeVideoId: video.youtubeVideoId,
        youtubeTitle: video.youtubeTitle,
        captionStartTime: video.startTime,
        communityEntryId: video.id,
        isAutoGenerated: video.submitterId === "system",
      });
    }
    Toast.success(I18n.t("communityVideo.applied"));
  };

  // 삭제 확인 다이얼로그 열기
  const showDeleteConfirm = (video, e) => {
    e.stopPropagation();
    setDeleteConfirmId(video.id);
    setDeleteConfirmTitle(video.youtubeTitle || video.youtubeVideoId);
  };

  // 삭제 확인 다이얼로그 닫기
  const closeDeleteConfirm = () => {
    setDeleteConfirmId(null);
    setDeleteConfirmTitle("");
  };

  // 영상 삭제 실행 (본인만 가능)
  const executeDelete = async () => {
    const videoEntryId = deleteConfirmId;
    if (!videoEntryId) return;

    closeDeleteConfirm();
    setDeletingId(videoEntryId);

    try {
      const result = await Utils.deleteCommunityVideo(videoEntryId);
      if (result) {
        Toast.success(I18n.t("communityVideo.deleted"));
        // 목록에서 제거
        setVideos((prev) => prev.filter((v) => v.id !== videoEntryId));
        // 미리보기 중이던 영상이면 미리보기 닫기
        if (previewVideoId) {
          const deletedVideo = videos.find((v) => v.id === videoEntryId);
          if (deletedVideo && deletedVideo.youtubeVideoId === previewVideoId) {
            setPreviewVideoId(null);
          }
        }
      } else {
        Toast.error(I18n.t("communityVideo.deleteError"));
      }
    } catch (e) {
      console.error("Delete failed:", e);
      Toast.error(I18n.t("communityVideo.deleteError"));
    }

    setDeletingId(null);
  };

  // 영상 미리보기 토글
  const togglePreview = (video, e) => {
    e.stopPropagation();
    if (previewVideoId === video.youtubeVideoId) {
      setPreviewVideoId(null);
    } else {
      setPreviewVideoId(video.youtubeVideoId);
      setPreviewStartTime(video.startTime || 0);
    }
  };

  // 시간 포맷팅 (초 -> MM:SS.s)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    // 소수점 첫째 자리까지 표시
    const secsFormatted = secs.toFixed(1).padStart(4, "0");
    return `${mins}:${secsFormatted}`;
  };

  // YouTube Embed URL 생성
  const getEmbedUrl = (videoId, startTime = 0) => {
    const startSeconds = Math.floor(startTime);
    return `https://www.youtube.com/embed/${videoId}?start=${startSeconds}&autoplay=1`;
  };

  return react.createElement(
    "div",
    {
      className: "community-video-selector",
      onClick: (e) => e.stopPropagation(),
    },
    // Header
    react.createElement(
      "div",
      {
        className: "community-video-header",
      },
      react.createElement("h3", null, I18n.t("communityVideo.title")),
      react.createElement(
        "button",
        {
          className: "community-video-close",
          onClick: onClose,
          title: I18n.t("close"),
        },
        "✕"
      )
    ),

    // Content
    react.createElement(
      "div",
      {
        className: "community-video-content",
      },
      isLoading
        ? react.createElement(
          "div",
          {
            className: "community-video-loading",
          },
          react.createElement("div", { className: "spinner" }),
          I18n.t("communityVideo.loading")
        )
        : error
          ? react.createElement(
            "div",
            {
              className: "community-video-error",
            },
            error
          )
          : react.createElement(
            react.Fragment,
            null,
            // Video List
            videos.length > 0
              ? react.createElement(
                "div",
                {
                  className: "community-video-list",
                },
                videos.map((video, index) =>
                  react.createElement(
                    react.Fragment,
                    {
                      key: video.id,
                    },
                    react.createElement(
                      "div",
                      {
                        className: `community-video-item ${video.youtubeVideoId === currentVideoId
                            ? "active"
                            : ""
                          } ${index === 0 ? "best" : ""}`,
                      },
                      // Rank badge
                      react.createElement(
                        "div",
                        {
                          className: `community-video-rank ${index === 0
                              ? "gold"
                              : index === 1
                                ? "silver"
                                : index === 2
                                  ? "bronze"
                                  : ""
                            }`,
                        },
                        index + 1
                      ),

                      // Video info
                      react.createElement(
                        "div",
                        {
                          className: "community-video-info",
                        },
                        react.createElement(
                          "div",
                          {
                            className: "community-video-title",
                            title: video.youtubeTitle,
                          },
                          video.youtubeTitle || video.youtubeVideoId
                        ),
                        react.createElement(
                          "div",
                          {
                            className: "community-video-meta",
                          },
                          react.createElement(
                            "span",
                            null,
                            I18n.t("communityVideo.startTime") +
                            ": " +
                            formatTime(video.startTime)
                          ),
                          video.submitterId === "system" &&
                          react.createElement(
                            "span",
                            {
                              className: "auto-badge",
                            },
                            I18n.t("communityVideo.autoDetected")
                          )
                        )
                      ),

                      // Action buttons
                      react.createElement(
                        "div",
                        {
                          className: "community-video-actions",
                          onClick: (e) => e.stopPropagation(),
                        },
                        // Preview button
                        react.createElement(
                          "button",
                          {
                            className: `action-btn preview ${previewVideoId === video.youtubeVideoId
                                ? "active"
                                : ""
                              }`,
                            onClick: (e) => togglePreview(video, e),
                            title: I18n.t("communityVideo.preview"),
                          },
                          react.createElement(
                            "svg",
                            {
                              width: 14,
                              height: 14,
                              viewBox: "0 0 16 16",
                              fill: "currentColor",
                            },
                            react.createElement("path", {
                              d: "M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z",
                            }),
                            react.createElement("path", {
                              d: "M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z",
                            })
                          )
                        ),
                        // Apply button
                        react.createElement(
                          "button",
                          {
                            className: "action-btn apply",
                            onClick: (e) => {
                              e.stopPropagation();
                              handleApply(video);
                            },
                            title: I18n.t("communityVideo.apply"),
                          },
                          I18n.t("communityVideo.applyShort")
                        ),
                        // Vote buttons
                        react.createElement(
                          "button",
                          {
                            className: `vote-btn like ${video.userVote === 1 ? "active" : ""
                              }`,
                            onClick: () =>
                              handleVote(video.id, video.userVote, 1),
                            disabled: votingId === video.id,
                          },
                          react.createElement(
                            "svg",
                            {
                              width: 12,
                              height: 12,
                              viewBox: "0 0 16 16",
                              fill: "currentColor",
                            },
                            react.createElement("path", {
                              d: "M8.864.046C7.908-.193 7.02.53 6.956 1.466c-.072 1.051-.23 2.016-.428 2.59-.125.36-.479 1.013-1.04 1.639-.557.623-1.282 1.178-2.131 1.41C2.685 7.288 2 7.87 2 8.72v4.001c0 .845.682 1.464 1.448 1.545 1.07.114 1.564.415 2.068.723l.048.03c.272.165.578.348.97.484.397.136.861.217 1.466.217h3.5c.937 0 1.599-.477 1.934-1.064a1.86 1.86 0 0 0 .254-.912c0-.152-.023-.312-.077-.464.201-.263.38-.578.488-.901.11-.33.172-.762.004-1.149.069-.13.12-.269.159-.403.077-.27.113-.568.113-.857 0-.288-.036-.585-.113-.856a2.144 2.144 0 0 0-.138-.362 1.9 1.9 0 0 0 .234-1.734c-.206-.592-.682-1.1-1.2-1.272-.847-.282-1.803-.276-2.516-.211a9.84 9.84 0 0 0-.443.05 9.365 9.365 0 0 0-.062-4.509A1.38 1.38 0 0 0 9.125.111L8.864.046z",
                            })
                          ),
                          react.createElement("span", null, video.likes)
                        ),
                        react.createElement(
                          "button",
                          {
                            className: `vote-btn dislike ${video.userVote === -1 ? "active" : ""
                              }`,
                            onClick: () =>
                              handleVote(video.id, video.userVote, -1),
                            disabled: votingId === video.id,
                          },
                          react.createElement(
                            "svg",
                            {
                              width: 12,
                              height: 12,
                              viewBox: "0 0 16 16",
                              fill: "currentColor",
                            },
                            react.createElement("path", {
                              d: "M8.864 15.674c-.956.24-1.843-.484-1.908-1.42-.072-1.05-.23-2.015-.428-2.59-.125-.36-.479-1.012-1.04-1.638-.557-.624-1.282-1.179-2.131-1.41C2.685 8.432 2 7.85 2 7V3c0-.845.682-1.464 1.448-1.546 1.07-.113 1.564-.415 2.068-.723l.048-.029c.272-.166.578-.349.97-.484C6.931.08 7.395 0 8 0h3.5c.937 0 1.599.478 1.934 1.064.164.287.254.607.254.913 0 .152-.023.312-.077.464.201.262.38.577.488.9.11.33.172.762.004 1.15.069.13.12.268.159.403.077.27.113.567.113.856 0 .289-.036.586-.113.856-.035.12-.076.237-.138.362a1.9 1.9 0 0 1 .234 1.734c-.206.592-.682 1.1-1.2 1.272-.847.283-1.803.276-2.516.211a9.877 9.877 0 0 1-.443-.05 9.364 9.364 0 0 1-.062 4.51c-.138.508-.55.848-1.012.964l-.261.065z",
                            })
                          ),
                          react.createElement("span", null, video.dislikes)
                        ),
                        // Delete button (본인 영상만 표시)
                        video.submitterId === currentUserHash &&
                        react.createElement(
                          "button",
                          {
                            className: "action-btn delete",
                            onClick: (e) => showDeleteConfirm(video, e),
                            disabled: deletingId === video.id,
                            title: I18n.t("communityVideo.delete"),
                          },
                          deletingId === video.id
                            ? "..."
                            : react.createElement(
                              "svg",
                              {
                                width: 12,
                                height: 12,
                                viewBox: "0 0 16 16",
                                fill: "currentColor",
                              },
                              react.createElement("path", {
                                d: "M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z",
                              }),
                              react.createElement("path", {
                                fillRule: "evenodd",
                                d: "M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z",
                              })
                            )
                        )
                      )
                    ),
                    // Embed preview (해당 영상이 선택된 경우) - 현재 재생 시간에 맞춰 동기화
                    previewVideoId === video.youtubeVideoId &&
                    react.createElement(SyncedVideoPreview, {
                      videoId: video.youtubeVideoId,
                      startTime: video.startTime,
                    })
                  )
                )
              )
              : react.createElement(
                "div",
                {
                  className: "community-video-empty",
                },
                I18n.t("communityVideo.noVideos")
              ),

            // Submit Form Toggle
            react.createElement(
              "button",
              {
                className: "community-video-add-btn",
                onClick: () => {
                  setShowSubmitForm(!showSubmitForm);
                  if (showSubmitForm) {
                    // 폼을 닫을 때 초기화
                    setSubmitUrl("");
                    setSubmitStartTime(0);
                    setSubmitVideoTitle("");
                    setFormPreviewVideoId(null);
                  }
                },
              },
              showSubmitForm
                ? I18n.t("cancel")
                : I18n.t("communityVideo.addVideoNoEmoji")
            ),

            // Submit Form
            showSubmitForm &&
            react.createElement(
              "div",
              {
                className: "community-video-submit-form",
              },
              react.createElement(
                "div",
                {
                  className: "form-group",
                },
                react.createElement(
                  "label",
                  null,
                  I18n.t("communityVideo.youtubeUrl")
                ),
                react.createElement("input", {
                  type: "text",
                  value: submitUrl,
                  onChange: (e) => setSubmitUrl(e.target.value),
                  placeholder: "https://youtube.com/watch?v=... or Video ID",
                })
              ),

              // 제목 표시
              submitVideoTitle &&
              react.createElement(
                "div",
                {
                  className: "form-group video-title-preview",
                },
                react.createElement(
                  "label",
                  null,
                  I18n.t("communityVideo.videoTitle")
                ),
                react.createElement(
                  "div",
                  {
                    className: "video-title-text",
                  },
                  submitVideoTitle
                )
              ),

              // 제목 로딩 중
              isLoadingTitle &&
              react.createElement(
                "div",
                {
                  className: "form-group",
                },
                react.createElement(
                  "div",
                  {
                    className: "loading-title",
                  },
                  I18n.t("communityVideo.loadingTitle")
                )
              ),

              // Embed 미리보기 (등록 폼) - 폼용 별도 상태 사용
              formPreviewVideoId &&
              showSubmitForm &&
              react.createElement(SimpleVideoPreview, {
                videoId: formPreviewVideoId,
                startTime: submitStartTime,
              }),

              react.createElement(
                "div",
                {
                  className: "form-group",
                },
                react.createElement(
                  "label",
                  null,
                  I18n.t("communityVideo.startTimeLabel")
                ),
                react.createElement(
                  "div",
                  {
                    className: "form-hint",
                  },
                  I18n.t("communityVideo.startTimeHint")
                ),
                react.createElement("input", {
                  type: "number",
                  value: submitStartTime,
                  onChange: (e) => setSubmitStartTime(e.target.value),
                  min: 0,
                  max: 3600,
                  step: 0.1,
                  placeholder: "0",
                })
              ),
              react.createElement(
                "button",
                {
                  className: "community-video-submit-btn",
                  onClick: handleSubmit,
                  disabled: isSubmitting || !submitUrl || isLoadingTitle,
                },
                isSubmitting
                  ? I18n.t("communityVideo.submitting")
                  : I18n.t("communityVideo.submit")
              )
            )
          )
    ),

    // 삭제 확인 다이얼로그
    react.createElement(ConfirmDialog, {
      isOpen: deleteConfirmId !== null,
      title: I18n.t("communityVideo.delete"),
      message:
        I18n.t("communityVideo.deleteConfirm") + "\n\n" + deleteConfirmTitle,
      onConfirm: executeDelete,
      onCancel: closeDeleteConfirm,
    })
  );
};

window.CommunityVideoSelector = CommunityVideoSelector;
