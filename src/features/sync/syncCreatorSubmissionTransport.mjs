const SYNC_DATA_URL = 'https://lyrics.api.ivl.is/lyrics/sync-data';
const SYNC_DATA_REQUEST_VERSION = '20260701';
const SYNC_CREATOR_WORK_TIMEOUT_MS = 30_000;

function getSyncCreatorSubmitErrorMessage(error, translate) {
    // HTTP failures can themselves mention a network timeout upstream.
    if (Number.isInteger(error?.status)) return error.message || translate('syncCreator.submitError');
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return translate('syncCreator.submitTimeoutError');
    }
    if (error?.name === 'NetworkError'
        || /failed to fetch|fetch failed|network request failed|networkerror|load failed/i.test(error?.message || '')) {
        return translate('syncCreator.submitNetworkError');
    }
    return error?.message || translate('syncCreator.submitError');
}

function readHttpError(response, result, translate) {
    return result?.error || result?.message || translate('syncCreator.submitServerError', { status: response.status });
}

async function requestSyncCreatorWork(payload, {
    fetch,
    getHeaders,
    translate,
    schedule,
    cancel,
    createAbortController = () => new AbortController(),
}) {
    const controller = createAbortController();
    // Allow the server's bounded LRCLIB verification retries to finish.
    const timeout = schedule(() => controller.abort(), SYNC_CREATOR_WORK_TIMEOUT_MS);
    try {
        const response = await fetch(`${SYNC_DATA_URL}/work`, {
            method: 'POST',
            signal: controller.signal,
            headers: getHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
            const failure = new Error(readHttpError(response, result, translate));
            failure.status = response.status;
            throw failure;
        }
        return result;
    } finally {
        cancel(timeout);
    }
}

async function sendSyncCreatorSubmission({
    syncData,
    trackId,
    provider,
    isrc,
    title,
    artist,
    album,
    durationMs,
    account,
    requireAuth,
    saveWork,
    getSyncService,
    fetch,
    getHeaders,
    translate,
    isDraftCurrent = () => true,
}) {
    const authOperation = {};
    const session = account?.captureAccountSession?.();
    const assertAccountCurrent = () => {
        if (session && !account.isAccountSessionCurrent(session)) {
            throw new Error(translate('syncCreator.loginRequired'));
        }
    };
    await requireAuth(authOperation);
    if (!isDraftCurrent()) return { cancelled: true };
    assertAccountCurrent();
    const workMetadata = await saveWork(syncData);
    if (!isDraftCurrent()) return { cancelled: true };
    assertAccountCurrent();
    const metadata = { ...workMetadata, isrc, title, artist, album, ...(durationMs > 0 ? { durationMs } : {}) };
    const service = getSyncService();
    if (service?.submitSyncData) {
        const submitted = await service.submitSyncData(trackId, provider, syncData, metadata, {
            account, authOperation, isDraftCurrent,
        });
        if (!submitted && !isDraftCurrent()) return { cancelled: true };
        return submitted ? { submitted: true } : { submitted: false, message: translate('syncCreator.submitError') };
    }

    const response = await fetch(SYNC_DATA_URL, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            isrc,
            'request-version': SYNC_DATA_REQUEST_VERSION,
            provider,
            syncData,
            ...metadata,
            ...(trackId ? { trackId } : {}),
        }),
    });
    if (response.ok) return { submitted: true };
    const result = await response.json().catch(() => null);
    return { submitted: false, message: readHttpError(response, result, translate) };
}

export { getSyncCreatorSubmitErrorMessage, requestSyncCreatorWork, sendSyncCreatorSubmission };
