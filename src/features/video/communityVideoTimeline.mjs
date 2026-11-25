export function normalizeVideoSkipSegments(segments, maxSegments = 10) {
  if (!Array.isArray(segments)) return [];
  const normalized = segments
    .slice(0, Math.max(0, maxSegments))
    .map((segment) => {
      const start = Number(segment?.start);
      const end = Number(segment?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const roundedStart = Math.round(start * 10) / 10;
      const roundedEnd = Math.round(end * 10) / 10;
      if (roundedStart < 0 || roundedEnd > 3600 || roundedEnd - roundedStart < 0.1) {
        return null;
      }
      return { start: roundedStart, end: roundedEnd };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  return normalized.reduce((merged, segment) => {
    const previous = merged[merged.length - 1];
    if (previous && segment.start <= previous.end + 0.001) {
      previous.end = Math.max(previous.end, segment.end);
    } else {
      merged.push({ ...segment });
    }
    return merged;
  }, []);
}

export function mapVideoTimeWithSkipSegments(baseVideoTime, segments, anchorTime = 0) {
  let mappedTime = Number(baseVideoTime);
  if (!Number.isFinite(mappedTime)) return 0;
  const parsedAnchor = Number(anchorTime);
  const anchor = Number.isFinite(parsedAnchor) ? Math.max(0, parsedAnchor) : 0;

  for (const segment of normalizeVideoSkipSegments(segments)) {
    if (segment.end <= anchor) continue;
    const effectiveStart = Math.max(anchor, segment.start);
    if (mappedTime + 0.001 >= effectiveStart) {
      mappedTime += segment.end - effectiveStart;
    }
  }
  return mappedTime;
}

export function getVideoSkipSegmentAtTime(videoTime, segments, anchorTime = 0) {
  const parsedTime = Number(videoTime);
  if (!Number.isFinite(parsedTime)) return null;
  const parsedAnchor = Number(anchorTime);
  const anchor = Number.isFinite(parsedAnchor) ? Math.max(0, parsedAnchor) : 0;
  return normalizeVideoSkipSegments(segments).find((segment) =>
    segment.end > anchor &&
    parsedTime + 0.001 >= Math.max(anchor, segment.start) &&
    parsedTime < segment.end - 0.001
  ) || null;
}
