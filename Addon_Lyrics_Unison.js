/**
 * Unison Lyrics Provider Addon
 * Read-only integration for https://unison.boidu.dev.
 *
 * @addon-type lyrics
 * @id unison
 * @name Unison
 * @version 1.0.2
 * @author default
 * @default-enabled false
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

(() => {
    'use strict';

    const API_BASE = 'https://unison.boidu.dev';
    const CACHE_VERSION = '2026-07-13-unison-4';
    const ATTRIBUTION = 'Lyrics from Unison (https://unison.boidu.dev).';
    const REQUEST_TIMEOUT_MS = 10000;
    const PARALLEL_VOCAL_MIN_OVERLAP_MS = 30;

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

    const ADDON_INFO = {
        id: 'unison',
        name: 'Unison',
        author: 'default',
        version: '1.0.2',
        cacheVersion: CACHE_VERSION,
        description: {
            en: 'Read-only provider backed by the Unison community lyrics API',
            ko: 'Unison 커뮤니티 가사 API를 사용하는 읽기 전용 제공자'
        },
        supports: {
            karaoke: true,
            karaokeCharacter: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        defaultEnabled: false,
        icon: 'M9 3v10.55A4 4 0 1 0 11 17V7h6V3H9zm-2 16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'
    };

    function parseTimeMs(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.round(value);
        }

        const input = String(value || '').trim();
        if (!input) return null;

        const offsetMatch = input.match(/^([+-]?[\d.]+)(ms|h|m|s)$/i);
        if (offsetMatch) {
            const amount = Number(offsetMatch[1]);
            if (!Number.isFinite(amount)) return null;
            const unit = offsetMatch[2].toLowerCase();
            const multiplier = unit === 'h'
                ? 3600000
                : unit === 'm'
                    ? 60000
                    : unit === 's'
                        ? 1000
                        : 1;
            return Math.round(amount * multiplier);
        }

        const firstColon = input.indexOf(':');
        const secondColon = firstColon >= 0 ? input.indexOf(':', firstColon + 1) : -1;
        if (secondColon >= 0 && input.indexOf(':', secondColon + 1) >= 0) return null;

        const first = Number(firstColon >= 0 ? input.slice(0, firstColon) : input);
        if (!Number.isFinite(first)) return null;
        if (firstColon < 0) return Math.round(first * 1000);

        const second = Number(input.slice(firstColon + 1, secondColon >= 0 ? secondColon : undefined));
        if (!Number.isFinite(second)) return null;
        if (secondColon < 0) return Math.round(((first * 60) + second) * 1000);

        const third = Number(input.slice(secondColon + 1));
        if (!Number.isFinite(third)) return null;
        const seconds = (first * 3600) + (second * 60) + third;
        return Math.round(seconds * 1000);
    }

    const isNativeDomNode = value => typeof Node !== 'undefined' && value instanceof Node;

    function getAttribute(element, localName) {
        if (!element?.attributes) return '';
        const direct = element.getAttribute?.(localName);
        if (direct !== null && direct !== undefined && direct !== '') return direct;

        for (let index = 0; index < element.attributes.length; index++) {
            const attribute = element.attributes[index];
            if (attribute.localName === localName || attribute.name === localName) {
                return attribute.value || '';
            }
        }
        return '';
    }

    function getElementsByLocalName(root, localName) {
        if (!root?.getElementsByTagName) return [];
        if (isNativeDomNode(root) && typeof root.getElementsByTagNameNS === 'function') {
            return Array.from(root.getElementsByTagNameNS('*', localName));
        }
        return Array.from(root.getElementsByTagName('*'))
            .filter(element => element.localName === localName || element.tagName === localName);
    }

    function normalizeInlineText(value) {
        return String(value || '')
            .replace(/[\r\n\t\f\v ]+/g, ' ');
    }

    function normalizeDisplayText(value) {
        return normalizeInlineText(value).trim();
    }

    function stripBackgroundVocalParentheses(parsedPart) {
        if (!parsedPart) return parsedPart;

        const strip = value => String(value || '').replace(/[()（）]/g, '');
        const syllables = Array.isArray(parsedPart.syllables)
            ? parsedPart.syllables
                .map(syllable => ({ ...syllable, text: strip(syllable?.text) }))
                .filter(syllable => syllable.text.length > 0)
            : [];

        while (syllables.length && !syllables[0].text.trim()) syllables.shift();
        while (syllables.length && !syllables[syllables.length - 1].text.trim()) syllables.pop();

        return {
            ...parsedPart,
            text: normalizeDisplayText(strip(parsedPart.text)),
            syllables
        };
    }

    function hasContentAfter(nodes, index) {
        for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex++) {
            const node = nodes[nextIndex];
            if (node.nodeType === 3 && String(node.nodeValue || '').trim()) return true;
            if (node.nodeType === 1 && normalizeDisplayText(node.textContent)) return true;
        }
        return false;
    }

    function appendText(state, rawText, startTime, endTime, isTimed) {
        let text = normalizeInlineText(rawText);
        if (!text) return;

        if (!state.text) text = text.trimStart();
        if (state.text.endsWith(' ') && text.startsWith(' ')) {
            text = text.slice(1);
        }
        if (!text) return;

        state.text += text;
        if (!isTimed) return;

        const start = Number.isFinite(startTime) ? Math.round(startTime) : state.fallbackStart;
        const end = Number.isFinite(endTime) && endTime >= start
            ? Math.round(endTime)
            : Math.max(start + 1, state.fallbackEnd);
        state.syllables.push({ text, startTime: start, endTime: end });
        state.hasTimedText = true;
    }

    function parseTimedNodes(nodesInput, fallbackStart, fallbackEnd, options = {}) {
        const nodes = Array.from(nodesInput || []);
        const state = {
            text: '',
            syllables: [],
            hasTimedText: false,
            fallbackStart: Number.isFinite(fallbackStart) ? fallbackStart : 0,
            fallbackEnd: Number.isFinite(fallbackEnd) ? fallbackEnd : Math.max(1, fallbackStart || 0)
        };

        nodes.forEach((node, index) => {
            if (node.nodeType === 3) {
                const rawText = String(node.nodeValue || '');
                if (!rawText.trim()) {
                    if (state.text && !state.text.endsWith(' ') && hasContentAfter(nodes, index)) {
                        const boundary = state.syllables[state.syllables.length - 1]?.endTime ?? state.fallbackStart;
                        appendText(state, ' ', boundary, boundary, state.hasTimedText);
                    }
                    return;
                }
                appendText(state, rawText, state.fallbackStart, state.fallbackEnd, false);
                return;
            }

            if (node.nodeType !== 1) return;
            const element = node;
            const role = getAttribute(element, 'role').toLowerCase();
            if (options.excludeBackground && role === 'x-bg') return;
            if (element.localName === 'br') {
                appendText(state, ' ', state.fallbackStart, state.fallbackStart, state.hasTimedText);
                return;
            }

            const elementStart = parseTimeMs(getAttribute(element, 'begin'));
            const explicitEnd = parseTimeMs(getAttribute(element, 'end'));
            const duration = parseTimeMs(getAttribute(element, 'dur'));
            const start = Number.isFinite(elementStart) ? elementStart : state.fallbackStart;
            const end = Number.isFinite(explicitEnd)
                ? explicitEnd
                : Number.isFinite(duration)
                    ? start + duration
                    : state.fallbackEnd;
            const childElements = isNativeDomNode(element) && typeof element.childElementCount === 'number'
                ? element.childElementCount
                : Array.from(element.childNodes || []).filter(child => child.nodeType === 1).length;

            if (childElements > 0) {
                const nested = parseTimedNodes(element.childNodes, start, end, options);
                state.text += nested.text;
                state.syllables.push(...nested.syllables);
                state.hasTimedText = state.hasTimedText || nested.hasTimedText;
                return;
            }

            const hasExplicitTiming = Number.isFinite(elementStart)
                || Number.isFinite(explicitEnd)
                || Number.isFinite(duration);
            appendText(state, element.textContent || '', start, end, hasExplicitTiming);
        });

        state.text = state.text.trim();
        while (state.syllables.length && !String(state.syllables[0].text || '').trim()) {
            state.syllables.shift();
        }
        while (state.syllables.length && !String(state.syllables[state.syllables.length - 1].text || '').trim()) {
            state.syllables.pop();
        }
        return state;
    }

    function declareMissingNamespaces(xml) {
        const rootMatch = String(xml || '').match(/<tt\b[^>]*>/i);
        if (!rootMatch) return xml;

        const rootTag = rootMatch[0];
        const declared = new Set(['xml', 'xmlns']);
        for (const match of rootTag.matchAll(/xmlns:([A-Za-z][\w.-]*)\s*=/g)) {
            declared.add(match[1]);
        }

        const used = new Set();
        for (const match of String(xml).matchAll(/<\/?([A-Za-z][\w.-]*):/g)) {
            used.add(match[1]);
        }
        for (const match of String(xml).matchAll(/\s([A-Za-z][\w.-]*):[\w.-]+\s*=/g)) {
            used.add(match[1]);
        }

        const missing = Array.from(used).filter(prefix => !declared.has(prefix));
        if (!missing.length) return xml;
        const declarations = missing
            .map(prefix => ` xmlns:${prefix}="urn:ivlyrics:unison:${prefix}"`)
            .join('');
        return String(xml).replace(rootTag, rootTag.replace(/>$/, `${declarations}>`));
    }

    function parseXml(xml) {
        if (typeof DOMParser !== 'function') {
            throw new Error('DOMParser is not available');
        }

        const parser = new DOMParser();
        const document = parser.parseFromString(declareMissingNamespaces(xml), 'application/xml');
        if (document.getElementsByTagName('parsererror').length > 0) {
            const detail = document.getElementsByTagName('parsererror')[0]?.textContent || 'Invalid TTML';
            throw new Error(detail.trim().slice(0, 240));
        }
        return document;
    }

    function getSpeakerPresentation(agentId, agentOrder) {
        if (!agentId) return {};
        const index = Math.max(0, agentOrder.get(agentId) ?? 0);
        if (index === 0) {
            return {
                speaker: 'NORMAL',
                unisonAgent: agentId
            };
        }

        const palette = SPEAKER_PALETTE[(index - 1) % SPEAKER_PALETTE.length];
        return {
            speaker: 'CUSTOM',
            'speaker-color': palette.color,
            'speaker-fallback': palette.fallback,
            unisonAgent: agentId
        };
    }

    function createVocalPart(id, role, parsedPart, speakerPresentation) {
        if (!parsedPart?.text || !parsedPart.syllables?.length) return null;
        return {
            id,
            role,
            ...speakerPresentation,
            kind: 'vocal',
            text: parsedPart.text,
            syllables: parsedPart.syllables,
            startTime: parsedPart.syllables[0].startTime,
            endTime: parsedPart.syllables[parsedPart.syllables.length - 1].endTime
        };
    }

    function cloneVocalPart(part, role = '') {
        const syllables = Array.isArray(part?.syllables)
            ? part.syllables
                .filter(syllable => Number.isFinite(syllable?.startTime)
                    && Number.isFinite(syllable?.endTime)
                    && syllable.endTime >= syllable.startTime
                    && normalizeInlineText(syllable?.text))
                .map(syllable => ({
                    ...syllable,
                    text: normalizeInlineText(syllable.text)
                }))
            : [];
        if (syllables.length === 0) return null;

        const text = normalizeDisplayText(part?.text)
            || normalizeDisplayText(syllables.map(syllable => syllable.text).join(''));
        if (!text) return null;

        return {
            ...part,
            role: role || String(part?.role || 'background'),
            text,
            syllables,
            startTime: Math.min(...syllables.map(syllable => syllable.startTime)),
            endTime: Math.max(...syllables.map(syllable => syllable.endTime))
        };
    }

    function getLineLeadVocalPart(line) {
        const existingLead = cloneVocalPart(line?.vocals?.lead, 'lead');
        if (existingLead) return existingLead;

        const fallbackText = normalizeDisplayText(line?.text);
        const fallbackSyllables = Array.isArray(line?.syllables) && line.syllables.length > 0
            ? line.syllables
            : (fallbackText && Number.isFinite(line?.startTime) && Number.isFinite(line?.endTime)
                ? [{ text: fallbackText, startTime: line.startTime, endTime: line.endTime }]
                : []);

        return cloneVocalPart({
            id: `${line?.unisonLineKey || 'line'}-lead`,
            role: 'lead',
            speaker: line?.speaker,
            'speaker-color': line?.['speaker-color'],
            'speaker-fallback': line?.['speaker-fallback'],
            unisonAgent: line?.unisonAgent,
            kind: line?.kind,
            text: fallbackText,
            syllables: fallbackSyllables
        }, 'lead');
    }

    function getLineVocalParts(line) {
        const lead = getLineLeadVocalPart(line);
        const background = Array.isArray(line?.vocals?.background)
            ? line.vocals.background
                .map(part => cloneVocalPart(part, 'background'))
                .filter(Boolean)
            : [];
        return { lead, background };
    }

    function getVocalPartOverlapMs(left, right) {
        if (!left || !right) return 0;
        return Math.max(0, Math.min(left.endTime, right.endTime) - Math.max(left.startTime, right.startTime));
    }

    function mergeVocalParts(parts, role) {
        const normalizedParts = (parts || [])
            .map(part => cloneVocalPart(part, role))
            .filter(Boolean)
            .sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime);
        if (normalizedParts.length === 0) return null;

        const syllables = [];
        normalizedParts.forEach((part, index) => {
            if (index > 0) {
                const previous = syllables[syllables.length - 1];
                const next = part.syllables[0];
                if (previous
                    && next
                    && !/\s$/u.test(previous.text || '')
                    && !/^\s/u.test(next.text || '')) {
                    syllables.push({
                        text: ' ',
                        startTime: next.startTime,
                        endTime: next.startTime,
                        unisonSeparator: true
                    });
                }
            }
            syllables.push(...part.syllables);
        });

        const first = normalizedParts[0];
        return {
            ...first,
            id: normalizedParts.map(part => part.id).filter(Boolean).join('+') || first.id,
            role,
            text: normalizedParts.map(part => part.text).filter(Boolean).join(' / '),
            syllables,
            startTime: Math.min(...normalizedParts.map(part => part.startTime)),
            endTime: Math.max(...normalizedParts.map(part => part.endTime))
        };
    }

    function buildVocalLanes(entries, role) {
        const lanesByStream = new Map();
        const normalizedEntries = entries
            .map(entry => ({ ...entry, part: cloneVocalPart(entry?.part, role) }))
            .filter(entry => entry.part)
            .sort((left, right) => (
                left.part.startTime - right.part.startTime
                || left.part.endTime - right.part.endTime
                || left.sourceIndex - right.sourceIndex
            ));

        normalizedEntries.forEach((entry) => {
            const { part } = entry;
            const streamId = String(part.unisonAgent || entry?.line?.unisonAgent || '__default__');
            const streamLanes = lanesByStream.get(streamId) || [];
            let lane = streamLanes.find(candidate => candidate.endTime <= part.startTime);
            if (!lane) {
                lane = { streamId, parts: [], sourceIndexes: [], endTime: -Infinity };
                streamLanes.push(lane);
                lanesByStream.set(streamId, streamLanes);
            }
            lane.parts.push(part);
            lane.sourceIndexes.push(entry.sourceIndex);
            lane.endTime = Math.max(lane.endTime, part.endTime);
        });

        return [...lanesByStream.values()]
            .flat()
            .map(lane => ({
                ...lane,
                duration: lane.parts.reduce((total, part) => total + Math.max(0, part.endTime - part.startTime), 0),
                startTime: Math.min(...lane.parts.map(part => part.startTime)),
                part: mergeVocalParts(lane.parts, role)
            }))
            .filter(lane => lane.part);
    }

    function chooseLeadVocalLane(lanes) {
        return [...lanes].sort((left, right) => (
            right.duration - left.duration
            || right.parts.length - left.parts.length
            || left.startTime - right.startTime
            || Math.min(...left.sourceIndexes) - Math.min(...right.sourceIndexes)
        ))[0] || null;
    }

    function createParallelVocalLine(lines) {
        const orderedLines = [...lines]
            .sort((left, right) => left.startTime - right.startTime || left.sourceIndex - right.sourceIndex);
        const leadEntries = orderedLines
            .map(line => ({
                line,
                sourceIndex: line.sourceIndex,
                part: getLineLeadVocalPart(line)
            }))
            .filter(entry => entry.part);
        const leadLanes = buildVocalLanes(leadEntries, 'lead');
        const leadLane = chooseLeadVocalLane(leadLanes);
        if (!leadLane) return null;

        const leadLine = orderedLines.find(line => leadLane.sourceIndexes.includes(line.sourceIndex))
            || orderedLines[0];
        const leadPart = { ...leadLane.part, role: 'lead' };
        const overlappingLeadParts = leadLanes
            .filter(lane => lane !== leadLane)
            .sort((left, right) => left.startTime - right.startTime)
            .map(lane => ({ ...lane.part, role: 'background' }));
        const explicitBackgroundEntries = orderedLines.flatMap(line => (
            Array.isArray(line?.vocals?.background)
                ? line.vocals.background.map(part => ({
                    line,
                    sourceIndex: line.sourceIndex,
                    part
                }))
                : []
        ));
        const explicitBackgroundParts = buildVocalLanes(explicitBackgroundEntries, 'background')
            .sort((left, right) => left.startTime - right.startTime)
            .map(lane => ({ ...lane.part, role: 'background' }));
        const backgroundParts = [...overlappingLeadParts, ...explicitBackgroundParts];
        if (backgroundParts.length === 0) return null;

        const allParts = [leadPart, ...backgroundParts];
        const text = allParts.map(part => part.text).filter(Boolean).join(' / ');
        return {
            ...leadLine,
            sourceIndex: Math.min(...orderedLines.map(line => line.sourceIndex)),
            startTime: Math.min(...allParts.map(part => part.startTime)),
            endTime: Math.max(...allParts.map(part => part.endTime)),
            text,
            syllables: undefined,
            vocals: {
                lead: leadPart,
                background: backgroundParts
            },
            hasWordTiming: true,
            unisonParallelVocal: true,
            unisonLineKeys: orderedLines.map(line => line.unisonLineKey).filter(Boolean)
        };
    }

    function groupParallelVocalLines(lines) {
        const orderedLines = [...(lines || [])]
            .sort((left, right) => left.startTime - right.startTime || left.sourceIndex - right.sourceIndex);
        const partsByLine = orderedLines.map(line => {
            const { lead, background } = getLineVocalParts(line);
            return [lead, ...background].filter(Boolean);
        });
        const parents = orderedLines.map((_line, index) => index);
        const findRoot = index => {
            let root = index;
            while (parents[root] !== root) root = parents[root];
            while (parents[index] !== index) {
                const parent = parents[index];
                parents[index] = root;
                index = parent;
            }
            return root;
        };
        const joinRoots = (left, right) => {
            const leftRoot = findRoot(left);
            const rightRoot = findRoot(right);
            if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
        };
        const parallelSeeds = new Set();

        for (let leftIndex = 0; leftIndex < orderedLines.length; leftIndex++) {
            const left = orderedLines[leftIndex];
            const leftParts = partsByLine[leftIndex];
            if (leftParts.length === 0) continue;
            const leftEndTime = Math.max(...leftParts.map(part => part.endTime));

            for (let rightIndex = leftIndex + 1; rightIndex < orderedLines.length; rightIndex++) {
                const right = orderedLines[rightIndex];
                const rightParts = partsByLine[rightIndex];
                if (rightParts.length === 0) continue;
                const rightStartTime = Math.min(...rightParts.map(part => part.startTime));
                if (rightStartTime >= leftEndTime) break;

                const hasMeaningfulOverlap = leftParts.some(leftPart => (
                    rightParts.some(rightPart => (
                        getVocalPartOverlapMs(leftPart, rightPart) >= PARALLEL_VOCAL_MIN_OVERLAP_MS
                    ))
                ));
                if (!hasMeaningfulOverlap) continue;

                joinRoots(leftIndex, rightIndex);
                parallelSeeds.add(leftIndex);
            }
        }

        const parallelRoots = new Set([...parallelSeeds].map(findRoot));
        const components = new Map();
        orderedLines.forEach((line, index) => {
            const root = findRoot(index);
            const component = components.get(root) || [];
            component.push(line);
            components.set(root, component);
        });

        const emittedRoots = new Set();
        const grouped = [];
        orderedLines.forEach((line, index) => {
            const root = findRoot(index);
            if (!parallelRoots.has(root)) {
                grouped.push(line);
                return;
            }
            if (emittedRoots.has(root)) return;
            emittedRoots.add(root);

            const component = components.get(root) || [line];
            const parallelLine = component.length > 1 ? createParallelVocalLine(component) : null;
            if (parallelLine) {
                grouped.push(parallelLine);
            } else {
                grouped.push(...component);
            }
        });

        return grouped.sort((left, right) => left.startTime - right.startTime || left.sourceIndex - right.sourceIndex);
    }

    function parseTtmlLyrics(ttml, durationMs = 0) {
        const document = parseXml(ttml);
        const agentElements = getElementsByLocalName(document, 'agent');
        const agentOrder = new Map();
        agentElements.forEach((agent, index) => {
            const id = getAttribute(agent, 'id');
            if (id && !agentOrder.has(id)) agentOrder.set(id, index);
        });

        const paragraphs = getElementsByLocalName(document, 'p');
        const parsedLines = paragraphs.map((paragraph, lineIndex) => {
            const startTime = parseTimeMs(getAttribute(paragraph, 'begin')) ?? 0;
            const explicitEnd = parseTimeMs(getAttribute(paragraph, 'end'));
            const paragraphDuration = parseTimeMs(getAttribute(paragraph, 'dur'));
            const endTime = Number.isFinite(explicitEnd)
                ? explicitEnd
                : Number.isFinite(paragraphDuration)
                    ? startTime + paragraphDuration
                    : startTime + 2500;
            const lineKey = getAttribute(paragraph, 'key') || getAttribute(paragraph, 'id') || `line-${lineIndex + 1}`;
            const lineAgent = getAttribute(paragraph, 'agent');
            if (lineAgent && !agentOrder.has(lineAgent)) agentOrder.set(lineAgent, agentOrder.size);
            const lineSpeaker = getSpeakerPresentation(lineAgent, agentOrder);

            const childNodes = Array.from(paragraph.childNodes || []);
            const lead = parseTimedNodes(childNodes, startTime, endTime, { excludeBackground: true });
            const backgrounds = childNodes
                .filter(node => node.nodeType === 1 && getAttribute(node, 'role').toLowerCase() === 'x-bg')
                .map((element, backgroundIndex) => {
                    const backgroundAgent = getAttribute(element, 'agent') || lineAgent;
                    if (backgroundAgent && !agentOrder.has(backgroundAgent)) {
                        agentOrder.set(backgroundAgent, agentOrder.size);
                    }
                    const backgroundStart = parseTimeMs(getAttribute(element, 'begin')) ?? startTime;
                    const backgroundEnd = parseTimeMs(getAttribute(element, 'end')) ?? endTime;
                    const parsed = stripBackgroundVocalParentheses(
                        parseTimedNodes(element.childNodes, backgroundStart, backgroundEnd)
                    );
                    return createVocalPart(
                        `${lineKey}-background-${backgroundIndex + 1}`,
                        'background',
                        parsed,
                        getSpeakerPresentation(backgroundAgent, agentOrder)
                    );
                })
                .filter(Boolean);

            const backgroundTexts = backgrounds.map(part => part.text);
            let leadPart = createVocalPart(`${lineKey}-lead`, 'lead', lead, lineSpeaker);
            if (!leadPart && backgrounds.length > 0 && lead.text) {
                leadPart = createVocalPart(`${lineKey}-lead`, 'lead', {
                    text: lead.text,
                    syllables: [{ text: lead.text, startTime, endTime }]
                }, lineSpeaker);
            }
            if (!leadPart && backgrounds.length > 0) {
                const promoted = backgrounds.shift();
                leadPart = { ...promoted, id: `${lineKey}-lead`, role: 'lead' };
            }

            const displayText = backgroundTexts.length > 0
                ? [lead.text, ...backgroundTexts].filter(Boolean).join(' ')
                : normalizeDisplayText(paragraph.textContent) || lead.text;
            if (!displayText) return null;

            const allTimedParts = [leadPart, ...backgrounds].filter(Boolean);
            const allStarts = allTimedParts.map(part => part.startTime).filter(Number.isFinite);
            const allEnds = allTimedParts.map(part => part.endTime).filter(Number.isFinite);
            const resolvedStart = allStarts.length ? Math.min(startTime, ...allStarts) : startTime;
            const resolvedEnd = allEnds.length ? Math.max(endTime, ...allEnds) : endTime;

            const line = {
                sourceIndex: lineIndex,
                startTime: Math.round(resolvedStart),
                endTime: Math.max(Math.round(resolvedStart) + 1, Math.round(resolvedEnd)),
                text: displayText,
                ...lineSpeaker,
                kind: 'vocal',
                unisonLineKey: lineKey
            };

            if (backgrounds.length > 0 && leadPart) {
                line.vocals = { lead: leadPart, background: backgrounds };
                line.hasWordTiming = true;
            } else if (leadPart && backgroundTexts.length > 0) {
                line.syllables = leadPart.syllables;
                line.hasWordTiming = true;
            } else if (lead.syllables.length > 0) {
                line.syllables = lead.syllables;
                line.hasWordTiming = lead.hasTimedText;
            } else {
                line.hasWordTiming = false;
            }

            return line;
        }).filter(Boolean);

        parsedLines.sort((left, right) => left.startTime - right.startTime);
        parsedLines.forEach((line, index) => {
            const nextStart = parsedLines[index + 1]?.startTime;
            if ((!Number.isFinite(line.endTime) || line.endTime <= line.startTime) && Number.isFinite(nextStart)) {
                line.endTime = Math.max(line.startTime + 1, nextStart);
            } else if (!Number.isFinite(line.endTime) || line.endTime <= line.startTime) {
                line.endTime = Math.max(line.startTime + 1, durationMs || line.startTime + 2500);
            }
        });

        const hasWordTiming = parsedLines.some(line => line.hasWordTiming);
        const groupedKaraokeLines = hasWordTiming
            ? groupParallelVocalLines(parsedLines)
            : [];
        const karaoke = hasWordTiming
            ? groupedKaraokeLines.map(line => {
                const copy = { ...line };
                delete copy.hasWordTiming;
                delete copy.sourceIndex;
                if (!copy.vocals && !copy.syllables?.length) {
                    copy.syllables = [{
                        text: copy.text,
                        startTime: copy.startTime,
                        endTime: copy.endTime
                    }];
                }
                return copy;
            })
            : null;
        const synced = parsedLines.map(line => ({
            startTime: line.startTime,
            endTime: line.endTime,
            text: line.text,
            speaker: line.speaker,
            'speaker-color': line['speaker-color'],
            'speaker-fallback': line['speaker-fallback'],
            kind: line.kind,
            unisonLineKey: line.unisonLineKey
        }));
        const unsynced = parsedLines.map(line => ({ text: line.text }));

        return { karaoke, synced, unsynced };
    }

    function parseLrcTimestamp(minutes, seconds, fraction) {
        const fractionText = String(fraction || '');
        const fractionMs = !fractionText
            ? 0
            : fractionText.length === 1
                ? Number(fractionText) * 100
                : fractionText.length === 2
                    ? Number(fractionText) * 10
                    : Number(fractionText.slice(0, 3));
        return (Number(minutes) * 60000) + (Number(seconds) * 1000) + fractionMs;
    }

    function parseLrcLyrics(lrc, durationMs = 0) {
        const lines = String(lrc || '').replace(/^\uFEFF/, '').split(/\r?\n/);
        let offset = 0;
        const synced = [];

        lines.forEach(rawLine => {
            const offsetMatch = rawLine.match(/^\[offset:([+-]?\d+)\]/i);
            if (offsetMatch) {
                offset = Number(offsetMatch[1]) || 0;
                return;
            }
            if (/^\[(ar|al|ti|by|re|ve|length):/i.test(rawLine)) return;

            const timestamps = [];
            const strippedLine = rawLine.replace(
                /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g,
                (_match, minutes, seconds, fraction) => {
                    const captureIndex = timestamps.length;
                    timestamps[captureIndex] = minutes;
                    timestamps[captureIndex + 1] = seconds;
                    timestamps[captureIndex + 2] = fraction;
                    return '';
                }
            );
            if (!timestamps.length) return;
            const text = strippedLine.trim();
            if (!text) return;

            for (let index = 0; index < timestamps.length; index += 3) {
                synced.push({
                    startTime: Math.max(0, parseLrcTimestamp(
                        timestamps[index],
                        timestamps[index + 1],
                        timestamps[index + 2]
                    ) + offset),
                    text
                });
            }
        });

        synced.sort((left, right) => left.startTime - right.startTime);
        synced.forEach((line, index) => {
            const nextStart = synced[index + 1]?.startTime;
            line.endTime = Number.isFinite(nextStart)
                ? Math.max(line.startTime + 1, nextStart)
                : Math.max(line.startTime + 1, durationMs || line.startTime + 3000);
        });

        if (!synced.length) return parsePlainLyrics(lrc);
        return {
            karaoke: null,
            synced,
            unsynced: synced.map(line => ({ text: line.text }))
        };
    }

    function parsePlainLyrics(plain) {
        const unsynced = String(plain || '')
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(text => ({ text }));
        return { karaoke: null, synced: null, unsynced };
    }

    function normalizeDurationSeconds(info) {
        const duration = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
    }

    function getArtistCandidates(artistInput) {
        const artist = String(artistInput || '').trim();
        if (!artist) return [];
        const primary = artist
            .split(/\s*(?:,|;|\bfeat\.?\b|\bfeaturing\b|\s&\s)\s*/i)[0]
            ?.trim();
        return Array.from(new Set([artist, primary].filter(Boolean)));
    }

    function normalizeMetadata(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }

    function isExactMetadataMatch(data, info) {
        const expectedTitle = normalizeMetadata(info?.title);
        const actualTitle = normalizeMetadata(data?.song);
        if (!expectedTitle || actualTitle !== expectedTitle) return false;

        const actualArtist = normalizeMetadata(data?.artist);
        return getArtistCandidates(info?.artist)
            .map(normalizeMetadata)
            .filter(Boolean)
            .includes(actualArtist);
    }

    function buildLyricsUrl(info, includeAlbum = true, artistOverride = null, includeDuration = true) {
        const url = new URL(`${API_BASE}/lyrics`);
        url.searchParams.set('song', String(info?.title || '').trim());
        url.searchParams.set('artist', String(artistOverride || info?.artist || '').trim());

        const durationSeconds = normalizeDurationSeconds(info);
        if (includeDuration && durationSeconds > 0) url.searchParams.set('duration', String(durationSeconds));
        const album = String(info?.album || '').trim();
        if (includeAlbum && album && album !== 'undefined') url.searchParams.set('album', album);
        return url;
    }

    async function fetchJson(url) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        try {
            const response = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                signal: controller?.signal
            });
            const body = await response.json().catch(() => null);
            return { response, body };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchLyricsData(info) {
        const album = String(info?.album || '').trim();
        const artistCandidates = getArtistCandidates(info?.artist);
        const includeAlbumOptions = album && album !== 'undefined' ? [true, false] : [false];
        const requests = [];
        includeAlbumOptions.forEach(includeAlbum => {
            artistCandidates.forEach(artist => {
                requests.push({
                    url: buildLyricsUrl(info, includeAlbum, artist, true),
                    exactMetadataRequired: false
                });
            });
        });
        if (normalizeDurationSeconds(info) > 0) {
            artistCandidates.forEach(artist => {
                requests.push({
                    url: buildLyricsUrl(info, false, artist, false),
                    exactMetadataRequired: true
                });
            });
        }
        const uniqueRequests = Array.from(new Map(
            requests.map(request => [request.url.toString(), request])
        ).values());

        for (const request of uniqueRequests) {
            const { response, body } = await fetchJson(request.url);
            if (response.ok && body?.success !== false && body?.data?.lyrics) {
                if (!request.exactMetadataRequired || isExactMetadataMatch(body.data, info)) {
                    return body.data;
                }
                continue;
            }
            if (response.status !== 404) {
                throw new Error(body?.error || `Unison request failed (${response.status})`);
            }
        }
        return null;
    }

    function parseResponseLyrics(data, durationMs) {
        const format = String(data?.format || '').toLowerCase();
        if (format === 'ttml') return parseTtmlLyrics(data.lyrics, durationMs);
        if (format === 'lrc') return parseLrcLyrics(data.lyrics, durationMs);
        if (format === 'plain') return parsePlainLyrics(data.lyrics);
        throw new Error(`Unsupported Unison lyrics format: ${format || 'unknown'}`);
    }

    const UnisonLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            window.__ivLyricsDebugLog?.(`[Unison Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function UnisonLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings unison-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, 'Unison'),
                            React.createElement('p', { style: { marginBottom: '8px' } }, ATTRIBUTION),
                            React.createElement('a', {
                                href: 'https://github.com/better-lyrics/unison',
                                target: '_blank',
                                rel: 'noreferrer'
                            }, 'github.com/better-lyrics/unison')
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
                skipCache: true,
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

            try {
                const data = await fetchLyricsData(info);
                if (!data) {
                    result.error = 'No lyrics';
                    return result;
                }

                const durationSeconds = normalizeDurationSeconds(info);
                const parsed = parseResponseLyrics(data, durationSeconds * 1000);
                result.karaoke = parsed.karaoke?.length ? parsed.karaoke : null;
                result.synced = parsed.synced?.length ? parsed.synced : null;
                result.unsynced = parsed.unsynced?.length ? parsed.unsynced : null;
                if (result.karaoke) result.karaokeSource = 'unison';
                result.unison = {
                    id: data.id ?? null,
                    videoId: data.videoId || null,
                    format: data.format || null,
                    syncType: data.syncType || null,
                    language: data.language || null,
                    score: data.score ?? null,
                    effectiveScore: data.effectiveScore ?? null,
                    voteCount: data.voteCount ?? null,
                    confidence: data.confidence || null,
                    sourceUrl: data.id ? `${API_BASE}/lyrics/${data.id}` : API_BASE
                };

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No usable lyrics';
                }

                window.__ivLyricsDebugLog?.('[Unison Lyrics Addon] Loaded lyrics', {
                    id: result.unison.id,
                    format: result.unison.format,
                    syncType: result.unison.syncType,
                    karaokeLines: result.karaoke?.length || 0,
                    syncedLines: result.synced?.length || 0,
                    unsyncedLines: result.unsynced?.length || 0
                });
                return result;
            } catch (error) {
                const timedOut = error?.name === 'AbortError';
                result.error = timedOut ? 'Request timed out' : (error?.message || 'Request error');
                console.warn('[Unison Lyrics Addon] Failed to load lyrics:', error);
                return result;
            }
        }
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(UnisonLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    window.UnisonLyricsAddon = UnisonLyricsAddon;
    const sharedLyricsParser = Object.freeze({
        parseTimeMs,
        parseTtmlLyrics,
        groupParallelVocalLines,
        parseLrcLyrics,
        parsePlainLyrics,
        stripBackgroundVocalParentheses,
        buildLyricsUrl,
        fetchLyricsData
    });
    window.ivLyricsLyricsParser = sharedLyricsParser;
    window.__ivLyricsUnisonDebug = sharedLyricsParser;

    registerAddon();
    window.__ivLyricsDebugLog?.('[Unison Lyrics Addon] Module loaded');
})();
