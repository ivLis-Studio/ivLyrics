// Toolbar icons use one optical grid so every action stays distinct at compact sizes.
const IVLYRICS_TOOLBAR_ICON_PATHS = Object.freeze({
  menu: '<path d="M6 7h12M6 12h12M6 17h12"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  translation: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  provider: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  localLyrics: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h4"/><path d="M10 12v5m0-5 5-1v5"/><circle cx="8.5" cy="18" r="1.5"/><circle cx="13.5" cy="17" r="1.5"/>',
  background: '<path d="M3 15V7a3 3 0 0 1 3-3h11"/><rect x="5" y="5" width="16" height="14" rx="3"/><circle cx="16.5" cy="9" r="1.5"/><path d="m7 16 4-4 3 3 2-2 3 3"/>',
  regenerate: '<path d="M20 7A8 8 0 0 0 6.3 5.3L4 8"/><path d="M4 8V3m0 5h5"/><path d="M4 17a8 8 0 0 0 13.7 1.7L20 16"/><path d="M20 16v5m0-5h-5"/>',
  study: '<path d="M3 5a3 3 0 0 1 3-1h6v16H6a3 3 0 0 0-3 1V5Z"/><path d="M21 5a3 3 0 0 0-3-1h-6v16h6a3 3 0 0 1 3 1V5Z"/>',
  globalSync: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  communityVideo: '<path d="M5 3h16l-2 4H3l2-4Z"/><path d="m10 3-2 4m8-4-2 4"/><path d="M3 7h18v13H3Z"/><path d="m10 11 5 3-5 3Z"/>',
  shareImage: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5"/>',
  editLyrics: '<path d="M6 3h8l4 4v5"/><path d="M14 3v5h4"/><path d="M12 21H6V3"/><path d="m13.5 18.5 5-5 2 2-5 5-3 1 1-3Z"/>',
  marketplace: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14.5v6m-3-3h6"/>',
  settings: '<path d="M4 6h10m4 0h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2m4 0h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h8m4 0h4"/><circle cx="14" cy="18" r="2"/>',
  fullscreenEnter: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  fullscreenExit: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  fullscreenPage: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M7 8h10v6H7Z"/>',
  fullscreenScreen: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M8 11V8h3m5 3v3h-3"/>',
  karaoke: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8"/>',
  character: '<path d="m5 18 4.5-12h2L16 18M7 13h7"/><path d="M18 7h3M19.5 5.5v3"/>',
  word: '<path d="m3 18 4-12h2l4 12M5 13h6"/><path d="M16 8h5M16 12h5M16 16h5"/>',
  synced: '<path d="M4 6h10M4 11h9M4 16h7"/><path d="M18 6v7"/><circle cx="18" cy="15" r="2"/>',
  unsynced: '<path d="M4 6h14M4 11h16M4 16h12"/>',
  syncCreator: '<path d="M3 12h2l2-5 3 10 3-8 2 6"/><path d="m16 19 4-4 2 2-4 4-3 1 1-3Z"/>',
  // Lyrics-page toolbar: entries and panel controls drawn on the same grid.
  track: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  // Pronunciation-first: the two lyric rows trade places.
  pronunciationFirst: '<path d="M3 7h10M3 12h6M3 17h10"/><path d="M18 4v16"/><path d="m15 7 3-3 3 3"/><path d="m15 17 3 3 3-3"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 11.5h1v5h1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
});

export function createToolbarIcon(react) {
  return function IvLyricsToolbarIcon({ name, size = 18, className = "" }) {
    return react.createElement("svg", {
      className: `ivlyrics-toolbar-icon${className ? ` ${className}` : ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      focusable: "false",
      "aria-hidden": "true",
      "data-icon": name,
      dangerouslySetInnerHTML: {
        __html: IVLYRICS_TOOLBAR_ICON_PATHS[name] || IVLYRICS_TOOLBAR_ICON_PATHS.menu,
      },
    });
  };
}
