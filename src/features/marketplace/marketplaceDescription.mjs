export function createMarketplaceDescription({ react, utils, toast, tWithFallback }) {
    const { useCallback, useEffect, useState, useRef } = react;

    const _mdCache = new Map();

    function renderMarkdownToHTML(md) {
        if (_mdCache.has(md)) return _mdCache.get(md);

        const result = utils.renderSafeMarkdownToHTML(md, {
            allowTables: true,
            allowYouTubeEmbeds: true,
            codeBlockRenderer: ({ code, className, languageLabel, escapeHtml }) => {
                const languageHtml = languageLabel
                    ? `<span class="ivlyrics-marketplace-code-language">${escapeHtml(languageLabel)}</span>`
                    : '<span class="ivlyrics-marketplace-code-language is-empty"></span>';
                return `<div class="ivlyrics-marketplace-code-block"><div class="ivlyrics-marketplace-code-toolbar">${languageHtml}<button type="button" class="ivlyrics-marketplace-code-copy" data-copy-code="true">Copy</button></div><pre><code${className}>${code}</code></pre></div>`;
            }
        });

        _mdCache.set(md, result);
        return result;
    }

    function isUrl(str) {
        return typeof str === 'string' && /^https?:\/\//i.test(str.trim());
    }

    // ============================================
    // MarkdownDescription Component
    // ============================================

    const MarkdownDescription = react.memo(({ description }) => {
        const [content, setContent] = useState(null);
        const [loading, setLoading] = useState(false);
        const containerRef = useRef(null);
        const resetTimeoutRef = useRef(null);
        const copiedButtonRef = useRef(null);

        const copyLabel = tWithFallback('copyCommand', 'Copy');
        const copiedLabel = tWithFallback('settingsAdvanced.debugTab.copied', 'Copied');
        const copyFailedLabel = tWithFallback('notifications.copyFailed', 'Copy failed');

        const resetCopiedButton = useCallback(() => {
            if (copiedButtonRef.current) {
                copiedButtonRef.current.textContent = copyLabel;
                copiedButtonRef.current.removeAttribute('data-copied');
                copiedButtonRef.current = null;
            }
            if (resetTimeoutRef.current) {
                clearTimeout(resetTimeoutRef.current);
                resetTimeoutRef.current = null;
            }
        }, [copyLabel]);

        useEffect(() => () => {
            if (resetTimeoutRef.current) {
                clearTimeout(resetTimeoutRef.current);
            }
        }, []);

        useEffect(() => {
            if (!containerRef.current) return;
            containerRef.current.querySelectorAll('[data-copy-code]').forEach((button) => {
                if (!button.hasAttribute('data-copied')) {
                    button.textContent = copyLabel;
                }
            });
        }, [content, copyLabel]);

        const handleDescriptionClick = useCallback(async (event) => {
            const button = event.target.closest?.('[data-copy-code]');
            if (!button) return;

            event.preventDefault();
            event.stopPropagation();

            const codeElement = button.closest('.ivlyrics-marketplace-code-block')?.querySelector('code');
            const codeText = codeElement?.textContent || '';
            if (!codeText) return;

            const success = await utils.copyToClipboard(codeText);
            if (!success) {
                toast.error(copyFailedLabel);
                return;
            }

            resetCopiedButton();
            button.textContent = copiedLabel;
            button.setAttribute('data-copied', 'true');
            copiedButtonRef.current = button;
            resetTimeoutRef.current = setTimeout(() => {
                if (copiedButtonRef.current === button) {
                    button.textContent = copyLabel;
                    button.removeAttribute('data-copied');
                    copiedButtonRef.current = null;
                    resetTimeoutRef.current = null;
                }
            }, 1800);
        }, [copiedLabel, copyFailedLabel, copyLabel, resetCopiedButton]);

        useEffect(() => {
            if (!description) {
                setContent('');
                return;
            }

            if (!isUrl(description)) {
                // description 자체가 마크다운 텍스트
                setContent(renderMarkdownToHTML(description));
                return;
            }

            // URL인 경우 fetch
            let cancelled = false;
            setLoading(true);

            fetch(description.trim(), { cache: 'no-cache' })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.text();
                })
                .then(md => {
                    if (!cancelled) {
                        setContent(renderMarkdownToHTML(md));
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        // URL 로드 실패 시 URL 자체를 링크로 표시
                        const safeUrl = utils.sanitizeHttpUrl(description);
                        const safeLabel = utils.escapeHtml(description);
                        setContent(safeUrl
                            ? `<a href="${utils.escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`
                            : safeLabel);
                    }
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });

            return () => { cancelled = true; };
        }, [description]);

        if (loading) {
            return react.createElement('div', { className: 'ivlyrics-marketplace-detail-description ivlyrics-marketplace-md-loading' },
                react.createElement('div', { className: 'ivlyrics-marketplace-spinner' }),
            );
        }

        if (!content) {
            return react.createElement('div', { className: 'ivlyrics-marketplace-detail-description' });
        }

        return react.createElement('div', {
            ref: containerRef,
            className: 'ivlyrics-marketplace-detail-description ivlyrics-marketplace-md',
            onClick: handleDescriptionClick,
            dangerouslySetInnerHTML: { __html: content }
        });
    });

    return MarkdownDescription;
}
