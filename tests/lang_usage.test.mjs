import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Complements lang_completeness.test.mjs (same keys + placeholders in every
// file): catches keys the code asks for that no language file has, and
// sentences that were copied from English instead of being translated.
const repo = new URL('../', import.meta.url);
const langDirectory = new URL('langs/', repo);

function flatten(value, prefix = '', result = {}) {
    for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, result);
        else result[path] = item;
    }
    return result;
}

function loadLanguage(file) {
    const context = { window: {} };
    vm.runInNewContext(readFileSync(new URL(file, langDirectory), 'utf8'), context);
    return Object.values(context.window)[0];
}

const languageFiles = readdirSync(langDirectory).filter((name) => /^Lang.*\.js$/.test(name));
const korean = loadLanguage('LangKo.js');
const koreanKeys = new Set(Object.keys(flatten(korean)));
const namespaces = Object.keys(korean);
const sourceFiles = readdirSync(repo).filter((name) => name.endsWith('.js'));
const sources = new Map(sourceFiles.map((name) => [name, readFileSync(new URL(name, repo), 'utf8')]));

// Helpers that prepend a fixed prefix to the key they receive.
const PREFIXED_HELPERS = [
    ['Addon_AI_LocalModel.js', /\bt\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.localModel.'],
    ['Addon_AI_ChatGPT.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Pollinations.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Claude.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Gemini.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Groq.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_OpenRouter.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Paxsenix.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_AI_Perplexity.js', /\baiText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.aiProviders.'],
    ['Addon_Lyrics_Spotify.js', /\blyricsText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.lyricsProviders.'],
    ['Addon_Lyrics_LrcRed.js', /\blyricsText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.lyricsProviders.'],
    ['Addon_Lyrics_LyricsPlus.js', /\blyricsText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.lyricsProviders.'],
    ['Addon_Lyrics_OpenLyrics.js', /\blyricsText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.lyricsProviders.'],
    ['Addon_Lyrics_Unison.js', /\blyricsText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settings.lyricsProviders.'],
    ['LearningMode.js', /\bt\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'learningMode.'],
    ['Settings.js', /\b(?:get|format)SettingsPresetText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settingsAdvanced.settingsPresets.'],
    ['Settings.js', /\b(?:get|format)CloudSyncText\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'settingsAdvanced.cloudSync.'],
    ['OptionsMenu.js', /\b(?:labelText|range|checkbox|choice|color|text)\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, 'shareImage.settings.'],
];

test('every literal translation key used by the app exists in the language files', () => {
    const keyPattern = new RegExp(`["'\`]((?:${namespaces.join('|')})\\.[A-Za-z0-9_.]+?)(\\.)?["'\`]`, 'g');
    const missing = [];
    for (const [file, source] of sources) {
        source.split('\n').forEach((line, index) => {
            // Add-ons with their own bundled string tables (getAddonText) are not
            // looked up in the shared language files.
            if (line.includes('getAddonText(')) return;
            for (const match of line.matchAll(keyPattern)) {
                const [, key, trailingDot] = match;
                if (trailingDot || koreanKeys.has(key)) continue;
                // Prefixes that are completed at runtime (e.g. `${base}.label`).
                if ([...koreanKeys].some((known) => known.startsWith(`${key}.`))) continue;
                missing.push(`${file}:${index + 1} ${key}`);
            }
        });
    }
    assert.deepEqual(missing, []);
});

test('every key passed to prefixed translation helpers exists in the language files', () => {
    const missing = [];
    for (const [file, pattern, prefix] of PREFIXED_HELPERS) {
        const source = sources.get(file);
        if (!source) continue;
        for (const match of source.matchAll(pattern)) {
            const key = match[2];
            if (!koreanKeys.has(prefix + key) && !koreanKeys.has(key)) missing.push(`${file}: ${prefix}${key}`);
        }
    }
    assert.deepEqual(missing, []);
});

// Technical labels that are intentionally identical to English in some languages.
const ENGLISH_ALLOWED = new Set([
    'marketplace.directUrlLabel',
    'settingsAdvanced.livePreview.sampleTextPhonetic',
]);

test('translated languages do not keep English sentences from LangEn.js', () => {
    const english = flatten(loadLanguage('LangEn.js'));
    const copied = [];
    for (const file of languageFiles) {
        if (file === 'LangEn.js' || file === 'LangKo.js') continue;
        const values = flatten(loadLanguage(file));
        for (const [key, value] of Object.entries(values)) {
            if (ENGLISH_ALLOWED.has(key) || typeof value !== 'string' || value !== english[key]) continue;
            const words = value.trim().split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
            if (words.length >= 3) copied.push(`${file}: ${key}`);
        }
    }
    assert.deepEqual(copied, []);
});
