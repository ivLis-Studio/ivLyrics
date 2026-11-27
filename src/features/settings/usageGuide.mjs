/**
 * ivLyrics usage guide
 * ====================
 *
 * How to use ivLyrics outside the settings rows: where each feature is, how to
 * reach it from the lyrics page or from Spotify, the steps to use it, what it
 * needs and what it cannot do. The settings guide (settingsGuide.mjs) explains
 * the settings themselves; this file explains the features and workflows.
 *
 * Who reads this file
 *   - The AI settings assistant (the "AI Assistant" menu of the settings
 *     window). The whole guide is too long to send with every message, so
 *     settingsAssistantSession.mjs puts only buildUsageGuideIndex() (one line
 *     per topic) after the settings catalog in the system prompt, and adds
 *     the full text of the topics chosen by selectUsageGuideTopics() to each
 *     request. When that choice misses, the AI asks for topics by id ("guide"
 *     in its reply) and gets them in a second request. The rules in
 *     settingsAssistantPrompt.mjs tell the AI to answer how-to questions
 *     ("How do I add synced lyrics?", "Can I add a video myself?") from these
 *     topics. The AI only knows what is written here, so a missing or wrong
 *     step becomes a missing or wrong answer.
 *   - tests/usage_guide.test.mjs checks every UI name, setting key and topic
 *     link below against the language files and the settings guide, and that
 *     typical questions find their topic.
 *
 * Languages
 *   Text is plain English for maintainers and for the AI; the assistant answers
 *   in the user's language. Never write a visible UI name by hand: write it as
 *   [[i18n.key]] with the key the code passes to translate()/I18n.t(), and the
 *   catalog puts the name the user actually sees, in their interface language,
 *   in quotes. Use [[i18n.key|Fallback]] only when the key is built at runtime
 *   or may be missing in some languages; the fallback is shown then.
 *   Hardcoded UI text that has no i18n key is quoted literally ("…").
 *
 * Maintenance checklist (people and AI agents)
 *   - When you add, move or rename a button, menu item, dialog or shortcut that
 *     users reach outside the settings rows, update the matching topic here in
 *     the same change: its access path, steps, needs and limits.
 *   - New feature: add a topic. Keep one task per topic, phrase `questions` the
 *     way users ask, in Korean and English (their words decide which messages
 *     bring the topic to the AI), and link related topics with `related` and
 *     settings rows with `settings`. Add the new questions to the
 *     topic-choice table in the test.
 *   - Removed feature: delete or rewrite the topic so the AI stops offering it.
 *   - Settings belong in settingsGuide.mjs. Here, list a setting key in
 *     `settings` only when the user needs that row to do the task; the chat
 *     shows those rows below the answer.
 *   - Run `node --test tests/usage_guide.test.mjs`. A failure names the topic
 *     and the key, setting, link or question to fix. The test also keeps the
 *     rendered guide within USAGE_GUIDE_MAX_CHARS.
 *
 * Topic fields
 *   id         kebab-case id, unique. The AI and `related` refer to topics by it.
 *   title      What the topic helps with, in English.
 *   questions  Typical user questions (any language).
 *   access     Where the feature is: one entry per way to reach it.
 *   steps      What to do, in order.
 *   needs      Requirements: login, roles, apps, providers, conditions (optional).
 *   limits     What is not possible, common problems and their causes (optional).
 *   settings   Related setting keys or section keys from settingsGuide.mjs (optional).
 *   related    Ids of related topics (optional).
 */

export const USAGE_GUIDE_VERSION = 1;
// Upper bound for the whole rendered guide (characters). Requests carry only
// the index and a few topics, but the guide should stay a quick read.
export const USAGE_GUIDE_MAX_CHARS = 60000;

export const USAGE_GUIDE_TOPICS = Object.freeze([
  // ─── Lyrics page basics ────────────────────────────────────────────────
  {
    id: "open-ivlyrics",
    title: "Open the lyrics page and find the ivLyrics menu",
    questions: ["ivLyrics 어떻게 열어?", "메뉴 버튼이 어디 있어?", "가사 한 줄 복사하는 법", "How do I open ivLyrics?", "Where are the ivLyrics buttons?", "How do I copy a lyric line?"],
    access: [
      "Spotify sidebar › \"ivLyrics\"",
      "Spotify playback bar › [[playbarButton.label]], while [[settingsAdvanced.playback.replaceButton.label]] is on (the sidebar item is hidden then)",
      "Click the ivLyrics lyrics card in Spotify's right-side Now Playing panel",
    ],
    steps: [
      "Play a song in Spotify and open \"ivLyrics\" in the sidebar.",
      "The ivLyrics menu is the column of buttons at the bottom right of the page; it fades out while the mouse is still, so move the mouse to show it.",
      "Its buttons: [[settings.lyricsMode.label]], [[menu.translation]], [[menu.pronunciationFirst]] (only with synced pronunciation), [[menu.syncAdjust]], [[menu.currentTrack]], [[menu.more]], [[menu.settings]] and [[menu.fullscreen]].",
      "Hover a button to see what it does; click it to open its panel, and click it again or press Esc to close the panel.",
      "Click a synced lyric line to jump playback to it; right-click a line to copy it with its pronunciation and translation.",
      "In fullscreen the buttons fold into one [[fullscreen.menuToggleShort]] button at the bottom right.",
    ],
    limits: [
      "If \"ivLyrics\" is missing from the sidebar, [[settingsAdvanced.playback.replaceButton.label]] may be on; otherwise see troubleshooting.",
    ],
    settings: ["playbar-button", "panel-lyrics-enabled"],
    related: ["keyboard-shortcuts", "spotify-button-replacement", "nowplaying-panel", "troubleshooting"],
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard shortcuts",
    questions: ["단축키 뭐 있어?", "전체화면 단축키 바꾸고 싶어", "What keyboard shortcuts are there?"],
    access: ["Anywhere in Spotify, on the ivLyrics page and in ivLyrics fullscreen"],
    steps: [
      "F12 ([[settingsAdvanced.playback.fullscreenShortcut.label]]) opens or closes ivLyrics fullscreen; from another Spotify page it opens ivLyrics first and returns there afterwards.",
      "S opens [[menu.settings]] on the lyrics page or in fullscreen.",
      "In fullscreen: T switches TV mode, 1–5 pick [[vinyl.presentation.standardLabel]], [[vinyl.presentation.compactLabel]], [[vinyl.presentation.vinylLabel]], [[vinyl.presentation.videoLabel]] or [[vinyl.presentation.motionLabel]], L hides or shows the lyrics, and Esc goes back to [[vinyl.presentation.standardLabel]] and then leaves fullscreen.",
      "[ and ] move the background video's timing by 0.1 s (with Shift 2 s) while a video plays and the quick sync buttons are shown.",
      "In the settings window, Ctrl+K (⌘K on macOS) or / jumps to the search box.",
      "Change the fullscreen and TV keys in [[menu.settings]] › [[tabs.fullscreen]] ([[settingsAdvanced.playback.fullscreenShortcut.label]], [[settingsAdvanced.fullscreenMode.toggleTvModeKey.desc]]); the Sync Creator keys are in [[tabs.behavior]] › [[settings.syncCreatorSettings.title]].",
    ],
    limits: ["Shortcuts do nothing while you type in a text field or while a dialog is open."],
    settings: ["fullscreen-key", "toggle-tv-mode-key"],
    related: ["fullscreen", "fullscreen-views", "sync-creator-record"],
  },
  {
    id: "lyrics-mode",
    title: "Switch the lyrics mode (character, word, synced, plain) and lock it",
    questions: ["단어 단위로 보고 싶어", "노래방 모드로 바꾸는 법", "글자 단위가 선택이 안 돼", "가사 모드 고정", "How do I switch to word-by-word lyrics?", "Why can't I pick karaoke mode?"],
    access: ["Lyrics page toolbar › [[settings.lyricsMode.label]]"],
    steps: [
      "Open [[settings.lyricsMode.label]] in the toolbar.",
      "Pick [[modes.character]] or [[modes.word]] (karaoke timing), [[modes.synced]] (line timing) or [[modes.unsynced]] (plain text).",
      "Modes this song cannot use are greyed out with the reason under them.",
      "Turn on [[modes.lockSelected]] to use that mode for every song that supports it; right-clicking the toolbar button also locks or unlocks the current mode.",
    ],
    needs: [
      "[[modes.character]] and [[modes.word]] need karaoke (word or character) sync for the song and [[settingsAdvanced.karaokeMode.enabled.label]] turned on.",
    ],
    limits: [
      "[[modes.unavailableNoKaraoke]]: no provider has karaoke sync for this song. Turn on [[settingsAdvanced.karaokeMode.spotifyFakeKaraoke.label]] to estimate word timing from line timing, try another provider for the song, or create the sync yourself.",
      "[[modes.unavailableKaraokeOff]]: turn on [[settingsAdvanced.karaokeMode.enabled.label]] in [[menu.settings]] › [[tabs.behavior]].",
      "[[modes.unavailableNoSynced]]: only plain lyrics were found for this song.",
    ],
    settings: ["karaoke-mode-enabled", "spotify-fake-karaoke-enabled"],
    related: ["lyrics-provider-per-song", "sync-creator"],
  },
  {
    id: "translation-pronunciation",
    title: "Show translation and pronunciation under the lyrics",
    questions: ["번역 어떻게 켜?", "발음 표시하고 싶어", "로마자 발음으로 보고 싶어", "번역 언어 바꾸는 법", "How do I turn on translation?", "How do I show romanization?"],
    access: ["Lyrics page toolbar › [[menu.translation]]"],
    steps: [
      "Open [[menu.translation]] in the toolbar.",
      "Turn on [[menu.pronunciation]] and/or [[menu.translationLabel]]; they are generated for the song and shown under each line.",
      "Under [[menu.pronunciationNotation]] choose [[menu.pronunciationNotationTranslation]], [[menu.pronunciationNotationLatin]] or [[menu.pronunciationNotationIpa]]; regenerate the pronunciation to apply it to a song already shown.",
      "[[menu.translationTargetLang]] shows the language translations are written in; [[settings.hotkey.change]] opens [[menu.settings]] › [[tabs.general]] to change it.",
      "If the song's language was detected wrongly, set it under [[menu.overrideLanguage]] (this song only).",
    ],
    needs: [
      "Providers for translation and pronunciation in [[menu.settings]] › [[tabs.aiProviders]] (the panel's [[menu.openSettings]] button goes there). Google Translate, Bing Translate and Pronunciation Lab work without an API key; AI providers need one.",
    ],
    limits: [
      "The [[menu.pronunciation]] and [[menu.translationLabel]] switches are remembered per lyrics language (for example for all Japanese songs), not per song.",
      "Pronunciation Lab cannot write pronunciation for Chinese, Cyrillic, Devanagari or Thai text; use an AI provider for those.",
    ],
    settings: ["translate:target-language", "ai-tasks"],
    related: ["regenerate-translation", "lyrics-cache-editor", "ai-provider-setup", "pronunciation-first", "ai-errors"],
  },
  {
    id: "regenerate-translation",
    title: "Regenerate a wrong translation or pronunciation",
    questions: ["번역이 이상해", "발음 다시 생성하고 싶어", "번역 재생성은 어디서 해?", "How do I regenerate the translation?"],
    access: ["Lyrics page toolbar › [[menu.translation]] › [[menu.regenerateTranslation]]"],
    steps: [
      "Open [[menu.translation]] and go to [[menu.regenerateTranslation]] at the bottom.",
      "Click [[menu.regeneratePronunciationOnly]] or [[menu.regenerateTranslationOnly]] ([[settings.culturalAnnotations.label]] and [[menu.regenerateWordDetails]] also appear when those features are on).",
      "The button spins until the new result replaces the old one for this song.",
      "To correct a few lines by hand instead, use [[lyricsCacheEditor.button]] › [[buttons.edit]] in the same section.",
    ],
    limits: [
      "The buttons stay disabled until an AI translation or pronunciation has been generated for the song.",
      "A new provider, notation or translation style applies to new results; regenerate to update a song that already has one.",
    ],
    related: ["translation-pronunciation", "lyrics-cache-editor"],
  },
  {
    id: "lyrics-cache-editor",
    title: "Correct the saved pronunciation or translation by hand",
    questions: ["번역 한 줄만 직접 고치고 싶어", "저장된 발음 수정하는 법", "Can I edit the translation myself?"],
    access: [
      "Lyrics page toolbar › [[menu.translation]] › [[menu.regenerateTranslation]] › [[lyricsCacheEditor.button]] › [[buttons.edit]]",
    ],
    steps: [
      "Open [[menu.translation]] and click [[buttons.edit]] next to [[lyricsCacheEditor.button]].",
      "Each line shows the [[lyricsCacheEditor.original]] with its pronunciation and translation; type your corrections.",
      "Pronunciation split into sung units can be typed as one line with [[lyricsCacheEditor.editAsLine]].",
      "Click [[lyricsCacheEditor.save]] to keep the changes for this song.",
    ],
    limits: [
      "The row appears only when the song has lyrics, and is disabled while the editor loads or saves.",
      "Edits are saved on this device only; regenerating the song replaces them.",
    ],
    related: ["translation-pronunciation", "regenerate-translation"],
  },
  {
    id: "pronunciation-first",
    title: "Sing along with pronunciation-first mode or the pronunciation fill",
    questions: ["발음 우선 모드 켜는 법", "발음 우선 버튼이 안 보여", "발음도 노래방처럼 채워지게 하고 싶어", "How do I turn on pronunciation-first mode?"],
    access: [
      "Lyrics page toolbar › [[menu.pronunciationFirst]]",
      "[[menu.settings]] › [[tabs.behavior]] › [[settingsAdvanced.karaokeMode.title]]",
    ],
    steps: [
      "In [[menu.settings]] › [[tabs.behavior]] › [[settingsAdvanced.karaokeMode.title]], turn on [[settingsAdvanced.karaokeMode.syncedPronunciation.label]].",
      "Turn on [[menu.pronunciation]] in the toolbar's [[menu.translation]] panel.",
      "Click [[menu.pronunciationFirst]] in the toolbar: the pronunciation takes the original lyric's place and style, and the original moves to the smaller pronunciation row. Click again to switch back.",
      "To keep the original on top and only fill the pronunciation row along with the singing, turn on [[settingsAdvanced.karaokeMode.pronunciationFill.label]] instead.",
    ],
    needs: [
      "An AI provider for pronunciation; Pronunciation Lab cannot make synced pronunciation.",
      "The pronunciation follows each sung syllable only in [[modes.character]] or [[modes.word]] mode (songs with karaoke sync).",
    ],
    limits: [
      "The [[menu.pronunciationFirst]] button is hidden until [[settingsAdvanced.karaokeMode.syncedPronunciation.label]] and the pronunciation are both on.",
      "Synced pronunciation takes longer to generate than plain line pronunciation.",
    ],
    settings: ["synced-pronunciation", "pronunciation-karaoke-fill"],
    related: ["translation-pronunciation", "lyrics-mode"],
  },
  {
    id: "lyrics-sync-offset",
    title: "Fix lyrics that run early or late (sync offset)",
    questions: ["가사가 늦게 나와", "가사가 너무 빨라", "가사 싱크가 안 맞아", "싱크 조절 어떻게 해?", "블루투스 이어폰이라 가사가 밀려", "The lyrics are out of sync", "How do I shift the lyrics timing?"],
    access: [
      "Lyrics page toolbar › [[menu.syncAdjust]]",
      "Quick sync buttons at the bottom left of the lyrics page and fullscreen",
    ],
    steps: [
      "Open [[menu.syncAdjust]] in the toolbar.",
      "[[syncAdjust.trackTitle]]: press −100/−50/−10/+10/+50/+100 ms for the playing song only. Plus values make the lyrics appear earlier, minus values later.",
      "[[syncAdjust.globalTitle]]: drag the slider or use the step buttons (up to ±10 seconds) to shift every song, for example to make up for Bluetooth delay.",
      "[[syncAdjust.reset]] at the bottom sets both back to 0.",
      "The quick buttons at the bottom left do the same for the current song; click the value in the middle to reset it. [[settingsAdvanced.playback.quickSyncControls.label]] shows or hides them.",
    ],
    limits: [
      "Offsets are saved on this device only and are never submitted. To fix the timing for everyone, submit karaoke sync with the Sync Creator.",
      "[[syncAdjust.trackTitle]] appears only when the song has timed lyrics.",
    ],
    settings: ["quick-sync-controls-enabled"],
    related: ["sync-creator", "video-timing"],
  },
  // ─── Current Track panel ───────────────────────────────────────────────
  {
    id: "lyrics-provider-per-song",
    title: "Use a different lyrics provider for one song",
    questions: ["가사가 틀려", "이 노래 가사가 이상해", "이 곡만 다른 가사로 바꾸고 싶어", "곡별 가사 제공자 변경", "The lyrics are wrong for this song", "How do I change the lyrics source for one song?"],
    access: ["Lyrics page toolbar › [[menu.currentTrack]] › [[menu.lyricsProviderSelect]]"],
    steps: [
      "Open [[menu.currentTrack]] and choose [[menu.lyricsProviderSelect]].",
      "[[menu.lyricsProviderCurrent]] shows where the current lyrics came from.",
      "Pick another provider; the lyrics reload from it for this song only, and the choice is remembered on this device.",
      "Pick [[menu.lyricsProviderAuto]] to return to the normal provider order.",
    ],
    limits: [
      "Only providers enabled in [[menu.settings]] › [[tabs.lyricsProviders]] are listed; a chosen provider that was turned off shows [[menu.lyricsProviderUnavailable]].",
      "The item is disabled while lyrics are loading. Local files show [[menu.localLyricsTools]] instead.",
      "To change the order for every song, reorder the providers in settings.",
    ],
    settings: ["lyrics-provider-list"],
    related: ["lyrics-provider-order", "local-file-lyrics", "troubleshooting"],
  },
  {
    id: "local-file-lyrics",
    title: "Add lyrics to a local file (LRC import or LRCLIB search)",
    questions: ["로컬 파일 가사 넣는 법", "LRC 파일 넣을 수 있어?", "내 mp3에 가사 붙이기", "How do I add lyrics to a local file?", "Can I import an LRC file?"],
    access: [
      "While a local file plays: lyrics page toolbar › [[menu.currentTrack]] › [[menu.localLyricsTools]]",
    ],
    steps: [
      "Play the local file in Spotify and open [[menu.currentTrack]] › [[menu.localLyricsTools]].",
      "[[menu.importLrcFile]] › [[menu.import]]: choose an .lrc or .txt file (up to 1 MB).",
      "Or [[menu.searchLrclibLocal]] › [[menu.search]]: search LRCLIB by title or artist and press [[menu.apply]] on a result.",
      "The lyrics are saved on this device for that file; [[menu.localLyricsDelete]] removes them.",
    ],
    limits: [
      "Local files never use the ivLyrics server, so these lyrics stay on this device and are not shared.",
      "Karaoke sync cannot be submitted for local files without a Spotify track id.",
      "Clearing the lyrics cache does not remove imported local lyrics; use [[menu.localLyricsDelete]].",
    ],
    related: ["lyrics-provider-per-song", "sync-creator"],
  },
  {
    id: "per-song-background",
    title: "Use a different background for one song",
    questions: ["이 곡만 배경 바꾸고 싶어", "곡마다 배경 다르게 할 수 있어?", "How do I set a background for one song?"],
    access: ["Lyrics page toolbar › [[menu.currentTrack]] › [[menu.trackBackground]]"],
    steps: [
      "Open [[menu.currentTrack]] › [[menu.trackBackground]].",
      "Under [[menu.trackBackgroundSelect]] pick [[settingsUi.background.none]], [[settings.colorful.label]], [[settings.gradientBackground.label]], [[settings.blurGradientBackground.label]], [[settings.solidBackground.label]] or [[settings.videoBackground.label]].",
      "Pick [[menu.trackBackgroundUseGlobal]] to follow the main background again.",
      "[[menu.openSettings]] at the bottom opens [[menu.settings]] › [[tabs.appearance]] › [[sections.visualEffects]], where the main background and its details are set.",
    ],
    limits: [
      "Only the background type changes per song; blur, brightness, colour and video options follow the main background settings.",
    ],
    settings: ["__background-mode"],
    related: ["video-background", "video-select"],
  },
  // ─── Sync Creator (karaoke sync) ───────────────────────────────────────
  {
    id: "sync-creator",
    title: "Register karaoke sync for a song (Sync Creator)",
    questions: ["가사에 싱크를 등록하고 싶은데 어떻게 해?", "노래방 싱크 직접 만들 수 있어?", "직접 만든 싱크 올리는 법", "싱크 생성기 어디 있어?", "How do I add synced lyrics to a song?", "How do I make karaoke sync?"],
    access: [
      "Lyrics page toolbar › [[menu.currentTrack]] › [[syncCreator.buttonTooltip]] (it reads [[syncCreator.clickHereHint]] when the song has no karaoke sync yet)",
    ],
    steps: [
      "Play the song and open [[menu.currentTrack]] › [[syncCreator.buttonTooltip]].",
      "If you are not signed in, settings open at [[tabs.about]] › [[settingsAdvanced.aboutTab.account.title]]: click [[settingsAdvanced.aboutTab.account.loginButton]], finish in the browser and open the editor again.",
      "The editor loads the song's lyrics from LRCLIB. If they are wrong, search LRCLIB with [[syncCreator.lrclibSearchButton]] and click [[syncCreator.lrclibApplyCandidate]] on the right result, or enter an [[syncCreator.lrclibIdLabel]] and click [[syncCreator.lrclibIdLoad]].",
      "Pick the [[syncCreator.syncGranularityLabel]]: [[syncCreator.syncGranularityLine]], [[syncCreator.syncGranularityWord]] or [[syncCreator.syncGranularityCharacter]].",
      "Record the timing with [[syncCreator.recordMode]] and check it with [[syncCreator.previewMode]].",
      "Click [[syncCreator.submit]]; the sync is shown to everyone after an admin approves it.",
      "[[syncCreator.back]] closes the editor; unsent work is autosaved as a draft on this device.",
    ],
    needs: [
      "A Discord login, a Spotify song (not a local file) and the song's lyrics on LRCLIB; the sync is saved as timing for those LRCLIB lyrics.",
    ],
    limits: [
      "The editor syncs the LRCLIB lyrics as they are; to use other lyrics text, load a different LRCLIB result.",
    ],
    related: ["sync-creator-record", "sync-creator-edit", "sync-creator-submit", "discord-login", "lyrics-sync-offset"],
  },
  {
    id: "sync-creator-record",
    title: "Record timing in the Sync Creator",
    questions: ["싱크는 어떻게 찍어?", "싱크 생성기 단축키", "단어 싱크 녹음하는 법", "How do I record word timing?"],
    access: [
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.progress]] › [[syncCreator.recordMode]]",
    ],
    steps: [
      "Click [[syncCreator.recordMode]]; playback starts if it was paused.",
      "[[syncCreator.syncGranularityLine]]: click the lyric the moment its line starts. [[syncCreator.syncGranularityWord]]: tap or drag along each word. [[syncCreator.syncGranularityCharacter]]: drag across the characters as they are sung (drag left to cancel).",
      "Keyboard: → one character, . one word, ; one syllable, hold / (or numpad /) to sweep along; ← and , undo a character or word.",
      "Enter finishes the line, Backspace cancels it, ↑/↓ move between lines, Space plays or pauses, Z/X jump 3 seconds back or forward.",
      "Click [[syncCreator.stopRecord]] when you are done.",
      "The editor's [[syncCreator.shortcutsTitle]] box lists the current keys; change them in [[menu.settings]] › [[tabs.behavior]] › [[settings.syncCreatorSettings.title]].",
    ],
    settings: ["sync-creator-settings"],
    related: ["sync-creator", "sync-creator-edit", "sync-creator-vocals"],
  },
  {
    id: "sync-creator-edit",
    title: "Preview and fine-tune recorded timing",
    questions: ["찍은 싱크 미리보기", "싱크를 조금 앞당기고 싶어", "마지막 글자 길게 끄는 부분은?", "How do I shift the timing I recorded?"],
    access: [
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.progress]] › [[syncCreator.previewMode]]",
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.currentLine]]",
    ],
    steps: [
      "[[syncCreator.previewMode]] plays the song with your timing; [[syncCreator.stopPreview]] or Esc returns to editing.",
      "[[syncCreator.globalOffset]] shifts every recorded time; [[syncCreator.currentLine]] › [[syncCreator.lineOffset]] shifts only the current line or vocal part.",
      "Outside recording, right-drag over timed characters to select a range, then shift it or give it a [[syncCreator.speakerLabel]] or [[syncCreator.typeLabel]]; [[syncCreator.rangeStyleClear]] removes the style.",
      "For a held last note, seek to where it ends and click [[syncCreator.lastCharEnd.markNow]] under [[syncCreator.lastCharEnd.title]] (or press the ` key).",
      "To redo a line, record it again; [[syncCreator.deleteLine]] clears the current line's timing.",
    ],
    limits: [
      "[[syncCreator.previewMode]] needs at least one recorded line. A held last note can last at most 60 seconds.",
    ],
    settings: ["sync-creator-last-char-end-key"],
    related: ["sync-creator-record", "sync-creator-backup", "sync-creator-submit"],
  },
  {
    id: "sync-creator-vocals",
    title: "Sync duets and overlapping vocals; Japanese character readings",
    questions: ["듀엣 곡 싱크는 어떻게 해?", "여러 보컬 모드가 뭐야?", "겹치는 가사 따로 싱크", "How do I sync overlapping vocals?"],
    access: ["[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.currentLine]]"],
    steps: [
      "When the lyrics contain parentheses or separators the editor asks; choose [[syncCreator.multiVocalDecisionMulti]]. Otherwise use [[syncCreator.enableMultiVocalMode]] on a line.",
      "[[syncCreator.manualSplit]]: click between characters to split a line into vocal parts; [[syncCreator.mergeWithNextLine]] joins lines that are sung together (up to five).",
      "Select each vocal part, set its [[syncCreator.speakerLabel]] and [[syncCreator.typeLabel]], and record it separately.",
      "Japanese lyrics: choose [[syncCreator.characterPronunciationTarget]] and click [[syncCreator.characterPronunciationGenerate]] to show a character-aligned reading under the current line while you sync.",
    ],
    needs: [
      "[[syncCreator.characterPronunciationGenerate]] needs an AI provider with the [[settings.aiProviders.supports.characterPronunciation]] task.",
    ],
    limits: ["Every vocal part needs its speaker and effect set before it can be recorded or submitted."],
    settings: ["ai-tasks"],
    related: ["sync-creator-record", "sync-creator-submit"],
  },
  {
    id: "sync-creator-backup",
    title: "Drafts, history, export and import in the Sync Creator",
    questions: ["싱크 작업 저장", "작업하던 싱크 이어서 하기", "싱크 파일 내보내기", "How do I save my sync work?"],
    access: [
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.historyTitle]]",
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.progress]]",
    ],
    steps: [
      "[[syncCreator.historyAutosaveToggle]] (on by default) keeps your work as a draft on this device; opening the editor again for the same song restores it.",
      "[[syncCreator.historyAddCheckpoint]] saves a checkpoint; [[syncCreator.historyPrevious]], [[syncCreator.historyNext]] or a row in [[syncCreator.historyTitle]] restores an earlier state (not while recording).",
      "[[syncCreator.export]] saves the timing as a JSON file; [[syncCreator.import]] loads one.",
      "[[syncCreator.revert]] discards your edits and reloads the published sync after a confirmation.",
    ],
    limits: ["Drafts and history stay on this device until you submit."],
    related: ["sync-creator", "sync-creator-submit"],
  },
  {
    id: "sync-creator-submit",
    title: "Submit karaoke sync, approval, and improving an existing sync",
    questions: ["싱크 제출하면 언제 반영돼?", "기존 싱크 수정할 수 있어?", "When will my sync show up?", "Can I fix an existing sync?"],
    access: [
      "[[menu.currentTrack]] › [[syncCreator.buttonTooltip]] › [[syncCreator.submit]] (top of the editor)",
    ],
    steps: [
      "Click [[syncCreator.submit]] at the top of the editor.",
      "If some lines are not synced yet, ivLyrics asks [[syncCreator.incompleteConfirm]].",
      "The editor closes with [[syncCreator.submitSuccess]]; the sync appears for everyone once an admin approves it.",
      "To improve an existing sync, open the editor on that song: the published timing loads for the same LRCLIB lyrics, so edit it and submit again.",
    ],
    needs: ["A Discord login, at least one synced line and LRCLIB lyrics for the song."],
    limits: [
      "There is no review-status screen or fixed approval time.",
      "With multiple vocals, every part needs its speaker and effect set.",
    ],
    related: ["sync-creator", "sync-creator-backup", "creator-profile"],
  },
  {
    id: "creator-profile",
    title: "Sync contributors, your contributions and points",
    questions: ["내가 올린 싱크 어디서 봐?", "기여 점수 확인", "싱크 제작자 프로필", "Where can I see my contributions?"],
    access: [
      "Bottom of the lyrics, next to the lyrics provider: [[misc.syncContributor]] › contributor name",
    ],
    steps: [
      "Songs with community karaoke sync credit the contributor at the bottom of the lyrics as [[misc.syncContributor]]; click the name to open the profile.",
      "The profile shows [[creatorProfile.contributions]] and [[creatorProfile.points]].",
      "On your own profile you can [[creatorProfile.addGreeting]] or [[creatorProfile.editGreeting]] and [[creatorProfile.saveGreeting]] it.",
      "Your [[settingsAdvanced.aboutTab.account.nickname.label]] and [[settingsAdvanced.aboutTab.account.creatorPrivacy.title]] are in [[menu.settings]] › [[tabs.about]] › [[settingsAdvanced.aboutTab.account.title]].",
    ],
    needs: ["A Discord login to edit your own profile."],
    limits: [
      "Points are calculated by the ivLyrics server.",
      "A private profile is credited anonymously, without a link.",
    ],
    settings: ["about-account"],
    related: ["sync-creator-submit", "discord-login"],
  },
  // ─── Video background ──────────────────────────────────────────────────
  {
    id: "video-background",
    title: "Play a music video behind the lyrics (video background)",
    questions: ["영상 배경 어떻게 켜?", "뮤비를 배경으로 틀고 싶어", "How do I turn on the video background?"],
    access: [
      "[[menu.settings]] › [[tabs.appearance]] › [[sections.visualEffects]]",
      "Lyrics page toolbar › [[menu.currentTrack]] › [[menu.trackBackground]] (one song only)",
    ],
    steps: [
      "In [[menu.settings]] › [[tabs.appearance]] › [[sections.visualEffects]], choose [[settings.videoBackground.label]] as the background.",
      "ivLyrics plays a YouTube video for each song, chosen from community submissions or matched automatically, in time with the song.",
      "Set [[settings.videoFallback.label]] for songs without a playable video.",
      "If [[videoBackground.noMatch]] appears, pick or add a video in [[menu.currentTrack]] › [[communityVideo.selectVideo]].",
      "For a single song, set [[menu.currentTrack]] › [[menu.trackBackground]] to [[settings.videoBackground.label]] instead.",
    ],
    needs: [
      "Videos play through YouTube by default; the optional Helper program can download them and play them locally.",
    ],
    limits: [
      "The video background uses more GPU and network than other backgrounds; compare with another background if the page stutters.",
    ],
    settings: ["__background-mode", "video-fallback-background", "video-helper-enabled"],
    related: ["video-select", "video-submit", "video-timing", "video-helper", "per-song-background"],
  },
  {
    id: "video-select",
    title: "Pick, rate or remove the video for the current song",
    questions: ["영상이 곡이랑 안 맞아서 다른 걸로 바꾸고 싶어", "영상 싫어요 누르는 법", "Can I change the background video for this song?"],
    access: [
      "Lyrics page toolbar › [[menu.currentTrack]] › [[communityVideo.selectVideo]] (listed only while the song uses the video background)",
    ],
    steps: [
      "Open [[menu.currentTrack]] › [[communityVideo.selectVideo]] to see [[communityVideo.title]].",
      "[[communityVideo.preview]] plays a muted preview in time with the song; [[communityVideo.applyShort]] uses that video for this song.",
      "The thumbs up or down buttons rate a video (click again to undo); [[communityVideo.hideDislikedLabel]] hides the ones you disliked.",
      "[[communityVideo.randomSelectionLabel]] picks a community video at random instead of a fixed one.",
      "[[communityVideo.edit]] opens a video's start time and skipped sections; [[communityVideo.updateAndApplyAction]] saves them.",
      "[[communityVideo.delete]] removes a video you submitted.",
    ],
    needs: ["Adding, editing or deleting community videos needs a Discord login; rating does not."],
    limits: ["[[communityVideo.noVideos]] means nobody has added one yet; you can add it yourself."],
    related: ["video-submit", "video-timing", "video-background"],
  },
  {
    id: "video-submit",
    title: "Add a YouTube video for a song yourself",
    questions: ["영상은 내가 수동으로 등록 못해?", "영상을 직접 등록할 수 있어?", "유튜브 링크로 배경 영상 넣기", "뮤비 직접 올리는 법", "Can I add a background video myself?", "Can I upload my own video?"],
    access: [
      "Lyrics page toolbar › [[menu.currentTrack]] › [[communityVideo.selectVideo]] › [[communityVideo.addVideoNoEmoji]]",
    ],
    steps: [
      "Use the video background for the song ([[communityVideo.selectVideo]] is listed only then).",
      "Open [[menu.currentTrack]] › [[communityVideo.selectVideo]] and click [[communityVideo.addVideoNoEmoji]].",
      "Paste the [[communityVideo.youtubeUrl]].",
      "Enter [[communityVideo.startTimeLabel]]: the second in the video where the first lyric line is sung.",
      "Optionally add [[communityVideo.skipSegmentsLabel]] (start and end in seconds, then [[communityVideo.addSkipSegment]]) to jump over parts of the video.",
      "Click [[communityVideo.submit]]; the video is added to the list right away (there is no approval step), then select it with [[communityVideo.applyShort]].",
    ],
    needs: ["A Discord login (not needed for local files)."],
    limits: [
      "For local files the button reads [[communityVideo.apply]] and the link is saved on this device only.",
      "[[communityVideo.invalidUrl]], [[communityVideo.videoNotFound]] and [[communityVideo.videoPrivate]] mean the link cannot be used.",
      "Up to 10 skipped sections per video.",
    ],
    related: ["video-select", "video-timing", "video-background", "discord-login"],
  },
  {
    id: "video-timing",
    title: "Fix and share a background video's timing",
    questions: ["영상이랑 노래 싱크가 안 맞아", "영상 싱크 조절", "How do I sync the background video?"],
    access: [
      "Lyrics page toolbar › [[menu.syncAdjust]] › [[syncAdjust.videoTitle]]",
      "Quick sync buttons at the bottom left, switched to the video icon",
    ],
    steps: [
      "While a video plays, open [[menu.syncAdjust]]; [[syncAdjust.videoTitle]] shows where the first lyric starts in the video.",
      "Use the −1000 to +1000 ms buttons until the video matches the song; the change is saved for this song on this device.",
      "Or switch the quick sync buttons at the bottom left to the video icon, or press [ and ] (with Shift 2 s).",
      "Click [[videoSync.share]] to make your start point the video's timing for everyone.",
    ],
    needs: [
      "[[videoSync.share]] needs a Discord login and works for videos people submitted, not automatic matches.",
    ],
    limits: ["[[videoSync.cannotShare]]"],
    related: ["lyrics-sync-offset", "video-select", "video-submit"],
  },
  {
    id: "video-helper",
    title: "Use the Helper program for video backgrounds",
    questions: ["헬퍼 프로그램이 뭐야?", "영상이 재생이 안 돼", "연령 제한 영상 재생", "What is the Helper program?"],
    access: [
      "[[menu.settings]] › [[tabs.appearance]] › [[sections.visualEffects]] › [[settings.videoHelper.label]]",
    ],
    steps: [
      "Click [[settings.videoHelper.download]] to get the Helper app (Windows x64 or Apple Silicon Mac), then install and run it on the same computer.",
      "Turn on [[settings.videoHelper.label]]; the row shows [[settings.videoHelper.status.connected]] when it reaches the Helper.",
      "Videos are then downloaded by the Helper and played locally instead of in YouTube's player.",
      "For age-restricted videos, register a cookies.txt file in the Helper app.",
    ],
    limits: [
      "The Helper is optional and must keep running while you use it; [[videoBackground.helperNotConnected]] means it is not running or not reachable.",
    ],
    settings: ["video-helper-enabled"],
    related: ["video-background", "lyrics-helper"],
  },
  // ─── Fullscreen ────────────────────────────────────────────────────────
  {
    id: "fullscreen",
    title: "Open and close ivLyrics fullscreen",
    questions: ["전체화면 어떻게 해?", "전체화면에서 나가는 법", "전체화면에서 컨트롤러가 안 사라져", "How do I go fullscreen?"],
    access: [
      "Lyrics page toolbar › [[menu.fullscreen]]",
      "F12 ([[settingsAdvanced.playback.fullscreenShortcut.label]])",
      "Spotify's fullscreen button, while [[settingsAdvanced.playback.replaceFullscreenButton.label]] is on",
    ],
    steps: [
      "Click [[menu.fullscreen]] in the toolbar or press F12.",
      "In fullscreen the menu is the [[fullscreen.menuToggleShort]] button at the bottom right; open it for the usual toolbar buttons.",
      "To leave, press Esc (a special view first returns to [[vinyl.presentation.standardLabel]]), press F12 again, or use [[menu.fullscreen]] in the menu.",
      "With [[settingsAdvanced.autoHide.enabled.desc]] on, song controls, clock and track info hide when the mouse stops; [[settingsAdvanced.autoHide.delay.desc]] sets the wait.",
    ],
    limits: [
      "Layout, sizes and what is shown in fullscreen are set in [[menu.settings]] › [[tabs.fullscreen]].",
    ],
    settings: ["fullscreen-key", "fullscreen-auto-hide-ui", "fullscreen-auto-hide-delay"],
    related: ["fullscreen-display", "fullscreen-views", "keyboard-shortcuts", "spotify-button-replacement"],
  },
  {
    id: "fullscreen-display",
    title: "Choose where fullscreen opens (lyrics page, Spotify window or whole monitor)",
    questions: ["전체화면이 모니터 전체로 안 커져", "스포티파이 창 안에서만 전체화면", "How do I make fullscreen fill the monitor?"],
    access: ["[[menu.settings]] › [[tabs.fullscreen]] › [[settingsUi.fullscreenViews.basic]]"],
    steps: [
      "With both switches below off (default), fullscreen covers the Spotify window.",
      "[[settingsAdvanced.fullscreenMode.browserFullscreen.desc]] makes it fill the whole monitor.",
      "[[settingsAdvanced.fullscreenMode.pageUiOnly.desc]] shows the fullscreen layout inside the lyrics page only; it takes priority over the monitor option.",
      "[[settingsAdvanced.fullscreenMode.separateButtons.desc]] adds a second toolbar button, [[menu.fullscreenInPage]] or [[menu.fullscreenScreen]], for the other way.",
    ],
    settings: ["fullscreen-browser-fullscreen", "fullscreen-page-ui-only", "fullscreen-separate-buttons"],
    related: ["fullscreen"],
  },
  {
    id: "fullscreen-views",
    title: "Switch fullscreen views (standard, TV, CD, LP, video stage, motion)",
    questions: ["전체화면에서 LP 모드로 바꾸는 법", "TV 모드가 뭐야?", "CD 모드", "How do I switch to vinyl mode?"],
    access: [
      "In fullscreen: move the mouse to the top center for the view switcher",
      "In fullscreen: click the album art",
    ],
    steps: [
      "Move the mouse to the top center of fullscreen and pick [[vinyl.presentation.standardLabel]], [[vinyl.presentation.compactLabel]], [[vinyl.presentation.vinylLabel]], [[vinyl.presentation.videoLabel]] or [[vinyl.presentation.motionLabel]] (keys 1–5).",
      "Clicking the album art opens the layout set in [[vinyl.presentation.settingsTitle]] while [[vinyl.settings.albumClickOpensModeLabel]] is on; click it again to go back.",
      "T (or [[settingsAdvanced.fullscreenMode.tvMode.desc]]) switches TV mode: album art and track info move to the bottom left so the lyrics get the most room.",
      "Each view has its own options in [[menu.settings]] › [[tabs.fullscreen]] ([[settingsUi.fullscreenViews.normal]], [[settingsUi.fullscreenViews.tv]], [[vinyl.cd.mode]], [[vinyl.mode]]).",
    ],
    limits: [
      "TV mode hides the view switcher; picking a view with 1–5 turns TV mode off.",
      "[[vinyl.presentation.videoLabel]] shows [[settings.videoFallback.label]] when no video can play.",
    ],
    settings: ["fullscreen-tv-mode", "fullscreen-focus-presentation", "fullscreen-album-open-lp"],
    related: ["fullscreen", "motion-lyrics", "song-info"],
  },
  {
    id: "motion-lyrics",
    title: "Motion lyrics (kinetic typography in fullscreen)",
    questions: ["모션 가사 어떻게 봐?", "모션 그래픽 가사가 안 나와", "키네틱 타이포그래피 가사", "How do I open motion lyrics?"],
    access: ["In fullscreen: top-center view switcher › [[vinyl.presentation.motionLabel]] (key 5)"],
    steps: [
      "Play a song with karaoke sync, open fullscreen and pick [[vinyl.presentation.motionLabel]] (or press 5).",
      "The lyrics animate word by word over the song's video or track background, with camera moves directed for the song.",
      "[[vinyl.presentation.motionRedirect]] makes a new direction for this song.",
      "Esc returns to [[vinyl.presentation.standardLabel]].",
      "Tune it in [[menu.settings]] › [[tabs.fullscreen]] › [[vinyl.mode]]: [[vinyl.settings.motionBackgroundLabel]], [[vinyl.settings.motionIntensityLabel]], [[vinyl.settings.motionRotationLabel]], [[vinyl.settings.motionSafeLabel]].",
    ],
    needs: [
      "Real word or character sync shown in [[modes.word]] or [[modes.character]] mode; timing estimated by [[settingsAdvanced.karaokeMode.spotifyFakeKaraoke.label]] does not count.",
      "[[vinyl.settings.animationsLabel]] on, and [[settings.reduceMotion.label]] and the system's reduce-motion setting off.",
      "Optional: an AI provider with the [[settings.aiProviders.supports.motionDirection]] task directs each song; without one a built-in director is used.",
    ],
    limits: ["When a need is missing, the view shows the [[vinyl.presentation.videoLabel]] layout instead."],
    settings: ["fullscreen-motion-background", "fullscreen-motion-intensity", "fullscreen-motion-rotation", "fullscreen-motion-safe", "fullscreen-vinyl-animations", "reduce-motion"],
    related: ["fullscreen-views", "lyrics-mode", "sync-creator", "ai-provider-setup"],
  },
  {
    id: "song-info",
    title: "Read AI research about the current song",
    questions: ["곡 비하인드 보는 법", "곡 정보 보기", "TMI 기능 어디 있어?", "노래 배경 설명", "Where can I read about this song?"],
    access: ["In fullscreen: right-click (or press and hold) the album art"],
    steps: [
      "Open fullscreen and right-click or press and hold the album art.",
      "The first time, confirm with [[research.tokenConsentAgree]]; it uses your AI provider.",
      "The [[research.title]] panel shows background on the song and its lyrics; [[research.regenerate]] writes a new one and [[research.close]] closes it.",
    ],
    needs: [
      "An AI provider with the [[settings.aiProviders.supports.tmi]] task in [[menu.settings]] › [[tabs.aiProviders]]; [[settings.aiProviders.supports.researchWebSearch]] lets it search the web.",
    ],
    limits: ["The album art must be visible in the current fullscreen layout."],
    settings: ["ai-tasks", "tmi-style"],
    related: ["fullscreen", "ai-provider-setup"],
  },
  // ─── More panel ────────────────────────────────────────────────────────
  {
    id: "learning-mode",
    title: "Learn a language from the lyrics (AI learning mode)",
    questions: ["가사로 공부하는 기능", "학습 모드 어떻게 써?", "단어장 어디 있어?", "How do I use learning mode?", "Can I study a language with the lyrics?"],
    access: ["Lyrics page toolbar › [[menu.more]] › [[learningMode.button]]"],
    steps: [
      "Open [[menu.more]] › [[learningMode.button]] while the song's lyrics are shown.",
      "Pick a [[learningMode.difficulty]] and click [[learningMode.generate]].",
      "Read the [[learningMode.tabExplain]], test yourself in [[learningMode.tabQuiz]], and [[learningMode.saveWord]] expressions to the [[learningMode.tabWords]].",
    ],
    needs: ["An AI provider with the [[settings.aiProviders.supports.lyricsStudy]] task."],
    limits: ["Disabled while lyrics are loading or when the song has none."],
    settings: ["ai-tasks"],
    related: ["ai-provider-setup"],
  },
  {
    id: "share-image",
    title: "Save or share lyrics as an image",
    questions: ["가사 이미지로 저장", "가사 카드 공유", "How do I share lyrics as an image?"],
    access: ["Lyrics page toolbar › [[menu.more]] › [[menu.shareImage]]"],
    steps: [
      "Open [[menu.more]] › [[menu.shareImage]].",
      "Under [[shareImage.selectLyrics]] pick up to 10 lines.",
      "Choose a look in [[shareImage.template]] and check the [[shareImage.preview]].",
      "Click [[shareImage.actions.copy]], [[shareImage.actions.download]] or [[shareImage.actions.share]] and confirm with [[shareImage.copyrightConfirm]].",
    ],
    limits: ["Needs the loaded lyrics of the playing song."],
    related: ["open-ivlyrics"],
  },
  {
    id: "marketplace",
    title: "Install add-ons from the marketplace",
    questions: ["에드온 설치하는 법", "마켓플레이스 어디 있어?", "How do I install add-ons?"],
    access: ["Lyrics page toolbar › [[menu.more]] › [[marketplace.title]]"],
    steps: [
      "Open [[menu.more]] › [[marketplace.title]].",
      "Browse lyrics providers, AI providers and styles in [[marketplace.browseTab]]; open one and click [[marketplace.install]].",
      "[[marketplace.installedTab]] lists your add-ons; open one to [[marketplace.update]] or remove it.",
      "[[marketplace.addFromUrl]] installs an add-on from an HTTPS link to a .js file once you confirm you trust the source.",
    ],
    limits: ["Add-ons are made by third parties; install only ones you trust."],
    related: ["lyrics-provider-order", "ai-provider-setup"],
  },
  // ─── Spotify integration and companion apps ────────────────────────────
  {
    id: "nowplaying-panel",
    title: "Lyrics in Spotify's right-side Now Playing panel",
    questions: ["오른쪽 패널에 가사 띄우기", "패널 가사 끄고 싶어", "How do I show lyrics in the Now Playing panel?"],
    access: ["[[menu.settings]] › [[tabs.nowplaying]]"],
    steps: [
      "Turn on [[settingsAdvanced.nowPlayingPanel.enabled.label]] in [[menu.settings]] › [[tabs.nowplaying]] (on by default).",
      "On another Spotify page, open the right-side Now Playing panel; the lyrics card appears under the track details.",
      "Click the card to open the full ivLyrics page.",
      "Fonts, background and border of the card are set in the same menu.",
    ],
    limits: ["The card is hidden while the ivLyrics page itself is open."],
    settings: ["panel-lyrics-enabled", "panel-lyrics-general"],
    related: ["open-ivlyrics", "spotify-button-replacement"],
  },
  {
    id: "spotify-button-replacement",
    title: "Make Spotify's lyrics and fullscreen buttons open ivLyrics",
    questions: ["스포티파이 가사 버튼을 ivLyrics로 바꾸고 싶어", "전체화면 버튼 교체", "How do I replace Spotify's lyrics button?"],
    access: ["[[menu.settings]] › [[tabs.behavior]] › [[settingsAdvanced.playback.title]]"],
    steps: [
      "Turn on [[settingsAdvanced.playback.replaceButton.label]]: Spotify's lyrics button in the playback bar becomes [[playbarButton.label]], which opens ivLyrics (and goes back when ivLyrics is open).",
      "Turn on [[settingsAdvanced.playback.replaceFullscreenButton.label]]: Spotify's fullscreen button opens ivLyrics fullscreen instead.",
    ],
    limits: [
      "Both are off by default. While the lyrics button is replaced, \"ivLyrics\" is hidden from the sidebar.",
    ],
    settings: ["playbar-button", "fullscreen-button"],
    related: ["open-ivlyrics", "fullscreen"],
  },
  {
    id: "overlay",
    title: "Show lyrics over other windows (desktop overlay app)",
    questions: ["게임하면서 가사 띄우기", "다른 창 위에 가사 표시", "오버레이 연결이 안 돼", "Can I show lyrics over other apps?"],
    access: ["[[menu.settings]] › [[tabs.general]] › [[sections.desktopOverlay]]"],
    steps: [
      "Turn on [[overlay.enabled.label]] and click [[overlay.download]] to get the ivLyrics Overlay app (Windows x64 or Apple Silicon Mac).",
      "Install and run the Overlay app on the same computer.",
      "Use the same [[overlay.port.label]] in both (15000 by default).",
      "Play a song with synced lyrics; the section shows [[overlay.status.connected]].",
      "[[overlay.trimMetadata.label]] shortens the titles and artists sent to the overlay.",
    ],
    limits: ["The overlay is a separate app and does not need the Helper."],
    settings: ["overlay-enabled", "overlay-trim-metadata"],
    related: ["lyrics-helper"],
  },
  {
    id: "lyrics-helper",
    title: "Send lyrics to other programs (stream overlays, bots) through the Helper",
    questions: ["방송 화면에 가사 띄우기", "외부 프로그램으로 가사 보내기", "How do I send lyrics to OBS or another program?"],
    access: ["[[menu.settings]] › [[tabs.behavior]] › [[settings.lyricsHelper.sectionTitle]]"],
    steps: [
      "Get the Helper with [[settings.lyricsHelper.download]], install it and keep it running.",
      "Turn on [[settings.lyricsHelper.label]]; it shows [[settings.lyricsHelper.status.connected]] when the Helper is reachable.",
      "Point the other program at the Helper's local lyrics API (port 15123 on the same computer).",
    ],
    settings: ["lyrics-helper-enabled"],
    related: ["video-helper", "overlay"],
  },
  // ─── Settings, providers and account ───────────────────────────────────
  {
    id: "open-settings",
    title: "Open settings and find an option",
    questions: ["설정은 어디서 열어?", "설정 검색하는 법", "Where are the ivLyrics settings?"],
    access: [
      "Lyrics page toolbar › [[menu.settings]]",
      "Press S on the lyrics page",
      "Spotify profile menu › \"ivLyrics config\" (while ivLyrics is open)",
    ],
    steps: [
      "Click [[menu.settings]] in the toolbar (or press S).",
      "Type in [[search.placeholder]] (Ctrl+K, ⌘K or / jumps there) and pick a result to go to that option.",
      "The last search row, [[settingsUi.assistant.askAi]], hands your words to [[tabs.assistant]].",
      "Menus: [[tabs.assistant]], [[tabs.general]], [[tabs.lyricsProviders]], [[tabs.aiProviders]], [[tabs.appearance]], [[tabs.performance]], [[tabs.behavior]], [[tabs.fullscreen]], [[tabs.nowplaying]], [[tabs.advanced]], [[tabs.debug]], [[tabs.about]].",
      "Press Esc to close settings.",
    ],
    related: ["settings-assistant", "open-ivlyrics"],
  },
  {
    id: "settings-assistant",
    title: "Use the AI assistant in settings",
    questions: ["AI 어시스턴트가 안 돼", "어시스턴트 쓰려면 뭐가 필요해?", "How do I use the settings assistant?"],
    access: ["[[menu.settings]] › [[tabs.assistant]]"],
    steps: [
      "In [[tabs.aiProviders]] › [[settingsUi.sections.aiTasks.title]], turn on an AI provider and its [[settings.aiProviders.supports.settingsAssistant]] task.",
      "Open [[tabs.assistant]] and describe what you want to change, or ask how to do something.",
      "Changed settings appear as rows under the reply; [[settingsUi.assistant.undo]] puts back what that reply changed.",
    ],
    limits: [
      "The input stays disabled until a provider has the [[settings.aiProviders.supports.settingsAssistant]] task; Google Translate, Bing Translate and Pronunciation Lab cannot do it.",
    ],
    settings: ["ai-tasks", "ai-connections"],
    related: ["ai-provider-setup", "open-settings"],
  },
  {
    id: "ai-provider-setup",
    title: "Set up AI providers (API keys, tasks, order)",
    questions: ["API 키 어디에 넣어?", "Gemini 키 넣는 곳", "AI 제공자 설정", "무료로 번역 쓸 수 있어?", "Where do I enter my API key?"],
    access: ["[[menu.settings]] › [[tabs.aiProviders]]"],
    steps: [
      "In [[settingsUi.sections.aiConnections.title]], open a provider (for example Google Gemini, OpenAI ChatGPT or Anthropic Claude), enter its [[settings.aiProviders.apiKey]] and model, and press [[settings.aiProviders.testConnection]].",
      "In [[settingsUi.sections.aiTasks.title]], turn the provider on and choose its tasks, such as [[settings.aiProviders.supports.translate]] and [[settings.aiProviders.supports.pronunciation]].",
      "Drag providers to set the order: the top one is tried first, and failures fall back to the next.",
      "Local AI: download a model in its card and turn it on; it translates on your computer without a key.",
    ],
    needs: [
      "Google Translate and Bing Translate (translation) and Pronunciation Lab (pronunciation) need no key and are on by default; other AI providers need your own API key.",
    ],
    limits: [
      "Local AI only translates and downloads a model of about 1–2 GB.",
      "Each provider supports different tasks.",
    ],
    settings: ["ai-tasks", "ai-connections", "ai-request"],
    related: ["translation-pronunciation", "settings-assistant", "ai-errors"],
  },
  {
    id: "lyrics-provider-order",
    title: "Choose and order lyrics providers",
    questions: ["가사 제공자 순서 바꾸기", "특정 가사 제공자 끄기", "How do I change the lyrics source order?"],
    access: ["[[menu.settings]] › [[tabs.lyricsProviders]]"],
    steps: [
      "In [[settings.lyricsProviders.title]], switch each provider on or off.",
      "Drag a provider by its handle (or focus the handle and press ↑/↓); the top provider is tried first.",
      "[[settings.lyricsProviders.allowedTypes]] sets which lyric types (character, word, synced, plain) each provider may supply.",
      "[[settingsUi.sections.lyricsLookup.title]] has two switches that can put community sync data or the best lyric type ahead of this order.",
    ],
    limits: [
      "To change the provider for one song only, use [[menu.currentTrack]] › [[menu.lyricsProviderSelect]].",
    ],
    settings: ["lyrics-provider-list", "prefer-sync-data-provider", "prefer-lyrics-type-over-provider-order"],
    related: ["lyrics-provider-per-song", "troubleshooting"],
  },
  {
    id: "discord-login",
    title: "Sign in with Discord (account linking)",
    questions: ["디스코드 로그인 어디서 해?", "로그인 하는 법", "닉네임 바꾸기", "How do I log in?"],
    access: ["[[menu.settings]] › [[tabs.about]] › [[settingsAdvanced.aboutTab.account.title]]"],
    steps: [
      "Click [[settingsAdvanced.aboutTab.account.loginButton]] and approve ivLyrics in the browser.",
      "Return to Spotify; the linked account appears in [[settingsAdvanced.aboutTab.account.title]].",
      "Set your [[settingsAdvanced.aboutTab.account.nickname.label]] or turn on [[settingsAdvanced.aboutTab.account.creatorPrivacy.title]] there.",
    ],
    needs: [
      "Login is needed to submit karaoke sync, add or edit community videos, share video timing, edit your creator profile and use cloud sync.",
    ],
    settings: ["about-account"],
    related: ["sync-creator", "video-submit", "creator-profile", "backup-restore"],
  },
  {
    id: "backup-restore",
    title: "Back up, move or reset settings (export, presets, cloud sync)",
    questions: ["설정 백업하는 법", "다른 PC로 설정 옮기기", "설정 초기화", "How do I back up my settings?"],
    access: ["[[menu.settings]] › [[tabs.advanced]]"],
    steps: [
      "[[settingsAdvanced.exportImport.export.label]] saves your settings to a file; [[settingsAdvanced.exportImport.import.label]] loads one and reloads ivLyrics.",
      "[[settingsAdvanced.dbExportImport.export.label]] and [[settingsAdvanced.dbExportImport.import.label]] do the same for stored data: lyrics and translation cache, chosen videos and per-song choices.",
      "[[settingsAdvanced.settingsPresets.title]]: name a preset, click [[settingsAdvanced.settingsPresets.saveCurrent]], and [[settingsAdvanced.settingsPresets.apply]] it later.",
      "[[settingsAdvanced.cloudSync.title]] (signed-in monthly supporters): [[settingsAdvanced.cloudSync.upload]] on one PC, then [[settingsAdvanced.cloudSync.refresh]] and [[settingsAdvanced.cloudSync.download]] on the other.",
      "[[settingsAdvanced.resetSettings.reset.label]] › [[settingsAdvanced.resetSettings.reset.button]] restores every setting to its default after a confirmation.",
    ],
    limits: [
      "An exported settings file can contain your API keys; do not share it.",
      "Cloud sync leaves out API keys, login, caches, presets and per-song offsets.",
      "A reset cannot be undone; export first.",
    ],
    settings: ["export-settings", "import-settings", "export-db", "import-db", "settings-presets", "cloud-sync", "reset-settings"],
    related: ["discord-login", "setup-wizard"],
  },
  // ─── Install, update and troubleshooting ───────────────────────────────
  {
    id: "update-ivlyrics",
    title: "Update ivLyrics",
    questions: ["업데이트 어떻게 해?", "최신 버전인지 확인하는 법", "How do I update ivLyrics?"],
    access: ["[[menu.settings]] › [[tabs.about]] › [[settingsAdvanced.aboutTab.update.title]]"],
    steps: [
      "Click [[settingsAdvanced.aboutTab.update.checkUpdate.button]] to compare your version with the latest release.",
      "Click [[settingsAdvanced.aboutTab.update.protocol.button]] to start the ivLyrics updater (allow the browser to open it if asked), and reopen Spotify if it does not restart by itself.",
      "If the button does nothing, run the install command again. Windows PowerShell: iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1 | iex — macOS/Linux Terminal: curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash",
    ],
    limits: [
      "The one-click updater is registered by the install command; a manual install is updated by replacing the folder from a new release.",
    ],
    settings: ["check-update", "open-updater"],
    related: ["uninstall-ivlyrics", "troubleshooting"],
  },
  {
    id: "setup-wizard",
    title: "The first-run setup guide",
    questions: ["처음 설정 화면 다시 볼 수 있어?", "설정 마법사 다시 열기", "Can I run the setup wizard again?"],
    access: ["Opens by itself the first time the ivLyrics page opens"],
    steps: [
      "Choose the language and [[settings.translationTargetLanguage.label]], then the look ([[setupWizard.theme.alignment]], [[setupWizard.theme.background]]) and playback options.",
      "[[setupWizard.complete.startNow]] saves and reloads; [[setupWizard.complete.openSettings]] also opens settings afterwards.",
      "[[setupWizard.apiKey.skip]] closes it for now; it opens again next time until you finish it.",
    ],
    limits: [
      "There is no button to reopen it after finishing, and every choice in it can be changed in [[menu.settings]]. [[settingsAdvanced.resetSettings.reset.label]] shows it again but resets all settings.",
    ],
    settings: ["language", "translate:target-language"],
    related: ["open-settings", "backup-restore"],
  },
  {
    id: "uninstall-ivlyrics",
    title: "Uninstall ivLyrics",
    questions: ["ivLyrics 삭제 방법", "ivLyrics 지우고 싶어", "제거 명령어", "How do I uninstall ivLyrics?", "How do I remove ivLyrics?"],
    access: ["Windows PowerShell", "macOS or Linux Terminal"],
    steps: [
      "Windows (PowerShell): iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.ps1 | iex",
      "macOS or Linux (Terminal): curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.sh | bash",
      "Read the prompts; if it asks to remove Spicetify completely, decline to keep your other themes and extensions.",
    ],
    limits: ["Export your settings first if you may reinstall later."],
    related: ["backup-restore", "update-ivlyrics"],
  },
  {
    id: "troubleshooting",
    title: "Lyrics or ivLyrics not showing, and reporting bugs",
    questions: ["가사가 안 나와", "사이드바에 ivLyrics가 없어", "스포티파이 업데이트 후에 안 돼", "버그 제보는 어디서 해?", "Lyrics don't show up"],
    access: [
      "[[menu.settings]] › [[tabs.lyricsProviders]]",
      "[[menu.settings]] › [[tabs.behavior]] › [[settingsAdvanced.cacheManagement.title]]",
    ],
    steps: [
      "No lyrics: try another song, then check which providers are on in [[tabs.lyricsProviders]]; not every song has lyrics anywhere.",
      "Wrong or outdated lyrics: pick another source in [[menu.currentTrack]] › [[menu.lyricsProviderSelect]], or clear the song's saved data with [[settingsAdvanced.cacheManagement.localCache.clearCurrent]] in [[settingsAdvanced.cacheManagement.title]].",
      "\"ivLyrics\" missing from the sidebar: reopen Spotify and run \"spicetify apply\"; after a manual install, check that the folder is not nested twice.",
      "Spotify broke after a Spotify update: update Spicetify with its official guide and apply it again.",
      "Still broken: copy the details from [[menu.settings]] › [[tabs.debug]] › [[settingsAdvanced.debugTab.copyToClipboard]] and report it in the ivLyrics Discord bug-report channel or GitHub issues with your OS, versions and the song link.",
    ],
    related: ["lyrics-provider-order", "lyrics-provider-per-song", "performance", "ai-errors"],
  },
  {
    id: "performance",
    title: "Fix a slow or stuttering lyrics page",
    questions: ["렉 걸려", "가사 화면이 버벅여", "가사가 뚝뚝 끊겨", "앱이 너무 느려", "CPU를 너무 많이 먹어", "ivLyrics is lagging"],
    access: ["[[menu.settings]] › [[tabs.performance]]"],
    steps: [
      "Lower [[settingsAdvanced.performance.frameRate.label]] or turn on [[settings.reduceMotion.label]] in [[tabs.performance]].",
      "Compare with a lighter background such as [[settings.gradientBackground.label]] in [[tabs.appearance]] › [[sections.visualEffects]]; video and heavy blur cost the most.",
      "Turn off effects you do not need under [[settingsAdvanced.performance.visualCost.title]] and preloading under [[settingsAdvanced.performance.backgroundWork.title]].",
      "With a video background, the Helper can take over video playback.",
    ],
    settings: ["performance-frame-rate", "reduce-motion", "__background-mode", "performance-visual-cost", "performance-background-work"],
    related: ["video-helper", "troubleshooting"],
  },
  {
    id: "ai-errors",
    title: "Translation, pronunciation or other AI requests fail",
    questions: ["번역이 안 돼", "API 오류 400이 떠", "429 에러", "발음이 안 나와", "AI translation fails"],
    access: ["[[menu.settings]] › [[tabs.aiProviders]] › [[settingsUi.sections.aiConnections.title]]"],
    steps: [
      "Open the provider in [[settingsUi.sections.aiConnections.title]] and press [[settings.aiProviders.testConnection]].",
      "HTTP 401 or 403: the API key is wrong or lacks permission. 400 or 404: the model or an option is not supported; pick another model. 429: rate limit or quota; wait or check billing.",
      "Make sure the provider is on and has the task in [[settingsUi.sections.aiTasks.title]]; providers are tried from the top.",
      "No pronunciation: Google and Bing only translate; give the [[settings.aiProviders.supports.pronunciation]] task to Pronunciation Lab or an AI provider.",
      "Wrong language: check [[settings.translationTargetLanguage.label]] in [[tabs.general]], then regenerate the song.",
    ],
    settings: ["ai-connections", "ai-tasks", "ai-provider-retry-count"],
    related: ["ai-provider-setup", "regenerate-translation"],
  },
]);

// [[i18n.key]] or [[i18n.key|Fallback]]
const UI_NAME_PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;
const plainText = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const listOf = (value) => (value === undefined ? [] : [].concat(value)).filter(Boolean);

export const USAGE_GUIDE_TOPIC_BY_ID = new Map(USAGE_GUIDE_TOPICS.map((topic) => [topic.id, topic]));

/** Every [[i18n.key]] a topic uses, with its fallback text when one is given. */
export function listUsageGuideUiNames(topic) {
  const names = [];
  for (const text of [topic.title, ...listOf(topic.access), ...listOf(topic.steps), ...listOf(topic.needs), ...listOf(topic.limits)]) {
    for (const match of String(text ?? "").matchAll(UI_NAME_PATTERN)) names.push({ key: match[1].trim(), fallback: match[2] });
  }
  return names;
}

/** Replaces each [[i18n.key]] with the quoted name the user sees. */
export function renderUsageGuideText(text, translate) {
  return String(text ?? "").replace(UI_NAME_PATTERN, (_match, key, fallback) => {
    const value = translate(key.trim());
    const label = typeof value === "string" ? plainText(value) : "";
    return `"${label || plainText(fallback) || key.trim()}"`;
  });
}

function renderTopic(topic, render) {
  const lines = [`## how-to ${topic.id}: ${render(topic.title)}`];
  if (listOf(topic.questions).length) lines.push(`Asked as: ${listOf(topic.questions).join(" | ")}`);
  for (const access of listOf(topic.access)) lines.push(`Where: ${render(access)}`);
  listOf(topic.steps).forEach((step, index) => lines.push(`${index + 1}. ${render(step)}`));
  for (const need of listOf(topic.needs)) lines.push(`Needs: ${render(need)}`);
  for (const limit of listOf(topic.limits)) lines.push(`Limit: ${render(limit)}`);
  if (listOf(topic.settings).length) lines.push(`Related settings: ${listOf(topic.settings).join(", ")}`);
  if (listOf(topic.related).length) lines.push(`See also: ${listOf(topic.related).join(", ")}`);
  return lines.join("\n");
}

/** Full text of the given topics, in that order, with UI names in the interface language. */
export function renderUsageGuideTopics(ids, { translate }) {
  const render = (text) => renderUsageGuideText(text, translate);
  return listOf(ids).map((id) => USAGE_GUIDE_TOPIC_BY_ID.get(id)).filter(Boolean)
    .map((topic) => renderTopic(topic, render)).join("\n");
}

/**
 * One line per topic, for the system prompt after the settings catalog. It
 * only changes with the interface language, so providers that cache prompt
 * prefixes reuse it together with the catalog.
 */
export function buildUsageGuideIndex({ translate }) {
  const render = (text) => renderUsageGuideText(text, translate);
  return [
    "HOW-TO GUIDE INDEX (topics about using ivLyrics outside the settings rows; the request carries the full text of the topics that fit the message under HOW-TO TOPICS)",
    ...USAGE_GUIDE_TOPICS.map((topic) => `- ${topic.id}: ${render(topic.title)}`),
  ].join("\n");
}

/** The whole guide as one text, for size checks and reading; requests carry single topics. */
export function buildUsageGuideCatalog({ translate }) {
  return [
    "HOW-TO GUIDE (using ivLyrics outside the settings rows; quoted names are exactly what the user sees)",
    renderUsageGuideTopics(USAGE_GUIDE_TOPICS.map((topic) => topic.id), { translate }),
  ].join("\n");
}

// ─── Choosing the topics for a message ──────────────────────────────────
// Plain word overlap, weighted by where a word appears in a topic (its
// questions count most) and by how rare it is across topics: a word found in
// half of the topics or more counts for nothing, and question words that
// say nothing about a topic ("how do I", "어떻게", "싶어") are skipped.
// Korean, Japanese and Chinese have no reliable word boundaries ("싱크를"
// should still find "싱크"), so they are compared in character pairs, and a
// Korean noun also counts without its particle ("렉이" finds "렉"). UI names
// are read in the interface language, which lets questions in that language
// match too. When the choice misses, the AI asks for topics by id and the
// session sends them in a second request (settingsAssistantSession.mjs).
// To make a question find its topic, add it (or its wording) to the topic's
// `questions` and to the topic-choice table in tests/usage_guide.test.mjs.

/** Topics chosen from the message itself. */
export const USAGE_GUIDE_TOPICS_PER_MESSAGE = 3;
// Topics the previous answer was given, kept for follow-ups ("and then?").
const CARRIED_TOPICS = 2;
// A topic is sent when it reaches this share of the best score and this score.
const RELATIVE_TOPIC_SCORE = 0.4;
const MIN_TOPIC_SCORE = 4;
const PREVIOUS_MESSAGE_WEIGHT = 0.5;
const FIELD_WEIGHTS = Object.freeze([["questions", 3], ["title", 2], ["names", 2], ["text", 1]]);
// Runs of Korean, Chinese or Japanese letters, or runs of other letters and
// digits: "ivLyrics가" and "API키" are two words each.
const WORD_PATTERN = /(?:(?=[\p{L}\p{N}])[\p{scx=Hang}\p{scx=Hani}\p{scx=Hira}\p{scx=Kana}])+|(?:(?![\p{scx=Hang}\p{scx=Hani}\p{scx=Hira}\p{scx=Kana}])[\p{L}\p{N}])+/gu;
const PAIRED_SCRIPT = /[\p{scx=Hang}\p{scx=Hani}\p{scx=Hira}\p{scx=Kana}]/u;
// Particles that follow a Korean noun, longest first.
const KOREAN_PARTICLES = Object.freeze(["에서", "으로", "에게", "한테", "까지", "부터", "처럼", "이랑", "이", "가", "을", "를", "은", "는", "에", "도", "만", "로", "와", "과", "의", "랑"]);
// Question and filler words, as they are compared: English words before the
// plural "s" is removed, Korean character pairs and one-character words.
const STOP_TERMS = new Set([
  "an", "the", "to", "of", "for", "in", "on", "at", "by", "it", "is", "are", "be", "do", "does", "did", "can", "could", "would",
  "should", "will", "how", "what", "where", "when", "why", "which", "who", "there", "this", "that", "my", "me", "you", "your",
  "with", "and", "or", "not", "want", "need", "please", "way", "some", "any",
  "어떻", "떻게", "어디", "디서", "디에", "싶어", "싶은", "싶다", "은데", "는데", "있어", "있나", "있을", "하는", "하고", "해요",
  "어요", "나요", "세요", "방법", "알려", "려줘", "뭐야", "려면", "너무",
  "안", "못", "좀", "더", "다", "잘", "왜", "뭐", "또", "그", "이", "저", "내", "제", "나", "수", "할", "거", "것", "게", "건",
  "걸", "해", "돼", "법", "곳", "때",
]);

/** Search terms of a text: words, or character pairs in Korean, Japanese and Chinese. */
export function readUsageGuideSearchTerms(text) {
  const terms = new Set();
  const add = (term) => {
    if (!STOP_TERMS.has(term)) terms.add(term);
  };
  const addPairs = (characters) => {
    // A one-character word ("렉", "앱", "키") is its own term.
    if (characters.length === 1) add(characters[0]);
    for (let index = 0; index + 1 < characters.length; index++) add(characters[index] + characters[index + 1]);
  };
  for (const [word] of String(text ?? "").normalize("NFKC").toLowerCase().matchAll(WORD_PATTERN)) {
    if (PAIRED_SCRIPT.test(word)) {
      const characters = Array.from(word);
      addPairs(characters);
      const particle = KOREAN_PARTICLES.find((ending) => word.length > ending.length && word.endsWith(ending));
      if (particle) addPairs(characters.slice(0, characters.length - particle.length));
    } else if (word.length > 1 && !STOP_TERMS.has(word)) {
      // "videos" and "video", "settings" and "setting" are the same search word.
      terms.add(word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
    }
  }
  return terms;
}

function buildSearchIndex(translate) {
  const render = (text) => renderUsageGuideText(text, translate);
  const topics = USAGE_GUIDE_TOPICS.map((topic) => {
    const fields = {
      questions: listOf(topic.questions).join(" "),
      title: render(topic.title) + " " + topic.id.replace(/-/g, " "),
      names: listUsageGuideUiNames(topic).map(({ key, fallback }) => {
        const value = translate(key);
        return (typeof value === "string" && plainText(value)) || plainText(fallback);
      }).join(" "),
      text: [...listOf(topic.access), ...listOf(topic.steps), ...listOf(topic.needs), ...listOf(topic.limits)].map(render).join(" "),
    };
    const weights = new Map();
    for (const [field, weight] of FIELD_WEIGHTS) {
      for (const term of readUsageGuideSearchTerms(fields[field])) {
        if ((weights.get(term) || 0) < weight) weights.set(term, weight);
      }
    }
    return { id: topic.id, weights };
  });
  const topicCounts = new Map();
  for (const { weights } of topics) {
    for (const term of weights.keys()) topicCounts.set(term, (topicCounts.get(term) || 0) + 1);
  }
  // Rarity of a term (BM25's inverse document frequency); 0 for terms that
  // half of the topics or more contain.
  const rarity = (term) => {
    const count = topicCounts.get(term) || 0;
    return Math.max(0, Math.log((topics.length - count + 0.5) / (count + 0.5)));
  };
  return { topics, rarity };
}

/** Topics that share words with the message, best first, with their scores. */
export function rankUsageGuideTopics({ message, previousMessage = "", translate }) {
  const { topics, rarity } = buildSearchIndex(translate);
  const query = new Map();
  for (const term of readUsageGuideSearchTerms(previousMessage)) query.set(term, PREVIOUS_MESSAGE_WEIGHT);
  for (const term of readUsageGuideSearchTerms(message)) query.set(term, 1);
  return topics.map(({ id, weights }) => {
    let score = 0;
    for (const [term, queryWeight] of query) {
      const weight = weights.get(term);
      if (weight) score += queryWeight * weight * rarity(term);
    }
    return { id, score };
  }).filter((entry) => entry.score > 0).sort((first, second) => second.score - first.score);
}

/**
 * Topic ids to send with a message: the best matches for it (the previous user
 * message counts as weaker context) followed by the topics the previous answer
 * was given, so a follow-up such as "what is step 2?" keeps its topic.
 * @param {{ message: string, history?: Object[], translate: Function }} input
 *   history holds the chat messages; assistant messages list their topics in `guide`.
 * @returns {string[]}
 */
export function selectUsageGuideTopics({ message, history = [], translate }) {
  const earlier = [...history].reverse();
  const previousMessage = earlier.find((item) => item.role === "user")?.text || "";
  const ranked = rankUsageGuideTopics({ message, previousMessage, translate });
  const needed = Math.max(MIN_TOPIC_SCORE, (ranked[0]?.score || 0) * RELATIVE_TOPIC_SCORE);
  const chosen = ranked.filter((entry) => entry.score >= needed).slice(0, USAGE_GUIDE_TOPICS_PER_MESSAGE).map((entry) => entry.id);
  const carried = listOf(earlier.find((item) => item.role === "assistant")?.guide)
    .filter((id) => USAGE_GUIDE_TOPIC_BY_ID.has(id) && !chosen.includes(id));
  return [...chosen, ...carried.slice(0, CARRIED_TOPICS)];
}

