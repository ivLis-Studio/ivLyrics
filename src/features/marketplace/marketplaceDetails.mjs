export function createMarketplaceDetails({ react, i18n, cards, MarkdownDescription, ConfirmModal }) {
    const { useCallback, useMemo, useState } = react;
    const { AddonCard, SidebarMiniCard, formatStarCount, getAddonTypeLabel } = cards;

    // Shared detail-header back button (identical markup in addon detail and developer profile views)
    function createMarketplaceBackButton(onBack) {
        return react.createElement('button', {
            className: 'ivlyrics-marketplace-detail-back',
            onClick: onBack,
        },
            react.createElement('svg', {
                width: 20, height: 20, viewBox: '0 0 24 24',
                fill: 'none', stroke: 'currentColor', strokeWidth: 2
            },
                react.createElement('path', { d: 'M19 12H5m0 0l7 7m-7-7l7-7' })
            ),
            i18n.t('marketplace.backToLyrics')
        );
    }

    const AddonDetail = react.memo(({ addon, allAddons, onBack, onInstall, onUninstall, onUpdate, onAuthorClick, onAddonClick }) => {
        const [actionLoading, setActionLoading] = useState(false);
        const [showConfirm, setShowConfirm] = useState(false);
        const lang = i18n?.getCurrentLanguage?.() || 'en';
        const description = typeof addon.description === 'object'
            ? (addon.description[lang] || addon.description.en || '')
            : (addon.description || '');

        const handleInstall = useCallback(async () => {
            setActionLoading(true);
            try {
                await onInstall(addon);
            } finally {
                setActionLoading(false);
            }
        }, [addon, onInstall]);

        const handleUninstall = useCallback(() => {
            setShowConfirm(true);
        }, []);

        const handleConfirmUninstall = useCallback(async () => {
            setShowConfirm(false);
            setActionLoading(true);
            try {
                await onUninstall(addon.id);
            } finally {
                setActionLoading(false);
            }
        }, [addon, onUninstall]);

        const handleCancelUninstall = useCallback(() => {
            setShowConfirm(false);
        }, []);

        const handleUpdate = useCallback(async () => {
            setActionLoading(true);
            try {
                await onUpdate(addon);
            } finally {
                setActionLoading(false);
            }
        }, [addon, onUpdate]);

        const handleAuthorClick = useCallback(() => {
            if (onAuthorClick && addon.authorLogin) {
                onAuthorClick(addon.authorLogin);
            }
        }, [addon.authorLogin, onAuthorClick]);

        // Sidebar data
        const avatarUrl = addon.authorAvatar || (addon.authorLogin ? `https://github.com/${addon.authorLogin}.png?size=128` : '');

        const authorOtherAddons = useMemo(() => {
            if (!allAddons || !addon.authorLogin) return [];
            return allAddons.filter(a => a.authorLogin === addon.authorLogin && a.id !== addon.id);
        }, [allAddons, addon.authorLogin, addon.id]);

        const popularAddons = useMemo(() => {
            if (!allAddons) return [];
            return allAddons
                .filter(a => a.id !== addon.id)
                .sort((a, b) => (b.stars || 0) - (a.stars || 0))
                .slice(0, 5);
        }, [allAddons, addon.id]);

        const renderDetailSidebar = () => (
                react.createElement('div', { className: 'ivlyrics-marketplace-detail-sidebar' },
                    // Developer card
                    addon.authorLogin && react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-section' },
                        react.createElement('div', {
                            className: 'ivlyrics-marketplace-sidebar-dev',
                            onClick: handleAuthorClick,
                            role: 'button',
                            tabIndex: 0
                        },
                            avatarUrl && react.createElement('img', {
                                className: 'ivlyrics-marketplace-sidebar-dev-avatar',
                                src: avatarUrl,
                                alt: addon.authorLogin,
                                onError: (e) => { e.target.style.display = 'none'; }
                            }),
                            react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-dev-text' },
                                react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-dev-name' }, addon.authorLogin),
                                react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-dev-label' },
                                    i18n.t('marketplace.developer') || 'Developer'
                                )
                            )
                        ),
                        // Author's other addons
                        authorOtherAddons.length > 0 && react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-list' },
                            react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-title' },
                                i18n.t('marketplace.moreByDeveloper') || 'More by this developer'
                            ),
                            authorOtherAddons.slice(0, 4).map(a =>
                                react.createElement(SidebarMiniCard, {
                                    key: a.id,
                                    addon: a,
                                    onClick: onAddonClick
                                })
                            )
                        )
                    ),
                    // Popular addons
                    popularAddons.length > 0 && react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-section' },
                        react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-title' },
                            i18n.t('marketplace.popular') || 'Popular'
                        ),
                        popularAddons.map(a =>
                            react.createElement(SidebarMiniCard, {
                                key: a.id,
                                addon: a,
                                onClick: onAddonClick
                            })
                        )
                    )
                )
        );

        const renderDetailHeader = () => (
            react.createElement('div', { className: 'ivlyrics-marketplace-detail-header' },
                createMarketplaceBackButton(onBack),
                // Action Buttons in header
                react.createElement('div', { className: 'ivlyrics-marketplace-detail-header-actions' },
                    addon.hasUpdate && react.createElement('button', {
                        className: 'ivlyrics-marketplace-btn ivlyrics-marketplace-btn-update',
                        onClick: handleUpdate,
                        disabled: actionLoading
                    }, actionLoading ? i18n.t('marketplace.installing') : i18n.t('marketplace.update')),

                    addon.isInstalled
                        ? react.createElement('button', {
                            className: 'ivlyrics-marketplace-btn ivlyrics-marketplace-btn-uninstall',
                            onClick: handleUninstall,
                            disabled: actionLoading
                        }, actionLoading ? i18n.t('marketplace.uninstalling') : i18n.t('marketplace.uninstall'))
                        : react.createElement('button', {
                            className: 'ivlyrics-marketplace-btn ivlyrics-marketplace-btn-install',
                            onClick: handleInstall,
                            disabled: actionLoading
                        }, actionLoading ? i18n.t('marketplace.installing') : i18n.t('marketplace.install'))
                )
            )
        );

        const renderDetailMain = () => (
                react.createElement('div', { className: 'ivlyrics-marketplace-detail-main' },
                    // Preview
                    addon.preview && react.createElement('div', { className: 'ivlyrics-marketplace-detail-image' },
                        react.createElement('img', {
                            src: addon.preview,
                            alt: addon.name,
                            onError: (e) => { e.target.style.display = 'none'; }
                        })
                    ),
                    // Title + meta
                    react.createElement('h2', { className: 'ivlyrics-marketplace-detail-title' }, addon.name),
                    react.createElement('div', { className: 'ivlyrics-marketplace-detail-meta' },
                        addon.authorLogin
                            ? react.createElement('span', {
                                className: 'ivlyrics-marketplace-author-link',
                                onClick: handleAuthorClick,
                                role: 'button',
                                tabIndex: 0
                            }, i18n.t('marketplace.by', { author: addon.author }))
                            : react.createElement('span', null,
                                i18n.t('marketplace.by', { author: addon.author })
                            ),
                        react.createElement('span', null,
                            i18n.t('marketplace.version', { version: addon.version })
                        ),
                        addon.updated && react.createElement('span', null,
                            i18n.t('marketplace.updated', { date: addon.updated })
                        ),
                        addon.type && react.createElement('span', {
                            className: `ivlyrics-marketplace-card-type ivlyrics-marketplace-card-type-${addon.type}`
                        }, getAddonTypeLabel(addon.type)),
                        react.createElement('span', { className: 'ivlyrics-marketplace-detail-stars' },
                            react.createElement('svg', {
                                width: 14, height: 14, viewBox: '0 0 24 24',
                                fill: 'currentColor',
                                style: { verticalAlign: 'middle', marginRight: '4px' }
                            },
                                react.createElement('path', {
                                    d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
                                })
                            ),
                            formatStarCount(addon.stars)
                        )
                    ),
                    // Description (Markdown rendered)
                    react.createElement(MarkdownDescription, { description })
                )
        );

        return react.createElement('div', { className: 'ivlyrics-marketplace-detail' },
            // Header with back button + action buttons
            renderDetailHeader(),
            // Two-column layout: main content + sidebar
            react.createElement('div', { className: 'ivlyrics-marketplace-detail-layout' },
                // Left: main content (scrollable)
                renderDetailMain(),
                // Right: sidebar
                renderDetailSidebar()
            ),
            showConfirm && react.createElement(ConfirmModal, {
                message: i18n.t('marketplace.uninstallConfirm', { name: addon.name }),
                onConfirm: handleConfirmUninstall,
                onCancel: handleCancelUninstall
            })
        );
    });

    // ============================================
    // DeveloperProfile Component
    // ============================================

    const DeveloperProfile = react.memo(({ authorLogin, addons, onBack, onAddonClick }) => {
        const avatarUrl = useMemo(() => {
            const addonWithAvatar = addons.find(a => a.authorAvatar);
            if (addonWithAvatar?.authorAvatar) return addonWithAvatar.authorAvatar;
            return `https://github.com/${authorLogin}.png?size=200`;
        }, [authorLogin, addons]);

        const githubProfileUrl = `https://github.com/${authorLogin}`;

        return react.createElement('div', { className: 'ivlyrics-marketplace-detail' },
            // Header
            react.createElement('div', { className: 'ivlyrics-marketplace-detail-header' },
                createMarketplaceBackButton(onBack),
            ),
            // Developer Profile Content
            react.createElement('div', { className: 'ivlyrics-marketplace-detail-content' },
                react.createElement('div', { className: 'ivlyrics-marketplace-dev-profile' },
                    react.createElement('img', {
                        className: 'ivlyrics-marketplace-dev-avatar',
                        src: avatarUrl,
                        alt: authorLogin,
                        onError: (e) => { e.target.style.display = 'none'; }
                    }),
                    react.createElement('div', { className: 'ivlyrics-marketplace-dev-info' },
                        react.createElement('h2', { className: 'ivlyrics-marketplace-dev-name' }, authorLogin),
                        react.createElement('a', {
                            className: 'ivlyrics-marketplace-dev-github-link',
                            href: githubProfileUrl,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            onClick: (e) => e.stopPropagation()
                        },
                            react.createElement('svg', {
                                width: 14, height: 14, viewBox: '0 0 24 24',
                                fill: 'currentColor'
                            },
                                react.createElement('path', {
                                    d: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z'
                                })
                            ),
                            'GitHub'
                        ),
                        react.createElement('span', { className: 'ivlyrics-marketplace-dev-addon-count' },
                            i18n.t('marketplace.addonCount', { count: addons.length }) || `${addons.length} addon(s)`
                        )
                    )
                ),
                react.createElement('h3', { className: 'ivlyrics-marketplace-dev-section-title' },
                    i18n.t('marketplace.developerAddons') || 'Addons'
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-grid' },
                    addons.map(addon =>
                        react.createElement(AddonCard, {
                            key: addon.id,
                            addon,
                            onClick: onAddonClick
                        })
                    )
                )
            )
        );
    });

    return { AddonDetail, DeveloperProfile };
}
