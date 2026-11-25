export function readMarketplaceMetadataTag(code, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(code).match(new RegExp(`@${escaped}\\s+([^\\r\\n*]+)`, 'i'));
    return match ? match[1].trim().replace(/\s+[-–—]\s+.*$/, '').trim() : '';
}

export function readMarketplaceAddonInfoString(code, propertyName) {
    const start = String(code).search(/\b(?:const|let|var)\s+ADDON_INFO\s*=\s*\{/);
    if (start < 0) return '';
    const block = String(code).slice(start, start + 24000);
    const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`(?:^|[,{\\n\\r])\\s*${escaped}\\s*:\\s*(['"\\x60])([^'"\\x60\\r\\n]+)\\1`, 'm'));
    return match ? match[2].trim() : '';
}

function readDeclaredRuntimeId(entry) {
    const stored = entry.metadata?.runtimeId;
    if (stored && stored !== entry.id) return stored;
    return readMarketplaceMetadataTag(entry.code, 'id') || readMarketplaceAddonInfoString(entry.code, 'id');
}

export function marketplaceAddonError(code, message) {
    return Object.assign(new Error(message), { code });
}

export function createMarketplaceAddonRuntime({ document, readManager, createScriptUrl, revokeScriptUrl, schedule, cancel }) {
    const pendingIds = new Set();
    const styles = [];

    function insertStyle(handle) {
        // IndexedDB returns records in key order. Use installation time for the
        // cascade both at startup and when adding a style during playback.
        const nextIndex = styles.findIndex(style =>
            style.installedAt > handle.installedAt ||
            (style.installedAt === handle.installedAt && style.id > handle.id)
        );
        if (nextIndex === -1) {
            document.head.appendChild(handle.element);
            styles.push(handle);
        } else {
            document.head.insertBefore(handle.element, styles[nextIndex].element);
            styles.splice(nextIndex, 0, handle);
        }
    }

    async function waitForManager(type) {
        for (let attempt = 0; attempt < 30; attempt++) {
            const manager = readManager(type);
            if (manager) return manager;
            await new Promise(resolve => schedule(resolve, 50));
        }
        return readManager(type);
    }

    function startScript(entry, manager, expectedId, allowInferredId) {
        return new Promise((resolve, reject) => {
            const element = document.createElement('script');
            const url = createScriptUrl(entry.code);
            let loaded = false;
            let active = true;
            let provider;
            let timer;
            let unsubscribe;
            const finish = (error) => {
                if (!active) return;
                active = false;
                if (timer !== undefined) cancel(timer);
                unsubscribe?.();
                revokeScriptUrl(url);
                element.onload = element.onerror = null;
                if (error) {
                    element.remove();
                    if (provider && manager.getAddon(provider.id) === provider) manager.unregister(provider.id);
                    reject(error);
                } else {
                    resolve({ element, manager, provider, runtimeId: provider.id });
                }
            };
            const finishIfRegistered = () => {
                provider ??= manager.getAddon(expectedId);
                if (loaded && provider && manager.getAddon(provider.id) === provider) finish();
            };
            unsubscribe = manager.on?.('addon:registered', ({ id }) => {
                if (id !== expectedId && !(allowInferredId && document.currentScript === element)) return;
                provider = manager.getAddon(id);
                finishIfRegistered();
            });
            element.src = url;
            element.dataset.marketplaceAddon = entry.id;
            element.onload = () => { loaded = true; finishIfRegistered(); };
            element.onerror = () => finish(marketplaceAddonError('REGISTRATION_FAILED', `Script load failed for ${entry.id}`));
            timer = schedule(() => finish(marketplaceAddonError('REGISTRATION_FAILED', `Addon "${expectedId}" did not register with ivLyrics`)), 1500);
            try { document.head.appendChild(element); }
            catch (error) { finish(error); }
        });
    }

    async function load(entry) {
        const type = String(entry.metadata?.type || '').toLowerCase();
        if (type === 'style') {
            const element = document.createElement('style');
            element.dataset.marketplaceAddon = entry.id;
            element.textContent = entry.code || '';
            const handle = {
                element, runtimeId: entry.metadata?.runtimeId || entry.id,
                id: entry.id, installedAt: entry.installedAt || '',
            };
            insertStyle(handle);
            return handle;
        }
        if (type !== 'lyrics' && type !== 'ai') throw new Error(`Unsupported addon type: ${type || 'unknown'}`);

        const manager = await waitForManager(type);
        if (!manager) throw marketplaceAddonError('REGISTRATION_FAILED', `Provider manager unavailable for ${entry.id}`);
        const declaredId = readDeclaredRuntimeId(entry);
        const expectedId = declaredId || entry.id;
        const reservation = `${type}:${expectedId}`;
        if (pendingIds.has(reservation) || manager.getAddon(expectedId)) {
            throw marketplaceAddonError('ALREADY_INSTALLED', `An addon with ID "${expectedId}" is already registered`);
        }
        pendingIds.add(reservation);
        try { return await startScript(entry, manager, expectedId, !declaredId); }
        finally { pendingIds.delete(reservation); }
    }

    function unload(handle) {
        if (!handle) return;
        const { manager, provider, element, runtimeId } = handle;
        if (manager?.getAddon(runtimeId) === provider && provider) manager.unregister(runtimeId);
        const styleIndex = styles.indexOf(handle);
        if (styleIndex !== -1) styles.splice(styleIndex, 1);
        element.remove();
    }

    function restore(handle) {
        const { manager, provider, element, runtimeId } = handle;
        if (!manager) {
            insertStyle(handle);
            return;
        }
        if (manager.getAddon(runtimeId) || !manager.register(provider)) throw new Error(`Could not restore ${runtimeId}`);
        manager.markAsMarketplaceAddon?.(runtimeId);
        document.head.appendChild(element);
    }

    return { load, unload, restore };
}
