export function readSettingNumber(visual, key, fallback) {
  const stored = visual?.[key];
  const value = Number(stored);
  return Number.isFinite(value) && stored !== "" ? value : fallback;
}

export function readSettingFlag(visual, key, fallback) {
  const value = visual?.[key];
  return value === undefined || value === null ? fallback : value !== false && value !== "false";
}
