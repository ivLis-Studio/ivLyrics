// Contributor profiles can become private while a seven-day lyrics cache is
// still valid. Preserve the live response and keep identity fields out of persistent storage.
const redactContributorForPersistentCache = (contributor) => ({
    name: 'Anonymous',
    displayName: 'Anonymous',
    userHash: null,
    avatarUrl: null,
    linked: false,
    profileAvailable: false,
    spotifyUserId: null,
    spotifyDisplayName: null,
    spotifyProfileUrl: null,
    profileUrl: null,
    identifier: null,
    anonymous: true,
    isPrivate: !!(
        contributor
        && typeof contributor === 'object'
        && (contributor.isPrivate === true || contributor.profilePublic === false)
    ),
    identityRedacted: true
});

const redactContributorContainerForPersistentCache = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }

    const sanitized = { ...value };
    ['contributors', 'creators', 'authors'].forEach((key) => {
        if (Array.isArray(value[key])) {
            sanitized[key] = value[key].map(redactContributorForPersistentCache);
        }
    });
    if (value.creator !== undefined && value.creator !== null) {
        sanitized.creator = redactContributorForPersistentCache(value.creator);
    }
    return sanitized;
};

export const redactLyricsCacheDataForPersistence = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return data;
    }

    const sanitized = redactContributorContainerForPersistentCache(data);
    if (data.syncData && typeof data.syncData === 'object' && !Array.isArray(data.syncData)) {
        sanitized.syncData = redactContributorContainerForPersistentCache(data.syncData);
    }

    [
        'creatorUserHash',
        'creatorHash',
        'creatorName',
        'creatorAvatarUrl',
        'creatorProfileUrl'
    ].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
            delete sanitized[key];
        }
    });
    return sanitized;
};

export function redactSyncDataForRuntimeCache(syncData) {
    if (!syncData || typeof syncData !== 'object') return syncData;
    const redactContributor = (contributor) => ({
        ...redactContributorForPersistentCache(contributor),
        ...(contributor?.syncType ? { syncType: contributor.syncType } : {}),
        ...(Number.isFinite(Number(contributor?.syncPoints)) ? { syncPoints: Number(contributor.syncPoints) } : {}),
    });
    const cached = { ...syncData };
    if (Array.isArray(syncData.contributors)) {
        cached.contributors = syncData.contributors.map(redactContributor);
    }
    if (syncData.syncData && typeof syncData.syncData === 'object' && !Array.isArray(syncData.syncData)) {
        cached.syncData = { ...syncData.syncData };
        if (Array.isArray(syncData.syncData.contributors)) {
            cached.syncData.contributors = syncData.syncData.contributors.map(redactContributor);
        }
    }
    return cached;
}

export function hasRedactedSyncDataContributorIdentity(syncData) {
    if (!syncData || typeof syncData !== 'object') return false;
    const contributorGroups = [
        syncData.contributors,
        syncData.syncData?.contributors
    ];
    return contributorGroups.some((contributors) => (
        Array.isArray(contributors)
        && contributors.some((contributor) => (
            contributor
            && typeof contributor === 'object'
            && contributor.identityRedacted === true
        ))
    ));
}
