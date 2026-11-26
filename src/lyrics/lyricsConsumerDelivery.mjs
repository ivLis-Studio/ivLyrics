import { readLyricPresentationContext } from "./lyricPresentationContext.mjs";

export function createLyricsConsumerDelivery({ readOverlaySender, readHelperSender }) {
    function sendLyricsToConsumers({
        trackInfo, lyrics, sendToOverlay = true, forceResend = false,
        sendReason = 'normal', presentationContext = null,
    }) {
        const sends = [];
        function send(sender) {
            if (!sender?.sendLyrics) return;
            try {
                sends.push(sender.sendLyrics(trackInfo, lyrics, forceResend, sendReason, presentationContext));
            } catch (error) {
                sends.push(Promise.reject(error));
            }
        }
        if (sendToOverlay) send(readOverlaySender());
        send(readHelperSender());
        return Promise.allSettled(sends);
    }

    async function sendLyricsSnapshotToConsumers(trackInfo, snapshot, options = {}) {
        const lyrics = snapshot?.displayLyrics;
        if (!trackInfo?.uri || snapshot?.trackUri !== trackInfo.uri || !Array.isArray(lyrics) || !lyrics.length) {
            return false;
        }

        const presentationContext = readLyricPresentationContext(snapshot);
        // A completed detection without a language differs from an older snapshot
        // with no detection information.
        if (presentationContext.detectedLanguage === null) presentationContext.detectedLanguage = 'auto';
        await sendLyricsToConsumers({
            trackInfo: { ...snapshot.trackInfo, ...trackInfo, uri: trackInfo.uri },
            lyrics,
            sendToOverlay: options.sendToOverlay !== false,
            forceResend: options.forceResend === true,
            sendReason: options.sendReason || 'shared-snapshot',
            presentationContext,
        });
        return true;
    }

    return { sendLyricsToConsumers, sendLyricsSnapshotToConsumers };
}
