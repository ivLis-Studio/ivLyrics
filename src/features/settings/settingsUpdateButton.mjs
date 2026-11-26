import { APP_UPDATE_PAGE_URL, getAppReleaseUrl } from "../updates/updateLinks.mjs";

const SIDE_BORDER = "1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08))";
const SURFACE = "var(--settings-surface-2, rgba(255, 255, 255, 0.03))";
const GOOD_ICON = "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z";
const ERROR_ICON = "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z";

function renderUpdateSummary(h, translate, update) {
  const failed = Boolean(update.error);
  const title = failed ? "notifications.updateCheckFailed" : "notifications.latestVersion";
  const detail = failed
    ? translate("notifications.checkNetworkConnection")
    : `${translate("update.versionChange")} ${update.currentVersion}`;
  return h("div", { style: {
    padding: "16px 20px", background: SURFACE, borderLeft: SIDE_BORDER, borderRight: SIDE_BORDER,
    borderTop: failed ? "1px solid rgba(255, 107, 107, 0.2)" : "1px solid rgba(255, 255, 255, 0.12)",
    borderBottom: SIDE_BORDER, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  } }, h("div", { style: {
    display: "flex", alignItems: "center", gap: 12, fontSize: 13,
    color: failed ? "var(--danger, rgba(255, 107, 107, 0.9))" : "var(--settings-text, rgba(248, 250, 252, 0.9))",
    fontWeight: failed ? 500 : undefined,
  } },
  h("svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true" },
    h("path", { fillRule: "evenodd", clipRule: "evenodd", d: failed ? ERROR_ICON : GOOD_ICON })),
  h("div", null,
    h("div", { style: { fontWeight: 600, marginBottom: 2 } }, translate(title)),
    h("div", { style: { opacity: 0.8, fontSize: 12 } }, detail))));
}

function renderAvailableUpdate(h, translate, { currentVersion, latestVersion }) {
  const linkStyle = {
    flex: 1, border: "1px solid var(--settings-line-2, rgba(255, 255, 255, 0.15))",
    color: "var(--settings-text, rgba(255, 255, 255, 0.9))", padding: "10px 16px", borderRadius: 8,
    fontSize: 13, fontWeight: 600, transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", letterSpacing: "-0.01em",
  };
  const externalLink = { target: "_blank", rel: "noopener noreferrer" };
  return h("div", { style: {
    padding: 20, background: "var(--settings-surface-2, rgba(255, 255, 255, 0.04))", border: "1px solid rgba(74, 222, 128, 0.15)",
    borderLeft: SIDE_BORDER, borderRight: SIDE_BORDER, borderBottom: "none", borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  } },
  h("div", { style: { marginBottom: 16 } },
    h("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
      h("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": "true" },
        h("circle", { cx: 12, cy: 12, r: 10 }), h("path", { d: "M12 6v6l4 2" })),
      h("div", null,
        h("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--settings-text, rgba(255, 255, 255, 0.95))", marginBottom: 2, letterSpacing: "-0.01em" } },
          translate("notifications.updateAvailable")),
        h("div", { style: { fontSize: 12, color: "var(--settings-text-3, rgba(255, 255, 255, 0.5))" } },
          `${translate("update.versionChange")} ${currentVersion} → ${latestVersion}`)))),
  h("div", { style: {
    background: "var(--settings-bg, rgba(0, 0, 0, 0.25))", border: SIDE_BORDER,
    borderRadius: 8, padding: "12px 14px", marginBottom: 12,
  } }, h("div", { style: { fontSize: 12, color: "var(--settings-text-3, rgba(255, 255, 255, 0.6))", marginBottom: 8, fontWeight: 500 } },
    translate("settingsAdvanced.aboutTab.update.protocol.info"))),
  h("div", { style: { display: "flex", gap: 8 } },
    h("a", { ...externalLink, href: APP_UPDATE_PAGE_URL, style: {
      ...linkStyle, background: "var(--settings-surface-3, rgba(255, 255, 255, 0.1))", cursor: "pointer",
    } }, translate("settingsAdvanced.aboutTab.update.protocol.button")),
    h("a", { ...externalLink, href: getAppReleaseUrl(latestVersion), style: {
      ...linkStyle, background: "var(--settings-surface-3, rgba(255, 255, 255, 0.08))", textDecoration: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
    } }, translate("update.releaseNotes"))));
}

export function createSettingsUpdateButton({ react, ConfigButton, translate, checkForUpdates }) {
  const useLayoutEffect = react.useLayoutEffect || react.useEffect;
  const listeners = new Set();
  let snapshot = { checking: false, result: null };

  function publish(checking, result) {
    snapshot = { checking, result };
    for (const listener of listeners) listener(snapshot);
  }

  async function check() {
    if (snapshot.checking) return;
    publish(true, null);
    try {
      publish(false, await checkForUpdates());
    } catch {
      publish(false, { error: true });
    }
  }

  return function SettingsUpdateButton({ text, disabled, ...props }) {
    const [state, setState] = react.useState(() => snapshot);
    useLayoutEffect(() => {
      listeners.add(setState);
      setState(snapshot);
      return () => listeners.delete(setState);
    }, []);

    const h = react.createElement;
    const { checking, result } = state;
    return h(react.Fragment, null,
      h(ConfigButton, {
        ...props, disabled: disabled || checking, onChange: check,
        text: checking ? translate("settingsAdvanced.aboutTab.update.checkUpdate.checking") : text,
        rowClassName: checking || result ? "has-update-result" : undefined,
      }),
      (checking || result) && h("div", {
        id: "update-result-container", style: { marginTop: -1 }, role: "status", "aria-busy": checking,
      }, result && (result.hasUpdate && !result.error
        ? renderAvailableUpdate(h, translate, result)
        : renderUpdateSummary(h, translate, result)))
    );
  };
}
