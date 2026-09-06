// English language file for ivLyrics
window.LANG_EN = {
  "meta": {
    "language": "English",
    "code": "en",
    "author": "ivLyrics"
  },
  "tabs": {
    "general": "General",
    "appearance": "Appearance",
    "performance": "Performance",
    "behavior": "Behavior",
    "advanced": "Advanced",
    "lyricsProviders": "Lyrics Providers",
    "aiProviders": "AI Providers",
    "fullscreen": "Fullscreen",
    "nowplaying": "Panel Lyrics",
    "debug": "Debug",
    "about": "About",
    "searchResults": "Search Results"
  },
  "search": {
    "placeholder": "Search settings...",
    "noResults": "No results found",
    "noResultsDesc": "Try different keywords",
    "resultCount": "{count} results",
    "clear": "Clear",
    "inSection": "in {section}"
  },
  "settingsUi": {
    "groups": {
      "core": "Workspace",
      "display": "Display",
      "text": "Text Layers",
      "playback": "Playback & Sync",
      "surfaces": "Display",
      "providers": "Providers",
      "fullscreen": "Fullscreen",
      "panel": "Panel Lyrics",
      "system": "System"
    },
    "nav": {
      "badges": {
        "workspace": "Core",
        "typography": "Text",
        "performance": "FPS",
        "behavior": "Flow",
        "surface": "View",
        "providers": "Source",
        "system": "Ops"
      },
      "generalDesc": "Language, desktop overlay, and core workspace defaults.",
      "appearanceDesc": "Backgrounds, typography, motion, and screen composition.",
      "performanceDesc": "Frame rate, motion, and visual cost controls.",
      "lyricsDesc": "Sync behavior, translation, karaoke, and lyric processing.",
      "fullscreenDesc": "Fullscreen playback layout and remote-view presentation.",
      "nowplayingDesc": "Panel lyrics layout, scale, and background treatment.",
      "lyricsProvidersDesc": "Lyrics source priorities, tokens, and provider controls.",
      "aiProvidersDesc": "AI translation and processing provider configuration.",
      "advancedDesc": "Detection, cache, helper apps, and advanced controls.",
      "debugDesc": "Diagnostics, recovery utilities, and troubleshooting tools.",
      "aboutDesc": "Version details, update checks, credits, and patch notes."
    },
    "background": {
      "none": "Minimal",
      "noneDesc": "Keep the lyrics surface clean with no extra background effect.",
      "layout": "Layout & Motion",
      "finetune": "Background Details"
    },
    "theme": {
      "light": "Switch to light mode",
      "dark": "Switch to dark mode",
      "lightShort": "Light",
      "darkShort": "Dark",
      "auto": "Use system theme",
      "autoShort": "Auto",
      "selector": "Settings theme"
    }
  },
  "sections": {
    "language": "Language",
    "visualEffects": "Visual Effects",
    "visualEffectsSubtitle": "Customize the visual elements of the lyrics screen",
    "syncMode": "Sync Mode",
    "syncModeSubtitle": "Configure how lyrics synchronization works",
    "typography": "Typography",
    "typographySubtitle": "Adjust the style of the lyrics text",
    "textShadow": "Text Shadow",
    "textShadowSubtitle": "Add shadow effects to the lyrics text",
    "updateCheck": "Update Check",
    "backgroundOpacity": "Background Opacity",
    "contentWidth": "Content Width",
    "japaneseConversion": "Japanese Conversion",
    "displayContent": "Display Content",
    "autoTranslation": "Auto Translation",
    "lyrics": "Lyrics",
    "playBar": "Playbar Button",
    "autoScroll": "Auto Scroll",
    "animation": "Animation",
    "karaoke": "Karaoke",
    "syncedLyricsContent": "Synced Lyrics Content",
    "unsyncedLyricsContent": "Plain Text Lyrics Content",
    "customPreview": "Custom Preview",
    "trackSyncInfo": "Track Sync Info",
    "customDatabase": "Custom Database",
    "debug": "Debug",
    "github": "GitHub",
    "maintainers": "Maintainers",
    "contributors": "Contributors",
    "fadWarningTitle": "Full Screen Extension Detected",
    "fadWarningDesc": "Not supported while using a Full Screen extension.",
    "fadWarningTip": "Please change the alignment settings within the Full Screen extension itself.",
    "desktopOverlay": "Desktop Overlay",
    "desktopOverlaySubtitle": "Display lyrics as an overlay on your desktop",
    "motion": "Motion"
  },
  "overlay": {
    "enabled": {
      "label": "Enable Desktop Overlay",
      "desc": "Send lyrics to the desktop overlay app"
    },
    "trimMetadata": {
      "label": "Shorten titles and artists",
      "desc": "Remove text in parentheses, square brackets, and after ' - ' from titles and artists sent to the overlay, just like fullscreen. Applies to the current and next track."
    },
    "port": {
      "label": "Connection Port",
      "desc": "Port number to connect with the overlay app (1024-65535)"
    },
    "portSaved": "Port saved",
    "portInvalid": "Invalid port number (1024-65535)",
    "status": {
      "connected": "✓ Connected",
      "disconnected": "Disconnected",
      "checking": "Checking..."
    },
    "openApp": "Open App",
    "download": "Download App",
    "downloadDesc": "Download the overlay app if it is not installed"
  },
  "settings": {
    "language": {
      "label": "Language",
      "desc": "Select the language for the extension"
    },
    "translationTargetLanguage": {
      "label": "Translation Target Language",
      "desc": "Language to translate lyrics into (separate from interface language)",
      "options": {
        "auto": "Same"
      }
    },
    "culturalAnnotations": {
      "label": "Cultural context explanations",
      "desc": "Show AI-generated explanations only under lyric lines whose cultural background would otherwise be lost in translation. Uses the translation target language. Shown on the normal lyrics page, regular fullscreen, and LP mode, but not in Panel Lyrics.",
      "fontFamily": { "label": "Explanation font", "desc": "Choose the font used for cultural context explanations." },
      "fontSize": { "label": "Explanation font size", "desc": "Adjust the size of the explanation text." },
      "fontWeight": { "label": "Explanation font weight", "desc": "Adjust the weight of the explanation text." },
      "opacity": { "label": "Explanation opacity", "desc": "Adjust the opacity of the explanation text." }
    },
    "alignment": {
      "label": "Alignment",
      "desc": "Select the alignment of the lyrics text",
      "options": {
        "left": "Left",
        "center": "Center",
        "right": "Right"
      }
    },
    "noise": {
      "label": "Noise Overlay",
      "desc": "Add a film grain effect to the background"
    },
    "albumBgBlur": {
      "label": "Album Background Blur",
      "desc": "Adjust the blur intensity of the album background"
    },
    "reduceMotion": {
      "label": "Reduce Motion",
      "desc": "Reduce interface animations."
    },
    "blurGradientBackground": {
      "label": "Blur Gradient Background",
      "desc": "Apply a blur gradient background by extracting colors from the album art"
    },
    "colorful": {
      "label": "Colorful Background",
      "desc": "Enable a dynamic background based on album colors"
    },
    "gradientBackground": {
      "label": "Album Cover Background",
      "desc": "Use the current album cover as the background (May not work properly in fullscreen mode)"
    },
    "solidBackground": {
      "label": "Solid Background",
      "desc": "Use a custom solid color as the background"
    },
    "solidBackgroundColor": {
      "label": "Solid Background Color",
      "desc": "Select the color for the solid background"
    },
    "videoBackground": {
      "label": "Video Background",
      "desc": "Use a YouTube video as the background (Beta)"
    },
    "videoHelper": {
      "label": "Use Helper Program",
      "desc": "Download and play YouTube videos locally. Allows viewing videos without logging in.",
      "info": "💡 YouTube video not loading?\n\nGoogle restricts some users from playing YouTube videos without logging in.\nUsing the Helper Program allows you to load them normally.",
      "download": "Download Helper",
      "checkConnection": "Check Connection",
      "connected": "Connected to Helper Program",
      "disconnected": "Cannot connect to Helper Program",
      "status": {
        "connected": "Connected",
        "disconnected": "Disconnected",
        "checking": "Checking..."
      }
    },
    "lyricsHelper": {
      "label": "Use Lyrics Helper",
      "desc": "Send track and lyrics info to the Helper. Allows external programs to access via API.",
      "sectionTitle": "Helper Integration",
      "sectionSubtitle": "Send lyrics to external Helper app",
      "info": "You can display synced lyrics in external programs via the Helper app",
      "download": "Download Helper",
      "connected": "Helper Connected",
      "disconnected": "Helper Disconnected",
      "status": {
        "checking": "Checking...",
        "connected": "Connected",
        "disconnected": "Disconnected"
      }
    },
    "videoBlur": {
      "label": "Video Blur",
      "desc": "Adjust the blur intensity applied to the video background (0-40px)"
    },
    "videoCover": {
      "label": "Video Fill Screen",
      "desc": "Zoom the video to fill the screen (Top/bottom or sides may be cropped)"
    },
    "videoScale": {
      "label": "Video Scale",
      "desc": "Adjust the video background zoom level (50-200%)"
    },
    "backgroundBrightness": {
      "label": "Background Brightness",
      "desc": "Adjust the brightness level of the background (0-100%)"
    },
    "solidBackgroundWarning": "Background brightness adjustment does not apply when using Solid Background.",
    "updateCheck": {
      "label": "Update Check",
      "desc": "Automatically check for new updates",
      "info": "Updates are checked every 24 hours at most."
    },
    "backgroundOpacity": {
      "label": "Cover Background Opacity",
      "desc": "Set the opacity of the cover"
    },
    "contentWidth": {
      "label": "Content Width",
      "desc": "Set the width of the content in fullscreen and non-fullscreen modes"
    },
    "japaneseConversion": {
      "label": "Japanese Conversion",
      "desc": "Set the conversion format for Japanese lyrics",
      "info": "This setting applies only to Synced and Unsynced lyrics. It does not work for Karaoke lyrics.",
      "options": {
        "disabled": "Disabled",
        "romaji": "Romaji",
        "furigana": "Furigana",
        "hiragana": "Hiragana",
        "katakana": "Katakana"
      }
    },
    "displayContent": {
      "label": "Display Content",
      "desc": "Display other content along with the lyrics",
      "options": {
        "disabled": "Disabled",
        "romanization": "Pronunciation (Romanization)",
        "translation": "Translation"
      }
    },
    "autoTranslation": {
      "label": "Auto Translation",
      "desc": "Automatically provide translations if none are available",
      "options": {
        "disabled": "Disabled (Default)",
        "google": "Google Translate",
        "microsoft": "Microsoft Translator"
      }
    },
    "lyricsMode": {
      "label": "Lyrics Mode",
      "options": {
        "karaoke": "Karaoke",
        "synced": "Synced",
        "unsynced": "Plain Text",
        "genius": "Genius"
      }
    },
    "playBarButton": {
      "label": "Playbar Button",
      "desc": "Display a lyrics button on the playbar",
      "options": {
        "disabled": "Disabled",
        "normal": "Normal",
        "fullscreen": "Fullscreen"
      }
    },
    "autoScroll": {
      "label": "Auto Scroll",
      "desc": "Enable auto-scroll. Resumes auto-scroll 5 seconds after manual scrolling."
    },
    "animation": {
      "label": "Animation",
      "desc": "Display animations for lines other than the karaoke highlight"
    },
    "karaoke": {
      "label": "Karaoke Lead-in Countdown",
      "desc": "Display the lead-in countdown as numbers. If disabled, dots will be shown."
    },
    "blurInactive": {
      "label": "Blur Inactive Lines",
      "desc": "Blur inactive lines in synced lyrics",
      "info": "Performance issues may occur when this option is enabled."
    },
    "fade": {
      "label": "Blur & Gradient",
      "desc": "Display blur and gradient at the top and bottom of the lyrics",
      "info": "Performance issues may occur when this option is enabled."
    },
    "syncedAsFallback": {
      "label": "Fallback to Synced Lyrics",
      "desc": "Use synced lyrics if karaoke lyrics are not available"
    },
    "unsyncedAsFallback": {
      "label": "Fallback to Plain Text",
      "desc": "Use plain text if synced lyrics are not available"
    },
    "preferUnsynced": {
      "label": "Prefer Plain Text over Synced",
      "desc": "Prioritize plain text when both synced and plain text are available.",
      "info": "* Some plain text lyrics may contain lines not present in synced lyrics."
    },
    "customPreview": {
      "label": "Custom Preview",
      "desc": "Customize the lyrics screen preview image. Image will be displayed at 300x150px.",
      "placeholder": "Enter image URL"
    },
    "trackSyncInfo": {
      "label": "Track Sync Info",
      "desc": "Manage sync information connected to tracks"
    },
    "customDatabase": {
      "label": "Custom Database",
      "desc": "Set a custom database URL",
      "placeholder": "Enter custom database URL"
    },
    "debugVerbose": {
      "label": "Verbose Debug Info",
      "desc": "Output more detailed information to the console"
    },
    "cache": {
      "deleteAll": "Delete all cached lyrics",
      "noCache": "No cached lyrics"
    },
    "colors": {
      "customColor": "Custom",
      "showMore": "Show More ▼",
      "showLess": "Show Less ▲",
      "black": "Black",
      "charcoal": "Charcoal",
      "darkSlate": "Dark Slate",
      "gray": "Gray",
      "darkNavy": "Dark Navy",
      "navy": "Navy",
      "royalBlue": "Royal Blue",
      "sky": "Sky",
      "indigo": "Indigo",
      "purple": "Purple",
      "fuchsia": "Fuchsia",
      "pink": "Pink",
      "wine": "Wine",
      "red": "Red",
      "orange": "Orange",
      "amber": "Amber",
      "gold": "Gold",
      "lime": "Lime",
      "green": "Green",
      "emerald": "Emerald",
      "teal": "Teal",
      "cyan": "Cyan",
      "brown": "Brown",
      "chocolate": "Chocolate"
    },
    "solidBackgroundInUse": "ℹ️ Solid Background in use",
    "fontPlaceholder": "Enter font name (e.g., Arial, Roboto)",
    "fontSelector": {
      "mode": "Font input mode",
      "preset": "Font list",
      "custom": "Manual input"
    },
    "hotkey": {
      "recording": "Press a key combination",
      "unassigned": "Not assigned",
      "hint": "Click, then press the desired key combination",
      "change": "Change",
      "clear": "Clear shortcut",
      "saved": "Saved"
    },
    "syncLockTooltip": "Right-click to lock timing up to this character",
    "syncLockSet": "Locked timing up to the selected character.",
    "syncLockCleared": "Sync lock cleared.",
    "syncLockRequiresTiming": "Sync this line once before locking part of it.",
    "syncLockNoEditableChars": "Right-click an earlier character so there is something left to re-sync.",
    "shortcuts": {
      "primary": "Primary",
      "secondary": "Secondary"
    },
    "syncCreatorSettings": {
      "title": "Sync Creator Settings",
      "subtitle": "Configure Sync Creator keyboard behavior and recording shortcuts.",
      "autoBoundaryChars": {
        "label": "Auto-handle spaces and punctuation",
        "desc": "When using keyboard sync, automatically include nearby spaces and punctuation. Turn this off to time those characters manually."
      },
      "fillCurve": {
        "label": "Karaoke fill correction curve",
        "desc": "Drag the three middle points to adjust how word and character fill progresses during karaoke playback. The default diagonal line keeps the current timing.",
        "reset": "Reset"
      }
    },
    "aiProviders": {
      "title": "AI Providers",
      "description": "Select and prioritize AI providers. Providers at the top are tried first. On failure, the next provider is automatically used.",
      "translationStyle": {
        "title": "Translation style",
        "description": "Choose how closely AI translations follow the original wording. Line structure and meaning are preserved in every mode.",
        "natural": { "label": "Natural (Default)", "description": "Uses natural, idiomatic phrasing while preserving meaning and tone." },
        "literal": { "label": "Literal", "description": "Stays as close as possible to the original wording and order." },
        "adaptive": { "label": "Adaptive", "description": "Uses surrounding lines for the smoothest, most connected phrasing." }
      },
      "retryCount": {
        "label": "Retries per provider",
        "description": "Number of additional attempts after a failed request. Set to 0 to switch to the next provider immediately."
      },
      "providerSelection": "AI Provider Selection",
      "providerSelectionDesc": "Select AI providers for translation, pronunciation, TMI, and learning mode",
      "metadataProvider": "Metadata Translation",
      "lyricsProvider": "Lyrics Translation/Pronunciation",
      "tmiProvider": "TMI Generation",
      "selectProvider": "Select provider...",
      "addonSettings": "Addon Settings",
      "addonSettingsDesc": "Configure settings for each AI Addon",
      "noAddons": "No AI Addons registered. Please check your Addon files.",
      "noProviders": "No AI providers registered.",
      "moveUp": "Move Up",
      "moveDown": "Move Down",
      "supports": {
        "translate": "Translation",
        "metadata": "Metadata",
        "tmi": "TMI",
        "lyricsStudy": "Learning",
        "characterPronunciation": "Character pronunciation",
        "culturalAnnotations": "Cultural context"
      },
      "noEnabledProviders": "No AI providers enabled. Please enable at least one provider in settings.",
      "allProvidersFailed": "All AI providers failed to process the request.",
      "enabledCapabilities": "Enabled Capabilities",
      "capabilitiesDesc": "Select which features this provider handles"
    },
    "lyricsProviders": {
      "title": "Lyrics Providers",
      "description": "Select and prioritize lyrics providers. Providers at the top are tried first.",
      "preferSyncDataProvider": {
        "label": "Prioritize providers with ivLyrics Sync data",
        "desc": "When OpenDB has ivLyrics Sync data for the current track, try its matching lyrics provider before the normal provider order."
      },
      "preferLyricsTypeOverProviderOrder": {
        "label": "Prioritize character, word, line, then plain lyrics",
        "desc": "Try character-synced lyrics across all providers first, then word-synced, line-synced, and plain lyrics. The configured provider order is preserved within each type."
      },
      "noProviders": "No lyrics providers registered.",
      "allowedTypes": "Allowed Lyrics Types",
      "moveUp": "Move Up",
      "moveDown": "Move Down",
      "types": {
        "character": "Character-synced Lyrics",
        "word": "Word-synced Lyrics",
        "karaoke": "Karaoke Lyrics",
        "synced": "Synced Lyrics",
        "unsynced": "Plain Text Lyrics"
      },
      "supports": {
        "character": "Character-synced",
        "word": "Word-synced",
        "karaoke": "Karaoke",
        "synced": "Synced",
        "unsynced": "Plain",
        "ivLyricsSync": "ivLyrics Sync"
      }
    }
  },
  "buttons": {
    "save": "Save",
    "cancel": "Cancel",
    "reset": "Reset",
    "import": "Import",
    "export": "Export",
    "open": "Open",
    "close": "Close",
    "apply": "Apply",
    "confirm": "Confirm",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "remove": "Remove",
    "clear": "Clear",
    "refresh": "Refresh",
    "settings": "Settings",
    "fullscreen": "Fullscreen",
    "exitFullscreen": "Exit Fullscreen"
  },
  "menu": {
    "translation": "Convert",
    "settings": "Settings",
    "syncAdjust": "Adjust Sync",
    "syncAdjustTitle": "Adjust Lyrics Sync",
    "copyLyrics": "Copy Lyrics",
    "searchLyrics": "Search Lyrics",
    "editLyrics": "Edit Lyrics",
    "shareImage": "Share Lyrics Image",
    "translationOptions": "Conversion Options",
    "translationOptionsSubtitle": "Configure pronunciation and translation display",
    "detectedLanguage": "Detected Language",
    "detectedLanguageInfo": "The language of the current track. Conversion options apply differently based on the language.",
    "unknownLanguage": "Unknown",
    "autoDetect": "Auto Detect",
    "overrideLanguage": "Manual Language Override",
    "overrideLanguageInfo": "Manually set the language for this track. Translations will use this language instead of auto-detection.",
    "pronunciation": "Pronunciation",
    "pronunciationInfo": "Display the original lyrics' pronunciation in the selected notation",
    "pronunciationNotation": "Pronunciation notation",
    "pronunciationNotationInfo": "Choose how generated pronunciation is written. Regenerate pronunciation to update the current lyrics.",
    "pronunciationNotationTranslation": "Current translation language (Default)",
    "pronunciationNotationLatin": "Latin (Romanization)",
    "pronunciationNotationIpa": "International Phonetic Alphabet (IPA)",
    "translationLabel": "Translation",
    "translationInfo": "Translate and display original lyrics in your language",
    "translationTargetLang": "Target Language",
    "translationTargetLangInfo": "Lyrics will be translated to this language",
    "apiSettings": "AI Provider Settings",
    "apiSettingsSubtitle": "Configure your AI providers",
    "apiKeySettings": "AI Provider Settings",
    "apiKeySettingsInfo": "Click here to configure your AI providers",
    "openSettings": "Open Settings",
    "translationSettings": "Conversion Settings",
    "regenerateTranslation": "Regenerate Translation",
    "lyricsProviderSelect": "Select Lyrics Provider",
    "lyricsProviderSelectSubtitle": "Choose the lyrics provider to use only for this track.",
    "lyricsProviderAuto": "Auto Select",
    "lyricsProviderCurrent": "Current Provider",
    "lyricsProviderUnavailable": "Unavailable",
    "trackBackground": "Track Background",
    "trackBackgroundTitle": "Track Background",
    "trackBackgroundSubtitle": "Choose the background type for this track only. Detail options like blur, brightness, and video scale follow the default background settings.",
    "trackBackgroundCurrent": "Currently Applied Background",
    "trackBackgroundSelect": "Background for This Track",
    "trackBackgroundSelectInfo": "Choose default settings to use the background from Settings > Appearance > Visual Effects.",
    "trackBackgroundUseGlobal": "Use Default Settings",
    "localLyricsTools": "Local Lyrics",
    "localLyricsToolsSubtitle": "Local tracks stay separate from the ivLyrics server. Import an LRC file or search LRCLIB and save it on this device.",
    "localLyricsCurrent": "Current Local Lyrics",
    "importLrcFile": "Import LRC File",
    "import": "Import",
    "searchLrclibLocal": "Search LRCLIB",
    "localLyricsProvider": "Local",
    "localLyricsLrclibSearch": "Search LRCLIB Lyrics",
    "localLyricsLrclibSearchSubtitle": "For local tracks, the ivLyrics server is not used. Selected lyrics are saved only on this device.",
    "localLyricsSearchEmpty": "Enter a search query.",
    "localLyricsLrclibUnavailable": "LRCLIB provider is unavailable.",
    "localLyricsSearchResultCount": "{count} results",
    "localLyricsSearchNoResults": "No results found.",
    "localLyricsSearchFailed": "Failed to search lyrics.",
    "localLyricsApplyFailed": "Failed to apply lyrics.",
    "localLyricsSearchPlaceholder": "Search by title or artist",
    "localLyricsSearching": "Searching",
    "search": "Search",
    "apply": "Apply",
    "unknownTitle": "Unknown title",
    "unknownArtist": "Unknown artist",
    "localLyricsNoCandidateLyrics": "This result has no lyrics to apply",
    "regenerateTranslationOptions": "Choose What to Regenerate",
    "regenerateTranslationOptionsSubtitle": "Choose what to regenerate.",
    "regeneratePronunciationOnly": "Pronunciation Only",
    "regenerateTranslationOnly": "Translation Only",
    "regenerateBoth": "Pronunciation and Translation",
    "regenerateAction": "Regenerate",
    "fullscreen": "Fullscreen",
    "exitFullscreen": "Exit Fullscreen"
  },
  "messages": {
    "noLyrics": "No lyrics available",
    "loading": "Loading...",
    "error": "An error occurred",
    "saved": "Saved",
    "copied": "Copied",
    "deleted": "Deleted",
    "updated": "Updated",
    "applied": "Applied",
    "noTrackInfo": "No track information",
    "syncedLyricsCopied": "Synced lyrics copied to clipboard.",
    "unsyncedLyricsCopied": "Plain text lyrics copied to clipboard."
  },
  "update": {
    "newVersion": "New update version",
    "available": "is available!",
    "notes": "Update Notes",
    "update": "Update",
    "dismiss": "Later",
    "alreadyLatest": "Already on the latest version",
    "checkFailed": "Failed to check for updates",
    "versionChange": "Version",
    "copyCommand": "Copy Command",
    "releaseNotes": "Release Notes",
    "expand": "Expand",
    "collapse": "Collapse",
    "copied": "Copied"
  },
  "fullscreen": {
    "title": "Fullscreen",
    "background": "Background",
    "backgroundOptions": {
      "albumArt": "Album Art",
      "animatedCanvas": "Animated Canvas",
      "artistArt": "Artist Art",
      "staticColor": "Solid Color"
    },
    "showExtraControls": {
      "label": "Show Extra Controls",
      "desc": "Display additional controls in fullscreen mode"
    },
    "contextDisplay": {
      "label": "Context Display",
      "desc": "Display current playing context in fullscreen mode"
    },
    "upcomingLyrics": {
      "label": "Show Next Lyrics",
      "desc": "Preview the upcoming lyrics lines in fullscreen mode"
    },
    "volumeDisplay": {
      "label": "Show Volume",
      "desc": "Display volume controls in fullscreen mode"
    },
    "controls": {
      "like": "Like",
      "unlike": "Remove Like",
      "shuffle": "Shuffle",
      "previous": "Previous",
      "next": "Next",
      "nextTrackLabel": "Next Track",
      "play": "Play",
      "pause": "Pause",
      "repeatOff": "Repeat Off",
      "repeatAll": "Repeat All",
      "repeatOne": "Repeat One",
      "mute": "Mute",
      "unmute": "Unmute",
      "share": "Copy Share Link",
      "shareCopied": "🔗 Share link copied",
      "addToPlaylist": "Add to playlist",
      "playlistLoading": "Loading playlists...",
      "playlistEmpty": "No editable playlists found.",
      "playlistLoadFailed": "Failed to load playlists.",
      "playlistNoTrack": "Only Spotify tracks can be added to playlists.",
      "playlistAdded": "Added to {playlist}.",
      "playlistAlreadyContains": "{playlist} already contains this track.",
      "playlistChecking": "Checking...",
      "playlistAlreadyInList": "Already in",
      "playlistRemove": "Remove",
      "playlistRemoved": "Removed from {playlist}.",
      "playlistAddFailed": "Failed to add to playlist.",
      "playlistRemoveFailed": "Failed to remove from playlist.",
      "playlistTracks": "tracks"
    },
    "queue": {
      "title": "Queue",
      "recentlyPlayed": "Recently Played",
      "nowPlaying": "Now Playing",
      "upNext": "Up Next",
      "empty": "Queue is empty",
      "noRecent": "No recent playback history",
      "recommended": "Recommended Songs"
    },
    "contextType": {
      "playlist": "Playlist",
      "album": "Album",
      "artist": "Artist",
      "collection": "Liked Songs",
      "station": "Station"
    }
  },
  "about": {
    "version": "Version",
    "sourceCode": "Source Code",
    "reportIssue": "Report Issue",
    "changelog": "Changelog",
    "license": "License",
    "credits": "Credits"
  },
  "translationMenu": {
    "none": "None",
    "disabled": "Disabled",
    "romaji": "Romaji",
    "hiragana": "Hiragana",
    "katakana": "Katakana",
    "furigana": "Furigana",
    "romanization": "Pronunciation",
    "translation": "Translation",
    "google": "Google Translate",
    "microsoft": "Microsoft Translate",
    "geminiRomaji": "Pronunciation",
    "geminiKo": "Translation",
    "romajiGemini": "Romaji (Gemini)",
    "koGemini": "English (Gemini)",
    "simplifiedChinese": "Simplified Chinese",
    "traditionalChineseHK": "Traditional Chinese (HK)",
    "traditionalChineseTW": "Traditional Chinese (TW)",
    "pinyin": "Pinyin"
  },
  "firstLanguagePrompt": {
    "title": "First time playing a {language} song",
    "description": "How should this song be translated?",
    "original": "Original only",
    "originalDescription": "Show the original lyrics without pronunciation or translation.",
    "pronunciation": "Pronunciation",
    "pronunciationDescription": "Show the original lyrics with a pronunciation guide.",
    "translation": "Translation",
    "translationDescription": "Show the original lyrics with a translation.",
    "both": "Pronunciation + translation",
    "bothDescription": "Show both a pronunciation guide and a translation.",
    "notNow": "Don't set up",
    "apply": "Apply these settings",
    "aiProviderHint": "Only Bing and Google Translate are active. Add an AI provider in AI provider settings for more natural, richer translations.",
    "pronunciationAiProviderHint": "Pronunciation is generated only after you add an AI provider in AI provider settings."
  },
  "lyricsCacheEditor": {
    "title": "Edit Cached Pronunciation / Translation",
    "unknownTrack": "Unknown Track",
    "lineCount": "Editable lines",
    "close": "Close",
    "loading": "Loading cached lyrics...",
    "original": "Original",
    "reference": "Reference",
    "cached": "Cached",
    "empty": "Empty",
    "pronunciationPlaceholder": "One line per lyric line",
    "translationPlaceholder": "One line per lyric line",
    "shiftDown": "Shift this line and everything below down",
    "cancel": "Cancel",
    "saving": "Saving...",
    "save": "Save Cache",
    "loadFailed": "Failed to load cached lyrics.",
    "lineOverflow": "The number of edited lines cannot exceed the original lyric lines.",
    "trackMissing": "No active track was found.",
    "saved": "Cached pronunciation and translation were updated.",
    "saveFailed": "Failed to save cached lyrics.",
    "button": "Edit cached pronunciation / translation"
  },
  "notifications": {
    "culturalAnnotationsFailed": "Could not load the cultural context explanations.",
    "languageChanged": "Language changed. Will be applied after refresh.",
    "settingsSaved": "Settings saved",
    "settingsReset": "Settings reset",
    "exportSuccess": "Export successful",
    "importSuccess": "Import successful",
    "importFailed": "Failed to import settings",
    "syncDataCleared": "Sync data cleared",
    "syncDataClearFailed": "Failed to clear sync data",
    "lyricsCopied": "Lyrics copied to clipboard",
    "lyricsCopyFailed": "Failed to copy lyrics",
    "translationCopied": "Translation copied to clipboard",
    "translationCopyFailed": "Failed to copy translation",
    "secondTranslationCopied": "Second translation copied to clipboard",
    "secondTranslationCopyFailed": "Failed to copy second translation",
    "installCommandCopied": "Install command copied",
    "copyFailed": "Copy failed",
    "memoryCacheCleared": "Memory cache cleared",
    "localCacheCleared": "All local cache cleared",
    "localCacheTrackCleared": "Local cache for current track cleared",
    "exportSuccessDesc": "Settings file saved.",
    "exportFailed": "Export failed",
    "importSuccessDesc": "Page will refresh shortly...",
    "dbExportSuccess": "Database export successful",
    "dbExportSuccessDesc": "Database file saved.",
    "dbExportFailed": "Database export failed",
    "dbImportSuccess": "Database import successful",
    "dbImportSuccessDesc": "Page will refresh shortly...",
    "dbImportFailed": "Database import failed",
    "resetSuccess": "Reset complete",
    "resetSuccessDesc": "Page will refresh shortly...",
    "resetFailed": "Reset failed",
    "updateCheckFailed": "Update check failed",
    "checkNetworkConnection": "Please check your network connection",
    "updateAvailable": "Update available",
    "latestVersion": "You are on the latest version",
    "noLyricsLoaded": "Lyrics not loaded.",
    "translationRegenerateGeminiOnly": "Translation regeneration is only available with Gemini translation.",
    "regeneratingTranslation": "Regenerating translation...",
    "translationRegenerated": "Translation regenerated",
    "culturalAnnotationsRegenerated": "Cultural context explanations regenerated.",
    "translationRegenerateFailed": "Failed to regenerate translation",
    "culturalAnnotationsRegenerateFailed": "Failed to regenerate cultural context explanations.",
    "lyricsProviderSaved": "Lyrics provider setting saved for this track.",
    "lyricsProviderSaveFailed": "Failed to save lyrics provider setting.",
    "translationCacheRemoved": "Translation cache removed and reloaded!",
    "translationCacheReset": "{count} translation cache items reset",
    "tooManyTranslationRequests": "Too many translation requests. Please try again in a minute.",
    "requestingPronunciation": "Requesting pronunciation. This may take about 30 seconds.",
    "requestingTranslation": "Requesting translation. This may take about 30 seconds.",
    "shareImageCopied": "Image copied to clipboard",
    "shareImageDownloaded": "Image downloaded",
    "shareImageShared": "Shared successfully",
    "shareImageFailed": "Failed to create image",
    "shareImageNoLyrics": "Please select lyrics to share",
    "noTrackPlaying": "No track is playing",
    "overlayConnected": "Overlay Connected",
    "romajiTranslationFailed": "Romaji/Pronunciation conversion failed",
    "koreanTranslationFailed": "Translation failed",
    "pinyinLibraryUnavailable": "Pinyin library unavailable. Showing original. Please allow jsDelivr or unpkg.",
    "conversionSkippedSimplified": "Conversion skipped: Already Simplified Chinese",
    "conversionCompleted": "Conversion completed",
    "conversionFailed": "Conversion failed",
    "fileTooLarge": "File too large: Max size is 1MB",
    "noValidLyricsInFile": "No valid lyrics found in file",
    "lyricsLoadedFromFile": "Successfully loaded {types} lyrics from file",
    "lyricsLoadedFromLrclib": "Loaded lyrics from LRCLIB.",
    "lyricsLoadFailed": "Failed to load lyrics: Invalid file format",
    "fileReadFailed": "Failed to read file: File may be corrupted"
  },
  "misc": {
    "and": "and",
    "or": "or",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "default": "Default",
    "custom": "Custom",
    "none": "None",
    "auto": "Auto",
    "manual": "Manual",
    "on": "On",
    "off": "Off",
    "yes": "Yes",
    "no": "No",
    "items": "items",
    "seconds": "sec",
    "minutes": "min",
    "lyricsProvider": "Lyrics Provider",
    "syncContributor": "Sync Contributor"
  },
  "creatorProfile": {
    "title": "Sync Creator",
    "anonymous": "Anonymous",
    "openProfile": "Profile page",
    "loading": "Loading creator profile...",
    "loadFailed": "Failed to load creator profile.",
    "back": "Back",
    "contributions": "Sync Contributions",
    "tracks": "Synced tracks",
    "points": "Contribution points",
    "pointsShort": "pts",
    "typeLine": "Line",
    "typeWord": "Word",
    "typeCharacter": "Character",
    "typeMixed": "Mixed",
    "typeUnknown": "Legacy sync",
    "likes": "Likes",
    "like": "Like",
    "liked": "Liked",
    "likeActionFailed": "Failed to update creator like.",
    "likeLoginRequired": "Discord login is required to like creators.",
    "addGreeting": "Add greeting",
    "editGreeting": "Edit greeting",
    "saveGreeting": "Save",
    "cancelGreeting": "Cancel",
    "greetingPlaceholder": "Write a greeting for your profile.",
    "greetingLoginRequired": "Discord login is required to edit your creator profile.",
    "greetingSaveFailed": "Failed to update creator greeting.",
    "greetingTranslateFailed": "Failed to translate creator greeting.",
    "greetingSaveSuccess": "Greeting updated.",
    "ownProfile": "This is your profile.",
    "loadMore": "Load more",
    "loadingMore": "Loading more...",
    "noContributions": "No sync contributions yet.",
    "unknownTrack": "Unknown Track",
    "updated": "Updated",
    "topArtists": "Top Artists",
    "artistGroups": "Artist Groups",
    "noArtistStats": "No artist stats yet.",
    "clearArtistFilter": "Clear artist filter",
    "filteredArtist": "Filtered artist",
    "supporter": "Supporter",
    "monthlySupporter": "Monthly Supporter",
    "nicknameStyle": "Nickname style",
    "nicknameStyleDesc": "This color is used for your name in the sync creator credit below the lyrics.",
    "solid": "Solid",
    "gradient": "Gradient",
    "solidColor": "Solid color",
    "gradientStart": "Start color",
    "gradientEnd": "End color",
    "gradientAngle": "Gradient angle",
    "decorationPreview": "Preview",
    "saveDecoration": "Save color",
    "resetDecoration": "Reset to default",
    "refreshSupportRole": "Refresh supporter role",
    "supportRoleNotFound": "No supporter role was found. Refresh after your Discord role is assigned.",
    "monthlyOnlyGradient": "Gradients are available to Monthly Supporters only.",
    "decorationSaved": "Nickname color saved.",
    "decorationReset": "Nickname color reset.",
    "decorationSaveFailed": "Failed to save nickname color.",
    "supportRoleRefreshFailed": "Failed to refresh supporter role."
  },
  "settingsAdvanced": {
    "patchNotes": {
      "empty": "No patch notes available."
    },
    "donate": {
      "title": "Buy the developer a coffee",
      "button": "Donate"
    },
    "multiVocalColors": {
      "title": "Multi-vocal Colors",
      "subtitle": "Customize male, female, and duet speaker colors.",
      "description": "Choose the lyric color used for each multi-vocal speaker.",
      "maleGroup": "Male",
      "femaleGroup": "Female",
      "duetGroup": "Duet",
      "useCreatorColors": {
        "label": "Use sync creator custom colors",
        "desc": "Use custom speaker colors embedded by sync creators. When disabled, CUSTOM speakers use the fallback selected by the sync creator."
      },
      "reset": "Reset colors",
      "resetDone": "Multi-vocal colors were reset.",
      "invalidColor": "Enter a valid hex color."
    },
    "performance": {
      "rendering": {
        "title": "Rendering Frame Rate",
        "subtitle": "Limit lyrics refresh rate to reduce GPU and CPU load."
      },
      "frameRate": {
        "label": "Lyrics Frame Rate",
        "desc": "Controls how often synced and karaoke lyrics update. Lower values reduce load; higher values feel smoother.",
        "unit": " FPS"
      },
      "textEffects": {
        "label": "Text Effects",
        "desc": "Animate karaoke text effects such as shake, breathing, glow, and glitch."
      },
      "visualCost": {
        "title": "Visual Cost",
        "subtitle": "Quick access to effects that can increase GPU work."
      },
      "backgroundWork": {
        "title": "Background Work",
        "subtitle": "Controls preloading that may add CPU, network, or disk activity."
      }
    },
    "syncMode": {
      "title": "Sync Mode",
      "subtitle": "Display options for compact sync mode",
      "linesBefore": {
        "label": "Lines Displayed (Before)",
        "desc": "Number of lines to show before the current active line"
      },
      "linesAfter": {
        "label": "Lines Displayed (After)",
        "desc": "Number of lines to show after the current active line"
      },
      "fadeoutBlur": {
        "label": "Fadeout Blur Effect",
        "desc": "Apply blur effect to inactive lyrics"
      },
      "highlightMode": {
        "label": "Highlight Mode",
        "desc": "Brightly highlight only the current singing lyrics and dim the rest"
      },
      "highlightIntensity": {
        "label": "Highlight Intensity",
        "desc": "Adjust transparency of inactive lyrics (Lower is dimmer)"
      }
    },
    "instrumentalBreak": {
      "title": "Instrumental Marker",
      "subtitle": "Replace long blank or note-only lyric gaps with an icon",
      "autoDetect": {
        "label": "Auto-detect instrumental gaps",
        "desc": "After a karaoke lyric line finishes, show an instrumental marker for a long gap before the next line."
      },
      "icon": {
        "label": "Icon Design",
        "desc": "Choose the animation shown for lyric gaps longer than 0.5 seconds",
        "options": {
          "equalizer": "01 Equalizer",
          "dotWave": "02 Dot Wave",
          "ripples": "03 Ripples",
          "orbit": "04 Orbit",
          "diamonds": "05 Diamonds",
          "scan": "06 Scan",
          "arcs": "07 Arcs",
          "signal": "08 Signal",
          "pulseDot": "09 Pulse Dot",
          "stack": "10 Stack",
          "spark": "11 Spark",
          "splitBars": "12 Split Bars",
          "metronome": "13 Metronome",
          "vinyl": "14 Vinyl",
          "beat": "15 Beat",
          "reels": "16 Reels",
          "triangle": "17 Triangle",
          "morph": "18 Morph",
          "strings": "19 Strings",
          "piano": "20 Piano",
          "bloom": "21 Bloom",
          "speaker": "22 Speaker",
          "crossfade": "23 Crossfade"
        }
      },
      "showLabel": {
        "label": "Show Text Label",
        "desc": "Show Intro, Break, or Outro next to the icon based on lyric position"
      },
      "labelStyle": {
        "fontFamily": {
          "label": "Text Label Font",
          "desc": "Select the font for the Intro, Break, or Outro label"
        },
        "fontSize": {
          "label": "Text Label Size",
          "desc": "Font size for the text label"
        },
        "fontWeight": {
          "label": "Text Label Weight",
          "desc": "Font weight for the text label"
        },
        "opacity": {
          "label": "Text Label Opacity",
          "desc": "Opacity for the text label"
        }
      },
      "speed": {
        "label": "Animation Speed",
        "desc": "Adjust the icon animation speed"
      },
      "labels": {
        "prelude": "Intro",
        "break": "Break",
        "postlude": "Outro"
      }
    },
    "livePreview": {
      "title": "Live Preview",
      "subtitle": "Instantly see your style changes",
      "sampleText": "Here are the lyrics",
      "sampleTextMixed": "Here Lyric あります",
      "sampleTextPhonetic": "Hie Ririk Arimasu"
    },
    "originalStyle": {
      "title": "Original Text Style",
      "subtitle": "Font settings for original lyrics",
      "fontFamily": "Font Family",
      "fontFamilyDesc": "Select the font for original lyrics. You can enter multiple fonts separated by commas to apply them in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for original lyrics (px)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for original lyrics"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of original lyrics (0-100%)"
      },
      "letterSpacing": {
        "label": "Letter Spacing",
        "desc": "Spacing between characters for original lyrics (px)"
      }
    },
    "pronunciationStyle": {
      "title": "Pronunciation Style",
      "subtitle": "Font settings for pronunciation (Romaji, Romaja, Pinyin)",
      "fontFamily": "Font Family",
      "fontFamilyDesc": "Select the font for pronunciation. You can enter multiple fonts separated by commas to apply them in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for pronunciation (px)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for pronunciation"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of pronunciation (0-100%)"
      },
      "gap": {
        "label": "Gap from Original",
        "desc": "Margin between original text and pronunciation"
      },
      "letterSpacing": {
        "label": "Letter Spacing",
        "desc": "Spacing between characters for pronunciation (px)"
      },
      "hyphenReplace": {
        "label": "Hyphen (-) Handling",
        "desc": "Choose how to display hyphens in pronunciation (e.g., Tah-shee-kah → Tah shee kah or Tahsheekah)",
        "options": {
          "keep": "Keep (Tah-shee-kah)",
          "space": "Replace with space (Tah shee kah)",
          "remove": "Remove (Tahsheekah)"
        }
      }
    },
    "translationStyle": {
      "title": "Translation Style",
      "subtitle": "Font settings for translated lyrics",
      "fontFamily": "Font Family",
      "fontFamilyDesc": "Select the font for translated lyrics. You can enter multiple fonts separated by commas to apply them in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for translated lyrics (px)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for translated lyrics"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of translated lyrics (0-100%)"
      },
      "gap": {
        "label": "Gap from Pronunciation",
        "desc": "Margin between pronunciation and translation (px)"
      },
      "letterSpacing": {
        "label": "Letter Spacing",
        "desc": "Spacing between characters for translated lyrics (px)"
      }
    },
    "furiganaStyle": {
      "title": "Furigana Style",
      "subtitle": "Settings for reading aid (Furigana) displayed above Kanji",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for Furigana (px)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for Furigana"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of Furigana (0-100%)"
      },
      "spacing": {
        "label": "Spacing",
        "desc": "Margin between Furigana and Kanji (px)"
      }
    },
    "textOutline": {
      "width": {
        "label": "Text Outline Thickness",
        "desc": "Visible thickness of the outline outside the glyphs (px)"
      },
      "color": {
        "label": "Text Outline Color",
        "desc": "Color of the text outline (HEX code)"
      }
    },
    "textShadow": {
      "title": "Text Shadow",
      "subtitle": "Shadow effects to improve readability",
      "enabled": {
        "label": "Shadow Effect",
        "desc": "Apply shadow effect to lyrics text"
      },
      "color": {
        "label": "Shadow Color",
        "desc": "Color of the shadow (HEX code)"
      },
      "opacity": {
        "label": "Shadow Opacity",
        "desc": "Opacity of the shadow (0-100%)"
      },
      "blur": {
        "label": "Blur Radius",
        "desc": "Blurriness of the shadow"
      }
    },
    "playback": {
      "title": "Playback Behavior",
      "subtitle": "Settings for playback related features",
      "replaceButton": {
        "label": "Replace Lyrics Button",
        "info": "Replaces Spotify's default lyrics button with ivLyrics"
      },
      "replaceFullscreenButton": {
        "label": "Replace Fullscreen Button",
        "info": "Replaces Spotify's default fullscreen button with ivLyrics fullscreen"
      },
      "quickSyncControls": {
        "label": "Show quick track sync controls",
        "info": "Show track-specific sync offset controls in the lower-left corner of lyrics pages and fullscreen mode. When hidden, they remain available under Adjust Lyrics Sync in the right-side menu."
      },
      "fullscreenShortcut": {
        "label": "Fullscreen Shortcut",
        "desc": "Keyboard shortcut for lyrics fullscreen mode"
      }
    },
    "nowPlayingPanel": {
      "title": "NowPlaying Panel Lyrics",
      "subtitle": "Lyrics display settings for the right side 'Now Playing' panel",
      "enabled": {
        "label": "Enable Panel Lyrics",
        "desc": "Display current lyrics in the Now Playing panel"
      },
      "fontScale": {
        "label": "Global Font Scale",
        "desc": "Scale ratio for panel lyrics text (50%-200%)"
      },
      "fontFamily": {
        "label": "Default Font",
        "desc": "Default font for panel lyrics (Used if individual fonts are not set)"
      },
      "originalFont": {
        "label": "Original Font",
        "desc": "Font for original lyrics (Uses default if empty, comma-separated allowed)"
      },
      "phoneticFont": {
        "label": "Pronunciation Font",
        "desc": "Font for pronunciation (Uses default if empty, comma-separated allowed)"
      },
      "translationFont": {
        "label": "Translation Font",
        "desc": "Font for translated lyrics (Uses default if empty, comma-separated allowed)"
      },
      "originalSize": {
        "label": "Original Font Size",
        "desc": "Base font size for original lyrics (px)"
      },
      "phoneticSize": {
        "label": "Pronunciation Font Size",
        "desc": "Base font size for pronunciation (px)"
      },
      "translationSize": {
        "label": "Translation Font Size",
        "desc": "Base font size for translated lyrics (px)"
      },
      "preview": "Preview",
      "background": {
        "title": "Background",
        "subtitle": "Panel background style settings",
        "type": {
          "label": "Background Type",
          "desc": "Select background style",
          "album": "Album Color",
          "gradient": "Custom Gradient",
          "custom": "Solid Color",
          "transparent": "Transparent"
        },
        "color": {
          "label": "Background Color",
          "desc": "Custom background color"
        },
        "gradient1": {
          "label": "Gradient Color 1",
          "desc": "First gradient color"
        },
        "gradient2": {
          "label": "Gradient Color 2",
          "desc": "Second gradient color"
        },
        "opacity": {
          "label": "Background Opacity",
          "desc": "Background opacity (0%=Transparent, 100%=Opaque)"
        }
      },
      "border": {
        "title": "Border",
        "subtitle": "Panel border style settings",
        "enabled": {
          "label": "Enable Border",
          "desc": "Show border around the panel"
        },
        "color": {
          "label": "Border Color",
          "desc": "Border color"
        },
        "opacity": {
          "label": "Border Opacity",
          "desc": "Border opacity (0%=Transparent, 100%=Opaque)"
        }
      }
    },
    "karaokeMode": {
      "title": "Karaoke Mode",
      "subtitle": "Karaoke style lyrics display",
      "enabled": {
        "label": "Use Karaoke Mode",
        "desc": "Use Karaoke tab for supported songs. If disabled, defaults to Synced tab."
      },
      "bounce": {
        "label": "Character Bounce Effect",
        "desc": "Apply a bounce animation to the current singing characters in Karaoke mode"
      },
      "lineTransition": {
        "label": "Line Transition Animation",
        "desc": "Restore the line movement when the active lyric line changes. This can increase GPU usage."
      },
      "spotifyFakeKaraoke": {
        "label": "Pseudo Karaoke",
        "desc": "When lyrics only provide line-synced timing, synthesize karaoke timing from Spotify audio analysis. Korean, Japanese, and Chinese lines are split more densely when confidence is high."
      },
      "pseudoKaraokeRenderAdvance": {
        "label": "Pseudo Karaoke Render Advance",
        "desc": "Apply a render-time timing offset to pseudo karaoke only. Positive values make the highlight appear earlier."
      }
    },
    "prefetch": {
      "title": "Preload Next Song",
      "subtitle": "Preload elements of the next song to reduce delay during transitions",
      "enabled": {
        "label": "Preload Translation/Pronunciation",
        "desc": "Request translation and pronunciation conversion for the next song in advance"
      },
      "videoEnabled": {
        "label": "Preload Video Background",
        "desc": "Fetch video background info for the next song in advance"
      }
    },
    "communitySync": {
      "title": "Community Sync",
      "subtitle": "Share lyrics sync offsets with other users",
      "enabled": {
        "label": "Use Community Sync",
        "desc": "Use sync offsets shared by the community"
      },
      "autoApply": {
        "label": "Auto Apply",
        "desc": "Automatically apply community offsets if confidence is high enough"
      },
      "autoSubmit": {
        "label": "Auto Submit",
        "desc": "Automatically share sync offsets with the community when you change them"
      },
      "minConfidence": {
        "label": "Minimum Confidence",
        "desc": "Minimum confidence required for auto-apply (0.0 ~ 1.0). Confidence is calculated based on submission count and consistency. Higher value means more users submitted similar offsets."
      }
    },
    "cacheManagement": {
      "title": "Cache Management",
      "subtitle": "Manage stored data",
      "memoryCache": {
        "label": "Clear Memory Cache",
        "desc": "Loaded lyrics are temporarily stored in memory for quick reloading. Clear memory cache without restarting Spotify.",
        "button": "Clear Cache"
      },
      "localCache": {
        "label": "Manage Local Cache (IndexedDB)",
        "desc": "Lyrics, translations, and pronunciations are stored locally to reduce API calls on repeated listening.",
        "clearAll": "Delete All",
        "clearCurrent": "Delete Current Track",
        "stats": "Lyrics: {lyrics}, Translations: {translations}, Metadata: {metadata}"
      },
      "openDb": {
        "label": "OpenDB Index Cache",
        "desc": "The base + delta index used to find lyric providers with sync-data.",
        "versionSummary": "base {baseDate} + delta {deltaCount}",
        "coverageSummary": "{isrcCount} ISRC · {providerCount} providers",
        "notDownloaded": "No index has been downloaded yet.",
        "lastChecked": "Last checked",
        "justNow": "just now",
        "stale": "Offline · using the existing cache",
        "update": "Fetch base + delta again",
        "updating": "Updating…",
        "unavailable": "The OpenDB cache service is unavailable.",
        "updateSuccess": "OpenDB base and delta files were downloaded again.",
        "updateFailed": "OpenDB could not be updated. The existing cache was kept.",
        "updateFailedNoCache": "OpenDB could not be updated and no existing cache is available."
      }
    },
    "languageDetection": {
      "title": "Language Detection",
      "subtitle": "Settings for language detection used in text conversion",
      "furigana": {
        "label": "Show Furigana on Japanese Kanji",
        "desc": "Display Hiragana readings above Kanji in Japanese lyrics"
      },
      "japaneseThreshold": {
        "label": "Japanese Detection Threshold",
        "desc": "Detects Japanese based on the ratio of Kana characters. Higher values mean stricter detection (Percentage)"
      },
      "chineseThreshold": {
        "label": "Chinese Detection Threshold",
        "desc": "Detects Chinese variants based on the ratio of Traditional/Simplified characters. Higher values mean stricter detection (Percentage)"
      }
    },
    "apiKeys": {
      "subtitle": "API Keys for external services"
    },
    "exportImport": {
      "title": "Export/Import Settings",
      "subtitle": "Transfer settings to another device",
      "export": {
        "label": "Export Settings",
        "button": "Export",
        "processing": "Exporting..."
      },
      "import": {
        "label": "Import Settings",
        "button": "Import",
        "processing": "Importing..."
      }
    },
    "cloudSync": {
      "title": "Cloud Settings Sync",
      "subtitle": "Sync PC settings between devices for Monthly Supporters.",
      "platform": "PC settings",
      "checking": "Checking cloud settings…",
      "loginRequired": "Sign in with Discord to use cloud sync.",
      "monthlyRequired": "Cloud sync is available to Monthly Supporters only.",
      "empty": "No PC settings have been saved to the cloud yet.",
      "remoteFound": "Cloud revision {revision} is available.",
      "notSaved": "Not saved yet",
      "updatedAt": "Updated {date}",
      "upload": "Upload current settings",
      "uploading": "Uploading…",
      "uploaded": "PC settings uploaded as revision {revision}.",
      "download": "Apply cloud settings",
      "downloading": "Applying…",
      "downloaded": "Cloud PC settings were applied. Reloading ivLyrics…",
      "refresh": "Refresh",
      "delete": "Delete cloud data",
      "deleting": "Deleting…",
      "deleted": "Cloud PC settings were deleted.",
      "confirmDownload": "Apply cloud PC settings and reload ivLyrics?",
      "confirmDelete": "Permanently delete your cloud PC settings?",
      "conflict": "Cloud settings changed on another device. Refresh before uploading again.",
      "failed": "Cloud sync failed: {error}",
      "excluded": "API keys, account tokens, caches, presets, and per-track offsets stay on this device.",
    },
    "settingsPresets": {
      "title": "Settings Presets",
      "subtitle": "Save the current settings combination and apply it all at once.",
      "nameLabel": "Preset name",
      "namePlaceholder": "e.g. Focus mode",
      "saveCurrent": "Save current",
      "savedPresets": "Saved presets",
      "empty": "No presets saved yet.",
      "apply": "Apply",
      "delete": "Delete",
      "saved": "Preset \"{name}\" saved.",
      "saveFailed": "Failed to save preset.",
      "applied": "Preset \"{name}\" applied.",
      "applyFailed": "Failed to apply preset.",
      "deleted": "Preset \"{name}\" deleted.",
      "deleteFailed": "Failed to delete preset.",
      "nameRequired": "Enter a preset name.",
      "confirmApply": "Apply preset \"{name}\" and reload the page?",
      "confirmDelete": "Delete preset \"{name}\"?",
      "confirmOverwrite": "A preset named \"{name}\" already exists. Overwrite it?",
      "settingsCount": "{count} settings",
      "updatedAt": "Updated {date}",
      "excludedSecrets": "Current visual and behavior settings are saved. API keys are excluded."
    },
    "dbExportImport": {
      "title": "Export/Import Database",
      "subtitle": "Transfer translations, lyrics cache and all data",
      "export": {
        "label": "Export Database",
        "button": "Export",
        "processing": "Exporting..."
      },
      "import": {
        "label": "Import Database",
        "button": "Import",
        "processing": "Importing...",
        "confirm": "All existing DB data will be overwritten. Continue?"
      }
    },
    "resetSettings": {
      "title": "Reset Settings",
      "subtitle": "Restore all settings to default",
      "reset": {
        "label": "Reset All Settings",
        "desc": "Restore all settings to their default values. This action cannot be undone.",
        "button": "Reset",
        "confirm": "Are you sure you want to reset all settings?\n\nThis action cannot be undone and all settings will be reverted to default.\n\nClick 'Confirm' to proceed.",
        "processing": "Resetting..."
      }
    },
    "fullscreenMode": {
      "title": "Fullscreen Defaults",
      "subtitle": "Set default behavior for fullscreen mode",
      "shortcut": {
        "desc": "Fullscreen Shortcut",
        "info": "Set keyboard shortcut to toggle fullscreen mode"
      },
      "toggleTvModeKey": {
        "desc": "TV Mode Toggle Shortcut",
        "info": "Works only in fullscreen mode. Toggles between TV mode and Normal mode."
      },
      "tvMode": {
        "desc": "Use TV Mode",
        "info": "Displays album art and track info on bottom left, maximizing lyrics space"
      },
      "tvModeAlbumSize": {
        "desc": "Album Size",
        "info": "Set the size of album art in TV mode (px)"
      },
      "splitView": {
        "desc": "Split Layout",
        "info": "Displays album art on the left and lyrics on the right in fullscreen"
      },
      "invertPosition": {
        "desc": "Invert Album/Lyrics Position",
        "info": "Swaps the position of album and lyrics (Left/Right ↔ Right/Left, or Top/Bottom in portrait)"
      },
      "showAlbumArt": {
        "desc": "Show Album Art",
        "info": "Display album art on the left panel in fullscreen"
      },
      "showTrackInfo": {
        "desc": "Show Track Info",
        "info": "Display song title and artist in fullscreen"
      },
      "trimTitle": {
        "desc": "Shorten Titles",
        "info": "Removes extra info like (Remaster), [feat. xxx] to keep titles concise"
      },
      "translateMetadata": {
        "desc": "Translate Title/Artist",
        "info": "Translate foreign song titles and artist names"
      },
      "translateMetadataMode": {
        "desc": "Translation Display Mode",
        "info": "Choose how to display title and artist",
        "options": {
          "all": "Show All (Original + Translation + Pronunciation)",
          "translated": "Show Translation Only (Original if missing)",
          "romanized": "Show Pronunciation Only (Original if missing)",
          "originalTranslated": "Original + Translation",
          "originalRomanized": "Original + Pronunciation"
        }
      },
      "infoGap": {
        "desc": "Album Art Gap",
        "info": "Adjust gap between album art and controls/info (px)"
      },
      "centerWhenNoLyrics": {
        "desc": "Center Album if No Lyrics",
        "info": "Place album art in the center when lyrics are missing or loading"
      },
      "twoColumnLayout": {
        "desc": "Use 2-Column Layout"
      },
      "browserFullscreen": {
        "desc": "Use Browser Fullscreen",
        "info": "Switch browser to fullscreen mode to fill the entire monitor when entering lyrics fullscreen"
      },
      "pageUiOnly": {
        "desc": "Use Fullscreen UI in Lyrics Page Only",
        "info": "Show the fullscreen layout inside the lyrics page instead of covering the whole Spotify window."
      },
      "hideOverlay": {
        "desc": "Hide Overlay in ivLyrics Fullscreen",
        "info": "Send the overlay app a paused playback state while ivLyrics fullscreen is open so desktop overlay lyrics fade out"
      }
    },
    "normalMode": {
      "title": "Normal Mode Layout",
      "subtitle": "Set layout for normal fullscreen mode (Non-TV mode)",
      "showAlbumName": {
        "desc": "Show Album Name",
        "info": "Display album name below song title and artist"
      }
    },
    "tvMode": {
      "title": "TV Mode Settings",
      "subtitle": "Display options for TV mode",
      "showAlbumName": {
        "desc": "Show Album Name",
        "info": "Display album name below artist in TV mode"
      },
      "showControls": {
        "desc": "Show Controls",
        "info": "Display play/pause, prev/next buttons in TV mode"
      },
      "showProgress": {
        "desc": "Show Progress Bar",
        "info": "Display progress bar showing playback position and time in TV mode"
      }
    },
    "metadataDisplay": {
      "title": "Title/Artist Display",
      "subtitle": "Configure how song title and artist are displayed"
    },
    "fullscreenStyle": {
      "title": "Fullscreen Style",
      "subtitle": "Visual settings for fullscreen mode",
      "albumSize": {
        "desc": "Album Art Max Size",
        "info": "Set maximum size for album art in fullscreen (100-500px)"
      },
      "albumRadius": {
        "desc": "Album Art Radius",
        "info": "Set corner rounding for album art (0-50px)"
      },
      "titleFontSize": {
        "desc": "Title Font Size",
        "info": "Set font size for song title in fullscreen (24-72px)"
      },
      "artistFontSize": {
        "desc": "Artist Font Size",
        "info": "Set font size for artist name in fullscreen (14-36px)"
      },
      "lyricsRightMargin": {
        "desc": "Lyrics Right Margin",
        "info": "Set right margin for lyrics area. Prevents lyrics from looking too far right when centered (0-300px)"
      }
    },
    "fullscreenUI": {
      "title": "Fullscreen UI Elements",
      "subtitle": "Configure additional UI elements shown in fullscreen",
      "showClock": {
        "desc": "Show Clock",
        "info": "Display current time in the top right corner"
      },
      "clockSize": {
        "desc": "Clock Size",
        "info": "Set font size for the clock (24-72px)"
      },
      "showContext": {
        "desc": "Show Playback Context",
        "info": "Display current playlist/album info in bottom left"
      },
      "showContextImage": {
        "desc": "Show Context Image",
        "info": "Display playlist/album thumbnail image"
      },
      "showNextTrack": {
        "desc": "Preview Next Track",
        "info": "Display next track info in top right before the song ends (Broadcast style)"
      },
      "nextTrackTime": {
        "desc": "Next Track Display Time",
        "info": "Seconds before end of song to show next track info (5-30s)",
        "unit": "sec"
      },
      "showControls": {
        "desc": "Show Player Controls",
        "info": "Display play/pause, prev/next, shuffle, repeat, and like buttons"
      },
      "showVolume": {
        "desc": "Show Volume Control",
        "info": "Display volume slider in player controls"
      },
      "showProgressBar": {
        "desc": "Show Progress Bar",
        "info": "Display progress bar showing playback position and total time"
      },
      "showLyricsProgress": {
        "desc": "Show Lyrics Progress",
        "info": "Display current lyrics line number and total lines"
      },
      "showQueue": {
        "desc": "Show Queue Panel",
        "info": "Show playback queue when hovering over the right side of the screen"
      }
    },
    "controllerStyle": {
      "title": "Controller Style",
      "subtitle": "Configure the appearance of player controls",
      "buttonSize": {
        "desc": "Control Button Size",
        "info": "Set size for play, prev/next buttons (28-48px)"
      },
      "background": {
        "desc": "Controller Background",
        "info": "Add semi-transparent background to the controller"
      }
    },
    "autoHide": {
      "title": "Auto Hide",
      "subtitle": "Auto hide UI when mouse is inactive",
      "enabled": {
        "info": "Automatically hide controller and info when mouse stops moving",
        "desc": "Auto Hide UI"
      },
      "delay": {
        "desc": "Auto Hide Delay",
        "info": "Time to wait before hiding UI after mouse inactivity (1-10s)"
      }
    },
    "tmiStyle": {
      "title": "Trivia Style",
      "subtitle": "Style settings for the Trivia modal shown when clicking album art",
      "fontSize": {
        "desc": "Trivia Font Size",
        "info": "Adjust global font size for the Trivia modal (80-150%)"
      }
    },
    "aboutTab": {
      "account": {
        "loginRequired": "Discord login is required.",
        "checking": "Checking account information...",
        "title": "Account Linking",
        "subtitle": "Link with your Discord account",
        "description": "Discord-based ivLyrics contribution account",
        "info": "Sign in with Discord to manage your creator profile. Existing anonymous contributions are not transferred automatically without ownership verification.",
        "loginButton": "Sign In With Discord",
        "loading": "Loading account info...",
        "linked": "Linked",
        "linkedAt": "Linked on",
        "lastSync": "Last login",
        "manageAccount": "Change Account",
        "refresh": "Refresh",
        "loggingIn": "Opening browser...",
        "startHint": "Complete the Discord sign-in flow in your browser.",
        "failed": "Discord login failed.",
        "loadFailed": "Failed to load account information.",
        "discordLoginSuccess": "Discord account linked successfully.",
        "logout": "Log Out",
        "logoutFailed": "Failed to sign out from Discord.",
        "logoutSuccess": "Signed out from Discord and created a new user hash.",
        "nickname": {
          "label": "Nickname",
          "enter": "Please enter a nickname.",
          "changed": "Nickname changed.",
          "failed": "Failed to change",
          "error": "Error occurred",
          "placeholder": "Enter nickname",
          "none": "No nickname",
          "saving": "Saving...",
          "save": "Save",
          "change": "Change"
        },
        "creatorPrivacy": {
          "title": "Private creator profile",
          "description": "Private profiles remain in contributor lists, but your name, photo, and profile links are hidden.",
          "public": "Public",
          "private": "Private",
          "loading": "Loading privacy setting...",
          "loadFailed": "Failed to load creator profile privacy.",
          "saveFailed": "Failed to update creator profile privacy.",
          "savedPublic": "Your creator profile is now public.",
          "savedPrivate": "Your creator profile is now private.",
          "loginRequired": "Discord login is required to manage creator profile privacy."
        },
        "backup": {
          "title": "Backup & Restore",
          "enterName": "Please enter a backup name.",
          "success": "Settings backed up.",
          "fail": "Backup failed",
          "error": "Error during backup",
          "restoreSuccess": "Settings restored. Please restart the app to apply.",
          "invalidFormat": "Invalid settings format.",
          "downloadFail": "Failed to download settings",
          "downloadError": "Error during download",
          "deleteConfirm": "Are you sure you want to delete this backup?",
          "deleted": "Backup deleted.",
          "deleteFail": "Delete failed",
          "deleteError": "Error during deletion",
          "placeholder": "Backup name (e.g. PC Settings)",
          "backupBtn": "Backup",
          "restoreBtn": "Restore",
          "deleteBtn": "Delete",
          "noBackups": "No backups saved."
        }
      },
      "appInfo": {
        "title": "App Info"
      },
      "developer": "Developed by:",
      "originalProject": "Original Project:",
      "thanks": "Special thanks to everyone who contributed to this open-source project.",
      "clientInfo": {
        "title": "Client Info",
        "subtitle": "Unique identifier for this client",
        "description": "This is a unique identifier automatically generated for account linking. This value cannot be modified and is unique to each client. Please keep this value private.",
        "copied": "Client ID copied",
        "copyFailed": "Copy failed",
        "copy": "Copy"
      },
      "update": {
        "title": "Update",
        "subtitle": "Check for latest version",
        "checkUpdate": {
          "desc": "Check Latest Version",
          "button": "Check for Updates",
          "checking": "Checking..."
        },
        "protocol": {
          "desc": "One-click update",
          "info": "Open the ivLyrics update page. It will try to start the updater automatically and show a manual update link if needed.",
          "unsupportedInfo": "One-click update is not available on this platform. Press the button to copy the install command.",
          "button": "Update",
          "opening": "Opening the ivLyrics update page.",
          "failed": "Failed to open the update page.",
          "unsupportedCopied": "One-click update is not available here, so the install command was copied."
        },
        "copied": "Copied",
        "installCopied": "Install command copied",
        "copyFailed": "Copy failed"
      },
      "patchNotes": {
        "title": "Patch Notes",
        "subtitle": "Recent update history",
        "loading": "Loading patch notes..."
      },
      "subtitle": "About ivLyrics",
      "appDescription": "Lyrics Extension with various features",
      "versionPrefix": "Version",
      "viewOnGithub": "View on GitHub",
      "patchNotesLoadFailed": "Failed to load patch notes",
      "checkGithubReleases": "Please check GitHub releases page",
      "visitGithub": "Visit GitHub Repository",
      "joinDiscord": "Join Discord Server"
    },
    "debugTab": {
      "title": "Debug Info",
      "subtitle": "Information to send to developer when reporting bugs",
      "currentTrack": "Current Track Info",
      "trackInfo": "Track Info",
      "lyricsInfo": "Lyrics Info",
      "settingsInfo": "Settings Info",
      "noLyrics": "No lyrics info",
      "loading": "Loading info...",
      "refresh": "Refresh",
      "copyToClipboard": "Copy to Clipboard",
      "copied": "Copied!",
      "copyFailed": "Copy failed",
      "sendToDiscord": "Report to Discord",
      "rawJson": "JSON Data"
    },
    "api": {
      "title": "API Settings",
      "getApiKey": {
        "desc": "Get API Key",
        "info": "You can get a Gemini API key for free at Google AI Studio",
        "button": "Open API Key Page"
      },
      "geminiKey": {
        "desc": "Gemini API Key",
        "info": "API key is required to use lyrics translation with Google Gemini AI"
      }
    },
    "update": {
      "title": "Update",
      "subtitle": "Check for latest version",
      "checkUpdate": {
        "desc": "Check Latest Version",
        "button": "Check for Updates",
        "checking": "Checking..."
      },
      "copied": "Copied",
      "installCopied": "Install command copied",
      "copyFailed": "Copy failed",
      "currentVersionInfo": "Current Version: v{version}. Checking GitHub for new updates",
      "checkFailedWithError": "Update check failed: {error}"
    }
  },
  "syncAdjust": {
    "info": "Moving slider to the right makes lyrics appear faster.",
    "reset": "Reset",
    "communityTitle": "Community Sync",
    "communityOffset": "Offset",
    "submissions": "Submissions",
    "confidenceHigh": "High Confidence",
    "confidenceMedium": "Medium Confidence",
    "confidenceLow": "Low Confidence",
    "applyCommunity": "Apply",
    "submitMine": "Submit My Offset",
    "submitting": "Submitting...",
    "submitSuccess": "Submitted to community",
    "submitFailed": "Submission failed",
    "noData": "No community data available",
    "loading": "Loading...",
    "feedbackGood": "Offset is accurate",
    "feedbackBad": "Offset is inaccurate",
    "cannotFeedbackOwnSubmission": "You cannot vote on your own submission",
    "feedbackPositiveSuccess": "Thanks for the positive feedback!",
    "feedbackNegativeSuccess": "Thanks for the feedback. We'll improve!",
    "feedbackFailed": "Failed to submit feedback",
    "autoSubmitEnabled": "⚡ Auto-submit is enabled",
    "trackTitle": "Current Track Sync",
    "trackInfo": "Applies only to the currently playing track.",
    "globalTitle": "Global Sync",
    "globalInfo": "Applies to every song on this device only. It is never submitted to the community.",
    "communityUnavailableLocal": "Community offsets cannot be submitted for local tracks without a Spotify trackId."
  },
  "playbarButton": {
    "label": "Lyrics Plus"
  },
  "generationStatus": {
    "complete": "Done!",
    "culturalAnnotations": "Cultural context explanations",
    "culturalAnnotationsLoading": "Analyzing cultural context..."
  },
  "videoBackground": {
    "loading": "Loading video info...",
    "notFound": "Video not found.",
    "error": "An error occurred.",
    "localTrackNeedsVideo": "For local tracks, set a YouTube URL manually from the video button.",
    "loadingMessage": "Loading video background... This takes about 30 seconds.",
    "downloadingVideo": "Downloading video...",
    "downloading": "Downloading: {percent}%",
    "processing": "Processing video...",
    "checking": "Checking video...",
    "preparing": "Preparing video download...",
    "downloadComplete": "Video download complete!",
    "helperNotConnected": "Cannot connect to Helper Program. Please make sure it is running.",
    "helperError": "Error occurred in Helper Program.",
    "tryingCookiesFile": "Trying with cookies.txt file...",
    "tryingBrowserCookies": "Trying with {browser} cookies...",
    "checkingWithCookiesFile": "Checking video with cookies.txt...",
    "checkingWithBrowserCookies": "Checking video with {browser} cookies...",
    "checkingAvailability": "Checking video availability...",
    "ageRestrictedNoCookies": "Age-restricted video. No cookies.txt or supported browser found. Please set up cookies.txt in settings.",
    "ageRestrictedFailed": "Age-restricted video. Please set up a valid cookies.txt in settings.",
    "videoAlreadyDownloaded": "Video already downloaded",
    "videoAvailable": "Video available",
    "videoNotDownloaded": "Video not downloaded"
  },
  "translator": {
    "missingApiKey": "Gemini API key is not set. Please enter API key in settings.",
    "invalidApiKeyFormat": "Invalid API key format. Gemini API key must start with 'AIza'.",
    "invalidRequestFormat": "Invalid request format. Please check your API key.",
    "invalidApiKey": "Invalid API key. Please check Gemini API key in settings.",
    "accessForbidden": "API access forbidden. Please check API key permissions.",
    "rateLimitExceeded": "Request limit exceeded. Please try again later.",
    "serviceUnavailable": "Translation service is temporarily unavailable. Please try again later.",
    "requestFailed": "API request failed",
    "apiKeyError": "Gemini API key error. Please check your API key in settings.",
    "translationFailed": "Translation failed",
    "requestTimeout": "Translation request timed out. Please try again.",
    "failedPrefix": "Translation Failed"
  },
  "utils": {
    "allUrlsFailed": "Failed to get version info from all URLs",
    "invalidVersionFormat": "Invalid version format",
    "unknownError": "Unknown error",
    "requestTimeout": "Request timed out",
    "networkError": "Network connection failed",
    "securityRestriction": "Restricted by browser security policy",
    "serverError": "Server response error",
    "terminalMac": "Terminal"
  },
  "modes": {
    "character": "Character",
    "word": "Word",
    "rightClickToLock": "Right-click to lock",
    "rightClickToUnlock": "Right-click to unlock",
    "karaoke": "Karaoke",
    "synced": "Synced",
    "unsynced": "Plain Text"
  },
  "communityVideo": {
    "loginRequired": "Discord login is required to register community videos.",
    "title": "Community Video Recommendations",
    "loading": "Loading video list...",
    "loadError": "Failed to load video list",
    "randomSelectionLabel": "Random community video",
    "randomSelectionDesc": "Choose an eligible community video at random each time this song plays. Videos with more dislikes than likes are excluded.",
    "randomSelectionWarning": "Random selection increases variety, but makes it more likely that the best available video will not be selected.",
    "hideDislikedLabel": "Hide videos I disliked",
    "hideDislikedDesc": "Hide these videos from the list and random selection. Hidden: {count}.",
    "allDislikedHidden": "All available videos are hidden because you disliked them.",
    "noVideos": "No community videos registered",
    "localTrackDesc": "This is a local track. The YouTube URL is saved on this device only and is not sent to the server.",
    "localOnlyApplied": "Local video applied.",
    "autoDetected": "Auto Detected",
    "startTime": "Start",
    "submittedBy": "Submitted by",
    "addVideo": "Add Video",
    "addVideoNoEmoji": "Add Video",
    "youtubeUrl": "YouTube URL",
    "startTimeSeconds": "Start Time (sec)",
    "submit": "Submit",
    "submitting": "Submitting...",
    "submitted": "Video successfully submitted!",
    "updated": "Video info updated!",
    "updatedAndApplied": "Video timing updated and applied!",
    "submitError": "Failed to submit video",
    "invalidUrl": "Invalid YouTube URL",
    "videoNotFound": "YouTube video does not exist",
    "videoPrivate": "Video is private or deleted",
    "validationError": "Cannot verify video. Please try again.",
    "selectVideo": "Select Video",
    "preview": "Preview",
    "apply": "Apply",
    "applyShort": "Apply",
    "applied": "Video applied",
    "videoTitle": "Video Title",
    "openOnYouTube": "Open on YouTube",
    "edit": "Edit",
    "updateAction": "Update",
    "updateAndApplyAction": "Update & Apply",
    "loadingTitle": "Getting title...",
    "startTimeLabel": "First Lyrics Start Time (sec)",
    "startTimeHint": "Enter the time when the first lyrics line starts in the YouTube video",
    "skipSegmentsLabel": "Skipped sections",
    "skipSegmentsHint": "Add every talking, story, or other non-music range to skip during synchronized playback. Times are in seconds.",
    "skipSegmentStart": "Start",
    "skipSegmentEnd": "End",
    "addSkipSegment": "Add",
    "removeSkipSegment": "Remove skipped section",
    "skipSegmentCount": "{count}/{max} sections",
    "skipSegmentInvalid": "Enter a valid start and end time. The end must be at least 0.1 seconds after the start.",
    "skipSegmentLimit": "Up to {count} skipped sections can be added.",
    "delete": "Delete",
    "deleteConfirm": "Do you want to delete this video?",
    "deleted": "Video deleted",
    "deleteError": "Failed to delete video",
    "downloading": "Downloading video..."
  },
  "close": "Close",
  "cancel": "Cancel",
  "shareImage": {
    "title": "Share Lyrics Image",
    "subtitle": "Create and share images of your favorite lyrics",
    "selectLyrics": "Select Lyrics",
    "selectLyricsHint": "Click lyrics lines to include (Max 10 lines)",
    "template": "Presets",
    "templates": {
      "cover": "Cover Blur",
      "gradient": "Gradient",
      "minimal": "Minimal",
      "glass": "Glass",
    },
    "advancedSettings": "Advanced Settings",
    "sections": {
      "background": "Background",
      "cover": "Album Cover",
      "lyrics": "Lyrics",
      "layout": "Layout",
      "other": "Other"
    },
    "copyrightWarning": "Copyright Notice\n\nThis lyrics image may contain copyrighted content.\n\n• Please use for personal use only\n• Do not use for commercial purposes\n• Respect original creators when sharing on social media\n\nDo you want to continue?",
    "copyrightTitle": "Copyright Notice",
    "copyrightDesc": "This lyrics image may contain copyrighted content.",
    "copyrightPoint1": "Please use for personal use only",
    "copyrightPoint2": "Do not use for commercial purposes",
    "copyrightPoint3": "Respect original creators when sharing on social media",
    "copyrightConfirm": "Agree and Continue",
    "settings": {
      "backgroundType": "Background Style",
      "coverBlur": "Blur",
      "gradient": "Gradient",
      "solid": "Solid Color",
      "backgroundBlur": "Background Blur",
      "backgroundOpacity": "Background Dimming",
      "showCover": "Album Cover",
      "showTrackInfo": "Track Info",
      "coverPosition": "Cover Position",
      "posLeft": "Left",
      "posCenter": "Center",
      "coverSize": "Cover Size",
      "coverRadius": "Cover Radius",
      "coverBlur": "Cover Blur",
      "showPronunciation": "Pronunciation",
      "showTranslation": "Translation",
      "lyricsAlign": "Lyrics Alignment",
      "alignLeft": "Left",
      "alignCenter": "Center",
      "fontSize": "Font Size",
      "blockGap": "Line Gap",
      "aspectRatio": "Image Ratio",
      "imageWidth": "Image Width",
      "padding": "Padding",
      "showWatermark": "Show Watermark"
    },
    "preview": "Preview",
    "actions": {
      "copy": "Copy to Clipboard",
      "download": "Download",
      "share": "Share"
    },
    "copied": "✓ Copied to clipboard",
    "downloaded": "✓ Downloaded",
    "shared": "✓ Shared",
    "maxLinesReached": "You can select up to 10 lines",
    "noSelection": "Please select lyrics"
  },
  "setupWizard": {
    "welcome": {
      "title": "Welcome to ivLyrics!",
      "subtitle": "Enjoy beautiful lyrics on Spotify",
      "features": {
        "lyrics": "Real-time Synced Lyrics",
        "translation": "AI Translation Support",
        "customization": "Various Customizations"
      },
      "start": "Get Started"
    },
    "language": {
      "title": "Select Language",
      "subtitle": "Choose your preferred language"
    },
    "apiKey": {
      "title": "Gemini API Key Setup",
      "subtitle": "API key is required to use AI translation",
      "guide": {
        "title": "How to get API Key",
        "step1": "Visit Google AI Studio",
        "step2": "Click Get API Key",
        "step3": "Create new API key",
        "step4": "Copy generated key"
      },
      "getKey": "Get API Key",
      "skip": "Set up later",
      "placeholder": "Enter API Key...",
      "multipleKeysHint": "You can register multiple API keys in settings"
    },
    "theme": {
      "title": "Basic Settings",
      "subtitle": "Choose how lyrics are displayed",
      "alignment": "Alignment",
      "background": "Background Effect",
      "backgrounds": {
        "colorful": "Colorful",
        "gradient": "Album Cover",
        "blurGradient": "Blur Gradient",
        "solid": "Solid Color",
        "video": "Video"
      }
    },
    "translationTip": {
      "title": "Translation Guide",
      "subtitle": "Translation features are configured per language",
      "pronunciation": "Pronunciation",
      "translation": "Translation",
      "description": "Enabling translation for K-POP does not apply to J-POP. Click the Convert button at the bottom to set 'Pronunciation' and 'Translation' options separately for each language."
    },
    "overlayTip": {
      "title": "Desktop Overlay",
      "subtitle": "View lyrics anywhere on your desktop",
      "description": "Install the overlay app to see lyrics while using other applications. You can enable it anytime in settings.",
      "requiresApp": "Requires separate overlay app installation to use this feature.",
      "enabled": "Enable Overlay",
      "downloadApp": "Download Overlay App"
    },
    "nowPlayingTip": {
      "title": "NowPlaying Panel Lyrics",
      "subtitle": "Check current lyrics in right panel",
      "description": "Displays current lyrics in Spotify's 'Now Playing' panel. You can see lyrics without using fullscreen mode.",
      "enabled": "Show Panel Lyrics",
      "linesCount": "Lines to Show"
    },
    "pseudoKaraokeTip": {
      "title": "Virtual Karaoke",
      "subtitle": "Enable karaoke-style highlighting on almost every song",
      "description": "Uses Spotify audio analysis to synthesize karaoke timing for line-synced lyrics. This makes karaoke mode work on almost every song, but the timing is approximate and may be inaccurate.",
      "enabled": "Enable Virtual Karaoke"
    },
    "complete": {
      "title": "Ready!",
      "subtitle": "You are now ready to use ivLyrics",
      "startNow": "Start Now",
      "openSettings": "More Settings"
    },
    "navigation": {
      "next": "Next",
      "back": "Back",
      "skip": "Skip"
    },
    "videoTest": {  
      "title": "Video Background Test",
      "subtitle": "Please check if the YouTube video below plays correctly",
      "question": "Does it say login is required to play the video?",
      "yes": "Yes",
      "no": "No",
      "helperRequired": "If so, you need to install the Helper Program.",
      "helperDesc": "The Helper Program allows playing YouTube videos without logging in.",
      "installHelper": "Install Helper Program",
      "skip": "Skip"
    },
    "videoHelperTest": {  
      "title": "Helper Program Test",
      "subtitle": "Checking if Helper Program works correctly",
      "enableHelper": "Enable Helper Program",
      "testVideo": "Play Test Video",
      "testing": "Testing...",
      "success": "Helper Program is working correctly!",
      "failed": "Cannot connect to Helper Program. Please check if it is running.",
      "downloading": "Downloading video: {percent}%",
      "skip": "Skip"
    }
  },
  "vinyl": {
    "mode": "Vinyl mode",
    "openHint": "Click the album to open",
    "closeHint": "Click the album to return",
    "recordHint": "Click the record to play or pause",
    "tonearmHint": "Drag the tonearm to seek",
    "tmiHint": "Right-click or hold the album to open TMI",
    "click": "Click",
    "tmiGesture": "Right click · Hold",
    "presentation": {
      "switcherLabel": "Fullscreen presentation",
      "settingsTitle": "Focused lyric layout",
      "settingsDescription": "Choose the visual used when the album opens focused lyrics.",
      "standardLabel": "Standard",
      "vinylLabel": "Full vinyl",
      "vinylDescription": "Show the full record player with the focused lyric at the bottom.",
      "compactLabel": "Compact vinyl",
      "compactDescription": "Keep the standard lyric layout and show a partially exposed record behind the album cover.",
      "videoLabel": "Video stage",
      "videoDescription": "Show the synchronized YouTube video with the focused lyric at the bottom."
    },
    "settings": {
      "subtitle": "Customize the LP mode size, motion, and bottom lyric typography.",
      "albumSizeLabel": "Album cover size",
      "albumSizeDesc": "Adjusts the album cover size in LP mode.",
      "recordSizeLabel": "Record size",
      "recordSizeDesc": "Adjusts the vinyl record size in LP mode.",
      "backgroundBlurLabel": "Full LP background blur",
      "backgroundBlurDesc": "Apply additional background blur only in full LP mode.",
      "animationsLabel": "LP animations",
      "animationsDesc": "Use play/pause, record spin, entrance, and track-change animations.",
      "centerRotationLabel": "Rotate LP center",
      "centerRotationDesc": "Rotate the center label together with the record during playback.",
      "lyricsLabel": "Show LP lyrics",
      "lyricsDesc": "Show the current lyric below the record in LP mode.",
      "tonearmTitle": "Tonearm",
      "tonearmSubtitle": "Customize the tonearm shape, finish, and size.",
      "tonearmStyleLabel": "Tonearm style",
      "tonearmStyleDesc": "Choose the tonearm design used in vinyl mode.",
      "tonearmStyleS": "S-shaped (classic)",
      "tonearmStyleStraight": "Straight",
      "tonearmStyleJ": "J-shaped",
      "tonearmStyleLinear": "Linear tracking",
      "tonearmFinishLabel": "Tonearm finish",
      "tonearmFinishDesc": "Choose the tonearm color and finish.",
      "tonearmFinishWhite": "White",
      "tonearmFinishSilver": "Silver",
      "tonearmFinishBlack": "Black",
      "tonearmSizeLabel": "Tonearm size",
      "tonearmSizeDesc": "Adjust the tonearm size in vinyl mode.",
      "typographySubtitle": "Adjust the fonts for the original, pronunciation, and translation shown below the LP.",
      "videoStageTypographyTitle": "Video stage lyrics",
      "videoStageTypographySubtitle": "Set separate fonts and a text background for lyrics shown in Video Stage.",
      "videoStageBackgroundColorLabel": "Lyric background color",
      "videoStageBackgroundColorDesc": "Choose the color behind Video Stage lyric text.",
      "videoStageBackgroundOpacityLabel": "Lyric background opacity",
      "videoStageBackgroundOpacityDesc": "Adjust the opacity of the Video Stage lyric text background."
    }
  },
  "tmi": {
    "getApiKeyDesc": "Get Gemini API Key",
    "getApiKeyInfo": "Used to fetch Trivia. You can get it for free at Google AI Studio.",
    "viewInfo": "Click to see various info about this song",
    "requireKey": "AI provider needs to be configured in settings",
    "settingTitle": "Gemini API Key",
    "settingDesc": "Required to fetch song Trivia/Info.",
    "title": "Trivia",
    "didYouKnow": "Did you know?",
    "close": "Close",
    "cancel": "Cancel",
    "loading": "Finding interesting facts...",
    "noData": "No Trivia available for this song yet.",
    "clickForTMI": "View Trivia",
    "clickToClose": "✕ or Click album art to close",
    "regenerate": "Regenerate Trivia.",
    "errorFetch": "Error occurred while fetching Trivia.",
    "errorQuota": "API quota exceeded.",
    "errorQuotaHint": "Please try again later or enter a different API key in settings.",
    "disclaimer": "This content is processed by AI from internet information and may contain inaccuracies.",
    "verified": "Verified",
    "unverified": "Unverified",
    "verifiedCount": "Verified",
    "sources": "Sources",
    "verifiedSources": "Verified Sources",
    "relatedSources": "Related Sources",
    "otherSources": "Other Sources",
    "confidenceVeryHigh": "Very High Confidence",
    "confidenceHigh": "High Confidence",
    "confidenceMedium": "Medium Confidence",
    "confidenceLow": "Low Confidence",
    "confidenceNone": "No Sources"
  },
  "research": {
    "title": "Research",
    "eyebrow": "Editorial Research",
    "thesis": "Central thesis",
    "contents": "Contents",
    "editorialNote": "Editor's note",
    "fact": "Fact",
    "requireProvider": "Enable an AI provider that supports Research in Settings",
    "regenerate": "Research again",
    "close": "Close",
    "cancel": "Cancel",
    "loadingTitle": "Reading between the lines",
    "loading": "Researching the lyrics, sound, artist, and cultural context",
    "generating": "Generating…",
    "aiGeneratedNotice": "This information is generated by AI and may contain inaccuracies.",
    "webSearchFallbackTitle": "Web search failed",
    "webSearchFallbackWarning": "Web search was unavailable, so Research is continuing without it. The result may contain more inaccuracies.",
    "fontControls": "Text size",
    "fontDecrease": "Decrease text size",
    "fontIncrease": "Increase text size",
    "errorTitle": "Research could not be completed",
    "errorFetch": "An error occurred while creating the Research document",
    "errorQuota": "API quota exceeded",
    "errorQuotaHint": "Try again later or choose another AI provider in Settings",
    "sourcesEmpty": "No source links were returned",
    "disclaimer": "AI-generated research may contain inaccuracies. Check the linked sources before relying on factual claims",
    "styleTitle": "Research typography",
    "styleSubtitle": "Adjust the text size and outline used in the fullscreen Research document",
    "fontSizeDesc": "Research text size",
    "fontSizeInfo": "Adjust the overall text size of the Research document",
    "gestureHint": "Right-click or hold the album artwork to open Research",
    "gesture": "Right-click · Hold",
    "tokenConsentTitle": "Before using Research",
    "tokenConsentBody": "The first time Research is generated, it may use a large number of tokens to analyze the song and gather supporting information.",
    "tokenConsentNote": "Token usage and possible charges depend on the selected AI provider and model.",
    "tokenConsentAgree": "Agree and start Research",
    "providerDescription": "Choose AI providers for translation, pronunciation, Research, and Learning mode",
    "sections": {
      "overview": "Overview",
      "information": "Basic information",
      "listeningGuide": "Listening guide",
      "trivia": "Fun Facts",
      "title": "Title analysis",
      "lyrics": "Lyric analysis",
      "chorus": "Chorus analysis",
      "ending": "Final line",
      "music": "Music analysis",
      "artist": "Artist context",
      "comparison": "Comparative analysis",
      "culture": "Cultural context",
      "visual": "Visual world",
      "critique": "Final critique",
      "sources": "Sources",
      "quality": "Research notes"
    },
    "status": {
      "verified": "Verified",
      "interpretation": "Interpretation",
      "uncertain": "Uncertain",
      "disputed": "Disputed"
    },
    "quality": {
      "verified": "Verified facts",
      "interpretations": "Interpretations",
      "uncertain": "Uncertain items",
      "conflicts": "Conflicting information",
      "missing": "Missing information",
      "empty": "No additional Research notes"
    },
    "labels": {
      "original": "Original",
      "timeline": "Timeline",
      "sourceFootnote": "source",
      "reading": "Reading",
      "meaning": "Meaning",
      "lyricConnection": "Connection to the lyrics",
      "endingConnection": "Connection to the final line",
      "speaker": "Speaker",
      "listener": "Addressee",
      "relationship": "Relationship",
      "emotionalArc": "Emotional arc",
      "literal": "Literal meaning",
      "symbolic": "Symbolic meaning",
      "contextual": "Contextual meaning",
      "nuance": "Nuance",
      "role": "Role in the song",
      "repeatedPhrases": "Repeated phrases",
      "change": "Development",
      "finalLyric": "Final lyric",
      "titleConnection": "Connection to the title",
      "openingConnection": "Connection to the opening",
      "reinterpretation": "Reinterpretation",
      "genre": "Genre",
      "tempo": "Tempo",
      "rhythm": "Rhythm",
      "instrumentation": "Instrumentation and timbre",
      "vocal": "Vocals",
      "harmony": "Harmony",
      "arrangement": "Arrangement",
      "structure": "Structure",
      "lyricMusic": "Lyrics and music",
      "history": "Historical context",
      "genreContext": "Genre context",
      "popCulture": "Popular culture",
      "aesthetic": "Aesthetic",
      "mv": "Music video",
      "artwork": "Artwork",
      "visualInterpretation": "Visual interpretation",
      "core": "Core reading",
      "literary": "Literary reading",
      "musical": "Musical reading",
      "career": "Career context",
      "background": "Background",
      "ageAtRelease": "Age at release",
      "careerStage": "Career stage",
      "significance": "Significance",
      "similarities": "Similarities",
      "differences": "Differences",
      "whyItMatters": "Why the comparison matters",
      "listenHere": "Listen from here",
      "listenFor": "Listen for",
      "surprise": "The song's twist",
      "creationStory": "How the song was made",
      "creatorVoices": "In the creator's words",
      "creativeConnections": "Creative connections",
      "afterlife": "Life after release",
      "mythCheck": "Myth vs. fact",
      "sample": "Sample",
      "cover": "Cover",
      "notableWork": "Notable work"
    }
  },
  "learningMode": {
    "button": "Learn",
    "eyebrow": "AI Learning",
    "title": "AI Learning Mode",
    "close": "Close",
    "darkMode": "Dark Mode",
    "lightMode": "Light Mode",
    "tabExplain": "Lesson",
    "tabQuiz": "Quiz",
    "tabWords": "Wordbook",
    "tabHistory": "History",
    "studyHistoryTitle": "Generated Songs",
    "studyHistoryCount": "{count} songs",
    "studyHistoryEmpty": "No generated learning songs yet.",
    "studyHistoryCurrent": "Current study",
    "historyMissingTrack": "Cannot open this song.",
    "historyPlayFailed": "Failed to open the song.",
    "unknownSong": "Untitled",
    "difficulty": "Difficulty",
    "difficultyHint": "Choose how deep the lesson should be before generating.",
    "difficultyEasy": "Easy",
    "difficultyNormal": "Normal",
    "difficultyHard": "Hard",
    "difficultyNative": "Native",
    "quizRegenerate": "New Questions",
    "quizRegenerated": "New quiz questions created.",
    "quizRegenerateFailed": "Failed to create new quiz questions.",
    "loadingQuizOnly": "Creating new quiz questions... ({current}/{total})",
    "quizType": "Expression Practice",
    "quizTypeMeaning": "Meaning",
    "quizTypeBlank": "Fill the Blank",
    "quizTypeUsage": "Use in Context",
    "quizTypeRewrite": "Rewrite",
    "quizTypeGrammar": "Grammar",
    "quizStep": "Question {current}/{total}",
    "quizCorrect": "Correct",
    "quizWrong": "Explanation",
    "skipQuiz": "Skip",
    "nextQuiz": "Next Question",
    "quizDone": "Done",
    "quizResult": "Results",
    "quizResultPerfect": "Perfect. No missed questions.",
    "quizResultGood": "Nice work. Review the missed questions once more.",
    "quizResultNeedsReview": "Start with the review notes, then try again.",
    "quizAccuracy": "Accuracy",
    "quizCorrectCount": "Correct",
    "quizWrongCount": "Missed",
    "quizReviewTitle": "Review Notes",
    "quizReviewHint": "Review the lyric, your answer, and the correct answer.",
    "quizYourAnswer": "Your answer",
    "quizCorrectAnswer": "Correct answer",
    "quizReviewQuestion": "View Question",
    "quizNoWrong": "No missed questions.",
    "quizGoWordbook": "Open Wordbook",
    "quizRetryWrong": "Retry Missed",
    "quizRetry": "Retry Quiz",
    "wordbookTitle": "Saved Expressions",
    "wordCount": "{count}",
    "wordSearch": "Search expression, meaning, lyric",
    "wordStatAll": "All {count}",
    "wordStatCurrent": "This Song {count}",
    "wordStatReading": "Reading {count}",
    "wordStatSource": "Lyrics {count}",
    "wordStatSynced": "Synced {count}",
    "wordScopeAll": "All",
    "wordScopeCurrent": "This Song",
    "wordScopeSynced": "Synced",
    "noWordResults": "No matching saved words.",
    "speak": "Play Pronunciation",
    "speakLyric": "Play Lyric",
    "playLyric": "Play Lyric",
    "lyricPlaybackUnavailable": "No synced lyric time is available for playback.",
    "lyricPlaybackFailed": "Failed to play from the lyric position.",
    "wrongReview": "Review Again",
    "noLyrics": "No lyrics available for learning.",
    "empty": "No learning data for this song yet.",
    "generate": "Generate",
    "regenerate": "Regenerate",
    "loading": "Analyzing lyrics...",
    "loadingProgress": "Analyzing lyrics in smaller parts... ({current}/{total})",
    "loadingSummary": "Summarizing the song...",
    "loadingLines": "Building lyric cards... ({current}/{total})",
    "loadingExpressions": "Finding key expressions... ({current}/{total})",
    "loadingQuiz": "Building quiz questions... ({current}/{total})",
    "loadFailed": "Failed to load learning data.",
    "generateFailed": "Failed to generate learning mode.",
    "generated": "Learning mode generated.",
    "noProvider": "Enable an AI provider that supports learning in settings.",
    "summary": "Song Summary",
    "currentLine": "Current Lyric",
    "sourceLine": "Lyric",
    "reading": "Reading",
    "pronunciation": "Pronunciation",
    "lessonProgress": "Progress",
    "readyState": "Ready to learn",
    "grammarPatterns": "Grammar Points",
    "grammarPatternsHint": "Only reusable patterns from the lyrics are shown here.",
    "keyExpressions": "Expression Expansion",
    "expressionExpansionHint": "Expansion notes that make lyric words usable in other situations.",
    "alternatives": "Alternatives",
    "forms": "Forms",
    "relatedWords": "Related Words",
    "saveWord": "Save",
    "savedWord": "Saved",
    "removedWord": "Removed",
    "wordSaved": "Saved to wordbook.",
    "wordSaveFailed": "Failed to save word.",
    "removeWord": "Remove",
    "noWords": "No saved words.",
    "noQuiz": "No quiz generated.",
    "score": "{score}/{total} correct",
    "omitted": "{count} lyric segments are outside the analysis range.",
    "linePending": "This lyric card is still being built.",
    "lineOutOfRange": "The current lyric is outside the analysis range."
  },
  "notice": {
    "confirm": "Confirm",
    "next": "Next",
    "dismissAll": "Close All"
  },
  "syncCreator": {
    "loginRequired": "Discord login is required to create karaoke sync.",
    "title": "Create Karaoke Sync",
    "syncGranularityLabel": "Sync unit",
    "syncGranularityLine": "Line",
    "syncGranularityWord": "Word",
    "syncGranularityCharacter": "Character",
    "syncGranularityHint": "Choose the unit used to record timing",
    "lineSyncHint": "Tap the lyric when the line begins.",
    "wordSyncHint": "Tap or drag in time with each word.",
    "buttonTooltip": "Create Karaoke Sync",
    "clickHereHint": "Click here to sync the lyrics!",
    "loading": "Loading...",
    "loadLyrics": "Load Lyrics",
    "reload": "Reload",
    "loadingLyrics": "Loading lyrics...",
    "selectProvider": "Please select a lyrics provider from the left sidebar",
    "noLyrics": "Lyrics not found",
    "loadError": "Error loading lyrics",
    "currentLine": "Current Line",
    "nextLine": "Next Line",
    "progress": "Progress",
    "linesCompleted": "Lines Completed",
    "chars": "Chars",
    "reset": "Reset",
    "resetConfirm": "All sync data in progress will be deleted.\nStart over from the beginning?",
    "firstLine": "To First Line",
    "prevLine": "Previous Line",
    "nextLineBtn": "Next Line",
    "recordMode": "Record Mode",
    "stopRecord": "Stop Record",
    "previewMode": "Preview Mode",
    "stopPreview": "Stop Preview",
    "idleMode": "Idle",
    "submit": "Submit",
    "submitting": "Submitting...",
    "noSyncData": "No sync data registered",
    "trackIdRequired": "Karaoke sync cannot be submitted for local tracks without a Spotify trackId.",
    "incompleteConfirm": "Some lines are not synced yet. Do you want to submit anyway?",
    "submitSuccess": "Sync data submitted! It will be applied after admin approval.",
    "submitError": "Failed to submit sync data",
    "dragHint": "Drag to record character timing. Drag left to cancel.",
    "globalOffset": "Global Offset",
    "lineOffset": "Line Offset",
    "lineOffsetUnavailable": "Available after syncing",
    "synced": "Registered",
    "notSynced": "Unregistered",
    "deleteLine": "Delete This Line",
    "loadedExistingSyncData": "Loaded existing sync data",
    "historyTitle": "History",
    "historyResize": "Resize history",
    "historyResizeHint": "Drag vertically to resize the history panel.",
    "historyEmpty": "Work states appear here after a 30-second autosave or manual save.",
    "historySourceLoaded": "Lyrics source loaded",
    "historyLineCompleted": "Line {line} completed",
    "historyPartCompleted": "Line {line} · {part} completed",
    "historyCurrentWork": "Current work",
    "historyManualCheckpoint": "Manual checkpoint",
    "historyAddCheckpoint": "Save current state",
    "historyCheckpointSaved": "Checkpoint saved.",
    "historyPrevious": "Previous state",
    "historyNext": "Next state",
    "historyChecking": "Checking recovery",
    "historyRestoring": "Restoring",
    "historySaving": "Saving",
    "historyAutosaveToggle": "Autosave",
    "historyAutosaveDescription": "Automatically save the current work every 30 seconds.",
    "historyAutosavePending": "Waiting for next autosave",
    "historyAutosaveDisabled": "Autosave off",
    "historySaved": "Autosaved",
    "historyIdle": "Waiting to save",
    "historySaveError": "Save failed",
    "historyNoSource": "No lyrics source",
    "historyRecovered": "Restored the previous work for this track.",
    "historyRestored": "Restored the selected work state.",
    "historyRestoreError": "Could not restore the work state.",
    "historyStopRecording": "Stop recording before restoring history.",
    "providerMismatch": "Existing sync data uses a different lyrics provider. You need to create new sync data for your account's provider.",
    "characterPronunciationGenerate": "AI Character Pronunciation",
    "characterPronunciationGenerating": "Generating AI pronunciation...",
    "characterPronunciationProgressPreparing": "Preparing pronunciation generation...",
    "characterPronunciationProgress": "{current}/{total} chunks - {percent}% - {remaining} left",
    "characterPronunciationProgressRetry": "Response was truncated. Splitting this chunk smaller...",
    "characterPronunciationHide": "Hide Pronunciation",
    "characterPronunciationShow": "Show Pronunciation",
    "characterPronunciationDesc": "Generate character-aligned pronunciation with AI and show it below the current line.",
    "characterPronunciationTarget": "Pronunciation notation",
    "characterPronunciationTargetDesc": "Choose the writing system used for generated pronunciation.",
    "characterPronunciationTargetLatin": "Latin (Romanization)",
    "characterPronunciationTargetTranslation": "Current translation language",
    "characterPronunciationRegenerate": "Regenerate Pronunciation",
    "characterPronunciationRegenerateDesc": "Ignore the saved result and generate pronunciation again using the selected notation.",
    "characterPronunciationPrimary": "Large Pronunciation",
    "characterPronunciationPrimaryDesc": "Make generated pronunciation larger and the original lyrics smaller.",
    "characterPronunciationJapaneseOnly": "Character pronunciation can only be generated for Japanese lyrics.",
    "characterPronunciationNoProvider": "No AI provider supports character pronunciation.",
    "characterPronunciationGenerated": "AI character pronunciation generated.",
    "characterPronunciationEmpty": "Generated character pronunciation is empty.",
    "characterPronunciationError": "Failed to generate character pronunciation",
    "characterPronunciationProgressRetryFormat": "Invalid AI alignment. Retrying with smaller chunks...",
    "characterPronunciationProgressError": "AI pronunciation generation failed. Trying fallback...",
    "characterPronunciationTokenWarningTitle": "AI character pronunciation token usage",
    "characterPronunciationTokenWarningBody": "This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.",
    "characterPronunciationTokenWarningUsage": "Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.",
    "characterPronunciationTokenWarningConfirm": "I understand and generate",
    "characterPronunciationTokenWarningCancel": "Cancel",
    "parentheticalLayoutTitle": "Choose parenthetical vocal layout",
    "parentheticalLayoutBody": "This line has multiple parenthetical vocal parts. Choose how it should be shown and synced.",
    "parentheticalLayoutOriginal": "Original",
    "parentheticalLayoutSeparateLabel": "Separate each part",
    "parentheticalLayoutSeparateDesc": "Sync each parenthetical vocal as its own vocal line.",
    "parentheticalLayoutGroupedLabel": "Group on one line",
    "parentheticalLayoutGroupedDesc": "Sync adjacent parenthetical vocals together as one vocal line.",
    "back": "Close",
    "lrclibSearchResults": "LRCLIB Search Results",
    "showLrclibSearchResults": "Show Search Results",
    "hideLrclibSearchResults": "Hide Search Results",
    "lrclibNoCandidates": "No LRCLIB candidates found",
    "lrclibSelectCandidate": "Select a candidate",
    "lrclibApplyCandidate": "Load This Lyrics",
    "lrclibLoaded": "Loaded",
    "lrclibBadgeExact": "Exact",
    "lrclibBadgeSynced": "Synced",
    "lrclibBadgePlain": "Plain",
    "lrclibBadgePrimary": "Primary",
    "lrclibBadgeEnglish": "English",
    "lrclibMetricArtist": "artist",
    "lrclibMetricTitle": "title",
    "lrclibMetricDiff": "diff",
    "lrclibIdLabel": "LRCLIB ID",
    "lrclibIdPlaceholder": "e.g. 5206921",
    "lrclibIdLoad": "Load by ID",
    "lrclibIdLoading": "Loading...",
    "lrclibIdInvalid": "Enter a valid LRCLIB ID",
    "lrclibIdLoadSuccess": "Loaded lyrics from LRCLIB ID",
    "lrclibIdLoadError": "Failed to load lyrics from LRCLIB ID",
    "lrclibIdCopied": "Copied LRCLIB ID",
    "lrclibSearchQueryLabel": "LRCLIB Search",
    "lrclibSearchQueryPlaceholder": "Song title or artist",
    "lrclibSearchButton": "Search",
    "lrclibSearchLoading": "Searching...",
    "lrclibSearchQueryRequired": "Enter a LRCLIB search query",
    "lrclibSearchError": "Failed to search LRCLIB",
    "shortcuts": {
      "charForward": "1 Char",
      "charBack": "Undo 1 Char",
      "wordForward": "1 Word",
      "wordBack": "Undo 1 Word",
      "drag": "Hold to Drag",
      "rightClick": "Right click",
      "lockToCharacter": "Lock up to char",
      "finish": "Finish Line",
      "cancel": "Cancel",
      "playPause": "Play/Pause",
      "seekBack": "-3 Sec",
      "seekForward": "+3 Sec",
      "syllable": "Syllable"
    },
    "copyLyrics": "Copy Lyrics",
    "virtualKaraoke": "Virtual karaoke data",
    "lyricsCopied": "Lyrics copied to clipboard",
    "copyError": "Copy failed",
    "export": "Export",
    "exportSuccess": "Sync data exported",
    "import": "Import",
    "importSuccess": "Sync data imported",
    "importError": "Import failed",
    "importDifferentTrack": "This sync data is from a different track. Do you want to import anyway?",
    "kindVocal": "No effect",
    "kindEffect": "Shake",
    "kindAdlib": "Breathing",
    "kindPulse": "Pulse",
    "kindWave": "Wave",
    "kindSparkle": "Sparkle",
    "kindEcho": "Echo",
    "kindWhisper": "Whisper",
    "kindBounce": "Bounce",
    "kindSway": "Sway",
    "kindGlow": "Glow",
    "kindGlitch": "Glitch",
    "kindFlicker": "Flicker",
    "kindFloat": "Float",
    "kindBlur": "Blur",
    "kindPop": "Pop",
    "rangeStyleTitle": "Partial effects · color",
    "rangeStyleHint": "Drag to select any characters, independently of the timing unit.",
    "rangeStyleSelectLabel": "Character range to style",
    "rangeStyleSelected": "Selected",
    "rangeStyleSelectPrompt": "Drag over the characters to style first.",
    "rangeStyleCount": "ranges",
    "rangeStyleEmpty": "No styled ranges",
    "rangeEffectApply": "Apply effect",
    "rangeColorLabel": "Range color",
    "rangeColorApply": "Apply color",
    "rangeStyleClear": "Clear style",
    "rangeStyleApplied": "Effect applied to the selected characters.",
    "rangeColorApplied": "Color applied to the selected characters.",
    "rangeStyleCleared": "Style cleared from the selected range.",
    "select": "Select",
    "speakerLabel": "Speaker",
    "speakerCustomColor": "Custom speaker color",
    "speakerCustomColorDesc": "This color is stored in sync-data and shown to listeners who allow creator colors.",
    "speakerCustomFallback": "Fallback color group",
    "speakerCustomFallbackDesc": "Used when listeners disable creator custom colors.",
    "speakerCustomColorInvalid": "Enter a valid HEX color.",
    "typeLabel": "Text effect",
    "unselectedType": "Text effect not selected",
    "allLine": "Full line",
    "bulkVocalLabel": "All vocals",
    "bulkVocalPlaceholder": "Set speaker...",
    "bulkVocalApplied": "Applied the vocal speaker to the whole song.",
    "enableMultiVocalMode": "Enable multiple vocal mode",
    "mergeWithNextLine": "Merge next line",
    "mergedWithNextLine": "Merged with the next line as separate vocal parts.",
    "manualSplit": "Manual split",
    "useAutoSplit": "Use auto",
    "splitHere": "Split here",
    "multiVocalMetaRequired": "Select SPEAKER and text effect for the current vocal first.",
    "selectVocalPartFirst": "Select the vocal part to sync first.",
    "lineMissingSync": "Line {line} has no sync yet.",
    "lineAllPartsMissingSync": "Sync every vocal part on line {line}.",
    "linePartMetaRequired": "Select SPEAKER and text effect for every vocal part on line {line}.",
    "lineMetaRequired": "Select SPEAKER and text effect for line {line}.",
    "multiVocalBannerParts": "Multiple vocal mode: sync each vocal part separately.",
    "multiVocalBannerLine": "Multiple vocal mode: choose SPEAKER and text effect for this line.",
    "multiVocalDetectedTitle": "Multiple vocals detected",
    "multiVocalDetectedBody": "This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.",
    "multiVocalDecisionNormal": "Continue in normal mode",
    "multiVocalDecisionMulti": "Continue in multiple vocal mode"
  },
  "marketplace": {
    "title": "Addon Marketplace",
    "search": "Search addons...",
    "filterAll": "All",
    "filterLyrics": "Lyrics",
    "filterAI": "AI",
    "filterStyle": "Style",
    "install": "Install",
    "uninstall": "Uninstall",
    "update": "Update",
    "installed": "Installed",
    "installing": "Installing...",
    "uninstalling": "Uninstalling...",
    "updateAvailable": "Update Available",
    "by": "by {author}",
    "updated": "Updated {date}",
    "version": "v{version}",
    "noAddons": "No addons available",
    "loadError": "Failed to load addon list",
    "installSuccess": "{name} installed successfully",
    "installError": "Failed to install addon",
    "uninstallSuccess": "{name} uninstalled",
    "uninstallConfirm": "Are you sure you want to uninstall {name}?",
    "backToLyrics": "Back",
    "retry": "Retry",
    "addonDetail": "Addon Details",
    "addonCount": "{count} addon(s)",
    "developerAddons": "Addons by this developer",
    "developer": "Developer",
    "moreByDeveloper": "More by this developer",
    "popular": "Popular",
    "disclaimerNotice": "The addons below are automatically listed from GitHub repositories tagged with ivlyrics-addon. These are third-party addons unrelated to ivLyrics and its developer ivLis STUDIO. For inquiries, please contact each addon's developer.",
    "disclaimerTitle": "Third-party Addon",
    "disclaimerInstall": "This is a third-party addon not developed or verified by ivLis STUDIO. Install at your own risk. For any issues, please contact the addon developer.",
    "dontShowAgain": "Don't show again",
    "browseTab": "Marketplace",
    "installedTab": "Installed",
    "addFromUrl": "Add from URL",
    "searchInstalled": "Search installed addons...",
    "installedNotice": "Installed addons remain saved here even if their GitHub source disappears. Direct URL addons and addons that failed to load can be removed at any time.",
    "loading": "Loading...",
    "uninstallError": "Failed to uninstall addon",
    "directUrlTitle": "Install from JavaScript URL",
    "directWarningTitle": "Unverified code will run inside ivLyrics",
    "directWarningBody": "This JavaScript can access Spotify session data and ivLyrics settings, change the interface, and send data over the network. Only continue if you reviewed the code and trust its source.",
    "directUrlLabel": "HTTPS .js URL",
    "directUrlPlaceholder": "https://example.com/addon.js",
    "directSnapshotNotice": "ivLyrics saves the downloaded copy and runs it at startup until you uninstall it. Remote changes are not installed automatically.",
    "directConsent": "I understand the risks and trust this source.",
    "directInstallSuccess": "{name} installed from URL",
    "directErrorUrl": "Enter a valid HTTPS URL whose path ends in .js.",
    "directErrorDownload": "Could not download JavaScript from this URL. Check the address, access permissions, and the 2 MB size limit.",
    "directErrorMetadata": "This file is not a compatible ivLyrics Lyrics or AI addon, or its metadata is missing.",
    "directErrorDuplicate": "This URL or addon ID is already installed.",
    "directErrorGeneric": "Could not install this addon from the URL.",
    "sourceDirect": "Direct URL",
    "sourceUnavailable": "No longer listed",
    "loadFailed": "Load failed",
    "viewSource": "View source",
    "installedEmpty": "No Marketplace or direct URL addons are installed yet."
  }
};
