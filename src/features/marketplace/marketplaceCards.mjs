export function createMarketplaceCards({ react, host, i18n, utils }) {
    const { useCallback } = react;

    function formatStarCount(count) {
        if (typeof count !== 'number' || count < 0) return '0';
        if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(count);
    }

    function tWithFallback(key, fallbackValue) {
        const value = i18n.t(key);
        return !value || value === key ? fallbackValue : value;
    }

    function getAddonTypeLabel(type) {
        if (type === 'lyrics') return tWithFallback('marketplace.filterLyrics', 'Lyrics');
        if (type === 'ai') return tWithFallback('marketplace.filterAI', 'AI');
        if (type === 'style') return tWithFallback('marketplace.filterStyle', 'Style');
        return String(type || '').toUpperCase();
    }

    const AddonCard = react.memo(({ addon, onClick, onAuthorClick }) => {
        const handleAuthorClick = useCallback((e) => {
            e.stopPropagation();
            if (onAuthorClick && addon.authorLogin) {
                onAuthorClick(addon.authorLogin);
            }
        }, [addon.authorLogin, onAuthorClick]);

        return react.createElement('div', {
            className: 'ivlyrics-marketplace-card',
            onClick: () => onClick(addon),
            tabIndex: 0,
            role: 'button',
            'aria-label': addon.name,
            onKeyDown: (e) => {
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                e.preventDefault();
                onClick(addon);
            }
        },
            // Preview Image
            react.createElement('div', { className: 'ivlyrics-marketplace-card-image' },
                addon.preview
                    ? react.createElement('img', {
                        src: addon.preview,
                        alt: addon.name,
                        loading: 'lazy',
                        onError: (e) => { e.target.style.display = 'none'; }
                    })
                    : react.createElement('div', { className: 'ivlyrics-marketplace-card-image-placeholder' },
                        react.createElement('svg', {
                            width: 48, height: 48, viewBox: '0 0 24 24',
                            fill: 'none', stroke: 'currentColor', strokeWidth: 1.5
                        },
                            react.createElement('path', {
                                d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
                            })
                        )
                    )
            ),
            // Card Info
            react.createElement('div', { className: 'ivlyrics-marketplace-card-info' },
                react.createElement('div', { className: 'ivlyrics-marketplace-card-title' }, addon.name),
                react.createElement('div', { className: 'ivlyrics-marketplace-card-author' },
                    addon.authorLogin
                        ? react.createElement('span', {
                            className: 'ivlyrics-marketplace-author-link',
                            onClick: handleAuthorClick,
                            role: 'button',
                            tabIndex: 0,
                            'aria-label': addon.author,
                            onKeyDown: (e) => {
                                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                                e.preventDefault();
                                handleAuthorClick(e);
                            }
                        }, i18n.t('marketplace.by', { author: addon.author }))
                        : i18n.t('marketplace.by', { author: addon.author })
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-card-meta' },
                    react.createElement('span', { className: 'ivlyrics-marketplace-card-version' },
                        i18n.t('marketplace.version', { version: addon.version })
                    )
                )
            ),
            addon.type && react.createElement('div', {
                className: `ivlyrics-marketplace-card-type ivlyrics-marketplace-card-type-${addon.type} ivlyrics-marketplace-card-type-overlay`
            }, getAddonTypeLabel(addon.type)),
            // Star Count (top-right)
            react.createElement('div', { className: 'ivlyrics-marketplace-stars' },
                react.createElement('svg', {
                    width: 14, height: 14, viewBox: '0 0 24 24',
                    fill: 'currentColor'
                },
                    react.createElement('path', {
                        d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
                    })
                ),
                react.createElement('span', null, formatStarCount(addon.stars))
            )
        );
    });

    // ============================================
    // AddonDetail Component
    // ============================================

    // ============================================
    // Sidebar Mini Card (for sidebar popular addons)
    // ============================================

    const SidebarMiniCard = react.memo(({ addon, onClick }) => {
        return react.createElement('div', {
            className: 'ivlyrics-marketplace-sidebar-minicard',
            onClick: () => onClick(addon),
            role: 'button',
            tabIndex: 0,
            'aria-label': addon.name,
            onKeyDown: (e) => {
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                e.preventDefault();
                onClick(addon);
            }
        },
            addon.preview
                ? react.createElement('img', {
                    className: 'ivlyrics-marketplace-sidebar-minicard-img',
                    src: addon.preview,
                    alt: addon.name,
                    loading: 'lazy',
                    onError: (e) => { e.target.style.display = 'none'; }
                })
                : react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-minicard-img ivlyrics-marketplace-sidebar-minicard-placeholder' },
                    react.createElement('svg', {
                        width: 20, height: 20, viewBox: '0 0 24 24',
                        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5
                    },
                        react.createElement('path', {
                            d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
                        })
                    )
                ),
            react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-minicard-info' },
                react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-minicard-name' }, addon.name),
                react.createElement('div', { className: 'ivlyrics-marketplace-sidebar-minicard-meta' },
                    react.createElement('svg', {
                        width: 11, height: 11, viewBox: '0 0 24 24',
                        fill: 'currentColor', style: { color: '#fbbf24' }
                    },
                        react.createElement('path', {
                            d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
                        })
                    ),
                    react.createElement('span', null, formatStarCount(addon.stars))
                )
            )
        );
    });

    function formatInstalledDate(value) {
        if (!value) return '';
        try {
            const language = i18n?.getCurrentLanguage?.() || 'en';
            return new Intl.DateTimeFormat(language, {
                year: 'numeric', month: 'short', day: 'numeric'
            }).format(new Date(value));
        } catch {
            return String(value).slice(0, 10);
        }
    }

    const InstalledAddonCard = react.memo(({ addon, marketplaceAddon, marketplaceStateKnown, removing, onRemove }) => {
        const isDirect = addon.source === 'direct-url';
        const isMissing = !isDirect && marketplaceStateKnown && !marketplaceAddon;
        const sourceUrl = addon.githubUrl || addon.downloadUrl || '';
        const openSource = useCallback(() => {
            const safeUrl = utils.sanitizeHttpUrl(sourceUrl);
            if (safeUrl) host.open(safeUrl, '_blank', 'noopener,noreferrer');
        }, [sourceUrl]);

        return react.createElement('article', {
            className: `ivlyrics-marketplace-installed-card${addon.loadStatus === 'failed' ? ' has-error' : ''}`
        },
            react.createElement('div', { className: 'ivlyrics-marketplace-installed-icon' },
                addon.preview
                    ? react.createElement('img', { src: addon.preview, alt: '' })
                    : react.createElement('svg', {
                        width: 26, height: 26, viewBox: '0 0 24 24',
                        fill: 'none', stroke: 'currentColor', strokeWidth: 1.8
                    },
                        react.createElement('path', { d: 'M8 9l3 3-3 3M13 15h3' }),
                        react.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 4 })
                    )
            ),
            react.createElement('div', { className: 'ivlyrics-marketplace-installed-main' },
                react.createElement('div', { className: 'ivlyrics-marketplace-installed-title-row' },
                    react.createElement('h3', null, addon.name || addon.id),
                    react.createElement('span', {
                        className: `ivlyrics-marketplace-card-type ivlyrics-marketplace-card-type-${addon.type}`
                    }, getAddonTypeLabel(addon.type)),
                    react.createElement('span', {
                        className: `ivlyrics-marketplace-source-badge ${isDirect ? 'is-direct' : isMissing ? 'is-missing' : ''}`
                    }, i18n.t(isDirect
                        ? 'marketplace.sourceDirect'
                        : isMissing
                            ? 'marketplace.sourceUnavailable'
                            : 'marketplace.browseTab')),
                    addon.loadStatus === 'failed' && react.createElement('span', {
                        className: 'ivlyrics-marketplace-source-badge is-error'
                    }, i18n.t('marketplace.loadFailed'))
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-installed-meta' },
                    react.createElement('span', null, addon.author || '—'),
                    react.createElement('span', null, i18n.t('marketplace.version', { version: addon.version || '0.0.0' })),
                    addon.installedAt && react.createElement('span', null, formatInstalledDate(addon.installedAt))
                ),
                addon.loadStatus === 'failed' && react.createElement('p', { className: 'ivlyrics-marketplace-installed-warning' },
                    i18n.t('marketplace.loadError')
                ),
                sourceUrl && react.createElement('button', {
                    type: 'button',
                    className: 'ivlyrics-marketplace-source-link',
                    title: sourceUrl,
                    onClick: openSource
                },
                    react.createElement('span', null, i18n.t('marketplace.viewSource')),
                    react.createElement('svg', {
                        width: 13, height: 13, viewBox: '0 0 24 24',
                        fill: 'none', stroke: 'currentColor', strokeWidth: 2
                    },
                        react.createElement('path', { d: 'M14 3h7v7M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5' })
                    )
                )
            ),
            react.createElement('button', {
                type: 'button',
                className: 'ivlyrics-marketplace-installed-remove',
                disabled: removing,
                onClick: () => onRemove(addon),
                'aria-label': `${i18n.t('marketplace.uninstall')} ${addon.name || addon.id}`
            },
                react.createElement('svg', {
                    width: 17, height: 17, viewBox: '0 0 24 24',
                    fill: 'none', stroke: 'currentColor', strokeWidth: 2
                },
                    react.createElement('path', { d: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5' })
                ),
                react.createElement('span', null, removing ? i18n.t('marketplace.uninstalling') : i18n.t('marketplace.uninstall'))
            )
        );
    });

    return { AddonCard, SidebarMiniCard, InstalledAddonCard, formatStarCount, tWithFallback, getAddonTypeLabel };
}
