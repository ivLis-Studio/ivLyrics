import {
    buildPronunciationSlotPrompt,
    buildTimedPronunciationPrompt,
    isSupersededAbort,
    normalizeLyricsPronunciationNotation,
    parsePronunciationSlotRow,
    PRONUNCIATION_BATCH_LINES,
    PRONUNCIATION_BATCH_UNITS,
    runParallelBatches,
} from './pronunciationPolicy.mjs';
import { supersededAiRequest, throwIfAiRequestSuperseded } from './aiRequestCancellation.mjs';

export function buildTimedPronunciationChunks(items, { maxUnits = 420, maxItems = 24 } = {}) {
    const chunks = [];
    let current = [];
    let units = 0;
    for (const item of items) {
        const count = Array.isArray(item.u) ? item.u.length : 0;
        if (current.length > 0 && (current.length >= maxItems || units + count > maxUnits)) {
            chunks.push(current);
            current = [];
            units = 0;
        }
        current.push(item);
        units += count;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

// Send the opening line alone, then group the rest into small requests.
export function buildPronunciationBatches(items, chunkItems) {
    const list = Array.isArray(items) ? items : [];
    if (list.length <= 1) return list.length ? [list] : [];
    return [[list[0]], ...chunkItems(list.slice(1), {
        maxUnits: PRONUNCIATION_BATCH_UNITS,
        maxItems: PRONUNCIATION_BATCH_LINES
    })];
}

export function parseTimedPronunciationResult(result, chunk) {
    const rows = Array.isArray(result?.l) ? result.l : (Array.isArray(result?.lines) ? result.lines : []);
    const expected = new Map(chunk.map(item => [Number(item.i), item]));
    // A split must spell the pronunciation; only spaces may move.
    const letters = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, '');
    const parsed = new Map();
    for (const row of rows) {
        const index = Number(row?.i ?? row?.index);
        const item = expected.get(index);
        if (!item || !Array.isArray(row?.p) || row.p.length !== item.u.length) continue;
        const parts = row.p.map(part => (part === null || part === undefined ? '' : String(part)));
        if (!parts.some(part => part.trim())) continue;
        if (letters(parts.join('')) !== letters(item.r)) continue;
        parsed.set(index, parts);
    }
    return parsed;
}

// Start requesting missing items once the provider returns a usable line.
async function alignPronunciationBatches(manager, items, output, request, signal) {
    const repairBatches = (missing) => manager._buildTimedPronunciationChunks(missing, {
        maxUnits: PRONUNCIATION_BATCH_UNITS,
        maxItems: PRONUNCIATION_BATCH_LINES,
    }).map(batch => ({ batch, repair: true }));
    const deferred = [];
    const errors = await runParallelBatches(
        manager._buildPronunciationBatches(items).map(batch => ({ batch, repair: false })),
        async ({ batch, repair }) => {
            await request(batch, repair);
            if (repair) return null;
            const missing = batch.filter(item => !output.has(item.i));
            if (!missing.length) return null;
            if (!output.size) {
                deferred.push(...missing);
                return null;
            }
            return repairBatches(missing);
        },
        { signal },
    );
    if (deferred.length && output.size && !errors.some(isSupersededAbort)) {
        errors.push(...await runParallelBatches(repairBatches(deferred), ({ batch, repair }) => request(batch, repair), { signal }));
    }
    const cancelled = errors.find(isSupersededAbort);
    if (cancelled || signal?.aborted) throw cancelled || supersededAiRequest(signal.reason);
    return errors;
}

/**
 * Splits each karaoke line's pronunciation across its timed units.
 * @param {Object} manager - AI add-on manager.
 * @param {Object} params - { items: [{ i, r, u: [[text, startMs, endMs]] }], lyricsText, sourceLang }
 * @returns {Promise<Map<number, string[]>>} Unit pronunciations for the items AI aligned.
 */
export async function requestTimedPronunciation(manager, { items = [], lyricsText = '', sourceLang = 'auto', signal } = {}) {
    throwIfAiRequestSuperseded(signal);
    const safeItems = (Array.isArray(items) ? items : [])
        .filter(item => Number.isInteger(item?.i) && Array.isArray(item?.u) && item.u.length > 0 && String(item?.r ?? '').trim());
    if (safeItems.length === 0) return new Map();
    const providers = manager.getEnabledProvidersFor('characterPronunciation')
        .filter(addon => typeof addon.generateCharacterPronunciation === 'function');
    if (providers.length === 0) {
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    manager.emit('ai:request:start', {
        type: 'timedPronunciation',
        providers: providers.map(addon => addon.id),
        params: { sourceLang, itemCount: safeItems.length }
    });

    let lastError = null;
    for (const addon of providers) {
        throwIfAiRequestSuperseded(signal);
        const aligned = new Map();
        const runChunk = async (chunk) => {
            const prompt = buildTimedPronunciationPrompt({ items: chunk, lyricsText, sourceLang });
            const raw = await manager._callProvider(addon, 'generateCharacterPronunciation', {
                lines: chunk.map(item => String(item.r)),
                characterPronunciationPrompt: prompt,
                unitMode: 'char',
                sourceLang,
                ...(signal ? { signal } : {}),
            });
            for (const [index, parts] of manager._parseTimedPronunciationResult(raw, chunk)) {
                aligned.set(index, parts);
            }
        };
        try {
            const errors = await alignPronunciationBatches(manager, safeItems, aligned, runChunk, signal);
            if (aligned.size === 0) {
                throw errors[0] || new Error('Timed pronunciation response had no usable items');
            }
            manager.emit('ai:request:success', { type: 'timedPronunciation', provider: addon.id });
            return aligned;
        } catch (error) {
            throwIfAiRequestSuperseded(signal);
            if (isSupersededAbort(error)) throw error;
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for timedPronunciation:`, error?.message || error);
            lastError = error;
        }
    }
    throwIfAiRequestSuperseded(signal);
    manager.emit('ai:request:error', { type: 'timedPronunciation', error: lastError?.message || 'failed' });
    throw lastError || new Error(manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.'));
}

/**
 * Pronunciation of every sung unit of karaoke lines, streamed line by
 * line through the providers' lyric request. Lines answered with the
 * wrong fields are asked once more; the rest are left out.
 * @param {Object} manager - AI add-on manager.
 * @param {Object} params - { lines: [{ i, u: [unit text] }], lang, sourceLang, pronunciationNotation, onSlots(i, parts) }
 * @returns {Promise<Map<number, string[]>>} Unit pronunciations of the lines AI answered with the exact slots.
 */
export async function requestPronunciationSlots(manager, params = {}, debug) {
    const { signal } = params;
    throwIfAiRequestSuperseded(signal);
    const notation = normalizeLyricsPronunciationNotation(params.pronunciationNotation);
    const lines = (Array.isArray(params.lines) ? params.lines : [])
        .filter(line => Number.isInteger(line?.i) && Array.isArray(line?.u) && line.u.length > 0);
    if (lines.length === 0) return new Map();
    // Providers that follow the central lyric prompts.
    const providers = manager.getEnabledProvidersFor('pronunciation')
        .filter(addon => typeof addon.translateLyrics === 'function'
            && typeof addon.generateCharacterPronunciation === 'function');
    if (providers.length === 0) {
        throw new Error(manager._t('aiProviders.noPronunciationProviders', 'No enabled AI provider can generate pronunciation. Turn on Pronunciation for an AI provider in AI Providers settings.'));
    }

    manager.emit('ai:request:start', {
        type: 'pronunciationSlots',
        providers: providers.map(addon => addon.id),
        params: { lang: params.lang, sourceLang: params.sourceLang, lineCount: lines.length }
    });

    let lastError = null;
    for (const addon of providers) {
        throwIfAiRequestSuperseded(signal);
        const slots = new Map();
        const accept = (line, value) => {
            if (signal?.aborted) return false;
            const parts = parsePronunciationSlotRow(value, line.u.length, notation);
            if (!parts) return false;
            slots.set(line.i, parts);
            try {
                params.onSlots?.(line.i, parts);
            } catch (callbackError) {
                debug('[AIAddonManager] Pronunciation slot callback failed:', callbackError?.message);
            }
            return true;
        };
        const request = async (batch, repair) => {
            const prompt = buildPronunciationSlotPrompt({
                lines: batch.map(line => line.u),
                lang: params.lang,
                providerId: addon.id,
                pronunciationNotation: notation,
                sourceLang: params.sourceLang,
                repair
            });
            const result = await manager._callProvider(addon, 'translateLyrics', {
                text: batch.map(line => line.u.join('|')).join('\n'),
                lang: params.lang,
                wantSmartPhonetic: true,
                pronunciationNotation: notation,
                sourceLang: params.sourceLang,
                translationPrompt: null,
                phoneticPrompt: prompt,
                ...(signal ? { signal } : {}),
                onLine: (index, value) => {
                    if (Number.isInteger(index) && batch[index]) accept(batch[index], value);
                },
                onStreamReset: () => {}
            });
            const value = result?.phonetic;
            const answered = Array.isArray(value)
                ? value
                : (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').split('\n') : []);
            batch.forEach((line, index) => {
                // The finished answer decides over provisional stream lines.
                if (!accept(line, answered[index])) slots.delete(line.i);
            });
        };
        const errors = await alignPronunciationBatches(manager, lines, slots, request, signal);
        if (slots.size === 0 && errors.length > 0) {
            lastError = errors[0];
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for pronunciationSlots:`, lastError?.message || lastError);
        }
        if (slots.size > 0) {
            manager.emit('ai:request:success', { type: 'pronunciationSlots', provider: addon.id });
            return slots;
        }
        lastError = lastError || new Error('Pronunciation slot response had no usable lines');
    }
    throwIfAiRequestSuperseded(signal);
    manager.emit('ai:request:error', { type: 'pronunciationSlots', error: lastError?.message || 'failed' });
    throw lastError || new Error(manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.'));
}
