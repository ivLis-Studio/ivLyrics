import { readKaraokeRendererDeclarations } from "./karaoke-renderer-declarations.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const sourceRoot = new URL("../../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, sourceRoot), "utf8");

// Older integration tests execute selected callbacks together in a classic VM
// scope. Supply real extracted declarations at the original section boundary
// so those tests can keep their assertions and instrumentation.
const includeSection = (source, specifier, marker, declarations) => {
    const importEnd = source.indexOf(specifier);
    if (importEnd === -1 || !source.startsWith("import ")) throw new Error("Missing fixture import: " + specifier);
    const body = source.slice(importEnd + specifier.length).trimStart();
    const at = body.indexOf(marker);
    if (at === -1) throw new Error("Missing fixture section: " + marker);
    const end = declarations.lastIndexOf("\nexport {");
    if (end === -1) throw new Error("Missing module exports: " + specifier);
    return body.slice(0, at) + declarations.slice(0, end) + "\n" + body.slice(at);
};

// Some editor tests swap individual handlers into a VM with fake React state.
// Unwrap the original function body for those instrumented tests only.
function readFactoryDeclarations(path, factory, indentation, resultMarker, { preserveIndent = false } = {}) {
    const source = read(path);
    const opening = source.indexOf("export function " + factory + "(");
    const headerEnd = source.indexOf("\n}) {\n", opening);
    const bodyStart = headerEnd + "\n}) {\n".length;
    const bodyEnd = source.lastIndexOf("\n" + indentation + "return {\n" + indentation.repeat(2) + resultMarker);
    if (opening < 0 || headerEnd < 0 || bodyEnd <= bodyStart) throw new Error("Invalid factory declarations: " + path);
    const declarations = source.slice(bodyStart, bodyEnd);
    return source.slice(0, opening) + (preserveIndent ? declarations : declarations.split("\n")
        .map(line => line.startsWith(indentation) ? line.slice(indentation.length) : line)
        .join("\n"));
}

export const readSyncCreatorSource = () => readFactoryDeclarations(
    "features/sync/SyncDataCreator.js", "createSyncDataCreator", "\t", "SyncDataCreator,",
);

export function readSyncCreatorScoreHandlersSource() {
    const source = read("features/sync/syncCreatorScoreState.mjs");
    const start = source.indexOf("\tconst ensureScoreTracker =");
    const end = source.indexOf("\n\treturn {", start);
    if (start < 0 || end <= start) throw new Error("Missing score capture handlers");
    return source.slice(start, end);
}

// The interactive editor harness instruments handlers inside one mocked React
// render scope. Read the extracted hook bodies from their production modules.
function syncCreatorInputHookBody(path, name, endMarker) {
    const source = read("features/sync/" + path + ".mjs");
    const start = source.indexOf("export function " + name + "(");
    const signature = source.indexOf("\n}) {\n", start);
    const body = signature + "\n}) {\n".length;
    const end = source.indexOf(endMarker, body);
    if (start < 0 || signature < 0 || end <= body) throw new Error("Missing editor input hook: " + name);
    return source.slice(body, end);
}

function inlineSyncCreatorInputHooks(source) {
    const lock = "syncCreatorRecordingLock";
    const selection = "syncCreatorCharacterSelection";
    const replace = (pattern, body) => {
        if (!pattern.test(source)) throw new Error("Missing editor hook call: " + pattern);
        source = source.replace(pattern, () => body + "\n");
    };
    replace(
        /^\tconst \{ setRecordingLockIndexValue, [^\n]+ \} = useSyncCreatorRecordingLockControls\(\{[\s\S]+?^\t\}\);/m,
        syncCreatorInputHookBody(lock, "useSyncCreatorRecordingLockControls", "\n\treturn { setRecordingLockIndexValue"),
    );
    replace(
        /^\tconst \{\n\t\tgetCurrentSyncTargetSavedChars,[\s\S]+?\} = useSyncCreatorRecordingLockTiming\(\{[\s\S]+?^\t\}\);/m,
        syncCreatorInputHookBody(lock, "useSyncCreatorRecordingLockTiming", "\n\treturn {\n\t\tgetCurrentSyncTargetSavedChars,"),
    );
    replace(
        /^\tconst \{\n\t\toffsetSelectionRange,[\s\S]+?\} = useSyncCreatorCharacterSelection\(\{[\s\S]+?^\t\}\);/m,
        syncCreatorInputHookBody(selection, "useSyncCreatorCharacterSelection", "\n\treturn {\n\t\toffsetSelectionRange,")
            .replace("host.getSelection", "window.getSelection")
            .replace("keyboardDragRef, cancelInterval)", "keyboardDragRef, clearInterval)"),
    );
    return source;
}

export function readSyncCreatorFixture() {
    const session = readFactoryDeclarations(
        "features/sync/syncCreatorSessionEditor.mjs",
        "useSyncCreatorSessionEditor", "\t", "buildSyncCreatorSessionRecord,", { preserveIndent: true },
    );
    const sessionCallbacks = session.slice(session.indexOf("\tconst buildSyncCreatorSessionRecord ="));
    const layout = readFactoryDeclarations(
        "features/sync/syncCreatorLineWorkspace.mjs",
        "useSyncCreatorLineWorkspace", "\t", "currentLineStart,", { preserveIndent: true },
    );
    const layoutStart = layout.indexOf("\tconst currentLineStart =");
    const charactersStart = layout.indexOf("\tconst currentLineCharRefs =");
    if (layoutStart < 0 || charactersStart <= layoutStart) throw new Error("Missing line workspace declarations");
    const entry = inlineSyncCreatorInputHooks(readSyncCreatorSource())
        .replace("import { useSyncCreatorSessionEditor } from '#ivlyrics/features/sync/syncCreatorSessionEditor.mjs';",
            "import { createSyncCreatorSessionRecord, prepareSyncCreatorSessionRestore } from '#ivlyrics/features/sync/syncCreatorSessionRecord.mjs';\n"
            + "import { getSyncCreatorSourceLineStarts } from '#ivlyrics/features/sync/syncCreatorPlaybackTimeline.mjs';\n"
            + "import { extractLyricsText } from '#ivlyrics/features/sync/syncCreatorLrclibLyrics.mjs';")
        .replace(/^\tconst \{ buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord \} = useSyncCreatorSessionEditor\(\{[\s\S]+?^\t\}\);/m,
            () => sessionCallbacks)
        .replace("import { useSyncCreatorLineWorkspace } from '#ivlyrics/features/sync/syncCreatorLineWorkspace.mjs';",
            "import { createSyncCreatorMergedLayout, SYNC_CREATOR_MAX_MERGED_LINES } from '#ivlyrics/features/sync/syncCreatorMergedLayout.mjs';\n"
            + "import { rangesToCharRefs, formatSyncCreatorParallelPreviewLines } from '#ivlyrics/features/sync/syncCreatorVocalLayout.mjs';\n"
            + "import { countSyncCreatorCompletedLines, findSyncCreatorIncompleteVocal, isSyncCreatorLineSynced } from '#ivlyrics/features/sync/syncCreatorLineCompletion.mjs';")
        .replace("} = syncCreatorVocalLayout;\n",
            "} = syncCreatorVocalLayout;\nconst { buildParentheticalParallelTemplate, buildManualParallelTemplate } = syncCreatorVocalLayout;\n"
            + "const EMPTY_SYNC_CREATOR_LINE_CHARS = [];\nconst EMPTY_SYNC_CREATOR_PARTS = [];\n")
        .replace(/^\tconst \{\n\t\tcurrentLineStart,[\s\S]+?^\t\} = useSyncCreatorLineWorkspace\(\{[\s\S]+?^\t\}\);/m,
            () => layout.slice(layoutStart, charactersStart))
        .replace("\tscoreInputContextRef.current = {", () => layout.slice(charactersStart) + "\n\tscoreInputContextRef.current = {")
        .replaceAll("readVisualSettings()", "getEditorRuntimeService('CONFIG', window)?.visual")
        .replace("getSpeakerColors: () => speakerColors,", "getSpeakerColors: () => getEditorRuntimeService('ivLyricsSpeakerColors', window),")
        .replace("prepareSyncCreatorWorkSnapshot, hasSyncCreatorUnsubmittedChanges }", "prepareSyncCreatorWorkSnapshot, hasSyncCreatorUnsubmittedChanges, areSyncCreatorSyncBodiesEqual }")
        .replace("} = services;\n",
            "} = createSyncCreatorServices(window);\n");
    const fixtureServices = "import { getSyncCreatorLrclibTextShape } from '#ivlyrics/features/sync/lrclibSyncSource.mjs';\n"
        + "import { createSyncCreatorServices } from '#ivlyrics/spicetify/syncCreatorServices.mjs';\n"
        + "import { createSyncCreatorActiveLinePainter } from '#ivlyrics/features/sync/syncCreatorEditorPreview.mjs';\n"
        + "import { areSyncCreatorParallelRangesEqual, getSyncCreatorConcurrentParallelParts, getSyncCreatorParallelPreviewChars, hasOrderedSyncCreatorTimes, hasReusableSyncCreatorParallelChars, isSyncCreatorCharContextMenuEnabled, preserveSyncCreatorParallelTimingRuns, resolveSyncCreatorManualSplitState, selectSyncCreatorParallelTemplate } from '#ivlyrics/features/sync/parallelTiming.mjs';\n"
        + "import { getRuntimeService as getEditorRuntimeService } from '#ivlyrics/spicetify/runtimeServices.mjs';";
    const sourceImports = entry.match(/import\s*\{[^}]+\}\s*from '#ivlyrics\/(?:features\/sync\/(?:lrclibSyncSource|parallelTiming|syncCreator\w+)|spicetify\/lyricsPageActions)\.mjs';/g);
    const entryWithoutImports = sourceImports.reduce((source, line) => source.replace(line, ""), entry).trimStart();
    const timingMarker = "const {\n\tgetSyncCreatorWordRanges,";
    let source = includeSection(
        entryWithoutImports, "from '#ivlyrics/features/sync/selectionTiming.mjs';",
        timingMarker, read("features/sync/selectionTiming.mjs"),
    );
    source = includeSection(
        source, "from '#ivlyrics/features/sync/timingGranularity.mjs';",
        timingMarker, read("features/sync/timingGranularity.mjs"),
    );
    const validation = read("features/sync/timingValidation.mjs");
    source = includeSection(
        source, "from '#ivlyrics/features/sync/timingValidation.mjs';", timingMarker,
        validation.slice(validation.indexOf("const SYNC_CREATOR_MAX_PARALLEL_PARTS")),
    );
    const parallelMarker = "const {\n\trejoinSyncCreatorParallelLine,";
    const snapshot = read("features/sync/syncSnapshot.mjs");
    source = includeSection(
        source, "from '#ivlyrics/features/sync/syncSnapshot.mjs';", parallelMarker,
        snapshot.slice(snapshot.indexOf("const encodeSyncCreatorWorkSnapshot")),
    );
    const playerBindings = `const getEditorPlayer = () => Spicetify.Player;
const getEditorProgress = () => getEditorPlayer()?.getProgress?.();
const getEditorProgressSeconds = () => (readSyncCreatorPosition(getEditorProgress()) ?? NaN) / 1000;
`;
    return bundleFixtureImports(fixtureServices + "\n" + sourceImports.join("\n") + "\n" + playerBindings + source, "fixtureSyncSourceModules");
}

const settingsServicesImport = 'import { createSettingsServices } from "#ivlyrics/spicetify/settingsServices.mjs";\n';

export const readSettingsSource = () => settingsServicesImport + readFactoryDeclarations(
    "features/settings/Settings.js", "createSettingsPage", "  ", "openConfig,",
).replace('import { createSettingsModalCss } from "./SettingsStyles.js";\n', "")
    .replace("const SETTINGS_MODAL_CSS = createSettingsModalCss(APP_NAME);\n", "")
    .replace("getKaraokeLine: readKaraokeLine,", "getKaraokeLine: () => KaraokeLine,")
    .replace("getVideoHelper: readVideoHelper,", "getVideoHelper: () => typeof VideoHelperService === 'undefined' ? undefined : VideoHelperService,")
    .replace("react, ConfigColorControl, ConfigColorPicker, translate: key => I18n.t(key), toast: Toast,",
        "react, ConfigColorControl, ConfigColorPicker, translate: key => I18n.t(key), toast: typeof Toast === 'undefined' ? undefined : Toast,")
    .replace("readSpeakerColors, readVisualSettings:", "readSpeakerColors: () => window.ivLyricsSpeakerColors, readVisualSettings:")
    .replace("} = services;", "} = createSettingsServices(window);");

export const readSettingsFixture = () => bundleFixtureImports(readSettingsSource(), "fixtureSettingsModules");

export const readSettingsRuntimeFixture = () => bundleFixtureImports(
    settingsServicesImport + 'import { createSettingsPage } from "#ivlyrics/features/settings/Settings.js";\n'
        + 'import { pageLyricsMemoryCache } from "#ivlyrics/lyrics/pageMemoryCache.mjs";\n' + `
const { openConfig, ConfigButton, ConfigSlider, getSettingsMotionDurationMs } = createSettingsPage({
    host: window, react, appName: APP_NAME, i18n: I18n, config: CONFIG,
    storage: StorageManager, spicetify: Spicetify, utils: Utils, toast: Toast,
    readKaraokeLine: () => KaraokeLine,
    readSpeakerColors: () => window.ivLyricsSpeakerColors,
    services: createSettingsServices(window),
    readVideoHelper: () => VideoHelperService,
    readReactDom: () => reactDOM,
    thresholdSizeLimit,
});
`, "fixtureSettingsRuntime",
);

const wordSupplementFixtureImport = 'import { registerWordSupplementService as setFixtureWordSupplementService } from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";\n';

export const readInstrumentedKaraokeFixture = () => bundleFixtureImports(
    wordSupplementFixtureImport + readKaraokeRendererDeclarations(), "fixturePageModules",
);

// Browser fixtures load separate classic scripts to share their mocked
// Spotify scope. Bundle the real module dependencies before the page script.
export function bundleFixtureImports(source, namespace) {
    const imports = source.match(/^(?:import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];\s*)+/)?.[0];
    if (!imports) return source;
    const names = Array.from(imports.matchAll(/\{([^}]+)\}/g), ([, bindings]) => bindings.trim())
        .join(", ").split(",").map((binding) => binding.trim().split(/\s+as\s+/).at(-1)).filter(Boolean);
    const dependencies = buildSync({
        stdin: {
            contents: imports + "export { " + names.join(", ") + " };",
            resolveDir: fileURLToPath(new URL("../", sourceRoot)),
        },
        bundle: true,
        write: false,
        format: "iife",
        globalName: namespace,
    }).outputFiles[0].text;
    return dependencies + "const { " + names.join(", ") + " } = " + namespace + ";\n" + source.slice(imports.length);
}

export const readWordSegmenterFixture = () => bundleFixtureImports(
    `import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
window.LyricsWordSegmenter = lyricsWordSegmenter;
`, "fixtureWordSegmenterModule",
);

export const readPagesFixture = () => bundleFixtureImports(
    wordSupplementFixtureImport + `import { mountLyricsRenderer } from "#ivlyrics/spicetify/lyricsRendererHost.mjs";
const { LyricsPageRenderer, KaraokeLine, lyricRendererPrimitives } = mountLyricsRenderer({
    host: window, document, localStorage, react, spicetify: Spicetify, config: CONFIG, i18n: I18n,
    getUtils: () => typeof Utils === "undefined" ? undefined : Utils,
    getToast: () => typeof Toast === "undefined" ? undefined : Toast,
    getMarketplacePage: () => typeof MarketplacePage === "undefined" ? null : MarketplacePage,
});
`,
    "fixturePageModules",
);

export const readPlaylistPickerFixture = () => bundleFixtureImports(
    `import { createPlaylistPicker } from "#ivlyrics/features/player/PlaylistPicker.js";
window.PlaylistPicker = createPlaylistPicker({
    host: window, document, spicetify: Spicetify, i18n: I18n, getToast: () => Toast,
});
`, "fixturePlaylistPickerModules",
);

export const readCdVisualizerFixture = () => bundleFixtureImports(
    `import { createCdVisualizerApi } from "#ivlyrics/features/player/CdVisualizer.js";
window.ivLyricsCdVisualizer = createCdVisualizerApi(window);
`, "fixtureCdVisualizerModules",
);
export const readVinylPlayerFixture = () => bundleFixtureImports(
    `import { createVinylPlayerMode } from "#ivlyrics/features/player/VinylPlayerMode.js";
import { publishRuntimeService as publishFixtureVinylService } from "#ivlyrics/spicetify/runtimeServices.mjs";
const VinylPlayerMode = createVinylPlayerMode({
    react: Spicetify.React, host: window, document, i18n: I18n, spicetify: Spicetify,
    getActiveLyricRenderer: () => window.ivLyricsActiveLyricLineRenderer,
    getCdVisualizer: () => window.ivLyricsCdVisualizer,
});
publishFixtureVinylService("ivLyricsVinylPlayerMode", VinylPlayerMode, window);
`, "fixtureVinylPlayerModules",
);
export const readFullscreenOverlayFixture = () => bundleFixtureImports(
    `import { createFullscreenOverlay } from "#ivlyrics/features/fullscreen/FullscreenOverlay.js";
import { getRuntimeService as getFixtureFullscreenService, publishRuntimeService as publishFixtureFullscreenService } from "#ivlyrics/spicetify/runtimeServices.mjs";
const FullscreenOverlay = createFullscreenOverlay({
    react: Spicetify.React, host: window, document, spicetify: Spicetify, config: CONFIG, i18n: I18n,
    toast: typeof Toast === "undefined" ? undefined : Toast,
    getPlaylistPicker: () => getFixtureFullscreenService("PlaylistPicker", window),
    getPersistence: () => getFixtureFullscreenService("ivLyricsStoragePersistence", window),
    getSongResearch: () => getFixtureFullscreenService("SongInfoTMI", window),
    getAiManager: () => getFixtureFullscreenService("AIAddonManager", window),
    getVinylMode: () => getFixtureFullscreenService("ivLyricsVinylPlayerMode", window),
    getReactDOM: () => window.ivLyricsEnsureReactDOM?.() || window.Spicetify?.ReactDOM || window.ReactDOM,
});
publishFixtureFullscreenService("FullscreenOverlay", FullscreenOverlay, window);
`, "fixtureFullscreenOverlayModules",
);

export const readVinylActiveLyricRendererFixture = () => bundleFixtureImports(
    `import { createPageVinylLyricRenderer } from "#ivlyrics/features/player/VinylActiveLyricRenderer.js";
const VinylActiveLyricRenderer = createPageVinylLyricRenderer({
    react: Spicetify.React, host: window, document, primitives: window.ivLyricsLyricRendererPrimitives,
    getVisualSettings: () => CONFIG?.visual,
    getFramePosition: (time) => window.ivLyricsLyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(time),
});
if (VinylActiveLyricRenderer) window.ivLyricsActiveLyricLineRenderer = VinylActiveLyricRenderer;
`, "fixtureVinylActiveLyricModules",
);

export function readTranslationRuntimeFixture() {
    const source = read("spicetify/index.js");
    const start = source.indexOf("const {\n  getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,");
    const end = source.indexOf("const ensureReactDOM =", start);
    if (start < 0 || end <= start) throw new Error("Missing lyrics translation composition");
    return bundleFixtureImports([
        'import { getRuntimeService as getAppService } from "#ivlyrics/spicetify/runtimeServices.mjs";',
        'import { createPageTranslation } from "#ivlyrics/spicetify/composePageTranslation.mjs";',
        'import { getSyncDataRendererCacheVersion } from "#ivlyrics/lyrics/pageLyricsCacheIdentity.mjs";',
        'import { readPronunciationSlots } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";',
        'import { reuseLyricsPresentation } from "#ivlyrics/lyrics/translationPresentation.mjs";',
        source.slice(start, end),
    ].join("\n"), "fixtureTranslationModules");
}

export const readPronunciationDisplayModeFixture = () => bundleFixtureImports(
    'import { isPronunciationDisplayMode } from "#ivlyrics/lyrics/translationPresentation.mjs";', "fixturePronunciationDisplayMode",
);

export const readI18nFixture = () => bundleFixtureImports(
    `import { initializeRuntimeI18n } from "#ivlyrics/i18n/I18n.js";
const I18n = initializeRuntimeI18n({
    host: window, spicetify: typeof Spicetify === "undefined" ? undefined : Spicetify,
    getLocalStorage: () => localStorage,
});
`, "fixtureI18nModules",
);

const readOptionsMenuSource = () => readFactoryDeclarations(
    "app/OptionsMenu.js", "createOptionsMenu", "  ", "OptionsMenu,",
);

export const readInstrumentedOptionsMenuFixture = () => bundleFixtureImports(
    'import { getSettingsModalOpen as readFixtureSettingsOpen } from "#ivlyrics/features/settings/settingsModalHost.mjs";\n'
        + readOptionsMenuSource().replace("const dialogs = createToolbarDialogs(", "const dialogs = createFixtureToolbarDialogs(") + `
function createFixtureToolbarDialogs() {
    return Object.fromEntries([
        "openLocalLyricsLrclibSearchModal", "openCommunityVideoSelector", "openShareImageModal", "openSyncDataCreator",
    ].map(name => [name, (...args) => globalThis[name](...args)]));
}
function openSettings(...args) { return readFixtureSettingsOpen(window)?.(...args); }
Object.assign(window, {
        IvLyricsTooltip, IvLyricsToolbarIcon, ivLyricsFirstLanguagePrompt,
        IvLyricsFloatingToolbar, SyncDataCreatorButton, openSyncDataCreator,
    });
`, "fixtureOptionsMenuModules",
);

export const readOptionsMenuFixture = () => bundleFixtureImports(
    'import { createOptionsMenu } from "#ivlyrics/app/OptionsMenu.js";\n' + 'import { getSettingsModalOpen as readFixtureSettingsOpen } from "#ivlyrics/features/settings/settingsModalHost.mjs";\n' + `
const {
    OptionsMenu, IvLyricsFloatingToolbar, IvLyricsTooltip, IvLyricsToolbarIcon, ivLyricsFirstLanguagePrompt,
    openRegenerateTranslationChoiceModal, getRegenerateTranslationChoiceItems, openSyncDataCreator, SyncDataCreatorButton,
} = createOptionsMenu({
    react, host: window, spicetify: Spicetify, i18n: I18n, utils: Utils, toast: Toast,
    appName: APP_NAME, config: CONFIG, storage: StorageManager, ConfigSlider, ConfigButton, getSettingsMotionDurationMs,
    openSettings: (...args) => readFixtureSettingsOpen(window)?.(...args),
});
Object.assign(window, { IvLyricsTooltip, IvLyricsToolbarIcon, ivLyricsFirstLanguagePrompt, IvLyricsFloatingToolbar, SyncDataCreatorButton, openSyncDataCreator });
`, "fixtureOptionsMenuModules",
);

export const readSettingsStylesFixture = () => bundleFixtureImports(
    'import { createSettingsModalCss } from "#ivlyrics/features/settings/SettingsStyles.js";\n'
        + "const SETTINGS_MODAL_CSS = createSettingsModalCss(APP_NAME);",
    "fixtureSettingsStylesModules",
);

export const readSetupWizardFixture = () => bundleFixtureImports(
    `import { createSetupWizard } from "#ivlyrics/app/SetupWizard.js";
import { requestAppRouteReload } from "#ivlyrics/spicetify/routeReload.mjs";
const { SetupWizard, openSetupWizard, isSetupNeeded } = createSetupWizard({
    react, host: window, document, i18n: I18n, config: CONFIG, storage: StorageManager,
    videoHelper: typeof VideoHelperService === "undefined" ? undefined : VideoHelperService,
    getOverlaySender: () => window.OverlaySender,
    getReactDOM: () => window.ivLyricsEnsureReactDOM?.()
        || (typeof reactDOM !== "undefined" ? reactDOM : window.Spicetify?.ReactDOM ?? window.ReactDOM),
    reload: settingsReturn => requestAppRouteReload({ host: window, settingsReturn }),
});
`, "fixtureSetupWizardModules",
);

export const readLearningModeFixture = () => bundleFixtureImports(
    'import { initializeLearningMode } from "#ivlyrics/features/learning/LearningMode.js";\n' +
    'initializeLearningMode({ host: window, document, ToolbarIcon: window.IvLyricsToolbarIcon, readTooltip: () => window.IvLyricsTooltip });',
    "fixtureLearningModeModules",
);

export const readLyricDisplayTextFixture = () => bundleFixtureImports(
    'import { safeRenderText } from "#ivlyrics/lyrics/lyricDisplayText.mjs";', "fixtureLyricDisplayText",
);

export const readShareImageRendererFixture = () => bundleFixtureImports(
    `import { installPageShareImage } from "#ivlyrics/features/share/LyricsShareImage.js";
installPageShareImage(window);
`, "fixtureShareImageRendererModules",
);

export const readVideoBackgroundFixture = () => {
    const source = readFactoryDeclarations(
        "features/video/VideoBackground.js", "createVideoBackground", "    ", "VideoBackground,",
    ).replace('from "./videoDriftCorrection.mjs";', 'from "#ivlyrics/features/video/videoDriftCorrection.mjs";');
    return bundleFixtureImports(
        'import { createVideoMatchSession } from "#ivlyrics/features/video/videoMatchSession.mjs";\n'
            + 'import { createYouTubeVideoLookup } from "#ivlyrics/features/video/youTubeVideoLookupRequest.mjs";\n'
            + source.replace("const VIDEO_BACKGROUND_DEBUG =", `const document = globalThis.document;
const readSyncDataService = () => window.SyncDataService;
const readGlobalSyncOffset = () => window.Utils?.getGlobalSyncOffset?.();
const isYouTubeAdPlaying = (player) => globalThis.VideoBackgroundDepend?.isAdPlayback?.(player);
const matchSession = createVideoMatchSession({
    normalizeIsrc: (value) => readSyncDataService()?.normalizeSyncDataIsrc?.(value),
});
const readRoutePrefetchedVideo = null;
const readLyricsCache = () => globalThis.LyricsCache;
const { readSpotifyData, readApiTracker, makeVideoLookupRequest, request } = globalThis;
const fetchVideoLookup = createYouTubeVideoLookup((...args) => request(...args));
const VIDEO_BACKGROUND_DEBUG =`)
            + "\nwindow.VideoBackground = VideoBackground;\n",
        "fixtureVideoBackgroundModules",
    );
};

export const readCommunityVideoPreviewSource = () => readFactoryDeclarations(
    "features/video/communityVideoPreview.mjs", "createCommunityVideoPreviews", "  ", "SyncedVideoPreview,",
);

// Keep the production sender methods bundled in the simulated Spotify window.
export const readOverlaySendersFixture = () => bundleFixtureImports(
    `import { createOverlaySenders } from "#ivlyrics/features/overlay/createOverlaySenders.mjs";
import { createOverlayLyricPayload as createFixtureOverlayLyricPayload } from "#ivlyrics/features/overlay/overlayLyricPayload.mjs";
import { createLyricSupplementPresentation } from "#ivlyrics/lyrics/lyricSupplementPresentation.mjs";
import { getTranslationSourceCacheHash as hashFixtureSourceText } from "#ivlyrics/lyrics/translationPresentation.mjs";
const lyricPresentation = createLyricSupplementPresentation({
    getDisplayComparison: () => window.ivLyricsTextComparison?.areEquivalent,
    hashSourceText: hashFixtureSourceText,
});
const { OverlaySender, lyricsHelperSender } = createOverlaySenders({
    host: window,
    getSpicetify: () => Spicetify,
    getSyncOffset: globalThis.getOverlaySyncOffset,
    playback: Utils,
    getOverlayProgressIsPlaying: () => getOverlayProgressIsPlaying(),
    resolveSpotifyImageUrl: (url) => resolveSpotifyImageUrl(url),
    scheduleSenderBootstrap: globalThis.scheduleSenderBootstrap ?? (() => {}),
    isPresentationCurrent: context => window.ivLyricsOverlayService?.isPresentationCurrent?.(context),
    debug: helperDebug,
    lyricPresentation,
    mapLyricsForSender: createFixtureOverlayLyricPayload(lyricPresentation),
});
globalThis.senders = [OverlaySender, lyricsHelperSender];`, "fixtureOverlaySenderModules",
);
