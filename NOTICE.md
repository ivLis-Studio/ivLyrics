# ivLyrics for PC: license notices

Copyright (c) 2025-2026 ivLis Studio and contributors.

Unless this notice says otherwise, the files in this repository are licensed under the ivLyrics Source-Available License 1.0 in [LICENSE](LICENSE).

Releases up to and including v7.1.17 (commit `3c251f7`) were published under the GNU Lesser General Public License v2.1. They remain available under LGPL-2.1.

## LGPL-2.1 files

The files in this section are licensed under the GNU Lesser General Public License v2.1, not under the ivLyrics license. The full text is in [LICENSES/LGPL-2.1.txt](LICENSES/LGPL-2.1.txt). You may use, modify, and redistribute these files under the LGPL. The ivLyrics license still covers the rest of the repository.

### Derived from Spicetify lyrics-plus

ivLyrics began as a modified version of [lyrics-plus](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) by the Spicetify contributors, which is licensed under LGPL-2.1. These files contain code derived from it:

`index.js`, `style.css`, `Utils.js`, `LyricsService.js`, `Pages.js`, `Settings.js`, `TabBar.js`, `OptionsMenu.js`, `PlaybarButton.js`, `manifest.json`, `NowPlayingPanelLyrics.js`, `TranslationModeHelper.js`

### Contributed under LGPL-2.1

These files contain code that others contributed while this repository was licensed under LGPL-2.1. They remain under LGPL-2.1 unless every contributor to the file agrees to the ivLyrics license. Contributors: PixelAxolotl, Ahmedxsaad, Oein, hohofught, kpnkpn1324, twoeater, and karma-skz.

- Runtime: `AIAddonManager.js`, `AIRequest.js`, `Addon_AI_ChatGPT.js`, `Addon_Lyrics_LrcRed.js`, `Addon_Lyrics_Lrclib.js`, `Addon_Lyrics_OpenLyrics.js`, `FullscreenOverlay.js`, `LyricsShareImage.js`, `LyricsWordSegmenter.js`, `PlaylistPicker.js`, `PronunciationFirst.js`, `SyncDataCreator.js`, `VideoBackground.js`, `VideoBackgroundDepend.js`, `VideoMatch.js`, `WordLevelSupplements.js`
- Language files: every file in `langs/`
- Tests: `tests/capability_master_switch.test.mjs`, `tests/cdn_script_integrity.test.mjs`, `tests/character_pronunciation_repair.test.mjs`, `tests/chatgpt_capability_seeding.test.mjs`, `tests/chinese_pronunciation_tones.test.mjs`, `tests/creator_profile_playlist.test.mjs`, `tests/creator_profile_row_layout.test.mjs`, `tests/fixtures/fullscreen_controller_background_browser.js`, `tests/fixtures/playlist_picker_browser.js`, `tests/fixtures/sync_creator_preview_browser.js`, `tests/fullscreen_controller_background.test.mjs`, `tests/fullscreen_playback_updates.test.mjs`, `tests/interlude_padding_collapse.test.mjs`, `tests/karaoke_adaptive_motion.test.mjs`, `tests/karaoke_expressive_long_words.test.mjs`, `tests/karaoke_expressive_motion.test.mjs`, `tests/karaoke_static_render_cache.test.mjs`, `tests/karaoke_style_invalidation.test.mjs`, `tests/karaoke_vocal_render_cache.test.mjs`, `tests/language_detection.test.mjs`, `tests/lyrics_provider_same_song.test.mjs`, `tests/lyrics_seek_fade_compensation.test.mjs`, `tests/lyrics_text_shadow.test.mjs`, `tests/lyrics_word_segmenter_quoted_words.test.mjs`, `tests/openai_connections.test.mjs`, `tests/openai_connections_unified.test.mjs`, `tests/openai_primary_presentation.test.mjs`, `tests/panel_lyric_html_escaping.test.mjs`, `tests/playlist_picker_button.test.mjs`, `tests/playlist_picker_panel.test.mjs`, `tests/playlist_picker_placement.test.mjs`, `tests/pronunciation_fill.test.mjs`, `tests/renderer_settings_equivalence.test.mjs`, `tests/settings_fullscreen_preview.test.mjs`, `tests/settings_import_endpoint_guard.test.mjs`, `tests/settings_menu_ownership.test.mjs`, `tests/settings_provider_master_switch.test.mjs`, `tests/share_image_controls_contract.test.mjs`, `tests/share_image_word_level.test.mjs`, `tests/sync_adjust_panel.test.mjs`, `tests/sync_creator_loaded_lrclib_id.test.mjs`, `tests/sync_creator_lock_integration.test.mjs`, `tests/sync_creator_lrclib_transport.test.mjs`, `tests/sync_creator_preview_navigation.test.mjs`, `tests/sync_creator_preview_rules.test.mjs`, `tests/sync_creator_pronunciation_bubble_layout.test.mjs`, `tests/sync_creator_segment_offset.test.mjs`, `tests/sync_creator_selection_effect.test.mjs`, `tests/sync_unsubmitted_draft.test.mjs`, `tests/synced_render_reuse.test.mjs`, `tests/track_sync_migration.test.mjs`, `tests/video_drift_correction.test.mjs`, `tests/video_match_quality.test.mjs`, `tests/video_prefetch_track_identity.test.mjs`, `tests/video_quick_sync.test.mjs`, `tests/word_supplement_han_mixed_line.test.mjs`, `tests/word_supplement_pending_dedup.test.mjs`, `tests/word_supplement_persistence_fallback.test.mjs`, `tests/word_supplement_prefetch_track_id.test.mjs`, `tests/word_supplement_quoted_units.test.mjs`, `tests/word_supplement_regenerate.test.mjs`, `tests/youtube_ad_suppression.test.mjs`

Files with fewer than five lines changed by others are not listed. The Git history is the authoritative record of each contribution.

## Third-party components

| Component | License | Where |
|---|---|---|
| [TinySegmenter](http://chasen.org/~taku/software/TinySegmenter/) by Taku Kudo | BSD-3-Clause | `TinySegmenter.js`, notice in [TinySegmenter.LICENSE.txt](TinySegmenter.LICENSE.txt) |
| [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) 1.0.0 by Roy T. Hashimoto | MIT | Bundled in `LrclibLocalDatabaseRuntime.js`, which keeps the full notice |
| [Preact](https://github.com/preactjs/preact) | MIT | `third_party/preact/`, notice in [third_party/preact/LICENSE](third_party/preact/LICENSE) |
| [spicetify-visualizer](https://github.com/Konsl/spicetify-visualizer) by Konsl | MIT | Parts of `CdVisualizer.js`, notice in [third_party/spicetify-visualizer.LICENSE](third_party/spicetify-visualizer.LICENSE) and at the end of the README |
| [Bootstrap](https://github.com/twbs/bootstrap) | MIT | Parts of `style.css`, noted in that file |

## Lyrics and other content

The repository does not contain lyrics, recordings, artwork, or videos, and no license here covers them. ivLyrics retrieves lyrics and other content from third-party services at the user's request; that content belongs to its rights holders. Section 5 of [LICENSE](LICENSE) has the full terms. Rights holders can request removal of content stored on ivLyrics servers at me@ivl.is.

ivLyrics is not affiliated with Spotify. Spotify is a trademark of Spotify AB.
