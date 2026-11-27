import { getAppUpdateInfo, subscribeAppUpdateInfo } from "./updateDialogState.mjs";
import { APP_UPDATE_PAGE_URL } from "./updateLinks.mjs";
import { createNotificationIcon, getNotificationTheme, NOTIFICATION_ICON_SHAPES } from "../../app/notificationPresentation.mjs";
import { cycleDialogTabFocus, getNotificationFocusableElements } from "../../app/modal/dialogTabFocus.mjs";

const UPDATE_BANNER_ICON_SHAPES = {
  ...NOTIFICATION_ICON_SHAPES,
  arrow: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m13 6 6 6-6 6" }],
  ],
  notes: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["path", { d: "M8 13h8" }],
    ["path", { d: "M8 17h6" }],
  ],
};

const formatUpdateVersion = (version) => {
  const value = String(version || "").trim();
  if (!value) return "-";
  return value.toLowerCase().startsWith("v") ? value : `v${value}`;
};

export function createUpdateBanner({ react, host, document, readSetting, translate, ensureReactDOM, dismissUpdate }) {
  const getUpdateBannerTheme = () => getNotificationTheme(readSetting);

  const createUpdateBannerIcon = (name, size = 20) => createNotificationIcon(
    react, name, size, UPDATE_BANNER_ICON_SHAPES[name] || UPDATE_BANNER_ICON_SHAPES.update,
  );

  // Update notification dialog
  function UpdateDialog({ updateInfo, onDismiss }) {
    const modalRef = react.useRef(null);
    const previouslyFocusedRef = react.useRef(document.activeElement);
    const onDismissRef = react.useRef(onDismiss);
    onDismissRef.current = onDismiss;

    react.useEffect(() => {
      const modal = modalRef.current;
      if (!modal) return undefined;

      const handleKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDismissRef.current?.();
          return;
        }

        if (event.key !== "Tab") return;
        // The dialog itself takes the initial focus, so Tab cycles from it too.
        cycleDialogTabFocus(event, document.activeElement, getNotificationFocusableElements(modal), {
          fallback: modal, containerEdge: modal,
        });
      };

      document.addEventListener("keydown", handleKeydown);
      const focusFrame = host.requestAnimationFrame(() => modal.focus());

      return () => {
        host.cancelAnimationFrame(focusFrame);
        document.removeEventListener("keydown", handleKeydown);
        const previouslyFocused = previouslyFocusedRef.current;
        if (previouslyFocused instanceof host.HTMLElement && document.contains(previouslyFocused)) {
          previouslyFocused.focus();
        }
      };
    }, []);

    const closeLabel = translate("settingsUi.close") || "Close";
    const currentVersion = formatUpdateVersion(updateInfo.currentVersion);
    const latestVersion = formatUpdateVersion(updateInfo.latestVersion);

    const renderUpdateBannerHeader = () => react.createElement(
      "div",
      { className: "ivlyrics-update-dialog__header" },
      react.createElement(
        "div",
        { className: "ivlyrics-update-dialog__icon" },
        createUpdateBannerIcon("update", 22)
      ),
      react.createElement(
        "div",
        { className: "ivlyrics-update-dialog__heading" },
        react.createElement(
          "h2",
          { id: "ivlyrics-update-title" },
          translate("notifications.updateAvailable")
        ),
        react.createElement(
          "div",
          {
            className: "ivlyrics-update-dialog__versions",
          },
          react.createElement("span", null, currentVersion),
          createUpdateBannerIcon("arrow", 14),
          react.createElement("strong", null, latestVersion)
        )
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "ivlyrics-update-dialog__close",
          onClick: () => onDismissRef.current?.(),
          title: closeLabel,
          "aria-label": closeLabel,
        },
        createUpdateBannerIcon("close", 18)
      )
    );

    const renderUpdateBannerBody = () => react.createElement(
      "div",
      { className: "ivlyrics-update-dialog__body" },
      react.createElement(
        "p",
        {
          id: "ivlyrics-update-description",
          className: "ivlyrics-update-dialog__description",
        },
        translate("settingsAdvanced.aboutTab.update.protocol.info")
      )
    );

    const renderUpdateBannerFooter = () => react.createElement(
      "div",
      { className: "ivlyrics-update-dialog__footer" },
      react.createElement(
        "a",
        {
          href: updateInfo.releaseUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "ivlyrics-update-dialog__button ivlyrics-update-dialog__button--secondary",
        },
        createUpdateBannerIcon("notes", 16),
        react.createElement("span", null, translate("update.releaseNotes"))
      ),
      react.createElement(
        "span",
        { className: "ivlyrics-update-dialog__footer-spacer" }
      ),
      react.createElement(
        "a",
        {
          href: APP_UPDATE_PAGE_URL,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "ivlyrics-update-dialog__button ivlyrics-update-dialog__button--primary",
        },
        react.createElement(
          "span",
          null,
          translate("settingsAdvanced.aboutTab.update.protocol.button")
        ),
        createUpdateBannerIcon("external", 16)
      )
    );

    return react.createElement(
      "div",
      {
        className: "ivLyrics-update-banner",
        "data-ui-theme": getUpdateBannerTheme(),
        onClick: () => onDismissRef.current?.(),
      },
      react.createElement(
        "div",
        {
          className: "ivlyrics-update-dialog",
          ref: modalRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "ivlyrics-update-title",
          "aria-describedby": "ivlyrics-update-description",
          tabIndex: -1,
          onClick: (event) => event.stopPropagation(),
        },
        renderUpdateBannerHeader(),
        renderUpdateBannerBody(),
        renderUpdateBannerFooter()
      )
    );
  }

  const readUpdateInfo = () => getAppUpdateInfo(host);
  const useLayoutEffect = react.useLayoutEffect || react.useEffect;
  return function UpdateBanner() {
    const [updateInfo, setUpdateInfo] = react.useState(readUpdateInfo);
    useLayoutEffect(() => {
      const synchronize = () => setUpdateInfo(readUpdateInfo());
      const unsubscribe = subscribeAppUpdateInfo(host, synchronize);
      synchronize();
      return unsubscribe;
    }, []);

    if (!updateInfo?.available) return null;
    const dialog = react.createElement(UpdateDialog, {
      updateInfo,
      onDismiss: () => dismissUpdate(updateInfo.latestVersion),
    });
    const dom = ensureReactDOM();
    return dom?.createPortal ? dom.createPortal(dialog, document.body) : dialog;
  };
}
