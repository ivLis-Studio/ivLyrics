import {
  buildLrcRedTimingSnapshot, hasMatchingLyricsTimingSource, LRC_RED_WORD_SYNC_SOURCE, mergeLyricsTiming, readLyricsTimingSourceLines,
} from "./lyricsTimingMerge.mjs";
import { hasCompatibleLrcRedTimingSource, retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";
import { updatePageLyricsSource } from "./pageLyricsSourceCache.mjs";

const TIMING_UPGRADE = Symbol("lyrics timing upgrade");
const readSource = result => result.synced?.length ? result.synced : result.unsynced;

function publishTimingSnapshot(service, snapshot, uri, upgraded, pageLyrics, lyricsType) {
  if (!service?.publishLyricsSnapshot || (snapshot?.provider && snapshot.provider !== upgraded.provider)) return;
  const cached = snapshot?.rawResult;
  const sameTiming = cached?.karaoke === upgraded.karaoke;
  const rawResult = sameTiming ? cached : cached ? retainLrcRedWordTiming(cached, upgraded) : upgraded;
  if (rawResult.karaoke !== upgraded.karaoke) return;

  // A receiver may already have more complete supplements than the page.
  const displayLyrics = snapshot?.displayLyrics?.length
    ? mergeLyricsTiming(snapshot.displayLyrics, upgraded.karaoke)
    : pageLyrics;
  if (sameTiming && (!displayLyrics ||
    (snapshot.source === LRC_RED_WORD_SYNC_SOURCE && snapshot.timingUpgradeApplied))) return;

  service.publishLyricsSnapshot(buildLrcRedTimingSnapshot(snapshot, uri, rawResult, displayLyrics, lyricsType));
}

export function getCommittedLyricsTimingUpgrade(state) {
  const upgrade = state?.[TIMING_UPGRADE];
  return upgrade && state.uri === upgrade.uri && state.provider === upgrade.provider
    && state.lyricsRequestSeq === upgrade.requestSeq && state.karaoke === upgrade.karaoke
    && !state.syncDataApplied ? upgrade : null;
}

export function cancelPendingLyricsTimingUpgrade(page) {
  page._pendingTimingUpgradeResolve?.(false);
}

export function createPageLyricsTimingUpgrade({ cache, getLyricsService, getLyricsModeTypeKey }) {
  function mergeCurrentLyricsTiming(page, lyrics, uri, provider, state = page.state) {
    const upgrade = getCommittedLyricsTimingUpgrade(state);
    if (!Array.isArray(lyrics) || !upgrade || upgrade.uri !== uri || upgrade.provider !== provider) return lyrics;
    return mergeLyricsTiming(lyrics, upgrade.lines) || lyrics;
  }

  function applyLyricsTimingUpgrade(page, upgraded, ownsUpgrade = () => true) {
    const state = page.state;
    if (!ownsUpgrade() || !page.isCurrentLyricsState(state) || state.uri !== upgraded.uri || state.provider !== upgraded.provider
      || !upgraded.karaoke?.length || !hasCompatibleLrcRedTimingSource(state, upgraded)) return false;
    const source = readSource(state);
    const lines = readLyricsTimingSourceLines(upgraded.karaoke);
    if (!hasMatchingLyricsTimingSource(source, lines)) return false;
    const readProviderRevision = () => getLyricsService()?.getLyricsRequestRevision?.(state.uri);
    const providerRevision = readProviderRevision();
    const upgrade = {
      uri: state.uri, provider: state.provider, requestSeq: state.lyricsRequestSeq,
      karaoke: upgraded.karaoke, lines,
    };
    // Keep request/presentation ownership, pending streams and all auxiliary
    // text. Late stream callbacks merge these same timings before displaying.
    // A queued React update is not an applied upgrade. Acknowledge it only
    // after commit; a track transition or unmount may discard the update.
    cancelPendingLyricsTimingUpgrade(page);
    return new Promise(resolve => {
      const finish = applied => {
        if (page._pendingTimingUpgradeResolve === finish) page._pendingTimingUpgradeResolve = null;
        resolve(applied);
      };
      page._pendingTimingUpgradeResolve = finish;
      const isCurrent = current => ownsUpgrade() && page._pendingTimingUpgradeResolve === finish
        && readProviderRevision() === providerRevision
        && page.isCurrentLyricsState(current) && current.uri === upgraded.uri
        && current.provider === upgraded.provider && current.lyricsRequestSeq === upgrade.requestSeq
        && hasCompatibleLrcRedTimingSource(current, upgraded)
        && page.isPlaybackUriCurrent?.(upgraded.uri) !== false;
      page.setState(previous => isCurrent(previous) && readSource(previous) === source ? {
        [TIMING_UPGRADE]: upgrade,
        karaoke: upgraded.karaoke, karaokeGranularity: "word", karaokeSource: upgraded.karaokeSource,
        synced: upgraded.synced, lrcred: upgraded.lrcred,
        currentLyrics: mergeLyricsTiming(previous.currentLyrics, lines) || previous.currentLyrics,
      } : null, () => {
        if (!isCurrent(page.state) || getCommittedLyricsTimingUpgrade(page.state) !== upgrade) {
          finish(false);
          return;
        }
        try {
          const cachedTiming = updatePageLyricsSource(cache, state.uri, providerRevision,
            cached => cached ? retainLrcRedWordTiming(cached, upgraded) : upgraded);
          const rawResult = cachedTiming?.karaoke === upgraded.karaoke ? cachedTiming : upgraded;
          const service = getLyricsService();
          const snapshot = service?.getLyricsSnapshot?.(state.uri);
          const mode = page.getCurrentMode();
          const pageLyrics = hasMatchingLyricsTimingSource(page.state.currentLyrics, lines) ? page.state.currentLyrics : null;
          publishTimingSnapshot(service, snapshot, state.uri, rawResult, pageLyrics, getLyricsModeTypeKey(mode));
          if (!pageLyrics) return;
          page.publishLyricsPresentation(pageLyrics, {
            uri: state.uri, provider: state.provider, mode,
            displayMode1: snapshot?.displayMode1, displayMode2: snapshot?.displayMode2,
            detectedLanguage: snapshot?.detectedLanguage,
            translationTargetLanguage: snapshot?.translationTargetLanguage,
            pronunciationNotation: snapshot?.pronunciationNotation,
            translationStyle: snapshot?.translationStyle,
            translationSourceLyrics: state.unsynced || state.synced,
            presentationComplete: snapshot?.presentationComplete === true,
          }, { sharedSnapshotHandled: !!service?.publishLyricsSnapshot });
        } catch (error) {
          console.warn('[ivLyrics] Could not publish applied word timing:', error);
        } finally {
          finish(true);
        }
      });
    });
  }

  return { mergeCurrentLyricsTiming, applyLyricsTimingUpgrade };
}
