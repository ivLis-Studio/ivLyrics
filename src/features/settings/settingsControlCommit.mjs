export function commitSettingsControlValue(save, onSaveError, ...values) {
  try {
    return save(...values) !== false;
  } catch (error) {
    console.error("[ivLyrics] Could not save the setting:", error);
    onSaveError?.(error);
    return false;
  }
}

export function isSettingsControlDisabled(disabled) {
  return Boolean(typeof disabled === "function" ? disabled() : disabled);
}

export function resetSettingsControl(item, save, getDefaultValue, onSaveError) {
  return commitSettingsControlValue(
    () => {
      if (item.noReset || isSettingsControlDisabled(item.disabled) || typeof save !== "function") return false;
      return save(item.key, getDefaultValue(item.key));
    },
    onSaveError
  );
}
