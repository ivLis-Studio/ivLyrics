import { createSettingsCloudSyncActions } from "./settingsCloudSyncActions.mjs";

export function createSettingsCloudSyncPanel({
  react, translate, account, confirm, notifyError, exportConfig, importConfig,
  reloadSettings, formatSettingsPresetDate, listenForAccountChange, isClosing = () => false,
}) {
  const { useState } = react;
  const useLayoutEffect = react.useLayoutEffect || react.useEffect;

  const getCloudSyncText = (key, fallback) =>
    translate(`settingsAdvanced.cloudSync.${key}`) || fallback;

  const formatCloudSyncText = (key, fallback, replacements = {}) => {
    let value = getCloudSyncText(key, fallback);
    Object.entries(replacements).forEach(([name, replacement]) => {
      value = value.split(`{${name}}`).join(String(replacement));
    });
    return value;
  };

  return function ConfigCloudSync() {
    const [actions] = useState(() => createSettingsCloudSyncActions({
      text: getCloudSyncText, format: formatCloudSyncText, account, confirm, notifyError,
      exportConfig, importConfig, reloadSettings, listenForAccountChange, isClosing,
    }));
    const [{ cloud, busyAction, message, messageType }, setState] = useState(actions.getSnapshot);
    useLayoutEffect(() => {
      const synchronize = () => setState(actions.getSnapshot());
      const disconnect = actions.connect(synchronize);
      synchronize();
      return disconnect;
    }, [actions]);
    const { upload, download, refresh, remove } = actions;

    const updatedLabel = cloud.updatedAt
      ? formatCloudSyncText("updatedAt", "Updated {date}", {
        date: formatSettingsPresetDate(Number(cloud.updatedAt) * 1000),
      })
      : getCloudSyncText("notSaved", "Not saved yet");
    const disabled = Boolean(busyAction) || cloud.loading;
    const deleteDisabled = disabled || !account.getAuthToken();

    return react.createElement(
      "div",
      {
        className: "setting-row",
        "data-setting-key": "cloud-sync",
      },
      react.createElement(
        "div",
        {
          className: "setting-row-content",
          style: { flexDirection: "column", alignItems: "stretch", gap: "14px" },
        },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" }, getCloudSyncText("platform", "PC settings")),
          react.createElement(
            "div",
            { className: "setting-description" },
            `${updatedLabel}${cloud.exists ? ` · rev ${cloud.revision}` : ""}`
          )
        ),
        react.createElement(
          "div",
          {
            role: messageType === "warning" || messageType === "error" ? "alert" : "status",
            "aria-live": messageType === "warning" || messageType === "error" ? "assertive" : "polite",
            className: `setting-description settings-status-box is-${messageType || "info"}`,
          },
          messageType === "warning" || messageType === "error"
            ? react.createElement(
              react.Fragment,
              null,
              react.createElement("span", { "aria-hidden": "true", style: { marginRight: "7px" } }, "⚠"),
              cloud.loading ? getCloudSyncText("checking", "Checking cloud settings…") : message
            )
            : cloud.loading ? getCloudSyncText("checking", "Checking cloud settings…") : message
        ),
        react.createElement(
          "div",
          { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          react.createElement("button", { className: "btn", type: "button", disabled, onClick: upload },
            busyAction === "upload" ? getCloudSyncText("uploading", "Uploading…") : getCloudSyncText("upload", "Upload current settings")),
          react.createElement("button", { className: "btn", type: "button", disabled: disabled || !cloud.exists, onClick: download },
            busyAction === "download" ? getCloudSyncText("downloading", "Applying…") : getCloudSyncText("download", "Apply cloud settings")),
          react.createElement("button", { className: "btn", type: "button", disabled, onClick: refresh },
            getCloudSyncText("refresh", "Refresh")),
          react.createElement("button", {
            className: "btn",
            type: "button",
            disabled: deleteDisabled,
            onClick: remove,
            style: { background: "rgba(239,68,68,.14)", borderColor: "rgba(239,68,68,.28)", color: "#fca5a5" },
          }, busyAction === "delete" ? getCloudSyncText("deleting", "Deleting…") : getCloudSyncText("delete", "Delete cloud data"))
        ),
        react.createElement("div", { className: "setting-description" },
          getCloudSyncText("excluded", "API keys, account tokens, caches, presets, and per-track offsets stay on this device."))
      )
    );
  };
}
