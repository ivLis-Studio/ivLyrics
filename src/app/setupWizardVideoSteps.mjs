import { watchYouTubeIframeApi } from "../features/video/youTubeIframeApi.mjs";

export function createSetupWizardVideoSteps({
  react, host: window, document, i18n: I18n, videoHelper: VideoHelperService,
  style: { WIZARD_COLORS, wizardStepStyle, wizardTitleStyle, wizardSubtitleStyle, wizardPanelStyle },
  controls: { WizardButton, WizardIcons, WizardNavigation, WizardToggleVisual },
}) {
  const { useState } = react;

  // Video Test step - Check if YouTube embed requires login
  const VideoTestStep = ({ onBack, onNeedHelper, onSkip }) => {
    const [loginRequired, setLoginRequired] = useState(null);
    const [, setPlayerReady] = useState(false);
    const playerContainerRef = react.useRef(null);
    const playerRef = react.useRef(null);
    const playerIdRef = react.useRef("yt-wizard-player-" + Math.random().toString(36).substr(2, 9));

    const handleYes = () => {
      setLoginRequired(true);
    };

    const handleNo = () => {
      // No login required, skip helper steps
      onSkip();
    };

    const handleInstallHelper = () => {
      if (typeof VideoHelperService !== "undefined") {
        VideoHelperService.openDownloadPage();
      } else {
        window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
      }
    };

    // Initialize YouTube Player API
    react.useEffect(() => {
      const playerId = playerIdRef.current;
      let isMounted = true;
      const createPlayer = (api) => {
        if (!isMounted || !playerContainerRef.current || playerRef.current) return;

        // Create container div if not exists
        if (playerContainerRef.current && !document.getElementById(playerId)) {
          const div = document.createElement("div");
          div.id = playerId;
          div.style.width = "100%";
          div.style.height = "100%";
          playerContainerRef.current.appendChild(div);
        }

        try {
          playerRef.current = new api.Player(playerId, {
            videoId: "9bZkp7q19f0",
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              rel: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              playsinline: 1,
              fs: 0,
              disablekb: 1,
              origin: window.location.origin,
              autoplay: 0,
              controls: 1,
            },
            events: {
              onReady: () => {
                if (isMounted) setPlayerReady(true);
              },
              onError: (e) => {
                console.warn("[VideoTestStep] Player error:", e.data);
              },
            },
          });
        } catch (e) {
          console.error("[VideoTestStep] Failed to create player:", e);
        }
      };

      const stopWaitingForApi = watchYouTubeIframeApi({
        host: window, document, onReady: createPlayer,
        onError: (error) => console.warn("[VideoTestStep] Could not initialize YouTube:", error),
      });

      // Cleanup
      return () => {
        isMounted = false;
        stopWaitingForApi();
        if (playerRef.current && typeof playerRef.current.destroy === "function") {
          try {
            playerRef.current.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        playerRef.current = null;
        setPlayerReady(false);
      };
    }, []);

    const renderVideoTestHelperMessage = () => react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            padding: "16px 20px",
            background: WIZARD_COLORS.warningSurface,
            borderRadius: 6,
            border: `1px solid ${WIZARD_COLORS.warningBorder}`,
            marginBottom: "16px",
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "14px",
              fontWeight: "600",
              color: WIZARD_COLORS.warningText,
              marginBottom: "8px",
            },
          },
          I18n.t("setupWizard.videoTest.helperRequired")
        ),
        react.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: WIZARD_COLORS.muted,
              marginBottom: "16px",
            },
          },
          I18n.t("setupWizard.videoTest.helperDesc")
        ),
        react.createElement(
          WizardButton,
          {
            onClick: handleInstallHelper,
            variant: "secondary",
            style: {
              padding: "12px 24px",
              fontSize: "13px",
              fontWeight: "600",
              color: WIZARD_COLORS.warningText,
              background: WIZARD_COLORS.warningSurface,
              borderColor: WIZARD_COLORS.warningBorder,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            },
          },
          react.createElement("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            fill: "currentColor",
            dangerouslySetInnerHTML: { __html: WizardIcons.externalLink },
          }),
          I18n.t("setupWizard.videoTest.installHelper")
        )
      );

    const renderVideoTestPlayerContainer = () =>
      react.createElement(
        "div",
        {
          ref: playerContainerRef,
          style: {
            width: "100%",
            maxWidth: "400px",
            margin: "0 auto 20px",
            aspectRatio: "16/9",
            borderRadius: 6,
            overflow: "hidden",
            background: "rgba(0, 0, 0, 0.3)",
            border: `1px solid ${WIZARD_COLORS.border}`,
          },
        }
      );

    const renderVideoTestQuestion = () =>
      react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            marginBottom: "16px",
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "14px",
              fontWeight: "500",
              color: WIZARD_COLORS.text,
              marginBottom: "12px",
            },
          },
          I18n.t("setupWizard.videoTest.question")
        ),
        // Yes/No buttons
        loginRequired === null &&
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "center",
              gap: "12px",
            },
          },
          react.createElement(
            WizardButton,
            {
              onClick: handleYes,
              style: {
                padding: "10px 32px",
                fontSize: "14px",
                color: WIZARD_COLORS.dangerText,
                background: WIZARD_COLORS.dangerSurface,
                borderColor: WIZARD_COLORS.dangerBorder,
              },
            },
            I18n.t("setupWizard.videoTest.yes")
          ),
          react.createElement(
            WizardButton,
            {
              onClick: handleNo,
              style: {
                padding: "10px 32px",
                fontSize: "14px",
                color: WIZARD_COLORS.accent,
                background: WIZARD_COLORS.surfaceSelected,
                borderColor: WIZARD_COLORS.borderStrong,
              },
            },
            I18n.t("setupWizard.videoTest.no")
          )
        )
      );

    return react.createElement(
      "div",
      {
        className: "wizard-step video-test-step",
        style: wizardStepStyle,
      },
      react.createElement(
        "h2",
        { style: wizardTitleStyle },
        I18n.t("setupWizard.videoTest.title")
      ),
      react.createElement(
        "p",
        { style: { ...wizardSubtitleStyle, marginBottom: "20px" } },
        I18n.t("setupWizard.videoTest.subtitle")
      ),
      // YouTube Player container
      renderVideoTestPlayerContainer(),
      // Question section
      renderVideoTestQuestion(),
      // Helper required message (shown when loginRequired is true)
      loginRequired === true && renderVideoTestHelperMessage(),
      // Spacer
      react.createElement("div", { style: { flex: 1 } }),
      react.createElement(WizardNavigation, {
        onBack,
        onNext: loginRequired === true ? onNeedHelper : null,
        extraActions: react.createElement(
          WizardButton,
          {
            onClick: onSkip,
            variant: "ghost",
          },
          I18n.t("setupWizard.videoTest.skip")
        ),
      })
    );
  };

  // Video Helper Test step - Test helper program with the same video
  const VideoHelperTestStep = ({ onNext, onBack, onSkip, helperEnabled, onHelperChange }) => {
    const [testStatus, setTestStatus] = useState("idle"); // idle, testing, downloading, success, failed
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [videoUrl, setVideoUrl] = useState(null);
    const requestRef = react.useRef({ generation: 0, abort: null });
    react.useEffect(() => () => {
      requestRef.current.generation += 1;
      requestRef.current.abort?.();
    }, []);

    const testVideoId = "9bZkp7q19f0";

    const handleEnableHelper = () => {
      requestRef.current.generation += 1;
      requestRef.current.abort?.();
      setTestStatus("idle");
      onHelperChange(!helperEnabled);
    };

    const handleTestVideo = async () => {
      const generation = ++requestRef.current.generation;
      requestRef.current.abort?.();
      const active = () => requestRef.current.generation === generation;
      if (typeof VideoHelperService === "undefined") {
        setTestStatus("failed");
        return;
      }

      setTestStatus("testing");
      setDownloadPercent(0);
      setVideoUrl(null);

      // First check if helper is available
      let available = false;
      try { available = await VideoHelperService.checkHealth(); } catch {}
      if (!active()) return;
      if (!available) {
        setTestStatus("failed");
        return;
      }

      // Request the video
      requestRef.current.abort = VideoHelperService.requestVideo(testVideoId, {
        onProgress: (data) => {
          if (!active()) return;
          setTestStatus("downloading");
          setDownloadPercent(data.percent || 0);
        },
        onComplete: (url) => {
          if (!active()) return;
          setVideoUrl(url);
          setTestStatus("success");
        },
        onError: (message) => {
          if (!active()) return;
          console.error("[VideoHelperTest] Error:", message);
          setTestStatus("failed");
        },
      });
    };

    const renderVideoHelperDownloadProgress = () => react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            marginBottom: "16px",
          },
        },
        react.createElement(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "300px",
              height: "8px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              margin: "0 auto 8px",
              overflow: "hidden",
            },
          },
          react.createElement("div", {
            style: {
              width: `${downloadPercent}%`,
              height: "100%",
              background: WIZARD_COLORS.accent,
              borderRadius: 6,
              transition: "width 0.3s ease",
            },
          })
        ),
        react.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: WIZARD_COLORS.muted,
            },
          },
          I18n.t("setupWizard.videoHelperTest.downloading").replace("{percent}", Math.round(downloadPercent))
        )
      );

    const renderVideoHelperSuccess = () => react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            padding: "16px 20px",
            background: WIZARD_COLORS.surfaceSelected,
            borderRadius: 6,
            border: `1px solid ${WIZARD_COLORS.borderStrong}`,
            marginBottom: "16px",
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "14px",
              fontWeight: "600",
              color: WIZARD_COLORS.accent,
              marginBottom: videoUrl ? "12px" : "0",
            },
          },
          "✓ " + I18n.t("setupWizard.videoHelperTest.success")
        ),
        // Show video preview if available
        videoUrl &&
        react.createElement(
          "div",
          {
            style: {
              maxWidth: "300px",
              margin: "0 auto",
              borderRadius: 6,
              overflow: "hidden",
            },
          },
          react.createElement("video", {
            src: videoUrl,
            style: {
              width: "100%",
              borderRadius: 6,
            },
            controls: true,
            autoPlay: true,
            muted: true,
          })
        )
      );

    const renderVideoHelperFailed = () => react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            padding: "16px 20px",
            background: WIZARD_COLORS.dangerSurface,
            borderRadius: 6,
            border: `1px solid ${WIZARD_COLORS.dangerBorder}`,
            marginBottom: "16px",
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "14px",
              fontWeight: "600",
              color: WIZARD_COLORS.dangerText,
            },
          },
          "✕ " + I18n.t("setupWizard.videoHelperTest.failed")
        )
      );

    const renderVideoHelperEnableToggle = () =>
      react.createElement(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": helperEnabled,
          "aria-label": I18n.t("setupWizard.videoHelperTest.enableHelper"),
          onClick: handleEnableHelper,
          style: {
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            ...wizardPanelStyle,
            marginBottom: "16px",
            cursor: "pointer",
          },
        },
        react.createElement(
          "span",
          {
            style: {
              fontSize: "14px",
              fontWeight: "500",
              color: WIZARD_COLORS.text,
            },
          },
          I18n.t("setupWizard.videoHelperTest.enableHelper")
        ),
        react.createElement(WizardToggleVisual, {
          enabled: helperEnabled,
        })
      );

    const renderVideoHelperTestButton = () =>
      react.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            marginBottom: "20px",
          },
        },
        react.createElement(
          WizardButton,
          {
            onClick: handleTestVideo,
            disabled: testStatus === "testing" || testStatus === "downloading",
            variant: "primary",
            style: {
              padding: "14px 32px",
              fontSize: "14px",
            },
          },
          testStatus === "testing" || testStatus === "downloading"
            ? I18n.t("setupWizard.videoHelperTest.testing")
            : I18n.t("setupWizard.videoHelperTest.testVideo")
        )
      );

    return react.createElement(
      "div",
      {
        className: "wizard-step video-helper-test-step",
        style: wizardStepStyle,
      },
      react.createElement(
        "h2",
        { style: wizardTitleStyle },
        I18n.t("setupWizard.videoHelperTest.title")
      ),
      react.createElement(
        "p",
        { style: wizardSubtitleStyle },
        I18n.t("setupWizard.videoHelperTest.subtitle")
      ),
      // Enable helper toggle
      renderVideoHelperEnableToggle(),
      // Test button
      helperEnabled &&
      renderVideoHelperTestButton(),
      // Download progress
      testStatus === "downloading" && renderVideoHelperDownloadProgress(),
      // Success message
      testStatus === "success" && renderVideoHelperSuccess(),
      // Failed message
      testStatus === "failed" && renderVideoHelperFailed(),
      // Spacer
      react.createElement("div", { style: { flex: 1 } }),
      react.createElement(WizardNavigation, {
        onBack,
        onNext,
        extraActions: react.createElement(
          WizardButton,
          {
            onClick: onSkip,
            variant: "ghost",
          },
          I18n.t("setupWizard.videoHelperTest.skip")
        ),
      })
    );
  };

  return { VideoTestStep, VideoHelperTestStep };
}
