import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { createSyncCreatorOverlay } from "#ivlyrics/features/sync/syncCreatorOverlay.mjs";
import { createShareImageDialog } from "#ivlyrics/features/share/shareImageDialog.mjs";
import { getWordSupplementService } from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";
import { openFluentReactModal } from "#ivlyrics/app/modal/fluentModalHost.mjs";
import { createLocalLyricsSearchDialog } from "./localLyricsSearchDialog.mjs";

export function createToolbarDialogs({
  react, host, document, translate, notify, getOptionsText, readLyricsManager, readUtils, CommunityVideoSelector, SyncDataCreator,
}) {
  const localLyricsSearchDialog = createLocalLyricsSearchDialog({
    react, readLyricsManager, getOptionsText,
    translate, notifyError: message => notify("error", message),
  });
  function openLocalLyricsLrclibSearchModal(options) {
    return localLyricsSearchDialog(options);
  }

  // Community Video Selector를 document.body에 직접 렌더링
  function openCommunityVideoSelector(trackUri, currentVideoId, onVideoSelect, defaultStartTime = 0) {
    // 이미 열려있으면 무시
    if (document.getElementById("ivLyrics-community-video-overlay")) {
      return;
    }

    openFluentReactModal({
      react,
      overlayId: "ivLyrics-community-video-overlay",
      overlayClassName: "community-video-overlay ivl-tb-dialog-overlay",
      shellClassName: "community-video-modal-shell ivl-tb-dialog",
      shellStyle: `
        max-width: 90vw;
        height: min(70vh, 760px);
        max-height: 70vh;
        width: 560px;
      `,
      removeExisting: false,
      render: (closeModal, signal) => {
        const player = host.Spicetify?.Player;
        const handleSongChange = event => {
          const nextUri = event?.data?.item?.uri || player?.data?.item?.uri;
          if (nextUri && nextUri !== trackUri) closeModal();
        };
        player?.addEventListener?.("songchange", handleSongChange);
        signal.addEventListener("abort", () => {
          player?.removeEventListener?.("songchange", handleSongChange);
        }, { once: true });
        const selectVideo = videoInfo => onVideoSelect?.(videoInfo, trackUri);
        return react.createElement(CommunityVideoSelector, {
          trackUri,
          currentVideoId,
          defaultStartTime,
          onVideoSelect: selectVideo,
          onLocalVideoRemove: onVideoSelect ? () => selectVideo(null) : undefined,
          closeOnSelection: true,
          signal,
          onClose: closeModal
        });
      },
    });
  }

  const shareImageDialog = createShareImageDialog({
    react,
    translate,
    notify: (type, key) => notify(type, translate(key)),
    readSegmenter: () => lyricsWordSegmenter,
    readSupplements: getWordSupplementService,
  });

  function openShareImageModal(lyrics, trackInfo) {
    shareImageDialog(lyrics, trackInfo);
  }

  const openSyncCreatorOverlay = createSyncCreatorOverlay({
    react, host, document,
    readReactDom: () => host.Spicetify?.ReactDOM ?? host.ReactDOM ?? null,
    readUtils,
    getEditor: () => SyncDataCreator,
    translate, notifyError: message => notify("error", message),
  });
  function openSyncDataCreator(trackInfo, initialData = null) {
    return openSyncCreatorOverlay(trackInfo, initialData);
  }

  return {
    openLocalLyricsLrclibSearchModal, openCommunityVideoSelector, openShareImageModal, openSyncDataCreator,
  };
}
