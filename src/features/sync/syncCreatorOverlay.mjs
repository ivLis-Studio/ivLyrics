import { canMountReactDom, createReactDomMount, createReactMountBoundary } from "../../spicetify/routeReactDom.mjs";

export function createSyncCreatorOverlay({ react, host, document, readReactDom, readUtils, getEditor, translate, notifyError }) {
  function setSyncDataCreatorVisibility(active) {
    document.body.classList.toggle("ivlyrics-sync-creator-active", !!active);
    host.dispatchEvent(new host.CustomEvent("ivLyrics:sync-creator-visibility", {
      detail: { active: !!active }
    }));
  }

  // The editor owns its record-mode keys; Escape closes only if unclaimed.
  return async function openSyncDataCreator(trackInfo, initialData = null) {
    const utils = readUtils();
    const trackId = utils.extractTrackId(trackInfo?.uri);
    if (!trackId) {
      notifyError(translate("syncCreator.trackIdRequired") || "Spotify trackId가 없는 로컬 곡은 노래방 싱크를 등록할 수 없습니다.");
      return;
    }

    try {
      await utils.requireDiscordAuth(
        translate("syncCreator.loginRequired"),
        { checkingMessage: translate("settingsAdvanced.aboutTab.account.checking") }
      );
    } catch (e) {
      utils.promptDiscordLoginRequired(e?.message || translate("syncCreator.loginRequired"));
      return;
    }

    // 이미 열려있으면 무시
    if (document.getElementById("ivLyrics-sync-creator-overlay")) {
      setSyncDataCreatorVisibility(true);
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "ivLyrics-sync-creator-overlay";
    overlay.className = "ivlyrics-sync-creator-overlay";

    const dom = readReactDom();
    if (!canMountReactDom(dom)) {
      return;
    }

    let mount;
    let isClosed = false;
    let closeRequest;
    const registerCloseRequest = handler => {
      closeRequest = handler;
      return () => {
        if (closeRequest === handler) closeRequest = undefined;
      };
    };
    const closeModal = () => {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener("keydown", handleEscape);
      try {
        mount?.unmount();
      } finally {
        overlay.remove();
        setSyncDataCreatorVisibility(false);
      }
    };

    // Recording shortcuts may claim Escape before it reaches the overlay.
    const handleEscape = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (closeRequest) {
        closeRequest().catch(error => console.error("[ivLyrics] Failed to close the sync creator:", error));
      } else {
        closeModal();
      }
    };
    document.addEventListener("keydown", handleEscape);

    document.body.appendChild(overlay);
    setSyncDataCreatorVisibility(true);

    try {
      const SyncCreator = getEditor();
      if (!SyncCreator) {
        console.error("[OptionsMenu] SyncDataCreator component not found");
        notifyError("SyncDataCreator not available");
        closeModal();
        return;
      }

      const content = react.createElement(SyncCreator, { trackInfo, initialData, onClose: closeModal, registerCloseRequest });
      mount = createReactDomMount(dom, overlay);
      if (mount.waitsForCommit) {
        const Boundary = createReactMountBoundary(react);
        const onError = error => {
          console.error("[ivLyrics] Sync creator render failed:", error);
          host.setTimeout(closeModal, 0);
        };
        mount.render(react.createElement(Boundary, { onError }, content));
      } else {
        mount.render(content);
      }
    } catch (error) {
      try {
        closeModal();
      } catch (cleanupError) {
        console.error("[ivLyrics] Failed to close the sync creator:", cleanupError);
      }
      throw error;
    }
  };
}
