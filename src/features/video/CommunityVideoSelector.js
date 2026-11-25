import { selectedVideoStore as selectorSelectedVideoStore } from "#ivlyrics/features/video/selectedVideoStore.mjs";
import { normalizeVideoSkipSegments as normalizeSelectorVideoSkipSegments } from "./communityVideoTimeline.mjs";
import { getCommunityVideoSelectionInfo } from "./communityVideoSelection.mjs";
import { createCommunityVideoPreviews } from "./communityVideoPreview.mjs";
import { createCommunityVideoSubmission } from "./communityVideoSubmission.mjs";
import { createCommunityVideoSubmissionForm } from "./communityVideoSubmissionForm.mjs";
import { createCommunityVideoListItem } from "./communityVideoListItem.mjs";

export function createCommunityVideoSelector({
  host: window, react, config: CONFIG, i18n: I18n, storage: StorageManager,
  spicetify: Spicetify, utils: Utils, toast: Toast, videoHelper: VideoHelperService,
}) {
  /**
   * 커뮤니티 영상 선택기 컴포넌트
   * 사용자들이 추천한 YouTube 영상 목록을 보여주고 투표할 수 있게 합니다.
   */

  // 커스텀 확인 다이얼로그 컴포넌트
  const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
    const confirmButtonRef = react.useRef(null);

    react.useEffect(() => {
      if (!isOpen) return undefined;

      const handleEscape = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      };

      window.document.addEventListener("keydown", handleEscape);
      const focusFrame = window.requestAnimationFrame(() => {
        confirmButtonRef.current?.focus?.();
      });

      return () => {
        window.document.removeEventListener("keydown", handleEscape);
        window.cancelAnimationFrame(focusFrame);
      };
    }, [isOpen, onCancel]);

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
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "ivlyrics-community-confirm-title",
        },
        react.createElement(
          "h3",
          {
            id: "ivlyrics-community-confirm-title",
            className: "confirm-dialog-title",
          },
          title || I18n.t("communityVideo.delete")
        ),
        react.createElement(
          "p",
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
              ref: confirmButtonRef,
            },
            I18n.t("communityVideo.delete")
          )
        )
      )
    );
  };

  const { SyncedVideoPreview, SimpleVideoPreview } = createCommunityVideoPreviews({
    host: window, react, config: CONFIG, i18n: I18n, spicetify: Spicetify, toast: Toast, videoHelper: VideoHelperService,
  });

  const useSubmission = createCommunityVideoSubmission({ react, i18n: I18n, utils: Utils, toast: Toast });
  const SubmissionForm = createCommunityVideoSubmissionForm({ react, i18n: I18n, SimpleVideoPreview });
  const VideoListItem = createCommunityVideoListItem({ react, i18n: I18n, SyncedVideoPreview });

  const requestSelection = async (isCurrent, action, errorKey = "messages.error") => {
    if (!isCurrent()) return false;
    try {
      const result = await action();
      // The track may have changed or a newer selection may have won.
      if (!isCurrent() || result === null) return false;
      if (result !== false) return true;
    } catch (error) {
      if (!isCurrent()) return false;
      console.error("[ivLyrics] Could not update the video selection:", error);
    }
    Toast.error(I18n.t(errorKey));
    return false;
  };

  const TrackVideoSelector = ({
    trackUri,
    currentVideoId,
    onVideoSelect,
    onLocalVideoRemove,
    defaultStartTime = 0,
    onClose,
    closeOnSelection = false,
    signal,
  }) => {
    const { useState, useEffect, useCallback, useRef } = react;
    const useCommitEffect = react.useLayoutEffect || useEffect;
    const [videos, setVideos] = useState([]);
    const currentVideos = useRef(videos);
    const pendingList = useRef(null);
    const mounted = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const pendingVotes = useRef(new Set());
    const [votingIds, setVotingIds] = useState(pendingVotes.current);
    const [previewVideoId, setPreviewVideoId] = useState(null); // 목록에서 미리보기 중인 영상
    const [deletingId, setDeletingId] = useState(null); // 삭제 중인 영상 ID
    const [deleteConfirmId, setDeleteConfirmId] = useState(null); // 삭제 확인 다이얼로그용
    const [deleteConfirmTitle, setDeleteConfirmTitle] = useState(""); // 삭제할 영상 제목
    const [randomSelectionEnabled, setRandomSelectionEnabled] = useState(
      () => CONFIG?.visual?.["community-video-random"] === true
    );
    const [hideDislikedVideos, setHideDislikedVideos] = useState(
      () => CONFIG?.visual?.["community-video-hide-disliked"] !== false
    );

    // 현재 사용자 해시 ID
    const currentUserHash = Utils.getCurrentUserHash();
    const hasSpotifyTrackId = !!Utils.extractTrackId(trackUri);
    const isLocalVideoMode = !hasSpotifyTrackId;
    const isCurrent = useCallback(() => mounted.current && !signal?.aborted, [signal]);
    useCommitEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
    }, []);

    const updateVideos = useCallback(update => {
      const next = update(currentVideos.current);
      currentVideos.current = next;
      setVideos(next);
      return next;
    }, []);

    const selectVideo = useCallback((videoInfo, errorKey) =>
      requestSelection(isCurrent, () => onVideoSelect?.(videoInfo), errorKey), [isCurrent, onVideoSelect]);
    const closeAppliedSelection = useCallback(() => {
      if (closeOnSelection && isCurrent()) onClose?.();
    }, [closeOnSelection, isCurrent, onClose]);

    const loadVideos = useCallback(
      async () => {
        if (!isCurrent()) return;
        pendingList.current?.abort();
        const controller = new AbortController();
        pendingList.current = controller;
        const lookupSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        const ownsList = () => pendingList.current === controller && !lookupSignal.aborted && isCurrent();
        setIsLoading(true);
        setError(null);

        try {
          if (isLocalVideoMode) {
            const savedVideo = await selectorSelectedVideoStore.getSelectedVideo(trackUri);
            if (!ownsList()) return;
            updateVideos(() => savedVideo?.youtubeVideoId ? [{
              id: "local",
              youtubeVideoId: savedVideo.youtubeVideoId,
              youtubeTitle: savedVideo.youtubeTitle,
              startTime: savedVideo.captionStartTime ?? 0,
              skipSegments: normalizeSelectorVideoSkipSegments(savedVideo.skipSegments),
              submitterId: currentUserHash,
              isLocalOnly: true,
              isAutoGenerated: false,
              likes: 0,
              dislikes: 0,
              score: 0,
              userVote: null,
            }] : []);
            return;
          }

          const data = await Utils.getCommunityVideos(trackUri, { signal: lookupSignal });
          if (!ownsList()) return;
          updateVideos(() => Array.isArray(data?.videos)
            ? data.videos.map((video) => ({
              ...video,
              skipSegments: normalizeSelectorVideoSkipSegments(video?.skipSegments),
            })) : []);
        } catch {
          if (ownsList()) setError(I18n.t("communityVideo.loadError"));
        } finally {
          if (ownsList()) {
            pendingList.current = null;
            setIsLoading(false);
          }
        }
      },
      [trackUri, isLocalVideoMode, currentUserHash, isCurrent, signal, updateVideos]
    );

    useEffect(() => {
      loadVideos();
      return () => pendingList.current?.abort();
    }, [loadVideos]);

    const updateRandomSelection = useCallback((nextValue) => {
      setRandomSelectionEnabled(nextValue);
      CONFIG.visual["community-video-random"] = nextValue;
      StorageManager.saveConfig("community-video-random", nextValue);
      window.dispatchEvent(new CustomEvent(
        "ivLyrics:communityVideoRandomChanged",
        { detail: { enabled: nextValue } }
      ));
    }, []);

    const toggleRandomSelection = useCallback(() => {
      updateRandomSelection(!randomSelectionEnabled);
    }, [randomSelectionEnabled, updateRandomSelection]);

    const replaceHiddenCurrentVideo = useCallback(async (nextVideos, hiddenVideoId) => {
      if (!isCurrent() || !hiddenVideoId || currentVideoId !== hiddenVideoId) return;

      const seenVideoIds = new Set([hiddenVideoId]);
      const replacement = nextVideos.find((video) => {
        const videoId = String(video?.youtubeVideoId || "").trim();
        if (!videoId || seenVideoIds.has(videoId) || video.userVote === -1) {
          return false;
        }
        seenVideoIds.add(videoId);
        return true;
      });

      setPreviewVideoId(null);

      if (CONFIG.visual["community-video-random"] === true) {
        window.dispatchEvent(new CustomEvent(
          "ivLyrics:communityVideoCurrentHidden",
          { detail: { trackUri, videoId: hiddenVideoId } }
        ));
        return;
      }

      if (await selectVideo(
        replacement
          ? getCommunityVideoSelectionInfo(
            replacement,
            replacement.startTime,
            replacement.skipSegments
          )
          : null
      )) closeAppliedSelection();
    }, [currentVideoId, isCurrent, selectVideo, trackUri, closeAppliedSelection]);

    const toggleHideDislikedVideos = useCallback(async () => {
      const nextValue = !hideDislikedVideos;
      setHideDislikedVideos(nextValue);
      CONFIG.visual["community-video-hide-disliked"] = nextValue;
      StorageManager.saveConfig("community-video-hide-disliked", nextValue);
      if (nextValue) {
        const hiddenCurrentVideo = videos.find((video) =>
          video.userVote === -1 && video.youtubeVideoId === currentVideoId
        );
        if (hiddenCurrentVideo) {
          await replaceHiddenCurrentVideo(videos, hiddenCurrentVideo.youtubeVideoId);
        }
      }
    }, [currentVideoId, hideDislikedVideos, replaceHiddenCurrentVideo, videos]);

    // 투표 처리
    const handleVote = async (videoEntryId, currentVote, newVote) => {
      if (isLocalVideoMode || !isCurrent() || pendingVotes.current.has(videoEntryId)) return;
      pendingVotes.current.add(videoEntryId);
      setVotingIds(new Set(pendingVotes.current));

      // 같은 버튼을 다시 누르면 투표 취소
      const voteType = currentVote === newVote ? 0 : newVote;

      try {
        const result = await Utils.voteCommunityVideo(videoEntryId, voteType, trackUri);
        if (result && isCurrent()) {
          // 투표 결과로 목록 업데이트
          const updatedVideos = updateVideos(latest => latest
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
            .sort((a, b) => b.score - a.score));
          if (voteType === -1 && CONFIG.visual["community-video-hide-disliked"] !== false) {
            const dislikedVideo = updatedVideos.find((video) => video.id === videoEntryId);
            setPreviewVideoId(preview => dislikedVideo?.youtubeVideoId === preview ? null : preview);
            await replaceHiddenCurrentVideo(
              updatedVideos,
              dislikedVideo?.youtubeVideoId
            );
          }
        }
      } catch (e) {
        if (isCurrent()) console.error("Vote failed:", e);
      } finally {
        pendingVotes.current.delete(videoEntryId);
        if (isCurrent()) setVotingIds(new Set(pendingVotes.current));
      }
    };

    const applyVideoSelection = useCallback(async (video, options = {}) => {
      const applied = await selectVideo(getCommunityVideoSelectionInfo(
        video,
        options.startTime,
        options.skipSegments ?? video?.skipSegments
      ));
      if (!applied || !isCurrent()) return false;
      if (CONFIG.visual["community-video-random"] === true) updateRandomSelection(false);
      if (options.notify !== false) {
        Toast.success(I18n.t("communityVideo.applied"));
      }
      return true;
    }, [isCurrent, selectVideo, updateRandomSelection]);

    const { showSubmitForm, openSubmitForm, resetSubmitForm, form } = useSubmission({
      trackUri, isLocalVideoMode, defaultStartTime, onClose, selectVideo, applyVideoSelection, loadVideos,
      closeAppliedSelection, isCurrent, signal,
    });

    useEffect(() => {
      if (!hideDislikedVideos || !previewVideoId) return;
      const previewedVideo = videos.find((video) => video.youtubeVideoId === previewVideoId);
      if (previewedVideo?.userVote === -1) {
        setPreviewVideoId(null);
      }
    }, [hideDislikedVideos, previewVideoId, videos]);

    // 영상 적용 처리 (모달 닫지 않음)
    const handleEdit = (video, e) => {
      e.stopPropagation();
      void openSubmitForm(video);
    };

    const handleApply = async (video) => {
      if (await applyVideoSelection(video)) closeAppliedSelection();
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
      if (!videoEntryId || !isCurrent()) return;

      closeDeleteConfirm();
      setDeletingId(videoEntryId);

      try {
        if (isLocalVideoMode) {
          const remove = onLocalVideoRemove ?? (async () => {
            if (!await selectorSelectedVideoStore.removeSelectedVideo(trackUri)) return false;
            return isCurrent() ? onVideoSelect?.(null) : null;
          });
          if (!await requestSelection(isCurrent, remove, "communityVideo.deleteError")) return;
          setPreviewVideoId(null);
          updateVideos(() => []);
          Toast.success(I18n.t("communityVideo.deleted"));
          closeAppliedSelection();
          return;
        }

        const result = await Utils.deleteCommunityVideo(videoEntryId, trackUri);
        if (!isCurrent()) return;
        if (result) {
          const deletedVideo = currentVideos.current.find((v) => v.id === videoEntryId);
          Toast.success(I18n.t("communityVideo.deleted"));
          // 목록에서 제거
          updateVideos(prev => prev.filter(v => v.id !== videoEntryId));
          // 미리보기 중이던 영상이면 미리보기 닫기
          setPreviewVideoId(preview => deletedVideo?.youtubeVideoId === preview ? null : preview);
        } else {
          Toast.error(I18n.t("communityVideo.deleteError"));
        }
      } catch (e) {
        if (!isCurrent()) return;
        console.error("Delete failed:", e);
        Toast.error(I18n.t("communityVideo.deleteError"));
      } finally {
        if (isCurrent()) setDeletingId(null);
      }
    };

    // 영상 미리보기 토글
    const togglePreview = (video, e) => {
      e.stopPropagation();
      setPreviewVideoId(preview => preview === video.youtubeVideoId ? null : video.youtubeVideoId);
    };

    const dislikedVideoCount = videos.filter((video) => video.userVote === -1).length;
    const visibleVideos = hideDislikedVideos
      ? videos.filter((video) => video.userVote !== -1)
      : videos;

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
          react.createElement(
            "svg",
            { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
            react.createElement("path", { d: "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" })
          )
        )
      ),

      // Content
      react.createElement(
        "div",
        {
          className: "community-video-content",
        },
        !isLocalVideoMode &&
        react.createElement(
          "div",
          {
            className: `community-video-random-setting${randomSelectionEnabled ? " enabled" : ""}`,
          },
          react.createElement(
            "div",
            { className: "community-video-random-row" },
            react.createElement(
              "div",
              { className: "community-video-random-copy" },
              react.createElement(
                "div",
                {
                  id: "community-video-random-label",
                  className: "community-video-random-label",
                },
                I18n.t("communityVideo.randomSelectionLabel")
              ),
              react.createElement(
                "div",
                { className: "community-video-random-description" },
                I18n.t("communityVideo.randomSelectionDesc")
              )
            ),
            react.createElement(
              "button",
              {
                type: "button",
                className: "community-video-random-switch",
                role: "switch",
                "aria-checked": randomSelectionEnabled,
                "aria-labelledby": "community-video-random-label",
                onClick: toggleRandomSelection,
              },
              react.createElement("span", {
                className: "community-video-random-switch-thumb",
                "aria-hidden": "true",
              })
            )
          ),
          react.createElement(
            "div",
            {
              className: "community-video-random-warning",
              role: "note",
            },
            I18n.t("communityVideo.randomSelectionWarning")
          )
        ),
        !isLocalVideoMode &&
        react.createElement(
          "div",
          {
            className: `community-video-filter-setting${hideDislikedVideos ? " enabled" : ""}`,
          },
          react.createElement(
            "div",
            { className: "community-video-random-row" },
            react.createElement(
              "div",
              { className: "community-video-random-copy" },
              react.createElement(
                "div",
                {
                  id: "community-video-hide-disliked-label",
                  className: "community-video-random-label",
                },
                I18n.t("communityVideo.hideDislikedLabel")
              ),
              react.createElement(
                "div",
                { className: "community-video-random-description" },
                I18n.t("communityVideo.hideDislikedDesc", { count: dislikedVideoCount })
              )
            ),
            react.createElement(
              "button",
              {
                type: "button",
                className: "community-video-random-switch",
                role: "switch",
                "aria-checked": hideDislikedVideos,
                "aria-labelledby": "community-video-hide-disliked-label",
                onClick: toggleHideDislikedVideos,
              },
              react.createElement("span", {
                className: "community-video-random-switch-thumb",
                "aria-hidden": "true",
              })
            )
          )
        ),
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
              isLocalVideoMode &&
              react.createElement(
                "div",
                {
                  className: "community-video-local-note",
                },
                I18n.t("communityVideo.localTrackDesc") || "로컬 곡입니다. YouTube URL은 이 기기에만 저장되고 서버로 전송되지 않습니다."
              ),
              // Video List
              visibleVideos.length > 0
                ? react.createElement(
                  "div",
                  {
                    className: "community-video-list",
                  },
                  visibleVideos.map((video, index) => react.createElement(VideoListItem, {
                      key: video.id, video, index, currentVideoId, currentUserHash, previewVideoId,
                      votingId: votingIds.has(video.id) ? video.id : null, deletingId,
                      togglePreview, handleApply, handleEdit, handleVote, showDeleteConfirm,
                    }))
                )
                : react.createElement(
                  "div",
                  {
                    className: "community-video-empty",
                  },
                  hideDislikedVideos && videos.length > 0
                    ? I18n.t("communityVideo.allDislikedHidden")
                    : I18n.t("communityVideo.noVideos")
                ),

              // Submit Form Toggle
              react.createElement(
                "button",
                {
                  className: "community-video-add-btn",
                  onClick: () => {
                    if (showSubmitForm) {
                      resetSubmitForm();
                    } else {
                      void openSubmitForm();
                    }
                  },
                },
                showSubmitForm
                  ? I18n.t("cancel")
                  : I18n.t("communityVideo.addVideoNoEmoji")
              ),

              // Submit Form
              showSubmitForm &&
              react.createElement(SubmissionForm, { form, isLocalVideoMode })
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

  const CommunityVideoSelector = props => react.createElement(TrackVideoSelector, { ...props, key: props.trackUri });
  return { CommunityVideoSelector };
}
