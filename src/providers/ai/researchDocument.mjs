// Versioned normalization, source validation and streaming parsing for music research.

    const RESEARCH_OUTPUT_VERSION = '5.2';
    const RESEARCH_CACHE_VERSION = 'research-v7';
    const RESEARCH_MAX_LYRIC_CHARS = 16_000;
    const RESEARCH_MAX_LYRIC_LINE_CHARS = 600;
    const RESEARCH_WEB_SEARCH_ERROR_CODE = 'RESEARCH_WEB_SEARCH_FAILED';

    const isResearchWebSearchFailure = (error) => {
        if (!error) return false;
        const message = String(error.message || '');
        if (/(?:MAX[_\s-]*(?:OUTPUT[_\s-]*)?TOKENS?|max[_\s-]*(?:output[_\s-]*)?tokens?|finish[_\s-]*reason[^\n]*(?:length|token)|context[_\s-]*length)/i.test(message)) {
            return false;
        }
        if (error.code === RESEARCH_WEB_SEARCH_ERROR_CODE || error.researchWebSearchFailed === true) {
            return true;
        }

        return /\bweb[\s_-]*search\b[^\n]*(?:fail|error|unavailable|unsupported|disabled|timed?\s*out|empty)/i.test(message)
            || /\b(?:google_search|web_search)\b/i.test(message)
            || /\btools?\b[^\n]*(?:unsupported|not supported|unavailable|invalid|unknown)/i.test(message);
    };

    const isResearchObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

    const asResearchText = (value, fallback = '') => {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return fallback;
    };

    const asResearchTextArray = (value) => {
        if (!Array.isArray(value)) return [];
        return value.map((entry) => asResearchText(entry)).filter(Boolean);
    };

    const parseResearchJson = (value) => {
        if (isResearchObject(value)) return value;
        if (typeof value !== 'string') return {};
        const cleaned = value
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        try {
            const parsed = JSON.parse(cleaned);
            return isResearchObject(parsed) ? parsed : {};
        } catch {
            return {};
        }
    };

    function createResearchStreamProgressParser(onDocument, onProgressError = () => {}) {
        let buffer = '';
        let cursor = 0;
        let depth = 0;
        let rootStarted = false;
        let inString = false;
        let escaped = false;
        let stringStart = -1;
        let stringRole = '';
        let expectingKey = false;
        let expectingColon = false;
        let expectingValue = false;
        let awaitingComma = false;
        let currentKey = '';
        let valueStart = -1;
        let valueKind = '';
        const document = {};

        const emit = () => {
            try {
                onDocument({ ...document });
            } catch (error) {
                onProgressError(error);
            }
        };

        const completeValue = (end) => {
            if (!currentKey || valueStart < 0 || end <= valueStart) return;
            try {
                document[currentKey] = JSON.parse(buffer.slice(valueStart, end));
                emit();
            } catch {
                return;
            }
            currentKey = '';
            valueStart = -1;
            valueKind = '';
            expectingValue = false;
            awaitingComma = true;
        };

        return {
            push(delta) {
                if (!delta) return;
                const chunk = String(delta);
                const chunkStart = buffer.length;
                buffer += chunk;

                for (; cursor < buffer.length; cursor++) {
                    // Reading the full concatenation can flatten the entire document
                    // for each delta. Only slice it when a key or value is complete.
                    const indexInChunk = cursor - chunkStart;
                    const char = indexInChunk >= 0 && indexInChunk < chunk.length
                        ? chunk[indexInChunk]
                        : buffer[cursor];

                    if (inString) {
                        if (escaped) {
                            escaped = false;
                            continue;
                        }
                        if (char === '\\') {
                            escaped = true;
                            continue;
                        }
                        if (char !== '"') continue;

                        inString = false;
                        if (stringRole === 'key') {
                            try {
                                currentKey = JSON.parse(buffer.slice(stringStart, cursor + 1));
                                expectingKey = false;
                                expectingColon = true;
                            } catch {
                                currentKey = '';
                            }
                        } else if (stringRole === 'value') {
                            completeValue(cursor + 1);
                        }
                        stringRole = '';
                        continue;
                    }

                    if (!rootStarted) {
                        if (char === '{') {
                            rootStarted = true;
                            depth = 1;
                            expectingKey = true;
                        }
                        continue;
                    }

                    if (char === '"') {
                        inString = true;
                        escaped = false;
                        stringStart = cursor;
                        if (depth === 1 && expectingKey) {
                            stringRole = 'key';
                        } else if (depth === 1 && expectingValue && valueStart < 0) {
                            valueStart = cursor;
                            valueKind = 'string';
                            expectingValue = false;
                            stringRole = 'value';
                        } else {
                            stringRole = 'nested';
                        }
                        continue;
                    }

                    if (char === '{' || char === '[') {
                        if (depth === 1 && expectingValue && valueStart < 0) {
                            valueStart = cursor;
                            valueKind = 'container';
                            expectingValue = false;
                        }
                        depth += 1;
                        continue;
                    }

                    if (char === '}' || char === ']') {
                        if (depth === 1 && valueKind === 'primitive') completeValue(cursor);
                        const previousDepth = depth;
                        depth = Math.max(0, depth - 1);
                        if (valueKind === 'container' && previousDepth === 2 && depth === 1) {
                            completeValue(cursor + 1);
                        }
                        continue;
                    }

                    if (depth !== 1) continue;

                    if (expectingColon && char === ':') {
                        expectingColon = false;
                        expectingValue = true;
                        continue;
                    }

                    if (expectingValue && !/\s/.test(char)) {
                        valueStart = cursor;
                        valueKind = 'primitive';
                        expectingValue = false;
                    }

                    if (char === ',') {
                        if (valueKind === 'primitive') completeValue(cursor);
                        if (awaitingComma || !currentKey) {
                            awaitingComma = false;
                            expectingKey = true;
                        }
                    }
                }
            }
        };
    }

    const getResearchLineText = (line) => {
        if (typeof line === 'string') return line.trim();
        if (!isResearchObject(line)) return '';
        const direct = asResearchText(line.originalText || line.original || line.text || line.lyric);
        if (direct) return direct;
        const wordGroups = [line.words, line.syllables, line.content];
        for (const group of wordGroups) {
            if (!Array.isArray(group)) continue;
            const joined = group
                .map((part) => typeof part === 'string' ? part : asResearchText(part?.word || part?.text || part?.char))
                .join('')
                .trim();
            if (joined) return joined;
        }
        return '';
    };

    const getResearchLineStartTime = (line) => {
        if (!isResearchObject(line) || line.startTime === null || line.startTime === undefined) return null;
        if (typeof line.startTime === 'string' && line.startTime.trim().length === 0) return null;
        const startTime = Number(line.startTime);
        return Number.isFinite(startTime) && startTime >= 0 ? Math.round(startTime) : null;
    };

    function collectResearchLyricLines(lines, maxChars = RESEARCH_MAX_LYRIC_CHARS) {
        const source = Array.isArray(lines) ? lines : [];
        const output = [];
        const timedLines = [];
        let used = 0;
        let truncated = false;

        for (const line of source) {
            const text = getResearchLineText(line).slice(0, RESEARCH_MAX_LYRIC_LINE_CHARS);
            if (!text) continue;
            const addition = text.length + (output.length > 0 ? 1 : 0);
            if (used + addition > maxChars) {
                truncated = true;
                break;
            }
            output.push(text);
            const startTime = getResearchLineStartTime(line);
            if (startTime !== null) {
                timedLines.push({
                    line_index: output.length - 1,
                    text,
                    start_time_ms: startTime
                });
            }
            used += addition;
        }

        return { lines: output, timedLines, truncated };
    }

    function normalizeResearchHttpUrl(value) {
        const url = asResearchText(value);
        if (!url) return '';
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
        } catch {
            return '';
        }
    }

    function normalizeResearchSource(source) {
        const value = typeof source === 'string' ? { url: source } : source;
        if (!isResearchObject(value)) return null;
        const url = normalizeResearchHttpUrl(value.url || value.uri);
        if (!url) return null;
        return {
            title: asResearchText(value.title) || (() => {
                try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
            })(),
            publisher: asResearchText(value.publisher),
            url,
            source_type: asResearchText(value.source_type || value.type),
            relevance: asResearchText(value.relevance)
        };
    }

    const normalizeResearchSources = (sources) => {
        const seen = new Set();
        return (Array.isArray(sources) ? sources : [])
            .map(normalizeResearchSource)
            .filter((source) => {
                if (!source || seen.has(source.url)) return false;
                seen.add(source.url);
                return true;
            });
    };

    const normalizeResearchStatus = (value, fallback = '') => {
        const status = asResearchText(value).toLowerCase();
        return ['verified', 'interpretation', 'uncertain', 'disputed'].includes(status) ? status : fallback;
    };

    const normalizeResearchHook = (hook) => {
        const value = isResearchObject(hook) ? hook : {};
        return {
            surprise: asResearchText(value.surprise || value.twist),
            why_it_matters: asResearchText(value.why_it_matters || value.significance),
            verification_status: normalizeResearchStatus(value.verification_status),
            source_url: normalizeResearchHttpUrl(value.source_url || value.source)
        };
    };

    const normalizeResearchListeningGuide = (guide, lyrics) => {
        const value = isResearchObject(guide) ? guide : {};
        const timedLines = collectResearchLyricLines(lyrics).timedLines;
        const byLineIndex = new Map(timedLines.map((line) => [line.line_index, line]));
        const byTimestamp = new Map(timedLines.map((line) => [line.start_time_ms, line]));
        const canReuseTrustedTiming = timedLines.length === 0 && value._timing_source === 'trusted_synced_lyrics';
        const moments = (Array.isArray(value.moments) ? value.moments : [])
            .map((item) => {
                if (!isResearchObject(item)) return null;
                const rawLineIndex = Number(item.line_index);
                const rawTimestamp = Number(item.timestamp_ms);
                let trustedLine = Number.isInteger(rawLineIndex)
                    ? byLineIndex.get(rawLineIndex)
                    : (Number.isFinite(rawTimestamp) ? byTimestamp.get(Math.round(rawTimestamp)) : null);
                if (!trustedLine && canReuseTrustedTiming && Number.isInteger(rawLineIndex)
                    && Number.isFinite(rawTimestamp) && rawTimestamp >= 0 && asResearchText(item.lyric)) {
                    trustedLine = {
                        line_index: rawLineIndex,
                        start_time_ms: Math.round(rawTimestamp),
                        text: asResearchText(item.lyric)
                    };
                }
                if (!trustedLine) return null;
                const title = asResearchText(item.title || item.label);
                const listenFor = asResearchText(item.listen_for || item.what_to_hear);
                const whyItMatters = asResearchText(item.why_it_matters || item.significance);
                if (!title && !listenFor && !whyItMatters) return null;
                return {
                    line_index: trustedLine.line_index,
                    timestamp_ms: trustedLine.start_time_ms,
                    lyric: trustedLine.text,
                    title,
                    listen_for: listenFor,
                    why_it_matters: whyItMatters
                };
            })
            .filter(Boolean)
            .slice(0, 5);
        return {
            headline: moments.length > 0 ? asResearchText(value.headline) : '',
            introduction: moments.length > 0 ? asResearchText(value.introduction) : '',
            moments,
            editorial_note: moments.length > 0 ? asResearchText(value.editorial_note) : '',
            _timing_source: moments.length > 0 ? 'trusted_synced_lyrics' : ''
        };
    };

    const normalizeResearchCreationStory = (story) => {
        const value = isResearchObject(story) ? story : {};
        const stages = (Array.isArray(value.stages) ? value.stages : [])
            .map((item) => {
                if (!isResearchObject(item)) return null;
                const sourceUrl = normalizeResearchHttpUrl(item.source_url || item.source);
                const title = asResearchText(item.title);
                const body = asResearchText(item.body || item.description);
                if (!sourceUrl || (!title && !body)) return null;
                return {
                    phase: asResearchText(item.phase),
                    title,
                    body,
                    verification_status: normalizeResearchStatus(item.verification_status, 'verified'),
                    source_url: sourceUrl
                };
            })
            .filter(Boolean)
            .slice(0, 6);
        const paragraphs = stages.length > 0 ? asResearchTextArray(value.paragraphs) : [];
        return {
            headline: stages.length > 0 ? asResearchText(value.headline) : '',
            paragraphs,
            stages,
            editorial_note: stages.length > 0 ? asResearchText(value.editorial_note) : ''
        };
    };

    const normalizeResearchCreatorQuotes = (quotes) => (Array.isArray(quotes) ? quotes : [])
        .map((item) => {
            if (!isResearchObject(item)) return null;
            const quote = asResearchText(item.quote || item.original);
            const speaker = asResearchText(item.speaker || item.name);
            const sourceUrl = normalizeResearchHttpUrl(item.source_url || item.source);
            if (!quote || !speaker || !sourceUrl) return null;
            return {
                quote,
                translation: asResearchText(item.translation),
                speaker,
                role: asResearchText(item.role),
                date: asResearchText(item.date),
                context: asResearchText(item.context),
                source_url: sourceUrl
            };
        })
        .filter(Boolean)
        .slice(0, 3);

    const normalizeResearchConnectionItem = (item, type) => {
        if (!isResearchObject(item)) return null;
        const sourceUrl = normalizeResearchHttpUrl(item.source_url || item.source);
        const spotifyUrl = normalizeResearchHttpUrl(item.spotify_url);
        const title = asResearchText(item.name || item.title);
        const connection = asResearchText(item.connection || item.relationship || item.body);
        if ((!sourceUrl && !spotifyUrl) || !title || !connection) return null;
        return {
            type,
            title,
            role: asResearchText(item.role),
            connection,
            notable_work: asResearchText(item.notable_work),
            artist: asResearchText(item.artist),
            verification_status: normalizeResearchStatus(item.verification_status, 'verified'),
            spotify_url: spotifyUrl,
            source_url: sourceUrl
        };
    };

    const normalizeResearchCreativeConnections = (connections) => {
        const value = isResearchObject(connections) ? connections : {};
        const people = (Array.isArray(value.people) ? value.people : [])
            .map((item) => normalizeResearchConnectionItem(item, 'person')).filter(Boolean).slice(0, 6);
        const samples = (Array.isArray(value.samples) ? value.samples : [])
            .map((item) => normalizeResearchConnectionItem(item, 'sample')).filter(Boolean).slice(0, 4);
        const covers = (Array.isArray(value.covers) ? value.covers : [])
            .map((item) => normalizeResearchConnectionItem(item, 'cover')).filter(Boolean).slice(0, 4);
        const hasItems = people.length > 0 || samples.length > 0 || covers.length > 0;
        return {
            headline: hasItems ? asResearchText(value.headline) : '',
            people,
            samples,
            covers,
            editorial_note: hasItems ? asResearchText(value.editorial_note) : ''
        };
    };

    const normalizeResearchAfterlife = (afterlife) => {
        const value = isResearchObject(afterlife) ? afterlife : {};
        const events = (Array.isArray(value.events) ? value.events : [])
            .map((item) => {
                if (!isResearchObject(item)) return null;
                const sourceUrl = normalizeResearchHttpUrl(item.source_url || item.source);
                const title = asResearchText(item.title || item.event);
                const body = asResearchText(item.body || item.description);
                if (!sourceUrl || (!title && !body)) return null;
                return {
                    date: asResearchText(item.date),
                    title,
                    body,
                    impact: asResearchText(item.impact),
                    verification_status: normalizeResearchStatus(item.verification_status, 'verified'),
                    source_url: sourceUrl
                };
            })
            .filter(Boolean)
            .slice(0, 6);
        const paragraphs = events.length > 0 ? asResearchTextArray(value.paragraphs) : [];
        return {
            headline: events.length > 0 ? asResearchText(value.headline) : '',
            paragraphs,
            events,
            editorial_note: events.length > 0 ? asResearchText(value.editorial_note) : ''
        };
    };

    const normalizeResearchMythChecks = (myths) => (Array.isArray(myths) ? myths : [])
        .map((item) => {
            if (!isResearchObject(item)) return null;
            const claim = asResearchText(item.claim);
            const explanation = asResearchText(item.explanation || item.finding);
            const sourceUrl = normalizeResearchHttpUrl(item.source_url || item.source);
            if (!claim || !explanation || !sourceUrl) return null;
            return {
                claim,
                explanation,
                verdict: normalizeResearchStatus(item.verdict || item.verification_status, 'uncertain'),
                source_url: sourceUrl
            };
        })
        .filter(Boolean)
        .slice(0, 5);

    const normalizeResearchTrivia = (trivia) => {
        const value = Array.isArray(trivia) ? { items: trivia } : (isResearchObject(trivia) ? trivia : {});
        const items = (Array.isArray(value.items) ? value.items : [])
            .map((item) => {
                if (typeof item === 'string') {
                    return { title: '', body: item.trim(), why_interesting: '', verification_status: 'uncertain', source_url: '', editorial_note: '' };
                }
                if (!isResearchObject(item)) return null;
                const body = asResearchText(item.body || item.fact || item.story);
                const title = asResearchText(item.title || item.headline);
                if (!body && !title) return null;
                return {
                    title,
                    body,
                    why_interesting: asResearchText(item.why_interesting || item.significance),
                    verification_status: asResearchText(item.verification_status || 'uncertain'),
                    source_url: normalizeResearchHttpUrl(item.source_url || item.source),
                    editorial_note: asResearchText(item.editorial_note)
                };
            })
            .filter(Boolean);
        const timeline = (Array.isArray(value.timeline) ? value.timeline : [])
            .map((item) => {
                if (!isResearchObject(item)) return null;
                const date = asResearchText(item.date || item.year);
                const event = asResearchText(item.event || item.value || item.body);
                if (!date && !event) return null;
                return {
                    date,
                    event,
                    verification_status: asResearchText(item.verification_status || 'uncertain'),
                    source_url: normalizeResearchHttpUrl(item.source_url || item.source)
                };
            })
            .filter(Boolean);
        return {
            headline: asResearchText(value.headline),
            introduction: asResearchText(value.introduction),
            items,
            timeline,
            afterlife: normalizeResearchAfterlife(value.afterlife),
            myth_checks: normalizeResearchMythChecks(value.myth_checks),
            editorial_note: asResearchText(value.editorial_note)
        };
    };

    const normalizeResearchMediaGallery = (media) => (Array.isArray(media) ? media : [])
        .map((item) => {
            if (!isResearchObject(item)) return null;
            const url = normalizeResearchHttpUrl(item.url || item.source_url || item.youtube_url);
            const imageUrl = normalizeResearchHttpUrl(item.image_url || item.thumbnail_url);
            if (!url && !imageUrl) return null;
            return {
                type: asResearchText(item.type),
                title: asResearchText(item.title),
                url,
                image_url: imageUrl,
                publisher: asResearchText(item.publisher),
                caption: asResearchText(item.caption),
                credit: asResearchText(item.credit)
            };
        })
        .filter(Boolean);

    const normalizeResearchParagraphSection = (section) => {
        if (typeof section === 'string') {
            return { headline: '', paragraphs: [section.trim()].filter(Boolean), editorial_note: '' };
        }
        const value = isResearchObject(section) ? section : {};
        return {
            ...value,
            headline: asResearchText(value.headline),
            paragraphs: asResearchTextArray(value.paragraphs),
            editorial_note: asResearchText(value.editorial_note)
        };
    };

    const normalizeResearchQuality = (quality, legacyReliability = {}) => {
        const value = isResearchObject(quality) ? quality : {};
        const legacy = isResearchObject(legacyReliability) ? legacyReliability : {};
        return {
            confidence: asResearchText(value.confidence || legacy.confidence || 'none'),
            verified_facts: asResearchTextArray(value.verified_facts),
            interpretations: asResearchTextArray(value.interpretations),
            uncertain_items: asResearchTextArray(value.uncertain_items),
            conflicting_information: asResearchTextArray(value.conflicting_information),
            missing_information: asResearchTextArray(value.missing_information)
        };
    };

    function normalizeLegacyResearchResult(track, context) {
        const sourceGroups = isResearchObject(track.sources) ? track.sources : {};
        const sources = normalizeResearchSources([
            ...(sourceGroups.verified || []),
            ...(sourceGroups.related || []),
            ...(sourceGroups.other || [])
        ]);
        const description = asResearchText(track.description);
        const trivia = asResearchTextArray(track.trivia);
        return {
            type: 'music_editorial_analysis',
            version: RESEARCH_OUTPUT_VERSION,
            language: asResearchText(context.language || context.lang || 'ko'),
            metadata: {
                title: asResearchText(context.title),
                title_original: asResearchText(context.title),
                artist: asResearchText(context.artist),
                artist_original: asResearchText(context.artist),
                album: asResearchText(context.album),
                spotify_url: asResearchText(context.spotifyUrl)
            },
            editorial_thesis: { one_sentence: description, expanded: '', hook: normalizeResearchHook({}) },
            basic_information: { table: [], paragraphs: [] },
            listening_guide: normalizeResearchListeningGuide({}, context.lyrics),
            trivia: { headline: '', introduction: '', items: [], timeline: [], afterlife: normalizeResearchAfterlife({}), myth_checks: [], editorial_note: '' },
            media_gallery: [],
            introduction: { headline: '', paragraphs: description ? [description] : [], editorial_note: '' },
            title_analysis: normalizeResearchParagraphSection({}),
            lyric_analysis: {
                ...normalizeResearchParagraphSection({}),
                narrative: {}, motifs: [], repeated_images: [], japanese_expressions: []
            },
            chorus_analysis: normalizeResearchParagraphSection({}),
            ending_analysis: normalizeResearchParagraphSection({}),
            music_analysis: { ...normalizeResearchParagraphSection({}), creation_story: normalizeResearchCreationStory({}), creator_quotes: [] },
            artist_context: {
                ...normalizeResearchParagraphSection({}),
                creative_connections: normalizeResearchCreativeConnections({}),
                trivia: trivia.map((fact) => ({ fact, verification_status: 'uncertain', source: '', editorial_note: '' }))
            },
            comparative_analysis: { headline: '', works: [], overall_comparison: [] },
            cultural_context: normalizeResearchParagraphSection({}),
            visual_world: normalizeResearchParagraphSection({}),
            final_critique: normalizeResearchParagraphSection({}),
            sources,
            research_quality: normalizeResearchQuality({}, track.reliability)
        };
    }

    function normalizeResearchResult(raw, context = {}) {
        let value = parseResearchJson(raw);
        if (isResearchObject(value.research)) value = value.research;
        if (isResearchObject(value.track) && !value.type && !value.editorial_thesis) {
            return normalizeLegacyResearchResult(value.track, context);
        }

        const metadata = isResearchObject(value.metadata) ? value.metadata : {};
        const thesis = isResearchObject(value.editorial_thesis) ? value.editorial_thesis : {};
        const lyricAnalysis = normalizeResearchParagraphSection(value.lyric_analysis);
        const musicAnalysis = normalizeResearchParagraphSection(value.music_analysis);
        const artistContext = normalizeResearchParagraphSection(value.artist_context);
        return {
            type: 'music_editorial_analysis',
            version: asResearchText(value.version, RESEARCH_OUTPUT_VERSION),
            language: asResearchText(value.language || context.language || context.lang, 'ko'),
            metadata: {
                ...metadata,
                title: asResearchText(metadata.title || context.title),
                title_original: asResearchText(metadata.title_original || context.title),
                title_reading: asResearchText(metadata.title_reading),
                title_korean: asResearchText(metadata.title_korean),
                artist: asResearchText(metadata.artist || context.artist),
                artist_original: asResearchText(metadata.artist_original || context.artist),
                artist_reading: asResearchText(metadata.artist_reading),
                artist_korean: asResearchText(metadata.artist_korean),
                spotify_url: asResearchText(metadata.spotify_url || context.spotifyUrl),
                youtube_url: asResearchText(metadata.youtube_url),
                release_date: asResearchText(metadata.release_date || context.releaseDate),
                album: asResearchText(metadata.album || context.album),
                label: asResearchText(metadata.label),
                genre: asResearchTextArray(metadata.genre),
                tie_in: asResearchText(metadata.tie_in),
                original_work: asResearchText(metadata.original_work)
            },
            editorial_thesis: {
                one_sentence: asResearchText(thesis.one_sentence),
                expanded: asResearchText(thesis.expanded),
                hook: normalizeResearchHook(thesis.hook)
            },
            basic_information: {
                ...(isResearchObject(value.basic_information) ? value.basic_information : {}),
                table: Array.isArray(value.basic_information?.table) ? value.basic_information.table : [],
                paragraphs: asResearchTextArray(value.basic_information?.paragraphs)
            },
            listening_guide: normalizeResearchListeningGuide(value.listening_guide, context.lyrics),
            trivia: normalizeResearchTrivia(value.trivia),
            media_gallery: normalizeResearchMediaGallery(value.media_gallery),
            introduction: normalizeResearchParagraphSection(value.introduction),
            title_analysis: normalizeResearchParagraphSection(value.title_analysis),
            lyric_analysis: {
                ...lyricAnalysis,
                narrative: isResearchObject(value.lyric_analysis?.narrative) ? value.lyric_analysis.narrative : {},
                motifs: Array.isArray(value.lyric_analysis?.motifs) ? value.lyric_analysis.motifs : [],
                repeated_images: Array.isArray(value.lyric_analysis?.repeated_images) ? value.lyric_analysis.repeated_images : [],
                japanese_expressions: Array.isArray(value.lyric_analysis?.japanese_expressions) ? value.lyric_analysis.japanese_expressions : []
            },
            chorus_analysis: normalizeResearchParagraphSection(value.chorus_analysis),
            ending_analysis: normalizeResearchParagraphSection(value.ending_analysis),
            music_analysis: {
                ...musicAnalysis,
                creation_story: normalizeResearchCreationStory(value.music_analysis?.creation_story),
                creator_quotes: normalizeResearchCreatorQuotes(value.music_analysis?.creator_quotes)
            },
            artist_context: {
                ...artistContext,
                creative_connections: normalizeResearchCreativeConnections(value.artist_context?.creative_connections),
                trivia: Array.isArray(value.artist_context?.trivia) ? value.artist_context.trivia : []
            },
            comparative_analysis: {
                ...(isResearchObject(value.comparative_analysis) ? value.comparative_analysis : {}),
                headline: asResearchText(value.comparative_analysis?.headline),
                works: Array.isArray(value.comparative_analysis?.works) ? value.comparative_analysis.works : [],
                overall_comparison: asResearchTextArray(value.comparative_analysis?.overall_comparison)
            },
            cultural_context: normalizeResearchParagraphSection(value.cultural_context),
            visual_world: normalizeResearchParagraphSection(value.visual_world),
            final_critique: normalizeResearchParagraphSection(value.final_critique),
            sources: normalizeResearchSources(value.sources),
            research_quality: normalizeResearchQuality(value.research_quality),
            _research: isResearchObject(value._research) ? value._research : {}
        };
    }

export {
    RESEARCH_CACHE_VERSION,
    RESEARCH_OUTPUT_VERSION,
    RESEARCH_MAX_LYRIC_CHARS,
    isResearchWebSearchFailure,
    asResearchText,
    createResearchStreamProgressParser,
    collectResearchLyricLines,
    normalizeResearchResult,
    normalizeResearchSource,
};
