export function createCommunityVideoSelectorView({
  host: window, react, i18n: I18n, VideoListItem, SubmissionForm,
}) {
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

  function renderPreference({ className, labelId, label, description, enabled, onToggle, note }) {
    return react.createElement(
      "div", { className: enabled ? `${className} enabled` : className },
      react.createElement(
        "div", { className: "community-video-random-row" },
        react.createElement(
          "div", { className: "community-video-random-copy" },
          react.createElement("div", { id: labelId, className: "community-video-random-label" }, label),
          react.createElement("div", { className: "community-video-random-description" }, description)
        ),
        react.createElement(
          "button", {
            type: "button", className: "community-video-random-switch", role: "switch",
            "aria-checked": enabled, "aria-labelledby": labelId, onClick: onToggle,
          },
          react.createElement("span", { className: "community-video-random-switch-thumb", "aria-hidden": "true" })
        )
      ),
      note
    );
  }

  return function CommunityVideoSelectorView({
    onClose, isLocalVideoMode, randomSelectionEnabled, toggleRandomSelection,
    hideDislikedVideos, toggleHideDislikedVideos, dislikedVideoCount, isLoading, hasLoadError,
    visibleVideos, hasVideos, currentVideoId, currentUserHash, previewVideoId, votingIds, deletingId,
    togglePreview, handleApply, handleEdit, handleVote, showDeleteConfirm,
    showSubmitForm, resetSubmitForm, openSubmitForm, form,
    deleteConfirmId, deleteConfirmTitle, executeDelete, closeDeleteConfirm,
  }) {
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
        !isLocalVideoMode && renderPreference({
          className: "community-video-random-setting",
          labelId: "community-video-random-label",
          label: I18n.t("communityVideo.randomSelectionLabel"),
          description: I18n.t("communityVideo.randomSelectionDesc"),
          enabled: randomSelectionEnabled, onToggle: toggleRandomSelection,
          note: react.createElement(
            "div", { className: "community-video-random-warning", role: "note" },
            I18n.t("communityVideo.randomSelectionWarning")
          ),
        }),
        !isLocalVideoMode && renderPreference({
          className: "community-video-filter-setting",
          labelId: "community-video-hide-disliked-label",
          label: I18n.t("communityVideo.hideDislikedLabel"),
          description: I18n.t("communityVideo.hideDislikedDesc", { count: dislikedVideoCount }),
          enabled: hideDislikedVideos, onToggle: toggleHideDislikedVideos,
        }),
        isLoading
          ? react.createElement(
            "div",
            {
              className: "community-video-loading",
            },
            react.createElement("div", { className: "spinner" }),
            I18n.t("communityVideo.loading")
          )
          : hasLoadError
            ? react.createElement(
              "div",
              {
                className: "community-video-error",
              },
              I18n.t("communityVideo.loadError")
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
                  hideDislikedVideos && hasVideos
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
}
