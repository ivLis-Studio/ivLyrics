import { openFluentReactModal } from "../../app/modal/fluentModalHost.mjs";
import { getSettingsSurfaceTheme } from "../settings/settingsSurfaceTheme.mjs";
import { lyricsShareImage } from "./shareImageApi.mjs";
import { renderShareImageControls } from "./renderShareImageControls.mjs";
import { normalizeShareImageLyrics, resolveShareWordDetails } from "./shareImageLyricSelection.mjs";
import { useShareImagePreview } from "./useShareImagePreview.mjs";
import { createShareImageExportActions } from "./shareImageExportActions.mjs";

export function createShareImageModal({
  react, translate, notify, readSegmenter, readSupplements, image = lyricsShareImage,
  readTheme = getSettingsSurfaceTheme,
  canShare = () => navigator.canShare,
}) {
  return function ShareImageModal({ lyrics, trackInfo, onClose, signal }) {
    const [selectedIndices, setSelectedIndices] = react.useState([]);
    const [template, setTemplate] = react.useState('cover');
    const [previewUrl, setPreviewUrl] = react.useState(null);
    const [previewBusy, setPreviewBusy] = react.useState(false);
    const [customSettings, setCustomSettings] = react.useState({});
    const [pendingAction, setPendingAction] = react.useState(null);
    const [exportBusy, setExportBusy] = react.useState(false);
    const exportOperation = react.useRef(false);
    const renderedPreview = react.useRef(null);
    const mounted = react.useRef(true);
    const headerElement = react.useRef(null);
    const editorElement = react.useRef(null);
    const footerElement = react.useRef(null);
    const confirmButton = react.useRef(null);
    const confirmationTrigger = react.useRef(null);
    const MAX_LINES = 10;
    const editingLocked = Boolean(pendingAction) || exportBusy;

    react.useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
    }, []);

    const isOpen = () => mounted.current && !signal?.aborted;
    const close = () => {
      mounted.current = false;
      onClose();
    };

    const useCommitEffect = react.useLayoutEffect || react.useEffect;
    useCommitEffect(() => {
      if (headerElement.current) headerElement.current.inert = Boolean(pendingAction);
      if (editorElement.current) editorElement.current.inert = editingLocked;
      if (footerElement.current) footerElement.current.inert = Boolean(pendingAction);
      if (!isOpen()) return;
      if (pendingAction) confirmButton.current?.focus();
      else if (!editingLocked && confirmationTrigger.current) {
        confirmationTrigger.current.focus();
        confirmationTrigger.current = null;
      }
    }, [pendingAction, editingLocked]);

    const presets = Object.entries(image?.PRESETS || {}).map(([key, val]) => ({
      key,
      name: translate(`shareImage.templates.${key}`) || val.name
    }));

    const currentSettings = react.useMemo(() => {
      const merged = { ...image.DEFAULT_SETTINGS, ...image.PRESETS?.[template]?.settings };
      for (const [key, value] of Object.entries(customSettings)) {
        if (value !== undefined) merged[key] = value;
      }
      return merged;
    }, [template, customSettings]);

    const handleTemplateChange = (newTemplate) => {
      if (editingLocked) return;
      setTemplate(newTemplate);
      setCustomSettings({});
    };

    // 개별 설정 변경
    const updateSetting = (key, value) => {
      if (editingLocked) return;
      setCustomSettings(prev => ({ ...prev, [key]: value }));
    };

    // 가사 라인을 정규화 (원어/발음/번역 추출)
    const normalizedLyrics = react.useMemo(() => normalizeShareImageLyrics(lyrics), [lyrics]);

    // 선택된 가사 라인 객체들
    const normalizedLyricsByIdx = react.useMemo(
      () => new Map(normalizedLyrics.map((line) => [line.idx, line])),
      [normalizedLyrics]
    );
    const selectedIndexSet = react.useMemo(() => new Set(selectedIndices), [selectedIndices]);
    const selectedLinesBase = react.useMemo(() => {
      return selectedIndices.map((idx) => normalizedLyricsByIdx.get(idx)).filter(Boolean);
    }, [selectedIndices, normalizedLyricsByIdx]);

    // Word-level export details: fetched on demand when the word toggle is
    // active, then merged into the selected lines so preview and export
    // (which both consume `selectedLines`) stay in sync.
    const isWordExport = currentSettings.lyricsDetail === 'word';
    const supplementTrackId = trackInfo?.uri?.split(':').pop();
    const [wordDetails, setWordDetails] = react.useState(null);
    const activeWordDetails = isWordExport && wordDetails?.lines === selectedLinesBase
      && wordDetails.trackId === supplementTrackId
      ? wordDetails.details : null;
    const wordDetailsPending = isWordExport && selectedLinesBase.length > 0 && !activeWordDetails;
    react.useEffect(() => {
      if (!wordDetailsPending) return undefined;
      let cancelled = false;
      const load = async () => {
        let details;
        try {
          details = await resolveShareWordDetails(selectedLinesBase, {
            segmenter: readSegmenter(),
            supplements: readSupplements(),
            options: { trackId: supplementTrackId, wanted: () => !cancelled && isOpen() },
          });
        } catch {
          details = new Map();
        }
        if (!cancelled && isOpen()) setWordDetails({ lines: selectedLinesBase, trackId: supplementTrackId, details });
      };
      void load();
      return () => {
        cancelled = true;
      };
    }, [wordDetailsPending, selectedLinesBase, supplementTrackId]);
    const selectedLines = react.useMemo(() => {
      if (!activeWordDetails?.size) return selectedLinesBase;
      return selectedLinesBase.map((line) => (
        activeWordDetails.has(line.idx) ? { ...line, words: activeWordDetails.get(line.idx) } : line
      ));
    }, [selectedLinesBase, activeWordDetails]);

    const selection = react.useMemo(() => ({ selectedLines, trackInfo, template, customSettings }),
      [selectedLines, trackInfo, template, customSettings]);
    const isGenerating = previewBusy || wordDetailsPending || exportBusy;

    useShareImagePreview(react, {
      ...selection, setPreviewUrl, setIsGenerating: setPreviewBusy, ready: !wordDetailsPending, signal,
      generateImage: (options, lifecycle) => image.generateImage(options, lifecycle),
      onRendered: result => { renderedPreview.current = result && { selection, result }; },
    });

    const toggleLine = (lineIdx) => {
      if (editingLocked) return;
      setSelectedIndices(prev => {
        if (prev.includes(lineIdx)) {
          return prev.filter(i => i !== lineIdx);
        }
        if (prev.length >= MAX_LINES) {
          notify("error", "shareImage.maxLinesReached");
          return prev;
        }
        return [...prev, lineIdx];
      });
    };

    const { executeCopy, executeDownload, executeShare } = createShareImageExportActions({
      image, selection, notify, onClose: close, setIsGenerating: setExportBusy,
      operation: exportOperation,
      isOpen, signal,
      getRenderedPreview: () => renderedPreview.current?.selection === selection
        ? renderedPreview.current.result : null,
    });

    const handleCopyrightConfirm = () => {
      if (!pendingAction || !isOpen()) return;
      setPendingAction(null);
      return pendingAction();
    };
    const handleCopyrightCancel = () => setPendingAction(null);

    const requestExport = (action, event) => {
      if (isGenerating || editingLocked || !isOpen()) return;
      if (!selectedLines.length) {
        notify("error", "shareImage.noSelection");
        return;
      }
      confirmationTrigger.current = event?.currentTarget || null;
      setPendingAction(() => action);
    };

    return react.createElement("div", {
      className: "share-image-modal",
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '80vh',
      }
    },
      // Header
      react.createElement("div", {
        className: "ivlyrics-fluent-header share-image-modal-header",
        ref: headerElement,
        style: {
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }
      },
        react.createElement(
          "div",
          { className: "ivlyrics-fluent-title-wrap" },
          react.createElement("h2", { className: "ivlyrics-fluent-title", style: { margin: 0 } }, translate("shareImage.title")),
          react.createElement("p", { className: "ivlyrics-fluent-subtitle" }, translate("shareImage.subtitle"))
        ),
        react.createElement(
          "button",
          {
            onClick: close,
            className: "ivlyrics-fluent-close",
          },
          react.createElement(
            "svg",
            { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
            react.createElement("path", { d: "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" })
          )
        )
      ),

      // Content
      react.createElement("div", {
        className: "share-image-modal-content",
        ref: editorElement,
        style: {
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }
      },
        // Left: Lyrics selection
        react.createElement("div", {
          className: "share-image-modal-selection-pane",
          style: {
            width: '30%',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
          }
        },
          react.createElement("div", {
            className: "share-image-modal-selection-label",
            style: {
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '13px',
              fontWeight: '500',
              color: 'rgba(255,255,255,0.7)',
            }
          }, `${translate("shareImage.selectLyrics")} (${selectedIndices.length}/${MAX_LINES})`),
          react.createElement("div", {
            className: "share-image-modal-selection-list",
            style: {
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
            }
          },
            normalizedLyrics.map((line) =>
              react.createElement("div", {
                key: line.idx,
                className: "share-image-modal-lyric-line",
                "data-selected": selectedIndexSet.has(line.idx),
                onClick: () => toggleLine(line.idx),
                style: {
                  padding: '10px 12px',
                  marginBottom: '4px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedIndexSet.has(line.idx) ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255,255,255,0.05)',
                  border: selectedIndexSet.has(line.idx) ? '1px solid rgba(29, 185, 84, 0.5)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }
              },
                // 원어 텍스트
                react.createElement("div", {
                  style: { fontSize: '14px', fontWeight: '500', color: '#fff' }
                }, line.originalText || line.pronText),
                // 발음 텍스트 (원어와 다를 때만)
                line.pronText && line.originalText && react.createElement("div", {
                  style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }
                }, line.pronText),
                // 번역 텍스트
                line.transText && react.createElement("div", {
                  style: { fontSize: '12px', color: 'rgba(29, 185, 84, 0.8)', marginTop: '2px' }
                }, line.transText)
              )
            )
          )
        ),

        // Middle: Preset & Options
        react.createElement("div", {
          className: "share-image-modal-config-pane",
          style: {
            width: '36%',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            overflowY: 'auto',
          }
        },
          // Preset selector
          react.createElement("div", {
            className: "share-image-control-group",
            style: { marginBottom: '12px' }
          },
            react.createElement("label", {
              style: { fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }
            }, translate("shareImage.template")),
            react.createElement("div", {
              className: "share-image-segment-group",
              style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }
            },
              presets.map(t =>
                react.createElement("button", {
                  key: t.key,
                  className: "share-image-chip",
                  "data-active": template === t.key,
                  onClick: () => handleTemplateChange(t.key),
                  style: {
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: template === t.key ? '2px solid #1db954' : '1px solid rgba(255,255,255,0.2)',
                    background: template === t.key ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }
                }, t.name)
              )
            )
          ),

          react.createElement("div", {
            className: "share-image-advanced-panel",
            style: {
              background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '12px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              fontSize: '11px',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.05)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }
          },
            ...renderShareImageControls(react, translate, currentSettings, updateSetting)
          ),

        ),

        // Right: Preview (separate panel)
        react.createElement("div", {
          className: "share-image-preview-pane",
          style: {
            width: '34%',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            overflowY: 'auto',
          }
        },
          react.createElement("div", {
            className: "share-image-preview-label",
            style: {
              fontSize: '13px',
              fontWeight: '500',
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '12px',
            }
          }, translate("shareImage.preview")),
          react.createElement("div", {
            className: "share-image-preview-panel",
            style: {
              flex: 1,
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              minHeight: '180px',
            }
          },
            (previewBusy || wordDetailsPending) ? react.createElement("div", {
              className: "share-image-placeholder",
              style: { color: 'rgba(255,255,255,0.5)', fontSize: '14px' }
            }, "...") :
              previewUrl ? react.createElement("img", {
                src: previewUrl,
                style: {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '8px',
                }
              }) : react.createElement("div", {
                className: "share-image-placeholder",
                style: { color: 'rgba(255,255,255,0.4)', fontSize: '14px', textAlign: 'center' }
              }, translate("shareImage.selectLyricsHint"))
          )
        )
      ),

      // Footer: Actions
      react.createElement("div", {
        className: "ivlyrics-fluent-footer share-image-modal-footer",
        ref: footerElement,
        style: {
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '10px',
        }
      },
        react.createElement("button", {
          onClick: close,
          className: "ivlyrics-fluent-btn",
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }
        }, translate("buttons.cancel")),
        react.createElement(
          "div",
          { className: "share-image-modal-actions" },
          react.createElement("button", {
            onClick: event => requestExport(executeCopy, event),
            className: "ivlyrics-fluent-btn",
            disabled: selectedIndices.length === 0 || isGenerating,
            style: {
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
              color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
            }
          }, translate("shareImage.actions.copy")),
          react.createElement("button", {
            onClick: event => requestExport(executeDownload, event),
            className: "ivlyrics-fluent-btn",
            disabled: selectedIndices.length === 0 || isGenerating,
            style: {
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
              color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
            }
          }, translate("shareImage.actions.download")),
          canShare() && react.createElement("button", {
            onClick: event => requestExport(executeShare, event),
            className: "ivlyrics-fluent-btn primary",
            disabled: selectedIndices.length === 0 || isGenerating,
            style: {
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: selectedIndices.length === 0 ? 'rgba(29, 185, 84, 0.3)' : '#1db954',
              color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.5)' : '#000',
              fontSize: '14px',
              fontWeight: '600',
              cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
            }
          }, translate("shareImage.actions.share"))
        )
      ),

      // 저작권 경고 모달
      pendingAction && react.createElement("div", {
        className: "ivlyrics-fluent-overlay is-open",
        "data-ui-theme": readTheme(),
        onClick: (e) => {
          if (e.target === e.currentTarget) handleCopyrightCancel();
        }
      },
        react.createElement("div", {
          className: "ivlyrics-fluent-shell share-image-copyright-shell",
          "data-ui-theme": readTheme(),
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "ivlyrics-share-image-confirm-title",
        },
          react.createElement(
            "div",
            { className: "ivlyrics-fluent-body share-image-copyright-body" },
            react.createElement(
              "div",
              { className: "share-image-copyright-icon" },
              react.createElement(
                "svg",
                { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
                react.createElement("path", { d: "M10 3 18 17H2L10 3Z" }),
                react.createElement("path", { d: "M10 7.5v4.5" }),
                react.createElement("circle", { cx: 10, cy: 14.2, r: 0.7, fill: "currentColor", stroke: "none" })
              )
            ),
            react.createElement("h3", { id: "ivlyrics-share-image-confirm-title", className: "ivlyrics-fluent-title", style: { margin: 0, fontSize: '18px' } }, translate("shareImage.copyrightTitle") || "저작권 알림"),
            react.createElement("p", { className: "ivlyrics-fluent-subtitle", style: { margin: 0 } }, translate("shareImage.copyrightDesc") || "이 가사 이미지에는 저작권이 있는 콘텐츠가 포함될 수 있습니다."),
            react.createElement("ul", { className: "share-image-copyright-points" },
              react.createElement("li", null, translate("shareImage.copyrightPoint1") || "개인적인 용도로만 사용해 주세요"),
              react.createElement("li", null, translate("shareImage.copyrightPoint2") || "상업적 목적으로 사용하지 마세요"),
              react.createElement("li", null, translate("shareImage.copyrightPoint3") || "SNS 공유 시 원작자를 존중해 주세요")
            ),
            react.createElement("div", { className: "share-image-copyright-actions" },
            react.createElement("button", {
              onClick: handleCopyrightCancel,
              className: "ivlyrics-fluent-btn",
            }, translate("buttons.cancel") || "취소"),
            react.createElement("button", {
              onClick: handleCopyrightConfirm,
              ref: confirmButton,
              className: "ivlyrics-fluent-btn primary share-image-copyright-confirm",
            }, translate("shareImage.copyrightConfirm") || "동의 후 계속")
            )
          )
        )
      )
    );
  }
}

export function createShareImageDialog(dependencies) {
  const { react } = dependencies;
  const ShareImageModal = createShareImageModal(dependencies);
  return function openShareImageModal(lyrics, trackInfo) {
    openFluentReactModal({
      react,
      overlayId: "ivLyrics-share-image-overlay",
      overlayClassName: "ivl-tb-dialog-overlay",
      shellClassName: "share-image-modal-shell ivl-tb-dialog",
      shellStyle: `
        width: 94%;
        max-width: 1600px;
        max-height: 92vh;
      `,
      render: (closeModal, signal) =>
        react.createElement(ShareImageModal, {
          lyrics,
          trackInfo,
          onClose: closeModal,
          signal,
        }),
    });
  };
}
