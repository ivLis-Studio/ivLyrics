const EMPTY_ANSWERS = Object.freeze({});
const EMPTY_PROGRESS = Object.freeze({ done: 0, total: 0 });
const EMPTY_SESSION = Object.freeze({ pack: null, answers: EMPTY_ANSWERS, quizStep: 0 });

export function observeStudySession({
    cacheKey, ownsSession, readStudySession, generation, updateSession, onCommitted, onReadError,
}) {
    let subscribed = true;
    const isCurrent = () => subscribed && ownsSession();
    const initial = generation.getGenerationSnapshot();
    let latestReadyPack = initial.cacheKey === cacheKey && initial.status === "ready" ? initial.pack : null;
    let committedDuringRead = false;

    const unsubscribe = generation.subscribeGeneration(snapshot => {
        if (!isCurrent() || snapshot.cacheKey !== cacheKey) return;
        if (snapshot.status === "ready" && snapshot.pack && snapshot.pack !== latestReadyPack) {
            latestReadyPack = snapshot.pack;
            committedDuringRead = true;
            updateSession(state => ({ ...state, ...EMPTY_SESSION, pack: snapshot.pack, generation: snapshot, loadError: "" }));
            onCommitted(snapshot.pack);
        } else if (snapshot.status === "loading" || (snapshot.status === "error" && snapshot !== initial)) {
            updateSession(state => ({ ...state, generation: snapshot }));
        }
    });

    void readStudySession(cacheKey).then(({ pack, answers }) => {
        // A committed generation is newer than an IndexedDB read that began
        // while it was still being built or replaced.
        if (!isCurrent() || committedDuringRead) return;
        const quiz = pack?.quiz || [];
        const quizStep = quiz.length && quiz.every((_, index) => answers[index]) ? quiz.length : 0;
        updateSession(state => ({ ...state, pack, answers, quizStep }));
    }, error => {
        if (isCurrent() && !committedDuringRead) onReadError(error);
    });

    return () => {
        subscribed = false;
        unsubscribe();
    };
}

export function createStudySessionHook({ react, repository, generation, t }) {
    const { useCallback, useEffect, useMemo, useState, useRef } = react;
    const useCommitEffect = react.useLayoutEffect || useEffect;
    const reportReadError = error => console.warn("[LearningMode] failed to load study session:", error);

    return function useStudySession({ isOpen, cacheKey, onCommitted }) {
        const [stored, setStored] = useState(null);
        const live = useRef(null);
        const pending = useRef(null);
        const scope = useMemo(() => ({ isOpen, cacheKey }), [isOpen, cacheKey]);
        const state = stored?.scope === scope ? stored : EMPTY_SESSION;
        const status = state.generation?.status || "idle";
        const loading = status === "loading";
        const pack = loading ? state.generation.pack || null : state.pack;
        const answers = loading ? EMPTY_ANSWERS : state.answers;
        const quizStep = loading ? 0 : Math.min(state.quizStep, pack?.quiz?.length || 0);

        useCommitEffect(() => {
            live.current = isOpen ? { scope, pack: loading ? null : pack } : null;
            return () => { live.current = null; };
        }, [scope, pack, loading]);

        const updateSession = useCallback((update) => {
            setStored(previous => ({ ...update(previous?.scope === scope ? previous : EMPTY_SESSION), scope }));
        }, [scope]);

        useEffect(() => {
            if (!isOpen || !cacheKey) return;
            return observeStudySession({
                cacheKey, generation, readStudySession: repository.readStudySession, updateSession, onCommitted,
                ownsSession: () => live.current?.scope === scope,
                onReadError(error) {
                    reportReadError(error);
                    updateSession(state => ({ ...state, loadError: t("loadFailed", "학습 데이터를 불러오지 못했습니다.") }));
                },
            });
        }, [scope, updateSession, onCommitted]);

        const setQuizStep = useCallback(step => updateSession(state => ({ ...state, quizStep: step })), [updateSession]);
        const persistQuizAnswers = useCallback(async (nextAnswers, afterSave) => {
            if (pack?.cacheKey !== cacheKey || !pack?.quiz) return;
            const ownsPack = () => live.current?.scope === scope && live.current.pack === pack;
            if (!ownsPack() || (pending.current?.scope === scope && pending.current.pack === pack)) return;
            const request = { scope, pack };
            pending.current = request;
            try {
                const committed = await repository.saveProgress({ pack, answers: nextAnswers });
                if (committed && pending.current === request && ownsPack()) {
                    updateSession(state => ({ ...state, answers: nextAnswers }));
                    afterSave();
                }
            } catch (error) {
                console.warn("[LearningMode] failed to save quiz progress:", error);
            } finally {
                if (pending.current === request) pending.current = null;
            }
        }, [cacheKey, pack, scope, updateSession]);

        return {
            pack, answers, quizStep, setQuizStep, persistQuizAnswers, status,
            error: state.generation?.error || state.loadError || "",
            loadingText: state.generation?.loadingText || "",
            generationProgress: state.generation?.progress || EMPTY_PROGRESS,
        };
    };
}
