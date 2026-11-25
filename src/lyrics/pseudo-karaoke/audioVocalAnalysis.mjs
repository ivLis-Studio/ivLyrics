import { clamp, clamp01, dedupeSortedTimes } from "./timingMath.mjs";

const analysisHintsCache = new WeakMap();

function getPitchStats(pitches) {
    if (!Array.isArray(pitches) || pitches.length === 0) return { peak: 0, focus: 0, spread: 0 };

    const sorted = [...pitches].sort((left, right) => right - left);
    const sum = pitches.reduce((total, value) => total + Math.max(0, value), 0);
    const peak = sorted[0] || 0;
    const focus = sum > 0 ? ((sorted[0] || 0) + (sorted[1] || 0) + (sorted[2] || 0)) / sum : 0;
    const mean = sum / pitches.length;
    const variance = pitches.reduce((total, value) => total + ((value - mean) ** 2), 0) / pitches.length;

    return { peak, focus, spread: Math.sqrt(variance) };
}

function getPitchPeakIndex(pitches) {
    if (!Array.isArray(pitches) || pitches.length === 0) return -1;

    let bestIndex = 0;
    let bestValue = pitches[0] || 0;
    for (let index = 1; index < pitches.length; index++) {
        if ((pitches[index] || 0) > bestValue) {
            bestValue = pitches[index] || 0;
            bestIndex = index;
        }
    }
    return bestValue > 0 ? bestIndex : -1;
}

function getPitchNeighborAffinity(segment, neighborSegment) {
    if (!segment || !neighborSegment) return 0;

    const segmentPeakIndex = Number.isFinite(segment?.pitchPeakIndex)
        ? segment.pitchPeakIndex
        : getPitchPeakIndex(segment?.pitches);
    const neighborPeakIndex = Number.isFinite(neighborSegment?.pitchPeakIndex)
        ? neighborSegment.pitchPeakIndex
        : getPitchPeakIndex(neighborSegment?.pitches);
    if (segmentPeakIndex < 0 || neighborPeakIndex < 0) return 0;

    const distance = Math.abs(segmentPeakIndex - neighborPeakIndex);
    const peakCloseness = clamp01(1 - (distance / 5));
    const segmentFocus = Number.isFinite(segment?.pitchFocus) ? segment.pitchFocus : getPitchStats(segment?.pitches).focus;
    const neighborFocus = Number.isFinite(neighborSegment?.pitchFocus) ? neighborSegment.pitchFocus : getPitchStats(neighborSegment?.pitches).focus;
    const focusCloseness = clamp01(1 - (Math.abs(segmentFocus - neighborFocus) / 0.32));
    return clamp01((peakCloseness * 0.62) + (focusCloseness * 0.38));
}

function getTimbreDelta(currentSegment, neighborSegment) {
    const current = currentSegment?.timbre;
    const neighbor = neighborSegment?.timbre;
    if (!Array.isArray(current) || !Array.isArray(neighbor) || !current.length || !neighbor.length) return 0;

    const length = Math.min(current.length, neighbor.length, 6);
    let sum = 0;
    for (let index = 0; index < length; index++) {
        sum += Math.abs(current[index] - neighbor[index]);
    }

    return clamp01(sum / (length * 45));
}

function scoreVocalCandidate(segment, previousSegment, nextSegment) {
    const durationMs = Math.max(1, (segment?.duration || 0) * 1000);
    if (durationMs < 35 || durationMs > 650) return null;

    const confidence = clamp01(typeof segment?.confidence === 'number' ? segment.confidence : 0);
    const loudnessStart = Number.isFinite(segment?.loudness_start) ? segment.loudness_start : -60;
    const loudnessMax = Number.isFinite(segment?.loudness_max) ? segment.loudness_max : loudnessStart;
    const loudnessRise = loudnessMax - loudnessStart;
    const loudnessMaxTime = Number.isFinite(segment?.loudness_max_time) ? segment.loudness_max_time : Math.min(segment?.duration || 0, 0.08);
    const attackRatio = clamp01(loudnessMaxTime / Math.max(segment?.duration || 0.001, 0.001));
    const attackScore = clamp01(1 - (Math.abs(attackRatio - 0.22) / 0.22));
    const onsetScore = clamp01((loudnessRise + 2) / 10);
    const sustainedScore = clamp01((durationMs - 60) / 180);
    const loudnessScore = clamp01((loudnessMax + 36) / 28);
    const pitchStats = getPitchStats(segment?.pitches);
    const harmonicScore = clamp01(((pitchStats.peak * 0.55) + (pitchStats.focus * 0.65) - 0.35) / 0.55);
    const contrastScore = Math.max(getTimbreDelta(segment, previousSegment), getTimbreDelta(segment, nextSegment));

    let score =
        (confidence * 0.16) +
        (onsetScore * 0.2) +
        (attackScore * 0.12) +
        (sustainedScore * 0.15) +
        (harmonicScore * 0.22) +
        (contrastScore * 0.1) +
        (loudnessScore * 0.05);

    if (durationMs < 90 && attackRatio < 0.12 && onsetScore > 0.55) score -= 0.18;
    if (pitchStats.focus < 0.38 && pitchStats.peak < 0.42) score -= 0.12;
    if (pitchStats.spread > 0.25 && durationMs < 110) score -= 0.08;

    return {
        baseScore: clamp01(score),
        durationMs,
        confidence,
        attackRatio,
        onsetScore,
        sustainedScore,
        loudnessScore,
        harmonicScore,
        contrastScore,
        pitchPeakIndex: getPitchPeakIndex(segment?.pitches),
        pitchSpread: pitchStats.spread,
        pitchFocus: pitchStats.focus
    };
}

function getSectionBoundsMs(section, fallbackEndMs) {
    const sectionStart = Math.max(0, Math.round((section?.start || 0) * 1000));
    const sectionDurationMs = Math.max(0, Math.round((section?.duration || 0) * 1000));
    const sectionEnd = sectionDurationMs > 0
        ? sectionStart + sectionDurationMs
        : Math.max(sectionStart, fallbackEndMs);
    return {
        start: sectionStart,
        end: Math.max(sectionStart + 1, sectionEnd)
    };
}

function buildTrackSeedProfile(scoredSegments) {
    if (!Array.isArray(scoredSegments) || !scoredSegments.length) return null;

    const seeds = scoredSegments.filter((candidate) =>
        candidate.baseScore >= 0.56 &&
        candidate.harmonicScore >= 0.5 &&
        candidate.pitchFocus >= 0.42 &&
        candidate.durationMs >= 70 &&
        candidate.durationMs <= 420
    );
    const source = seeds.length >= 4
        ? seeds
        : scoredSegments
            .slice()
            .sort((left, right) => right.baseScore - left.baseScore)
            .slice(0, Math.min(8, scoredSegments.length));
    if (!source.length) return null;

    const totalWeight = source.reduce((sum, candidate) => sum + Math.max(0.1, candidate.baseScore), 0) || 1;
    const average = (key) => source.reduce(
        (sum, candidate) => sum + ((candidate[key] || 0) * Math.max(0.1, candidate.baseScore)),
        0
    ) / totalWeight;
    const timbreLength = Math.min(
        6,
        ...source.map((candidate) => Array.isArray(candidate.timbre) ? candidate.timbre.length : 0)
    );
    const timbreCentroid = Array.from({ length: Math.max(0, timbreLength) }, (_, index) =>
        source.reduce(
            (sum, candidate) => sum + (((candidate.timbre?.[index]) || 0) * Math.max(0.1, candidate.baseScore)),
            0
        ) / totalWeight
    );

    return {
        seedCount: source.length,
        averageDurationMs: average('durationMs'),
        averageAttackRatio: average('attackRatio'),
        averagePitchFocus: average('pitchFocus'),
        averagePitchSpread: average('pitchSpread'),
        averageHarmonicScore: average('harmonicScore'),
        averageLoudnessScore: average('loudnessScore'),
        timbreCentroid
    };
}

function getTimbreSimilarity(timbre, profile) {
    if (!Array.isArray(timbre) || !profile?.timbreCentroid?.length) return 0.5;

    const length = Math.min(timbre.length, profile.timbreCentroid.length);
    if (!length) return 0.5;

    let delta = 0;
    for (let index = 0; index < length; index++) {
        delta += Math.abs((timbre[index] || 0) - (profile.timbreCentroid[index] || 0));
    }

    return clamp01(1 - (delta / (length * 34)));
}

function scoreProfileSimilarity(candidate, profile) {
    if (!candidate || !profile) return 0.5;

    const durationSimilarity = clamp01(
        1 - (Math.abs(Math.log((candidate.durationMs || 1) / Math.max(1, profile.averageDurationMs || 1))) / Math.log(3.6))
    );
    const attackSimilarity = clamp01(
        1 - (Math.abs((candidate.attackRatio || 0) - (profile.averageAttackRatio || 0)) / 0.28)
    );
    const focusSimilarity = clamp01(
        1 - (Math.abs((candidate.pitchFocus || 0) - (profile.averagePitchFocus || 0)) / 0.34)
    );
    const spreadSimilarity = clamp01(
        1 - (Math.abs((candidate.pitchSpread || 0) - (profile.averagePitchSpread || 0)) / 0.2)
    );
    const harmonicSimilarity = clamp01(
        1 - (Math.abs((candidate.harmonicScore || 0) - (profile.averageHarmonicScore || 0)) / 0.32)
    );
    const loudnessSimilarity = clamp01(
        1 - (Math.abs((candidate.loudnessScore || 0) - (profile.averageLoudnessScore || 0)) / 0.4)
    );
    const timbreSimilarity = getTimbreSimilarity(candidate.timbre, profile);

    return clamp01(
        (durationSimilarity * 0.18) +
        (attackSimilarity * 0.12) +
        (focusSimilarity * 0.2) +
        (spreadSimilarity * 0.12) +
        (harmonicSimilarity * 0.2) +
        (loudnessSimilarity * 0.08) +
        (timbreSimilarity * 0.1)
    );
}

function buildSectionVocalityMap(analysis, scoredSegments) {
    if (!Array.isArray(analysis?.sections) || !analysis.sections.length) return [];

    const trackEndMs = Array.isArray(analysis?.segments) && analysis.segments.length
        ? Math.round(
            ((analysis.segments[analysis.segments.length - 1]?.start || 0) * 1000) +
            ((analysis.segments[analysis.segments.length - 1]?.duration || 0) * 1000)
        )
        : 0;

    return analysis.sections.map((section, index, sections) => {
        const nextSection = sections[index + 1];
        const nextSectionStart = nextSection ? Math.round((nextSection.start || 0) * 1000) : trackEndMs;
        const bounds = getSectionBoundsMs(section, nextSectionStart);
        const candidates = scoredSegments.filter((candidate) =>
            candidate.segmentEnd > bounds.start &&
            candidate.segmentStart < bounds.end
        );
        const sectionDuration = Math.max(1, bounds.end - bounds.start);
        const strongCount = candidates.filter((candidate) => candidate.baseScore >= 0.56).length;
        const weightedCoverage = clamp01(
            candidates.reduce((sum, candidate) => {
                const overlapStart = Math.max(bounds.start, candidate.segmentStart);
                const overlapEnd = Math.min(bounds.end, candidate.segmentEnd);
                const overlap = Math.max(0, overlapEnd - overlapStart);
                return sum + (overlap * Math.max(0.18, candidate.baseScore));
            }, 0) / Math.max(1, sectionDuration * 0.72)
        );
        const topAverage = candidates.length
            ? candidates
                .slice()
                .sort((left, right) => right.baseScore - left.baseScore)
                .slice(0, Math.min(6, candidates.length))
                .reduce((sum, candidate) => sum + candidate.baseScore, 0) / Math.min(6, candidates.length)
            : 0;
        const density = clamp01(strongCount / Math.max(1, Math.round(sectionDuration / 650)));
        const vocality = clamp01((topAverage * 0.46) + (weightedCoverage * 0.32) + (density * 0.22));

        return {
            ...bounds,
            vocality
        };
    });
}

function buildAnalysisHints(analysis) {
    if (!analysis || !Array.isArray(analysis?.segments)) {
        return {
            scoredSegments: [],
            vocalProfile: null,
            sectionVocality: []
        };
    }

    const scoredSegments = [];
    for (let index = 0; index < analysis.segments.length; index++) {
        const segment = analysis.segments[index];
        const segmentStart = (segment?.start || 0) * 1000;
        const segmentEnd = segmentStart + ((segment?.duration || 0) * 1000);
        const descriptor = scoreVocalCandidate(segment, analysis.segments[index - 1], analysis.segments[index + 1]);
        if (!descriptor || descriptor.baseScore < 0.14) continue;

        const loudnessMaxTime = Number.isFinite(segment?.loudness_max_time)
            ? segment.loudness_max_time * 1000
            : Math.min(80, (segment?.duration || 0) * 380);

        scoredSegments.push({
            time: Math.round(Math.max(0, segmentStart + loudnessMaxTime)),
            segmentStart: Math.round(Math.max(0, segmentStart)),
            segmentEnd: Math.round(Math.max(segmentStart + 1, segmentEnd)),
            timbre: Array.isArray(segment?.timbre) ? segment.timbre.slice(0, 6) : [],
            ...descriptor
        });
    }

    const vocalProfile = buildTrackSeedProfile(scoredSegments);
    const sectionVocality = buildSectionVocalityMap(analysis, scoredSegments);
    return { scoredSegments, vocalProfile, sectionVocality };
}

function getAnalysisHints(analysis) {
    if (!analysis || typeof analysis !== 'object') {
        return buildAnalysisHints(null);
    }

    const cached = analysisHintsCache.get(analysis);
    if (cached) return cached;

    const hints = buildAnalysisHints(analysis);
    analysisHintsCache.set(analysis, hints);
    return hints;
}

function getSectionVocalityAtTime(analysisHints, timeMs) {
    const sections = analysisHints?.sectionVocality || [];
    if (!sections.length) return 0.5;

    const section = sections.find((entry) => timeMs >= entry.start && timeMs < entry.end)
        || sections[sections.length - 1];
    return clamp01(section?.vocality ?? 0.5);
}

function getLineSectionVocality(analysisHints, startTime, endTime) {
    const sections = analysisHints?.sectionVocality || [];
    if (!sections.length) return 0.5;

    let weightedSum = 0;
    let covered = 0;
    for (const section of sections) {
        const overlapStart = Math.max(startTime, section.start);
        const overlapEnd = Math.min(endTime, section.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (!overlap) continue;
        weightedSum += overlap * section.vocality;
        covered += overlap;
    }

    if (!covered) {
        const midPoint = Math.round((startTime + endTime) / 2);
        return getSectionVocalityAtTime(analysisHints, midPoint);
    }

    return clamp01(weightedSum / covered);
}

function buildRhythmAnchors(startTime, endTime, analysis) {
    const intervalMs = endTime - startTime;
    const anchors = [startTime, endTime];

    const addStarts = (items, minConfidence) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            const confidence = typeof item?.confidence === 'number' ? item.confidence : 1;
            const itemStart = Math.round((item?.start || 0) * 1000);
            if (confidence < minConfidence) continue;
            if (itemStart <= startTime || itemStart >= endTime) continue;
            anchors.push(itemStart);
        }
    };

    addStarts(analysis?.beats, 0.2);
    addStarts(analysis?.tatums, 0.12);

    return dedupeSortedTimes(
        anchors.sort((left, right) => left - right).filter((time) => time >= startTime && time <= endTime),
        Math.max(18, Math.min(90, intervalMs / 140))
    );
}

function buildVocalCandidates(startTime, endTime, analysis) {
    const analysisHints = getAnalysisHints(analysis);
    if (!analysisHints.scoredSegments.length) return [];

    const rawCandidates = analysisHints.scoredSegments
        .filter((candidate) => candidate.segmentEnd > startTime && candidate.segmentStart < endTime)
        .map((candidate) => ({
            ...candidate,
            time: Math.round(clamp(candidate.time, startTime, endTime)),
            segmentStart: Math.round(Math.max(startTime, candidate.segmentStart)),
            segmentEnd: Math.round(Math.min(endTime, candidate.segmentEnd))
        }))
        .filter((candidate) => candidate.segmentEnd > candidate.segmentStart && candidate.baseScore >= 0.18);

    const candidates = rawCandidates.map((candidate, index) => {
        const previous = rawCandidates[index - 1] || null;
        const next = rawCandidates[index + 1] || null;
        const previousGap = previous ? Math.max(0, candidate.segmentStart - previous.segmentEnd) : Number.POSITIVE_INFINITY;
        const nextGap = next ? Math.max(0, next.segmentStart - candidate.segmentEnd) : Number.POSITIVE_INFINITY;
        const previousSupport = previous && previousGap <= 110
            ? previous.baseScore * getPitchNeighborAffinity(candidate, previous) * clamp01(1 - (previousGap / 130))
            : 0;
        const nextSupport = next && nextGap <= 110
            ? next.baseScore * getPitchNeighborAffinity(candidate, next) * clamp01(1 - (nextGap / 130))
            : 0;
        const neighborSupport = (previousSupport + nextSupport) / 2;
        const runSupport = previousSupport > 0.2 && nextSupport > 0.2
            ? Math.min(previousSupport, nextSupport) * 0.9
            : 0;
        const profileSimilarity = scoreProfileSimilarity(candidate, analysisHints.vocalProfile);
        const sectionVocality = getSectionVocalityAtTime(analysisHints, candidate.time);
        const percussionPenalty =
            (candidate.durationMs < 95 && candidate.attackRatio < 0.12 && candidate.onsetScore > 0.7 ? 0.16 : 0) +
            (candidate.harmonicScore < 0.4 && candidate.contrastScore > 0.72 ? 0.11 : 0) +
            (candidate.pitchSpread > 0.28 && candidate.durationMs < 120 ? 0.07 : 0) +
            (sectionVocality < 0.28 && candidate.durationMs < 120 && candidate.attackRatio < 0.16 && candidate.onsetScore > 0.66 ? 0.12 : 0);
        const isolationPenalty = neighborSupport < 0.12 && candidate.baseScore < 0.52
            ? (0.08 + (candidate.contrastScore * 0.06))
            : 0;
        const harmonicRunBoost = candidate.harmonicScore > 0.58 && neighborSupport > 0.18
            ? 0.08 + (neighborSupport * 0.12)
            : 0;
        const profilePenalty = profileSimilarity < 0.3 && candidate.baseScore < 0.58
            ? (0.06 + ((0.3 - profileSimilarity) * 0.18))
            : 0;
        const lowVocalSectionPenalty = sectionVocality < 0.24 && candidate.harmonicScore < 0.56 && neighborSupport < 0.16
            ? (0.08 + ((0.24 - sectionVocality) * 0.2))
            : 0;
        const refinedScore = clamp01(
            (candidate.baseScore * 0.6) +
            (neighborSupport * 0.24) +
            (runSupport * 0.18) +
            (profileSimilarity * 0.18) +
            (sectionVocality * 0.12) +
            harmonicRunBoost -
            percussionPenalty -
            isolationPenalty -
            profilePenalty -
            lowVocalSectionPenalty
        );

        return {
            ...candidate,
            score: refinedScore,
            supportScore: neighborSupport,
            runSupportScore: runSupport,
            profileSimilarity,
            sectionVocality
        };
    }).filter((candidate) => {
        const requiredScore = candidate.sectionVocality < 0.3 ? 0.3 : 0.24;
        return candidate.score >= requiredScore;
    });

    candidates.sort((left, right) => left.time - right.time);
    return candidates.reduce((accumulator, candidate) => {
        const previous = accumulator[accumulator.length - 1];
        if (!previous || (candidate.time - previous.time) > 55) {
            accumulator.push(candidate);
        } else if (candidate.score > previous.score) {
            accumulator[accumulator.length - 1] = candidate;
        }
        return accumulator;
    }, []);
}

export {
    getAnalysisHints,
    buildVocalCandidates,
    buildRhythmAnchors,
    getLineSectionVocality,
};
