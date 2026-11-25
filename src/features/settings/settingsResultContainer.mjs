// Reuse only the result immediately after this setting row, preserving its position.
export function getSettingsResultContainer(button, id, rowClass, document = globalThis.document) {
  const settingRow = button.closest(".setting-row");
  let resultContainer = settingRow?.nextElementSibling;
  if (!resultContainer || !resultContainer.id || resultContainer.id !== id) {
    resultContainer = document.createElement("div");
    resultContainer.id = id;
    resultContainer.style.cssText = "margin-top: -1px;";
    settingRow?.parentNode?.insertBefore(resultContainer, settingRow.nextSibling);
    if (rowClass) settingRow?.classList.add(rowClass);
  }
  return resultContainer;
}
