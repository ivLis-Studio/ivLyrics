import { selectedVideoStore as selectorSelectedVideoStore } from "#ivlyrics/features/video/selectedVideoStore.mjs";
import { createCommunityVideoSelectionRequest, getCommunityVideoSelectionInfo } from "./communityVideoSelection.mjs";
import { buildLocalCommunityVideoList, createCommunityVideoList, normalizeCommunityVideoList } from "./communityVideoList.mjs";
import { createCommunityVideoPreviews } from "./communityVideoPreview.mjs";
import { createCommunityVideoSubmission } from "./communityVideoSubmission.mjs";
import { createCommunityVideoSubmissionForm } from "./communityVideoSubmissionForm.mjs";
import { createCommunityVideoListItem } from "./communityVideoListItem.mjs";
import { createCommunityVideoSelectorView } from "./communityVideoSelectorView.mjs";

export function createCommunityVideoSelector({
  host: window, react, config: CONFIG, i18n: I18n, storage: StorageManager,
  spicetify: Spicetify, utils: Utils, toast: Toast, videoHelper: VideoHelperService,
}) {
  /**
   * 커뮤니티 영상 선택기 컴포넌트
   * 사용자들이 추천한 YouTube 영상 목록을 보여주고 투표할 수 있게 합니다.
   */

  const { SyncedVideoPreview, SimpleVideoPreview } = createCommunityVideoPreviews({
    host: window, react, config: CONFIG, i18n: I18n, spicetify: Spicetify, toast: Toast, videoHelper: VideoHelperService,
  });

  const useSubmission = createCommunityVideoSubmission({ react, i18n: I18n, utils: Utils, toast: Toast });
  const SubmissionForm = createCommunityVideoSubmissionForm({ react, i18n: I18n, SimpleVideoPreview });
  const VideoListItem = createCommunityVideoListItem({ react, i18n: I18n, SyncedVideoPreview });
  const SelectorView = createCommunityVideoSelectorView({
    host: window, react, i18n: I18n, VideoListItem, SubmissionForm,
  });

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
    const mounted = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadError, setHasLoadError] = useState(false);
    const [videoList] = useState(() => createCommunityVideoList({
      onList: setVideos, onLoading: setIsLoading, onError: setHasLoadError,
    }));
    const [selection] = useState(() => createCommunityVideoSelectionRequest(currentVideoId));
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
    useCommitEffect(() => { selection.setActiveVideo(currentVideoId); }, [selection, currentVideoId]);

    const requestSelection = useCallback((videoInfo, action, errorKey = "messages.error") => selection.select({
      videoInfo, action, isCurrent,
      onError(error) {
        if (error) console.error("[ivLyrics] Could not update the video selection:", error);
        Toast.error(I18n.t(errorKey));
      },
    }), [selection, isCurrent]);
    const selectVideo = useCallback((videoInfo, errorKey) =>
      requestSelection(videoInfo, () => onVideoSelect?.(videoInfo), errorKey), [requestSelection, onVideoSelect]);
    const closeAppliedSelection = useCallback(() => {
      if (closeOnSelection && isCurrent()) onClose?.();
    }, [closeOnSelection, isCurrent, onClose]);

    const loadVideos = useCallback(() => videoList.load({
      isCurrent, signal,
      readVideos: async lookupSignal => isLocalVideoMode
        ? buildLocalCommunityVideoList(await selectorSelectedVideoStore.getSelectedVideo(trackUri), currentUserHash)
        : normalizeCommunityVideoList(await Utils.getCommunityVideos(trackUri, { signal: lookupSignal })),
    }), [videoList, trackUri, isLocalVideoMode, currentUserHash, isCurrent, signal]);

    useEffect(() => {
      loadVideos();
      return videoList.cancel;
    }, [loadVideos, videoList]);

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
      if (!isCurrent() || !selection.canReplaceHiddenVideo(hiddenVideoId)) return;
      const replacement = nextVideos.find((video) => {
        const videoId = String(video?.youtubeVideoId || "").trim();
        return videoId && videoId !== hiddenVideoId && video.userVote !== -1;
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
    }, [selection, isCurrent, selectVideo, trackUri, closeAppliedSelection]);

    const toggleHideDislikedVideos = useCallback(async () => {
      const nextValue = !hideDislikedVideos;
      setHideDislikedVideos(nextValue);
      CONFIG.visual["community-video-hide-disliked"] = nextValue;
      StorageManager.saveConfig("community-video-hide-disliked", nextValue);
      if (nextValue) {
        const latestVideos = videoList.getVideos();
        const hiddenCurrentVideo = latestVideos.find((video) =>
          video.userVote === -1 && selection.canReplaceHiddenVideo(video.youtubeVideoId)
        );
        if (hiddenCurrentVideo) {
          await replaceHiddenCurrentVideo(latestVideos, hiddenCurrentVideo.youtubeVideoId);
        }
      }
    }, [hideDislikedVideos, replaceHiddenCurrentVideo, selection, videoList]);

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
          const updatedVideos = videoList.update(latest => latest
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
          if (!await requestSelection(null, remove, "communityVideo.deleteError")) return;
          setPreviewVideoId(null);
          videoList.update(() => []);
          Toast.success(I18n.t("communityVideo.deleted"));
          closeAppliedSelection();
          return;
        }

        const result = await Utils.deleteCommunityVideo(videoEntryId, trackUri);
        if (!isCurrent()) return;
        if (result) {
          const deletedVideo = videoList.getVideos().find((v) => v.id === videoEntryId);
          Toast.success(I18n.t("communityVideo.deleted"));
          // 목록에서 제거
          videoList.update(prev => prev.filter(v => v.id !== videoEntryId));
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

    return react.createElement(SelectorView, {
      onClose, isLocalVideoMode, randomSelectionEnabled, toggleRandomSelection,
      hideDislikedVideos, toggleHideDislikedVideos, dislikedVideoCount, isLoading, hasLoadError,
      visibleVideos, hasVideos: videos.length > 0, currentVideoId, currentUserHash, previewVideoId, votingIds, deletingId,
      togglePreview, handleApply, handleEdit, handleVote, showDeleteConfirm,
      showSubmitForm, resetSubmitForm, openSubmitForm, form,
      deleteConfirmId, deleteConfirmTitle, executeDelete, closeDeleteConfirm,
    });
  };

  const CommunityVideoSelector = props => react.createElement(TrackVideoSelector, { ...props, key: props.trackUri });
  return { CommunityVideoSelector };
}
