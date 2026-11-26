import {
  COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS, getCommunityVideoWatchUrl, formatCommunityVideoTime as formatTime,
} from "./communityVideoSelection.mjs";

export function createCommunityVideoListItem({ react, i18n: I18n, SyncedVideoPreview }) {
  function renderVideoInfo(video) {
    return react.createElement(
      "div",
      {
        className: "community-video-info",
      },
      react.createElement(
        "a",
        {
          className: "community-video-title",
          title: `${video.youtubeTitle || video.youtubeVideoId} — ${I18n.t("communityVideo.openOnYouTube")}`,
          "aria-label": `${video.youtubeTitle || video.youtubeVideoId} — ${I18n.t("communityVideo.openOnYouTube")}`,
          href: getCommunityVideoWatchUrl(video.youtubeVideoId, video.startTime),
          target: "_blank",
          rel: "noopener noreferrer",
          onClick: (event) => event.stopPropagation(),
        },
        react.createElement(
          "span",
          { className: "community-video-title-text" },
          video.youtubeTitle || video.youtubeVideoId
        ),
        react.createElement(
          "svg",
          {
            className: "community-video-external-icon",
            width: 12,
            height: 12,
            viewBox: "0 0 16 16",
            fill: "currentColor",
            "aria-hidden": true,
          },
          react.createElement("path", {
            d: "M9 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V3.207L7.354 8.854a.5.5 0 1 1-.708-.708L12.293 2.5H9.5A.5.5 0 0 1 9 2Z",
          }),
          react.createElement("path", {
            d: "M3.5 3A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V9a.5.5 0 0 0-1 0v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7a.5.5 0 0 0 0-1H3.5Z",
          })
        )
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
        Array.isArray(video.skipSegments) && video.skipSegments.length > 0 &&
        react.createElement(
          "span",
          { className: "community-video-skip-summary" },
          I18n.t("communityVideo.skipSegmentCount", {
            count: video.skipSegments.length,
            max: COMMUNITY_VIDEO_MAX_SKIP_SEGMENTS,
          })
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
    );
  }

  return function CommunityVideoListItem({
    video, index, trackUri, currentVideoId, currentUserHash, previewVideoId, votingId, deletingId,
    togglePreview, handleApply, handleEdit, handleVote, showDeleteConfirm,
  }) {
    const renderVideoActions = () =>
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
        react.createElement(
          "button",
          {
            className: "action-btn preview",
            onClick: (e) => handleEdit(video, e),
            title: I18n.t("communityVideo.edit"),
          },
          I18n.t("communityVideo.edit")
        ),
        // Vote buttons
        !video.isLocalOnly &&
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
        !video.isLocalOnly &&
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
      );

    return react.createElement(
      react.Fragment,
      null,
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
        renderVideoInfo(video),

        // Action buttons
        renderVideoActions()
      ),
      // Embed preview (해당 영상이 선택된 경우) - 현재 재생 시간에 맞춰 동기화
      previewVideoId === video.youtubeVideoId &&
      react.createElement(SyncedVideoPreview, {
        trackUri,
        videoId: video.youtubeVideoId,
        startTime: video.startTime,
        skipSegments: video.skipSegments,
        isAutoGenerated: video.submitterId === "system" || video.isAutoGenerated === true,
      })
    );
  };
}
