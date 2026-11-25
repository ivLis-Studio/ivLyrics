import { clamp, clamp01 } from "./timingMath.mjs";
import { getAnalysisHints, buildVocalCandidates, buildRhythmAnchors, getLineSectionVocality } from "./audioVocalAnalysis.mjs";

function buildVocalActivityWindow(startTime, endTime, vocalCandidates, confidence, unitCount) {
    const intervalMs = Math.max(1, endTime - startTime);
    if (!vocalCandidates.length) {
        return {
            activeStart: startTime,
            activeEnd: endTime,
            leadTrim: 0,
            tailTrim: 0
        };
    }

    const clusterGap = Math.max(180, Math.min(520, intervalMs * 0.16));
    const clusters = [];

    for (const candidate of vocalCandidates) {
        const previous = clusters[clusters.length - 1];
        if (!previous || (candidate.segmentStart - previous.end) > clusterGap) {
            clusters.push({
                start: candidate.segmentStart,
                end: candidate.segmentEnd,
                totalScore: candidate.score,
                peakScore: candidate.score,
                count: 1
            });
            continue;
        }

        previous.start = Math.min(previous.start, candidate.segmentStart);
        previous.end = Math.max(previous.end, candidate.segmentEnd);
        previous.totalScore += candidate.score;
        previous.peakScore = Math.max(previous.peakScore, candidate.score);
        previous.count += 1;
    }

    const bestCluster = clusters.reduce((best, cluster) => {
        if (!best) return cluster;
        const bestWeight = best.totalScore + (best.peakScore * 0.6) + (best.count * 0.08);
        const clusterWeight = cluster.totalScore + (cluster.peakScore * 0.6) + (cluster.count * 0.08);
        return clusterWeight > bestWeight ? cluster : best;
    }, null);

    const keptClusters = clusters.filter((cluster) => {
        if (!bestCluster) return true;
        if (cluster === bestCluster) return true;
        const isTrailingCluster = cluster.start >= bestCluster.end;
        const clusterGapFromBest = isTrailingCluster
            ? cluster.start - bestCluster.end
            : Math.max(0, bestCluster.start - cluster.end);
        if (isTrailingCluster && clusterGapFromBest > (clusterGap * 0.9)) {
            return cluster.totalScore >= bestCluster.totalScore * 0.55 ||
                cluster.peakScore >= Math.max(0.68, bestCluster.peakScore * 0.92);
        }
        if (cluster.totalScore >= bestCluster.totalScore * 0.32) return true;
        if (cluster.peakScore >= Math.max(0.58, bestCluster.peakScore * 0.82)) return true;
        return cluster.count >= 2 && cluster.totalScore >= 0.92;
    });

    const rawStart = Math.min(...keptClusters.map((cluster) => cluster.start));
    const rawEnd = Math.max(...keptClusters.map((cluster) => cluster.end));
    const minActiveDuration = Math.max(
        260,
        Math.min(intervalMs, Math.max((unitCount || 1) * 70, intervalMs * 0.24))
    );
    const leadPad = Math.max(30, Math.min(170, 45 + (intervalMs * 0.02)));
    const tailPad = Math.max(80, Math.min(280, 90 + (intervalMs * 0.045)));

    let activeStart = clamp(rawStart - leadPad, startTime, Math.max(startTime, endTime - minActiveDuration));
    let activeEnd = clamp(rawEnd + tailPad, activeStart + minActiveDuration, endTime);

    const leadTrim = Math.max(0, activeStart - startTime);
    const tailTrim = Math.max(0, endTime - activeEnd);
    const startTrimThreshold = Math.max(120, Math.min(420, intervalMs * (confidence >= 0.55 ? 0.08 : 0.13)));
    const endTrimThreshold = Math.max(180, Math.min(900, intervalMs * (confidence >= 0.5 ? 0.12 : 0.18)));
    const strongCandidates = vocalCandidates.filter((candidate) => candidate.score >= 0.58);
    const lastStrongCandidate = strongCandidates[strongCandidates.length - 1] || vocalCandidates[vocalCandidates.length - 1] || null;
    const tailSilenceMs = lastStrongCandidate ? Math.max(0, endTime - lastStrongCandidate.segmentEnd) : 0;
    const tailPresenceWindow = Math.max(160, Math.min(700, intervalMs * 0.12));
    const hasStrongTailPresence = strongCandidates.some((candidate) => candidate.segmentEnd >= (endTime - tailPresenceWindow));
    const forceTailTrimThreshold = Math.max(260, Math.min(1400, intervalMs * 0.18));
    const forceTailTrim = !!lastStrongCandidate &&
        tailSilenceMs >= forceTailTrimThreshold &&
        !hasStrongTailPresence &&
        (strongCandidates.length >= 2 || lastStrongCandidate.score >= 0.7);

    if (leadTrim < startTrimThreshold || confidence < 0.36) {
        activeStart = startTime;
    }

    if ((tailTrim < endTrimThreshold || confidence < 0.34) && !forceTailTrim) {
        activeEnd = endTime;
    }

    if ((activeEnd - activeStart) < minActiveDuration) {
        activeEnd = Math.min(endTime, activeStart + minActiveDuration);
        activeStart = Math.max(startTime, activeEnd - minActiveDuration);
    }

    return {
        activeStart,
        activeEnd,
        leadTrim: Math.max(0, activeStart - startTime),
        tailTrim: Math.max(0, endTime - activeEnd)
    };
}

function buildVocalMassCurve(startTime, endTime, vocalCandidates, rhythmAnchors, confidence) {
    const intervalMs = Math.max(1, endTime - startTime);
    const stepMs = Math.max(18, Math.min(36, Math.round(intervalMs / 88)));
    const frameCount = Math.max(2, Math.ceil(intervalMs / stepMs) + 1);
    const frames = [];
    const anchorSet = new Set((rhythmAnchors || []).map((time) => Math.round(time)));
    const baseMassFloor = vocalCandidates.length > 0
        ? Math.max(0.008, 0.012 - (confidence * 0.004))
        : 0.004;

    for (let index = 0; index < frameCount; index++) {
        const time = index === frameCount - 1
            ? endTime
            : Math.min(endTime, Math.round(startTime + (index * stepMs)));
        let mass = baseMassFloor;

        for (const candidate of vocalCandidates || []) {
            const durationMs = Math.max(1, candidate.durationMs || (candidate.segmentEnd - candidate.segmentStart) || stepMs);
            const peakRadius = Math.max(55, Math.min(220, durationMs * 0.6));
            const sustainRadius = Math.max(90, Math.min(320, durationMs * 1.1));
            const distanceToPeak = Math.abs(time - candidate.time);
            const peakShape = clamp01(1 - (distanceToPeak / peakRadius));
            const distanceToCenter = Math.abs(time - ((candidate.segmentStart + candidate.segmentEnd) / 2));
            const sustainShape = clamp01(1 - (distanceToCenter / sustainRadius));
            const inSegmentBoost = time >= candidate.segmentStart && time <= candidate.segmentEnd ? 1 : 0;

            mass += candidate.score * (
                (peakShape * 0.7) +
                (sustainShape * 0.35) +
                (inSegmentBoost * 0.18)
            );
        }

        if (anchorSet.has(time) && confidence < 0.5) {
            mass += 0.03 + ((0.5 - confidence) * 0.04);
        }

        frames.push({
            time,
            mass: Math.max(baseMassFloor, mass),
            cumulative: 0
        });
    }

    let cumulative = 0;
    for (const frame of frames) {
        cumulative += frame.mass;
        frame.cumulative = cumulative;
    }

    return {
        frames,
        stepMs,
        totalMass: cumulative
    };
}

function buildSilenceSpans(massCurve, startTime, endTime, confidence) {
    const frames = massCurve?.frames || [];
    if (!frames.length) return [];

    const averageMass = frames.reduce((sum, frame) => sum + frame.mass, 0) / Math.max(1, frames.length);
    const threshold = averageMass * (confidence >= 0.52 ? 0.58 : 0.68);
    const minSpanMs = Math.max(70, Math.min(220, (endTime - startTime) * 0.06));
    const spans = [];
    let currentSpan = null;

    const flushSilenceSpan = () => {
        if (currentSpan && (currentSpan.end - currentSpan.start) >= minSpanMs) {
            spans.push({
                ...currentSpan,
                avgMass: currentSpan.totalMass / Math.max(1, currentSpan.count),
                center: Math.round((currentSpan.start + currentSpan.end) / 2)
            });
        }
    };

    for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        const nextTime = frames[index + 1]?.time ?? endTime;
        const frameEnd = Math.min(endTime, Math.max(frame.time, nextTime));
        const isSilent = frame.mass <= threshold;

        if (isSilent) {
            if (!currentSpan) {
                currentSpan = {
                    start: frame.time,
                    end: frameEnd,
                    minMass: frame.mass,
                    totalMass: frame.mass,
                    count: 1
                };
            } else {
                currentSpan.end = frameEnd;
                currentSpan.minMass = Math.min(currentSpan.minMass, frame.mass);
                currentSpan.totalMass += frame.mass;
                currentSpan.count += 1;
            }
            continue;
        }

        flushSilenceSpan();
        currentSpan = null;
    }

    flushSilenceSpan();

    return spans;
}

export function buildLineTimingModel(startTime, endTime, analysis, unitCount = 1) {
    const analysisHints = getAnalysisHints(analysis);
    const vocalCandidates = buildVocalCandidates(startTime, endTime, analysis);
    const rhythmAnchors = buildRhythmAnchors(startTime, endTime, analysis);
    const intervalMs = Math.max(1, endTime - startTime);
    const expectedCandidates = Math.max(1, Math.round(intervalMs / 260));
    const strongCandidates = vocalCandidates.filter((candidate) => candidate.score >= 0.58).length;
    const topAverage = vocalCandidates.length
        ? vocalCandidates.slice().sort((left, right) => right.score - left.score).slice(0, Math.min(3, vocalCandidates.length))
            .reduce((sum, candidate) => sum + candidate.score, 0) / Math.min(3, vocalCandidates.length)
        : 0;
    const coverage = clamp01(vocalCandidates.length / expectedCandidates);
    const density = clamp01(strongCandidates / Math.max(1, expectedCandidates - 0.25));
    const sectionVocality = getLineSectionVocality(analysisHints, startTime, endTime);
    const confidence = clamp01((topAverage * 0.42) + (coverage * 0.24) + (density * 0.16) + (sectionVocality * 0.18));
    const activeWindow = buildVocalActivityWindow(startTime, endTime, vocalCandidates, confidence, unitCount);
    const vocalMassCurve = buildVocalMassCurve(
        activeWindow.activeStart,
        activeWindow.activeEnd,
        vocalCandidates.filter((candidate) =>
            candidate.segmentEnd > activeWindow.activeStart &&
            candidate.segmentStart < activeWindow.activeEnd
        ),
        rhythmAnchors.filter((anchor) => anchor >= activeWindow.activeStart && anchor <= activeWindow.activeEnd),
        confidence
    );
    const silenceSpans = buildSilenceSpans(
        vocalMassCurve,
        activeWindow.activeStart,
        activeWindow.activeEnd,
        confidence
    );
    const conservativeMode = sectionVocality < 0.33 || (confidence < 0.36 && strongCandidates < 2);

    return {
        rhythmAnchors,
        vocalCandidates,
        vocalMassCurve,
        silenceSpans,
        confidence,
        sectionVocality,
        conservativeMode,
        ...activeWindow
    };
}
