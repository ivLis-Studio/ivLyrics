import { mergeFullLyricsSupplementResults } from "./fullLyricsSupplementResults.mjs";
import { getLyricLanguageMode, readLyricDisplayModes, resolveLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";
import { buildLyricTranslationRequests } from "./lyricTranslationVocals.mjs";
import { getActiveLyricSupplementSlots, loadLyricSupplementSlots } from "./loadLyricSupplementSlots.mjs";
import { LRC_RED_WORD_SYNC_SOURCE, mergeLyricsTiming } from "./lyricsTimingMerge.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";
import { isKaraokePlaybackEnabled, selectPlaybackLyrics } from "./selectPlaybackLyrics.mjs";

export function createFullLyricsRequest({
    getProviderGeneration, isPlaybackCurrent, detectLanguage, readSetting, isSectionHeader,
    getTranslationTargetLanguage, getPronunciationNotation, getTranslationCacheId,
    getTranslationStyle = () => "natural",
    readSavedLocalLyrics,
    translationModes, getTranslator, isPronunciationSyncRequested, sendLyricsToConsumers,
    debug, reportWarning, reportError,
}) {
    return async function requestFullLyrics(service, info, options = {}) {
        const {
            displayMode1 = null,
            displayMode2 = null,
            sendToOverlay = true,
            skipTranslation = false
        } = options;

        const requestGeneration = getProviderGeneration(info?.uri);
        const initialSnapshot = service.getLyricsSnapshot(info?.uri);
        const initialSnapshotRevision = initialSnapshot?.revision || 0;
        let acceptedSnapshot = initialSnapshot;
        const translationTargetLanguage = getTranslationTargetLanguage();
        const trackId = getTranslationCacheId(info?.uri);
        const readTranslationRevision = () => getTranslator()?.getCacheRevision?.(trackId);
        const translationRevision = readTranslationRevision();
        const pronunciationNotation = getPronunciationNotation();
        const translationStyle = getTranslationStyle();
        let presentationSettingsCurrent = () => true;
        const staleResult = () => ({ lyrics: [], provider: null, error: null, stale: true });
        const followsTimingUpgrade = (current, revision) => current?.source === LRC_RED_WORD_SYNC_SOURCE
            && current.timingUpgradeFromRevision === revision;
        const completesTimingUpgrade = (current, previous) => previous?.source === LRC_RED_WORD_SYNC_SOURCE
            && previous.timingUpgradeApplied === false && current?.timingUpgradeApplied === true
            && followsTimingUpgrade(current, previous.timingUpgradeFromRevision)
            && current.rawResult?.karaoke === previous.rawResult?.karaoke;
        const isCurrentRequest = () => {
            const current = service.getLyricsSnapshot(info?.uri);
            // Timing updates from the accepted source leave the text request valid.
            if (acceptedSnapshot && ((followsTimingUpgrade(current, acceptedSnapshot.revision)
                && retainLrcRedWordTiming(acceptedSnapshot.rawResult, current.rawResult) !== acceptedSnapshot.rawResult)
                || completesTimingUpgrade(current, acceptedSnapshot))) acceptedSnapshot = current;
            return requestGeneration === getProviderGeneration(info?.uri)
                && isPlaybackCurrent(info?.uri)
                && current === acceptedSnapshot
                && getTranslationTargetLanguage() === translationTargetLanguage
                && getPronunciationNotation() === pronunciationNotation
                && getTranslationStyle() === translationStyle
                && readTranslationRevision() === translationRevision
                && presentationSettingsCurrent();
        };

        try {
            if (!isCurrentRequest()) return staleResult();
            const trackInfo = { uri: info.uri, title: info.title, artist: info.artist };
            const sendEmptyLyrics = async (provider, error) => {
                await sendLyricsToConsumers({ trackInfo, lyrics: [], sendToOverlay, forceResend: true });
                return isCurrentRequest() ? { lyrics: [], provider, error } : staleResult();
            };
            const localLyrics = readSavedLocalLyrics ? await readSavedLocalLyrics(info) : null;
            if (!isCurrentRequest()) return staleResult();
            const providerOverride = !localLyrics && service.getTrackLyricsProviderOverride
                ? await service.getTrackLyricsProviderOverride(info.uri) : null;
            if (!isCurrentRequest()) return staleResult();
            const rawResult = localLyrics || await service.getLyricsFromProviders(info, [], 1, providerOverride);
            const providerSnapshot = service.getLyricsSnapshot(info?.uri);
            // This request may publish one raw result. A page, panel or other
            // fallback presentation published during the await must win.
            if ((providerSnapshot?.revision === initialSnapshotRevision + 1
                && providerSnapshot.source === 'lyrics-service'
                && providerSnapshot.rawResult === rawResult)
                || (followsTimingUpgrade(providerSnapshot, initialSnapshotRevision + 1)
                    && retainLrcRedWordTiming(rawResult, providerSnapshot.rawResult) !== rawResult)) {
                acceptedSnapshot = providerSnapshot;
            }
            if (!isCurrentRequest()) return staleResult();

            if (!rawResult || rawResult.error || (rawResult.uri && rawResult.uri !== info.uri)) {
                return await sendEmptyLyrics(null, rawResult?.error || 'No lyrics found');
            }

            const trackLanguageOverride = info.languageOverride || await service.getTrackLanguageOverride?.(info.uri);
            if (!isCurrentRequest()) return staleResult();
            // A word-sync response can arrive while the language override is read.
            const lyricsResult = retainLrcRedWordTiming(rawResult, acceptedSnapshot?.rawResult);
            const provider = lyricsResult.provider;
            const readVisual = (key) => readSetting(`ivLyrics:visual:${key}`);
            const readKaraokeEnabled = () => isKaraokePlaybackEnabled(readVisual("karaoke-mode-enabled"));
            const karaokeEnabled = readKaraokeEnabled();
            const { lyrics: selected, lyricsType } = selectPlaybackLyrics(lyricsResult, karaokeEnabled);
            let lyrics = selected;

            if (lyrics.length === 0) {
                return await sendEmptyLyrics(provider, 'No lyrics');
            }

            // 3. endTime 계산 (없으면 다음 라인의 startTime 사용)
            lyrics = lyrics.map((line, idx, arr) => {
                if (!line.endTime && idx < arr.length - 1) {
                    return { ...line, endTime: arr[idx + 1].startTime };
                }
                return line;
            });

            const configuredLanguage = readVisual("translate:detect-language-override");
            const detectedLanguage = resolveLyricSourceLanguage(
                trackLanguageOverride, configuredLanguage, () => detectLanguage(lyrics)
            );
            const modeKey = getLyricLanguageMode(detectedLanguage);
            const readModes = () => {
                const [storedMode1, storedMode2] = readLyricDisplayModes(modeKey, readVisual);
                return [displayMode1 ?? (storedMode1 || "none"), displayMode2 ?? (storedMode2 || "none")];
            };
            const [mode1, mode2] = readModes();
            presentationSettingsCurrent = () => {
                const [nextMode1, nextMode2] = readModes();
                return mode1 === nextMode1 && mode2 === nextMode2
                    && karaokeEnabled === readKaraokeEnabled()
                    && (trackLanguageOverride || readVisual("translate:detect-language-override") === configuredLanguage);
            };

            debug('[LyricsService] 언어 감지:', { detectedLanguage, modeKey, mode1, mode2 });

            const activeSlots = getActiveLyricSupplementSlots([mode1, mode2], translationModes);
            const translationRequests = buildLyricTranslationRequests(lyrics, { isSectionHeader });
            const translationConfigured = activeSlots.length > 0 && translationRequests.length > 0;
            const needsTranslation = translationConfigured && !skipTranslation;
            const overlayTranslationSourceText = translationRequests.map(request => request.text).join('\n');
            const overlayPresentationContext = {
                provider,
                lyricsType,
                karaokeSource: lyricsType === 'karaoke' ? lyricsResult.karaokeSource || null : null,
                displayMode1: mode1,
                displayMode2: mode2,
                detectedLanguage: detectedLanguage || 'auto',
                pronunciationNotation,
                translationTargetLanguage,
                translationStyle,
                translationSourceText: overlayTranslationSourceText,
                presentationComplete: false
            };

            const publishPresentation = (lines, context) => {
                acceptedSnapshot = service.publishLyricsSnapshot({
                    trackUri: info.uri,
                    trackInfo,
                    ...(localLyrics ? { rawResult: localLyrics, trackLyricsProviderOverride: null } : {}),
                    displayLyrics: lines,
                    ...context,
                    detectedLanguage,
                    source: skipTranslation
                        ? 'lyrics-service-original-fallback'
                        : 'lyrics-service-presentation'
                });
            };

            // 번역을 기다리는 동안 오버레이가 비어 있지 않도록 원문 가사를 먼저 전송
            if (needsTranslation) {
                // Timing delivery and reconnects both read the shared snapshot.
                publishPresentation(lyrics, overlayPresentationContext);
                if (!isCurrentRequest()) return staleResult();
                // 원문 선전송 결과는 번역 작업을 막지 않는다.
                void sendLyricsToConsumers({
                    trackInfo,
                    lyrics,
                    sendToOverlay,
                    sendReason: 'translation-pending',
                    presentationContext: overlayPresentationContext
                });
            }

            let successfulSlots = [];
            if (needsTranslation) {
                debug('[LyricsService] 발음/번역 요청:', { mode1, mode2 });
                successfulSlots = await loadLyricSupplementSlots({
                    info, lyrics, karaokeSource: lyricsResult.karaokeSource, translationRequests,
                    provider, detectedLanguage, pronunciationNotation, activeSlots, isCurrentRequest, translationModes,
                    getTranslator, getTranslationCacheId, isPronunciationSyncRequested,
                    reportWarning: (mode, error) => reportWarning(`[LyricsService] ${mode} 처리 실패:`, error),
                });
                if (!isCurrentRequest()) return staleResult();
                if (successfulSlots.length) {
                    lyrics = mergeFullLyricsSupplementResults(lyrics, translationRequests, successfulSlots);
                    debug('[LyricsService] 발음/번역 완료:', {
                        successful: successfulSlots.length,
                        requested: activeSlots.length,
                    });
                }
            }

            const presentationComplete = !translationConfigured
                || (needsTranslation && successfulSlots.length === activeSlots.length);
            const sendReason = presentationComplete
                ? 'translation-complete'
                : 'translation-pending';
            const finalPresentationContext = {
                ...overlayPresentationContext,
                presentationComplete
            };

            if (!isCurrentRequest()) return staleResult();
            const timing = retainLrcRedWordTiming(lyricsResult, acceptedSnapshot?.rawResult);
            const upgraded = karaokeEnabled && timing !== lyricsResult && mergeLyricsTiming(lyrics, timing.karaoke);
            if (upgraded) {
                lyrics = upgraded;
                finalPresentationContext.lyricsType = 'karaoke';
                finalPresentationContext.karaokeSource = timing.karaokeSource;
            }
            publishPresentation(lyrics, finalPresentationContext);
            if (!isCurrentRequest()) return staleResult();

            await sendLyricsToConsumers({
                trackInfo,
                lyrics,
                sendToOverlay,
                forceResend: true,
                sendReason,
                presentationContext: finalPresentationContext
            });

            if (!isCurrentRequest()) return staleResult();
            service.emit('lyrics-loaded', {
                trackInfo: info,
                lyrics,
                provider,
                contributors: lyricsResult.contributors || [],
                hasTranslation: needsTranslation
            });

            return { lyrics, provider, contributors: lyricsResult.contributors || [], error: null };
        } catch (e) {
            if (!isCurrentRequest()) return staleResult();
            reportError('[LyricsService] getFullLyrics 실패:', e);
            return { lyrics: [], provider: null, error: e.message };
        }
    };
}
