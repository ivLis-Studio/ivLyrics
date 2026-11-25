import { clamp, clamp01, dedupeSortedTimes } from "./timingMath.mjs";
import { isAggressiveChar, tokenizeLine, getUnitWeight, mergeUnitsConservatively } from "./lyricUnits.mjs";
import { buildLineTimingModel } from "./lineTimingModel.mjs";

function getMassAtTime(massCurve, time, startTime, endTime) {
    const frames = massCurve?.frames || [];
    if (!frames.length) {
        const interval = Math.max(1, endTime - startTime);
        return clamp01((time - startTime) / interval);
    }

    const clampedTime = clamp(time, startTime, endTime);
    let previousFrame = { time: startTime, cumulative: 0 };

    for (const frame of frames) {
        if (frame.time >= clampedTime) {
            const spanTime = frame.time - previousFrame.time;
            const localRatio = spanTime > 0
                ? (clampedTime - previousFrame.time) / spanTime
                : 0;
            return previousFrame.cumulative + ((frame.cumulative - previousFrame.cumulative) * localRatio);
        }

        previousFrame = frame;
    }

    return frames[frames.length - 1]?.cumulative || 0;
}

function getLocalMassAtTime(massCurve, time, startTime, endTime) {
    const frames = massCurve?.frames || [];
    if (!frames.length) return 0;

    const clampedTime = clamp(time, startTime, endTime);
    let previousFrame = frames[0];

    if (clampedTime <= previousFrame.time) {
        return previousFrame.mass;
    }

    for (let index = 1; index < frames.length; index++) {
        const frame = frames[index];
        if (frame.time >= clampedTime) {
            const spanTime = frame.time - previousFrame.time;
            const localRatio = spanTime > 0
                ? (clampedTime - previousFrame.time) / spanTime
                : 0;
            return previousFrame.mass + ((frame.mass - previousFrame.mass) * localRatio);
        }
        previousFrame = frame;
    }

    return previousFrame.mass;
}

function getTimeByMassTarget(massCurve, targetMass, startTime, endTime) {
    const frames = massCurve?.frames || [];
    const totalMass = massCurve?.totalMass || 0;

    if (!frames.length || totalMass <= 0.0001) {
        const fallbackRatio = totalMass > 0.0001 ? clamp01(targetMass / totalMass) : 0.5;
        return Math.round(startTime + ((endTime - startTime) * fallbackRatio));
    }

    const clampedTargetMass = clamp(targetMass, 0, totalMass);
    let previousTime = startTime;
    let previousCumulative = 0;

    for (const frame of frames) {
        if (frame.cumulative >= clampedTargetMass) {
            const spanMass = frame.cumulative - previousCumulative;
            const localRatio = spanMass > 0
                ? (clampedTargetMass - previousCumulative) / spanMass
                : 0;
            return Math.round(previousTime + ((frame.time - previousTime) * localRatio));
        }

        previousTime = frame.time;
        previousCumulative = frame.cumulative;
    }

    return Math.round(endTime);
}

function getTimeByMassRatio(massCurve, ratio, startTime, endTime) {
    const clampedRatio = clamp01(ratio);
    const totalMass = massCurve?.totalMass || 0;
    if (totalMass <= 0.0001) {
        return Math.round(startTime + ((endTime - startTime) * clampedRatio));
    }

    return getTimeByMassTarget(massCurve, totalMass * clampedRatio, startTime, endTime);
}

function buildUnitPhrases(units, weights) {
    if (!Array.isArray(units) || !units.length) return [];

    const phrases = [];
    let phraseStartIndex = 0;
    let phraseWeight = 0;
    let lexicalCount = 0;
    let aggressiveCount = 0;

    for (let index = 0; index < units.length; index++) {
        const unitText = units[index] || '';
        const trimmed = unitText.trim();
        const unitWeight = weights[index] || 1;
        const hasLexicalText = !!trimmed;
        const isWhitespaceOnly = hasLexicalText ? false : /\s/.test(unitText);
        const isAggressiveUnit = hasLexicalText && Array.from(trimmed).every(isAggressiveChar);
        const endsPhraseStrong = /[.!?;:)]["']?\s*$/.test(unitText);
        const hasTrailingWhitespace = /\s+$/.test(unitText);

        phraseWeight += unitWeight;
        if (hasLexicalText && !isWhitespaceOnly) {
            lexicalCount += 1;
        }
        if (isAggressiveUnit) {
            aggressiveCount += 1;
        }

        const nextUnit = units[index + 1] || '';
        const nextTrimmed = nextUnit.trim();
        const nextStartsLexical = !!nextTrimmed;
        const currentPhraseSize = index - phraseStartIndex + 1;
        const aggressiveDominant = aggressiveCount >= Math.max(2, lexicalCount);
        const shouldSoftBreak =
            hasTrailingWhitespace &&
            nextStartsLexical &&
            (
                (aggressiveDominant && (phraseWeight >= 3.2 || lexicalCount >= 5)) ||
                (!aggressiveDominant && (phraseWeight >= 4.6 || lexicalCount >= 3))
            );
        const shouldHardBreak = endsPhraseStrong || currentPhraseSize >= (aggressiveDominant ? 6 : 4);

        if (index === units.length - 1 || shouldHardBreak || shouldSoftBreak) {
            phrases.push({
                startIndex: phraseStartIndex,
                endIndex: index,
                weight: Math.max(0.2, phraseWeight)
            });
            phraseStartIndex = index + 1;
            phraseWeight = 0;
            lexicalCount = 0;
            aggressiveCount = 0;
        }
    }

    return phrases.length
        ? phrases
        : [{ startIndex: 0, endIndex: units.length - 1, weight: weights.reduce((sum, weight) => sum + weight, 0) || units.length }];
}

function pickPhraseBoundaryTime(targetTime, timingModel, previousTime, remainingPhrases, endTime) {
    const minGap = 80;
    const minAllowed = previousTime + minGap;
    const maxAllowed = endTime - (remainingPhrases * minGap);
    if (maxAllowed <= minAllowed) return Math.round(minAllowed);

    const clampedTarget = Math.max(minAllowed, Math.min(maxAllowed, targetTime));
    const frames = timingModel?.vocalMassCurve?.frames || [];
    const silenceSpans = timingModel?.silenceSpans || [];
    const lineConfidence = clamp01(timingModel?.confidence ?? 0);
    const averageFrameMass = frames.length
        ? frames.reduce((sum, frame) => sum + frame.mass, 0) / frames.length
        : 0.0001;
    const valleyWindow = Math.max(140, Math.min(360, (endTime - previousTime) * (lineConfidence >= 0.5 ? 0.22 : 0.3)));
    const silenceWindow = Math.max(170, Math.min(420, valleyWindow * 1.15));

    let bestSilenceTime = null;
    let bestSilenceScore = Number.POSITIVE_INFINITY;
    for (const span of silenceSpans) {
        if (span.center < minAllowed || span.center > maxAllowed) continue;
        const distance = Math.abs(span.center - clampedTarget);
        if (distance > silenceWindow) continue;

        const distancePenalty = distance / Math.max(1, silenceWindow);
        const depthPenalty = span.avgMass / Math.max(0.0001, averageFrameMass);
        const score = (depthPenalty * 0.7) + (distancePenalty * 0.55);
        if (score < bestSilenceScore) {
            bestSilenceScore = score;
            bestSilenceTime = span.center;
        }
    }

    if (bestSilenceTime !== null) {
        return pickBoundaryTime(bestSilenceTime, timingModel, previousTime, remainingPhrases, endTime);
    }

    let bestValleyTime = clampedTarget;
    let bestValleyScore = Number.POSITIVE_INFINITY;

    for (const frame of frames) {
        if (frame.time < minAllowed || frame.time > maxAllowed) continue;
        const distance = Math.abs(frame.time - clampedTarget);
        if (distance > valleyWindow) continue;

        const distancePenalty = distance / Math.max(1, valleyWindow);
        const score = frame.mass + (distancePenalty * (0.08 + ((1 - lineConfidence) * 0.07)));
        if (score < bestValleyScore) {
            bestValleyScore = score;
            bestValleyTime = frame.time;
        }
    }

    return pickBoundaryTime(bestValleyTime, timingModel, previousTime, remainingPhrases, endTime);
}

function buildPhraseBoundaryCandidates(phraseStart, phraseEnd, timingModel, unitCount) {
    const minGap = 24;
    const frames = (timingModel?.vocalMassCurve?.frames || [])
        .filter((frame) => frame.time >= phraseStart && frame.time <= phraseEnd);
    const frameStride = Math.max(1, Math.floor(frames.length / Math.max(18, unitCount * 8)));
    const candidateTimes = [phraseStart, phraseEnd];

    for (let index = 0; index < frames.length; index += frameStride) {
        candidateTimes.push(frames[index].time);
    }

    for (const frame of frames) {
        if (frame.mass <= 0) continue;
        candidateTimes.push(frame.time);
    }

    for (const anchor of timingModel?.rhythmAnchors || []) {
        if (anchor > phraseStart && anchor < phraseEnd) {
            candidateTimes.push(anchor);
        }
    }

    for (const span of timingModel?.silenceSpans || []) {
        if (span.center > phraseStart && span.center < phraseEnd) {
            candidateTimes.push(span.center);
        }
        if (span.start > phraseStart && span.start < phraseEnd) {
            candidateTimes.push(span.start);
        }
        if (span.end > phraseStart && span.end < phraseEnd) {
            candidateTimes.push(span.end);
        }
    }

    for (const candidate of timingModel?.vocalCandidates || []) {
        if (candidate.time > phraseStart && candidate.time < phraseEnd) {
            candidateTimes.push(candidate.time);
        }
        if (candidate.segmentStart > phraseStart && candidate.segmentStart < phraseEnd) {
            candidateTimes.push(candidate.segmentStart);
        }
        if (candidate.segmentEnd > phraseStart && candidate.segmentEnd < phraseEnd) {
            candidateTimes.push(candidate.segmentEnd);
        }
    }

    const sorted = dedupeSortedTimes(
        candidateTimes
            .map((time) => Math.round(clamp(time, phraseStart, phraseEnd)))
            .sort((left, right) => left - right),
        Math.max(8, minGap / 2)
    );

    if (sorted[0] !== phraseStart) sorted.unshift(phraseStart);
    if (sorted[sorted.length - 1] !== phraseEnd) sorted.push(phraseEnd);
    return sorted;
}

function buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd) {
    const totalWeight = phraseWeights.reduce((sum, weight) => sum + weight, 0) || phraseUnits.length;
    const phraseStartMass = getMassAtTime(timingModel.vocalMassCurve, phraseStart, activeStart, activeEnd);
    const phraseEndMass = getMassAtTime(timingModel.vocalMassCurve, phraseEnd, activeStart, activeEnd);
    const phraseBoundaries = [phraseStart];
    let accumulatedWeight = 0;

    for (let unitIndex = 1; unitIndex < phraseUnits.length; unitIndex++) {
        accumulatedWeight += phraseWeights[unitIndex - 1];
        const localRatio = accumulatedWeight / totalWeight;
        const targetMass = phraseStartMass + ((phraseEndMass - phraseStartMass) * localRatio);
        const targetTime = getTimeByMassTarget(
            timingModel.vocalMassCurve,
            targetMass,
            phraseStart,
            phraseEnd
        );
        phraseBoundaries.push(
            pickBoundaryTime(
                targetTime,
                timingModel,
                phraseBoundaries[phraseBoundaries.length - 1],
                phraseUnits.length - unitIndex,
                phraseEnd
            )
        );
    }

    phraseBoundaries.push(phraseEnd);
    return phraseBoundaries;
}

function alignPhraseUnitsWithDP(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd) {
    if (!Array.isArray(phraseUnits) || phraseUnits.length <= 1) {
        return [phraseStart, phraseEnd];
    }

    const candidateTimes = buildPhraseBoundaryCandidates(phraseStart, phraseEnd, timingModel, phraseUnits.length);
    const lastCandidateIndex = candidateTimes.length - 1;
    if (lastCandidateIndex < phraseUnits.length) {
        return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
    }

    const minGap = 24;
    const phraseDuration = Math.max(1, phraseEnd - phraseStart);
    const phraseWeightTotal = phraseWeights.reduce((sum, weight) => sum + weight, 0) || phraseUnits.length;
    const phraseMassValues = candidateTimes.map((time) => getMassAtTime(timingModel.vocalMassCurve, time, activeStart, activeEnd));
    const phraseLocalMasses = candidateTimes.map((time) => getLocalMassAtTime(timingModel.vocalMassCurve, time, activeStart, activeEnd));
    const phraseTotalMass = Math.max(0.0001, phraseMassValues[lastCandidateIndex] - phraseMassValues[0]);
    const averageLocalMass = phraseLocalMasses.reduce((sum, value) => sum + value, 0) / Math.max(1, phraseLocalMasses.length);
    const averageDensity = phraseTotalMass / phraseDuration;
    const lineConfidence = clamp01(timingModel?.confidence ?? 0);
    const prefixWeights = [0];

    for (let index = 0; index < phraseWeights.length; index++) {
        prefixWeights.push(prefixWeights[index] + phraseWeights[index]);
    }

    const dp = Array.from({ length: phraseUnits.length + 1 }, () => Array(candidateTimes.length).fill(Number.POSITIVE_INFINITY));
    const backtrack = Array.from({ length: phraseUnits.length + 1 }, () => Array(candidateTimes.length).fill(-1));
    dp[0][0] = 0;

    for (let unitIndex = 1; unitIndex <= phraseUnits.length; unitIndex++) {
        const isFinalUnit = unitIndex === phraseUnits.length;
        const expectedSegmentRatio = phraseWeights[unitIndex - 1] / phraseWeightTotal;
        const expectedCumulativeRatio = prefixWeights[unitIndex] / phraseWeightTotal;
        const unitText = phraseUnits[unitIndex - 1] || '';
        const trimmedUnit = unitText.trim();
        const isWhitespaceOnly = !trimmedUnit && /\s/.test(unitText);
        const isPunctuationOnly = !!trimmedUnit && /^[.,!?;:'"()[\]{}-]+$/.test(trimmedUnit);
        const isLexicalUnit = !!trimmedUnit && !isPunctuationOnly;
        const minCandidateIndex = unitIndex;
        const maxCandidateIndex = isFinalUnit
            ? lastCandidateIndex
            : lastCandidateIndex - (phraseUnits.length - unitIndex);

        for (let candidateIndex = minCandidateIndex; candidateIndex <= maxCandidateIndex; candidateIndex++) {
            if (isFinalUnit && candidateIndex !== lastCandidateIndex) continue;
            if (!isFinalUnit && candidateIndex === lastCandidateIndex) continue;

            const actualCumulativeRatio = (phraseMassValues[candidateIndex] - phraseMassValues[0]) / phraseTotalMass;
            const boundaryMassNorm = averageLocalMass > 0
                ? phraseLocalMasses[candidateIndex] / averageLocalMass
                : 1;

            for (let previousIndex = unitIndex - 1; previousIndex < candidateIndex; previousIndex++) {
                const previousCost = dp[unitIndex - 1][previousIndex];
                if (!Number.isFinite(previousCost)) continue;

                const segmentStart = candidateTimes[previousIndex];
                const segmentEnd = candidateTimes[candidateIndex];
                const segmentDuration = segmentEnd - segmentStart;
                if (segmentDuration < minGap) continue;
                if ((phraseEnd - segmentEnd) < ((phraseUnits.length - unitIndex) * minGap)) continue;

                const segmentMass = Math.max(0.0001, phraseMassValues[candidateIndex] - phraseMassValues[previousIndex]);
                const actualSegmentRatio = segmentMass / phraseTotalMass;
                const actualDurationRatio = segmentDuration / phraseDuration;
                const massError = Math.abs(actualSegmentRatio - expectedSegmentRatio);
                const durationError = Math.abs(actualDurationRatio - expectedSegmentRatio);
                const cumulativeError = Math.abs(actualCumulativeRatio - expectedCumulativeRatio);
                const densityNorm = (segmentMass / segmentDuration) / Math.max(averageDensity, 0.0001);

                let densityPenalty = 0;
                if (isLexicalUnit) {
                    densityPenalty = Math.max(0, 0.82 - densityNorm) * 0.55;
                } else if (isWhitespaceOnly) {
                    densityPenalty = Math.max(0, densityNorm - 0.7) * 0.18;
                } else {
                    densityPenalty = Math.max(0, densityNorm - 1.15) * 0.12;
                }

                const boundaryPenalty = !isFinalUnit
                    ? boundaryMassNorm * (0.11 + (lineConfidence * 0.06))
                    : 0;
                const massWeight = 4.2 + (lineConfidence * 0.55);
                const durationWeight = isWhitespaceOnly ? 0.8 : 2.05;
                const cumulativeWeight = 2.1;
                const longTailPenalty = isLexicalUnit && actualDurationRatio > (expectedSegmentRatio * 2.4)
                    ? (actualDurationRatio - (expectedSegmentRatio * 2.4)) * 1.1
                    : 0;

                const score = previousCost +
                    (massError * massWeight) +
                    (durationError * durationWeight) +
                    (cumulativeError * cumulativeWeight) +
                    densityPenalty +
                    boundaryPenalty +
                    longTailPenalty;

                if (score < dp[unitIndex][candidateIndex]) {
                    dp[unitIndex][candidateIndex] = score;
                    backtrack[unitIndex][candidateIndex] = previousIndex;
                }
            }
        }
    }

    if (!Number.isFinite(dp[phraseUnits.length][lastCandidateIndex])) {
        return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
    }

    const boundaries = [candidateTimes[lastCandidateIndex]];
    let candidateIndex = lastCandidateIndex;

    for (let unitIndex = phraseUnits.length; unitIndex > 0; unitIndex--) {
        candidateIndex = backtrack[unitIndex][candidateIndex];
        if (candidateIndex < 0) {
            return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
        }
        boundaries.push(candidateTimes[candidateIndex]);
    }

    return boundaries.reverse();
}

function pickBoundaryTime(targetTime, timingModel, previousTime, remainingUnits, endTime) {
    const minGap = 24;
    const minAllowed = previousTime + minGap;
    const maxAllowed = endTime - (remainingUnits * minGap);
    if (maxAllowed <= minAllowed) return Math.round(minAllowed);

    const clampedTarget = Math.max(minAllowed, Math.min(maxAllowed, targetTime));
    const lineConfidence = clamp01(timingModel?.confidence ?? 0);
    const vocalWindow = Math.max(110, Math.min(260, (endTime - previousTime) * (lineConfidence >= 0.5 ? 0.34 : 0.42)));
    const rhythmWindow = Math.max(85, Math.min(150, (endTime - previousTime) * 0.24));

    let bestVocalTime = null;
    let bestVocalScore = -1;
    for (const candidate of timingModel?.vocalCandidates || []) {
        if (candidate.time < minAllowed || candidate.time > maxAllowed) continue;
        const distance = Math.abs(candidate.time - clampedTarget);
        if (distance > vocalWindow) continue;

        const closeness = 1 - (distance / vocalWindow);
        const score = (candidate.score * 1.2) + (closeness * 0.85);
        if (score > bestVocalScore) {
            bestVocalScore = score;
            bestVocalTime = candidate.time;
        }
    }

    if (bestVocalTime !== null && bestVocalScore >= (0.95 - (lineConfidence * 0.15))) {
        return Math.round(bestVocalTime);
    }

    let bestRhythmTime = clampedTarget;
    let bestRhythmDistance = Number.POSITIVE_INFINITY;
    for (const anchor of timingModel?.rhythmAnchors || []) {
        if (anchor < minAllowed || anchor > maxAllowed) continue;
        const distance = Math.abs(anchor - clampedTarget);
        if (distance <= rhythmWindow && distance < bestRhythmDistance) {
            bestRhythmDistance = distance;
            bestRhythmTime = anchor;
        }
    }

    if (bestVocalTime !== null) {
        const blendedTime = lineConfidence >= 0.45
            ? bestVocalTime
            : Math.round(((bestVocalTime * (0.45 + lineConfidence)) + (bestRhythmTime * 0.55)) / (1 + lineConfidence));
        return Math.round(clamp(blendedTime, minAllowed, maxAllowed));
    }

    return Math.round(bestRhythmTime);
}

function normalizePseudoKaraokeLineBounds(line) {
    const text = line?.text || '';
    const startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
    const endTime = Number.isFinite(line?.endTime) && line.endTime > startTime
        ? line.endTime
        : startTime + 2500;
    return { text, startTime, endTime };
}

export function buildPseudoKaraokeLine(line, analysis) {
    const { text, startTime, endTime } = normalizePseudoKaraokeLineBounds(line);

    if (!text.trim()) {
        return { startTime, endTime, text, syllables: [] };
    }

    const previewUnits = tokenizeLine(text, { lineConfidence: 0.5, lineDurationMs: endTime - startTime });
    const timingModel = buildLineTimingModel(startTime, endTime, analysis, previewUnits.length || 1);
    const activeStart = Number.isFinite(timingModel.activeStart) ? timingModel.activeStart : startTime;
    const activeEnd = Number.isFinite(timingModel.activeEnd) ? timingModel.activeEnd : endTime;
    const effectiveLineConfidence = timingModel.conservativeMode
        ? timingModel.confidence * clamp(0.52 + (timingModel.sectionVocality * 0.4), 0.35, 0.7)
        : clamp01(timingModel.confidence + ((timingModel.sectionVocality - 0.5) * 0.1));
    let units = tokenizeLine(text, {
        lineConfidence: effectiveLineConfidence,
        lineDurationMs: Math.max(1, activeEnd - activeStart)
    });
    if (timingModel.conservativeMode) {
        units = mergeUnitsConservatively(units, effectiveLineConfidence, timingModel.sectionVocality);
    }
    if (!units.length) return null;

    const weights = units.map(getUnitWeight);
    const phrases = buildUnitPhrases(units, weights);
    const phraseWeightTotal = phrases.reduce((sum, phrase) => sum + phrase.weight, 0) || phrases.length;
    const phraseBoundaries = [activeStart];
    let accumulatedPhraseWeight = 0;

    for (let index = 0; index < phrases.length - 1; index++) {
        accumulatedPhraseWeight += phrases[index].weight;
        const targetRatio = accumulatedPhraseWeight / phraseWeightTotal;
        const targetTime = getTimeByMassRatio(
            timingModel.vocalMassCurve,
            targetRatio,
            activeStart,
            activeEnd
        );
        phraseBoundaries.push(
            pickPhraseBoundaryTime(
                targetTime,
                timingModel,
                phraseBoundaries[phraseBoundaries.length - 1],
                phrases.length - index - 1,
                activeEnd
            )
        );
    }
    phraseBoundaries.push(activeEnd);

    const boundaries = [activeStart];
    for (let phraseIndex = 0; phraseIndex < phrases.length; phraseIndex++) {
        const phrase = phrases[phraseIndex];
        const phraseStart = phraseBoundaries[phraseIndex];
        const phraseEnd = phraseBoundaries[phraseIndex + 1];
        const phraseUnits = units.slice(phrase.startIndex, phrase.endIndex + 1);
        const phraseWeights = weights.slice(phrase.startIndex, phrase.endIndex + 1);
        const phraseInternalBoundaries = alignPhraseUnitsWithDP(
            phraseUnits,
            phraseWeights,
            phraseStart,
            phraseEnd,
            timingModel,
            activeStart,
            activeEnd
        );

        for (let boundaryIndex = 1; boundaryIndex < phraseInternalBoundaries.length; boundaryIndex++) {
            boundaries.push(phraseInternalBoundaries[boundaryIndex]);
        }
    }

    const syllables = units.map((unitText, index) => {
        const originalStart = boundaries[index];
        const originalEnd = Math.max(originalStart + 1, boundaries[index + 1]);
        return {
            text: unitText,
            startTime: originalStart,
            endTime: originalEnd
        };
    });

    return {
        startTime: activeStart,
        endTime: syllables[syllables.length - 1]?.endTime || Math.max(1, activeEnd),
        text,
        syllables
    };
}

export function buildLineTimingPseudoKaraokeLine(line) {
    const { text, startTime, endTime } = normalizePseudoKaraokeLineBounds(line);

    if (!text.trim()) {
        return { startTime, endTime, text, syllables: [] };
    }

    const lineDurationMs = Math.max(1, endTime - startTime);
    const units = tokenizeLine(text, {
        lineConfidence: 0.5,
        lineDurationMs
    });
    if (!units.length) return null;

    const weights = units.map(getUnitWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || units.length;
    let accumulatedWeight = 0;
    const syllables = units.map((unitText, index) => {
        const unitStart = startTime + (lineDurationMs * accumulatedWeight / totalWeight);
        accumulatedWeight += weights[index] || 1;
        const unitEnd = index === units.length - 1
            ? endTime
            : startTime + (lineDurationMs * accumulatedWeight / totalWeight);

        return {
            text: unitText,
            startTime: unitStart,
            endTime: Math.max(unitStart + 1, unitEnd)
        };
    });

    return {
        startTime,
        endTime,
        text,
        syllables
    };
}
