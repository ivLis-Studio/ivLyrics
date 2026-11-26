export function createSettingsEventChannel(host, createEvent) {
  const publishSettingsEvent = (type, detail) => host.dispatchEvent(createEvent(type, detail));
  const publishSettingsConfigChange = (name, value) => {
    const dispatched = publishSettingsEvent("ivLyrics", { type: "config", name, value });
    const enabled = value === true || value === "true";
    if (name === "video-helper-enabled") publishSettingsEvent("ivLyrics:videoHelperChanged", { enabled });
    if (name === "lyrics-helper-enabled") publishSettingsEvent("ivLyrics:lyricsHelperChanged", { enabled });
    return dispatched;
  };
  const publishSettingsRefresh = (key) => publishSettingsEvent("ivLyrics:settings-refresh", { key });
  const subscribeSettingsConfig = (listener) => {
    host.addEventListener("ivLyrics", listener);
    return () => host.removeEventListener("ivLyrics", listener);
  };
  return { publishSettingsEvent, publishSettingsConfigChange, publishSettingsRefresh, subscribeSettingsConfig };
}

export function createVisualSettingsActions({ getVisualSettings, persistConfig, persistConfigBatch, updateLyrics, publishConfigChange }) {
  function saveVisualSetting(name, value, persist = persistConfig) {
    const visual = getVisualSettings();
    const existed = Object.hasOwn(visual, name);
    const previous = visual[name];
    visual[name] = value;
    try {
      persist(name, value);
    } catch (error) {
      if (Object.is(visual[name], value)) {
        if (existed) visual[name] = previous;
        else delete visual[name];
      }
      throw error;
    }
  }

  function saveVisualSettings(values, persist = persistConfigBatch) {
    persist(values);
    Object.assign(getVisualSettings(), values);
  }

  function refreshAndPublishSetting(name, value) {
    updateLyrics();
    publishConfigChange(name, value);
  }

  function handleVisualConfigChange(name, value) {
    saveVisualSetting(name, value);
    refreshAndPublishSetting(name, value);
  }

  return { saveVisualSetting, saveVisualSettings, refreshAndPublishSetting, handleVisualConfigChange };
}
