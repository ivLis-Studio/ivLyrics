import { LRUCache } from "../core/LRUCache.mjs";
import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";
import { LYRICS_PHONETIC_PROMPT_CACHE_VERSION, normalizeIvLyricsPronunciationNotation } from "./translationPreferences.mjs";
import { getTranslationOutputFromCache, hasValidTranslationLines, isUserEditedTranslation, matchesTranslationSourceLanguage, readTranslationOutput } from "./translationCache.mjs";
import { normalizeLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";
import { createTranslationRequestRegistry } from "./translationRequestRegistry.mjs";
import { isSupersededAbort } from "../providers/ai/aiRequestCancellation.mjs";

export function createTranslator({
    LocalLanguageConverter,
    cache,
    getActiveTranslationCacheId,
    getTargetLanguage,
    getPronunciationNotation,
    getAIManager,
    getPronunciationSlots,
    getPronunciationTiming,
    getApiTracker,
    detectLyricsLanguage,
    errorMessage,
    debug,
}) {
    const requests = createTranslationRequestRegistry();
    const metadata = new LRUCache(200);
    const noProviderError = () => new Error(errorMessage(
        "translator.noProviderConfigured", "AI 제공자가 설정되지 않았습니다. 설정에서 AI 제공자를 선택해주세요."
    ));
    const currentTrackId = trackId => trackId || getActiveTranslationCacheId();

    return class Translator extends LocalLanguageConverter {
        // Legacy callers clear this on playback changes. Leaving a track does
        // not cancel work that another display may share or read on return.
        static clearInflightRequests() {}

        static clearAllInflightRequests() {
            requests.clear();
        }

        static getCacheRevision(trackId) {
            return requests.getRevision(trackId);
        }

        static clearMemoryCache(trackId) {
            if (!trackId) return;
            requests.clear(trackId);
            getPronunciationSlots()?.forget?.(trackId);
            getPronunciationTiming?.()?.clearTrack?.(trackId);
            for (const key of metadata.keys()) {
                if (key.startsWith(`${trackId}:`)) metadata.delete(key);
            }
        }

        static clearAllMemoryCache() {
            metadata.clear();
            getPronunciationSlots()?.forget?.();
            getPronunciationTiming?.()?.clearTrack?.();
        }

        static clearMetadataCache() {
            metadata.clear();
            requests.clear(null, 'metadata');
        }

        static clearCulturalAnnotationRequests(trackId) {
            requests.clear(trackId, 'cultural');
        }

        static getMetadataFromCache(trackId) {
            return metadata.get(`${trackId}:${getTargetLanguage()}`) || null;
        }

        static async translateMetadata({ trackId, title, artist, ignoreCache = false }) {
            if (!title || !artist) return null;
            const id = currentTrackId(trackId);
            if (!id) return null;
            const lang = getTargetLanguage();
            const key = `${id}:${lang}`;

            return requests.run(id, 'metadata', [lang], { refresh: ignoreCache }, async (isCurrent, signal) => {
                if (!ignoreCache) {
                    if (metadata.has(key)) return metadata.get(key);
                    let cached;
                    try {
                        cached = await cache.getMetadata(id, lang);
                    } catch (error) {
                        console.warn('[Translator] Local metadata cache check failed:', error);
                    }
                    if (!isCurrent()) return null;
                    if (cached) {
                        metadata.set(key, cached);
                        return cached;
                    }
                }

                try {
                    const result = await getAIManager()?.translateMetadata({ trackId: id, title, artist, lang, signal });
                    if (!isCurrent()) return null;
                    if (!result) return null;
                    metadata.set(key, result);
                    await cache.setMetadata(id, lang, result, isCurrent).catch(() => {});
                    return result;
                } catch (error) {
                    if (isSupersededAbort(error)) return null;
                    console.warn('[Translator] AIAddonManager metadata translation failed:', error);
                    return null;
                }
            });
        }

        static async generateCulturalAnnotations({
            trackId,
            title,
            artist,
            lines,
            sourceLang = 'auto',
            provider = null,
            schemaVersion = 4,
            ignoreCache = false,
            onProviderLoading = null,
        }) {
            const normalizedLines = (Array.isArray(lines) ? lines : []).map((line, index) => {
                const lineIndex = Number(line?.lineIndex ?? line?.index);
                return { lineIndex: Number.isInteger(lineIndex) ? lineIndex : index, text: String(line?.text ?? '') };
            });
            if (!normalizedLines.some(line => line.text.trim())) return { annotations: [], provider: null };

            const id = currentTrackId(trackId);
            if (!id) throw new Error('No track ID available');
            const manager = getAIManager();
            if (!manager) throw noProviderError();
            const targetLang = getTargetLanguage();
            const sourceHash = getTranslationSourceCacheHash(JSON.stringify({ schemaVersion, lines: normalizedLines }));
            const identity = [sourceLang, targetLang, provider || null, sourceHash];

            return requests.run(id, 'cultural', identity, { refresh: ignoreCache }, async (isCurrent, signal) => {
                if (!ignoreCache) {
                    const providerIds = provider ? [provider] : manager.getEnabledProvidersFor('culturalAnnotations').map(addon => addon.id);
                    for (const providerId of providerIds) {
                        const cached = await cache.getCulturalAnnotations(id, targetLang, sourceLang, providerId, sourceHash);
                        if (!isCurrent()) return null;
                        if (Array.isArray(cached?.annotations)) return cached;
                    }
                }

                const result = await manager.generateCulturalAnnotations({
                    trackId: id, title, artist, sourceLang, targetLang, lines: normalizedLines, provider, signal,
                    onProviderLoading: onProviderLoading ? (...args) => {
                        if (isCurrent()) onProviderLoading(...args);
                    } : null,
                });
                if (isCurrent() && Array.isArray(result?.annotations)) {
                    await cache.setCulturalAnnotations(
                        id, targetLang, sourceLang, result.provider || provider, sourceHash, result, isCurrent,
                    ).catch(() => {});
                }
                return result;
            });
        }

        static async callGemini({
            trackId,
            artist,
            title,
            text,
            wantSmartPhonetic = false,
            provider = null,
            ignoreCache = false,
            onLine = null,
            onStreamReset = null,
            pronunciationNotation = null,
            sourceLang = null,
            pronunciationSlots = false,
        }) {
            if (!text?.trim()) throw new Error("No text provided for translation");
            const id = currentTrackId(trackId);
            if (!id) throw new Error("No track ID available");

            const lang = getTargetLanguage();
            const managerAtStart = getAIManager();
            const notation = wantSmartPhonetic
                ? normalizeIvLyricsPronunciationNotation(pronunciationNotation || getPronunciationNotation())
                : null;
            const style = wantSmartPhonetic ? null : managerAtStart?.getTranslationStyle?.() || 'natural';
            const sourceTextHash = getTranslationSourceCacheHash(text);
            const sourceHash = wantSmartPhonetic
                ? `${sourceTextHash}:phonetic-prompt=${LYRICS_PHONETIC_PROMPT_CACHE_VERSION}:notation=${notation}`
                : (style === 'natural' ? sourceTextHash : `${sourceTextHash}:style=${style}`);
            const type = wantSmartPhonetic ? 'phonetic' : 'translation';
            const resolvedSourceLang = sourceLang || (() => {
                try {
                    return detectLyricsLanguage(String(text).split('\n').map(line => ({ text: line }))) || 'auto';
                } catch {
                    return 'auto';
                }
            })();
            const sourceLanguage = normalizeLyricSourceLanguage(resolvedSourceLang);
            const pronunciationContext = { sourceLang: sourceLanguage, targetLang: lang, notation };

            // The editable disk entry has one key per track, text and output
            // configuration. A different source language takes over that request.
            return requests.run(id, type, [lang, provider || null, sourceHash], {
                refresh: ignoreCache, streamUpdates: true, observer: { onLine, onStreamReset }, sourceLanguage,
            }, async (isCurrent, signal, stream) => {
                if (!ignoreCache) {
                    let cached;
                    try {
                        cached = await cache.getTranslation(id, lang, wantSmartPhonetic, provider, sourceHash);
                    } catch (error) {
                        console.warn('[Translator] Local cache check failed:', error);
                    }
                    if (!isCurrent()) return null;
                    if (matchesTranslationSourceLanguage(cached, sourceLanguage)
                        && hasValidTranslationLines(cached, text, wantSmartPhonetic)) {
                        if (wantSmartPhonetic) getPronunciationSlots()?.remember?.(id, text, cached, pronunciationContext);
                        getApiTracker()?.logCacheHit?.(type, `${id}:${lang}:${sourceHash}`, {
                            lineCount: cached.phonetic?.length || cached.translation?.length || 0,
                        });
                        const { sourceLanguage: _sourceLanguage, ...result } = cached;
                        return result;
                    }
                    if (cached) debug('[Translator] Ignoring incompatible translation cache entry');
                }

                const manager = managerAtStart || getAIManager();
                if (!manager) throw noProviderError();
                const request = {
                    trackId: id, artist, title, text, lang, provider, wantSmartPhonetic, signal,
                    pronunciationNotation: notation, translationStyle: style, sourceLang: resolvedSourceLang,
                    onLine: stream.onLine,
                    onStreamReset: stream.onStreamReset,
                };
                try {
                    const slots = getPronunciationSlots();
                    let result = wantSmartPhonetic && pronunciationSlots && slots
                        ? await slots.requestPronunciation(manager, request)
                        : await manager.translateLyrics(request);
                    const output = readTranslationOutput(result, wantSmartPhonetic);
                    if (result && output !== getTranslationOutputFromCache(result, wantSmartPhonetic)) {
                        result = { ...result, [type]: output };
                    }
                    if (isCurrent() && hasValidTranslationLines(result, text, wantSmartPhonetic)) {
                        const cachedResult = { ...result, sourceLanguage };
                        const written = await cache.setTranslation(id, lang, wantSmartPhonetic, cachedResult, provider, sourceHash, isCurrent, {
                            preserveUserEdits: !ignoreCache,
                        })
                            .catch(() => {});
                        if (written === false && !ignoreCache && isCurrent()) {
                            const edited = await cache.getTranslation(id, lang, wantSmartPhonetic, provider, sourceHash)
                                .catch(() => null);
                            if (isCurrent() && isUserEditedTranslation(edited) && hasValidTranslationLines(edited, text, wantSmartPhonetic)) {
                                result = edited;
                            }
                        }
                        if (wantSmartPhonetic && isCurrent()) slots?.remember?.(id, text, result, pronunciationContext);
                    }
                    return result || null;
                } catch (error) {
                    if (!isSupersededAbort(error)) console.warn('[Translator] AIAddonManager lyrics translation failed:', error);
                    throw error;
                }
            });
        }
    };
}
