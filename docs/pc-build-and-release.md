# PC build and release

Run these commands from the repository root with Node.js 24 or later:

```sh
npm ci
npm run build
npm test
npm run package -- --version 7.2.0
```

Run the full test suite from a Git checkout with complete history. Some lyric
rendering tests use `git show` to compare the current behavior with earlier
releases.

The development build is `dist/ivLyrics/`. The package command also creates
`dist/ivLyrics.zip` and `dist/ivLyrics.zip.sha256`. The example version is a
build input. Running the command does not change `version.txt` or create a tag.
Without a version argument the builder reads `version.txt`.
The builder writes all files to a temporary directory before publishing them.
If publication fails, it restores the previous outputs. After a process is
terminated during publication, the next build restores those outputs before
compiling. The builder keeps its lock file in the output directory so only
one process can publish to that directory at a time.

## Runtime layout

- `index.js` exposes the custom app's `render()` entry point. It runs when
  Spotify opens the ivLyrics route.
- `startup.js` is listed in the generated manifest's `subfiles_extension`.
  It runs on Spotify startup and contains the providers, playback services,
  integrations, and the offline SQLite worker. The build embeds the worker
  source and pinned WASM as a module dependency of the local LRCLIB coordinator.
- `style.css` combines the feature stylesheets in `src/styles/` in the cascade
  order specified in `src/spicetify/inputs.json`. The root `manifest.json`
  describes the app for Marketplace. The package writes the manifest with the
  generated entry points.

Startup modules run in the order specified by `src/spicetify/inputs.json`.
Each initializer has its own error boundary. The route entry imports
`src/spicetify/index.js`, which initializes the page modules and passes their
dependencies explicitly. Keep the Spotify-provided React instance and existing
storage keys.

The startup extension and route bundle share the interface-language service.
Both contain the packed locale catalog so either can initialize first. Locale
tables are decoded on first use, including when settings search reads other
languages.

The mobile motion entry imports the motion engine and lyric segmenter used by
the Spicetify page. The mobile builder inlines that bundle, the shared
`src/styles/motion-lyrics.css` stylesheet, the mobile overrides, and the native
host into a self-contained WebView HTML file independently of the PC ZIP.

## Publishing

1. Run the **PC Release** workflow with `dry_run` enabled. Check the install ZIP
   in the resulting Actions artifact. A dry run builds the selected commit even
   when a release tag already exists for the requested version. Preview and
   publish runs use independent queues. If release notes cannot be previewed,
   the workflow still uploads the tested ZIP and checksum. For an upgrade
   smoke test, replace an older install in a test profile and start Spotify
   without opening the app first. Check the playbar, the lyrics page, saved
   settings, and a track change.
2. Dispatch the workflow from the default branch with `dry_run` disabled. It
   builds and tests the selected source commit. The Windows and macOS installer
   jobs download the build's Actions artifact by ID, verify its checksum, and
   exercise the installer and updater registration for each platform. After
   both jobs pass, the publish job tags the commit, attaches the ZIP and
   checksum to a draft, and verifies both uploads. A retry of a tagged release
   builds the original tagged commit and verifies any
   already published assets. When only failed jobs are re-run, the publish job
   uses the original build artifact by ID. Publish artifacts have a 30-day
   retention period. The publish job reuses the notes stored with a draft or
   published release, including when the original build ran before the tag
   existed. A new stable release compares its changes
   with the previous published stable release. A prerelease can also use a
   previously published prerelease. Publishing verifies the notes alongside
   the ZIP and uses the same notes file for GitHub and Discord. A retry can
   also finish updating the stable version marker. Use **Manual Release
   Notifications** to recover a missed Discord notification.
3. After a stable release becomes the latest GitHub release, the workflow verifies
   the published ZIP and checksum again before updating the stable version marker
   `version.txt`. A prerelease leaves that marker unchanged. Stable publication
   checks both GitHub's latest release and the default branch marker. Use a
   distinct numeric version for each published candidate and stable release.

The installer still expects `ivLyrics.zip`, its checksum, an `ivLyrics/` root
directory, and the updater files. Keep these names and the CustomApps directory
name. The installer runs `spicetify apply` to register `startup.js` after an
upgrade. Run the same command when replacing a legacy installation manually
so Spotify uses the generated manifest's extension list.

If a release needs reverting, publish a higher patch version from the
last known-good source so existing clients see it as an update.
