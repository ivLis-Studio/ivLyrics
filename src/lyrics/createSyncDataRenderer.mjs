import { normalizeStandaloneParentheticalLines } from "../features/sync/syncParentheticalText.mjs";
import {
    findSyncDataLineShapePrefix,
    getSyncDataLeadingCharOffset,
    shiftSyncDataLineIndexes,
    fingerprintSyncDataLyricsText,
} from "../features/sync/syncLyricSourceShape.mjs";
import { SyncDataSourceCompatibility } from "./syncDataSourceCompatibility.mjs";
import { buildLrclibSyncDataParallelParts } from "./syncLrclibVocalGroups.mjs";
import { normalizeSyncDataParallelParentheticalRanges } from "./syncRenderVocalRanges.mjs";
import { normalizeSyncDataInlineStyleRanges, findSyncDataInlineStyleRange } from "./syncRenderInlineStyle.mjs";
import {
    getSyncDataMilliseconds,
    normalizeSyncDataGranularity,
    expandSyncDataCompactLines,
    getSyncDataBaseLyricsTimingRows,
    normalizeSyncDataTimestampSequence,
    SYNC_DATA_DURATION_FRONT_OFFSET_RATIO,
    getSyncDataDurationOffsetMs,
    applySyncDataDurationOffsetToLines,
} from "./syncRenderTiming.mjs";

const getSyncDataBaseLyricsLines = (lyrics, removeStandaloneParentheticalWrappers) => {
    const sourceLines = (Array.isArray(lyrics) ? lyrics : [])
        .map(line => (line?.text || '').normalize('NFC').trim())
        .filter(line => line.trim().length > 0);

    if (!removeStandaloneParentheticalWrappers) {
        return sourceLines;
    }

    return normalizeStandaloneParentheticalLines(sourceLines.join('\n'))
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.trim().length > 0);
};

const getSyncDataLineCharCounts = (lines) => (
    (Array.isArray(lines) ? lines : [])
        .map(line => Array.from(String(line || '').normalize('NFC')).length)
);

/**
 * sync-data에서 일반 싱크 가사 생성 (karaoke -> synced 변환)
 * @param {Array} karaoke - karaoke 형식 가사
 * @returns {Array} - synced 형식 가사
 */
function convertKaraokeToSynced(karaoke) {
    if (!karaoke || !Array.isArray(karaoke)) return null;

    return karaoke.map(line => ({
        startTime: line.startTime,
        text: line.text,
        speaker: line.speaker,
        'speaker-color': line['speaker-color'],
        'speaker-fallback': line['speaker-fallback'],
        kind: line.kind
    }));
}

export function createSyncDataRenderer({ getCodec, getPlayer = () => undefined, debug } = {}) {
    /**
     * Applies community sync-data to base lyrics and produces karaoke lyrics.
     * sync-data v2 uses offsets from lyrics after standalone parenthetical vocal markers are removed.
     * sync-data v3 also strips standalone parenthetical wrappers from parallel vocal part ranges.
     */
    function applySyncDataToLyrics(lyrics, syncData, options = {}) {
        if (syncData?.syncData?.version === 6) {
            try { syncData = { ...syncData, syncData: getCodec().decode(syncData.syncData) }; }
            catch (error) { console.warn('[ivLyrics] Invalid sync data:', error); return null; }
        }
        if (!lyrics || !syncData || !syncData.syncData || !syncData.syncData.lines) {
            return null;
        }

        const resolveNormalizedSyncLines = () => {
            const syncBody = syncData.syncData;
            const syncLines = expandSyncDataCompactLines(syncBody.lines);
            const syncSource = syncBody.source || syncData.source || null;
            const hasNormalizedSourceLineShape = Array.isArray(syncSource?.lineCharCounts)
                && syncSource.lineCharCounts.length > 0;
            const shouldNormalizeParentheticalLines =
                Number(syncBody.version ?? syncData.version ?? 1) >= 2
                || hasNormalizedSourceLineShape;
            const baseLyricsLines = getSyncDataBaseLyricsLines(lyrics, shouldNormalizeParentheticalLines);
            const baseLyricsTimingRows = getSyncDataBaseLyricsTimingRows(lyrics);
            const baseLyricsText = baseLyricsLines.join('\n');
            let normalizedSyncLines = syncLines;
            let sourceLinePrefix = 0;
            let hasExactSourceLineShape = false;
            const sourceLineCharCounts = hasNormalizedSourceLineShape ? syncSource.lineCharCounts : null;
            const currentProvider = syncData.provider || options?.result?.provider || options?.provider || syncSource?.provider;
            if (!sourceLineCharCounts && String(currentProvider || '').toLowerCase() === 'lrclib'
                && !SyncDataSourceCompatibility.hasCompatibleLegacyLineRanges(syncLines, getSyncDataLineCharCounts(baseLyricsLines))) {
                debug?.('[SyncDataService] Legacy LRCLIB sync ranges do not match the current source rows; skipping karaoke render');
                return null;
            }
            if (sourceLineCharCounts) {
                const baseLineCharCounts = getSyncDataLineCharCounts(baseLyricsLines);
                sourceLinePrefix = findSyncDataLineShapePrefix(sourceLineCharCounts, baseLineCharCounts);
                hasExactSourceLineShape = sourceLinePrefix === 0;
                if (sourceLinePrefix < 0) {
                    debug?.('[SyncDataService] Sync-data source line shape mismatch; skipping karaoke render', {
                        expectedLineCount: sourceLineCharCounts.length,
                        actualLineCount: baseLineCharCounts.length,
                        expectedPreview: sourceLineCharCounts.slice(0, 12),
                        actualPreview: baseLineCharCounts.slice(0, 12),
                        provider: syncData.provider,
                        sourceProvider: syncSource?.provider,
                        lrclibId: syncSource?.lrclibId
                    });
                    return null;
                }
                if (sourceLinePrefix > 0) {
                    const sourceCharOffset = getSyncDataLeadingCharOffset(sourceLineCharCounts, sourceLinePrefix);
                    normalizedSyncLines = shiftSyncDataLineIndexes(syncLines, sourceCharOffset);
                    debug?.('[SyncDataService] Trimmed leading sync-data source lines', {
                        prefixLineCount: sourceLinePrefix,
                        sourceCharOffset,
                        provider: syncData.provider,
                        sourceProvider: syncSource?.provider,
                        lrclibId: syncSource?.lrclibId
                    });
                }
            }
            if (sourceLinePrefix === 0 && syncSource?.lyricsFingerprint) {
                const baseLyricsFingerprint = fingerprintSyncDataLyricsText(baseLyricsText.normalize('NFC'));
                if (syncSource.lyricsFingerprint !== baseLyricsFingerprint) {
                    const currentLrclibId = options?.currentLrclibId
                        ?? options?.result?.lrclibId
                        ?? null;
                    const canApplyLrclibFingerprintFallback = SyncDataSourceCompatibility
                        .canApplyLrclibFingerprintFallback({
                            syncSource,
                            currentProvider: options?.result?.provider ?? options?.provider,
                            currentLrclibId,
                            hasExactLineShape: hasExactSourceLineShape
                        });
                    if (canApplyLrclibFingerprintFallback) {
                        debug?.('[SyncDataService] LRCLIB lyrics fingerprint changed with the same source ID and exact line shape; applying sync-data compatibility fallback', {
                            expected: syncSource.lyricsFingerprint,
                            actual: baseLyricsFingerprint,
                            provider: syncData.provider,
                            sourceProvider: syncSource?.provider,
                            lrclibId: syncSource?.lrclibId
                        });
                    } else {
                        debug?.('[SyncDataService] Sync-data source fingerprint mismatch; skipping karaoke render', {
                            expected: syncSource.lyricsFingerprint,
                            actual: baseLyricsFingerprint,
                            provider: syncData.provider,
                            sourceProvider: syncSource?.provider,
                            lrclibId: syncSource?.lrclibId
                        });
                        return null;
                    }
                }
            }
            const durationAdjustment = getSyncDataDurationOffsetMs(syncData, syncBody, options, getPlayer());
            if (durationAdjustment.offsetMs) {
                normalizedSyncLines = applySyncDataDurationOffsetToLines(normalizedSyncLines, durationAdjustment.offsetMs);
                debug?.('[SyncDataService] Applied duration mismatch offset to sync-data', {
                    provider: syncData.provider,
                    isrc: syncData.isrc || null,
                    registeredDurationMs: durationAdjustment.registeredDurationMs,
                    currentDurationMs: durationAdjustment.currentDurationMs,
                    diffMs: durationAdjustment.diffMs,
                    frontOffsetMs: durationAdjustment.offsetMs,
                    rearRemainderMs: durationAdjustment.diffMs - durationAdjustment.offsetMs,
                    frontRatio: SYNC_DATA_DURATION_FRONT_OFFSET_RATIO
                });
            }
            return { syncSource, baseLyricsLines, baseLyricsTimingRows, normalizedSyncLines };
        };
        const syncLineNormalization = resolveNormalizedSyncLines();
        if (!syncLineNormalization) return null;
        const { syncSource, baseLyricsLines, baseLyricsTimingRows } = syncLineNormalization;
        let normalizedSyncLines = syncLineNormalization.normalizedSyncLines;

        // 전체 가사 텍스트를 하나로 합침 (줄바꿈 없이 - SyncDataCreator와 동일하게)
        // SyncDataCreator에서는 각 줄의 글자 수만 계산하고 줄바꿈은 포함하지 않음
        // 중요 1: SyncDataCreator는 Array.from()으로 유니코드 코드 포인트 기준 인덱스를 사용하므로
        // 여기서도 동일하게 Array.from()을 사용해야 특수문자(서로게이트 페어, 결합 문자 등)가 포함된 경우에도 정확한 인덱싱이 가능함
        // 중요 2: SyncDataCreator에서는 filter(t => t.trim().length > 0)로 빈 줄/공백 줄을 제외하므로
        // 여기서도 동일하게 필터링해야 인덱스가 맞음
        // 중요 3: NFD(결합 문자) vs NFC(합성 문자) 정규화 차이로 인한 인덱스 불일치 방지
        // 예: "é"가 NFD에서는 "e" + 결합 액센트로 2개 코드포인트, NFC에서는 1개 코드포인트
        // SyncDataCreator와 동일하게 NFC로 정규화해야 함
        const fullTextChars = baseLyricsLines
            .map(line => Array.from(line))
            .flat();
        normalizedSyncLines = normalizeSyncDataParallelParentheticalRanges(normalizedSyncLines, fullTextChars);

        const result = [];
        const timingRepairStats = {
            repairedSequences: 0,
            lineFallbacks: 0,
            duplicateCount: 0,
            unresolvedDuplicateCount: 0,
            longestCluster: 1
        };
        const recordTimingRepair = (repair) => {
            if (!repair || repair.duplicateCount <= 0) return;
            timingRepairStats.duplicateCount += repair.duplicateCount;
            timingRepairStats.unresolvedDuplicateCount += repair.unresolvedDuplicateCount;
            timingRepairStats.longestCluster = Math.max(
                timingRepairStats.longestCluster,
                repair.longestCluster || 1
            );
            if (repair.changed) timingRepairStats.repairedSequences++;
            if (repair.usedLineFallback) timingRepairStats.lineFallbacks++;
        };
        const getSyncDataSyllableStyleKey = (syllable) => [
            syllable?.inlineStyle === true ? '1' : '0',
            String(syllable?.styleKind || ''),
            String(syllable?.styleSpeaker || ''),
            String(syllable?.styleSpeakerColor || ''),
            String(syllable?.styleSpeakerFallback || '')
        ].join('|');
        const collapseSyncDataSyllables = (sourceSyllables, granularity, endTime) => {
            const syllables = Array.isArray(sourceSyllables) ? sourceSyllables : [];
            const normalizedGranularity = normalizeSyncDataGranularity(granularity);
            if (normalizedGranularity === 'character' || syllables.length === 0) return syllables;

            const grouped = [];
            for (const syllable of syllables) {
                const previous = grouped[grouped.length - 1];
                const sameTimingUnit = normalizedGranularity === 'line'
                    || previous?.startTime === syllable.startTime;
                if (previous
                    && sameTimingUnit
                    && getSyncDataSyllableStyleKey(previous) === getSyncDataSyllableStyleKey(syllable)) {
                    previous.text += syllable.text || '';
                    continue;
                }
                const segmentStartTime = normalizedGranularity === 'line'
                    ? syllables[0].startTime
                    : syllable.startTime;
                grouped.push({
                    text: syllable.text || '',
                    startTime: segmentStartTime,
                    endTime: syllable.endTime
                });
                if (syllable.inlineStyle === true) grouped[grouped.length - 1].inlineStyle = true;
                if (syllable.styleKind) grouped[grouped.length - 1].styleKind = syllable.styleKind;
                if (syllable.styleSpeaker) grouped[grouped.length - 1].styleSpeaker = syllable.styleSpeaker;
                if (syllable.styleSpeakerColor) grouped[grouped.length - 1].styleSpeakerColor = syllable.styleSpeakerColor;
                if (syllable.styleSpeakerFallback) grouped[grouped.length - 1].styleSpeakerFallback = syllable.styleSpeakerFallback;
            }
            for (let index = 0; index < grouped.length; index++) {
                const nextStart = grouped[index + 1]?.startTime;
                grouped[index].endTime = normalizedGranularity !== 'line' && Number.isFinite(nextStart)
                    ? Math.max(grouped[index].startTime, nextStart)
                    : Math.max(grouped[index].startTime, Number(endTime) || grouped[index].endTime);
            }
            return grouped;
        };
        const computeLineTimingPlan = () => {
            const rawLineCharTimes = normalizedSyncLines.map(line => (
                line.chars.map(getSyncDataMilliseconds)
            ));
            let baseCharOffset = 0;
            const baseLineCharSpans = baseLyricsLines.map((line, index) => {
                const start = baseCharOffset;
                const charCount = Array.from(line).length;
                baseCharOffset += charCount;
                return { index, start, end: baseCharOffset - 1 };
            });
            const providerLineBounds = normalizedSyncLines.map((line) => {
                const rangeStart = Number(line?.start);
                const rangeEnd = Number(line?.end);
                const firstSpan = baseLineCharSpans.find(span => (
                    Number.isFinite(rangeStart) && rangeStart >= span.start && rangeStart <= span.end
                ));
                const lastSpan = [...baseLineCharSpans].reverse().find(span => (
                    Number.isFinite(rangeEnd) && rangeEnd >= span.start && rangeEnd <= span.end
                )) || firstSpan;
                const firstTimingRow = firstSpan ? baseLyricsTimingRows[firstSpan.index] : null;
                const lastTimingRow = lastSpan ? baseLyricsTimingRows[lastSpan.index] : firstTimingRow;
                const nextTimingRow = lastSpan ? baseLyricsTimingRows[lastSpan.index + 1] : null;
                const fallbackStartTime = Number.isFinite(firstTimingRow?.startTime)
                    ? firstTimingRow.startTime
                    : null;
                const fallbackEndTime = Number.isFinite(nextTimingRow?.startTime)
                    && Number.isFinite(fallbackStartTime)
                    && nextTimingRow.startTime > fallbackStartTime
                    ? nextTimingRow.startTime
                    : (Number.isFinite(lastTimingRow?.endTime)
                        && Number.isFinite(fallbackStartTime)
                        && lastTimingRow.endTime > fallbackStartTime
                        ? lastTimingRow.endTime
                        : null);
                return { fallbackStartTime, fallbackEndTime };
            });
            const fallbackCandidates = rawLineCharTimes.map((times, index) => {
                const line = normalizedSyncLines[index];
                if (normalizeSyncDataGranularity(line?.granularity) !== 'character') return null;
                const { fallbackStartTime, fallbackEndTime } = providerLineBounds[index];
                if (!times.length
                    || !Number.isFinite(fallbackStartTime)
                    || !Number.isFinite(fallbackEndTime)
                    || (Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1)) {
                    return null;
                }

                const finiteTimes = times.filter(Number.isFinite);
                let prefixClusterLength = 1;
                while (Number.isFinite(times[0])
                    && prefixClusterLength < times.length
                    && times[prefixClusterLength] === times[0]) {
                    prefixClusterLength++;
                }
                const isFullyCollapsed = finiteTimes.length > 0
                    && finiteTimes.every(time => time === finiteTimes[0]);
                const hasDisplacedPrefixCluster = prefixClusterLength >= 4
                    && fallbackStartTime > times[0] + 250;
                return isFullyCollapsed || hasDisplacedPrefixCluster ? fallbackStartTime : null;
            });
            const sourceLineStarts = rawLineCharTimes.map((times, index) => {
                if (Number.isFinite(times[0])) return times[0];
                if (Number.isFinite(providerLineBounds[index].fallbackStartTime)) {
                    return providerLineBounds[index].fallbackStartTime;
                }
                return times.find(Number.isFinite) ?? null;
            });
            const proposedLineStarts = rawLineCharTimes.map((times, index) => (
                Number.isFinite(fallbackCandidates[index])
                    ? fallbackCandidates[index]
                    : sourceLineStarts[index]
            ));
            const effectiveLineStarts = [...proposedLineStarts];
            const acceptedLineFallbacks = fallbackCandidates.map(Number.isFinite);
            let fallbackPlanChanged = true;
            while (fallbackPlanChanged) {
                fallbackPlanChanged = false;
                for (let index = 0; index < effectiveLineStarts.length; index++) {
                    if (!acceptedLineFallbacks[index]) continue;
                    const previousStart = index > 0 ? effectiveLineStarts[index - 1] : -Infinity;
                    const nextStart = index + 1 < effectiveLineStarts.length
                        ? effectiveLineStarts[index + 1]
                        : providerLineBounds[index].fallbackEndTime;
                    if (effectiveLineStarts[index] <= previousStart
                        || !Number.isFinite(nextStart)
                        || effectiveLineStarts[index] >= nextStart) {
                        effectiveLineStarts[index] = sourceLineStarts[index];
                        acceptedLineFallbacks[index] = false;
                        fallbackPlanChanged = true;
                    }
                }
            }
            const lineTimingRepairs = rawLineCharTimes.map((times, index) => {
                if (normalizeSyncDataGranularity(normalizedSyncLines[index]?.granularity) !== 'character') {
                    return {
                        times,
                        changed: false,
                        usedLineFallback: false,
                        duplicateCount: 0,
                        unresolvedDuplicateCount: 0,
                        longestCluster: 1
                    };
                }
                const forceLineFallback = acceptedLineFallbacks[index];
                const nextLineStart = effectiveLineStarts[index + 1];
                const fallbackEndTime = Number.isFinite(nextLineStart)
                    ? nextLineStart
                    : providerLineBounds[index].fallbackEndTime;
                const lastFiniteTime = [...times].reverse().find(Number.isFinite);
                const endBound = Number.isFinite(nextLineStart)
                    ? nextLineStart
                    : (Number.isFinite(fallbackEndTime)
                        ? fallbackEndTime
                        : (Number.isFinite(lastFiniteTime)
                            ? lastFiniteTime + 2000
                            : effectiveLineStarts[index] + 2000));
                return normalizeSyncDataTimestampSequence(times, {
                    fallbackStartMs: effectiveLineStarts[index],
                    fallbackEndMs: fallbackEndTime,
                    endBoundMs: endBound,
                    forceLineFallback
                });
            });
            return { providerLineBounds, effectiveLineStarts, lineTimingRepairs };
        };
        const { providerLineBounds, effectiveLineStarts, lineTimingRepairs } = computeLineTimingPlan();
        lineTimingRepairs.forEach(recordTimingRepair);

        for (let i = 0; i < normalizedSyncLines.length; i++) {
            const lineData = normalizedSyncLines[i];
            const inlineStyleRanges = normalizeSyncDataInlineStyleRanges(
                lineData?.styleRanges,
                Number(lineData?.start),
                Number(lineData?.end)
            );
            const applyInlineStyle = (syllable, absoluteIndex) => {
                const styleRange = findSyncDataInlineStyleRange(inlineStyleRanges, absoluteIndex);
                if (!styleRange) return syllable;
                return {
                    ...syllable,
                    inlineStyle: true,
                    ...(styleRange.kind ? { styleKind: styleRange.kind } : {}),
                    ...(styleRange.speaker ? { styleSpeaker: styleRange.speaker } : {}),
                    ...(styleRange.speakerColor ? { styleSpeakerColor: styleRange.speakerColor } : {}),
                    ...(styleRange.speakerFallback ? { styleSpeakerFallback: styleRange.speakerFallback } : {})
                };
            };

            // 해당 범위의 텍스트 추출 (유니코드 문자 배열에서 slice 사용)
            const lineText = fullTextChars.slice(lineData.start, lineData.end + 1).join('');

            const lineTimingRepair = lineTimingRepairs[i];
            const lineCharTimes = lineTimingRepair.times;

            // 라인 시작/종료 시간 계산 (일단 다음 줄 시작 전까지로 잡지만, 아래에서 조정함)
            const computeLineCharTiming = () => {
                const lineStartTime = lineCharTimes[0];
                let lineEndTime = lineTimingRepairs[i + 1]
                    ? lineTimingRepairs[i + 1].times[0]
                    : (lineCharTimes[lineCharTimes.length - 1] ?? lineStartTime) + 2000;
                if (lineTimingRepair.usedLineFallback) {
                    const safeFallbackEnd = effectiveLineStarts[i + 1]
                        ?? providerLineBounds[i].fallbackEndTime;
                    if (Number.isFinite(safeFallbackEnd) && safeFallbackEnd > lineStartTime) {
                        lineEndTime = safeFallbackEnd;
                    }
                }

                // 평균 글자 지속 시간 계산 (초 단위)
                const lineDuration = Math.max(0, lineEndTime - lineStartTime) / 1000;
                const avgCharDuration = Math.max(0.2, lineDuration / Math.max(1, lineData.chars.length));

                // 마지막 글자의 자연스러운 최대 지속 시간 (평균의 2.5배 또는 최대 1.5초)
                // 너무 짧게 끊기지 않도록 최소 0.5초는 보장
                const lastCharMaxDuration = Math.max(0.5, Math.min(1.5, avgCharDuration * 2.5));
                return { lineStartTime, lineEndTime, lineDuration, avgCharDuration, lastCharMaxDuration };
            };
            const lineCharTiming = computeLineCharTiming();
            const { lineStartTime, lineDuration, avgCharDuration, lastCharMaxDuration } = lineCharTiming;
            let lineEndTime = lineCharTiming.lineEndTime;

            // 각 글자별 syllable 생성
            let syllables = [];
            const chars = Array.from(lineText); // 유니코드 문자 지원
            const lineGranularity = normalizeSyncDataGranularity(lineData.granularity);
            // An explicit end for the last character (a held final note). Without
            // it the last character keeps the natural, capped duration below.
            const lineLastCharEndTime = getSyncDataMilliseconds(lineData.lastCharEnd);

            for (let j = 0; j < lineData.chars.length && j < chars.length; j++) {
                const charStartTime = lineCharTimes[j];
                let charEndTime;

                if (j < lineData.chars.length - 1) {
                    charEndTime = lineCharTimes[j + 1];
                } else if (Number.isFinite(lineLastCharEndTime) && lineLastCharEndTime > charStartTime) {
                    charEndTime = lineLastCharEndTime;
                    lineEndTime = charEndTime;
                } else if (lineGranularity === 'line') {
                    charEndTime = lineEndTime;
                } else {
                    // 마지막 글자: 다음 줄 시작 시간과 자연스러운 종료 시간 중 더 빠른 것 선택
                    const naturalEndTime = charStartTime + Math.round(lastCharMaxDuration * 1000);
                    charEndTime = Math.min(lineEndTime, naturalEndTime);

                    // 라인 전체 종료 시간도 이에 맞춰 조정 (너무 길게 늘어지는 것 방지)
                    lineEndTime = charEndTime;
                }

                syllables.push(applyInlineStyle({
                    text: chars[j],
                    startTime: charStartTime,
                    endTime: charEndTime
                }, lineData.start + j));
            }

            syllables = collapseSyncDataSyllables(syllables, lineGranularity, lineEndTime);

            const buildParallelPart = (part) => {
                if (!part || !Array.isArray(part.ranges) || !Array.isArray(part.chars)) return null;
                let partSyllables = [];
                const partGranularity = normalizeSyncDataGranularity(part.granularity || lineData.granularity);
                const partLastCharEndTime = getSyncDataMilliseconds(part.lastCharEnd);
                let partCharIndex = 0;

                part.ranges.forEach((range, rangeIndex) => {
                    if (rangeIndex > 0) {
                        const joinMode = Array.isArray(part.join) ? Number(part.join[rangeIndex - 1]) : 1;
                        if (joinMode === 1 || joinMode === 2) {
                            const previousPartTime = getSyncDataMilliseconds(
                                part.chars[Math.max(0, partCharIndex - 1)]
                            );
                            const firstLineTime = getSyncDataMilliseconds(lineData.chars[0]);
                            const gapStartTime = partSyllables[partSyllables.length - 1]?.endTime
                                ?? previousPartTime
                                ?? firstLineTime
                                ?? lineStartTime;
                            const nextRangeTime = getSyncDataMilliseconds(part.chars[partCharIndex]);
                            const gapEndTime = Number.isFinite(nextRangeTime)
                                ? Math.max(gapStartTime, nextRangeTime)
                                : gapStartTime;
                            partSyllables.push({
                                text: ' ',
                                startTime: gapStartTime,
                                endTime: gapEndTime
                            });
                        }
                    }

                    const rangeCharCount = Math.max(0, range.end - range.start + 1);
                    const rangeRawTimes = part.chars
                        .slice(partCharIndex, partCharIndex + rangeCharCount)
                        .map(getSyncDataMilliseconds);
                    const nextRangeTime = getSyncDataMilliseconds(
                        part.chars[partCharIndex + rangeCharCount]
                    );
                    const rangeEndBound = Number.isFinite(nextRangeTime)
                        ? nextRangeTime
                        : lineEndTime;
                    const rangeStartTime = Number.isFinite(rangeRawTimes[0])
                        ? rangeRawTimes[0]
                        : (rangeRawTimes.find(Number.isFinite) ?? lineStartTime);
                    const rangeTimingRepair = partGranularity === 'character'
                        ? normalizeSyncDataTimestampSequence(rangeRawTimes, {
                            fallbackStartMs: rangeStartTime,
                            fallbackEndMs: rangeEndBound,
                            endBoundMs: rangeEndBound,
                            allowLineFallback: false
                        })
                        : {
                            times: rangeRawTimes,
                            changed: false,
                            usedLineFallback: false,
                            duplicateCount: 0,
                            unresolvedDuplicateCount: 0,
                            longestCluster: 1
                        };
                    const rangeCharTimes = rangeTimingRepair.times;
                    recordTimingRepair(rangeTimingRepair);

                    for (let sourceIndex = range.start; sourceIndex <= range.end; sourceIndex++) {
                        const char = fullTextChars[sourceIndex] || '';
                        const rangeCharIndex = sourceIndex - range.start;
                        const fallbackCharStart = getSyncDataMilliseconds(part.chars[partCharIndex])
                            ?? getSyncDataMilliseconds(lineData.chars[0])
                            ?? lineStartTime;
                        const charStart = rangeCharTimes[rangeCharIndex]
                            ?? fallbackCharStart;
                        const nextPartTime = rangeCharTimes[rangeCharIndex + 1];
                        const naturalEndTime = charStart + Math.round(lastCharMaxDuration * 1000);
                        const isRangeBoundary = sourceIndex === range.end && rangeIndex < part.ranges.length - 1;
                        const isPartLastChar = sourceIndex === range.end && rangeIndex === part.ranges.length - 1;
                        let charEnd;
                        if (isPartLastChar && Number.isFinite(partLastCharEndTime) && partLastCharEndTime > charStart) {
                            charEnd = partLastCharEndTime;
                        } else if (Number.isFinite(nextPartTime)) {
                            const nextCharStartTime = nextPartTime;
                            charEnd = isRangeBoundary
                                ? Math.min(nextCharStartTime, naturalEndTime)
                                : nextCharStartTime;
                        } else if (partGranularity === 'line') {
                            charEnd = rangeEndBound;
                        } else {
                            charEnd = Math.min(rangeEndBound, naturalEndTime);
                        }
                        charEnd = Math.max(charStart, charEnd);

                        partSyllables.push(applyInlineStyle({
                            text: char,
                            startTime: charStart,
                            endTime: charEnd
                        }, sourceIndex));
                        partCharIndex++;
                    }
                });

                if (!partSyllables.length) return null;
                const partEndTime = Number.isFinite(partLastCharEndTime)
                    && partLastCharEndTime > (partSyllables[partSyllables.length - 1]?.startTime ?? Infinity)
                    ? partLastCharEndTime
                    : lineEndTime;
                partSyllables = collapseSyncDataSyllables(partSyllables, partGranularity, partEndTime);
                while (partSyllables.length && /^\s+$/u.test(partSyllables[0]?.text || '')) {
                    partSyllables.shift();
                }
                while (partSyllables.length && /^\s+$/u.test(partSyllables[partSyllables.length - 1]?.text || '')) {
                    partSyllables.pop();
                }
                if (!partSyllables.length) return null;
                const normalizedText = partSyllables.map(syllable => syllable.text || '').join('');
                    return {
                        id: part.id || '',
                        role: part.role || '',
                        speaker: part.speaker || '',
                        'speaker-color': part['speaker-color'] || '',
                        'speaker-fallback': part['speaker-fallback'] || '',
                        kind: part.kind || 'vocal',
                        text: normalizedText,
                        syllables: partSyllables,
                        startTime: partSyllables[0].startTime,
                    endTime: partSyllables[partSyllables.length - 1].endTime
                };
            };

            const groupedParallelParts = buildLrclibSyncDataParallelParts(
                lineData, fullTextChars, buildParallelPart
            );
            const parallelParts = groupedParallelParts ?? (Array.isArray(lineData.parallel?.parts)
                ? lineData.parallel.parts.map(buildParallelPart).filter(Boolean)
                : []);

            if (parallelParts.length > 1) {
                const leadPart = parallelParts.find(part => part.role === 'lead') || parallelParts[0];
                const backgroundParts = parallelParts.filter(part => part !== leadPart);
                const allPartTimes = parallelParts.flatMap(part => [part.startTime, part.endTime]).filter(Number.isFinite);
                    result.push({
                        startTime: Math.min(...allPartTimes, lineStartTime),
                        endTime: Math.max(...allPartTimes, lineEndTime),
                        text: lineText,
                        speaker: lineData.speaker || leadPart.speaker || '',
                        'speaker-color': lineData['speaker-color'] || leadPart['speaker-color'] || '',
                        'speaker-fallback': lineData['speaker-fallback'] || leadPart['speaker-fallback'] || '',
                        kind: lineData.kind || leadPart.kind || 'vocal',
                        vocals: {
                            lead: {
                                id: leadPart.id,
                                role: leadPart.role,
                                speaker: leadPart.speaker,
                                'speaker-color': leadPart['speaker-color'] || '',
                                'speaker-fallback': leadPart['speaker-fallback'] || '',
                                kind: leadPart.kind,
                                text: leadPart.text,
                                syllables: leadPart.syllables
                            },
                            background: backgroundParts.map(part => ({
                                id: part.id,
                                role: part.role,
                                speaker: part.speaker,
                                'speaker-color': part['speaker-color'] || '',
                                'speaker-fallback': part['speaker-fallback'] || '',
                                kind: part.kind,
                                text: part.text,
                                syllables: part.syllables
                            }))
                    }
                });
                continue;
            }

            if (groupedParallelParts?.length === 1) {
                const joined = groupedParallelParts[0];
                result.push({
                    text: joined.text, startTime: joined.startTime, endTime: joined.endTime,
                    speaker: joined.speaker || lineData.speaker || '',
                    'speaker-color': joined['speaker-color'] || lineData['speaker-color'] || '',
                    'speaker-fallback': joined['speaker-fallback'] || lineData['speaker-fallback'] || '',
                    kind: joined.kind || lineData.kind || 'vocal',
                    syllables: joined.syllables,
                });
                continue;
            }

                result.push({
                    startTime: lineStartTime,
                    endTime: lineEndTime,
                    text: lineText,
                    speaker: lineData.speaker || '',
                    'speaker-color': lineData['speaker-color'] || '',
                    'speaker-fallback': lineData['speaker-fallback'] || '',
                    kind: lineData.kind || 'vocal',
                    syllables
            });
        }

        if (timingRepairStats.duplicateCount > 0) {
            debug?.('[SyncDataService] Normalized duplicate character timestamps', {
                provider: syncData.provider,
                sourceProvider: syncSource?.provider,
                lrclibId: syncSource?.lrclibId,
                repairedSequences: timingRepairStats.repairedSequences,
                lineFallbacks: timingRepairStats.lineFallbacks,
                duplicateCount: timingRepairStats.duplicateCount,
                unresolvedDuplicateCount: timingRepairStats.unresolvedDuplicateCount,
                longestCluster: timingRepairStats.longestCluster
            });
        }

        return result;
    }
    return { applySyncDataToLyrics, convertKaraokeToSynced };
}
