import { generateImage } from "./generateShareImage.mjs";
import { extractColors } from "./shareImageArtwork.mjs";
import { DEFAULT_SETTINGS, PRESETS, TEMPLATES } from "./shareImagePresets.mjs";

/**
 * 클립보드에 이미지 복사
 */
async function copyToClipboard(blob) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    return true;
  } catch (e) {
    console.error('[LyricsShareImage] Clipboard copy failed:', e);
    return false;
  }
}

/**
 * 이미지 다운로드
 */
function download(dataUrl, filename = 'lyrics.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Web Share API로 공유
 */
async function share(blob, trackName, artistName, { rejectOnCancel = false } = {}) {
  const file = new File([blob], `${trackName} - ${artistName}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${trackName} - ${artistName}`,
        text: `🎵 ${trackName} by ${artistName}\n#ivLyrics #Spotify`,
      });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') {
        if (rejectOnCancel) throw e;
      } else {
        console.error('[LyricsShareImage] Share failed:', e);
      }
      return false;
    }
  }
  return false;
}

export const lyricsShareImage = {
  TEMPLATES,
  PRESETS,
  DEFAULT_SETTINGS,
  generateImage,
  copyToClipboard,
  download,
  share,
  extractColors,
};
