export const PROMPT_VERSION = "lyrics-study-v6-2026-05-24";

export const STUDY_DIFFICULTIES = ["easy", "normal", "hard", "native"];

export const normalizeStudyDifficulty = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return STUDY_DIFFICULTIES.includes(normalized) ? normalized : "normal";
};

const hashText = (text) => {
    let hash = 2166136261;
    for (const char of text) {
        hash ^= char.codePointAt(0) || 0;
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const normalizeHashText = (value) => String(value || "").normalize("NFC");

export const hashValue = (value) => {
    const text = normalizeHashText(value);
    return `src-${hashText(text).toString(36)}-${text.length.toString(36)}`;
};

export const hashNumber = (value) => hashText(normalizeHashText(value));

export const getTrackId = (trackUri) => {
    const value = String(trackUri || "");
    return value.includes(":") ? value.split(":").pop() : value;
};

export const buildCacheKey = ({ trackUri, lyricsHash, targetLang, difficulty = "normal" }) => {
    const trackId = getTrackId(trackUri);
    if (!trackId || !lyricsHash || !targetLang) return "";
    const normalizedDifficulty = normalizeStudyDifficulty(difficulty);
    const difficultyPart = normalizedDifficulty === "normal" ? "" : `${normalizedDifficulty}:`;
    return `${trackId}:${lyricsHash}:${targetLang}:${difficultyPart}${PROMPT_VERSION}`;
};

export const buildWordId = ({ targetLang, trackId, expression, meaning }) =>
    `${targetLang}:${trackId || "global"}:${hashValue(`${expression}|${meaning}`)}`;
