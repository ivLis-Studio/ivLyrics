function normalizeEditorLines(text, count) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length < count) {
    lines.push("");
  }
  return lines.slice(0, count);
}

// Wide (CJK, Hangul) characters take about two columns of "ch".
function unitInputWidth(value) {
  let columns = 0;
  for (const character of String(value ?? "")) {
    columns += /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u.test(character) ? 2 : 1;
  }
  return `${Math.max(3, Math.min(24, columns + 1.5))}ch`;
}

export function createLyricsCacheEditModal({ react, translate, readPronunciationSlots, readTheme }) {
  return function LyricsCacheEditModal({
    isOpen,
    isLoading,
    isSaving,
    originalLines,
    pronunciationText,
    pronunciationSlots,
    translationText,
    expectedLineCount,
    hasPronunciationCache,
    hasTranslationCache,
    trackTitle,
    trackArtist,
    provider,
    error,
    onClose,
    onSave,
    onPronunciationChange,
    onTranslationChange,
  }) {
    if (!isOpen) {
      return null;
    }

    const sanitizedOriginalLines = Array.isArray(originalLines)
      ? Array.from({ length: expectedLineCount }, (_, index) =>
        String(originalLines[index] ?? "")
      )
      : normalizeEditorLines("", expectedLineCount);
    const pronunciationLines = normalizeEditorLines(
      pronunciationText,
      expectedLineCount
    );
    const translationLines = normalizeEditorLines(
      translationText,
      expectedLineCount
    );

    const updateLine = (lines, index, nextValue, onChange) => {
      const nextLines = [...lines];
      nextLines[index] = String(nextValue ?? "").replace(/\r\n?/g, " ");
      onChange(nextLines.join("\n"));
    };

    const shiftLinesDownFrom = (lines, index, onChange, slotsAfterShift) => {
      const nextLines = Array.from({ length: expectedLineCount }, (_, lineIndex) =>
        String(lines[lineIndex] ?? "")
      );
      for (let lineIndex = expectedLineCount - 1; lineIndex > index; lineIndex--) {
        nextLines[lineIndex] = nextLines[lineIndex - 1] ?? "";
      }
      nextLines[index] = "";
      onChange(nextLines.join("\n"), slotsAfterShift);
    };

    // Unit pronunciation of karaoke lines: one cell per sung unit of the
    // original. The line pronunciation is always the joined cells; shifted or
    // released lines continue as plain line text.
    const slotsApi = readPronunciationSlots();
    const slotEntries = Array.from({ length: expectedLineCount }, (_, index) => {
      const entry = Array.isArray(pronunciationSlots) ? pronunciationSlots[index] : null;
      return entry && Array.isArray(entry.units) && Array.isArray(entry.parts) ? entry : null;
    });
    const slotLineCount = slotEntries.filter(Boolean).length;
    const withSlot = (index, entry) => {
      const nextSlots = [...slotEntries];
      nextSlots[index] = entry;
      return nextSlots;
    };
    const updateUnit = (index, unitIndex, value) => {
      const entry = slotEntries[index];
      if (!entry || !slotsApi) return;
      const parts = [...entry.parts];
      parts[unitIndex] = String(value ?? "").replace(/[\r\n]+/g, " ");
      const nextEntry = { ...entry, parts };
      const nextLines = [...pronunciationLines];
      nextLines[index] = slotsApi.join(entry.units, parts);
      onPronunciationChange(nextLines.join("\n"), withSlot(index, nextEntry));
    };
    const releaseUnits = (index) => {
      onPronunciationChange(pronunciationLines.join("\n"), withSlot(index, null));
    };
    const slotsWithoutLinesFrom = (index) =>
      slotEntries.map((entry, lineIndex) => (lineIndex >= index ? null : entry));
    // The pronunciation and translation columns render the identical editable
    // field (header label + shift-down button + textarea); only the label,
    // backing line array, change handler, spellCheck flag and placeholder differ.
    const renderCacheEditField = (index, { label, lines, onChange, spellCheck, placeholder, slotsAfterShift }) =>
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-field" },
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-field-header" },
          react.createElement("span", null, label),
          react.createElement(
            "button",
            {
              type: "button",
              className: "ivlyrics-cache-edit-shift-button",
              onClick: () => shiftLinesDownFrom(lines, index, onChange, slotsAfterShift),
              disabled: isSaving || index >= expectedLineCount - 1,
              title: translate("lyricsCacheEditor.shiftDown"),
              "aria-label": translate("lyricsCacheEditor.shiftDown"),
            },
            "↓"
          )
        ),
        react.createElement("textarea", {
          className: "ivlyrics-cache-edit-line-input",
          rows: 2,
          value: lines[index] ?? "",
          disabled: isSaving,
          onChange: (event) =>
            updateLine(lines, index, event.target.value, onChange),
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          },
          spellCheck,
          placeholder,
        })
      );

    const renderUnitPronunciationField = (index, entry) =>
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-field ivlyrics-cache-edit-field--units" },
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-field-header" },
          react.createElement(
            "span",
            { className: "ivlyrics-cache-edit-field-title" },
            translate("menu.pronunciation"),
            react.createElement(
              "span",
              { className: "ivlyrics-cache-edit-badge" },
              translate("lyricsCacheEditor.byUnit")
            )
          ),
          react.createElement(
            "div",
            { className: "ivlyrics-cache-edit-field-actions" },
            react.createElement(
              "button",
              {
                type: "button",
                className: "ivlyrics-cache-edit-text-button",
                onClick: () => releaseUnits(index),
                disabled: isSaving,
                title: translate("lyricsCacheEditor.editAsLineHint"),
              },
              translate("lyricsCacheEditor.editAsLine")
            ),
            react.createElement(
              "button",
              {
                type: "button",
                className: "ivlyrics-cache-edit-shift-button",
                onClick: () => shiftLinesDownFrom(pronunciationLines, index, onPronunciationChange, slotsWithoutLinesFrom(index)),
                disabled: isSaving || index >= expectedLineCount - 1,
                title: translate("lyricsCacheEditor.shiftDown"),
                "aria-label": translate("lyricsCacheEditor.shiftDown"),
              },
              "↓"
            )
          )
        ),
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-units" },
          ...entry.units.map((unit, unitIndex) =>
            react.createElement(
              "label",
              {
                key: `unit-${index}-${unitIndex}`,
                className: `ivlyrics-cache-edit-unit${unit.gapBefore ? " has-gap" : ""}`,
              },
              react.createElement(
                "span",
                { className: "ivlyrics-cache-edit-unit-source" },
                unit.text
              ),
              react.createElement("input", {
                type: "text",
                className: "ivlyrics-cache-edit-unit-input",
                value: entry.parts[unitIndex] ?? "",
                style: { width: unitInputWidth(entry.parts[unitIndex] || unit.text) },
                onChange: (event) => updateUnit(index, unitIndex, event.target.value),
                disabled: isSaving,
                spellCheck: false,
                "aria-label": `${translate("menu.pronunciation")} ${unit.text}`,
              })
            )
          )
        ),
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-unit-preview" },
          react.createElement(
            "span",
            { className: "ivlyrics-cache-edit-unit-preview-label" },
            translate("lyricsCacheEditor.joined")
          ),
          react.createElement(
            "span",
            { className: "ivlyrics-cache-edit-unit-preview-text" },
            pronunciationLines[index] || " "
          )
        )
      );

    const handleOverlayClick = (event) => {
      if (event.target === event.currentTarget && !isSaving) {
        onClose();
      }
    };

    const renderCacheEditHeader = () =>
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-header" },
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-header-copy" },
          react.createElement(
            "h2",
            { className: "ivlyrics-cache-edit-title" },
            translate("lyricsCacheEditor.title")
          ),
          react.createElement(
            "p",
            { className: "ivlyrics-cache-edit-subtitle" },
            `${trackTitle || translate("lyricsCacheEditor.unknownTrack")}${trackArtist ? ` · ${trackArtist}` : ""}`
          ),
          react.createElement(
            "p",
            { className: "ivlyrics-cache-edit-meta" },
            `${translate("lyricsCacheEditor.lineCount")}: ${expectedLineCount}${provider ? ` · ${provider}` : ""}`
          )
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-close",
            onClick: onClose,
            disabled: isSaving,
            "aria-label": translate("lyricsCacheEditor.close"),
          },
          "×"
        )
      );

    const renderCacheEditBody = () =>
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-body" },
        isLoading
          ? react.createElement(
            "div",
            { className: "ivlyrics-cache-edit-loading" },
            translate("lyricsCacheEditor.loading")
          )
          : react.createElement(
            "div",
            { className: "ivlyrics-cache-edit-content" },
            react.createElement(
              "div",
              { className: "ivlyrics-cache-edit-status" },
              react.createElement(
                "div",
                { className: "ivlyrics-cache-edit-status-item" },
                react.createElement(
                  "span",
                  null,
                  translate("menu.pronunciation")
                ),
                react.createElement(
                  "span",
                  { className: "ivlyrics-cache-edit-badge" },
                  hasPronunciationCache
                    ? (slotLineCount > 0
                      ? translate("lyricsCacheEditor.cachedByUnit", { count: slotLineCount })
                      : translate("lyricsCacheEditor.cached"))
                    : translate("lyricsCacheEditor.empty")
                )
              ),
              react.createElement(
                "div",
                { className: "ivlyrics-cache-edit-status-item" },
                react.createElement(
                  "span",
                  null,
                  translate("menu.translationLabel")
                ),
                react.createElement(
                  "span",
                  { className: "ivlyrics-cache-edit-badge" },
                  hasTranslationCache
                    ? translate("lyricsCacheEditor.cached")
                    : translate("lyricsCacheEditor.empty")
                )
              )
            ),
            react.createElement(
              "div",
              { className: "ivlyrics-cache-edit-list" },
              ...sanitizedOriginalLines.map((originalLine, index) =>
                react.createElement(
                  "div",
                  {
                    key: `cache-edit-line-${index}`,
                    className: "ivlyrics-cache-edit-item",
                  },
                  react.createElement(
                    "div",
                    { className: "ivlyrics-cache-edit-item-index" },
                    index + 1
                  ),
                  react.createElement(
                    "div",
                    { className: "ivlyrics-cache-edit-item-fields" },
                    react.createElement(
                      "div",
                      { className: "ivlyrics-cache-edit-field ivlyrics-cache-edit-field--original" },
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-field-header" },
                        react.createElement(
                          "span",
                          null,
                          translate("lyricsCacheEditor.original")
                        ),
                        react.createElement(
                          "span",
                          { className: "ivlyrics-cache-edit-badge" },
                          translate("lyricsCacheEditor.reference")
                        )
                      ),
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-original-line" },
                        originalLine || " "
                      )
                    ),
                    react.createElement(
                      "div",
                      { className: "ivlyrics-cache-edit-item-pair" },
                      slotEntries[index]
                        ? renderUnitPronunciationField(index, slotEntries[index])
                        : renderCacheEditField(index, {
                          label: translate("menu.pronunciation"),
                          lines: pronunciationLines,
                          onChange: onPronunciationChange,
                          spellCheck: false,
                          placeholder: translate(
                            "lyricsCacheEditor.pronunciationPlaceholder"
                          ),
                          slotsAfterShift: slotsWithoutLinesFrom(index),
                        }),
                      renderCacheEditField(index, {
                        label: translate("menu.translationLabel"),
                        lines: translationLines,
                        onChange: onTranslationChange,
                        spellCheck: true,
                        placeholder: translate(
                          "lyricsCacheEditor.translationPlaceholder"
                        ),
                      })
                    )
                  )
                )
              )
            )
          ),
        error &&
        react.createElement(
          "p",
          { className: "ivlyrics-cache-edit-error" },
          error
        )
      );

    const renderCacheEditFooter = () =>
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-footer" },
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-button secondary",
            onClick: onClose,
            disabled: isSaving,
          },
          translate("lyricsCacheEditor.cancel")
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-button primary",
            onClick: onSave,
            disabled: isLoading || isSaving,
          },
          isSaving
            ? translate("lyricsCacheEditor.saving")
            : translate("lyricsCacheEditor.save")
        )
      );

    return react.createElement(
      "div",
      {
        className: "ivlyrics-cache-edit-overlay",
        // Opened from the toolbar's conversion panel: same theme as its panels.
        "data-ui-theme": readTheme(),
        onClick: handleOverlayClick,
      },
      react.createElement(
        "div",
        {
          className: "ivlyrics-cache-edit-modal",
          role: "dialog",
          "aria-modal": true,
          "aria-label": translate("lyricsCacheEditor.title"),
        },
        renderCacheEditHeader(),
        renderCacheEditBody(),
        renderCacheEditFooter()
      )
    );
  }
}
