import { normalizeSyncDataIsrc } from "./syncDataIdentity.mjs";

export function createSyncDataSubmission({
    apiBase, requestVersion, request, translate, getCodec, resolveSyncDataIdentity,
    getUserHash, getAuthUtils, readStoredAuthToken, getSyncDataTrackMetadata,
    getCurrentSpotifyProfile, getClientVersion, rememberResolvedTrackIsrc, rememberOpenDbSyncDataEntry, clearCache,
}) {
    return async function submitSyncData(trackId, provider, syncData, metadata = {}, options = {}) {
        const { authOperation, isDraftCurrent = () => true } = options || {};
        if (!isDraftCurrent()) return null;
        const codec = getCodec();
        if (!codec) throw new Error('Sync v6 codec is unavailable. Please update ivLyrics.');
        const encoded = codec.encode(syncData);
        if (String(provider || '').trim().toLowerCase() === 'lrclib') {
            const lrclibId = encoded?.source?.lrclibId === null || encoded?.source?.lrclibId === undefined
                ? ''
                : String(encoded.source.lrclibId).trim();
            if (encoded?.source?.provider !== 'lrclib' || !/^[1-9]\d*$/.test(lrclibId)) {
                throw new Error(translate('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
            }
        }

        const utils = options?.account || getAuthUtils();
        const readAuthToken = () => utils?.getAuthToken ? utils.getAuthToken() : readStoredAuthToken();
        const session = utils?.captureAccountSession?.();
        const authToken = readAuthToken();
        const userHash = session?.userHash ?? getUserHash();
        const assertAccountCurrent = () => {
            const current = session ? utils.isAccountSessionCurrent(session)
                : readAuthToken() === authToken && getUserHash() === userHash;
            if (!current) throw new Error(translate('syncCreator.loginRequired'));
        };

        const identity = await resolveSyncDataIdentity(trackId, metadata);
        if (!isDraftCurrent()) return null;
        assertAccountCurrent();
        if (!identity) {
            throw new Error('이 곡의 ISRC를 확인할 수 없어 sync-data를 등록할 수 없습니다.');
        }

        const trackMetadata = getSyncDataTrackMetadata(identity.trackId, metadata);
        const title = trackMetadata.title;
        const artist = trackMetadata.artist;
        const album = trackMetadata.album;
        const durationMs = trackMetadata.durationMs;
        const spotifyProfile = await getCurrentSpotifyProfile();
        if (!isDraftCurrent()) return null;
        assertAccountCurrent();

        if (utils?.requireDiscordAuth) {
            await utils.requireDiscordAuth(translate('syncCreator.loginRequired'), { operation: authOperation });
        } else {
            const profileResponse = await request(`${apiBase}/user/profile?userHash=${encodeURIComponent(userHash)}`, {
                cache: 'no-store',
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
            });
            const profile = await profileResponse.json();

            if (!profileResponse.ok) {
                throw new Error(profile.error || translate('settingsAdvanced.aboutTab.account.loadFailed'));
            }

            if (!profile?.authenticated || !profile?.linked || !profile?.account) {
                throw new Error(translate('syncCreator.loginRequired'));
            }
        }

        if (!isDraftCurrent()) return null;
        assertAccountCurrent();

        const response = await request(`${apiBase}/lyrics/sync-data`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "User-Agent": `spicetify v${getClientVersion()}`,
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
                isrc: identity.isrc,
                'request-version': requestVersion,
                ...(identity.trackId ? { trackId: identity.trackId } : {}),
                provider,
                syncData: encoded,
                ...(metadata.workSessionId ? { workSessionId: metadata.workSessionId, workSequence: metadata.workSequence } : {}),
                ...(title ? { title } : {}),
                ...(artist ? { artist } : {}),
                ...(album ? { album } : {}),
                ...(durationMs ? { durationMs } : {}),
                ...(spotifyProfile?.id ? {
                    spotifyUserId: spotifyProfile.id,
                    ...(spotifyProfile.displayName ? { spotifyDisplayName: spotifyProfile.displayName } : {})
                } : {})
            })
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
            const failure = new Error(result?.error || result?.message
                || translate('syncCreator.submitServerError', { status: response.status }));
            failure.status = response.status;
            throw failure;
        }
        if (!result) throw new Error(translate('syncCreator.submitError'));

        const resolvedResultIsrc = normalizeSyncDataIsrc(result?.isrc || result?.data?.isrc);
        if (resolvedResultIsrc && identity.trackId) {
            rememberResolvedTrackIsrc(identity.trackId, resolvedResultIsrc);
        }
        rememberOpenDbSyncDataEntry(resolvedResultIsrc || identity.isrc, provider);
        clearCache(resolvedResultIsrc || identity.isrc, { preserveOpenDb: true });
        return result;
    };
}
