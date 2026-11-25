import { getTranslationLanguageInfo } from "./promptLanguages.mjs";
import { isChinesePronunciationTask, stripWordListPrefix } from "./pronunciationPolicy.mjs";

const normalizeWords = words => Array.isArray(words) ? words.map(word => String(word ?? '')) : [];

export function buildWordGlossPrompt({ words = [], lineText = '', targetLang = 'en', sourceLang = 'auto' } = {}) {
    const safeWords = normalizeWords(words);
    const wordCount = safeWords.length;
    const langInfo = getTranslationLanguageInfo(targetLang);
    // Line-based transport (provider line parsers require one output
    // line per input line), kept terse: bare words, short keys style.
    const systemPrompt = `Gloss lyric words for learners in ${langInfo.name} (${langInfo.native}). Output one line per input word as "word: gloss" — copy the word exactly, then a colon, then the gloss. Exactly ${wordCount} lines, same order. One word per gloss; add a second word only when one word cannot carry the meaning. No periods, commas, or other punctuation — except [role] markers like [topic] for particles/function words. Never merge, split, reorder, or explain.`;

    const userPrompt = `Sense context (do not gloss these lines):
${String(lineText ?? '')}
Gloss these ${wordCount} words, one per line as "word: gloss", nothing else:
${safeWords.join('\n')}`;

    return { systemPrompt, userPrompt, wordCount };
}

export function buildWordPronunciationPrompt({ words = [], lineText = '', targetLang = 'en', sourceLang = 'auto', notation = 'latin' } = {}) {
    const safeWords = normalizeWords(words);
    const wordCount = safeWords.length;
    const langInfo = getTranslationLanguageInfo(targetLang);
    const normalizedNotation = String(notation || 'latin').trim().toLowerCase() === 'ipa' ? 'ipa' : 'latin';
    const scriptName = normalizedNotation === 'ipa' ? 'broad IPA transcription' : `romanization for ${langInfo.name} speakers`;
    const chineseToneRule = isChinesePronunciationTask(sourceLang, `${lineText} ${safeWords.join(' ')}`)
        ? (normalizedNotation === 'ipa'
            ? ' Mandarin is tonal: mark the tone of every syllable.'
            : ' Chinese lyrics: write each reading as Hanyu Pinyin with tone marks (nǐ hǎo); leave the neutral tone unmarked.')
        : '';
    const systemPrompt = `Convert each lyric word's sung sound into ${scriptName}. Output one line per input word as "word: pronunciation" — copy the word exactly, then a colon, then the pronunciation. Exactly ${wordCount} lines, same order. PRONUNCIATION only, never meaning. ${scriptName} for every sound. Never merge, split, reorder, or explain.${chineseToneRule}`;

    const userPrompt = `Sense context (do not convert these lines):
${String(lineText ?? '')}
Convert these ${wordCount} words into ${scriptName}, one per line as "word: pronunciation", nothing else:
${safeWords.join('\n')}`;

    return { systemPrompt, userPrompt, wordCount };
}

export async function requestWordSupplement(manager, options, type) {
    const { words, lineText = '', targetLang = 'en', sourceLang = 'auto', notation = 'latin' } = options;
    const isPronunciation = type === 'wordPronunciation';
    const safeWords = normalizeWords(words);
    if (safeWords.length === 0) return [];
    const enabledProviders = manager.getEnabledProvidersFor('wordSupplements');
    const providers = isPronunciation
        ? enabledProviders.filter(addon => addon.supports?.pronunciation !== false)
        : enabledProviders;
    if (providers.length === 0) {
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    const text = safeWords.join('\n');
    const promptParams = { words: safeWords, lineText, targetLang, sourceLang };
    const prompt = isPronunciation
        ? manager.buildWordPronunciationPrompt({ ...promptParams, notation })
        : manager.buildWordGlossPrompt(promptParams);
    manager.emit('ai:request:start', {
        type,
        providers: providers.map(provider => provider.id),
        params: { targetLang, sourceLang, ...(isPronunciation ? { notation } : {}), wordCount: safeWords.length },
    });

    let lastError = null;
    for (const addon of providers) {
        if (typeof addon.translateLyrics !== 'function') continue;
        try {
            const raw = await manager._callProvider(addon, 'translateLyrics', {
                text,
                lang: targetLang,
                wantSmartPhonetic: isPronunciation,
                translationPrompt: isPronunciation ? null : prompt,
                phoneticPrompt: isPronunciation ? prompt : null,
                ...(isPronunciation ? { pronunciationNotation: notation } : {}),
                sourceLang,
                onLine: null,
                onStreamReset: null,
                endpointCapability: 'wordSupplements',
            });
            const value = isPronunciation ? raw?.phonetic : raw?.translation ?? raw?.vi;
            const lines = Array.isArray(value)
                ? value.map(line => String(line ?? ''))
                : String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
            if (lines.length !== safeWords.length) {
                const output = isPronunciation ? 'pronunciations' : 'glosses';
                throw new Error(`[AIAddonManager] Provider ${addon.id} returned ${lines.length} ${output}; expected ${safeWords.length}`);
            }
            manager.emit('ai:request:success', { type, provider: addon.id });
            return lines.map((line, index) => stripWordListPrefix(line, safeWords[index]).trim());
        } catch (error) {
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for ${type}:`, error?.message || error);
            lastError = error;
        }
    }

    manager.emit('ai:request:error', { type, error: lastError?.message || 'failed' });
    throw lastError || new Error(manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.'));
}
