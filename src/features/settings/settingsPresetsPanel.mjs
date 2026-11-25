export function createSettingsPresetsPanel({
  react, store, translate, confirm, notifyError, notifySuccess, reloadSettings, formatSettingsPresetDate,
}) {
  const { useState, useCallback } = react;
  const {
    createSettingsPresetId,
    loadSettingsPresets,
    saveSettingsPresets,
    captureSettingsPresetValues,
    applySettingsPresetValues,
  } = store;

  const getSettingsPresetText = (key, fallback) =>
    translate(`settingsAdvanced.settingsPresets.${key}`) || fallback;

  const formatSettingsPresetText = (key, fallback, replacements = {}) => {
    let text = getSettingsPresetText(key, fallback);
    Object.entries(replacements).forEach(([name, value]) => {
      text = text.split(`{${name}}`).join(String(value));
    });
    return text;
  };

  return function ConfigSettingsPresets() {
    const [presets, setPresets] = useState(loadSettingsPresets);
    const [presetName, setPresetName] = useState("");

    const persistPresets = useCallback((nextPresets) => {
      setPresets(saveSettingsPresets(nextPresets));
    }, []);

    const handleSave = useCallback(() => {
      const name = presetName.trim();
      if (!name) {
        notifyError(getSettingsPresetText("nameRequired", "Enter a preset name."));
        return;
      }

      const existingPreset = presets.find(
        (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      );

      if (
        existingPreset &&
        !confirm(formatSettingsPresetText(
          "confirmOverwrite",
          "A preset named \"{name}\" already exists. Overwrite it?",
          { name }
        ))
      ) {
        return;
      }

      const now = new Date().toISOString();
      const settings = captureSettingsPresetValues();
      const nextPreset = {
        id: existingPreset?.id || createSettingsPresetId(),
        name,
        createdAt: existingPreset?.createdAt || now,
        updatedAt: now,
        settings,
      };

      const nextPresets = existingPreset
        ? presets.map((preset) => preset.id === existingPreset.id ? nextPreset : preset)
        : [nextPreset, ...presets];

      try {
        persistPresets(nextPresets);
        setPresetName("");
        notifySuccess(formatSettingsPresetText(
          "saved",
          "Preset \"{name}\" saved.",
          { name }
        ));
      } catch (error) {
        console.error("[ivLyrics] Failed to save settings preset:", error);
        notifyError(getSettingsPresetText("saveFailed", "Failed to save preset."));
      }
    }, [presetName, presets, persistPresets]);

    const handleApply = useCallback((preset) => {
      if (!preset) return;
      if (
        !confirm(formatSettingsPresetText(
          "confirmApply",
          "Apply preset \"{name}\" and reload the page?",
          { name: preset.name }
        ))
      ) {
        return;
      }

      try {
        applySettingsPresetValues(preset.settings);
        notifySuccess(formatSettingsPresetText(
          "applied",
          "Preset \"{name}\" applied.",
          { name: preset.name }
        ));
        reloadSettings({
          reopenSettings: true,
          initialTab: "advanced",
          initialSettingKey: "settings-presets",
          delay: 700,
        });
      } catch (error) {
        console.error("[ivLyrics] Failed to apply settings preset:", error);
        notifyError(getSettingsPresetText("applyFailed", "Failed to apply preset."));
      }
    }, []);

    const handleDelete = useCallback((preset) => {
      if (!preset) return;
      if (
        !confirm(formatSettingsPresetText(
          "confirmDelete",
          "Delete preset \"{name}\"?",
          { name: preset.name }
        ))
      ) {
        return;
      }

      try {
        persistPresets(presets.filter((item) => item.id !== preset.id));
        notifySuccess(formatSettingsPresetText(
          "deleted",
          "Preset \"{name}\" deleted.",
          { name: preset.name }
        ));
      } catch (error) {
        console.error("[ivLyrics] Failed to delete settings preset:", error);
        notifyError(getSettingsPresetText("deleteFailed", "Failed to delete preset."));
      }
    }, [presets, persistPresets]);

    const renderPresetRow = (preset) =>
                react.createElement(
                  "div",
                  {
                    key: preset.id,
                    style: {
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "12px",
                      alignItems: "center",
                      padding: "12px",
                      border: "1px solid var(--settings-line-2)",
                      background: "var(--settings-surface-2)",
                      borderRadius: "8px",
                    },
                  },
                  react.createElement(
                    "div",
                    { style: { minWidth: 0 } },
                    react.createElement(
                      "div",
                      {
                        className: "setting-name",
                        style: {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                        title: preset.name,
                      },
                      preset.name
                    ),
                    react.createElement(
                      "div",
                      { className: "setting-description" },
                      `${formatSettingsPresetText(
                        "settingsCount",
                        "{count} settings",
                        { count: Object.keys(preset.settings || {}).length }
                      )} · ${formatSettingsPresetText(
                        "updatedAt",
                        "Updated {date}",
                        { date: formatSettingsPresetDate(preset.updatedAt) }
                      )}`
                    )
                  ),
                  react.createElement(
                    "div",
                    {
                      style: {
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      },
                    },
                    react.createElement(
                      "button",
                      {
                        className: "btn",
                        type: "button",
                        onClick: () => handleApply(preset),
                      },
                      getSettingsPresetText("apply", "Apply")
                    ),
                    react.createElement(
                      "button",
                      {
                        className: "btn",
                        type: "button",
                        onClick: () => handleDelete(preset),
                        style: {
                          background: "rgba(239, 68, 68, 0.14)",
                          borderColor: "rgba(239, 68, 68, 0.28)",
                          color: "#fca5a5",
                        },
                      },
                      getSettingsPresetText("delete", "Delete")
                    )
                  )
                );

    const renderPresetsSaveBlock = () =>
  react.createElement(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "10px",
            },
          },
          react.createElement("input", {
            className: "config-text-input",
            type: "text",
            value: presetName,
            placeholder: getSettingsPresetText("namePlaceholder", "My preset"),
            onChange: (event) => setPresetName(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                handleSave();
              }
            },
          }),
          react.createElement(
            "button",
            {
              className: "btn",
              type: "button",
              onClick: handleSave,
            },
            getSettingsPresetText("saveCurrent", "Save current")
          )
        );
    const renderPresetsSavedListBlock = () =>
  react.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            },
          },
          react.createElement(
            "div",
            {
              className: "setting-name",
              style: { fontSize: "13px" },
            },
            getSettingsPresetText("savedPresets", "Saved presets")
          ),
          presets.length === 0
            ? react.createElement(
                "div",
                {
                  className: "setting-description",
                  style: {
                    padding: "12px 0",
                  },
                },
                getSettingsPresetText("empty", "No presets saved yet.")
              )
            : presets.map((preset) => renderPresetRow(preset))
        );
    return react.createElement(
      "div",
      {
        className: "setting-row",
      },
      react.createElement(
        "div",
        {
          className: "setting-row-content",
          style: {
            flexDirection: "column",
            alignItems: "stretch",
            gap: "14px",
          },
        },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement(
            "div",
            { className: "setting-name" },
            getSettingsPresetText("nameLabel", "Preset name")
          ),
          react.createElement(
            "div",
            { className: "setting-description" },
            getSettingsPresetText(
              "excludedSecrets",
              "Current visual and behavior settings are saved. API keys are excluded."
            )
          )
        ),
        renderPresetsSaveBlock(),
        renderPresetsSavedListBlock()
      )
    );
  }
}
