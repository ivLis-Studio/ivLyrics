import { joinToolbarClasses } from "../createToolbarControls.mjs";
import { formatSyncOffset, formatCommunityVideoSyncSeconds } from "./syncOffsetValues.mjs";
import { createTrackSyncOffsetTools } from "./createTrackSyncOffsetTools.mjs";
import { createCommunityVideoSync } from "./createCommunityVideoSync.mjs";

export function createSyncAdjustmentControls({
  react, host, readUtils, readTrackOffsets, readCurrentTrackUri, translate, notify, controls,
  createEvent = (type, init) => new CustomEvent(type, init),
  reportError = (...args) => console.error(...args),
}) {
  const { useState, useRef, useEffect } = react;
  const {
    ToolbarButton, IvLyricsToolbarIcon, ToolbarOffsetSteps, ToolbarPanelSection,
    ToolbarPanelGroup, ToolbarPanelRow, ToolbarRangeField, ToolbarToggleRow,
  } = controls;
  const { useTrackSyncOffset, useToolbarSyncOffsets } = createTrackSyncOffsetTools({
    react, host, readUtils, readTrackOffsets, readCurrentTrackUri, reportError,
  });
  const videoSync = createCommunityVideoSync({ react, host, readUtils, translate, notify, createEvent, reportError });
  const { useCurrentVideoSync, useCurrentVideoSyncShare, getCurrentVideoCaptionStartTime, readActiveCommunityVideoInfo } = videoSync;

  const CurrentVideoSyncPill = react.memo(({ trackUri, hideWhenEmpty = false }) => {
    const { activeInfo, handleStep } = useCurrentVideoSync(trackUri);

    if (!trackUri) return null;
    if (!activeInfo?.youtubeVideoId) {
      if (hideWhenEmpty) return null;
      return react.createElement(
        "div",
        { className: "lyrics-track-sync-pill", "data-video-sync": "empty" },
        react.createElement(
          "div",
          { className: "lyrics-sync-adjust-current", style: { padding: "8px 12px" } },
          translate("syncAdjust.noVideo") || "No video playing"
        )
      );
    }

    const currentSeconds = getCurrentVideoCaptionStartTime(activeInfo);
    const stepDefs = [-1000, -100, -10, "current", 10, 100, 1000];
    const controls = stepDefs.map((step, index) => {
      const parts = [];
      if (index > 0) {
        parts.push(react.createElement("span", {
          key: `separator-${index}`,
          className: "lyrics-track-sync-separator",
          "aria-hidden": "true",
        }));
      }
      if (step === "current") {
        parts.push(react.createElement(
          "span",
          {
            key: "current-video-sync",
            className: "lyrics-track-sync-value lyrics-track-sync-value-static",
            "data-active": currentSeconds !== 0 ? "true" : "false",
            title: activeInfo.youtubeTitle || activeInfo.youtubeVideoId,
            "aria-live": "polite",
            "aria-atomic": "true",
          },
          react.createElement(
            "span",
            { className: "lyrics-track-sync-value-current" },
            currentSeconds === null ? "…" : formatCommunityVideoSyncSeconds(currentSeconds)
          )
        ));
        return parts;
      }
      const absoluteMs = Math.abs(step);
      const displayValue = `${step > 0 ? "+" : "−"}${absoluteMs >= 1000 ? `${absoluteMs / 1000}s` : `${absoluteMs}ms`}`;
      parts.push(react.createElement(
        "button",
        {
          key: step,
          type: "button",
          className: "lyrics-track-sync-step",
          disabled: currentSeconds === null,
          onClick: () => handleStep(step),
          onPointerUp: (event) => event.currentTarget.blur(),
          "aria-label": `${translate("syncAdjust.videoTitle") || "Current video"} ${displayValue}`,
        },
        displayValue
      ));
      return parts;
    });

    return react.createElement(
      "div",
      {
        className: "lyrics-track-sync-pill",
        role: "group",
        "aria-label": translate("syncAdjust.videoTitle") || "Current video",
        "data-video-sync": "active",
      },
      react.createElement(
        "div",
        { className: "lyrics-track-sync-controls" },
        controls
      )
    );
  });

  // Panel variant of the video sync control. It follows the same
  // value-plus-steps structure as the track and global sync rows
  // instead of reusing the floating pill markup.
  const CurrentVideoSyncPanelControl = react.memo(({ trackUri }) => {
    const { activeInfo, handleStep } = useCurrentVideoSync(trackUri);
    const { canShare, isSharing, shareVideoTiming } = useCurrentVideoSyncShare(trackUri, activeInfo);
    if (!trackUri || !activeInfo?.youtubeVideoId) return null;
    const currentSeconds = getCurrentVideoCaptionStartTime(activeInfo);
    return react.createElement(
      "div",
      { className: "ivl-tb-offset" },
      react.createElement(
        "div",
        { className: "ivl-tb-offset-header" },
        react.createElement(
          "output",
          {
            className: "ivl-tb-offset-value",
            "aria-live": "polite",
            "aria-busy": currentSeconds === null,
            title: activeInfo.youtubeTitle || activeInfo.youtubeVideoId,
          },
          currentSeconds === null ? "…" : formatCommunityVideoSyncSeconds(currentSeconds)
        ),
        react.createElement(ToolbarButton, {
          className: "ivl-tb-video-sync-share",
          disabled: !canShare || isSharing,
          "aria-busy": isSharing,
          "aria-label": translate("videoSync.share"),
          title: translate("videoSync.shareInfo"),
          onClick: shareVideoTiming,
        },
        react.createElement(IvLyricsToolbarIcon, { name: "shareImage", size: 14 }),
        translate("videoSync.share"))
      ),
      react.createElement(ToolbarOffsetSteps, {
        steps: [-1000, -100, -10, 10, 100, 1000],
        label: translate("syncAdjust.videoTitle") || "Current video",
        disabled: currentSeconds === null,
        onStep: handleStep,
      })
    );
  });

  // Quick video sync: the same pill adjusts the background video's timing when
  // its Lyrics/Video switch is on Video. Every step edits the canonical absolute
  // captionStartTime through the same hook used by the Current-video submenu.
  const VIDEO_SYNC_STEPS_MS = [-2000, -500, -100, "current", 100, 500, 2000];
  const VIDEO_SYNC_KEY_STEP_MS = 100;
  const VIDEO_SYNC_KEY_LARGE_STEP_MS = 2000;
  // The switch keeps its position from one song to the next.
  let lastTrackSyncPillMode = "lyrics";

  const formatVideoSyncOffset = (offsetMs) => {
    const value = (Number(offsetMs) || 0) / 1000;
    const magnitude = Number(Math.abs(value).toFixed(2)).toString();
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude}s`;
  };

  const TrackSyncAdjustPill = react.memo(({ trackUri, lyricsAdjustable = true, videoTrackUri = trackUri }) => {
    const {
      trackOffset: offset, isTrackOffsetLoaded: isOffsetLoaded,
      trackOffsetRef, changeTrackOffset,
    } = useTrackSyncOffset(trackUri);
    const [interactionFeedback, setInteractionFeedback] = useState(null);
    const feedbackSeqRef = useRef(0);
    const feedbackTimerRef = useRef(null);
    useEffect(() => {
      setInteractionFeedback(null);
      return () => {
        if (feedbackTimerRef.current !== null) {
          host.clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = null;
        }
      };
    }, [trackUri]);

    // Video timing is offered only while video is the chosen background
    // (videoTrackUri is null otherwise) and its video is actually showing.
    const { activeInfo: videoInfo, handleStep: handleVideoStep } = useCurrentVideoSync(videoTrackUri);
    const readActiveVideo = () => {
      const info = readActiveCommunityVideoInfo(videoTrackUri);
      return videoTrackUri === trackUri && info?.playerReady === true
        ? info
        : null;
    };
    const video = videoTrackUri === trackUri && videoInfo?.playerReady === true ? videoInfo : null;
    const [mode, setMode] = useState(lastTrackSyncPillMode);
    const { canShare, isSharing, shareVideoTiming } = useCurrentVideoSyncShare(videoTrackUri, video);
    const videoStepRef = useRef(null);
    const showsVideo = Boolean(video) && (!lyricsAdjustable || mode === "video");

    const selectMode = (nextMode) => {
      lastTrackSyncPillMode = nextMode;
      setMode(nextMode);
    };

    const applyVideoStep = (step) => {
      const active = readActiveVideo();
      if (!active || active.youtubeVideoId !== video?.youtubeVideoId) return null;
      return handleVideoStep(step);
    };
    // Keyboard callbacks see the latest owner without waiting for an effect.
    videoStepRef.current = applyVideoStep;

    // [ and ] nudge the video (Shift: 2 s) and show the video side of the pill.
    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.code !== "BracketLeft" && event.code !== "BracketRight") return;
        if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        const tagName = target?.tagName?.toLowerCase?.();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;
        if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .monaco-editor, .CodeMirror, .cm-editor')) return;
        const step = event.shiftKey ? VIDEO_SYNC_KEY_LARGE_STEP_MS : VIDEO_SYNC_KEY_STEP_MS;
        if (!videoStepRef.current?.(event.code === "BracketLeft" ? -step : step)) return;
        event.preventDefault();
        selectMode("video");
      };
      host.addEventListener("keydown", handleKeyDown);
      return () => host.removeEventListener("keydown", handleKeyDown);
    }, [videoTrackUri]);

    const showInteractionFeedback = (kind, event, step = 0) => {
      const feedbackId = ++feedbackSeqRef.current;
      const nextFeedback = {
        id: feedbackId,
        kind,
        step,
        direction: step < 0 ? "left" : "right",
        fromX: 0,
        toX: 0,
        fromWidth: 0,
        toWidth: 0,
        targetCenterX: 0,
      };

      const controls = event?.currentTarget?.closest?.(".lyrics-track-sync-controls");
      const valueButton = controls?.querySelector?.(".lyrics-track-sync-value");
      const sourceRect = event?.currentTarget?.getBoundingClientRect?.();
      const controlsRect = controls?.getBoundingClientRect?.();
      const targetRect = valueButton?.getBoundingClientRect?.();

      if (controlsRect && targetRect) {
        nextFeedback.toX = targetRect.left - controlsRect.left;
        nextFeedback.toWidth = targetRect.width;
        nextFeedback.targetCenterX = nextFeedback.toX + targetRect.width / 2;
        if (kind === "step" && sourceRect) {
          nextFeedback.fromX = sourceRect.left - controlsRect.left;
          nextFeedback.fromWidth = sourceRect.width;
        } else {
          nextFeedback.fromX = nextFeedback.toX;
          nextFeedback.fromWidth = nextFeedback.toWidth;
        }
      }

      setInteractionFeedback(nextFeedback);
      if (feedbackTimerRef.current !== null) {
        host.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = host.setTimeout(() => {
        setInteractionFeedback((current) => current?.id === feedbackId ? null : current);
        if (feedbackSeqRef.current === feedbackId) {
          feedbackTimerRef.current = null;
        }
      }, kind === "reset" ? 520 : 460);
    };

    const renderStepButton = (step) => {
      const absoluteStep = Math.abs(step);
      const displayValue = showsVideo
        ? formatVideoSyncOffset(step)
        : `${step > 0 ? "+" : "−"}${absoluteStep}ms`;
      return react.createElement(
        "button",
        {
          key: step,
          type: "button",
          className: "lyrics-track-sync-step",
          disabled: showsVideo ? getCurrentVideoCaptionStartTime(video) === null : !isOffsetLoaded,
          "data-step-size": absoluteStep,
          "data-feedback-source": interactionFeedback?.kind === "step"
            && interactionFeedback.step === step
            ? "true"
            : undefined,
          onClick: (event) => {
            if (showsVideo) {
              if (!applyVideoStep(step)) return;
            } else if (!changeTrackOffset(trackOffsetRef.current + step)) return;
            showInteractionFeedback("step", event, step);
          },
          onPointerUp: (event) => event.currentTarget.blur(),
          "aria-label": `${translate(showsVideo ? "videoSync.title" : "menu.syncAdjustTitle")} ${displayValue}`,
        },
        displayValue
      );
    };

    const shownOffset = showsVideo ? getCurrentVideoCaptionStartTime(video) : offset;
    const formatShownOffset = showsVideo ? formatCommunityVideoSyncSeconds : formatSyncOffset;
    const isShownOffsetLoaded = showsVideo ? shownOffset !== null : isOffsetLoaded;
    const compactControls = [];
    (showsVideo ? VIDEO_SYNC_STEPS_MS : [-100, -50, -10, "current", 10, 50, 100]).forEach((control, index) => {
      if (index > 0) {
        compactControls.push(react.createElement("span", {
          key: `separator-${index}`,
          className: "lyrics-track-sync-separator",
          "aria-hidden": "true",
        }));
      }

      if (control === "current") {
        compactControls.push(react.createElement(
          "button",
          {
            key: "current-offset",
            type: "button",
            className: "lyrics-track-sync-value",
            disabled: !isShownOffsetLoaded,
            "data-active": isShownOffsetLoaded && shownOffset !== 0 ? "true" : "false",
            "data-feedback-kind": interactionFeedback?.kind || undefined,
            onClick: (event) => {
              if (showsVideo) {
                const current = readActiveVideo();
                const currentStart = getCurrentVideoCaptionStartTime(current);
                if (currentStart === null || !applyVideoStep(-currentStart * 1000)) return;
              } else if (trackOffsetRef.current !== 0 && !changeTrackOffset(0)) return;
              showInteractionFeedback("reset", event);
            },
            onPointerUp: (event) => event.currentTarget.blur(),
            title: translate("syncAdjust.reset"),
            "aria-label": isShownOffsetLoaded
              ? `${formatShownOffset(shownOffset)}, ${translate("syncAdjust.reset")}`
              : translate("syncAdjust.loading"),
          },
          react.createElement(
            "span",
            {
              key: `current-${interactionFeedback?.id || 0}-${isShownOffsetLoaded}-${showsVideo ? "video" : "lyrics"}-${shownOffset}`,
              className: "lyrics-track-sync-value-current",
              "data-change-direction": interactionFeedback?.kind === "step"
                ? interactionFeedback.direction
                : undefined,
              "aria-live": "polite",
              "aria-atomic": "true",
            },
            isShownOffsetLoaded ? formatShownOffset(shownOffset) : "…"
          ),
          react.createElement(
            "span",
            {
              className: "lyrics-track-sync-value-reset",
              "aria-hidden": "true",
            },
            translate("syncAdjust.reset")
          ),
          react.createElement(
            "span",
            {
              className: "lyrics-track-sync-value-reset-done",
              "aria-hidden": "true",
            },
            showsVideo ? "✓ 0s" : "✓ 0ms"
          )
        ));
        return;
      }

      compactControls.push(renderStepButton(control));
    });

    const renderTrackSyncMovementFeedback = () => react.createElement(
        "span",
        {
          key: `flow-${interactionFeedback.id}`,
          className: "lyrics-track-sync-movement-feedback",
          "data-direction": interactionFeedback.direction,
          "data-kind": interactionFeedback.kind,
          "aria-hidden": "true",
          style: {
            "--sync-feedback-from-x": `${interactionFeedback.fromX}px`,
            "--sync-feedback-to-x": `${interactionFeedback.toX}px`,
            "--sync-feedback-from-width": `${interactionFeedback.fromWidth}px`,
            "--sync-feedback-to-width": `${interactionFeedback.toWidth}px`,
            "--sync-feedback-target-center-x": `${interactionFeedback.targetCenterX}px`,
          },
        },
        interactionFeedback.kind === "step"
          ? react.createElement("span", { className: "lyrics-track-sync-hover-transfer" })
          : null,
        interactionFeedback.kind === "reset"
          ? react.createElement("span", {
            className: "lyrics-track-sync-value-impact is-reset",
          })
          : null
      );

    const movementFeedback = interactionFeedback
      ? renderTrackSyncMovementFeedback()
      : null;

    if (!trackUri) return null;
    if (!lyricsAdjustable && !video) return null;

    // Lyrics/Video switch, only while a background video plays.
    const renderModeButton = (buttonMode, icon, label) => react.createElement(
      "button",
      {
        key: buttonMode,
        type: "button",
        className: "lyrics-track-sync-mode-button",
        "aria-pressed": (buttonMode === "video") === showsVideo ? "true" : "false",
        onClick: () => selectMode(buttonMode),
        onPointerUp: (event) => event.currentTarget.blur(),
        title: label,
        "aria-label": label,
      },
      react.createElement(IvLyricsToolbarIcon, { name: icon, size: 15 })
    );
    const modeSwitch = video ? react.createElement(
      "div",
      {
        className: "lyrics-track-sync-mode",
        role: "group",
        "aria-label": `${translate("menu.syncAdjustTitle")} / ${translate("videoSync.title")}`,
      },
      lyricsAdjustable ? renderModeButton("lyrics", "synced", translate("menu.syncAdjustTitle")) : null,
      renderModeButton("video", "communityVideo", translate("videoSync.title"))
    ) : null;
    const shareButton = showsVideo && video.isAutoGenerated === false ? react.createElement(
      "button",
      {
        type: "button",
        className: "lyrics-track-sync-share",
        disabled: !canShare || isSharing,
        "aria-busy": isSharing,
        onClick: shareVideoTiming,
        onPointerUp: (event) => event.currentTarget.blur(),
        title: translate("videoSync.shareInfo"),
        "aria-label": translate("videoSync.share"),
      },
      react.createElement(IvLyricsToolbarIcon, { name: "shareImage", size: 14 })
    ) : null;

    return react.createElement(
      "div",
      {
        className: `lyrics-track-sync-pill${showsVideo ? " is-video-mode" : ""}`,
        role: "group",
        "aria-label": translate(showsVideo ? "videoSync.title" : "menu.syncAdjustTitle"),
        "aria-busy": !isShownOffsetLoaded,
        "data-offset-active": isShownOffsetLoaded && shownOffset !== 0 ? "true" : "false",
      },
      modeSwitch,
      react.createElement(
        "div",
        { className: "lyrics-track-sync-controls" },
        movementFeedback,
        compactControls
      ),
      shareButton
    );
  });

  // 싱크 조절 panel (the name is kept from the toolbar button it replaces): the
  // current track's offset (when the track has timed lyrics), the global offset
  // and the quick sync controls switch. Its footer resets both offsets.
  const SyncAdjustButtonFluent = react.memo(({
    offsets,
    includeTrackOffset = false,
    quickSyncEnabled = true,
    onQuickSyncChange,
    trackUri = null,
  }) => {
    const trackTitle = translate("syncAdjust.trackTitle");
    const globalTitle = translate("syncAdjust.globalTitle");
    // The Current-video section renders only while a video is active for this
    // track, and follows live video changes like the quick-sync bubble.
    const [hasActiveVideo, setHasActiveVideo] = useState(
      () => !!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId
    );
    useEffect(() => {
      setHasActiveVideo(!!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId);
      const handleVideoChange = (event) => {
        if (trackUri && event?.detail?.trackUri && event.detail.trackUri !== trackUri) return;
        setHasActiveVideo(!!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId);
      };
      host.addEventListener("ivLyrics:communityVideoChanged", handleVideoChange);
      return () => {
        host.removeEventListener("ivLyrics:communityVideoChanged", handleVideoChange);
      };
    }, [trackUri]);
    const hasVideoSyncControls = Boolean(
      trackUri &&
      hasActiveVideo
    );
    return react.createElement(
      "div",
      { className: "ivl-tb-stack" },
      includeTrackOffset && react.createElement(
        ToolbarPanelSection,
        { title: trackTitle },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarPanelRow, {
            stack: true,
            className: "ivl-tb-offset-row",
            desc: translate("syncAdjust.trackInfo"),
            control: react.createElement(
              "div",
              { className: "ivl-tb-offset" },
              react.createElement(
                "output",
                {
                  className: joinToolbarClasses("ivl-tb-offset-value", offsets.trackOffset === 0 && "is-zero"),
                  "aria-live": "polite",
                  "aria-busy": !offsets.isTrackOffsetLoaded,
                },
                offsets.isTrackOffsetLoaded ? formatSyncOffset(offsets.trackOffset) : "…"
              ),
              react.createElement(ToolbarOffsetSteps, {
                steps: [-100, -50, -10, 10, 50, 100],
                label: trackTitle,
                disabled: !offsets.isTrackOffsetLoaded,
                onStep: (step) => offsets.changeTrackOffset(offsets.trackOffsetRef.current + step),
              })
            ),
          })
        )
      ),
      react.createElement(
        ToolbarPanelSection,
        { title: globalTitle },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarPanelRow, {
            stack: true,
            className: "ivl-tb-offset-row",
            desc: translate("syncAdjust.globalInfo"),
            control: react.createElement(
              "div",
              { className: "ivl-tb-offset" },
              react.createElement(ToolbarRangeField, {
                value: offsets.globalOffset,
                min: -10000,
                max: 10000,
                step: 10,
                unit: "ms",
                label: globalTitle,
                onChange: offsets.changeGlobalOffset,
              }),
              react.createElement(ToolbarOffsetSteps, {
                steps: [-1000, -100, -10, 10, 100, 1000],
                label: globalTitle,
                unit: false,
                onStep: (step) => offsets.changeGlobalOffset(offsets.globalOffset + step),
              })
            ),
          })
        )
      ),
      hasVideoSyncControls && react.createElement(
        "div",
        { "data-section": "video-sync" },
        react.createElement(
        ToolbarPanelSection,
        { title: translate("syncAdjust.videoTitle") || "Current video" },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarPanelRow, {
            stack: true,
            className: "ivl-tb-offset-row",
            desc: translate("syncAdjust.videoInfo") || "Fine-tune the current video's first-lyric time after auto-match.",
            control: react.createElement(CurrentVideoSyncPanelControl, {
              key: `video-${trackUri}`,
              trackUri,
            }),
          })
        )
        )
      ),
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarToggleRow, {
          label: translate("settingsAdvanced.playback.quickSyncControls.label"),
          checked: quickSyncEnabled,
          onChange: onQuickSyncChange,
        })
      )
    );
  });

  return {
    CurrentVideoSyncPill,
    CurrentVideoSyncPanelControl,
    TrackSyncAdjustPill,
    SyncAdjustButtonFluent,
    useToolbarSyncOffsets,
    videoSync,
  };
}
