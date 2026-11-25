// Sync-data keeps monotonic timing targets on the wire, even when the user
// rejoins targets whose times overlap. Those targets are not display rows.
// Decode them separately, then join only the explicit source-text groups.
function buildLrclibSyncDataParallelParts(line, fullTextChars, buildPart) {
    const points = line?.parallel?.manualSplitPoints;
    const parts = line?.parallel?.parts;
    const start = Number(line?.start);
    const end = Number(line?.end);
    if (!Array.isArray(points) || !Array.isArray(parts) || parts.length === 0
        || !Number.isInteger(start) || !Number.isInteger(end) || end < start
        || !Array.isArray(fullTextChars) || typeof buildPart !== 'function'
        || points.some((point, index) => !Number.isInteger(point) || point <= 0 || point > end - start
            || (index > 0 && point <= points[index - 1]))) return null;

    const boundaries = [...new Set([
        start,
        ...points.map(point => start + point),
        ...(Array.isArray(line.mergedLineContinuationStarts) ? line.mergedLineContinuationStarts : [])
            .filter(point => Number.isInteger(point) && point > start && point <= end),
        end + 1,
    ])].sort((left, right) => left - right);
    const overlaps = (left, right) => left.some(a => right.some(b => a.start <= b.end && b.start <= a.end));
    const groups = new Map();
    const independent = [];
    const precedingRanges = [];
    const orderedParts = [...parts].sort((left, right) => (
        Number(right?.role === 'lead') - Number(left?.role === 'lead')
        || Number(left?.ranges?.[0]?.start) - Number(right?.ranges?.[0]?.start)
    ));

    for (const part of orderedParts) {
        const ranges = part?.ranges;
        if (!Array.isArray(ranges) || ranges.length === 0 || !Array.isArray(part.chars)
            || ranges.some(range => !Number.isInteger(range?.start) || !Number.isInteger(range?.end)
                || range.start < start || range.end > end || range.end < range.start)
            || part.chars.length !== ranges.reduce((count, range) => count + range.end - range.start + 1, 0)) return null;

        const rendered = buildPart(part);
        if (!rendered) continue;
        // A second voice can sing the same indexes, or own an explicitly
        // grouped set of noncontiguous ranges. Preserve that vocal intact.
        if (ranges.length > 1 || overlaps(precedingRanges, ranges)) {
            independent.push({ start: ranges[0].start, part: rendered });
            continue;
        }
        precedingRanges.push(...ranges);

        const range = ranges[0];
        let firstIndex = range.start;
        let lastIndex = range.end;
        while (firstIndex <= lastIndex && /\s/u.test(fullTextChars[firstIndex] || '')) firstIndex++;
        while (lastIndex >= firstIndex && /\s/u.test(fullTextChars[lastIndex] || '')) lastIndex--;
        if (rendered.text !== fullTextChars.slice(firstIndex, lastIndex + 1).join('')) return null;
        const fragmentsByGroup = new Map();
        let absoluteIndex = firstIndex;
        // Clip text after decoding the complete timing target. Re-decoding
        // a clipped target would recalculate its last glyph's end time.
        for (const syllable of rendered.syllables) {
            for (const char of Array.from(syllable.text || '')) {
                const groupIndex = boundaries.findIndex((boundary, index) => (
                    absoluteIndex >= boundary && absoluteIndex < boundaries[index + 1]
                ));
                let fragment = fragmentsByGroup.get(groupIndex);
                if (!fragment) {
                    fragment = { ranges: [{ start: absoluteIndex, end: absoluteIndex }], part: { ...rendered, text: '', syllables: [] } };
                    fragmentsByGroup.set(groupIndex, fragment);
                }
                fragment.ranges[0].end = absoluteIndex++;
                fragment.part.text += char;
                const previous = fragment.part.syllables[fragment.part.syllables.length - 1];
                if (previous?.source === syllable) previous.value.text += char;
                else fragment.part.syllables.push({ source: syllable, value: { ...syllable, text: char } });
            }
        }
        for (const [groupIndex, fragment] of fragmentsByGroup) {
            fragment.part.syllables = fragment.part.syllables.map(entry => entry.value);
            const fragments = groups.get(groupIndex) || [];
            fragments.push(fragment);
            groups.set(groupIndex, fragments);
        }
    }

    const grouped = [...groups].map(([groupIndex, fragments]) => {
        fragments.sort((left, right) => left.ranges[0].start - right.ranges[0].start);
        const first = fragments[0].part;
        const syllables = [];
        let previousEnd = null;
        for (const fragment of fragments) {
            const source = fragment.part;
            const fragmentStart = fragment.ranges[0].start;
            if (previousEnd !== null && fragmentStart > previousEnd + 1) {
                // Hidden separators stay hidden; whitespace still separates
                // joined words without consuming or moving any sung mark.
                const gap = fullTextChars.slice(previousEnd + 1, fragmentStart).filter(char => /\s/u.test(char)).join('');
                if (gap) {
                    const time = source.syllables[0]?.startTime ?? source.startTime;
                    syllables.push({ text: gap, startTime: time, endTime: time });
                }
            }
            for (const syllable of source.syllables) {
                const styled = { ...syllable };
                const speaker = source.speaker || line.speaker || 'NORMAL';
                const firstSpeaker = first.speaker || line.speaker || 'NORMAL';
                if (!styled.styleSpeaker && (speaker !== firstSpeaker
                    || source['speaker-color'] !== first['speaker-color']
                    || source['speaker-fallback'] !== first['speaker-fallback'])) {
                    styled.inlineStyle = true;
                    styled.styleSpeaker = speaker;
                    if (source['speaker-color']) styled.styleSpeakerColor = source['speaker-color'];
                    if (source['speaker-fallback']) styled.styleSpeakerFallback = source['speaker-fallback'];
                }
                if (!styled.styleKind && source.kind && source.kind !== first.kind) {
                    styled.inlineStyle = true;
                    styled.styleKind = source.kind;
                }
                syllables.push(styled);
            }
            previousEnd = fragment.ranges[fragment.ranges.length - 1].end;
        }
        const starts = syllables.map(syllable => syllable.startTime).filter(Number.isFinite);
        const ends = syllables.map(syllable => syllable.endTime).filter(Number.isFinite);
        return { start: boundaries[groupIndex], part: {
            ...first, id: `${first.id || 'part'}-group-${groupIndex}`,
            text: syllables.map(syllable => syllable.text || '').join(''), syllables,
            startTime: starts.length ? Math.min(...starts) : first.startTime,
            endTime: ends.length ? Math.max(...ends) : first.endTime,
        } };
    });
    return [...grouped, ...independent]
        .sort((left, right) => left.start - right.start)
        .map(entry => entry.part);
}

export {
    buildLrclibSyncDataParallelParts,
};
