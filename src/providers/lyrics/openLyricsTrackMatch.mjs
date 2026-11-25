export function normalizeDurationMilliseconds(info) {
    const raw = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 10000 ? Math.round(raw) : Math.round(raw * 1000);
}

export function normalizeComparable(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[’‘`´]/g, "'")
        .replace(/\b(feat(?:uring)?|ft)\.?\b/gi, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

export function normalizeTitleCore(value) {
    return normalizeComparable(
        String(value || '')
            .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
            .replace(/\s+-\s+(?:remaster(?:ed)?|live|version|edit|mix).*$/i, ' ')
    )
        // Catalogs often omit Latin accents (Señorita / Senorita). Fold
        // only those marks: stripping every combining mark would also
        // turn Japanese が into か. NFC restores other decomposed scripts.
        .normalize('NFD')
        .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
        .normalize('NFC');
}

function comparableTokens(value) {
    return new Set(normalizeComparable(value).split(' ').filter(token => token.length > 1));
}

function tokenOverlap(left, right) {
    const leftTokens = comparableTokens(left);
    const rightTokens = comparableTokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    let matches = 0;
    leftTokens.forEach(token => {
        if (rightTokens.has(token)) matches += 1;
    });
    return matches / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function scoreText(expected, actual, weight, useTitleCore = false) {
    const normalize = useTitleCore ? normalizeTitleCore : normalizeComparable;
    const left = normalize(expected);
    const right = normalize(actual);
    if (!left || !right) return 0;
    if (left === right) return weight;
    if (left.includes(right) || right.includes(left)) return weight * 0.78;
    return weight * 0.62 * tokenOverlap(left, right);
}

export function scoreCandidate(candidate, info) {
    const artistScore = scoreText(info?.artist, candidate?.artist, 30);
    const albumScore = scoreText(info?.album, candidate?.album, 30);
    let score = scoreText(info?.title, candidate?.title, 70, true);
    if (normalizeComparable(info?.title) === normalizeComparable(candidate?.title)) score += 18;
    score += artistScore;
    score += albumScore;

    // An exact title alone is too weak for common covers. Cross-script artist names can
    // still match through album and duration, but a candidate with neither should lose.
    if (info?.artist && candidate?.artist && artistScore === 0 && albumScore === 0) {
        score -= 72;
    }

    const expectedDuration = normalizeDurationMilliseconds(info) / 1000;
    const candidateDuration = Number(candidate?.durationSeconds || 0);
    if (expectedDuration > 0 && candidateDuration > 0) {
        const difference = Math.abs(expectedDuration - candidateDuration);
        if (difference <= 2) score += 24;
        else if (difference <= 5) score += 18;
        else if (difference <= 15) score += 8;
        else if (difference > 60) score -= 20;
    }
    return score;
}

function getLatinShare(value) {
    const letters = String(value || '').match(/\p{L}/gu) || [];
    if (!letters.length) return null;
    return letters.filter(letter => /\p{Script=Latin}/u.test(letter)).length / letters.length;
}

// Shared words over all words, so a title that merely starts like another
// ("Love Me Harder" / "Love Me Like You Do") does not count as the same.
function tokenSimilarity(left, right) {
    const leftTokens = comparableTokens(left);
    const rightTokens = comparableTokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    let shared = 0;
    leftTokens.forEach(token => {
        if (rightTokens.has(token)) shared += 1;
    });
    return shared / (leftTokens.size + rightTokens.size - shared);
}

// Whether `needle` is a title-sized part of `haystack`: whole words for
// titles in spaced scripts (so "I" is not found inside "Pursuit"), any
// stretch for scripts written without spaces. A single short word is too
// little to say two titles are the same.
function titleContains(haystack, needle) {
    const compact = needle.replace(/ /g, '');
    const words = needle.split(' ').filter(Boolean).length;
    if (words < 2 && compact.length < 4) return false;
    if ((getLatinShare(needle) ?? 0) >= 0.5) return ` ${haystack} `.includes(` ${needle} `);
    return haystack.includes(needle);
}

// A search result is this song only when its title says so; artist, album
// and length confirm a title match but cannot make one. Apple Music's
// catalog has no "Lady Of Namek", and "The Color Violet" by the same artist
// on the same album scored 60 on artist and album alone, so its lyrics were
// shown. Titles in different scripts (a Korean Spotify title, a romanized
// catalog title) cannot be compared; those need a matching length instead.
function hasSameSongTitle(candidate, info) {
    const expected = normalizeTitleCore(info?.title);
    const actual = normalizeTitleCore(candidate?.title);
    if (!expected || !actual) return false;
    // Punctuation spellings: "F.E.E.L." / "FEEL", "Don't" / "Dont".
    if (expected.replace(/ /g, '') === actual.replace(/ /g, '')) return true;
    if (titleContains(expected, actual) || titleContains(actual, expected)) return true;
    if (tokenSimilarity(expected, actual) >= 0.6) return true;
    const expectedLatin = getLatinShare(expected);
    const actualLatin = getLatinShare(actual);
    if (expectedLatin === null || actualLatin === null || (expectedLatin >= 0.5) === (actualLatin >= 0.5)) return false;
    const expectedDuration = normalizeDurationMilliseconds(info) / 1000;
    const candidateDuration = Number(candidate?.durationSeconds || 0);
    return expectedDuration > 0 && candidateDuration > 0 && Math.abs(expectedDuration - candidateDuration) <= 3;
}

export function selectBestCandidate(candidates, info) {
    const ranked = (Array.isArray(candidates) ? candidates : [])
        .filter(candidate => candidate?.id && hasSameSongTitle(candidate, info))
        .map(candidate => ({ candidate, score: scoreCandidate(candidate, info) }))
        .sort((left, right) => right.score - left.score);
    return ranked[0]?.score >= 45 ? ranked[0] : null;
}
