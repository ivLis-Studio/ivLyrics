import { EventEmitter } from "../../core/eventEmitter.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { readMarketplaceManager, publishMarketplaceManager } from "./marketplaceRuntime.mjs";
import { createMarketplaceRepository } from "./marketplaceRepository.mjs";
import { createMarketplaceCatalog } from "./marketplaceCatalog.mjs";
import {
    createMarketplaceAddonRuntime, marketplaceAddonError, readMarketplaceAddonInfoString, readMarketplaceMetadataTag,
} from "./marketplaceAddonRuntime.mjs";

/**
 * Marketplace Manager for ivLyrics
 * 마켓플레이스 에드온 설치, 저장, 동적 로딩을 관리하는 시스템
 *
 * @author ivLis STUDIO
 * @description IndexedDB에 에드온 코드를 저장하고, 앱 시작 시 동적으로 로드
 */

export default function initializeMarketplaceManager() {
    const host = window;

    const MODULE_KEY = '__ivLyricsMarketplaceManagerModule';
    const moduleState = host[MODULE_KEY] || (host[MODULE_KEY] = {
        initialized: false,
        waitTimer: null
    });

    // Spicetify가 준비될 때까지 대기
    if (!host.Spicetify?.LocalStorage) {
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setTimeout(() => {
                moduleState.waitTimer = null;
                initializeMarketplaceManager();
            }, 300);
        }
        return;
    }

    moduleState.waitTimer = null;
    if (moduleState.initialized) {
        return;
    }
    moduleState.initialized = true;

    const MARKETPLACE_DEBUG = false;
    const marketplaceDebug = (...args) => {
        if (MARKETPLACE_DEBUG) {
            console.log(...args);
        }
    };

    // ============================================
    // Constants
    // ============================================

    const FETCH_TIMEOUT = 15000;
    const DIRECT_ADDON_MAX_BYTES = 2 * 1024 * 1024;
    const readProviderManager = (type) => {
        if (type === 'lyrics') return getRuntimeService('LyricsAddonManager', host) || null;
        if (type === 'ai') return getRuntimeService('AIAddonManager', host) || null;
        return null;
    };

    // IndexedDB에 저장할 에드온 엔트리 생성 (install/update 공통 형태)
    // metadata 마지막 4개 필드와 installedAt은 호출자가 계산해 overrides로 전달하며,
    // updatedAt은 항상 마지막에 새로 생성한다.
    function buildMarketplaceAddonEntry(id, code, addonInfo, overrides) {
        return {
            id,
            code,
            metadata: {
                name: addonInfo.name,
                type: addonInfo.type,
                author: addonInfo.author,
                version: addonInfo.version,
                description: addonInfo.description,
                preview: addonInfo.preview,
                downloadUrl: addonInfo.downloadUrl,
                updated: addonInfo.updated,
                minAppVersion: addonInfo.minAppVersion,
                source: overrides.source,
                runtimeId: overrides.runtimeId,
                sourceRepo: overrides.sourceRepo,
                githubUrl: overrides.githubUrl
            },
            installedAt: overrides.installedAt,
            updatedAt: new Date().toISOString()
        };
    }

    // ============================================
    // MarketplaceManager Class
    // ============================================

    class MarketplaceManager extends EventEmitter {
        constructor() {
            super((event, once, error) => {
                const kind = once ? 'Once listener' : 'Event listener';
                console.error(`[MarketplaceManager] ${kind} error (${event}):`, error);
            });
            this._installedAddons = new Map(); // id -> { metadata, code }
            this._repository = createMarketplaceRepository(() => host.indexedDB);
            this._catalog = createMarketplaceCatalog({
                request: (...args) => fetch(...args), requestTimeout: FETCH_TIMEOUT,
                installedAddons: this._installedAddons, debug: marketplaceDebug,
            });
            this._runtime = createMarketplaceAddonRuntime({
                document: host.document, readManager: readProviderManager,
                createScriptUrl: code => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
                revokeScriptUrl: url => URL.revokeObjectURL(url),
                schedule: setTimeout, cancel: clearTimeout,
            });
            this._activeAddons = new Map();
            this._operations = new Map();
            this._loadErrors = new Map(); // id -> startup/runtime load error

            // Readiness tracking
            this._readyResolve = null;
            this.readyPromise = new Promise((resolve) => {
                this._readyResolve = resolve;
            });

            this._init();
        }

        // ============================================
        // Initialization
        // ============================================

        async _init() {
            try {
                await this._repository.open();
                await this._loadInstalledAddons();
                marketplaceDebug('[MarketplaceManager] Initialized successfully');
            } catch (e) {
                console.error('[MarketplaceManager] Initialization error:', e);
            } finally {
                // readyPromise는 항상 resolve (에러가 있어도 앱이 멈추면 안 됨)
                this._readyResolve();
            }
        }

        // ============================================
        // Addon Loading (Startup)
        // ============================================

        async _loadInstalledAddons() {
            const addons = await this._repository.getAll();

            if (addons.length === 0) {
                marketplaceDebug('[MarketplaceManager] No marketplace addons installed');
                return;
            }

            marketplaceDebug(`[MarketplaceManager] Loading ${addons.length} marketplace addon(s)...`);

            // Keep every persisted entry manageable, even when its code no longer
            // loads. This is important for addons removed from GitHub and broken
            // direct-URL installs: the Installed tab must always be able to remove
            // the IndexedDB record.
            for (const addon of addons) {
                this._installedAddons.set(addon.id, addon);
            }

            await Promise.all(addons.map(async addon => {
                try {
                    const handle = await this._runtime.load(addon);
                    this._recordActivatedAddon(addon, handle);
                } catch (error) {
                    this._loadErrors.set(addon.id, error?.message || String(error));
                    console.error(`[MarketplaceManager] Failed to load addon "${addon.id}":`, error);
                }
            }));
        }

        _recordActivatedAddon(entry, handle) {
            this._activeAddons.set(entry.id, handle);
            this._installedAddons.set(entry.id, {
                ...entry, metadata: { ...entry.metadata, runtimeId: handle.runtimeId },
            });
            this._loadErrors.delete(entry.id);
            handle.manager?.markAsMarketplaceAddon?.(handle.runtimeId);
        }

        async _saveAndActivate(entry, installedStyle) {
            const handle = installedStyle || await this._runtime.load(entry);
            const runtimeId = installedStyle ? entry.metadata.runtimeId : handle.runtimeId;
            try {
                await this._repository.put({ ...entry, metadata: { ...entry.metadata, runtimeId } });
            } catch (error) {
                if (!installedStyle) this._runtime.unload(handle);
                throw error;
            }

            if (installedStyle) {
                handle.element.textContent = entry.code;
                handle.runtimeId = runtimeId;
            }
            this._recordActivatedAddon(entry, handle);
            return runtimeId;
        }

        _runOperation(id, action) {
            const previous = this._operations.get(id) || this.readyPromise;
            const task = previous.catch(() => {}).then(action);
            this._operations.set(id, task);
            const release = () => {
                if (this._operations.get(id) === task) this._operations.delete(id);
            };
            return task.finally(release);
        }

        fetchAddonList(forceRefresh = false) {
            return this._catalog.fetchAddonList(forceRefresh);
        }

        // ============================================
        // Install / Uninstall / Update
        // ============================================

        _validateDirectAddonUrl(rawUrl) {
            let parsed;
            try {
                parsed = new URL(String(rawUrl || '').trim());
            } catch {
                throw marketplaceAddonError('INVALID_URL', 'Enter a valid JavaScript URL');
            }

            if (parsed.protocol !== 'https:') {
                throw marketplaceAddonError('HTTPS_REQUIRED', 'Direct addon URLs must use HTTPS');
            }
            if (parsed.username || parsed.password) {
                throw marketplaceAddonError('INVALID_URL', 'URLs containing credentials are not allowed');
            }
            if (!/\.js$/i.test(parsed.pathname)) {
                throw marketplaceAddonError('JS_REQUIRED', 'The URL path must end in .js');
            }

            parsed.hash = '';
            return parsed.href;
        }

        async _downloadAddonCode(downloadUrl, maxBytes = Infinity) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            try {
                const response = await fetch(downloadUrl, {
                    signal: controller.signal,
                    cache: 'no-cache'
                });

                if (!response.ok) {
                    throw marketplaceAddonError('DOWNLOAD_FAILED', `Download failed: HTTP ${response.status}`);
                }

                const contentLength = Number(response.headers?.get?.('content-length') || 0);
                if (contentLength > maxBytes) {
                    throw marketplaceAddonError('ADDON_TOO_LARGE', 'Addon code exceeds the 2 MB size limit');
                }

                const code = await response.text();
                if (!code || code.trim().length === 0) {
                    throw marketplaceAddonError('EMPTY_ADDON', 'Downloaded addon code is empty');
                }
                if (new Blob([code]).size > maxBytes) {
                    throw marketplaceAddonError('ADDON_TOO_LARGE', 'Addon code exceeds the 2 MB size limit');
                }
                if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(code)) {
                    throw marketplaceAddonError('NOT_JAVASCRIPT', 'The URL returned an HTML page instead of JavaScript');
                }

                return code;
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw marketplaceAddonError('DOWNLOAD_FAILED', 'Addon download timed out');
                }
                if (error?.code) throw error;
                throw marketplaceAddonError('DOWNLOAD_FAILED', error?.message || 'Failed to download addon code');
            } finally {
                clearTimeout(timeoutId);
            }
        }

        _hashString(value) {
            let hash = 0x811c9dc5;
            const input = String(value);
            for (let i = 0; i < input.length; i++) {
                hash ^= input.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }
            return (hash >>> 0).toString(36);
        }

        _extractDirectAddonMetadata(code, downloadUrl) {
            const taggedType = readMarketplaceMetadataTag(code, 'addon-type').toLowerCase();
            const usesLyricsManager = /\bLyricsAddonManager\s*(?:\?\.|\.)\s*register\s*\(/.test(code);
            const usesAIManager = /\bAIAddonManager\s*(?:\?\.|\.)\s*register\s*\(/.test(code);
            const type = taggedType === 'lyrics' || taggedType === 'ai'
                ? taggedType
                : usesLyricsManager && !usesAIManager
                    ? 'lyrics'
                    : usesAIManager && !usesLyricsManager
                        ? 'ai'
                        : '';

            if (!type) {
                throw marketplaceAddonError('METADATA_INVALID', 'Could not determine whether this is a Lyrics or AI addon');
            }

            const runtimeId = readMarketplaceMetadataTag(code, 'id') || readMarketplaceAddonInfoString(code, 'id');
            if (!runtimeId || runtimeId.length > 128 || /[\u0000-\u001f]/.test(runtimeId)) {
                throw marketplaceAddonError('METADATA_INVALID', 'The addon must declare a valid @id or ADDON_INFO.id');
            }

            const url = new URL(downloadUrl);
            const filename = decodeURIComponent(url.pathname.split('/').pop() || 'Direct addon').replace(/\.js$/i, '');
            const name = readMarketplaceMetadataTag(code, 'name') || readMarketplaceAddonInfoString(code, 'name') || filename;
            const author = readMarketplaceMetadataTag(code, 'author') || readMarketplaceAddonInfoString(code, 'author') || url.hostname;
            const version = readMarketplaceMetadataTag(code, 'version') || readMarketplaceAddonInfoString(code, 'version') || '0.0.0';
            const description = readMarketplaceMetadataTag(code, 'description') || `Installed directly from ${url.hostname}`;

            return {
                runtimeId,
                name,
                type,
                author,
                version,
                description,
                downloadUrl,
                source: 'direct-url'
            };
        }

        installAddon(addonInfo) {
            const { id, type, downloadUrl } = addonInfo;
            return this._runOperation(id, async () => {
                if (this._installedAddons.has(id)) return false;

                this.emit('addon:installing', { id });
                try {
                    const code = await this._downloadAddonCode(downloadUrl);
                    const entry = buildMarketplaceAddonEntry(id, code, addonInfo, {
                        source: addonInfo.source || 'marketplace',
                        runtimeId: addonInfo.runtimeId || id,
                        sourceRepo: addonInfo.sourceRepo || '',
                        githubUrl: addonInfo.githubUrl || '',
                        installedAt: new Date().toISOString(),
                    });
                    const runtimeId = await this._saveAndActivate(entry);
                    this._addToProviderOrder(runtimeId, type);
                    this.emit('addon:installed', { id, name: addonInfo.name, type });
                    return true;
                } catch (error) {
                    this.emit('addon:install-error', { id, error: error.message });
                    throw error;
                }
            });
        }

        async installAddonFromUrl(rawUrl) {
            const downloadUrl = this._validateDirectAddonUrl(rawUrl);
            const id = `direct-url:${this._hashString(downloadUrl)}`;
            return this._runOperation(id, async () => {
                if (this._installedAddons.has(id)) {
                    throw marketplaceAddonError('ALREADY_INSTALLED', 'This JavaScript URL is already installed');
                }
                this.emit('addon:installing', { id, source: 'direct-url', downloadUrl });
                try {
                    const code = await this._downloadAddonCode(downloadUrl, DIRECT_ADDON_MAX_BYTES);
                    const info = this._extractDirectAddonMetadata(code, downloadUrl);
                    const alreadyInstalled = [...this._installedAddons.values()].some(addon =>
                        addon.metadata?.type === info.type && (addon.metadata.runtimeId || addon.id) === info.runtimeId
                    );
                    if (alreadyInstalled) {
                        throw marketplaceAddonError('ALREADY_INSTALLED', `An addon with ID "${info.runtimeId}" is already registered`);
                    }
                    const entry = buildMarketplaceAddonEntry(id, code, info, {
                        source: 'direct-url', runtimeId: info.runtimeId, sourceRepo: '', githubUrl: '',
                        installedAt: new Date().toISOString(),
                    });
                    const runtimeId = await this._saveAndActivate(entry);
                    this._addToProviderOrder(runtimeId, info.type);
                    this.emit('addon:installed', {
                        id, runtimeId, name: info.name, type: info.type, source: 'direct-url',
                    });
                    return this.getInstalledAddon(id);
                } catch (error) {
                    this.emit('addon:install-error', { id, error: error.message, code: error.code });
                    throw error;
                }
            });
        }

        uninstallAddon(id) {
            return this._runOperation(id, async () => {
                const addon = this._installedAddons.get(id);
                if (!addon) return false;
                await this._repository.remove(id);

                const handle = this._activeAddons.get(id);
                this._runtime.unload(handle);
                this._activeAddons.delete(id);
                if (handle) this._removeFromProviderOrder(handle.runtimeId, addon.metadata?.type);
                this._installedAddons.delete(id);
                this._loadErrors.delete(id);
                this.emit('addon:uninstalled', { id, name: addon.metadata?.name });
                return true;
            });
        }

        updateAddon(addonInfo) {
            const { id } = addonInfo;
            return this._runOperation(id, async () => {
                const previous = this._installedAddons.get(id);
                if (!previous) return false;
                const active = this._activeAddons.get(id);
                this.emit('addon:updating', { id });
                try {
                    const code = await this._downloadAddonCode(addonInfo.downloadUrl);
                    const entry = buildMarketplaceAddonEntry(id, code, addonInfo, {
                        source: addonInfo.source || previous.metadata?.source || 'marketplace',
                        runtimeId: addonInfo.runtimeId || id,
                        sourceRepo: addonInfo.sourceRepo || previous.metadata?.sourceRepo || '',
                        githubUrl: addonInfo.githubUrl || previous.metadata?.githubUrl || '',
                        installedAt: previous.installedAt,
                    });

                    const installedStyle = previous.metadata?.type === 'style' && addonInfo.type === 'style' ? active : undefined;
                    if (!installedStyle) {
                        this._runtime.unload(active);
                        this._activeAddons.delete(id);
                    }
                    try {
                        const runtimeId = await this._saveAndActivate(entry, installedStyle);
                        if (active && (runtimeId !== active.runtimeId || previous.metadata?.type !== addonInfo.type)) {
                            this._removeFromProviderOrder(active.runtimeId, previous.metadata?.type);
                            this._addToProviderOrder(runtimeId, addonInfo.type);
                        }
                    } catch (error) {
                        if (active && !installedStyle) {
                            try {
                                this._runtime.restore(active);
                                this._activeAddons.set(id, active);
                            } catch (restoreError) {
                                this._loadErrors.set(id, restoreError?.message || String(restoreError));
                                console.error(`[MarketplaceManager] Could not restore "${id}":`, restoreError);
                            }
                        }
                        throw error;
                    }
                    this.emit('addon:updated', { id, name: addonInfo.name, version: addonInfo.version });
                    return true;
                } catch (error) {
                    this.emit('addon:update-error', { id, error: error.message });
                    throw error;
                }
            });
        }

        // ============================================
        // Provider Order Integration
        // ============================================

        _addToProviderOrder(addonId, type) {
            try {
                const manager = readProviderManager(type);
                if (!manager) return;
                const order = manager.getProviderOrder();
                if (!order.includes(addonId)) {
                    order.unshift(addonId);
                    manager.setProviderOrder(order);
                }
            } catch (e) {
                console.warn('[MarketplaceManager] Failed to update provider order:', e);
            }
        }

        _removeFromProviderOrder(addonId, type) {
            try {
                const manager = readProviderManager(type);
                if (!manager) return;
                manager.setProviderOrder(manager.getProviderOrder().filter(id => id !== addonId));
            } catch (e) {
                console.warn('[MarketplaceManager] Failed to update provider order:', e);
            }
        }

        // ============================================
        // Query Methods
        // ============================================

        isInstalled(addonId) {
            return this._installedAddons.has(addonId);
        }

        getInstalledAddons() {
            return Array.from(this._installedAddons.values()).map(a => ({
                id: a.id,
                ...a.metadata,
                installedAt: a.installedAt,
                updatedAt: a.updatedAt,
                loadStatus: this._loadErrors.has(a.id) ? 'failed' : 'loaded',
                loadError: this._loadErrors.get(a.id) || ''
            }));
        }

        getInstalledAddon(addonId) {
            const addon = this._installedAddons.get(addonId);
            if (!addon) return null;
            return {
                id: addon.id,
                ...addon.metadata,
                installedAt: addon.installedAt,
                updatedAt: addon.updatedAt,
                loadStatus: this._loadErrors.has(addon.id) ? 'failed' : 'loaded',
                loadError: this._loadErrors.get(addon.id) || ''
            };
        }

        getInstalledVersion(addonId) {
            return this._installedAddons.get(addonId)?.metadata?.version || null;
        }

    }

    // ============================================
    // Global Registration
    // ============================================

    if (!readMarketplaceManager(host)) {
        publishMarketplaceManager(host, new MarketplaceManager());
    }

    marketplaceDebug('[MarketplaceManager] MarketplaceManager registered globally');
}
