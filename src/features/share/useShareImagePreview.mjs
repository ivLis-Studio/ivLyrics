import { getShareImageRenderOptions } from "./shareImageRenderOptions.mjs";

export function useShareImagePreview(react, {
  selectedLines, template, customSettings, trackInfo, generateImage, setPreviewUrl, setIsGenerating,
  onRendered, ready = true,
  signal,
  scheduleFrame = callback => requestAnimationFrame(callback),
  cancelFrame = frameId => cancelAnimationFrame(frameId),
  reportError = error => console.error("[ShareImage] Preview generation failed:", error),
}) {
  // Keep one render in flight and retain only the newest pending preview.
  const previewGenerationRef = react.useRef({ running: false, pending: null });
  const useCommitEffect = react.useLayoutEffect || react.useEffect;
  useCommitEffect(() => {
    if (signal?.aborted) return;
    if (!ready || selectedLines.length === 0 || !trackInfo) {
      onRendered?.(null);
      setPreviewUrl(null);
      setIsGenerating(false);
      return;
    }

    const controller = new AbortController();
    const renderSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const queue = previewGenerationRef.current;
    const generatePreview = async () => {
      if (renderSignal.aborted) return;
      try {
        const result = await generateImage(getShareImageRenderOptions({
          selectedLines, trackInfo, template, customSettings,
        }, 'dataUrl'), { signal: renderSignal });
        if (!renderSignal.aborted) {
          onRendered?.(result);
          setPreviewUrl(result.dataUrl);
        }
      } catch (e) {
        if (!renderSignal.aborted) {
          onRendered?.(null);
          setPreviewUrl(null);
          reportError(e);
        }
      } finally {
        if (!renderSignal.aborted) setIsGenerating(false);
      }
    };

    setIsGenerating(true);
    queue.pending = generatePreview;
    const frameId = scheduleFrame(async () => {
      if (queue.running) return;
      queue.running = true;
      try {
        while (queue.pending) {
          const next = queue.pending;
          queue.pending = null;
          await next();
        }
      } finally {
        queue.running = false;
      }
    });
    renderSignal.addEventListener('abort', () => {
      cancelFrame(frameId);
      if (queue.pending === generatePreview) queue.pending = null;
    }, { once: true });
    return () => controller.abort();
  }, [selectedLines, template, customSettings, trackInfo, ready, signal]);
}
