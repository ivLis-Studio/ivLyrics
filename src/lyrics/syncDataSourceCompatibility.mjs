export const SyncDataSourceCompatibility = (() => {
    const normalizeProvider = (value) => String(value || '').trim().toLowerCase();
    const normalizeLrclibId = (value) => (
        value === undefined || value === null ? '' : String(value).trim()
    );

    const hasCompatibleLegacyLineRanges = (lines, lineCharCounts) => {
        if (!Array.isArray(lines) || !Array.isArray(lineCharCounts) || !lineCharCounts.length) return false;
        const lineEndsByStart = new Map();
        let start = 0;
        for (const count of lineCharCounts) {
            if (!Number.isSafeInteger(count) || count <= 0) return false;
            lineEndsByStart.set(start, start + count - 1);
            start += count;
        }
        // Without a source fingerprint, only whole matching source rows
        // can safely inherit legacy timings, including partial submissions.
        return lines.every(line => Number.isSafeInteger(line?.start)
            && Number.isSafeInteger(line?.end)
            && lineEndsByStart.get(line.start) === line.end);
    };

    const canApplyLrclibFingerprintFallback = ({
        syncSource,
        currentProvider,
        currentLrclibId,
        hasExactLineShape
    } = {}) => {
        if (hasExactLineShape !== true) return false;
        if (normalizeProvider(syncSource?.provider) !== 'lrclib') return false;
        if (normalizeProvider(currentProvider) !== 'lrclib') return false;

        const expectedId = normalizeLrclibId(syncSource?.lrclibId ?? syncSource?.id);
        const actualId = normalizeLrclibId(currentLrclibId);
        return !!expectedId && !!actualId && expectedId === actualId;
    };

    return Object.freeze({
        canApplyLrclibFingerprintFallback,
        hasCompatibleLegacyLineRanges
    });
})();
