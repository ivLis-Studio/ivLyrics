// The preview opens by default only where it shows what is being edited.
const SETTINGS_PREVIEW_MENUS = new Set(["appearance", "fullscreen", "nowplaying"]);
const SETTINGS_DOCK_STORAGE_KEY = "ivLyrics:settings-dock";

const readSettingsDockPreferences = (getStorage) => {
  try {
    const parsed = JSON.parse(getStorage().getItem(SETTINGS_DOCK_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeSettingsDockPreferences = (getStorage, preferences) => {
  try {
    getStorage().setItem(SETTINGS_DOCK_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage may be unavailable; the choice then lasts for this window only.
  }
};

export function useSettingsDockPreferences(react, { activeTab, changedView, getStorage }) {
  const [dockPreferences, setDockPreferences] = react.useState(() => readSettingsDockPreferences(getStorage));
  const dockOpen = !changedView && (
    dockPreferences[activeTab] ?? SETTINGS_PREVIEW_MENUS.has(activeTab)
  );
  const toggleDock = () => {
    setDockPreferences((previous) => {
      const next = { ...previous, [activeTab]: !dockOpen };
      writeSettingsDockPreferences(getStorage, next);
      return next;
    });
  };

  return { dockOpen, toggleDock };
}
