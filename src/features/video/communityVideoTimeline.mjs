export function normalizeVideoSkipSegments(segments, maxSegments = 10) {
  if (!Array.isArray(segments)) return [];
  const limit = Math.min(segments.length, Math.max(0, Math.trunc(maxSegments)));
  const normalized = [];
  let ordered = true;
  for (let index = 0; index < limit; index += 1) {
    const segment = segments[index];
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const roundedStart = Math.round(start * 10) / 10;
    const roundedEnd = Math.round(end * 10) / 10;
    if (roundedStart < 0 || roundedEnd > 3600 || roundedEnd - roundedStart < 0.1) continue;

    const previous = normalized[normalized.length - 1];
    if (previous && (previous.start > roundedStart || (previous.start === roundedStart && previous.end > roundedEnd))) {
      ordered = false;
    }
    normalized.push({ start: roundedStart, end: roundedEnd });
  }

  // Saved selections are already in playback order. Sort only when accepting unsorted input.
  if (!ordered) normalized.sort((a, b) => a.start - b.start || a.end - b.end);
  let mergedLength = 0;
  for (const segment of normalized) {
    const previous = normalized[mergedLength - 1];
    if (previous && segment.start <= previous.end + 0.001) previous.end = Math.max(previous.end, segment.end);
    else normalized[mergedLength++] = segment;
  }
  normalized.length = mergedLength;
  return normalized;
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
