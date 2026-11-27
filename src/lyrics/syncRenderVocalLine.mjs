const toVocalEntry = (part) => ({
    id: part.id,
    role: part.role,
    speaker: part.speaker,
    'speaker-color': part['speaker-color'] || '',
    'speaker-fallback': part['speaker-fallback'] || '',
    kind: part.kind,
    text: part.text,
    syllables: part.syllables,
});

// The caller prepares the timed parts and chooses when to shape a vocal line.
// Preview drafts and published timing use different part and line end rules.
export function buildSyncDataVocalLine(line, parts, { speaker = '', kind = 'vocal' } = {}) {
    const lead = parts.find(part => part.role === 'lead') || parts[0];
    const times = parts.flatMap(part => [part.startTime, part.endTime]).filter(Number.isFinite);
    return {
        ...line,
        startTime: Math.min(...times, line.startTime),
        endTime: Math.max(...times, line.endTime),
        speaker: line.speaker || lead.speaker || speaker,
        'speaker-color': line['speaker-color'] || lead['speaker-color'] || '',
        'speaker-fallback': line['speaker-fallback'] || lead['speaker-fallback'] || '',
        kind: line.kind || lead.kind || kind,
        vocals: {
            lead: toVocalEntry(lead),
            background: parts.filter(part => part !== lead).map(toVocalEntry),
        },
    };
}
