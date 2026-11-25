import { getShareImageRenderOptions } from "./shareImageRenderOptions.mjs";
import { runWithAbortSignal } from "../../core/abortableOperation.mjs";

export function createShareImageExportActions({
  image, selection, operation, isOpen, getRenderedPreview, notify, onClose, setIsGenerating, signal,
}) {
  const { trackInfo } = selection;
  const generate = output => image.generateImage(getShareImageRenderOptions(selection, output), { signal });

  async function execute(action) {
    if (operation.current || !isOpen()) return;
    operation.current = true;
    setIsGenerating(true);
    let successMessage;
    try {
      const result = getRenderedPreview() ?? await generate(action === 'download' ? 'dataUrl' : 'blob');
      if (!isOpen()) return;

      if (action !== 'download') {
        const blob = result.blob ?? await runWithAbortSignal(signal,
          () => new Promise(resolve => result.canvas.toBlob(resolve, 'image/png')));
        if (!isOpen()) return;
        if (!blob) throw new Error('Could not encode image');
        if (action === 'copy') {
          if (!await image.copyToClipboard(blob)) throw new Error('Could not copy image');
          successMessage = 'notifications.shareImageCopied';
        } else if (await image.share(blob, trackInfo.name, trackInfo.artist, { rejectOnCancel: true })) {
          successMessage = 'notifications.shareImageShared';
        }
      }

      if (!isOpen()) return;
      if (!successMessage) {
        const dataUrl = result.dataUrl || result.canvas.toDataURL('image/png');
        if (!dataUrl.startsWith('data:image/png;')) throw new Error('Could not encode image');
        const filename = `${trackInfo.name || 'lyrics'} - ${trackInfo.artist || 'unknown'}.png`.replace(/[/\\?%*:|"<>]/g, '-');
        image.download(dataUrl, filename);
        successMessage = 'notifications.shareImageDownloaded';
      }
      notify("success", successMessage);
    } catch (error) {
      if (isOpen() && !(action === 'share' && error.name === 'AbortError')) {
        notify("error", "notifications.shareImageFailed");
      }
      return;
    } finally {
      operation.current = false;
      if (isOpen()) setIsGenerating(false);
    }
    if (isOpen()) onClose();
  }

  return {
    executeCopy: () => execute('copy'),
    executeDownload: () => execute('download'),
    executeShare: () => execute('share'),
  };
}
