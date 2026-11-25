import {
  COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS, getCommunityVideoWatchUrl, normalizeCommunityVideoStartTime,
  formatCommunityVideoTime as formatTime,
} from "./communityVideoSelection.mjs";

export function createCommunityVideoSubmissionForm({ react, i18n: I18n, SimpleVideoPreview }) {
  return function CommunityVideoSubmissionForm({ form, isLocalVideoMode }) {
    const {
      editingVideo, submitUrl, setSubmitUrl, submitStartTime, setSubmitStartTime, submitSkipSegments,
      submitVideoTitle, isLoadingTitle, formPreviewVideoId, isSubmitting, handleSubmit,
      editingSkipSegmentIndex, skipSegmentStart, setSkipSegmentStart, skipSegmentEnd, setSkipSegmentEnd,
      saveSkipSegment, editSkipSegment, cancelSkipSegmentEdit, removeSkipSegment,
    } = form;

    const renderSkipSegmentEditor = () =>
      react.createElement(
        "div",
        {
          className: "form-group community-video-skip-editor",
        },
        react.createElement(
          "div",
          { className: "community-video-skip-heading" },
          react.createElement(
            "label",
            null,
            I18n.t("communityVideo.skipSegmentsLabel")
          ),
          react.createElement(
            "span",
            { className: "community-video-skip-count" },
            I18n.t("communityVideo.skipSegmentCount", {
              count: submitSkipSegments.length,
              max: COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS,
            })
          )
        ),
        react.createElement(
          "div",
          { className: "form-hint" },
          I18n.t("communityVideo.skipSegmentsHint")
        ),
        submitSkipSegments.length > 0 &&
        react.createElement(
          "div",
          { className: "community-video-skip-list" },
          submitSkipSegments.map((segment, index) =>
            react.createElement(
              "div",
              {
                className: "community-video-skip-row",
                key: `${segment.start}-${segment.end}-${index}`,
              },
              react.createElement(
                "span",
                { className: "community-video-skip-time" },
                `${formatTime(segment.start)} → ${formatTime(segment.end)}`
              ),
              react.createElement(
                "div",
                { className: "community-video-skip-actions" },
                react.createElement(
                  "button",
                  {
                    type: "button",
                    className: `community-video-skip-edit ${editingSkipSegmentIndex === index ? "active" : ""}`,
                    onClick: () => editSkipSegment(segment, index),
                    title: I18n.t("communityVideo.edit"),
                    "aria-label": `${I18n.t("communityVideo.edit")}: ${formatTime(segment.start)} → ${formatTime(segment.end)}`,
                  },
                  I18n.t("communityVideo.edit")
                ),
                react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "community-video-skip-remove",
                    onClick: () => removeSkipSegment(index),
                    title: I18n.t("communityVideo.removeSkipSegment"),
                    "aria-label": I18n.t("communityVideo.removeSkipSegment"),
                  },
                  "×"
                )
              )
            )
          )
        ),
        react.createElement(
          "div",
          { className: "community-video-skip-add-row" },
          react.createElement(
            "label",
            { className: "community-video-skip-input-wrap" },
            react.createElement(
              "span",
              { className: "community-video-skip-input-label" },
              I18n.t("communityVideo.skipSegmentStart")
            ),
            react.createElement("input", {
              type: "text",
              inputMode: "decimal",
              value: skipSegmentStart,
              onChange: (event) => setSkipSegmentStart(event.target.value),
              onFocus: (event) => event.currentTarget.select(),
              placeholder: "60.0",
            })
          ),
          react.createElement(
            "span",
            { className: "community-video-skip-arrow", "aria-hidden": "true" },
            "→"
          ),
          react.createElement(
            "label",
            { className: "community-video-skip-input-wrap" },
            react.createElement(
              "span",
              { className: "community-video-skip-input-label" },
              I18n.t("communityVideo.skipSegmentEnd")
            ),
            react.createElement("input", {
              type: "text",
              inputMode: "decimal",
              value: skipSegmentEnd,
              onChange: (event) => setSkipSegmentEnd(event.target.value),
              onFocus: (event) => event.currentTarget.select(),
              onKeyDown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveSkipSegment();
                }
              },
              placeholder: "90.0",
            })
          ),
          react.createElement(
            "div",
            { className: "community-video-skip-form-actions" },
            editingSkipSegmentIndex !== null &&
            react.createElement(
              "button",
              {
                type: "button",
                className: "community-video-skip-cancel",
                onClick: cancelSkipSegmentEdit,
              },
              I18n.t("cancel")
            ),
            react.createElement(
              "button",
              {
                type: "button",
                className: "community-video-skip-add",
                onClick: saveSkipSegment,
                disabled:
                  editingSkipSegmentIndex === null &&
                  submitSkipSegments.length >= COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS,
              },
              editingSkipSegmentIndex === null
                ? I18n.t("communityVideo.addSkipSegment")
                : I18n.t("communityVideo.updateAction")
            )
          )
        )
      );

    return react.createElement(
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
          editingVideo
            ? I18n.t("communityVideo.videoTitle")
            : I18n.t("communityVideo.youtubeUrl")
        ),
        editingVideo
          ? react.createElement(
            "div",
            {
              className: "video-title-text",
            },
            `${editingVideo.youtubeTitle || editingVideo.youtubeVideoId} (${editingVideo.youtubeVideoId})`
          )
          : react.createElement("input", {
            type: "text",
            value: submitUrl,
            disabled: isSubmitting,
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
      react.createElement(SimpleVideoPreview, {
        videoId: formPreviewVideoId,
        startTime: submitStartTime,
        skipSegments: submitSkipSegments,
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
          type: "text",
          inputMode: "decimal",
          value: submitStartTime,
          onChange: (e) => setSubmitStartTime(e.target.value),
          onFocus: (e) => e.currentTarget.select(),
          onMouseDown: (e) => e.stopPropagation(),
          onClick: (e) => e.stopPropagation(),
          onBlur: (e) => setSubmitStartTime(String(normalizeCommunityVideoStartTime(e.target.value))),
          "aria-label": I18n.t("communityVideo.startTimeLabel"),
          placeholder: "0",
        })
      ),
      renderSkipSegmentEditor(),
      formPreviewVideoId &&
      react.createElement(
        "a",
        {
          className: "community-video-open-external",
          href: getCommunityVideoWatchUrl(formPreviewVideoId, submitStartTime),
          target: "_blank",
          rel: "noopener noreferrer",
          onClick: (event) => event.stopPropagation(),
        },
        react.createElement(
          "svg",
          { width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true" },
          react.createElement("path", {
            d: "M9 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V3.207L7.354 8.854a.5.5 0 1 1-.708-.708L12.293 2.5H9.5A.5.5 0 0 1 9 2Z",
          }),
          react.createElement("path", {
            d: "M3.5 3A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V9a.5.5 0 0 0-1 0v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7a.5.5 0 0 0 0-1H3.5Z",
          })
        ),
        I18n.t("communityVideo.openOnYouTube")
      ),
      react.createElement(
        "button",
          {
            className: "community-video-submit-btn",
            onClick: handleSubmit,
            disabled: isSubmitting || (!editingVideo && !submitUrl) || isLoadingTitle,
          },
          isSubmitting
            ? I18n.t("communityVideo.submitting")
            : (isLocalVideoMode
              ? I18n.t("communityVideo.apply")
              : (editingVideo
                ? I18n.t("communityVideo.updateAndApplyAction")
                : I18n.t("communityVideo.submit")))
        )
      );
  };
}
