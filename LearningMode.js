// AI Learning Mode for ivLyrics
// 가사를 기반으로 라인별 언어 학습, 퀴즈, 단어장을 제공하는 페이지 전용 subfile입니다.
(function IvLyricsLearningModeModule() {
    "use strict";

    const MODULE_KEY = "__ivLyricsLearningModeModule";
    if (window[MODULE_KEY]?.initialized) {
        return;
    }

    const react = window.Spicetify?.React || window.react || window.React;
    if (!react) {
        console.warn("[LearningMode] React is not available.");
        return;
    }
    const {
        useCallback,
        useEffect,
        useMemo,
        useRef,
        useState
    } = react;

    const DB_NAME = "ivLyricsLearningMode";
    const DB_VERSION = 1;
    const THEME_STORAGE_KEY = "ivLyrics:learningMode:theme";
    const DIFFICULTY_STORAGE_KEY = "ivLyrics:learningMode:difficulty";
    const getStoredValue = (key) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.getItem(key)
        : localStorage.getItem(key);
    const setStoredValue = (key, value) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.setItem(key, value)
        : localStorage.setItem(key, value);
    const PROMPT_VERSION = "lyrics-study-v6-2026-05-24";
    const MAX_STUDY_LINES = 80;
    const MAX_STUDY_CHARS = 8000;
    const STUDY_CHUNK_LINES = 4;
    const STUDY_CHUNK_CHARS = 450;
    const SUMMARY_CHUNK_LINES = 9;
    const SUMMARY_CHUNK_CHARS = 900;
    const EXPRESSION_CHUNK_LINES = 6;
    const EXPRESSION_CHUNK_CHARS = 650;
    const QUIZ_CHUNK_LINES = 6;
    const QUIZ_CHUNK_CHARS = 650;
    const STUDY_CHUNK_RETRY_MIN_LINES = 1;
    const STUDY_CONCURRENT_REQUESTS = 3;
    const MAX_EXPRESSION_EXPANSIONS = 5;
    const MAX_QUIZ_ITEMS = 12;
    const MAX_QUIZ_CANDIDATES = 36;
    const QUIZ_TYPES = {
        meaning: { key: "quizTypeMeaning", fallback: "뜻 맞히기" },
        blank: { key: "quizTypeBlank", fallback: "빈칸 채우기" },
        usage: { key: "quizTypeUsage", fallback: "상황 활용" },
        rewrite: { key: "quizTypeRewrite", fallback: "문장 바꾸기" },
        grammar: { key: "quizTypeGrammar", fallback: "문법 선택" }
    };
    const DEFAULT_LYRIC_PLAY_MS = 6500;
    const MIN_LYRIC_PLAY_MS = 1000;
    const MAX_LYRIC_PLAY_MS = 15000;
    const PLAYBACK_END_REWIND_RATIO = 0.985;
    const PLAYBACK_END_REWIND_COOLDOWN_MS = 2500;
    const STUDY_DIFFICULTIES = ["easy", "normal", "hard", "native"];
    const STUDY_DIFFICULTY_LABELS = {
        easy: "Easy",
        normal: "Normal",
        hard: "Hard",
        native: "Native-level"
    };

    const state = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        open: false,
        listeners: new Set(),
        generationListeners: new Set(),
        playbackGuard: {
            enabled: false,
            previousRepeat: null,
            lockedUri: "",
            lastProgress: 0,
            progressTimer: null,
            songChangeHandler: null,
            restoring: false,
            lastRewindAt: 0,
            lastRewindUri: ""
        },
        lyricPlaybackTimer: null,
        speechResumeTimer: null,
        generation: {
            jobId: 0,
            cacheKey: "",
            trackId: "",
            status: "idle",
            pack: null,
            error: "",
            loadingText: "",
            progress: { done: 0, total: 0 },
            promise: null
        }
    });
    state.listeners ||= new Set();
    state.generationListeners ||= new Set();
    state.lyricPlaybackTimer ??= null;
    state.speechResumeTimer ??= null;
    state.playbackGuard ||= {
        enabled: false,
        previousRepeat: null,
        lockedUri: "",
        lastProgress: 0,
        progressTimer: null,
        songChangeHandler: null,
        restoring: false,
        lastRewindAt: 0,
        lastRewindUri: ""
    };
    state.generation ||= {
        jobId: 0,
        cacheKey: "",
        trackId: "",
        status: "idle",
        pack: null,
        error: "",
        loadingText: "",
        progress: { done: 0, total: 0 },
        promise: null
    };

    const t = (key, fallback) => {
        try {
            return window.I18n?.t?.(`learningMode.${key}`) || fallback;
        } catch (error) {
            return fallback;
        }
    };

    const getInitialStudyTheme = () => {
        try {
            const stored = getStoredValue(THEME_STORAGE_KEY);
            if (stored === "light" || stored === "dark") return stored;
        } catch (error) { }
        try {
            if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return "dark";
        } catch (error) { }
        return "light";
    };

    const normalizeStudyDifficulty = (value) => {
        const normalized = String(value || "").trim().toLowerCase();
        return STUDY_DIFFICULTIES.includes(normalized) ? normalized : "normal";
    };

    const getInitialStudyDifficulty = () => {
        try {
            return normalizeStudyDifficulty(getStoredValue(DIFFICULTY_STORAGE_KEY));
        } catch (error) {
            return "normal";
        }
    };

    const getStudyDifficultyLabel = (difficulty) => {
        const normalized = normalizeStudyDifficulty(difficulty);
        return t(`difficulty${normalized[0].toUpperCase()}${normalized.slice(1)}`, STUDY_DIFFICULTY_LABELS[normalized]);
    };

    const normalizeQuizType = (value) => {
        const normalized = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "");
        if (normalized === "blank" || normalized === "fillblank" || normalized === "fillintheblank" || normalized === "cloze") return "blank";
        if (normalized === "usage" || normalized === "context" || normalized === "situation" || normalized === "transfer") return "usage";
        if (normalized === "rewrite" || normalized === "rephrase" || normalized === "paraphrase") return "rewrite";
        if (normalized === "grammar" || normalized === "form" || normalized === "structure") return "grammar";
        return "meaning";
    };

    const getQuizTypeLabel = (type) => {
        const config = QUIZ_TYPES[normalizeQuizType(type)] || QUIZ_TYPES.meaning;
        return t(config.key, config.fallback);
    };

    const QUIZ_BLANK_MARKER_PATTERN = /(__+|\[blank\]|\{blank\}|<blank>)/i;
    const shouldShowQuizSource = (quiz) => {
        if (!quiz?.sourceText) return false;
        if (normalizeQuizType(quiz.type) === "blank") return false;
        return !QUIZ_BLANK_MARKER_PATTERN.test(String(quiz.question || ""));
    };

    const notify = () => {
        for (const listener of state.listeners) {
            try {
                listener(state.open);
            } catch (error) {
                console.warn("[LearningMode] listener failed:", error);
            }
        }
    };

    const getCurrentPlayerUri = () =>
        window.Spicetify?.Player?.data?.item?.uri || "";

    const getCurrentPlayerDuration = () => {
        const values = [
            window.Spicetify?.Player?.getDuration?.(),
            window.Spicetify?.Player?.data?.item?.duration?.milliseconds,
            window.Spicetify?.Player?.data?.item?.metadata?.duration_ms,
            window.Spicetify?.Player?.data?.item?.duration_ms
        ];
        for (const value of values) {
            const duration = Number(value);
            if (Number.isFinite(duration) && duration > 0) return duration;
        }
        return 0;
    };

    const setRepeatMode = (mode) => {
        try {
            window.Spicetify?.Player?.setRepeat?.(mode);
        } catch (error) {
            console.warn("[LearningMode] failed to set repeat mode:", error);
        }
    };

    const seekPlayer = (positionMs) => {
        const ms = Number(positionMs);
        if (!Number.isFinite(ms) || ms < 0) return;
        try {
            window.Spicetify?.Player?.seek?.(ms);
        } catch (error) {
            console.warn("[LearningMode] failed to seek player:", error);
        }
    };

    const pausePlayer = () => {
        try {
            if (typeof window.Spicetify?.Player?.pause === "function") {
                window.Spicetify.Player.pause();
                return;
            }
            if (window.Spicetify?.Player?.isPlaying?.()) {
                window.Spicetify.Player.togglePlay?.();
            }
        } catch (error) {
            console.warn("[LearningMode] failed to pause player:", error);
        }
    };

    const clearLyricPlaybackTimer = () => {
        if (!state.lyricPlaybackTimer) return;
        clearTimeout(state.lyricPlaybackTimer);
        state.lyricPlaybackTimer = null;
    };

    const getLyricPlaybackDuration = (startTime, endTime) => {
        const start = Number(startTime);
        const end = Number(endTime);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start + 300) {
            return Math.max(MIN_LYRIC_PLAY_MS, Math.min(MAX_LYRIC_PLAY_MS, end - start));
        }
        return DEFAULT_LYRIC_PLAY_MS;
    };

    const scheduleLyricPlaybackStop = ({ uri, durationMs }) => {
        clearLyricPlaybackTimer();
        const duration = Math.max(MIN_LYRIC_PLAY_MS, Math.min(MAX_LYRIC_PLAY_MS, Number(durationMs) || DEFAULT_LYRIC_PLAY_MS));
        state.lyricPlaybackTimer = setTimeout(() => {
            state.lyricPlaybackTimer = null;
            if (uri && getCurrentPlayerUri() !== uri) return;
            pausePlayer();
        }, duration);
    };

    const lockPlaybackTo = (trackUri = getCurrentPlayerUri()) => {
        if (!trackUri) return;
        state.playbackGuard.lockedUri = trackUri;
        try {
            state.playbackGuard.lastProgress = window.Spicetify?.Player?.getProgress?.() || 0;
        } catch (error) {
            state.playbackGuard.lastProgress = 0;
        }
    };

    const rewindCurrentTrackNearEnd = () => {
        const guard = state.playbackGuard;
        const currentUri = getCurrentPlayerUri();
        if (!state.open || !guard.enabled || !currentUri) return;

        const duration = getCurrentPlayerDuration();
        if (!Number.isFinite(duration) || duration <= 0) return;

        let progress = 0;
        try {
            progress = Number(window.Spicetify?.Player?.getProgress?.() || 0);
        } catch (error) {
            progress = 0;
        }
        if (!Number.isFinite(progress) || progress <= 0) return;

        const isNearEnd = progress >= duration * PLAYBACK_END_REWIND_RATIO
            || duration - progress <= 1200;
        if (!isNearEnd) return;

        const now = Date.now();
        if (guard.lastRewindUri === currentUri && now - guard.lastRewindAt < PLAYBACK_END_REWIND_COOLDOWN_MS) return;

        guard.lastRewindUri = currentUri;
        guard.lastRewindAt = now;
        seekPlayer(0);
    };

    const enablePlaybackGuard = () => {
        const guard = state.playbackGuard;
        if (guard.enabled) {
            lockPlaybackTo(guard.lockedUri || getCurrentPlayerUri());
            return;
        }

        guard.enabled = true;
        lockPlaybackTo(getCurrentPlayerUri());

        guard.progressTimer = setInterval(() => {
            if (!guard.enabled) return;
            if (!state.open) {
                disablePlaybackGuard();
                return;
            }
            rewindCurrentTrackNearEnd();
        }, 500);
    };

    const disablePlaybackGuard = () => {
        const guard = state.playbackGuard;
        const wasEnabled = !!guard.enabled;

        clearLyricPlaybackTimer();
        guard.enabled = false;
        if (guard.progressTimer) {
            clearInterval(guard.progressTimer);
            guard.progressTimer = null;
        }
        clearSpeechResumeTimer();
        if (guard.songChangeHandler) {
            window.Spicetify?.Player?.removeEventListener?.("songchange", guard.songChangeHandler);
            guard.songChangeHandler = null;
        }
        if (wasEnabled && guard.previousRepeat !== null && guard.previousRepeat !== undefined) {
            setRepeatMode(guard.previousRepeat);
        }
        guard.previousRepeat = null;
        guard.lockedUri = "";
        guard.lastProgress = 0;
        guard.restoring = false;
        guard.lastRewindAt = 0;
        guard.lastRewindUri = "";
    };

    const open = () => {
        state.open = true;
        enablePlaybackGuard();
        notify();
    };

    const close = () => {
        state.open = false;
        disablePlaybackGuard();
        notify();
    };

    const toggle = () => {
        state.open = !state.open;
        if (state.open) {
            enablePlaybackGuard();
        } else {
            disablePlaybackGuard();
        }
        notify();
    };

    let audioContext = null;
    const getAudioContext = () => {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;
        if (!audioContext) {
            audioContext = new AudioContextCtor();
        }
        if (audioContext.state === "suspended") {
            audioContext.resume?.().catch(() => {});
        }
        return audioContext;
    };

    const playTone = ({ frequency, startTime, duration, gainValue, type = "sine" }) => {
        const context = getAudioContext();
        if (!context) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.025);
    };

    const playQuizSound = (correct) => {
        const context = getAudioContext();
        if (!context) return;
        if (context.state === "suspended") {
            context.resume?.().catch(() => {});
        }
        const now = context.currentTime;

        if (correct) {
            playTone({ frequency: 523.25, startTime: now, duration: 0.12, gainValue: 0.14, type: "triangle" });
            playTone({ frequency: 659.25, startTime: now + 0.09, duration: 0.13, gainValue: 0.13, type: "triangle" });
            playTone({ frequency: 783.99, startTime: now + 0.18, duration: 0.16, gainValue: 0.12, type: "triangle" });
            return;
        }

        playTone({ frequency: 196, startTime: now, duration: 0.17, gainValue: 0.13, type: "sawtooth" });
        playTone({ frequency: 146.83, startTime: now + 0.12, duration: 0.2, gainValue: 0.115, type: "sawtooth" });
    };

    const normalizeSpeechLang = (lang = "") => {
        const value = String(lang || "").toLowerCase();
        if (!value || value === "auto") return "";
        if (value.startsWith("ja")) return "ja-JP";
        if (value.startsWith("en")) return "en-US";
        if (value.startsWith("ko")) return "ko-KR";
        if (value.startsWith("zh")) return "zh-CN";
        return value;
    };

    const detectSpeechLang = (text, fallbackLang = "") => {
        const value = String(text || "");
        if (/[\u3040-\u30ff]/.test(value)) return "ja-JP";
        if (/[a-zA-Z]/.test(value)) return "en-US";
        if (/[\uac00-\ud7af]/.test(value)) return "ko-KR";
        return normalizeSpeechLang(fallbackLang) || "";
    };

    const getBestSpeechVoice = (lang = "") => {
        const target = normalizeSpeechLang(lang);
        if (!target || !window.speechSynthesis?.getVoices) return null;
        const voices = window.speechSynthesis.getVoices() || [];
        if (voices.length === 0) return null;
        const targetLower = target.toLowerCase();
        const base = targetLower.split("-")[0];
        return voices.find((voice) => String(voice.lang || "").toLowerCase() === targetLower)
            || voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(`${base}-`))
            || voices.find((voice) => String(voice.name || "").toLowerCase().includes(base))
            || null;
    };

    const clearSpeechResumeTimer = () => {
        if (!state.speechResumeTimer) return;
        clearTimeout(state.speechResumeTimer);
        state.speechResumeTimer = null;
    };

    const speakText = (text, lang = "") => {
        const value = String(text || "").trim();
        if (!value || !window.speechSynthesis) return;
        try {
            clearLyricPlaybackTimer();
            clearSpeechResumeTimer();
            const wasPlaying = !!window.Spicetify?.Player?.isPlaying?.();
            if (wasPlaying) {
                pausePlayer();
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(value);
            const speechLang = detectSpeechLang(value, lang);
            if (speechLang) {
                utterance.lang = speechLang;
            }
            const voice = getBestSpeechVoice(speechLang);
            if (voice) {
                utterance.voice = voice;
            }
            utterance.volume = 1;
            utterance.rate = speechLang.startsWith("ja") ? 0.78 : 0.82;
            utterance.pitch = 1.08;
            const resumePlayback = () => {
                if (!wasPlaying) return;
                state.speechResumeTimer = setTimeout(() => {
                    state.speechResumeTimer = null;
                    try {
                        if (!window.Spicetify?.Player?.isPlaying?.()) {
                            window.Spicetify?.Player?.togglePlay?.();
                        }
                    } catch (error) { }
                }, 180);
            };
            utterance.onend = resumePlayback;
            utterance.onerror = resumePlayback;
            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn("[LearningMode] speech synthesis failed:", error);
        }
    };

    const subscribe = (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
    };

    const getGenerationSnapshot = () => state.generation || {};

    const notifyGeneration = () => {
        const snapshot = getGenerationSnapshot();
        for (const listener of state.generationListeners) {
            try {
                listener(snapshot);
            } catch (error) {
                console.warn("[LearningMode] generation listener failed:", error);
            }
        }
    };

    const setGenerationState = (patch) => {
        state.generation = {
            ...getGenerationSnapshot(),
            ...patch,
            progress: patch.progress || getGenerationSnapshot().progress || { done: 0, total: 0 }
        };
        notifyGeneration();
    };

    const subscribeGeneration = (listener) => {
        state.generationListeners.add(listener);
        listener(getGenerationSnapshot());
        return () => state.generationListeners.delete(listener);
    };

    const safeText = (value) => {
        if (value === null || value === undefined) return "";
        if (typeof value === "string" || typeof value === "number") return String(value);
        if (Array.isArray(value)) return value.map(safeText).join("");
        if (typeof value === "object" && value.props) return safeText(value.props.children);
        return "";
    };

    const normalizeLineText = (line) => {
        const value = line?.originalText || line?.text || line?.translationText || "";
        return safeText(value)
            .replace(/\s+/g, " ")
            .trim();
    };

    const parseLyricTimeMs = (raw) => {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) return null;
        return value > 0 && value < 1000 ? Math.round(value * 1000) : Math.round(value);
    };

    const getLineStartTime = (line) => {
        const raw = line?.startTime ?? line?.start_time ?? line?.start ?? line?.time ?? line?.t ?? line?.timestamp;
        return parseLyricTimeMs(raw);
    };

    const getLineEndTime = (line) => {
        const raw = line?.endTime ?? line?.end_time ?? line?.end ?? line?.to ?? line?.endTimestamp;
        return parseLyricTimeMs(raw);
    };

    const normalizeLyrics = (lyrics) => {
        if (!Array.isArray(lyrics)) return [];

        const normalized = lyrics
            .map((line, fallbackIndex) => {
                const text = normalizeLineText(line);
                const sourceIndex = Number.isFinite(line?.index)
                    ? line.index
                    : Number.isFinite(line?.lineNumber)
                        ? line.lineNumber
                        : fallbackIndex;
                return {
                    index: sourceIndex,
                    text,
                    startTime: getLineStartTime(line),
                    endTime: getLineEndTime(line)
                };
            })
            .filter((line) => {
                if (!line.text) return false;
                return !/(^|\b)(instrumental|no lyrics|가사 없음|기악)(\b|$)/i.test(line.text);
            });

        return normalized.map((line, index) => {
            const nextStart = normalized
                .slice(index + 1)
                .map((nextLine) => Number(nextLine.startTime))
                .find((value) => Number.isFinite(value) && value > Number(line.startTime));
            const explicitEnd = Number(line.endTime);
            return {
                ...line,
                endTime: Number.isFinite(explicitEnd) && explicitEnd > Number(line.startTime)
                    ? explicitEnd
                    : Number.isFinite(nextStart)
                        ? nextStart
                        : null
            };
        });
    };

    const getLimitedLines = (lines) => {
        const selected = [];
        let charCount = 0;

        for (const line of lines) {
            const nextLength = line.text.length + 1;
            if (selected.length >= MAX_STUDY_LINES || charCount + nextLength > MAX_STUDY_CHARS) {
                break;
            }
            selected.push(line);
            charCount += nextLength;
        }

        return {
            lines: selected,
            omittedCount: Math.max(0, lines.length - selected.length)
        };
    };

    const buildStudyChunks = (lines, maxLines = STUDY_CHUNK_LINES, maxChars = STUDY_CHUNK_CHARS) => {
        const chunks = [];
        let current = [];
        let charCount = 0;

        for (const line of lines) {
            const lineLength = String(line.text || "").length + 1;
            const shouldFlush = current.length > 0
                && (current.length >= maxLines || charCount + lineLength > maxChars);

            if (shouldFlush) {
                chunks.push(current);
                current = [];
                charCount = 0;
            }

            current.push(line);
            charCount += lineLength;
        }

        if (current.length > 0) {
            chunks.push(current);
        }

        return chunks;
    };

    const getPromptLineSubset = (lines, maxLines, maxChars) => {
        const selected = [];
        let charCount = 0;

        for (const line of lines) {
            const nextLength = String(line.text || "").length + 1;
            if (selected.length >= maxLines || charCount + nextLength > maxChars) {
                break;
            }
            selected.push(line);
            charCount += nextLength;
        }

        return selected;
    };

    const isTimeoutLikeError = (error) => {
        const message = String(error?.message || error || "");
        return /timeout|timed out|time.?out|A timeout occurred/i.test(message);
    };

    const hashValue = (value) => {
        const text = String(value || "").normalize("NFC");
        let hash = 2166136261;
        for (const char of text) {
            hash ^= char.codePointAt(0) || 0;
            hash = Math.imul(hash, 16777619);
        }
        return `src-${(hash >>> 0).toString(36)}-${text.length.toString(36)}`;
    };

    const hashNumber = (value) => {
        const text = String(value || "").normalize("NFC");
        let hash = 2166136261;
        for (const char of text) {
            hash ^= char.codePointAt(0) || 0;
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    };

    const getTrackId = (trackUri) => {
        const value = String(trackUri || "");
        return value.includes(":") ? value.split(":").pop() : value;
    };

    const getTargetLanguage = () => {
        const configured = window.CONFIG?.visual?.["translate:target-language"]
            || localStorage.getItem("ivLyrics:visual:translate:target-language");
        if (configured && configured !== "auto") return configured;
        return window.I18n?.getCurrentLanguage?.()
            || window.CONFIG?.visual?.language
            || window.Spicetify?.Locale?.getLocale?.()?.split("-")[0]
            || "ko";
    };

    const buildCacheKey = ({ trackUri, lyricsHash, targetLang, difficulty = "normal" }) => {
        const trackId = getTrackId(trackUri);
        if (!trackId || !lyricsHash || !targetLang) return "";
        const normalizedDifficulty = normalizeStudyDifficulty(difficulty);
        const difficultyPart = normalizedDifficulty === "normal" ? "" : `${normalizedDifficulty}:`;
        return `${trackId}:${lyricsHash}:${targetLang}:${difficultyPart}${PROMPT_VERSION}`;
    };

    const createDb = (() => {
        let dbPromise = null;

        return () => {
            if (dbPromise) return dbPromise;

            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains("studyPacks")) {
                        const store = db.createObjectStore("studyPacks", { keyPath: "cacheKey" });
                        store.createIndex("trackId", "trackId", { unique: false });
                        store.createIndex("updatedAt", "updatedAt", { unique: false });
                    }
                    if (!db.objectStoreNames.contains("wordbook")) {
                        const store = db.createObjectStore("wordbook", { keyPath: "id" });
                        store.createIndex("trackId", "trackId", { unique: false });
                        store.createIndex("expression", "expression", { unique: false });
                    }
                    if (!db.objectStoreNames.contains("progress")) {
                        const store = db.createObjectStore("progress", { keyPath: "cacheKey" });
                        store.createIndex("trackId", "trackId", { unique: false });
                        store.createIndex("updatedAt", "updatedAt", { unique: false });
                    }
                };

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            return dbPromise;
        };
    })();

    const dbGet = async (storeName, key) => {
        const db = await createDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    };

    const dbPut = async (storeName, value) => {
        const db = await createDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    };

    const dbGetAll = async (storeName) => {
        const db = await createDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error);
        });
    };

    const dbDelete = async (storeName, key) => {
        const db = await createDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    };

    const asArray = (value) => {
        if (Array.isArray(value)) return value.filter(Boolean);
        if (typeof value === "string" && value.trim()) return [value.trim()];
        return [];
    };

    const asIndexArray = (value) => {
        const list = Array.isArray(value) ? value : [value];
        return list
            .map((item) => Number(item))
            .filter(Number.isFinite);
    };

    const normalizeTextList = (value) => {
        const list = Array.isArray(value)
            ? value
            : typeof value === "string" && value.trim()
                ? value.split(/[,/·]|;|\n/g)
                : value
                    ? [value]
                    : [];
        return list
            .map((item) => {
                if (typeof item === "string" || typeof item === "number") return String(item).trim();
                return String(item?.term || item?.word || item?.expression || item?.form || item?.label || item?.text || "").trim();
            })
            .filter(Boolean)
            .slice(0, 6);
    };

    const shuffleQuizChoices = (choices, answerIndex, seed = 0) => {
        const safeChoices = choices.slice(0, 4);
        const safeAnswerIndex = Math.max(0, Math.min(safeChoices.length - 1, Number(answerIndex) || 0));
        const indexed = safeChoices.map((choice, index) => ({ choice, originalIndex: index }));
        indexed.sort((a, b) => (
            hashNumber(`${seed}:${a.choice}:${a.originalIndex}`) - hashNumber(`${seed}:${b.choice}:${b.originalIndex}`)
        ));
        if (indexed[0]?.originalIndex === safeAnswerIndex && indexed.length > 1) {
            const swapIndex = (hashNumber(`${seed}:answer-offset`) % (indexed.length - 1)) + 1;
            [indexed[0], indexed[swapIndex]] = [indexed[swapIndex], indexed[0]];
        }
        return {
            choices: indexed.map((item) => item.choice),
            answerIndex: indexed.findIndex((item) => item.originalIndex === safeAnswerIndex)
        };
    };

    const normalizeQuizComparableText = (value) => String(value || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\"'`“”‘’「」『』,.;:!?！？。、，、·・()[\]{}<>/\\|~～_+=-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const extractQuotedQuizText = (value) => {
        const text = String(value || "");
        const match = text.match(/[\"“”'‘’「『](.*?)[\"“”'‘’」』]/);
        return match?.[1] || "";
    };

    const dedupeQuizItems = (items, maxItems = MAX_QUIZ_ITEMS) => {
        const seenSources = new Set();
        const seenQuestions = new Set();
        const result = [];

        for (const item of asArray(items)) {
            const sourceKey = normalizeQuizComparableText(item.sourceText || extractQuotedQuizText(item.question));
            const questionKey = normalizeQuizComparableText(item.question);

            if (sourceKey && seenSources.has(sourceKey)) continue;
            if (!sourceKey && questionKey && seenQuestions.has(questionKey)) continue;

            result.push(item);
            if (sourceKey) seenSources.add(sourceKey);
            if (questionKey) seenQuestions.add(questionKey);
            if (result.length >= maxItems) break;
        }

        return result;
    };

    const normalizeGrammarItem = (item) => {
        if (!item) return null;
        if (typeof item === "string") {
            const text = item.trim();
            return text ? { pattern: text, explanation: "", note: "" } : null;
        }

        const pattern = String(
            item.pattern
            || item.structure
            || item.form
            || item.expression
            || item.title
            || item.grammar
            || ""
        ).trim();
        const explanation = String(item.explanation || item.meaning || item.description || "").trim();
        const note = String(item.note || item.nuance || item.usage || item.example || "").trim();
        const fallback = String(item.text || item.value || "").trim();
        const title = pattern || fallback || explanation;
        if (!title) return null;

        return {
            pattern: title,
            explanation: pattern ? explanation : "",
            note
        };
    };

    const normalizeGrammarList = (items) => {
        const list = Array.isArray(items)
            ? items
            : typeof items === "string" && items.trim()
                ? [items.trim()]
                : items
                    ? [items]
                    : [];
        return list.map(normalizeGrammarItem).filter(Boolean);
    };

    const LOCAL_SCRIPT_PRONUNCIATION_PATTERN = /[ㄱ-ㅎㅏ-ㅣ가-힣ぁ-ゟ゠-ヿ一-龯々〇]/u;
    const IPA_SYMBOL_PATTERN = /[ɑɐɒæɓʙβɔɕçɗɖðəɚɛɜɝɞɟɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɯɰŋɳɲɴøɵɸœɶɹɻɾɽʀʁɺʂʃʈθʊʉʌʋⱱʍχʎʏʑʐʒʔʕʡʢʰʲʷˈˌːˑ̩̯̃]/u;
    const PHONETIC_MARK_PATTERN = /[\/\[\]ˈˌːˑ̩̯̃]/u;
    const ASCII_ONLY_PATTERN = /^[\x00-\x7F]+$/;
    const normalizePronunciation = (value) => {
        const text = String(value || "").normalize("NFC").trim();
        if (!text) return "";
        if (LOCAL_SCRIPT_PRONUNCIATION_PATTERN.test(text)) return "";
        const hasIpaSignal = IPA_SYMBOL_PATTERN.test(text) || PHONETIC_MARK_PATTERN.test(text);
        if (!hasIpaSignal && ASCII_ONLY_PATTERN.test(text)) return "";
        return text;
    };

    const normalizeVocabulary = (items) => asArray(items).map((item) => {
        if (typeof item === "string") {
            return { term: item, meaning: "", note: "", pronunciation: "", reading: "" };
        }
        return {
            term: String(item.term || item.word || item.expression || "").trim(),
            meaning: String(item.meaning || item.translation || "").trim(),
            note: String(item.note || item.example || "").trim(),
            pronunciation: normalizePronunciation(item.pronunciation || item.phonetic || item.romanization || item.romaji),
            reading: String(item.reading || item.hiragana || item.furigana || item.kana || "").trim()
        };
    }).filter((item) => item.term);

    const getPronunciation = (item) =>
        normalizePronunciation(item?.pronunciation || item?.phonetic || item?.romanization || item?.romaji);

    const getReading = (item) =>
        String(item?.reading || item?.hiragana || item?.furigana || item?.kana || "").trim();

    const normalizeStudyPack = ({ raw, sourceLines = [], trackId, trackUri, title, artist, provider, targetLang, difficulty = "normal", lyricsHash, cacheKey, omittedCount }) => {
        const sourceByIndex = new Map(
            asArray(sourceLines)
                .map((line) => [Number(line?.index), String(line?.text || "").trim()])
                .filter(([index, text]) => Number.isFinite(index) && text)
        );
        const startTimeByIndex = new Map(
            asArray(sourceLines)
                .map((line) => [Number(line?.index), getLineStartTime(line)])
                .filter(([index, startTime]) => Number.isFinite(index) && Number.isFinite(startTime))
        );
        const endTimeByIndex = new Map(
            asArray(sourceLines)
                .map((line) => [Number(line?.index), getLineEndTime(line)])
                .filter(([index, endTime]) => Number.isFinite(index) && Number.isFinite(endTime))
        );
        const rawLineMetaByIndex = new Map(
            asArray(raw?.lines)
                .map((line) => {
                    const index = Number(line?.index ?? line?.lineIndex);
                    return [index, {
                        pronunciation: getPronunciation(line),
                        reading: getReading(line)
                    }];
                })
                .filter(([index]) => Number.isFinite(index))
        );
        const getSourceText = (index) => {
            if (index === null || index === undefined) return "";
            const numericIndex = Number(index);
            return Number.isFinite(numericIndex) ? sourceByIndex.get(numericIndex) || "" : "";
        };
        const getLineMeta = (index) => {
            if (index === null || index === undefined) return {};
            const numericIndex = Number(index);
            return Number.isFinite(numericIndex) ? rawLineMetaByIndex.get(numericIndex) || {} : {};
        };
        const getStartTime = (index) => {
            if (index === null || index === undefined) return null;
            const numericIndex = Number(index);
            return Number.isFinite(numericIndex) ? startTimeByIndex.get(numericIndex) ?? null : null;
        };
        const getEndTime = (index) => {
            if (index === null || index === undefined) return null;
            const numericIndex = Number(index);
            return Number.isFinite(numericIndex) ? endTimeByIndex.get(numericIndex) ?? null : null;
        };

        const lineItems = asArray(raw?.lines).map((line) => {
            const index = Number(line?.index ?? line?.lineIndex);
            return {
                index,
                sourceText: String(line?.sourceText || getSourceText(index)).trim(),
                startTime: getStartTime(index),
                endTime: getEndTime(index),
                pronunciation: getPronunciation(line),
                reading: getReading(line),
                translation: String(line?.translation || "").trim(),
                explanation: String(line?.explanation || line?.note || "").trim(),
                grammar: normalizeGrammarList(line?.grammar),
                vocabulary: normalizeVocabulary(line?.vocabulary)
            };
        }).filter((line) => Number.isFinite(line.index));

        const keyExpressions = asArray(raw?.keyExpressions).map((item) => {
            if (typeof item === "string") {
                return { expression: item, meaning: "", note: "", lineIndexes: [] };
            }
            const lineIndexes = asIndexArray(item.lineIndexes);
            return {
                expression: String(item.expression || item.term || "").trim(),
                meaning: String(item.meaning || item.translation || "").trim(),
                note: String(item.note || item.explanation || "").trim(),
                pronunciation: getPronunciation(item),
                reading: getReading(item),
                alternatives: normalizeTextList(item.alternatives || item.substitutes || item.synonyms || item.similarWords),
                forms: normalizeTextList(item.forms || item.inflections || item.variants || item.conjugations),
                relatedWords: normalizeTextList(item.relatedWords || item.related || item.wordFamily),
                lineIndexes,
                sourceText: lineIndexes.map(getSourceText).find(Boolean) || "",
                trackUri,
                startTime: lineIndexes.map(getStartTime).find((value) => Number.isFinite(value)) ?? null,
                endTime: lineIndexes.map(getEndTime).find((value) => Number.isFinite(value)) ?? null
            };
        }).filter((item) => item.expression);

        const quiz = dedupeQuizItems(asArray(raw?.quiz).map((item, index) => {
            const choices = asArray(item?.choices).map((choice) => String(choice).trim()).filter(Boolean).slice(0, 4);
            const answerIndex = Number(item?.answerIndex);
            const lineIndex = Number.isFinite(Number(item?.lineIndex)) ? Number(item.lineIndex) : null;
            const lineMeta = getLineMeta(lineIndex);
            const shuffled = shuffleQuizChoices(choices, answerIndex, `${cacheKey}:${index}:${item?.question || ""}`);
            return {
                id: String(item?.id || `quiz-${index}`),
                type: normalizeQuizType(item?.type),
                question: String(item?.question || "").trim(),
                choices: shuffled.choices,
                answerIndex: shuffled.answerIndex >= 0 ? shuffled.answerIndex : 0,
                explanation: String(item?.explanation || "").trim(),
                lineIndex,
                sourceText: String(item?.sourceText || getSourceText(lineIndex)).trim(),
                startTime: getStartTime(lineIndex),
                endTime: getEndTime(lineIndex),
                pronunciation: getPronunciation(item) || lineMeta.pronunciation || "",
                reading: getReading(item) || lineMeta.reading || ""
            };
        }).filter((item) => item.question && item.choices.length >= 2));

        return {
            cacheKey,
            trackId,
            trackUri,
            title,
            artist,
            provider: provider || "",
            targetLang,
            difficulty: normalizeStudyDifficulty(difficulty),
            quizDifficulty: normalizeStudyDifficulty(raw?.quizDifficulty || difficulty),
            lyricsHash,
            promptVersion: PROMPT_VERSION,
            summary: String(raw?.summary || "").trim(),
            keyExpressions,
            lines: lineItems,
            quiz,
            omittedCount,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    };

    const prepareStudyPackForDisplay = (pack) => {
        if (!pack || !Array.isArray(pack.quiz) || pack.quiz.length === 0) return pack;
        const shouldShuffle = pack.quiz.length > 1
            && pack.quiz.every((item) => Number(item?.answerIndex) === 0);
        if (!shouldShuffle) return pack;
        return {
            ...pack,
            quiz: pack.quiz.map((item, index) => {
                const choices = asArray(item?.choices).map((choice) => String(choice).trim()).filter(Boolean);
                if (choices.length < 2) return item;
                const shuffled = shuffleQuizChoices(choices, item.answerIndex, `${pack.cacheKey || ""}:${item.id || index}:${item.question || ""}`);
                return {
                    ...item,
                    choices: shuffled.choices,
                    answerIndex: shuffled.answerIndex >= 0 ? shuffled.answerIndex : 0
                };
            })
        };
    };

    const normalizeStudyHistory = (packs) => {
        const seen = new Set();
        return asArray(packs)
            .filter((pack) => pack?.cacheKey && (pack.trackUri || pack.trackId))
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .filter((pack) => {
                if (seen.has(pack.cacheKey)) return false;
                seen.add(pack.cacheKey);
                return true;
            })
            .map((pack) => ({
                cacheKey: pack.cacheKey,
                trackId: pack.trackId || getTrackId(pack.trackUri),
                trackUri: pack.trackUri || (pack.trackId ? `spotify:track:${pack.trackId}` : ""),
                title: String(pack.title || "").trim(),
                artist: String(pack.artist || "").trim(),
                targetLang: pack.targetLang || "",
                difficulty: normalizeStudyDifficulty(pack.difficulty),
                quizCount: Array.isArray(pack.quiz) ? pack.quiz.length : 0,
                lineCount: Array.isArray(pack.lines) ? pack.lines.length : 0,
                updatedAt: pack.updatedAt || pack.createdAt || 0
            }));
    };

    const mergeStudyResponses = (responses) => {
        const merged = {
            summary: "",
            keyExpressions: [],
            lines: [],
            quiz: []
        };
        const expressionKeys = new Set();
        const lineIndexes = new Set();

        for (const response of responses.filter(Boolean)) {
            if (response.summary) {
                merged.summary = [merged.summary, String(response.summary).trim()]
                    .filter(Boolean)
                    .join("\n\n");
            }

            for (const item of asArray(response.keyExpressions)) {
                const key = `${String(item?.expression || "").trim().toLowerCase()}|${String(item?.meaning || "").trim().toLowerCase()}`;
                if (!key.trim() || expressionKeys.has(key)) continue;
                expressionKeys.add(key);
                merged.keyExpressions.push(item);
            }

            for (const line of asArray(response.lines)) {
                const index = Number(line?.index ?? line?.lineIndex);
                if (!Number.isFinite(index) || lineIndexes.has(index)) continue;
                lineIndexes.add(index);
                merged.lines.push({ ...line, index });
            }

            for (const item of asArray(response.quiz)) {
                merged.quiz.push(item);
            }
        }

        merged.lines.sort((a, b) => a.index - b.index);
        merged.keyExpressions = merged.keyExpressions.slice(0, MAX_EXPRESSION_EXPANSIONS);
        merged.quiz = merged.quiz.slice(0, MAX_QUIZ_CANDIDATES);
        return merged;
    };

    const requestStudyChunkWithRetry = async (params, lines, chunkMeta, depth = 0) => {
        try {
            return await window.AIAddonManager.generateLyricsStudy({
                ...params,
                category: params.category || "lines",
                lines,
                chunkIndex: chunkMeta.chunkIndex,
                chunkTotal: chunkMeta.chunkTotal,
                chunkDepth: depth
            });
        } catch (error) {
            if (!isTimeoutLikeError(error) || lines.length <= STUDY_CHUNK_RETRY_MIN_LINES) {
                throw error;
            }

            const mid = Math.ceil(lines.length / 2);
            const left = await requestStudyChunkWithRetry(params, lines.slice(0, mid), chunkMeta, depth + 1);
            const right = await requestStudyChunkWithRetry(params, lines.slice(mid), chunkMeta, depth + 1);
            return mergeStudyResponses([left, right]);
        }
    };

    const getSourceLanguage = (lines) => {
        try {
            return window.Utils?.detectLanguage?.(lines.map((line) => ({ text: line.text }))) || "auto";
        } catch (error) {
            return "auto";
        }
    };

    const getEnabledStudyProviderCount = () => {
        try {
            return window.AIAddonManager?.getEnabledProvidersFor?.("lyricsStudy")?.length || 0;
        } catch (error) {
            return 0;
        }
    };

    const saveProgress = async ({ cacheKey, trackId, answers, quiz }) => {
        const values = Object.values(answers || {});
        const total = Array.isArray(quiz) ? quiz.length : 0;
        const correct = values.filter(Boolean).filter((answer) => answer.correct).length;
        await dbPut("progress", {
            cacheKey,
            trackId,
            answers,
            score: correct,
            total,
            updatedAt: Date.now()
        });
    };

    const startGenerationJob = ({
        normalizedLyrics,
        trackId,
        trackUri,
        title,
        artist,
        provider,
        targetLang,
        difficulty = "normal",
        lyricsHash,
        cacheKey,
        force = false
    }) => {
        const activeGeneration = getGenerationSnapshot();
        if (!force && activeGeneration.status === "loading" && activeGeneration.cacheKey === cacheKey && activeGeneration.promise) {
            notifyGeneration();
            return activeGeneration.promise;
        }

        const jobId = (Number(activeGeneration.jobId) || 0) + 1;
        const limited = getLimitedLines(normalizedLyrics);
        const requestParams = {
            trackId,
            title,
            artist,
            provider,
            targetLang,
            difficulty: normalizeStudyDifficulty(difficulty),
            sourceLang: getSourceLanguage(limited.lines)
        };

        setGenerationState({
            jobId,
            cacheKey,
            trackId,
            status: "loading",
            pack: null,
            error: "",
            loadingText: "",
            progress: { done: 0, total: 0 },
            promise: null
        });

        const promise = (async () => {
            try {
                const isCurrentJob = () => getGenerationSnapshot().jobId === jobId;
                const rawParts = [];
                if (force) {
                    await dbDelete("progress", cacheKey).catch(() => {});
                    if (!isCurrentJob()) return null;
                }

                const categoryRequests = [
                    {
                        category: "summary",
                        loadingKey: "loadingSummary",
                        loadingFallback: "곡의 큰 흐름을 정리하는 중...",
                        chunks: [getPromptLineSubset(limited.lines, SUMMARY_CHUNK_LINES, SUMMARY_CHUNK_CHARS)]
                    },
                    {
                        category: "lines",
                        loadingKey: "loadingLines",
                        loadingFallback: "가사 카드를 만드는 중... ({current}/{total})",
                        chunks: buildStudyChunks(limited.lines, STUDY_CHUNK_LINES, STUDY_CHUNK_CHARS)
                    },
                    {
                        category: "expressions",
                        loadingKey: "loadingExpressions",
                        loadingFallback: "핵심 표현을 고르는 중... ({current}/{total})",
                        chunks: buildStudyChunks(limited.lines, EXPRESSION_CHUNK_LINES, EXPRESSION_CHUNK_CHARS)
                    },
                    {
                        category: "quiz",
                        loadingKey: "loadingQuiz",
                        loadingFallback: "퀴즈를 만드는 중... ({current}/{total})",
                        chunks: buildStudyChunks(limited.lines, QUIZ_CHUNK_LINES, QUIZ_CHUNK_CHARS)
                    }
                ];
                const requestTotal = categoryRequests.reduce((sum, item) => (
                    sum + item.chunks.filter((chunk) => chunk.length > 0).length
                ), 0);
                let completedRequests = 0;

                const publishPartialPack = () => {
                    if (!isCurrentJob()) return;
                    const partialRaw = mergeStudyResponses(rawParts);
                    const partialPack = normalizeStudyPack({
                        raw: partialRaw,
                        sourceLines: limited.lines,
                        trackId,
                        trackUri,
                        title,
                        artist,
                        provider,
                        targetLang,
                        difficulty,
                        lyricsHash,
                        cacheKey,
                        omittedCount: limited.omittedCount
                    });
                    setGenerationState({
                        status: "loading",
                        pack: partialPack,
                        error: "",
                        progress: { done: completedRequests, total: requestTotal }
                    });
                };

                setGenerationState({ progress: { done: 0, total: requestTotal } });

                for (const categoryRequest of categoryRequests) {
                    const chunks = categoryRequest.chunks.filter((chunk) => chunk.length > 0);
                    let nextChunkIndex = 0;
                    const runNextChunk = async () => {
                        while (nextChunkIndex < chunks.length) {
                            const index = nextChunkIndex;
                            nextChunkIndex += 1;

                            if (!isCurrentJob()) return;

                            const current = String(index + 1);
                            const total = String(chunks.length);
                            setGenerationState({
                                loadingText: t(categoryRequest.loadingKey, categoryRequest.loadingFallback)
                                    .replace("{current}", current)
                                    .replace("{total}", total)
                            });

                            const rawPart = await requestStudyChunkWithRetry({
                                ...requestParams,
                                category: categoryRequest.category
                            }, chunks[index], {
                                chunkIndex: index + 1,
                                chunkTotal: chunks.length
                            });

                            if (!isCurrentJob()) return;

                            rawParts.push(rawPart);
                            completedRequests += 1;
                            publishPartialPack();
                        }
                    };

                    const workerCount = Math.min(STUDY_CONCURRENT_REQUESTS, chunks.length);
                    await Promise.all(Array.from({ length: workerCount }, () => runNextChunk()));

                    if (!isCurrentJob()) return null;
                }

                if (!isCurrentJob()) return null;

                const raw = mergeStudyResponses(rawParts);
                const nextPack = normalizeStudyPack({
                    raw,
                    sourceLines: limited.lines,
                    trackId,
                    trackUri,
                    title,
                    artist,
                    provider,
                    targetLang,
                    difficulty,
                    lyricsHash,
                    cacheKey,
                    omittedCount: limited.omittedCount
                });

                await dbPut("studyPacks", nextPack);
                await dbPut("progress", {
                    cacheKey,
                    trackId,
                    answers: {},
                    score: 0,
                    total: nextPack.quiz.length,
                    updatedAt: Date.now()
                });

                if (!isCurrentJob()) return nextPack;

                setGenerationState({
                    status: "ready",
                    pack: nextPack,
                    error: "",
                    loadingText: "",
                    progress: { done: requestTotal, total: requestTotal },
                    promise: null
                });
                window.Toast?.success?.(t("generated", "학습 모드를 생성했습니다."));
                return nextPack;
            } catch (studyError) {
                if (getGenerationSnapshot().jobId === jobId) {
                    console.warn("[LearningMode] generation failed:", studyError);
                    setGenerationState({
                        status: "error",
                        error: studyError?.message || t("generateFailed", "학습 모드 생성에 실패했습니다."),
                        loadingText: "",
                        progress: { done: 0, total: 0 },
                        promise: null
                    });
                }
                throw studyError;
            }
        })();

        setGenerationState({ promise });

        return promise;
    };

    const startQuizGenerationJob = ({
        normalizedLyrics,
        basePack,
        trackId,
        trackUri,
        title,
        artist,
        provider,
        targetLang,
        difficulty = "normal",
        lyricsHash,
        cacheKey
    }) => {
        if (!basePack) return Promise.resolve(null);

        const activeGeneration = getGenerationSnapshot();
        if (activeGeneration.status === "loading" && activeGeneration.cacheKey === cacheKey && activeGeneration.promise) {
            notifyGeneration();
            return activeGeneration.promise;
        }

        const jobId = (Number(activeGeneration.jobId) || 0) + 1;
        const limited = getLimitedLines(normalizedLyrics);
        const requestParams = {
            trackId,
            title,
            artist,
            provider,
            targetLang,
            difficulty: normalizeStudyDifficulty(difficulty),
            sourceLang: getSourceLanguage(limited.lines)
        };
        const chunks = buildStudyChunks(limited.lines, QUIZ_CHUNK_LINES, QUIZ_CHUNK_CHARS)
            .filter((chunk) => chunk.length > 0);
        const requestTotal = Math.max(1, chunks.length);
        let completedRequests = 0;

        setGenerationState({
            jobId,
            cacheKey,
            trackId,
            status: "loading",
            pack: basePack,
            error: "",
            loadingText: t("loadingQuizOnly", "퀴즈만 다시 만드는 중... ({current}/{total})")
                .replace("{current}", "0")
                .replace("{total}", String(requestTotal)),
            progress: { done: 0, total: requestTotal },
            promise: null
        });

        const promise = (async () => {
            try {
                const isCurrentJob = () => getGenerationSnapshot().jobId === jobId;
                const rawParts = [];
                let nextChunkIndex = 0;

                const buildPackWithQuiz = (quizParts) => {
                    const raw = mergeStudyResponses(quizParts);
                    const quizPack = normalizeStudyPack({
                        raw,
                        sourceLines: limited.lines,
                        trackId,
                        trackUri,
                        title,
                        artist,
                        provider,
                        targetLang,
                        difficulty,
                        lyricsHash,
                        cacheKey,
                        omittedCount: limited.omittedCount
                    });
                    return {
                        ...basePack,
                        trackUri: basePack.trackUri || trackUri,
                        difficulty: normalizeStudyDifficulty(difficulty),
                        quizDifficulty: normalizeStudyDifficulty(difficulty),
                        quiz: quizPack.quiz,
                        updatedAt: Date.now()
                    };
                };

                const publishPartialPack = () => {
                    if (!isCurrentJob() || rawParts.length === 0) return;
                    const partialPack = buildPackWithQuiz(rawParts);
                    setGenerationState({
                        status: "loading",
                        pack: partialPack,
                        error: "",
                        progress: { done: completedRequests, total: requestTotal }
                    });
                };

                const runNextChunk = async () => {
                    while (nextChunkIndex < chunks.length) {
                        const index = nextChunkIndex;
                        nextChunkIndex += 1;
                        if (!isCurrentJob()) return;

                        setGenerationState({
                            loadingText: t("loadingQuizOnly", "퀴즈만 다시 만드는 중... ({current}/{total})")
                                .replace("{current}", String(index + 1))
                                .replace("{total}", String(chunks.length))
                        });

                        const rawPart = await requestStudyChunkWithRetry({
                            ...requestParams,
                            category: "quiz"
                        }, chunks[index], {
                            chunkIndex: index + 1,
                            chunkTotal: chunks.length
                        });

                        if (!isCurrentJob()) return;
                        rawParts.push(rawPart);
                        completedRequests += 1;
                        publishPartialPack();
                    }
                };

                if (chunks.length === 0) {
                    throw new Error(t("noLyrics", "학습할 가사가 없습니다."));
                }

                const workerCount = Math.min(STUDY_CONCURRENT_REQUESTS, chunks.length);
                await Promise.all(Array.from({ length: workerCount }, () => runNextChunk()));
                if (!isCurrentJob()) return null;

                const nextPack = buildPackWithQuiz(rawParts);
                if (!nextPack.quiz.length) {
                    throw new Error(t("quizRegenerateFailed", "퀴즈를 다시 만들지 못했습니다."));
                }

                await dbPut("studyPacks", nextPack);
                await dbPut("progress", {
                    cacheKey,
                    trackId,
                    answers: {},
                    score: 0,
                    total: nextPack.quiz.length,
                    updatedAt: Date.now()
                });

                if (!isCurrentJob()) return nextPack;

                setGenerationState({
                    status: "ready",
                    pack: nextPack,
                    error: "",
                    loadingText: "",
                    progress: { done: requestTotal, total: requestTotal },
                    promise: null
                });
                window.Toast?.success?.(t("quizRegenerated", "새 퀴즈를 만들었습니다."));
                return nextPack;
            } catch (quizError) {
                if (getGenerationSnapshot().jobId === jobId) {
                    console.warn("[LearningMode] quiz generation failed:", quizError);
                    setGenerationState({
                        status: "error",
                        pack: basePack,
                        error: quizError?.message || t("quizRegenerateFailed", "퀴즈를 다시 만들지 못했습니다."),
                        loadingText: "",
                        progress: { done: 0, total: 0 },
                        promise: null
                    });
                }
                throw quizError;
            }
        })();

        setGenerationState({ promise });
        return promise;
    };

    const buildWordId = ({ targetLang, trackId, expression, meaning }) =>
        `${targetLang}:${trackId || "global"}:${hashValue(`${expression}|${meaning}`)}`;

    const useLearningOpenState = () => {
        const [isOpen, setIsOpen] = useState(state.open);
        useEffect(() => subscribe(setIsOpen), []);
        return isOpen;
    };

    const BookIcon = react.createElement("svg", {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true"
    },
        react.createElement("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
        react.createElement("path", { d: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" }),
        react.createElement("path", { d: "M8 6h8" }),
        react.createElement("path", { d: "M8 10h6" })
    );

    const StudyButton = react.memo(({ disabled = false }) => {
        const isOpen = useLearningOpenState();
        const label = t("button", "학습");
        const button = react.createElement("button", {
            className: `lyrics-config-button ivlyrics-study-button${isOpen ? " active" : ""}`,
            type: "button",
            disabled,
            "aria-pressed": isOpen,
            onClick: (event) => {
                event.stopPropagation();
                if (disabled) return;
                toggle();
            }
        }, BookIcon);

        if (window.Spicetify?.ReactComponent?.TooltipWrapper) {
            return react.createElement(window.Spicetify.ReactComponent.TooltipWrapper, { label }, button);
        }

        return button;
    });

    const TabButton = ({ id, activeTab, onSelect, children }) => react.createElement("button", {
        className: `ivlyrics-study-tab${activeTab === id ? " active" : ""}`,
        type: "button",
        onClick: () => onSelect(id)
    }, children);

    const EmptyState = ({ children }) => react.createElement("div", {
        className: "ivlyrics-study-empty"
    }, children);

    const ReadingHints = ({ reading = "", pronunciation = "" }) => {
        const rows = [
            reading && { label: t("reading", "읽기"), value: reading },
            pronunciation && { label: t("pronunciation", "발음"), value: pronunciation }
        ].filter(Boolean);

        if (rows.length === 0) return null;

        return react.createElement("div", { className: "ivlyrics-study-reading-hints" },
            rows.map((row) => react.createElement("div", {
                key: row.label,
                className: "ivlyrics-study-reading-row"
            },
                react.createElement("span", null, row.label),
                react.createElement("strong", null, row.value)
            ))
        );
    };

    const GrammarNote = ({ item, className = "" }) => {
        const grammar = normalizeGrammarItem(item);
        if (!grammar) return null;

        return react.createElement("div", {
            className: ["ivlyrics-study-grammar-note", className].filter(Boolean).join(" ")
        },
            react.createElement("strong", null, grammar.pattern),
            grammar.explanation && react.createElement("p", null, grammar.explanation),
            grammar.note && react.createElement("small", null, grammar.note)
        );
    };

    const LyricPlayButton = ({ onClick, disabled = false }) => react.createElement("button", {
        type: "button",
        className: "ivlyrics-study-lyric-play",
        onClick,
        disabled,
        title: t("playLyric", "가사 재생")
    },
        react.createElement("span", { "aria-hidden": "true" }, "▶"),
        react.createElement("span", null, t("playLyric", "가사 재생"))
    );

    const BlankQuestion = ({ text = "" }) => {
        const parts = String(text || "").split(/(__+|\[blank\]|\{blank\}|<blank>)/gi);
        return react.createElement("div", { className: "ivlyrics-study-blank-question" },
            parts.map((part, index) => {
                const isBlank = /^(__+|\[blank\]|\{blank\}|<blank>)$/i.test(part);
                return react.createElement("span", {
                    key: `${index}-${part}`,
                    className: isBlank ? "blank" : ""
                }, isBlank ? "____" : part);
            })
        );
    };

    const StudyPanel = react.memo(({
        trackUri = "",
        title = "",
        artist = "",
        provider = "",
        lyrics = [],
        activeLineIndex = 0
    }) => {
        const isOpen = useLearningOpenState();
        const [activeTab, setActiveTab] = useState("explain");
        const [pack, setPack] = useState(null);
        const [status, setStatus] = useState("idle");
        const [error, setError] = useState("");
        const [loadingText, setLoadingText] = useState("");
        const [answers, setAnswers] = useState({});
        const [wordbook, setWordbook] = useState([]);
        const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0 });
        const [quizStep, setQuizStep] = useState(0);
        const [wordQuery, setWordQuery] = useState("");
        const [wordScope, setWordScope] = useState("all");
        const [savedWordFeedback, setSavedWordFeedback] = useState({});
        const [eventLineIndex, setEventLineIndex] = useState(activeLineIndex || 0);
        const [studyTheme, setStudyTheme] = useState(getInitialStudyTheme);
        const [studyDifficulty, setStudyDifficulty] = useState(getInitialStudyDifficulty);
        const [quizDifficulty, setQuizDifficulty] = useState(getInitialStudyDifficulty);
        const [studyHistory, setStudyHistory] = useState([]);
        const generationRef = useRef(0);

        const normalizedLyrics = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
        const lyricsHash = useMemo(
            () => hashValue(normalizedLyrics.map((line) => `${line.index}:${line.text}`).join("\n")),
            [normalizedLyrics]
        );
        const targetLang = useMemo(() => getTargetLanguage(), [isOpen, trackUri]);
        const trackId = useMemo(() => getTrackId(trackUri), [trackUri]);
        const cacheKey = useMemo(
            () => buildCacheKey({ trackUri, lyricsHash, targetLang, difficulty: studyDifficulty }),
            [trackUri, lyricsHash, targetLang, studyDifficulty]
        );
        const displayedLineIndex = Number.isFinite(eventLineIndex) ? eventLineIndex : activeLineIndex || 0;
        const hasLyrics = normalizedLyrics.length > 0;

        const toggleStudyTheme = useCallback(() => {
            setStudyTheme((current) => {
                const next = current === "dark" ? "light" : "dark";
                try {
                    setStoredValue(THEME_STORAGE_KEY, next);
                } catch (error) { }
                return next;
            });
        }, []);

        const selectStudyDifficulty = useCallback((difficulty) => {
            const next = normalizeStudyDifficulty(difficulty);
            setStudyDifficulty(next);
            try {
                setStoredValue(DIFFICULTY_STORAGE_KEY, next);
            } catch (error) { }
        }, []);

        useEffect(() => () => {
            state.open = false;
            disablePlaybackGuard();
            notify();
        }, []);

        useEffect(() => {
            setEventLineIndex(activeLineIndex || 0);
        }, [activeLineIndex, trackUri]);

        useEffect(() => {
            const handler = (event) => {
                if (typeof event.detail?.index === "number") {
                    setEventLineIndex(event.detail.index);
                }
            };
            window.addEventListener("ivLyrics:lyric-index-changed", handler);
            return () => window.removeEventListener("ivLyrics:lyric-index-changed", handler);
        }, []);

        useEffect(() => subscribeGeneration((generation) => {
            if (!cacheKey || generation.cacheKey !== cacheKey) return;
            setPack(generation.pack || null);
            setStatus(generation.status || "idle");
            setError(generation.error || "");
            setLoadingText(generation.loadingText || "");
            setGenerationProgress(generation.progress || { done: 0, total: 0 });
            if (generation.pack) {
                setStudyHistory((prev) => normalizeStudyHistory([generation.pack, ...prev]));
            }
        }), [cacheKey]);

        useEffect(() => {
            let cancelled = false;

            async function loadLocalState() {
                const activeGeneration = getGenerationSnapshot();
                const hasActiveGeneration = activeGeneration.cacheKey === cacheKey
                    && activeGeneration.status === "loading";

                if (hasActiveGeneration) {
                    setPack(activeGeneration.pack || null);
                    setStatus("loading");
                    setError(activeGeneration.error || "");
                    setLoadingText(activeGeneration.loadingText || "");
                    setGenerationProgress(activeGeneration.progress || { done: 0, total: 0 });
                } else {
                    setError("");
                    setLoadingText("");
                    setPack(null);
                    setStatus("idle");
                    setGenerationProgress({ done: 0, total: 0 });
                }
                setAnswers({});
                setQuizStep(0);
                setWordQuery("");
                setSavedWordFeedback({});

                try {
                    const [words, packs] = await Promise.all([
                        dbGetAll("wordbook"),
                        dbGetAll("studyPacks")
                    ]);

                    if (cancelled) return;

                    setWordbook(words
                        .map((word) => ({
                            ...word,
                            pronunciation: normalizePronunciation(word.pronunciation || word.phonetic || word.romanization || word.romaji)
                        }))
                        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)));
                    setStudyHistory(normalizeStudyHistory(packs));

                    if (!cacheKey || !trackId) {
                        return;
                    }

                    const [cachedPack, progress] = await Promise.all([
                        dbGet("studyPacks", cacheKey),
                        dbGet("progress", cacheKey)
                    ]);

                    if (cancelled) return;

                    const currentGeneration = getGenerationSnapshot();
                    const hasCurrentGeneration = currentGeneration.cacheKey === cacheKey
                        && currentGeneration.status === "loading";

                    if (hasCurrentGeneration) {
                        setPack(currentGeneration.pack || null);
                        setStatus("loading");
                        setError(currentGeneration.error || "");
                        setLoadingText(currentGeneration.loadingText || "");
                        setGenerationProgress(currentGeneration.progress || { done: 0, total: 0 });
                    } else if (!hasActiveGeneration) {
                        const preparedPack = prepareStudyPackForDisplay(cachedPack);
                        setPack(preparedPack);
                        const savedAnswers = preparedPack === cachedPack ? (progress?.answers || {}) : {};
                        setAnswers(savedAnswers);
                        const savedQuizTotal = preparedPack?.quiz?.length || 0;
                        if (savedQuizTotal > 0 && preparedPack?.quiz?.every((_, index) => savedAnswers[index])) {
                            setQuizStep(savedQuizTotal);
                        }
                    }
                } catch (loadError) {
                    if (!cancelled) {
                        console.warn("[LearningMode] failed to load local state:", loadError);
                        setError(t("loadFailed", "학습 데이터를 불러오지 못했습니다."));
                    }
                }
            }

            if (!isOpen) {
                return undefined;
            }

            loadLocalState();

            return () => {
                cancelled = true;
            };
        }, [cacheKey, isOpen, trackId]);

        const currentLineStudy = useMemo(() => {
            if (!pack?.lines?.length) return null;
            return pack.lines.find((line) => line.index === displayedLineIndex) || null;
        }, [pack, displayedLineIndex]);

        useEffect(() => {
            const total = pack?.quiz?.length || 0;
            if (total === 0) {
                setQuizStep(0);
                return;
            }
            setQuizStep((step) => Math.min(Math.max(step, 0), total));
        }, [pack?.quiz?.length, cacheKey]);

        useEffect(() => {
            if (!pack?.cacheKey) return;
            setQuizDifficulty(normalizeStudyDifficulty(pack.quizDifficulty || pack.difficulty || studyDifficulty));
        }, [pack?.cacheKey]);

        const filteredWordbook = useMemo(() => {
            const query = wordQuery.trim().toLowerCase();
            const scoped = wordbook.filter((word) => {
                if (wordScope === "current") return word.trackId === trackId;
                if (wordScope === "synced") return Number.isFinite(Number(word.startTime));
                return true;
            });
            if (!query) return scoped;
            return scoped.filter((word) => [
                word.expression,
                word.meaning,
                word.reading,
                word.pronunciation,
                word.sourceText,
                word.title,
                word.artist,
                word.note
            ].some((value) => String(value || "").toLowerCase().includes(query)));
        }, [trackId, wordScope, wordbook, wordQuery]);

        const wordbookStats = useMemo(() => ({
            total: wordbook.length,
            current: wordbook.filter((word) => word.trackId === trackId).length,
            withReading: wordbook.filter((word) => word.reading || word.pronunciation).length,
            withSource: wordbook.filter((word) => word.sourceText).length,
            withSync: wordbook.filter((word) => Number.isFinite(Number(word.startTime))).length
        }), [trackId, wordbook]);
        const grammarItems = useMemo(() => {
            if (!pack?.lines?.length) return [];
            const seen = new Set();
            const items = [];
            for (const line of pack.lines) {
                for (const grammar of normalizeGrammarList(line.grammar)) {
                    const key = `${grammar.pattern}|${grammar.explanation}`.toLowerCase();
                    if (!grammar.pattern || seen.has(key)) continue;
                    seen.add(key);
                    items.push({
                        ...grammar,
                        sourceText: line.sourceText || "",
                        translation: line.translation || "",
                        lineExplanation: line.explanation || "",
                        startTime: line.startTime,
                        endTime: line.endTime,
                        lineIndex: line.index
                    });
                    if (items.length >= 8) return items;
                }
            }
            return items;
        }, [pack]);

        const savedWordIds = useMemo(() => new Set(wordbook.map((word) => word.id)), [wordbook]);
        const getWordIdForEntry = useCallback((entry) => {
            const expression = String(entry?.expression || entry?.term || "").trim();
            const meaning = String(entry?.meaning || "").trim();
            return expression ? buildWordId({ targetLang, trackId, expression, meaning }) : "";
        }, [targetLang, trackId]);

        const addWord = useCallback(async (entry) => {
            const expression = String(entry.expression || entry.term || "").trim();
            if (!expression || !trackId) return;

            const meaning = String(entry.meaning || "").trim();
            const item = {
                id: buildWordId({ targetLang, trackId, expression, meaning }),
                expression,
                meaning,
                note: String(entry.note || "").trim(),
                sourceText: String(entry.sourceText || "").trim(),
                grammar: normalizeGrammarList(entry.grammar),
                sourceLang: detectSpeechLang([
                    expression,
                    entry.reading,
                    entry.hiragana,
                    entry.furigana,
                    entry.kana,
                    entry.sourceText
                ].filter(Boolean).join(" ")),
                pronunciation: normalizePronunciation(entry.pronunciation || entry.phonetic || entry.romanization || entry.romaji),
                reading: String(entry.reading || entry.hiragana || entry.furigana || entry.kana || "").trim(),
                trackId,
                trackUri,
                title,
                artist,
                lineIndex: Number.isFinite(entry.lineIndex) ? entry.lineIndex : null,
                startTime: Number.isFinite(Number(entry.startTime)) ? Number(entry.startTime) : null,
                endTime: Number.isFinite(Number(entry.endTime)) ? Number(entry.endTime) : null,
                targetLang,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            try {
                await dbPut("wordbook", item);
                setWordbook((prev) => {
                    const rest = prev.filter((word) => word.id !== item.id);
                    return [item, ...rest];
                });
                setSavedWordFeedback((prev) => ({ ...prev, [item.id]: "saved" }));
                setTimeout(() => {
                    setSavedWordFeedback((prev) => {
                        if (!prev[item.id]) return prev;
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                    });
                }, 1600);
                window.Toast?.success?.(t("wordSaved", "단어장에 저장했습니다."));
            } catch (wordError) {
                console.warn("[LearningMode] failed to save word:", wordError);
                window.Toast?.error?.(t("wordSaveFailed", "단어를 저장하지 못했습니다."));
            }
        }, [artist, targetLang, title, trackId, trackUri]);

        const removeWord = useCallback(async (id) => {
            try {
                await dbDelete("wordbook", id);
                setWordbook((prev) => prev.filter((word) => word.id !== id));
            } catch (wordError) {
                console.warn("[LearningMode] failed to remove word:", wordError);
            }
        }, []);

        const toggleWord = useCallback(async (entry) => {
            const id = getWordIdForEntry(entry);
            if (!id) return;
            if (savedWordIds.has(id)) {
                await removeWord(id);
                setSavedWordFeedback((prev) => ({ ...prev, [id]: "removed" }));
                setTimeout(() => {
                    setSavedWordFeedback((prev) => {
                        if (!prev[id]) return prev;
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                }, 1000);
                return;
            }
            await addWord(entry);
        }, [addWord, getWordIdForEntry, removeWord, savedWordIds]);

        const playLyricAt = useCallback((entry) => {
            const startTime = Number(entry?.startTime);
            const uri = String(entry?.trackUri || "");
            if (!uri || !Number.isFinite(startTime)) {
                window.Toast?.error?.(t("lyricPlaybackUnavailable", "싱크 시간이 없어 가사를 재생할 수 없습니다."));
                return;
            }

            lockPlaybackTo(uri);
            const durationMs = getLyricPlaybackDuration(startTime, entry?.endTime);
            const seekAndPlay = () => {
                seekPlayer(startTime);
                try {
                    if (!(window.Spicetify?.Player?.isPlaying?.() ?? false)) {
                        window.Spicetify?.Player?.togglePlay?.();
                    }
                } catch (error) { }
                scheduleLyricPlaybackStop({ uri, durationMs });
            };

            if (getCurrentPlayerUri() !== uri) {
                try {
                    window.Spicetify?.Player?.playUri?.(uri);
                    setTimeout(seekAndPlay, 450);
                } catch (error) {
                    console.warn("[LearningMode] failed to play lyric track:", error);
                    window.Toast?.error?.(t("lyricPlaybackFailed", "가사 위치로 재생하지 못했습니다."));
                }
                return;
            }

            seekAndPlay();
        }, []);

        const generateStudy = useCallback(async ({ force = false } = {}) => {
            if (!hasLyrics || !cacheKey || !trackId) {
                window.Toast?.error?.(t("noLyrics", "학습할 가사가 없습니다."));
                return;
            }

            if (typeof window.AIAddonManager?.generateLyricsStudy !== "function" || getEnabledStudyProviderCount() === 0) {
                window.Toast?.error?.(t("noProvider", "설정에서 학습을 지원하는 AI 제공자를 활성화해주세요."));
                return;
            }

            setAnswers({});
            setQuizStep(0);
            setWordQuery("");

            startGenerationJob({
                normalizedLyrics,
                trackId,
                trackUri,
                title,
                artist,
                provider,
                targetLang,
                difficulty: studyDifficulty,
                lyricsHash,
                cacheKey,
                force
            }).catch(() => {});
        }, [artist, cacheKey, hasLyrics, lyricsHash, normalizedLyrics, provider, studyDifficulty, targetLang, title, trackId, trackUri]);

        const regenerateQuiz = useCallback(() => {
            if (!pack || !hasLyrics || !cacheKey || !trackId) {
                window.Toast?.error?.(t("noQuiz", "생성된 퀴즈가 없습니다."));
                return;
            }

            if (typeof window.AIAddonManager?.generateLyricsStudy !== "function" || getEnabledStudyProviderCount() === 0) {
                window.Toast?.error?.(t("noProvider", "설정에서 학습을 지원하는 AI 제공자를 활성화해주세요."));
                return;
            }

            setActiveTab("quiz");
            setAnswers({});
            setQuizStep(0);
            startQuizGenerationJob({
                normalizedLyrics,
                basePack: pack,
                trackId,
                trackUri,
                title,
                artist,
                provider,
                targetLang,
                difficulty: quizDifficulty,
                lyricsHash,
                cacheKey
            }).catch(() => {});
        }, [artist, cacheKey, hasLyrics, lyricsHash, normalizedLyrics, pack, provider, quizDifficulty, targetLang, title, trackId, trackUri]);

        const openHistoryItem = useCallback((item) => {
            if (!item) return;
            selectStudyDifficulty(item.difficulty || "normal");
            setActiveTab("explain");

            const uri = item.trackUri || (item.trackId ? `spotify:track:${item.trackId}` : "");
            if (!uri) {
                window.Toast?.error?.(t("historyMissingTrack", "이 곡으로 이동할 수 없습니다."));
                return;
            }

            if (uri === getCurrentPlayerUri()) return;

            clearLyricPlaybackTimer();
            try {
                window.Spicetify?.Player?.playUri?.(uri);
            } catch (historyError) {
                console.warn("[LearningMode] failed to open history track:", historyError);
                window.Toast?.error?.(t("historyPlayFailed", "곡으로 이동하지 못했습니다."));
            }
        }, [selectStudyDifficulty]);

        const answerQuiz = useCallback((quizIndex, choiceIndex) => {
            if (!pack?.quiz?.[quizIndex]) return;
            if (answers?.[quizIndex]) return;

            const item = pack.quiz[quizIndex];
            const correct = choiceIndex === item.answerIndex;
            const nextAnswers = {
                ...answers,
                [quizIndex]: {
                    choiceIndex,
                    correct,
                    answeredAt: Date.now()
                }
            };

            playQuizSound(correct);
            setAnswers(nextAnswers);
            saveProgress({ cacheKey, trackId, answers: nextAnswers, quiz: pack.quiz }).catch((progressError) => {
                console.warn("[LearningMode] failed to save quiz progress:", progressError);
            });
        }, [answers, cacheKey, pack, trackId]);

        if (!isOpen) {
            return null;
        }

        const answeredValues = Object.values(answers || {});
        const correctCount = answeredValues.filter((answer) => answer?.correct).length;
        const totalQuiz = pack?.quiz?.length || 0;
        const allQuizAnswered = totalQuiz > 0 && pack.quiz.every((_, index) => answers[index]);
        const quizFinished = allQuizAnswered && quizStep >= totalQuiz;
        const currentQuizIndex = totalQuiz > 0 ? Math.min(quizStep, totalQuiz - 1) : 0;
        const currentQuiz = totalQuiz > 0 ? pack.quiz[currentQuizIndex] : null;
        const currentQuizAnswer = !quizFinished && currentQuiz ? answers[currentQuizIndex] : null;
        const wrongQuizCount = answeredValues.filter((answer) => answer && !answer.correct).length;
        const quizProgressPercent = totalQuiz > 0 ? (quizFinished ? 100 : ((currentQuizIndex + 1) / totalQuiz) * 100) : 0;
        const wrongQuizItems = pack?.quiz?.filter((item, index) => answers[index] && !answers[index].correct).slice(-3) || [];
        const wrongQuizReviewItems = pack?.quiz?.map((item, index) => ({
            item,
            index,
            answer: answers[index]
        })).filter((entry) => entry.answer && !entry.answer.correct) || [];
        const quizResultPercent = totalQuiz > 0 ? Math.round((correctCount / totalQuiz) * 100) : 0;
        const quizResultMessage = correctCount === totalQuiz
            ? t("quizResultPerfect", "완벽합니다. 틀린 문제가 없습니다.")
            : quizResultPercent >= 70
                ? t("quizResultGood", "좋습니다. 틀린 문제만 한 번 더 보면 됩니다.")
                : t("quizResultNeedsReview", "오답노트부터 다시 보고 한 번 더 풀어보세요.");
        const goNextQuiz = () => {
            if (currentQuizIndex < totalQuiz - 1) {
                setQuizStep(currentQuizIndex + 1);
            }
        };
        const finishOrNextQuiz = () => {
            if (currentQuizIndex < totalQuiz - 1) {
                setQuizStep(currentQuizIndex + 1);
                return;
            }
            const firstUnansweredIndex = pack?.quiz?.findIndex((_, index) => !answers[index]) ?? -1;
            if (firstUnansweredIndex >= 0) {
                setQuizStep(firstUnansweredIndex);
                return;
            }
            setQuizStep(totalQuiz);
        };
        const resetQuiz = () => {
            setAnswers({});
            setQuizStep(0);
            if (cacheKey && trackId && pack?.quiz) {
                saveProgress({ cacheKey, trackId, answers: {}, quiz: pack.quiz }).catch((progressError) => {
                    console.warn("[LearningMode] failed to reset quiz progress:", progressError);
                });
            }
        };
        const retryWrongQuiz = () => {
            const wrongIndexes = wrongQuizReviewItems.map((entry) => entry.index);
            if (!wrongIndexes.length) {
                resetQuiz();
                return;
            }
            const nextAnswers = { ...answers };
            for (const index of wrongIndexes) {
                delete nextAnswers[index];
            }
            setAnswers(nextAnswers);
            setQuizStep(wrongIndexes[0]);
            if (cacheKey && trackId && pack?.quiz) {
                saveProgress({ cacheKey, trackId, answers: nextAnswers, quiz: pack.quiz }).catch((progressError) => {
                    console.warn("[LearningMode] failed to save quiz retry progress:", progressError);
                });
            }
        };
        const handleQuizKeyDown = (event) => {
            if (activeTab !== "quiz" || !currentQuiz || quizFinished) return;
            const key = String(event.key || "").toLowerCase();
            const letterIndex = ["a", "b", "c", "d"].indexOf(key);
            const numberIndex = ["1", "2", "3", "4"].indexOf(key);
            const choiceIndex = letterIndex >= 0 ? letterIndex : numberIndex;

            if (choiceIndex >= 0 && choiceIndex < currentQuiz.choices.length && !currentQuizAnswer) {
                event.preventDefault();
                answerQuiz(currentQuizIndex, choiceIndex);
                return;
            }

            if ((key === "enter" || key === "arrowright") && currentQuizAnswer) {
                event.preventDefault();
                finishOrNextQuiz();
            }
        };
        const generationPercent = generationProgress.total > 0
            ? Math.round((generationProgress.done / generationProgress.total) * 100)
            : 0;
        const progressPercent = status === "loading"
            ? generationPercent
            : totalQuiz > 0
                ? Math.round((answeredValues.length / totalQuiz) * 100)
                : (pack ? 100 : 0);
        const difficultyOptions = STUDY_DIFFICULTIES.map((id) => ({
            id,
            label: getStudyDifficultyLabel(id)
        }));
        const historyCount = studyHistory.length;

        return react.createElement("aside", {
            className: `ivlyrics-study-panel theme-${studyTheme}`,
            role: "dialog",
            "aria-label": t("title", "AI 학습 모드"),
            onKeyDown: handleQuizKeyDown,
            tabIndex: -1
        },
            react.createElement("div", { className: "ivlyrics-study-header" },
                react.createElement("div", { className: "ivlyrics-study-title-wrap" },
                    react.createElement("div", { className: "ivlyrics-study-eyebrow" }, t("eyebrow", "AI Learning")),
                    react.createElement("h2", { className: "ivlyrics-study-title" }, t("title", "AI 학습 모드")),
                    react.createElement("p", { className: "ivlyrics-study-track" }, [title, artist].filter(Boolean).join(" - "))
                ),
                react.createElement("div", { className: "ivlyrics-study-header-actions" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-theme-toggle",
                        onClick: toggleStudyTheme,
                        "aria-label": studyTheme === "dark"
                            ? t("lightMode", "라이트 모드")
                            : t("darkMode", "다크 모드"),
                        title: studyTheme === "dark"
                            ? t("lightMode", "라이트 모드")
                            : t("darkMode", "다크 모드")
                    }, studyTheme === "dark" ? "☀" : "☾"),
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-close",
                        onClick: close,
                        "aria-label": t("close", "닫기")
                    }, "x")
                )
            ),
            react.createElement("div", { className: "ivlyrics-study-body" },
                react.createElement("nav", { className: "ivlyrics-study-rail", "aria-label": t("title", "AI 학습 모드") },
                    react.createElement("div", { className: "ivlyrics-study-tabs", role: "tablist" },
                        react.createElement(TabButton, { id: "explain", activeTab, onSelect: setActiveTab }, t("tabExplain", "오늘의 해설")),
                        react.createElement(TabButton, { id: "quiz", activeTab, onSelect: setActiveTab }, t("tabQuiz", "퀴즈")),
                        react.createElement(TabButton, { id: "words", activeTab, onSelect: setActiveTab }, t("tabWords", "단어장")),
                        react.createElement(TabButton, { id: "history", activeTab, onSelect: setActiveTab }, t("tabHistory", "학습 기록"))
                    ),
                    react.createElement("div", { className: "ivlyrics-study-rail-card" },
                        react.createElement("span", null, t("lessonProgress", "진행")),
                        react.createElement("strong", null, `${progressPercent}%`),
                        react.createElement("div", { className: "ivlyrics-study-rail-progress" },
                            react.createElement("div", {
                                style: { width: `${Math.max(0, Math.min(100, progressPercent))}%` }
                            })
                        ),
                        react.createElement("p", null,
                            status === "loading"
                                ? (loadingText || t("loading", "가사를 분석하는 중..."))
                                : totalQuiz > 0
                                ? t("score", "{score}/{total} 정답").replace("{score}", correctCount).replace("{total}", totalQuiz)
                                : t("readyState", "학습 준비 완료")
                        ),
                        pack && react.createElement("div", { className: "ivlyrics-study-rail-stats" },
                            react.createElement("div", null,
                                react.createElement("span", null, t("summary", "곡 요약")),
                                react.createElement("strong", null, pack.summary ? "1" : "0")
                            ),
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabQuiz", "퀴즈")),
                                react.createElement("strong", null, totalQuiz)
                            ),
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabWords", "단어장")),
                                react.createElement("strong", null, wordbook.length)
                            )
                        ),
                        react.createElement("div", { className: "ivlyrics-study-difficulty" },
                            react.createElement("div", { className: "ivlyrics-study-difficulty-head" },
                                react.createElement("span", null, t("difficulty", "난이도")),
                                react.createElement("small", null, t("difficultyHint", "생성 전에 원하는 설명 깊이를 고르세요."))
                            ),
                            react.createElement("div", { className: "ivlyrics-study-difficulty-options" },
                                difficultyOptions.map((item) => react.createElement("button", {
                                    key: item.id,
                                    type: "button",
                                    className: studyDifficulty === item.id ? "active" : "",
                                    onClick: () => selectStudyDifficulty(item.id),
                                    disabled: status === "loading"
                                }, item.label))
                            )
                        ),
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-secondary",
                            onClick: () => generateStudy({ force: Boolean(pack) }),
                            disabled: status === "loading" || !hasLyrics
                        }, pack ? t("regenerate", "다시 생성") : t("generate", "생성")),
                        pack && react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-secondary subtle",
                            onClick: regenerateQuiz,
                            disabled: status === "loading" || !hasLyrics
                        }, t("quizRegenerate", "새 문제 만들기"))
                    )
                ),
                react.createElement("main", { className: "ivlyrics-study-stage" },
                    !hasLyrics && activeTab !== "history" && react.createElement(EmptyState, null, t("noLyrics", "학습할 가사가 없습니다.")),
                    hasLyrics && activeTab !== "history" && !pack && status !== "loading" && react.createElement(EmptyState, null,
                        react.createElement("p", null, t("empty", "현재 곡의 학습 데이터가 없습니다.")),
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-primary",
                            onClick: () => generateStudy()
                        }, t("generate", "생성"))
                    ),
                    status === "loading" && activeTab !== "history" && !pack && react.createElement(EmptyState, null,
                        react.createElement("div", { className: "ivlyrics-study-spinner" }),
                        react.createElement("p", null, loadingText || t("loading", "가사를 분석하는 중..."))
                    ),
                    error && react.createElement("div", { className: "ivlyrics-study-error" }, error),
                    status === "loading" && pack && react.createElement("div", { className: "ivlyrics-study-loading-banner" },
                        react.createElement("div", { className: "ivlyrics-study-spinner" }),
                        react.createElement("p", null, loadingText || t("loading", "가사를 분석하는 중..."))
                    ),
                    activeTab === "history" && react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-history" },
                        react.createElement("section", { className: "ivlyrics-study-wordbook-hero ivlyrics-study-history-hero" },
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabHistory", "학습 기록")),
                                react.createElement("h3", null, t("studyHistoryTitle", "생성한 곡"))
                            ),
                            react.createElement("strong", null,
                                t("studyHistoryCount", "{count}곡").replace("{count}", historyCount)
                            )
                        ),
                        studyHistory.length === 0 && react.createElement(EmptyState, null, t("studyHistoryEmpty", "아직 생성한 학습 곡이 없습니다.")),
                        studyHistory.length > 0 && react.createElement("div", { className: "ivlyrics-study-history-grid" },
                            studyHistory.map((item) => {
                                const isCurrent = item.cacheKey === cacheKey;
                                return react.createElement("article", {
                                    key: item.cacheKey,
                                    className: `ivlyrics-study-history-card${isCurrent ? " active" : ""}`
                                },
                                    react.createElement("button", {
                                        type: "button",
                                        onClick: () => openHistoryItem(item)
                                    },
                                        react.createElement("div", null,
                                            react.createElement("strong", null, item.title || t("unknownSong", "제목 없음")),
                                            item.artist && react.createElement("span", null, item.artist)
                                        ),
                                        react.createElement("div", { className: "ivlyrics-study-history-meta" },
                                            isCurrent && react.createElement("em", { className: "current" }, t("studyHistoryCurrent", "현재 학습")),
                                            react.createElement("em", null, getStudyDifficultyLabel(item.difficulty)),
                                            react.createElement("em", null, `${item.quizCount} ${t("tabQuiz", "퀴즈")}`),
                                            item.updatedAt && react.createElement("em", null, new Date(item.updatedAt).toLocaleDateString())
                                        )
                                    )
                                );
                            })
                        )
                    ),
                    pack && activeTab === "explain" && react.createElement("div", { className: "ivlyrics-study-section" },
                        currentLineStudy && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-current" },
                            react.createElement("h3", null, t("currentLine", "지금 가사")),
                            currentLineStudy.sourceText && react.createElement("div", { className: "ivlyrics-study-source-card" },
                                react.createElement("div", { className: "ivlyrics-study-source-head" },
                                    react.createElement("span", null, t("sourceLine", "가사 원문")),
                                    Number.isFinite(Number(currentLineStudy.startTime)) && react.createElement(LyricPlayButton, {
                                        onClick: () => playLyricAt({
                                            trackUri,
                                            startTime: currentLineStudy.startTime,
                                            endTime: currentLineStudy.endTime,
                                            sourceText: currentLineStudy.sourceText
                                        })
                                    })
                                ),
                                react.createElement("blockquote", null, currentLineStudy.sourceText),
                                react.createElement(ReadingHints, {
                                    reading: currentLineStudy.reading,
                                    pronunciation: currentLineStudy.pronunciation
                                })
                            ),
                            currentLineStudy.translation && react.createElement("p", { className: "ivlyrics-study-translation" }, currentLineStudy.translation),
                            currentLineStudy.explanation && react.createElement("p", null, currentLineStudy.explanation),
                            currentLineStudy.grammar?.length > 0 && react.createElement("div", { className: "ivlyrics-study-grammar-stack" },
                                currentLineStudy.grammar.map((item, index) => react.createElement(GrammarNote, {
                                    key: index,
                                    item
                                }))
                            ),
                            currentLineStudy.vocabulary?.length > 0 && react.createElement("div", { className: "ivlyrics-study-vocab-list" },
                                currentLineStudy.vocabulary.map((word, index) => {
                                    const wordId = getWordIdForEntry(word);
                                    const saved = savedWordIds.has(wordId);
                                    const feedback = savedWordFeedback[wordId];
                                    return react.createElement("button", {
                                        key: `${word.term}-${index}`,
                                        type: "button",
                                        className: [
                                            "ivlyrics-study-word-chip",
                                            saved ? "saved" : "",
                                            feedback ? "feedback" : ""
                                        ].filter(Boolean).join(" "),
                                        onClick: () => toggleWord({
                                            ...word,
                                            lineIndex: currentLineStudy.index,
                                            sourceText: currentLineStudy.sourceText,
                                            startTime: currentLineStudy.startTime,
                                            endTime: currentLineStudy.endTime,
                                            grammar: currentLineStudy.grammar
                                        })
                                    },
                                        feedback === "removed" ? `− ${t("removedWord", "삭제됨")}` : feedback ? `✓ ${t("savedWord", "저장됨")}` : saved ? `✓ ${word.term}` : word.term,
                                        !feedback && (word.reading ? ` (${word.reading})` : word.pronunciation ? ` (${word.pronunciation})` : ""),
                                        !feedback && word.meaning ? ` - ${word.meaning}` : ""
                                    );
                                })
                            )
                        ),
                        !currentLineStudy && pack.lines?.length > 0 && react.createElement("div", { className: "ivlyrics-study-note" },
                            status === "loading"
                                ? t("linePending", "지금 가사 카드는 아직 만드는 중입니다.")
                                : t("lineOutOfRange", "지금 가사는 분석 범위 밖입니다.")
                        ),
                        pack.summary && react.createElement("section", { className: "ivlyrics-study-card" },
                            react.createElement("h3", null, t("summary", "곡 요약")),
                            react.createElement("p", null, pack.summary)
                        ),
                        pack.omittedCount > 0 && react.createElement("div", { className: "ivlyrics-study-note" },
                            t("omitted", "{count}개의 가사 조각은 분석 범위 밖입니다.").replace("{count}", pack.omittedCount)
                        ),
                        grammarItems.length > 0 && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-grammar-card" },
                            react.createElement("div", { className: "ivlyrics-study-section-head" },
                                react.createElement("div", null,
                                    react.createElement("h3", null, t("grammarPatterns", "문법 포인트")),
                                    react.createElement("p", null, t("grammarPatternsHint", "가사에서 바로 써먹을 수 있는 구조만 골랐습니다."))
                                ),
                                react.createElement("span", null, grammarItems.length)
                            ),
                            react.createElement("div", { className: "ivlyrics-study-grammar-lessons" },
                                grammarItems.map((item, index) => react.createElement("article", {
                                    key: `${item.pattern}-${index}`,
                                    className: "ivlyrics-study-grammar-lesson"
                                },
                                    react.createElement("div", { className: "ivlyrics-study-grammar-index" }, String(index + 1).padStart(2, "0")),
                                    react.createElement("div", { className: "ivlyrics-study-grammar-body" },
                                        react.createElement("div", { className: "ivlyrics-study-grammar-title-row" },
                                            react.createElement(GrammarNote, { item }),
                                            Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                                                onClick: () => playLyricAt({
                                                    trackUri,
                                                    startTime: item.startTime,
                                                    endTime: item.endTime,
                                                    sourceText: item.sourceText
                                                })
                                            })
                                        ),
                                        item.sourceText && react.createElement("blockquote", null, item.sourceText),
                                        item.translation && react.createElement("p", { className: "ivlyrics-study-grammar-translation" }, item.translation),
                                        item.lineExplanation && react.createElement("p", { className: "ivlyrics-study-grammar-context" }, item.lineExplanation)
                                    )
                                ))
                            )
                        ),
                        pack.keyExpressions?.length > 0 && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-expansion-card" },
                            react.createElement("div", { className: "ivlyrics-study-section-head" },
                                react.createElement("div", null,
                                    react.createElement("h3", null, t("keyExpressions", "표현 확장")),
                                    react.createElement("p", null, t("expressionExpansionHint", "가사 속 단어를 다른 상황에서도 쓰게 만드는 확장 노트입니다."))
                                ),
                                react.createElement("span", null, pack.keyExpressions.length)
                            ),
                            pack.keyExpressions.map((item, index) => react.createElement("article", {
                                key: `${item.expression}-${index}`,
                                className: "ivlyrics-study-expression"
                            },
                                react.createElement("div", { className: "ivlyrics-study-expression-main" },
                                    react.createElement("div", null,
                                        react.createElement("strong", null, item.expression),
                                        item.meaning && react.createElement("span", null, item.meaning)
                                    ),
                                    Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                                        onClick: () => playLyricAt({ ...item, trackUri: item.trackUri || trackUri })
                                    })
                                ),
                                item.sourceText && react.createElement("p", { className: "ivlyrics-study-source-inline" }, item.sourceText),
                                react.createElement(ReadingHints, {
                                    reading: item.reading,
                                    pronunciation: item.pronunciation
                                }),
                                item.note && react.createElement("p", null, item.note),
                                (item.alternatives?.length > 0 || item.forms?.length > 0 || item.relatedWords?.length > 0) && react.createElement("div", { className: "ivlyrics-study-expression-groups" },
                                    item.alternatives?.length > 0 && react.createElement("div", null,
                                        react.createElement("span", null, t("alternatives", "대체 표현")),
                                        react.createElement("div", null, item.alternatives.map((value) => react.createElement("em", { key: value }, value)))
                                    ),
                                    item.forms?.length > 0 && react.createElement("div", null,
                                        react.createElement("span", null, t("forms", "활용형")),
                                        react.createElement("div", null, item.forms.map((value) => react.createElement("em", { key: value }, value)))
                                    ),
                                    item.relatedWords?.length > 0 && react.createElement("div", null,
                                        react.createElement("span", null, t("relatedWords", "비슷한 단어")),
                                        react.createElement("div", null, item.relatedWords.map((value) => react.createElement("em", { key: value }, value)))
                                    )
                                ),
                                react.createElement("div", { className: "ivlyrics-study-expression-actions" },
                                    react.createElement("button", {
                                        type: "button",
                                        className: [
                                            "ivlyrics-study-mini",
                                            savedWordIds.has(getWordIdForEntry(item)) ? "saved" : "",
                                            savedWordFeedback[getWordIdForEntry(item)] ? "feedback" : ""
                                        ].filter(Boolean).join(" "),
                                        onClick: () => toggleWord({ ...item, lineIndex: item.lineIndexes?.[0] ?? null })
                                    }, savedWordFeedback[getWordIdForEntry(item)] === "removed"
                                        ? t("removedWord", "삭제됨")
                                        : savedWordFeedback[getWordIdForEntry(item)]
                                        ? t("savedWord", "저장됨")
                                        : savedWordIds.has(getWordIdForEntry(item))
                                            ? t("savedWord", "저장됨")
                                            : t("saveWord", "저장"))
                                )
                            ))
                        )
                    ),
                    pack && activeTab === "quiz" && react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-quiz-stage" },
                        react.createElement("div", { className: "ivlyrics-study-quiz-tools" },
                            react.createElement("div", { className: "ivlyrics-study-quiz-difficulty" },
                                react.createElement("span", null, t("difficulty", "난이도")),
                                react.createElement("div", { className: "ivlyrics-study-difficulty-options compact" },
                                    difficultyOptions.map((item) => react.createElement("button", {
                                        key: `quiz-${item.id}`,
                                        type: "button",
                                        className: quizDifficulty === item.id ? "active" : "",
                                        onClick: () => setQuizDifficulty(item.id),
                                        disabled: status === "loading"
                                    }, item.label))
                                )
                            ),
                            react.createElement("button", {
                                type: "button",
                                className: "ivlyrics-study-secondary subtle",
                                onClick: regenerateQuiz,
                                disabled: status === "loading" || !hasLyrics
                            }, t("quizRegenerate", "새 문제 만들기"))
                        ),
                        totalQuiz > 0 && react.createElement("div", { className: "ivlyrics-study-quiz-topline" },
                            react.createElement("div", null,
                                react.createElement("span", { className: "ivlyrics-study-quiz-badge" },
                                    quizFinished
                                        ? t("quizResult", "결과")
                                        : getQuizTypeLabel(currentQuiz?.type)
                                ),
                                react.createElement("span", null,
                                    quizFinished
                                        ? t("quizResult", "결과")
                                        : t("quizStep", "{current}/{total} 문제")
                                            .replace("{current}", currentQuizIndex + 1)
                                            .replace("{total}", totalQuiz)
                                )
                            ),
                            react.createElement("div", { className: "ivlyrics-study-quiz-score-row" },
                                react.createElement("span", { className: "correct" }, `✓ ${correctCount}`),
                                react.createElement("span", { className: "wrong" }, `× ${wrongQuizCount}`)
                            ),
                            react.createElement("div", { className: "ivlyrics-study-quiz-progress" },
                                react.createElement("div", { style: { width: `${quizProgressPercent}%` } })
                            )
                        ),
                        totalQuiz === 0 && react.createElement(EmptyState, null,
                            react.createElement("p", null, t("noQuiz", "생성된 퀴즈가 없습니다.")),
                            react.createElement("button", {
                                type: "button",
                                className: "ivlyrics-study-primary",
                                onClick: regenerateQuiz,
                                disabled: status === "loading"
                            }, t("quizRegenerate", "새 문제 만들기"))
                        ),
                        quizFinished && totalQuiz > 0 && react.createElement("section", {
                            className: "ivlyrics-study-card ivlyrics-study-quiz-result"
                        },
                            react.createElement("div", { className: "ivlyrics-study-result-hero" },
                                react.createElement("span", { className: "ivlyrics-study-result-kicker" }, t("quizResult", "결과")),
                                react.createElement("strong", null, `${quizResultPercent}%`),
                                react.createElement("p", null, quizResultMessage)
                            ),
                            react.createElement("div", { className: "ivlyrics-study-result-stats" },
                                react.createElement("div", null,
                                    react.createElement("span", null, t("quizAccuracy", "정답률")),
                                    react.createElement("strong", null, `${quizResultPercent}%`)
                                ),
                                react.createElement("div", null,
                                    react.createElement("span", null, t("quizCorrectCount", "정답")),
                                    react.createElement("strong", null, `${correctCount}/${totalQuiz}`)
                                ),
                                react.createElement("div", null,
                                    react.createElement("span", null, t("quizWrongCount", "오답")),
                                    react.createElement("strong", null, wrongQuizReviewItems.length)
                                )
                            ),
                            wrongQuizReviewItems.length > 0
                                ? react.createElement("div", { className: "ivlyrics-study-review-list" },
                                    react.createElement("div", { className: "ivlyrics-study-review-head" },
                                        react.createElement("h3", null, t("quizReviewTitle", "오답노트")),
                                        react.createElement("p", null, t("quizReviewHint", "틀린 문제의 가사와 정답을 다시 확인하세요."))
                                    ),
                                    wrongQuizReviewItems.map(({ item, index, answer }) => react.createElement("article", {
                                        key: `${item.id || index}-review`,
                                        className: "ivlyrics-study-review-item"
                                    },
                                        item.sourceText && react.createElement("div", { className: "ivlyrics-study-review-source" },
                                            react.createElement("blockquote", null, item.sourceText),
                                            Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                                                onClick: () => playLyricAt({
                                                    trackUri,
                                                    startTime: item.startTime,
                                                    endTime: item.endTime,
                                                    sourceText: item.sourceText
                                                })
                                            })
                                        ),
                                        react.createElement("p", { className: "ivlyrics-study-review-question" }, item.question),
                                        react.createElement("div", { className: "ivlyrics-study-review-answers" },
                                            react.createElement("span", { className: "wrong" },
                                                t("quizYourAnswer", "내 답"),
                                                ": ",
                                                item.choices?.[answer.choiceIndex] || "-"
                                            ),
                                            react.createElement("span", { className: "correct" },
                                                t("quizCorrectAnswer", "정답"),
                                                ": ",
                                                item.choices?.[item.answerIndex] || "-"
                                            )
                                        ),
                                        item.explanation && react.createElement("p", { className: "ivlyrics-study-review-explanation" }, item.explanation),
                                        react.createElement("button", {
                                            type: "button",
                                            className: "ivlyrics-study-mini",
                                            onClick: () => setQuizStep(index)
                                        }, t("quizReviewQuestion", "문제 보기"))
                                    ))
                                )
                                : react.createElement("div", { className: "ivlyrics-study-no-wrong" }, t("quizNoWrong", "틀린 문제가 없습니다.")),
                            react.createElement("div", { className: "ivlyrics-study-result-actions" },
                                react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-secondary subtle",
                                    onClick: () => setActiveTab("words")
                                }, t("quizGoWordbook", "단어장 보기")),
                                wrongQuizReviewItems.length > 0 && react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-secondary",
                                    onClick: retryWrongQuiz
                                }, t("quizRetryWrong", "오답 다시 풀기")),
                                react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-secondary",
                                    onClick: regenerateQuiz,
                                    disabled: status === "loading"
                                }, t("quizRegenerate", "새 문제 만들기")),
                                react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-primary dark",
                                    onClick: resetQuiz
                                }, t("quizRetry", "다시 풀기"))
                            )
                        ),
                        currentQuiz && !quizFinished && react.createElement("section", {
                            key: currentQuiz.id || currentQuizIndex,
                            className: [
                                "ivlyrics-study-card",
                                "ivlyrics-study-quiz",
                                `quiz-type-${normalizeQuizType(currentQuiz.type)}`,
                                currentQuizAnswer?.correct ? "is-correct" : "",
                                currentQuizAnswer && !currentQuizAnswer.correct ? "is-wrong" : ""
                            ].filter(Boolean).join(" ")
                        }, 
                            react.createElement("div", { className: "ivlyrics-study-quiz-prompt" },
                                normalizeQuizType(currentQuiz.type) === "blank"
                                    ? react.createElement(BlankQuestion, { text: currentQuiz.question })
                                    : react.createElement("p", null, currentQuiz.question),
                                shouldShowQuizSource(currentQuiz) && react.createElement("div", { className: "ivlyrics-study-source-card compact" },
                                    react.createElement("div", { className: "ivlyrics-study-source-head" },
                                        react.createElement("span", null, t("sourceLine", "가사 원문")),
                                        Number.isFinite(Number(currentQuiz.startTime)) && react.createElement(LyricPlayButton, {
                                            onClick: () => playLyricAt({
                                                trackUri,
                                                startTime: currentQuiz.startTime,
                                                endTime: currentQuiz.endTime,
                                                sourceText: currentQuiz.sourceText
                                            })
                                        })
                                    ),
                                    react.createElement("blockquote", null, currentQuiz.sourceText),
                                    react.createElement(ReadingHints, {
                                        reading: currentQuiz.reading,
                                        pronunciation: currentQuiz.pronunciation
                                    })
                                )
                            ),
                            react.createElement("div", { className: "ivlyrics-study-choice-grid" },
                                currentQuiz.choices.map((choice, choiceIndex) => {
                                    const isAnswered = !!currentQuizAnswer;
                                    const isCorrect = currentQuiz.answerIndex === choiceIndex;
                                    const selected = currentQuizAnswer?.choiceIndex === choiceIndex;
                                    const letter = String.fromCharCode(65 + choiceIndex);
                                    return react.createElement("button", {
                                        key: `${currentQuizIndex}-${choiceIndex}`,
                                        type: "button",
                                        disabled: isAnswered,
                                        className: [
                                            "ivlyrics-study-choice",
                                            selected ? "selected" : "",
                                            isAnswered && isCorrect ? "correct" : "",
                                            isAnswered && selected && !isCorrect ? "wrong" : ""
                                        ].filter(Boolean).join(" "),
                                        onClick: () => answerQuiz(currentQuizIndex, choiceIndex)
                                    },
                                        react.createElement("span", { className: "ivlyrics-study-choice-letter" }, letter),
                                        react.createElement("strong", null, choice),
                                        isAnswered && isCorrect && react.createElement("span", { className: "ivlyrics-study-choice-mark" }, "✓"),
                                        isAnswered && selected && !isCorrect && react.createElement("span", { className: "ivlyrics-study-choice-mark" }, "×")
                                    );
                                })
                            ),
                            currentQuizAnswer && react.createElement("div", {
                                className: [
                                    "ivlyrics-study-quiz-explanation",
                                    currentQuizAnswer.correct ? "correct" : "wrong"
                                ].join(" ")
                            },
                                react.createElement("strong", null,
                                    currentQuizAnswer.correct
                                        ? t("quizCorrect", "정답입니다")
                                        : t("quizWrong", "해설")
                                ),
                                currentQuiz.explanation && react.createElement("p", null, currentQuiz.explanation)
                            ),
                            wrongQuizItems.length > 0 && react.createElement("div", { className: "ivlyrics-study-wrong-strip" },
                                react.createElement("span", null, t("wrongReview", "다시 볼 표현")),
                                wrongQuizItems.map((item, index) => react.createElement("button", {
                                    key: `${item.id || item.lineIndex || index}-${index}`,
                                    type: "button",
                                    onClick: () => setQuizStep(Math.max(0, pack.quiz.indexOf(item)))
                                }, item.sourceText || item.question))
                            ),
                            react.createElement("div", { className: "ivlyrics-study-quiz-footer" },
                                react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-secondary subtle",
                                    onClick: goNextQuiz,
                                    disabled: currentQuizIndex >= totalQuiz - 1
                                }, t("skipQuiz", "건너뛰기")),
                                react.createElement("button", {
                                    type: "button",
                                    className: "ivlyrics-study-primary dark",
                                    onClick: finishOrNextQuiz,
                                    disabled: !currentQuizAnswer
                                }, currentQuizIndex >= totalQuiz - 1 ? t("quizDone", "완료") : t("nextQuiz", "다음 문제"))
                            )
                        )
                    ),
                    pack && activeTab === "words" && react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-wordbook" },
                        react.createElement("section", { className: "ivlyrics-study-wordbook-hero" },
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabWords", "단어장")),
                                react.createElement("h3", null, t("wordbookTitle", "저장한 표현"))
                            ),
                            react.createElement("strong", null,
                                t("wordCount", "{count}개").replace("{count}", wordbook.length)
                            )
                        ),
                        react.createElement("div", { className: "ivlyrics-study-word-tools" },
                            react.createElement("label", { className: "ivlyrics-study-word-search" },
                                react.createElement("span", null, "⌕"),
                                react.createElement("input", {
                                    type: "search",
                                    value: wordQuery,
                                    placeholder: t("wordSearch", "표현, 뜻, 가사 검색"),
                                    onChange: (event) => setWordQuery(event.target.value)
                                })
                            ),
                            react.createElement("div", { className: "ivlyrics-study-word-stat-row" },
                                react.createElement("span", null, t("wordStatAll", "전체 {count}").replace("{count}", wordbookStats.total)),
                                react.createElement("span", null, t("wordStatCurrent", "현재 곡 {count}").replace("{count}", wordbookStats.current)),
                                react.createElement("span", null, t("wordStatReading", "읽기 {count}").replace("{count}", wordbookStats.withReading)),
                                react.createElement("span", null, t("wordStatSource", "가사 {count}").replace("{count}", wordbookStats.withSource)),
                                react.createElement("span", null, t("wordStatSynced", "싱크 {count}").replace("{count}", wordbookStats.withSync))
                            ),
                            react.createElement("div", { className: "ivlyrics-study-word-scope", role: "tablist" },
                                [
                                    { id: "all", label: t("wordScopeAll", "전체") },
                                    { id: "current", label: t("wordScopeCurrent", "현재 곡") },
                                    { id: "synced", label: t("wordScopeSynced", "싱크 있음") }
                                ].map((item) => react.createElement("button", {
                                    key: item.id,
                                    type: "button",
                                    className: wordScope === item.id ? "active" : "",
                                    onClick: () => setWordScope(item.id),
                                    role: "tab",
                                    "aria-selected": wordScope === item.id
                                }, item.label))
                            )
                        ),
                        wordbook.length === 0 && react.createElement(EmptyState, null, t("noWords", "저장된 단어가 없습니다.")),
                        wordbook.length > 0 && filteredWordbook.length === 0 && react.createElement(EmptyState, null, t("noWordResults", "검색 결과가 없습니다.")),
                        filteredWordbook.length > 0 && react.createElement("div", { className: "ivlyrics-study-word-grid" },
                            filteredWordbook.map((word) => react.createElement("article", {
                                key: word.id,
                                className: "ivlyrics-study-word-card"
                            },
                                react.createElement("div", { className: "ivlyrics-study-word-head" },
                                    react.createElement("div", null,
                                        react.createElement("strong", null, word.expression),
                                        word.meaning && react.createElement("span", null, word.meaning),
                                        (word.title || word.artist) && react.createElement("em", null,
                                            [word.title, word.artist].filter(Boolean).join(" - ")
                                        )
                                    ),
                                    react.createElement("button", {
                                        type: "button",
                                        className: "ivlyrics-study-word-remove",
                                        onClick: () => removeWord(word.id),
                                        "aria-label": t("removeWord", "삭제")
                                    }, "×")
                                ),
                                react.createElement("div", { className: "ivlyrics-study-word-actions" },
                                    react.createElement("button", {
                                        type: "button",
                                        className: "ivlyrics-study-lyric-play ivlyrics-study-speech-play",
                                        onClick: () => speakText(word.expression, word.sourceLang || detectSpeechLang([
                                            word.expression,
                                            word.reading,
                                            word.sourceText
                                        ].filter(Boolean).join(" "), word.targetLang || targetLang))
                                    },
                                        react.createElement("span", { "aria-hidden": "true" }, "▶"),
                                        react.createElement("span", null, t("speak", "발음 듣기"))
                                    ),
                                    word.trackUri && Number.isFinite(Number(word.startTime)) && react.createElement(LyricPlayButton, {
                                        onClick: () => playLyricAt(word)
                                    })
                                ),
                                react.createElement(ReadingHints, {
                                    reading: word.reading,
                                    pronunciation: word.pronunciation
                                }),
                                word.grammar?.length > 0 && react.createElement("div", { className: "ivlyrics-study-word-grammar" },
                                    word.grammar.map((item, index) => react.createElement(GrammarNote, {
                                        key: index,
                                        item
                                    }))
                                ),
                                word.sourceText && react.createElement("p", { className: "ivlyrics-study-word-source" }, word.sourceText),
                                word.note && react.createElement("p", { className: "ivlyrics-study-word-note" }, word.note)
                            ))
                        )
                    )
                )
            )
        );
    });

    const injectStyles = () => {
        if (document.getElementById("ivlyrics-learning-mode-styles")) return;

        const style = document.createElement("style");
        style.id = "ivlyrics-learning-mode-styles";
        style.textContent = `
.ivlyrics-study-button.active {
  color: var(--spice-button-active, #1ed760);
}

.ivlyrics-study-panel {
  position: absolute;
  top: 72px;
  right: 24px;
  width: min(430px, calc(100vw - 32px));
  max-height: calc(100% - 104px);
  z-index: var(--iv-layer-panel, 1000);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f8fafc;
  background: rgba(12, 12, 12, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(18px);
  border-radius: 8px;
}

.ivlyrics-study-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-study-title-wrap {
  min-width: 0;
}

.ivlyrics-study-eyebrow {
  margin-bottom: 6px;
  color: rgba(34, 197, 94, 0.92);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.ivlyrics-study-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
}

.ivlyrics-study-track {
  margin: 6px 0 0;
  color: rgba(248, 250, 252, 0.62);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ivlyrics-study-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.ivlyrics-study-theme-toggle,
.ivlyrics-study-close {
  width: 32px;
  height: 32px;
  border: 0;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: rgba(248, 250, 252, 0.72);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
}

.ivlyrics-study-theme-toggle {
  font-size: 15px;
  font-weight: 900;
}

.ivlyrics-study-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-study-tab,
.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini,
.ivlyrics-study-lyric-play,
.ivlyrics-study-choice,
.ivlyrics-study-word-chip {
  font: inherit;
}

.ivlyrics-study-tab {
  min-height: 34px;
  border: 1px solid transparent;
  color: rgba(248, 250, 252, 0.62);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

.ivlyrics-study-tab.active {
  color: #f8fafc;
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.35);
}

.ivlyrics-study-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.ivlyrics-study-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ivlyrics-study-card,
.ivlyrics-study-empty,
.ivlyrics-study-error,
.ivlyrics-study-note {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.ivlyrics-study-card {
  padding: 14px;
}

.ivlyrics-study-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.35;
  font-weight: 800;
  letter-spacing: 0;
}

.ivlyrics-study-card p {
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  font-size: 13px;
  line-height: 1.6;
}

.ivlyrics-study-current {
  border-color: rgba(34, 197, 94, 0.32);
}

.ivlyrics-study-translation {
  color: #f8fafc !important;
  font-weight: 700;
  margin-bottom: 8px !important;
}

.ivlyrics-study-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 22px;
  text-align: center;
  color: rgba(248, 250, 252, 0.68);
}

.ivlyrics-study-empty p {
  margin: 0;
}

.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini {
  border: 0;
  color: #04130a;
  background: #22c55e;
  font-weight: 800;
  cursor: pointer;
  border-radius: 6px;
}

.ivlyrics-study-primary {
  min-height: 40px;
  padding: 0 18px;
}

.ivlyrics-study-secondary {
  min-height: 34px;
  padding: 0 12px;
  color: #f8fafc;
  background: rgba(34, 197, 94, 0.18);
  border: 1px solid rgba(34, 197, 94, 0.34);
}

.ivlyrics-study-actions {
  display: flex;
  justify-content: flex-end;
}

.ivlyrics-study-mini {
  min-height: 28px;
  padding: 0 10px;
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.09);
}

.ivlyrics-study-mini.danger {
  color: #fecaca;
}

.ivlyrics-study-lyric-play {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 0 11px;
  border: 1px solid #60a5fa;
  color: #0b3b72;
  background: #e7f3ff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: inset 0 -2px 0 rgba(29, 78, 216, 0.12);
}

.ivlyrics-study-lyric-play:hover {
  color: #062d59;
  background: #d7ebff;
  border-color: #3b82f6;
}

.ivlyrics-study-lyric-play:disabled {
  opacity: 0.45;
  cursor: default;
}

.ivlyrics-study-lyric-play span {
  display: inline !important;
  margin-bottom: 0 !important;
  color: inherit !important;
  font-size: inherit !important;
  text-align: left !important;
}

.ivlyrics-study-lyric-play span:first-child {
  font-size: 10px;
  line-height: 1;
}

.ivlyrics-study-list {
  margin: 10px 0 0;
  padding-left: 18px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-vocab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ivlyrics-study-word-chip {
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(248, 250, 252, 0.84);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}

.ivlyrics-study-expression,
.ivlyrics-study-word {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ivlyrics-study-expression > div,
.ivlyrics-study-word > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ivlyrics-study-expression strong,
.ivlyrics-study-word strong {
  color: #f8fafc;
}

.ivlyrics-study-expression span,
.ivlyrics-study-word span {
  color: rgba(248, 250, 252, 0.68);
  font-size: 12px;
  text-align: right;
}

.ivlyrics-study-expression-actions {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  flex-wrap: wrap;
}

.ivlyrics-study-grammar-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.ivlyrics-study-grammar-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ivlyrics-study-grammar-note strong {
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.4;
}

.ivlyrics-study-grammar-note p {
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-grammar-note small {
  color: rgba(248, 250, 252, 0.56);
  font-size: 12px;
  line-height: 1.45;
}

.ivlyrics-study-score,
.ivlyrics-study-note {
  padding: 10px 12px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 12px;
}

.ivlyrics-study-quiz {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ivlyrics-study-choice {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(248, 250, 252, 0.82);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
}

.ivlyrics-study-choice.selected {
  border-color: rgba(59, 130, 246, 0.62);
}

.ivlyrics-study-choice.correct {
  border-color: rgba(34, 197, 94, 0.62);
  background: rgba(34, 197, 94, 0.12);
}

.ivlyrics-study-choice.wrong {
  border-color: rgba(248, 113, 113, 0.62);
  background: rgba(248, 113, 113, 0.12);
}

.ivlyrics-study-quiz-explanation {
  margin-top: 6px !important;
  color: rgba(248, 250, 252, 0.68) !important;
}

.ivlyrics-study-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.32);
}

.ivlyrics-study-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.16);
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: ivlyricsStudySpin 0.8s linear infinite;
}

@keyframes ivlyricsStudySpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
  .ivlyrics-study-panel {
    top: 64px;
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100% - 84px);
  }
}

.ivlyrics-study-panel {
  --lm-bg: #f4f6f8;
  --lm-surface: #ffffff;
  --lm-surface-2: #f2f4f6;
  --lm-border: #eaecf0;
  --lm-text-1: #191f28;
  --lm-text-2: #4e5968;
  --lm-text-3: #8b95a1;
  --lm-accent: #1c8cff;
  --lm-accent-soft: #e7f3ff;
  --lm-good: #2fb36d;
  --lm-good-soft: #e7f8ee;
  --lm-bad: #e34b3f;
  --lm-bad-soft: #fff0ed;
  --lm-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
  --lm-shadow-md: 0 8px 24px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04);
  position: fixed;
  inset: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: auto;
  max-height: none;
  z-index: 2147483000;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--lm-text-1);
  background: var(--lm-bg);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.ivlyrics-study-panel.theme-dark {
  --lm-bg: #101418;
  --lm-surface: #171d23;
  --lm-surface-2: #202832;
  --lm-border: #2e3844;
  --lm-text-1: #f4f7fb;
  --lm-text-2: #c5ced8;
  --lm-text-3: #8d98a6;
  --lm-accent: #74b9ff;
  --lm-accent-soft: #163a5c;
  --lm-good: #58cc02;
  --lm-good-soft: #173b1f;
  --lm-bad: #ff6b5f;
  --lm-bad-soft: #3f1d1d;
  --lm-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 1px rgba(0, 0, 0, 0.24);
  --lm-shadow-md: 0 18px 48px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ivlyrics-study-panel button,
.ivlyrics-study-panel input {
  font: inherit;
}

.ivlyrics-study-panel button {
  transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.ivlyrics-study-panel button:not(:disabled):active {
  transform: translateY(1px);
}

.ivlyrics-study-panel button:focus-visible,
.ivlyrics-study-panel input:focus-visible {
  outline: 2px solid var(--lm-accent);
  outline-offset: 2px;
}

.ivlyrics-study-header {
  align-items: center;
  gap: 18px;
  padding: 18px clamp(18px, 4vw, 48px);
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-bottom: 1px solid var(--lm-border);
}

.ivlyrics-study-eyebrow {
  color: var(--lm-accent);
  font-size: 12px;
  letter-spacing: 0;
}

.ivlyrics-study-title {
  color: var(--lm-text-1);
  font-size: clamp(22px, 3vw, 34px);
}

.ivlyrics-study-track {
  color: var(--lm-text-2);
  font-size: 13px;
}

.ivlyrics-study-theme-toggle,
.ivlyrics-study-close {
  width: 42px;
  height: 42px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
}

.ivlyrics-study-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: clamp(18px, 3vw, 36px);
  overflow: hidden;
  padding: clamp(18px, 3vw, 36px);
}

.ivlyrics-study-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ivlyrics-study-tabs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  border: 0;
}

.ivlyrics-study-tab {
  min-height: 54px;
  padding: 0 16px;
  border: 2px solid #d9e2d6;
  color: #374238;
  background: #ffffff;
  border-radius: 8px;
  font-weight: 800;
  text-align: left;
}

.ivlyrics-study-tab.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
  box-shadow: inset 0 -3px 0 rgba(88, 167, 0, 0.26);
}

.ivlyrics-study-rail-card,
.ivlyrics-study-card,
.ivlyrics-study-empty,
.ivlyrics-study-error,
.ivlyrics-study-note {
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
}

.ivlyrics-study-rail-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.ivlyrics-study-rail-card span {
  color: #667369;
  font-size: 12px;
  font-weight: 800;
}

.ivlyrics-study-rail-card strong {
  color: #58a700;
  font-size: 34px;
  line-height: 1;
}

.ivlyrics-study-rail-card p {
  margin: 0;
  color: #4d5a52;
  font-size: 13px;
  line-height: 1.45;
}

.ivlyrics-study-rail-progress {
  height: 7px;
  overflow: hidden;
  background: var(--lm-surface-2);
  border-radius: 999px;
}

.ivlyrics-study-rail-progress > div {
  height: 100%;
  background: var(--lm-accent);
  border-radius: inherit;
  transition: width 0.24s ease;
}

.ivlyrics-study-rail-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.ivlyrics-study-rail-stats > div {
  min-width: 0;
  padding: 8px;
  background: var(--lm-surface-2);
  border-radius: 8px;
}

.ivlyrics-study-rail-stats span,
.ivlyrics-study-rail-stats strong {
  display: block;
}

.ivlyrics-study-rail-stats span {
  color: var(--lm-text-3);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.ivlyrics-study-rail-stats strong {
  margin-top: 3px;
  color: var(--lm-text-1);
  font-size: 17px;
  line-height: 1;
}

.ivlyrics-study-difficulty {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.ivlyrics-study-difficulty-head {
  display: grid;
  gap: 3px;
}

.ivlyrics-study-difficulty-head span {
  color: var(--lm-text-1);
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-difficulty-head small {
  color: var(--lm-text-3);
  font-size: 12px;
  line-height: 1.4;
}

.ivlyrics-study-difficulty-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ivlyrics-study-difficulty-options button {
  min-height: 38px;
  padding: 0 10px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.ivlyrics-study-difficulty-options button.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
  box-shadow: inset 0 -2px 0 rgba(88, 167, 0, 0.22);
}

.ivlyrics-study-difficulty-options button:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.ivlyrics-study-difficulty-options.compact {
  display: flex;
  flex-wrap: wrap;
}

.ivlyrics-study-difficulty-options.compact button {
  min-height: 34px;
  padding: 0 12px;
}

.ivlyrics-study-quiz-tools {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px;
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 12px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-quiz-difficulty {
  display: grid;
  gap: 8px;
  min-width: min(460px, 100%);
}

.ivlyrics-study-quiz-difficulty > span {
  color: var(--lm-text-2);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-quiz-tools > .ivlyrics-study-secondary {
  width: auto;
  min-width: 150px;
}

.ivlyrics-study-stage {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 10px 14px 32px;
  scrollbar-gutter: stable;
}

.ivlyrics-study-section {
  width: min(920px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ivlyrics-study-card {
  padding: clamp(18px, 3vw, 28px);
}

.ivlyrics-study-current {
  border: 2px solid #58cc02;
  box-shadow: 0 12px 32px rgba(88, 204, 2, 0.14);
}

.ivlyrics-study-card h3 {
  margin: 0 0 14px;
  color: #172018;
  font-size: clamp(18px, 2.2vw, 26px);
  line-height: 1.25;
}

.ivlyrics-study-card p {
  color: #3f4b43;
  font-size: 15px;
  line-height: 1.65;
}

.ivlyrics-study-source-card {
  margin-bottom: 16px;
  padding: 16px;
  color: #172018;
  background: #f0f8ff;
  border: 1px solid #c8def4;
  border-radius: 8px;
}

.ivlyrics-study-source-card.compact {
  margin-bottom: 10px;
  padding: 12px;
}

.ivlyrics-study-source-card span {
  display: block;
  margin-bottom: 8px;
  color: #2870a8;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.ivlyrics-study-source-head span {
  margin-bottom: 0;
}

.ivlyrics-study-source-head .ivlyrics-study-lyric-play {
  flex: 0 0 auto;
}

.ivlyrics-study-source-card blockquote {
  margin: 0;
  color: #172018;
  font-size: clamp(18px, 2.5vw, 28px);
  line-height: 1.35;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.ivlyrics-study-source-card.compact blockquote {
  font-size: 18px;
}

.ivlyrics-study-source-inline {
  padding: 10px 12px;
  color: #315f87 !important;
  background: #eef7ff;
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.ivlyrics-study-reading-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ivlyrics-study-reading-row {
  min-width: min(240px, 100%);
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  color: #172018;
  background: #fff7df;
  border: 1px solid #f2d276;
  border-radius: 8px;
}

.ivlyrics-study-reading-row span {
  display: inline;
  flex: 0 0 auto;
  margin-bottom: 0;
  color: #8a6400;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-reading-row strong {
  min-width: 0;
  color: #172018;
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ivlyrics-study-translation {
  color: #172018 !important;
  font-size: 17px !important;
  font-weight: 850;
}

.ivlyrics-study-list {
  color: #4d5a52;
  font-size: 14px;
}

.ivlyrics-study-empty {
  width: min(720px, 100%);
  min-height: min(560px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  padding: clamp(28px, 5vw, 56px);
  color: #4d5a52;
}

.ivlyrics-study-empty p {
  max-width: 460px;
  color: #4d5a52;
  font-size: 16px;
  line-height: 1.55;
}

.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini {
  min-height: 44px;
  border: 0;
  color: #ffffff;
  background: #58cc02;
  border-radius: 8px;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18);
}

.ivlyrics-study-secondary {
  width: 100%;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
}

.ivlyrics-study-secondary:disabled,
.ivlyrics-study-primary:disabled {
  color: #7a857d;
  background: #e5ebef;
  border-color: #d5dde2;
  box-shadow: none;
  cursor: not-allowed;
}

.ivlyrics-study-mini {
  width: fit-content;
  min-height: 34px;
  padding: 0 14px;
  background: #1cb0f6;
}

.ivlyrics-study-mini.danger {
  color: #ffffff;
  background: #ff4b4b;
}

.ivlyrics-study-vocab-list {
  gap: 10px;
}

.ivlyrics-study-word-chip {
  border: 1px solid #c6d3c1;
  color: #1c4700;
  background: #eef8e8;
  border-radius: 8px;
}

.ivlyrics-study-word-chip.saved,
.ivlyrics-study-mini.saved {
  color: #0b7a35;
  background: var(--lm-good-soft);
  border-color: #b9ebc8;
}

.ivlyrics-study-word-chip.feedback,
.ivlyrics-study-mini.feedback {
  animation: ivlyricsStudySavedPulse 0.42s ease;
}

.ivlyrics-study-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ivlyrics-study-section-head h3 {
  margin-bottom: 4px;
}

.ivlyrics-study-section-head p {
  margin: 0;
  color: #667369;
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-study-section-head > span {
  min-width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-expression,
.ivlyrics-study-word {
  padding: 14px 0;
  border-top: 1px solid #e4ece1;
}

.ivlyrics-study-expression:first-of-type,
.ivlyrics-study-word:first-of-type {
  border-top: 0;
}

.ivlyrics-study-expression strong,
.ivlyrics-study-word strong {
  color: #172018;
  font-size: 16px;
}

.ivlyrics-study-expression span,
.ivlyrics-study-word span {
  color: #54615a;
  font-size: 13px;
}

.ivlyrics-study-expansion-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ivlyrics-study-expression-main {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start !important;
  gap: 12px !important;
}

.ivlyrics-study-expression-main > div {
  min-width: 0;
}

.ivlyrics-study-expression-main strong {
  display: block;
  overflow-wrap: anywhere;
}

.ivlyrics-study-expression-main span {
  display: block;
  margin-top: 4px;
  text-align: left;
}

.ivlyrics-study-expression-groups {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px !important;
}

.ivlyrics-study-expression-groups > div {
  min-width: 0;
  padding: 10px;
  background: #f6f9f4;
  border: 1px solid #e1ebdc;
  border-radius: 8px;
}

.ivlyrics-study-expression-groups span {
  display: block;
  margin-bottom: 7px;
  color: #58a700;
  font-size: 11px;
  font-weight: 900;
  text-align: left;
}

.ivlyrics-study-expression-groups div div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ivlyrics-study-expression-groups em {
  min-width: 0;
  padding: 4px 7px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.ivlyrics-study-score,
.ivlyrics-study-note {
  padding: 12px 14px;
  color: #4d5a52;
  font-size: 13px;
}

.ivlyrics-study-score {
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  font-weight: 900;
}

.ivlyrics-study-quiz {
  gap: 12px;
}

.ivlyrics-study-choice {
  min-height: 56px;
  padding: 13px 16px;
  border: 2px solid #d9e2d6;
  color: #172018;
  background: #ffffff;
  border-radius: 8px;
  font-weight: 800;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.08);
}

.ivlyrics-study-choice.selected {
  border-color: #1cb0f6;
  background: #ddf4ff;
}

.ivlyrics-study-choice.correct {
  border-color: #58cc02;
  background: #d7ffb8;
}

.ivlyrics-study-choice.wrong {
  border-color: #ff4b4b;
  background: #ffe7e7;
}

.ivlyrics-study-quiz-explanation {
  color: #4d5a52 !important;
  background: #f4f7f2;
  padding: 12px;
  border-radius: 8px;
}

.ivlyrics-study-error {
  width: min(920px, 100%);
  margin: 0 auto 16px;
  padding: 12px 14px;
  color: #8b1e1e;
  background: #ffe7e7;
  border-color: #ffc0c0;
}

.ivlyrics-study-loading-banner {
  width: min(920px, 100%);
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 8px;
  font-weight: 800;
}

.ivlyrics-study-loading-banner p {
  margin: 0;
  color: #1c4700;
  font-size: 13px;
  line-height: 1.4;
}

.ivlyrics-study-spinner {
  border-color: #d9e2d6;
  border-top-color: #58cc02;
}

.ivlyrics-study-quiz-stage {
  width: min(1120px, 100%);
}

.ivlyrics-study-quiz-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  color: #7b8790;
  font-size: 14px;
  font-weight: 800;
}

.ivlyrics-study-quiz-topline > div:first-child {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ivlyrics-study-quiz-badge {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 18px;
  color: #0875c9;
  background: #e3f2ff;
  border-radius: 999px;
  font-weight: 900;
}

.ivlyrics-study-quiz.quiz-type-blank {
  background: #fffdf7;
}

.ivlyrics-study-quiz.quiz-type-usage,
.ivlyrics-study-quiz.quiz-type-rewrite {
  background: #f7fbff;
}

.ivlyrics-study-quiz.quiz-type-grammar {
  background: #fffaf0;
}

.ivlyrics-study-quiz-score-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.ivlyrics-study-quiz-score-row span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-quiz-score-row .correct {
  color: #0b7a35;
  background: var(--lm-good-soft);
}

.ivlyrics-study-quiz-score-row .wrong {
  color: #8a120d;
  background: var(--lm-bad-soft);
}

.ivlyrics-study-quiz-progress {
  flex: 0 0 100%;
  height: 7px;
  overflow: hidden;
  background: var(--lm-surface-2);
  border-radius: 999px;
}

.ivlyrics-study-quiz-progress > div {
  height: 100%;
  background: var(--lm-accent);
  border-radius: inherit;
  transition: width 0.24s ease;
}

.ivlyrics-study-quiz {
  gap: 20px;
  padding: clamp(22px, 4vw, 40px);
  border: 0;
  box-shadow: 0 20px 60px rgba(31, 42, 55, 0.08);
}

.ivlyrics-study-quiz-prompt {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ivlyrics-study-quiz-prompt > p {
  margin: 0;
  color: #8a94a3;
  font-size: 18px;
  font-weight: 900;
}

.ivlyrics-study-blank-question {
  margin: 0;
  color: #18202c;
  font-size: clamp(28px, 4vw, 50px);
  line-height: 1.18;
  font-weight: 950;
  overflow-wrap: anywhere;
}

.ivlyrics-study-blank-question .blank {
  display: inline-flex;
  align-items: center;
  min-width: 3.2em;
  justify-content: center;
  margin: 0 0.12em;
  color: #0875c9;
  background: #e3f2ff;
  border-bottom: 5px solid #1cb0f6;
  border-radius: 8px 8px 4px 4px;
  line-height: 1.05;
}

.ivlyrics-study-quiz-prompt .ivlyrics-study-source-card {
  margin: 0;
  background: #f1f4f7;
  border-color: #e3e8ee;
}

.ivlyrics-study-quiz-prompt .ivlyrics-study-source-card blockquote {
  color: #18202c;
  font-size: clamp(28px, 4.5vw, 56px);
  line-height: 1.12;
}

.ivlyrics-study-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 18px;
}

.ivlyrics-study-choice {
  position: relative;
  min-height: 76px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border: 2px solid #e1e6ed;
  color: #18202c;
  background: #ffffff;
  border-radius: 14px;
  font-weight: 900;
  box-shadow: none;
}

.ivlyrics-study-choice:disabled {
  cursor: default;
}

.ivlyrics-study-choice strong {
  min-width: 0;
  color: inherit;
  font-size: clamp(16px, 1.8vw, 22px);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ivlyrics-study-choice-letter {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: #8a94a3;
  background: #f0f3f6;
  border-radius: 10px;
  font-weight: 900;
}

.ivlyrics-study-choice-mark {
  color: currentColor;
  font-size: 34px;
  line-height: 1;
}

.ivlyrics-study-choice.selected {
  border-color: #1cb0f6;
  background: #e6f5ff;
}

.ivlyrics-study-choice.correct {
  color: #0a5428;
  border-color: #2fb36d;
  background: #dbfbe7;
}

.ivlyrics-study-choice.correct .ivlyrics-study-choice-letter {
  color: #ffffff;
  background: #2fb36d;
}

.ivlyrics-study-choice.wrong {
  color: #8a120d;
  border-color: #e34b3f;
  background: #fff0ed;
}

.ivlyrics-study-choice.wrong .ivlyrics-study-choice-letter {
  color: #ffffff;
  background: #e34b3f;
}

.ivlyrics-study-quiz-explanation {
  margin: 0 !important;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid #cfe4f7;
  background: #e9f5ff;
}

.ivlyrics-study-quiz-explanation.correct {
  border-color: #b9ebc8;
  background: #e8faed;
}

.ivlyrics-study-quiz-explanation.wrong {
  border-color: #cfe4f7;
  background: #e9f5ff;
}

.ivlyrics-study-quiz-explanation strong {
  display: block;
  margin-bottom: 8px;
  color: #0875c9;
  font-size: 15px;
  font-weight: 900;
}

.ivlyrics-study-quiz-explanation.correct strong {
  color: #0b7a35;
}

.ivlyrics-study-quiz-explanation p {
  margin: 0;
  color: #18202c !important;
  font-size: 16px;
  line-height: 1.65;
}

.ivlyrics-study-quiz-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid #e4e9ef;
}

.ivlyrics-study-wrong-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-radius: 12px;
}

.ivlyrics-study-wrong-strip > span {
  color: var(--lm-text-3);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-wrong-strip button {
  max-width: 240px;
  padding: 7px 10px;
  color: #8a120d;
  background: #ffffff;
  border: 1px solid #f0d0ce;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ivlyrics-study-quiz-result {
  gap: 22px;
  padding: clamp(24px, 4vw, 42px);
}

.ivlyrics-study-result-hero {
  display: grid;
  gap: 8px;
  padding: clamp(18px, 3vw, 28px);
  color: #18310b;
  background: linear-gradient(180deg, #e8ffd7 0%, #f7fff1 100%);
  border: 1px solid #c8f2ad;
  border-radius: 18px;
}

.ivlyrics-study-result-kicker {
  color: #3f8f00;
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-result-hero strong {
  color: #18202c;
  font-size: clamp(54px, 9vw, 96px);
  line-height: 0.95;
  letter-spacing: 0;
}

.ivlyrics-study-result-hero p {
  max-width: 720px;
  margin: 0;
  color: #315315;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 900;
  line-height: 1.4;
}

.ivlyrics-study-result-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ivlyrics-study-result-stats > div {
  min-height: 86px;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: 16px;
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 14px;
}

.ivlyrics-study-result-stats span {
  color: var(--lm-text-3);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-result-stats strong {
  color: var(--lm-text-1);
  font-size: 26px;
  font-weight: 900;
}

.ivlyrics-study-review-list {
  display: grid;
  gap: 14px;
}

.ivlyrics-study-review-head {
  display: grid;
  gap: 4px;
}

.ivlyrics-study-review-head h3,
.ivlyrics-study-review-head p {
  margin: 0;
}

.ivlyrics-study-review-head p {
  color: var(--lm-text-2);
  font-size: 14px;
  font-weight: 700;
}

.ivlyrics-study-review-item {
  display: grid;
  gap: 12px;
  padding: 18px;
  background: #fff8f7;
  border: 1px solid #f3d2ce;
  border-radius: 16px;
}

.ivlyrics-study-review-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #f0d0ce;
  border-radius: 12px;
}

.ivlyrics-study-review-source blockquote {
  margin: 0;
  color: #18202c;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.35;
}

.ivlyrics-study-review-question {
  margin: 0;
  color: var(--lm-text-1);
  font-size: 16px;
  font-weight: 900;
  line-height: 1.45;
}

.ivlyrics-study-review-answers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ivlyrics-study-review-answers span {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ivlyrics-study-review-answers .wrong {
  color: #8a120d;
  background: #ffe9e6;
  border: 1px solid #f3c3bd;
}

.ivlyrics-study-review-answers .correct {
  color: #0a5428;
  background: #e8faed;
  border: 1px solid #b9ebc8;
}

.ivlyrics-study-review-explanation {
  margin: 0;
  color: var(--lm-text-2);
  font-size: 15px;
  line-height: 1.6;
}

.ivlyrics-study-no-wrong {
  padding: 18px;
  color: #0a5428;
  background: #e8faed;
  border: 1px solid #b9ebc8;
  border-radius: 16px;
  font-weight: 900;
}

.ivlyrics-study-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 18px;
  border-top: 1px solid var(--lm-border);
}

.ivlyrics-study-primary.dark {
  min-width: 160px;
  color: #ffffff;
  background: #18202c;
}

.ivlyrics-study-secondary.subtle {
  width: auto;
  min-width: 130px;
  color: #65717e;
  background: #f0f3f6;
  border-color: #f0f3f6;
  box-shadow: none;
}

.ivlyrics-study-wordbook {
  width: min(1040px, 100%);
}

.ivlyrics-study-history {
  width: min(1040px, 100%);
}

.ivlyrics-study-wordbook-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
}

.ivlyrics-study-wordbook-hero span {
  color: #58a700;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-wordbook-hero h3 {
  margin: 4px 0 0;
  color: #172018;
  font-size: 24px;
  line-height: 1.2;
}

.ivlyrics-study-wordbook-hero strong {
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 15px;
}

.ivlyrics-study-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ivlyrics-study-history-card {
  min-width: 0;
}

.ivlyrics-study-history-card button {
  width: 100%;
  min-height: 128px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-history-card.active button {
  border-color: #58cc02;
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.16), var(--lm-shadow-sm);
}

.ivlyrics-study-history-card strong {
  display: block;
  color: #172018;
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ivlyrics-study-history-card span {
  display: block;
  margin-top: 6px;
  color: #4d5a52;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ivlyrics-study-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ivlyrics-study-history-meta em {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.ivlyrics-study-history-meta em.current {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #9de16b;
}

.ivlyrics-study-word-tools {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.ivlyrics-study-word-search {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  color: var(--lm-text-3);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 12px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-search span {
  font-size: 18px;
  line-height: 1;
}

.ivlyrics-study-word-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--lm-text-1);
  background: transparent;
}

.ivlyrics-study-word-search input::placeholder {
  color: var(--lm-text-3);
}

.ivlyrics-study-word-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ivlyrics-study-word-stat-row span {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-scope {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ivlyrics-study-word-scope button {
  min-height: 34px;
  padding: 0 12px;
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.ivlyrics-study-word-scope button.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
}

.ivlyrics-study-word-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ivlyrics-study-word-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
}

.ivlyrics-study-word-head strong {
  display: block;
  color: #172018;
  font-size: 22px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-head span {
  display: block;
  margin-top: 6px;
  color: #4d5a52;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-head em {
  display: block;
  margin-top: 8px;
  color: var(--lm-accent);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-remove {
  width: 34px;
  height: 34px;
  border: 0;
  display: grid;
  place-items: center;
  color: #9aa4ad;
  background: #f0f3f6;
  border-radius: 8px;
  font: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.ivlyrics-study-word-remove:hover {
  color: #8a120d;
  background: #fff0ed;
}

.ivlyrics-study-word-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ivlyrics-study-word-actions button {
  min-height: 32px;
  padding: 0 10px;
  color: var(--lm-accent);
  background: var(--lm-accent-soft);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-word-actions .ivlyrics-study-lyric-play {
  color: #0b3b72;
  background: #e7f3ff;
  border: 1px solid #60a5fa;
  border-radius: 6px;
}

.ivlyrics-study-word-source,
.ivlyrics-study-word-note {
  margin: 0;
  color: #4d5a52;
  font-size: 14px;
  line-height: 1.6;
}

.ivlyrics-study-word-source {
  padding: 12px;
  color: #315f87;
  background: #eef7ff;
  border-radius: 8px;
}

.ivlyrics-study-word-grammar {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  color: #6b4e00;
  background: #fff7df;
  border: 1px solid #f2d276;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note strong {
  color: #6b4e00;
}

.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note p,
.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note small {
  color: #6b5a24;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note strong {
  color: #172018;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note p {
  color: #4d5a52;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note small {
  color: #667369;
}

.ivlyrics-study-grammar-card {
  background: #fffdf7;
  border-color: #f2d276;
}

.ivlyrics-study-grammar-lessons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ivlyrics-study-grammar-lesson {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #efe3bd;
  border-radius: 8px;
}

.ivlyrics-study-grammar-index {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #6b4e00;
  background: #fff2bf;
  border: 1px solid #f2d276;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 950;
}

.ivlyrics-study-grammar-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ivlyrics-study-grammar-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note strong {
  color: #6b4e00;
  font-size: 14px;
}

.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note p,
.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note small {
  color: #4d5a52;
}

.ivlyrics-study-grammar-lesson blockquote {
  margin: 0;
  padding: 10px 12px;
  color: #315f87;
  background: #eaf4ff;
  border-left: 3px solid #7fb4ff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-grammar-translation {
  color: #172018 !important;
  font-weight: 800;
}

.ivlyrics-study-grammar-context {
  color: #4d5a52 !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-header,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-empty,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-error,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-note,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-card {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-body {
  background: var(--lm-bg);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-card h3,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-head strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero h3,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note strong {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-head span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-section-head p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-note,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note small {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-tab {
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-tab.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
  box-shadow: inset 0 -3px 0 rgba(88, 204, 2, 0.28);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-secondary,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-theme-toggle,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-close,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-loading-banner,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-remove {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-loading-banner p {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero strong {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-difficulty-options button {
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-difficulty-options button.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card button {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card.active button {
  border-color: #58cc02;
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.16), var(--lm-shadow-sm);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card strong {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card span {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-meta em {
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-meta em.current {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-inline,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz-prompt .ivlyrics-study-source-card {
  color: var(--lm-text-1) !important;
  background: #162536;
  border-color: #274362;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source {
  color: #dbeafe !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card span {
  color: #93c5fd;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card blockquote,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz-prompt .ivlyrics-study-source-card blockquote {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar {
  color: #fde68a;
  background: #30270d;
  border-color: #5f4b15;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note strong {
  color: #fde68a;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note small {
  color: #fff3c4;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-blank,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-grammar {
  background: #1f1c13;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-usage,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-rewrite {
  background: #162536;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-blank-question {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-blank-question .blank {
  color: #dbeafe;
  background: #164b7f;
  border-bottom-color: #60a5fa;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice.correct {
  color: #dfffe8;
  background: #173b1f;
  border-color: #2fb36d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice.wrong {
  color: #ffe4e0;
  background: #3f1d1d;
  border-color: #ff6b5f;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero {
  color: var(--lm-text-1);
  background: #173b1f;
  border-color: #2f6b24;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero p {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-kicker {
  color: #d9f99d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats > div,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-source {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-head p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-explanation {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-source blockquote,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-question {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-item {
  color: var(--lm-text-1);
  background: #231718;
  border-color: #5b2b2b;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-answers .wrong {
  color: #fecaca;
  background: #3f1d1d;
  border-color: #7f312d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-answers .correct,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-no-wrong {
  color: #dfffe8;
  background: #173b1f;
  border-color: #2fb36d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-search,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-stat-row span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-scope button,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-stats > div {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-scope button.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-section-head > span {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression {
  border-top-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups > div {
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups span {
  color: #a3e635;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups em {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-card {
  background: #1f1c13;
  border-color: #4f4116;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson {
  color: var(--lm-text-1);
  background: #171d23;
  border-color: #4f4116;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-index {
  color: #fde68a;
  background: #30270d;
  border-color: #5f4b15;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note strong {
  color: #fde68a;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note small {
  color: #e8dcc4;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson blockquote {
  color: #dbeafe;
  background: #162536;
  border-left-color: #60a5fa;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-translation {
  color: var(--lm-text-1) !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-context {
  color: var(--lm-text-2) !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-lyric-play,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-actions .ivlyrics-study-lyric-play {
  color: #dbeafe;
  background: #164b7f;
  border-color: #3b82f6;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-lyric-play:hover {
  color: #ffffff;
  background: #1d5f9f;
}

@keyframes ivlyricsStudySavedPulse {
  0% { transform: scale(1); }
  45% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@media (max-width: 860px) {
  .ivlyrics-study-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .ivlyrics-study-rail {
    gap: 10px;
  }

  .ivlyrics-study-tabs {
    flex-direction: row;
    overflow-x: auto;
  }

  .ivlyrics-study-tab {
    min-width: 128px;
  }

  .ivlyrics-study-rail-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
  }

  .ivlyrics-study-rail-card strong {
    font-size: 24px;
  }

  .ivlyrics-study-rail-card .ivlyrics-study-secondary {
    width: auto;
  }

  .ivlyrics-study-rail-card .ivlyrics-study-difficulty,
  .ivlyrics-study-rail-card .ivlyrics-study-rail-stats {
    grid-column: 1 / -1;
  }

  .ivlyrics-study-choice-grid,
  .ivlyrics-study-result-stats,
  .ivlyrics-study-review-answers,
  .ivlyrics-study-word-grid,
  .ivlyrics-study-history-grid {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-word-tools {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-word-stat-row {
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .ivlyrics-study-header {
    padding: 14px 16px;
  }

  .ivlyrics-study-body {
    padding: 14px;
  }

  .ivlyrics-study-rail-card {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-result-actions {
    justify-content: stretch;
  }

  .ivlyrics-study-result-actions button {
    width: 100%;
  }
}
`;
        document.head.appendChild(style);
    };

    injectStyles();

    window.IvLyricsLearningMode = {
        StudyButton,
        StudyPanel,
        open,
        close
    };

    state.initialized = true;
})();
