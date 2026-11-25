const SUCCESS_ICON = "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z";
const FAILURE_ICON = "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z";
const SIDE_BORDER = "1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08))";

function renderBackupResult(react, { id, title, detail, failed, flatBottom }) {
  const h = react.createElement;
  return h("div", { id, style: { marginTop: -1 }, role: "status" },
    h("div", {
      style: {
        padding: "16px 20px",
        background: "var(--settings-surface-2, rgba(255, 255, 255, 0.03))",
        borderTop: failed ? "1px solid rgba(255, 107, 107, 0.2)" : "1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12))",
        borderLeft: SIDE_BORDER,
        borderRight: SIDE_BORDER,
        borderBottom: SIDE_BORDER,
        borderBottomLeftRadius: flatBottom ? 0 : undefined,
        borderBottomRightRadius: flatBottom ? 0 : undefined,
      },
    }, h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: failed ? "var(--danger, rgba(255, 107, 107, 0.9))" : "var(--settings-text, rgba(248, 250, 252, 0.9))",
        fontSize: 13,
        fontWeight: failed ? 500 : undefined,
      },
    },
    h("svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": true },
      h("path", { fillRule: "evenodd", d: failed ? FAILURE_ICON : SUCCESS_ICON, clipRule: "evenodd" })
    ),
    h("div", null,
      h("div", { style: { fontWeight: 600, marginBottom: 2 }, "data-backup-title": "" }, title),
      h("div", { style: { opacity: 0.8, fontSize: 12 }, "data-backup-detail": "" }, detail)
    )))
  );
}

export function createSettingsBackupButton({ react, ConfigButton, actions }) {
  const useLayoutEffect = react.useLayoutEffect || react.useEffect;

  return function SettingsBackupButton({ settingKey, text, disabled, ...props }) {
    const [state, setState] = react.useState(actions.getSnapshot);
    useLayoutEffect(() => {
      const synchronize = () => setState(actions.getSnapshot());
      const unsubscribe = actions.subscribe(synchronize);
      synchronize();
      return unsubscribe;
    }, []);

    const result = state.results[settingKey];
    return react.createElement(react.Fragment, null,
      react.createElement(ConfigButton, {
        ...props, settingKey,
        text: state.active?.key === settingKey ? state.active.label : text,
        disabled: disabled || !!state.active || state.reloadQueued,
      }),
      result && renderBackupResult(react, result)
    );
  };
}
