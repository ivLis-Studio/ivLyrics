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
    "behavior": "Behavior",
    "providers": "Providers",
    "advanced": "Advanced",
    "fullscreen": "Fullscreen",
    "nowplaying": "Panel Lyrics",
    "debug": "Debug",
    "about": "About",
    "searchResults": "Search Results"
  },
  "search": {
    "placeholder": "Search settings...",
    "noResults": "No results found",
    "noResultsDesc": "Try a different search term",
    "resultCount": "{count} results",
    "clear": "Clear",
    "inSection": "in {section}"
  },
  "sections": {
    "language": "Language",
    "visualEffects": "Visual Effects",
    "visualEffectsSubtitle": "Customize visual elements of the lyrics screen",
    "syncMode": "Sync Mode",
    "syncModeSubtitle": "Configure lyrics synchronization method",
    "typography": "Typography",
    "typographySubtitle": "Adjust the style of lyrics text",
    "textShadow": "Text Shadow",
    "textShadowSubtitle": "Add shadow effects to lyrics text",
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
    "unsyncedLyricsContent": "Unsynced Lyrics Content",
    "customPreview": "Custom Preview",
    "providerUsage": "Provider Usage",
    "providerUsageSubtitle": "Configure lyrics providers to use",
    "trackSyncInfo": "Track Sync Info",
    "customDatabase": "Custom Database",
    "debug": "Debug",
    "github": "GitHub",
    "maintainers": "Maintainers",
    "contributors": "Contributors",
    "fadWarningTitle": "⚠️ Full Screen Extension Active",
    "fadWarningDesc": "Not supported while Full Screen extension is active.",
    "fadWarningTip": "Change alignment in Full Screen's own settings.",
    "desktopOverlay": "Desktop Overlay",
    "desktopOverlaySubtitle": "Display lyrics as a desktop overlay"
  },
  "overlay": {
    "enabled": {
      "label": "Enable Desktop Overlay",
      "desc": "Send lyrics to the desktop overlay app"
    },
    "port": {
      "label": "Connection Port",
      "desc": "Port number to connect with overlay app (1024-65535)"
    },
    "portSaved": "Port saved",
    "portInvalid": "Invalid port number (1024-65535)",
    "status": {
      "connected": "✓ Connected",
      "disconnected": "Not connected",
      "checking": "Checking..."
    },
    "openApp": "Open App",
    "download": "Download App",
    "downloadDesc": "Download the overlay app if it's not installed"
  },
  "settings": {
    "language": {
      "label": "Language",
      "desc": "Select the language for the extension"
    },
    "alignment": {
      "label": "Alignment",
      "desc": "Select the alignment position for lyrics text",
      "options": {
        "left": "Left",
        "center": "Center",
        "right": "Right"
      }
    },
    "noise": {
      "label": "Noise Overlay",
      "desc": "Add film grain effect to the background"
    },
    "colorful": {
      "label": "Colorful Background",
      "desc": "Enable dynamic background based on album colors"
    },
    "gradientBackground": {
      "label": "Album Cover Background",
      "desc": "Use the currently playing album cover as background (may not work properly in fullscreen mode)"
    },
    "solidBackground": {
      "label": "Solid Background",
      "desc": "Use a custom solid color as background"
    },
    "solidBackgroundColor": {
      "label": "Solid Background Color",
      "desc": "Select the color to use for solid background"
    },
    "videoBackground": {
      "label": "Video Background",
      "desc": "Use YouTube video as background (Beta)"
    },
    "videoHelper": {
      "label": "Use Helper Program",
      "desc": "Download and play YouTube videos locally. Watch videos without login.",
      "info": "💡 YouTube videos not loading?\n\nGoogle restricts some users from playing YouTube videos without logging in. \nUsing the helper program allows videos to load properly.",
      "download": "Download Helper",
      "checkConnection": "Check Connection",
      "connected": "Connected to helper program",
      "disconnected": "Cannot connect to helper program",
      "status": {
        "connected": "Connected",
        "disconnected": "Disconnected",
        "checking": "Checking..."
      }
    },
    "videoBlur": {
      "label": "Video Blur",
      "desc": "Adjust blur intensity for video background (0-40px)"
    },
    "videoCover": {
      "label": "Video Cover Fill",
      "desc": "Stretch video to fill the screen (may crop top/bottom or sides)"
    },
    "backgroundBrightness": {
      "label": "Background Brightness",
      "desc": "Adjust background brightness level (0-100%)"
    },
    "solidBackgroundWarning": "Background brightness adjustment does not apply when using solid background.",
    "updateCheck": {
      "label": "Check for Updates",
      "desc": "Automatically check for new updates",
      "info": "Update checks are performed at most once every 24 hours."
    },
    "backgroundOpacity": {
      "label": "Cover Background Opacity",
      "desc": "Set the opacity of the cover background"
    },
    "contentWidth": {
      "label": "Content Width",
      "desc": "Set the width of content in fullscreen and non-fullscreen modes"
    },
    "japaneseConversion": {
      "label": "Japanese Conversion",
      "desc": "Set the conversion format for Japanese lyrics",
      "info": "This setting only applies to synced and unsynced lyrics. It does not work for karaoke lyrics.",
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
      "desc": "Display lyrics with additional content",
      "options": {
        "disabled": "Disabled",
        "romanization": "Romanization",
        "translation": "Translation"
      }
    },
    "autoTranslation": {
      "label": "Auto Translation",
      "desc": "Automatically provide translation when lyrics don't have one",
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
        "unsynced": "Unsynced",
        "genius": "Genius"
      }
    },
    "playBarButton": {
      "label": "Playbar Button",
      "desc": "Show lyrics button in the playbar",
      "options": {
        "disabled": "Disabled",
        "normal": "Normal",
        "fullscreen": "Fullscreen"
      }
    },
    "autoScroll": {
      "label": "Auto Scroll",
      "desc": "Enable auto scroll. Returns to auto scroll 5 seconds after manual scrolling."
    },
    "animation": {
      "label": "Animation",
      "desc": "Show animations other than karaoke highlight line"
    },
    "karaoke": {
      "label": "Karaoke Lead Countdown",
      "desc": "Show lead countdown as numbers. When disabled, it shows as dots."
    },
    "blurInactive": {
      "label": "Blur Inactive Lines",
      "desc": "Blur inactive lines in synced lyrics",
      "info": "Performance issues may occur when this option is enabled."
    },
    "fade": {
      "label": "Blur & Gradient",
      "desc": "Show blur and gradient at the top and bottom of lyrics",
      "info": "Performance issues may occur when this option is enabled."
    },
    "syncedAsFallback": {
      "label": "Synced Lyrics Fallback",
      "desc": "Fall back to synced lyrics when karaoke lyrics are not available"
    },
    "unsyncedAsFallback": {
      "label": "Unsynced Lyrics Fallback",
      "desc": "Fall back to unsynced lyrics when synced lyrics are not available"
    },
    "preferUnsynced": {
      "label": "Prefer Unsynced Over Synced",
      "desc": "Prefer unsynced lyrics when both synced and unsynced lyrics are available.",
      "info": "* Some unsynced lyrics may contain lyrics that are not in synced lyrics."
    },
    "customPreview": {
      "label": "Custom Preview",
      "desc": "Customize the lyrics screen preview image. Image is displayed at 300x150px.",
      "placeholder": "Enter image URL"
    },
    "trackSyncInfo": {
      "label": "Track Sync Info",
      "desc": "Manage sync information linked to tracks"
    },
    "customDatabase": {
      "label": "Custom Database",
      "desc": "Set custom database URL",
      "placeholder": "Enter custom database URL"
    },
    "debugVerbose": {
      "label": "Debug Verbose",
      "desc": "Output more detailed information to the console"
    },
    "cache": {
      "deleteAll": "Delete All Cached Lyrics",
      "noCache": "No Cached Lyrics"
    },
    "colors": {
      "customColor": "Custom",
      "showMore": "More ▼",
      "showLess": "Less ▲",
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
    "solidBackgroundInUse": "ℹ️ Solid Background In Use",
    "fontPlaceholder": "Font name (e.g., Arial, Georgia)"
  },
  "providers": {
    "musixmatch": {
      "name": "Musixmatch",
      "desc": "Musixmatch provides the world's largest lyrics catalog."
    },
    "lrclib": {
      "name": "LRCLIB",
      "desc": "LRCLIB provides synced lyrics and is a free community-maintained lyrics database."
    },
    "ivlyrics": {
      "name": "IvLyrics",
      "desc": "IvLyrics provides synced and karaoke lyrics."
    },
    "spotify": {
      "name": "Spotify",
      "desc": "Spotify provides synced lyrics for some premium users."
    },
    "netease": {
      "name": "NetEase",
      "desc": "NetEase (网易云音乐) provides Chinese lyrics."
    },
    "genius": {
      "name": "Genius",
      "desc": "Genius provides lyrics and annotations."
    },
    "custom": {
      "name": "Custom Database",
      "desc": "Fetch lyrics from custom database."
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
    "translation": "Conversion",
    "settings": "Settings",
    "syncAdjust": "Sync Adjust",
    "syncAdjustTitle": "Lyrics Sync Adjustment",
    "copyLyrics": "Copy Lyrics",
    "searchLyrics": "Search Lyrics",
    "editLyrics": "Edit Lyrics",
    "shareImage": "Share Lyrics Image",
    "translationOptions": "Conversion Options",
    "translationOptionsSubtitle": "Configure pronunciation and translation display for lyrics",
    "detectedLanguage": "Detected Language",
    "detectedLanguageInfo": "The language of the currently playing track. Conversion options are applied differently based on language.",
    "unknownLanguage": "Unknown",
    "autoDetect": "Auto Detect",
    "overrideLanguage": "Override Language",
    "overrideLanguageInfo": "Manually set the language for this track. The selected language will be used instead of auto-detection.",
    "pronunciation": "Pronunciation",
    "pronunciationInfo": "Display romanization of original lyrics",
    "translationLabel": "Translation",
    "translationInfo": "Display translated lyrics",
    "apiSettings": "API Settings",
    "apiSettingsSubtitle": "Configure Gemini API",
    "apiKeySettings": "API Key Settings",
    "apiKeySettingsInfo": "Click here to configure Gemini API key",
    "openSettings": "Open Settings",
    "translationSettings": "Conversion Settings",
    "regenerateTranslation": "Regenerate Translation",
    "fullscreen": "Fullscreen"
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
    "unsyncedLyricsCopied": "Unsynced lyrics copied to clipboard."
  },
  "update": {
    "newVersion": "New update version",
    "available": " is available!",
    "notes": "Update Notes",
    "update": "Update",
    "dismiss": "Later",
    "alreadyLatest": "Already on the latest version",
    "checkFailed": "Failed to check for updates",
    "versionChange": "Version",
    "copyCommand": "Copy Command",
    "releaseNotes": "Release Notes",
    "expand": "More",
    "collapse": "Less",
    "copied": "Copied"
  },
  "fullscreen": {
    "title": "Fullscreen",
    "background": "Background",
    "backgroundOptions": {
      "albumArt": "Album Art",
      "animatedCanvas": "Animated Canvas",
      "artistArt": "Artist Art",
      "staticColor": "Static Color"
    },
    "showExtraControls": {
      "label": "Show Extra Controls",
      "desc": "Show extra controls in fullscreen mode"
    },
    "contextDisplay": {
      "label": "Context Display",
      "desc": "Show currently playing context in fullscreen mode"
    },
    "upcomingLyrics": {
      "label": "Show Upcoming Lyrics",
      "desc": "Preview upcoming lyrics in fullscreen mode"
    },
    "volumeDisplay": {
      "label": "Volume Display",
      "desc": "Show volume control in fullscreen mode"
    },
    "controls": {
      "like": "Like",
      "unlike": "Unlike",
      "shuffle": "Shuffle",
      "previous": "Previous",
      "next": "Next",
      "nextTrackLabel": "Up Next",
      "play": "Play",
      "pause": "Pause",
      "repeatOff": "Repeat Off",
      "repeatAll": "Repeat All",
      "repeatOne": "Repeat One",
      "mute": "Mute",
      "unmute": "Unmute",
      "share": "Copy Share Link",
      "shareCopied": "🔗 Share link copied"
    },
    "queue": {
      "title": "Queue",
      "recentlyPlayed": "Recently Played",
      "nowPlaying": "Now Playing",
      "upNext": "Next in Queue",
      "empty": "Queue is empty",
      "noRecent": "No recent play history"
    },
    "contextType": {
      "playlist": "Playlist",
      "album": "Album",
      "artist": "Artist",
      "collection": "Liked Songs",
      "station": "Radio"
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
    "romanization": "Romanization",
    "translation": "Translation",
    "google": "Google Translate",
    "microsoft": "Microsoft Translate",
    "geminiRomaji": "Romanization",
    "geminiKo": "Translation",
    "romajiGemini": "Romaji (Gemini)",
    "koGemini": "Korean (Gemini)",
    "simplifiedChinese": "Simplified Chinese",
    "traditionalChineseHK": "Traditional Chinese (HK)",
    "traditionalChineseTW": "Traditional Chinese (TW)",
    "pinyin": "Pinyin"
  },
  "notifications": {
    "languageChanged": "Language changed. Refresh to apply.",
    "settingsSaved": "Settings saved",
    "settingsReset": "Settings reset",
    "exportSuccess": "Export successful",
    "importSuccess": "Import successful",
    "importFailed": "Settings import failed",
    "syncDataCleared": "Sync data cleared",
    "syncDataClearFailed": "Failed to clear sync data",
    "lyricsCopied": "Lyrics copied to clipboard",
    "lyricsCopyFailed": "Failed to copy lyrics to clipboard",
    "translationCopied": "Translation copied to clipboard",
    "translationCopyFailed": "Failed to copy translation to clipboard",
    "secondTranslationCopied": "Second translation copied to clipboard",
    "secondTranslationCopyFailed": "Failed to copy second translation to clipboard",
    "installCommandCopied": "Install command copied",
    "copyFailed": "Copy failed",
    "memoryCacheCleared": "Memory cache cleared",
    "localCacheCleared": "All local cache cleared",
    "localCacheTrackCleared": "Current track cache cleared",
    "exportSuccessDesc": "Settings file saved to Downloads folder.",
    "exportFailed": "Settings export failed",
    "importSuccessDesc": "Page will refresh shortly...",
    "resetSuccess": "Reset complete",
    "resetSuccessDesc": "Page will refresh shortly...",
    "resetFailed": "Reset failed",
    "updateCheckFailed": "Update check failed",
    "checkNetworkConnection": "Check your network connection",
    "updateAvailable": "Update available",
    "latestVersion": "You're on the latest version",
    "noLyricsLoaded": "No lyrics loaded.",
    "translationRegenerateGeminiOnly": "Translation regeneration is only available with Gemini translation.",
    "regeneratingTranslation": "Regenerating translation...",
    "translationRegenerated": "Translation regenerated",
    "translationRegenerateFailed": "Translation regeneration failed",
    "translationCacheRemoved": "Translation cache removed and reloaded!",
    "translationCacheReset": "Reset {count} translation cache entries",
    "tooManyTranslationRequests": "Too many translation requests. Please try again in 1 minute.",
    "requestingPronunciation": "Requesting pronunciation. This may take about 30 seconds",
    "requestingTranslation": "Requesting translation. This may take about 30 seconds",
    "shareImageCopied": "Image copied to clipboard",
    "shareImageDownloaded": "Image downloaded",
    "shareImageShared": "Shared successfully",
    "shareImageFailed": "Failed to generate image",
    "shareImageNoLyrics": "Please select lyrics to share",
    "noTrackPlaying": "No track playing",
    "overlayConnected": "Overlay connected",
    "romajiTranslationFailed": "Romaji/Romaja/Pinyin translation failed",
    "koreanTranslationFailed": "Korean translation failed",
    "pinyinLibraryUnavailable": "Pinyin library unavailable. Showing original. Allow jsDelivr or unpkg.",
    "conversionSkippedSimplified": "Conversion skipped: Already in Simplified Chinese",
    "conversionCompleted": "Conversion completed successfully",
    "conversionFailed": "Conversion failed",
    "fileTooLarge": "File too large: Maximum size is 1MB",
    "noValidLyricsInFile": "No valid lyrics found in file",
    "lyricsLoadedFromFile": "Successfully loaded {types} lyrics from file",
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
    "seconds": "seconds",
    "minutes": "minutes"
  },
  "settingsAdvanced": {
    "patchNotes": {
      "empty": "No patch notes available."
    },
    "donate": {
      "title": "Buy the developer a coffee",
      "button": "Donate"
    },
    "syncMode": {
      "title": "Sync Mode",
      "subtitle": "Display options for compact sync mode",
      "linesBefore": {
        "label": "Lines Before",
        "desc": "Number of lines to display before the current lyrics"
      },
      "linesAfter": {
        "label": "Lines After",
        "desc": "Number of lines to display after the current lyrics"
      },
      "fadeoutBlur": {
        "label": "Fadeout Blur Effect",
        "desc": "Apply blur effect to inactive lyrics"
      },
      "highlightMode": {
        "label": "Highlight Mode",
        "desc": "Emphasize only the current lyrics and dim the rest"
      },
      "highlightIntensity": {
        "label": "Highlight Intensity",
        "desc": "Adjust the opacity of inactive lyrics (lower is dimmer)"
      }
    },
    "livePreview": {
      "title": "Live Preview",
      "subtitle": "Instantly see your style settings",
      "sampleText": "Lyric is here",
      "sampleTextMixed": "여기 Lyric あります",
      "sampleTextPhonetic": "yeogi lyric arimasu"
    },
    "originalStyle": {
      "title": "Original Style",
      "subtitle": "Font settings for original lyrics",
      "fontFamily": "Font Family",
      "fontFamilyDesc": "Select the font to apply to original lyrics. Separate multiple fonts with commas (,) to apply in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for original lyrics (pixels)"
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
        "desc": "Spacing between letters in original lyrics (pixels)"
      }
    },
    "pronunciationStyle": {
      "title": "Pronunciation Style",
      "subtitle": "Font settings for romanization (Romaji, Romaja, Pinyin)",
      "fontFamily": "Font Family",
      "fontFamilyDesc": "Select the font to apply to romanization. Separate multiple fonts with commas (,) to apply in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for romanization (pixels)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for romanization"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of romanization (0-100%)"
      },
      "gap": {
        "label": "Gap from Original",
        "desc": "Spacing between original lyrics and romanization"
      },
      "letterSpacing": {
        "label": "Letter Spacing",
        "desc": "Spacing between letters in romanization (pixels)"
      },
      "hyphenReplace": {
        "label": "Hyphen (-) Processing",
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
      "fontFamilyDesc": "Select the font to apply to translated lyrics. Separate multiple fonts with commas (,) to apply in order.",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for translated lyrics (pixels)"
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
        "desc": "Spacing between romanization and translation (pixels)"
      },
      "letterSpacing": {
        "label": "Letter Spacing",
        "desc": "Spacing between letters in translation (pixels)"
      }
    },
    "furiganaStyle": {
      "title": "Furigana Style",
      "subtitle": "Settings for reading (furigana) displayed above Japanese kanji",
      "fontSize": {
        "label": "Font Size",
        "desc": "Font size for furigana (pixels)"
      },
      "fontWeight": {
        "label": "Font Weight",
        "desc": "Font weight for furigana"
      },
      "opacity": {
        "label": "Opacity",
        "desc": "Opacity of furigana (0-100%)"
      },
      "spacing": {
        "label": "Spacing",
        "desc": "Gap between furigana and kanji (pixels)"
      }
    },
    "textShadow": {
      "title": "Text Shadow",
      "subtitle": "Shadow effects for better readability",
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
        "label": "Blur Intensity",
        "desc": "Blur amount for the shadow"
      }
    },
    "playback": {
      "title": "Playback Behavior",
      "subtitle": "Playback-related feature settings",
      "replaceButton": {
        "label": "Replace Lyrics Button",
        "info": "Replaces Spotify's default lyrics button with ivLyrics"
      },
      "replaceFullscreenButton": {
        "label": "Replace Fullscreen Button",
        "info": "Replaces Spotify's default fullscreen button with ivLyrics fullscreen"
      },
      "fullscreenShortcut": {
        "label": "Fullscreen Shortcut",
        "desc": "Keyboard shortcut for lyrics fullscreen mode"
      }
    },
    "nowPlayingPanel": {
      "title": "NowPlaying Panel Lyrics",
      "subtitle": "Lyrics display settings for the Now Playing panel",
      "enabled": {
        "label": "Enable Panel Lyrics",
        "desc": "Display current lyrics in the Now Playing panel"
      },
      "lines": {
        "label": "Lyrics Lines",
        "desc": "Number of lyrics lines to show in the panel (default: 5)"
      },
      "fontScale": {
        "label": "Overall Font Scale",
        "desc": "Overall font scale for panel lyrics (50%-200%)"
      },
      "fontFamily": {
        "label": "Default Font",
        "desc": "Default font for panel lyrics (used when individual fonts are not set)"
      },
      "originalFont": {
        "label": "Original Text Font",
        "desc": "Font for original lyrics (empty = use default, comma-separated for multiple fonts)"
      },
      "phoneticFont": {
        "label": "Phonetic Text Font",
        "desc": "Font for phonetic text (empty = use default, comma-separated for multiple fonts)"
      },
      "translationFont": {
        "label": "Translation Text Font",
        "desc": "Font for translation text (empty = use default, comma-separated for multiple fonts)"
      },
      "originalSize": {
        "label": "Original Text Size",
        "desc": "Font size for original lyrics (px)"
      },
      "phoneticSize": {
        "label": "Phonetic Text Size",
        "desc": "Font size for phonetic text (px)"
      },
      "translationSize": {
        "label": "Translation Text Size",
        "desc": "Font size for translation text (px)"
      },
      "preview": "Preview",
      "background": {
        "title": "Background",
        "subtitle": "Customize the panel background",
        "type": {
          "label": "Background Type",
          "desc": "Choose background style",
          "album": "Album Color",
          "custom": "Custom Color",
          "gradient": "Album-based Gradient"
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
          "desc": "Background opacity (0%=transparent, 100%=opaque)"
        }
      },
      "border": {
        "title": "Border",
        "subtitle": "Customize the panel border",
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
          "desc": "Border opacity (0%=transparent, 100%=opaque)"
        }
      }
    },
    "karaokeMode": {
      "title": "Karaoke Mode",
      "subtitle": "Karaoke-style lyrics display",
      "enabled": {
        "label": "Enable Karaoke Mode",
        "desc": "Use karaoke tab for songs that support karaoke lyrics. When disabled, synced tab is used instead"
      },
      "bounce": {
        "label": "Character Bounce Effect",
        "desc": "Apply bouncing animation to the current character in karaoke mode"
      }
    },
    "prefetch": {
      "title": "Prefetch Next Track",
      "subtitle": "Preload elements for the next track to reduce transition delays",
      "enabled": {
        "label": "Prefetch Translation/Phonetic",
        "desc": "Preload translation and phonetic conversion for the next track"
      },
      "videoEnabled": {
        "label": "Prefetch Video Background",
        "desc": "Preload video background information for the next track"
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
        "desc": "Automatically apply community offset when confidence is sufficient"
      },
      "autoSubmit": {
        "label": "Auto Submit",
        "desc": "Automatically share your sync offset changes with the community"
      },
      "minConfidence": {
        "label": "Minimum Confidence",
        "desc": "Minimum confidence required for auto-apply (0.0 ~ 1.0). Confidence is calculated based on number of submissions and consistency of offset values. Higher values mean more users submitted similar offsets"
      }
    },
    "cacheManagement": {
      "title": "Cache Management",
      "subtitle": "Manage stored data",
      "memoryCache": {
        "label": "Clear Memory Cache",
        "desc": "Loaded lyrics are temporarily stored in memory for quick reload. Clear memory cache without restarting Spotify",
        "button": "Clear Cache"
      },
      "localCache": {
        "label": "Local Cache Management (IndexedDB)",
        "desc": "Lyrics, translations, and phonetics are stored locally to reduce API calls on repeated plays",
        "clearAll": "Clear All",
        "clearCurrent": "Clear Current Track",
        "stats": "Lyrics: {lyrics}, Translations: {translations}, Metadata: {metadata}"
      }
    },
    "lyricsProviders": {
      "title": "Lyrics Providers",
      "subtitle": "Manage priority and settings of lyrics sources"
    },
    "languageDetection": {
      "title": "Language Detection",
      "subtitle": "Language detection settings for text conversion",
      "furigana": {
        "label": "Show Furigana for Japanese Kanji",
        "desc": "Display hiragana readings above kanji in Japanese lyrics"
      },
      "japaneseThreshold": {
        "label": "Japanese Detection Threshold",
        "desc": "Detect Japanese by the ratio of kana characters in lyrics. Higher values are stricter (percentage)"
      },
      "chineseThreshold": {
        "label": "Chinese Detection Threshold",
        "desc": "Detect Chinese type by the ratio of traditional and simplified characters. Higher values are stricter (percentage)"
      }
    },
    "apiKeys": {
      "subtitle": "API keys for external service integration"
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
    "resetSettings": {
      "title": "Reset Settings",
      "subtitle": "Restore all settings to default values",
      "reset": {
        "label": "Reset All Settings",
        "desc": "Restore all settings to default values. This action cannot be undone",
        "button": "Reset",
        "confirm": "Are you sure you want to reset all settings?\n\nThis action cannot be undone, and all settings will be reset to default values.\n\nClick 'OK' to continue.",
        "processing": "Resetting..."
      }
    },
    "fullscreenMode": {
      "title": "Fullscreen Basic Settings",
      "subtitle": "Configure basic behavior of fullscreen mode",
      "shortcut": {
        "desc": "Fullscreen Shortcut",
        "info": "Set keyboard shortcut to toggle fullscreen mode"
      },
      "toggleTvModeKey": {
        "desc": "Toggle TV Mode Shortcut",
        "info": "Works only in fullscreen mode. Switches between TV mode and normal mode"
      },
      "tvMode": {
        "desc": "Use TV Mode",
        "info": "Display album art and track info at bottom-left, lyrics use full screen"
      },
      "tvModeAlbumSize": {
        "desc": "Album Size",
        "info": "Set album art size in TV mode (pixels)"
      },
      "splitView": {
        "desc": "Split Layout",
        "info": "Display album art on left, lyrics on right in fullscreen"
      },
      "invertPosition": {
        "desc": "Invert Album/Lyrics Position",
        "info": "Swap positions of album and lyrics (left↔right, or top↔bottom in portrait)"
      },
      "showAlbumArt": {
        "desc": "Show Album Art",
        "info": "Display album art in the left panel of fullscreen"
      },
      "showTrackInfo": {
        "desc": "Show Track Info",
        "info": "Display song title and artist in fullscreen"
      },
      "trimTitle": {
        "desc": "Trim Title",
        "info": "Remove extra info like (Remaster), [feat. xxx] from song titles for cleaner display"
      },
      "translateMetadata": {
        "desc": "Translate Title/Artist",
        "info": "Translate foreign song titles and artist names (requires Gemini API key)"
      },
      "translateMetadataMode": {
        "desc": "Display Mode",
        "info": "Choose how to display the title and artist",
        "options": {
          "translated": "Translation Only",
          "romanized": "Romanization Only",
          "originalTranslated": "Original + Translation",
          "originalRomanized": "Original + Romanization",
          "all": "Show All"
        }
      },
      "infoGap": {
        "desc": "Album Art Gap",
        "info": "Adjust the gap between album art and controls (pixels)"
      },
      "centerWhenNoLyrics": {
        "desc": "Center Album When No Lyrics",
        "info": "Center album art when lyrics are unavailable or loading"
      },
      "twoColumnLayout": {
        "desc": "Use Two-Column Layout"
      },
      "browserFullscreen": {
        "desc": "Use Spotify Fullscreen",
        "info": "Enter Spotify fullscreen when entering fullscreen mode to fill the entire monitor"
      }
    },
    "normalMode": {
      "title": "Normal Mode Layout",
      "subtitle": "Configure layout for normal fullscreen mode (when TV mode is off)",
      "showAlbumName": {
        "desc": "Show Album Name",
        "info": "Display album name below song title and artist"
      }
    },
    "tvMode": {
      "title": "TV Mode Settings",
      "subtitle": "Configure display options for TV mode",
      "showAlbumName": {
        "desc": "Show Album Name",
        "info": "Display album name below artist in TV mode"
      },
      "showControls": {
        "desc": "Show Control Buttons",
        "info": "Display play/pause, previous/next track buttons in TV mode"
      },
      "showProgress": {
        "desc": "Show Progress Bar",
        "info": "Display playback progress and time in TV mode"
      }
    },
    "metadataDisplay": {
      "title": "Title/Artist Display",
      "subtitle": "Configure how song title and artist are displayed"
    },
    "fullscreenStyle": {
      "title": "Fullscreen Style",
      "subtitle": "Visual element settings for fullscreen mode",
      "albumSize": {
        "desc": "Album Art Size",
        "info": "Set maximum size of album art in fullscreen (100-500px)"
      },
      "albumRadius": {
        "desc": "Album Art Roundness",
        "info": "Set corner radius of album art (0-50px)"
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
        "info": "Set right margin for lyrics area in fullscreen. Prevents lyrics from appearing off-center (0-300px)"
      }
    },
    "fullscreenUI": {
      "title": "Fullscreen UI Elements",
      "subtitle": "Configure additional UI elements shown in fullscreen",
      "showClock": {
        "desc": "Show Clock",
        "info": "Display current time in upper right corner"
      },
      "clockSize": {
        "desc": "Clock Size",
        "info": "Set size of clock text (24-72px)"
      },
      "showContext": {
        "desc": "Show Playback Context",
        "info": "Display currently playing playlist/album info in lower left"
      },
      "showContextImage": {
        "desc": "Show Context Image",
        "info": "Display playlist/album thumbnail image"
      },
      "showNextTrack": {
        "desc": "Next Track Preview",
        "info": "Display next track info before song ends (broadcast style)"
      },
      "nextTrackTime": {
        "desc": "Next Track Display Time",
        "info": "Set how many seconds before song end to show next track (5-30s)",
        "unit": "seconds"
      },
      "showControls": {
        "desc": "Show Player Controls",
        "info": "Display play/pause, previous/next, shuffle, repeat, like buttons"
      },
      "showVolume": {
        "desc": "Show Volume Control",
        "info": "Display volume slider in player controls"
      },
      "showProgressBar": {
        "desc": "Show Progress Bar",
        "info": "Display progress bar showing current position and total duration"
      },
      "showLyricsProgress": {
        "desc": "Show Lyrics Progress",
        "info": "Display current lyrics line number and total line count"
      },
      "showQueue": {
        "desc": "Show Queue on Hover",
        "info": "Display queue panel when hovering on the right edge of the screen"
      }
    },
    "controllerStyle": {
      "title": "Controller Style",
      "subtitle": "Configure player controller appearance",
      "buttonSize": {
        "desc": "Control Button Size",
        "info": "Set size of play, previous/next buttons (28-48px)"
      },
      "background": {
        "desc": "Controller Background",
        "info": "Add translucent background to controller"
      }
    },
    "autoHide": {
      "title": "Auto Hide",
      "subtitle": "Auto-hide UI when mouse is inactive",
      "enabled": {
        "info": "Controller and info will auto-hide when mouse is not moving",
        "desc": "Auto-hide UI"
      },
      "delay": {
        "desc": "Auto Hide Delay",
        "info": "Time before UI hides after mouse inactivity (1-10 seconds)"
      }
    },
    "tmiStyle": {
      "title": "TMI Style",
      "subtitle": "Style settings for the TMI modal displayed when clicking album art",
      "fontSize": {
        "desc": "TMI Font Size",
        "info": "Adjust the overall font size of the TMI modal (80-150%)"
      }
    },
    "aboutTab": {
      "appInfo": {
        "title": "App Info"
      },
      "developer": "Developer:",
      "originalProject": "Original Project:",
      "thanks": "Thanks to all contributors to the open source project.",
      "clientInfo": {
        "title": "Client Info",
        "subtitle": "Unique identifier for this client",
        "description": "This is an automatically generated unique identifier for account linking. This value cannot be modified and is uniquely assigned to each client. Be careful not to expose this value.",
        "copied": "Client ID copied",
        "copyFailed": "Copy failed",
        "copy": "Copy"
      },
      "update": {
        "title": "Update",
        "subtitle": "Check for latest version",
        "checkUpdate": {
          "desc": "Check Latest Version",
          "button": "Check Update",
          "checking": "Checking..."
        },
        "copied": "Copied",
        "installCopied": "Install command copied",
        "copyFailed": "Copy failed"
      },
      "patchNotes": {
        "title": "Patch Notes",
        "subtitle": "Latest update history",
        "loading": "Loading patch notes..."
      },
      "subtitle": "About ivLyrics",
      "appDescription": "Lyrics Extension with various features",
      "versionPrefix": "Version",
      "viewOnGithub": "View on GitHub",
      "patchNotesLoadFailed": "Failed to load patch notes",
      "checkGithubReleases": "Please check the GitHub releases page",
      "visitGithub": "Visit GitHub Repository",
      "joinDiscord": "Join Discord Server"
    },
    "debugTab": {
      "title": "Debug Information",
      "subtitle": "Information to share with developers when reporting bugs",
      "currentTrack": "Current Track Info",
      "trackInfo": "Track Info",
      "lyricsInfo": "Lyrics Info",
      "settingsInfo": "Settings Info",
      "noLyrics": "No lyrics information",
      "loading": "Loading info...",
      "refresh": "Refresh",
      "copyToClipboard": "Copy to Clipboard",
      "copied": "Copied!",
      "copyFailed": "Failed to copy",
      "sendToDiscord": "Report to Discord",
      "rawJson": "JSON Data"
    },
    "api": {
      "title": "API Settings",
      "getApiKey": {
        "desc": "Get API Key",
        "info": "You can get a free Gemini API key from Google AI Studio",
        "button": "Open API Key Page"
      },
      "geminiKey": {
        "desc": "Gemini API Key",
        "info": "API key is required to use lyrics translation feature powered by Google Gemini AI"
      }
    },
    "update": {
      "title": "Update",
      "subtitle": "Check for latest version",
      "checkUpdate": {
        "desc": "Check Latest Version",
        "button": "Check Update",
        "checking": "Checking..."
      },
      "copied": "Copied",
      "installCopied": "Install command copied",
      "copyFailed": "Copy failed",
      "currentVersionInfo": "Current version: v{version}. Check for new updates on GitHub",
      "checkFailedWithError": "Update check failed: {error}"
    }
  },
  "syncAdjust": {
    "info": "Move the slider to the right to make the lyrics faster.",
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
    "submitFailed": "Failed to submit",
    "noData": "No community data available",
    "loading": "Loading...",
    "feedbackGood": "Offset is accurate",
    "feedbackBad": "Offset is inaccurate",
    "cannotFeedbackOwnSubmission": "You cannot rate your own submission",
    "feedbackPositiveSuccess": "Thanks for the positive feedback!",
    "feedbackNegativeSuccess": "Thanks for your feedback. We'll improve!",
    "feedbackFailed": "Failed to submit feedback",
    "autoSubmitEnabled": "⚡ Auto-submit is enabled"
  },
  "playbarButton": {
    "label": "ivLyrics"
  },
  "videoBackground": {
    "loading": "Loading video info...",
    "notFound": "Video not found.",
    "error": "An error occurred.",
    "loadingMessage": "Loading video background... This may take about 30 seconds.",
    "downloadingVideo": "Downloading video...",
    "downloading": "Downloading: {percent}%",
    "processing": "Processing video...",
    "checking": "Checking video...",
    "preparing": "Preparing video download...",
    "downloadComplete": "Video download complete!",
    "helperNotConnected": "Cannot connect to helper program. Make sure it's running.",
    "helperError": "An error occurred with the helper program."
  },
  "translator": {
    "missingApiKey": "Gemini API key is not set. Please enter an API key in settings.",
    "invalidApiKeyFormat": "Invalid API key format. Gemini API key must start with 'AIza'.",
    "invalidRequestFormat": "Invalid request format. Please check your API key.",
    "invalidApiKey": "Invalid API key. Please check your Gemini API key in settings.",
    "accessForbidden": "API access forbidden. Please check your API key permissions.",
    "rateLimitExceeded": "Rate limit exceeded. Please try again later.",
    "serviceUnavailable": "Translation service temporarily unavailable. Please try again later.",
    "requestFailed": "API request failed",
    "apiKeyError": "Gemini API key error occurred. Please check your API key in settings.",
    "translationFailed": "Translation failed",
    "requestTimeout": "Translation request timed out. Please try again.",
    "failedPrefix": "Translation failed"
  },
  "utils": {
    "allUrlsFailed": "Failed to fetch version info from all URLs",
    "invalidVersionFormat": "Invalid version format",
    "unknownError": "Unknown error",
    "requestTimeout": "Request timeout",
    "networkError": "Network connection failed",
    "securityRestriction": "Browser security policy restriction",
    "serverError": "Server response error",
    "terminalMac": "Terminal"
  },
  "providerDescriptions": {
    "lrclib": "Lyrics from lrclib.net. Supports both synced and unsynced lyrics. LRCLIB is a free open-source lyrics provider.",
    "ivLyrics": "Lyrics from ivLyrics API. Supports synced lyrics, unsynced lyrics, and word-by-word karaoke lyrics.",
    "spotify": "Lyrics from official Spotify API.",
    "cache": "Lyrics from cached/local files loaded from previous Spotify sessions."
  },
  "modes": {
    "karaoke": "Karaoke",
    "synced": "Synced",
    "unsynced": "Unsynced"
  },
  "communityVideo": {
    "title": "Community Video Recommendations",
    "loading": "Loading videos...",
    "loadError": "Failed to load videos",
    "noVideos": "No community videos yet",
    "autoDetected": "Auto",
    "startTime": "Start",
    "submittedBy": "By",
    "addVideo": "Add Video",
    "addVideoNoEmoji": "Add Video",
    "youtubeUrl": "YouTube URL",
    "startTimeSeconds": "Start Time (seconds)",
    "submit": "Submit",
    "submitting": "Submitting...",
    "submitted": "Video submitted successfully!",
    "updated": "Video updated successfully!",
    "submitError": "Failed to submit video",
    "invalidUrl": "Invalid YouTube URL",
    "videoNotFound": "YouTube video not found",
    "videoPrivate": "Video is private or deleted",
    "validationError": "Could not validate video. Please try again",
    "selectVideo": "Select Video",
    "preview": "Preview",
    "apply": "Apply",
    "applyShort": "Apply",
    "applied": "Video applied",
    "videoTitle": "Video Title",
    "loadingTitle": "Loading title...",
    "startTimeLabel": "First Lyric Start Time (seconds)",
    "startTimeHint": "Enter the time when the first lyric starts in the YouTube video",
    "delete": "Delete",
    "deleteConfirm": "Are you sure you want to delete this video?",
    "deleted": "Video deleted successfully",
    "deleteError": "Failed to delete video",
    "downloading": "Downloading video..."
  },
  "close": "Close",
  "cancel": "Cancel",
  "shareImage": {
    "title": "Share Lyrics Image",
    "subtitle": "Create and share beautiful lyrics images",
    "selectLyrics": "Select Lyrics",
    "selectLyricsHint": "Click lyrics lines to include in the image (max 6 lines)",
    "template": "Preset",
    "templates": {
      "cover": "Cover Blur",
      "gradient": "Gradient",
      "minimal": "Minimal",
      "glass": "Glass",
      "story": "Story"
    },
    "advancedSettings": "Advanced Settings",
    "sections": {
      "background": "Background",
      "cover": "Album Cover",
      "lyrics": "Lyrics",
      "layout": "Layout",
      "other": "Other"
    },
    "copyrightWarning": "⚠️ Copyright Notice\n\nThis lyrics image may contain copyrighted content.\n\n• Use for personal purposes only\n• Do not use for commercial purposes\n• Respect the original creator when sharing on social media\n\nDo you want to continue?",
    "copyrightTitle": "Copyright Notice",
    "copyrightDesc": "This lyrics image may contain copyrighted content.",
    "copyrightPoint1": "Use for personal purposes only",
    "copyrightPoint2": "Do not use for commercial purposes",
    "copyrightPoint3": "Respect the original creator when sharing on social media",
    "copyrightConfirm": "Agree & Continue",
    "settings": {
      "backgroundType": "Background Style",
      "coverBlur": "Blur",
      "gradient": "Gradient",
      "solid": "Solid",
      "backgroundBlur": "Background Blur",
      "backgroundOpacity": "Background Darkness",
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
      "aspectRatio": "Aspect Ratio",
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
    "maxLinesReached": "Maximum 3 lines can be selected",
    "noSelection": "Select lyrics to continue"
  },
  "setupWizard": {
    "welcome": {
      "title": "Welcome to ivLyrics!",
      "subtitle": "Enjoy beautiful lyrics on Spotify",
      "features": {
        "lyrics": "Real-time synced lyrics",
        "translation": "AI-powered translation",
        "customization": "Full customization"
      },
      "start": "Get Started"
    },
    "language": {
      "title": "Select Language",
      "subtitle": "Choose your preferred language"
    },
    "apiKey": {
      "title": "Gemini API Key Setup",
      "subtitle": "An API key is required for AI translation features",
      "guide": {
        "title": "How to get an API key",
        "step1": "Visit Google AI Studio",
        "step2": "Click Get API Key",
        "step3": "Create a new API key",
        "step4": "Copy the generated key"
      },
      "getKey": "Get API Key",
      "skip": "Set up later",
      "placeholder": "Enter your API key...",
      "multipleKeysHint": "You can register multiple API keys in Settings"
    },
    "theme": {
      "title": "Basic Settings",
      "subtitle": "Choose how lyrics are displayed",
      "alignment": "Alignment",
      "background": "Background Effect",
      "backgrounds": {
        "colorful": "Colorful",
        "gradient": "Album Cover",
        "solid": "Solid Color",
        "video": "Video"
      }
    },
    "translationTip": {
      "title": "Translation Settings",
      "subtitle": "Translation is configured per language",
      "pronunciation": "Pronunciation",
      "translation": "Translation",
      "description": "Enabling translation for K-POP won't apply to J-POP. Tap the transform button at the bottom and configure 'Pronunciation' and 'Translation' options separately for each language."
    },
    "overlayTip": {
      "title": "Desktop Overlay",
      "subtitle": "View lyrics anywhere on your desktop",
      "description": "Install the overlay app to see lyrics while using other applications. You can enable this anytime in Settings.",
      "requiresApp": "This feature requires the separate overlay app to be installed.",
      "enabled": "Enable Overlay",
      "downloadApp": "Download Overlay App"
    },
    "nowPlayingTip": {
      "title": "NowPlaying Panel Lyrics",
      "subtitle": "View lyrics in the right panel",
      "description": "Display current lyrics in Spotify's 'Now Playing' panel. You can view lyrics without entering fullscreen mode.",
      "enabled": "Show Panel Lyrics",
      "linesCount": "Lines to Display"
    },
    "complete": {
      "title": "All Set!",
      "subtitle": "You're ready to use ivLyrics",
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
      "question": "Does it say you need to log in to play the video?",
      "yes": "Yes",
      "no": "No",
      "helperRequired": "If so, you need to install the helper program.",
      "helperDesc": "The helper program allows you to play videos without YouTube login.",
      "installHelper": "Install Helper Program",
      "skip": "Skip"
    },
    "videoHelperTest": {
      "title": "Helper Program Test",
      "subtitle": "Verify that the helper program works correctly",
      "enableHelper": "Enable Helper Program",
      "testVideo": "Test Video Playback",
      "testing": "Testing...",
      "success": "Helper program is working correctly!",
      "failed": "Cannot connect to helper program. Make sure it's running.",
      "downloading": "Downloading video: {percent}%",
      "skip": "Skip"
    }
  },
  tmi: {
    getApiKeyDesc: "Get Gemini API Key",
    getApiKeyInfo: "Used to fetch TMI. Available for free from Google AI Studio.",
    viewInfo: "Click to view song details",
    requireKey: "Gemini API Key required in settings",
    settingTitle: "Gemini API Key",
    settingDesc: "Required to load Song TMI/Trivia contents.",
    title: "TMI",
    didYouKnow: "Did you know?",
    close: "Close",
    cancel: "Cancel",
    loading: "Looking up interesting facts...",
    noData: "No TMI available for this track yet.",
    clickForTMI: "Click for TMI",
    clickToClose: "Click ✕ or album area to go back",
    regenerate: "Regenerate TMI",
    errorFetch: "An error occurred while fetching TMI.",
    errorQuota: "API quota exceeded.",
    errorQuotaHint: "Please try again later or enter a different API key in settings.",
    disclaimer: "This content is generated by AI using information from the internet and may contain inaccurate information.",
    verified: "Verified",
    unverified: "Unverified",
    verifiedCount: "verified",
    sources: "Sources",
    verifiedSources: "Verified Sources",
    relatedSources: "Related Sources",
    otherSources: "Other Sources",
    confidenceVeryHigh: "Very High Confidence",
    confidenceHigh: "High Confidence",
    confidenceMedium: "Medium Confidence",
    confidenceLow: "Low Confidence",
    confidenceNone: "No Sources"
  },
  notice: {
    confirm: "OK",
    next: "Next",
    dismissAll: "Dismiss All"
  }
};
