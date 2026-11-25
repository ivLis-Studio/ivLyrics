export function loadCommunityVideoDraftTitle({
  videoId, readTitle, onLoading, onTitle, signal,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  const controller = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  if (requestSignal.aborted) return () => {};

  const timer = schedule(async () => {
    if (requestSignal.aborted) return;
    onLoading();
    try {
      const title = await readTitle(videoId, { signal: requestSignal });
      if (!requestSignal.aborted) onTitle(title || "");
    } catch (error) {
      if (requestSignal.aborted) return;
      console.error("Failed to fetch YouTube title:", error);
      onTitle("");
    }
  }, 500);
  const cancelTimer = () => cancel(timer);
  requestSignal.addEventListener("abort", cancelTimer, { once: true });
  return () => controller.abort();
}
