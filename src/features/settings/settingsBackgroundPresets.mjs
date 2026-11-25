export const SETTINGS_BACKGROUND_PRESETS = [
  {
    id: "none",
    labelKey: "settingsUi.background.none",
    fallbackLabel: "Minimal",
    descriptionKey: "settingsUi.background.noneDesc",
    fallbackDescription: "Keep Spotify's base surface and apply only the core lyric layout.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 10h10M7 14h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "colorful",
    labelKey: "settings.colorful.label",
    fallbackLabel: "Colorful",
    descriptionKey: "settings.colorful.desc",
    fallbackDescription: "Use the vivid ivLyrics color treatment.",
    icon:
      '<circle cx="8" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 11l3-1.5M10.5 13l3 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "gradient-background",
    labelKey: "settings.gradientBackground.label",
    fallbackLabel: "Album Gradient",
    descriptionKey: "settings.gradientBackground.desc",
    fallbackDescription: "Build a soft gradient from the current album art.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 17c2.2-4.5 5-6.8 8.2-6.8 2.1 0 4.2 1 5.8 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "blur-gradient-background",
    labelKey: "settings.blurGradientBackground.label",
    fallbackLabel: "Blur Gradient",
    descriptionKey: "settings.blurGradientBackground.desc",
    fallbackDescription: "Use a deeper, more atmospheric blur with gradient color.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 12h.01M18 12h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
  {
    id: "solid-background",
    labelKey: "settings.solidBackground.label",
    fallbackLabel: "Solid Color",
    descriptionKey: "settings.solidBackground.desc",
    fallbackDescription: "Use one fixed color with predictable contrast.",
    icon:
      '<rect x="4" y="6" width="16" height="12" rx="3" fill="currentColor"/><path d="M7 10h10" stroke="rgba(255,255,255,0.75)" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "video-background",
    labelKey: "settings.videoBackground.label",
    fallbackLabel: "Community Video",
    descriptionKey: "settings.videoBackground.desc",
    fallbackDescription: "Play synchronized YouTube video backgrounds behind lyrics.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/>',
  },
];

export function getSettingsBackgroundPresetLabel(modeId, getText) {
  const preset = SETTINGS_BACKGROUND_PRESETS.find(item => item.id === modeId);
  return preset ? getText(preset.labelKey, preset.fallbackLabel) : modeId;
}
