/**
 * Lyrically (Paxsenix) Provider Addon
 * Resolves lyrics through the public Lyrically API.
 *
 * @addon-type lyrics
 * @id paxsenix
 * @name Lyrically (Paxsenix)
 * @version 1.0.7
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

(() => {
    'use strict';

    const decodeEndpoint = encoded => atob(encoded);
    const ENDPOINTS = Object.freeze({
        homepage: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3Jn'),
        catalogSearch: decodeEndpoint('aHR0cHM6Ly9pdHVuZXMuYXBwbGUuY29tL3NlYXJjaA=='),
        readerPrefix: decodeEndpoint('aHR0cHM6Ly9yLmppbmEuYWkvaHR0cDovLw=='),
        providerSearch: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2t1Z291L3NlYXJjaA=='),
        providerLyrics: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2t1Z291L2x5cmljcw=='),
        catalogLyrics: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2FwcGxlLW11c2ljL2x5cmljcw==')
    });
    const STRUCTURED_PROVIDER_ID = atob('a3Vnb3U=');
    const getEndpointLabel = value => String(value || '').split('://').pop().replace(/\/$/, '');
    const CATALOG_SEARCH_HOST = new URL(ENDPOINTS.catalogSearch).hostname;
    const ATTRIBUTION = `Lyrics via Lyrically API (${ENDPOINTS.homepage}).`;
    const CACHE_VERSION = 'paxsenix-provider-v16';
    const REQUEST_TIMEOUT_MS = 9000;
    const PROVIDER_TIMEOUT_MS = 12000;
    const JAPANESE_LINE_SPLIT_TRIGGER_WIDTH = 22;
    const JAPANESE_LINE_SPLIT_HARD_WIDTH = 26;
    const JAPANESE_LINE_SPLIT_MIN_WIDTH = 6;
    const JAPANESE_LINE_SPLIT_MIN_DURATION_MS = 500;
    const JAPANESE_LINE_SPLIT_MAX_SEGMENTS = 4;
    const DISPLAY_MARK_PATTERN = /\p{Mark}/u;
    const DISPLAY_WHITESPACE_PATTERN = /[\s\u3000]/u;
    const DISPLAY_FULL_WIDTH_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;
    const DISPLAY_UPPERCASE_PATTERN = /[A-Z]/u;
    const DISPLAY_LOWERCASE_PATTERN = /[a-z]/u;
    const DISPLAY_NUMBER_PATTERN = /\p{Number}/u;
    const DISPLAY_PUNCTUATION_PATTERN = /[.,'’!?;:()\-]/u;

    const SPEAKER_PALETTE = [
        { color: '#a8ccff', fallback: 'MALE 1' },
        { color: '#ffb8c7', fallback: 'FEMALE 1' },
        { color: '#e4d8ff', fallback: 'DUET 1' },
        { color: '#9ae8d4', fallback: 'MALE 2' },
        { color: '#ffd6b3', fallback: 'FEMALE 2' },
        { color: '#d6e4ff', fallback: 'DUET 2' }
    ];

    const ADDON_INFO = {
        id: 'paxsenix',
        name: 'Lyrically (Paxsenix)',
        author: 'default',
        version: '1.0.7',
        cacheVersion: CACHE_VERSION,
        description: {
            en: 'Lyrics through the public Lyrically API',
            ko: 'Lyrically 공개 API에서 가사를 가져옵니다'
        },
        supports: {
            karaoke: true,
            karaokeCharacter: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        icon: 'M5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 7h8v2H8V7zm0 8h8v2H8v-2z'
    };

    function normalizeDurationMilliseconds(info) {
        const raw = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
        if (!Number.isFinite(raw) || raw <= 0) return 0;
        return raw > 10000 ? Math.round(raw) : Math.round(raw * 1000);
    }

    function normalizeComparable(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase()
            .replace(/[’‘`´]/g, "'")
            .replace(/\b(feat(?:uring)?|ft)\.?\b/gi, ' ')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function normalizeTitleCore(value) {
        return normalizeComparable(
            String(value || '')
                .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
                .replace(/\s+-\s+(?:remaster(?:ed)?|live|version|edit|mix).*$/i, ' ')
        );
    }

    function tokenOverlap(left, right) {
        const leftTokens = new Set(normalizeComparable(left).split(' ').filter(token => token.length > 1));
        const rightTokens = new Set(normalizeComparable(right).split(' ').filter(token => token.length > 1));
        if (!leftTokens.size || !rightTokens.size) return 0;
        let matches = 0;
        leftTokens.forEach(token => {
            if (rightTokens.has(token)) matches += 1;
        });
        return matches / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
    }

    function scoreText(expected, actual, weight, useTitleCore = false) {
        const normalize = useTitleCore ? normalizeTitleCore : normalizeComparable;
        const left = normalize(expected);
        const right = normalize(actual);
        if (!left || !right) return 0;
        if (left === right) return weight;
        if (left.includes(right) || right.includes(left)) return weight * 0.78;
        return weight * 0.62 * tokenOverlap(left, right);
    }

    function scoreCandidate(candidate, info) {
        const artistScore = scoreText(info?.artist, candidate?.artist, 30);
        const albumScore = scoreText(info?.album, candidate?.album, 30);
        let score = scoreText(info?.title, candidate?.title, 70, true);
        if (normalizeComparable(info?.title) === normalizeComparable(candidate?.title)) score += 18;
        score += artistScore;
        score += albumScore;

        // An exact title alone is too weak for common covers. Cross-script artist names can
        // still match through album and duration, but a candidate with neither should lose.
        if (info?.artist && candidate?.artist && artistScore === 0 && albumScore === 0) {
            score -= 72;
        }

        const expectedDuration = normalizeDurationMilliseconds(info) / 1000;
        const candidateDuration = Number(candidate?.durationSeconds || 0);
        if (expectedDuration > 0 && candidateDuration > 0) {
            const difference = Math.abs(expectedDuration - candidateDuration);
            if (difference <= 2) score += 24;
            else if (difference <= 5) score += 18;
            else if (difference <= 15) score += 8;
            else if (difference > 60) score -= 20;
        }
        return score;
    }

    function selectBestCandidate(candidates, info) {
        const ranked = (Array.isArray(candidates) ? candidates : [])
            .filter(candidate => candidate?.id)
            .map(candidate => ({ candidate, score: scoreCandidate(candidate, info) }))
            .sort((left, right) => right.score - left.score);
        return ranked[0]?.score >= 45 ? ranked[0] : null;
    }

    function parseJinaReaderBody(text) {
        const raw = String(text || '');
        const marker = 'Markdown Content:';
        const markerIndex = raw.indexOf(marker);
        let content = markerIndex >= 0
            ? raw.slice(markerIndex + marker.length).trim()
            : raw.trim();
        content = content
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        try {
            return JSON.parse(content);
        } catch (_error) {
            return null;
        }
    }

    async function fetchJson(url, parentSignal = null) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const abortFromParent = () => controller?.abort();
        if (parentSignal?.aborted) abortFromParent();
        else parentSignal?.addEventListener?.('abort', abortFromParent, { once: true });
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        try {
            try {
                const response = await fetch(url.toString(), {
                    headers: { Accept: 'application/json' },
                    credentials: 'omit',
                    signal: controller?.signal
                });
                const body = await response.json().catch(() => null);
                return { response, body, transport: 'direct' };
            } catch (error) {
                if (controller?.signal?.aborted || url.hostname !== CATALOG_SEARCH_HOST) throw error;
                const response = await fetch(`${ENDPOINTS.readerPrefix}${url.toString()}`, {
                    headers: { Accept: 'text/plain' },
                    credentials: 'omit',
                    signal: controller?.signal
                });
                const body = parseJinaReaderBody(await response.text());
                return { response, body, transport: 'jina-reader' };
            }
        } finally {
            if (timer) clearTimeout(timer);
            parentSignal?.removeEventListener?.('abort', abortFromParent);
        }
    }

    function buildSearchTerm(info) {
        return [info?.title, info?.artist].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    }

    async function fetchStructuredCandidate(info, signal = null) {
        const searchUrl = new URL(ENDPOINTS.providerSearch);
        searchUrl.searchParams.set('q', buildSearchTerm(info));
        const search = await fetchJson(searchUrl, signal);
        if (!search.response.ok || !Array.isArray(search.body)) return null;

        const candidates = search.body.map(item => ({
            id: String(item?.hash || ''),
            title: item?.title || '',
            artist: item?.artist || '',
            album: item?.album || '',
            durationSeconds: Number(item?.duration || 0),
            raw: item
        }));
        const match = selectBestCandidate(candidates, info);
        if (!match) return null;

        // The non-word response still includes normalized syllable timings and the original
        // source text. That reference is needed to restore omitted zero-duration whitespace.
        for (const wordTiming of [false, true]) {
            const lyricsUrl = new URL(ENDPOINTS.providerLyrics);
            lyricsUrl.searchParams.set('id', match.candidate.id);
            lyricsUrl.searchParams.set('word', String(wordTiming));
            lyricsUrl.searchParams.set('v', '2');
            const lyrics = await fetchJson(lyricsUrl, signal);
            if (lyrics.response.ok && Array.isArray(lyrics.body?.lyrics) && lyrics.body.lyrics.length > 0) {
                return {
                    source: 'structured_api',
                    payload: lyrics.body,
                    match
                };
            }
        }
        return null;
    }

    async function fetchCatalogCandidate(info, signal = null) {
        const searchUrl = new URL(ENDPOINTS.catalogSearch);
        searchUrl.searchParams.set('term', buildSearchTerm(info));
        searchUrl.searchParams.set('entity', 'song');
        searchUrl.searchParams.set('limit', '25');
        const search = await fetchJson(searchUrl, signal);
        if (!search.response.ok || !Array.isArray(search.body?.results)) return null;

        const candidates = search.body.results.map(item => ({
            id: String(item?.trackId || ''),
            title: item?.trackName || '',
            artist: item?.artistName || '',
            album: item?.collectionName || '',
            durationSeconds: Number(item?.trackTimeMillis || 0) / 1000,
            raw: item
        }));
        const match = selectBestCandidate(candidates, info);
        if (!match) return null;

        const lyricsUrl = new URL(ENDPOINTS.catalogLyrics);
        lyricsUrl.searchParams.set('id', match.candidate.id);
        lyricsUrl.searchParams.set('v', '2');
        const lyrics = await fetchJson(lyricsUrl, signal);
        if (!lyrics.response.ok || !Array.isArray(lyrics.body?.lyrics) || lyrics.body.lyrics.length === 0) {
            return null;
        }
        return {
            source: 'catalog_api',
            payload: lyrics.body,
            match
        };
    }

    function toMilliseconds(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
    }

    const XML_TEXT_ENTITIES = Object.freeze({
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        quot: '"'
    });

    /**
     * Decode one layer of XML character references in provider lyric text.
     * This intentionally does not use a DOM/HTML parser: unknown or malformed
     * references and literal ampersands remain untouched, and encoded entity
     * text such as `&amp;apos;` is not decoded twice.
     */
    function decodeLyricTextEntities(value) {
        const text = String(value ?? '');
        if (!text.includes('&')) return text;

        return text.replace(
            /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([a-z]+));/g,
            (match, decimal, hexadecimal, named) => {
                if (named) {
                    return Object.prototype.hasOwnProperty.call(XML_TEXT_ENTITIES, named)
                        ? XML_TEXT_ENTITIES[named]
                        : match;
                }

                const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
                const isUnicodeScalar = Number.isInteger(codePoint)
                    && codePoint > 0
                    && codePoint <= 0x10FFFF
                    && !(codePoint >= 0xD800 && codePoint <= 0xDFFF);
                return isUnicodeScalar ? String.fromCodePoint(codePoint) : match;
            }
        );
    }

    function shouldAppendBoundary(item, nextItem, text) {
        if (!nextItem || item?.part !== false || /\s$/.test(text)) return false;
        const nextText = decodeLyricTextEntities(nextItem?.text);
        if (!nextText || /^\s|^['’,.;:!?%)\]}]/u.test(nextText)) return false;
        if (/[-‐‑‒–—'’]$/.test(text)) return false;
        return true;
    }

    function parseStructuredReferenceLines(payload) {
        const rawText = payload?.metadata?.rawData?.lyrics_text
            || payload?.rawData?.lyrics_text
            || '';
        const references = new Map();
        String(rawText).split(/\r?\n/).forEach(rawLine => {
            const match = rawLine.match(/^\[(\d+),(\d+)\](.*)$/);
            if (!match) return;
            const timestamp = Number(match[1]);
            const text = match[3].replace(/<\d+,\d+,\d+>/g, '');
            if (Number.isFinite(timestamp)) references.set(timestamp, text);
        });
        return references;
    }

    function normalizeDecodedReferenceSpacingCharacters(value) {
        return String(value ?? '')
            .normalize('NFKC')
            .replace(/[“”„‟]/g, '"')
            .replace(/[‘’‚‛]/g, "'")
            .replace(/\s/gu, '');
    }

    function normalizeReferenceSpacingCharacters(value) {
        return normalizeDecodedReferenceSpacingCharacters(decodeLyricTextEntities(value));
    }

    function getReferenceWhitespaceBoundaries(items, referenceText) {
        if (!Array.isArray(items) || !items.length || typeof referenceText !== 'string') return null;
        const compactTokens = items.map(item => normalizeReferenceSpacingCharacters(item?.text));
        if (compactTokens.some(text => !text)) return null;

        const decodedReference = decodeLyricTextEntities(referenceText);
        const compactReference = normalizeDecodedReferenceSpacingCharacters(decodedReference);
        if (compactTokens.join('') !== compactReference) return null;

        const boundaries = new Set();
        let characterCount = 0;
        decodedReference.split(/(\s+)/u).forEach(segment => {
            if (/^\s+$/u.test(segment)) {
                if (characterCount > 0) boundaries.add(characterCount);
            } else {
                characterCount += Array.from(normalizeDecodedReferenceSpacingCharacters(segment)).length;
            }
        });
        return boundaries;
    }

    function parseTimedTokens(items, fallbackStart, fallbackEnd, referenceText = null) {
        if (!Array.isArray(items)) return [];
        const referenceBoundaries = getReferenceWhitespaceBoundaries(items, referenceText);
        let consumedCharacters = 0;
        return items.map((item, index) => {
            let text = decodeLyricTextEntities(item?.text);
            if (!text) return null;
            if (referenceBoundaries) {
                text = text.trim();
                consumedCharacters += Array.from(normalizeDecodedReferenceSpacingCharacters(text)).length;
                if (items[index + 1] && referenceBoundaries.has(consumedCharacters)) text += ' ';
            } else if (shouldAppendBoundary(item, items[index + 1], text)) {
                text += ' ';
            }
            const startTime = toMilliseconds(item?.timestamp) ?? fallbackStart;
            const nextStart = toMilliseconds(items[index + 1]?.timestamp);
            const endTime = toMilliseconds(item?.endtime)
                ?? (Number.isFinite(nextStart) ? nextStart : fallbackEnd);
            return {
                text,
                startTime,
                endTime: Math.max(startTime + 1, endTime)
            };
        }).filter(Boolean);
    }

    function getSpeakerPresentation(line, agentOrder) {
        const agent = String(line?.agent || '').trim();
        let index = agent ? agentOrder.get(agent) : null;
        if (!Number.isFinite(index)) index = line?.oppositeTurn ? 1 : 0;
        if (index <= 0) {
            return { speaker: 'NORMAL', paxsenixAgent: agent || null };
        }
        const palette = SPEAKER_PALETTE[(index - 1) % SPEAKER_PALETTE.length];
        return {
            speaker: 'CUSTOM',
            'speaker-color': palette.color,
            'speaker-fallback': palette.fallback,
            paxsenixAgent: agent || null
        };
    }

    function createVocalPart(id, role, syllables, presentation) {
        if (!Array.isArray(syllables) || syllables.length === 0) return null;
        const text = syllables.map(item => item.text).join('').trim();
        if (!text) return null;
        return {
            id,
            role,
            ...presentation,
            kind: 'vocal',
            text,
            syllables,
            startTime: Math.min(...syllables.map(item => item.startTime)),
            endTime: Math.max(...syllables.map(item => item.endTime))
        };
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

    function isJapaneseLyricsPayload(payload) {
        const languageValues = [
            payload?.metadata?.language,
            payload?.metadata?.languageTag,
            payload?.language,
            payload?.languageTag
        ];
        return languageValues.some(value => /^ja(?:[-_]|$)/iu.test(String(value || '').trim()));
    }

    function normalizeSplitComparisonText(value) {
        return String(value || '').replace(/[\s\u3000]+/gu, ' ').trim();
    }

    function getJapaneseLineSplitPlan(syllables, totalWidth) {
        const candidateBoundaries = new Map();
        for (let index = 1; index < syllables.length; index++) {
            const left = syllables[index - 1];
            const right = syllables[index];
            const hasWhitespace = /[\s\u3000]$/u.test(String(left?.text || ''))
                || /^[\s\u3000]/u.test(String(right?.text || ''));
            const leftEndTime = Number(left?.endTime);
            const rightStartTime = Number(right?.startTime);
            if (!hasWhitespace
                || !Number.isFinite(leftEndTime)
                || !Number.isFinite(rightStartTime)
                || leftEndTime > rightStartTime) {
                continue;
            }
            candidateBoundaries.set(index, Math.max(0, rightStartTime - leftEndTime));
        }
        if (candidateBoundaries.size === 0) return null;

        const rawTexts = syllables.map(syllable => String(syllable?.text || ''));
        const maximumSegmentCount = Math.min(
            JAPANESE_LINE_SPLIT_MAX_SEGMENTS,
            candidateBoundaries.size + 1,
            syllables.length
        );
        const minimumSegmentCount = Math.max(
            2,
            Math.ceil(totalWidth / JAPANESE_LINE_SPLIT_HARD_WIDTH)
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
                    const last = syllables.at(-1);
                    const duration = Number(last?.endTime) - Number(first?.startTime);
                    const result = width >= JAPANESE_LINE_SPLIT_MIN_WIDTH
                        && width <= JAPANESE_LINE_SPLIT_HARD_WIDTH
                        && duration >= JAPANESE_LINE_SPLIT_MIN_DURATION_MS
                        ? { cost: Math.pow(width - targetWidth, 2), boundaries: [] }
                        : null;
                    memo.set(memoKey, result);
                    return result;
                }

                let best = null;
                const maximumEndIndex = syllables.length - (remainingSegments - 1);
                for (let endIndex = startIndex + 1; endIndex <= maximumEndIndex; endIndex++) {
                    const gapMs = candidateBoundaries.get(endIndex);
                    if (!Number.isFinite(gapMs)) continue;

                    const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex, endIndex).join(''));
                    const first = syllables[startIndex];
                    const last = syllables[endIndex - 1];
                    const duration = Number(last?.endTime) - Number(first?.startTime);
                    if (width < JAPANESE_LINE_SPLIT_MIN_WIDTH
                        || width > JAPANESE_LINE_SPLIT_HARD_WIDTH
                        || duration < JAPANESE_LINE_SPLIT_MIN_DURATION_MS) {
                        continue;
                    }

                    const remaining = search(endIndex, remainingSegments - 1);
                    if (!remaining) continue;
                    const timingGapBonus = Math.min(gapMs / 200, 1);
                    const cost = Math.pow(width - targetWidth, 2) - timingGapBonus + remaining.cost;
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

    function splitLongJapaneseLine(line, previousLine = null, nextLine = null) {
        const syllables = Array.isArray(line?.syllables) ? line.syllables : [];
        if (syllables.length < 2 || line?.vocals || line?.paxsenixSegmentCount) return [line];

        for (let index = 0; index < syllables.length; index++) {
            const syllable = syllables[index];
            const previous = syllables[index - 1];
            if (!String(syllable?.text || '').trim()
                || !Number.isFinite(syllable?.startTime)
                || !Number.isFinite(syllable?.endTime)
                || syllable.endTime < syllable.startTime
                || (previous && (
                    syllable.startTime <= previous.startTime
                    || syllable.startTime < previous.endTime
                ))) {
                return [line];
            }
        }

        const firstSyllable = syllables[0];
        const lastSyllable = syllables.at(-1);
        if ((Number.isFinite(previousLine?.endTime) && previousLine.endTime > firstSyllable.startTime)
            || (Number.isFinite(nextLine?.startTime) && nextLine.startTime < lastSyllable.endTime)) {
            return [line];
        }

        const lineText = normalizeSplitComparisonText(line?.text);
        const syllableText = normalizeSplitComparisonText(syllables.map(syllable => syllable.text).join(''));
        const totalWidth = measureLyricsDisplayWidth(lineText);
        if (!lineText
            || lineText !== syllableText
            || totalWidth <= JAPANESE_LINE_SPLIT_TRIGGER_WIDTH
            || syllables.some(syllable => (
                measureLyricsDisplayWidth(syllable.text) > JAPANESE_LINE_SPLIT_HARD_WIDTH
            ))) {
            return [line];
        }

        const plan = getJapaneseLineSplitPlan(syllables, totalWidth);
        if (!plan || plan.length < 3) return [line];

        const sourceLineKey = String(line.paxsenixSourceLineKey || line.paxsenixLineKey || 'line');
        const fragmentCount = plan.length - 1;
        const fragments = plan.slice(0, -1).map((startIndex, fragmentIndex) => {
            const endIndex = plan[fragmentIndex + 1];
            const fragmentSyllables = syllables.slice(startIndex, endIndex);
            const first = fragmentSyllables[0];
            const last = fragmentSyllables.at(-1);
            return {
                ...line,
                startTime: fragmentIndex === 0 ? Math.min(line.startTime, first.startTime) : first.startTime,
                endTime: fragmentIndex === fragmentCount - 1
                    ? Math.max(line.endTime, last.endTime)
                    : last.endTime,
                text: fragmentSyllables.map(syllable => syllable.text).join('').trim(),
                syllables: fragmentSyllables,
                paxsenixLineKey: `${sourceLineKey}-ja-segment-${fragmentIndex + 1}`,
                paxsenixSourceLineKey: sourceLineKey,
                paxsenixSegmentIndex: fragmentIndex,
                paxsenixSegmentCount: fragmentCount
            };
        });

        const flattenedSyllables = fragments.flatMap(fragment => fragment.syllables);
        const preservesSyllables = flattenedSyllables.length === syllables.length
            && flattenedSyllables.every((syllable, index) => syllable === syllables[index]);
        const preservesText = normalizeSplitComparisonText(
            fragments.map(fragment => fragment.text).join(' ')
        ) === lineText;
        const hasSafeFragmentTiming = fragments.every((fragment, index) => (
            index === 0
            || (
                fragment.startTime > fragments[index - 1].startTime
                && fragments[index - 1].endTime <= fragment.startTime
            )
        ));
        return preservesSyllables && preservesText && hasSafeFragmentTiming
            ? fragments
            : [line];
    }

    function splitLongJapaneseLines(lines) {
        return (lines || []).flatMap((line, index, allLines) => (
            splitLongJapaneseLine(line, allLines[index - 1], allLines[index + 1])
        ));
    }

    function parsePlainLyrics(value) {
        const unsynced = String(value || '')
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map(line => decodeLyricTextEntities(line).trim())
            .filter(Boolean)
            .map(text => ({ text }));
        return { karaoke: null, synced: null, unsynced };
    }

    function getStructuredLineText(line, referenceText = null) {
        if (typeof referenceText === 'string' && referenceText.trim()) {
            return decodeLyricTextEntities(referenceText).trim();
        }
        if (Array.isArray(line?.text)) {
            return line.text.map(item => decodeLyricTextEntities(item?.text)).join('').trim();
        }
        return decodeLyricTextEntities(line?.text).trim();
    }

    function normalizeMetadataIdentity(value) {
        return normalizeTitleCore(value).replace(/\s+/gu, '');
    }

    function isTitleArtistMetadataHeader(text, info) {
        const expectedTitle = normalizeMetadataIdentity(info?.title);
        if (!expectedTitle) return false;
        const expectedArtist = normalizeMetadataIdentity(info?.artist);

        for (const separator of String(text || '').matchAll(/[-‐‑‒–—]/gu)) {
            const titlePart = String(text).slice(0, separator.index).trim();
            const artistPart = String(text).slice(separator.index + separator[0].length).trim();
            const normalizedLeft = normalizeMetadataIdentity(titlePart);
            const normalizedRight = normalizeMetadataIdentity(artistPart);
            if (!normalizedLeft || !normalizedRight) continue;
            if (normalizedLeft === expectedTitle) return true;

            const isExpectedArtist = !expectedArtist
                || normalizedLeft === expectedArtist
                || normalizedLeft.includes(expectedArtist)
                || expectedArtist.includes(normalizedLeft);
            if (normalizedRight === expectedTitle && isExpectedArtist) return true;
        }
        return false;
    }

    const STRUCTURED_CREDIT_LABELS = new Set([
        '词', '詞', '作词', '作詞', '填词', '填詞', '词曲', '詞曲',
        '曲', '作曲', '编曲', '編曲', '弦编曲', '弦編曲', '弦乐编曲', '弦樂編曲',
        'lyrics', 'lyric', 'lyricsby', 'lyricby', 'lyricist',
        'composedby', 'composer', 'musicby',
        'arrangedby', 'arranger', 'stringsarrangedby',
        'producedby', 'producer', '制作', '製作', '制作人', '製作人',
        '翻译', '翻譯', 'translatedby',
        '歌手', '演唱', '原唱', '原曲', '录音', '錄音', '混音', '和声', '和聲',
        'vocal', 'vocals', 'vocalby', 'vocalsby',
        'mixby', 'mixedby', 'mixingby', 'masteredby', 'masteringby'
    ]);

    function getCreditMetadataParts(text) {
        const normalized = String(text || '').normalize('NFKC').trim();
        const separatorIndex = normalized.search(/[:：]/u);
        if (separatorIndex <= 0 || !normalized.slice(separatorIndex + 1).trim()) return null;

        const label = normalized
            .slice(0, separatorIndex)
            .toLocaleLowerCase()
            .replace(/[\s._-]+/gu, '');
        if (!STRUCTURED_CREDIT_LABELS.has(label)) return null;
        return { label, value: normalized.slice(separatorIndex + 1).trim() };
    }

    function isCreditMetadataText(text) {
        return getCreditMetadataParts(text) !== null;
    }

    const CREDIT_NAME_CONNECTORS = new Set([
        'and', 'de', 'del', 'der', 'di', 'du', 'la', 'le', 'of', 'the', 'van', 'von', 'y'
    ]);

    function isContributorNameSegment(name, requireEveryWord = false) {
        const normalized = String(name || '').normalize('NFKC').trim();
        if (!normalized || normalized.length > 64 || !/[\p{L}\p{N}]/u.test(normalized)) return false;
        if (/[^\p{L}\p{M}\p{N}\s.'’‘`´,&+()\-·・]/u.test(normalized)) return false;
        if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)) {
            return true;
        }

        const words = normalized.match(/[\p{L}\p{M}\p{N}]+(?:[.'’‘`´-][\p{L}\p{M}\p{N}]+)*/gu) || [];
        if (!words.length || words.length > 6) return false;

        const significantWords = words.filter(word => !CREDIT_NAME_CONNECTORS.has(word.toLocaleLowerCase()));
        if (!significantWords.length) return false;
        const isNameWord = word => {
            const firstLetter = word.match(/\p{L}/u)?.[0];
            if (!firstLetter) return /^\d+$/u.test(word);
            const startsWithUppercase = firstLetter === firstLetter.toLocaleUpperCase()
                && firstLetter !== firstLetter.toLocaleLowerCase();
            const isMixedCaseAlias = /\p{Ll}/u.test(word) && /\p{Lu}/u.test(word);
            return startsWithUppercase || isMixedCaseAlias;
        };
        return requireEveryWord
            ? significantWords.every(isNameWord)
            : significantWords.some(isNameWord);
    }

    function isContributorNameList(text, requireEveryWord = false) {
        const names = String(text || '').normalize('NFKC').split(/[/／⁄,，、]/u).map(value => value.trim());
        return names.length > 0 && names.every(name => isContributorNameSegment(name, requireEveryWord));
    }

    function isStrongCreditMetadataText(text) {
        const parts = getCreditMetadataParts(text);
        return Boolean(parts && isContributorNameList(parts.value));
    }

    function isCreditMetadataContinuationText(text) {
        const normalized = String(text || '').normalize('NFKC').trim();
        if (!normalized || normalized.length > 240 || /[:：]/u.test(normalized)) return false;
        if (!/[\p{L}\p{N}][/／⁄][\p{L}\p{N}]/u.test(normalized)) return false;
        return isContributorNameList(normalized);
    }

    function isLikelyLeadingHeaderName(text) {
        const normalized = String(text || '').normalize('NFKC').trim();
        if (!normalized || normalized.length > 160 || /[:：]/u.test(normalized)) return false;
        return isContributorNameList(normalized, true);
    }

    function identitiesOverlap(expected, actual) {
        if (!expected || !actual) return false;
        if (expected === actual) return true;
        return Math.min(expected.length, actual.length) >= 4
            && (expected.includes(actual) || actual.includes(expected));
    }

    function isDashSeparatedHeaderLikeText(text) {
        const normalized = String(text || '').normalize('NFKC').trim();
        if (!normalized || normalized.length > 240) return false;

        for (const separator of normalized.matchAll(/[-‐‑‒–—]/gu)) {
            const title = normalized.slice(0, separator.index).trim();
            const annotatedArtists = normalized.slice(separator.index + separator[0].length).trim();
            if (!/[\p{L}\p{N}]/u.test(title) || !/[\p{L}\p{N}]/u.test(annotatedArtists)) continue;

            const artists = annotatedArtists
                .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/gu, ' ')
                .trim();
            if (artists && isContributorNameList(artists)) return true;
        }
        return false;
    }

    function getEarlyCreditAnchorIndex(allLines, _info, referenceLines) {
        const lookahead = Math.min(allLines.length, 10);
        for (let index = 0; index < lookahead; index += 1) {
            const line = allLines[index];
            const startTime = toMilliseconds(line?.timestamp)
                ?? toMilliseconds(line?.text?.[0]?.timestamp)
                ?? 0;
            const text = getStructuredLineText(line, referenceLines.get(startTime));
            if (isCreditMetadataText(text)) return index;
        }
        return -1;
    }

    function isCopyrightMetadataText(text) {
        return /^(?:©|℗|ⓒ|\(c\)|\(p\)|copyright\b)/iu.test(
            String(text || '').normalize('NFKC').trim()
        );
    }

    function isTargetStructuredPayload(payload) {
        if (String(payload?.provider || '').toLowerCase() === STRUCTURED_PROVIDER_ID) return true;
        const rawFormat = payload?.metadata?.rawData?.format
            || payload?.rawData?.format
            || payload?.metadata?.format;
        return String(rawFormat || '').toLowerCase() === 'krc';
    }

    const NO_LYRICS_PLACEHOLDERS = new Set([
        '纯音乐请欣赏',
        '纯音乐请您欣赏',
        '纯音乐敬请欣赏',
        '純音樂請欣賞',
        '純音樂請您欣賞',
        '此歌曲为没有填词的纯音乐请您欣赏',
        '此歌曲為沒有填詞的純音樂請您欣賞',
        '该歌曲为纯音乐请您欣赏',
        '該歌曲為純音樂請您欣賞',
        '暂无歌词',
        '暫無歌詞',
        '没有歌词',
        '沒有歌詞'
    ]);

    function isNoLyricsPlaceholderText(text) {
        const normalized = String(text || '')
            .normalize('NFKC')
            .toLocaleLowerCase()
            .replace(/[\p{P}\p{S}\s]+/gu, '');
        return NO_LYRICS_PLACEHOLDERS.has(normalized);
    }

    function getLeadingMetadataLineIndexes(payload, info, referenceLines = new Map()) {
        const allLines = Array.isArray(payload?.lyrics) ? payload.lyrics : [];
        const metadataIndexes = new Set();
        if (!isTargetStructuredPayload(payload) || !allLines.length) return metadataIndexes;

        const limit = allLines.length;
        const earlyCreditAnchorIndex = getEarlyCreditAnchorIndex(allLines, info, referenceLines);
        let hasStrongMetadataAnchor = false;
        let acceptsCreditContinuation = false;
        for (let index = 0; index < limit; index += 1) {
            const line = allLines[index];
            const startTime = toMilliseconds(line?.timestamp)
                ?? toMilliseconds(line?.text?.[0]?.timestamp)
                ?? 0;
            const text = getStructuredLineText(line, referenceLines.get(startTime));
            const isTitleHeader = index === 0 && isTitleArtistMetadataHeader(text, info);
            const isEarlyHeaderContinuation = earlyCreditAnchorIndex > 0
                && index < earlyCreditAnchorIndex;
            const isCredit = isCreditMetadataText(text);
            const isCreditContinuation = acceptsCreditContinuation
                && isCreditMetadataContinuationText(text);
            const isCopyright = hasStrongMetadataAnchor && isCopyrightMetadataText(text);
            if (!isTitleHeader && !isEarlyHeaderContinuation && !isCredit && !isCreditContinuation && !isCopyright) break;

            if (isTitleHeader || isEarlyHeaderContinuation || isCredit) hasStrongMetadataAnchor = true;
            acceptsCreditContinuation = isCredit || isCreditContinuation;
            metadataIndexes.add(index);
        }
        return metadataIndexes;
    }

    function isLikelyMetadataCreditLine(line, index, allLines, info, payload = null) {
        const candidatePayload = payload || { provider: STRUCTURED_PROVIDER_ID, lyrics: allLines };
        return getLeadingMetadataLineIndexes(candidatePayload, info).has(index);
    }

    function parseStructuredLyrics(payload, requestedDurationMs, info = null) {
        const allLines = Array.isArray(payload?.lyrics) ? payload.lyrics : [];
        const referenceLines = parseStructuredReferenceLines(payload);
        const metadataIndexes = getLeadingMetadataLineIndexes(payload, info, referenceLines);
        const rawLines = allLines.filter((_line, index) => !metadataIndexes.has(index));
        if (!rawLines.length) return null;
        if (rawLines.length <= 3 && rawLines.every(line => {
            const backgroundText = Array.isArray(line?.backgroundText)
                ? line.backgroundText.map(item => decodeLyricTextEntities(item?.text)).join('').trim()
                : decodeLyricTextEntities(line?.backgroundText).trim();
            if (backgroundText) return false;
            const startTime = toMilliseconds(line?.timestamp)
                ?? toMilliseconds(line?.text?.[0]?.timestamp)
                ?? 0;
            return isNoLyricsPlaceholderText(getStructuredLineText(line, referenceLines.get(startTime)));
        })) return null;

        const metadataDuration = toMilliseconds(payload?.metadata?.duration) || 0;
        const durationMs = requestedDurationMs || metadataDuration;
        const agentOrder = new Map();
        (Array.isArray(payload?.metadata?.agents) ? payload.metadata.agents : []).forEach((agent, index) => {
            const id = String(agent?.id || '').trim();
            if (id && !agentOrder.has(id)) agentOrder.set(id, index);
        });
        rawLines.forEach(line => {
            const agent = String(line?.agent || '').trim();
            if (agent && !agentOrder.has(agent)) agentOrder.set(agent, agentOrder.size);
        });

        const rawStarts = rawLines.map(line => (
            toMilliseconds(line?.timestamp) ?? toMilliseconds(line?.text?.[0]?.timestamp) ?? 0
        ));
        const syncType = String(payload?.syncType || '').toLowerCase();
        const hasSyllableSync = syncType === 'syllable';

        const parsedLines = rawLines.map((line, index) => {
            const startTime = rawStarts[index];
            const nextStart = rawStarts[index + 1];
            let endTime = toMilliseconds(line?.endtime)
                ?? toMilliseconds(line?.text?.at?.(-1)?.endtime)
                ?? (Number.isFinite(nextStart) ? nextStart : startTime + 3000);

            if (durationMs > 0) endTime = Math.min(endTime, durationMs);
            endTime = Math.max(startTime + 1, endTime);

            const presentation = getSpeakerPresentation(line, agentOrder);
            const leadSyllables = parseTimedTokens(
                line?.text,
                startTime,
                endTime,
                referenceLines.get(startTime) ?? null
            ).map(syllable => ({
                ...syllable,
                endTime: Math.min(syllable.endTime, endTime)
            }));
            const backgroundSyllables = parseTimedTokens(line?.backgroundText, startTime, endTime).map(syllable => ({
                ...syllable,
                endTime: Math.min(syllable.endTime, endTime)
            }));
            const leadText = leadSyllables.map(item => item.text).join('').trim()
                || decodeLyricTextEntities(Array.isArray(line?.text) ? '' : line?.text).trim();
            const backgroundText = backgroundSyllables.map(item => item.text).join('').trim();
            if (!leadText && !backgroundText) return null;

            const key = String(line?.key || `line-${index + 1}`);
            const parsed = {
                startTime,
                endTime,
                text: [leadText, backgroundText].filter(Boolean).join(' '),
                ...presentation,
                kind: 'vocal',
                paxsenixLineKey: key,
                oppositeTurn: Boolean(line?.oppositeTurn)
            };

            if (hasSyllableSync && leadSyllables.length > 0) {
                const lead = createVocalPart(`${key}-lead`, 'lead', leadSyllables, presentation);
                const background = createVocalPart(
                    `${key}-background-1`,
                    'background',
                    backgroundSyllables,
                    presentation
                );
                if (lead && background) {
                    parsed.vocals = { lead, background: [background] };
                    parsed.startTime = Math.min(lead.startTime, background.startTime);
                    parsed.endTime = Math.max(lead.endTime, background.endTime);
                } else if (lead) {
                    parsed.syllables = lead.syllables;
                } else if (background) {
                    parsed.syllables = background.syllables;
                }
            }
            return parsed;
        }).filter(Boolean).sort((left, right) => left.startTime - right.startTime);

        if (!parsedLines.length) return null;
        const displayLines = hasSyllableSync && isJapaneseLyricsPayload(payload)
            ? splitLongJapaneseLines(parsedLines)
            : parsedLines;
        const karaoke = hasSyllableSync && displayLines.some(line => line.syllables?.length || line.vocals)
            ? displayLines
            : null;
        const synced = syncType !== 'none'
            ? displayLines.map(line => ({
                startTime: line.startTime,
                endTime: line.endTime,
                text: line.text,
                speaker: line.speaker,
                'speaker-color': line['speaker-color'],
                'speaker-fallback': line['speaker-fallback'],
                kind: line.kind,
                paxsenixLineKey: line.paxsenixLineKey
            }))
            : null;
        const unsynced = displayLines.map(line => ({ text: line.text }));
        return { karaoke, synced, unsynced };
    }

    function parsePayload(payload, durationMs, info = null) {
        const structured = parseStructuredLyrics(payload, durationMs, info);
        if (structured) return structured;

        const sharedParser = window.ivLyricsLyricsParser || window.__ivLyricsUnisonDebug;
        if (typeof payload?.ttmlContent === 'string' && typeof sharedParser?.parseTtmlLyrics === 'function') {
            return sharedParser.parseTtmlLyrics(payload.ttmlContent, durationMs);
        }
        if (typeof payload?.lrc === 'string' && typeof sharedParser?.parseLrcLyrics === 'function') {
            return sharedParser.parseLrcLyrics(decodeLyricTextEntities(payload.lrc), durationMs);
        }
        if (isTargetStructuredPayload(payload) && Array.isArray(payload?.lyrics)) return null;
        return parsePlainLyrics(payload?.plain || payload?.lyrics || '');
    }

    function getCandidateQuality(candidate) {
        const parsed = candidate?.parsed;
        const backgroundCount = parsed?.karaoke?.filter(line => line?.vocals?.background?.length).length || 0;
        const sourceBonus = candidate?.source === 'catalog_api' ? 2 : 0;
        if (parsed?.karaoke?.length) return 3000 + backgroundCount * 10 + sourceBonus + parsed.karaoke.length / 1000;
        if (parsed?.synced?.length) return 2000 + sourceBonus + parsed.synced.length / 1000;
        if (parsed?.unsynced?.length) return 1000 + sourceBonus + parsed.unsynced.length / 1000;
        return 0;
    }

    async function fetchBestLyrics(info, signal = null) {
        const durationMs = normalizeDurationMilliseconds(info);
        const attempts = await Promise.allSettled([
            fetchCatalogCandidate(info, signal),
            fetchStructuredCandidate(info, signal)
        ]);
        const candidates = attempts
            .filter(attempt => attempt.status === 'fulfilled' && attempt.value)
            .map(attempt => {
                const candidate = attempt.value;
                return { ...candidate, parsed: parsePayload(candidate.payload, durationMs, info) };
            })
            .filter(candidate => getCandidateQuality(candidate) > 0)
            .sort((left, right) => getCandidateQuality(right) - getCandidateQuality(left));
        if (!candidates.length) {
            const timeout = attempts.find(attempt => (
                attempt.status === 'rejected'
                && (attempt.reason?.name === 'AbortError' || attempt.reason?.name === 'TimeoutError')
            ));
            if (timeout && attempts.every(attempt => attempt.status === 'rejected')) throw timeout.reason;
        }
        return candidates[0] || null;
    }

    const PaxsenixLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            window.__ivLyricsDebugLog?.(`[Paxsenix Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function PaxsenixLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings paxsenix-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, ADDON_INFO.name),
                            React.createElement('p', { style: { marginBottom: '8px' } }, ATTRIBUTION),
                            React.createElement('a', {
                                href: ENDPOINTS.homepage,
                                target: '_blank',
                                rel: 'noopener noreferrer'
                            }, getEndpointLabel(ENDPOINTS.homepage))
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

            const title = String(info?.title || '').trim();
            const artist = String(info?.artist || '').trim();
            if (!title || !artist) {
                result.error = 'Missing track metadata';
                return result;
            }

            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timeout = controller ? setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS) : null;
            try {
                const candidate = await fetchBestLyrics(info, controller?.signal || null);
                if (!candidate) {
                    result.error = 'No lyrics';
                    return result;
                }

                result.karaoke = candidate.parsed.karaoke?.length ? candidate.parsed.karaoke : null;
                result.synced = candidate.parsed.synced?.length ? candidate.parsed.synced : null;
                result.unsynced = candidate.parsed.unsynced?.length ? candidate.parsed.unsynced : null;
                result.karaokeSource = result.karaoke ? ADDON_INFO.id : null;
                result.paxsenix = {
                    upstream: candidate.source,
                    syncType: candidate.payload?.syncType || null,
                    matchedTitle: candidate.match?.candidate?.title || null,
                    matchedArtist: candidate.match?.candidate?.artist || null,
                    matchScore: candidate.match?.score ?? null,
                    sourceUrl: ENDPOINTS.homepage
                };
                return result;
            } catch (error) {
                const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
                result.error = timedOut ? 'Request timed out' : (error?.message || 'Request error');
                console.warn('[Paxsenix Lyrics Addon] Failed to load lyrics:', error);
                return result;
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(PaxsenixLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    window.PaxsenixLyricsAddon = PaxsenixLyricsAddon;
    window.__ivLyricsPaxsenixDebug = Object.freeze({
        normalizeDurationMilliseconds,
        normalizeComparable,
        normalizeTitleCore,
        scoreCandidate,
        selectBestCandidate,
        parseJinaReaderBody,
        decodeLyricTextEntities,
        parseTimedTokens,
        parseStructuredReferenceLines,
        normalizeReferenceSpacingCharacters,
        getReferenceWhitespaceBoundaries,
        measureLyricsDisplayWidth,
        isJapaneseLyricsPayload,
        getJapaneseLineSplitPlan,
        splitLongJapaneseLine,
        splitLongJapaneseLines,
        isTitleArtistMetadataHeader,
        isCreditMetadataText,
        isStrongCreditMetadataText,
        isCreditMetadataContinuationText,
        isCopyrightMetadataText,
        isNoLyricsPlaceholderText,
        getLeadingMetadataLineIndexes,
        isLikelyMetadataCreditLine,
        parseStructuredLyrics,
        parsePayload,
        getCandidateQuality
    });

    registerAddon();
    window.__ivLyricsDebugLog?.('[Paxsenix Lyrics Addon] Module loaded');
})();
