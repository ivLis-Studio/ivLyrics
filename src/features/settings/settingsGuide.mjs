/**
 * ivLyrics settings guide
 * =======================
 *
 * The one place that explains every setting in the ivLyrics Settings window:
 * which menu and section it lives in, what it changes, which values it
 * accepts and what the settings assistant may do with it.
 *
 * Who reads this file
 *   - Settings search (settingsSearchCatalog.mjs) turns the menus, sections
 *     and settings below into search results. Labels come from the i18n keys,
 *     so a setting can be found in any interface language and from any menu.
 *   - The AI settings assistant (the "AI Assistant" menu):
 *       settingsAssistantCatalog.mjs  describes these entries to the user's AI
 *                                     provider, checks proposed values and
 *                                     saves them through the registry rows
 *       settingsAssistantPrompt.mjs   rules and reply format for the AI
 *       settingsAssistantSession.mjs  conversation, request, apply and undo
 *       settingsAssistantPanel.mjs    chat UI; shows the menus' own rows
 *     `role`, `visibleWhen` and the limits below are what the AI reads, so
 *     keep them accurate: a wrong range or option makes the assistant wrong.
 *   - tests/settings_guide.test.mjs renders every settings menu and compares it
 *     with this file. It fails when a row is missing here, an entry no longer
 *     exists in the menus, or a range, option list, default or i18n key differs.
 *
 * Languages
 *   Visible names and descriptions are not copied here. `label`, `info`,
 *   `column`, `title` and `subtitle` hold the i18n keys that the settings window
 *   already uses, so every language file in src/i18n/langs provides them. `role`
 *   is an English explanation written for maintainers and for the AI; the
 *   assistant answers in the user's interface language.
 *
 * Maintenance checklist (people and AI agents)
 *   Adding a setting row
 *     1. Declare the row where the menu is built, as usual: an OptionList item,
 *        a SettingsLayerMatrix column, a SettingsTiles chip, or an element prop
 *        `settingsRegistryItems: [{ item, onChange }]` for custom pickers. Those
 *        declarations feed the settings registry, the changed-settings view,
 *        search and the assistant chat. The chat renders the same row through
 *        OptionList and saves through the same onChange, so never build a
 *        separate control or save path for the assistant.
 *     2. Add an entry to SETTINGS_GUIDE_SETTINGS under the same menu/section
 *        comment block, copying `key`, `tab`, `section`, `control`, the i18n
 *        keys, `min`/`max`/`step`, `options` and `default` from the row.
 *     3. Write `role` in plain English: what changes on screen, what each value
 *        or option means, and which settings it depends on or affects.
 *     4. Run `node --test tests/settings_guide.test.mjs`. A failure names the
 *        key and the field to fix.
 *   Removing a setting row: delete its entry here (the test reports leftovers).
 *   Renaming, moving or changing a range, option or default: update the entry.
 *   New section (SettingsSection or renderSettingsSectionShell): add it to
 *     SETTINGS_GUIDE_SECTIONS with its i18n title (and `view` when it sits
 *     in one of the fullscreen views). New menu: add it to SETTINGS_GUIDE_MENUS
 *     and to the sidebar in settingsMenuMetadata.mjs.
 *   Controls drawn by a custom panel (provider tables, overlay, cloud sync,
 *     presets, account, ...) are not in the registry. Describe them with
 *     control "panel" and assistant "show", and give the row a
 *     data-setting-key so the assistant's "Open in settings" can scroll to it.
 *
 * Section fields
 *   tab, key     Menu id and sectionKey (also the section's search anchor).
 *   title        i18n key of the heading; subtitle: i18n key of the line below.
 *   view         Fullscreen view that shows the section (basic, normal, tv, cd,
 *                vinyl); labels in SETTINGS_GUIDE_VIEW_LABELS.
 *   searchKeys   Extra i18n keys that also find the section, for example the
 *                title it had before it moved (optional).
 *   role         English explanation (required).
 *
 * Setting fields
 *   key          CONFIG.visual key; also the row's data-setting-key anchor.
 *   tab          Menu id from the sidebar (settingsMenuMetadata.mjs).
 *   section      sectionKey of the SettingsSection that contains the row.
 *   control      How the value is edited:
 *                  toggle       true / false
 *                  range        number from min to max in step increments
 *                  font-weight  100-900 in steps of 100
 *                  select       one of `options` ("languages": filled at runtime
 *                               from the available languages)
 *                  color        "#rrggbb"
 *                  font         font family name, or comma-separated fallbacks
 *                  hotkey       recorded keyboard shortcut
 *                  curve        karaoke fill curve editor (JSON points)
 *                  helper       toggle that needs the ivLyrics Helper program
 *                  action       button that runs an action (export, reset, ...)
 *                  panel        control inside a custom panel (see above)
 *   assistant    "show": the assistant only displays or points to the row.
 *                Omitted: the assistant may change the value itself.
 *   label        i18n key(s) of the visible name. Several keys are shown
 *                joined with " · " (for example a matrix column and the row).
 *   column       i18n key of the layer-matrix column for table cells.
 *   info         i18n key(s) of the visible description.
 *   min/max/step/unit  Limits of range controls (unit is informational).
 *   options      Allowed values of select controls, as stored.
 *   default      Default value (compared as text with settingsDefaults.mjs).
 *   visibleWhen  When the row is shown; names every key it depends on.
 *   aliases      Extra search words in any language (optional).
 *   searchable   false when the row sets `searchable: false` (a shortcut that
 *                repeats a setting owned by another menu); search skips it.
 *   role         English explanation (required).
 */

export const SETTINGS_GUIDE_VERSION = 1;

// Fullscreen view switch labels (settingsMenuMetadata.mjs fullscreenViews).
export const SETTINGS_GUIDE_VIEW_LABELS = Object.freeze({
  basic: "settingsUi.fullscreenViews.basic",
  normal: "settingsUi.fullscreenViews.normal",
  tv: "settingsUi.fullscreenViews.tv",
  cd: "vinyl.cd.mode",
  vinyl: "vinyl.mode",
});

// Menus in sidebar order. Labels: SETTINGS_TAB_TRANSLATION_KEYS.
export const SETTINGS_GUIDE_MENUS = Object.freeze([
  { id: "assistant", role: "This AI settings assistant. Describe what you want to change and it finds, explains and applies the matching settings." },
  { id: "general", role: "Interface language, the language lyrics are translated into, and the ivLyrics desktop overlay app." },
  { id: "lyrics-providers", role: "Which lyrics sources are used, their order, the lyric types each one may supply and the lookup priority." },
  { id: "ai-providers", role: "AI providers per task (translation, pronunciation, metadata, research, cultural notes, motion lyrics, this assistant), their API keys and models, translation style, retries and cultural context explanations." },
  { id: "appearance", role: "Look of the lyrics page: background mode, lyric fonts and layers, sync display, multi-vocal speaker colours, instrumental markers and text shadow." },
  { id: "performance", role: "Frame rate, animations, GPU-heavy visual effects and background preloading for the next song." },
  { id: "lyrics", role: "Playback bar buttons, quick sync controls, karaoke mode and pronunciation timing, Sync Creator shortcuts, cache management and Helper integration." },
  { id: "fullscreen", role: "ivLyrics fullscreen: defaults and shortcuts, title display, layout and sizes, clock/queue/next track, song controls, auto-hide, Trivia style, normal and TV layouts, CD, LP, Video Stage and motion lyrics." },
  { id: "nowplaying", role: "Lyrics in Spotify's right-side Now Playing panel: fonts, background and border." },
  { id: "advanced", role: "Language detection thresholds, settings presets, cloud sync, export/import of settings and the database, and full reset." },
  { id: "debug", role: "Diagnostic information to copy into bug reports." },
  { id: "about", role: "Discord account linking, updates, app and client information, and patch notes." },
]);

// Sections are the headed blocks inside a menu; key is their sectionKey.
export const SETTINGS_GUIDE_SECTIONS = Object.freeze([
  // general
  {
    tab: "general", key: "language", title: "sections.language", subtitle: "settings.language.desc",
    role: "Interface language and the target language for lyric translations.",
  },
  {
    tab: "general", key: "overlay-enabled", title: "sections.desktopOverlay", subtitle: "sections.desktopOverlaySubtitle",
    role: "Desktop overlay panel: turns on sending lyrics to the separate ivLyrics Overlay desktop app (lyrics float over other windows), shows the connection status, the local port it uses and a download link.",
  },
  // lyrics-providers
  {
    tab: "lyrics-providers", key: "lyrics-lookup", title: "settingsUi.sections.lyricsLookup.title", subtitle: "settingsUi.sections.lyricsLookup.subtitle",
    role: "Lookup order rules: prefer the provider that community sync data was made for, and/or prefer lyric type (karaoke > synced > plain) over provider order. The chain below shows the resulting order.",
  },
  {
    tab: "lyrics-providers", key: "lyrics-provider-list", title: "settings.lyricsProviders.title", subtitle: "settings.lyricsProviders.description",
    role: "Table of lyrics providers: drag to reorder (top is tried first), enable/disable each one, choose which lyric types (character, word, synced, unsynced) it may supply and open its own options.",
  },
  // ai-providers
  {
    tab: "ai-providers", key: "ai-tasks", title: "settingsUi.sections.aiTasks.title", subtitle: "settings.aiProviders.description",
    role: "Table of AI providers by task: drag to reorder (top is tried first, failures fall back to the next), enable providers and choose which tasks each one handles. Three providers need no API key and are on by default: Google Translate and Bing Translate (translation only) and Pronunciation Lab (pronunciation only, rule- and dictionary-based rather than AI; it cannot write Chinese, Cyrillic, Devanagari or Thai pronunciation and has no synced pronunciation).",
  },
  {
    tab: "ai-providers", key: "ai-translation", title: "settings.aiProviders.translationStyle.title", subtitle: "settings.aiProviders.translationStyle.description",
    role: "Translation style for AI lyric translations: natural, literal or adaptive. Line structure and meaning are kept in every style.",
  },
  {
    tab: "ai-providers", key: "cultural-annotations", title: "settings.culturalAnnotations.label", subtitle: "settings.culturalAnnotations.desc",
    role: "AI explanations of cultural references under lyric lines, and their typography on the lyrics page and in LP mode.",
  },
  {
    tab: "ai-providers", key: "ai-request", title: "settingsUi.sections.aiRequest.title",
    role: "How many times a failed AI request is retried before the next provider is used.",
  },
  {
    tab: "ai-providers", key: "ai-connections", title: "settingsUi.sections.aiConnections.title", subtitle: "settingsUi.sections.aiConnections.subtitle",
    role: "Connection settings each AI provider needs: API keys, base URLs and models, with connection tests.",
  },
  // appearance
  {
    tab: "appearance", key: "background-experience", title: "sections.visualEffects", subtitle: "sections.visualEffectsSubtitle",
    role: "Background mode, background blur/brightness, video background options, lyric alignment, side margin, backdrop blur and noise.",
  },
  {
    tab: "appearance", key: "lyric-layers", title: "settingsUi.sections.lyricLayers.title", subtitle: "settingsUi.sections.lyricLayers.subtitle",
    role: "Typography of each lyric layer on the lyrics page: original, pronunciation, translation and furigana (font, size, weight, opacity, spacing, outline).",
  },
  {
    tab: "appearance", key: "text-shadow", title: "settingsAdvanced.textShadow.title", subtitle: "settingsAdvanced.textShadow.subtitle",
    role: "Colour, opacity and blur of the lyric text shadow (enabled by Shadow Effect in Performance).",
  },
  {
    tab: "appearance", key: "sync-mode", title: "settingsAdvanced.syncMode.title", subtitle: "settingsAdvanced.syncMode.subtitle",
    role: "Compact synced view line counts, the position of the current line and highlight intensity.",
  },
  {
    tab: "appearance", key: "multi-vocal-colors", title: "settingsAdvanced.multiVocalColors.title", subtitle: "settingsAdvanced.multiVocalColors.subtitle",
    role: "Speaker colours for multi-vocal karaoke (male, female and duet singers) and whether creator custom colours are used.",
  },
  {
    tab: "appearance", key: "instrumental-break", title: "settingsAdvanced.instrumentalBreak.title", subtitle: "settingsAdvanced.instrumentalBreak.subtitle",
    role: "Instrumental marker shown in long lyric gaps: detection, icon, text label and animation speed.",
  },
  // performance
  {
    tab: "performance", key: "performance-rendering", title: "settingsAdvanced.performance.rendering.title", subtitle: "settingsAdvanced.performance.rendering.subtitle",
    role: "Lyric frame rate and animation effects that affect CPU/GPU load.",
  },
  {
    tab: "performance", key: "performance-visual-cost", title: "settingsAdvanced.performance.visualCost.title", subtitle: "settingsAdvanced.performance.visualCost.subtitle",
    role: "Visual effects that cost GPU: fade blur, highlight mode, text shadow and video background.",
  },
  {
    tab: "performance", key: "performance-background-work", title: "settingsAdvanced.performance.backgroundWork.title", subtitle: "settingsAdvanced.performance.backgroundWork.subtitle",
    searchKeys: ["settingsAdvanced.prefetch.title", "settingsAdvanced.prefetch.subtitle"],
    role: "Preloading of translation, pronunciation, video and word details for the next song.",
  },
  // lyrics
  {
    tab: "lyrics", key: "playback", title: "settingsAdvanced.playback.title", subtitle: "settingsAdvanced.playback.subtitle",
    role: "Playback bar button replacement, quick sync controls and click-to-seek compensation.",
  },
  {
    tab: "lyrics", key: "karaoke-mode", title: "settingsAdvanced.karaokeMode.title", subtitle: "settingsAdvanced.karaokeMode.subtitle",
    role: "Karaoke view behaviour, motion style, synced pronunciation and pseudo karaoke.",
  },
  {
    tab: "lyrics", key: "sync-creator-settings", title: "settings.syncCreatorSettings.title", subtitle: "settings.syncCreatorSettings.subtitle",
    role: "Sync Creator keyboard behaviour, karaoke fill correction curve and recording shortcuts.",
  },
  {
    tab: "lyrics", key: "cache-management", title: "settingsAdvanced.cacheManagement.title", subtitle: "settingsAdvanced.cacheManagement.subtitle",
    role: "Panel showing stored lyrics/translation cache sizes with buttons to clear caches or delete local lyrics.",
  },
  {
    tab: "lyrics", key: "lyrics-helper", title: "settings.lyricsHelper.sectionTitle", subtitle: "settings.lyricsHelper.sectionSubtitle",
    role: "Sends lyrics to the ivLyrics Helper app for external programs.",
  },
  // fullscreen
  {
    tab: "fullscreen", key: "fullscreen-mode", view: "basic", title: "settingsAdvanced.fullscreenMode.title", subtitle: "settingsAdvanced.fullscreenMode.subtitle",
    role: "Fullscreen shortcut, browser fullscreen, in-page fullscreen, extra button, overlay hiding and TV mode.",
  },
  {
    tab: "fullscreen", key: "metadata-display", view: "basic", title: "settingsAdvanced.metadataDisplay.title", subtitle: "settingsAdvanced.metadataDisplay.subtitle",
    role: "Title trimming and translation of titles/artists in fullscreen.",
  },
  {
    tab: "fullscreen", key: "fullscreen-style", view: "basic", title: "settingsAdvanced.fullscreenStyle.title", subtitle: "settingsAdvanced.fullscreenStyle.subtitle",
    role: "Album art size/radius, gaps and title/artist font sizes in fullscreen.",
  },
  {
    tab: "fullscreen", key: "fullscreen-ui", view: "basic", title: "settingsAdvanced.fullscreenUI.title", subtitle: "settingsAdvanced.fullscreenUI.subtitle",
    role: "Optional fullscreen elements: clock, playback context, next-track preview, lyrics progress and queue panel.",
  },
  {
    tab: "fullscreen", key: "controller-style", view: "basic", title: "settingsAdvanced.controllerStyle.title", subtitle: "settingsAdvanced.controllerStyle.subtitle",
    role: "The fullscreen song controller (controls): which buttons and bars are shown, button size and background.",
  },
  {
    tab: "fullscreen", key: "auto-hide", view: "basic", title: "settingsAdvanced.autoHide.title", subtitle: "settingsAdvanced.autoHide.subtitle",
    role: "Automatically hides the fullscreen controller and info when the mouse is idle.",
  },
  {
    tab: "fullscreen", key: "tmi-style", view: "basic", title: "settingsAdvanced.tmiStyle.title", subtitle: "settingsAdvanced.tmiStyle.subtitle",
    role: "Text size and outline of the Trivia (song research) window.",
  },
  {
    tab: "fullscreen", key: "normal-mode", view: "normal", title: "settingsAdvanced.normalMode.title", subtitle: "settingsAdvanced.normalMode.subtitle",
    role: "Layout of normal (non-TV) fullscreen: two columns, side swap, album art, track info, album name and centring.",
  },
  {
    tab: "fullscreen", key: "tv-mode", view: "tv", title: "settingsAdvanced.tvMode.title", subtitle: "settingsAdvanced.tvMode.subtitle",
    role: "Options for TV mode: album size, album name, controls and progress bar.",
  },
  {
    tab: "fullscreen", key: "cd-mode", view: "cd", title: "vinyl.cd.mode", subtitle: "vinyl.cd.subtitle",
    role: "CD focus mode: disc size and rotation.",
  },
  {
    tab: "fullscreen", key: "cd-visualizer", view: "cd", title: "vinyl.cd.visualizerTitle", subtitle: "vinyl.cd.visualizerDesc",
    role: "Visualizer around the CD: shape, mirroring, colours, sensitivity, density and thickness.",
  },
  {
    tab: "fullscreen", key: "vinyl-mode", view: "vinyl", title: "vinyl.mode", subtitle: "vinyl.settings.subtitle",
    role: "Focused lyric layouts opened from the album art (LP, CD, Video Stage, motion lyrics), LP size and animation, and motion lyrics options.",
  },
  {
    tab: "fullscreen", key: "vinyl-tonearm", view: "vinyl", title: "vinyl.settings.tonearmTitle", subtitle: "vinyl.settings.tonearmSubtitle",
    role: "Tonearm design, finish and size in LP mode.",
  },
  {
    tab: "fullscreen", key: "vinyl-typography", view: "vinyl", title: "sections.typography", subtitle: "vinyl.settings.typographySubtitle",
    role: "Fonts and sizes of the original, pronunciation and translation shown below the LP.",
  },
  {
    tab: "fullscreen", key: "video-stage-typography", view: "vinyl", title: "vinyl.settings.videoStageTypographyTitle", subtitle: "vinyl.settings.videoStageTypographySubtitle",
    role: "Fonts and the text background for lyrics in Video Stage.",
  },
  // nowplaying
  {
    tab: "nowplaying", key: "panel-lyrics-general", title: "settingsAdvanced.nowPlayingPanel.title", subtitle: "settingsAdvanced.nowPlayingPanel.subtitle",
    role: "Panel lyrics on/off, default font, scale and per-layer fonts, sizes and outlines.",
  },
  {
    tab: "nowplaying", key: "panel-background", title: "settingsAdvanced.nowPlayingPanel.background.title", subtitle: "settingsAdvanced.nowPlayingPanel.background.subtitle",
    role: "Background of the panel lyrics card.",
  },
  {
    tab: "nowplaying", key: "panel-border", title: "settingsAdvanced.nowPlayingPanel.border.title", subtitle: "settingsAdvanced.nowPlayingPanel.border.subtitle",
    role: "Border of the panel lyrics card.",
  },
  // advanced
  {
    tab: "advanced", key: "language-detection", title: "settingsAdvanced.languageDetection.title", subtitle: "settingsAdvanced.languageDetection.subtitle",
    role: "Thresholds used to detect Japanese and Simplified/Traditional Chinese lyrics.",
  },
  {
    tab: "advanced", key: "settings-presets", title: "settingsAdvanced.settingsPresets.title", subtitle: "settingsAdvanced.settingsPresets.subtitle",
    role: "Panel to save the current settings as a preset and apply saved presets in one step.",
  },
  {
    tab: "advanced", key: "cloud-sync", title: "settingsAdvanced.cloudSync.title", subtitle: "settingsAdvanced.cloudSync.monthlyRequired",
    role: "Panel to sync settings through the ivLyrics cloud (Monthly Supporters).",
  },
  {
    tab: "advanced", key: "export-import", title: "settingsAdvanced.exportImport.title", subtitle: "settingsAdvanced.exportImport.subtitle",
    role: "Buttons to export settings to a file or import them.",
  },
  {
    tab: "advanced", key: "db-export-import", title: "settingsAdvanced.dbExportImport.title", subtitle: "settingsAdvanced.dbExportImport.subtitle",
    role: "Buttons to export or import the database (translations, lyrics cache and other data).",
  },
  {
    tab: "advanced", key: "reset-settings", title: "settingsAdvanced.resetSettings.title", subtitle: "settingsAdvanced.resetSettings.subtitle",
    role: "Button that restores every setting to its default.",
  },
  // debug
  {
    tab: "debug", key: "debug-overview", title: "settingsAdvanced.debugTab.title", subtitle: "settingsAdvanced.debugTab.subtitle",
    role: "Track, lyrics and runtime details to copy into a bug report.",
  },
  // about
  {
    tab: "about", key: "about-account", title: "settingsAdvanced.aboutTab.account.title", subtitle: "settingsAdvanced.aboutTab.account.subtitle",
    role: "Links or unlinks a Discord account used for community sync data and the creator profile.",
  },
  {
    tab: "about", key: "about-update", title: "settingsAdvanced.aboutTab.update.title", subtitle: "settingsAdvanced.aboutTab.update.subtitle",
    role: "Update check and updater.",
  },
  {
    tab: "about", key: "about-app-info", title: "settingsAdvanced.aboutTab.appInfo.title", subtitle: "settingsAdvanced.aboutTab.subtitle",
    role: "ivLyrics version and links.",
  },
  {
    tab: "about", key: "about-client-info", title: "settingsAdvanced.aboutTab.clientInfo.title", subtitle: "settingsAdvanced.aboutTab.clientInfo.subtitle",
    role: "Anonymous client ID of this installation.",
  },
  {
    tab: "about", key: "about-patch-notes", title: "settingsAdvanced.aboutTab.patchNotes.title", subtitle: "settingsAdvanced.aboutTab.patchNotes.subtitle",
    role: "Recent release notes.",
  },
]);

// Every setting row, grouped by menu and section in display order.
export const SETTINGS_GUIDE_SETTINGS = Object.freeze([
  // ─── general › language ────────────────────────────────────────────────
  {
    key: "language", tab: "general", section: "language", control: "select", assistant: "show",
    label: "settings.language.label", info: "settings.language.desc",
    options: "languages",
    role: "Interface language of ivLyrics: menus, buttons, messages and this assistant's default reply language. Changing it reloads the ivLyrics page so every label updates. Options are the languages listed in the menu.",
  },
  {
    key: "translate:target-language", tab: "general", section: "language", control: "select",
    label: "settings.translationTargetLanguage.label", info: "settings.translationTargetLanguage.desc",
    options: "languages", default: "auto",
    aliases: ["번역 언어", "translation language"],
    role: "Language that lyric translations are produced in. \"auto\" (Same) follows the interface language; otherwise pick a language code. Translations already cached in another language are requested again when needed.",
  },
  // ─── general › overlay-enabled ─────────────────────────────────────────
  {
    key: "overlay-trim-metadata", tab: "general", section: "overlay-enabled", control: "panel", assistant: "show",
    label: "overlay.trimMetadata.label", info: "overlay.trimMetadata.desc",
    role: "Desktop overlay only: removes extra text such as (Remaster) or feat. from titles sent to the overlay app.",
  },
  // ─── lyrics-providers › lyrics-lookup ──────────────────────────────────
  {
    key: "prefer-sync-data-provider", tab: "lyrics-providers", section: "lyrics-lookup", control: "panel", assistant: "show",
    label: "settings.lyricsProviders.preferSyncDataProvider.label", info: "settings.lyricsProviders.preferSyncDataProvider.desc",
    default: true,
    role: "When community sync data exists for the song, tries the lyrics provider that sync data was made for before the normal provider order.",
  },
  {
    key: "prefer-lyrics-type-over-provider-order", tab: "lyrics-providers", section: "lyrics-lookup", control: "panel", assistant: "show",
    label: "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label", info: "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc",
    default: true,
    role: "Looks for lyrics by type across all providers: karaoke first, then synced, then plain lyrics. Provider order still decides within each type.",
  },
  // ─── ai-providers › cultural-annotations ───────────────────────────────
  {
    key: "cultural-annotations-enabled", tab: "ai-providers", section: "cultural-annotations", control: "toggle",
    label: "settings.culturalAnnotations.label",
    default: false,
    role: "Shows short AI-generated explanations under lyric lines whose cultural background (idioms, references, slang) would be lost in translation. Uses the AI providers enabled for Cultural context.",
  },
  {
    key: "cultural-annotations-font-family", tab: "ai-providers", section: "cultural-annotations", control: "font",
    label: "settings.culturalAnnotations.fontFamily.label", column: "settingsUi.fullscreenViews.normal", info: "settings.culturalAnnotations.fontFamily.desc",
    default: "Pretendard Variable",
    role: "Font of the cultural context explanations on the lyrics page. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-font-size", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: "settings.culturalAnnotations.fontSize.label", column: "settingsUi.fullscreenViews.normal", info: "settings.culturalAnnotations.fontSize.desc",
    min: 12, max: 48, step: 1, unit: "px", default: 14,
    role: "Text size of the cultural context explanations on the lyrics page. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-font-weight", tab: "ai-providers", section: "cultural-annotations", control: "font-weight",
    label: "settings.culturalAnnotations.fontWeight.label", column: "settingsUi.fullscreenViews.normal", info: "settings.culturalAnnotations.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 300,
    role: "Font weight of the cultural context explanations on the lyrics page: 100 (thin) to 900 (black). Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-opacity", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: "settings.culturalAnnotations.opacity.label", column: "settingsUi.fullscreenViews.normal", info: "settings.culturalAnnotations.opacity.desc",
    min: 20, max: 100, step: 1, unit: "%", default: 60,
    role: "Opacity of the cultural context explanations on the lyrics page (0% invisible, 100% fully opaque). Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-outline-width", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "settingsUi.fullscreenViews.normal", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the cultural context explanations on the lyrics page; 0 turns the outline off. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-outline-color", tab: "ai-providers", section: "cultural-annotations", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "settingsUi.fullscreenViews.normal", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the cultural context explanations on the lyrics page (#rrggbb); visible when the matching outline thickness is above 0. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-font-family", tab: "ai-providers", section: "cultural-annotations", control: "font",
    label: ["vinyl.mode", "settings.culturalAnnotations.fontFamily.label"], column: "vinyl.mode", info: ["vinyl.mode", "settings.culturalAnnotations.fontFamily.desc"],
    default: "Pretendard Variable",
    role: "Font of the cultural context explanations in LP mode. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-font-size", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: ["vinyl.mode", "settings.culturalAnnotations.fontSize.label"], column: "vinyl.mode", info: ["vinyl.mode", "settings.culturalAnnotations.fontSize.desc"],
    min: 10, max: 32, step: 1, unit: "px", default: 12,
    role: "Text size of the cultural context explanations in LP mode. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-font-weight", tab: "ai-providers", section: "cultural-annotations", control: "font-weight",
    label: ["vinyl.mode", "settings.culturalAnnotations.fontWeight.label"], column: "vinyl.mode", info: ["vinyl.mode", "settings.culturalAnnotations.fontWeight.desc"],
    min: 100, max: 900, step: 100, default: 300,
    role: "Font weight of the cultural context explanations in LP mode: 100 (thin) to 900 (black). Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-opacity", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: ["vinyl.mode", "settings.culturalAnnotations.opacity.label"], column: "vinyl.mode", info: ["vinyl.mode", "settings.culturalAnnotations.opacity.desc"],
    min: 20, max: 100, step: 1, unit: "%", default: 60,
    role: "Opacity of the cultural context explanations in LP mode (0% invisible, 100% fully opaque). Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-outline-width", tab: "ai-providers", section: "cultural-annotations", control: "range",
    label: ["vinyl.mode", "settingsAdvanced.textOutline.width.label"], column: "vinyl.mode", info: ["vinyl.mode", "settingsAdvanced.textOutline.width.desc"],
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the cultural context explanations in LP mode; 0 turns the outline off. Used while cultural-annotations-enabled is on.",
  },
  {
    key: "cultural-annotations-vinyl-outline-color", tab: "ai-providers", section: "cultural-annotations", control: "color",
    label: ["vinyl.mode", "settingsAdvanced.textOutline.color.label"], column: "vinyl.mode", info: ["vinyl.mode", "settingsAdvanced.textOutline.color.desc"],
    default: "#000000",
    role: "Colour of the outline around the cultural context explanations in LP mode (#rrggbb); visible when the matching outline thickness is above 0. Used while cultural-annotations-enabled is on.",
  },
  // ─── ai-providers › ai-request ─────────────────────────────────────────
  {
    key: "ai-provider-retry-count", tab: "ai-providers", section: "ai-request", control: "panel", assistant: "show",
    label: "settings.aiProviders.retryCount.label", info: "settings.aiProviders.retryCount.description",
    default: 2,
    role: "Extra attempts after a failed AI request before moving to the next provider (0-5). 0 switches immediately.",
  },
  // ─── appearance › background-experience ────────────────────────────────
  {
    key: "__background-mode", tab: "appearance", section: "background-experience", control: "select",
    label: "sections.visualEffects",
    options: ["none", "colorful", "gradient-background", "blur-gradient-background", "solid-background", "video-background"], default: "gradient-background",
    aliases: ["background", "배경", "wallpaper"],
    role: "Background behind the lyrics page and standard fullscreen. none = minimal dark background; colorful = animated colours taken from the album art; gradient-background = blurred album cover; blur-gradient-background = soft blurred colour gradient; solid-background = one solid colour (Solid Background Color); video-background = a YouTube video matched to the song (needs video data, uses more GPU and can preload the next song's video).",
  },
  {
    key: "album-bg-blur", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.albumBgBlur.label", info: "settings.albumBgBlur.desc",
    min: 0, max: 100, step: 5, unit: "px", default: 20,
    role: "Blur strength of the album-cover based backgrounds (Album Cover Background mode). Higher values make the artwork softer behind the lyrics.",
  },
  {
    key: "background-brightness", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.backgroundBrightness.label", info: "settings.backgroundBrightness.desc",
    min: 0, max: 100, step: 1, unit: "%", default: 30,
    role: "Brightness of the background layer behind the lyrics. Lower values darken any background mode so lyrics are easier to read; 100% shows it at full brightness.",
  },
  {
    key: "solid-background-color", tab: "appearance", section: "background-experience", control: "color",
    label: "settings.solidBackgroundColor.label", info: "settings.solidBackgroundColor.desc",
    default: "#1e3a8a",
    role: "Colour used by the Solid Background mode. Pick a preset swatch or a custom #rrggbb colour.",
  },
  {
    key: "video-fallback-background", tab: "appearance", section: "background-experience", control: "select",
    label: "settings.videoFallback.label", info: "settings.videoFallback.desc",
    options: ["album-cover", "blur-gradient", "solid"], default: "album-cover",
    role: "Background shown in Video Background mode when the song has no matched video or YouTube cannot play it: album-cover = blurred album art, blur-gradient = blurred colour gradient, solid = the solid background colour.",
  },
  {
    key: "video-helper-enabled", tab: "appearance", section: "background-experience", control: "helper", assistant: "show",
    label: "settings.videoHelper.label", info: "settings.videoHelper.desc",
    default: false,
    role: "Plays video backgrounds through the ivLyrics Helper desktop program, which downloads YouTube videos locally so they play without a YouTube login. Requires installing the Helper; the toggle shows a download link when it is missing.",
  },
  {
    key: "video-blur", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.videoBlur.label", info: "settings.videoBlur.desc",
    min: 0, max: 40, step: 1, unit: "px", default: 5,
    role: "Blur applied to the video background. 0 shows the video sharp.",
  },
  {
    key: "video-cover", tab: "appearance", section: "background-experience", control: "toggle",
    label: "settings.videoCover.label", info: "settings.videoCover.desc",
    default: false,
    role: "Zooms the video background so it fills the whole screen, cropping the top/bottom or sides instead of showing empty bars.",
  },
  {
    key: "video-scale", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.videoScale.label", info: "settings.videoScale.desc",
    min: 50, max: 200, step: 1, unit: "%", default: 105,
    role: "Zoom level of the video background. 100% shows the video at its fitted size; larger values crop the edges.",
  },
  {
    key: "alignment", tab: "appearance", section: "background-experience", control: "select",
    label: "settings.alignment.label", info: "settings.alignment.desc",
    options: ["left", "center", "right"], default: "center",
    role: "Horizontal alignment of lyric lines on the lyrics page and in standard fullscreen: left, center or right.",
  },
  {
    key: "lyrics-side-margin", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.sideMargin.label", info: "settings.sideMargin.desc",
    min: 0, max: 30, step: 1, unit: "%", default: 0,
    role: "Empty space added on both sides of the lyrics to pull them inward. With left alignment the lyrics sit near the middle like Spotify's fullscreen view. 0% turns it off.",
  },
  {
    key: "lyrics-backdrop-blur", tab: "appearance", section: "background-experience", control: "range",
    label: "settings.lyricsBackdropBlur.label", info: "settings.lyricsBackdropBlur.desc",
    min: 0, max: 40, step: 1, unit: "px", default: 0,
    role: "Blurs only the area behind the lyrics (not the whole background) so lyrics stay readable over busy backgrounds such as videos. The blurred area follows the alignment. 0 px turns it off.",
  },
  {
    key: "noise", tab: "appearance", section: "background-experience", control: "toggle",
    label: "settings.noise.label", info: "settings.noise.desc",
    default: true,
    role: "Adds a subtle film-grain noise texture on top of the background.",
  },
  // ─── appearance › lyric-layers ─────────────────────────────────────────
  {
    key: "original-font-family", tab: "appearance", section: "lyric-layers", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the original lyric line on the lyrics page and in standard fullscreen. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "original-font-size", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontSize.desc",
    min: 12, max: 128, step: 2, unit: "px", default: 44,
    role: "Text size of the original lyric line on the lyrics page and in standard fullscreen.",
  },
  {
    key: "original-font-weight", tab: "appearance", section: "lyric-layers", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 600,
    role: "Font weight of the original lyric line on the lyrics page and in standard fullscreen: 100 (thin) to 900 (black).",
  },
  {
    key: "original-opacity", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 95,
    role: "Opacity of the original lyric line on the lyrics page and in standard fullscreen (0% invisible, 100% fully opaque).",
  },
  {
    key: "original-letter-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.letterSpacing.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the original lyric line on the lyrics page and in standard fullscreen; negative values tighten it.",
  },
  {
    key: "original-outline-width", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the original lyric line on the lyrics page and in standard fullscreen; 0 turns the outline off.",
  },
  {
    key: "original-outline-color", tab: "appearance", section: "lyric-layers", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the original lyric line on the lyrics page and in standard fullscreen (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "phonetic-font-family", tab: "appearance", section: "lyric-layers", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the pronunciation (romanization) line on the lyrics page and in standard fullscreen. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "phonetic-font-size", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontSize.desc",
    min: 10, max: 96, step: 2, unit: "px", default: 16,
    role: "Text size of the pronunciation (romanization) line on the lyrics page and in standard fullscreen.",
  },
  {
    key: "phonetic-font-weight", tab: "appearance", section: "lyric-layers", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 100,
    role: "Font weight of the pronunciation (romanization) line on the lyrics page and in standard fullscreen: 100 (thin) to 900 (black).",
  },
  {
    key: "phonetic-opacity", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 70,
    role: "Opacity of the pronunciation (romanization) line on the lyrics page and in standard fullscreen (0% invisible, 100% fully opaque).",
  },
  {
    key: "phonetic-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.pronunciationStyle.gap.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.gap.desc",
    min: -30, max: 20, step: 1, unit: "px", default: -1,
    role: "Vertical gap between the original line and the pronunciation line below it. Negative values pull the pronunciation closer to (or over) the original.",
  },
  {
    key: "phonetic-letter-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.pronunciationStyle.letterSpacing.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the pronunciation (romanization) line on the lyrics page and in standard fullscreen; negative values tighten it.",
  },
  {
    key: "phonetic-outline-width", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "menu.pronunciation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the pronunciation (romanization) line on the lyrics page and in standard fullscreen; 0 turns the outline off.",
  },
  {
    key: "phonetic-outline-color", tab: "appearance", section: "lyric-layers", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "menu.pronunciation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the pronunciation (romanization) line on the lyrics page and in standard fullscreen (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "phonetic-hyphen-replace", tab: "appearance", section: "lyric-layers", control: "select",
    label: "settingsAdvanced.pronunciationStyle.hyphenReplace.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.hyphenReplace.desc",
    options: ["keep", "space", "remove"], default: "keep",
    role: "How hyphens inside romanized pronunciation are shown: keep (Tah-shee-kah), space (Tah shee kah) or remove (Tahsheekah).",
  },
  {
    key: "translation-font-family", tab: "appearance", section: "lyric-layers", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the translation line on the lyrics page and in standard fullscreen. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "translation-font-size", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontSize.desc",
    min: 12, max: 128, step: 2, unit: "px", default: 22,
    role: "Text size of the translation line on the lyrics page and in standard fullscreen.",
  },
  {
    key: "translation-font-weight", tab: "appearance", section: "lyric-layers", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 300,
    role: "Font weight of the translation line on the lyrics page and in standard fullscreen: 100 (thin) to 900 (black).",
  },
  {
    key: "translation-opacity", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 85,
    role: "Opacity of the translation line on the lyrics page and in standard fullscreen (0% invisible, 100% fully opaque).",
  },
  {
    key: "translation-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.translationStyle.gap.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.gap.desc",
    min: -20, max: 30, step: 2, unit: "px", default: 0,
    role: "Vertical gap between the pronunciation line (or the original when there is no pronunciation) and the translation line below it.",
  },
  {
    key: "translation-letter-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.translationStyle.letterSpacing.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the translation line on the lyrics page and in standard fullscreen; negative values tighten it.",
  },
  {
    key: "translation-outline-width", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "translationMenu.translation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the translation line on the lyrics page and in standard fullscreen; 0 turns the outline off.",
  },
  {
    key: "translation-outline-color", tab: "appearance", section: "lyric-layers", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "translationMenu.translation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the translation line on the lyrics page and in standard fullscreen (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "furigana-enabled", tab: "appearance", section: "lyric-layers", control: "toggle",
    label: "settingsAdvanced.languageDetection.furigana.label", column: "translationMenu.furigana", info: "settingsAdvanced.languageDetection.furigana.desc",
    default: false,
    aliases: ["ruby", "후리가나", "ふりがな"],
    role: "Shows hiragana readings (furigana) above kanji in Japanese lyrics on the lyrics page.",
  },
  {
    key: "furigana-font-size", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.furiganaStyle.fontSize.label", column: "translationMenu.furigana", info: "settingsAdvanced.furiganaStyle.fontSize.desc",
    min: 8, max: 48, step: 1, unit: "px", default: 14,
    role: "Text size of the furigana readings above Japanese kanji. Used while furigana-enabled is on.",
  },
  {
    key: "furigana-font-weight", tab: "appearance", section: "lyric-layers", control: "font-weight",
    label: "settingsAdvanced.furiganaStyle.fontWeight.label", column: "translationMenu.furigana", info: "settingsAdvanced.furiganaStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 300,
    role: "Font weight of the furigana readings above Japanese kanji: 100 (thin) to 900 (black). Used while furigana-enabled is on.",
  },
  {
    key: "furigana-opacity", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.furiganaStyle.opacity.label", column: "translationMenu.furigana", info: "settingsAdvanced.furiganaStyle.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 80,
    role: "Opacity of the furigana readings above Japanese kanji (0% invisible, 100% fully opaque). Used while furigana-enabled is on.",
  },
  {
    key: "furigana-spacing", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.furiganaStyle.spacing.label", column: "translationMenu.furigana", info: "settingsAdvanced.furiganaStyle.spacing.desc",
    min: -5, max: 20, step: 1, unit: "px", default: 2,
    role: "Gap between the furigana readings and the kanji below them.",
  },
  {
    key: "furigana-outline-width", tab: "appearance", section: "lyric-layers", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "translationMenu.furigana", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the furigana readings above Japanese kanji; 0 turns the outline off. Used while furigana-enabled is on.",
  },
  {
    key: "furigana-outline-color", tab: "appearance", section: "lyric-layers", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "translationMenu.furigana", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the furigana readings above Japanese kanji (#rrggbb); visible when the matching outline thickness is above 0. Used while furigana-enabled is on.",
  },
  // ─── appearance › text-shadow ──────────────────────────────────────────
  {
    key: "text-shadow-color", tab: "appearance", section: "text-shadow", control: "color",
    label: "settingsAdvanced.textShadow.color.label", info: "settingsAdvanced.textShadow.color.desc",
    default: "#000000",
    role: "Colour of the shadow drawn behind lyric text. Takes effect only while Shadow Effect (text-shadow-enabled, Performance menu) is on.",
  },
  {
    key: "text-shadow-opacity", tab: "appearance", section: "text-shadow", control: "range",
    label: "settingsAdvanced.textShadow.opacity.label", info: "settingsAdvanced.textShadow.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 50,
    role: "Opacity of the lyric text shadow (0% invisible). Takes effect only while Shadow Effect (text-shadow-enabled) is on.",
  },
  {
    key: "text-shadow-blur", tab: "appearance", section: "text-shadow", control: "range",
    label: "settingsAdvanced.textShadow.blur.label", info: "settingsAdvanced.textShadow.blur.desc",
    min: 0, max: 10, step: 1, unit: "px", default: 2,
    role: "Blur radius of the lyric text shadow; 0 gives a hard shadow. Takes effect only while Shadow Effect (text-shadow-enabled) is on.",
  },
  // ─── appearance › sync-mode ────────────────────────────────────────────
  {
    key: "lines-before", tab: "appearance", section: "sync-mode", control: "select",
    label: "settingsAdvanced.syncMode.linesBefore.label", info: "settingsAdvanced.syncMode.linesBefore.desc",
    options: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], default: 0,
    role: "In the compact synced view, how many lyric lines are shown above the line being sung (0-10).",
  },
  {
    key: "lines-after", tab: "appearance", section: "sync-mode", control: "select",
    label: "settingsAdvanced.syncMode.linesAfter.label", info: "settingsAdvanced.syncMode.linesAfter.desc",
    options: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], default: 2,
    role: "In the compact synced view, how many lyric lines are shown below the line being sung (0-10).",
  },
  {
    key: "lyrics-anchor-position", tab: "appearance", section: "sync-mode", control: "range",
    label: "settingsAdvanced.syncMode.anchorPosition.label", info: "settingsAdvanced.syncMode.anchorPosition.desc",
    min: 20, max: 80, step: 5, unit: "%", default: 50,
    role: "Vertical position of the line being sung, measured from the top of the lyrics area. 50% keeps it centred; lower values move it up, higher values move it down.",
  },
  {
    key: "highlight-intensity", tab: "appearance", section: "sync-mode", control: "range",
    label: "settingsAdvanced.syncMode.highlightIntensity.label", info: "settingsAdvanced.syncMode.highlightIntensity.desc",
    min: 30, max: 90, step: 5, unit: "%", default: 70,
    visibleWhen: "highlight-mode is on",
    role: "With Highlight Mode on, how visible the inactive lines stay. Lower values dim them more.",
  },
  // ─── appearance › multi-vocal-colors ───────────────────────────────────
  {
    key: "sync-data-custom-speaker-colors-enabled", tab: "appearance", section: "multi-vocal-colors", control: "toggle",
    label: "settingsAdvanced.multiVocalColors.useCreatorColors.label", info: "settingsAdvanced.multiVocalColors.useCreatorColors.desc",
    default: true,
    role: "Uses the custom speaker colours that sync creators embedded in community sync data. When off, CUSTOM speakers use the fallback colour the creator picked (one of the colours below).",
  },
  {
    key: "multi-vocal-speaker-color-male-1", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.maleGroup",
    default: "#a8ccff",
    role: "Text colour for the MALE 1 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-male-2", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.maleGroup",
    default: "#9ae8d4",
    role: "Text colour for the MALE 2 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-male-3", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.maleGroup",
    default: "#bfe8ff",
    role: "Text colour for the MALE 3 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-male-4", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.maleGroup",
    default: "#7fb5e6",
    role: "Text colour for the MALE 4 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-male-5", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.maleGroup",
    default: "#6cb8b8",
    role: "Text colour for the MALE 5 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-female-1", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.femaleGroup",
    default: "#ffb8c7",
    role: "Text colour for the FEMALE 1 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-female-2", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.femaleGroup",
    default: "#ffd6b3",
    role: "Text colour for the FEMALE 2 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-female-3", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.femaleGroup",
    default: "#f6c8ff",
    role: "Text colour for the FEMALE 3 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-female-4", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.femaleGroup",
    default: "#e6b4d4",
    role: "Text colour for the FEMALE 4 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-female-5", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.femaleGroup",
    default: "#f6e5a5",
    role: "Text colour for the FEMALE 5 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-duet-1", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.duetGroup",
    default: "#e4d8ff",
    role: "Text colour for the DUET 1 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-duet-2", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.duetGroup",
    default: "#d6e4ff",
    role: "Text colour for the DUET 2 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-duet-3", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.duetGroup",
    default: "#ffddf2",
    role: "Text colour for the DUET 3 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-duet-4", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.duetGroup",
    default: "#bfaeff",
    role: "Text colour for the DUET 4 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  {
    key: "multi-vocal-speaker-color-duet-5", tab: "appearance", section: "multi-vocal-colors", control: "color",
    label: "settingsAdvanced.multiVocalColors.duetGroup",
    default: "#9d8cf2",
    role: "Text colour for the DUET 5 singer in multi-vocal karaoke lyrics (sync data assigns each line or part to a singer).",
  },
  // ─── appearance › instrumental-break ───────────────────────────────────
  {
    key: "instrumental-break-auto-detect", tab: "appearance", section: "instrumental-break", control: "toggle",
    label: "settingsAdvanced.instrumentalBreak.autoDetect.label", info: "settingsAdvanced.instrumentalBreak.autoDetect.desc",
    default: true,
    role: "After a karaoke line ends, shows the instrumental marker for a long gap before the next line even when the lyrics have no explicit break.",
  },
  {
    key: "instrumental-break-keep-previous", tab: "appearance", section: "instrumental-break", control: "toggle",
    label: "settingsAdvanced.instrumentalBreak.keepPreviousLyrics.label", info: "settingsAdvanced.instrumentalBreak.keepPreviousLyrics.desc",
    default: false,
    role: "Keeps the previous lyric lines visible during instrumental breaks (as many as Lines Displayed Before). With 0 previous lines they stay hidden.",
  },
  {
    key: "instrumental-break-icon", tab: "appearance", section: "instrumental-break", control: "select",
    label: "settingsAdvanced.instrumentalBreak.icon.label", info: "settingsAdvanced.instrumentalBreak.icon.desc",
    options: ["equalizer", "dotWave", "ripples", "orbit", "diamonds", "scan", "arcs", "signal", "pulseDot", "stack", "spark", "splitBars", "metronome", "vinyl", "beat", "reels", "triangle", "morph", "strings", "piano", "bloom", "speaker", "crossfade"], default: "equalizer",
    role: "Animated icon shown in lyric gaps longer than 0.5 seconds. Values are the icon ids listed in options (equalizer, dotWave, ripples, ...).",
  },
  {
    key: "instrumental-break-show-label", tab: "appearance", section: "instrumental-break", control: "toggle",
    label: "settingsAdvanced.instrumentalBreak.showLabel.label", info: "settingsAdvanced.instrumentalBreak.showLabel.desc",
    default: false,
    role: "Shows a text label next to the instrumental icon: Intro, Break or Outro depending on where the gap is.",
  },
  {
    key: "instrumental-break-label-font-family", tab: "appearance", section: "instrumental-break", control: "font",
    label: "settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.label", info: "settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.desc",
    default: "",
    visibleWhen: "instrumental-break-show-label is on",
    role: "Font of the instrumental text label (Intro, Break or Outro). Accepts a font name or a comma-separated fallback list; Google Fonts load automatically. Used while instrumental-break-show-label is on.",
  },
  {
    key: "instrumental-break-label-font-size", tab: "appearance", section: "instrumental-break", control: "range",
    label: "settingsAdvanced.instrumentalBreak.labelStyle.fontSize.label", info: "settingsAdvanced.instrumentalBreak.labelStyle.fontSize.desc",
    min: 12, max: 128, step: 2, unit: "px", default: "",
    visibleWhen: "instrumental-break-show-label is on",
    role: "Text size of the instrumental text label (Intro, Break or Outro). Used while instrumental-break-show-label is on.",
  },
  {
    key: "instrumental-break-label-font-weight", tab: "appearance", section: "instrumental-break", control: "font-weight",
    label: "settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.label", info: "settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: "",
    visibleWhen: "instrumental-break-show-label is on",
    role: "Font weight of the instrumental text label (Intro, Break or Outro): 100 (thin) to 900 (black). Used while instrumental-break-show-label is on.",
  },
  {
    key: "instrumental-break-label-opacity", tab: "appearance", section: "instrumental-break", control: "range",
    label: "settingsAdvanced.instrumentalBreak.labelStyle.opacity.label", info: "settingsAdvanced.instrumentalBreak.labelStyle.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: "",
    visibleWhen: "instrumental-break-show-label is on",
    role: "Opacity of the instrumental text label (Intro, Break or Outro) (0% invisible, 100% fully opaque). Used while instrumental-break-show-label is on.",
  },
  {
    key: "instrumental-break-label-outline-width", tab: "appearance", section: "instrumental-break", control: "range",
    label: "settingsAdvanced.textOutline.width.label", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    visibleWhen: "instrumental-break-show-label is on",
    role: "Thickness of the outline drawn around the instrumental text label; 0 turns the outline off.",
  },
  {
    key: "instrumental-break-label-outline-color", tab: "appearance", section: "instrumental-break", control: "color",
    label: "settingsAdvanced.textOutline.color.label", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    visibleWhen: "instrumental-break-show-label is on",
    role: "Colour of the outline around the instrumental text label (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "instrumental-break-animation-speed", tab: "appearance", section: "instrumental-break", control: "range",
    label: "settingsAdvanced.instrumentalBreak.speed.label", info: "settingsAdvanced.instrumentalBreak.speed.desc",
    min: 50, max: 200, step: 5, unit: "%", default: 100,
    role: "Speed of the instrumental icon animation; 100% is normal speed.",
  },
  // ─── performance › performance-rendering ───────────────────────────────
  {
    key: "performance-frame-rate", tab: "performance", section: "performance-rendering", control: "range",
    label: "settingsAdvanced.performance.frameRate.label", info: "settingsAdvanced.performance.frameRate.desc",
    min: 10, max: 240, step: 1, unit: "FPS", default: 60,
    aliases: ["fps", "프레임"],
    role: "Maximum update rate of synced and karaoke lyric animation. Lower values reduce CPU and GPU load; higher values look smoother on high-refresh displays.",
  },
  {
    key: "reduce-motion", tab: "performance", section: "performance-rendering", control: "toggle",
    label: "settings.reduceMotion.label", info: "settings.reduceMotion.desc",
    default: false,
    role: "Reduces interface and lyric animations across ivLyrics. The system reduced-motion preference is also respected.",
  },
  {
    key: "karaoke-bounce", tab: "performance", section: "performance-rendering", control: "toggle",
    label: "settingsAdvanced.karaokeMode.bounce.label", info: "settingsAdvanced.karaokeMode.bounce.desc",
    default: true,
    role: "Bounce animation on the characters being sung in karaoke lyrics. Turning it off also hides Karaoke Motion Style.",
  },
  {
    key: "karaoke-line-transition", tab: "performance", section: "performance-rendering", control: "toggle",
    label: "settingsAdvanced.karaokeMode.lineTransition.label", info: "settingsAdvanced.karaokeMode.lineTransition.desc",
    default: true,
    role: "Animates the lyric lines moving when the active line changes. Turning it off can lower GPU usage.",
  },
  {
    key: "karaoke-text-effects", tab: "performance", section: "performance-rendering", control: "toggle",
    label: "settingsAdvanced.performance.textEffects.label", info: "settingsAdvanced.performance.textEffects.desc",
    default: true,
    role: "Animated karaoke text effects such as shake, breathing, glow and glitch that sync data can attach to words.",
  },
  // ─── performance › performance-visual-cost ─────────────────────────────
  {
    key: "fade-blur", tab: "performance", section: "performance-visual-cost", control: "toggle",
    label: "settingsAdvanced.syncMode.fadeoutBlur.label", info: "settingsAdvanced.syncMode.fadeoutBlur.desc",
    default: true,
    role: "Blurs lyric lines that are not being sung so the current line stands out. Costs GPU.",
  },
  {
    key: "highlight-mode", tab: "performance", section: "performance-visual-cost", control: "toggle",
    label: "settingsAdvanced.syncMode.highlightMode.label", info: "settingsAdvanced.syncMode.highlightMode.desc",
    default: false,
    role: "Highlights only the lyrics being sung and dims all other lines. Dimming strength is Highlight Intensity in Appearance > Sync Mode.",
  },
  {
    key: "text-shadow-enabled", tab: "performance", section: "performance-visual-cost", control: "toggle",
    label: "settingsAdvanced.textShadow.enabled.label", info: "settingsAdvanced.textShadow.enabled.desc",
    default: true,
    role: "Draws a shadow behind lyric text for readability. Colour, opacity and blur are in Appearance > Text Shadow.",
  },
  {
    key: "video-background-settings", tab: "performance", section: "performance-visual-cost", control: "action", assistant: "show",
    label: "settings.videoBackground.label", info: "settings.videoBackground.desc", searchable: false,
    role: "Shortcut button that jumps to the video background options in Appearance > Visual Effects. Video Background itself is the background mode.",
  },
  // ─── performance › performance-background-work ─────────────────────────
  {
    key: "prefetch-enabled", tab: "performance", section: "performance-background-work", control: "toggle",
    label: "settingsAdvanced.prefetch.enabled.label", info: "settingsAdvanced.prefetch.enabled.desc",
    default: true,
    role: "Requests translation and pronunciation for the next song in the queue in advance so they are ready when it starts. Uses AI provider requests.",
  },
  {
    key: "prefetch-video-enabled", tab: "performance", section: "performance-background-work", control: "toggle",
    label: "settingsAdvanced.prefetch.videoEnabled.label", info: "settingsAdvanced.prefetch.videoEnabled.desc",
    default: true,
    role: "Looks up the next song's video background in advance.",
  },
  {
    key: "prefetch-word-details-enabled", tab: "performance", section: "performance-background-work", control: "toggle",
    label: "settingsAdvanced.prefetch.wordDetailsEnabled.label", info: "settingsAdvanced.prefetch.wordDetailsEnabled.desc",
    default: true,
    role: "Preloads per-word readings and translations used by word-level karaoke for the next song.",
  },
  // ─── lyrics › playback ─────────────────────────────────────────────────
  {
    key: "playbar-button", tab: "lyrics", section: "playback", control: "toggle",
    label: "settingsAdvanced.playback.replaceButton.label", info: "settingsAdvanced.playback.replaceButton.info",
    default: false,
    role: "Replaces Spotify's own lyrics button in the playback bar with a button that opens ivLyrics.",
  },
  {
    key: "fullscreen-button", tab: "lyrics", section: "playback", control: "toggle",
    label: "settingsAdvanced.playback.replaceFullscreenButton.label", info: "settingsAdvanced.playback.replaceFullscreenButton.info",
    default: false,
    role: "Replaces Spotify's fullscreen button in the playback bar with ivLyrics fullscreen.",
  },
  {
    key: "quick-sync-controls-enabled", tab: "lyrics", section: "playback", control: "toggle",
    label: "settingsAdvanced.playback.quickSyncControls.label", info: "settingsAdvanced.playback.quickSyncControls.info",
    default: true,
    role: "Shows the per-track sync offset buttons in the lower-left corner of the lyrics page and fullscreen. When hidden they remain under Adjust Lyrics Sync in the right-side menu.",
  },
  {
    key: "seek-fade-compensation", tab: "lyrics", section: "playback", control: "toggle",
    label: "settingsAdvanced.playback.seekFadeCompensation.label", info: "settingsAdvanced.playback.seekFadeCompensation.info",
    default: false,
    role: "When you click a lyric line, playback starts 0.3 seconds before it, because Spotify fades audio in after a seek and could swallow the first syllable.",
  },
  // ─── lyrics › karaoke-mode ─────────────────────────────────────────────
  {
    key: "karaoke-mode-enabled", tab: "lyrics", section: "karaoke-mode", control: "toggle",
    label: "settingsAdvanced.karaokeMode.enabled.label", info: "settingsAdvanced.karaokeMode.enabled.desc",
    default: true,
    role: "Opens the Karaoke view (word or character timing) automatically for songs that support it. When off, songs open in the Synced (line timing) view.",
  },
  {
    key: "karaoke-motion-style", tab: "lyrics", section: "karaoke-mode", control: "select",
    label: "settingsAdvanced.karaokeMode.motionStyle.label", info: "settingsAdvanced.karaokeMode.motionStyle.desc",
    options: ["classic", "expressive"], default: "classic",
    visibleWhen: "karaoke-bounce is on",
    role: "Karaoke animation style. classic = subtle bounce; expressive = spring physics where sung words swell, lift and glow, upcoming words rest slightly smaller and long held notes animate letter by letter. Shown only while Character Bounce Effect (karaoke-bounce) is on.",
  },
  {
    key: "synced-pronunciation", tab: "lyrics", section: "karaoke-mode", control: "toggle",
    label: "settingsAdvanced.karaokeMode.syncedPronunciation.label", info: "settingsAdvanced.karaokeMode.syncedPronunciation.desc",
    default: false,
    role: "Requests pronunciation split along the timing of each sung word or character. Required for pronunciation-first mode and Fill pronunciation like karaoke. When off, plain line pronunciation arrives faster.",
  },
  {
    key: "pronunciation-karaoke-fill", tab: "lyrics", section: "karaoke-mode", control: "toggle",
    label: "settingsAdvanced.karaokeMode.pronunciationFill.label", info: "settingsAdvanced.karaokeMode.pronunciationFill.desc",
    default: false,
    visibleWhen: "synced-pronunciation is on",
    role: "Fills the pronunciation row in time with the singing even when pronunciation-first mode is off. Other effects such as bounce and glow are not applied. Needs Synced pronunciation.",
  },
  {
    key: "spotify-fake-karaoke-enabled", tab: "lyrics", section: "karaoke-mode", control: "toggle",
    label: "settingsAdvanced.karaokeMode.spotifyFakeKaraoke.label", info: "settingsAdvanced.karaokeMode.spotifyFakeKaraoke.desc",
    default: false,
    role: "Pseudo karaoke: when lyrics only have line timing, synthesizes word timing from Spotify's audio analysis. Korean, Japanese and Chinese lines are split more densely when confidence is high.",
  },
  {
    key: "pseudo-karaoke-render-advance", tab: "lyrics", section: "karaoke-mode", control: "range",
    label: "settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.label", info: "settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.desc",
    min: 0, max: 500, step: 10, unit: "ms", default: 250,
    visibleWhen: "spotify-fake-karaoke-enabled is on",
    role: "Moves pseudo-karaoke highlighting earlier by this many milliseconds. Affects only pseudo karaoke, not real karaoke timing.",
  },
  // ─── lyrics › sync-creator-settings ────────────────────────────────────
  {
    key: "sync-creator-auto-boundary-chars", tab: "lyrics", section: "sync-creator-settings", control: "toggle",
    label: "settings.syncCreatorSettings.autoBoundaryChars.label", info: "settings.syncCreatorSettings.autoBoundaryChars.desc",
    default: true,
    role: "In the Sync Creator, keyboard timing automatically includes nearby spaces and punctuation. Turn it off to time those characters manually.",
  },
  {
    key: "karaoke-fill-correction-curve", tab: "lyrics", section: "sync-creator-settings", control: "curve", assistant: "show",
    label: "settings.syncCreatorSettings.fillCurve.label", info: "settings.syncCreatorSettings.fillCurve.desc",
    default: "[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]",
    role: "Curve that remaps how the karaoke fill progresses inside each word or character. Drag the three middle points; the straight diagonal (default) keeps the original timing. Stored as JSON points.",
  },
  {
    key: "sync-creator-char-forward-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.charForward", "settings.shortcuts.primary"],
    default: "right",
    role: "Sync Creator primary keyboard shortcut to advance timing by one character while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-char-forward-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.charForward", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to advance timing by one character while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-char-back-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.charBack", "settings.shortcuts.primary"],
    default: "left",
    role: "Sync Creator primary keyboard shortcut to undo the last character's timing while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-char-back-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.charBack", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to undo the last character's timing while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-word-forward-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.wordForward", "settings.shortcuts.primary"],
    default: ".",
    role: "Sync Creator primary keyboard shortcut to advance timing by one word while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-word-forward-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.wordForward", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to advance timing by one word while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-word-back-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.wordBack", "settings.shortcuts.primary"],
    default: ",",
    role: "Sync Creator primary keyboard shortcut to undo the last word's timing while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-word-back-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.wordBack", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to undo the last word's timing while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-syllable-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.syllable", "settings.shortcuts.primary"],
    default: ";",
    role: "Sync Creator primary keyboard shortcut to advance timing by one syllable while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-syllable-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.syllable", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to advance timing by one syllable while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-drag-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.drag", "settings.shortcuts.primary"],
    default: "/",
    role: "Sync Creator primary keyboard shortcut to hold and drag to time several characters while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-drag-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.shortcuts.drag", "settings.shortcuts.secondary"],
    default: "numpaddivide",
    role: "Sync Creator secondary keyboard shortcut to hold and drag to time several characters while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-last-char-end-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.lastCharEnd.markNow", "settings.shortcuts.primary"],
    default: "`",
    role: "Sync Creator primary keyboard shortcut to end the current note now (sets the end time of the last timed character) while recording. Record a key in the row; an empty value means unassigned.",
  },
  {
    key: "sync-creator-last-char-end-alt-key", tab: "lyrics", section: "sync-creator-settings", control: "hotkey", assistant: "show",
    label: ["syncCreator.lastCharEnd.markNow", "settings.shortcuts.secondary"],
    default: "",
    role: "Sync Creator secondary keyboard shortcut to end the current note now (sets the end time of the last timed character) while recording. Record a key in the row; an empty value means unassigned.",
  },
  // ─── lyrics › lyrics-helper ────────────────────────────────────────────
  {
    key: "lyrics-helper-enabled", tab: "lyrics", section: "lyrics-helper", control: "helper", assistant: "show",
    label: "settings.lyricsHelper.label", info: "settings.lyricsHelper.desc",
    default: false,
    role: "Sends the current track and lyrics to the ivLyrics Helper desktop program so external programs (stream overlays, Discord bots, ...) can read them through its API. Requires the Helper; the toggle offers a download link.",
  },
  // ─── fullscreen › fullscreen-mode ──────────────────────────────────────
  {
    key: "fullscreen-key", tab: "fullscreen", section: "fullscreen-mode", control: "hotkey", assistant: "show",
    label: "settingsAdvanced.playback.fullscreenShortcut.label", info: "settingsAdvanced.fullscreenMode.shortcut.info",
    default: "f12",
    role: "Keyboard shortcut that toggles ivLyrics fullscreen (default F12). Record a new key in the row.",
  },
  {
    key: "fullscreen-browser-fullscreen", tab: "fullscreen", section: "fullscreen-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.browserFullscreen.desc", info: "settingsAdvanced.fullscreenMode.browserFullscreen.info",
    default: false,
    role: "Also switches the Spotify window to browser fullscreen so the lyrics fill the entire monitor when ivLyrics fullscreen opens.",
  },
  {
    key: "fullscreen-page-ui-only", tab: "fullscreen", section: "fullscreen-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.pageUiOnly.desc", info: "settingsAdvanced.fullscreenMode.pageUiOnly.info",
    default: false,
    role: "Shows the fullscreen layout inside the lyrics page area instead of covering the whole Spotify window.",
  },
  {
    key: "fullscreen-separate-buttons", tab: "fullscreen", section: "fullscreen-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.separateButtons.desc", info: "settingsAdvanced.fullscreenMode.separateButtons.info",
    default: false,
    role: "Adds a second fullscreen button to the toolbar. The existing button keeps the current behaviour and the new one opens the other way (inside the lyrics page or across the whole monitor).",
  },
  {
    key: "fullscreen-hide-overlay", tab: "fullscreen", section: "fullscreen-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.hideOverlay.desc", info: "settingsAdvanced.fullscreenMode.hideOverlay.info",
    default: true,
    role: "While ivLyrics fullscreen is open, tells the desktop overlay app that playback is paused so overlay lyrics fade out and do not cover the fullscreen view.",
  },
  {
    key: "fullscreen-tv-mode", tab: "fullscreen", section: "fullscreen-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.tvMode.desc", info: "settingsAdvanced.fullscreenMode.tvMode.info",
    default: false,
    role: "TV mode for fullscreen: album art and track info move to the bottom-left corner so the lyrics get the most space. Its options are in TV Mode Settings.",
  },
  {
    key: "toggle-tv-mode-key", tab: "fullscreen", section: "fullscreen-mode", control: "hotkey", assistant: "show",
    label: "settingsAdvanced.fullscreenMode.toggleTvModeKey.desc", info: "settingsAdvanced.fullscreenMode.toggleTvModeKey.info",
    default: "t",
    role: "Keyboard shortcut that switches between TV mode and normal mode while fullscreen is open (default T).",
  },
  // ─── fullscreen › metadata-display ─────────────────────────────────────
  {
    key: "fullscreen-trim-title", tab: "fullscreen", section: "metadata-display", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.trimTitle.desc", info: "settingsAdvanced.fullscreenMode.trimTitle.info",
    default: false,
    role: "Removes extra info such as (Remaster) or [feat. ...] from song titles shown in fullscreen.",
  },
  {
    key: "translate-metadata", tab: "fullscreen", section: "metadata-display", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.translateMetadata.desc", info: "settingsAdvanced.fullscreenMode.translateMetadata.info",
    default: false,
    role: "Translates foreign song titles and artist names with the AI provider enabled for Metadata.",
  },
  {
    key: "translate-metadata-mode", tab: "fullscreen", section: "metadata-display", control: "select",
    label: "settingsAdvanced.fullscreenMode.translateMetadataMode.desc", info: "settingsAdvanced.fullscreenMode.translateMetadataMode.info",
    options: ["translated", "romanized", "original-translated", "original-romanized", "all"], default: "translated",
    visibleWhen: "translate-metadata is on",
    role: "How translated titles and artists are shown: translated = translation only; romanized = pronunciation only; original-translated = original + translation; original-romanized = original + pronunciation; all = original, translation and pronunciation. Missing values fall back to the original.",
  },
  // ─── fullscreen › fullscreen-style ─────────────────────────────────────
  {
    key: "fullscreen-album-size", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.fullscreenStyle.albumSize.desc", info: "settingsAdvanced.fullscreenStyle.albumSize.info",
    min: 100, max: 800, step: 10, unit: "px", default: 400,
    role: "Maximum size of the album art in standard fullscreen.",
  },
  {
    key: "fullscreen-album-radius", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.fullscreenStyle.albumRadius.desc", info: "settingsAdvanced.fullscreenStyle.albumRadius.info",
    min: 0, max: 50, step: 1, unit: "px", default: 12,
    role: "Corner rounding of the album art in fullscreen; 0 gives square corners.",
  },
  {
    key: "fullscreen-info-gap", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.fullscreenMode.infoGap.desc", info: "settingsAdvanced.fullscreenMode.infoGap.info",
    min: 0, max: 100, step: 1, unit: "px", default: 24,
    role: "Gap between the album art and the track info / song controls below it in fullscreen.",
  },
  {
    key: "fullscreen-title-size", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.fullscreenStyle.titleFontSize.desc", info: "settingsAdvanced.fullscreenStyle.titleFontSize.info",
    min: 24, max: 72, step: 2, unit: "px", default: 48,
    role: "Font size of the song title in fullscreen.",
  },
  {
    key: "fullscreen-title-outline-width", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.textOutline.width.label", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the song title in fullscreen; 0 turns the outline off.",
  },
  {
    key: "fullscreen-title-outline-color", tab: "fullscreen", section: "fullscreen-style", control: "color",
    label: "settingsAdvanced.textOutline.color.label", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the song title in fullscreen (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "fullscreen-artist-size", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.fullscreenStyle.artistFontSize.desc", info: "settingsAdvanced.fullscreenStyle.artistFontSize.info",
    min: 14, max: 36, step: 1, unit: "px", default: 24,
    role: "Font size of the artist name in fullscreen.",
  },
  {
    key: "fullscreen-artist-outline-width", tab: "fullscreen", section: "fullscreen-style", control: "range",
    label: "settingsAdvanced.textOutline.width.label", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the artist name in fullscreen; 0 turns the outline off.",
  },
  {
    key: "fullscreen-artist-outline-color", tab: "fullscreen", section: "fullscreen-style", control: "color",
    label: "settingsAdvanced.textOutline.color.label", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the artist name in fullscreen (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  // ─── fullscreen › fullscreen-ui ────────────────────────────────────────
  {
    key: "fullscreen-show-clock", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showClock.desc", info: "settingsAdvanced.fullscreenUI.showClock.info",
    default: true,
    role: "Shows the current time in the top-right corner of fullscreen.",
  },
  {
    key: "fullscreen-clock-size", tab: "fullscreen", section: "fullscreen-ui", control: "range",
    label: "settingsAdvanced.fullscreenUI.clockSize.desc", info: "settingsAdvanced.fullscreenUI.clockSize.info",
    min: 24, max: 72, step: 2, unit: "px", default: 48,
    visibleWhen: "fullscreen-show-clock is on",
    role: "Font size of the fullscreen clock.",
  },
  {
    key: "fullscreen-clock-outline-width", tab: "fullscreen", section: "fullscreen-ui", control: "range",
    label: "settingsAdvanced.textOutline.width.label", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    visibleWhen: "fullscreen-show-clock is on",
    role: "Thickness of the outline drawn around the fullscreen clock; 0 turns the outline off.",
  },
  {
    key: "fullscreen-clock-outline-color", tab: "fullscreen", section: "fullscreen-ui", control: "color",
    label: "settingsAdvanced.textOutline.color.label", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    visibleWhen: "fullscreen-show-clock is on",
    role: "Colour of the outline around the fullscreen clock (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "fullscreen-show-context", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showContext.desc", info: "settingsAdvanced.fullscreenUI.showContext.info",
    default: true,
    role: "Shows what is playing from (playlist, album, ...) in the bottom-left corner of fullscreen.",
  },
  {
    key: "fullscreen-show-context-image", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showContextImage.desc", info: "settingsAdvanced.fullscreenUI.showContextImage.info",
    default: true,
    visibleWhen: "fullscreen-show-context is on",
    role: "Shows the playlist or album thumbnail next to the playback context.",
  },
  {
    key: "fullscreen-show-next-track", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showNextTrack.desc", info: "settingsAdvanced.fullscreenUI.showNextTrack.info",
    default: true,
    role: "Shows the next track in the top-right corner shortly before the current song ends, like a broadcast caption.",
  },
  {
    key: "fullscreen-next-track-seconds", tab: "fullscreen", section: "fullscreen-ui", control: "range",
    label: "settingsAdvanced.fullscreenUI.nextTrackTime.desc", info: "settingsAdvanced.fullscreenUI.nextTrackTime.info",
    min: 5, max: 30, step: 1, unit: "s", default: 15,
    visibleWhen: "fullscreen-show-next-track is on",
    role: "How many seconds before the end of the song the next-track preview appears.",
  },
  {
    key: "fullscreen-show-lyrics-progress", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showLyricsProgress.desc", info: "settingsAdvanced.fullscreenUI.showLyricsProgress.info",
    default: false,
    role: "Shows the current lyric line number and the total number of lines in fullscreen.",
  },
  {
    key: "fullscreen-show-queue", tab: "fullscreen", section: "fullscreen-ui", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showQueue.desc", info: "settingsAdvanced.fullscreenUI.showQueue.info",
    default: true,
    role: "Shows the playback queue panel when the mouse hovers over the right edge of fullscreen.",
  },
  // ─── fullscreen › controller-style ─────────────────────────────────────
  {
    key: "fullscreen-show-controls", tab: "fullscreen", section: "controller-style", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showControls.desc", info: "settingsAdvanced.fullscreenUI.showControls.info",
    default: true,
    aliases: ["controller", "컨트롤러", "재생 버튼"],
    role: "Shows the song controller in fullscreen: play/pause, previous/next, shuffle, repeat and like buttons.",
  },
  {
    key: "fullscreen-show-volume", tab: "fullscreen", section: "controller-style", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showVolume.desc", info: "settingsAdvanced.fullscreenUI.showVolume.info",
    default: true,
    visibleWhen: "fullscreen-show-controls is on",
    role: "Shows the volume slider in the fullscreen song controller.",
  },
  {
    key: "fullscreen-show-progress", tab: "fullscreen", section: "controller-style", control: "toggle",
    label: "settingsAdvanced.fullscreenUI.showProgressBar.desc", info: "settingsAdvanced.fullscreenUI.showProgressBar.info",
    default: true,
    visibleWhen: "fullscreen-show-controls is on",
    role: "Shows the progress bar with the playback position and total time in the fullscreen song controller.",
  },
  {
    key: "fullscreen-control-button-size", tab: "fullscreen", section: "controller-style", control: "range",
    label: "settingsAdvanced.controllerStyle.buttonSize.desc", info: "settingsAdvanced.controllerStyle.buttonSize.info",
    min: 28, max: 48, step: 2, unit: "px", default: 36,
    role: "Size of the play, previous and next buttons in the fullscreen controller.",
  },
  {
    key: "fullscreen-controls-background", tab: "fullscreen", section: "controller-style", control: "toggle",
    label: "settingsAdvanced.controllerStyle.background.desc", info: "settingsAdvanced.controllerStyle.background.info",
    default: false,
    role: "Draws a semi-transparent background behind the fullscreen song controller.",
  },
  // ─── fullscreen › auto-hide ────────────────────────────────────────────
  {
    key: "fullscreen-auto-hide-ui", tab: "fullscreen", section: "auto-hide", control: "toggle",
    label: "settingsAdvanced.autoHide.enabled.desc", info: "settingsAdvanced.autoHide.enabled.info",
    default: true,
    aliases: ["controller", "controls", "컨트롤러", "자동숨김", "자동 숨기기"],
    role: "Automatically hides the fullscreen song controller (controls), clock and track info after the mouse stops moving; moving the mouse shows them again. The wait time is Auto Hide Delay.",
  },
  {
    key: "fullscreen-auto-hide-delay", tab: "fullscreen", section: "auto-hide", control: "range",
    label: "settingsAdvanced.autoHide.delay.desc", info: "settingsAdvanced.autoHide.delay.info",
    min: 1, max: 10, step: 0.5, unit: "s", default: 3,
    visibleWhen: "fullscreen-auto-hide-ui is on",
    aliases: ["controller", "컨트롤러", "숨김 시간"],
    role: "Seconds of mouse inactivity before the fullscreen controller and info are hidden.",
  },
  // ─── fullscreen › tmi-style ────────────────────────────────────────────
  {
    key: "fullscreen-tmi-font-size", tab: "fullscreen", section: "tmi-style", control: "range",
    label: "settingsAdvanced.tmiStyle.fontSize.desc", info: "settingsAdvanced.tmiStyle.fontSize.info",
    min: 80, max: 150, step: 5, unit: "%", default: 100,
    role: "Text size of the Trivia (song research) window opened by long-pressing or right-clicking the album art, relative to normal size.",
  },
  {
    key: "fullscreen-tmi-outline-width", tab: "fullscreen", section: "tmi-style", control: "range",
    label: "settingsAdvanced.textOutline.width.label", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the Trivia window text; 0 turns the outline off.",
  },
  {
    key: "fullscreen-tmi-outline-color", tab: "fullscreen", section: "tmi-style", control: "color",
    label: "settingsAdvanced.textOutline.color.label", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the Trivia window text (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  // ─── fullscreen › normal-mode ──────────────────────────────────────────
  {
    key: "fullscreen-two-column", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.twoColumnLayout.desc", info: "settingsAdvanced.fullscreenMode.splitView.info",
    default: true,
    role: "Two-column fullscreen layout: album art and track info on one side, lyrics on the other. Off stacks everything in one column.",
  },
  {
    key: "fullscreen-layout-reverse", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.invertPosition.desc", info: "settingsAdvanced.fullscreenMode.invertPosition.info",
    default: false,
    visibleWhen: "fullscreen-two-column is on",
    role: "Swaps the album side and the lyrics side (left/right, or top/bottom in portrait windows).",
  },
  {
    key: "fullscreen-show-album", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.showAlbumArt.desc", info: "settingsAdvanced.fullscreenMode.showAlbumArt.info",
    default: true,
    visibleWhen: "fullscreen-two-column is on",
    role: "Shows the album art in the two-column fullscreen layout.",
  },
  {
    key: "fullscreen-show-info", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.showTrackInfo.desc", info: "settingsAdvanced.fullscreenMode.showTrackInfo.info",
    default: true,
    visibleWhen: "fullscreen-two-column is on",
    role: "Shows the song title and artist in the two-column fullscreen layout.",
  },
  {
    key: "fullscreen-show-album-name", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.normalMode.showAlbumName.desc", info: "settingsAdvanced.normalMode.showAlbumName.info",
    default: false,
    visibleWhen: "fullscreen-two-column is on and fullscreen-show-info is on",
    role: "Shows the album name below the title and artist.",
  },
  {
    key: "fullscreen-center-when-no-lyrics", tab: "fullscreen", section: "normal-mode", control: "toggle",
    label: "settingsAdvanced.fullscreenMode.centerWhenNoLyrics.desc", info: "settingsAdvanced.fullscreenMode.centerWhenNoLyrics.info",
    default: true,
    role: "Centres the album art when the song has no lyrics or they are still loading.",
  },
  // ─── fullscreen › tv-mode ──────────────────────────────────────────────
  {
    key: "fullscreen-tv-album-size", tab: "fullscreen", section: "tv-mode", control: "range",
    label: "settingsAdvanced.fullscreenMode.tvModeAlbumSize.desc", info: "settingsAdvanced.fullscreenMode.tvModeAlbumSize.info",
    min: 80, max: 200, step: 10, unit: "px", default: 140,
    role: "Size of the album art in the bottom-left corner in TV mode.",
  },
  {
    key: "fullscreen-tv-show-album-name", tab: "fullscreen", section: "tv-mode", control: "toggle",
    label: "settingsAdvanced.tvMode.showAlbumName.desc", info: "settingsAdvanced.tvMode.showAlbumName.info",
    default: true,
    role: "Shows the album name below the artist in TV mode.",
  },
  {
    key: "fullscreen-tv-show-controls", tab: "fullscreen", section: "tv-mode", control: "toggle",
    label: "settingsAdvanced.tvMode.showControls.desc", info: "settingsAdvanced.tvMode.showControls.info",
    default: false,
    role: "Shows play/pause and previous/next buttons in TV mode.",
  },
  {
    key: "fullscreen-tv-show-progress", tab: "fullscreen", section: "tv-mode", control: "toggle",
    label: "settingsAdvanced.tvMode.showProgress.desc", info: "settingsAdvanced.tvMode.showProgress.info",
    default: false,
    role: "Shows the playback progress bar and time in TV mode.",
  },
  // ─── fullscreen › cd-mode ──────────────────────────────────────────────
  {
    key: "fullscreen-cd-disc-size", tab: "fullscreen", section: "cd-mode", control: "range",
    label: "vinyl.cd.discSizeLabel", info: "vinyl.cd.discSizeDesc",
    min: 70, max: 140, step: 5, unit: "%", default: 100,
    role: "Size of the CD and the visualizer around it in CD mode.",
  },
  {
    key: "fullscreen-cd-rotation-enabled", tab: "fullscreen", section: "cd-mode", control: "toggle",
    label: "vinyl.cd.rotationLabel", info: "vinyl.cd.rotationDesc",
    default: true,
    role: "Slowly rotates the CD during playback. Reduce Motion still stops it.",
  },
  {
    key: "fullscreen-cd-rotation-speed", tab: "fullscreen", section: "cd-mode", control: "range",
    label: "vinyl.cd.rotationSpeedLabel", info: "vinyl.cd.rotationSpeedDesc",
    min: 25, max: 200, step: 5, unit: "%", default: 100,
    role: "Rotation speed of the CD; does not change playback speed.",
  },
  // ─── fullscreen › cd-visualizer ────────────────────────────────────────
  {
    key: "fullscreen-cd-visualizer-enabled", tab: "fullscreen", section: "cd-visualizer", control: "toggle",
    label: "vinyl.cd.enabledLabel", info: "vinyl.cd.enabledDesc",
    default: true,
    role: "Shows the spectrum visualizer around the CD. It follows Spotify's song analysis (not live audio or the microphone) and stays still when no analysis is available.",
  },
  {
    key: "fullscreen-cd-visualizer-style", tab: "fullscreen", section: "cd-visualizer", control: "select",
    label: "vinyl.cd.styleLabel", info: "vinyl.cd.styleDesc",
    options: ["bars", "blocks", "spikes", "line", "wave", "dots", "aura", "pulse", "particles"], default: "bars",
    role: "Shape of the CD visualizer: bars, blocks (LED), spikes, line, wave, dots, aura (glow), pulse (beat pulses) or particles.",
  },
  {
    key: "fullscreen-cd-visualizer-mirror", tab: "fullscreen", section: "cd-visualizer", control: "toggle",
    label: "vinyl.cd.mirrorLabel", info: "vinyl.cd.mirrorDesc",
    default: false,
    role: "Spreads the spectrum from top to bottom and mirrors it on both sides of the CD. Not used by the pulse shape.",
  },
  {
    key: "fullscreen-cd-visualizer-color-mode", tab: "fullscreen", section: "cd-visualizer", control: "select",
    label: "vinyl.cd.colorModeLabel", info: "vinyl.cd.colorModeDesc",
    options: ["album", "white", "custom", "rainbow"], default: "album",
    role: "Colours of the CD visualizer: album = colours from the artwork, white, custom = Custom colour, rainbow.",
  },
  {
    key: "fullscreen-cd-visualizer-color", tab: "fullscreen", section: "cd-visualizer", control: "color",
    label: "vinyl.cd.colorLabel", info: "vinyl.cd.colorDesc",
    default: "#ffffff",
    visibleWhen: "fullscreen-cd-visualizer-enabled is on and fullscreen-cd-visualizer-color-mode is \"custom\"",
    role: "Colour of the CD visualizer when Colour mode is custom.",
  },
  {
    key: "fullscreen-cd-visualizer-album-gradient", tab: "fullscreen", section: "cd-visualizer", control: "toggle",
    label: "vinyl.cd.albumGradientLabel", info: "vinyl.cd.albumGradientDesc",
    default: true,
    visibleWhen: "fullscreen-cd-visualizer-color-mode is \"album\"",
    role: "With album colours, blends several artwork colours around the visualizer. Off uses a single album colour.",
  },
  {
    key: "fullscreen-cd-visualizer-sensitivity", tab: "fullscreen", section: "cd-visualizer", control: "range",
    label: "vinyl.cd.sensitivityLabel", info: "vinyl.cd.sensitivityDesc",
    min: 25, max: 200, step: 5, unit: "%", default: 100,
    role: "How strongly the CD visualizer reacts to the music. Does not change the volume.",
  },
  {
    key: "fullscreen-cd-visualizer-density", tab: "fullscreen", section: "cd-visualizer", control: "range",
    label: "vinyl.cd.densityLabel", info: "vinyl.cd.densityDesc",
    min: 24, max: 128, step: 8, default: 64,
    role: "Number of bars, dots or particles around the CD. Not used by the pulse shape.",
  },
  {
    key: "fullscreen-cd-visualizer-thickness", tab: "fullscreen", section: "cd-visualizer", control: "range",
    label: "vinyl.cd.thicknessLabel", info: "vinyl.cd.thicknessDesc",
    min: 1, max: 6, step: 0.5, unit: "px", default: 2,
    role: "Width of the visualizer's lines, bars, dots and particles.",
  },
  // ─── fullscreen › vinyl-mode ───────────────────────────────────────────
  {
    key: "fullscreen-focus-presentation", tab: "fullscreen", section: "vinyl-mode", control: "select",
    label: "vinyl.presentation.settingsTitle", info: "vinyl.presentation.settingsDescription",
    options: ["compact-vinyl", "vinyl", "video", "motion"], default: "vinyl",
    aliases: ["lp", "cd", "motion", "모션", "video stage"],
    role: "Focused layout opened from the album art or the mode menu in fullscreen: vinyl = LP record, compact-vinyl = CD with visualizer, video = Video Stage, motion = motion lyrics (animated typography).",
  },
  {
    key: "fullscreen-album-open-lp", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.albumClickOpensModeLabel", info: "vinyl.settings.albumClickOpensModeDesc",
    default: true,
    role: "Clicking the album art in fullscreen opens the selected focused layout (Focused lyric layout: LP, CD, Video Stage or motion lyrics). When off, choose a mode from the mode menu instead.",
  },
  {
    key: "fullscreen-vinyl-album-size", tab: "fullscreen", section: "vinyl-mode", control: "range",
    label: "vinyl.settings.albumSizeLabel", info: "vinyl.settings.albumSizeDesc",
    min: 70, max: 140, step: 5, unit: "%", default: 100,
    role: "Size of the album sleeve in LP mode.",
  },
  {
    key: "fullscreen-vinyl-record-size", tab: "fullscreen", section: "vinyl-mode", control: "range",
    label: "vinyl.settings.recordSizeLabel", info: "vinyl.settings.recordSizeDesc",
    min: 70, max: 140, step: 5, unit: "%", default: 100,
    role: "Size of the vinyl record in LP mode.",
  },
  {
    key: "fullscreen-vinyl-background-blur", tab: "fullscreen", section: "vinyl-mode", control: "range",
    label: "vinyl.settings.backgroundBlurLabel", info: "vinyl.settings.backgroundBlurDesc",
    min: 0, max: 100, step: 5, unit: "px", default: 0,
    role: "Extra background blur applied only in full LP mode.",
  },
  {
    key: "fullscreen-vinyl-animations", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.animationsLabel", info: "vinyl.settings.animationsDesc",
    default: true,
    role: "LP animations: play/pause tonearm, record spin, entrance and track-change animations.",
  },
  {
    key: "fullscreen-vinyl-track-change-animation", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.trackChangeAnimationLabel", info: "vinyl.settings.trackChangeAnimationDesc",
    default: true,
    role: "Animates the sleeve and record when the track changes. Off keeps the record spinning without the transition while LP animations stay on.",
  },
  {
    key: "fullscreen-vinyl-rotation-speed", tab: "fullscreen", section: "vinyl-mode", control: "range",
    label: "vinyl.settings.rotationSpeedLabel", info: "vinyl.settings.rotationSpeedDesc",
    min: 25, max: 200, step: 5, unit: "%", default: 100,
    role: "Rotation speed of the record. At 100% it turns once every 6 seconds; playback speed is unchanged.",
  },
  {
    key: "fullscreen-vinyl-center-rotation", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.centerRotationLabel", info: "vinyl.settings.centerRotationDesc",
    default: true,
    role: "Rotates the record's centre label together with the record.",
  },
  {
    key: "fullscreen-vinyl-lyrics-enabled", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.lyricsLabel", info: "vinyl.settings.lyricsDesc",
    default: true,
    role: "Shows the current lyric line below the record in LP mode.",
  },
  {
    key: "fullscreen-motion-background", tab: "fullscreen", section: "vinyl-mode", control: "select",
    label: "vinyl.settings.motionBackgroundLabel", info: "vinyl.settings.motionBackgroundDesc",
    options: ["video", "track"], default: "video",
    role: "What moves behind motion lyrics: video = the song's video; track = the normal track background (album art or colours). Use track when the song has no video or YouTube cannot play it.",
  },
  {
    key: "fullscreen-motion-intensity", tab: "fullscreen", section: "vinyl-mode", control: "select",
    label: "vinyl.settings.motionIntensityLabel", info: "vinyl.settings.motionIntensityDesc",
    options: ["calm", "normal", "wild"], default: "normal",
    role: "How far the camera swings, drifts and shakes in motion lyrics: calm, normal or wild. Calm also keeps words from smashing in.",
  },
  {
    key: "fullscreen-motion-rotation", tab: "fullscreen", section: "vinyl-mode", control: "select",
    label: "vinyl.settings.motionRotationLabel", info: "vinyl.settings.motionRotationDesc",
    options: ["full", "gentle", "off"], default: "full",
    role: "How much motion lyrics rotate the screen and the video: full; gentle = no quarter turns, flips or barrel rolls; off = everything stays level.",
  },
  {
    key: "fullscreen-motion-safe", tab: "fullscreen", section: "vinyl-mode", control: "toggle",
    label: "vinyl.settings.motionSafeLabel", info: "vinyl.settings.motionSafeDesc",
    default: false,
    role: "Photosensitivity-safe mode: removes flashes, glitches and flickering from motion lyrics.",
  },
  // ─── fullscreen › vinyl-tonearm ────────────────────────────────────────
  {
    key: "fullscreen-vinyl-tonearm-style", tab: "fullscreen", section: "vinyl-tonearm", control: "select",
    label: "vinyl.settings.tonearmStyleLabel", info: "vinyl.settings.tonearmStyleDesc",
    options: ["s", "straight", "j", "linear"], default: "s",
    role: "Tonearm design in LP mode: s = S-shaped (classic), straight, j = J-shaped, linear = linear tracking.",
  },
  {
    key: "fullscreen-vinyl-tonearm-finish", tab: "fullscreen", section: "vinyl-tonearm", control: "select",
    label: "vinyl.settings.tonearmFinishLabel", info: "vinyl.settings.tonearmFinishDesc",
    options: ["white", "silver", "black"], default: "white",
    role: "Tonearm colour and finish: white, silver or black.",
  },
  {
    key: "fullscreen-vinyl-tonearm-size", tab: "fullscreen", section: "vinyl-tonearm", control: "range",
    label: "vinyl.settings.tonearmSizeLabel", info: "vinyl.settings.tonearmSizeDesc",
    min: 80, max: 120, step: 5, unit: "%", default: 100,
    role: "Size of the tonearm in LP mode.",
  },
  // ─── fullscreen › vinyl-typography ─────────────────────────────────────
  {
    key: "fullscreen-vinyl-original-font-family", tab: "fullscreen", section: "vinyl-typography", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the original lyric line shown below the record in LP mode. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-vinyl-original-font-size", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontSize.desc",
    min: 16, max: 64, step: 1, unit: "px", default: 31,
    role: "Text size of the original lyric line shown below the record in LP mode.",
  },
  {
    key: "fullscreen-vinyl-original-font-weight", tab: "fullscreen", section: "vinyl-typography", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 600,
    role: "Font weight of the original lyric line shown below the record in LP mode: 100 (thin) to 900 (black).",
  },
  {
    key: "fullscreen-vinyl-original-opacity", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.opacity.desc",
    min: 20, max: 100, step: 5, unit: "%", default: 95,
    role: "Opacity of the original lyric line shown below the record in LP mode (0% invisible, 100% fully opaque).",
  },
  {
    key: "fullscreen-vinyl-original-letter-spacing", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.letterSpacing.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.originalStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the original lyric line shown below the record in LP mode; negative values tighten it.",
  },
  {
    key: "fullscreen-vinyl-original-outline-width", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the original lyric line shown below the record in LP mode; 0 turns the outline off.",
  },
  {
    key: "fullscreen-vinyl-original-outline-color", tab: "fullscreen", section: "vinyl-typography", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the original lyric line shown below the record in LP mode (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "fullscreen-vinyl-phonetic-font-family", tab: "fullscreen", section: "vinyl-typography", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the pronunciation (romanization) line shown below the record in LP mode. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-vinyl-phonetic-font-size", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontSize.desc",
    min: 10, max: 40, step: 1, unit: "px", default: 11,
    role: "Text size of the pronunciation (romanization) line shown below the record in LP mode.",
  },
  {
    key: "fullscreen-vinyl-phonetic-font-weight", tab: "fullscreen", section: "vinyl-typography", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 100,
    role: "Font weight of the pronunciation (romanization) line shown below the record in LP mode: 100 (thin) to 900 (black).",
  },
  {
    key: "fullscreen-vinyl-phonetic-opacity", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.opacity.desc",
    min: 20, max: 100, step: 5, unit: "%", default: 70,
    role: "Opacity of the pronunciation (romanization) line shown below the record in LP mode (0% invisible, 100% fully opaque).",
  },
  {
    key: "fullscreen-vinyl-phonetic-spacing", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.pronunciationStyle.gap.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.gap.desc",
    min: -10, max: 24, step: 1, unit: "px", default: -1,
    role: "Vertical gap between the original and the pronunciation line below the record in LP mode; negative values pull them closer.",
  },
  {
    key: "fullscreen-vinyl-phonetic-letter-spacing", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.pronunciationStyle.letterSpacing.label", column: "menu.pronunciation", info: "settingsAdvanced.pronunciationStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the pronunciation (romanization) line shown below the record in LP mode; negative values tighten it.",
  },
  {
    key: "fullscreen-vinyl-phonetic-outline-width", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "menu.pronunciation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the pronunciation (romanization) line shown below the record in LP mode; 0 turns the outline off.",
  },
  {
    key: "fullscreen-vinyl-phonetic-outline-color", tab: "fullscreen", section: "vinyl-typography", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "menu.pronunciation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the pronunciation (romanization) line shown below the record in LP mode (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "fullscreen-vinyl-translation-font-family", tab: "fullscreen", section: "vinyl-typography", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the translation line shown below the record in LP mode. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-vinyl-translation-font-size", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.fontSize.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontSize.desc",
    min: 10, max: 44, step: 1, unit: "px", default: 15,
    role: "Text size of the translation line shown below the record in LP mode.",
  },
  {
    key: "fullscreen-vinyl-translation-font-weight", tab: "fullscreen", section: "vinyl-typography", control: "font-weight",
    label: "settingsAdvanced.originalStyle.fontWeight.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.fontWeight.desc",
    min: 100, max: 900, step: 100, default: 300,
    role: "Font weight of the translation line shown below the record in LP mode: 100 (thin) to 900 (black).",
  },
  {
    key: "fullscreen-vinyl-translation-opacity", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.originalStyle.opacity.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.opacity.desc",
    min: 20, max: 100, step: 5, unit: "%", default: 85,
    role: "Opacity of the translation line shown below the record in LP mode (0% invisible, 100% fully opaque).",
  },
  {
    key: "fullscreen-vinyl-translation-spacing", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.translationStyle.gap.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.gap.desc",
    min: -10, max: 30, step: 1, unit: "px", default: 0,
    role: "Vertical gap between the pronunciation (or original) line and the translation line below the record in LP mode.",
  },
  {
    key: "fullscreen-vinyl-translation-letter-spacing", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.translationStyle.letterSpacing.label", column: "translationMenu.translation", info: "settingsAdvanced.translationStyle.letterSpacing.desc",
    min: -5, max: 20, step: 0.5, unit: "px", default: 0,
    role: "Extra space between characters of the translation line shown below the record in LP mode; negative values tighten it.",
  },
  {
    key: "fullscreen-vinyl-translation-outline-width", tab: "fullscreen", section: "vinyl-typography", control: "range",
    label: "settingsAdvanced.textOutline.width.label", column: "translationMenu.translation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the translation line shown below the record in LP mode; 0 turns the outline off.",
  },
  {
    key: "fullscreen-vinyl-translation-outline-color", tab: "fullscreen", section: "vinyl-typography", control: "color",
    label: "settingsAdvanced.textOutline.color.label", column: "translationMenu.translation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the translation line shown below the record in LP mode (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  // ─── fullscreen › video-stage-typography ───────────────────────────────
  {
    key: "fullscreen-video-stage-original-font-family", tab: "fullscreen", section: "video-stage-typography", control: "font",
    label: "settingsAdvanced.originalStyle.fontFamily", info: "settingsAdvanced.originalStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the original lyric line in Video Stage. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-video-stage-phonetic-font-family", tab: "fullscreen", section: "video-stage-typography", control: "font",
    label: "settingsAdvanced.pronunciationStyle.title", info: "settingsAdvanced.pronunciationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the pronunciation (romanization) line in Video Stage. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-video-stage-translation-font-family", tab: "fullscreen", section: "video-stage-typography", control: "font",
    label: "settingsAdvanced.translationStyle.title", info: "settingsAdvanced.translationStyle.fontFamilyDesc",
    default: "Pretendard Variable",
    role: "Font of the translation line in Video Stage. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-video-stage-cultural-font-family", tab: "fullscreen", section: "video-stage-typography", control: "font",
    label: "settings.culturalAnnotations.fontFamily.label", info: "settings.culturalAnnotations.fontFamily.desc",
    default: "Pretendard Variable",
    role: "Font of the cultural context explanations in Video Stage. Accepts a font name or a comma-separated fallback list; Google Fonts load automatically.",
  },
  {
    key: "fullscreen-video-stage-lyric-background-color", tab: "fullscreen", section: "video-stage-typography", control: "color",
    label: "vinyl.settings.videoStageBackgroundColorLabel", info: "vinyl.settings.videoStageBackgroundColorDesc",
    default: "#000000",
    role: "Colour of the box behind the lyric text in Video Stage.",
  },
  {
    key: "fullscreen-video-stage-lyric-background-opacity", tab: "fullscreen", section: "video-stage-typography", control: "range",
    label: "vinyl.settings.videoStageBackgroundOpacityLabel", info: "vinyl.settings.videoStageBackgroundOpacityDesc",
    min: 0, max: 100, step: 1, unit: "%", default: 46,
    role: "Opacity of the box behind the lyric text in Video Stage; 0% removes it.",
  },
  // ─── nowplaying › panel-lyrics-general ─────────────────────────────────
  {
    key: "panel-lyrics-enabled", tab: "nowplaying", section: "panel-lyrics-general", control: "toggle",
    label: "settingsAdvanced.nowPlayingPanel.enabled.label", info: "settingsAdvanced.nowPlayingPanel.enabled.desc",
    default: true,
    role: "Shows ivLyrics lyrics inside Spotify's right-side Now Playing panel.",
  },
  {
    key: "panel-lyrics-font-family", tab: "nowplaying", section: "panel-lyrics-general", control: "font",
    label: "settingsAdvanced.nowPlayingPanel.fontFamily.label", column: "misc.default", info: "settingsAdvanced.nowPlayingPanel.fontFamily.desc",
    default: "Pretendard Variable",
    role: "Default font for panel lyrics, used by every layer whose own font is empty.",
  },
  {
    key: "panel-font-scale", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.fontScale.label", column: "misc.default", info: "settingsAdvanced.nowPlayingPanel.fontScale.desc",
    min: 50, max: 200, step: 5, unit: "%", default: 100,
    role: "Scales all panel lyric text sizes together (100% = the sizes below).",
  },
  {
    key: "panel-lyrics-original-font", tab: "nowplaying", section: "panel-lyrics-general", control: "font",
    label: "settingsAdvanced.nowPlayingPanel.originalFont.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.nowPlayingPanel.originalFont.desc",
    default: "",
    role: "Font of the original lyric line in the Now Playing panel; empty uses the panel default font (panel-lyrics-font-family). Comma-separated fallbacks are allowed.",
  },
  {
    key: "panel-lyrics-original-size", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.originalSize.label", column: "lyricsCacheEditor.original", info: "settingsAdvanced.nowPlayingPanel.originalSize.desc",
    min: 10, max: 30, step: 1, unit: "px", default: 26,
    role: "Base text size of the original lyric line in the Now Playing panel, before Global Font Scale is applied.",
  },
  {
    key: "panel-lyrics-original-outline-width", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: ["settingsAdvanced.nowPlayingPanel.originalFont.label", "settingsAdvanced.textOutline.width.label"], column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the original lyric line in the Now Playing panel; 0 turns the outline off.",
  },
  {
    key: "panel-lyrics-original-outline-color", tab: "nowplaying", section: "panel-lyrics-general", control: "color",
    label: ["settingsAdvanced.nowPlayingPanel.originalFont.label", "settingsAdvanced.textOutline.color.label"], column: "lyricsCacheEditor.original", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the original lyric line in the Now Playing panel (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "panel-lyrics-phonetic-font", tab: "nowplaying", section: "panel-lyrics-general", control: "font",
    label: "settingsAdvanced.nowPlayingPanel.phoneticFont.label", column: "menu.pronunciation", info: "settingsAdvanced.nowPlayingPanel.phoneticFont.desc",
    default: "",
    role: "Font of the pronunciation (romanization) line in the Now Playing panel; empty uses the panel default font (panel-lyrics-font-family). Comma-separated fallbacks are allowed.",
  },
  {
    key: "panel-lyrics-phonetic-size", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.phoneticSize.label", column: "menu.pronunciation", info: "settingsAdvanced.nowPlayingPanel.phoneticSize.desc",
    min: 8, max: 24, step: 1, unit: "px", default: 13,
    role: "Base text size of the pronunciation (romanization) line in the Now Playing panel, before Global Font Scale is applied.",
  },
  {
    key: "panel-lyrics-phonetic-outline-width", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: ["settingsAdvanced.nowPlayingPanel.phoneticFont.label", "settingsAdvanced.textOutline.width.label"], column: "menu.pronunciation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the pronunciation (romanization) line in the Now Playing panel; 0 turns the outline off.",
  },
  {
    key: "panel-lyrics-phonetic-outline-color", tab: "nowplaying", section: "panel-lyrics-general", control: "color",
    label: ["settingsAdvanced.nowPlayingPanel.phoneticFont.label", "settingsAdvanced.textOutline.color.label"], column: "menu.pronunciation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the pronunciation (romanization) line in the Now Playing panel (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  {
    key: "panel-lyrics-translation-font", tab: "nowplaying", section: "panel-lyrics-general", control: "font",
    label: "settingsAdvanced.nowPlayingPanel.translationFont.label", column: "translationMenu.translation", info: "settingsAdvanced.nowPlayingPanel.translationFont.desc",
    default: "",
    role: "Font of the translation line in the Now Playing panel; empty uses the panel default font (panel-lyrics-font-family). Comma-separated fallbacks are allowed.",
  },
  {
    key: "panel-lyrics-translation-size", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.translationSize.label", column: "translationMenu.translation", info: "settingsAdvanced.nowPlayingPanel.translationSize.desc",
    min: 8, max: 24, step: 1, unit: "px", default: 13,
    role: "Base text size of the translation line in the Now Playing panel, before Global Font Scale is applied.",
  },
  {
    key: "panel-lyrics-translation-outline-width", tab: "nowplaying", section: "panel-lyrics-general", control: "range",
    label: ["settingsAdvanced.nowPlayingPanel.translationFont.label", "settingsAdvanced.textOutline.width.label"], column: "translationMenu.translation", info: "settingsAdvanced.textOutline.width.desc",
    min: 0, max: 10, step: 0.5, unit: "px", default: 0,
    role: "Thickness of the outline drawn around the translation line in the Now Playing panel; 0 turns the outline off.",
  },
  {
    key: "panel-lyrics-translation-outline-color", tab: "nowplaying", section: "panel-lyrics-general", control: "color",
    label: ["settingsAdvanced.nowPlayingPanel.translationFont.label", "settingsAdvanced.textOutline.color.label"], column: "translationMenu.translation", info: "settingsAdvanced.textOutline.color.desc",
    default: "#000000",
    role: "Colour of the outline around the translation line in the Now Playing panel (#rrggbb); visible when the matching outline thickness is above 0.",
  },
  // ─── nowplaying › panel-background ─────────────────────────────────────
  {
    key: "panel-bg-type", tab: "nowplaying", section: "panel-background", control: "select",
    label: "settingsAdvanced.nowPlayingPanel.background.type.label", info: "settingsAdvanced.nowPlayingPanel.background.type.desc",
    options: ["album", "gradient", "custom", "transparent"], default: "album",
    role: "Background of the panel lyrics card: album = colour from the album art; gradient = Gradient Color 1 to 2; custom = Background Color; transparent = no background.",
  },
  {
    key: "panel-bg-color", tab: "nowplaying", section: "panel-background", control: "color",
    label: "settingsAdvanced.nowPlayingPanel.background.color.label", info: "settingsAdvanced.nowPlayingPanel.background.color.desc",
    default: "#6366f1",
    visibleWhen: "panel-bg-type is \"custom\"",
    role: "Solid background colour of the panel lyrics card (Background Type custom).",
  },
  {
    key: "panel-bg-gradient-1", tab: "nowplaying", section: "panel-background", control: "color",
    label: "settingsAdvanced.nowPlayingPanel.background.gradient1.label", info: "settingsAdvanced.nowPlayingPanel.background.gradient1.desc",
    default: "#6366f1",
    visibleWhen: "panel-bg-type is \"gradient\"",
    role: "First colour of the panel lyrics gradient background (Background Type gradient).",
  },
  {
    key: "panel-bg-gradient-2", tab: "nowplaying", section: "panel-background", control: "color",
    label: "settingsAdvanced.nowPlayingPanel.background.gradient2.label", info: "settingsAdvanced.nowPlayingPanel.background.gradient2.desc",
    default: "#a855f7",
    visibleWhen: "panel-bg-type is \"gradient\"",
    role: "Second colour of the panel lyrics gradient background (Background Type gradient).",
  },
  {
    key: "panel-bg-opacity", tab: "nowplaying", section: "panel-background", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.background.opacity.label", info: "settingsAdvanced.nowPlayingPanel.background.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 30,
    visibleWhen: "panel-bg-type is not \"transparent\"",
    role: "Opacity of the panel lyrics background (0% transparent, 100% opaque).",
  },
  // ─── nowplaying › panel-border ─────────────────────────────────────────
  {
    key: "panel-border-enabled", tab: "nowplaying", section: "panel-border", control: "toggle",
    label: "settingsAdvanced.nowPlayingPanel.border.enabled.label", info: "settingsAdvanced.nowPlayingPanel.border.enabled.desc",
    default: false,
    role: "Draws a border around the panel lyrics card.",
  },
  {
    key: "panel-border-color", tab: "nowplaying", section: "panel-border", control: "color",
    label: "settingsAdvanced.nowPlayingPanel.border.color.label", info: "settingsAdvanced.nowPlayingPanel.border.color.desc",
    default: "#ffffff",
    visibleWhen: "panel-border-enabled is on",
    role: "Colour of the panel lyrics border.",
  },
  {
    key: "panel-border-opacity", tab: "nowplaying", section: "panel-border", control: "range",
    label: "settingsAdvanced.nowPlayingPanel.border.opacity.label", info: "settingsAdvanced.nowPlayingPanel.border.opacity.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 10,
    visibleWhen: "panel-border-enabled is on",
    role: "Opacity of the panel lyrics border.",
  },
  // ─── advanced › language-detection ─────────────────────────────────────
  {
    key: "ja-detect-threshold", tab: "advanced", section: "language-detection", control: "range",
    label: "settingsAdvanced.languageDetection.japaneseThreshold.label", info: "settingsAdvanced.languageDetection.japaneseThreshold.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 40,
    role: "Minimum share of kana characters for lyrics to be treated as Japanese when choosing pronunciation and furigana conversion. Higher values mean stricter detection.",
  },
  {
    key: "hans-detect-threshold", tab: "advanced", section: "language-detection", control: "range",
    label: "settingsAdvanced.languageDetection.chineseThreshold.label", info: "settingsAdvanced.languageDetection.chineseThreshold.desc",
    min: 0, max: 100, step: 5, unit: "%", default: 40,
    role: "Threshold for deciding whether Chinese lyrics are Simplified or Traditional, based on the share of variant characters. Higher values mean stricter detection.",
  },
  // ─── advanced › export-import ──────────────────────────────────────────
  {
    key: "export-settings", tab: "advanced", section: "export-import", control: "action", assistant: "show",
    label: "settingsAdvanced.exportImport.export.label", info: "settingsAdvanced.exportImport.export.label",
    role: "Button: saves all ivLyrics settings to a file for another device.",
  },
  {
    key: "import-settings", tab: "advanced", section: "export-import", control: "action", assistant: "show",
    label: "settingsAdvanced.exportImport.import.label", info: "settingsAdvanced.exportImport.import.label",
    role: "Button: loads settings from an exported settings file and replaces the current ones.",
  },
  // ─── advanced › db-export-import ───────────────────────────────────────
  {
    key: "export-db", tab: "advanced", section: "db-export-import", control: "action", assistant: "show",
    label: "settingsAdvanced.dbExportImport.export.label", info: "settingsAdvanced.dbExportImport.export.label",
    role: "Button: exports the database (translations, lyrics cache and other stored data) to a file.",
  },
  {
    key: "import-db", tab: "advanced", section: "db-export-import", control: "action", assistant: "show",
    label: "settingsAdvanced.dbExportImport.import.label", info: "settingsAdvanced.dbExportImport.import.label",
    role: "Button: imports a database file exported from ivLyrics.",
  },
  // ─── advanced › reset-settings ─────────────────────────────────────────
  {
    key: "reset-settings", tab: "advanced", section: "reset-settings", control: "action", assistant: "show",
    label: "settingsAdvanced.resetSettings.reset.label", info: "settingsAdvanced.resetSettings.reset.desc",
    role: "Button: restores every setting to its default. Cannot be undone.",
  },
  // ─── about › about-update ──────────────────────────────────────────────
  {
    key: "check-update", tab: "about", section: "about-update", control: "action", assistant: "show",
    label: "settingsAdvanced.aboutTab.update.checkUpdate.desc", info: "settingsAdvanced.update.currentVersionInfo",
    role: "Button: checks GitHub for a newer ivLyrics version.",
  },
  {
    key: "open-updater", tab: "about", section: "about-update", control: "action", assistant: "show",
    label: "settingsAdvanced.aboutTab.update.protocol.desc", info: "settingsAdvanced.aboutTab.update.protocol.info",
    role: "Button: opens the ivLyrics updater to install the latest version.",
  },
]);
