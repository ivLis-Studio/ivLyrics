/**
 * LyricsPlus Lyrics Provider Addon
 *
 * The API origins are stored as double-Base64 literals and decoded only when
 * a request is built. The provider consumes LyricsPlus v2 JSON converted from
 * source TTML and exposes karaoke, line-synced, and plain lyrics to ivLyrics.
 *
 * @addon-type lyrics
 * @id lyricsplus
 * @name LyricsPlus
 * @version 1.0.0
 * @author default
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

(() => {
    'use strict';

    const ENCODED_API_BASES = Object.freeze([
        'YUhSMGNITTZMeTlzZVhKcFkzTndiSFZ6TG5CeWFtdDBiR0V1YlhrdWFXUT0=',
        'YUhSMGNITTZMeTlzZVhKcFkzTXVaMlZsYTJWa0xuZDBaZz09'
    ]);
    const API_PATH = '/v2/lyrics/get';
    const REQUEST_TIMEOUT_MS = 10000;
    const SYLLABLE_TIMING_TOLERANCE_MS = 1500;
    const SOLO_LINE_SPLIT_TRIGGER_WIDTH = 22;
    const SOLO_LINE_SPLIT_HARD_WIDTH = 26;
    const SOLO_LINE_SPLIT_MIN_WIDTH = 6;
    const SOLO_LINE_SPLIT_MIN_DURATION_MS = 500;
    const SOLO_LINE_SPLIT_MAX_SEGMENTS = 4;
    const DISPLAY_MARK_PATTERN = /\p{Mark}/u;
    const DISPLAY_WHITESPACE_PATTERN = /\s/u;
    const DISPLAY_FULL_WIDTH_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;
    const DISPLAY_UPPERCASE_PATTERN = /[A-Z]/u;
    const DISPLAY_LOWERCASE_PATTERN = /[a-z]/u;
    const DISPLAY_NUMBER_PATTERN = /\p{Number}/u;
    const DISPLAY_PUNCTUATION_PATTERN = /[.,'’!?;:()\-]/u;
    const OBJECT_PROPERTY_IS_ENUMERABLE = Object.prototype.propertyIsEnumerable;
    const CACHE_VERSION = '2026-09-06-lyricsplus-11';
    const ATTRIBUTION = 'Lyrics from LyricsPlus.';
    let nextApiBaseIndex = 0;

    const SPEAKER_PALETTE = [
        { color: '#a8ccff', fallback: 'MALE 1' },
        { color: '#ffb8c7', fallback: 'FEMALE 1' },
        { color: '#e4d8ff', fallback: 'DUET 1' },
        { color: '#9ae8d4', fallback: 'MALE 2' },
        { color: '#ffd6b3', fallback: 'FEMALE 2' },
        { color: '#d6e4ff', fallback: 'DUET 2' },
        { color: '#bfe8ff', fallback: 'MALE 3' },
        { color: '#f6c8ff', fallback: 'FEMALE 3' },
        { color: '#ffddf2', fallback: 'DUET 3' }
    ];
    const GROUP_SPEAKER_PALETTE = SPEAKER_PALETTE.filter(item => item.fallback.startsWith('DUET'));

    const ADDON_INFO = {
        id: 'lyricsplus',
        name: 'LyricsPlus',
        author: 'default',
        version: '1.0.0',
        cacheVersion: CACHE_VERSION,
        description: {
            en: 'Word-synced lyrics from the LyricsPlus community API',
            ko: 'LyricsPlus 커뮤니티 API에서 단어 단위 싱크 가사를 가져옵니다'
        },
        supports: {
            karaoke: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        icon: 'M9 3v10.55A4 4 0 1 0 11 17V7h6V3H9v10a4 4 0 1 0 2 3.45V7h4v6a4 4 0 1 0 2 3.45V3H9z'
    };

    function decodeBase64Twice(value) {
        return globalThis.atob(globalThis.atob(String(value || '')));
    }

    function getApiBases() {
        return ENCODED_API_BASES.map(decodeBase64Twice);
    }

    function reserveApiAttemptOrder(apiBases = getApiBases()) {
        if (!Array.isArray(apiBases) || apiBases.length === 0) return [];
        const startIndex = nextApiBaseIndex % apiBases.length;
        nextApiBaseIndex = (startIndex + 1) % apiBases.length;

        return apiBases.map((_apiBase, offset) => {
            const mirrorIndex = (startIndex + offset) % apiBases.length;
            return { apiBase: apiBases[mirrorIndex], mirrorIndex };
        });
    }

    function normalizeInlineText(value) {
        return String(value ?? '').replace(/[\r\n\t\f\v ]+/g, ' ');
    }

    function normalizeDisplayText(value) {
        return normalizeInlineText(value).trim();
    }

    function normalizeMetadataText(value) {
        if (Array.isArray(value)) {
            return value
                .map(item => normalizeMetadataText(item))
                .filter(Boolean)
                .join(', ');
        }
        if (value && typeof value === 'object') {
            return normalizeDisplayText(value.name || value.title || '');
        }
        return normalizeDisplayText(value);
    }

    function toFiniteMilliseconds(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
    }

    function toPositiveMilliseconds(value) {
        const number = toFiniteMilliseconds(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function normalizeDurationMs(info) {
        const duration = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return duration > 10000 ? Math.round(duration) : Math.round(duration * 1000);
    }

    function normalizeDurationSeconds(info) {
        const durationMs = normalizeDurationMs(info);
        if (!durationMs) return '';
        return String(Math.round(durationMs) / 1000);
    }

    function normalizeIsrc(value) {
        const serviceValue = window.SyncDataService?.normalizeSyncDataIsrc?.(value);
        const normalized = String(serviceValue || value || '')
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
        return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
    }

    function extractTrackId(uri) {
        return window.LyricsService?.extractTrackId?.(uri)
            || window.ivLyricsTrackIdentity?.extractTrackId?.(uri)
            || String(uri || '').match(/^spotify:track:([^:]+)$/)?.[1]
            || '';
    }

    async function resolveTrackIsrc(info) {
        const directCandidates = [
            info?.isrc,
            info?.external_ids?.isrc,
            info?.externalIds?.isrc,
            info?.metadata?.isrc,
            info?.track?.external_ids?.isrc
        ];
        for (const candidate of directCandidates) {
            const isrc = normalizeIsrc(candidate);
            if (isrc) return isrc;
        }

        const trackId = extractTrackId(info?.uri);
        if (!trackId || !window.SyncDataService) return '';

        const cached = normalizeIsrc(window.SyncDataService.getTrackIsrc?.(trackId, info));
        if (cached) return cached;

        try {
            return normalizeIsrc(await window.SyncDataService.resolveTrackIsrc?.(trackId, info));
        } catch (error) {
            console.warn('[LyricsPlus Lyrics Addon] ISRC lookup failed:', error);
            return '';
        }
    }

    function buildLyricsUrl(apiBase, info, isrc) {
        const url = new URL(API_PATH, apiBase);
        const title = normalizeMetadataText(info?.title || info?.name);
        const artist = normalizeMetadataText(info?.artist || info?.artists);
        const album = normalizeMetadataText(info?.album || info?.albumName);
        const duration = normalizeDurationSeconds(info);

        if (isrc) {
            url.searchParams.set('isrc', isrc);
        } else if (title && artist) {
            url.searchParams.set('title', title);
            url.searchParams.set('artist', artist);
            if (album && album !== 'undefined') url.searchParams.set('album', album);
            if (duration) url.searchParams.set('duration', duration);
        }

        return url;
    }

    function isUsablePayload(payload) {
        return payload
            && !payload.error
            && Array.isArray(payload.lyrics)
            && payload.lyrics.some(line => normalizeDisplayText(line?.text)
                || (Array.isArray(line?.syllabus) && line.syllabus.some(item => normalizeDisplayText(item?.text))));
    }

    async function fetchJson(url, mirrorIndex) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

        try {
            const response = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                signal: controller?.signal
            });
            const body = await response.json().catch(() => null);

            if (!response.ok || !isUsablePayload(body)) {
                const message = body?.error?.message
                    || body?.error?.details?.message
                    || (typeof body?.error === 'string' ? body.error : '')
                    || `request failed (${response.status})`;
                const error = new Error(`LyricsPlus mirror ${mirrorIndex + 1}: ${message}`);
                error.status = response.status;
                error.notFound = response.status === 404
                    || (response.ok
                        && body
                        && !body.error
                        && Array.isArray(body.lyrics));
                throw error;
            }

            return body;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchLyricsData(info) {
        const isrc = await resolveTrackIsrc(info);
        const title = normalizeMetadataText(info?.title || info?.name);
        const artist = normalizeMetadataText(info?.artist || info?.artists);
        if (!isrc && (!title || !artist)) {
            throw new Error('Missing ISRC or track metadata');
        }

        const errors = [];
        const apiAttempts = reserveApiAttemptOrder();
        for (const { apiBase, mirrorIndex } of apiAttempts) {
            try {
                const data = await fetchJson(buildLyricsUrl(apiBase, info, isrc), mirrorIndex);
                return { data, isrc, mirror: mirrorIndex + 1 };
            } catch (error) {
                errors.push(error);
                window.__ivLyricsDebugLog?.(`[LyricsPlus Lyrics Addon] Mirror ${mirrorIndex + 1} failed`, {
                    status: error?.status || null,
                    error: error?.name || 'Error'
                });
            }
        }

        if (errors.length > 0 && errors.every(error => error?.notFound === true)) return null;
        throw [...errors].reverse().find(error => error?.notFound !== true)
            || errors[errors.length - 1]
            || new Error('LyricsPlus request failed');
    }

    function getAgentMetadata(singer, agents = {}) {
        const singerId = String(singer || '').trim();
        if (!singerId) return null;

        const agentSource = agents || {};
        if (OBJECT_PROPERTY_IS_ENUMERABLE.call(agentSource, singerId)) {
            const agent = agentSource[singerId];
            return {
                id: singerId,
                type: normalizeDisplayText(agent?.type).toLowerCase(),
                name: normalizeDisplayText(agent?.name),
                alias: normalizeDisplayText(agent?.alias)
            };
        }

        const entries = Object.entries(agentSource);
        const normalizedSingerId = normalizeDisplayText(singerId).toLocaleLowerCase();
        const match = entries.find(([id]) => normalizeDisplayText(id).toLocaleLowerCase() === normalizedSingerId)
            || entries.find(([_id, agent]) => (
                normalizeDisplayText(agent?.alias).toLocaleLowerCase() === normalizedSingerId
            ));
        if (!match) return null;

        const [id, agent] = match;
        return {
            id,
            type: normalizeDisplayText(agent?.type).toLowerCase(),
            name: normalizeDisplayText(agent?.name),
            alias: normalizeDisplayText(agent?.alias)
        };
    }

    function getSpeakerPresentation(singer, singerOrder, agents = {}, cache = null) {
        const rawSingerId = String(singer || '').trim();
        if (cache?.has(rawSingerId)) return cache.get(rawSingerId);
        if (!rawSingerId) {
            const presentation = { speaker: 'NORMAL', lyricsPlusSinger: '' };
            cache?.set(rawSingerId, presentation);
            return presentation;
        }

        const agent = getAgentMetadata(rawSingerId, agents);
        const singerId = agent?.id || rawSingerId;
        if (!singerOrder.has(singerId)) singerOrder.set(singerId, singerOrder.size);
        const index = singerOrder.get(singerId) || 0;
        const agentFields = {
            lyricsPlusSinger: singerId,
            lyricsPlusAgentType: agent?.type || '',
            lyricsPlusAgentName: agent?.name || '',
            lyricsPlusAgentAlias: agent?.alias || ''
        };
        if (index === 0) {
            const presentation = { speaker: 'NORMAL', ...agentFields };
            cache?.set(rawSingerId, presentation);
            return presentation;
        }

        let palette = SPEAKER_PALETTE[(index - 1) % SPEAKER_PALETTE.length];
        if (agent?.type === 'group' && GROUP_SPEAKER_PALETTE.length > 0) {
            const priorGroupCount = Array.from(singerOrder.entries())
                .filter(([candidate, candidateIndex]) => (
                    candidateIndex < index && getAgentMetadata(candidate, agents)?.type === 'group'
                ))
                .length;
            palette = GROUP_SPEAKER_PALETTE[priorGroupCount % GROUP_SPEAKER_PALETTE.length];
        }

        const presentation = {
            speaker: 'CUSTOM',
            'speaker-color': palette.color,
            'speaker-fallback': palette.fallback,
            ...agentFields
        };
        cache?.set(rawSingerId, presentation);
        return presentation;
    }

    function parseSyllable(item) {
        const startTime = toFiniteMilliseconds(item?.time);
        if (!Number.isFinite(startTime)) return null;
        const duration = toPositiveMilliseconds(item?.duration) || 1;
        const text = normalizeInlineText(item?.text);
        if (!text) return null;

        return {
            text,
            startTime,
            endTime: startTime + duration,
            isBackground: item?.isBackground === true
        };
    }

    function isSyllableWithinLine(syllable, lineStart, lineEnd) {
        if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return true;
        return syllable.startTime >= lineStart - SYLLABLE_TIMING_TOLERANCE_MS
            && syllable.endTime <= lineEnd + SYLLABLE_TIMING_TOLERANCE_MS;
    }

    function joinSyllableText(syllables) {
        return normalizeDisplayText((syllables || []).map(syllable => syllable?.text || '').join(''));
    }

    function measureLyricsDisplayWidth(value) {
        let width = 0;
        for (const character of String(value || '')) {
            if (DISPLAY_MARK_PATTERN.test(character)) continue;
            if (DISPLAY_WHITESPACE_PATTERN.test(character)) {
                width += 0.33;
            } else if (DISPLAY_FULL_WIDTH_PATTERN.test(character)) {
                width += 1;
            } else if (DISPLAY_UPPERCASE_PATTERN.test(character)) {
                width += 0.72;
            } else if (DISPLAY_LOWERCASE_PATTERN.test(character)) {
                width += 0.58;
            } else if (DISPLAY_NUMBER_PATTERN.test(character)) {
                width += 0.62;
            } else if (DISPLAY_PUNCTUATION_PATTERN.test(character)) {
                width += 0.38;
            } else {
                width += 0.8;
            }
        }
        return width;
    }

    function getBoundaryCharacter(value, fromEnd = false) {
        const characters = Array.from(String(value || ''))
            .filter(character => !/[\s\p{Mark}]/u.test(character));
        return (fromEnd ? characters[characters.length - 1] : characters[0]) || '';
    }

    function isLatinOrNumber(character) {
        return /[\p{Script=Latin}\p{Number}]/u.test(character || '');
    }

    function isCjkCharacter(character) {
        return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character || '');
    }

    function isNoSpaceLineBreakCharacter(character) {
        return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character || '');
    }

    function getSafeSoloLineBoundary(leftSyllable, rightSyllable) {
        const leftText = String(leftSyllable?.text || '');
        const rightText = String(rightSyllable?.text || '');
        const leftCharacter = getBoundaryCharacter(leftText, true);
        const rightCharacter = getBoundaryCharacter(rightText, false);
        if (!leftCharacter || !rightCharacter) return null;
        if (/[\(\[\{（「『【〈《]/u.test(leftCharacter)) return null;
        if (/[\)\]\}）」』】〉》、。，．！？?!]/u.test(rightCharacter)) return null;
        if (/[ゃゅょっぁぃぅぇぉゎャュョッァィゥェォヮー々]/u.test(rightCharacter)) return null;

        const leftEndTime = Number(leftSyllable?.endTime);
        const rightStartTime = Number(rightSyllable?.startTime);
        if (!Number.isFinite(leftEndTime)
            || !Number.isFinite(rightStartTime)
            || leftEndTime > rightStartTime) {
            return null;
        }

        const hasWhitespace = /\s$/u.test(leftText) || /^\s/u.test(rightText);
        const followsPunctuation = /[。！？?!…；;：:、，,.]/u.test(leftCharacter);
        const changesBetweenCjkAndLatin = (
            isCjkCharacter(leftCharacter) && isLatinOrNumber(rightCharacter)
        ) || (
            isLatinOrNumber(leftCharacter) && isCjkCharacter(rightCharacter)
        );
        const isNoSpaceScriptBoundary = isNoSpaceLineBreakCharacter(leftCharacter)
            && isNoSpaceLineBreakCharacter(rightCharacter);

        // Some TTML sources split one English word into multiple timed spans
        // (for example, "Wond" + "er"). Never treat that as a line boundary.
        if (isLatinOrNumber(leftCharacter)
            && isLatinOrNumber(rightCharacter)
            && !hasWhitespace
            && !followsPunctuation) {
            return null;
        }
        if (!hasWhitespace
            && !followsPunctuation
            && !changesBetweenCjkAndLatin
            && !isNoSpaceScriptBoundary) {
            return null;
        }

        return {
            penalty: hasWhitespace
                ? 0
                : (followsPunctuation ? 0.25 : (isNoSpaceScriptBoundary ? 1 : 2.5)),
            gapMs: Math.max(0, rightStartTime - leftEndTime)
        };
    }

    function getSoloLineSplitPlan(syllables, totalWidth) {
        const candidateBoundaries = new Map();
        for (let index = 1; index < syllables.length; index++) {
            const boundary = getSafeSoloLineBoundary(syllables[index - 1], syllables[index]);
            if (boundary) candidateBoundaries.set(index, boundary);
        }
        if (candidateBoundaries.size === 0) return null;

        const rawTexts = syllables.map(syllable => String(syllable.text || ''));
        const maximumSegmentCount = Math.min(
            SOLO_LINE_SPLIT_MAX_SEGMENTS,
            candidateBoundaries.size + 1,
            syllables.length
        );
        const minimumSegmentCount = Math.max(
            2,
            Math.ceil(totalWidth / SOLO_LINE_SPLIT_HARD_WIDTH)
        );

        const findPlanForCount = segmentCount => {
            const targetWidth = totalWidth / segmentCount;
            const memo = new Map();

            const search = (startIndex, remainingSegments) => {
                const memoKey = `${startIndex}:${remainingSegments}`;
                if (memo.has(memoKey)) return memo.get(memoKey);

                if (remainingSegments === 1) {
                    const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex).join(''));
                    const first = syllables[startIndex];
                    const last = syllables[syllables.length - 1];
                    const duration = last.endTime - first.startTime;
                    const result = width >= SOLO_LINE_SPLIT_MIN_WIDTH
                        && width <= SOLO_LINE_SPLIT_HARD_WIDTH
                        && duration >= SOLO_LINE_SPLIT_MIN_DURATION_MS
                        ? { cost: Math.pow(width - targetWidth, 2), boundaries: [] }
                        : null;
                    memo.set(memoKey, result);
                    return result;
                }

                let best = null;
                const maximumEndIndex = syllables.length - (remainingSegments - 1);
                for (let endIndex = startIndex + 1; endIndex <= maximumEndIndex; endIndex++) {
                    const boundary = candidateBoundaries.get(endIndex);
                    if (!boundary) continue;

                    const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex, endIndex).join(''));
                    const first = syllables[startIndex];
                    const last = syllables[endIndex - 1];
                    const duration = last.endTime - first.startTime;
                    if (width < SOLO_LINE_SPLIT_MIN_WIDTH
                        || width > SOLO_LINE_SPLIT_HARD_WIDTH
                        || duration < SOLO_LINE_SPLIT_MIN_DURATION_MS) {
                        continue;
                    }

                    const remaining = search(endIndex, remainingSegments - 1);
                    if (!remaining) continue;
                    const timingGapBonus = Math.min(boundary.gapMs / 200, 1);
                    const cost = Math.pow(width - targetWidth, 2)
                        + (boundary.penalty * 4)
                        - timingGapBonus
                        + remaining.cost;
                    if (!best || cost < best.cost) {
                        best = {
                            cost,
                            boundaries: [endIndex, ...remaining.boundaries]
                        };
                    }
                }

                memo.set(memoKey, best);
                return best;
            };

            return search(0, segmentCount);
        };

        for (let segmentCount = minimumSegmentCount;
            segmentCount <= maximumSegmentCount;
            segmentCount++) {
            const plan = findPlanForCount(segmentCount);
            if (plan) return [0, ...plan.boundaries, syllables.length];
        }
        return null;
    }

    function splitLongSoloVocalLine(line, previousLine = null, nextLine = null) {
        const syllables = Array.isArray(line?.syllables) ? line.syllables : [];
        if (syllables.length < 2
            || line?.vocals
            || line?.lyricsPlusParallelVocal
            || line?.lyricsPlusFragment
            || line?.lyricsPlusSoloSegment
            || line?.lyricsPlusPromotedBackgroundFragment
            || line?.lyricsPlusSegmentCount) {
            return [line];
        }

        for (let index = 0; index < syllables.length; index++) {
            const syllable = syllables[index];
            const previous = syllables[index - 1];
            if (!normalizeInlineText(syllable?.text)
                || !Number.isFinite(syllable?.startTime)
                || !Number.isFinite(syllable?.endTime)
                || syllable.endTime < syllable.startTime
                || syllable.lyricsPlusSeparator
                || (previous && (
                    syllable.startTime <= previous.startTime
                    || syllable.startTime < previous.endTime
                ))) {
                return [line];
            }
        }

        const firstSyllable = syllables[0];
        const lastSyllable = syllables[syllables.length - 1];
        if ((Number.isFinite(previousLine?.endTime) && previousLine.endTime > firstSyllable.startTime)
            || (Number.isFinite(nextLine?.startTime) && nextLine.startTime < lastSyllable.endTime)) {
            return [line];
        }

        const lineText = normalizeDisplayText(line?.originalText || line?.text);
        const syllableText = joinSyllableText(syllables);
        if (!lineText || lineText !== syllableText) return [line];

        const totalWidth = measureLyricsDisplayWidth(lineText);
        if (totalWidth <= SOLO_LINE_SPLIT_TRIGGER_WIDTH
            || syllables.some(syllable => (
                measureLyricsDisplayWidth(syllable.text) > SOLO_LINE_SPLIT_HARD_WIDTH
            ))) {
            return [line];
        }

        const plan = getSoloLineSplitPlan(syllables, totalWidth);
        if (!plan || plan.length < 3) return [line];

        const sourceLineKey = String(
            line.lyricsPlusSourceLineKey || line.lyricsPlusLineKey || `line-${line.sourceIndex ?? 0}`
        );
        const fragmentCount = plan.length - 1;
        const fragments = plan.slice(0, -1).map((startIndex, fragmentIndex) => {
            const endIndex = plan[fragmentIndex + 1];
            const fragmentSyllables = syllables.slice(startIndex, endIndex);
            const first = fragmentSyllables[0];
            const last = fragmentSyllables[fragmentSyllables.length - 1];
            const text = joinSyllableText(fragmentSyllables);
            const fragmentKey = `${sourceLineKey}-solo-segment-${fragmentIndex + 1}`;
            return {
                ...line,
                startTime: fragmentIndex === 0
                    ? Math.min(line.startTime, first.startTime)
                    : first.startTime,
                endTime: fragmentIndex === fragmentCount - 1
                    ? Math.max(line.endTime, last.endTime)
                    : last.endTime,
                text,
                originalText: text,
                syllables: fragmentSyllables,
                lyricsPlusLineKey: fragmentKey,
                lyricsPlusSourceLineKey: sourceLineKey,
                lyricsPlusSourceLineKeys: Array.from(new Set([
                    ...(Array.isArray(line.lyricsPlusSourceLineKeys)
                        ? line.lyricsPlusSourceLineKeys
                        : []),
                    sourceLineKey
                ])),
                lyricsPlusSoloSegment: true,
                lyricsPlusFragmentIndex: fragmentIndex,
                lyricsPlusFragmentCount: fragmentCount
            };
        });

        const flattenedSyllables = fragments.flatMap(fragment => fragment.syllables);
        const preservesSyllables = flattenedSyllables.length === syllables.length
            && flattenedSyllables.every((syllable, index) => syllable === syllables[index]);
        const preservesText = normalizeDisplayText(
            fragments.flatMap(fragment => fragment.syllables).map(syllable => syllable.text).join('')
        ) === lineText;
        const hasSafeFragmentTiming = fragments.every((fragment, index) => (
            index === 0
            || (
                fragment.startTime > fragments[index - 1].startTime
                && fragments[index - 1].syllables.at(-1).endTime
                    <= fragment.syllables[0].startTime
            )
        ));
        return preservesSyllables && preservesText && hasSafeFragmentTiming
            ? fragments
            : [line];
    }

    function splitLongSoloVocalLines(lines) {
        return (lines || []).flatMap((line, index, allLines) => (
            splitLongSoloVocalLine(line, allLines[index - 1], allLines[index + 1])
        ));
    }

    function stripBackgroundParentheses(value) {
        return normalizeDisplayText(String(value || '').replace(/[()（）]/g, ''));
    }

    function stripBackgroundSyllableParentheses(syllables) {
        return (syllables || [])
            .map(syllable => ({
                ...syllable,
                text: String(syllable?.text || '').replace(/[()（）]/g, '')
            }))
            .filter(syllable => syllable.text.length > 0);
    }

    function createVocalPart(id, role, syllables, presentation, textOverride = '') {
        if (!Array.isArray(syllables) || syllables.length === 0) return null;
        const text = normalizeDisplayText(textOverride) || joinSyllableText(syllables);
        if (!text) return null;

        const starts = syllables.map(item => item.startTime).filter(Number.isFinite);
        const ends = syllables.map(item => item.endTime).filter(Number.isFinite);
        if (!starts.length || !ends.length) return null;

        return {
            id,
            role,
            ...presentation,
            kind: 'vocal',
            text,
            syllables: syllables.map(({ isBackground: _isBackground, ...syllable }) => syllable),
            startTime: Math.min(...starts),
            endTime: Math.max(...ends)
        };
    }

    function groupParallelVocalLines(lines) {
        // Timing overlap does not make separate source lines background vocals.
        // Preserve the provider's line boundaries and explicit background parts;
        // the renderer advances each line using its own ending timestamp.
        return [...(lines || [])].sort((left, right) => (
            left.startTime - right.startTime
            || (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0)
        ));
    }

    function parseLyricsPayload(payload, durationMs = 0) {
        if (!isUsablePayload(payload)) {
            return { karaoke: null, synced: null, unsynced: null };
        }

        const singerOrder = new Map();
        const speakerPresentations = new Map();
        const agents = payload?.metadata?.agents || {};
        const songParts = Array.isArray(payload?.metadata?.songParts) ? payload.metadata.songParts : [];

        const parsedLines = payload.lyrics.map((sourceLine, lineIndex) => {
            const rawStart = toFiniteMilliseconds(sourceLine?.time);
            const rawDuration = toPositiveMilliseconds(sourceLine?.duration);
            const rawEnd = Number.isFinite(rawStart) && Number.isFinite(rawDuration)
                ? rawStart + rawDuration
                : null;
            const rawSyllables = (Array.isArray(sourceLine?.syllabus)
                ? sourceLine.syllabus.map(parseSyllable).filter(Boolean)
                : [])
                .filter(syllable => isSyllableWithinLine(syllable, rawStart, rawEnd));
            const leadSyllables = rawSyllables.filter(item => !item.isBackground);
            const backgroundSyllables = stripBackgroundSyllableParentheses(
                rawSyllables.filter(item => item.isBackground)
            );
            const sourceText = normalizeDisplayText(sourceLine?.text);
            const leadText = joinSyllableText(leadSyllables);
            const backgroundText = stripBackgroundParentheses(joinSyllableText(backgroundSyllables));
            const text = backgroundSyllables.length > 0
                ? [leadText, backgroundText].filter(Boolean).join(' ')
                : sourceText || joinSyllableText(rawSyllables);
            if (!text) return null;

            const syllableStarts = rawSyllables.map(item => item.startTime).filter(Number.isFinite);
            const syllableEnds = rawSyllables.map(item => item.endTime).filter(Number.isFinite);
            const startCandidates = [rawStart, ...syllableStarts].filter(Number.isFinite);
            const endCandidates = [
                Number.isFinite(rawStart) && Number.isFinite(rawDuration) ? rawStart + rawDuration : null,
                ...syllableEnds
            ].filter(Number.isFinite);
            const startTime = startCandidates.length ? Math.min(...startCandidates) : null;
            const endTime = endCandidates.length ? Math.max(...endCandidates) : null;
            const lineKey = String(sourceLine?.element?.key || `line-${lineIndex + 1}`);
            const singer = String(sourceLine?.element?.singer || '');
            const rawSongPartIndex = sourceLine?.element?.songPartIndex;
            const songPartIndex = rawSongPartIndex !== null
                && rawSongPartIndex !== undefined
                && rawSongPartIndex !== ''
                && Number.isInteger(Number(rawSongPartIndex))
                ? Number(rawSongPartIndex)
                : null;
            const songPart = Number.isInteger(songPartIndex) ? songParts[songPartIndex] : null;
            const presentation = getSpeakerPresentation(
                singer,
                singerOrder,
                agents,
                speakerPresentations
            );

            let leadPart = createVocalPart(`${lineKey}-lead`, 'lead', leadSyllables, presentation);
            let backgroundParts = [];
            if (backgroundSyllables.length > 0) {
                const backgroundPart = createVocalPart(
                    `${lineKey}-background-1`,
                    'background',
                    backgroundSyllables,
                    presentation,
                    backgroundText
                );
                if (backgroundPart) backgroundParts.push(backgroundPart);
            }

            if (!leadPart && backgroundParts.length > 0) {
                const promoted = backgroundParts.shift();
                leadPart = { ...promoted, id: `${lineKey}-lead`, role: 'lead' };
            }

            const line = {
                sourceIndex: lineIndex,
                startTime,
                endTime,
                text,
                originalText: text,
                ...presentation,
                kind: 'vocal',
                lyricsPlusLineKey: lineKey,
                lyricsPlusSongPartIndex: songPartIndex,
                lyricsPlusSongPart: normalizeDisplayText(songPart?.name),
                hasWordTiming: rawSyllables.length > 0
            };

            if (leadPart && backgroundParts.length > 0) {
                line.vocals = { lead: leadPart, background: backgroundParts };
            } else if (leadPart) {
                line.syllables = leadPart.syllables;
            } else if (rawSyllables.length > 0) {
                line.syllables = rawSyllables.map(({ isBackground: _isBackground, ...syllable }) => syllable);
            }

            return line;
        }).filter(Boolean);

        const timedLines = parsedLines
            .filter(line => Number.isFinite(line.startTime))
            .sort((left, right) => left.startTime - right.startTime || left.sourceIndex - right.sourceIndex);

        timedLines.forEach((line, index) => {
            const nextStart = timedLines[index + 1]?.startTime;
            if (!Number.isFinite(line.endTime) || line.endTime <= line.startTime) {
                line.endTime = Number.isFinite(nextStart)
                    ? Math.max(line.startTime + 1, nextStart)
                    : Math.max(line.startTime + 1, durationMs || line.startTime + 3000);
            }
        });

        const payloadType = normalizeDisplayText(payload?.type).toLowerCase();
        const isWordType = payloadType === 'word';
        const isLineType = payloadType === 'line';
        const isPlainType = payloadType === 'none'
            || payloadType === 'plain'
            || payloadType === 'unsynced';
        const inferTypeFromContent = !isWordType && !isLineType && !isPlainType;
        const hasCompleteTiming = timedLines.length === parsedLines.length;
        const hasCompleteWordTiming = hasCompleteTiming
            && (isWordType || inferTypeFromContent)
            && timedLines.every(line => line.hasWordTiming);
        const groupedKaraokeLines = hasCompleteWordTiming
            ? groupParallelVocalLines(timedLines)
            : [];
        const karaokeLines = hasCompleteWordTiming
            ? splitLongSoloVocalLines(groupedKaraokeLines)
            : [];
        const karaoke = hasCompleteWordTiming
            ? karaokeLines.map(line => {
                const karaokeLine = { ...line };
                delete karaokeLine.sourceIndex;
                delete karaokeLine.hasWordTiming;
                if (!karaokeLine.vocals && !karaokeLine.syllables?.length) {
                    karaokeLine.syllables = [{
                        text: karaokeLine.text,
                        startTime: karaokeLine.startTime,
                        endTime: karaokeLine.endTime
                    }];
                }
                return karaokeLine;
            })
            : null;

        const synced = hasCompleteTiming && !isPlainType ? timedLines.map(line => ({
            startTime: line.startTime,
            endTime: line.endTime,
            text: line.text,
            originalText: line.originalText,
            speaker: line.speaker,
            'speaker-color': line['speaker-color'],
            'speaker-fallback': line['speaker-fallback'],
            kind: line.kind,
            lyricsPlusLineKey: line.lyricsPlusLineKey,
            lyricsPlusSinger: line.lyricsPlusSinger,
            lyricsPlusAgentType: line.lyricsPlusAgentType,
            lyricsPlusAgentName: line.lyricsPlusAgentName,
            lyricsPlusAgentAlias: line.lyricsPlusAgentAlias,
            lyricsPlusSongPartIndex: line.lyricsPlusSongPartIndex,
            lyricsPlusSongPart: line.lyricsPlusSongPart
        })) : [];
        const unsynced = parsedLines
            .sort((left, right) => left.sourceIndex - right.sourceIndex)
            .map(line => ({
                text: line.text,
                originalText: line.originalText,
                lyricsPlusLineKey: line.lyricsPlusLineKey,
                lyricsPlusSinger: line.lyricsPlusSinger,
                lyricsPlusAgentType: line.lyricsPlusAgentType,
                lyricsPlusAgentName: line.lyricsPlusAgentName,
                lyricsPlusAgentAlias: line.lyricsPlusAgentAlias,
                lyricsPlusSongPartIndex: line.lyricsPlusSongPartIndex,
                lyricsPlusSongPart: line.lyricsPlusSongPart
            }));

        return {
            karaoke: karaoke?.length ? karaoke : null,
            karaokeGranularity: karaoke?.length ? 'word' : null,
            synced: synced.length ? synced : null,
            unsynced: unsynced.length ? unsynced : null
        };
    }

    const LyricsPlusLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            window.__ivLyricsDebugLog?.(`[LyricsPlus Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function LyricsPlusLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings lyricsplus-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, 'LyricsPlus'),
                            React.createElement('p', { style: { marginBottom: '8px' } }, ATTRIBUTION),
                            React.createElement('a', {
                                href: 'https://github.com/ibratabian17/lyricsplus',
                                target: '_blank',
                                rel: 'noreferrer'
                            }, 'github.com/ibratabian17/lyricsplus')
                        )
                    )
                );
            };
        },

        async getLyrics(info) {
            const result = {
                uri: info?.uri || '',
                provider: ADDON_INFO.id,
                cacheVersion: CACHE_VERSION,
                karaoke: null,
                synced: null,
                unsynced: null,
                karaokeSource: null,
                copyright: ATTRIBUTION,
                error: null
            };

            try {
                const fetched = await fetchLyricsData(info);
                if (!fetched) {
                    result.error = 'No lyrics';
                    return result;
                }

                const parsed = parseLyricsPayload(fetched.data, normalizeDurationMs(info));
                result.karaoke = parsed.karaoke;
                result.karaokeGranularity = parsed.karaokeGranularity;
                result.synced = parsed.synced;
                result.unsynced = parsed.unsynced;
                result.karaokeSource = result.karaoke ? ADDON_INFO.id : null;
                result.isrc = fetched.isrc || null;
                result.lyricsPlus = {
                    mirror: fetched.mirror,
                    type: fetched.data?.type || null,
                    source: fetched.data?.metadata?.source || null,
                    language: fetched.data?.metadata?.language || null,
                    cached: fetched.data?.cached ?? null,
                    title: fetched.data?.metadata?.title || null,
                    songWriters: Array.isArray(fetched.data?.metadata?.songWriters)
                        ? fetched.data.metadata.songWriters
                        : [],
                    agents: fetched.data?.metadata?.agents || {},
                    songParts: Array.isArray(fetched.data?.metadata?.songParts)
                        ? fetched.data.metadata.songParts
                        : [],
                    totalDuration: fetched.data?.metadata?.totalDuration || null
                };

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No usable lyrics';
                }

                window.__ivLyricsDebugLog?.('[LyricsPlus Lyrics Addon] Loaded lyrics', {
                    mirror: result.lyricsPlus.mirror,
                    type: result.lyricsPlus.type,
                    source: result.lyricsPlus.source,
                    karaokeLines: result.karaoke?.length || 0,
                    syncedLines: result.synced?.length || 0,
                    unsyncedLines: result.unsynced?.length || 0
                });
                return result;
            } catch (error) {
                result.error = error?.name === 'AbortError'
                    ? 'Request timed out'
                    : (error?.message || 'Request error');
                console.warn('[LyricsPlus Lyrics Addon] Failed to load lyrics:', error);
                return result;
            }
        }
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(LyricsPlusLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    window.LyricsPlusLyricsAddon = LyricsPlusLyricsAddon;
    window.__ivLyricsPlusDebug = Object.freeze({
        decodeBase64Twice,
        getApiBases,
        buildLyricsUrl,
        normalizeIsrc,
        resolveTrackIsrc,
        getSpeakerPresentation,
        groupParallelVocalLines,
        measureLyricsDisplayWidth,
        splitLongSoloVocalLine,
        splitLongSoloVocalLines,
        parseLyricsPayload,
        fetchLyricsData
    });

    registerAddon();
    window.__ivLyricsDebugLog?.('[LyricsPlus Lyrics Addon] Module loaded');
})();
