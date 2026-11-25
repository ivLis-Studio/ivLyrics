import { useSyncCreatorLrclibActions } from '#ivlyrics/features/sync/syncCreatorLrclibActions.mjs';
import { createSyncCreatorLrclibClient } from '#ivlyrics/features/sync/syncCreatorLrclibClient.mjs';
import { createLrclibSearchRequests } from '#ivlyrics/providers/lyrics/lrclibSearchRequests.mjs';
import { getRuntimeService } from '#ivlyrics/spicetify/runtimeServices.mjs';

const setters = [
    'setAddonId', 'setError', 'setIsLoading', 'setIsLoadingLrclibId', 'setIsSearchingLrclib', 'setLrclibCandidates',
    'setLrclibIdInput', 'setLrclibSearchMeta', 'setLyricsText', 'setPreviewLrclibCandidateKey', 'setProviderValue',
    'setSelectedLrclibCandidateKey', 'setSelectedLrclibSourceValue', 'setShowLrclibCandidates',
];

export function setUpSyncCreatorLrclibActions(context, setState) {
    for (const name of setters) {
        context[name] ??= value => setState(name, value);
    }
    context.lrclibIdInputRevisionRef ??= { current: 0 };
    context.searchRequests ??= createLrclibSearchRequests({
        isOpen: () => context.isEditorOpen?.() ?? true,
        setPending: context.setIsSearchingLrclib,
    });
    const client = createSyncCreatorLrclibClient({
        getTransport: () => getRuntimeService('IvLyricsLrclibTransport', context.window),
        getLyricsSnapshot: uri => getRuntimeService('LyricsService', context.window)?.getLyricsSnapshot?.(uri),
    });
    return useSyncCreatorLrclibActions({
        react: { useCallback: context.useCallback }, i18n: context.I18n, toast: context.Toast, searchRequests: context.searchRequests,
        track: {
            ...context,
            primaryArtist: context.primaryArtist ?? context.artistName?.split(',')[0].trim() ?? '',
            trackDurationMs: context.trackDurationMs ?? context.Spicetify?.Player?.data?.item?.duration?.milliseconds ?? 0,
        },
        state: context, client, ui: context,
        sourceChange: {
            ...context,
            beginSyncCreatorSourceChange() {
                context.searchRequests.cancel();
                return context.beginSyncCreatorSourceChange();
            },
            async readPublishedSync(provider) {
                const service = getRuntimeService('SyncDataService', context.window);
                return (await service?.getSyncData?.(context.trackId, provider))?.syncData ?? null;
            },
        },
        services: {
            getLegacyProviders: () => context.Providers,
            getLyricsAddonManager: () => getRuntimeService('LyricsAddonManager', context.window),
            syncCreatorDraftStore: context.syncCreatorDraftStore,
            logger: context.console,
        },
    });
}
