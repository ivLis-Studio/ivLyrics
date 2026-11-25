export function createLyricsSearchProgress(emit) {
    const searches = new Map();
    const keyFor = (uri, providerId) => JSON.stringify([uri || '', providerId || null]);
    const activeSearch = (uri, providerId) => {
        const search = searches.get(keyFor(uri, providerId));
        return search?.isCurrent() ? search : null;
    };

    return {
        begin(uri, forcedProviderId, isCurrent) {
            const key = keyFor(uri, forcedProviderId);
            const search = { value: null, replaying: false, isCurrent };
            searches.set(key, search);
            const ownsProgress = () => searches.get(key) === search;

            return {
                publish(detail) {
                    if (!uri || !ownsProgress() || !isCurrent()) return;
                    search.value = { ...detail, uri, forcedProviderId: forcedProviderId || null };
                    emit(search.value);
                },
                close() {
                    if (ownsProgress()) searches.delete(key);
                },
            };
        },
        get(uri, providerId) {
            const value = activeSearch(uri, providerId)?.value;
            return value ? { ...value } : null;
        },
        replay(uri, providerId) {
            const search = activeSearch(uri, providerId);
            if (!search?.value || search.replaying) return null;
            const value = { ...search.value, replayed: true };
            search.replaying = true;
            try {
                emit(value);
            } finally {
                search.replaying = false;
            }
            return value;
        },
        clear(uri, providerId) {
            const search = searches.get(keyFor(uri, providerId));
            if (search) search.value = null;
        },
    };
}
