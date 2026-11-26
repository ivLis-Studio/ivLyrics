import assert from "node:assert/strict";
import test from "node:test";
import { resolveStablePlayerItem } from "../src/core/PlaybackClock.js";
import { getPlayableLyricsUri } from "../src/core/playbackPositionService.mjs";
import { createPanelTrackEffects } from "../src/lyrics/panelTrackEffects.mjs";
import { readInitialPanelLyrics } from "../src/lyrics/panelLyricPresentation.mjs";
import { INTERFACE_LANGUAGE_CHANGED } from "../src/i18n/interfaceLanguage.mjs";
import { LYRICS_PROVIDER_SELECTION_CHANGED } from "../src/lyrics/lyricsProviderRequests.mjs";

const noop = () => {};
const first = { uri: "spotify:track:first", metadata: { title: "First" } };
const next = { uri: "spotify:track:next", metadata: { title: "Next" } };
const rows = (item) => [{ text: item.metadata.title + " lyric", startTime: 1000 }];
const result = (item) => ({ provider: "fixture", synced: rows(item) });
const flush = async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve();
};

function fixture(t, {
    getLyrics = (info) => result(info.uri === first.uri ? first : next),
    getOffset = (uri) => uri === next.uri ? 150 : 30,
    translate = null, currentLoaded = true,
    karaokeEnabled = true, getRevision, getProviderOverride, getLanguageOverride, visual = {}, preferences = {}, initialSnapshot,
} = {}) {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const publish = [];
    const loads = [];
    const offsetReads = [];
    const state = { lyrics: currentLoaded ? rows(first) : [], notFound: false, trackOffset: 0 };
    const currentLyricsState = { lyrics: state.lyrics, trackUri: currentLoaded ? first.uri : null };
    const player = Object.assign(new EventTarget(), { data: { item: first } });
    const host = Object.assign(new EventTarget(), { localStorage: { getItem: () => null } });
    let snapshot = { uri: first.uri, item: first };
    let presentationSnapshot;
    let dispose;
    const spicetify = { Player: player };
    const playback = {
        getPlayerPlaybackSnapshot: () => snapshot,
        resolveStablePlaybackTrack: (candidate, sample) => resolveStablePlayerItem(player.data, sample, candidate),
    };
    const translationPreferences = {
        getTranslationTargetLanguage: () => "ko",
        getTranslationStyle: () => "natural",
        getPronunciationNotation: () => "translation",
        ...preferences,
    };
    const getVisualSetting = (key, fallback) => visual[key] ?? (key === "karaoke-mode-enabled" ? karaokeEnabled
        : translate && key === "translation-mode-2:english" ? "gemini_ko" : fallback);
    const initial = readInitialPanelLyrics(first.uri, initialSnapshot, currentLyricsState, getVisualSetting,
        translationPreferences, value => value);
    if (currentLoaded && !initialSnapshot) initial.loadedUri = first.uri;
    state.lyrics = initial.lyrics;
    const useTrackEffects = createPanelTrackEffects({
        react: {
            useRef: current => ({ current }), useCallback: value => value, useMemo: factory => factory(),
            useEffect: effect => { dispose = effect(); },
        },
        host, getSpicetify: () => spicetify, currentLyricsState, panelDebug: noop,
        readPlaybackPosition: () => playback,
        readPlaybackSnapshot: playback.getPlayerPlaybackSnapshot,
        readCurrentTrackUri: () => getPlayableLyricsUri(snapshot, player.data.item?.uri),
        readTrackSyncStore: () => null,
        readPseudoKaraoke: () => null,
        getTranslator: () => translate ? { callGemini: translate } : null,
        getAIManager: () => null,
        translationPreferences,
        getPanelLyricsService: () => ({
            async getLyricsFromProviders(info, _order, _mode, forcedProvider, options) {
                loads.push(info.uri);
                return getLyrics(info, forcedProvider, options);
            },
            getLyricsRequestRevision: getRevision,
            getTrackLyricsProviderOverride: getProviderOverride,
            getTrackLanguageOverride: getLanguageOverride,
            getTrackSyncOffset(uri) { offsetReads.push(uri); return getOffset(uri); },
            detectLanguage: () => "en",
            getLyricsSnapshot: () => presentationSnapshot,
        }),
        publishPanelLyricsSnapshot: (data) => publish.push(data),
        getPanelTrackId: uri => uri.split(":").at(-1),
        getSavedPanelLocalLyrics: () => null,
        settings: {
            getStorageValue: (_key, fallback) => fallback,
            getVisualSetting,
        },
        presentation: {
            sanitizePanelLyricsSupplements: value => value,
            applyPanelTranslationResults: (value, _requests, _phonetic, translation) =>
                value.map((line, index) => ({ ...line, text2: translation[index] })),
        },
    });
    useTrackEffects(initial, {
        setLyrics: value => { state.lyrics = value; },
        setLyricsNotFound: value => { state.notFound = value; }, setKaraokeSource: noop,
    }, {
        setTrackOffset: value => { state.trackOffset = value; },
        setCurrentIndex: noop, setVisualIndex: noop, setActiveTrailingInterludeKey: noop,
        setVisualTrailingInterludeKey: noop, setIsPlaybackPaused: noop, getPlaybackPaused: () => false,
    }, {});
    const close = () => { dispose?.(); dispose = null; };
    t.after(close);
    return {
        state, loads, offsetReads, publish, currentLyricsState, close,
        setSnapshot: value => { snapshot = value; },
        setPublicItem: item => { player.data.item = item; },
        changeSong: (item) => player.dispatchEvent(Object.assign(new Event("songchange"), { data: { item } })),
        changeSetting: (name, value) => {
            visual[name] = value;
            host.dispatchEvent(new CustomEvent("ivLyrics", { detail: { name, value } }));
        },
        notifyProviderSelection: () => host.dispatchEvent(new Event(LYRICS_PROVIDER_SELECTION_CHANGED)),
        notifyInterfaceLanguage: () => host.dispatchEvent(new Event(INTERFACE_LANGUAGE_CHANGED)),
        releasePage: trackUri => host.dispatchEvent(new CustomEvent("ivLyrics:presentation-owner-released", {
            detail: { source: "ivlyrics-page", trackUri },
        })),
        changeOffset: (trackUri, offset) => host.dispatchEvent(
            new CustomEvent("ivLyrics:offset-changed", { detail: { trackUri, offset } })),
        applyShared: detail => {
            presentationSnapshot = detail;
            host.dispatchEvent(new CustomEvent("ivLyrics:shared-lyrics-updated", { detail }));
        },
        advance: async (delay) => { t.mock.timers.tick(delay); await flush(); },
    };
}

test("panel teardown aborts only the mounted view's pending provider lookup", async t => {
    const pending = Promise.withResolvers();
    let signal;
    const h = fixture(t, { currentLoaded: false, getLyrics: (_info, _provider, options) => {
        signal = options?.signal;
        return pending.promise;
    } });
    await flush();
    assert.equal(signal?.aborted, false);
    h.close();
    assert.equal(signal.aborted, true);
    pending.resolve(result(first));
    await flush();
    assert.deepEqual(h.publish, []);
});

test("a panel request rejected after the cache was cleared does not replace the current lyrics with an error", async t => {
    const pending = Promise.withResolvers();
    let revision = 0;
    const h = fixture(t, { currentLoaded: false, getRevision: () => revision,
        getLyrics: () => revision === 0 ? pending.promise : result(first) });
    await flush();
    revision++;
    pending.reject(new Error("Old provider failure"));
    await flush();
    assert.deepEqual(h.loads, [first.uri, first.uri]);
    assert.equal(h.state.lyrics[0].text, "First lyric");
    assert.equal(h.state.notFound, false);
    assert.equal(h.publish[0].displayLyrics[0].text, "First lyric");
});

test("a panel retry after a provider change reads the new track override", async t => {
    const pending = Promise.withResolvers();
    const overrides = [];
    let revision = 0, providerOverride = 'old';
    const h = fixture(t, {
        currentLoaded: false, getRevision: () => revision, getProviderOverride: async () => providerOverride,
        getLyrics: (_info, provider) => {
            overrides.push(provider);
            return overrides.length === 1 ? pending.promise : { ...result(first), provider };
        },
    });
    await flush();
    assert.deepEqual(overrides, ['old']);
    providerOverride = 'new';
    revision++;
    pending.resolve({ ...result(first), provider: 'old' });
    await flush();
    assert.deepEqual(overrides, ['old', 'new']);
    assert.equal(h.publish[0].provider, 'new');
    assert.equal(h.publish[0].trackLyricsProviderOverride, 'new');
});

test("an obsolete override failure retries with the new settings and keeps the current track offset read", async t => {
    const pending = Promise.withResolvers();
    let revision = 0;
    const used = [];
    const h = fixture(t, {
        currentLoaded: false, getRevision: () => revision,
        getLanguageOverride: () => revision === 0 ? pending.promise : "ja",
        getProviderOverride: () => revision === 0 ? "old" : "new",
        getLyrics: (info, provider) => {
            used.push([info.languageOverride, provider]);
            return { ...result(first), provider };
        },
    });
    await flush();
    revision++;
    pending.reject(new Error("Old override read failed"));
    await flush();
    assert.deepEqual(used, [["ja", "new"]]);
    assert.deepEqual(h.offsetReads, [first.uri]);
    assert.equal(h.publish[0].provider, "new");
    assert.equal(h.state.notFound, false);
});

test("panel supplements can complete while the saved offset is still loading", async t => {
    const offset = Promise.withResolvers();
    let translations = 0;
    const h = fixture(t, {
        currentLoaded: false, getOffset: () => offset.promise,
        translate: () => { translations++; return { translation: ["Ready before offset"] }; },
    });
    await flush();
    assert.equal(translations, 1);
    assert.equal(h.state.lyrics[0].text2, "Ready before offset");
    assert.equal(h.state.trackOffset, 0);
    offset.resolve(125);
    await flush();
    assert.equal(h.state.trackOffset, 125);
    assert.equal(translations, 1);
});

test("a deferred offset cannot overwrite a newer offset or the next track's offset", async t => {
    const offsets = [Promise.withResolvers(), Promise.withResolvers()];
    let read = 0;
    const h = fixture(t, { currentLoaded: false, getOffset: uri => uri === first.uri ? offsets[read++].promise : 150 });
    await flush();
    h.changeOffset(first.uri, 110);
    offsets[0].resolve(30);
    await flush();
    assert.equal(h.state.trackOffset, 110);
    h.notifyProviderSelection();
    await h.advance(0);
    h.setSnapshot({ uri: next.uri, item: next });
    h.setPublicItem(next);
    h.changeSong(next);
    await h.advance(300);
    assert.equal(h.state.trackOffset, 150);
    offsets[1].resolve(40);
    await flush();
    assert.equal(h.state.trackOffset, 150);
    assert.deepEqual(h.state.lyrics, rows(next));
});

test("completed panel lookups mark empty or failed results as unavailable", async t => {
    for (const request of [
        () => ({ error: "result missing" }),
        () => ({ synced: [] }),
        () => { throw new Error("fixture network failure"); },
    ]) {
        const pending = Promise.withResolvers();
        const h = fixture(t, { currentLoaded: false, getLyrics: () => pending.promise.then(request) });
        await flush();
        assert.equal(h.state.notFound, false);
        pending.resolve();
        await flush();
        assert.equal(h.state.notFound, true);
        assert.deepEqual(h.state.lyrics, []);
        assert.deepEqual(h.publish, []);
        h.close();
        t.mock.timers.reset();
    }
});

test("the panel discards a pending translation when the source provider revision changes", async t => {
    const pending = Promise.withResolvers();
    let revision = 0, translationCalls = 0;
    const h = fixture(t, {
        currentLoaded: false, getRevision: () => revision,
        translate: () => { translationCalls++; return pending.promise; },
    });
    await flush();
    assert.equal(translationCalls, 1);
    assert.equal(h.publish.length, 1);
    revision++;
    pending.resolve({ translation: ["Obsolete translation"] });
    await flush();
    assert.equal(h.publish.length, 1);
    assert.equal(h.state.lyrics[0].text2, undefined);
});

for (const karaokeEnabled of [true, false, "false"]) {
    test(`late lrc.red timing respects karaoke setting and preserves pending panel translation (${JSON.stringify(karaokeEnabled)})`, async t => {
        const pending = Promise.withResolvers();
        let calls = 0;
        const line = rows(first)[0];
        const karaoke = [{ ...line, syllables: [{ text: line.text, startTime: 100, endTime: 500 }] }];
        const rawResult = { provider: "lrcred", karaokeSource: "lrcred", karaoke };
        const h = fixture(t, {
            currentLoaded: false, karaokeEnabled, translate: () => { calls++; return pending.promise; },
            getLyrics: () => ({ ...result(first), provider: "lrcred" }),
        });
        await flush();
        assert.equal(calls, 1);
        h.applyShared({ source: "lrcred-word-sync", timingUpgradeApplied: true, trackUri: first.uri,
            rawResult, displayLyrics: karaoke, karaokeSource: "lrcred" });
        const shouldUpgrade = karaokeEnabled === true;
        if (shouldUpgrade) assert.equal(h.state.lyrics[0].syllables.length, 1);
        else assert.equal(h.state.lyrics[0].syllables, undefined);
        pending.resolve({ translation: ["Translated"] });
        await flush();
        assert.equal(calls, 1);
        assert.equal(h.state.lyrics[0].text2, "Translated");
        assert.equal(h.publish.at(-1).lyricsType, shouldUpgrade ? "karaoke" : "synced");
        assert.equal(Boolean(h.state.lyrics[0].syllables?.length), shouldUpgrade);
    });
}

test("an old page translation does not take over the panel after the target language changes", async t => {
    const pending = Promise.withResolvers();
    const visual = { "translate:target-language": "ko" };
    const h = fixture(t, {
        translate: () => pending.promise,
        visual,
        preferences: { getTranslationTargetLanguage: () => visual["translate:target-language"] },
    });
    await flush();
    h.changeSetting("translate:target-language", "es");
    await h.advance(0);
    const shared = {
        source: "ivlyrics-page", trackUri: first.uri, lyricsType: "synced", detectedLanguage: "en",
        displayMode1: "none", displayMode2: "gemini_ko", pronunciationNotation: "translation",
        presentationComplete: true,
    };
    h.applyShared({ ...shared, translationTargetLanguage: "ko",
        displayLyrics: [{ ...rows(first)[0], text2: "Previous language" }] });
    assert.equal(h.state.lyrics[0].text2, undefined);

    pending.resolve({ translation: ["Current language"] });
    await flush();
    assert.equal(h.state.lyrics[0].text2, "Current language");
    assert.equal(h.publish.at(-1).translationTargetLanguage, "es");

    h.applyShared({ ...shared, translationTargetLanguage: "es",
        displayLyrics: [{ ...rows(first)[0], text2: "Current language from the page" }] });
    assert.equal(h.state.lyrics[0].text2, "Current language from the page");
});

test("a panel target change keeps the selected word timing without another provider lookup", async t => {
    const visual = { "translate:target-language": "ko" };
    const h = fixture(t, {
        visual,
        preferences: { getTranslationTargetLanguage: () => visual["translate:target-language"] },
        translate: async () => ({ translation: ["Bonjour"] }),
    });
    const timed = [{ ...rows(first)[0], endTime: 2000, syllables: [{ text: "First", startTime: 1000, endTime: 1300 }] }];
    const raw = { uri: first.uri, provider: "lrcred", karaokeSource: "lrcred", karaoke: timed, synced: rows(first) };
    h.applyShared({ source: "ivlyrics-page", trackUri: first.uri, rawResult: raw, provider: "lrcred",
        karaokeSource: "lrcred", lyricsType: "karaoke", displayLyrics: timed, presentationComplete: true });
    h.changeSetting("translate:target-language", "fr");
    await h.advance(0);
    assert.deepEqual(h.loads, []);
    assert.strictEqual(h.publish.at(-1).displayLyrics[0].syllables, timed[0].syllables);
    assert.strictEqual(h.publish[0].rawResult, raw);
    assert.equal(h.state.lyrics[0].text2, "Bonjour");
});

test("turning off a forced source language rejects a stale page presentation even with matching slots", async t => {
    const visual = { "translate:detect-language-override": "ja", "translation-mode-2:japanese": "gemini_ko" };
    const h = fixture(t, { visual, translate: async () => ({ translation: ["Detected source"] }) });
    h.changeSetting("translate:detect-language-override", "off");
    h.applyShared({
        source: "ivlyrics-page", trackUri: first.uri, lyricsType: "synced", detectedLanguage: "ja",
        displayMode1: "none", displayMode2: "gemini_ko", pronunciationNotation: "translation",
        translationTargetLanguage: "ko", presentationComplete: true,
        playbackPreferences: { configuredSourceLanguage: "ja", karaokeEnabled: true },
        displayLyrics: [{ ...rows(first)[0], text2: "Forced source" }],
    });
    assert.equal(h.state.lyrics[0].text2, undefined);
    await h.advance(0);
    assert.equal(h.publish.at(-1).detectedLanguage, "en");
    assert.equal(h.state.lyrics[0].text2, "Detected source");
});

test("the panel refreshes only when the interface language changes the automatic target", async t => {
    let language = "ko";
    let target = "fr";
    const getTranslationTargetLanguage = () => target === "auto" ? language : target;
    const h = fixture(t, {
        preferences: { getTranslationTargetLanguage },
        translate: async () => ({ translation: [getTranslationTargetLanguage()] }),
    });
    language = "es";
    h.notifyInterfaceLanguage();
    await h.advance(0);
    assert.deepEqual(h.loads, []);

    target = "auto";
    h.changeSetting("translate:target-language", "auto");
    await h.advance(0);
    assert.equal(h.state.lyrics[0].text2, "es");
    language = "ko";
    h.notifyInterfaceLanguage();
    await h.advance(0);
    assert.equal(h.state.lyrics[0].text2, "ko");
});

test("a settings preset and its provider notification share one panel reload and offset read", async t => {
    const h = fixture(t);
    await flush();
    h.changeSetting("translation-mode:english", "none");
    h.changeSetting("translate:pronunciation-notation", "latin");
    h.changeSetting("karaoke-mode-enabled", false);
    queueMicrotask(h.notifyProviderSelection);
    await flush();
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.offsetReads, [first.uri]);
    await h.advance(0);
    assert.deepEqual(h.loads, [first.uri]);
    assert.deepEqual(h.offsetReads, [first.uri, first.uri]);
    assert.equal(h.publish.at(-1).lyricsType, "synced");
});

test("a queued panel settings refresh cannot apply to a different song or a closed view", async t => {
    const h = fixture(t);
    h.changeSetting("translate:pronunciation-notation", "latin");
    h.setSnapshot({ uri: next.uri, item: next });
    h.changeSong(next);
    await h.advance(300);
    assert.deepEqual(h.loads, [next.uri]);
    h.changeSetting("translate:pronunciation-notation", "ipa");
    h.close();
    await h.advance(300);
    assert.deepEqual(h.loads, [next.uri]);
});

test("the mounted panel finishes a pending page presentation when the page closes", async t => {
    const h = fixture(t, { translate: async () => ({ translation: ["Finished by panel"] }) });
    await flush();
    h.applyShared({
        source: "ivlyrics-page", trackUri: first.uri, lyricsType: "synced", detectedLanguage: "en",
        displayMode1: "none", displayMode2: "gemini_ko", pronunciationNotation: "translation",
        translationTargetLanguage: "ko", presentationComplete: false, displayLyrics: rows(first),
    });
    h.releasePage(first.uri);
    await h.advance(0);
    assert.deepEqual(h.loads, [first.uri]);
    assert.equal(h.state.lyrics[0].text2, "Finished by panel");
    assert.equal(h.publish.at(-1).presentationComplete, true);
});

test("a complete presentation with current settings supersedes a queued panel reload", async t => {
    const h = fixture(t);
    await flush();
    h.changeSetting("translation-mode:english", "none");
    h.applyShared({
        source: "ivlyrics-page", trackUri: first.uri, lyricsType: "synced", detectedLanguage: "en",
        displayMode1: "none", displayMode2: "none", pronunciationNotation: "translation",
        translationTargetLanguage: "ko", presentationComplete: true, displayLyrics: rows(first),
    });
    await h.advance(0);
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.state.lyrics, rows(first));
});

test("late word timing updates the current lyrics without restoring old translated text", async t => {
    const line = rows(first)[0];
    const h = fixture(t, {
        translate: () => ({ translation: ["Current language"] }),
        currentLoaded: false,
        getLyrics: () => ({ ...result(first), provider: "lrcred" }),
    });
    await flush();
    assert.equal(h.state.lyrics[0].text2, "Current language");
    const karaoke = [{ ...line, syllables: [{ text: line.text, startTime: 1000, endTime: 1500 }] }];
    h.applyShared({
        source: "lrcred-word-sync", timingUpgradeApplied: true, trackUri: first.uri,
        rawResult: { provider: "lrcred", karaoke }, karaokeSource: "lrcred",
        detectedLanguage: "en", displayMode2: "gemini_ko", translationTargetLanguage: "es",
        displayLyrics: [{ ...karaoke[0], text2: "Previous language" }],
    });
    assert.equal(h.state.lyrics[0].text2, "Current language");
    assert.deepEqual(h.state.lyrics[0].syllables, karaoke[0].syllables);

    h.applyShared({
        source: "lrcred-word-sync", timingUpgradeApplied: true, trackUri: first.uri,
        provider: "different-provider", displayLyrics: [{ ...karaoke[0], startTime: 3000 }],
    });
    assert.equal(h.state.lyrics[0].startTime, 1000);
});

test("a raw timing update keeps the panel translation and ignores different lyrics from the same provider", async t => {
    const line = rows(first)[0];
    const h = fixture(t, {
        translate: () => ({ translation: ["Panel translation"] }),
        currentLoaded: false,
        getLyrics: () => ({ ...result(first), provider: "lrcred" }),
    });
    await flush();
    assert.equal(h.state.lyrics[0].text2, "Panel translation");
    const updateTiming = timedLine => h.applyShared({
        source: "lrcred-word-sync", timingUpgradeApplied: true, trackUri: first.uri,
        rawResult: { provider: "lrcred", karaoke: [timedLine] },
        displayLyrics: [timedLine], karaokeSource: "lrcred",
    });
    const timedLine = { ...line, startTime: 1100, endTime: 1500,
        syllables: [{ text: line.text, startTime: 1100, endTime: 1500 }] };
    updateTiming(timedLine);
    assert.equal(h.state.lyrics[0].text2, "Panel translation");
    assert.equal(h.state.lyrics[0].startTime, 1100);
    assert.deepEqual(h.state.lyrics[0].syllables, timedLine.syllables);

    const committedLyrics = h.state.lyrics;
    updateTiming({ ...timedLine, text: "An alternate version" });
    assert.equal(h.state.lyrics, committedLyrics);
    assert.equal(h.state.trackOffset, 30);
    assert.deepEqual(h.offsetReads, [first.uri]);
    assert.deepEqual(h.loads, [first.uri]);
});

test("a panel opened on a complete page snapshot keeps its translation during word timing delivery", async t => {
    const line = rows(first)[0];
    const h = fixture(t, {
        currentLoaded: false,
        visual: { "translation-mode:english": "none", "translation-mode-2:english": "gemini_ko" },
        initialSnapshot: {
            trackUri: first.uri, rawResult: { provider: "lrcred" },
            displayLyrics: [{ ...line, text2: "Already translated on the page" }],
            detectedLanguage: "en", displayMode1: "none", displayMode2: "gemini_ko", pronunciationNotation: "translation",
            translationStyle: "natural", translationTargetLanguage: "ko", presentationComplete: true,
        },
    });
    await flush();
    const karaoke = [{ ...line, syllables: [{ text: line.text, startTime: 1000, endTime: 1500 }] }];
    h.applyShared({ source: "lrcred-word-sync", timingUpgradeApplied: true, trackUri: first.uri,
        rawResult: { provider: "lrcred", karaoke }, displayLyrics: karaoke, karaokeSource: "lrcred" });
    assert.equal(h.state.lyrics[0].text2, "Already translated on the page");
    assert.deepEqual(h.state.lyrics[0].syllables, karaoke[0].syllables);
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.offsetReads, [first.uri]);
});

test("a delayed public Spotify item cannot make a stale provider result win the panel", async (t) => {
    const oldRequest = Promise.withResolvers();
    const oldOffset = Promise.withResolvers();
    const h = fixture(t, { currentLoaded: false,
        getLyrics: info => info.uri === first.uri ? oldRequest.promise : result(next),
        getOffset: uri => uri === first.uri ? oldOffset.promise : 150 });
    await flush();
    assert.deepEqual(h.loads, [first.uri]);
    h.changeSong(next);
    h.setSnapshot({ uri: next.uri, item: next });
    await h.advance(300);
    assert.equal(h.currentLyricsState.trackUri, next.uri);
    assert.equal(h.state.lyrics[0].text, "Next lyric");
    assert.equal(h.state.trackOffset, 150);
    oldRequest.resolve(result(first));
    oldOffset.resolve(30);
    await flush();
    assert.deepEqual(h.publish.map(update => [update.trackUri, update.presentationComplete]), [
        [next.uri, false], [next.uri, true],
    ]);
    assert.equal(h.state.lyrics[0].text, "Next lyric");
    assert.equal(h.state.trackOffset, 150);
});

test("a shared presentation can move the panel to a new song before Spotify's songchange event", async (t) => {
    const h = fixture(t);
    await flush();
    assert.equal(h.state.trackOffset, 30);
    h.setSnapshot({ uri: next.uri, item: next });
    h.applyShared({ source: "ivlyrics-page", trackUri: next.uri, displayLyrics: rows(next), presentationComplete: true });
    assert.equal(h.currentLyricsState.trackUri, next.uri);
    assert.deepEqual(h.state.lyrics, rows(next));
    assert.equal(h.state.trackOffset, 0, "the previous track's offset must clear before the next read");
    await flush();
    assert.equal(h.state.trackOffset, 150);

    h.changeSong(next);
    h.changeSong(first);
    await h.advance(300);
    assert.equal(h.state.trackOffset, 150);
    assert.deepEqual(h.state.lyrics, rows(next));
    assert.deepEqual(h.loads, [], "duplicate or stale events must reuse the current presentation");

    h.setSnapshot({ uri: next.uri, item: null });
    await h.advance(4000);
    assert.equal(h.currentLyricsState.trackUri, next.uri, "the metadata timeout must preserve the current presentation");
    assert.equal(h.state.trackOffset, 150);
    assert.deepEqual(h.state.lyrics, rows(next));
    assert.deepEqual(h.loads, []);
});

test("a repeated songchange does not cancel the active provider request", async (t) => {
    const response = Promise.withResolvers();
    const h = fixture(t, { currentLoaded: false, getLyrics: () => response.promise });
    await flush();
    assert.deepEqual(h.loads, [first.uri]);
    h.changeSong(first);
    await h.advance(300);
    response.resolve(result(first));
    await flush();
    assert.deepEqual(h.loads, [first.uri]);
    assert.deepEqual(h.state.lyrics, rows(first));
});

test("an empty shared presentation leaves loading only when the search has finished", async (t) => {
    const h = fixture(t);
    await flush();
    const shared = { source: "ivlyrics-page", trackUri: first.uri, displayLyrics: [] };
    h.applyShared({ ...shared, presentationComplete: false });
    assert.equal(h.state.notFound, false);
    h.applyShared({ ...shared, presentationComplete: true });
    assert.equal(h.state.notFound, true);
    h.applyShared({ ...shared, presentationComplete: false, displayLyrics: rows(first) });
    assert.equal(h.state.notFound, false);
});

test("the panel holds no same-URI song lyrics during narration and recovers on the next stable sample", async (t) => {
    const translation = Promise.withResolvers();
    let requests = 0;
    const h = fixture(t, { currentLoaded: false, translate: () => ++requests === 1
        ? translation.promise : Promise.resolve({ translation: ["Recovered"] }) });
    await flush();
    assert.deepEqual(h.loads, [first.uri]);
    assert.equal(requests, 1);
    h.setSnapshot({ uri: first.uri, item: first, djNarration: true });
    h.changeSong(first);
    h.applyShared({ source: "ivlyrics-page", trackUri: first.uri, displayLyrics: rows(first) });
    translation.resolve({ translation: ["Late translation"] });
    await flush();
    assert.deepEqual(h.state.lyrics, []);
    assert.equal(h.currentLyricsState.trackUri, null);
    assert.equal(h.state.notFound, true);
    assert.deepEqual(h.loads, [first.uri]);
    assert.equal(h.publish.length, 1);
    h.setSnapshot({ uri: first.uri, item: first });
    await h.advance(100);
    assert.equal(h.state.lyrics[0].text2, "Recovered");
    assert.equal(h.state.notFound, false);
    assert.deepEqual(h.loads, [first.uri, first.uri]);
});

test("unresolved metadata finishes loading and a closed panel cancels its scheduled read", async (t) => {
    const h = fixture(t);
    h.setPublicItem(null);
    h.setSnapshot({ uri: "", item: null });
    h.changeSong(null);
    h.setPublicItem(first);
    h.applyShared({ source: "ivlyrics-page", trackUri: first.uri, displayLyrics: rows(first) });
    await h.advance(4300);
    assert.equal(h.state.notFound, true);
    assert.deepEqual(h.state.lyrics, []);
    assert.equal(h.currentLyricsState.trackUri, null);
    h.changeSong(next);
    h.close();
    h.setSnapshot({ uri: next.uri, item: next });
    await h.advance(4300);
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.publish, []);
});
