import { LRUCache } from "../core/LRUCache.mjs";
import { getLyricSupplementRetention } from "./lyricSupplementPresentation.mjs";
import { normalizeLrcRedIsrc, retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

const SOURCE_FIELDS = [
    'provider', 'cacheVersion', 'karaokeSource', 'providerSelectionPolicy',
    'syncDataRendererVersion', 'pseudoKaraokeCacheVersion',
];
const LYRIC_TYPES = ['karaoke', 'synced', 'unsynced'];
const EMPTY_ROWS = [];

function serializeRawLyricsRow(line) {
    try {
        return JSON.stringify({
            text: line?.text,
            originalText: line?.originalText,
            startTime: line?.startTime,
            endTime: line?.endTime,
            speaker: line?.speaker,
            speakerColor: line?.['speaker-color'],
            syllables: line?.syllables,
            vocals: line?.vocals,
        }).normalize('NFC');
    } catch {
        return String(line?.originalText || line?.text || '').normalize('NFC');
    }
}

function areSameRawRows(left, right) {
    const a = Array.isArray(left) ? left : EMPTY_ROWS;
    const b = Array.isArray(right) ? right : EMPTY_ROWS;
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let index = 0; index < a.length; index++) {
        const leftRow = a[index], rightRow = b[index];
        if (leftRow !== rightRow && serializeRawLyricsRow(leftRow) !== serializeRawLyricsRow(rightRow)) {
            return false;
        }
    }
    return true;
}

function areSameRawLyrics(left, right) {
    if (left === right) return true;
    if (typeof left !== 'object' || typeof right !== 'object') {
        return typeof left !== 'object' && typeof right !== 'object';
    }

    return normalizeLrcRedIsrc(left.lrcred?.isrc) === normalizeLrcRedIsrc(right.lrcred?.isrc)
        && SOURCE_FIELDS.every(field => String(left[field] || '') === String(right[field] || ''))
        && LYRIC_TYPES.every(type => areSameRawRows(left[type], right[type]));
}

export function createLyricsPresentationStore({
    getPresentationKey,
    preserveAuxiliaryLyrics,
    onPublish,
}) {
    const snapshots = new LRUCache(8);
    return {
        publish(update = {}) {
            const trackUri = update.trackUri || update.trackInfo?.uri || update.rawResult?.uri;
            if (!trackUri) return null;

            const previous = snapshots.get(trackUri) || {};
            const definedUpdate = Object.fromEntries(
                Object.entries(update).filter(([, value]) => value !== undefined)
            );
            const retainedTiming = retainLrcRedWordTiming(definedUpdate.rawResult, previous.rawResult);
            if (retainedTiming !== definedUpdate.rawResult) {
                definedUpdate.rawResult = retainedTiming;
                if (!definedUpdate.displayLyrics && previous.lyricsType === 'karaoke') delete definedUpdate.karaokeSource;
            }
            const nextProvider = definedUpdate.provider || definedUpdate.rawResult?.provider || null;
            const sourceChanged = !!definedUpdate.rawResult && !!previous.rawResult && (
                (nextProvider || '') !== (previous.provider || previous.rawResult?.provider || '') ||
                (definedUpdate.trackLyricsProviderOverride || '') !== (previous.trackLyricsProviderOverride || '') ||
                !areSameRawLyrics(definedUpdate.rawResult, previous.rawResult)
            );
            if (
                !sourceChanged
                && previous.displayLyrics !== definedUpdate.displayLyrics
                && Array.isArray(previous.displayLyrics)
                && Array.isArray(definedUpdate.displayLyrics)
            ) {
                const previousPresentationKey = getPresentationKey(
                    { uri: trackUri },
                    previous.displayLyrics,
                    previous
                );
                const nextPresentationKey = getPresentationKey(
                    { uri: trackUri },
                    definedUpdate.displayLyrics,
                    { ...previous, ...definedUpdate }
                );
                if (previousPresentationKey === nextPresentationKey) {
                    const presentationContext = { ...previous, ...definedUpdate };
                    const preserved = preserveAuxiliaryLyrics(
                        previous.displayLyrics,
                        definedUpdate.displayLyrics,
                        getLyricSupplementRetention(previous, presentationContext)
                    );
                    definedUpdate.displayLyrics = preserved.lyrics;
                }
            }
            const snapshot = {
                ...(sourceChanged ? {
                    trackUri: previous.trackUri,
                    revision: previous.revision
                } : previous),
                ...definedUpdate,
                trackUri,
                revision: (previous.revision || 0) + 1,
                updatedAt: Date.now()
            };

            if (!Object.prototype.hasOwnProperty.call(definedUpdate, 'provider') &&
                !snapshot.provider && snapshot.rawResult?.provider) {
                snapshot.provider = snapshot.rawResult.provider;
            }
            if (!Object.prototype.hasOwnProperty.call(definedUpdate, 'karaokeSource') &&
                !snapshot.karaokeSource && snapshot.rawResult?.karaokeSource) {
                snapshot.karaokeSource = snapshot.rawResult.karaokeSource;
            }

            snapshots.set(trackUri, snapshot);
            onPublish(snapshot);
            return snapshot;
        },

        get(trackUri) {
            return trackUri ? snapshots.get(trackUri) || null : null;
        },

        clear(trackUri) {
            if (trackUri) return snapshots.delete(trackUri);
            snapshots.clear();
            return true;
        },

        clearMatching(matches) {
            for (const uri of snapshots.keys()) {
                if (matches(uri)) snapshots.delete(uri);
            }
        },
    };
}
