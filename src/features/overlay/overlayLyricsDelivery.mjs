import { isPlaybackLyricsTargetCurrent } from "../../core/playbackPositionService.mjs";
import { getLyricSupplementRetention, getLyricSupplementVisibility } from "../../lyrics/lyricSupplementPresentation.mjs";

const LYRICS_SEND_RETRY_DELAYS = [250, 750];
const OFFSET_REFRESH_REASONS = new Set(['lyrics-delay', 'global-offset', 'offset-event']);
const isSameTrackKind = (previous, next) => previous?.uri === next.uri
    && (previous?.isDjNarration === true) === (next.isDjNarration === true);

function waitBeforeRetry(sender, delay) {
    return new Promise(resolve => {
        const finish = () => {
            if (sender._finishLyricsRetryWait !== finish) return;
            clearTimeout(timer);
            sender._finishLyricsRetryWait = null;
            resolve();
        };
        const timer = setTimeout(finish, delay);
        sender._finishLyricsRetryWait = finish;
    });
}

export function createOverlayLyricsDelivery({
    playback, getSpicetify, resolveSpotifyImageUrl, debug, lyricPresentation, mapLyricsForSender,
    scheduleSenderBootstrap, isPresentationCurrent,
}) {
    const { getPresentationKey, preserveAuxiliaryLyrics } = lyricPresentation;

    function canSendPresentation(lyrics, context) {
        // Empty packets still clear the receiver when playback has no lyrics.
        if (!lyrics?.length || isPresentationCurrent?.(context) !== false) return true;
        scheduleSenderBootstrap(0);
        return false;
    }

    function buildTrackMetadata(sender, trackInfo, isDjNarration) {
        const player = getSpicetify().Player;
        const item = player.data?.item;
        const metadata = item?.uri && item.uri !== trackInfo.uri ? null : item?.metadata;
        const translated = sender.USES_DISPLAY_METADATA ? trackInfo.translatedMetadata?.translated : null;
        const originalTitle = trackInfo.title || metadata?.title || '';
        const originalArtist = trackInfo.artist || (isDjNarration ? '' : metadata?.artist_name || '');
        let albumArt = null;
        try {
            const imageUrl = metadata?.image_xlarge_url || metadata?.image_url || metadata?.image_large_url;
            albumArt = resolveSpotifyImageUrl(imageUrl);
        } catch {}
        return {
            title: sender.formatMetadataText(translated?.title || originalTitle),
            artist: sender.formatMetadataText(translated?.artist || originalArtist),
            album: metadata?.album_title || '',
            albumArt,
            duration: (isDjNarration ? trackInfo.duration : player.getDuration()) || 0,
        };
    }

    const resolveOverlayPresentationContext = (sender, trackInfo, context) => {
        const previous = isSameTrackKind(sender._lastTrackInfo, trackInfo)
            ? sender._lastPresentationContext
            : null;
        if (!previous) return context;
        if (!context) return previous;
        // Missing fields describe an incomplete update; only explicit mode
        // values such as 'none' change what the user wants to display.
        const updates = Object.fromEntries(Object.entries(context).filter(([, value]) => value != null));
        return Object.keys(previous).some(key => !(key in updates))
            ? { ...previous, ...updates }
            : context;
    };

    return {
        hasCurrentLyricsSend() {
            return this._activeLyricsSend?.generation === this._deliveryGeneration
                || this._pendingLyricsSend?.generation === this._deliveryGeneration;
        },

        // 현재 재생 중인 곡과 다른(이전) 곡의 가사 전송인지 확인
        isStaleTrackSend(trackInfo) {
            try {
                if (!trackInfo?.uri) return false;
                const snapshot = playback.getPlayerPlaybackSnapshot();
                if (snapshot?.uri === "") return true;
                return !isPlaybackLyricsTargetCurrent(
                    snapshot,
                    getSpicetify().Player.data?.item?.uri,
                    trackInfo.uri,
                    trackInfo.isDjNarration === true
                );
            } catch (e) {
                return false;
            }
        },

        // 가사 전송 직렬화 (최신 페이로드 우선) - HTTP 응답 순서 뒤집힘으로
        // 이전 가사가 최신 가사를 덮어쓰는 문제 방지
        async queueLyricsSend(endpoint, uri, payload, deliveryContext = null) {
            if (!deliveryContext) {
                const key = JSON.stringify([uri, this.lastSentLyrics, this.lastSentOffset]);
                deliveryContext = {
                    key,
                    generation: ++this._deliveryGeneration,
                    isReconnectCycle: false
                };
                this._deliveryKey = key;
                this._terminalDeliveryFailure = null;
            }
            const dedupeToken = this.lastSentUri === uri ? {} : null;
            if (dedupeToken) {
                this._lastSentDedupeToken = dedupeToken;
            }
            this._pendingLyricsSend = {
                endpoint,
                uri,
                isDjNarration: deliveryContext.isDjNarration === true,
                payload,
                retryCount: 0,
                deliveryKey: deliveryContext.key,
                generation: deliveryContext.generation,
                isReconnectCycle: !!deliveryContext.isReconnectCycle,
                presentationContext: deliveryContext.presentationContext,
                dedupeSnapshot: {
                    uri: this.lastSentUri,
                    lyrics: this.lastSentLyrics,
                    offset: this.lastSentOffset,
                    token: dedupeToken
                }
            };
            this._finishLyricsRetryWait?.();
            if (this._activeLyricsSend) return;
            const ownsDelivery = (queued) => this.enabled
                && queued.generation === this._deliveryGeneration
                && !this.isStaleTrackSend(queued);
            const clearDedupeIfCurrent = (queued) => {
                const snapshot = queued.dedupeSnapshot;
                if (queued.generation !== this._deliveryGeneration
                    || !snapshot || snapshot.uri !== queued.uri
                    || this._lastSentDedupeToken !== snapshot.token
                    || this.lastSentUri !== snapshot.uri
                    || this.lastSentLyrics !== snapshot.lyrics
                    || !Object.is(this.lastSentOffset, snapshot.offset)) {
                    return;
                }
                this.lastSentUri = null;
                this.lastSentLyrics = null;
                this.lastSentOffset = null;
                this._lastSentDedupeToken = null;
            };
            const markTerminalFailure = (queued) => {
                if (queued.generation !== this._deliveryGeneration
                    || queued.deliveryKey !== this._deliveryKey) {
                    return;
                }
                const previousFailure = this._terminalDeliveryFailure;
                this._terminalDeliveryFailure = {
                    key: queued.deliveryKey,
                    generation: queued.generation,
                    reconnectUsed: queued.isReconnectCycle
                        || !!(previousFailure
                            && previousFailure.key === queued.deliveryKey
                            && previousFailure.generation === queued.generation
                            && previousFailure.reconnectUsed)
                };
                clearDedupeIfCurrent(queued);
            };
            try {
                while (this._pendingLyricsSend) {
                    const next = this._pendingLyricsSend;
                    this._pendingLyricsSend = null;
                    if (!ownsDelivery(next) || !canSendPresentation(next.payload.lyrics, next.presentationContext)) {
                        clearDedupeIfCurrent(next);
                        continue;
                    }
                    this._activeLyricsSend = next;
                    const sent = await this.sendToEndpoint(next.endpoint, next.payload);
                    if (!ownsDelivery(next)) continue;
                    if (!canSendPresentation(next.payload.lyrics, next.presentationContext)) {
                        clearDedupeIfCurrent(next);
                        continue;
                    }
                    if (sent === true) {
                        this.lastDeliveredUri = next.uri || null;
                        this.lastDeliveredIsDjNarration = next.isDjNarration;
                        this._terminalDeliveryFailure = null;
                        continue;
                    }

                    if (this.lastDeliveredUri === next.uri) {
                        this.lastDeliveredUri = null;
                        this.lastDeliveredIsDjNarration = false;
                    }
                    // Unreachable receivers get this payload once they answer a
                    // probe again (handleConnectionRecovery); retrying now only
                    // fails again.
                    if (!this.isConnected) {
                        markTerminalFailure(next);
                        continue;
                    }

                    const retryDelay = LYRICS_SEND_RETRY_DELAYS[next.retryCount];
                    if (retryDelay === undefined) {
                        markTerminalFailure(next);
                        continue;
                    }

                    await waitBeforeRetry(this, retryDelay);
                    // 대기 중 들어온 최신 페이로드가 실패한 요청의 재시도를 대체한다.
                    if (!this._pendingLyricsSend) {
                        this._pendingLyricsSend = { ...next, retryCount: next.retryCount + 1 };
                    }
                }
            } finally {
                this._activeLyricsSend = null;
            }
        },

        async sendLyrics(
            trackInfo,
            lyrics,
            forceResend = false,
            sendReason = 'normal',
            presentationContext = null
        ) {
            if (!trackInfo || !lyrics || !Array.isArray(lyrics)) return;
            if (!this.enabled) return;
            if (this.isStaleTrackSend(trackInfo)) {
                debug(this.LOG_TAG, '이전 곡 가사 전송 차단:', trackInfo.uri);
                return;
            }

            const effectivePresentationContext = resolveOverlayPresentationContext(this, trackInfo, presentationContext);
            if (!canSendPresentation(lyrics, effectivePresentationContext)) return;

            const currentReqId = ++this._reqId;
            const runtimeGeneration = this._runtimeGeneration;
            const port = this.port;
            const presentationKey = getPresentationKey(
                trackInfo,
                lyrics,
                effectivePresentationContext
            );
            const supplementVisibility = getLyricSupplementVisibility(effectivePresentationContext);
            const preserved = isSameTrackKind(this._lastTrackInfo, trackInfo)
                && this._lastPresentationKey === presentationKey
                ? preserveAuxiliaryLyrics(
                    this._lastLyrics, lyrics,
                    getLyricSupplementRetention(this._lastPresentationContext, effectivePresentationContext, supplementVisibility)
                )
                : {
                    lyrics,
                    preservedPronunciationCount: 0,
                    preservedTranslationCount: 0
                };
            const lyricsToSend = preserved.lyrics;

            if (
                preserved.preservedPronunciationCount > 0
                || preserved.preservedTranslationCount > 0
            ) {
                debug(this.LOG_TAG, '최신 발음/번역 보존:', {
                    pronunciation: preserved.preservedPronunciationCount,
                    translation: preserved.preservedTranslationCount,
                    reason: sendReason
                });
            }

            this._lastTrackInfo = trackInfo;
            this._lastLyrics = lyricsToSend;
            this._lastPresentationContext = effectivePresentationContext;
            this._lastPresentationKey = presentationKey;

            // Nothing is listening. The cached lyrics go out when a probe
            // connects (handleConnectionRecovery resends them).
            if (!this.isConnected) return;

            const offset = await this.getSyncOffset(trackInfo.uri);

            if (currentReqId !== this._reqId || !this.isRuntimeRequestCurrent(runtimeGeneration, port) || !this.isConnected) {
                debug(this.LOG_TAG, '오프셋 계산 중 전송 상태가 변경됨:', trackInfo.uri);
                return;
            }

            if (this.isStaleTrackSend(trackInfo)) {
                debug(this.LOG_TAG, '이전 곡 가사 전송 차단 (오프셋 계산 후):', trackInfo.uri);
                return;
            }
            if (!canSendPresentation(lyricsToSend, effectivePresentationContext)) return;

            const isDjNarration = trackInfo.isDjNarration === true;
            const track = buildTrackMetadata(this, trackInfo, isDjNarration);
            const mappedLines = mapLyricsForSender(lyricsToSend, offset, supplementVisibility);
            const isSynced = lyricsToSend.some(l => l.startTime !== undefined && l.startTime !== null);
            const lyricsHash = JSON.stringify([mappedLines, isSynced]);
            const deliveryKey = JSON.stringify([trackInfo.uri, offset, track, isDjNarration]) + "\n" + lyricsHash;

            if (!forceResend &&
                this.lastSentUri === trackInfo.uri &&
                this.lastSentLyrics === lyricsHash &&
                this.lastSentOffset === offset &&
                this._deliveryKey === deliveryKey) {
                return;
            }

            const isReconnectCycle = sendReason === 'reconnect';
            let deliveryGeneration = this._deliveryGeneration;
            if (!isReconnectCycle || this._deliveryKey !== deliveryKey) {
                deliveryGeneration = ++this._deliveryGeneration;
                this._deliveryKey = deliveryKey;
                this._terminalDeliveryFailure = null;
            }

            this.lastSentUri = trackInfo.uri;
            this.lastSentLyrics = lyricsHash;
            this.lastSentOffset = offset;

            debug(this.LOG_TAG, '가사 전송:', {
                lines: mappedLines.length,
                offset,
                title: track.title,
                artist: track.artist,
                translated: this.USES_DISPLAY_METADATA && !!trackInfo.translatedMetadata
            });

            await this.queueLyricsSend(this.LYRICS_ENDPOINT, trackInfo.uri, {
                ...this.getSourceFields(trackInfo.uri),
                track,
                lyrics: mappedLines,
                isSynced
            }, {
                key: deliveryKey,
                generation: deliveryGeneration,
                isReconnectCycle,
                isDjNarration,
                presentationContext: effectivePresentationContext,
            });
        },

        async resendWithNewOffset(sendReason = 'explicit', offsetUpdate = null) {
            const trackUri = offsetUpdate?.trackUri;
            const trackOffset = Number(offsetUpdate?.offset);
            if (trackUri && Number.isFinite(trackOffset)) {
                if (!Object.is(this._offsetCache[trackUri], trackOffset)) {
                    this._offsetCache = { ...this._offsetCache, [trackUri]: trackOffset };
                }
            } else if (sendReason !== 'global-offset' && sendReason !== 'lyrics-delay') {
                this._offsetCache = {};
            }
            if (trackUri && trackUri !== this._lastTrackInfo?.uri) return;
            if (this._lastTrackInfo && this._lastLyrics) {
                debug(this.LOG_TAG, '가사 재전송:', sendReason);
                await this.sendLyrics(
                    this._lastTrackInfo,
                    this._lastLyrics,
                    !OFFSET_REFRESH_REASONS.has(sendReason),
                    sendReason,
                    this._lastPresentationContext
                );
            }
        },

        async sendTranslatedMetadata(translatedMetadata, trackUri) {
            if (!this.enabled || !translatedMetadata) return;
            const trackInfo = this._lastTrackInfo;
            if (!trackInfo || !this._lastLyrics || (trackUri && trackUri !== trackInfo.uri)) return;

            debug(this.LOG_TAG, '번역된 메타데이터로 재전송');
            await this.sendLyrics(
                { ...trackInfo, translatedMetadata },
                this._lastLyrics,
                true,
                'translated-metadata',
                this._lastPresentationContext
            );
        },
    };
}
