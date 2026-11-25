export const DISCLAIMER_STORAGE_KEY = 'ivlyrics-marketplace-disclaimer-dismissed';

export function createMarketplaceDialogs({ react, host, i18n }) {
    const { useCallback, useEffect, useState, useRef } = react;

    // Shared cancel/confirm button row for the confirm and disclaimer modals
    function renderMarketplaceConfirmButtons(onCancel, okClassName, onOk, okLabelKey) {
        return react.createElement('div', { className: 'ivlyrics-marketplace-confirm-buttons' },
            react.createElement('button', {
                className: 'ivlyrics-marketplace-confirm-btn ivlyrics-marketplace-confirm-btn-cancel',
                onClick: onCancel
            }, i18n.t('buttons.cancel')),
            react.createElement('button', {
                className: okClassName,
                onClick: onOk
            }, i18n.t(okLabelKey))
        );
    }

    const ConfirmModal = react.memo(({ message, onConfirm, onCancel }) => {
        const handleOverlayClick = useCallback((e) => {
            if (e.target === e.currentTarget) onCancel();
        }, [onCancel]);

        useEffect(() => {
            const handleKey = (e) => {
                if (e.key === 'Escape') onCancel();
                if (e.key === 'Enter') onConfirm();
            };
            host.addEventListener('keydown', handleKey);
            return () => host.removeEventListener('keydown', handleKey);
        }, [onConfirm, onCancel]);

        return react.createElement('div', {
            className: 'ivlyrics-marketplace-confirm-overlay',
            onClick: handleOverlayClick
        },
            react.createElement('div', { className: 'ivlyrics-marketplace-confirm-modal' },
                react.createElement('div', { className: 'ivlyrics-marketplace-confirm-message' }, message),
                renderMarketplaceConfirmButtons(
                    onCancel,
                    'ivlyrics-marketplace-confirm-btn ivlyrics-marketplace-confirm-btn-ok',
                    onConfirm,
                    'buttons.confirm'
                )
            )
        );
    });

    // ============================================
    // DisclaimerModal Component (install warning)
    // ============================================

    const DisclaimerModal = react.memo(({ onConfirm, onCancel }) => {
        const [dontShowAgain, setDontShowAgain] = useState(false);

        const handleOverlayClick = useCallback((e) => {
            if (e.target === e.currentTarget) onCancel();
        }, [onCancel]);

        useEffect(() => {
            const handleKey = (e) => {
                if (e.key === 'Escape') onCancel();
            };
            host.addEventListener('keydown', handleKey);
            return () => host.removeEventListener('keydown', handleKey);
        }, [onCancel]);

        const handleConfirm = useCallback(() => {
            if (dontShowAgain) {
                try { host.localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1'); } catch (e) {}
            }
            onConfirm();
        }, [dontShowAgain, onConfirm]);

        return react.createElement('div', {
            className: 'ivlyrics-marketplace-confirm-overlay',
            onClick: handleOverlayClick
        },
            react.createElement('div', { className: 'ivlyrics-marketplace-confirm-modal ivlyrics-marketplace-disclaimer-modal' },
                react.createElement('div', { className: 'ivlyrics-marketplace-disclaimer-icon' },
                    react.createElement('svg', {
                        width: 32, height: 32, viewBox: '0 0 24 24',
                        fill: 'none', stroke: '#f59e0b', strokeWidth: 2
                    },
                        react.createElement('path', { d: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' }),
                        react.createElement('line', { x1: 12, y1: 9, x2: 12, y2: 13, stroke: '#f59e0b' }),
                        react.createElement('line', { x1: 12, y1: 17, x2: 12.01, y2: 17, stroke: '#f59e0b' })
                    )
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-disclaimer-title' },
                    i18n.t('marketplace.disclaimerTitle')
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-confirm-message' },
                    i18n.t('marketplace.disclaimerInstall')
                ),
                react.createElement('label', { className: 'ivlyrics-marketplace-disclaimer-checkbox' },
                    react.createElement('input', {
                        type: 'checkbox',
                        checked: dontShowAgain,
                        onChange: (e) => setDontShowAgain(e.target.checked)
                    }),
                    react.createElement('span', null, i18n.t('marketplace.dontShowAgain'))
                ),
                renderMarketplaceConfirmButtons(
                    onCancel,
                    'ivlyrics-marketplace-confirm-btn ivlyrics-marketplace-confirm-btn-ok ivlyrics-marketplace-confirm-btn-warn',
                    handleConfirm,
                    'marketplace.install'
                )
            )
        );
    });

    // ============================================
    // Direct URL Install Modal
    // ============================================

    function getDirectInstallErrorMessage(error) {
        const keyByCode = {
            INVALID_URL: 'marketplace.directErrorUrl',
            HTTPS_REQUIRED: 'marketplace.directErrorUrl',
            JS_REQUIRED: 'marketplace.directErrorUrl',
            DOWNLOAD_FAILED: 'marketplace.directErrorDownload',
            ADDON_TOO_LARGE: 'marketplace.directErrorDownload',
            EMPTY_ADDON: 'marketplace.directErrorDownload',
            NOT_JAVASCRIPT: 'marketplace.directErrorUrl',
            METADATA_INVALID: 'marketplace.directErrorMetadata',
            REGISTRATION_FAILED: 'marketplace.directErrorMetadata',
            ALREADY_INSTALLED: 'marketplace.directErrorDuplicate'
        };
        return i18n.t(keyByCode[error?.code] || 'marketplace.directErrorGeneric');
    }

    const DirectUrlInstallModal = react.memo(({ onInstall, onCancel }) => {
        const [url, setUrl] = useState('');
        const [consented, setConsented] = useState(false);
        const [installing, setInstalling] = useState(false);
        const [error, setError] = useState('');
        const inputRef = useRef(null);
        const titleId = 'ivlyrics-direct-url-title';

        useEffect(() => {
            inputRef.current?.focus();
            const handleKey = (event) => {
                if (event.key === 'Escape' && !installing) onCancel();
            };
            host.addEventListener('keydown', handleKey);
            return () => host.removeEventListener('keydown', handleKey);
        }, [installing, onCancel]);

        const handleOverlayClick = useCallback((event) => {
            if (event.target === event.currentTarget && !installing) onCancel();
        }, [installing, onCancel]);

        const handleSubmit = useCallback(async (event) => {
            event.preventDefault();
            if (!consented || !url.trim() || installing) return;

            setInstalling(true);
            setError('');
            try {
                await onInstall(url.trim());
            } catch (installError) {
                setError(getDirectInstallErrorMessage(installError));
                setInstalling(false);
            }
        }, [consented, installing, onInstall, url]);

        const renderDirectHeading = () => (
                react.createElement('div', { className: 'ivlyrics-marketplace-direct-heading' },
                    react.createElement('div', { className: 'ivlyrics-marketplace-disclaimer-icon' },
                        react.createElement('svg', {
                            width: 30, height: 30, viewBox: '0 0 24 24',
                            fill: 'none', stroke: '#f59e0b', strokeWidth: 2
                        },
                            react.createElement('path', { d: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' }),
                            react.createElement('line', { x1: 12, y1: 9, x2: 12, y2: 13 }),
                            react.createElement('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 })
                        )
                    ),
                    react.createElement('div', null,
                        react.createElement('h2', { id: titleId, className: 'ivlyrics-marketplace-direct-title' },
                            i18n.t('marketplace.directUrlTitle')
                        )
                    )
                )
        );

        const renderDirectButtons = () => (
                react.createElement('div', { className: 'ivlyrics-marketplace-confirm-buttons' },
                    react.createElement('button', {
                        type: 'button',
                        className: 'ivlyrics-marketplace-confirm-btn ivlyrics-marketplace-confirm-btn-cancel',
                        disabled: installing,
                        onClick: onCancel
                    }, i18n.t('buttons.cancel')),
                    react.createElement('button', {
                        type: 'submit',
                        className: 'ivlyrics-marketplace-confirm-btn ivlyrics-marketplace-confirm-btn-ok ivlyrics-marketplace-confirm-btn-warn',
                        disabled: installing || !consented || !url.trim()
                    }, installing ? i18n.t('marketplace.installing') : i18n.t('marketplace.install'))
                )
        );

        return react.createElement('div', {
            className: 'ivlyrics-marketplace-confirm-overlay',
            onClick: handleOverlayClick
        },
            react.createElement('form', {
                className: 'ivlyrics-marketplace-confirm-modal ivlyrics-marketplace-direct-modal',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': titleId,
                onSubmit: handleSubmit
            },
                renderDirectHeading(),
                react.createElement('div', { className: 'ivlyrics-marketplace-direct-warning', role: 'alert' },
                    react.createElement('strong', null, i18n.t('marketplace.directWarningTitle')),
                    react.createElement('p', null, i18n.t('marketplace.directWarningBody'))
                ),
                react.createElement('label', { className: 'ivlyrics-marketplace-direct-field' },
                    react.createElement('span', null, i18n.t('marketplace.directUrlLabel')),
                    react.createElement('input', {
                        ref: inputRef,
                        type: 'url',
                        inputMode: 'url',
                        autoComplete: 'off',
                        spellCheck: false,
                        required: true,
                        disabled: installing,
                        value: url,
                        placeholder: i18n.t('marketplace.directUrlPlaceholder'),
                        onChange: (event) => {
                            setUrl(event.target.value);
                            setError('');
                        }
                    })
                ),
                react.createElement('div', { className: 'ivlyrics-marketplace-direct-snapshot' },
                    i18n.t('marketplace.directSnapshotNotice')
                ),
                react.createElement('label', { className: 'ivlyrics-marketplace-direct-consent' },
                    react.createElement('input', {
                        type: 'checkbox',
                        checked: consented,
                        disabled: installing,
                        onChange: (event) => setConsented(event.target.checked)
                    }),
                    react.createElement('span', null, i18n.t('marketplace.directConsent'))
                ),
                error && react.createElement('div', {
                    className: 'ivlyrics-marketplace-direct-error',
                    role: 'alert'
                }, error),
                renderDirectButtons()
            )
        );
    });

    return { ConfirmModal, DisclaimerModal, DirectUrlInstallModal };
}
