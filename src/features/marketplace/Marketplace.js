import { createMarketplaceCards } from "./marketplaceCards.mjs";
import { createMarketplaceDescription } from "./marketplaceDescription.mjs";
import { createMarketplaceDialogs, DISCLAIMER_STORAGE_KEY } from "./marketplaceDialogs.mjs";
import { createMarketplaceDetails } from "./marketplaceDetails.mjs";
import { withMarketplaceInstallState } from "./marketplaceCatalog.mjs";

export function createMarketplacePage({ react, host, i18n, utils, toast, readManager }) {
    const { useState, useEffect, useCallback, useMemo, useRef } = react;
    const FILTER_ALL = 'all';
    const FILTER_LYRICS = 'lyrics';
    const FILTER_AI = 'ai';
    const FILTER_STYLE = 'style';

    const cards = createMarketplaceCards({ react, host, i18n, utils });
    const { AddonCard, InstalledAddonCard, getAddonTypeLabel } = cards;
    const MarkdownDescription = createMarketplaceDescription({ react, utils, toast, tWithFallback: cards.tWithFallback });
    const { ConfirmModal, DisclaimerModal, DirectUrlInstallModal } = createMarketplaceDialogs({ react, host, i18n });
    const { AddonDetail, DeveloperProfile } = createMarketplaceDetails({ react, i18n, cards, MarkdownDescription, ConfirmModal });

    return react.memo(({ onClose }) => {
        const [catalogAddons, setCatalogAddons] = useState([]);
        const [installedAddons, setInstalledAddons] = useState([]);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [view, setView] = useState('browse');
        const [filter, setFilter] = useState(FILTER_ALL);
        const [searchQuery, setSearchQuery] = useState('');
        const [selectedAddon, setSelectedAddon] = useState(null);
        const [selectedAuthor, setSelectedAuthor] = useState(null);
        const [disclaimerAddon, setDisclaimerAddon] = useState(null);
        const [showDirectUrlModal, setShowDirectUrlModal] = useState(false);
        const [uninstallTarget, setUninstallTarget] = useState(null);
        const [uninstallingId, setUninstallingId] = useState(null);
        const searchInputRef = useRef(null);
        const catalogRequest = useRef(0);

        const refreshInstalledAddons = useCallback(() => {
            const installed = readManager()?.getInstalledAddons?.() || [];
            installed.sort((a, b) => String(b.installedAt || '').localeCompare(String(a.installedAt || '')));
            setInstalledAddons(installed);
        }, []);

        const loadAddons = useCallback(async (forceRefresh = false) => {
            const requestId = ++catalogRequest.current;
            setLoading(true);
            setError(null);
            try {
                const data = await readManager().fetchAddonList(forceRefresh);
                if (catalogRequest.current === requestId) setCatalogAddons(data.addons || []);
            } catch (loadError) {
                if (catalogRequest.current === requestId) {
                    setError(loadError.message);
                    setCatalogAddons([]);
                }
            } finally {
                if (catalogRequest.current === requestId) setLoading(false);
            }
        }, []);

        useEffect(() => {
            let active = true;
            const manager = readManager();
            void Promise.resolve(manager?.readyPromise).then(() => {
                if (!active) return;
                refreshInstalledAddons();
                loadAddons();
            });
            const unsubscribers = [
                manager?.on('addon:installed', refreshInstalledAddons),
                manager?.on('addon:uninstalled', refreshInstalledAddons),
                manager?.on('addon:updated', refreshInstalledAddons),
                manager?.on('addon:update-error', refreshInstalledAddons),
            ];

            return () => {
                active = false;
                catalogRequest.current++;
                unsubscribers.forEach(unsubscribe => {
                    if (typeof unsubscribe === 'function') unsubscribe();
                });
            };
        }, [loadAddons, refreshInstalledAddons]);

        const addons = useMemo(() => {
            const installedById = new Map(installedAddons.map(addon => [addon.id, addon]));
            return catalogAddons.map(addon => withMarketplaceInstallState(addon, installedById.get(addon.id)));
        }, [catalogAddons, installedAddons]);

        const addonSearchTextById = useMemo(() => {
            return new Map(addons.map((addon) => {
                const descriptionText = typeof addon.description === 'string'
                    ? addon.description
                    : typeof addon.description === 'object' && addon.description
                        ? Object.values(addon.description).join(' ')
                        : '';
                return [addon.id, `${addon.name || ''} ${addon.author || ''} ${descriptionText}`.toLowerCase()];
            }));
        }, [addons]);

        const filteredAddons = useMemo(() => {
            let result = addons;
            if (filter !== FILTER_ALL) result = result.filter(addon => addon.type === filter);
            if (searchQuery.trim()) {
                const query = searchQuery.trim().toLowerCase();
                result = result.filter(addon => addonSearchTextById.get(addon.id)?.includes(query));
            }
            return result;
        }, [addonSearchTextById, addons, filter, searchQuery]);

        const filteredInstalledAddons = useMemo(() => {
            let result = installedAddons;
            if (filter !== FILTER_ALL) result = result.filter(addon => addon.type === filter);
            if (searchQuery.trim()) {
                const query = searchQuery.trim().toLowerCase();
                result = result.filter(addon =>
                    `${addon.name || ''} ${addon.author || ''} ${addon.runtimeId || ''} ${addon.downloadUrl || ''}`
                        .toLowerCase()
                        .includes(query)
                );
            }
            return result;
        }, [filter, installedAddons, searchQuery]);

        const marketplaceAddonsById = useMemo(() => new Map(addons.map(addon => [addon.id, addon])), [addons]);
        const marketplaceStateKnown = !loading && !error;
        const authorAddons = useMemo(() => {
            if (!selectedAuthor) return [];
            return addons.filter(addon => addon.authorLogin === selectedAuthor);
        }, [addons, selectedAuthor]);

        const handleAuthorClick = useCallback((authorLogin) => {
            setSelectedAuthor(authorLogin);
            setSelectedAddon(null);
        }, []);

        const handleViewChange = useCallback((nextView) => {
            setView(nextView);
            setSearchQuery('');
            setFilter(FILTER_ALL);
            setSelectedAddon(null);
            setSelectedAuthor(null);
        }, []);

        const doInstall = useCallback(async (addon) => {
            try {
                if (await readManager().installAddon(addon)) {
                    toast.success(i18n.t('marketplace.installSuccess', { name: addon.name }));
                }
            } catch {
                toast.error(i18n.t('marketplace.installError'));
            }
        }, []);

        const handleInstall = useCallback((addon) => {
            const dismissed = host.localStorage.getItem(DISCLAIMER_STORAGE_KEY) === '1';
            if (dismissed) doInstall(addon);
            else setDisclaimerAddon(addon);
        }, [doInstall]);

        const handleDisclaimerConfirm = useCallback(() => {
            const addon = disclaimerAddon;
            setDisclaimerAddon(null);
            if (addon) doInstall(addon);
        }, [disclaimerAddon, doInstall]);

        const handleDirectUrlInstall = useCallback(async (url) => {
            const addon = await readManager().installAddonFromUrl(url);
            toast.success(i18n.t('marketplace.directInstallSuccess', { name: addon.name }));
            setShowDirectUrlModal(false);
            handleViewChange('installed');
        }, [handleViewChange]);

        const handleUninstall = useCallback(async (addonId) => {
            setUninstallingId(addonId);
            try {
                const addon = readManager().getInstalledAddon(addonId);
                if (await readManager().uninstallAddon(addonId)) {
                    toast.success(i18n.t('marketplace.uninstallSuccess', { name: addon?.name || addonId }));
                }
            } catch {
                toast.error(i18n.t('marketplace.uninstallError'));
                throw new Error('uninstall-failed');
            } finally {
                setUninstallingId(null);
            }
        }, []);

        const confirmInstalledUninstall = useCallback(async () => {
            const target = uninstallTarget;
            setUninstallTarget(null);
            if (!target) return;
            try { await handleUninstall(target.id); } catch {}
        }, [handleUninstall, uninstallTarget]);

        const handleUpdate = useCallback(async (addon) => {
            try {
                if (await readManager().updateAddon(addon)) {
                    toast.success(i18n.t('marketplace.installSuccess', { name: addon.name }));
                }
            } catch {
                toast.error(i18n.t('marketplace.installError'));
            }
        }, []);

        const renderBrowseContent = () => {
            if (loading) {
                return react.createElement('div', { className: 'ivlyrics-marketplace-loading' },
                    react.createElement('div', { className: 'ivlyrics-marketplace-spinner' }),
                    react.createElement('span', null, i18n.t('marketplace.loading'))
                );
            }
            if (error) {
                return react.createElement('div', { className: 'ivlyrics-marketplace-error' },
                    react.createElement('p', null, i18n.t('marketplace.loadError')),
                    react.createElement('p', { className: 'ivlyrics-marketplace-error-detail' }, error),
                    react.createElement('button', {
                        className: 'ivlyrics-marketplace-btn ivlyrics-marketplace-btn-install',
                        onClick: () => loadAddons(true)
                    }, i18n.t('marketplace.retry'))
                );
            }
            if (filteredAddons.length === 0) {
                return react.createElement('div', { className: 'ivlyrics-marketplace-empty' },
                    react.createElement('p', null, i18n.t('marketplace.noAddons'))
                );
            }
            return react.createElement('div', { className: 'ivlyrics-marketplace-grid' },
                filteredAddons.map(addon => react.createElement(AddonCard, {
                    key: addon.id,
                    addon,
                    onClick: setSelectedAddon,
                    onAuthorClick: handleAuthorClick
                }))
            );
        };

        const renderInstalledContent = () => {
            if (installedAddons.length === 0) {
                return react.createElement('div', { className: 'ivlyrics-marketplace-installed-empty' },
                    react.createElement('div', { className: 'ivlyrics-marketplace-installed-empty-icon' },
                        react.createElement('svg', {
                            width: 32, height: 32, viewBox: '0 0 24 24',
                            fill: 'none', stroke: 'currentColor', strokeWidth: 1.7
                        },
                            react.createElement('path', { d: 'M12 3v12M7 10l5 5 5-5' }),
                            react.createElement('path', { d: 'M5 21h14' })
                        )
                    ),
                    react.createElement('p', null, i18n.t('marketplace.installedEmpty')),
                    react.createElement('button', {
                        className: 'ivlyrics-marketplace-direct-add-btn',
                        onClick: () => setShowDirectUrlModal(true)
                    }, i18n.t('marketplace.addFromUrl'))
                );
            }
            if (filteredInstalledAddons.length === 0) {
                return react.createElement('div', { className: 'ivlyrics-marketplace-empty' },
                    react.createElement('p', null, i18n.t('marketplace.noAddons'))
                );
            }
            return react.createElement('div', { className: 'ivlyrics-marketplace-installed-list' },
                filteredInstalledAddons.map(addon => react.createElement(InstalledAddonCard, {
                    key: addon.id,
                    addon,
                    marketplaceAddon: marketplaceAddonsById.get(addon.id),
                    marketplaceStateKnown,
                    removing: uninstallingId === addon.id,
                    onRemove: setUninstallTarget
                }))
            );
        };

        const renderMarketplaceBrowseHeader = () => (
                    react.createElement('div', { className: 'ivlyrics-marketplace-header' },
                        react.createElement('div', { className: 'ivlyrics-marketplace-header-left' },
                            react.createElement('button', {
                                className: 'ivlyrics-marketplace-back-btn',
                                onClick: onClose,
                                'aria-label': i18n.t('marketplace.backToLyrics')
                            },
                                react.createElement('svg', {
                                    width: 20, height: 20, viewBox: '0 0 24 24',
                                    fill: 'none', stroke: 'currentColor', strokeWidth: 2
                                }, react.createElement('path', { d: 'M19 12H5m0 0l7 7m-7-7l7-7' }))
                            ),
                            react.createElement('h1', { className: 'ivlyrics-marketplace-title' }, i18n.t('marketplace.title'))
                        ),
                        react.createElement('div', { className: 'ivlyrics-marketplace-header-actions' },
                            react.createElement('button', {
                                className: 'ivlyrics-marketplace-direct-add-btn',
                                onClick: () => setShowDirectUrlModal(true)
                            },
                                react.createElement('svg', {
                                    width: 16, height: 16, viewBox: '0 0 24 24',
                                    fill: 'none', stroke: 'currentColor', strokeWidth: 2
                                }, react.createElement('path', { d: 'M12 5v14M5 12h14' })),
                                react.createElement('span', null, i18n.t('marketplace.addFromUrl'))
                            ),
                            react.createElement('div', { className: 'ivlyrics-marketplace-search-wrapper' },
                                react.createElement('svg', {
                                    className: 'ivlyrics-marketplace-search-icon',
                                    width: 16, height: 16, viewBox: '0 0 24 24',
                                    fill: 'none', stroke: 'currentColor', strokeWidth: 2
                                },
                                    react.createElement('circle', { cx: 11, cy: 11, r: 8 }),
                                    react.createElement('path', { d: 'M21 21l-4.35-4.35' })
                                ),
                                react.createElement('input', {
                                    ref: searchInputRef,
                                    className: 'ivlyrics-marketplace-search-input',
                                    type: 'text',
                                    placeholder: i18n.t(view === 'installed' ? 'marketplace.searchInstalled' : 'marketplace.search'),
                                    value: searchQuery,
                                    onChange: event => setSearchQuery(event.target.value)
                                })
                            )
                        )
                    )
        );

        const renderMarketplacePrimaryTabs = () => (
                    react.createElement('div', {
                        className: 'ivlyrics-marketplace-primary-tabs',
                        role: 'tablist',
                        'aria-label': i18n.t('marketplace.title')
                    },
                        [
                            { key: 'browse', label: i18n.t('marketplace.browseTab') },
                            { key: 'installed', label: i18n.t('marketplace.installedTab'), count: installedAddons.length }
                        ].map(tab => react.createElement('button', {
                            key: tab.key,
                            role: 'tab',
                            'aria-selected': view === tab.key,
                            className: `ivlyrics-marketplace-primary-tab ${view === tab.key ? 'active' : ''}`,
                            onClick: () => handleViewChange(tab.key)
                        },
                            react.createElement('span', null, tab.label),
                            typeof tab.count === 'number' && react.createElement('span', {
                                className: 'ivlyrics-marketplace-primary-tab-count'
                            }, tab.count)
                        ))
                    )
        );

        const renderMarketplaceFilterTabs = () => (
                    react.createElement('div', { className: 'ivlyrics-marketplace-filter-tabs' },
                        [
                            { key: FILTER_ALL, label: i18n.t('marketplace.filterAll') },
                            { key: FILTER_LYRICS, label: i18n.t('marketplace.filterLyrics') },
                            { key: FILTER_AI, label: i18n.t('marketplace.filterAI') },
                            { key: FILTER_STYLE, label: getAddonTypeLabel(FILTER_STYLE) }
                        ].map(tab => react.createElement('button', {
                            key: tab.key,
                            className: `ivlyrics-marketplace-filter-tab ${filter === tab.key ? 'active' : ''}`,
                            onClick: () => setFilter(tab.key)
                        }, tab.label))
                    )
        );

        const renderMarketplaceBrowseLayout = () => react.createElement('div', { className: 'ivlyrics-marketplace-container' },
                react.createElement('div', { className: 'ivlyrics-marketplace-top' },
                    renderMarketplaceBrowseHeader(),
                    renderMarketplacePrimaryTabs(),
                    renderMarketplaceFilterTabs()
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-notice' },
                    react.createElement('svg', {
                        width: 16, height: 16, viewBox: '0 0 24 24',
                        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
                        className: 'ivlyrics-marketplace-notice-icon'
                    },
                        react.createElement('circle', { cx: 12, cy: 12, r: 10 }),
                        react.createElement('line', { x1: 12, y1: 16, x2: 12, y2: 12 }),
                        react.createElement('line', { x1: 12, y1: 8, x2: 12.01, y2: 8 })
                    ),
                    react.createElement('span', null, i18n.t(view === 'installed'
                        ? 'marketplace.installedNotice'
                        : 'marketplace.disclaimerNotice'))
                ),
                react.createElement('div', {
                    className: 'ivlyrics-marketplace-content',
                    role: 'tabpanel'
                }, view === 'installed' ? renderInstalledContent() : renderBrowseContent())
            );

        const renderPageContent = () => {
            if (selectedAddon) {
                const updatedAddon = addons.find(addon => addon.id === selectedAddon.id) || selectedAddon;
                return react.createElement(AddonDetail, {
                    addon: updatedAddon,
                    allAddons: addons,
                    onBack: () => setSelectedAddon(null),
                    onInstall: handleInstall,
                    onUninstall: handleUninstall,
                    onUpdate: handleUpdate,
                    onAuthorClick: handleAuthorClick,
                    onAddonClick: setSelectedAddon
                });
            }
            if (selectedAuthor) {
                return react.createElement(DeveloperProfile, {
                    authorLogin: selectedAuthor,
                    addons: authorAddons,
                    onBack: () => setSelectedAuthor(null),
                    onAddonClick: setSelectedAddon
                });
            }
            return renderMarketplaceBrowseLayout();
        };
        const pageContent = renderPageContent();

        return react.createElement('div', { className: 'ivlyrics-marketplace-root' },
            pageContent,
            disclaimerAddon && react.createElement(DisclaimerModal, {
                onConfirm: handleDisclaimerConfirm,
                onCancel: () => setDisclaimerAddon(null)
            }),
            showDirectUrlModal && react.createElement(DirectUrlInstallModal, {
                onInstall: handleDirectUrlInstall,
                onCancel: () => setShowDirectUrlModal(false)
            }),
            uninstallTarget && react.createElement(ConfirmModal, {
                message: i18n.t('marketplace.uninstallConfirm', { name: uninstallTarget.name || uninstallTarget.id }),
                onConfirm: confirmInstalledUninstall,
                onCancel: () => setUninstallTarget(null)
            })
        );
    });
}
