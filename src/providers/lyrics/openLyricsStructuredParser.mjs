import {
    createVocalPart, decodeLyricTextEntities, getSpeakerPresentation, parsePlainLyrics,
    parseStructuredReferenceLines, parseTimedTokens, toMilliseconds,
} from "./openLyricsTokens.mjs";
import { getStructuredLineText, isNoLyricsPlaceholderText } from "./openLyricsMetadata.mjs";
import { isJapaneseLyricsPayload, splitLongJapaneseLines } from "./openLyricsJapaneseWrap.mjs";

export function createOpenLyricsStructuredParser({ metadataFilter, readSharedParser }) {
    const { isTargetStructuredPayload, getLeadingMetadataLineIndexes } = metadataFilter;

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

        const parseStructuredLine = (line, index) => {
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
                openLyricsLineKey: key,
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
        };
        const parsedLines = rawLines.map(parseStructuredLine).filter(Boolean).sort((left, right) => left.startTime - right.startTime);

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
                openLyricsLineKey: line.openLyricsLineKey
            }))
            : null;
        const unsynced = displayLines.map(line => ({ text: line.text }));
        return { karaoke, synced, unsynced };
    }

    function parsePayload(payload, durationMs, info = null) {
        const structured = parseStructuredLyrics(payload, durationMs, info);
        if (structured) return structured;

        const sharedParser = readSharedParser();
        if (typeof payload?.ttmlContent === 'string' && typeof sharedParser?.parseTtmlLyrics === 'function') {
            return sharedParser.parseTtmlLyrics(payload.ttmlContent, durationMs);
        }
        if (typeof payload?.lrc === 'string' && typeof sharedParser?.parseLrcLyrics === 'function') {
            return sharedParser.parseLrcLyrics(decodeLyricTextEntities(payload.lrc), durationMs);
        }
        if (isTargetStructuredPayload(payload) && Array.isArray(payload?.lyrics)) return null;
        return parsePlainLyrics(payload?.plain || payload?.lyrics || '');
    }

    return { parseStructuredLyrics, parsePayload };
}
