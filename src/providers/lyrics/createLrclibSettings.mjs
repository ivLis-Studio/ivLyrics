export function createLrclibSettings({
    React, readLocalDatabase, translate, getProviderSetting, setProviderSetting,
    normalizeCustomApiEndpoint, syncAddonCacheVersion, reloadLyrics, getAddonText, getCustomApiText,
    settingKeys: LRCLIB_SETTING_KEYS, defaults: LRCLIB_DEFAULT_SETTINGS,
}) {
    const { useState, useCallback, useEffect } = React;

    return function LrclibLyricsSettings() {
        const local = readLocalDatabase();
        const [localState, setLocalState] = useState(() => local?.getState?.() || { phase: 'empty' });
        const [localActionError, setLocalActionError] = useState(null);
        useEffect(() => {
            if (!local) return;
            const unsubscribe = local.subscribe(setLocalState);
            local.connect().catch(() => {});
            return unsubscribe;
        }, []);
        const localText = (key, fallback) => {
            const path = `settings.lyricsProviders.lrclibLocal.${key}`;
            const value = translate(path);
            return value && value !== path ? value : fallback;
        };
        const runLocalAction = async action => {
            setLocalActionError(null);
            if (!local?.[action]) { setLocalActionError('unsupported'); return; }
            const previous = local.getCacheVersion();
            try { await local[action](); }
            catch (error) { setLocalActionError(error?.code || 'error'); }
            if (local.getCacheVersion() !== previous) {
                syncAddonCacheVersion();
                reloadLyrics();
            }
        };
        const formatSize = bytes => {
            const value = Number(bytes) || 0;
            const unit = value >= 1024 ** 3 ? 'GB' : 'MB';
            return `${(value / (unit === 'GB' ? 1024 ** 3 : 1024 ** 2)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
        };
        const localBusy = localState.phase === 'importing' || localState.phase === 'opening';
        const localStatus = localState.phase === 'ready' || (!localBusy && localState.available)
            ? localText('ready', '{name} · {size}').replace('{name}', localState.name || '').replace('{size}', formatSize(localState.size))
            : localState.phase === 'importing'
                ? localText('importing', 'Preparing database… {percent}% · {size} unpacked')
                    .replace('{percent}', String(Math.round(Math.min(1, Math.max(0, localState.progress || 0)) * 100)))
                    .replace('{size}', formatSize(localState.bytesWritten))
                : localState.phase === 'opening' ? localText('opening', 'Opening database…')
                    : localState.phase === 'permission' ? localText('permission', 'Select the file again to allow access.')
                        : localText('empty', 'No database selected');
        const localError = localActionError || localState.errorCode;
        const [customApiEndpoint, setCustomApiEndpoint] = useState(() =>
            String(getProviderSetting(LRCLIB_SETTING_KEYS.customApiEndpoint, '')));
        const [endpointInvalid, setEndpointInvalid] = useState(false);
        const [enableFallbackTitleArtist, setEnableFallbackTitleArtist] = useState(() =>
            getProviderSetting(
                LRCLIB_SETTING_KEYS.fallbackTitleArtist,
                LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleArtist]
            ) !== false
        );
        const [enableFallbackTitleOnly, setEnableFallbackTitleOnly] = useState(() =>
            getProviderSetting(
                LRCLIB_SETTING_KEYS.fallbackTitleOnly,
                LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleOnly]
            ) !== false
        );

        const handleToggle = useCallback((key, setter) => (e) => {
            const checked = !!e.target.checked;
            setter(checked);
            setProviderSetting(key, checked);
            syncAddonCacheVersion();
        }, []);

        const saveCustomApiEndpoint = () => {
            let normalized;
            try {
                normalized = normalizeCustomApiEndpoint(customApiEndpoint);
            } catch {
                setEndpointInvalid(true);
                return;
            }
            setEndpointInvalid(false);
            setCustomApiEndpoint(normalized);
            if (normalized === getProviderSetting(LRCLIB_SETTING_KEYS.customApiEndpoint, '')) return;
            setProviderSetting(LRCLIB_SETTING_KEYS.customApiEndpoint, normalized);
            syncAddonCacheVersion();
            // Reload without clearing unrelated translation/sync caches.
            reloadLyrics();
        };

        // 두 폴백 토글 행은 라벨/설명/체크 상태/onChange만 다르고 구조가 동일하다.
        const renderFallbackSetting = ({ label, description, checked, onChange }) =>
            React.createElement('div', { className: 'ai-addon-setting' },
                React.createElement('div', {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }
                },
                    React.createElement('div', { style: { flex: '1 1 auto' } },
                        React.createElement('label', null, label),
                        React.createElement('small', null, description)
                    ),
                    React.createElement('input', {
                        type: 'checkbox',
                        checked,
                        onChange
                    })
                )
            );

        return React.createElement('div', { className: 'lyrics-addon-settings ai-addon-settings lrclib-settings' },
            React.createElement('div', { className: 'ai-addon-setting' },
                React.createElement('label', null, localText('label', 'Local LRCLIB database')),
                React.createElement('small', null, localText('desc', 'Choose an official LRCLIB SQLite dump (.sqlite3 or .sqlite3.gz). Lyrics are read on this device without an API server. A gzip file is unpacked once and needs enough free disk space; the original file is not changed.')),
                React.createElement('small', null, localText('priority', 'Try the local file first, then the custom API if configured, and finally the official LRCLIB API.')),
                React.createElement('small', null, localText('officialOnly', 'Only used to load lyrics. Sync Creator, lyrics search, and sync submissions still use the official LRCLIB API.')),
                React.createElement('small', { role: 'status', 'aria-live': 'polite', 'data-lrclib-local-state': localState.phase }, localStatus),
                localState.phase === 'importing' && React.createElement('progress', {
                    value: Math.min(1, Math.max(0, localState.progress || 0)), max: 1,
                    'aria-label': localText('importing', 'Preparing database… {percent}% · {size} unpacked')
                        .replace('{percent}', String(Math.round((localState.progress || 0) * 100))).replace('{size}', formatSize(localState.bytesWritten))
                }),
                React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                    React.createElement('button', { type: 'button', className: 'btn', disabled: localBusy,
                        onClick: () => runLocalAction('pickFile') }, localText('choose', 'Choose database file')),
                    localBusy ? React.createElement('button', { type: 'button', className: 'btn',
                        onClick: () => local?.cancelImport?.() }, localText('cancel', 'Cancel import'))
                        : localState.phase !== 'empty' && React.createElement('button', { type: 'button', className: 'btn',
                            onClick: () => runLocalAction('remove') }, localText('remove', 'Remove database'))
                ),
                localError && React.createElement('small', { className: 'ai-addon-field-error', role: 'alert' },
                    localText(localError, localText('error', 'Unable to use the local database.')))
            ),
            React.createElement('div', { className: 'ai-addon-setting' },
                React.createElement('label', { htmlFor: 'ivlyrics-lrclib-custom-api' },
                    getCustomApiText('label', 'Custom API endpoint')),
                React.createElement('input', {
                    id: 'ivlyrics-lrclib-custom-api', type: 'text', inputMode: 'url',
                    value: customApiEndpoint, autoComplete: 'off', spellCheck: false,
                    placeholder: getCustomApiText('placeholder', 'https://your-lrclib-server.example/api'),
                    'aria-invalid': endpointInvalid || undefined,
                    'aria-describedby': `ivlyrics-lrclib-custom-api-desc ivlyrics-lrclib-custom-api-official${endpointInvalid ? ' ivlyrics-lrclib-custom-api-error' : ''}`,
                    onChange: event => { setCustomApiEndpoint(event.target.value); setEndpointInvalid(false); },
                    onBlur: saveCustomApiEndpoint,
                    onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); saveCustomApiEndpoint(); } }
                }),
                React.createElement('small', { id: 'ivlyrics-lrclib-custom-api-desc' },
                    getCustomApiText('desc', 'Optional, for faster lyric loading during playback. Complete ID/metadata lookups and automatic searches on this LRCLIB-compatible server first. If no suitable lyrics are found or it is unreachable, repeat with official LRCLIB. Try other providers only if both fail.')),
                React.createElement('small', { id: 'ivlyrics-lrclib-custom-api-official' },
                    getCustomApiText('officialOnly', 'Manual lyric searches in Sync Creator, sync generation, and sync submissions always use the official LRCLIB API and data.')),
                endpointInvalid && React.createElement('small', {
                    id: 'ivlyrics-lrclib-custom-api-error', className: 'ai-addon-field-error', role: 'alert'
                }, getCustomApiText('invalid', 'Enter an HTTP or HTTPS API base URL without a username, password, query parameters, or fragment.'))
            ),
            renderFallbackSetting({
                label: getAddonText('settings.fallbackTitleArtistLabel', '1st Fallback (title + artist)'),
                description: getAddonText('settings.fallbackTitleArtistDesc', 'Use q=title+artist free-text search when structured search fails.'),
                checked: enableFallbackTitleArtist,
                onChange: handleToggle(LRCLIB_SETTING_KEYS.fallbackTitleArtist, setEnableFallbackTitleArtist)
            }),
            renderFallbackSetting({
                label: getAddonText('settings.fallbackTitleOnlyLabel', '2nd Fallback (title only)'),
                description: getAddonText('settings.fallbackTitleOnlyDesc', 'Use q=title free-text search when the first fallback also fails.'),
                checked: enableFallbackTitleOnly,
                onChange: handleToggle(LRCLIB_SETTING_KEYS.fallbackTitleOnly, setEnableFallbackTitleOnly)
            })
        );
    };
}
