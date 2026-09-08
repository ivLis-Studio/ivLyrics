import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const serviceSource = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../TranslationModeHelper.js', import.meta.url), 'utf8');

const section = (source, start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
    return source.slice(from, to);
};

const method = (source, start, end) => section(source, start, end).trim().replace(/,\s*$/, '');
const track = { uri: 'spotify:track:mode-fixture', title: 'Mode song', artist: 'Mode artist' };

const makeTranslator = ({ language = 'en', ai = null, conversions = {} } = {}) => {
    class FixtureTranslator {
        constructor() {
            this.language = language;
        }

        async awaitFinished() { }

        static async callGemini(args) {
            if (!ai) throw new Error('AI fixture is not configured');
            return ai(args);
        }

        async romajifyText(text, target, mode) {
            return conversions.romajifyText
                ? conversions.romajifyText(text, target, mode)
                : `ja:${target}:${mode}:${text}`;
        }

        async convertToRomaja(text, target) {
            return conversions.convertToRomaja
                ? conversions.convertToRomaja(text, target)
                : `ko:${target}:${text}`;
        }

        async convertChinese(text, from, target) {
            return conversions.convertChinese
                ? conversions.convertChinese(text, from, target)
                : `zh:${from}->${target}:${text}`;
        }

        async convertToPinyin(text, options) {
            return conversions.convertToPinyin
                ? conversions.convertToPinyin(text, options)
                : `py:${text}`;
        }
    }

    FixtureTranslator.callGemini = async (args) => {
        if (!ai) throw new Error('AI fixture is not configured');
        return ai(args);
    };
    return FixtureTranslator;
};

function load({ language = 'en', ai = null, conversions = {}, values = new Map(), lyrics = null } = {}) {
    const snapshots = new Map();
    const sent = [];
    const current = lyrics || [{ text: 'Original', startTime: 1000, endTime: 2000 }];
    const Translator = makeTranslator({ language, ai, conversions });
    const context = vm.createContext({
        window: {
            ivLyricsTranslationModes: undefined,
            LyricsAddonManager: {
                getLyrics: async () => ({
                    uri: track.uri,
                    provider: 'fixture',
                    synced: current
                })
            },
            Translator,
        },
        Spicetify: {
            Player: { data: { item: track } },
            LocalStorage: { get: (key) => values.get(key) }
        },
        Utils: {
            getPlayerPlaybackSnapshot: () => ({ uri: track.uri }),
            detectLanguage: () => language,
            extractTrackId: (uri) => uri.split(':').at(-1),
            isSectionHeader: (text) => /^\s*\[[^\]]+\]\s*$/.test(String(text || ''))
        },
        getTranslationTargetLanguage: () => 'ko',
        getServicePronunciationNotation: () => 'translation',
        serviceDebug() {},
        console: { warn() {}, error() {} },
        sendLyricsToConsumers: async (payload) => { sent.push(payload); },
    });

    vm.runInContext(helperSource, context);
    vm.runInContext(section(
        serviceSource,
        '    const getTranslationPartText =',
        '    const getLyricsTextCacheHash ='
    ), context);
    vm.runInContext(`let lyricsProviderRequestGeneration = 0;
        const lyricsProviderInflightRequests = new Map();
        globalThis.service = {
            ${method(serviceSource, '        async getLyricsFromProviders(', '\n        /**\n         * 싱크 데이터 서비스 접근')},
            ${method(serviceSource, '        async getFullLyrics(', '\n        /**\n         * 커뮤니티 싱크 데이터 가져오기')}
        };`, context);

    const service = context.service;
    service.getLyricsSnapshot = (uri) => snapshots.get(uri) || null;
    service.publishLyricsSnapshot = (update) => {
        const previous = snapshots.get(update.trackUri);
        const next = { ...previous, ...update, revision: (previous?.revision || 0) + 1 };
        snapshots.set(update.trackUri, next);
        return next;
    };
    service.emit = () => { };
    return { service, sent, snapshots, Translator };
}

test('maps swapped AI modes into their semantic pronunciation and translation slots', async () => {
    const calls = [];
    const h = load({
        ai: async (args) => {
            calls.push(args);
            return args.wantSmartPhonetic
                ? { phonetic: ['Pronounced'] }
                : { translation: ['Translated'] };
        }
    });

    const output = await h.service.getFullLyrics(track, {
        displayMode1: 'gemini_ko',
        displayMode2: 'gemini_romaji'
    });
    const line = output.lyrics[0];
    assert.equal(line.originalText, 'Original');
    assert.equal(line.text2, 'Translated');
    assert.equal(line.translation, 'Translated');
    assert.equal(line.phoneticText, 'Pronounced');
    assert.deepEqual(calls.map((call) => call.wantSmartPhonetic), [false, true]);
    assert.equal(h.sent.at(-1).lyrics[0].text2, 'Translated');
    assert.equal(h.sent.at(-1).lyrics[0].phoneticText, 'Pronounced');
    assert.equal(h.sent.at(-1).presentationContext.presentationComplete, true);
});

test('runs one local conversion per active slot and preserves Japanese karaoke timing', async () => {
    const lyrics = [{
        text: '歌詞',
        originalText: '歌詞',
        startTime: 1000,
        endTime: 1400,
        syllables: [
            { text: '歌', startTime: 1000, endTime: 1180 },
            { text: '詞', startTime: 1180, endTime: 1400 }
        ]
    }];
    const calls = [];
    const h = load({
        language: 'ja',
        lyrics,
        conversions: {
            romajifyText: (text, target, mode) => {
                calls.push({ text, target, mode });
                return `${target}/${mode}`;
            }
        }
    });
    const output = await h.service.getFullLyrics(track, {
        displayMode1: 'romaji',
        displayMode2: 'furigana'
    });
    const line = output.lyrics[0];
    assert.equal(line.originalText, '歌詞');
    assert.equal(line.text, '歌詞');
    assert.equal(line.phoneticText, 'hiragana/normal');
    assert.deepEqual(line.syllables, lyrics[0].syllables);
    assert.deepEqual(calls, [
        { text: '歌詞', target: 'romaji', mode: 'spaced' },
        { text: '歌詞', target: 'hiragana', mode: 'normal' }
    ]);
    assert.equal(h.sent.at(-1).presentationContext.presentationComplete, true);
});

test('supports Korean romaja and both Chinese traditional conversions without AI', async () => {
    const korean = load({
        language: 'ko',
        lyrics: [{ text: '안녕', startTime: 1 }],
        conversions: { convertToRomaja: (text) => `annyeong:${text}` }
    });
    const koreanResult = await korean.service.getFullLyrics(track, { displayMode1: 'romaja' });
    assert.equal(koreanResult.lyrics[0].phoneticText, 'annyeong:안녕');

    const chinese = load({
        language: 'zh-hans',
        lyrics: [{ text: '简体', startTime: 1 }],
        conversions: {
            convertChinese: (text, from, target) => `${from}->${target}:${text}`,
            convertToPinyin: (text) => `pinyin:${text}`
        }
    });
    const chineseResult = await chinese.service.getFullLyrics(track, {
        displayMode1: 'tw',
        displayMode2: 'pinyin'
    });
    assert.equal(chineseResult.lyrics[0].text2, 'cn->tw:简体');
    assert.equal(chineseResult.lyrics[0].phoneticText, 'pinyin:简体');
    assert.equal(chinese.sent.at(-1).presentationContext.presentationComplete, true);
});

test('continues an independent slot after one mode fails and keeps presentation incomplete', async () => {
    const h = load({
        ai: async (args) => {
            if (!args.wantSmartPhonetic) throw new Error('translation unavailable');
            return { phonetic: ['Pronounced'] };
        }
    });
    const output = await h.service.getFullLyrics(track, {
        displayMode1: 'gemini_ko',
        displayMode2: 'gemini_romaji'
    });
    assert.equal(output.lyrics[0].phoneticText, 'Pronounced');
    assert.equal(output.lyrics[0].text2, null);
    assert.equal(h.sent.at(-1).sendReason, 'translation-pending');
    assert.equal(h.sent.at(-1).presentationContext.presentationComplete, false);
    assert.equal(h.snapshots.get(track.uri).presentationComplete, false);
});

test('maps each semantic result onto overlapping vocal parts and retains syllable timing', async () => {
    const lyrics = [{
        text: 'Lead / Back',
        originalText: 'Lead / Back',
        startTime: 1000,
        endTime: 1300,
        vocals: {
            lead: {
                id: 'lead',
                text: 'Lead',
                syllables: [{ text: 'Lead', startTime: 1000, endTime: 1150 }]
            },
            background: [{
                id: 'back',
                text: 'Back',
                syllables: [{ text: 'Back', startTime: 1050, endTime: 1200 }]
            }]
        }
    }];
    const h = load({
        lyrics,
        ai: async (args) => args.wantSmartPhonetic
            ? { phonetic: ['L-pron', 'B-pron'] }
            : { translation: ['L-trans', 'B-trans'] }
    });
    const output = await h.service.getFullLyrics(track, {
        displayMode1: 'gemini_ko',
        displayMode2: 'gemini_romaji'
    });
    const line = output.lyrics[0];
    assert.equal(line.text, 'Lead / Back');
    assert.equal(line.vocals.lead.phonetic, 'L-pron');
    assert.equal(line.vocals.lead.translation, 'L-trans');
    assert.equal(line.vocals.background[0].phonetic, 'B-pron');
    assert.equal(line.vocals.background[0].translation, 'B-trans');
    assert.deepEqual(line.vocals.lead.syllables, lyrics[0].vocals.lead.syllables);
    assert.deepEqual(line.vocals.background[0].syllables, lyrics[0].vocals.background[0].syllables);
});
