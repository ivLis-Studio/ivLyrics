import { isSupersededAbort, supersededAiRequest, throwIfAiRequestSuperseded } from './aiRequestCancellation.mjs';

export function notifyCharacterPronunciationProgress(params, progress) {
    if (typeof params?.onProgress !== 'function' || params.signal?.aborted) return;
    try {
        params.onProgress(progress);
    } catch (e) {
        console.warn('[AIAddonManager] Character pronunciation progress callback failed:', e);
    }
}

export function buildCharacterPronunciationChunks(lines, options = {}) {
    options = options || {};
    const unitMode = options.unitMode === 'word' ? 'word' : 'char';
    const sourceLines = (Array.isArray(lines) ? lines : [])
        .map(line => String(line ?? ''));
    const defaultMaxLines = unitMode === 'char' ? 4 : 16;
    const defaultMaxChars = unitMode === 'char' ? 240 : 1040;
    const defaultMaxSegmentChars = unitMode === 'char' ? 240 : 640;
    const maxChunkLines = Math.max(1, Number(options.maxLines) || defaultMaxLines);
    const maxChunkChars = Math.max(unitMode === 'char' ? 40 : 320, Number(options.maxChars) || defaultMaxChars);
    const maxSegmentChars = Math.max(unitMode === 'char' ? 40 : 160, Number(options.maxSegmentChars) || defaultMaxSegmentChars);
    const segments = [];

    sourceLines.forEach((text, sourceLineIndex) => {
        const chars = Array.from(text);
        if (chars.length <= maxSegmentChars) {
            segments.push({ sourceLineIndex, charOffset: 0, text, charCount: chars.length });
            return;
        }

        for (let offset = 0; offset < chars.length; offset += maxSegmentChars) {
            const partChars = chars.slice(offset, offset + maxSegmentChars);
            const part = partChars.join('');
            segments.push({ sourceLineIndex, charOffset: offset, text: part, charCount: partChars.length });
        }
    });

    const chunks = [];
    let current = { segments: [], charCount: 0 };
    const pushCurrent = () => {
        if (!current.segments.length) return;
        chunks.push(current);
        current = { segments: [], charCount: 0 };
    };

    segments.forEach(segment => {
        const wouldExceedLines = current.segments.length >= maxChunkLines;
        const wouldExceedChars = current.segments.length > 0 && current.charCount + segment.charCount > maxChunkChars;
        if (wouldExceedLines || wouldExceedChars) {
            pushCurrent();
        }
        current.segments.push(segment);
        current.charCount += segment.charCount;
    });
    pushCurrent();

    return chunks;
}

export function buildCharacterPronunciationRepairNote(error) {
    const details = error?.details;
    if (details && Number.isInteger(details.lineIndex)
        && Number.isInteger(details.got) && Number.isInteger(details.expected)) {
        return `Repair instruction: your previous response for chunk line ${details.lineIndex} returned ${details.got} p slots but n=${details.expected}. Recount the a array for that line (including spaces and punctuation, each with its own slot using "" where it has no sound) and return exactly ${details.expected} strings for it. Keep all other lines unchanged.`;
    }
    return `Repair instruction: your previous response had a slot-count mismatch. Recount each line's a array (including spaces and punctuation, each with its own slot using "" where it has no sound) and return exactly n strings per line.`;
}

export async function generateCharacterPronunciationChunk(manager, debug, addon, params, chunk) {
    try {
        const chunkLines = chunk.segments.map(segment => segment.text);
        const {
            onProgress,
            _characterPronunciationProgress,
            _characterPronunciationRepairNote,
            chunking,
            characterPronunciationChunking,
            characterPronunciationUnitMode,
            unitMode,
            ...providerParams
        } = params || {};
        const basePrompt = manager.buildCharacterPronunciationPrompt({
            ...providerParams,
            lines: chunkLines,
            unitMode: unitMode || characterPronunciationUnitMode || 'char',
            providerId: addon.id
        });
        const result = await manager._callProvider(addon, 'generateCharacterPronunciation', {
            ...providerParams,
            unitMode: unitMode || characterPronunciationUnitMode || 'char',
            lines: chunkLines,
            characterPronunciationPrompt: _characterPronunciationRepairNote
                ? `${basePrompt}\n\n${_characterPronunciationRepairNote}`
                : basePrompt
        });
        const normalized = manager._normalizeCharacterPronunciationResult(result, chunkLines, {
            unitMode: unitMode || characterPronunciationUnitMode || 'char'
        });
        if (Array.isArray(normalized?.warnings) && normalized.warnings.length > 0) {
            debug(`[AIAddonManager] Character pronunciation auto-repaired ${normalized.warnings.length} line(s): ${normalized.warnings.map(warning => `line ${warning.lineIndex} (${warning.strategy || warning.reason})`).join(', ')}`);
        }
        manager._validateCharacterPronunciationWritingSystem(normalized, {
            lang: providerParams.lang
        });
        return normalized.lines.map((line, index) => ({
            segment: chunk.segments[index],
            line
        }));
    } catch (error) {
        if (params?.signal?.aborted || isSupersededAbort(error)) throw supersededAiRequest(params?.signal?.reason ?? error);
        if (!manager._isCharacterPronunciationRetryableError(error)) {
            throw error;
        }

        const isFormatError = manager._isCharacterPronunciationFormatError(error);
        const details = error?.details && Number.isInteger(error.details.lineIndex)
            ? error.details
            : null;
        manager._notifyCharacterPronunciationProgress(params, {
            ...(params?._characterPronunciationProgress || {}),
            phase: 'retry-split',
            retry: true,
            reason: isFormatError ? 'format' : 'truncation',
            error: error?.message || String(error),
            lineIndex: details?.lineIndex ?? null,
            got: details?.got ?? null,
            expected: details?.expected ?? null,
            preview: details?.preview ?? null,
            percent: Math.max(1, Number(params?._characterPronunciationProgress?.percent) || 0)
        });

        if (isFormatError && !chunk._repairTried && chunk.segments.length <= 4) {
            chunk._repairTried = true;
            return await manager._generateCharacterPronunciationChunk(addon, {
                ...params,
                _characterPronunciationRepairNote: manager._buildCharacterPronunciationRepairNote(error)
            }, chunk);
        }
        if (chunk.segments.length > 1) {
            const mid = Math.ceil(chunk.segments.length / 2);
            const left = {
                segments: chunk.segments.slice(0, mid),
                charCount: chunk.segments.slice(0, mid).reduce((sum, segment) => sum + segment.charCount, 0)
            };
            const right = {
                segments: chunk.segments.slice(mid),
                charCount: chunk.segments.slice(mid).reduce((sum, segment) => sum + segment.charCount, 0)
            };
            const leftResult = await manager._generateCharacterPronunciationChunk(addon, params, left);
            const rightResult = await manager._generateCharacterPronunciationChunk(addon, params, right);
            return [...leftResult, ...rightResult];
        }

        const [segment] = chunk.segments;
        const chars = Array.from(segment?.text || '');
        const splitThreshold = manager._isCharacterPronunciationFormatError(error) ? 40 : 160;
        if (chars.length > splitThreshold) {
            const mid = Math.ceil(chars.length / 2);
            const leftSegment = {
                sourceLineIndex: segment.sourceLineIndex,
                charOffset: segment.charOffset,
                text: chars.slice(0, mid).join(''),
                charCount: mid
            };
            const rightText = chars.slice(mid).join('');
            const rightSegment = {
                sourceLineIndex: segment.sourceLineIndex,
                charOffset: segment.charOffset + mid,
                text: rightText,
                charCount: Array.from(rightText).length
            };
            const leftResult = await manager._generateCharacterPronunciationChunk(addon, params, { segments: [leftSegment], charCount: leftSegment.charCount });
            const rightResult = await manager._generateCharacterPronunciationChunk(addon, params, { segments: [rightSegment], charCount: rightSegment.charCount });
            return [...leftResult, ...rightResult];
        }

        throw error;
    }
}

export function mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode) {
    chunkResult.forEach(({ segment, line }) => {
        if (!segment || !line || !Array.isArray(line.chars)) return;
        const targetLine = mergedLines[segment.sourceLineIndex];
        if (!targetLine) return;

        if (unitMode === 'word' && Array.isArray(line.units)) {
            line.units.forEach(unit => {
                const pronunciation = typeof unit?.pronunciation === 'string' ? unit.pronunciation.trim() : '';
                if (!pronunciation) return;

                const start = segment.charOffset + Number(unit.start);
                const end = segment.charOffset + Number(unit.end);
                if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= targetLine.chars.length) return;

                const existingUnit = targetLine.units.find(item => item.start === start && item.end === end);
                if (existingUnit) {
                    existingUnit.pronunciation = pronunciation;
                } else {
                    targetLine.units.push({
                        start,
                        end,
                        text: targetLine.chars.slice(start, end + 1).map(item => item.char).join(''),
                        pronunciation
                    });
                }
            });
            return;
        }

        line.chars.forEach(item => {
            if (!item?.pronunciation) return;
            const itemIndex = Number(item.i ?? 0);
            if (!Number.isInteger(itemIndex)) return;
            const targetIndex = segment.charOffset + itemIndex;
            if (targetIndex < 0 || targetIndex >= targetLine.chars.length) return;
            targetLine.chars[targetIndex].pronunciation = item.pronunciation;
        });
    });
}

export async function generateCharacterPronunciationChunks(manager, debug, addon, params, chunks, unitMode, mergedLines, progressContext = {}) {
    const total = chunks.length;
    const concurrency = Math.min(
        Math.max(1, total || 1),
        Math.max(1, Math.min(6, Number(progressContext.concurrency) || 3))
    );
    let nextChunkIndex = 0;
    let completedChunks = 0;
    let fatalChunkError = null;

    const createProgressBase = (chunkIndex) => ({
        provider: progressContext.provider,
        providerIndex: progressContext.providerIndex,
        providerTotal: progressContext.providerTotal,
        total,
        current: total > 0 ? Math.max(1, Math.min(total, completedChunks + 1)) : 0,
        completed: completedChunks,
        remaining: Math.max(0, total - completedChunks),
        percent: total > 0 ? Math.round((completedChunks / total) * 100) : 0,
        concurrency,
        chunkIndex: chunkIndex + 1
    });

    const runChunkWorker = async () => {
        while (!fatalChunkError) {
            const chunkIndex = nextChunkIndex++;
            if (chunkIndex >= total) {
                return;
            }

            debug(`[AIAddonManager] Character pronunciation chunk ${chunkIndex + 1}/${total} via ${addon.id}`);
            const progressBase = createProgressBase(chunkIndex);
            manager._notifyCharacterPronunciationProgress(params, {
                ...progressBase,
                phase: 'chunk-start',
                percent: total > 0 ? Math.max(1, progressBase.percent) : progressBase.percent
            });

            try {
                const chunkResult = await manager._generateCharacterPronunciationChunk(addon, {
                    ...params,
                    unitMode,
                    _characterPronunciationProgress: progressBase
                }, chunks[chunkIndex]);
                manager._mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode);
                completedChunks++;
                manager._notifyCharacterPronunciationProgress(params, {
                    ...createProgressBase(chunkIndex),
                    phase: 'chunk-complete',
                    current: completedChunks,
                    completed: completedChunks,
                    remaining: Math.max(0, total - completedChunks),
                    percent: total > 0 ? Math.round((completedChunks / total) * 100) : 100
                });
            } catch (error) {
                manager._notifyCharacterPronunciationProgress(params, {
                    ...createProgressBase(chunkIndex),
                    phase: 'chunk-error',
                    error: error?.message || String(error),
                    percent: total > 0 ? Math.max(1, Math.round((completedChunks / total) * 100)) : 0
                });
                if (isSupersededAbort(error) || !fatalChunkError) fatalChunkError = error;
                return;
            }
        }
    };

    const workers = Array.from(
        { length: Math.min(concurrency, total) },
        () => runChunkWorker()
    );
    await Promise.all(workers);
    if (fatalChunkError) {
        throw fatalChunkError;
    }
}

export async function generateCharacterPronunciation(manager, debug, params) {
    const signal = params?.signal;
    throwIfAiRequestSuperseded(signal);
    const providers = manager.getEnabledProvidersFor('characterPronunciation');

    if (providers.length === 0) {
        console.warn('[AIAddonManager] No character pronunciation providers enabled');
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    const {
        onProgress,
        _characterPronunciationProgress,
        ...eventParams
    } = params || {};

    manager.emit('ai:request:start', {
        type: 'characterPronunciation',
        providers: providers.map(p => p.id),
        params: { ...eventParams, lines: '[...]' }
    });

    let lastError = null;
    let truncationError = null;
    const sourceLines = (Array.isArray(params?.lines) ? params.lines : [])
        .map(line => String(line ?? ''));
    const unitMode = manager._getCharacterPronunciationUnitMode(params, sourceLines);
    const chunkingOptions = params?.chunking || params?.characterPronunciationChunking || {};
    const effectiveChunkingOptions = { ...chunkingOptions, unitMode };
    const chunks = manager._buildCharacterPronunciationChunks(sourceLines, effectiveChunkingOptions);
    const defaultChunkConcurrency = unitMode === 'char' ? 4 : 3;
    const chunkConcurrency = Math.min(
        Math.max(1, chunks.length || 1),
        Math.max(1, Math.min(6, Number(chunkingOptions.concurrency) || defaultChunkConcurrency))
    );

    manager._notifyCharacterPronunciationProgress(params, {
        phase: 'prepared',
        providerTotal: providers.length,
        total: chunks.length,
        current: 0,
        completed: 0,
        remaining: chunks.length,
        percent: 0
    });

    for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
        throwIfAiRequestSuperseded(signal);
        const addon = providers[providerIndex];
        if (typeof addon.generateCharacterPronunciation !== 'function') continue;

        try {
            debug(`[AIAddonManager] Trying character pronunciation provider: ${addon.id}`);
            debug(`[AIAddonManager] Character pronunciation chunks: ${chunks.length}, concurrency: ${chunkConcurrency}`);
            manager._notifyCharacterPronunciationProgress(params, {
                phase: 'provider-start',
                provider: addon.id,
                providerIndex: providerIndex + 1,
                providerTotal: providers.length,
                total: chunks.length,
                current: 0,
                completed: 0,
                remaining: chunks.length,
                percent: 0
            });

            throwIfAiRequestSuperseded(signal);
            const mergedLines = sourceLines.map((text, lineIndex) => ({
                index: lineIndex,
                unitMode,
                units: unitMode === 'word'
                    ? manager._buildWordPronunciationUnits(text)
                    : [],
                chars: Array.from(text).map((char, charIndex) => ({
                    i: charIndex,
                    char,
                    pronunciation: ''
                }))
            }));

            await manager._generateCharacterPronunciationChunks(addon, params, chunks, unitMode, mergedLines, {
                provider: addon.id,
                providerIndex: providerIndex + 1,
                providerTotal: providers.length,
                concurrency: chunkConcurrency
            });

            manager._notifyCharacterPronunciationProgress(params, {
                phase: 'complete',
                provider: addon.id,
                providerIndex: providerIndex + 1,
                providerTotal: providers.length,
                total: chunks.length,
                current: chunks.length,
                completed: chunks.length,
                remaining: 0,
                percent: 100
            });
            throwIfAiRequestSuperseded(signal);
            manager.emit('ai:request:success', { type: 'characterPronunciation', provider: addon.id });
            return { lines: mergedLines, provider: addon.id };
        } catch (e) {
            throwIfAiRequestSuperseded(signal);
            if (isSupersededAbort(e)) throw e;
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for generateCharacterPronunciation:`, e.message);
            manager._notifyCharacterPronunciationProgress(params, {
                phase: 'provider-error',
                provider: addon.id,
                providerIndex: providerIndex + 1,
                providerTotal: providers.length,
                total: chunks.length,
                error: e?.message || String(e)
            });
            lastError = e;
            if (!truncationError && manager._isCharacterPronunciationTruncationError(e)) {
                truncationError = e;
            }
            continue;
        }
    }

    throwIfAiRequestSuperseded(signal);
    const errorMsg = truncationError?.message || lastError?.message || manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
    manager.emit('ai:request:error', { type: 'characterPronunciation', error: errorMsg });
    throw new Error(errorMsg);
}
