import { buildLrcRedTimingSnapshot, LRC_RED_WORD_SYNC_SOURCE, mergeLyricsTiming } from "../../lyrics/lyricsTimingMerge.mjs";
import { updatePageLyricsSource } from "../../lyrics/pageLyricsSourceCache.mjs";
import { hasCompatibleLrcRedTimingSource, retainLrcRedWordTiming } from "./lrcRedWordTiming.mjs";

export function createLrcRedTimingDelivery({
    isEnabled, isKaraokeEnabled, isCurrentPlayback, getPage, getService, getPageCache, isPseudoSource, getCacheId, wait,
}) {
    const hasRealKaraoke = result => result?.karaoke?.length && !isPseudoSource(result.karaokeSource);
    const adoptTiming = (result, upgrade) => retainLrcRedWordTiming(result, upgrade, value => isPseudoSource(value.karaokeSource));
    const canDisplay = uri => isEnabled() && isKaraokeEnabled() && isCurrentPlayback(uri);

    const getCurrentPage = (uri) => {
        const page = getPage();
        return page?._isComponentMounted !== false && page?.state?.uri === uri && isCurrentPlayback(uri) ? page : null;
    };

    function rememberUpgrade(info, upgrade, updateDisplay) {
        const service = getService();
        const providerRevision = service?.getLyricsRequestRevision?.(info.uri);
        updatePageLyricsSource(getPageCache(), info.uri, providerRevision, cached => adoptTiming(cached, upgrade));
        const snapshot = service?.getLyricsSnapshot?.(info.uri);
        if (!service?.publishLyricsSnapshot) return false;
        const rawResult = adoptTiming(snapshot?.rawResult, upgrade);
        const rawUpgrade = rawResult !== snapshot?.rawResult;
        const awaitingDisplay = snapshot?.source === LRC_RED_WORD_SYNC_SOURCE && !snapshot.timingUpgradeApplied
            && snapshot.rawResult?.karaoke === upgrade.karaoke;
        if (!rawUpgrade && !awaitingDisplay) return false;

        const displayLyrics = updateDisplay && (!snapshot.provider || snapshot.provider === upgrade.provider)
            ? mergeLyricsTiming(snapshot.displayLyrics, upgrade.karaoke)
            : null;
        if (!rawUpgrade && !displayLyrics) return false;
        service.publishLyricsSnapshot(buildLrcRedTimingSnapshot(snapshot, info.uri, rawResult, displayLyrics, 'karaoke'));
        return !!displayLyrics;
    }

    async function applyToPage(info, upgrade, isCurrent) {
        for (let attempts = 0; ; attempts++) {
            if (!isCurrent() || !canDisplay(info.uri)) return false;
            const page = getCurrentPage(info.uri);
            if (!page) return rememberUpgrade(info, upgrade, true);
            const { state } = page;
            if (state.isLoading) {
                if (attempts >= 200) throw new Error('Timed out waiting to apply word sync');
                await wait(100);
                continue;
            }
            if (!hasCompatibleLrcRedTimingSource(state, upgrade)) return false;
            if (hasRealKaraoke(state)) return true;
            if (typeof page.applyLyricsTimingUpgrade === 'function') {
                const applied = await page.applyLyricsTimingUpgrade(upgrade, isCurrent);
                if (!isCurrent()) return false;
                if (applied !== false) return true;
                if (canDisplay(info.uri) && !getCurrentPage(info.uri)) return rememberUpgrade(info, upgrade, true);
            }
            throw new Error('Could not apply word sync to the current lyrics');
        }
    }

    return async function deliverUpgrade(info, upgrade, isCurrent) {
        if (!isCurrent()) return false;
        const service = getService();
        const cacheId = getCacheId(info);
        if (cacheId) {
            await service?.updateCachedLyrics?.(cacheId, 'lrcred', cached => {
                if (!isCurrent()) return null;
                if (!cached) return upgrade;
                const updated = adoptTiming(cached, upgrade);
                return updated !== cached ? updated : null;
            });
        }
        if (!isCurrent()) return false;
        if (!canDisplay(info.uri)) return rememberUpgrade(info, upgrade, false);
        if (!getCurrentPage(info.uri)) return rememberUpgrade(info, upgrade, true);
        rememberUpgrade(info, upgrade, false);
        return applyToPage(info, upgrade, isCurrent);
    };
}
