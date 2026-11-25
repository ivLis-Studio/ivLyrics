import { extractYouTubeVideoId } from "./youtubeVideoMetadata.mjs";
import { normalizeVideoSkipSegments } from "./communityVideoTimeline.mjs";
import { loadCommunityVideoDraftTitle } from "./communityVideoDraftTitle.mjs";
import {
  COMMUNITY_VIDEO_MAX_START_TIME_SECONDS, COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS, normalizeCommunityVideoStartTime,
} from "./communityVideoSelection.mjs";

export function createCommunityVideoSubmission({ react, utils: Utils, i18n: I18n, toast: Toast }) {
  const { useState, useEffect, useCallback, useRef } = react;

  return function useCommunityVideoSubmission({
    trackUri, isLocalVideoMode, defaultStartTime, onClose, selectVideo, applyVideoSelection, loadVideos,
    closeAppliedSelection, isCurrent, signal,
  }) {
    const getDefaultSubmitStartTime = () => {
      const parsed = Number(defaultStartTime);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    };

    const [submitUrl, setSubmitUrl] = useState("");
    const [submitStartTime, setSubmitStartTime] = useState(() => getDefaultSubmitStartTime());
    const [submitSkipSegments, setSubmitSkipSegments] = useState([]);
    const [skipSegmentStart, setSkipSegmentStart] = useState("");
    const [skipSegmentEnd, setSkipSegmentEnd] = useState("");
    const [editingSkipSegmentIndex, setEditingSkipSegmentIndex] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [titleLookup, setTitleLookup] = useState(null);
    const [editingVideo, setEditingVideo] = useState(null);
    const [draft, setDraft] = useState(null);
    const activeDraft = useRef(null);
    const openingRevision = useRef(0);

    const retireDraft = useCallback(() => {
      activeDraft.current?.controller.abort();
      activeDraft.current = null;
    }, []);
    useEffect(() => retireDraft, [retireDraft]);

    const resetSubmitForm = useCallback(() => {
      openingRevision.current++;
      retireDraft();
      setDraft(null);
      setSubmitUrl("");
      setSubmitStartTime(getDefaultSubmitStartTime());
      setSubmitSkipSegments([]);
      setSkipSegmentStart("");
      setSkipSegmentEnd("");
      setEditingSkipSegmentIndex(null);
      setTitleLookup(null);
      setEditingVideo(null);
      setIsSubmitting(false);
    }, [defaultStartTime, retireDraft]);

    const openSubmitForm = useCallback(async (video = null) => {
      if (!isCurrent()) return;
      const revision = ++openingRevision.current;
      const ownsRequest = () => isCurrent() && openingRevision.current === revision;
      if (!isLocalVideoMode) {
        try {
          await Utils.requireDiscordAuth(
            I18n.t("communityVideo.loginRequired"),
            { checkingMessage: I18n.t("settingsAdvanced.aboutTab.account.checking") }
          );
        } catch (e) {
          if (ownsRequest()) Utils.promptDiscordLoginRequired(e?.message || I18n.t("communityVideo.loginRequired"));
          return;
        }
      }
      if (!ownsRequest()) return;

      retireDraft();
      const controller = new AbortController();
      const nextDraft = {
        controller,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        submitting: false,
      };
      activeDraft.current = nextDraft;
      setDraft(nextDraft);

      setEditingVideo(video);
      setSubmitUrl("");
      setSubmitStartTime(video?.startTime ?? getDefaultSubmitStartTime());
      setSubmitSkipSegments(normalizeVideoSkipSegments(video?.skipSegments));
      setSkipSegmentStart("");
      setSkipSegmentEnd("");
      setEditingSkipSegmentIndex(null);
      setTitleLookup(null);
      setIsSubmitting(false);
    }, [defaultStartTime, isLocalVideoMode, isCurrent, retireDraft, signal]);

    const videoId = editingVideo?.youtubeVideoId || extractYouTubeVideoId(submitUrl);
    const title = titleLookup?.draft === draft && titleLookup?.videoId === videoId ? titleLookup : null;
    const submitVideoTitle = editingVideo?.youtubeTitle || title?.text || "";
    const isLoadingTitle = title?.loading === true;
    const formPreviewVideoId = editingVideo?.youtubeVideoId || (title && !title.loading ? videoId : null);
    const useCommitEffect = react.useLayoutEffect || useEffect;
    useCommitEffect(() => {
      if (!draft || editingVideo || !videoId) return;
      return loadCommunityVideoDraftTitle({
        videoId, signal: draft.signal,
        readTitle: (id, options) => Utils.getYouTubeVideoTitle(id, options),
        onLoading: () => setTitleLookup({ draft, videoId, loading: true }),
        onTitle: text => setTitleLookup({ draft, videoId, text, loading: false }),
      });
    }, [draft, editingVideo, videoId]);

    const changeSubmitUrl = useCallback(value => {
      if (activeDraft.current?.submitting) return;
      if (extractYouTubeVideoId(value) !== videoId) setTitleLookup(null);
      setSubmitUrl(value);
    }, [videoId]);

    const saveSkipSegment = useCallback(() => {
      const parseTime = (value) => Number.parseFloat(String(value ?? "").trim().replace(",", "."));
      const start = parseTime(skipSegmentStart);
      const end = parseTime(skipSegmentEnd);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end > COMMUNITY_VIDEO_MAX_START_TIME_SECONDS ||
        end - start < 0.1
      ) {
        Toast.error(I18n.t("communityVideo.skipSegmentInvalid"));
        return;
      }
      if (
        editingSkipSegmentIndex === null &&
        submitSkipSegments.length >= COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS
      ) {
        Toast.error(I18n.t("communityVideo.skipSegmentLimit", {
          count: COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS,
        }));
        return;
      }

      const nextSegments = editingSkipSegmentIndex === null
        ? [...submitSkipSegments, { start, end }]
        : submitSkipSegments.map((segment, index) =>
          index === editingSkipSegmentIndex ? { start, end } : segment
        );
      setSubmitSkipSegments(normalizeVideoSkipSegments(
        nextSegments,
        COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS
      ));
      setSkipSegmentStart("");
      setSkipSegmentEnd("");
      setEditingSkipSegmentIndex(null);
    }, [editingSkipSegmentIndex, skipSegmentStart, skipSegmentEnd, submitSkipSegments]);

    const editSkipSegment = useCallback((segment, index) => {
      setEditingSkipSegmentIndex(index);
      setSkipSegmentStart(String(segment.start));
      setSkipSegmentEnd(String(segment.end));
    }, []);

    const cancelSkipSegmentEdit = useCallback(() => {
      setEditingSkipSegmentIndex(null);
      setSkipSegmentStart("");
      setSkipSegmentEnd("");
    }, []);

    const removeSkipSegment = useCallback((index) => {
      setSubmitSkipSegments((segments) => segments.filter((_, segmentIndex) => segmentIndex !== index));
      if (editingSkipSegmentIndex === index) {
        cancelSkipSegmentEdit();
      } else if (editingSkipSegmentIndex !== null && index < editingSkipSegmentIndex) {
        setEditingSkipSegmentIndex(editingSkipSegmentIndex - 1);
      }
    }, [cancelSkipSegmentEdit, editingSkipSegmentIndex]);

    // 영상 등록 처리
    const handleSubmit = async () => {
      const ownsDraft = () => !!draft && activeDraft.current === draft && isCurrent() && !draft.signal.aborted;
      if (!ownsDraft() || draft.submitting) return;
      if (!videoId) {
        Toast.error(I18n.t("communityVideo.invalidUrl"));
        return;
      }

      draft.submitting = true;
      setIsSubmitting(true);
      const normalizedStartTime = normalizeCommunityVideoStartTime(submitStartTime);
      const normalizedSkipSegments = normalizeVideoSkipSegments(
        submitSkipSegments,
        COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS
      );

      try {
        let videoTitle = submitVideoTitle || editingVideo?.youtubeTitle || videoId;

        if (!editingVideo) {
          // YouTube 영상 유효성 검사 (실제로 존재하고 재생 가능한지 확인)
          const validation = await Utils.validateYouTubeVideo(videoId, { signal: draft.signal });
          if (!ownsDraft()) return;

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
            return;
          }

          // 유효성 검사에서 가져온 제목 사용
          videoTitle = validation.title || videoTitle;
        }

        if (isLocalVideoMode) {
          const localVideoInfo = {
            youtubeVideoId: videoId,
            youtubeTitle: videoTitle,
            captionStartTime: normalizedStartTime,
            skipSegments: normalizedSkipSegments,
            communityEntryId: null,
            isAutoGenerated: false,
            isLocalOnly: true,
          };
          if (!await selectVideo(localVideoInfo, "communityVideo.submitError") || !ownsDraft()) return;
          Toast.success(I18n.t("communityVideo.localOnlyApplied") || "로컬 영상이 적용되었습니다.");
          resetSubmitForm();
          onClose?.();
          return;
        }

        const result = await Utils.submitCommunityVideo(
          trackUri,
          videoId,
          videoTitle,
          normalizedStartTime,
          normalizedSkipSegments,
          { signal: draft.signal }
        );
        if (!ownsDraft()) return;

        if (result) {
          const wasUpdated = result.data.action === "updated";
          const applied = wasUpdated && editingVideo
            ? await applyVideoSelection(
              {
                ...editingVideo,
                youtubeTitle: videoTitle,
                startTime: normalizedStartTime,
                skipSegments: normalizedSkipSegments,
              },
              {
                startTime: normalizedStartTime,
                skipSegments: normalizedSkipSegments,
                notify: false,
              }
            )
            : false;
          if (!ownsDraft()) return;
          Toast.success(
            wasUpdated
              ? (applied
                ? I18n.t("communityVideo.updatedAndApplied")
                : I18n.t("communityVideo.updated"))
              : I18n.t("communityVideo.submitted")
          );
          resetSubmitForm();
          if (applied) closeAppliedSelection();
          else loadVideos();
        }
      } catch (e) {
        if (ownsDraft()) Toast.error(e?.message || I18n.t("communityVideo.submitError"));
      } finally {
        if (ownsDraft()) {
          draft.submitting = false;
          setIsSubmitting(false);
        }
      }
    };

    return {
      showSubmitForm: Boolean(draft),
      openSubmitForm,
      resetSubmitForm,
      form: {
        editingVideo, submitUrl, setSubmitUrl: changeSubmitUrl, submitStartTime, setSubmitStartTime, submitSkipSegments,
        submitVideoTitle, isLoadingTitle, formPreviewVideoId, isSubmitting, handleSubmit,
        editingSkipSegmentIndex, skipSegmentStart, setSkipSegmentStart, skipSegmentEnd, setSkipSegmentEnd,
        saveSkipSegment, editSkipSegment, cancelSkipSegmentEdit, removeSkipSegment,
      },
    };
  };
}
