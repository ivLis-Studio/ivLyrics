import { LRUCache } from "../core/LRUCache.mjs";
import { getLyricSupplementRetention } from "./lyricSupplementPresentation.mjs";
import { normalizeLrcRedIsrc, retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

const updateRawLyricsPresentationHash = (initialHash, value) => {
    let hash = initialHash;
    for (let index = 0; index < value.length; index++) {
        const firstCodeUnit = value.charCodeAt(index);
        let codePoint = firstCodeUnit;
        if (firstCodeUnit >= 0xD800 && firstCodeUnit <= 0xDBFF && index + 1 < value.length) {
            const secondCodeUnit = value.charCodeAt(index + 1);
            if (secondCodeUnit >= 0xDC00 && secondCodeUnit <= 0xDFFF) {
                codePoint = ((firstCodeUnit - 0xD800) * 0x400)
                    + secondCodeUnit - 0xDC00 + 0x10000;
                index++;
            }
        }
        hash ^= codePoint || 0;
        hash = Math.imul(hash, 16777619);
    }
    return hash;
};

const getRawLyricsPresentationSignature = (result) => {
    if (!result || typeof result !== 'object') return '';
    let hash = 2166136261;
    const lengths = [];
    const resultIdentity = [
        result.provider || '',
        normalizeLrcRedIsrc(result.lrcred?.isrc),
        result.cacheVersion || '',
        result.karaokeSource || '',
        result.providerSelectionPolicy || '',
        result.syncDataRendererVersion || '',
        result.pseudoKaraokeCacheVersion || ''
    ].join(':');
    for (const type of ['karaoke', 'synced', 'unsynced']) {
        const lines = Array.isArray(result[type]) ? result[type] : [];
        const typePrefix = `${type}:`;
        lengths.push(lines.length);
        for (const line of lines) {
            let value;
            try {
                value = JSON.stringify({
                    text: line?.text,
                    originalText: line?.originalText,
                    startTime: line?.startTime,
                    endTime: line?.endTime,
                    speaker: line?.speaker,
                    speakerColor: line?.['speaker-color'],
                    syllables: line?.syllables,
                    vocals: line?.vocals
                });
            } catch (error) {
                value = String(line?.originalText || line?.text || '');
            }
            value = String(value || '').normalize('NFC');
            hash = updateRawLyricsPresentationHash(hash, typePrefix);
            hash = updateRawLyricsPresentationHash(hash, value);
            hash ^= 10;
            hash = Math.imul(hash, 16777619);
        }
    }
    return `${resultIdentity}:${lengths.join(':')}:${(hash >>> 0).toString(36)}`;
};

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
                (definedUpdate.rawResult !== previous.rawResult &&
                    getRawLyricsPresentationSignature(definedUpdate.rawResult) !==
                    getRawLyricsPresentationSignature(previous.rawResult))
            );
            if (
                !sourceChanged
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
