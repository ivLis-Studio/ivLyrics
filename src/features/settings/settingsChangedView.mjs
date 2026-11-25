import { getSettingDefaultValue, SETTINGS_BACKGROUND_MODE_KEY } from "./settingsDefaults.mjs";
import { createChangedSettingsTracker } from "./createChangedSettingsTracker.mjs";
import { resetSettingsControl } from "./settingsControlCommit.mjs";

export function useChangedSettingsCounts(react, { host, readSettingsRegistry, isSettingChanged, isChangedView }) {
  const [settingsRegistry, setSettingsRegistry] = react.useState(null);
  const [changedCounts, setChangedCounts] = react.useState(() => ({ total: 0, byTab: {}, keys: [] }));

  react.useEffect(() => {
    setSettingsRegistry(readSettingsRegistry());
  }, []);

  react.useEffect(() => {
    if (!settingsRegistry) return undefined;
    const tracker = createChangedSettingsTracker(settingsRegistry, isSettingChanged);
    let frameId = null;
    let refreshView = false;
    let disposed = false;
    const recount = () => {
      frameId = null;
      if (disposed) return;
      const forceRender = refreshView;
      refreshView = false;
      const next = tracker.readCounts();
      setChangedCounts((previous) => {
        const same = next.keys.length === previous.keys.length
          && next.keys.every((key, index) => key === previous.keys[index]);
        return same && !forceRender ? previous : { ...next };
      });
    };
    const schedule = (event) => {
      if (event.type === "ivLyrics:settings-refresh") {
        refreshView = true;
        tracker.invalidate(event.detail?.reset ? undefined : event.detail?.key);
      } else if (event.detail?.type === "config") {
        if (isChangedView) refreshView = true;
        tracker.invalidate(event.detail.name);
      } else return;
      if (frameId == null) frameId = host.requestAnimationFrame(recount);
    };
    host.addEventListener("ivLyrics", schedule);
    host.addEventListener("ivLyrics:settings-refresh", schedule);
    recount();
    return () => {
      disposed = true;
      host.removeEventListener("ivLyrics", schedule);
      host.removeEventListener("ivLyrics:settings-refresh", schedule);
      if (frameId != null) host.cancelAnimationFrame(frameId);
    };
  }, [settingsRegistry, isChangedView]);

  return { settingsRegistry, changedCounts };
}

export function createChangedSettingsView(react, {
  sidebarTabs, readSettingsRegistry, buildSettingsRegistry, navigateToDestination,
  confirmReset, publishReset, onSaveError,
  isSettingChanged, getSettingsText, getCurrentSettingsBackgroundMode,
  SettingsUiIcon, SettingsOutlineIcon, OptionList,
}) {
  const resetChangedEntries = (entries) => {
    let saved = false;
    let errorReported = false;
    const reportError = error => {
      if (errorReported) return;
      errorReported = true;
      onSaveError?.(error);
    };
    for (const entry of entries) {
      if (resetSettingsControl(entry.item, entry.onChange, getSettingDefaultValue, reportError)) saved = true;
    }
    if (saved) publishReset();
  };

  const renderChangedView = () => {
    const changedTabIds = new Set();
    for (const entry of readSettingsRegistry()) {
      if (isSettingChanged(entry.key)) changedTabIds.add(entry.tabId);
    }
    // The saved declarations cover every tab; read live values and handlers
    // only from the tabs with rows to display.
    const changedTabs = sidebarTabs.filter(tab => changedTabIds.has(tab.id));
    const changedEntries = buildSettingsRegistry(changedTabs).filter((entry) => isSettingChanged(entry.key));
    if (!changedEntries.length) {
      return react.createElement(
        "div",
        { className: "tab-content active settings-changed-view", "data-tab-id": "changed" },
        react.createElement(
          "div",
          { className: "settings-empty-state" },
          react.createElement("span", { className: "settings-empty-icon", "aria-hidden": "true" }, react.createElement(SettingsUiIcon, { name: "check", size: 22 })),
          react.createElement("b", null, getSettingsText("settingsUi.changed.emptyTitle", "No changed settings")),
          react.createElement("span", null, getSettingsText("settingsUi.changed.emptyDesc", "Every setting is at its default."))
        )
      );
    }
    const entriesByTab = new Map();
    for (const entry of changedEntries) {
      const group = entriesByTab.get(entry.tabId);
      if (group) group.push(entry);
      else entriesByTab.set(entry.tabId, [entry]);
    }
    const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");
    return react.createElement(
      "div",
      { className: "tab-content active settings-changed-view", "data-tab-id": "changed" },
      react.createElement(
        "div",
        { className: "settings-changed-tools" },
        react.createElement(
          "span",
          { className: "settings-pill is-accent" },
          getSettingsText("settingsUi.changed.count", "{count}").replace("{count}", String(changedEntries.length))
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn btn-sm",
            onClick: () => {
              const message = getSettingsText("settingsUi.changed.resetConfirm", "Reset {count} settings to their defaults?")
                .replace("{count}", String(changedEntries.length));
              if (!confirmReset(message)) return;
              resetChangedEntries(changedEntries);
            },
          },
          react.createElement(SettingsUiIcon, { name: "reset", size: 15 }),
          react.createElement("span", null, resetLabel)
        )
      ),
      ...sidebarTabs.map((tab) => {
        const entries = entriesByTab.get(tab.id);
        if (!entries?.length) return null;
        return react.createElement(
          "section",
          { key: tab.id, className: "settings-changed-menu" },
          react.createElement(
            "h3",
            { className: "settings-changed-menu-title" },
            react.createElement(SettingsOutlineIcon, { name: tab.icon, size: 15 }),
            tab.label
          ),
          react.createElement(OptionList, {
            items: entries.map((entry) => ({
              ...entry.item,
              defaultValue: entry.key === SETTINGS_BACKGROUND_MODE_KEY
                ? getCurrentSettingsBackgroundMode()
                : entry.item.defaultValue,
              when: undefined,
              onChange: (_name, value, event) => entry.onChange(entry.key, value, event),
              jump: {
                label: entry.sectionTitle || tab.label,
                onClick: () => navigateToDestination(entry.tabId, entry.key),
              },
            })),
          })
        );
      })
    );
  };

  return { resetChangedEntries, renderChangedView };
}
