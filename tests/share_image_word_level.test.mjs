import { DEFAULT_SETTINGS, PRESETS } from '../src/features/share/shareImagePresets.mjs';
import { getShareImageRenderOptions } from '../src/features/share/shareImageRenderOptions.mjs';
import { normalizeShareImageLyrics, resolveShareWordDetails } from '../src/features/share/shareImageLyricSelection.mjs';
import { createFixtureWordSupplementService } from './fixtures/word-supplement-service.mjs';
import { readShareImageRendererFixture } from './fixtures/legacy-page-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const shareSource = readShareImageRendererFixture();
const layoutSource = readFileSync(new URL('../src/features/share/shareImageLyricsLayout.mjs', import.meta.url), 'utf8');
const controlSource = readFileSync(new URL('../src/features/share/renderShareImageControls.mjs', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../src/features/share/shareImageDialog.mjs', import.meta.url), 'utf8');

test('share image defaults to line-level detail', () => {
  assert.equal(DEFAULT_SETTINGS.lyricsDetail, 'line');
});

test('every share image preset resolves a lyrics detail mode', () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    const resolved = preset.settings.lyricsDetail ?? DEFAULT_SETTINGS.lyricsDetail;
    assert.equal(resolved, key === 'word' ? 'word' : 'line', `preset ${key} resolves wrong detail mode`);
  }
});

test('word preset exists for word-level export', () => {
  assert.ok(PRESETS.word, 'missing word preset');
  assert.equal(PRESETS.word.settings.lyricsDetail, 'word');
});

test('share image defaults cover export scale and per-type styling', () => {
  assert.equal(DEFAULT_SETTINGS.exportScale, 1);
  assert.equal(DEFAULT_SETTINGS.fontSource, 'default');
  assert.equal(DEFAULT_SETTINGS.customFontFamily, '');
  assert.equal(DEFAULT_SETTINGS.origColor, '#ffffff');
  assert.equal(DEFAULT_SETTINGS.origWeight, '600');
  assert.equal(DEFAULT_SETTINGS.pronColor, '#ffffff');
  assert.equal(DEFAULT_SETTINGS.pronSize, 20);
  assert.equal(DEFAULT_SETTINGS.wordReadingSize, 21);
  assert.equal(DEFAULT_SETTINGS.wordReadingColor, '#ffffff');
  assert.equal(DEFAULT_SETTINGS.wordReadingWeight, '400');
  assert.equal(DEFAULT_SETTINGS.transColor, '#1DB954');
  assert.equal(DEFAULT_SETTINGS.transSize, 22);
  assert.equal(DEFAULT_SETTINGS.wordGlossSize, 21);
  assert.equal(DEFAULT_SETTINGS.wordGlossColor, '#1DB954');
  assert.equal(DEFAULT_SETTINGS.wordGlossWeight, '500');
  assert.equal(DEFAULT_SETTINGS.pronWeight, '400');
  assert.equal(DEFAULT_SETTINGS.transWeight, '500');
  assert.equal(DEFAULT_SETTINGS.trackTitleSize, 26);
  assert.equal(DEFAULT_SETTINGS.trackTitleColor, '#ffffff');
  assert.equal(DEFAULT_SETTINGS.trackTitleWeight, '700');
  assert.equal(DEFAULT_SETTINGS.trackArtistSize, 18);
  assert.equal(DEFAULT_SETTINGS.trackArtistColor, '#ffffff');
  assert.equal(DEFAULT_SETTINGS.trackArtistWeight, '500');
});

test('aspect ratio is enforced exactly with many lines', async () => {
  const { api, canvas } = loadRenderer();
  const lyrics = Array.from({ length: 10 }, (_, i) => ({
    originalText: `Line number ${i} with quite a lot of words in it overflowing the ratio`,
    transText: `Translation number ${i} also fairly long here`,
  }));
  await api.generateImage({
    lyrics, trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { backgroundType: 'solid', aspectRatio: 9 / 16, fontSize: 48 },
    width: 500, output: 'dataUrl',
  });
  assert.equal(canvas.width, 500);
  assert.equal(canvas.height, Math.round(500 / (9 / 16)));
});

test('landscape shares preserve the selected dimensions with a large header and padding', async () => {
  const { api, canvas, calls } = loadRenderer({ cover: true });
  const image = await api.generateImage({
    lyrics: [{ originalText: 'Landscape lyric' }], trackName: 'Song', artistName: 'Artist',
    albumCover: 'https://i.scdn.co/image/landscape-large-header', template: 'cover',
    customSettings: {
      backgroundType: 'solid', showCover: true, coverPosition: 'center', coverSize: 200,
      showTrackInfo: true, trackTitleSize: 48, trackArtistSize: 36, showWatermark: true,
      aspectRatio: 16 / 9, padding: 100, imageWidth: 720, exportScale: 2,
    },
  });
  assert.equal(image.canvas, canvas);
  assert.deepEqual([canvas.width, canvas.height], [1440, 810]);
  assert.ok(calls.text.some(({ text }) => text === 'Landscape lyric'));
  assert.ok(calls.text.every(({ pixelY }) => pixelY >= 0 && pixelY < canvas.height));
});

test('fitting many annotated words keeps the last visible row within the exported image', async () => {
  const { api, canvas, calls } = loadRenderer();
  const lyrics = Array.from({ length: 10 }, (_, index) => ({
    originalText: 'Fixture lyric',
    words: Array.from({ length: 10 }, (_, word) => ({
      w: 'Annotated word ' + word, reading: 'reading of this expression', gloss: 'meaning of this expression',
    })),
    transText: `Final phrase ${index}`,
  }));
  await api.generateImage({ lyrics, template: 'word', width: 720, output: 'dataUrl', customSettings: {
    aspectRatio: 16 / 9, showTrackInfo: true, showPronunciation: true, showTranslation: true,
    showWatermark: true, wordReadingSize: 40, wordGlossSize: 40,
  } });
  assert.deepEqual([canvas.width, canvas.height], [720, 405]);
  assert.ok(calls.text.find(({ text }) => text === 'Final phrase 9').pixelY < canvas.height);
  assert.ok(calls.text.find(({ text }) => text === 'Spotify').pixelY < canvas.height);
});

test('track title and artist styling reaches the canvas', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{ originalText: 'Hello' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: {
      backgroundType: 'solid', showCover: false,
      trackTitleColor: '#ff0000', trackArtistColor: '#0000ff', trackTitleSize: 40,
    },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(calls.fillStyle.includes('#ff0000'), 'track title colour missing');
  assert.ok(calls.fillStyle.some((style) => style.includes('0, 0, 255')), 'track artist colour missing');
  assert.ok(calls.fillText.includes('Song'));
  assert.ok(calls.fillText.includes('Artist'));
});

test('centered cover never overlaps title, artist or lyrics', async () => {
  const { api, calls } = loadRenderer({ cover: true });
  await api.generateImage({
    lyrics: [{ originalText: 'First lyric line here' }],
    trackName: 'Big Song Title', artistName: 'Some Artist', albumCover: 'https://example.com/cover.jpg', template: 'cover',
    customSettings: {
      backgroundType: 'solid', showCover: true, coverPosition: 'center', coverSize: 144,
      trackTitleSize: 48, trackArtistSize: 18,
    },
    width: 1080, output: 'dataUrl',
  });
  const atY = (text) => calls.text.find((entry) => entry.text === text)?.y;
  const titleY = atY('Big Song Title');
  const artistY = atY('Some Artist');
  const lyricY = atY('First lyric line here');
  assert.ok(titleY !== undefined && artistY !== undefined && lyricY !== undefined, 'header and lyrics must render');
  assert.ok(artistY >= titleY + 48, `artist must clear the title (${artistY} >= ${titleY} + 48)`);
  assert.ok(lyricY >= artistY + 18, `lyrics must clear the artist (${lyricY} >= ${artistY} + 18)`);
});

test('share lyrics include karaoke supplements and retain legacy pronunciation', () => {
  assert.deepEqual(normalizeShareImageLyrics([
    null,
    { text: '♪' },
    { text: '日本語', phoneticText: '니혼고', translationText: '일본어' },
    { text: '겐고', originalText: '言語', text2: '언어' },
    { text: 'Same', originalText: ' Same ' },
  ]).map(({ idx, originalText, pronText, transText }) => [idx, originalText, pronText, transText]), [
    [2, '日本語', '니혼고', '일본어'], [3, '言語', '겐고', '언어'], [4, 'Same', null, null],
  ]);
});

test('word readings and glosses run together for the captured track and fail independently', async () => {
  const calls = [];
  const reading = Promise.withResolvers();
  const options = { trackId: 'captured-track', wanted: () => true };
  const pending = resolveShareWordDetails([{ idx: 3, originalText: '日本' }], {
    options,
    segmenter: { segmentLyrics: () => ['日本'] },
    supplements: {
      resolveSourceLanguage: () => 'ja',
      resolveReadingMode: () => 'romaji',
      isGlossModeActive: () => true,
      getWordReadings: (...args) => { calls.push(['reading', args.at(-1)]); return reading.promise; },
      getWordGlosses: async (...args) => { calls.push(['gloss', args.at(-1)]); return ['Japan']; },
    },
  });
  assert.deepEqual(calls, [['reading', options], ['gloss', options]]);
  reading.reject(new Error('Pronunciation unavailable'));
  assert.deepEqual((await pending).get(3), [{ w: '日本', reading: '', gloss: 'Japan' }]);
});

test('word export uses the captured song language and skips hidden annotations', async () => {
  const fixture = {
    Utils: { getDetectedLanguage: () => 'zh' },
    CONFIG: { visual: { 'translation-mode:japanese': 'romaji', 'translation-mode-2:japanese': 'gemini_translate' } },
  };
  createFixtureWordSupplementService(fixture);
  const api = fixture.ivLyricsWordSupplements, calls = [];
  const details = await resolveShareWordDetails([{ idx: 0, originalText: '青空' }], {
    segmenter: { segmentLyrics(text, language) { calls.push(['segment', language]); return [text]; } },
    supplements: {
      ...api,
      resolveReadingMode: () => 'romaji',
      isGlossModeActive: () => true,
      getWordReadings: async (_words, language, _mode, _text, options) => {
        calls.push(['reading', language, options.trackId]);
        return ['aozora'];
      },
      getWordGlosses: async () => { calls.push(['gloss']); return ['blue sky']; },
    },
    sourceLanguage: 'ja', showTranslation: false, options: { trackId: 'original-track' },
  });
  assert.equal(api.resolveSourceLanguage('青空', 'auto'), 'ja', 'a captured unknown language still infers without using the new song');
  assert.deepEqual(calls, [['segment', 'ja'], ['reading', 'ja', 'original-track']]);
  assert.deepEqual(details.get(0), [{ w: '青空', reading: 'aozora', gloss: '' }]);
});

test('preview, export and palette extraction share one normalized artwork load', async () => {
  const { api, calls } = loadRenderer({ cover: true });
  const url = 'https://i.scdn.co/image/share-test';
  const options = { lyrics: [{ originalText: 'Line' }], albumCover: url, template: 'cover' };
  await Promise.all([
    api.generateImage({ ...options, output: 'dataUrl', customSettings: { backgroundType: 'coverBlur' } }),
    api.generateImage({ ...options, output: 'blob', albumCover: 'spotify:image:share-test',
      customSettings: { backgroundType: 'gradient' } }),
    api.extractColors(url),
  ]);
  assert.deepEqual(calls.imageRequests, [url]);
  assert.equal(calls.paletteReads, 1);
});

test('failed artwork uses the same header spacing as a text-only cover', async () => {
  const { api, calls, canvas } = loadRenderer({ cover: 'error' });
  const options = {
    lyrics: [{ originalText: 'Line' }], albumCover: 'https://example.com/missing',
    trackName: 'Song', artistName: 'Artist', output: 'dataUrl',
  };
  await api.generateImage({ ...options, customSettings: { coverPosition: 'center', coverSize: 144 } });
  const fallbackHeight = canvas.height;
  const fallbackText = calls.text.splice(0);
  await api.generateImage({ ...options, customSettings: { showCover: false } });
  assert.equal(canvas.height, fallbackHeight);
  assert.deepEqual(calls.text, fallbackText);
  assert.deepEqual(calls.imageRequests, [options.albumCover]);
});

test('cancelled image work stops before canvas drawing and leaves shared artwork usable', async () => {
  const { api, sandbox, calls } = loadRenderer();
  const controller = new AbortController();
  let loadingImage;
  const cover = 'https://example.com/pending-share-cover.png';
  sandbox.Image = class {
    width = 300;
    height = 300;
    set src(value) { calls.imageRequests.push(value); loadingImage = this; }
  };
  const options = { albumCover: cover, output: 'dataUrl' };
  const cancelled = api.generateImage({ ...options, lyrics: [{ originalText: 'Retired' }] }, { signal: controller.signal });
  const survivor = api.generateImage({ ...options, lyrics: [{ originalText: 'Still active' }] });
  await Promise.resolve();
  assert.deepEqual(calls.imageRequests, [cover]);
  controller.abort();
  try {
    const result = await Promise.race([cancelled.then(() => 'completed', error => error.name), new Promise(setImmediate)]);
    assert.equal(result, 'AbortError');
    assert.deepEqual(calls.fillText, []);
  } finally {
    loadingImage.onload();
    await Promise.allSettled([cancelled, survivor]);
  }
  assert.ok(calls.fillText.includes('Still active'));
  assert.ok(!calls.fillText.includes('Retired'));
});

for (const detail of ['line', 'word']) {
  test(`original weight reaches the canvas in ${detail} mode and supports legacy settings`, async () => {
    for (const settings of [{ origWeight: '400' }, { origWeight: '700' }, { fontWeight: '300' }]) {
      const { api, calls } = loadRenderer();
      await api.generateImage({
        lyrics: [{ originalText: 'Hello', words: [{ w: 'Hello' }] }],
        albumCover: '', template: 'minimal',
        customSettings: { backgroundType: 'solid', lyricsDetail: detail, showCover: false,
          showTrackInfo: false, showWatermark: false, ...settings },
        output: 'dataUrl',
      });
      const rendered = calls.text.find(entry => entry.text === 'Hello');
      assert.ok(rendered, 'original lyric renders');
      assert.ok(rendered.font.startsWith((settings.origWeight || settings.fontWeight) + ' '), rendered.font);
    }
  });
}

test('share image renderer handles per-word columns', () => {
  assert.match(layoutSource, /lyricsDetail/);
  assert.match(layoutSource, /words/);
});

test('share image controls expose a line/word export-type choice', () => {
  assert.match(controlSource, /lyricsDetail/);
});

test('share modal shell is wide', () => {
  assert.match(dialogSource, /max-width: 1600px/);
});

function loadRenderer({ cover = false } = {}) {
  const calls = { fillText: [], text: [], fillStyle: [], font: [], textAlign: [], transform: null,
    imageRequests: [], paletteReads: 0 };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,stub',
    toBlob: (callback) => callback({ size: 1 }),
  };
  const ctx = {
    canvas,
    _fillStyle: '#000',
    set fillStyle(value) { this._fillStyle = value; calls.fillStyle.push(String(value)); },
    get fillStyle() { return this._fillStyle; },
    _font: '',
    set font(value) { this._font = value; calls.font.push(String(value)); },
    get font() { return this._font; },
    _textAlign: 'left',
    set textAlign(value) { this._textAlign = value; calls.textAlign.push(String(value)); },
    get textAlign() { return this._textAlign; },
    setTransform: (...args) => { calls.transform = args; },
    fillText: (text, x, y) => {
      calls.fillText.push(String(text));
      const pixelY = calls.transform ? y * calls.transform[3] + calls.transform[5] : y;
      calls.text.push({ text: String(text), x, y, font: ctx.font, pixelY });
    },
    measureText: (text) => ({ width: String(text).length * 10 }),
    fillRect: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: () => {
      calls.paletteReads++;
      return { data: new Array(50 * 50 * 4).fill(128) };
    },
  };
  const sandbox = {
    window: {},
    document: { createElement: () => canvas },
    navigator: {},
    console,
    setTimeout,
    clearTimeout,
  };
  if (cover) {
    sandbox.Image = class {
      constructor() { this.width = 300; this.height = 300; }
      set src(value) {
        calls.imageRequests.push(value);
        if (cover === 'error') this.onerror?.();
        else this.onload?.();
      }
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(shareSource, sandbox);
  return { api: sandbox.window.LyricsShareImage, calls, canvas, sandbox };
}

test('word mode draws per-word columns with reading and gloss', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{
      originalText: '日本語',
      transText: 'Japanese',
      words: [
        { w: '日本', reading: 'にほん', gloss: 'Japan' },
        { w: '語', reading: 'ご', gloss: 'language' },
      ],
    }],
    trackName: 'Song',
    artistName: 'Artist',
    albumCover: '',
    template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid' },
    width: 1080,
    output: 'dataUrl',
  });
  for (const expected of ['日本', '語', 'にほん', 'ご', 'Japan', 'language', 'Japanese']) {
    assert.ok(calls.fillText.includes(expected), `expected canvas text ${expected}`);
  }
});

test('word mode without word data falls back to line rendering', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{ originalText: 'Hello world', pronText: 'HELLO', transText: 'Hola' }],
    trackName: 'Song',
    artistName: 'Artist',
    albumCover: '',
    template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid' },
    width: 1080,
    output: 'dataUrl',
  });
  assert.ok(calls.fillText.includes('Hello world'));
  assert.ok(calls.fillText.includes('HELLO'));
});

test('export scale renders a true higher-resolution canvas', async () => {
  const first = loadRenderer();
  await first.api.generateImage({
    lyrics: [{ originalText: 'Scale me', words: [{ w: 'Scale' }, { w: 'me' }] }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid', exportScale: 1 },
    width: 1080, output: 'dataUrl',
  });
  const second = loadRenderer();
  const result = await second.api.generateImage({
    lyrics: [{ originalText: 'Scale me', words: [{ w: 'Scale' }, { w: 'me' }] }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid', exportScale: 2 },
    width: 1080, output: 'dataUrl',
  });
  assert.equal(result.canvas.width, 2160);
  assert.deepEqual(second.calls.transform, [2, 0, 0, 2, 0, 0]);
  assert.ok(result.canvas.height > first.canvas.height * 1.5);
  for (const expected of ['Scale', 'me']) {
    assert.ok(second.calls.fillText.includes(expected), `expected canvas text ${expected}`);
  }
});

test('the share dialog width reaches both preview and export encoding', async () => {
  const { api } = loadRenderer();
  const selection = {
    selectedLines: [{ originalText: 'Fit the selected width' }],
    trackInfo: { name: 'Song', artist: 'Artist' },
    template: 'minimal',
    customSettings: { imageWidth: 1440, exportScale: 2 },
  };
  for (const output of ['dataUrl', 'blob']) {
    const result = await api.generateImage(getShareImageRenderOptions(selection, output));
    assert.equal(result.canvas.width, 2880);
  }
});

test('per-type colours reach the canvas', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{ originalText: 'Coloured', pronText: 'reading', transText: 'gloss' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: {
      backgroundType: 'solid', origColor: '#ff0000', pronColor: '#00ff00', transColor: '#0000ff',
    },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(calls.fillStyle.includes('#ff0000'), 'original colour missing');
  assert.ok(calls.fillStyle.some((style) => style.includes('0, 255, 0')), 'pronunciation colour missing');
  assert.ok(calls.fillStyle.includes('#0000ff'), 'translation colour missing');
});

async function renderWordHeight(customSettings) {
  const { api, canvas } = loadRenderer();
  await api.generateImage({
    lyrics: [{
      originalText: 'Ab Cd',
      transText: 'line translation',
      words: [
        { w: 'Ab', reading: 'ab-yomi', gloss: 'ab-gloss' },
        { w: 'Cd', reading: 'cd-yomi', gloss: 'cd-gloss' },
      ],
    }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid', ...customSettings },
    width: 1080, output: 'dataUrl',
  });
  return canvas.height;
}

test('pronunciation size slider moves word-level readings', async () => {
  const base = await renderWordHeight({});
  const bigger = await renderWordHeight({ wordReadingSize: 32 });
  assert.ok(bigger > base, `expected taller canvas (${bigger} > ${base})`);
});

test('word gloss slider moves word-level character translations', async () => {
  const base = await renderWordHeight({});
  const bigger = await renderWordHeight({ wordGlossSize: 32 });
  assert.ok(bigger > base, `expected taller canvas (${bigger} > ${base})`);
});

async function renderLineHeight(customSettings) {
  const { api, canvas } = loadRenderer();
  await api.generateImage({
    lyrics: [{ originalText: 'Sized line', pronText: 'sized reading', transText: 'sized gloss' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { backgroundType: 'solid', ...customSettings },
    width: 1080, output: 'dataUrl',
  });
  return canvas.height;
}

test('first slider sizes original lyrics only', async () => {
  const small = await renderLineHeight({ fontSize: 20 });
  const big = await renderLineHeight({ fontSize: 40 });
  assert.ok(big > small, `expected taller canvas (${big} > ${small})`);
});

test('line pronunciation and translation sizes move their own lines', async () => {
  const base = await renderLineHeight({});
  const pronBigger = await renderLineHeight({ pronSize: 32 });
  const transBigger = await renderLineHeight({ transSize: 32 });
  assert.ok(pronBigger > base, `expected taller canvas (${pronBigger} > ${base})`);
  assert.ok(transBigger > base, `expected taller canvas (${transBigger} > ${base})`);
});

test('right alignment draws with right-aligned text', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{
      originalText: 'Right side',
      words: [{ w: 'Right' }, { w: 'side' }],
    }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { lyricsDetail: 'word', backgroundType: 'solid', lyricsAlign: 'right' },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(calls.textAlign.includes('right'), 'expected right text alignment');
  assert.ok(calls.fillText.includes('Right'));
});

test('font source toggle uses app setting fonts', async () => {
  const first = loadRenderer();
  first.sandbox.window.CONFIG = { visual: { 'original-font-family': 'TestFamily' } };
  await first.api.generateImage({
    lyrics: [{ originalText: 'Font check' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { backgroundType: 'solid', fontSource: 'settings' },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(first.calls.font.some((entry) => entry.includes('TestFamily')), 'expected app setting font');
  const second = loadRenderer();
  second.sandbox.window.CONFIG = { visual: { 'original-font-family': 'TestFamily' } };
  await second.api.generateImage({
    lyrics: [{ originalText: 'Font check' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { backgroundType: 'solid', fontSource: 'default' },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(!second.calls.font.some((entry) => entry.includes('TestFamily')), 'default must not use app fonts');
});

test('custom font family reaches the canvas when selected', async () => {
  const { api, calls, sandbox } = loadRenderer();
  sandbox.window.CONFIG = { visual: { 'original-font-family': 'TestFamily' } };
  await api.generateImage({
    lyrics: [{ originalText: 'Custom check' }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: { backgroundType: 'solid', fontSource: 'custom', customFontFamily: 'MyCustom' },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(calls.font.some((entry) => entry.includes('MyCustom')), 'expected custom font');
  assert.ok(!calls.font.some((entry) => entry.includes('TestFamily')), 'custom must override app fonts');
});

test('word annotations use their own colour and weight', async () => {
  const { api, calls } = loadRenderer();
  await api.generateImage({
    lyrics: [{
      originalText: 'Ab',
      words: [{ w: 'Ab', reading: 'read-me', gloss: 'gloss-me' }],
    }],
    trackName: 'Song', artistName: 'Artist', albumCover: '', template: 'minimal',
    customSettings: {
      lyricsDetail: 'word', backgroundType: 'solid',
      pronColor: '#00ff00', pronWeight: '700',
      wordReadingColor: '#ff0000', wordReadingWeight: '400',
      transColor: '#0000ff', transWeight: '700',
      wordGlossColor: '#ffff00', wordGlossWeight: '400',
    },
    width: 1080, output: 'dataUrl',
  });
  assert.ok(calls.fillStyle.some((style) => style.includes('255, 0, 0')), 'word reading must use its own colour');
  assert.ok(!calls.fillStyle.some((style) => style.includes('0, 255, 0')), 'word reading must ignore line pronunciation colour');
  assert.ok(calls.fillStyle.includes('#ffff00'), 'word gloss must use its own colour');
  assert.ok(!calls.fillStyle.includes('#0000ff'), 'word gloss must ignore line translation colour');
});
