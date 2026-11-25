import { throwIfAiRequestAborted } from "../providers/ai/aiRequestCancellation.mjs";

export function createLyricsResearch({ cache, getAIManager, getSpotifyLocale, debug }) {
    return async function getResearch(info) {
        const { trackId, lang, ignoreCache, signal } = info;
        if (!trackId) return null;
        throwIfAiRequestAborted(signal);

        const userLang = lang || getSpotifyLocale()?.split('-')[0] || 'en';
        const schema = getAIManager()?.RESEARCH_CACHE_VERSION || 'research-v7';
        const cacheLang = `${userLang}:${schema}`;
        const revision = cache.getRevision?.(trackId);
        const isCurrent = () => !signal?.aborted && cache.getRevision?.(trackId) === revision;

        try {
            // 1. 로컬 캐시 확인 (ignoreCache가 true면 스킵)
            if (!ignoreCache) {
                const cached = await cache.getTMI(trackId, cacheLang);
                if (isCurrent() && cached) {
                    debug(`[LyricsService] getResearch: Using cached data for ${trackId}`);
                    const aiManager = getAIManager();
                    return aiManager?.normalizeResearchResult
                        ? aiManager.normalizeResearchResult(cached, info)
                        : cached;
                }
            }

            // 2. Addon_AI 요청
            const aiManager = getAIManager();
            if (aiManager && isCurrent()) {
                debug(`[LyricsService] getResearch: Requesting from AIAddonManager${ignoreCache ? ' (ignoring cache)' : ''}`);
                const result = await aiManager.generateResearch({
                    ...info,
                    trackId,
                    lang: userLang
                });
                throwIfAiRequestAborted(signal);

                if (result) {
                    // 캐시 저장
                    if (isCurrent()) await cache.setTMI(trackId, cacheLang, result, isCurrent);
                    throwIfAiRequestAborted(signal);
                    return result;
                }
            }
        } catch (e) {
            if (signal?.aborted) throwIfAiRequestAborted(signal);
            console.warn('[LyricsService] getResearch failed:', e);
            throw e;
        }
        return null;
    };
}
