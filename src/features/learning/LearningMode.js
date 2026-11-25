import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { getPlaybackPositionService } from "../../core/playbackPositionService.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { publishLearningMode } from "./learningModeRuntime.mjs";
import { createStudyGeneration } from "./studyGeneration.mjs";
import { normalizeStudyDifficulty } from "./studyIdentity.mjs";
import { normalizeQuizType } from "./studyPack.mjs";
import { createStudyRepository } from "./studyRepository.mjs";
import { injectLearningModeStyles } from "./studyStyles.mjs";
import { createStudyNavigation } from "./studyNavigation.mjs";
import { createStudyPlayback } from "./studyPlayback.mjs";
import { createStudyButton, createStudyComponents } from "./studyComponents.mjs";
import { createStudyPanel } from "./createStudyPanel.mjs";

// AI Learning Mode for ivLyrics
// 가사를 기반으로 라인별 언어 학습, 퀴즈, 단어장을 제공하는 페이지 전용 subfile입니다.
export function initializeLearningMode({ host, document, ToolbarIcon, readTooltip }) {

    const MODULE_KEY = "__ivLyricsLearningModeModule";
    if (host[MODULE_KEY]?.initialized) {
        return;
    }

    const react = host.Spicetify?.React || host.react || host.React;
    if (!react) {
        console.warn("[LearningMode] React is not available.");
        return;
    }
    const { useEffect, useState } = react;
    const readService = (name) => getRuntimeService(name, host);
    const readAIManager = () => readService("AIAddonManager");
    const readToast = () => readService("Toast");
    const readPlayer = () => host.Spicetify?.Player;

    const THEME_STORAGE_KEY = "ivLyrics:learningMode:theme";
    const DIFFICULTY_STORAGE_KEY = "ivLyrics:learningMode:difficulty";
    const getStudyStorage = () => readSettingsPersistence(host) ?? host.localStorage;
    const getStoredValue = (key) => getStudyStorage().getItem(key);
    const setStoredValue = (key, value) => getStudyStorage().setItem(key, value);
    const QUIZ_TYPES = {
        meaning: { key: "quizTypeMeaning", fallback: "뜻 맞히기" },
        blank: { key: "quizTypeBlank", fallback: "빈칸 채우기" },
        usage: { key: "quizTypeUsage", fallback: "상황 활용" },
        rewrite: { key: "quizTypeRewrite", fallback: "문장 바꾸기" },
        grammar: { key: "quizTypeGrammar", fallback: "문법 선택" }
    };
    const STUDY_DIFFICULTY_LABELS = {
        easy: "Easy",
        normal: "Normal",
        hard: "Hard",
        native: "Native-level"
    };

    const state = host[MODULE_KEY] || (host[MODULE_KEY] = {
        initialized: false,
        open: false,
        listeners: new Set(),
        generationListeners: new Set(),
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
            return readService("I18n")?.t?.(`learningMode.${key}`) || fallback;
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
            if (host.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return "dark";
        } catch (error) { }
        return "light";
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

    const getQuizTypeLabel = (type) => {
        const config = QUIZ_TYPES[normalizeQuizType(type)] || QUIZ_TYPES.meaning;
        return t(config.key, config.fallback);
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

    const getTargetLanguage = () => {
        const configured = readService("CONFIG")?.visual?.["translate:target-language"]
            || host.localStorage.getItem("ivLyrics:visual:translate:target-language");
        if (configured && configured !== "auto") return configured;
        return readService("I18n")?.getCurrentLanguage?.()
            || readService("CONFIG")?.visual?.language
            || host.Spicetify?.Locale?.getLocale?.()?.split("-")[0]
            || "ko";
    };

    const getSourceLanguage = (lines) => {
        try {
            return readService("Utils")?.detectLanguage?.(lines.map((line) => ({ text: line.text }))) || "auto";
        } catch (error) {
            return "auto";
        }
    };

    const getEnabledStudyProviderCount = () => {
        try {
            return readAIManager()?.getEnabledProvidersFor?.("lyricsStudy")?.length || 0;
        } catch (error) {
            return 0;
        }
    };

    const repository = createStudyRepository(() => host.indexedDB);
    const { startGenerationJob, startQuizGenerationJob } = createStudyGeneration({
        getGenerationSnapshot,
        setGenerationState,
        notifyGeneration,
        repository,
        requestStudy: (params) => readAIManager().generateLyricsStudy(params),
        detectSourceLanguage: getSourceLanguage,
        showSuccess: (key, fallback) => readToast()?.success?.(t(key, fallback)),
        t,
    });

    const playback = createStudyPlayback({
        host, isOpen: () => state.open, readPlayer, readToast, t,
        readPlaybackSnapshot: () => getPlaybackPositionService(host)?.getPlayerPlaybackSnapshot?.(),
    });
    const { enablePlaybackGuard, disablePlaybackGuard } = playback;
    const { open, close, toggle, subscribe, dismissForUnmount } = createStudyNavigation({
        state, document, requestAnimationFrame: (callback) => host.requestAnimationFrame(callback),
        enablePlaybackGuard, disablePlaybackGuard,
    });

    const useLearningOpenState = () => {
        const [isOpen, setIsOpen] = useState(state.open);
        useEffect(() => subscribe(setIsOpen), []);
        return isOpen;
    };

    const StudyButton = createStudyButton({ react, ToolbarIcon, readTooltip, t, open });
    const StudyPanel = createStudyPanel({
        react, host, navigation: { useLearningOpenState, dismissForUnmount, close },
        repository, playback, t, readAIManager, readToast, readPlayer,
        generation: { subscribeGeneration, getGenerationSnapshot, getEnabledStudyProviderCount, startGenerationJob, startQuizGenerationJob },
        settings: { THEME_STORAGE_KEY, DIFFICULTY_STORAGE_KEY, getInitialStudyTheme, getInitialStudyDifficulty,
            getTargetLanguage, getQuizTypeLabel, getStudyDifficultyLabel, setStoredValue },
        components: createStudyComponents(react, t),
    });

    injectLearningModeStyles(document);

    publishLearningMode(host, {
        StudyButton,
        StudyPanel,
        open,
        close,
        // Keep the legacy toggle/state API for add-ons; UI entry points use open().
        toggle,
        isOpen: () => !!state.open,
        subscribe
    });

    state.initialized = true;
}
